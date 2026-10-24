
const pool = require("../config/database");

const health = async () => {
    const result = await pool.query("SELECT NOW() AS fecha");

    return {
        ok: true,
        mensaje: "API funcionando correctamente",
        servidor: result.rows[0].fecha
    };
};

module.exports = {
    health
};
