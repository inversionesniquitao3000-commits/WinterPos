CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. CONFIGURACIÓN CENTRAL DE LA EMPRESA
-- ==========================================
CREATE TABLE Configuracion_Empresa (
    id BIGSERIAL PRIMARY KEY,
    rif VARCHAR(20) NOT NULL UNIQUE,
    nombre_comercio VARCHAR(150) NOT NULL,
    direccion TEXT NOT NULL,
    telefono VARCHAR(50) NOT NULL,
    correo VARCHAR(100),
    moneda_base VARCHAR(3) DEFAULT 'USD',
    mensaje_pie_ticket TEXT,
    metodos_pago_activos JSONB NOT NULL DEFAULT '["efectivo_usd", "efectivo_ves", "debito", "pago_movil", "biopago", "credito"]'::jsonb
);

-- ==========================================
-- 2. USUARIOS, ROLES Y AUDITORÍA
-- ==========================================
CREATE TYPE rol_usuario AS ENUM ('administrador', 'inventario', 'vendedor', 'inventario-vendedor');

CREATE TABLE Usuarios (
    id BIGSERIAL PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    clave VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    rol rol_usuario NOT NULL,
    estado VARCHAR(10) DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 3. TASAS DE CAMBIO (AUDITORÍA DIARIA)
-- ==========================================
CREATE TABLE Tasas_Cambio (
    id BIGSERIAL PRIMARY KEY,
    tasa_cobro NUMERIC(12, 4) NOT NULL CHECK (tasa_cobro > 0),
    tasa_vuelto NUMERIC(12, 4) NOT NULL CHECK (tasa_vuelto > 0),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id BIGINT NOT NULL,
    CONSTRAINT fk_tasas_usuario FOREIGN KEY (usuario_id) REFERENCES Usuarios(id)
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
    saldo_pendiente NUMERIC(12, 2) GENERATED ALWAYS AS (limite_credito - credito_disponible) STORED,
    porcentaje_descuento NUMERIC(5, 2) DEFAULT 0.00 CHECK (porcentaje_descuento BETWEEN 0 AND 100),
    estado VARCHAR(10) DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo'))
);

-- ==========================================
-- 5. PRODUCTOS (INVENTARIO MAESTRO)
-- ==========================================
CREATE TABLE Productos (
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
    imagen_url VARCHAR(512),
    estado VARCHAR(10) DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo'))
);

-- ==========================================
-- 6. CONTROL DE CAJA POR ESTACIÓN / TERMINAL
-- ==========================================
CREATE TABLE Cajas_Apertura_Cierre (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL,
    estacion_nombre VARCHAR(50) NOT NULL,
    fecha_apertura TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    monto_apertura_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    monto_apertura_ves NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    fecha_cierre TIMESTAMP,
    monto_cierre_esperado_usd NUMERIC(12, 2),
    monto_cierre_esperado_ves NUMERIC(12, 2),
    monto_cierre_real_usd NUMERIC(12, 2),
    monto_cierre_real_ves NUMERIC(12, 2),
    estatus VARCHAR(10) DEFAULT 'Abierta' CHECK (estatus IN ('Abierta', 'Cerrada')),
    CONSTRAINT fk_caja_usuario FOREIGN KEY (usuario_id) REFERENCES Usuarios(id)
);

-- ==========================================
-- 7. MOVIMIENTOS DE CAJA (FLUJO INTERNO)
-- ==========================================
CREATE TABLE Movimientos_Caja (
    id BIGSERIAL PRIMARY KEY,
    caja_id BIGINT NOT NULL,
    tipo VARCHAR(15) NOT NULL CHECK (tipo IN ('Entrada', 'Salida', 'Devolucion', 'Bono')),
    descripcion TEXT NOT NULL,
    monto_usd NUMERIC(12, 2) DEFAULT 0.00,
    monto_ves NUMERIC(12, 2) DEFAULT 0.00,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mov_caja FOREIGN KEY (caja_id) REFERENCES Cajas_Apertura_Cierre(id)
);

-- ==========================================
-- 8. VENTAS (HISTÓRICO TRANSACCIONAL)
-- ==========================================
CREATE SEQUENCE IF NOT EXISTS seq_factura START WITH 1;

CREATE TABLE Ventas (
    id BIGSERIAL PRIMARY KEY,
    factura_nro VARCHAR(50) NOT NULL UNIQUE,
    cliente_id BIGINT NOT NULL,
    usuario_id BIGINT NOT NULL,
    caja_id BIGINT NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subtotal_usd NUMERIC(12, 2) NOT NULL,
    descuento_usd NUMERIC(12, 2) DEFAULT 0.00,
    total_usd NUMERIC(12, 2) NOT NULL,
    total_ves NUMERIC(12, 2) NOT NULL,
    con_ticket BOOLEAN DEFAULT TRUE,
    estatus VARCHAR(10) DEFAULT 'Procesada' CHECK (estatus IN ('Procesada', 'Anulada')),
    CONSTRAINT fk_ventas_cliente FOREIGN KEY (cliente_id) REFERENCES Clientes(id),
    CONSTRAINT fk_ventas_usuario FOREIGN KEY (usuario_id) REFERENCES Usuarios(id),
    CONSTRAINT fk_ventas_caja FOREIGN KEY (caja_id) REFERENCES Cajas_Apertura_Cierre(id)
);

-- ==========================================
-- 9. DETALLE DE VENTAS
-- ==========================================
CREATE TABLE Ventas_Detalle (
    id BIGSERIAL PRIMARY KEY,
    venta_id BIGINT NOT NULL,
    producto_id BIGINT NOT NULL,
    cantidad NUMERIC(12, 3) NOT NULL CHECK (cantidad > 0),
    precio_unitario_usd NUMERIC(12, 2) NOT NULL,
    tipo_precio VARCHAR(10) CHECK (tipo_precio IN ('Detalle', 'Mayor')),
    total_fila_usd NUMERIC(12, 2) NOT NULL,
    CONSTRAINT fk_detalle_venta FOREIGN KEY (venta_id) REFERENCES Ventas(id) ON DELETE CASCADE,
    CONSTRAINT fk_detalle_producto FOREIGN KEY (producto_id) REFERENCES Productos(id)
);

-- ==========================================
-- 10. PAGOS ASOCIADOS (PAGO MÓVIL Y BIOPAGO)
-- ==========================================
CREATE TABLE Pagos_Venta (
    id BIGSERIAL PRIMARY KEY,
    venta_id BIGINT NOT NULL,
    metodo_pago VARCHAR(25) NOT NULL CHECK (
        metodo_pago IN ('Efectivo$', 'EfectivoBs', 'Tarjeta$', 'TarjetaBs', 'PagoMovil', 'Biopago', 'CreditoCliente')
    ),
    monto_entregado_usd NUMERIC(12, 2) DEFAULT 0.00,
    monto_entregado_ves NUMERIC(12, 2) DEFAULT 0.00,
    monto_vuelto_usd NUMERIC(12, 2) DEFAULT 0.00,
    monto_vuelto_ves NUMERIC(12, 2) DEFAULT 0.00,
    banco_emisor VARCHAR(100),
    numero_referencia VARCHAR(50), 
    telefono_pago_movil VARCHAR(20),
    CONSTRAINT fk_pagos_venta FOREIGN KEY (venta_id) REFERENCES Ventas(id) ON DELETE CASCADE
);

-- ==========================================
-- 10.1 ABONOS DE CLIENTES
-- ==========================================
CREATE TABLE IF NOT EXISTS Abonos (
    id BIGSERIAL PRIMARY KEY,
    cliente_id BIGINT REFERENCES Clientes(id) ON DELETE CASCADE,
    usuario_id BIGINT REFERENCES Usuarios(id) ON DELETE SET NULL,
    monto_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
    monto_ves NUMERIC(12, 2) NOT NULL DEFAULT 0,
    metodo_pago VARCHAR(50),
    banco_emisor VARCHAR(100),
    numero_referencia VARCHAR(50),
    observacion TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 11. TRAZABILIDAD DE INVENTARIO (KARDEX / MERMAS)
-- ==========================================
CREATE TYPE tipo_movimiento_inv AS ENUM ('Entrada', 'Salida', 'Merma', 'Venta', 'Devolucion', 'Entrada Rápida');

CREATE TABLE Movimientos_Inventario (
    id BIGSERIAL PRIMARY KEY,
    producto_id BIGINT NOT NULL,
    usuario_id BIGINT NOT NULL,
    tipo tipo_movimiento_inv NOT NULL,
    cantidad NUMERIC(12, 3) NOT NULL CHECK (cantidad <> 0),
    stock_anterior NUMERIC(12, 3) NOT NULL,
    stock_posterior NUMERIC(12, 3) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mov_inv_producto FOREIGN KEY (producto_id) REFERENCES Productos(id) ON DELETE CASCADE,
    CONSTRAINT fk_mov_inv_usuario FOREIGN KEY (usuario_id) REFERENCES Usuarios(id)
);

-- ==========================================
-- 12. TRAZABILIDAD DE AJUSTE DE PRECIOS (AUDITORÍA)
-- ==========================================
CREATE TYPE tipo_precio_ajuste AS ENUM ('Costo', 'Detalle', 'Mayor');

CREATE TABLE Historial_Precios (
    id BIGSERIAL PRIMARY KEY,
    producto_id BIGINT NOT NULL,
    usuario_id BIGINT NOT NULL,
    tipo_precio tipo_precio_ajuste NOT NULL,
    precio_anterior NUMERIC(12, 2) NOT NULL,
    precio_nuevo NUMERIC(12, 2) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hist_precios_producto FOREIGN KEY (producto_id) REFERENCES Productos(id) ON DELETE CASCADE,
    CONSTRAINT fk_hist_precios_usuario FOREIGN KEY (usuario_id) REFERENCES Usuarios(id)
);

-- ==========================================
-- 13. ABONOS DE CRÉDITO DE CLIENTES
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
-- 14. PROVEEDORES (DIRECTORIO MAESTRO)
-- ==========================================
CREATE TABLE IF NOT EXISTS Proveedores (
    id BIGSERIAL PRIMARY KEY,
    rif VARCHAR(30) NOT NULL UNIQUE,
    razon_social VARCHAR(150) NOT NULL,
    contacto_nombre VARCHAR(100),
    telefono VARCHAR(50) NOT NULL,
    correo VARCHAR(100),
    direccion TEXT,
    dias_credito INT DEFAULT 0 CHECK (dias_credito >= 0),
    limite_credito_usd NUMERIC(12, 2) DEFAULT 0.00 CHECK (limite_credito_usd >= 0),
    saldo_pendiente_usd NUMERIC(12, 2) DEFAULT 0.00 CHECK (saldo_pendiente_usd >= 0),
    estado VARCHAR(10) DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 15. COMPRAS Y RECEPCIÓN DE MERCANCÍA
-- ==========================================
CREATE TABLE IF NOT EXISTS Compras (
    id BIGSERIAL PRIMARY KEY,
    numero_factura VARCHAR(50) NOT NULL,
    proveedor_id BIGINT NOT NULL REFERENCES Proveedores(id) ON DELETE RESTRICT,
    usuario_id BIGINT NOT NULL REFERENCES Usuarios(id),
    fecha_emision TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_vencimiento TIMESTAMP,
    condicion_pago VARCHAR(20) DEFAULT 'Contado' CHECK (condicion_pago IN ('Contado', 'Credito')),
    subtotal_usd NUMERIC(12, 2) NOT NULL,
    impuesto_usd NUMERIC(12, 2) DEFAULT 0.00,
    descuento_usd NUMERIC(12, 2) DEFAULT 0.00,
    total_usd NUMERIC(12, 2) NOT NULL,
    total_ves NUMERIC(12, 2) NOT NULL,
    saldo_pendiente_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    estatus VARCHAR(20) DEFAULT 'Pendiente' CHECK (estatus IN ('Pendiente', 'Parcial', 'Pagada', 'Anulada')),
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 16. DETALLE DE COMPRAS
-- ==========================================
CREATE TABLE IF NOT EXISTS Compras_Detalle (
    id BIGSERIAL PRIMARY KEY,
    compra_id BIGINT NOT NULL REFERENCES Compras(id) ON DELETE CASCADE,
    producto_id BIGINT NOT NULL REFERENCES Productos(id),
    cantidad NUMERIC(12, 3) NOT NULL CHECK (cantidad > 0),
    costo_unitario_usd NUMERIC(12, 2) NOT NULL CHECK (costo_unitario_usd >= 0),
    total_usd NUMERIC(12, 2) NOT NULL
);

-- ==========================================
-- 17. PAGOS Y ABONOS A PROVEEDORES (CXP)
-- ==========================================
CREATE TABLE IF NOT EXISTS Pagos_Proveedores (
    id BIGSERIAL PRIMARY KEY,
    compra_id BIGINT REFERENCES Compras(id) ON DELETE SET NULL,
    proveedor_id BIGINT NOT NULL REFERENCES Proveedores(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES Usuarios(id),
    caja_id BIGINT REFERENCES Cajas_Apertura_Cierre(id) ON DELETE SET NULL,
    monto_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    monto_ves NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tasa_cambio NUMERIC(12, 4) NOT NULL,
    metodo_pago VARCHAR(50) NOT NULL,
    banco_origen VARCHAR(100),
    numero_referencia VARCHAR(50),
    afecto_caja_efectivo BOOLEAN DEFAULT FALSE,
    observacion TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 18. COTIZACIONES DE PROVEEDORES
-- ==========================================
CREATE TABLE IF NOT EXISTS Cotizaciones_Proveedores (
    id BIGSERIAL PRIMARY KEY,
    numero_cotizacion VARCHAR(50),
    proveedor_id BIGINT NOT NULL REFERENCES Proveedores(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES Usuarios(id),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_vigencia TIMESTAMP,
    total_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_ves NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    detalles_json JSONB NOT NULL,
    estatus VARCHAR(20) DEFAULT 'Pendiente' CHECK (estatus IN ('Pendiente', 'Aprobada', 'Rechazada', 'Convertida'))
);

-- ==========================================
-- 19. REPOSITORIO DE DOCUMENTOS DE LA EMPRESA
-- ==========================================
CREATE TABLE IF NOT EXISTS Documentos_Empresa (
    id BIGSERIAL PRIMARY KEY,
    categoria VARCHAR(50) NOT NULL CHECK (categoria IN ('SENIAT', 'MERCANTIL', 'MUNICIPAL', 'PARAFISCAL', 'OTROS')),
    titulo VARCHAR(150) NOT NULL,
    descripcion TEXT,
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta_archivo TEXT NOT NULL,
    mime_type VARCHAR(100),
    tamano_bytes BIGINT DEFAULT 0,
    fecha_emision DATE,
    fecha_vencimiento DATE,
    estatus VARCHAR(20) DEFAULT 'Vigente' CHECK (estatus IN ('Vigente', 'Vencido', 'En Tramite')),
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documentos_categoria ON Documentos_Empresa(categoria);
CREATE INDEX IF NOT EXISTS idx_documentos_vencimiento ON Documentos_Empresa(fecha_vencimiento);
