const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const path = require("node:path");
const { after, before, test } = require("node:test");
const {
    configureApplicationDatabase,
    verifyTestDatabase
} = require("./support/postgres-test-safety.cjs");

configureApplicationDatabase();

let pool;
let orderRepository;
let orderService;

before(async () => {
    pool = require("../src/config/database");
    await verifyTestDatabase(pool);
    orderRepository = require("../src/repositories/order.repository");
    orderService = require("../src/services/order.service");
});

after(async () => {
    if (pool) await pool.end();
});

function suffix() {
    return crypto.randomBytes(6).toString("hex");
}

async function createFixture(t, { stock = 8, medicineCount = 1 } = {}) {
    const connection = await pool.connect();
    const fixture = { roles: [], categories: [], users: [], medications: [] };
    const run = suffix();
    try {
        await connection.query("BEGIN");
        const role = await connection.query(
            "INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING id",
            [`it_${run}`, "PostgreSQL integration fixture"]
        );
        fixture.roles.push(role.rows[0].id);

        const category = await connection.query(
            "INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2) RETURNING id",
            [`it_${run}`, "PostgreSQL integration fixture"]
        );
        fixture.categories.push(category.rows[0].id);

        const user = await connection.query(
            `INSERT INTO usuarios
                (nombre, apellido, correo, cedula, password, rol_id, estado)
             VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO')
             RETURNING id`,
            [
                "Integración",
                "SaludClick",
                `it.${run}@example.test`,
                `IT${run}`,
                "integration-only-not-a-real-password",
                fixture.roles[0]
            ]
        );
        fixture.users.push(user.rows[0].id);

        for (let index = 0; index < medicineCount; index += 1) {
            const medication = await connection.query(
                `INSERT INTO medicamentos
                    (nombre, categoria_id, precio, stock, estado)
                 VALUES ($1, $2, 9.99, $3, 'DISPONIBLE')
                 RETURNING id`,
                [`it_${run}_${index}`, fixture.categories[0], stock]
            );
            fixture.medications.push(medication.rows[0].id);
        }

        await connection.query("COMMIT");
    } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
    } finally {
        connection.release();
    }

    t.after(() => deleteFixture(fixture));
    return fixture;
}

async function deleteFixture(fixture) {
    const { roles, categories, users, medications } = fixture;
    if (!roles.length && !categories.length && !users.length && !medications.length) return;

    const connection = await pool.connect();
    try {
        await connection.query("BEGIN");
        await connection.query(
            "DELETE FROM pagos WHERE usuario_id = ANY($1::int[])",
            [users]
        );
        await connection.query(
            `DELETE FROM detalle_solicitud
             WHERE solicitud_id IN (
                 SELECT id FROM solicitudes WHERE usuario_id = ANY($1::int[])
             )`,
            [users]
        );
        await connection.query(
            "DELETE FROM solicitudes WHERE usuario_id = ANY($1::int[])",
            [users]
        );
        await connection.query(
            "DELETE FROM medicamentos WHERE id = ANY($1::int[])",
            [medications]
        );
        await connection.query(
            "DELETE FROM usuarios WHERE id = ANY($1::int[])",
            [users]
        );
        await connection.query(
            "DELETE FROM categorias WHERE id = ANY($1::int[])",
            [categories]
        );
        await connection.query(
            "DELETE FROM roles WHERE id = ANY($1::int[])",
            [roles]
        );
        await connection.query("COMMIT");
    } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
    } finally {
        connection.release();
    }
}

function orderData(items) {
    return {
        tipoEntrega: "RECOGER",
        items,
        pago: {
            numero: "4242 4242 4242 4242",
            vencimiento: "12/30",
            cvv: "123",
            titular: "Prueba de integración"
        }
    };
}

async function inventory(medicationId) {
    const { rows } = await pool.query(
        "SELECT stock FROM medicamentos WHERE id = $1",
        [medicationId]
    );
    return rows[0]?.stock;
}

async function orderCounts(userId) {
    const { rows } = await pool.query(
        `SELECT COUNT(DISTINCT s.id)::int AS pedidos,
                COUNT(DISTINCT d.id)::int AS detalles,
                COUNT(DISTINCT p.id)::int AS pagos
         FROM solicitudes s
         LEFT JOIN detalle_solicitud d ON d.solicitud_id = s.id
         LEFT JOIN pagos p ON p.solicitud_id = s.id
         WHERE s.usuario_id = $1`,
        [userId]
    );
    return rows[0];
}

test("persistencia real de pedido, detalle, pago e inventario", async t => {
    const fixture = await createFixture(t);
    const key = crypto.randomUUID();
    const result = await orderService.crearPedido(
        fixture.users[0],
        orderData([{ id: fixture.medications[0], cantidad: 2 }]),
        key
    );

    const { rows } = await pool.query(
        `SELECT s.id, s.idempotency_key, s.idempotency_hash,
                d.cantidad, d.subtotal, p.id AS pago_id, p.monto
         FROM solicitudes s
         JOIN detalle_solicitud d ON d.solicitud_id = s.id
         JOIN pagos p ON p.solicitud_id = s.id
         WHERE s.usuario_id = $1`,
        [fixture.users[0]]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, result.solicitudId);
    assert.equal(rows[0].idempotency_key, key);
    assert.match(rows[0].idempotency_hash, /^[a-f0-9]{64}$/);
    assert.equal(rows[0].cantidad, 2);
    assert.equal(Number(rows[0].subtotal), 19.98);
    assert.ok(rows[0].pago_id);
    assert.equal(Number(rows[0].monto), 19.98);
    assert.equal(await inventory(fixture.medications[0]), 6);
});

test("replay idempotente persiste el resultado y rechaza una huella distinta", async t => {
    const fixture = await createFixture(t);
    const key = crypto.randomUUID();
    const first = await orderService.crearPedido(
        fixture.users[0],
        orderData([{ id: fixture.medications[0], cantidad: 1 }]),
        key
    );
    const replay = await orderService.crearPedido(
        fixture.users[0],
        orderData([{ id: fixture.medications[0], cantidad: 1 }]),
        key
    );

    assert.equal(replay.replayed, true);
    assert.equal(replay.solicitudId, first.solicitudId);
    assert.equal(replay.pagoId, first.pagoId);
    await assert.rejects(
        orderService.crearPedido(
            fixture.users[0],
            orderData([{ id: fixture.medications[0], cantidad: 2 }]),
            key
        ),
        error => error.status === 409
    );
    assert.deepEqual(await orderCounts(fixture.users[0]), {
        pedidos: 1, detalles: 1, pagos: 1
    });
    assert.equal(await inventory(fixture.medications[0]), 7);
});

test("dos solicitudes simultáneas con la misma clave crean un pedido y descuentan una vez", async t => {
    const fixture = await createFixture(t);
    const key = crypto.randomUUID();
    const payload = orderData([{ id: fixture.medications[0], cantidad: 2 }]);
    const results = await Promise.all([
        orderService.crearPedido(fixture.users[0], payload, key),
        orderService.crearPedido(fixture.users[0], payload, key)
    ]);

    assert.equal(new Set(results.map(result => result.solicitudId)).size, 1);
    assert.equal(results.filter(result => result.replayed === true).length, 1);
    assert.deepEqual(await orderCounts(fixture.users[0]), {
        pedidos: 1, detalles: 1, pagos: 1
    });
    assert.equal(await inventory(fixture.medications[0]), 6);
});

test("órdenes concurrentes conservan inventario sin sobreventa", async t => {
    const fixture = await createFixture(t, { stock: 3 });
    const attempts = await Promise.allSettled([
        orderService.crearPedido(
            fixture.users[0],
            orderData([{ id: fixture.medications[0], cantidad: 2 }]),
            crypto.randomUUID()
        ),
        orderService.crearPedido(
            fixture.users[0],
            orderData([{ id: fixture.medications[0], cantidad: 2 }]),
            crypto.randomUUID()
        )
    ]);

    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(attempts.filter(result => result.status === "rejected").length, 1);
    assert.deepEqual(await orderCounts(fixture.users[0]), {
        pedidos: 1, detalles: 1, pagos: 1
    });
    assert.equal(await inventory(fixture.medications[0]), 1);
});

test("pedido multimedicamente mantiene detalle, total y stock por producto", async t => {
    const fixture = await createFixture(t, { stock: 5, medicineCount: 2 });
    const result = await orderService.crearPedido(
        fixture.users[0],
        orderData([
            { id: fixture.medications[1], cantidad: 2 },
            { id: fixture.medications[0], cantidad: 1 }
        ]),
        crypto.randomUUID()
    );

    assert.equal(result.total, 29.97);
    assert.equal(await inventory(fixture.medications[0]), 4);
    assert.equal(await inventory(fixture.medications[1]), 3);
    assert.deepEqual(await orderCounts(fixture.users[0]), {
        pedidos: 1, detalles: 2, pagos: 1
    });
});

test("error real de unicidad en el pago revierte pedido, detalle e inventario", async t => {
    const fixture = await createFixture(t);
    const first = await orderService.crearPedido(
        fixture.users[0],
        orderData([{ id: fixture.medications[0], cantidad: 1 }]),
        crypto.randomUUID()
    );
    const countsBefore = await orderCounts(fixture.users[0]);
    const stockBefore = await inventory(fixture.medications[0]);
    const { rows: medicationRows } = await pool.query(
        "SELECT precio FROM medicamentos WHERE id = $1",
        [fixture.medications[0]]
    );
    const price = Number(medicationRows[0].precio);

    await assert.rejects(
        orderRepository.crearPedidoConPago({
            usuarioId: fixture.users[0],
            tipoEntrega: "RECOGER",
            direccion: "",
            observaciones: "",
            items: [{
                medicamento_id: fixture.medications[0],
                cantidad: 1,
                precio: price,
                subtotal: price
            }],
            total: price,
            pago: {
                referencia: first.pago.referencia,
                metodo: "TARJETA",
                marca: "VISA",
                ultimos_digitos: "4242",
                estado: "APROBADO"
            },
            idempotencyKey: crypto.randomUUID(),
            idempotencyHash: crypto.createHash("sha256")
                .update(suffix())
                .digest("hex")
        }),
        error => error.code === "23505"
    );

    assert.deepEqual(await orderCounts(fixture.users[0]), countsBefore);
    assert.equal(await inventory(fixture.medications[0]), stockBefore);
});

test("pedido e idempotencia sobreviven al reinicio del backend", async t => {
    const fixture = await createFixture(t);
    const key = crypto.randomUUID();
    const worker = path.join(__dirname, "postgres-backend-worker.cjs");

    function runBackendProcess() {
        const child = spawnSync(
            process.execPath,
            [worker, String(fixture.users[0]), String(fixture.medications[0]), key],
            {
                cwd: path.resolve(__dirname, ".."),
                env: process.env,
                encoding: "utf8",
                timeout: 30000,
                windowsHide: true
            }
        );
        assert.equal(child.error, undefined, "No se pudo iniciar el proceso backend de prueba.");
        assert.equal(child.status, 0, "El proceso backend de prueba terminó con error.");
        const marker = child.stdout
            .split(/\r?\n/)
            .find(line => line.startsWith("INTEGRATION_RESULT:"));
        assert.ok(marker, "El backend no devolvió el resultado de integración esperado.");
        return JSON.parse(marker.slice("INTEGRATION_RESULT:".length));
    }

    const created = runBackendProcess();
    assert.equal(
        created.status,
        201,
        `Backend devolvió HTTP ${created.status}; logs sanitizados: ${JSON.stringify(created.backendErrors)}`
    );
    assert.equal(created.ok, true);
    assert.equal(created.replayed, false);

    const replayed = runBackendProcess();
    assert.equal(
        replayed.status,
        201,
        `Backend devolvió HTTP ${replayed.status}; logs sanitizados: ${JSON.stringify(replayed.backendErrors)}`
    );
    assert.equal(replayed.ok, true);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.solicitudId, created.solicitudId);
    assert.equal(await inventory(fixture.medications[0]), 7);
    assert.deepEqual(await orderCounts(fixture.users[0]), {
        pedidos: 1, detalles: 1, pagos: 1
    });
});
