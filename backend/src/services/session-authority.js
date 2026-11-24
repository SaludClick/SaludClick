const { verificarToken } = require("../utils/jwt");

function createSessionAuthority(query) {
    async function validate(token) {
        const claims = verificarToken(token);
        const role = claims.rol_id ?? claims.rol;
        if (!Number.isSafeInteger(claims.sv) || claims.sv < 1) return null;
        const { rows } = await query(
            `SELECT 1 FROM usuarios u
             WHERE u.id = $1 AND u.estado = 'ACTIVO' AND u.rol_id = $2
               AND u.session_version = $3
               AND ($2 <> 4 OR EXISTS (
                   SELECT 1 FROM ips_accesos a JOIN ips_entidades i ON i.id = a.ips_id
                   WHERE a.usuario_id = u.id AND a.activo AND i.activa
               ) OR EXISTS (
                   SELECT 1 FROM eps_accesos a JOIN eps_entidades e ON e.id = a.eps_id
                   WHERE a.usuario_id = u.id AND a.activo AND e.activa
               ))`,
            [claims.id, role, claims.sv]
        );
        if (rows.length !== 1) return null;
        if (role === 5) {
            const membership = await query(
                `SELECT 1 FROM farmacia_personal_dispensacion p JOIN usuarios f ON f.id = p.farmacia_id
                 JOIN farmacia_personal_dispensacion r ON r.usuario_id=f.id AND r.perfil='RESPONSABLE' AND r.activo
                 WHERE p.usuario_id=$1 AND p.activo AND p.perfil='DOMICILIARIO'
                   AND f.rol_id=3 AND f.estado='ACTIVO'`, [claims.id]
            );
            if (membership.rows.length !== 1) return null;
        }
        if (role === 3) {
            const membership = await query(
                `SELECT 1 FROM usuarios u WHERE u.id=$1 AND (NOT u.alta_diferenciada OR EXISTS (
                    SELECT 1 FROM farmacia_personal_dispensacion p JOIN usuarios f ON f.id=p.farmacia_id
                    JOIN farmacia_personal_dispensacion r ON r.usuario_id=f.id AND r.perfil='RESPONSABLE' AND r.activo
                    WHERE p.usuario_id=u.id AND p.activo AND p.perfil IN ('RESPONSABLE','OPERATIVO')
                      AND f.rol_id=3 AND f.estado='ACTIVO'
                ))`, [claims.id]
            );
            if (membership.rows.length !== 1) return null;
        }
        return claims;
    }

    async function isCurrent(token) {
        try { return await validate(token); }
        catch { return false; }
    }

    async function http(req, res, next) {
        // Visitor tokens retain their own, independent authorization.
        if (/^\/administrativo\/visitante\//i.test(req.path)) return next();
        const token = /^Bearer (\S+)$/.exec(req.headers.authorization || "")?.[1];
        if (!token) return next();
        res.set("Cache-Control", "no-store");
        const claims = await isCurrent(token);
        if (!claims) return res.status(401).json({ ok: false, mensaje: "La sesión no está vigente. Inicia sesión nuevamente." });
        if ((claims.rol_id ?? claims.rol) === 5 && !/^\/dispensacion(?:\/|$)/i.test(req.path)) {
            return res.status(403).json({ ok: false, mensaje: "Acceso limitado a las entregas asignadas." });
        }
        return next();
    }

    function socket(namespace, { visitors = false } = {}) {
        namespace.use(async (connection, next) => {
            if (visitors && connection.handshake.auth?.visitorToken) return next();
            const current = async () => {
                const claims = await isCurrent(connection.handshake.auth?.token);
                return claims && (claims.rol_id ?? claims.rol) !== 5;
            };
            if (!await current()) return next(new Error("La sesión no está vigente."));
            connection.data.sessionCurrent = current;
            connection.use(async (_packet, proceed) => {
                if (await current()) return proceed();
                proceed(new Error("La sesión no está vigente."));
                connection.disconnect(true);
            });
            next();
        });
        namespace.on("connection", connection => {
            const current = connection.data.sessionCurrent;
            if (!current) return;
            let timer;
            let closed = false;
            async function check() {
                if (!await current()) connection.disconnect(true);
                else if (!closed) schedule();
            }
            function schedule() {
                timer = setTimeout(check, 5000);
                timer.unref?.();
            }
            connection.on("disconnect", () => { closed = true; clearTimeout(timer); });
            schedule();
        });
    }

    return { http, socket };
}

async function canReceive(socket) {
    if (!socket.data.sessionCurrent || await socket.data.sessionCurrent()) return true;
    socket.disconnect(true);
    return false;
}

module.exports = { createSessionAuthority, canReceive };
