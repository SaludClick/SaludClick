const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obtenerCuentasAutorizadas}=require('../src/config/authorized-accounts');
test('maintenance allowlist fails closed when absent, invalid or duplicated',()=>{
    for(const env of [{},{AUTHORIZED_FARMACIA_EMAIL:'farmacia@example.com'},{AUTHORIZED_FARMACIA_EMAIL:'invalid',AUTHORIZED_EPS_EMAIL:'eps@example.com'},{AUTHORIZED_FARMACIA_EMAIL:'same@example.com',AUTHORIZED_EPS_EMAIL:'same@example.com'}]) {
        assert.throws(()=>obtenerCuentasAutorizadas(env),e=>e.code==='AUTHORIZED_ACCOUNTS_NOT_CONFIGURED');
    }
});
test('private allowlist normalizes email and preserves the two authorized roles',()=>{
    const env={AUTHORIZED_FARMACIA_EMAIL:' Farmacia@Example.COM ',AUTHORIZED_EPS_EMAIL:'eps@example.com'};
    const accounts=obtenerCuentasAutorizadas(env);
    assert.deepEqual(accounts,[{correo:'farmacia@example.com',rol_id:3},{correo:'eps@example.com',rol_id:4}]);
    assert.equal(Object.isFrozen(accounts),true);
    assert.equal(Object.isFrozen(accounts[0]),true);
    assert.equal(env.AUTHORIZED_FARMACIA_EMAIL,' Farmacia@Example.COM ');
});
