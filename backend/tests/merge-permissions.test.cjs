require('./support/isolate-database.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const jwt=require('jsonwebtoken');
const app=require('../src/app');
test('merged gateway denies administrator clinical reads and writes before any database access',async()=>{
    const previous=process.env.JWT_SECRET;
    process.env.JWT_SECRET='merge-permissions-test-only';
    const server=http.createServer(app);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
        const token=jwt.sign({id:10,rol:1},process.env.JWT_SECRET,{expiresIn:'1m'});
        for(const [method,path] of [
            ['GET','/api/citas'],['POST','/api/citas'],
            ['GET','/api/medicamentos'],['POST','/api/medicamentos'],
            ['GET','/api/formulas/admin/all'],['PATCH','/api/formulas/admin/1'],
            ['GET','/api/pedidos'],['POST','/api/pedidos'],
            ['GET','/api/farmacia/inventario'],['GET','/api/farmacia/pedidos'],
            ['PATCH','/api/farmacia/pedidos/1/estado']
        ]) {
            const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{Authorization:`Bearer ${token}`}});
            assert.equal(response.status,403,`${method} ${path}`);
            assert.equal((await response.json()).ok,false);
        }
    } finally {
        await new Promise(resolve=>server.close(resolve));
        if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;
    }
});
