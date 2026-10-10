const pool = require("../config/database");

const health = async () => {
    const [rows] = await pool.query("SELECT NOW() AS fecha");

    return {
        ok: true,
        mensaje: "API funcionando correctamente",
        servidor: rows[0].fecha
    };
};

module.exports = {
    health
};