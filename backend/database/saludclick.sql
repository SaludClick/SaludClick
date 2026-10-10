USE saludclick;

-- ============================================
-- TABLA: ROLES
-- ============================================
CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- TABLA: CATEGORIAS
-- ============================================
CREATE TABLE categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- TABLA: USUARIOS
-- ============================================
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    telefono VARCHAR(20),
    cedula VARCHAR(30) NULL UNIQUE,
    tipo_documento VARCHAR(10),
    ciudad VARCHAR(100),
    password VARCHAR(255) NOT NULL,
    rol_id INT NOT NULL,
    estado ENUM('ACTIVO','INACTIVO') DEFAULT 'ACTIVO',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_usuario_rol
        FOREIGN KEY (rol_id)
        REFERENCES roles(id)
        ON UPDATE CASCADE
);

-- ============================================
-- TABLA: MEDICAMENTOS
-- ============================================
CREATE TABLE medicamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    categoria_id INT NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    imagen VARCHAR(255),
    estado ENUM('DISPONIBLE','AGOTADO','INACTIVO') DEFAULT 'DISPONIBLE',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_medicamento_categoria
        FOREIGN KEY (categoria_id)
        REFERENCES categorias(id)
        ON UPDATE CASCADE
);

-- ============================================
-- TABLA: SOLICITUDES
-- ============================================
CREATE TABLE solicitudes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,

    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,

    estado ENUM(
        'PENDIENTE',
        'APROBADA',
        'PREPARANDO',
        'LISTA',
        'ENTREGADA',
        'CANCELADA'
    ) DEFAULT 'PENDIENTE',

    tipo_entrega ENUM(
        'RECOGER',
        'DOMICILIO'
    ) DEFAULT 'RECOGER',

    direccion VARCHAR(255),

    observaciones TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_solicitud_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON UPDATE CASCADE
);

-- ============================================
-- TABLA: DETALLE SOLICITUD
-- ============================================
CREATE TABLE detalle_solicitud (
    id INT AUTO_INCREMENT PRIMARY KEY,

    solicitud_id INT NOT NULL,

    medicamento_id INT NOT NULL,

    cantidad INT NOT NULL,

    precio DECIMAL(10,2) NOT NULL,

    subtotal DECIMAL(10,2) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_detalle_solicitud
        FOREIGN KEY (solicitud_id)
        REFERENCES solicitudes(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_detalle_medicamento
        FOREIGN KEY (medicamento_id)
        REFERENCES medicamentos(id)
        ON UPDATE CASCADE
);

-- ============================================
-- TABLA: RECORDATORIOS
-- ============================================
CREATE TABLE recordatorios (
    id INT AUTO_INCREMENT PRIMARY KEY,

    usuario_id INT NOT NULL,

    medicamento_id INT NOT NULL,

    hora TIME NOT NULL,

    frecuencia ENUM(
        'CADA_8_HORAS',
        'CADA_12_HORAS',
        'CADA_24_HORAS'
    ) NOT NULL,

    fecha_inicio DATE NOT NULL,

    fecha_fin DATE,

    estado ENUM('ACTIVO','INACTIVO') DEFAULT 'ACTIVO',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_recordatorio_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON UPDATE CASCADE,

    CONSTRAINT fk_recordatorio_medicamento
        FOREIGN KEY (medicamento_id)
        REFERENCES medicamentos(id)
        ON UPDATE CASCADE
);
-- ============================================
-- TOKENS DE RECUPERACIÓN DE CONTRASEÑA
-- ============================================
CREATE TABLE tokens_recuperacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expira_en DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_token_recuperacion_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX idx_tokens_recuperacion_usuario
    ON tokens_recuperacion(usuario_id);

CREATE INDEX idx_tokens_recuperacion_expira
    ON tokens_recuperacion(expira_en);


-- ============================================
-- PAGOS SIMULADOS
-- ============================================
CREATE TABLE pagos (
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
