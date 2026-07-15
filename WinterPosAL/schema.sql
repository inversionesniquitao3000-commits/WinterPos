CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. CONFIGURACIÓN CENTRAL DE LA EMPRESA
-- ==========================================
CREATE TABLE Configuracion_Empresa (
    id SERIAL PRIMARY KEY,
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
    id SERIAL PRIMARY KEY,
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
    id SERIAL PRIMARY KEY,
    tasa_cobro NUMERIC(12, 4) NOT NULL CHECK (tasa_cobro > 0),
    tasa_vuelto NUMERIC(12, 4) NOT NULL CHECK (tasa_vuelto > 0),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT NOT NULL,
    CONSTRAINT fk_tasas_usuario FOREIGN KEY (usuario_id) REFERENCES Usuarios(id)
);

-- ==========================================
-- 4. CLIENTES Y GESTIÓN DE CRÉDITO
-- ==========================================
CREATE TABLE Clientes (
    id SERIAL PRIMARY KEY,
    cedula_rif VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(50),
    direccion TEXT,
    limite_credito NUMERIC(12, 2) DEFAULT 0.00 CHECK (limite_credito >= 0),
    credito_disponible NUMERIC(12, 2) DEFAULT 0.00 CHECK (credito_disponible >= 0),
    porcentaje_descuento NUMERIC(5, 2) DEFAULT 0.00 CHECK (porcentaje_descuento BETWEEN 0 AND 100),
    estado VARCHAR(10) DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo'))
);

-- ==========================================
-- 5. PRODUCTOS (INVENTARIO MAESTRO)
-- ==========================================
CREATE TABLE Productos (
    id SERIAL PRIMARY KEY,
    codigo_barras_clave VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    stock_actual INT DEFAULT 0 CHECK (stock_actual >= 0),
    stock_minimo INT DEFAULT 0 CHECK (stock_minimo >= 0),
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
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL,
    estacion_nombre VARCHAR(50) NOT NULL, -- Identifica la máquina física (ej. 'CAJA_01')
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
    id SERIAL PRIMARY KEY,
    caja_id INT NOT NULL,
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
CREATE TABLE Ventas (
    id SERIAL PRIMARY KEY,
    factura_nro VARCHAR(50) NOT NULL UNIQUE,
    cliente_id INT NOT NULL,
    usuario_id INT NOT NULL,
    caja_id INT NOT NULL,
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
    id SERIAL PRIMARY KEY,
    venta_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad INT NOT NULL CHECK (cantidad > 0),
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
    id SERIAL PRIMARY KEY,
    venta_id INT NOT NULL,
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
-- 11. TRAZABILIDAD DE INVENTARIO (KARDEX / MERMAS)
-- ==========================================
CREATE TYPE tipo_movimiento_inv AS ENUM ('Entrada', 'Salida', 'Merma', 'Venta', 'Devolucion');

CREATE TABLE Movimientos_Inventario (
    id SERIAL PRIMARY KEY,
    producto_id INT NOT NULL,
    usuario_id INT NOT NULL,
    tipo tipo_movimiento_inv NOT NULL,
    cantidad INT NOT NULL CHECK (cantidad <> 0),
    stock_anterior INT NOT NULL,
    stock_posterior INT NOT NULL,
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
    id SERIAL PRIMARY KEY,
    producto_id INT NOT NULL,
    usuario_id INT NOT NULL,
    tipo_precio tipo_precio_ajuste NOT NULL,
    precio_anterior NUMERIC(12, 2) NOT NULL,
    precio_nuevo NUMERIC(12, 2) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hist_precios_producto FOREIGN KEY (producto_id) REFERENCES Productos(id) ON DELETE CASCADE,
    CONSTRAINT fk_hist_precios_usuario FOREIGN KEY (usuario_id) REFERENCES Usuarios(id)
);

-- =========================================================================
-- LOGICA TRANSACCIONAL DE AUDITORÍA Y CONCURRENCIA (ALGORITMOS MENCIONADOS)
-- =========================================================================
--
-- ALGORITMO ProcesarVentaSegura (Bloqueo Pesimista)
-- ------------------------------------------------
-- INICIAR TRANSACCION
--   FOR EACH item IN items:
--     SELECT stock_actual, descripcion FROM Productos WHERE id = item.productoId FOR UPDATE;
--     IF stock_actual < item.cantidad THEN
--       ROLLBACK;
--       RETURN Error("Stock insuficiente");
--     END IF;
--     UPDATE Productos SET stock_actual = stock_actual - item.cantidad WHERE id = item.productoId;
--     INSERT INTO Movimientos_Inventario(producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_posterior, motivo)
--     VALUES (item.productoId, usuarioId, 'Venta', -item.cantidad, stock_anterior, stock_posterior, 'Venta Facturada');
--   END FOR;
--   ... registrar Ventas, Ventas_Detalle, Pagos_Venta
-- CONFIRMAR TRANSACCION
--
