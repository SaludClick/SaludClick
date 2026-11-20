const path = require("node:path");

const uploadDir = process.env.FORMULA_UPLOAD_DIR
    ? path.resolve(process.env.FORMULA_UPLOAD_DIR)
    : path.resolve(__dirname, "../../private_uploads");

module.exports = { uploadDir };
