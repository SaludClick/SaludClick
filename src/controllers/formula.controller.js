const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const repo = require("../repositories/formula.repository");

const UPLOAD_DIR = path.join(__dirname, "../../private_uploads");
const ALLOWED = new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
const MAX = 5 * 1024 * 1024;

function parseBase64(input) {
    const match = String(input||"").match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error("El archivo enviado no tiene un formato válido.");
    const mime = match[1].toLowerCase();
    if (!ALLOWED.has(mime)) throw new Error("Solo se permiten PDF, JPG, PNG o WEBP.");
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > MAX) throw new Error("La fórmula debe pesar máximo 5 MB.");
    const validMagic =
        (mime === "application/pdf" && buffer.subarray(0,4).toString() === "%PDF") ||
        (mime === "image/png" && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
        (mime === "image/jpeg" && buffer.subarray(0,3).equals(Buffer.from([255,216,255]))) ||
        (mime === "image/webp" && buffer.subarray(0,4).toString() === "RIFF" && buffer.subarray(8,12).toString() === "WEBP");
    if (!validMagic) throw new Error("El contenido del archivo no coincide con su formato declarado.");
    return { mime, buffer };
}

async function crear(req,res) {
    try {
        const { nombre, descripcion, archivo } = req.body || {};
        if (!nombre || !archivo) return res.status(400).json({ok:false,mensaje:"Nombre y archivo son obligatorios."});
        const {mime,buffer}=parseBase64(archivo);
        await fs.mkdir(UPLOAD_DIR,{recursive:true});
        const ext = mime==="application/pdf"?".pdf":mime==="image/png"?".png":mime==="image/webp"?".webp":".jpg";
        const stored = `${crypto.randomUUID()}${ext}`;
        await fs.writeFile(path.join(UPLOAD_DIR,stored),buffer,{flag:"wx"});
        const id=await repo.crear({usuarioId:req.usuario.id,nombreArchivo:stored,nombreOriginal:String(nombre).slice(0,180),tipoMime:mime,tamano:buffer.length,descripcion});
        res.status(201).json({ok:true,mensaje:"Fórmula cargada correctamente.",formula:{id,nombre:String(nombre).slice(0,180),estado:"PENDIENTE"}});
    } catch(e) { console.error(e); res.status(400).json({ok:false,mensaje:e.message}); }
}
async function listar(req,res){ try{res.json({ok:true,formulas:await repo.listarUsuario(req.usuario.id)});}catch(e){res.status(500).json({ok:false,mensaje:"No se pudieron cargar tus fórmulas."});}}
async function ver(req,res){
    try{
        const id=Number(req.params.id); if(!Number.isInteger(id)||id<1)return res.status(400).json({ok:false,mensaje:"Fórmula inválida."});
        const f=await repo.buscarPropia(req.usuario.id,id); if(!f)return res.status(404).json({ok:false,mensaje:"Fórmula no encontrada."});
        const file=path.join(UPLOAD_DIR,f.nombre_archivo); await fs.access(file);
        res.setHeader("Content-Type",f.tipo_mime); res.setHeader("Content-Disposition",`inline; filename="${String(f.nombre_original).replace(/["\r\n]/g,"_")}"`);
        res.sendFile(file);
    }catch(e){res.status(404).json({ok:false,mensaje:"No se pudo abrir la fórmula."});}
}
async function adminList(req,res){try{res.json({ok:true,formulas:await repo.listarAdmin()});}catch(e){res.status(500).json({ok:false,mensaje:"No se pudieron cargar las fórmulas."});}}
async function adminEstado(req,res){try{const estado=String(req.body.estado||"");if(!["PENDIENTE","VALIDADA","RECHAZADA"].includes(estado))throw new Error("Estado inválido.");await repo.actualizarEstado(Number(req.params.id),estado);res.json({ok:true,mensaje:"Estado actualizado."});}catch(e){res.status(400).json({ok:false,mensaje:e.message});}}
module.exports={crear,listar,ver,adminList,adminEstado};
