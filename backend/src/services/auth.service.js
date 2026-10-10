const { generarToken } = require("../utils/jwt");
const bcrypt = require("bcrypt");
const authRepository = require("../repositories/auth.repository");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");
const { normalizarCorreo, validarRegistro, validarRestablecimiento } = require("../validators/auth.validator");

// ==========================================
// GOOGLE AUTH
// ==========================================

const googleClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID
);

// ==========================================
// CONFIGURACIÓN DE CORREO
// ==========================================

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

// ==========================================
// ENVIAR CORREO DE RECUPERACIÓN
// ==========================================

const enviarCorreoRecuperacion = async (correo, enlace) => {

    await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: correo,
        subject: "Recuperación de contraseña - SaludClick",
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
                <h2 style="color:#198754">SaludClick</h2>

                <p>
                    Recibimos una solicitud para restablecer
                    la contraseña de tu cuenta.
                </p>

                <p>
                    Haz clic en el siguiente botón.
                    El enlace será válido durante
                    <strong>15 minutos</strong>.
                </p>

                <p>
                    <a
                        href="${enlace}"
                        style="
                            display:inline-block;
                            padding:12px 20px;
                            background:#198754;
                            color:white;
                            text-decoration:none;
                            border-radius:6px;
                        "
                    >
                        Restablecer contraseña
                    </a>
                </p>

                <p>
                    Si no solicitaste este cambio,
                    puedes ignorar este correo.
                </p>
            </div>
        `
    });

};

// ==========================================
// REGISTRO NORMAL
// ==========================================

const register = async (data) => {

    const correo = normalizarCorreo(data.correo);

    const existe = await authRepository.buscarPorCorreo(correo);

    if (existe) {
        throw new Error("El correo ya está registrado");
    }

    validarRegistro(data);

    const passwordHash = await bcrypt.hash(
        data.password,
        10
    );

    const usuario = {
        nombre: String(data.nombre || "").trim(),
        apellido: String(data.apellido || "").trim(),
        correo,
        telefono: data.telefono || null,
        tipoDocumento: data.tipoDocumento || null,
        numeroDocumento: String(data.numeroDocumento || "").trim(),
        password: passwordHash,
        rol_id: 2
    };

    const id = await authRepository.register(usuario);

    return {
        ok: true,
        mensaje: "Usuario registrado correctamente",
        id
    };

};

// ==========================================
// LOGIN NORMAL
// ==========================================

const login = async (data) => {

    const correo = normalizarCorreo(data.correo);

    const usuario = await authRepository.login(correo);

    if (!usuario) {
        throw new Error(
            "Correo o contraseña incorrectos"
        );
    }

    const passwordCorrecta = await bcrypt.compare(
        data.password,
        usuario.password
    );

    if (!passwordCorrecta) {
        throw new Error(
            "Correo o contraseña incorrectos"
        );
    }

    if (usuario.estado === "INACTIVO") {
        throw new Error(
            "La cuenta se encuentra inactiva"
        );
    }

    const token = generarToken(usuario);

    return {
        ok: true,
        mensaje: "Inicio de sesión correcto",
        token,
        usuario: {
            id: usuario.id,
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            correo: usuario.correo,
            rol: usuario.rol_id
        }
    };

};

// ==========================================
// LOGIN CON GOOGLE
// ==========================================

const googleLogin = async (idToken) => {

    if (!idToken) {
        throw new Error(
            "Token de Google requerido"
        );
    }

    // Verificar que el token realmente
    // haya sido emitido para SaludClick.
    const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
        throw new Error(
            "No se pudo obtener el correo de Google"
        );
    }

    if (!payload.email_verified) {
        throw new Error(
            "El correo de Google no está verificado"
        );
    }

    const correo = payload.email
        .trim()
        .toLowerCase();

    // Buscar usuario existente.
    let usuario =
        await authRepository.buscarPorCorreo(correo);

    // ======================================
    // SI NO EXISTE, CREARLO
    // ======================================

    if (!usuario) {

        const nombreCompleto =
            String(payload.name || "Usuario").trim();

        const partes =
            nombreCompleto.split(/\s+/);

        const nombre =
            payload.given_name ||
            partes[0] ||
            "Usuario";

        const apellido =
            payload.family_name ||
            partes.slice(1).join(" ") ||
            "Google";

        /*
         * La columna password de SaludClick
         * es NOT NULL.
         *
         * Creamos una contraseña interna
         * aleatoria que el usuario de Google
         * no necesita conocer.
         */
        const passwordAleatoria =
            crypto.randomBytes(32).toString("hex");

        const passwordHash =
            await bcrypt.hash(
                passwordAleatoria,
                10
            );

        const nuevoUsuario = {
            nombre,
            apellido,
            correo,
            telefono: null,
            tipoDocumento: "GOOGLE",
            numeroDocumento: `GOOGLE-${crypto.randomBytes(6).toString("hex")}` ,
            password: passwordHash,

            // Rol predeterminado.
            rol_id: 2
        };

        await authRepository.register(
            nuevoUsuario
        );

        // Recuperar usuario recién creado
        // para generar el JWT.
        usuario =
            await authRepository.buscarPorCorreo(
                correo
            );
    }

    if (!usuario) {
        throw new Error(
            "No se pudo crear o encontrar el usuario"
        );
    }

    if (usuario.estado === "INACTIVO") {
        throw new Error(
            "La cuenta se encuentra inactiva"
        );
    }

    // Crear el JWT propio de SaludClick.
    const token = generarToken(usuario);

    return {
        ok: true,
        mensaje:
            "Inicio de sesión con Google correcto",

        token,

        usuario: {
            id: usuario.id,
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            correo: usuario.correo,
            rol: usuario.rol_id
        }
    };

};

// ==========================================
// SOLICITAR RECUPERACIÓN DE CONTRASEÑA
// ==========================================

const solicitarRecuperacion = async (correo) => {

    correo = String(correo || "")
        .trim()
        .toLowerCase();

    const usuario =
        await authRepository.buscarPorCorreo(
            correo
        );

    /*
     * El controlador devuelve una respuesta
     * genérica para no revelar si el correo
     * está registrado.
     */
    if (!usuario) {
        return;
    }

    const token =
        crypto.randomBytes(32).toString("hex");

    const tokenHash =
        crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

    const expiraEn =
        new Date(
            Date.now() + 15 * 60 * 1000
        );

    await authRepository.crearTokenRecuperacion(
        usuario.id,
        tokenHash,
        expiraEn
    );

    const baseUrl =
        (
            process.env.FRONTEND_URL ||
            "http://localhost:3000"
        ).replace(/\/$/, "");

    const enlace =
        `${baseUrl}/restablecer.html?token=${
            encodeURIComponent(token)
        }`;

    await enviarCorreoRecuperacion(
        usuario.correo,
        enlace
    );

};

// ==========================================
// RESTABLECER CONTRASEÑA
// ==========================================

const restablecerPassword = async (
    token,
    nuevaPassword
) => {

    validarRestablecimiento(token, nuevaPassword);

    const tokenHash =
        crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

    const registro =
        await authRepository.buscarTokenRecuperacion(
            tokenHash
        );

    if (!registro) {
        throw new Error(
            "El enlace de recuperación es inválido o ya expiró."
        );
    }

    const passwordHash =
        await bcrypt.hash(
            nuevaPassword,
            10
        );

    await authRepository.actualizarPassword(
        registro.usuario_id,
        passwordHash,
        registro.token_id
    );

};

// ==========================================
// PERFIL
// ==========================================

const updateProfile = async (usuarioId, data) => {
    return authRepository.actualizarPerfil(usuarioId, data);
};

const profile = async (usuarioId) => {
    const usuario = await authRepository.buscarPerfil(usuarioId);
    if (!usuario) throw new Error("Usuario no encontrado.");
    return usuario;
};

// ==========================================
// EXPORTACIONES
// ==========================================

module.exports = {
    register,
    login,
    googleLogin,
    solicitarRecuperacion,
    restablecerPassword,
    profile,
    updateProfile
};
