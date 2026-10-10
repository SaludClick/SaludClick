const healthRepository = require("../repositories/health.repository");

const health = async () => {
    return healthRepository.health();
};

module.exports = {
    health
};
