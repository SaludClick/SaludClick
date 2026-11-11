const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
const auditorias = [];
let transacciones = 0;
const pacienteAntes = {
    id: 8,
    nombres: "María",
    apellidos: "Pérez",
    tipo_documento: "CC",
    cedula: "0008",
    estado: "AUTORIZADO",
    created_at: new Date("2026-11-10T12:00:00.000Z"),
    updated_at: new Date("2026-11-10T12:00:00.000Z")
};

const tx = {
    pacienteAutorizado: {
        async create({ data }) {
            return { id: 8, ...data, estado: "AUTORIZADO" };
        },
        async findUnique() {
            return { ...pacienteAntes };
        },
        async update({ data }) {
            return { ...pacienteAntes, ...data };
        }
    },
    auditoriaPacienteAutorizado: {
        async create({ data }) {
            auditorias.push(data);
        }
    }
};

const prismaStub = {
    async $transaction(callback, options) {
        transacciones += 1;
        assert.equal(options.isolationLevel, "Serializable");
        return callback(tx);
    }
};

Module._load = function(request, parent, isMain) {
    if (
        request === "../config/prisma" &&
        /pacientes-autorizados\.repository\.js$/.test(parent?.filename || "")
    ) {
        return prismaStub;
    }
    return originalLoad.call(this, request, parent, isMain);
};
const repository = require("../src/repositories/pacientes-autorizados.repository");
Module._load = originalLoad;

test("crear paciente y su auditoría se ejecutan en una transacción serializable", async () => {
    const paciente = await repository.crear({
        nombres: "María",
        apellidos: "Pérez",
        tipo_documento: "CC",
        cedula: "0008"
    }, 17);

    assert.equal(paciente.id, 8);
    assert.equal(transacciones, 1);
    assert.deepEqual(auditorias[0], {
        paciente_id: 8,
        administrador_id: 17,
        accion: "CREADO",
        campos_modificados: [
            "nombres",
            "apellidos",
            "tipo_documento",
            "cedula",
            "estado"
        ]
    });
});

test("actualizar guarda solo los nombres de campos modificados en auditoría", async () => {
    const actualizado = await repository.actualizar(8, {
        apellidos: "Pérez Díaz",
        estado: "REVOCADO"
    }, 17);

    assert.equal(actualizado.apellidos, "Pérez Díaz");
    assert.equal(actualizado.estado, "REVOCADO");
    assert.equal(transacciones, 2);
    assert.deepEqual(auditorias[1], {
        paciente_id: 8,
        administrador_id: 17,
        accion: "ACTUALIZADO",
        campos_modificados: ["apellidos", "estado"]
    });
});
