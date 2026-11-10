const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const sqlCalls = [];
const prismaCalls = [];
let transactionCalls;
let sqlFailure;
let profile;
let tokenSearch;
let formulaRows;
let account;
let accountByEmail;
let accountFindManyArgs;
let accountFindFirstArgs;

const pool = {
    query: async (sql, params = []) => {
        sqlCalls.push({ sql, params });
        if (sqlFailure && sqlFailure.includes(sql.split(/\s+/).slice(0, 3).join(' '))) {
            throw new Error('test database failure');
        }
        if (sql.includes('INSERT INTO usuarios')) return { rows: [{ id: 31 }] };
        if (sql.includes('SELECT * FROM usuarios WHERE correo')) return { rows: [{ id: 31, correo: params[0] }] };
        if (sql.includes('SELECT tr.id AS token_id')) return { rows: tokenSearch ? [tokenSearch] : [] };
        if (sql.includes('SELECT id, nombre, apellido, correo, telefono')) return { rows: profile ? [profile] : [] };
        if (sql.includes('INSERT INTO formulas_medicas')) return { rows: [{ id: 51 }] };
        if (sql.includes('FROM formulas_medicas') && sql.includes('nombre_original AS nombre')) return { rows: formulaRows };
        if (sql.includes('FROM formulas_medicas') && sql.includes('WHERE id = $1')) return { rows: formulaRows.slice(0, 1) };
        if (sql.includes('FROM formulas_medicas f')) return { rows: formulaRows };
        if (sql.startsWith('UPDATE formulas_medicas')) return { rowCount: 1 };
        return { rows: [], rowCount: 1 };
    },
    connect: async () => ({
        query: async (sql, params = []) => {
            sqlCalls.push({ sql, params });
            if (sqlFailure && sql.includes(sqlFailure)) throw new Error('test transaction failure');
            return { rows: [] };
        },
        release: () => sqlCalls.push({ sql: 'RELEASE' })
    })
};

const prisma = {
    usuario: {
        count: async ({ where } = {}) => where?.estado ? 8 : 10,
        findMany: async args => {
            accountFindManyArgs = args;
            return [{ id: 2 }];
        },
        findFirst: async args => {
            accountFindFirstArgs = args;
            return accountByEmail;
        },
        findUnique: async ({ where } = {}) => where?.correo ? accountByEmail : account,
        create: async ({ data, select }) => {
            prismaCalls.push(['usuario.create', data, select]);
            const { password, ...safeData } = data;
            return { id: 77, ...safeData };
        },
        delete: async ({ where }) => { prismaCalls.push(['usuario.delete', where]); }
    },
    rol: {
        findUnique: async ({ where }) => ({ id: where.id })
    },
    solicitud: {
        count: async ({ where } = {}) => {
            if (where?.usuario_id) return where.estado ? 4 : 9;
            return where ? 5 : 21;
        },
        findMany: async () => [{
            id: 4, fecha: new Date('2026-01-01'), estado: 'APROBADA',
            tipo_entrega: 'RECOGER',
            usuario: { nombre: 'Ana', apellido: 'Prueba', correo: 'ana@example.test' },
            detalles: [{ subtotal: '12.30' }, { subtotal: '4.20' }],
            pagos: []
        }],
        updateMany: async ({ where, data }) => {
            prismaCalls.push(['solicitud.updateMany', where, data]);
            return { count: 1 };
        },
        groupBy: async () => [{ estado: 'APROBADA', _count: { _all: 2 } }]
    },
    pago: {
        aggregate: async ({ where } = {}) => ({
            _sum: { monto: where?.usuario_id ? '250.50' : '1000.25' }
        }),
        findMany: async () => [
            { created_at: new Date('2026-01-10T12:00:00Z'), monto: '10.25' },
            { created_at: new Date('2026-01-20T12:00:00Z'), monto: '5.75' },
            { created_at: new Date('2026-02-01T12:00:00Z'), monto: '2' },
            { created_at: null, monto: '500' }
        ]
    },
    medicamento: {
        count: async ({ where } = {}) => where ? 5 : 8,
        aggregate: async () => ({ _sum: { stock: 77 } })
    },
    formulaMedica: {
        count: async ({ where } = {}) => where ? 2 : 3,
        deleteMany: async ({ where }) => { prismaCalls.push(['formula.deleteMany', where]); }
    },
    recordatorio: {
        deleteMany: async ({ where }) => { prismaCalls.push(['recordatorio.deleteMany', where]); }
    },
    tokenRecuperacion: {
        deleteMany: async ({ where }) => { prismaCalls.push(['token.deleteMany', where]); }
    },
    $transaction: async (callback, options) => {
        transactionCalls.push(options);
        const tx = {
            usuario: {
                findUnique: async () => account,
                delete: async ({ where }) => { prismaCalls.push(['usuario.delete', where]); }
            },
            recordatorio: prisma.recordatorio,
            tokenRecuperacion: prisma.tokenRecuperacion,
            formulaMedica: prisma.formulaMedica
        };
        return callback(tx);
    }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === '../config/database' && /(?:auth|formula)\.repository\.js$/.test(parent?.filename || '')) return pool;
    if (request === '../config/prisma' && /(?:admin|dashboard)\.repository\.js$/.test(parent?.filename || '')) return prisma;
    return originalLoad.call(this, request, parent, isMain);
};
const authRepository = require('../src/repositories/auth.repository');
const formulaRepository = require('../src/repositories/formula.repository');
const adminRepository = require('../src/repositories/admin.repository');
const dashboardRepository = require('../src/repositories/dashboard.repository');
Module._load = originalLoad;

beforeEach(() => {
    sqlCalls.length = 0;
    prismaCalls.length = 0;
    transactionCalls = [];
    sqlFailure = null;
    profile = { id: 31, nombre: 'Ana', correo: 'ana@example.test' };
    tokenSearch = { token_id: 7, usuario_id: 31, correo: 'ana@example.test' };
    formulaRows = [{ id: 51, nombre: 'receta.pdf', estado: 'PENDIENTE' }];
    accountByEmail = null;
    accountFindManyArgs = null;
    accountFindFirstArgs = null;
    account = {
        id: 42, rol_id: 2, _count: { solicitudes: 0, pagos: 0 },
        formulas_medicas: [{ nombre_archivo: 'abc.pdf' }]
    };
});

test('auth repository guarda usuarios, búsquedas, perfil y tokens de recuperación', async () => {
    assert.deepEqual(await authRepository.buscarPorCorreo('ana@example.test'), { id: 31, correo: 'ana@example.test' });
    assert.equal(await authRepository.register({
        nombre: 'Ana', correo: 'ana@example.test', password: 'hash',
        numeroDocumento: '123', rol_id: 2
    }), 31);
    assert.deepEqual(await authRepository.login('ana@example.test'), { id: 31, correo: 'ana@example.test' });
    await authRepository.crearTokenRecuperacion(31, 'hash-token', new Date('2026-01-01'));
    assert.equal(await authRepository.buscarTokenRecuperacion('hash-token'), tokenSearch);
    assert.deepEqual(await authRepository.buscarPerfil(31), profile);
    assert.deepEqual(await authRepository.actualizarPerfil(31, {
        nombre: 'Ana', numeroDocumento: '456'
    }), profile);
    assert.deepEqual(sqlCalls.filter(({ sql }) => sql.startsWith('DELETE FROM tokens')).map(call => call.params), [[31]]);
    assert.deepEqual(sqlCalls.find(({ sql }) => sql.includes('INSERT INTO usuarios')).params,
        ['Ana', null, 'ana@example.test', null, null, '123', null, 'hash', 2]);
});

test('auth repository confirma la actualización de contraseña y revierte fallos', async () => {
    await authRepository.actualizarPassword(31, 'new-hash', 7);
    assert.ok(sqlCalls.some(({ sql }) => sql === 'COMMIT'));
    assert.ok(sqlCalls.some(({ sql }) => sql === 'RELEASE'));

    sqlCalls.length = 0;
    sqlFailure = 'DELETE FROM tokens_recuperacion';
    await assert.rejects(authRepository.actualizarPassword(31, 'new-hash', 7), /test transaction failure/);
    assert.ok(sqlCalls.some(({ sql }) => sql === 'ROLLBACK'));
    assert.ok(sqlCalls.some(({ sql }) => sql === 'RELEASE'));
});

test('formula repository conserva el propietario, el estado y los filtros de listado', async () => {
    assert.equal(await formulaRepository.crear({
        usuarioId: 31, nombreArchivo: 'abc.pdf', nombreOriginal: 'receta.pdf',
        tipoMime: 'application/pdf', tamano: 100, descripcion: ''
    }), 51);
    assert.deepEqual(await formulaRepository.listarUsuario(31), formulaRows);
    assert.deepEqual(await formulaRepository.buscarPropia(31, 51), formulaRows[0]);
    assert.deepEqual(await formulaRepository.listarAdmin(), formulaRows);
    assert.equal(await formulaRepository.actualizarEstado(51, 'VALIDADA'), 1);
    assert.match(sqlCalls.find(({ sql }) => sql.includes('WHERE id = $1 AND usuario_id = $2')).sql, /usuario_id = \$2/);
});

test('admin repository convierte pedidos, actualiza estados y mantiene filtros de cuentas', async () => {
    assert.deepEqual(await adminRepository.pedidos(), [{
        id: 4, fecha: new Date('2026-01-01'), estado: 'APROBADA',
        tipo_entrega: 'RECOGER', usuario: 'Ana Prueba', correo: 'ana@example.test',
        total: 16.5, pago: 'SIN PAGO'
    }]);
    assert.equal(await adminRepository.estadoPedido('4', 'LISTA'), 1);
    assert.deepEqual(await adminRepository.listarCuentas(), [{ id: 2 }]);
    assert.deepEqual(accountFindManyArgs.where, { rol_id: { in: [2, 3, 4] } });
    assert.equal(await adminRepository.buscarCuentaParaEliminar('42'), account);
    assert.deepEqual(prismaCalls[0], ['solicitud.updateMany', { id: 4 }, { estado: 'LISTA' }]);
});

test('admin repository consulta existencia y persiste cuenta activa sin devolver contraseña', async () => {
    accountByEmail = { id: 91 };
    assert.deepEqual(await adminRepository.buscarCuentaPorCorreo('ana@example.test'), { id: 91 });
    assert.deepEqual(accountFindFirstArgs, {
        where: { correo: { equals: 'ana@example.test', mode: 'insensitive' } },
        select: { id: true }
    });
    assert.deepEqual(await adminRepository.buscarRol(4), { id: 4 });

    prismaCalls.length = 0;
    const cuenta = await adminRepository.crearCuenta({
        nombre: 'Ana',
        apellido: 'Pérez',
        correo: 'ana@example.test',
        password: '$2b$10$test-hash',
        rol_id: 4,
        estado: 'ACTIVO'
    });

    assert.equal(cuenta.estado, 'ACTIVO');
    assert.equal(cuenta.rol_id, 4);
    assert.equal(Object.hasOwn(cuenta, 'password'), false);
    assert.deepEqual(prismaCalls[0][1], {
        nombre: 'Ana',
        apellido: 'Pérez',
        correo: 'ana@example.test',
        password: '$2b$10$test-hash',
        rol_id: 4,
        estado: 'ACTIVO'
    });
    assert.equal(Object.hasOwn(prismaCalls[0][2], 'password'), false);
});

test('eliminación de cuenta es transaccional, serializable y valida todas las restricciones', async t => {
    await t.test('rechaza cuenta inexistente', async () => {
        account = null;
        await assert.rejects(adminRepository.eliminarCuenta(42), { code: 'CUENTA_NO_ENCONTRADA' });
    });
    await t.test('rechaza roles protegidos e historial comercial', async () => {
        account = { ...account, rol_id: 1 };
        await assert.rejects(adminRepository.eliminarCuenta(42), { code: 'CUENTA_NO_PERMITIDA' });
        account = { ...account, rol_id: 2, _count: { solicitudes: 1, pagos: 0 } };
        await assert.rejects(adminRepository.eliminarCuenta(42), { code: 'CUENTA_CON_HISTORIAL' });
    });
    await t.test('elimina registros dependientes y retorna los nombres de archivos', async () => {
        account = {
            id: 42, rol_id: 3, _count: { solicitudes: 0, pagos: 0 },
            formulas_medicas: [{ nombre_archivo: 'abc.pdf' }]
        };
        assert.deepEqual(await adminRepository.eliminarCuenta(42), {
            id: 42, archivosFormula: ['abc.pdf']
        });
        assert.deepEqual(transactionCalls.at(-1), { isolationLevel: 'Serializable' });
        assert.deepEqual(prismaCalls.slice(-4).map(([name]) => name), [
            'recordatorio.deleteMany', 'token.deleteMany',
            'formula.deleteMany', 'usuario.delete'
        ]);
    });
});

test('dashboard agrega totales personales y ventas por mes sin contar pagos sin fecha', async () => {
    assert.deepEqual(await dashboardRepository.statsUsuario('12'), {
        pedidos: 9, pedidosActivos: 4, formulas: 2, totalPagado: 250.5
    });

    const result = await dashboardRepository.statsAdmin();
    assert.deepEqual(result.usuarios, { total: 10, activos: 8 });
    assert.deepEqual(result.pedidos, { total: 21, activos: 5 });
    assert.equal(result.ventas, 1000.25);
    assert.deepEqual(result.inventario, { total: 8, disponibles: 5, unidades: 77 });
    assert.deepEqual(result.formulas, { total: 3, pendientes: 2 });
    assert.equal(result.ventasMes.reduce((sum, item) => sum + item.pedidos, 0), 3);
    assert.equal(result.ventasMes.reduce((sum, item) => sum + item.ventas, 0), 18);
    assert.deepEqual(result.estados, [{ estado: 'APROBADA', cantidad: 2 }]);
});
