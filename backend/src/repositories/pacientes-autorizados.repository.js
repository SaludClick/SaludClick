function createRepository(prisma) {

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

async function listar({ busqueda, page, limit, estado }) {
    // A patient is an authorization record. Email belongs to an optional client
    // account with the same document; never copy accounts or EPS affiliates here.
    const cuentas = busqueda ? await prisma.usuario.findMany({
        where: { rol_id: 2, correo: { contains: busqueda, mode: "insensitive" }, cedula: { not: null } },
        select: { cedula: true }
    }) : [];
    const where = busqueda
        ? {
            OR: [
                { AND: busqueda.split(/\s+/u).map(term => ({ OR: [
                    { nombres: { contains: term, mode: "insensitive" } },
                    { apellidos: { contains: term, mode: "insensitive" } },
                    { cedula: { contains: term, mode: "insensitive" } }
                ] })) },
                { cedula: { in: cuentas.map(c => c.cedula) } }
            ]
        }
        : {};

    if (estado) where.estado = estado;

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

return {
    listar,
    buscarPorId,
    crear,
    actualizar
};
}
module.exports = { ...createRepository(require("../config/prisma")), createRepository };
