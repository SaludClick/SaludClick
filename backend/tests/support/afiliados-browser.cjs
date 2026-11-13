const assert = require('node:assert/strict');
module.exports = async ({ t, evaluate, go, until, send }) => {
    await t.test('retired affiliate page denies direct access for every role without API calls', async () => {
        const {identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`
            const originalFetch=window.fetch.bind(window);
            window.fetch=(input,options)=>{
                if(new URL(input,location.origin).pathname.startsWith('/api/admin/afiliados')){
                    sessionStorage.setItem('forbiddenAffiliateFetch','yes');
                    return Promise.reject(new Error('Retired affiliate API requested'));
                }
                return originalFetch(input,options);
            };
        `});
        try {
            for(const [role,home] of [[1,'/pages/admin.html'],[2,'/pages/dashboard.html'],[3,'/pages/farmacia.html'],[4,'/pages/eps.html']]){
                await evaluate(`for(const s of [localStorage,sessionStorage]){s.setItem('saludclick_token','frontend-test-only');s.setItem('saludclick_user',JSON.stringify({id:${role},nombre:'Test',rol:${role}}));}sessionStorage.removeItem('forbiddenAffiliateFetch');`);
                // go() expects the requested route to stay; this retired route redirects.
                await send('Page.navigate',{url:await evaluate(`location.origin`)+'/pages/admin-afiliados.html'});
                await until(()=>evaluate(`location.pathname===${JSON.stringify(home)}`));
                assert.equal(await evaluate(`sessionStorage.getItem('forbiddenAffiliateFetch')`),null);
                assert.equal(await evaluate(`!!document.querySelector('#crearCuenta')`),false);
            }
            await evaluate(`for(const s of [localStorage,sessionStorage]){s.removeItem('saludclick_token');s.removeItem('saludclick_user');}`);
            await send('Page.navigate',{url:await evaluate(`location.origin`)+'/pages/admin-afiliados.html'});
            await until(()=>evaluate(`location.pathname==='/login.html'`));
        } finally { await send('Page.removeScriptToEvaluateOnNewDocument',{identifier}); }
    });
};
