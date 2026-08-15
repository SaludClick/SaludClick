USE saludclick;

-- ==========================
-- ROLES
-- ==========================
INSERT INTO roles (nombre, descripcion)
VALUES
('Administrador', 'Control total del sistema'),
('Usuario', 'Paciente del sistema'),
('Farmacia', 'Administrador del inventario');

-- ==========================
-- CATEGORÍAS
-- ==========================
INSERT INTO categorias (nombre, descripcion)
VALUES
('Analgésicos', 'Medicamentos para aliviar el dolor'),
('Antibióticos', 'Medicamentos para tratar infecciones bacterianas'),
('Antiinflamatorios', 'Medicamentos para reducir inflamaciones'),
('Vitaminas', 'Suplementos vitamínicos'),
('Antialérgicos', 'Medicamentos para tratar alergias'),
('Gastrointestinales', 'Medicamentos para el sistema digestivo');