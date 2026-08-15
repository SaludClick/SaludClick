import { checkAuthGuard, initAuth } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
    checkAuthGuard();
    initAuth();
});