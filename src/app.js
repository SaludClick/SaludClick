const express = require("express");
const cors = require("cors");
const path = require("path");

const routes = require("./routes");

const app = express();

app.use(cors());
app.disable("x-powered-by");
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
});
app.use(express.json({ limit: "8mb" }));

// Archivos estáticos
app.use(express.static(path.join(__dirname, "../public")));

// API
app.use("/api", routes);

// Página principal
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

module.exports = app;