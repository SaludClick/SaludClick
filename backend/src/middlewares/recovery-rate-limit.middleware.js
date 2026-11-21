const windowMs = 15 * 60 * 1000;
const maxClients = 10000;

function recoveryRateLimit(limit) {
    const attempts = new Map();
    let nextCleanup = 0;

    return (req, res, next) => {
        const now = Date.now();
        const client = req.ip;
        res.set("Cache-Control", "no-store");

        if (now >= nextCleanup) {
            for (const [ip, entry] of attempts) {
                if (entry.until <= now) attempts.delete(ip);
            }
            nextCleanup = now + 60000;
        }

        let entry = attempts.get(client);
        if (!entry || entry.until <= now) {
            if (!entry && attempts.size >= maxClients) return reject(res, 60);
            entry = { count: 0, until: now + windowMs };
            attempts.set(client, entry);
        }

        if (entry.count >= limit) return reject(res, Math.ceil((entry.until - now) / 1000));
        entry.count += 1;
        next();
    };
}

function reject(res, seconds) {
    res.set("Retry-After", String(seconds));
    return res.status(429).json({ ok: false, mensaje: "Demasiados intentos. Inténtalo más tarde." });
}

module.exports = { recoveryRateLimit };
