const express = require('express');
const router = express.Router();
const { validarJWT } = require('../middlewares/auth.middleware');
const controller = require('../controllers/medication.controller');
router.get('/', validarJWT, controller.listar);
module.exports = router;
