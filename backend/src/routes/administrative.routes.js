const express=require('express');
const {roles}=require('../middlewares/administrative-session.middleware');
const {createController}=require('../controllers/administrative.controller');
function createRouter({controller,guards=roles,emit}={}) {
    const router=express.Router();
    // Lazy repository creation avoids database connections at import time.
    let c=controller;
    const handle=name=>(req,res,next)=>{c??=createController({emit});return c[name](req,res,next);};
    router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
    router.use(...guards(1,2),require('../middlewares/administrative-rate.middleware').createLimiter());
    router.get('/faq',...guards(1,2),handle('faq'));
    router.get('/atenciones',...guards(1,2),handle('cases'));
    router.post('/atenciones',...guards(2),handle('createCase'));
    router.get('/atenciones/:id',...guards(1,2),handle('caseDetail'));
    router.patch('/atenciones/:id',...guards(1),handle('updateCase'));
    router.post('/atenciones/:id/mensajes',...guards(1,2),handle('send'));
    router.post('/atenciones/:id/leido',...guards(1,2),handle('read'));
    router.get('/notificaciones',...guards(1,2),handle('notifications'));
    router.patch('/notificaciones/:id/leida',...guards(1,2),handle('readNotification'));
    router.get('/dashboard',...guards(1),handle('dashboard'));
    router.get('/usuarios',...guards(1),handle('users'));
    router.post('/usuarios',...guards(1),handle('createUser'));
    router.patch('/usuarios/:id',...guards(1),handle('updateUser'));
    router.get('/responsables',...guards(1),handle('administrators'));
    router.get('/auditoria',...guards(1),handle('audit'));
    router.get('/informes/:tipo',...guards(1),handle('report'));
    router.get('/configuracion',...guards(1),handle('settings'));
    router.put('/configuracion/:clave',...guards(1),handle('saveSetting'));
    router.get('/preferencias',...guards(1),handle('preferences'));
    router.put('/preferencias',...guards(1),handle('savePreferences'));
    router.get('/perfil',...guards(1),handle('profile'));
    router.put('/perfil',...guards(1),handle('saveProfile'));
    router.post('/password',...guards(1),handle('password'));
    return router;
}
module.exports={createRouter};
