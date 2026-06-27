document.addEventListener("DOMContentLoaded", () => {

    const menuToggle =
        document.getElementById("menuToggle");

    const menu =
        document.getElementById("menu");

    if (!menuToggle || !menu) return;

    menuToggle.addEventListener("click", () => {

        menu.classList.toggle("active");

    });

});