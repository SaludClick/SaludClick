const healthRepository = require("../repositories/health.repository");

const health = async () => {

    return await healthRepository.health();

};

module.exports = {
    health
};