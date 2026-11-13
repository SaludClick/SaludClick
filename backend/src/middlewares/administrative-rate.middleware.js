function createLimiter({max=40,windowMs=60000,now=Date.now}={}) {
    const buckets=new Map();
    return (req,res,next)=>{
        if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
        const time=now();
        for(const [key,item] of buckets)if(time>=item.until)buckets.delete(key);
        const key=String(req.usuario?.id||req.ip),entry=buckets.get(key)||{count:0,until:time+windowMs};
        if(!buckets.has(key)&&buckets.size>=10000)return res.status(503).json({ok:false,mensaje:'Atención temporalmente ocupada.'});
        entry.count++;buckets.set(key,entry);
        if(entry.count>max){res.setHeader('Retry-After',String(Math.ceil((entry.until-time)/1000)));return res.status(429).json({ok:false,mensaje:'Has enviado demasiadas operaciones. Espera un momento.'});}
        next();
    };
}
module.exports={createLimiter};
