const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

const apiKey = process.env.RESEND_API_KEY?.trim();
const sender = process.env.RESEND_FROM?.trim();
const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/u;
const senderMail = sender?.match(/^[^<>\r\n]+<([^<>]+)>$/u)?.[1] ?? sender;
const checks = [
    ["Clave de envío", /^re_[A-Za-z0-9_-]+$/.test(apiKey || "")],
    ["Remitente", email.test(senderMail || "")]
];
for (const [label, valid] of checks) console.log(`${label}: ${valid ? "configurada" : "pendiente o inválida"}`);
if (checks.some(([, valid]) => !valid)) process.exitCode = 1;
else console.log("Configuración local válida. El dominio y la entrega requieren verificación en Resend.");
