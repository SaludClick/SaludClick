
const express = require("express");
const cors = require("cors");

const routes = require("./routes");

const app = express();

app.disable("x-powered-by");
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader(
        "Referrer-Policy",
        "strict-origin-when-cross-origin"
    );
    next();
});

app.use(express.json({ limit: "8mb" }));

// Archivos estáticos
const frontendPath = path.resolve(__dirname, "../../frontend");
app.use(express.static(frontendPath));

// API
app.use("/api", routes);

// Página principal
app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

module.exports = app;
