const { generarToken } = require("../utils/jwt");
const bcrypt = require("bcrypt");
const authRepository = require("../repositories/auth.repository");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

const enviarCorreoRecuperacion = async (correo, enlace) => {
    await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: correo,
        subject: "Recuperación de contraseña - SaludClick",
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
                <h2 style="color:#198754">SaludClick</h2>
                <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
                <p>Haz clic en el siguiente botón. El enlace será válido durante <strong>15 minutos</strong>.</p>
                <p><a href="${enlace}" style="display:inline-block;padding:12px 20px;background:#198754;color:white;text-decoration:none;border-radius:6px">Restablecer contraseña</a></p>
                <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
            </div>`
    });
};

const register = async (data) => {

    const existe = await authRepository.buscarPorCorreo(data.correo);

    if (existe) {
        throw new Error("El correo ya está registrado");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const usuario = {
        nombre: data.nombre,
        apellido: data.apellido,
        correo: data.correo,
        telefono: data.telefono,
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

const login = async (data) => {

    const usuario = await authRepository.login(data.correo);

    if (!usuario) {
        throw new Error("Correo o contraseña incorrectos");
    }

    const passwordCorrecta = await bcrypt.compare(
        data.password,
        usuario.password
    );

    if (!passwordCorrecta) {
        throw new Error("Correo o contraseña incorrectos");
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

const solicitarRecuperacion = async (correo) => {
    const usuario = await authRepository.buscarPorCorreo(correo.trim().toLowerCase());

    // Respuesta genérica en el controlador para no revelar si el correo existe.
    if (!usuario) return;

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiraEn = new Date(Date.now() + 15 * 60 * 1000);
    await authRepository.crearTokenRecuperacion(usuario.id, tokenHash, expiraEn);

    const baseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const enlace = `${baseUrl}/restablecer.html?token=${encodeURIComponent(token)}`;
    await enviarCorreoRecuperacion(usuario.correo, enlace);
};

const restablecerPassword = async (token, nuevaPassword) => {
    if (!token) throw new Error("El enlace de recuperación no es válido.");
    if (!nuevaPassword || nuevaPassword.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres.");
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const registro = await authRepository.buscarTokenRecuperacion(tokenHash);
    if (!registro) throw new Error("El enlace de recuperación es inválido o ya expiró.");

    const passwordHash = await bcrypt.hash(nuevaPassword, 10);
    await authRepository.actualizarPassword(registro.usuario_id, passwordHash, registro.token_id);
};

const profile = async () => {

    return {
        mensaje: "Pendiente"
    };

};

module.exports = {
    register,
    login,
    solicitarRecuperacion,
    restablecerPassword,
    profile
};