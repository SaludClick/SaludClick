const healthService = require("../services/health.service");

const health = async (req, res) => {

    const respuesta = await healthService.health();

    res.status(200).json(respuesta);

};

module.exports = {
    health
};