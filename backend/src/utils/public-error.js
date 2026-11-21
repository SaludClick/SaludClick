class PublicError extends Error {}

function publicMessage(error, fallback) {
    return error instanceof PublicError ? error.message : fallback;
}

module.exports = { PublicError, publicMessage };
