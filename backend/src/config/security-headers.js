const helmet = require("helmet");

module.exports = helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: helmet.contentSecurityPolicy.dangerouslyDisableDefaultSrc,
            baseUri: ["'none'"],
            frameAncestors: ["'self'"],
            objectSrc: ["'none'"],
            scriptSrcAttr: ["'none'"]
        }
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: false,
    strictTransportSecurity: process.env.NODE_ENV === "production"
        ? { maxAge: 15552000, includeSubDomains: false }
        : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xFrameOptions: { action: "sameorigin" }
});
