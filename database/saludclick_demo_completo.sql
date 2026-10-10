CREATE DATABASE IF NOT EXISTS saludclick CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
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


-- Datos ampliados para demo académica de SaludClick.
-- Los productos y precios son ficticios/ilustrativos y no constituyen recomendación médica.

INSERT INTO roles (nombre, descripcion) VALUES
('Administrador','Control total del sistema'),('Usuario','Paciente del sistema'),('Farmacia','Administrador del inventario')
ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);

INSERT INTO categorias (nombre, descripcion) VALUES ('Analgésicos','Catálogo de analgésicos.') ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);
INSERT INTO categorias (nombre, descripcion) VALUES ('Antiinflamatorios','Catálogo de antiinflamatorios.') ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);
INSERT INTO categorias (nombre, descripcion) VALUES ('Antibióticos','Catálogo de antibióticos.') ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);
INSERT INTO categorias (nombre, descripcion) VALUES ('Antialérgicos','Catálogo de antialérgicos.') ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);
INSERT INTO categorias (nombre, descripcion) VALUES ('Gastrointestinales','Catálogo de gastrointestinales.') ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);
INSERT INTO categorias (nombre, descripcion) VALUES ('Vitaminas y suplementos','Catálogo de vitaminas y suplementos.') ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);
INSERT INTO categorias (nombre, descripcion) VALUES ('Antigripales y respiratorios','Catálogo de antigripales y respiratorios.') ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);
INSERT INTO categorias (nombre, descripcion) VALUES ('Dermatológicos','Catálogo de dermatológicos.') ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);
INSERT INTO categorias (nombre, descripcion) VALUES ('Cardiovasculares','Catálogo de cardiovasculares.') ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);
INSERT INTO categorias (nombre, descripcion) VALUES ('Endocrinos y metabólicos','Catálogo de endocrinos y metabólicos.') ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);
INSERT INTO categorias (nombre, descripcion) VALUES ('Antisépticos y primeros auxilios','Catálogo de antisépticos y primeros auxilios.') ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);

INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Acetaminofén 500 mg','Analgésico y antipirético. Presentación simulada: caja x 20 tabletas.',id,6500.00,40,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Analgésicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Acetaminofén 500 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Acetaminofén 650 mg','Analgésico y antipirético. Presentación simulada: caja x 20 tabletas.',id,7800.00,35,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Analgésicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Acetaminofén 650 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Acetaminofén infantil','Analgésico y antipirético. Presentación simulada: jarabe 120 ml.',id,9200.00,25,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Analgésicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Acetaminofén infantil');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Dipirona 500 mg','Analgésico y antipirético. Presentación simulada: caja x 20 tabletas.',id,8900.00,30,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Analgésicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Dipirona 500 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Tramadol 50 mg','Analgésico de prescripción. Presentación simulada: caja x 10 cápsulas.',id,14500.00,18,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Analgésicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Tramadol 50 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Tramadol + Acetaminofén','Analgésico combinado de prescripción. Presentación simulada: caja x 10 tabletas.',id,18900.00,15,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Analgésicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Tramadol + Acetaminofén');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Ácido acetilsalicílico 100 mg','Analgésico. Presentación simulada: caja x 30 tabletas.',id,6200.00,45,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Analgésicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Ácido acetilsalicílico 100 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Ácido acetilsalicílico 500 mg','Analgésico. Presentación simulada: caja x 20 tabletas.',id,7400.00,35,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Analgésicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Ácido acetilsalicílico 500 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Ibuprofeno 200 mg','Antiinflamatorio no esteroideo. Caja x 20 tabletas.',id,6200.00,40,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antiinflamatorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Ibuprofeno 200 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Ibuprofeno 400 mg','Antiinflamatorio no esteroideo. Caja x 20 tabletas.',id,8200.00,35,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antiinflamatorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Ibuprofeno 400 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Naproxeno 250 mg','Antiinflamatorio no esteroideo. Caja x 20 tabletas.',id,7600.00,30,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antiinflamatorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Naproxeno 250 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Naproxeno 500 mg','Antiinflamatorio no esteroideo. Caja x 20 tabletas.',id,10800.00,28,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antiinflamatorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Naproxeno 500 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Diclofenaco 50 mg','Antiinflamatorio no esteroideo. Caja x 20 tabletas.',id,6900.00,32,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antiinflamatorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Diclofenaco 50 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Diclofenaco gel 1%','Antiinflamatorio tópico. Tubo de 30 g.',id,9700.00,24,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antiinflamatorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Diclofenaco gel 1%');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Meloxicam 7.5 mg','Antiinflamatorio de prescripción. Caja x 10 tabletas.',id,11200.00,20,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antiinflamatorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Meloxicam 7.5 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Meloxicam 15 mg','Antiinflamatorio de prescripción. Caja x 10 tabletas.',id,13500.00,18,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antiinflamatorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Meloxicam 15 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Amoxicilina 500 mg','Antibiótico de prescripción. Caja x 21 cápsulas.',id,12500.00,25,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antibióticos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Amoxicilina 500 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Amoxicilina 250 mg/5 ml','Antibiótico de prescripción. Suspensión 100 ml.',id,13800.00,18,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antibióticos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Amoxicilina 250 mg/5 ml');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Azitromicina 500 mg','Antibiótico de prescripción. Caja x 3 tabletas.',id,15800.00,20,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antibióticos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Azitromicina 500 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Cefalexina 500 mg','Antibiótico de prescripción. Caja x 20 cápsulas.',id,14200.00,22,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antibióticos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Cefalexina 500 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Ciprofloxacino 500 mg','Antibiótico de prescripción. Caja x 10 tabletas.',id,12900.00,18,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antibióticos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Ciprofloxacino 500 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Clindamicina 300 mg','Antibiótico de prescripción. Caja x 16 cápsulas.',id,17600.00,15,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antibióticos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Clindamicina 300 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Metronidazol 500 mg','Antibiótico/antiprotozoario de prescripción. Caja x 20 tabletas.',id,10400.00,24,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antibióticos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Metronidazol 500 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Doxiciclina 100 mg','Antibiótico de prescripción. Caja x 10 cápsulas.',id,16800.00,16,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antibióticos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Doxiciclina 100 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Loratadina 10 mg','Antialérgico. Caja x 10 tabletas.',id,7200.00,40,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antialérgicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Loratadina 10 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Cetirizina 10 mg','Antialérgico. Caja x 10 tabletas.',id,7600.00,38,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antialérgicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Cetirizina 10 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Desloratadina 5 mg','Antialérgico. Caja x 10 tabletas.',id,11800.00,25,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antialérgicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Desloratadina 5 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Fexofenadina 120 mg','Antialérgico. Caja x 10 tabletas.',id,12900.00,24,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antialérgicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Fexofenadina 120 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Levocetirizina 5 mg','Antialérgico. Caja x 10 tabletas.',id,10400.00,28,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antialérgicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Levocetirizina 5 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Loratadina jarabe','Antialérgico. Frasco de 100 ml.',id,8600.00,22,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antialérgicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Loratadina jarabe');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Clorfenamina 4 mg','Antialérgico. Caja x 20 tabletas.',id,5800.00,35,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antialérgicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Clorfenamina 4 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Montelukast 10 mg','Medicamento de prescripción para control de síntomas respiratorios.',id,17500.00,18,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antialérgicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Montelukast 10 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Omeprazol 20 mg','Medicamento para reducir la producción de ácido gástrico. Caja x 14 cápsulas.',id,9800.00,40,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Gastrointestinales' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Omeprazol 20 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Omeprazol 40 mg','Medicamento para reducir la producción de ácido gástrico. Caja x 14 cápsulas.',id,12600.00,30,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Gastrointestinales' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Omeprazol 40 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Esomeprazol 20 mg','Reductor de ácido gástrico. Caja x 14 cápsulas.',id,13400.00,25,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Gastrointestinales' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Esomeprazol 20 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Pantoprazol 40 mg','Reductor de ácido gástrico. Caja x 14 tabletas.',id,12100.00,28,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Gastrointestinales' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Pantoprazol 40 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Famotidina 20 mg','Reductor de ácido gástrico. Caja x 20 tabletas.',id,8900.00,25,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Gastrointestinales' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Famotidina 20 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Loperamida 2 mg','Antidiarreico. Caja x 12 cápsulas.',id,6700.00,35,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Gastrointestinales' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Loperamida 2 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Bismuto subsalicilato','Protector gastrointestinal. Frasco 120 ml.',id,9300.00,20,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Gastrointestinales' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Bismuto subsalicilato');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Sales de rehidratación oral','Solución para rehidratación. Caja x 4 sobres.',id,5200.00,50,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Gastrointestinales' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Sales de rehidratación oral');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Vitamina C 500 mg','Suplemento de vitamina C. Caja x 30 tabletas.',id,11200.00,45,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Vitaminas y suplementos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Vitamina C 500 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Vitamina C 1000 mg','Suplemento de vitamina C. Caja x 20 tabletas.',id,15800.00,35,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Vitaminas y suplementos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Vitamina C 1000 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Vitamina D3 1000 UI','Suplemento de vitamina D3. Frasco x 60 cápsulas.',id,13900.00,30,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Vitaminas y suplementos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Vitamina D3 1000 UI');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Vitamina D3 2000 UI','Suplemento de vitamina D3. Frasco x 60 cápsulas.',id,17900.00,28,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Vitaminas y suplementos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Vitamina D3 2000 UI');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Complejo B','Suplemento de vitaminas del complejo B. Caja x 30 tabletas.',id,12600.00,40,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Vitaminas y suplementos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Complejo B');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Multivitamínico adulto','Suplemento multivitamínico. Frasco x 60 tabletas.',id,21500.00,30,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Vitaminas y suplementos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Multivitamínico adulto');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Calcio + Vitamina D','Suplemento de calcio y vitamina D. Frasco x 60 tabletas.',id,19800.00,25,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Vitaminas y suplementos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Calcio + Vitamina D');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Hierro + Ácido fólico','Suplemento de hierro y ácido fólico. Caja x 30 tabletas.',id,14500.00,28,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Vitaminas y suplementos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Hierro + Ácido fólico');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Solución salina nasal','Solución para higiene nasal. Frasco 30 ml.',id,5900.00,35,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antigripales y respiratorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Solución salina nasal');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Acetaminofén + Fenilefrina','Producto para síntomas de resfriado. Caja x 12 tabletas.',id,10800.00,30,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antigripales y respiratorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Acetaminofén + Fenilefrina');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Jarabe para la tos','Jarabe de venta libre. Frasco 120 ml.',id,12500.00,25,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antigripales y respiratorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Jarabe para la tos');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Pastillas para la garganta','Pastillas para alivio de garganta. Caja x 16 unidades.',id,6800.00,40,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antigripales y respiratorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Pastillas para la garganta');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Dextrometorfano','Antitusivo. Presentación simulada: jarabe 120 ml.',id,11900.00,20,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antigripales y respiratorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Dextrometorfano');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Ambroxol 30 mg','Mucolítico/expectorante. Caja x 20 tabletas.',id,9600.00,22,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antigripales y respiratorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Ambroxol 30 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Ambroxol jarabe','Mucolítico/expectorante. Frasco 120 ml.',id,11200.00,24,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antigripales y respiratorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Ambroxol jarabe');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Budesonida nasal','Corticoide nasal de prescripción. Frasco 120 dosis.',id,26500.00,15,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antigripales y respiratorios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Budesonida nasal');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Clotrimazol crema 1%','Antifúngico tópico. Tubo de 20 g.',id,8700.00,30,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Dermatológicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Clotrimazol crema 1%');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Clotrimazol solución','Antifúngico tópico. Frasco 30 ml.',id,9900.00,20,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Dermatológicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Clotrimazol solución');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Miconazol crema 2%','Antifúngico tópico. Tubo de 20 g.',id,10400.00,22,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Dermatológicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Miconazol crema 2%');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Hidrocortisona crema 1%','Corticoide tópico. Tubo de 15 g.',id,7600.00,25,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Dermatológicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Hidrocortisona crema 1%');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Mupirocina crema','Antibiótico tópico de prescripción. Tubo de 15 g.',id,14900.00,18,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Dermatológicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Mupirocina crema');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Calamina loción','Loción para cuidado y alivio de la piel. Frasco 120 ml.',id,8500.00,28,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Dermatológicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Calamina loción');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Ácido salicílico gel','Producto tópico para cuidado de la piel. Tubo 30 g.',id,9200.00,20,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Dermatológicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Ácido salicílico gel');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Vaselina pura','Producto emoliente para cuidado de la piel. Envase 100 g.',id,6900.00,35,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Dermatológicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Vaselina pura');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Losartán 50 mg','Antihipertensivo de prescripción. Caja x 30 tabletas.',id,14600.00,24,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Cardiovasculares' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Losartán 50 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Losartán 100 mg','Antihipertensivo de prescripción. Caja x 30 tabletas.',id,19800.00,20,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Cardiovasculares' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Losartán 100 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Enalapril 10 mg','Antihipertensivo de prescripción. Caja x 30 tabletas.',id,9800.00,25,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Cardiovasculares' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Enalapril 10 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Amlodipino 5 mg','Antihipertensivo de prescripción. Caja x 30 tabletas.',id,8700.00,30,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Cardiovasculares' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Amlodipino 5 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Amlodipino 10 mg','Antihipertensivo de prescripción. Caja x 30 tabletas.',id,12300.00,24,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Cardiovasculares' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Amlodipino 10 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Atorvastatina 20 mg','Medicamento para control de lípidos de prescripción. Caja x 30 tabletas.',id,15400.00,22,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Cardiovasculares' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Atorvastatina 20 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Atorvastatina 40 mg','Medicamento para control de lípidos de prescripción. Caja x 30 tabletas.',id,21900.00,18,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Cardiovasculares' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Atorvastatina 40 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Metoprolol 50 mg','Medicamento cardiovascular de prescripción. Caja x 20 tabletas.',id,13200.00,20,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Cardiovasculares' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Metoprolol 50 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Metformina 500 mg','Medicamento de prescripción para control metabólico. Caja x 30 tabletas.',id,9900.00,30,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Endocrinos y metabólicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Metformina 500 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Metformina 850 mg','Medicamento de prescripción para control metabólico. Caja x 30 tabletas.',id,12800.00,28,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Endocrinos y metabólicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Metformina 850 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Metformina 1000 mg','Medicamento de prescripción para control metabólico. Caja x 30 tabletas.',id,16500.00,24,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Endocrinos y metabólicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Metformina 1000 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Levotiroxina 50 mcg','Hormona tiroidea de prescripción. Caja x 50 tabletas.',id,11800.00,20,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Endocrinos y metabólicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Levotiroxina 50 mcg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Levotiroxina 100 mcg','Hormona tiroidea de prescripción. Caja x 50 tabletas.',id,16900.00,18,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Endocrinos y metabólicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Levotiroxina 100 mcg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Glibenclamida 5 mg','Medicamento de prescripción para control metabólico. Caja x 30 tabletas.',id,7200.00,20,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Endocrinos y metabólicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Glibenclamida 5 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Sulfato ferroso','Suplemento de hierro. Caja x 30 tabletas.',id,6800.00,35,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Endocrinos y metabólicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Sulfato ferroso');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Ácido fólico 5 mg','Suplemento de ácido fólico. Caja x 30 tabletas.',id,6200.00,40,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Endocrinos y metabólicos' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Ácido fólico 5 mg');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Alcohol antiséptico 70%','Antiséptico para uso externo. Frasco 250 ml.',id,6200.00,45,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antisépticos y primeros auxilios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Alcohol antiséptico 70%');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Agua oxigenada','Antiséptico de uso externo. Frasco 120 ml.',id,5400.00,40,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antisépticos y primeros auxilios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Agua oxigenada');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Povidona yodada','Antiséptico de uso externo. Frasco 120 ml.',id,9800.00,30,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antisépticos y primeros auxilios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Povidona yodada');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Clorhexidina','Antiséptico de uso externo. Frasco 120 ml.',id,11200.00,25,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antisépticos y primeros auxilios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Clorhexidina');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Gasas estériles','Material de primeros auxilios. Paquete x 10 unidades.',id,7500.00,50,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antisépticos y primeros auxilios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Gasas estériles');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Curitas adhesivas','Material de primeros auxilios. Caja x 30 unidades.',id,5800.00,60,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antisépticos y primeros auxilios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Curitas adhesivas');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Venda elástica','Material de primeros auxilios. Unidad.',id,8200.00,35,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antisépticos y primeros auxilios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Venda elástica');
INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado) SELECT 'Algodón medicinal','Material de primeros auxilios. Paquete 100 g.',id,4900.00,45,'/images/medicamentos/medicamento-generico.svg','DISPONIBLE' FROM categorias WHERE nombre='Antisépticos y primeros auxilios' AND NOT EXISTS (SELECT 1 FROM medicamentos x WHERE x.nombre='Algodón medicinal');

-- Índices útiles para navegación y filtros.
CREATE INDEX idx_medicamentos_categoria ON medicamentos(categoria_id);
CREATE INDEX idx_medicamentos_estado ON medicamentos(estado);

-- Usuario demo opcional para navegación. Contraseña: SaludClick123!
INSERT INTO usuarios (nombre, apellido, correo, telefono, cedula, tipo_documento, ciudad, password, rol_id, estado) VALUES ('Usuario','Demo','demo@saludclick.local','3000000000','DEMO-SALUDCLICK','CC','Medellín','$2b$10$y3DYtjYlOOdkLv1oWVlz.O33LVy5My3BqsoD.mtEUw9d815TarN4G',2,'ACTIVO') ON DUPLICATE KEY UPDATE estado='ACTIVO';


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
