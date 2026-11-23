const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '../../private_uploads');
const extensions = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
};

async function archivoPrivado(formula) {
    const name = formula.nombre_archivo;
    if (typeof name !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.(pdf|png|jpg|webp)$/i.test(name)
        || path.extname(name).toLowerCase() !== extensions[formula.tipo_mime]) return null;
    try {
        const directory = await fs.realpath(root);
        const file = await fs.realpath(path.join(directory, name));
        if (path.dirname(file) !== directory || !(await fs.stat(file)).isFile()) return null;
        return file;
    } catch (error) {
        if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) return null;
        throw error;
    }
}

async function formulasDisponibles(formulas) {
    const results = await Promise.all(formulas.map(async ({ nombre_archivo, ...formula }) =>
        await archivoPrivado({ nombre_archivo, tipo_mime: formula.tipo_mime }) ? formula : null));
    return results.filter(Boolean);
}

module.exports = { archivoPrivado, formulasDisponibles };
