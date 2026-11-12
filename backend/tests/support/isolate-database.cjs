// Estas suites verifican servicios/HTTP con dobles de prueba. Nunca deben
// necesitar el .env del desarrollador ni abrir conexiones reales.
const fail = () => { throw new Error('Acceso inesperado a la base de datos en una prueba aislada.'); };
for (const [file, exports] of [
    ['../../src/config/database', { query: fail, connect: fail, end: async () => {} }],
    ['../../src/config/prisma', new Proxy({}, { get: () => fail })]
]) {
    const id = require.resolve(file);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}
