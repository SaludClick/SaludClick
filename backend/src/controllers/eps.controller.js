const verificarAcceso = (req, res) => {
    res.json({
        ok: true,
        mensaje: "Acceso autorizado al panel EPS."
    });
};

module.exports = { verificarAcceso };
