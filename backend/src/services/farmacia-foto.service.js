const { randomUUID } = require('node:crypto');
const { fallo } = require('../config/farmacia-operacion');

const MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_PATH = '/api/medicamentos/fotos/';
const PHOTO_NAME = /^([1-9]\d{0,9})-[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.webp$/;
const invalid = () => fallo(400, 'FOTO_MEDICAMENTO_INVALIDA', 'Selecciona una fotografía JPG, PNG o WebP válida de hasta 4 MB.');

function formato(bytes) {
    if (bytes.subarray(0, 3).toString('hex') === 'ffd8ff') return 'jpeg';
    if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'png';
    if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'webp';
    return null;
}

async function normalizar(value) {
    if (typeof value !== 'string' || value.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw invalid();
    const bytes = Buffer.from(value, 'base64');
    const type = formato(bytes);
    if (!type || bytes.length > MAX_BYTES || bytes.toString('base64') !== value) throw invalid();

    const sharp = require('sharp');
    try {
        const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 16_000_000 });
        const metadata = await image.metadata();
        if (metadata.format !== type || (metadata.pages ?? 1) !== 1) throw invalid();
        return await image.rotate()
            .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
    } catch {
        throw invalid();
    }
}

function identificar(name) {
    const match = PHOTO_NAME.exec(name);
    if (!match || Number(match[1]) > 4294967295) return null;
    return { oid: match[1], url: PHOTO_PATH + name };
}

async function guardar(connection, bytes) {
    const { rows: [{ oid }] } = await connection.query('SELECT lo_from_bytea(0, $1::bytea) AS oid', [bytes]);
    return PHOTO_PATH + oid + '-' + randomUUID() + '.webp';
}

async function retirarReemplazada(connection, url) {
    if (!url?.startsWith(PHOTO_PATH)) return;
    const photo = identificar(url.slice(PHOTO_PATH.length));
    if (!photo) return;
    await connection.query(`SELECT lo_unlink(oid) FROM pg_largeobject_metadata WHERE oid=$1::oid
        AND NOT EXISTS (SELECT 1 FROM medicamentos WHERE imagen=$2)`, [photo.oid, url]);
}

module.exports = { normalizar, identificar, guardar, retirarReemplazada };
