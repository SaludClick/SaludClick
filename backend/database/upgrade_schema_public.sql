-- One-time upgrade for an existing SaludClick schema; back up and preflight first.

-- Precondition: usuarios.cedula exists and usuarios.numero_documento does not.

-- The CHANGE COLUMN preserves existing document values and the nullable unique constraint.

USE saludclick;

ALTER TABLE usuarios CHANGE COLUMN cedula numero_documento VARCHAR(30) NULL UNIQUE;

-- Safe no-op when these tables already exist; creates missing API tables otherwise.

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
