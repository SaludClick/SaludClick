// Referencias de identidad; no crea pacientes ni infiere equivalencias por nombre.
function clave(tipo,documento){
    if(typeof tipo!=='string'||typeof documento!=='string'||!documento||documento.length>30||documento!==documento.trim()||/[\x00-\x1f\x7f]/.test(documento))return null;
    const t=tipo.trim().toUpperCase();if(!/^[A-Z]{1,10}$/.test(t))return null;
    return JSON.stringify([t,documento]);
}
function autorizados(pacientes,cuentas){
    const sourceKeys=new Map(),accountKeys=new Map(),ids=new Map(),byId=new Map();
    for(const p of pacientes){const k=clave(p.tipo_documento,p.documento);if(k)sourceKeys.set(k,(sourceKeys.get(k)||0)+1);ids.set(p.identificador,(ids.get(p.identificador)||0)+1);}
    for(const a of cuentas){const k=clave(a.tipo_documento,a.cedula);if(k)accountKeys.set(k,(accountKeys.get(k)||0)+1);byId.set(a.afiliado_id,byId.has(a.afiliado_id)?null:k);}
    return pacientes.filter(p=>{const k=clave(p.tipo_documento,p.documento);return k&&sourceKeys.get(k)===1&&accountKeys.get(k)===1&&ids.get(p.identificador)===1&&byId.get(p.identificador)===k;}).map(p=>p.identificador);
}
module.exports={clave,autorizados};
