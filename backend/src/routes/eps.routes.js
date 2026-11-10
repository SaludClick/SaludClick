
const express = require("express");
const router = express.Router();

const epsPool = require("../config/epsDatabase");

// Consultar todos los afiliados
router.get("/afiliados", async (req, res) => {
    try {
        const resultado = await epsPool.query(`
            SELECT
                a.id,
                a.nombres,
                a.apellidos,
                a.tipo_documento,
                a.documento,
                a.fecha_nacimiento,
                a.telefono,
                a.correo,
                a.direccion,
                a.ciudad,
                a.regimen,
                a.estado,
                a.eps_id,
                e.nombre AS nombre_eps
            FROM afiliados a
            LEFT JOIN eps e ON a.eps_id = e.id
            ORDER BY a.id ASC
        `);

        return res.status(200).json({
            ok: true,
            total: resultado.rows.length,
            afiliados: resultado.rows
        });

    } catch (error) {
        console.error("Error consultando afiliados EPS:", error.message);

        return res.status(500).json({
            ok: false,
            mensaje: "Error al consultar afiliados de EPS VidaPlena"
        });
    }
});

// Consultar un afiliado por ID
router.get("/afiliados/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^\d+$/.test(id)) {
            return res.status(400).json({
                ok: false,
                mensaje: "El ID debe ser numérico."
            });
        }

        const resultado = await epsPool.query(
            "SELECT * FROM afiliados WHERE id = $1",
            [Number(id)]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: "Afiliado no encontrado."
            });
        }

        return res.status(200).json({
            ok: true,
            afiliado: resultado.rows[0]
        });

    } catch (error) {
        console.error("Error consultando afiliado:", error.message);

        return res.status(500).json({
            ok: false,
            mensaje: "Error al consultar el afiliado."
        });
    }
});

module.exports = router;
