function sanitizeBackendError(error, connectionStrings = []) {
    let message = typeof error === "string"
        ? error
        : String(error?.message || "Backend request failed.");

    for (const connectionString of connectionStrings) {
        if (!connectionString) continue;
        message = message.split(connectionString).join("[REDACTED_DATABASE_URL]");
        try {
            const url = new URL(connectionString);
            for (const credential of [url.username, url.password]) {
                if (!credential) continue;
                const decoded = decodeURIComponent(credential);
                message = message.split(credential).join("[REDACTED]");
                message = message.split(decoded).join("[REDACTED]");
            }
        } catch {
            // The test URL is independently validated before a backend is started.
        }
    }

    message = message
        .replace(/((?:postgres(?:ql)?):\/\/)[^@\s"'`]+@/gi, "$1[REDACTED]@")
        .replace(
            /\b(password|passwd|pwd|token|secret)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
            "$1=[REDACTED]"
        )
        .replace(/\bfor user\s+"[^"]+"/gi, "for user [REDACTED]")
        .slice(0, 1200);

    const result = { message };
    if (error && typeof error === "object" && typeof error.name === "string") {
        result.name = error.name;
    }
    if (error && typeof error === "object" && typeof error.code === "string") {
        result.code = error.code;
    }
    return result;
}

module.exports = { sanitizeBackendError };
