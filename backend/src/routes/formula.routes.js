const router=require("express").Router();
const {requireUsuario}=require("../middlewares/role.middleware");
const {requireAdmin}=require("../middlewares/admin.middleware");
const c=require("../controllers/formula.controller");
// Compatibility URLs must not give administrators clinical review privileges.
const fueraDeAlcance=(req,res)=>res.status(403).json({ok:false,mensaje:'La administración no revisa ni modifica fórmulas médicas.'});
router.get("/admin/all",requireAdmin,fueraDeAlcance);
router.patch("/admin/:id",requireAdmin,fueraDeAlcance);
router.get("/",requireUsuario,c.listar);
router.post("/",requireUsuario,c.crear);
router.get("/:id",requireUsuario,c.ver);
module.exports=router;
