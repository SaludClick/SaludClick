USE saludclick;

ALTER TABLE usuarios MODIFY COLUMN cedula VARCHAR(30) NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(10) NULL AFTER telefono;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ciudad VARCHAR(100) NULL AFTER cedula;

CREATE TABLE IF NOT EXISTS pagos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    solicitud_id INT NOT NULL,
    usuario_id INT NOT NULL,
    referencia VARCHAR(80) NOT NULL UNIQUE,
    metodo ENUM('TARJETA') NOT NULL DEFAULT 'TARJETA',
    marca VARCHAR(30) NOT NULL,
    ultimos_digitos CHAR(4) NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    estado ENUM('APROBADO','RECHAZADO','PENDIENTE') NOT NULL,
    simulacion TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pago_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE,
    CONSTRAINT fk_pago_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_pago_usuario (usuario_id),
    INDEX idx_pago_solicitud (solicitud_id)
);

UPDATE medicamentos SET stock = 25, estado = 'DISPONIBLE' WHERE stock = 0 AND estado = 'DISPONIBLE';
