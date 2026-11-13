const {test}=require('node:test');
const assert=require('node:assert/strict');
const {activate,validateCandidate}=require('../scripts/activate-admin-access.cjs');
// Synthetic hash for format checks only, never a persisted credential.
const account={id:1,rol_id:1,estado:null,password:'$2b$12$'+'.'.repeat(53),correo:'fixture@example.test',nombre:'Fixture',updated_at:'2026-11-12T00:00:00'};
function fixture({count=1,extra={},otherChanged=false}={}){
  const calls=[];let fingerprints=0;
  return {calls,async query(sql,args){calls.push({sql,args});
    if(sql.startsWith('SELECT id FROM usuarios'))return {rows:[{id:1}]};
    if(sql.startsWith('SELECT to_jsonb'))return {rows:[{account,role:'admin'}]};
    if(sql.startsWith('SELECT md5'))return {rows:[{value:otherChanged&&fingerprints++?'different':'same'}]};
    if(sql.startsWith('UPDATE usuarios'))return {rowCount:count,rows:count?[{account:{...account,estado:'ACTIVO',...extra}}]:[]};
    return {rows:[]};
  }};
}
test('activation changes only estado with exact ID, role and previous-state conditions',async()=>{
  const db=fixture();let verified=false;
  const result=await activate(db,{verify:async()=>{verified=true;return {passed:true};}});
  assert.equal(result.registrosActualizados,1);assert.ok(verified);
  const update=db.calls.find(c=>c.sql.startsWith('UPDATE usuarios'));
  assert.deepEqual(update.args,['ACTIVO',1,1]);
  assert.match(update.sql,/SET estado=\$1.*WHERE id=\$2 AND rol_id=\$3 AND estado IS NULL/);
  assert.doesNotMatch(update.sql,/SET.*password=/);
  assert.equal(db.calls.at(-1).sql,'COMMIT');
  const audit=db.calls.find(c=>c.sql.startsWith('INSERT INTO administrative_audit'));
  assert.deepEqual(audit.args[4],['estado']);
});
test('critical access failure, wrong row count, extra changed fields or other-account changes roll back',async()=>{
  for(const options of [{count:0},{count:2},{extra:{updated_at:'changed'}},{otherChanged:true}]){
    const db=fixture(options);await assert.rejects(activate(db));
    assert.equal(db.calls.at(-1).sql,'ROLLBACK');assert.ok(!db.calls.some(c=>c.sql==='COMMIT'));
  }
  const db=fixture();await assert.rejects(activate(db,{verify:async()=>{throw new Error('CRITICAL_PERMISSION_FAILURE');}}));
  assert.equal(db.calls.at(-1).sql,'ROLLBACK');
});
test('ambiguous identity, incorrect role/state, ID mismatch or unsafe hash stop before changes',()=>{
  assert.throws(()=>validateCandidate([{account,role:'admin'}],[{id:1},{id:9}]));
  for(const change of [{id:9},{rol_id:4},{estado:'ACTIVO'},{password:'invalid'}])assert.throws(()=>validateCandidate([{account:{...account,...change},role:'admin'}],[{id:1}]));
  assert.throws(()=>validateCandidate([{account,role:'EPS'}],[{id:1}]));
});
