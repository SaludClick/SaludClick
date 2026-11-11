const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    parseCsv,
    readCsv,
    validateCatalogRows,
    importCatalog
} = require("../scripts/importar-catalogo-invima");

const csvPath = path.resolve(__dirname, "../data/catalogo_invima.csv");

function row(cum, consecutivo, producto = `Producto ${cum}`) {
    return {
        cum,
        consecutivo,
        expediente: "EXP-1",
        producto,
        principio_activo: "Componente",
        registro_sanitario: "RS-1",
        estado_registro: "Vigente",
        estado_cum: "Activo",
        muestra_medica: "No",
        modalidad: "Venta libre",
        titular: "Titular"
    };
}

test("el parser conserva comas, comillas escapadas y saltos de línea en campos CSV", () => {
    assert.deepEqual(parseCsv('a,b\r\n"uno, dos","dijo ""sí""\ny luego"\r\n'), [
        ["a", "b"],
        ["uno, dos", 'dijo "sí"\ny luego']
    ]);
});

test("el CSV INVIMA contiene 1000 códigos únicos y válidos", () => {
    const records = readCsv(csvPath);
    const catalog = validateCatalogRows(records, 1000);
    assert.equal(catalog.length, 1000);
    assert.equal(new Set(catalog.map(item => item.codigo_fuente)).size, 1000);
});

test("la validación rechaza códigos INVIMA duplicados", () => {
    assert.throws(
        () => validateCatalogRows([row("123", "01"), row("123", "01")]),
        /Código duplicado/
    );
});

test("la importación omite códigos ya existentes y es idempotente", async () => {
    const codes = new Set(["INVIMA-CUM-1-01"]);
    const categories = new Map();
    let categoryUpserts = 0;
    let createManyCalls = 0;
    const prisma = {
        categoria: {
            upsert: async ({ where }) => {
                categoryUpserts += 1;
                if (!categories.has(where.nombre)) {
                    categories.set(where.nombre, categories.size + 1);
                }
                return { id: categories.get(where.nombre) };
            }
        },
        medicamento: {
            createMany: async ({ data, skipDuplicates }) => {
                assert.equal(skipDuplicates, true);
                createManyCalls += 1;
                let count = 0;
                for (const product of data) {
                    if (codes.has(product.codigo_fuente)) continue;
                    codes.add(product.codigo_fuente);
                    count += 1;
                }
                return { count };
            },
            count: async ({ where }) =>
                where.codigo_fuente.in.filter(code => codes.has(code)).length
        }
    };
    const rows = [row("1", "01"), row("2", "01")];

    const first = await importCatalog(rows, prisma, 2);
    const second = await importCatalog(rows, prisma, 2);

    assert.deepEqual(first, { created: 1, skipped: 1, total: 2 });
    assert.deepEqual(second, { created: 0, skipped: 2, total: 2 });
    assert.equal(createManyCalls, 2);
    assert.equal(codes.size, 2);
});

test("los modelos y migraciones declaran todas las tablas del catálogo", () => {
    const schema = fs.readFileSync(
        path.resolve(__dirname, "../prisma/schema.prisma"),
        "utf8"
    );
    const migration = fs.readFileSync(
        path.resolve(
            __dirname,
            "../prisma/migrations/20261106190000_catalogo_medicamentos/migration.sql"
        ),
        "utf8"
    );

    for (const field of [
        "codigo_fuente", "expediente", "nombre_generico",
        "principio_activo", "requiere_formula", "catalogo_verificado",
        "precio_referencial", "fecha_precio"
    ]) {
        assert.match(schema, new RegExp(`\\b${field}\\b`));
        assert.match(migration, new RegExp(`"${field}"`));
    }
    assert.match(schema, /@@map\("imagenes_medicamento"\)/);
    assert.match(schema, /@@map\("observaciones_precio"\)/);
    assert.match(migration, /CREATE TABLE "imagenes_medicamento"/);
    assert.match(migration, /CREATE TABLE "observaciones_precio"/);
});
