const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('backend bootstrap starts HTTP and both socket channels on an ephemeral port without real PostgreSQL',()=>{
    const source=`
      require('./tests/support/isolate-database.cjs');
      let reads=0;
      const pool={query:async sql=>{if(!/^SELECT (?:1|NOW\(\))/.test(sql))throw new Error('Unexpected database access');reads++;return {rows:[{ok:1,fecha:new Date()}]};},end:async()=>{}};
      require.cache[require.resolve('./src/config/database')].exports=pool;
      require.cache[require.resolve('./src/config/prisma')].exports={$connect:async()=>{},$disconnect:async()=>{}};
      process.env.PORT='0';
      const {httpServer,io}=require('./server');
      httpServer.once('listening',async()=>{
        try{
          const response=await fetch('http://127.0.0.1:'+httpServer.address().port+'/api/health');
          const data=await response.json();
          if(response.status!==200||!data.ok||!io._nsps.has('/administrativo')||!io._nsps.has('/'))throw new Error('Bootstrap contract failed');
          console.log('STARTUP_VERIFIED '+JSON.stringify({http:response.status,channels:2,reads}));
        }catch{process.exitCode=1;}
        finally{io.close();}
      });
    `;
    const result=spawnSync(process.execPath,['-e',source],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:10000});
    assert.equal(result.status,0,'The isolated backend must start and stop without altering existing servers.');
    assert.match(result.stdout,/STARTUP_VERIFIED /);
});
