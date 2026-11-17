
const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeRecoverySql}=require('../scripts/eps-restore-compat.cjs');
const metadata='ALTER TABLE ONLY public.administrative_cases ALTER COLUMN visitante_hash SET (pg_attver=55783408);\nALTER TABLE ONLY public.administrative_cases ALTER COLUMN visitante_expira_at SET (pg_attver=55784296);';
test('recovery compatibility plan changes only the two reviewed internal attribute-version statements',()=>{
 const before='CREATE TABLE public.usuarios (id int);\n',after='\nCOPY public.usuarios (id) FROM stdin;\n1\n\\.\n';const result=normalizeRecoverySql(before+metadata+after);assert.equal(result.removed.length,2);assert.ok(result.sql.startsWith(before));assert.ok(result.sql.endsWith(after));assert.ok(!result.sql.includes('pg_attver'));
});
test('recovery compatibility plan rejects missing, duplicate or additional internal metadata',()=>{
 for(const sql of ['',metadata.split('\n')[0],metadata+'\n'+metadata.split('\n')[0],metadata+'\nALTER TABLE ONLY public.usuarios ALTER COLUMN id SET (pg_attver=42);'])assert.throws(()=>normalizeRecoverySql(sql));
});
