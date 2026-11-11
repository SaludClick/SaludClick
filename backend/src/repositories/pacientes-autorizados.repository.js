const prisma = require("../config/prisma");

const CAMPOS_PUBLICOS = {
    id: true,
    nombres: true,
    apellidos: true,
    tipo_documento: true,
    cedula: true,
    estado: true,
    created_at: true,
    updated_at: true
};

async function listar({ busqueda, page, limit }) {
    const where = busqueda
        ? {
            OR: [
                { nombres: { contains: busqueda, mode: "insensitive" } },
                { apellidos: { contains: busqueda, mode: "insensitive" } },
                { cedula: { contains: busqueda, mode: "insensitive" } }
            ]
        }
        : {};

    const [total, pacientes] = await prisma.$transaction([
        prisma.pacienteAutorizado.count({ where }),
        prisma.pacienteAutorizado.findMany({
            where,
            select: CAMPOS_PUBLICOS,
            orderBy: [{ apellidos: "asc" }, { nombres: "asc" }, { id: "asc" }],
            skip: (page - 1) * limit,
            take: limit
        })
    ]);

    return {
        pacientes,
        paginacion: {
            pagina: page,
            limite: limit,
            total,
            totalPaginas: Math.ceil(total / limit)
        }
    };
}

async function buscarPorId(id) {
    return prisma.pacienteAutorizado.findUnique({
        where: { id },
        select: CAMPOS_PUBLICOS
    });
}

async function crear(paciente, administradorId) {
    return prisma.$transaction(async (tx) => {
        const creado = await tx.pacienteAutorizado.create({
            data: paciente,
            select: CAMPOS_PUBLICOS
        });

        await tx.auditoriaPacienteAutorizado.create({
            data: {
                paciente_id: creado.id,
                administrador_id: administradorId,
                accion: "CREADO",
                campos_modificados: [
                    "nombres",
                    "apellidos",
                    "tipo_documento",
                    "cedula",
                    "estado"
                ]
            }
        });

        return creado;
    }, { isolationLevel: "Serializable" });
}

async function actualizar(id, datos, administradorId) {
    return prisma.$transaction(async (tx) => {
        const anterior = await tx.pacienteAutorizado.findUnique({
            where: { id },
            select: CAMPOS_PUBLICOS
        });

        if (!anterior) return null;

        const camposModificados = Object.keys(datos).filter(
            (campo) => anterior[campo] !== datos[campo]
        );

        if (camposModificados.length === 0) return anterior;

        const actualizado = await tx.pacienteAutorizado.update({
            where: { id },
            data: datos,
            select: CAMPOS_PUBLICOS
        });

        await tx.auditoriaPacienteAutorizado.create({
            data: {
                paciente_id: id,
                administrador_id: administradorId,
                accion: camposModificados.includes("estado")
                    ? "ACTUALIZADO"
                    : "DATOS_ACTUALIZADOS",
                campos_modificados: camposModificados
            }
        });

        return actualizado;
    }, { isolationLevel: "Serializable" });
}

module.exports = {
    listar,
    buscarPorId,
    crear,
    actualizar
};
