const { createHash, randomUUID } = require("node:crypto");
const { fail, id, text } = require("../validators/administrative.validator");
const { moverStock, verificarSinMovimientosHistoricos } = require("../repositories/dispensacion-stock.repository");

const acciones = new Set(["AUTORIZAR", "CORREGIR", "RECHAZAR", "CANCELAR", "ASIGNAR", "PREPARAR",
    "ASIGNAR_VISITA", "REPROGRAMAR_VISITA", "INICIAR_VISITA", "AUTORIZAR_RECEPTOR",
    "FIRMAR", "RESULTADO_VISITA", "CONCILIAR_VISITA", "DISPENSAR"]);
const fallosVisita = new Set(["AUSENCIA", "RECHAZO", "DIRECCION_INCORRECTA", "DEVOLUCION"]);
const terminales = new Set(["ENTREGADA", "CANCELADA", "RECHAZADA"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const version = "BORRADOR-0.1";
const textos = {
    TRATAMIENTO: "Autorizo el uso de mis datos de identificación y contacto para coordinar y documentar esta visita de prueba.",
    RECEPCION: "Confirmo haber recibido los medicamentos y cantidades que figuran en esta constancia de prueba."
};

function campos(input, allowed) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some(key => !allowed.includes(key))) fail("Campos no permitidos.");
}

function cantidades(input) {
    campos(input, Object.keys(input || {}));
    const entries = Object.entries(input);
    if (!entries.length || entries.length > 100 ||
        entries.some(([key, n]) => !/^[1-9]\d{0,9}$/.test(key) || Number(key) > 2147483647 ||
            !Number.isSafeInteger(n) || n < 1 || n > 100000)) fail("Cantidades inválidas.");
    return Object.fromEntries(entries);
}

function normalizar(accion, input) {
    if (!acciones.has(accion)) fail("Acción no permitida.");
    switch (accion) {
        case "AUTORIZAR":
        case "CORREGIR": {
            campos(input, ["cantidades", "vence_at", "etapas"]);
            const expires = typeof input.vence_at === "string" ? new Date(input.vence_at) : null;
            if (!expires || !input.vence_at.endsWith("Z") || !Number.isFinite(expires.getTime())) fail("Vigencia inválida.");
            const total = cantidades(input.cantidades);
            if (input.etapas !== undefined && (!Array.isArray(input.etapas) || !input.etapas.length || input.etapas.length > 30)) {
                fail("Plan de etapas inválido.");
            }
            const etapas = input.etapas === undefined ? [total] : input.etapas.map(cantidades);
            const acumuladas = {};
            for (const etapa of etapas) for (const [key, n] of Object.entries(etapa)) acumuladas[key] = (acumuladas[key] || 0) + n;
            if (Object.keys(acumuladas).length !== Object.keys(total).length ||
                Object.entries(total).some(([key, n]) => acumuladas[key] !== n)) fail("El plan debe sumar las cantidades autorizadas.");
            return { cantidades: total, etapas, vence_at: expires.toISOString() };
        }
        case "RECHAZAR":
        case "CANCELAR":
            campos(input, ["motivo"]);
            return { motivo: text(input.motivo, "Motivo", 500) };
        case "REPROGRAMAR_VISITA":
            campos(input, ["motivo", "visita_id"]);
            return { motivo: text(input.motivo, "Motivo", 500), visita_id: claveVisita(input.visita_id) };
        case "CONCILIAR_VISITA":
            campos(input, ["referencia", "visita_id"]);
            return { referencia: text(input.referencia, "Referencia de verificación de entrega", 160), visita_id: claveVisita(input.visita_id) };
        case "ASIGNAR":
            campos(input, ["farmacia_id"]);
            return { farmacia_id: id(input.farmacia_id) };
        case "ASIGNAR_VISITA":
            campos(input, ["domiciliario_id"]);
            return { domiciliario_id: id(input.domiciliario_id) };
        case "AUTORIZAR_RECEPTOR":
            campos(input, ["visita_id", "receptor_id"]);
            return { visita_id: claveVisita(input.visita_id), receptor_id: id(input.receptor_id) };
        case "PREPARAR":
            campos(input, ["cantidades"]);
            return { cantidades: cantidades(input.cantidades) };
        case "FIRMAR":
            campos(input, ["version", "tratamiento", "recepcion", "visita_id"]);
            if (input.version !== version || input.tratamiento !== true || input.recepcion !== true) {
                fail("Debes confirmar ambos documentos de la versión vigente.");
            }
            return { version, tratamiento: true, recepcion: true, visita_id: claveVisita(input.visita_id) };
        case "INICIAR_VISITA":
            campos(input, ["visita_id"]);
            return { visita_id: claveVisita(input.visita_id) };
        case "RESULTADO_VISITA":
            campos(input, ["resultado", "visita_id"]);
            if (input.resultado !== "ENTREGADA" && !fallosVisita.has(input.resultado)) fail("Resultado de visita inválido.");
            return { resultado: input.resultado, visita_id: claveVisita(input.visita_id) };
        default:
            campos(input, []);
            return {};
    }
}

function claveVisita(value) {
    if (typeof value !== "string" || !uuid.test(value)) fail("Identificador de visita inválido.");
    return value.toLowerCase();
}

function createDispensacion(pool) {
    async function tx(run) {
        const db = await pool.connect();
        try {
            await db.query("BEGIN");
            const result = await run(db);
            await db.query("COMMIT");
            return result;
        } catch (error) {
            await db.query("ROLLBACK");
            throw error;
        } finally { db.release(); }
    }
    const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];

    async function actorVigente(db, actor) {
        const role = actor.rol_id ?? actor.rol;
        const account = await one(db, `SELECT id FROM usuarios WHERE id=$1 AND rol_id=$2
            AND estado='ACTIVO' AND session_version=$3 FOR SHARE`, [actor.id, role, actor.sv]);
        if (!account) fail("La sesión no está vigente.", 401);
        return role;
    }

    async function miembroIps(db, usuario) {
        return one(db, `SELECT a.* FROM ips_accesos a JOIN ips_entidades i ON i.id=a.ips_id
            WHERE a.usuario_id=$1 AND a.activo AND i.activa FOR SHARE OF a,i`, [usuario]);
    }

    async function miembroFarmacia(db, usuario) {
        return one(db, `SELECT p.* FROM farmacia_personal_dispensacion p JOIN usuarios f ON f.id=p.farmacia_id
            JOIN farmacia_personal_dispensacion r ON r.usuario_id=f.id AND r.perfil='RESPONSABLE' AND r.activo
            WHERE p.usuario_id=$1 AND p.activo AND f.estado='ACTIVO' AND f.rol_id=3 FOR SHARE OF p,f,r`, [usuario]);
    }

    async function habilitarFarmacia(actor, targetId, input) {
        campos(input, ["perfil", "activo"]);
        if (typeof input.activo !== "boolean" || !["RESPONSABLE", "OPERATIVO", "DOMICILIARIO"].includes(input.perfil)) fail("Habilitación inválida.");
        return tx(async db => {
            const role = await actorVigente(db, actor);
            if (actor.id === targetId) fail("No puedes modificar tu propia habilitación.", 403);
            const lead = role === 3 ? await miembroFarmacia(db, actor.id) : null;
            let scope;
            if (role === 1 && input.perfil === "RESPONSABLE") scope = targetId;
            else if (lead?.perfil === "RESPONSABLE" && input.perfil !== "RESPONSABLE") scope = lead.farmacia_id;
            else fail("No tienes permiso para esta habilitación.", 403);
            const target = await one(db, "SELECT * FROM usuarios WHERE id=$1 FOR UPDATE", [targetId]);
            const expected = input.perfil === "DOMICILIARIO" ? 5 : 3;
            if (!target || target.rol_id !== expected ||
                (input.activo && target.estado !== "ACTIVO" && !target.correo_verificado_at)) {
                fail("La cuenta no cumple los requisitos de habilitación.", 403);
            }
            const existing = await one(db, "SELECT * FROM farmacia_personal_dispensacion WHERE usuario_id=$1 FOR UPDATE", [targetId]);
            if (existing?.activo && (existing.farmacia_id !== scope || existing.perfil !== input.perfil)) {
                fail("La cuenta ya tiene una habilitación activa.", 409);
            }
            if (!input.activo && (!existing || existing.farmacia_id !== scope || existing.perfil !== input.perfil)) {
                fail("Habilitación no disponible.", 404);
            }
            await db.query(`INSERT INTO farmacia_personal_dispensacion (usuario_id,farmacia_id,perfil,activo)
                VALUES ($1,$2,$3,$4) ON CONFLICT(usuario_id)
                DO UPDATE SET farmacia_id=EXCLUDED.farmacia_id,perfil=EXCLUDED.perfil,activo=EXCLUDED.activo`,
                [targetId, scope, input.perfil, input.activo]);
            if (target.alta_diferenciada) await db.query(`UPDATE usuarios SET estado=CASE WHEN $2
                THEN 'ACTIVO'::"EstadoUsuario" ELSE 'INACTIVO'::"EstadoUsuario" END WHERE id=$1`, [targetId, input.activo]);
            await audit(db, actor.id, targetId, String(scope), input, null);
            return { usuario_id: targetId, farmacia_id: scope, perfil: input.perfil, activo: input.activo };
        });
    }

    async function audit(db, actor, target, scope, input, revision) {
        await db.query(`INSERT INTO dispensacion_habilitaciones (actor_id,usuario_id,ambito,permiso,activo,revision)
            VALUES ($1,$2,$3,$4,$5,$6)`, [actor, target, scope, input.perfil, input.activo, revision]);
    }

    async function configurarIps(actor, ipsId, input) {
        campos(input, ["nombre", "nit", "activa", "eps_id", "convenio_activo"]);
        const nombre = text(input.nombre, "Nombre", 150);
        const nit = text(input.nit, "NIT", 30);
        if (typeof input.activa !== "boolean" || (input.eps_id !== undefined && typeof input.convenio_activo !== "boolean") ||
            (input.eps_id === undefined && input.convenio_activo !== undefined)) fail("Configuración institucional inválida.");
        const eps = input.eps_id === undefined ? null : text(input.eps_id, "EPS", 80);
        return tx(async db => {
            if (await actorVigente(db, actor) !== 1) fail("Operación no autorizada.", 403);
            const institution = await one(db, `INSERT INTO ips_entidades (id,nombre,nit,activa) VALUES ($1,$2,$3,$4)
                ON CONFLICT(id) DO UPDATE SET nombre=EXCLUDED.nombre,nit=EXCLUDED.nit,activa=EXCLUDED.activa
                RETURNING id,nombre,activa`, [ipsId, nombre, nit, input.activa]);
            await audit(db, actor.id, actor.id, ipsId, { perfil: "INSTITUCION", activo: input.activa }, null);
            if (eps) {
                const exists = await one(db, "SELECT id FROM eps_entidades WHERE id=$1 AND activa FOR SHARE", [eps]);
                if (!exists) fail("Aseguradora no disponible.", 409);
                await db.query(`INSERT INTO ips_eps (ips_id,eps_id,activa) VALUES ($1,$2,$3)
                    ON CONFLICT(ips_id,eps_id) DO UPDATE SET activa=EXCLUDED.activa`, [ipsId, eps, input.convenio_activo]);
                await audit(db, actor.id, actor.id, ipsId, { perfil: "CONVENIO_EPS", activo: input.convenio_activo }, eps);
            }
            return institution;
        });
    }

    async function habilitarIps(actor, ipsId, targetId, input) {
        campos(input, ["perfil", "activo", "revision"]);
        if (!["RESPONSABLE", "OPERATIVO", "CLINICO"].includes(input.perfil) || typeof input.activo !== "boolean") {
            fail("Habilitación IPS inválida.");
        }
        const revision = input.perfil === "CLINICO" ? text(input.revision, "Referencia de revisión de credenciales", 160) : null;
        if (input.perfil !== "CLINICO" && input.revision !== undefined) fail("Referencia no aplicable.");
        return tx(async db => {
            const role = await actorVigente(db, actor);
            if (actor.id === targetId) fail("La habilitación requiere revisión de otra persona.", 403);
            const lead = role === 4 ? await miembroIps(db, actor.id) : null;
            if (!(role === 1 && input.perfil === "RESPONSABLE") &&
                !(lead?.responsable && lead.ips_id === ipsId && input.perfil !== "RESPONSABLE")) {
                fail("No tienes permiso para esta habilitación.", 403);
            }
            const institution = await one(db, "SELECT id FROM ips_entidades WHERE id=$1 AND activa FOR SHARE", [ipsId]);
            const target = await one(db, "SELECT * FROM usuarios WHERE id=$1 AND rol_id=4 FOR UPDATE", [targetId]);
            if (!institution || !target || (input.activo && target.estado !== "ACTIVO" && !target.correo_verificado_at)) {
                fail("Institución o cuenta no disponible.", 403);
            }
            const existing = await one(db, "SELECT * FROM ips_accesos WHERE usuario_id=$1 FOR UPDATE", [targetId]);
            if (existing?.activo && existing.ips_id !== ipsId) fail("La cuenta pertenece a otra IPS.", 409);
            if (input.perfil === "CLINICO") {
                if (!existing?.activo || existing.ips_id !== ipsId) fail("Se requiere membresía IPS activa.", 409);
                await db.query("UPDATE ips_accesos SET clinico=$2 WHERE usuario_id=$1", [targetId, input.activo]);
            } else {
                if (!input.activo && (!existing || existing.ips_id !== ipsId ||
                    existing.responsable !== (input.perfil === "RESPONSABLE"))) fail("Habilitación no disponible.", 404);
                if (input.activo && existing?.activo && existing.responsable !== (input.perfil === "RESPONSABLE")) {
                    fail("Revoca el perfil anterior antes de cambiarlo.", 409);
                }
                await db.query(`INSERT INTO ips_accesos (usuario_id,ips_id,activo,responsable)
                    VALUES ($1,$2,$3,$4) ON CONFLICT(usuario_id) DO UPDATE
                    SET ips_id=EXCLUDED.ips_id,activo=EXCLUDED.activo,responsable=EXCLUDED.responsable,
                        clinico=CASE WHEN ips_accesos.activo AND EXCLUDED.activo AND ips_accesos.ips_id=EXCLUDED.ips_id
                          THEN ips_accesos.clinico ELSE false END`,
                [targetId, ipsId, input.activo, input.perfil === "RESPONSABLE"]);
                if (target.alta_diferenciada) await db.query(`UPDATE usuarios SET estado=CASE WHEN $2
                    THEN 'ACTIVO'::"EstadoUsuario" ELSE 'INACTIVO'::"EstadoUsuario" END WHERE id=$1`, [targetId, input.activo]);
            }
            await audit(db, actor.id, targetId, ipsId, input, revision);
            return { usuario_id: targetId, ips_id: ipsId, perfil: input.perfil, activo: input.activo };
        });
    }

    function dentroDe(pedido, limite) {
        if (Object.entries(pedido).some(([key, n]) => n > (limite[key] || 0))) fail("La cantidad supera el saldo disponible.", 409);
    }

    function snapshot(order) {
        return {
            solicitud_id: order.solicitud_id, estado: order.estado, ips_id: order.ips_id,
            farmacia_id: order.farmacia_id, vence_at: order.vence_at, autorizadas: order.autorizadas,
            saldo: order.saldo, etapa: order.etapa_indice + 1, saldo_etapa: order.saldo_etapa,
            preparadas: order.preparadas, visita_id: order.visita_activa
        };
    }

    async function procesar(actor, pedidoId, accion, clave, input) {
        if (typeof clave !== "string" || !uuid.test(clave)) fail("Se requiere Idempotency-Key UUID.");
        const data = normalizar(accion, input);
        return tx(async db => {
            const role = await actorVigente(db, actor);
            const solicitud = await one(db, `SELECT id, usuario_id, tipo_entrega, direccion, estado
                FROM solicitudes WHERE id=$1 FOR UPDATE`, [pedidoId]);
            if (!solicitud) fail("Solicitud no disponible.", 404);
            let order = await one(db, "SELECT *, vence_at <= clock_timestamp() AS vencida FROM dispensaciones_etapas WHERE solicitud_id=$1", [pedidoId]);
            const member = role === 4 ? await miembroIps(db, actor.id) :
                [3, 5].includes(role) ? await miembroFarmacia(db, actor.id) : null;
            const area = order || {};
            const clinico = role === 4 && member?.clinico && (!order || order.ips_id === member.ips_id);
            const farmacia = role === 3 && !!member && member.farmacia_id === area.farmacia_id;
            const domicilio = role === 5 && member?.perfil === "DOMICILIARIO" && member.farmacia_id === area.farmacia_id;
            const paciente = role === 2 && solicitud.usuario_id === actor.id;
            const receptor = role === 2 && !paciente && accion === "FIRMAR" && await one(db,
                "SELECT 1 FROM dispensacion_receptores WHERE visita_id=$1 AND solicitud_id=$2 AND receptor_id=$3",
                [data.visita_id, pedidoId, actor.id]);
            const autorizado = ["AUTORIZAR", "CORREGIR", "RECHAZAR", "CANCELAR"].includes(accion) ? clinico :
                accion === "ASIGNAR" ? role === 1 :
                ["ASIGNAR_VISITA", "REPROGRAMAR_VISITA", "CONCILIAR_VISITA"].includes(accion) ? farmacia && member.perfil === "RESPONSABLE" :
                ["INICIAR_VISITA", "RESULTADO_VISITA"].includes(accion) ? domicilio :
                accion === "FIRMAR" ? paciente || receptor :
                accion === "AUTORIZAR_RECEPTOR" ? paciente :
                farmacia && ["RESPONSABLE", "OPERATIVO"].includes(member.perfil);
            if (!autorizado) fail("Operación no autorizada.", 403);

            const previous = await one(db, `SELECT resultado, actor_id=$3 AND accion=$4 AND entrada=$5::jsonb AS coincide
                FROM dispensacion_eventos WHERE solicitud_id=$1 AND clave=$2`, [pedidoId, clave, actor.id, accion, JSON.stringify(data)]);
            if (previous) {
                if (!previous.coincide) fail("La clave ya se usó con otra operación.", 409);
                return previous.resultado;
            }
            if (data.visita_id && data.visita_id !== order?.visita_activa) fail("La visita cambió.", 409);

            const estado = order?.estado;
            if (terminales.has(estado) || (order?.vencida && !["CANCELAR", "REPROGRAMAR_VISITA", "RESULTADO_VISITA"].includes(accion))) {
                fail("La solicitud está cerrada o vencida.", 409);
            }
            const exige = (...states) => {
                if (!states.includes(estado)) fail("La etapa solicitada no está disponible.", 409);
            };
            if (["AUTORIZAR", "CORREGIR", "RECHAZAR"].includes(accion)) {
                exige(accion === "CORREGIR" ? "AUTORIZADA" : undefined);
                if (!["PENDIENTE", "APROBADA"].includes(solicitud.estado)) fail("El pedido ya está en otro proceso.", 409);
                const legacy = await one(db, "SELECT 1 FROM farmacia_asignaciones WHERE solicitud_id=$1 AND activa", [pedidoId]);
                if (legacy) fail("El pedido ya tiene una asignación histórica activa.", 409);
                await verificarSinMovimientosHistoricos(db, pedidoId);
                const covered = await one(db, `SELECT 1 FROM afiliado_cuentas_origen a JOIN ips_eps c ON c.eps_id=a.eps_id
                    JOIN eps_entidades e ON e.id=c.eps_id
                    WHERE a.usuario_id=$1 AND c.ips_id=$2 AND c.activa AND e.activa FOR SHARE OF a,c,e`, [solicitud.usuario_id, member.ips_id]);
                if (!covered) fail("La solicitud está fuera del convenio vigente de la IPS.", 403);
                if (accion !== "RECHAZAR") {
                    const requested = await db.query(`SELECT medicamento_id, sum(cantidad)::int AS cantidad
                        FROM detalle_solicitud WHERE solicitud_id=$1 GROUP BY medicamento_id`, [pedidoId]);
                    dentroDe(data.cantidades, Object.fromEntries(requested.rows.map(row => [row.medicamento_id, row.cantidad])));
                }
                order = await one(db, `INSERT INTO dispensaciones_etapas (solicitud_id,ips_id,vence_at,estado,autorizadas,saldo,plan,saldo_etapa)
                    SELECT $1,$2,COALESCE($3::timestamptz,clock_timestamp()),$4,$5,$5,$6,$7
                    WHERE $3::timestamptz IS NULL OR $3::timestamptz > clock_timestamp()
                    ON CONFLICT (solicitud_id) DO UPDATE
                    SET vence_at=EXCLUDED.vence_at,autorizadas=EXCLUDED.autorizadas,saldo=EXCLUDED.saldo,
                        plan=EXCLUDED.plan,saldo_etapa=EXCLUDED.saldo_etapa
                    RETURNING *`,
                [pedidoId, member.ips_id, data.vence_at || null, accion === "RECHAZAR" ? "RECHAZADA" : "AUTORIZADA",
                    JSON.stringify(data.cantidades || {}), JSON.stringify(data.etapas || []), JSON.stringify(data.etapas?.[0] || {})]);
                if (!order) fail("La vigencia debe estar en el futuro.", 409);
            } else {
                const next = { ...order };
                const inventario = { order, actorId: actor.id, clave, accion };
                switch (accion) {
                    case "CANCELAR":
                        exige("AUTORIZADA", "ASIGNADA", "PREPARADA", "PARCIAL");
                        if (Object.keys(order.preparadas).length) await moverStock(db, inventario);
                        next.estado = "CANCELADA";
                        next.preparadas = {};
                        break;
                    case "ASIGNAR": {
                        exige("AUTORIZADA");
                        const lead = await miembroFarmacia(db, data.farmacia_id);
                        if (lead?.perfil !== "RESPONSABLE" || lead.farmacia_id !== data.farmacia_id) fail("Farmacia sin responsable vigente.", 409);
                        next.farmacia_id = data.farmacia_id;
                        next.estado = "ASIGNADA";
                        break;
                    }
                    case "PREPARAR":
                        exige("ASIGNADA", "PARCIAL", "PREPARADA");
                        dentroDe(data.cantidades, order.saldo);
                        dentroDe(data.cantidades, order.saldo_etapa);
                        await moverStock(db, { ...inventario, nuevas: data.cantidades });
                        next.preparadas = data.cantidades;
                        next.estado = "PREPARADA";
                        break;
                    case "ASIGNAR_VISITA": {
                        exige("PREPARADA");
                        if (solicitud.tipo_entrega !== "DOMICILIO" || !solicitud.direccion) fail("El pedido no permite visita.", 409);
                        const courier = await miembroFarmacia(db, data.domiciliario_id);
                        const account = await one(db, "SELECT id FROM usuarios WHERE id=$1 AND rol_id=5 AND estado='ACTIVO' FOR SHARE", [data.domiciliario_id]);
                        if (!account || courier?.perfil !== "DOMICILIARIO" || courier.farmacia_id !== order.farmacia_id) {
                            fail("Domiciliario fuera del ámbito asignado.", 403);
                        }
                        next.domiciliario_id = data.domiciliario_id;
                        next.visita_activa = randomUUID();
                        next.visita_iniciada = false;
                        next.estado = "EN_REPARTO";
                        break;
                    }
                    case "INICIAR_VISITA":
                        exige("EN_REPARTO");
                        if (order.domiciliario_id !== actor.id || order.visita_iniciada) fail("Visita no disponible.", 409);
                        next.visita_iniciada = true;
                        break;
                    case "REPROGRAMAR_VISITA":
                        exige("EN_REPARTO");
                        if (await one(db, "SELECT 1 FROM dispensacion_constancias WHERE visita_id=$1", [order.visita_activa])) {
                            fail("La visita ya tiene constancias; registra su resultado antes de reprogramar.", 409);
                        }
                        await moverStock(db, inventario);
                        next.estado = "ASIGNADA";
                        next.preparadas = {};
                        next.visita_activa = null;
                        next.domiciliario_id = null;
                        next.visita_iniciada = false;
                        break;
                    case "AUTORIZAR_RECEPTOR": {
                        exige("EN_REPARTO");
                        if (data.receptor_id === actor.id) fail("El paciente ya está habilitado para firmar.");
                        const target = await one(db, `SELECT id FROM usuarios WHERE id=$1 AND rol_id=2 AND estado='ACTIVO'
                            AND correo_verificado_at IS NOT NULL FOR SHARE`, [data.receptor_id]);
                        if (!target || await one(db, "SELECT 1 FROM dispensacion_constancias WHERE visita_id=$1", [order.visita_activa])) {
                            fail("Receptor no disponible para esta visita.", 409);
                        }
                        await db.query(`INSERT INTO dispensacion_receptores (visita_id,solicitud_id,otorgante_id,receptor_id)
                            VALUES ($1,$2,$3,$4) ON CONFLICT(visita_id) DO UPDATE
                            SET receptor_id=EXCLUDED.receptor_id,fecha=clock_timestamp()`,
                        [order.visita_activa, pedidoId, actor.id, data.receptor_id]);
                        break;
                    }
                    case "FIRMAR":
                        exige("EN_REPARTO");
                        if (!order.visita_iniciada) fail("La visita no ha iniciado.", 409);
                        await guardarConstancias(db, order, actor.id, paciente ? "PACIENTE" : "RECEPTOR_AUTORIZADO");
                        break;
                    case "CONCILIAR_VISITA":
                    case "RESULTADO_VISITA": {
                        exige("EN_REPARTO");
                        if (!order.visita_iniciada) fail("Visita no disponible.", 409);
                        const conciliacion = accion === "CONCILIAR_VISITA";
                        if (conciliacion) {
                            const courier = await miembroFarmacia(db, order.domiciliario_id);
                            const active = await one(db, "SELECT id FROM usuarios WHERE id=$1 AND rol_id=5 AND estado='ACTIVO' FOR SHARE",
                                [order.domiciliario_id]);
                            if (active && courier?.perfil === "DOMICILIARIO" && courier.farmacia_id === order.farmacia_id) {
                                fail("El domiciliario aún puede registrar el resultado.", 409);
                            }
                        } else if (order.domiciliario_id !== actor.id) fail("Visita no disponible.", 409);
                        const signed = await one(db, `SELECT count(*)::int AS cantidad FROM dispensacion_constancias
                            WHERE visita_id=$1`, [order.visita_activa]);
                        if (conciliacion || data.resultado === "ENTREGADA") {
                            if (order.vencida) fail("La autorización ya venció.", 409);
                            if (signed.cantidad !== 2) fail("Se requiere confirmación del paciente.", 409);
                            await moverStock(db, { ...inventario, entrega: true });
                            descontar(next);
                        } else {
                            if (signed.cantidad) fail("La visita tiene constancias y requiere conciliación.", 409);
                            await moverStock(db, inventario);
                            next.estado = "ASIGNADA";
                            next.preparadas = {};
                        }
                        next.domiciliario_id = null;
                        next.visita_activa = null;
                        next.visita_iniciada = false;
                        break;
                    }
                    case "DISPENSAR":
                        exige("PREPARADA");
                        if (solicitud.tipo_entrega !== "RECOGER") fail("El pedido requiere visita.", 409);
                        await moverStock(db, { ...inventario, entrega: true });
                        descontar(next);
                        break;
                }
                order = await one(db, `UPDATE dispensaciones_etapas SET estado=$2,farmacia_id=$3,saldo=$4,
                    preparadas=$5,domiciliario_id=$6,visita_activa=$7,visita_iniciada=$8,etapa_indice=$9,saldo_etapa=$10
                    WHERE solicitud_id=$1 RETURNING *`,
                [pedidoId, next.estado, next.farmacia_id, JSON.stringify(next.saldo), JSON.stringify(next.preparadas),
                    next.domiciliario_id, next.visita_activa, next.visita_iniciada, next.etapa_indice, JSON.stringify(next.saldo_etapa)]);
            }
            const result = role === 1 ? { solicitud_id: pedidoId, estado: order.estado, farmacia_id: order.farmacia_id } :
                role === 5 || receptor ? { solicitud_id: pedidoId, estado: order.estado, visita_id: order.visita_activa } : snapshot(order);
            await db.query(`INSERT INTO dispensacion_eventos (solicitud_id,clave,actor_id,accion,entrada,resultado)
                VALUES ($1,$2,$3,$4,$5,$6)`, [pedidoId, clave, actor.id, accion, JSON.stringify(data), JSON.stringify(result)]);
            return result;
        });
    }

    function descontar(next) {
        dentroDe(next.preparadas, next.saldo);
        dentroDe(next.preparadas, next.saldo_etapa);
        const saldo = { ...next.saldo };
        const saldoEtapa = { ...next.saldo_etapa };
        for (const [key, n] of Object.entries(next.preparadas)) {
            saldo[key] -= n;
            saldoEtapa[key] -= n;
        }
        next.saldo_etapa = saldoEtapa;
        next.saldo = saldo;
        next.estado = Object.values(saldo).some(n => n > 0) ? "PARCIAL" : "ENTREGADA";
        if (next.estado === "PARCIAL" && Object.values(saldoEtapa).every(n => n === 0)) {
            next.etapa_indice++;
            next.saldo_etapa = next.plan[next.etapa_indice];
        }
        next.preparadas = {};
    }

    async function guardarConstancias(db, order, actor, calidad) {
        for (const [tipo, texto] of Object.entries(textos)) {
            const documento = JSON.stringify({
                tipo, version, texto, visita_id: order.visita_activa, solicitud_id: order.solicitud_id,
                firmante_id: actor, calidad, metodo: "SESION_AUTENTICADA", declarado_at: new Date().toISOString(),
                ...(tipo === "RECEPCION" ? { cantidades: order.preparadas } : {})
            });
            const hash = createHash("sha256").update(documento).digest("hex");
            const result = await db.query(`INSERT INTO dispensacion_constancias
                (visita_id,tipo,solicitud_id,firmante_id,version,documento,sha256)
                VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING tipo`,
            [order.visita_activa, tipo, order.solicitud_id, actor, version, documento, hash]);
            if (!result.rows.length) fail("La visita ya tiene una constancia.", 409);
        }
    }

    async function misVisitas(actor) {
        return tx(async db => {
            if (await actorVigente(db, actor) !== 5) fail("Operación no autorizada.", 403);
            const member = await miembroFarmacia(db, actor.id);
            if (member?.perfil !== "DOMICILIARIO") fail("Membresía no vigente.", 403);
            const { rows } = await db.query(`SELECT d.solicitud_id, d.visita_activa AS visita_id,
                d.visita_iniciada AS iniciada, d.vence_at, s.direccion
                FROM dispensaciones_etapas d JOIN solicitudes s ON s.id=d.solicitud_id
                WHERE d.domiciliario_id=$1 AND d.farmacia_id=$2 AND d.estado='EN_REPARTO'
                ORDER BY d.solicitud_id LIMIT 100`, [actor.id, member.farmacia_id]);
            return rows;
        });
    }

    async function consultar(actor, pedidoId) {
        return tx(async db => {
            const role = await actorVigente(db, actor);
            const order = await one(db, `SELECT d.*,d.vence_at <= clock_timestamp() AS vencida,s.usuario_id
                FROM dispensaciones_etapas d JOIN solicitudes s ON s.id=d.solicitud_id
                WHERE d.solicitud_id=$1`, [pedidoId]);
            if (!order) fail("Solicitud no disponible.", 404);
            const ips = role === 4 ? await miembroIps(db, actor.id) : null;
            if (role === 1 || (ips?.ips_id === order.ips_id && !ips.clinico)) {
                return { solicitud_id: pedidoId, estado: order.estado, farmacia_id: order.farmacia_id, vencida: order.vencida };
            }
            const own = role === 2 && order.usuario_id === actor.id;
            const member = role === 3 && await miembroFarmacia(db, actor.id);
            if (!own && ips?.ips_id !== order.ips_id && (!member || member.farmacia_id !== order.farmacia_id)) {
                fail("Solicitud no disponible.", 404);
            }
            return { ...snapshot(order), vencida: order.vencida };
        });
    }

    async function documentos(actor, pedidoId, copia) {
        return tx(async db => {
            if (await actorVigente(db, actor) !== 2) fail("Operación no autorizada.", 403);
            const order = await one(db, `SELECT d.*,s.usuario_id=$2 AS titular
                FROM dispensaciones_etapas d JOIN solicitudes s ON s.id=d.solicitud_id
                WHERE d.solicitud_id=$1 AND (s.usuario_id=$2 OR EXISTS (
                    SELECT 1 FROM dispensacion_receptores r WHERE r.solicitud_id=d.solicitud_id AND r.receptor_id=$2
                    AND (r.visita_id=d.visita_activa OR EXISTS (
                        SELECT 1 FROM dispensacion_constancias c WHERE c.visita_id=r.visita_id AND c.firmante_id=$2
                    ))
                ))`, [pedidoId, actor.id]);
            if (!order) fail("Solicitud no disponible.", 404);
            if (copia) {
                const { rows } = await db.query(`SELECT tipo,version,documento,sha256,fecha
                    FROM dispensacion_constancias WHERE solicitud_id=$1 AND ($3 OR firmante_id=$2)
                    ORDER BY fecha,tipo LIMIT 200`, [pedidoId, actor.id, order.titular]);
                return rows;
            }
            if (order.estado !== "EN_REPARTO" || !order.visita_iniciada) fail("Visita no disponible.", 409);
            if (!order.titular && !await one(db, "SELECT 1 FROM dispensacion_receptores WHERE visita_id=$1 AND receptor_id=$2",
                [order.visita_activa, actor.id])) fail("Visita no disponible.", 404);
            return { version, textos, cantidades: order.preparadas, visita_id: order.visita_activa, titular: order.titular };
        });
    }

    return { configurarIps, habilitarFarmacia, habilitarIps, procesar, consultar, misVisitas, documentos };
}

module.exports = { createDispensacion };
