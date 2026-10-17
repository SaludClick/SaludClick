

        const password = document.getElementById("password");
        const confirmarPassword = document.getElementById("confirmarPassword");

        const mostrarPassword = document.getElementById("mostrarPassword");
        const mostrarConfirmarPassword = document.getElementById("mostrarConfirmarPassword");


        mostrarPassword.addEventListener("click", function () {

            if (password.type === "password") {

                password.type = "text";

                this.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';

            } else {

                password.type = "password";

                this.innerHTML = '<i class="fa-solid fa-eye"></i>';

            }

        });


        mostrarConfirmarPassword.addEventListener("click", function () {

            if (confirmarPassword.type === "password") {

                confirmarPassword.type = "text";

                this.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';

            } else {

                confirmarPassword.type = "password";

                this.innerHTML = '<i class="fa-solid fa-eye"></i>';

            }

        });
