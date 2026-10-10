USE saludclick;

INSERT INTO roles (nombre, descripcion) VALUES
('Administrador', 'Control total del sistema'),
('Usuario', 'Paciente del sistema'),
('Farmacia', 'Administrador del inventario')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT INTO categorias (nombre, descripcion) VALUES
('Analgésicos', 'Medicamentos para aliviar el dolor'),
('Antibióticos', 'Medicamentos para tratar infecciones bacterianas'),
('Antiinflamatorios', 'Medicamentos para reducir inflamaciones'),
('Vitaminas', 'Suplementos vitamínicos'),
('Antialérgicos', 'Medicamentos para tratar alergias'),
('Gastrointestinales', 'Medicamentos para el sistema digestivo')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado)
SELECT 'Acetaminofén', 'Analgésico y antipirético de uso común.', id, 6500.00, 25, '/images/medicamentos/acetaminofen.svg', 'DISPONIBLE' FROM categorias WHERE nombre='Analgésicos'
ON DUPLICATE KEY UPDATE precio=VALUES(precio), stock=VALUES(stock);
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado)
SELECT 'Ibuprofeno', 'Antiinflamatorio no esteroideo.', id, 8200.00, 25, '/images/medicamentos/ibuprofeno.svg', 'DISPONIBLE' FROM categorias WHERE nombre='Antiinflamatorios'
ON DUPLICATE KEY UPDATE precio=VALUES(precio), stock=VALUES(stock);
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado)
SELECT 'Amoxicilina', 'Antibiótico de uso bajo indicación médica.', id, 12500.00, 20, '/images/medicamentos/amoxicilina.svg', 'DISPONIBLE' FROM categorias WHERE nombre='Antibióticos'
ON DUPLICATE KEY UPDATE precio=VALUES(precio), stock=VALUES(stock);
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado)
SELECT 'Loratadina', 'Antialérgico para el alivio de síntomas de alergia.', id, 7200.00, 30, '/images/medicamentos/loratadina.svg', 'DISPONIBLE' FROM categorias WHERE nombre='Antialérgicos'
ON DUPLICATE KEY UPDATE precio=VALUES(precio), stock=VALUES(stock);
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado)
SELECT 'Omeprazol', 'Medicamento para reducir la producción de ácido gástrico.', id, 9800.00, 25, '/images/medicamentos/omeprazol.svg', 'DISPONIBLE' FROM categorias WHERE nombre='Gastrointestinales'
ON DUPLICATE KEY UPDATE precio=VALUES(precio), stock=VALUES(stock);


-- SALUDCLICK PROFESIONAL: fórmulas médicas y administrador demo
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
