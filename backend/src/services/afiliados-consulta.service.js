const bcrypt = require('bcrypt');
const { CAMPOS } = require('./afiliados-import.service');
const fallo = (status,mensaje,codigo) => Object.assign(new Error(mensaje),{status,codigo});
function identidadCoincide(a,u) {
    return u.rol_id === 2 && u.cedula === a.documento && u.nombre === a.nombres && u.apellido === a.apellidos && u.tipo_documento === a.tipo_documento && u.correo === a.correo;
}
function crearServicio({ origen, prisma }) {
    const columnasCuenta = { id:true,cedula:true,nombre:true,apellido:true,tipo_documento:true,correo:true,rol_id:true,estado:true };
    async function cuentasPara(afiliados) {
        if (!afiliados.length) return [];
        return prisma.usuario.findMany({ where:{cedula:{in:afiliados.map(a=>a.documento)}},select:columnasCuenta });
    }
    function vincular(a,cuentas) {
        const u = cuentas.find(u=>u.cedula===a.documento);
        return { ...a,usuario:u && identidadCoincide(a,u) ? {id:u.id,estado:u.estado} : null,cuenta_conflicto:Boolean(u && !identidadCoincide(a,u)) };
    }
    async function buscar(id) {
        if (typeof id !== 'string' || !id || id.length > 150) throw fallo(400,'Identificador de afiliado inválido.');
        const snapshot = await origen.leer();
        const a = snapshot.afiliados.find(a=>a.id===id);
        if (!a) throw fallo(404,'Afiliado no encontrado en la fuente original.');
        return a;
    }
    async function condiciones(a,tx=prisma) {
        if (a.usuario) return {permitido:false,motivo:'Este afiliado ya tiene una cuenta vinculada.'};
        if (a.cuenta_conflicto) return {permitido:false,motivo:'El documento está asociado a una cuenta con datos distintos. Requiere revisión administrativa.'};
        let autorizado;
        try { autorizado = await tx.pacienteAutorizado.findUnique({where:{cedula:a.documento}}); }
        catch(e) { if(e.code==='P2021'||e.code==='P2022')return {permitido:false,motivo:'El registro de autorizaciones de la aplicación no está disponible. La consulta de afiliados permanece en solo lectura.'}; throw e; }
        if (!autorizado || autorizado.estado!=='AUTORIZADO' || ['nombres','apellidos','tipo_documento'].some(c=>autorizado[c]!==a[c])) return {permitido:false,motivo:'Para crear cuenta se requiere autorización vigente con los mismos datos de identidad.'};
        const rol = await tx.rol.findUnique({where:{id:2},select:{id:true,nombre:true}});
        if (!rol || rol.nombre!=='PACIENTE') return {permitido:false,motivo:'El rol 2 de la aplicación debe estar configurado como PACIENTE. No se modificará automáticamente.'};
        const limites = {nombres:100,apellidos:100,correo:150,documento:30,telefono:20,tipo_documento:10,ciudad:100};
        if (Object.entries(limites).some(([c,n])=>typeof a[c]!=='string'||a[c].length>n) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.correo)) return {permitido:false,motivo:'Los datos originales requieren revisión antes de crear una cuenta compatible.'};
        const duplicado = await tx.usuario.findFirst({where:{OR:[{cedula:a.documento},{correo:{equals:a.correo,mode:'insensitive'}}]},select:{id:true}});
        if (duplicado) return {permitido:false,motivo:'Ya existe una cuenta con ese documento o correo.'};
        return {permitido:true,motivo:''};
    }
    async function listar(query={}) {
        let pagina=Number(query.pagina??1);
        const {buscar='',eps='',estado='',cuenta=''}=query;
        if (!Number.isSafeInteger(pagina)||pagina<1||pagina>1000000||[buscar,eps,estado,cuenta].some(v=>typeof v!=='string'||v.length>150)||!['','SIN_CUENTA','ACTIVO','INACTIVO'].includes(cuenta)) throw fallo(400,'Consulta inválida.');
        const {afiliados}=await origen.leer();
        const cuentas=await cuentasPara(afiliados);
        const todos=afiliados.map(a=>vincular(a,cuentas));
        const palabras=buscar.trim().toLocaleLowerCase('es').split(/\s+/u).filter(Boolean);
        const filtrados=todos.filter(a=>palabras.every(p=>['nombres','apellidos','documento','correo'].some(c=>String(a[c]??'').toLocaleLowerCase('es').includes(p)))&&(!eps||a.eps_id===eps)&&(!estado||a.estado===estado)&&(!cuenta||(cuenta==='SIN_CUENTA'?!a.usuario&&!a.cuenta_conflicto:a.usuario?.estado===cuenta))).sort((a,b)=>String(a.apellidos).localeCompare(String(b.apellidos),'es')||String(a.nombres).localeCompare(String(b.nombres),'es')||a.id.localeCompare(b.id));
        pagina=Math.min(pagina,Math.max(1,Math.ceil(filtrados.length/10)));
        const epsOriginales=[...new Set(afiliados.map(a=>a.eps_id))].sort();
        return {total:todos.length,coincidencias:filtrados.length,pagina,afiliados:filtrados.slice((pagina-1)*10,pagina*10),filtros:{eps:epsOriginales,estados:[...new Set(afiliados.map(a=>a.estado))].sort(),epsConfirmadas:epsOriginales.flatMap(id=>{const a=afiliados.find(a=>a.eps_id===id&&a.eps);return a?[a.eps]:[];})}};
    }
    async function detalle(id) {
        const original=await buscar(id),a=vincular(original,await cuentasPara([original]));
        const permiso=await condiciones(a);
        return {afiliado:a,puedeCrearCuenta:permiso.permitido,motivoCuenta:permiso.motivo};
    }
    async function crearCuenta(id,body,administrador) {
        const {verificado,password}=body||{};
        if(verificado!==true||typeof password!=='string'||password.length<8||Buffer.byteLength(password)>72||!Number.isSafeInteger(administrador)||administrador<1) throw fallo(400,'Verifica los datos, tu sesión administrativa y una contraseña de 8 caracteres como mínimo y 72 bytes como máximo.');
        const original=await buscar(id),hash=await bcrypt.hash(password,12);
        return prisma.$transaction(async tx=>{
            const a=vincular(original,await tx.usuario.findMany({where:{cedula:original.documento},select:columnasCuenta}));
            const permiso=await condiciones(a,tx);
            if(!permiso.permitido)throw fallo(a.usuario||a.cuenta_conflicto||permiso.motivo.startsWith('Ya existe')?409:403,permiso.motivo);
            const cuenta=await tx.usuario.create({data:{nombre:a.nombres,apellido:a.apellidos,correo:a.correo,cedula:a.documento,telefono:a.telefono,tipo_documento:a.tipo_documento,ciudad:a.ciudad,password:hash,rol_id:2,estado:'ACTIVO'},select:{id:true,estado:true}});
            // Comprobar de nuevo la identidad original antes de confirmar la cuenta.
            const actual=await buscar(id);
            if(CAMPOS.some(c=>actual[c]!==original[c]))throw fallo(409,'La fuente original cambió durante la revisión. Consulta de nuevo la ficha.');
            return cuenta;
        },{isolationLevel:'Serializable',timeout:20000});
    }
    return {listar,detalle,crearCuenta,diagnosticar:async()=>({conexion:(await origen.leer()).conexion})};
}
let servicio;
function obtenerServicio(){return servicio??=crearServicio({origen:require('../repositories/afiliados-origen.repository'),prisma:require('../config/prisma')});}
module.exports={crearServicio,obtenerServicio,identidadCoincide};
