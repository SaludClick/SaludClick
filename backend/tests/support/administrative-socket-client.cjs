// Exercise the real Socket.IO websocket transport with Node's built-in WebSocket.
// No extra dependency, mocked namespace or access to production credentials.
async function connectAdministrativeSocket(origin,token){
    const url=origin.replace(/^http/,'ws')+'/socket.io/?EIO=4&transport=websocket';
    const ws=new WebSocket(url),events=[];
    let resolveReady,rejectReady;
    const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    const timer=setTimeout(()=>rejectReady(new Error('Socket.IO handshake timed out')),8000);
    ws.addEventListener('message',event=>{
      const packet=String(event.data);
      if(packet.startsWith('0'))ws.send('40/administrativo,'+JSON.stringify(typeof token==='object'?token:{token}));
      else if(packet==='2')ws.send('3');
      else if(packet.startsWith('40/administrativo,')){clearTimeout(timer);resolveReady();}
      else if(packet.startsWith('44/administrativo,')){clearTimeout(timer);rejectReady(new Error('Socket.IO access denied'));}
      else if(packet.startsWith('42/administrativo,'))events.push(JSON.parse(packet.slice('42/administrativo,'.length)));
    });
    ws.addEventListener('error',()=>{clearTimeout(timer);rejectReady(new Error('Socket.IO transport failed'));});
    try{await ready;}catch(error){ws.close();throw error;}
    return {events,close:()=>ws.close(),async until(predicate){
      const end=Date.now()+5000;
      while(Date.now()<end){const value=events.find(predicate);if(value)return value;await new Promise(resolve=>setTimeout(resolve,20));}
      throw new Error('Expected Socket.IO event did not arrive');
    }};
}
module.exports={connectAdministrativeSocket};
