import { consumirDestinoPendiente, setSession } from "/js/auth.js";
import { paginaInicio } from "/js/roles.js";

document.getElementById("demoLogin").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    const status = document.getElementById("loginEstado");
    button.disabled = true;
    status.textContent = "Comprobando credenciales…";
    try {
        const response = await fetch("/demo/login", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.mensaje);
        setSession(result.token, result.usuario, false);
        const inicio = result.usuario.rol === 4 ? "/pages/ips.html" : paginaInicio(result.usuario);
        location.assign(consumirDestinoPendiente(inicio));
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
});
