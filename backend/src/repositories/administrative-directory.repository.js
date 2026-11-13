// Projection only. No credentials, writes, account provisioning or EPS copies.
function createDirectoryRepository(prisma){
    return {read:()=>prisma.$transaction(async tx=>{
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return tx.$queryRawUnsafe('SELECT id,nombre,apellido,correo,cedula,tipo_documento,telefono,ciudad,rol_id,estado,created_at FROM usuarios ORDER BY id');
    },{isolationLevel:'RepeatableRead',timeout:20000})};
}
module.exports={createDirectoryRepository};
