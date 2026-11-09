const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sanitizeBackendError } = require("./support/sanitize-backend-error.cjs");

test("los diagnósticos PostgreSQL omiten URL, usuario y contraseña", () => {
    const connectionString = "postgresql://integration:dummy-secret@127.0.0.1:55432/saludclick_test";
    const diagnostic = sanitizeBackendError(
        new Error(`Connection failed for ${connectionString}; password=dummy-secret`),
        [connectionString]
    );

    assert.doesNotMatch(diagnostic.message, /integration|dummy-secret/);
    assert.match(diagnostic.message, /REDACTED/);
});
