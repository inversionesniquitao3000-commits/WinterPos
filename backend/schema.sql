CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. CONFIGURACIÓN CENTRAL DE LA EMPRESA
-- ==========================================
CREATE TABLE IF NOT EXISTS Configuracion_Empresa (
    id BIGSERIAL PRIMARY KEY,
    rif VARCHAR(20) NOT NULL UNIQUE,
    nombre_comercio VARCHAR(150) NOT NULL,
    direccion TEXT NOT NULL,
    telefono VARCHAR(50) NOT NULL,
    correo VARCHAR(100),
    moneda_base VARCHAR(3) DEFAULT 'USD',
    mensaje_pie_ticket TEXT,
    metodos_pago_activos JSONB NOT NULL DEFAULT '["efectivo_usd", "efectivo_ves", "debito", "pago_movil", "biopago", "credito"]'::jsonb,
    permitir_multisesion BOOLEAN DEFAULT TRUE,
    compartir_apertura_caja BOOLEAN DEFAULT TRUE
);

-- ==========================================
-- 2. USUARIOS, ROLES Y AUDITORÍA
-- ==========================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario') THEN
    CREATE TYPE rol_usuario AS ENUM ('administrador', 'inventario', 'vendedor', 'inventario-vendedor');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS Roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE,
    permisos TEXT
);

CREATE TABLE IF NOT EXISTS Usuarios (
    id BIGSERIAL PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    clave VARCHAR(255) NOT NULL DEFAULT 'admin',
    nombre VARCHAR(100) NOT NULL,
    rol VARCHAR(100) NOT NULL,
    permisos TEXT,
    estado VARCHAR(10) DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 3. TASAS DE CAMBIO (AUDITORÍA DIARIA)
-- ==========================================
CREATE TABLE IF NOT EXISTS Tasas_Cambio (
    id BIGSERIAL PRIMARY KEY,
    tasa_cobro NUMERIC(12, 4) NOT NULL CHECK (tasa_cobro > 0),
    tasa_vuelto NUMERIC(12, 4) NOT NULL CHECK (tasa_vuelto > 0),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id BIGINT REFERENCES Usuarios(id) ON DELETE SET NULL
);

-- ==========================================
-- 4. CLIENTES Y GESTIÓN DE CRÉDITO
-- ==========================================
CREATE TABLE IF NOT EXISTS Clientes (
    id BIGSERIAL PRIMARY KEY,
    cedula_rif VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(50),
    direccion TEXT,
    limite_credito NUMERIC(12, 2) DEFAULT 0.00 CHECK (limite_credito >= 0),
    credito_disponible NUMERIC(12, 2) DEFAULT 0.00 CHECK (credito_disponible >= 0),
    porcentaje_descuento NUMERIC(5, 2) DEFAULT 0.00 CHECK (porcentaje_descuento BETWEEN 0 AND 100),
    aplica_precio_costo BOOLEAN DEFAULT FALSE,
    estado VARCHAR(10) DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo'))
);

-- ==========================================
-- 5. PRODUCTOS (INVENTARIO MAESTRO)
-- ==========================================
CREATE TABLE IF NOT EXISTS Productos (
    id BIGSERIAL PRIMARY KEY,
    codigo_barras_clave VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    stock_actual NUMERIC(12, 3) DEFAULT 0.000 CHECK (stock_actual >= 0),
    stock_minimo NUMERIC(12, 3) DEFAULT 0.000 CHECK (stock_minimo >= 0),
    precio_costo_usd NUMERIC(12, 2) NOT NULL CHECK (precio_costo_usd >= 0),
    precio_detalle_usd NUMERIC(12, 2) NOT NULL CHECK (precio_detalle_usd >= 0),
    precio_mayor_usd NUMERIC(12, 2) NOT NULL CHECK (precio_mayor_usd >= 0),
    cantidad_mayorista INT DEFAULT 12 CHECK (cantidad_mayorista > 0),
    exento_impuesto BOOLEAN DEFAULT FALSE,
    porcentaje_impuesto NUMERIC DEFAULT 0,
    a_granel BOOLEAN DEFAULT FALSE,
    fecha_vencimiento VARCHAR(50),
    imagen_url VARCHAR(512),
    estado VARCHAR(10) DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo'))
);

-- ==========================================
-- 6. CONTROL DE CAJA POR ESTACIÓN / TERMINAL
-- ==========================================
CREATE TABLE IF NOT EXISTS Cajas_Apertura_Cierre (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES Usuarios(id),
    estacion_nombre VARCHAR(50) NOT NULL,
    fecha_apertura TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    monto_apertura_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    monto_apertura_ves NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    fecha_cierre TIMESTAMP,
    monto_cierre_esperado_usd NUMERIC(12, 2),
    monto_cierre_esperado_ves NUMERIC(12, 2),
    monto_cierre_real_usd NUMERIC(12, 2),
    monto_cierre_real_ves NUMERIC(12, 2),
    venta_total_usd NUMERIC(12, 2) DEFAULT 0.00,
    utilidad_usd NUMERIC(12, 2) DEFAULT 0.00,
    vuelto_entregado_usd NUMERIC(12, 2) DEFAULT 0.00,
    vuelto_entregado_ves NUMERIC(12, 2) DEFAULT 0.00,
    ventas_efectivo_usd NUMERIC(12, 2) DEFAULT 0.00,
    ventas_efectivo_ves NUMERIC(12, 2) DEFAULT 0.00,
    abono_clientes_usd NUMERIC(12, 2) DEFAULT 0.00,
    abono_clientes_ves NUMERIC(12, 2) DEFAULT 0.00,
    entrada_efectivo_usd NUMERIC(12, 2) DEFAULT 0.00,
    entrada_efectivo_ves NUMERIC(12, 2) DEFAULT 0.00,
    salida_efectivo_usd NUMERIC(12, 2) DEFAULT 0.00,
    salida_efectivo_ves NUMERIC(12, 2) DEFAULT 0.00,
    devolucion_efectivo_usd NUMERIC(12, 2) DEFAULT 0.00,
    devolucion_efectivo_ves NUMERIC(12, 2) DEFAULT 0.00,
    detalles_json TEXT,
    estatus VARCHAR(10) DEFAULT 'Abierta' CHECK (estatus IN ('Abierta', 'Cerrada'))
);

-- ==========================================
-- 7. MOVIMIENTOS DE CAJA (FLUJO INTERNO)
-- ==========================================
CREATE TABLE IF NOT EXISTS Movimientos_Caja (
    id BIGSERIAL PRIMARY KEY,
    caja_id BIGINT NOT NULL REFERENCES Cajas_Apertura_Cierre(id),
    tipo VARCHAR(15) NOT NULL CHECK (tipo IN ('Entrada', 'Salida', 'Devolucion', 'Bono')),
    descripcion TEXT NOT NULL,
    monto_usd NUMERIC(12, 2) DEFAULT 0.00,
    monto_ves NUMERIC(12, 2) DEFAULT 0.00,
    estacion_nombre VARCHAR(50) DEFAULT 'CAJA_PRINCIPAL',
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 8. VENTAS (HISTÓRICO TRANSACCIONAL)
-- ==========================================
CREATE SEQUENCE IF NOT EXISTS seq_factura START WITH 1;

CREATE TABLE IF NOT EXISTS Ventas (
    id BIGSERIAL PRIMARY KEY,
    factura_nro VARCHAR(50) NOT NULL UNIQUE,
    cliente_id BIGINT NOT NULL REFERENCES Clientes(id),
    usuario_id BIGINT NOT NULL REFERENCES Usuarios(id),
    caja_id BIGINT NOT NULL REFERENCES Cajas_Apertura_Cierre(id),
    estacion_nombre VARCHAR(50) DEFAULT 'CAJA_PRINCIPAL',
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subtotal_usd NUMERIC(12, 2) NOT NULL,
    descuento_usd NUMERIC(12, 2) DEFAULT 0.00,
    total_usd NUMERIC(12, 2) NOT NULL,
    total_ves NUMERIC(12, 2) NOT NULL,
    vuelto_usd NUMERIC(12, 2) DEFAULT 0.00,
    vuelto_ves NUMERIC(12, 2) DEFAULT 0.00,
    con_ticket BOOLEAN DEFAULT TRUE,
    estatus VARCHAR(10) DEFAULT 'Procesada' CHECK (estatus IN ('Procesada', 'Anulada'))
);

-- ==========================================
-- 9. DETALLE DE VENTAS
-- ==========================================
CREATE TABLE IF NOT EXISTS Ventas_Detalle (
    id BIGSERIAL PRIMARY KEY,
    venta_id BIGINT NOT NULL REFERENCES Ventas(id) ON DELETE CASCADE,
    producto_id BIGINT NOT NULL REFERENCES Productos(id),
    cantidad NUMERIC(12, 3) NOT NULL CHECK (cantidad > 0),
    precio_unitario_usd NUMERIC(12, 2) NOT NULL,
    tipo_precio VARCHAR(10),
    total_fila_usd NUMERIC(12, 2) NOT NULL
);

-- ==========================================
-- 10. PAGOS ASOCIADOS A VENTAS
-- ==========================================
CREATE TABLE IF NOT EXISTS Pagos_Venta (
    id BIGSERIAL PRIMARY KEY,
    venta_id BIGINT NOT NULL REFERENCES Ventas(id) ON DELETE CASCADE,
    metodo_pago VARCHAR(50) NOT NULL,
    monto_entregado_usd NUMERIC(12, 2) DEFAULT 0.00,
    monto_entregado_ves NUMERIC(12, 2) DEFAULT 0.00,
    monto_vuelto_usd NUMERIC(12, 2) DEFAULT 0.00,
    monto_vuelto_ves NUMERIC(12, 2) DEFAULT 0.00,
    banco_emisor VARCHAR(100),
    numero_referencia VARCHAR(50), 
    telefono_pago_movil VARCHAR(20)
);

-- ==========================================
-- 11. ABONOS DE CRÉDITO DE CLIENTES
-- ==========================================
CREATE TABLE IF NOT EXISTS Abonos (
    id BIGSERIAL PRIMARY KEY,
    cliente_id BIGINT REFERENCES Clientes(id) ON DELETE CASCADE,
    usuario_id BIGINT REFERENCES Usuarios(id) ON DELETE SET NULL,
    monto_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    monto_ves NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    metodo_pago VARCHAR(50),
    banco_emisor VARCHAR(100),
    numero_referencia VARCHAR(50),
    observacion TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 12. TRAZABILIDAD DE INVENTARIO (KARDEX / MERMAS)
-- ==========================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_movimiento_inv') THEN
    CREATE TYPE tipo_movimiento_inv AS ENUM ('Entrada', 'Salida', 'Merma', 'Venta', 'Devolucion', 'Entrada Rápida');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS Movimientos_Inventario (
    id BIGSERIAL PRIMARY KEY,
    producto_id BIGINT NOT NULL REFERENCES Productos(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES Usuarios(id),
    tipo tipo_movimiento_inv NOT NULL,
    cantidad NUMERIC(12, 3) NOT NULL CHECK (cantidad <> 0),
    stock_anterior NUMERIC(12, 3) NOT NULL,
    stock_posterior NUMERIC(12, 3) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 13. TRAZABILIDAD DE AJUSTE DE PRECIOS (AUDITORÍA)
-- ==========================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_precio_ajuste') THEN
    CREATE TYPE tipo_precio_ajuste AS ENUM ('Costo', 'Detalle', 'Mayor');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS Historial_Precios (
    id BIGSERIAL PRIMARY KEY,
    producto_id BIGINT NOT NULL REFERENCES Productos(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES Usuarios(id),
    tipo_precio tipo_precio_ajuste NOT NULL,
    precio_anterior NUMERIC(12, 2) NOT NULL,
    precio_nuevo NUMERIC(12, 2) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
