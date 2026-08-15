const authService = require("../services/auth.service");

const register = async (req, res) => {
    try {
        const respuesta = await authService.register(req.body);

        res.status(201).json(respuesta);

    } catch (error) {
        res.status(400).json({
            ok: false,
            mensaje: error.message
        });
    }
};

const login = async (req, res) => {
    try {
        const respuesta = await authService.login(req.body);

        res.status(200).json(respuesta);

    } catch (error) {
        res.status(400).json({
            ok: false,
            mensaje: error.message
        });
    }
};

const profile = async (req, res) => {

    res.status(200).json({
        ok: true,
        usuario: req.usuario
    });

};

module.exports = {
    register,
    login,
    profile
};