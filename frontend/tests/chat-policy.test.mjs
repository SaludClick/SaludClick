import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rolSinChat} from '../src/lib/chat-policy.mjs';
test('Chat: Farmacia y EPS quedan excluidos; Administrador, Paciente y ayuda pública conservan su acceso',()=>{
    const old={window:globalThis.window,sessionStorage:globalThis.sessionStorage,localStorage:globalThis.localStorage};
    let role=null,auth=false;
    globalThis.window={};globalThis.localStorage={getItem:()=>null};
    globalThis.sessionStorage={getItem:key=>key==='saludclick_token'?(auth?'test-token':null):JSON.stringify({rol:role})};
    try{
        assert.equal(rolSinChat(),null);auth=true;
        for(const value of [1,2,3,4]){role=value;assert.equal(rolSinChat(),[3,4].includes(value)?value:null);}
        auth=false;role=3;assert.equal(rolSinChat(),null);
    }finally{for(const [key,value] of Object.entries(old))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
