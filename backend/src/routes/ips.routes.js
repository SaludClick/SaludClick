const { Router } = require("express");
const { validarJWT } = require("../middlewares/auth.middleware");

function createIpsRouter({ query = (...args) => require("../config/database").query(...args) } = {}) {
    const router = Router();
    router.get("/verificar-acceso", validarJWT, async (req, res) => {
        res.set("Cache-Control", "no-store");
        const { id, iat, rol, rol_id } = req.usuario;
        if ((rol_id ?? rol) !== 4) {
            return res.status(403).json({ ok: false, mensaje: "Acceso restringido al personal de IPS." });
        }

        try {
            const { rows: [acceso] } = await query(
                `SELECT i.id, i.nombre, a.revocado_at
                 FROM ips_accesos a
                 JOIN usuarios u ON u.id = a.usuario_id
                 JOIN ips_entidades i ON i.id = a.ips_id
                 WHERE a.usuario_id = $1 AND a.activo AND i.activa
                   AND u.rol_id = 4 AND u.estado = 'ACTIVO'`,
                [id]
            );
            if (!acceso) {
                return res.status(403).json({ ok: false, mensaje: "Se requiere una vinculación IPS activa." });
            }
            if (acceso.revocado_at && iat * 1000 <= new Date(acceso.revocado_at).getTime()) {
                return res.status(401).json({ ok: false, mensaje: "La sesión IPS fue revocada." });
            }
            return res.json({ ok: true, ips: { id: acceso.id, nombre: acceso.nombre } });
        } catch (error) {
            console.error("No se pudo consultar el acceso IPS.", error.code || error.name);
            return res.status(503).json({ ok: false, mensaje: "No fue posible comprobar el acceso IPS." });
        }
    });
    return router;
}

module.exports = { createIpsRouter };
