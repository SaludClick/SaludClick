
const prisma = require("../config/prisma");

async function listar() {
    const medicamentos = await prisma.medicamento.findMany({
        include: {
            categoria: {
                select: {
                    nombre: true,
                    descripcion: true
                }
            }
        },
        orderBy: [
            { categoria: { nombre: "asc" } },
            { nombre: "asc" }
        ]
    });

    return medicamentos.map((medicamento) => ({
        id: medicamento.id,
        nombre: medicamento.nombre,
        descripcion: medicamento.descripcion,
        categoria_id: medicamento.categoria_id,
        categoria: medicamento.categoria.nombre,
        categoria_descripcion: medicamento.categoria.descripcion,
        precio: medicamento.precio,
        stock: medicamento.stock,
        imagen: medicamento.imagen,
        estado: medicamento.estado
    }));
}

module.exports = { listar };
