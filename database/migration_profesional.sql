USE saludclick;

CREATE TABLE IF NOT EXISTS formulas_medicas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    nombre_archivo VARCHAR(180) NOT NULL,
    nombre_original VARCHAR(180) NOT NULL,
    tipo_mime VARCHAR(80) NOT NULL,
    tamano INT NOT NULL,
    descripcion VARCHAR(500) NULL,
    estado ENUM('PENDIENTE','VALIDADA','RECHAZADA','ELIMINADA') NOT NULL DEFAULT 'PENDIENTE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_formula_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_formula_usuario (usuario_id),
    INDEX idx_formula_estado (estado)
);

-- Usuario administrador de demostración.
-- Credenciales: admin@saludclick.local / SaludClick123!
INSERT INTO usuarios
(nombre, apellido, correo, telefono, cedula, tipo_documento, ciudad, password, rol_id, estado)
SELECT 'Administrador','Demo','admin@saludclick.local','3000000001','ADMIN-DEMO','CC','Medellín',
       '$2b$10$y3DYtjYlOOdkLv1oWVlz.O33LVy5My3BqsoD.mtEUw9d815TarN4G',1,'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE correo='admin@saludclick.local');

-- Si la instalación ya tenía el usuario, asegúrate de que tenga rol administrador.
UPDATE usuarios SET rol_id=1, estado='ACTIVO' WHERE correo='admin@saludclick.local';
