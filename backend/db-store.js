import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { initDatabase } from './init-db.js';
import { 
  mockUsers, mockProducts, mockClients, mockTasaHistory, mockConfig 
} from './mockData.js';

dotenv.config();

const { Pool, types } = pg;
// Force pg to return timestamp strings directly without shifting to UTC Date objects
types.setTypeParser(1114, str => str); // TIMESTAMP
types.setTypeParser(1184, str => str); // TIMESTAMPTZ
types.setTypeParser(1082, str => str); // DATE

const DATA_DIR = path.resolve('./data');

// Ensure data directory exists for JSON storage
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Local timezone Date/Time formatter helper
function getLocalISODateString(d = new Date()) {
  if (!d) return '';
  let dateObj = d;
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (!trimmed) return '';
    
    // 1. Date-only format: YYYY-MM-DD -> return as-is (do NOT parse as UTC midnight)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    
    // 2. Local date-time format: YYYY-MM-DD HH:mm or YYYY-MM-DD HH:mm:ss -> return YYYY-MM-DD HH:mm as-is
    if (/^\d{4}-\d{2}-\d{2}[\sT]+\d{2}:\d{2}/.test(trimmed) && !trimmed.includes('Z') && !trimmed.includes('+')) {
      return trimmed.replace('T', ' ').substring(0, 16);
    }
    
    // 3. ISO format with explicit UTC timezone (Z or offset): parse to convert UTC to local system time
    if (trimmed.includes('Z') || (trimmed.includes('+') && !trimmed.startsWith('+'))) {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        dateObj = parsed;
      } else {
        return trimmed.replace('T', ' ').substring(0, 16);
      }
    } else {
      return trimmed.replace('T', ' ').substring(0, 16);
    }
  }
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return '';
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
}

let usePostgres = false;
let pool = null;

const sysTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas';

// Initialize PostgreSQL connection pool
try {
  // First ensure DB service is running and schema tables exist
  await initDatabase();

  pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_DATABASE,
    max: 30,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  // Try to connect to test if Postgres is accessible with configured user/pass
  const client = await pool.connect();
  await client.query(`SET TIME ZONE '${sysTimeZone}'`).catch(() => {});
  console.log(`✅ Base de datos central PostgreSQL conectada (Zona Horaria: ${sysTimeZone}).`);
  usePostgres = true;

  // Auto-adjust existing UTC timestamps created today that were shifted ahead
  try {
    await client.query(`
      UPDATE Ventas SET fecha = fecha - INTERVAL '4 hours' WHERE fecha > NOW();
      UPDATE Movimientos_Inventario SET fecha = fecha - INTERVAL '4 hours' WHERE fecha > NOW();
      UPDATE Cajas_Apertura_Cierre SET fecha_apertura = fecha_apertura - INTERVAL '4 hours' WHERE fecha_apertura > NOW();
      UPDATE Cajas_Apertura_Cierre SET fecha_cierre = fecha_cierre - INTERVAL '4 hours' WHERE fecha_cierre IS NOT NULL AND fecha_cierre > NOW();
    `);
  } catch (tzFixErr) {
    // Ignore if timestamps are already local
  }
  
  // Run schema migration to add new closure fields and high-performance indexes if they do not exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS Roles (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) UNIQUE,
      permisos TEXT
    );
    CREATE TABLE IF NOT EXISTS Tasas_Cambio (
      id SERIAL PRIMARY KEY,
      tasa_cobro NUMERIC(10,2) NOT NULL,
      tasa_vuelto NUMERIC(10,2) NOT NULL,
      fecha_actualizacion VARCHAR(50) NOT NULL,
      usuario_id INT REFERENCES Usuarios(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS Abonos (
      id SERIAL PRIMARY KEY,
      cliente_id INT REFERENCES Clientes(id) ON DELETE CASCADE,
      usuario_id INT REFERENCES Usuarios(id) ON DELETE SET NULL,
      monto_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
      monto_ves NUMERIC(12,2) NOT NULL DEFAULT 0,
      metodo_pago VARCHAR(50),
      banco_emisor VARCHAR(100),
      numero_referencia VARCHAR(50),
      observacion TEXT,
      fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- ==========================================
    -- HIGH PERFORMANCE INDEXES FOR PRODUCTION POS
    -- ==========================================
    CREATE INDEX IF NOT EXISTS idx_ventas_caja_id ON Ventas(caja_id);
    CREATE INDEX IF NOT EXISTS idx_ventas_cliente_id ON Ventas(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_ventas_usuario_id ON Ventas(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON Ventas(fecha);
    CREATE INDEX IF NOT EXISTS idx_ventas_factura_nro ON Ventas(factura_nro);
    CREATE INDEX IF NOT EXISTS idx_ventas_id_desc ON Ventas(id DESC);

    CREATE INDEX IF NOT EXISTS idx_ventas_detalle_venta_id ON Ventas_Detalle(venta_id);
    CREATE INDEX IF NOT EXISTS idx_ventas_detalle_producto_id ON Ventas_Detalle(producto_id);

    CREATE INDEX IF NOT EXISTS idx_pagos_venta_venta_id ON Pagos_Venta(venta_id);

    CREATE INDEX IF NOT EXISTS idx_movimientos_caja_caja_id ON Movimientos_Caja(caja_id);
    CREATE INDEX IF NOT EXISTS idx_movimientos_inv_producto_id ON Movimientos_Inventario(producto_id);

    CREATE INDEX IF NOT EXISTS idx_productos_barcode ON Productos(codigo_barras_clave);
    CREATE INDEX IF NOT EXISTS idx_clientes_cedula ON Clientes(cedula_rif);
    CREATE INDEX IF NOT EXISTS idx_abonos_cliente_id ON Abonos(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_cajas_estatus ON Cajas_Apertura_Cierre(estatus);
    CREATE INDEX IF NOT EXISTS idx_cajas_estatus_usuario ON Cajas_Apertura_Cierre(estatus, usuario_id);
    CREATE INDEX IF NOT EXISTS idx_cajas_estatus_terminal ON Cajas_Apertura_Cierre(estatus, estacion_nombre);

    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS venta_total_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS utilidad_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS detalles_json TEXT;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS vuelto_entregado_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS vuelto_entregado_ves NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS ventas_efectivo_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS ventas_efectivo_ves NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS abono_clientes_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS abono_clientes_ves NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS entrada_efectivo_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS entrada_efectivo_ves NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS salida_efectivo_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS salida_efectivo_ves NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS devolucion_efectivo_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS devolucion_efectivo_ves NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Clientes ADD COLUMN IF NOT EXISTS aplica_precio_costo BOOLEAN DEFAULT FALSE;
    ALTER TABLE IF EXISTS Clientes ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(12, 2) GENERATED ALWAYS AS (limite_credito - credito_disponible) STORED;
    ALTER TABLE IF EXISTS Ventas_Detalle DROP CONSTRAINT IF EXISTS ventas_detalle_tipo_precio_check;
    ALTER TABLE IF EXISTS Pagos_Venta DROP CONSTRAINT IF EXISTS pagos_venta_metodo_pago_check;
    ALTER TABLE IF EXISTS Abonos DROP CONSTRAINT IF EXISTS abonos_metodo_pago_check;
    ALTER TABLE IF EXISTS Abonos ADD COLUMN IF NOT EXISTS caja_id INT REFERENCES Cajas_Apertura_Cierre(id) ON DELETE SET NULL;
    ALTER TABLE IF EXISTS Usuarios ADD COLUMN IF NOT EXISTS clave VARCHAR(100) DEFAULT 'admin';
    ALTER TABLE IF EXISTS Usuarios ADD COLUMN IF NOT EXISTS permisos TEXT;
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS estacion_nombre VARCHAR(50) DEFAULT 'CAJA_PRINCIPAL';
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS vuelto_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS vuelto_ves NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(30) DEFAULT 'FACTURA_FISCAL';
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS nro_fiscal VARCHAR(50);
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS serial_fiscal VARCHAR(50);
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS nro_z VARCHAR(20);
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS estatus_fiscal VARCHAR(20) DEFAULT 'NO_APLICA';
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS base_imponible_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS iva_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS exento_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Ventas ADD COLUMN IF NOT EXISTS igtf_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Pagos_Venta ADD COLUMN IF NOT EXISTS monto_vuelto_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Pagos_Venta ADD COLUMN IF NOT EXISTS monto_vuelto_ves NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Movimientos_Caja ADD COLUMN IF NOT EXISTS estacion_nombre VARCHAR(50) DEFAULT 'CAJA_PRINCIPAL';
    ALTER TABLE IF EXISTS Movimientos_Caja ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(50) DEFAULT 'EFECTIVO';
    ALTER TABLE IF EXISTS Movimientos_Caja ADD COLUMN IF NOT EXISTS comision_ves NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Movimientos_Caja ADD COLUMN IF NOT EXISTS comision_usd NUMERIC DEFAULT 0;
    ALTER TABLE IF EXISTS Productos ADD COLUMN IF NOT EXISTS a_granel BOOLEAN DEFAULT FALSE;
    ALTER TABLE IF EXISTS Productos ADD COLUMN IF NOT EXISTS fecha_vencimiento VARCHAR(50);
    ALTER TABLE IF EXISTS Productos ALTER COLUMN imagen_url TYPE TEXT;
    ALTER TABLE IF EXISTS Configuracion_Empresa ADD COLUMN IF NOT EXISTS permitir_multisesion BOOLEAN DEFAULT TRUE;
    CREATE TABLE IF NOT EXISTS Gastos_Operativos (
      id SERIAL PRIMARY KEY,
      concepto VARCHAR(150) NOT NULL,
      monto_usd NUMERIC(10,2) NOT NULL,
      fecha VARCHAR(50) NOT NULL,
      observacion TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    UPDATE Gastos_Operativos SET fecha = '2026-08-05' WHERE fecha LIKE '2026-08-04%' OR fecha LIKE '%20:00%';
    ALTER TABLE IF EXISTS Configuracion_Empresa ADD COLUMN IF NOT EXISTS compartir_apertura_caja BOOLEAN DEFAULT TRUE;
    ALTER TABLE IF EXISTS Configuracion_Empresa ADD COLUMN IF NOT EXISTS master_pass VARCHAR(255) DEFAULT '1234';
    ALTER TABLE IF EXISTS Configuracion_Empresa ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '';
    ALTER TABLE IF EXISTS Configuracion_Empresa ADD COLUMN IF NOT EXISTS gdrive_config TEXT;
    ALTER TABLE IF EXISTS Configuracion_Empresa ADD COLUMN IF NOT EXISTS whatsapp_config TEXT;
    ALTER TABLE IF EXISTS Configuracion_Empresa ADD COLUMN IF NOT EXISTS moneda_ticket_default VARCHAR(10) DEFAULT 'USD';

    CREATE TABLE IF NOT EXISTS Accionistas (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL UNIQUE,
      cedula_rif VARCHAR(50),
      telefono VARCHAR(50),
      estado VARCHAR(10) DEFAULT 'Activo',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Inversiones_Accionistas (
      id SERIAL PRIMARY KEY,
      accionista_id INT REFERENCES Accionistas(id) ON DELETE CASCADE,
      fecha VARCHAR(50) NOT NULL,
      monto_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
      observacion TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Proveedores (
      id BIGSERIAL PRIMARY KEY,
      rif VARCHAR(30) NOT NULL UNIQUE,
      razon_social VARCHAR(150) NOT NULL,
      contacto_nombre VARCHAR(100),
      telefono VARCHAR(50) NOT NULL,
      correo VARCHAR(100),
      direccion TEXT,
      dias_credito INT DEFAULT 0,
      limite_credito_usd NUMERIC(12, 2) DEFAULT 0.00,
      saldo_pendiente_usd NUMERIC(12, 2) DEFAULT 0.00,
      estado VARCHAR(10) DEFAULT 'Activo',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Compras (
      id BIGSERIAL PRIMARY KEY,
      numero_factura VARCHAR(50) NOT NULL,
      proveedor_id BIGINT REFERENCES Proveedores(id) ON DELETE RESTRICT,
      usuario_id BIGINT REFERENCES Usuarios(id),
      fecha_emision TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_vencimiento TIMESTAMP,
      condicion_pago VARCHAR(20) DEFAULT 'Contado',
      subtotal_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      impuesto_usd NUMERIC(12, 2) DEFAULT 0.00,
      descuento_usd NUMERIC(12, 2) DEFAULT 0.00,
      total_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      total_ves NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      saldo_pendiente_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      estatus VARCHAR(20) DEFAULT 'Pendiente',
      observaciones TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Compras_Detalle (
      id BIGSERIAL PRIMARY KEY,
      compra_id BIGINT REFERENCES Compras(id) ON DELETE CASCADE,
      producto_id BIGINT REFERENCES Productos(id),
      cantidad NUMERIC(12, 3) NOT NULL,
      costo_unitario_usd NUMERIC(12, 2) NOT NULL,
      total_usd NUMERIC(12, 2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Pagos_Proveedores (
      id BIGSERIAL PRIMARY KEY,
      compra_id BIGINT REFERENCES Compras(id) ON DELETE SET NULL,
      proveedor_id BIGINT REFERENCES Proveedores(id) ON DELETE CASCADE,
      usuario_id BIGINT REFERENCES Usuarios(id),
      caja_id BIGINT REFERENCES Cajas_Apertura_Cierre(id) ON DELETE SET NULL,
      monto_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      monto_ves NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      tasa_cambio NUMERIC(12, 4) NOT NULL DEFAULT 1.0000,
      metodo_pago VARCHAR(50) NOT NULL,
      banco_origen VARCHAR(100),
      numero_referencia VARCHAR(50),
      afecto_caja_efectivo BOOLEAN DEFAULT FALSE,
      observacion TEXT,
      fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Cotizaciones_Proveedores (
      id BIGSERIAL PRIMARY KEY,
      numero_cotizacion VARCHAR(50),
      proveedor_id BIGINT REFERENCES Proveedores(id) ON DELETE CASCADE,
      usuario_id BIGINT REFERENCES Usuarios(id),
      fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_vigencia TIMESTAMP,
      total_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      total_ves NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      detalles_json JSONB NOT NULL,
      estatus VARCHAR(20) DEFAULT 'Pendiente'
    );

    CREATE SEQUENCE IF NOT EXISTS seq_factura START WITH 1;
    UPDATE Cajas_Apertura_Cierre 
    SET estatus = 'Cerrada', fecha_cierre = CURRENT_TIMESTAMP 
    WHERE estatus = 'Abierta' 
      AND id NOT IN (
        SELECT MAX(id) FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' GROUP BY usuario_id
      );

    DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'usuarios') THEN
        ALTER TABLE Usuarios ALTER COLUMN rol TYPE VARCHAR(100) USING rol::text;
        PERFORM setval(pg_get_serial_sequence('Usuarios', 'id'), COALESCE((SELECT MAX(id) FROM Usuarios), 1));
      END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'roles') THEN
        PERFORM setval(pg_get_serial_sequence('Roles', 'id'), COALESCE((SELECT MAX(id) FROM Roles), 1));
      END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'productos') THEN
        ALTER TABLE Productos ADD COLUMN IF NOT EXISTS porcentaje_impuesto NUMERIC DEFAULT 0;
        UPDATE Productos SET porcentaje_impuesto = 16 WHERE exento_impuesto = FALSE AND (porcentaje_impuesto IS NULL OR porcentaje_impuesto = 0);
        UPDATE Productos SET porcentaje_impuesto = 0 WHERE exento_impuesto = TRUE;
        PERFORM setval(pg_get_serial_sequence('Productos', 'id'), COALESCE((SELECT MAX(id) FROM Productos), 1));
      END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'clientes') THEN
        PERFORM setval(pg_get_serial_sequence('Clientes', 'id'), COALESCE((SELECT MAX(id) FROM Clientes), 1));
      END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'abonos') THEN
        ALTER TABLE Abonos ALTER COLUMN cliente_id TYPE BIGINT;
        ALTER TABLE Abonos ALTER COLUMN usuario_id TYPE BIGINT;
        UPDATE Abonos a
        SET caja_id = (
          SELECT c.id FROM Cajas_Apertura_Cierre c
          WHERE (c.usuario_id = a.usuario_id OR a.usuario_id IS NULL)
            AND c.fecha_apertura <= a.fecha
          ORDER BY c.id DESC
          LIMIT 1
        )
        WHERE a.caja_id IS NULL;
      END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'ventas') THEN
        PERFORM setval(pg_get_serial_sequence('Ventas', 'id'), COALESCE((SELECT MAX(id) FROM Ventas), 1));
        PERFORM setval('seq_factura', COALESCE((SELECT MAX(CAST(NULLIF(regexp_replace(factura_nro, '[^0-9]', '', 'g'), '') AS INTEGER)) FROM Ventas WHERE factura_nro LIKE 'FAC-%'), 1));
      END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'tasas_cambio') THEN
        PERFORM setval(pg_get_serial_sequence('Tasas_Cambio', 'id'), COALESCE((SELECT MAX(id) FROM Tasas_Cambio), 1));
        DELETE FROM Tasas_Cambio WHERE fecha_actualizacion IN ('2026-07-10 08:15', '2026-07-10 14:00', '2026-07-15 08:05');
      END IF;
      IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'cajas_apertura_cierre') THEN
        UPDATE Cajas_Apertura_Cierre SET fecha_cierre = COALESCE(fecha_cierre, fecha_apertura, CURRENT_TIMESTAMP) WHERE fecha_cierre IS NULL;
        UPDATE Cajas_Apertura_Cierre SET estatus = 'Cerrada' WHERE (monto_cierre_real_usd IS NOT NULL OR detalles_json IS NOT NULL) AND (estatus IS NULL OR estatus = 'Abierta');
      END IF;
    END $$;
  `);

  // Alter enum type outside of main multi-statement query to prevent implicit transaction block errors in Postgres
  try {
    await client.query("ALTER TYPE tipo_movimiento_inv ADD VALUE IF NOT EXISTS 'Entrada Rápida'");
  } catch (enumErr) {
    console.log("ℹ️ Nota: No se pudo alterar tipo_movimiento_inv (puede que ya exista o no sea compatible):", enumErr.message);
  }
  
  console.log('📋 Migración de base de datos PostgreSQL completada (columnas de cierres verificadas).');

  // Sync master_pass from config.json → PG (one-time migration if DB column is NULL)
  try {
    const mpRow = await client.query('SELECT id, master_pass FROM Configuracion_Empresa ORDER BY id DESC LIMIT 1');
    if (mpRow.rowCount > 0 && !mpRow.rows[0].master_pass) {
      const jsonPath = path.join(path.resolve('./data'), 'config.json');
      let jsonPass = '1234';
      if (fs.existsSync(jsonPath)) {
        try {
          const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          if (jsonData.master_pass) jsonPass = jsonData.master_pass;
        } catch (_) {}
      }
      await client.query('UPDATE Configuracion_Empresa SET master_pass = $1 WHERE id = $2', [jsonPass, mpRow.rows[0].id]);
      console.log(`🔑 Master Pass sincronizado a PostgreSQL: (valor restaurado desde respaldo).`);
    } else if (mpRow.rowCount > 0) {
      console.log(`🔑 Master Pass ya configurado en PostgreSQL.`);
    }
  } catch (mpErr) {
    console.warn('⚠️ No se pudo sincronizar master_pass:', mpErr.message);
  }

  client.release();
} catch (err) {
  console.warn('⚠️ No se pudo conectar a PostgreSQL. Usando almacenamiento JSON local centralizado en el servidor.');
  console.warn('Detalle del error:', err.message);
  usePostgres = false;
}

// Helper functions for JSON database fallback
function getJsonPath(filename) {
  return path.join(DATA_DIR, filename);
}

export function readJsonFile(filename, defaultValue) {
  const filePath = getJsonPath(filename);
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      if (defaultValue !== undefined) {
        try {
          fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
        } catch (e) {
          console.warn(`No se pudo inicializar ${filename} en disco:`, e.message);
        }
      }
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error al leer archivo JSON ${filename}:`, err);
    return defaultValue;
  }
}

export function writeJsonFile(filename, data) {
  const filePath = getJsonPath(filename);
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error al escribir archivo JSON ${filename}:`, err);
  }
}

// In-memory cache for company config to prevent redundant DB roundtrips on checkout
let _cachedCompanyConfig = null;
let _cachedCompanyConfigTimestamp = 0;

export function invalidateCompanyConfigCache() {
  _cachedCompanyConfig = null;
  _cachedCompanyConfigTimestamp = 0;
}

// CORE DATA ACCESS METHODS (Dual Mode: PostgreSQL / JSON)
export async function getCompanyConfig() {
  const now = Date.now();
  if (_cachedCompanyConfig && (now - _cachedCompanyConfigTimestamp < 30000)) {
    return _cachedCompanyConfig;
  }
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT * FROM Configuracion_Empresa ORDER BY id DESC LIMIT 1');
      if (res.rowCount > 0) {
        const row = res.rows[0];
        _cachedCompanyConfig = {
          rif: row.rif,
          nombre_comercio: row.nombre_comercio,
          direccion: row.direccion,
          telefono: row.telefono,
          correo: row.correo,
          moneda_base: row.moneda_base,
          mensaje_pie_ticket: row.mensaje_pie_ticket,
          metodos_pago_activos: row.metodos_pago_activos,
          permitir_multisesion: row.permitir_multisesion !== false,
          compartir_apertura_caja: row.compartir_apertura_caja !== false,
          logo_url: row.logo_url || '',
          moneda_ticket_default: row.moneda_ticket_default || 'USD'
        };
        _cachedCompanyConfigTimestamp = now;
        return _cachedCompanyConfig;
      }
    } catch (err) {
      console.error('Error en getCompanyConfig (Postgres):', err.message);
    }
  }
  const c = readJsonFile('config.json', null);
  if (!c) {
    return { ...mockConfig };
  }
  _cachedCompanyConfig = {
    rif: c.rif ?? '',
    nombre_comercio: c.nombre_comercio ?? '',
    direccion: c.direccion ?? '',
    telefono: c.telefono ?? '',
    correo: c.correo ?? '',
    moneda_base: c.moneda_base || 'USD',
    mensaje_pie_ticket: c.mensaje_pie_ticket ?? '',
    metodos_pago_activos: c.metodos_pago_activos || [],
    permitir_multisesion: c.permitir_multisesion !== false,
    compartir_apertura_caja: c.compartir_apertura_caja !== false,
    logo_url: c.logo_url || '',
    moneda_ticket_default: c.moneda_ticket_default || 'USD'
  };
  _cachedCompanyConfigTimestamp = now;
  return _cachedCompanyConfig;
}

export async function saveCompanyConfig(config) {
  invalidateCompanyConfigCache();
  if (usePostgres) {
    try {
      const existing = await pool.query('SELECT id FROM Configuracion_Empresa ORDER BY id DESC LIMIT 1');
      const pMulti = config.permitir_multisesion !== false;
      const cApertura = config.compartir_apertura_caja !== false;
      const mTicket = config.moneda_ticket_default || 'USD';
      if (existing.rowCount > 0) {
        await pool.query(
          `UPDATE Configuracion_Empresa SET 
            rif = $1, nombre_comercio = $2, direccion = $3, telefono = $4, 
            correo = $5, moneda_base = $6, mensaje_pie_ticket = $7, metodos_pago_activos = $8,
            permitir_multisesion = $9, compartir_apertura_caja = $10, logo_url = $11, moneda_ticket_default = $12
           WHERE id = $13`,
          [config.rif, config.nombre_comercio, config.direccion, config.telefono, config.correo, config.moneda_base, config.mensaje_pie_ticket, JSON.stringify(config.metodos_pago_activos), pMulti, cApertura, config.logo_url || '', mTicket, existing.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO Configuracion_Empresa (rif, nombre_comercio, direccion, telefono, correo, moneda_base, mensaje_pie_ticket, metodos_pago_activos, permitir_multisesion, compartir_apertura_caja, logo_url, moneda_ticket_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [config.rif, config.nombre_comercio, config.direccion, config.telefono, config.correo, config.moneda_base, config.mensaje_pie_ticket, JSON.stringify(config.metodos_pago_activos), pMulti, cApertura, config.logo_url || '', mTicket]
        );
      }
      return config;
    } catch (err) {
      console.error('Error en saveCompanyConfig (Postgres):', err.message);
    }
  }
  writeJsonFile('config.json', config);
  return config;
}

// Google Drive Configuration persistence (Dual Mode: PostgreSQL / JSON)
const defaultGDriveConfig = {
  enabled: false,
  method: 'WEBHOOK', // 'WEBHOOK' | 'ACCESS_TOKEN'
  webhookUrl: '',
  folderId: '',
  folderName: 'WinterPOS_Backups',
  accessToken: '',
  lastSync: null,
  lastStatus: 'PENDING'
};

export async function getGDriveConfigDb() {
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT gdrive_config FROM Configuracion_Empresa ORDER BY id DESC LIMIT 1');
      if (res.rowCount > 0 && res.rows[0].gdrive_config) {
        try {
          const parsed = typeof res.rows[0].gdrive_config === 'string'
            ? JSON.parse(res.rows[0].gdrive_config)
            : res.rows[0].gdrive_config;
          return { ...defaultGDriveConfig, ...parsed };
        } catch (_) {}
      }
    } catch (err) {
      console.error('Error en getGDriveConfigDb (Postgres):', err.message);
    }
  }
  return readJsonFile('gdrive_config.json', defaultGDriveConfig);
}

export async function saveGDriveConfigDb(config) {
  const current = await getGDriveConfigDb();
  const merged = { ...defaultGDriveConfig, ...current, ...config };
  if (usePostgres) {
    try {
      const existing = await pool.query('SELECT id FROM Configuracion_Empresa ORDER BY id DESC LIMIT 1');
      if (existing.rowCount > 0) {
        await pool.query(
          'UPDATE Configuracion_Empresa SET gdrive_config = $1 WHERE id = $2',
          [JSON.stringify(merged), existing.rows[0].id]
        );
      }
    } catch (err) {
      console.error('Error en saveGDriveConfigDb (Postgres):', err.message);
    }
  }
  writeJsonFile('gdrive_config.json', merged);
  return { ok: true, config: merged };
}

// WhatsApp Configuration persistence (Dual Mode: PostgreSQL / JSON)
const defaultWhatsAppConfig = {
  enabled: false,
  groupId: '',
  groupName: 'Grupo de Cierres POS',
  messageTemplate: `📊 *REPORTE DE ARQUEO Y CIERRE DE CAJA*

📅 *Fecha:* {fecha}
👤 *Cajero:* {usuario}
🖥️ *Terminal:* {terminal}

💵 *EFECTIVO ESPERADO EN GAVETA:*
• Dólares (USD): $ {dineroEnCajaExpected}
• Bolívares (VES): Bs {expectedVes}

📥 *EFECTIVO FÍSICO RECIBIDO:*
• Dólares (USD): $ {realUsd}
• Bolívares (VES): Bs {realVes}

⚖️ *DIFERENCIA (BALANCE):*
• Dólares (USD): {diffUsd}
• Bolívares (VES): {diffVes}

🛍️ *VENTAS TOTALES DEL TURNO:* $ {ventaTotalUsd} USD
📉 *DESCUENTOS APLICADOS:* $ {descuentosUsd} USD

*WinterPosAL Cloud System*`,
  utilidadesMessageTemplate: `💼 *REPORTE DE UTILIDADES Y GASTOS OPERATIVOS*
🏬 *{empresa}*
📅 *Fecha:* {fecha}
💱 *Tasa BCV:* {tasaBcv} Bs/USD

📊 *RESUMEN FINANCIERO:*
📈 *Utilidad Bruta:* ${'{utilidadBrutaUsd}'} USD | Bs {utilidadBrutaVes} VES
🔻 *(-) Gastos Deducibles:* -${'{totalGastosUsd}'} USD | -Bs {totalGastosVes} VES
💰 *(=) Utilidad Neta Distribuable:* *${'{utilidadNetaUsd}'} USD* | *Bs {utilidadNetaVes} VES*

📝 *DESGLOSE DE GASTOS OPERATIVOS ({cantGastos}):*
{desgloseGastos}

👥 *MONTO A COBRAR POR ACCIONISTA:*
{desgloseAccionistas}`,
  cobroClientesMessageTemplate: `👤 *RECORDATORIO DE PAGO DE CUENTA*

🏬 *{empresa}*
📅 *Fecha:* {fecha}
👤 *Cliente:* {cliente}
🆔 *Cédula/RIF:* {cedulaRif}

🚨 *Estimado(a) cliente, le enviamos un cordial saludo para recordarle su estado de cuenta:*

💰 *Monto Adeudado:* *${'{saldoPendienteUsd}'} USD*
🇻🇪 *Monto en Bolívares (Tasa BCV {tasaBcv}):* *Bs {saldoPendienteVes}*

💳 *Límite de Crédito:* ${'{limiteCreditoUsd}'} USD
✅ *Crédito Disponible:* ${'{creditoDisponibleUsd}'} USD

🙏 *Agradecemos realizar su abono a la brevedad posible para mantener activo su margen de crédito. ¡Gracias por su preferencia!*`
};

export async function getWhatsConfigDb() {
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT whatsapp_config FROM Configuracion_Empresa ORDER BY id DESC LIMIT 1');
      if (res.rowCount > 0 && res.rows[0].whatsapp_config) {
        try {
          const parsed = typeof res.rows[0].whatsapp_config === 'string'
            ? JSON.parse(res.rows[0].whatsapp_config)
            : res.rows[0].whatsapp_config;
          return { ...defaultWhatsAppConfig, ...parsed };
        } catch (_) {}
      }
    } catch (err) {
      console.error('Error en getWhatsConfigDb (Postgres):', err.message);
    }
  }
  return readJsonFile('whatsapp_config.json', defaultWhatsAppConfig);
}

export async function saveWhatsConfigDb(config) {
  const current = await getWhatsConfigDb();
  const merged = { ...defaultWhatsAppConfig, ...current, ...config };
  if (usePostgres) {
    try {
      const existing = await pool.query('SELECT id FROM Configuracion_Empresa ORDER BY id DESC LIMIT 1');
      if (existing.rowCount > 0) {
        await pool.query(
          'UPDATE Configuracion_Empresa SET whatsapp_config = $1 WHERE id = $2',
          [JSON.stringify(merged), existing.rows[0].id]
        );
      }
    } catch (err) {
      console.error('Error en saveWhatsConfigDb (Postgres):', err.message);
    }
  }
  writeJsonFile('whatsapp_config.json', merged);
  return merged;
}

// Ultra-fast check for invoice sequence reference without loading all sales history
export async function getLastInvoiceNumber() {
  if (usePostgres) {
    try {
      const res = await pool.query("SELECT factura_nro FROM Ventas WHERE factura_nro LIKE 'FAC-%' ORDER BY id DESC LIMIT 1");
      if (res.rowCount > 0) {
        const last = res.rows[0].factura_nro;
        const num = parseInt(last.replace('FAC-', ''), 10) || 0;
        const next = `FAC-${String(num + 1).padStart(6, '0')}`;
        return { last, next };
      }
      return { last: null, next: 'FAC-000001' };
    } catch (err) {
      console.error('Error en getLastInvoiceNumber:', err.message);
    }
  }
  const sales = readJsonFile('sales.json', []);
  const facSales = sales.filter(s => s.factura_nro?.startsWith('FAC-'));
  if (facSales.length > 0) {
    const last = facSales[facSales.length - 1].factura_nro;
    const num = parseInt(last.replace('FAC-', ''), 10) || 0;
    const next = `FAC-${String(num + 1).padStart(6, '0')}`;
    return { last, next };
  }
  return { last: null, next: 'FAC-000001' };
}

// Ultra-fast single aggregation check for multi-terminal /sync/poll in sub-millisecond time
export async function getSyncSummary() {
  if (usePostgres) {
    try {
      const res = await pool.query(`
        SELECT 
          (SELECT COALESCE(MAX(id), 0) FROM Ventas) as max_sale_id,
          (SELECT COUNT(*) FROM Tasas_Cambio) as tasas_count,
          (SELECT tasa_cobro FROM Tasas_Cambio ORDER BY id DESC LIMIT 1) as last_tasa_cobro,
          (SELECT tasa_vuelto FROM Tasas_Cambio ORDER BY id DESC LIMIT 1) as last_tasa_vuelto,
          (SELECT COUNT(*) FROM Cajas_Apertura_Cierre) as cierres_count,
          (SELECT COALESCE(MAX(id), 0) FROM Cajas_Apertura_Cierre) as last_cierre_id,
          (SELECT COALESCE(ROUND(SUM(COALESCE(monto_cierre_real_usd, 0) + COALESCE(monto_cierre_real_ves, 0)) * 100) / 100, 0) FROM Cajas_Apertura_Cierre) as cierres_sig,
          (SELECT COUNT(*) FROM Clientes) as clients_count,
          (SELECT COALESCE(ROUND(SUM(COALESCE(id, 0) + COALESCE(limite_credito, 0) + COALESCE(saldo_pendiente, 0)) * 100) / 100, 0) FROM Clientes) as clients_sig,
          (SELECT COUNT(*) FROM Productos) as products_count,
          (SELECT COALESCE(ROUND(SUM(COALESCE(id, 0) + COALESCE(stock_actual, 0) + COALESCE(precio_detalle_usd, 0)) * 100) / 100, 0) FROM Productos) as products_sig,
          (SELECT COUNT(*) FROM Abonos) as abonos_count,
          (SELECT COALESCE(ROUND(SUM(COALESCE(id, 0) + COALESCE(monto_usd, 0) + COALESCE(monto_ves, 0)) * 100) / 100, 0) FROM Abonos) as abonos_sig
      `);
      if (res.rowCount > 0) {
        const row = res.rows[0];
        return {
          maxSaleId: parseInt(row.max_sale_id || 0, 10),
          tasasCount: parseInt(row.tasas_count || 0, 10),
          lastTasaCobro: parseFloat(row.last_tasa_cobro || 0),
          lastTasaVuelto: parseFloat(row.last_tasa_vuelto || 0),
          cierresCount: parseInt(row.cierres_count || 0, 10),
          lastCierreId: parseInt(row.last_cierre_id || 0, 10),
          cierresSig: parseFloat(row.cierres_sig || 0),
          clientsCount: parseInt(row.clients_count || 0, 10),
          clientsSig: parseFloat(row.clients_sig || 0),
          productsCount: parseInt(row.products_count || 0, 10),
          productsSig: parseFloat(row.products_sig || 0),
          abonosCount: parseInt(row.abonos_count || 0, 10),
          abonosSig: parseFloat(row.abonos_sig || 0)
        };
      }
    } catch (err) {
      console.error('Error en getSyncSummary (Postgres):', err.message);
    }
  }
  return null;
}

export async function getUsers() {
  const defaultPermsAdmin = {
    caja: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
    inventario: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
    ventas: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
    clientes: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
    tasa: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
    config: { ver: true, crear: true, editar: true, eliminar: true, admin: true }
  };

  if (usePostgres) {
    try {
      const res = await pool.query('SELECT id, usuario, nombre, rol, estado, clave, permisos FROM Usuarios ORDER BY id ASC');
      if (res.rowCount > 0) {
        return res.rows.map(r => ({
          id: r.id,
          usuario: r.usuario,
          nombre: r.nombre,
          rol: r.rol,
          estado: r.estado,
          clave: r.clave || 'admin',
          permisos: r.permisos ? (typeof r.permisos === 'string' ? JSON.parse(r.permisos) : r.permisos) : defaultPermsAdmin
        }));
      } else {
        // Only seed default admin if Usuarios table is completely empty
        await pool.query(
          `INSERT INTO Usuarios (usuario, clave, nombre, rol, estado, permisos)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          ['admin', 'admin', 'Administrador', 'ADMINISTRADOR', 'Activo', JSON.stringify(defaultPermsAdmin)]
        );
        const res2 = await pool.query('SELECT id, usuario, nombre, rol, estado, clave, permisos FROM Usuarios ORDER BY id ASC');
        return res2.rows.map(r => ({
          id: r.id,
          usuario: r.usuario,
          nombre: r.nombre,
          rol: r.rol,
          estado: r.estado,
          clave: r.clave || 'admin',
          permisos: r.permisos ? (typeof r.permisos === 'string' ? JSON.parse(r.permisos) : r.permisos) : defaultPermsAdmin
        }));
      }
    } catch (err) {
      console.error('Error en getUsers (Postgres):', err.message);
    }
  }
  const localUsers = readJsonFile('users.json', null);
  if (!localUsers || localUsers.length === 0) {
    return [{
      id: 1,
      usuario: 'admin',
      nombre: 'Administrador',
      rol: 'ADMINISTRADOR',
      estado: 'Activo',
      clave: 'admin',
      permisos: defaultPermsAdmin
    }];
  }
  return localUsers;
}

export async function getProducts() {
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT * FROM Productos ORDER BY id ASC');
      return res.rows.map(r => ({
        id: parseInt(r.id, 10),
        barcode: r.codigo_barras_clave || '',
        description: r.descripcion || '',
        category: r.categoria || '',
        stock_actual: parseFloat(r.stock_actual || 0),
        stock_minimo: parseFloat(r.stock_minimo || 0),
        precio_costo_usd: parseFloat(r.precio_costo_usd || 0),
        precio_detalle_usd: parseFloat(r.precio_detalle_usd || 0),
        precio_mayor_usd: parseFloat(r.precio_mayor_usd || 0),
        cantidad_mayorista: parseInt(r.cantidad_mayorista || 12, 10),
        exento_impuesto: !!r.exento_impuesto,
        imagen_url: r.imagen_url || '',
        estado: r.estado || 'Activo',
        a_granel: !!r.a_granel,
        fecha_vencimiento: r.fecha_vencimiento || null,
        porcentaje_impuesto: parseFloat(r.porcentaje_impuesto || 0)
      }));
    } catch (err) {
      console.error('Error en getProducts (Postgres):', err.message);
    }
  }
  return readJsonFile('products.json', []);
}

export async function saveProduct(p) {
  const isGranel = !!p.a_granel;
  const stockActual = isGranel ? (p.stock_actual || 0) : Math.round(p.stock_actual || 0);
  const stockMinimo = isGranel ? (p.stock_minimo || 0) : Math.round(p.stock_minimo || 0);

  if (usePostgres) {
    try {
      const res = await pool.query(
        `INSERT INTO Productos (codigo_barras_clave, descripcion, categoria, stock_actual, stock_minimo, precio_costo_usd, precio_detalle_usd, precio_mayor_usd, cantidad_mayorista, exento_impuesto, imagen_url, estado, a_granel, fecha_vencimiento, porcentaje_impuesto)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [p.barcode, p.description, p.category, stockActual, stockMinimo, p.precio_costo_usd, p.precio_detalle_usd, p.precio_mayor_usd, p.cantidad_mayorista || 12, p.exento_impuesto, p.imagen_url, p.estado, p.a_granel || false, p.fecha_vencimiento || null, p.porcentaje_impuesto || 0]
      );
      return { ...p, id: res.rows[0].id, stock_actual: stockActual, stock_minimo: stockMinimo };
    } catch (err) {
      console.error('Error en saveProduct (Postgres):', err.message);
    }
  }
  const products = readJsonFile('products.json', mockProducts);
  const newProduct = { ...p, id: Date.now(), stock_actual: stockActual, stock_minimo: stockMinimo };
  products.push(newProduct);
  writeJsonFile('products.json', products);
  return newProduct;
}

export async function updateProduct(p) {
  const isGranel = !!p.a_granel;
  const stockMinimo = isGranel ? (parseFloat(p.stock_minimo) || 0) : Math.round(parseFloat(p.stock_minimo) || 0);
  const stockActual = isGranel ? (parseFloat(p.stock_actual) || 0) : Math.round(parseFloat(p.stock_actual) || 0);
  const category = (p.category || p.categoria || '').trim().toUpperCase();
  const barcode = (p.barcode || p.codigo_barras_clave || '').trim();
  const description = (p.description || p.descripcion || '').trim();
  const prodId = parseInt(p.id) || 0;

  if (usePostgres) {
    try {
      const res = await pool.query(
        `UPDATE Productos 
         SET codigo_barras_clave = $1, descripcion = $2, categoria = $3, stock_minimo = $4, precio_costo_usd = $5, precio_detalle_usd = $6, precio_mayor_usd = $7, cantidad_mayorista = $8, exento_impuesto = $9, imagen_url = $10, estado = $11, a_granel = $12, fecha_vencimiento = $13, porcentaje_impuesto = $14, stock_actual = $15
         WHERE id = $16 RETURNING *`,
        [barcode, description, category, stockMinimo, parseFloat(p.precio_costo_usd) || 0, parseFloat(p.precio_detalle_usd) || 0, parseFloat(p.precio_mayor_usd) || 0, parseInt(p.cantidad_mayorista) || 12, !!p.exento_impuesto, p.imagen_url || '', p.estado || 'Activo', isGranel, p.fecha_vencimiento || null, parseFloat(p.porcentaje_impuesto || 0), stockActual, prodId]
      );
      if (res.rowCount > 0) {
        const r = res.rows[0];
        return {
          ...p,
          id: r.id,
          barcode: r.codigo_barras_clave,
          description: r.descripcion,
          category: r.categoria || '',
          stock_actual: parseFloat(r.stock_actual),
          stock_minimo: parseFloat(r.stock_minimo),
          precio_costo_usd: parseFloat(r.precio_costo_usd),
          precio_detalle_usd: parseFloat(r.precio_detalle_usd),
          precio_mayor_usd: parseFloat(r.precio_mayor_usd),
          cantidad_mayorista: parseInt(r.cantidad_mayorista) || 12,
          exento_impuesto: !!r.exento_impuesto,
          porcentaje_impuesto: parseFloat(r.porcentaje_impuesto || 0),
          a_granel: !!r.a_granel,
          fecha_vencimiento: r.fecha_vencimiento || undefined,
          imagen_url: r.imagen_url || '',
          estado: r.estado || 'Activo'
        };
      }
    } catch (err) {
      console.error('Error en updateProduct (Postgres):', err.message);
      throw err;
    }
  }
  const products = readJsonFile('products.json', mockProducts);
  const duplicate = products.find(item => item.id !== prodId && (item.barcode || '').trim().toUpperCase() === barcode.toUpperCase());
  if (duplicate) {
    const err = new Error(`Ya existe otro producto registrado con la clave o código '${barcode}'`);
    err.code = '23505';
    throw err;
  }
  const idx = products.findIndex(item => item.id === prodId || item.id == p.id);
  if (idx !== -1) {
    products[idx] = { ...products[idx], ...p, category, barcode, description, stock_minimo: stockMinimo, stock_actual: stockActual };
    writeJsonFile('products.json', products);
    return products[idx];
  }
  return null;
}

export async function updateProductStock(prodId, stockActual) {
  let isGranel = false;
  if (usePostgres) {
    try {
      const prodRes = await pool.query('SELECT a_granel FROM Productos WHERE id = $1', [prodId]);
      if (prodRes.rows.length > 0) {
        isGranel = !!prodRes.rows[0].a_granel;
      }
      const finalStock = isGranel ? stockActual : Math.round(stockActual);
      await pool.query('UPDATE Productos SET stock_actual = $1 WHERE id = $2', [finalStock, prodId]);
      return true;
    } catch (err) {
      console.error('Error en updateProductStock (Postgres):', err.message);
    }
  }
  const products = readJsonFile('products.json', mockProducts);
  const idx = products.findIndex(p => p.id === prodId);
  if (idx !== -1) {
    isGranel = !!products[idx].a_granel;
    const finalStock = isGranel ? stockActual : Math.round(stockActual);
    products[idx].stock_actual = finalStock;
    writeJsonFile('products.json', products);
    return true;
  }
  return false;
}

export async function updateProductPrices(prodId, prices) {
  if (usePostgres) {
    try {
      await pool.query(
        'UPDATE Productos SET precio_costo_usd = $1, precio_detalle_usd = $2, precio_mayor_usd = $3 WHERE id = $4',
        [prices.cost, prices.detail, prices.mayor, prodId]
      );
      return true;
    } catch (err) {
      console.error('Error en updateProductPrices (Postgres):', err.message);
    }
  }
  const products = readJsonFile('products.json', mockProducts);
  const idx = products.findIndex(p => p.id === prodId);
  if (idx !== -1) {
    products[idx].precio_costo_usd = prices.cost;
    products[idx].precio_detalle_usd = prices.detail;
    products[idx].precio_mayor_usd = prices.mayor;
    writeJsonFile('products.json', products);
    return true;
  }
  return false;
}

export async function updateProductPricesBulk(updates) {
  if (usePostgres) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      for (const update of updates) {
        await client.query(
          'UPDATE Productos SET precio_costo_usd = $1, precio_detalle_usd = $2, precio_mayor_usd = $3 WHERE id = $4',
          [update.cost, update.detail, update.mayor, update.id]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (err) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error('Error al hacer ROLLBACK:', rollbackErr.message);
        }
      }
      console.error('Error en updateProductPricesBulk (Postgres):', err.message);
      return false;
    } finally {
      if (client) {
        client.release();
      }
    }
  } else {
    const products = readJsonFile('products.json', mockProducts);
    for (const update of updates) {
      const idx = products.findIndex(p => p.id === update.id);
      if (idx !== -1) {
        products[idx].precio_costo_usd = update.cost;
        products[idx].precio_detalle_usd = update.detail;
        products[idx].precio_mayor_usd = update.mayor;
      }
    }
    writeJsonFile('products.json', products);
    return true;
  }
}

export async function getClients() {
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT * FROM Clientes ORDER BY id ASC');
      return res.rows.map(r => ({
        id: r.id,
        cedula_rif: r.cedula_rif,
        nombre: r.nombre,
        telefono: r.telefono || '',
        direccion: r.direccion || '',
        limite_credito: parseFloat(r.limite_credito || 0),
        credito_disponible: parseFloat(r.credito_disponible || 0),
        porcentaje_descuento: parseFloat(r.porcentaje_descuento || 0),
        estado: r.estado || 'Activo',
        aplica_precio_costo: !!r.aplica_precio_costo,
        saldo_pendiente: parseFloat(r.limite_credito || 0) - parseFloat(r.credito_disponible || 0)
      }));
    } catch (err) {
      console.error('Error en getClients (Postgres):', err.message);
    }
  }
  const genericClient = { id: 1, cedula_rif: 'V-00000000', nombre: 'Consumidor Final', limite_credito: 0, credito_disponible: 0, porcentaje_descuento: 0, estado: 'Activo' };
  const clients = readJsonFile('clients.json', null);
  if (!clients || clients.length === 0) return [genericClient];
  return clients;
}

export async function saveClient(c) {
  if (usePostgres) {
    try {
      const res = await pool.query(
        `INSERT INTO Clientes (cedula_rif, nombre, telefono, direccion, limite_credito, credito_disponible, porcentaje_descuento, estado, aplica_precio_costo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [c.cedula_rif, c.nombre, c.telefono, c.direccion, c.limite_credito, c.credito_disponible, c.porcentaje_descuento, c.estado, !!c.aplica_precio_costo]
      );
      return { ...c, id: res.rows[0].id, saldo_pendiente: (c.limite_credito || 0) - (c.credito_disponible || 0), aplica_precio_costo: !!c.aplica_precio_costo };
    } catch (err) {
      console.error('Error en saveClient (Postgres):', err.message);
    }
  }
  const clients = readJsonFile('clients.json', mockClients);
  const newClient = { ...c, id: Date.now(), saldo_pendiente: (c.limite_credito || 0) - (c.credito_disponible || 0), aplica_precio_costo: !!c.aplica_precio_costo };
  clients.push(newClient);
  writeJsonFile('clients.json', clients);
  return newClient;
}

export async function saveClientsBulk(clientsArray, mode = 'update') {
  if (!Array.isArray(clientsArray) || clientsArray.length === 0) return [];
  
  if (usePostgres) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const results = [];
      for (const c of clientsArray) {
        const doc = c.cedula_rif?.trim() || 'V-00000000';
        const name = c.nombre?.trim() || 'CLIENTE S/N';
        const phone = c.telefono?.trim() || '';
        const address = c.direccion?.trim() || '';
        const limit = parseFloat(c.limite_credito || 0);
        const debt = parseFloat(c.saldo_pendiente || 0);
        const avail = Math.max(0, limit - debt);
        const desc = parseFloat(c.porcentaje_descuento || 0);
        const status = c.estado || 'Activo';
        const costo = !!c.aplica_precio_costo;

        const checkRes = await client.query('SELECT id FROM Clientes WHERE LOWER(cedula_rif) = LOWER($1)', [doc]);
        if (checkRes.rowCount > 0) {
          if (mode === 'update') {
            const existingId = checkRes.rows[0].id;
            await client.query(
              `UPDATE Clientes 
               SET nombre = $1, telefono = $2, direccion = $3, limite_credito = $4, credito_disponible = $5, porcentaje_descuento = $6, estado = $7, aplica_precio_costo = $8
               WHERE id = $9`,
              [name, phone, address, limit, avail, desc, status, costo, existingId]
            );
            results.push({ id: existingId, cedula_rif: doc, nombre: name, telefono: phone, direccion: address, limite_credito: limit, credito_disponible: avail, saldo_pendiente: debt, porcentaje_descuento: desc, estado: status, aplica_precio_costo: costo });
          }
        } else {
          const insertRes = await client.query(
            `INSERT INTO Clientes (cedula_rif, nombre, telefono, direccion, limite_credito, credito_disponible, porcentaje_descuento, estado, aplica_precio_costo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [doc, name, phone, address, limit, avail, desc, status, costo]
          );
          results.push({ id: insertRes.rows[0].id, cedula_rif: doc, nombre: name, telefono: phone, direccion: address, limite_credito: limit, credito_disponible: avail, saldo_pendiente: debt, porcentaje_descuento: desc, estado: status, aplica_precio_costo: costo });
        }
      }
      await client.query('COMMIT');
      return results;
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      console.error('Error en saveClientsBulk (Postgres):', err.message);
      throw err;
    } finally {
      if (client) client.release();
    }
  }

  // JSON Fallback Storage
  const clients = readJsonFile('clients.json', mockClients);
  const results = [];
  for (const c of clientsArray) {
    const doc = c.cedula_rif?.trim() || 'V-00000000';
    const name = c.nombre?.trim() || 'CLIENTE S/N';
    const phone = c.telefono?.trim() || '';
    const address = c.direccion?.trim() || '';
    const limit = parseFloat(c.limite_credito || 0);
    const debt = parseFloat(c.saldo_pendiente || 0);
    const avail = Math.max(0, limit - debt);
    const desc = parseFloat(c.porcentaje_descuento || 0);
    const status = c.estado || 'Activo';
    const costo = !!c.aplica_precio_costo;

    const idx = clients.findIndex(x => x.cedula_rif?.toLowerCase() === doc.toLowerCase());
    if (idx !== -1) {
      if (mode === 'update') {
        clients[idx] = {
          ...clients[idx],
          nombre: name,
          telefono: phone,
          direccion: address,
          limite_credito: limit,
          credito_disponible: avail,
          saldo_pendiente: debt,
          porcentaje_descuento: desc,
          estado: status,
          aplica_precio_costo: costo
        };
        results.push(clients[idx]);
      }
    } else {
      const newObj = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        cedula_rif: doc,
        nombre: name,
        telefono: phone,
        direccion: address,
        limite_credito: limit,
        credito_disponible: avail,
        saldo_pendiente: debt,
        porcentaje_descuento: desc,
        estado: status,
        aplica_precio_costo: costo
      };
      clients.push(newObj);
      results.push(newObj);
    }
  }
  writeJsonFile('clients.json', clients);
  return results;
}



export async function getAbonos() {
  if (usePostgres) {
    try {
      const res = await pool.query(`
        SELECT a.id, a.cliente_id, a.monto_usd as monto, a.monto_ves, a.metodo_pago, a.banco_emisor, a.numero_referencia as referencia, a.observacion, a.fecha, c.nombre, c.cedula_rif
        FROM Abonos a
        LEFT JOIN Clientes c ON a.cliente_id = c.id
        ORDER BY a.id DESC
      `);
      if (res.rows.length > 0) {
        return res.rows.map(r => ({
          ...r,
          monto: parseFloat(r.monto || '0'),
          monto_ves: parseFloat(r.monto_ves || '0'),
          metodo_pago: r.metodo_pago || 'Efectivo$',
          fecha: r.fecha ? getLocalISODateString(r.fecha) : getLocalISODateString()
        }));
      }
    } catch (err) {
      console.error('Error en getAbonos (Postgres):', err.message);
    }
  }
  return readJsonFile('abonos.json', []);
}

export async function registerAbono(clientId, montoUsd, montoVes, metodoPago = 'Efectivo$', referencia = '', observacion = '', usuarioId = null) {
  let clientNombre = '';
  let clientDoc = '';
  const parsedId = parseInt(clientId) || 0;
  const numUsd = parseFloat(montoUsd || '0');
  const numVes = parseFloat(montoVes || '0');

  if (usePostgres) {
    try {
      const res = await pool.query(
        'SELECT id, nombre, cedula_rif, limite_credito, credito_disponible FROM Clientes WHERE id = $1 OR CAST(id AS TEXT) = $2 OR cedula_rif = $2 LIMIT 1',
        [parsedId, String(clientId)]
      );
      if (res.rowCount > 0) {
        const client = res.rows[0];
        const realClientId = client.id;
        clientNombre = client.nombre;
        clientDoc = client.cedula_rif;

        // Calculate USD equivalency for credit availability if paid in VES
        let amountUSD = numUsd;
        if (amountUSD <= 0 && numVes > 0) {
          const tasaRes = await pool.query("SELECT tasa_cobro FROM Tasas_Cambio ORDER BY id DESC LIMIT 1");
          const tasa = (tasaRes.rowCount > 0 && parseFloat(tasaRes.rows[0].tasa_cobro || '0') > 0) ? parseFloat(tasaRes.rows[0].tasa_cobro) : 36.30;
          amountUSD = parseFloat((numVes / tasa).toFixed(2));
        }

        if (amountUSD > 0) {
          const nextCredito = Math.min(parseFloat(client.limite_credito || '0'), parseFloat(client.credito_disponible || '0') + amountUSD);
          await pool.query('UPDATE Clientes SET credito_disponible = $1 WHERE id = $2', [nextCredito, realClientId]);
        }
        
        try {
          // Determine active caja_id for this abono
          let abonoCajaId = null;
          try {
            const abonoCajaRes = await pool.query(
              "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND usuario_id = $1 ORDER BY id DESC LIMIT 1",
              [usuarioId || null]
            );
            if (abonoCajaRes.rowCount > 0) abonoCajaId = abonoCajaRes.rows[0].id;
          } catch (_) {}
          await pool.query(
            `INSERT INTO Abonos (cliente_id, usuario_id, caja_id, monto_usd, monto_ves, metodo_pago, numero_referencia, observacion, fecha)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
            [realClientId, usuarioId || null, abonoCajaId, numUsd, numVes, metodoPago, referencia || null, observacion || null]
          );
          console.log(`✅ [Abonos] Abono registrado en PostgreSQL — Cliente: ${clientNombre} (ID ${realClientId}) | $${numUsd} / Bs ${numVes} | Método: ${metodoPago}`);
        } catch (dbErr) {
          console.error('❌ Error al insertar abono en tabla Abonos:', dbErr.message);
        }

        try {
          const activeCajaRes = await pool.query(
            "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' ORDER BY id DESC LIMIT 1"
          );
          if (activeCajaRes.rowCount > 0) {
            const cajaId = activeCajaRes.rows[0].id;
            await pool.query(
              `INSERT INTO Movimientos_Caja (caja_id, tipo, descripcion, monto_usd, monto_ves, fecha)
               VALUES ($1, 'Entrada', $2, $3, $4, CURRENT_TIMESTAMP)`,
              [cajaId, `Abono de Crédito Cliente: ${clientNombre} (${metodoPago})`, numUsd, numVes]
            );
          }
        } catch (movErr) {
          console.error('⚠️ Error al registrar movimiento de abono:', movErr.message);
        }

        // Sync to JSON store
        const abonos = readJsonFile('abonos.json', []);
        abonos.push({
          id: Date.now(),
          cliente_id: realClientId,
          nombre: clientNombre,
          cedula_rif: clientDoc,
          monto: montoUsd || 0,
          monto_ves: montoVes || 0,
          metodo_pago: metodoPago,
          referencia: referencia || undefined,
          observacion: observacion || undefined,
          fecha: getLocalISODateString()
        });
        writeJsonFile('abonos.json', abonos);
        return true;
      } else {
        console.warn(`⚠️ [Abonos] Cliente no encontrado en PostgreSQL con ID/Cédula: ${clientId}`);
      }
    } catch (err) {
      console.error('Error en registerAbono (Postgres):', err.message);
    }
  } else {
    const clients = readJsonFile('clients.json', mockClients);
    const idx = clients.findIndex(c => c.id === clientId || c.id === parseInt(clientId) || c.cedula_rif === String(clientId));
    if (idx !== -1) {
      clientNombre = clients[idx].nombre;
      clientDoc = clients[idx].cedula_rif;
      if (amountUSD > 0) {
        clients[idx].saldo_pendiente = Math.max(0, clients[idx].saldo_pendiente - amountUSD);
        clients[idx].credito_disponible = Math.min(clients[idx].limite_credito, clients[idx].credito_disponible + amountUSD);
      }
      writeJsonFile('clients.json', clients);
      
      const abonos = readJsonFile('abonos.json', []);
      abonos.push({
        id: Date.now(),
        cliente_id: clients[idx].id,
        nombre: clientNombre,
        cedula_rif: clientDoc,
        monto: montoUsd || 0,
        monto_ves: montoVes || 0,
        metodo_pago: metodoPago,
        referencia: referencia || undefined,
        observacion: observacion || undefined,
        fecha: getLocalISODateString()
      });
      writeJsonFile('abonos.json', abonos);
      return true;
    }
  }
  return false;
}

export async function updateClient(id, c) {
  if (usePostgres) {
    try {
      const currentRes = await pool.query('SELECT limite_credito, credito_disponible FROM Clientes WHERE id = $1', [id]);
      let newCredito = parseFloat(c.limite_credito);
      if (currentRes.rowCount > 0) {
        const current = currentRes.rows[0];
        const oldLimit = parseFloat(current.limite_credito);
        const oldAvail = parseFloat(current.credito_disponible);
        const debt = oldLimit - oldAvail;
        newCredito = Math.max(0, parseFloat(c.limite_credito) - debt);
      }
      
      const res = await pool.query(
        `UPDATE Clientes SET 
          cedula_rif = $1, 
          nombre = $2, 
          telefono = $3, 
          direccion = $4, 
          limite_credito = $5, 
          credito_disponible = $6, 
          porcentaje_descuento = $7, 
          estado = $8,
          aplica_precio_costo = $9
         WHERE id = $10 RETURNING *`,
        [c.cedula_rif, c.nombre, c.telefono, c.direccion, parseFloat(c.limite_credito), newCredito, parseFloat(c.porcentaje_descuento), c.estado || 'Activo', !!c.aplica_precio_costo, id]
      );
      
      if (res.rowCount > 0) {
        const r = res.rows[0];
        return {
          id: r.id,
          cedula_rif: r.cedula_rif,
          nombre: r.nombre,
          telefono: r.telefono || '',
          direccion: r.direccion || '',
          limite_credito: parseFloat(r.limite_credito),
          credito_disponible: parseFloat(r.credito_disponible),
          porcentaje_descuento: parseFloat(r.porcentaje_descuento),
          estado: r.estado,
          aplica_precio_costo: !!r.aplica_precio_costo,
          saldo_pendiente: parseFloat(r.limite_credito) - parseFloat(r.credito_disponible)
        };
      }
    } catch (err) {
      console.error('Error en updateClient (Postgres):', err.message);
      throw err;
    }
  }
  
  const clients = readJsonFile('clients.json', mockClients);
  const idx = clients.findIndex(client => client.id === parseInt(id) || client.id === id);
  if (idx !== -1) {
    const current = clients[idx];
    const debt = current.saldo_pendiente || 0;
    const newLimit = parseFloat(c.limite_credito);
    const newAvail = Math.max(0, newLimit - debt);
    
    clients[idx] = {
      ...current,
      cedula_rif: c.cedula_rif,
      nombre: c.nombre,
      telefono: c.telefono || '',
      direccion: c.direccion || '',
      limite_credito: newLimit,
      credito_disponible: newAvail,
      porcentaje_descuento: parseFloat(c.porcentaje_descuento),
      estado: c.estado || 'Activo',
      aplica_precio_costo: !!c.aplica_precio_costo,
      saldo_pendiente: debt
    };
    writeJsonFile('clients.json', clients);
    return clients[idx];
  }
  return null;
}

export async function deleteClient(id) {
  if (usePostgres) {
    try {
      const currentRes = await pool.query('SELECT limite_credito, credito_disponible FROM Clientes WHERE id = $1', [id]);
      if (currentRes.rowCount > 0) {
        const current = currentRes.rows[0];
        const debt = parseFloat(current.limite_credito) - parseFloat(current.credito_disponible);
        if (debt > 0.01) {
          throw new Error('No se puede eliminar un cliente con deuda pendiente.');
        }
      }
      
      // Update any Ventas that refer to this client to reference the generic client
      const genericRes = await pool.query("SELECT id FROM Clientes WHERE cedula_rif = 'V-00000000' LIMIT 1");
      if (genericRes.rowCount > 0) {
        const genericId = genericRes.rows[0].id;
        await pool.query('UPDATE Ventas SET cliente_id = $1 WHERE cliente_id = $2', [genericId, id]);
      }
      
      const res = await pool.query('DELETE FROM Clientes WHERE id = $1 RETURNING id', [id]);
      return res.rowCount > 0;
    } catch (err) {
      console.error('Error en deleteClient (Postgres):', err.message);
      throw err;
    }
  }
  
  const clients = readJsonFile('clients.json', mockClients);
  const idx = clients.findIndex(client => client.id === parseInt(id) || client.id === id);
  if (idx !== -1) {
    const current = clients[idx];
    const debt = current.saldo_pendiente || 0;
    if (debt > 0.01) {
      throw new Error('No se puede eliminar un cliente con deuda pendiente.');
    }
    clients.splice(idx, 1);
    writeJsonFile('clients.json', clients);
    return true;
  }
  return false;
}


// --- USER & ROLE CRUD & DATABASE MANAGEMENT FUNCTIONS ---

export async function saveUser(u) {
  const permsStr = JSON.stringify(u.permisos || {});
  if (usePostgres) {
    try {
      await pool.query("SELECT setval(pg_get_serial_sequence('Usuarios', 'id'), COALESCE((SELECT MAX(id) FROM Usuarios), 1))");
      const res = await pool.query(
        'INSERT INTO Usuarios (usuario, nombre, rol, estado, clave, permisos) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [u.usuario, u.nombre, u.rol, u.estado || 'Activo', u.clave || '', permsStr]
      );
      if (res.rowCount > 0) {
        const r = res.rows[0];
        return {
          id: r.id,
          usuario: r.usuario,
          nombre: r.nombre,
          rol: r.rol,
          estado: r.estado,
          clave: r.clave,
          permisos: r.permisos ? (typeof r.permisos === 'string' ? JSON.parse(r.permisos) : r.permisos) : null
        };
      }
    } catch (err) {
      console.error('Error en saveUser (Postgres):', err.message);
      throw err;
    }
  }
  const users = readJsonFile('users.json', mockUsers);
  const newUser = {
    id: Date.now(),
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    estado: u.estado || 'Activo',
    clave: u.clave || 'admin',
    permisos: u.permisos
  };
  users.push(newUser);
  writeJsonFile('users.json', users);
  return newUser;
}

export async function updateUser(id, u) {
  const permsStr = JSON.stringify(u.permisos || {});
  if (usePostgres) {
    try {
      const res = await pool.query(
        'UPDATE Usuarios SET usuario = $1, nombre = $2, rol = $3, estado = $4, clave = $5, permisos = $6 WHERE id = $7 RETURNING *',
        [u.usuario, u.nombre, u.rol, u.estado, u.clave, permsStr, id]
      );
      if (res.rowCount > 0) {
        const r = res.rows[0];
        return {
          id: r.id,
          usuario: r.usuario,
          nombre: r.nombre,
          rol: r.rol,
          estado: r.estado,
          clave: r.clave,
          permisos: r.permisos ? (typeof r.permisos === 'string' ? JSON.parse(r.permisos) : r.permisos) : null
        };
      }
    } catch (err) {
      console.error('Error en updateUser (Postgres):', err.message);
      throw err;
    }
  }
  const users = readJsonFile('users.json', mockUsers);
  const idx = users.findIndex(user => user.id === parseInt(id) || user.id === id);
  if (idx !== -1) {
    users[idx] = {
      ...users[idx],
      usuario: u.usuario,
      nombre: u.nombre,
      rol: u.rol,
      estado: u.estado,
      clave: u.clave,
      permisos: u.permisos
    };
    writeJsonFile('users.json', users);
    return users[idx];
  }
  return null;
}

export async function deleteUser(id) {
  if (usePostgres) {
    try {
      const res = await pool.query('DELETE FROM Usuarios WHERE id = $1 RETURNING id', [id]);
      return res.rowCount > 0;
    } catch (err) {
      console.error('Error en deleteUser (Postgres):', err.message);
      throw err;
    }
  }
  const users = readJsonFile('users.json', mockUsers);
  const idx = users.findIndex(user => user.id === parseInt(id) || user.id === id);
  if (idx !== -1) {
    users.splice(idx, 1);
    writeJsonFile('users.json', users);
    return true;
  }
  return false;
}

export async function getRoles() {
  const defaultRoles = [
    {
      id: 1,
      nombre: "Administrador",
      permisos: {
        caja: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        inventario: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        ventas: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        clientes: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        tasa: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        config: { ver: true, crear: true, editar: true, eliminar: true, admin: true }
      }
    },
    {
      id: 2,
      nombre: "Cajero / Vendedor",
      permisos: {
        caja: { ver: true, crear: true, editar: true, eliminar: false, admin: false },
        inventario: { ver: true, crear: false, editar: false, eliminar: false, admin: false },
        ventas: { ver: true, crear: false, editar: false, eliminar: false, admin: false },
        clientes: { ver: true, crear: true, editar: true, eliminar: false, admin: false },
        tasa: { ver: true, crear: false, editar: false, eliminar: false, admin: false },
        config: { ver: false, crear: false, editar: false, eliminar: false, admin: false }
      }
    }
  ];
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT id, nombre, permisos FROM Roles ORDER BY id ASC');
      if (res.rowCount > 0) {
        return res.rows.map(r => ({
          id: r.id,
          nombre: r.nombre,
          permisos: r.permisos ? (typeof r.permisos === 'string' ? JSON.parse(r.permisos) : r.permisos) : {}
        }));
      } else {
        // Seed default admin role only if Roles table is completely empty
        const adminRole = defaultRoles[0];
        await pool.query(
          'INSERT INTO Roles (nombre, permisos) VALUES ($1, $2)',
          [adminRole.nombre, JSON.stringify(adminRole.permisos)]
        );
        const res2 = await pool.query('SELECT id, nombre, permisos FROM Roles ORDER BY id ASC');
        return res2.rows.map(r => ({
          id: r.id,
          nombre: r.nombre,
          permisos: r.permisos ? (typeof r.permisos === 'string' ? JSON.parse(r.permisos) : r.permisos) : {}
        }));
      }
    } catch (err) {
      console.error('Error en getRoles (Postgres):', err.message);
    }
  }
  const localRoles = readJsonFile('roles.json', null);
  if (!localRoles || localRoles.length === 0) return [defaultRoles[0]];
  return localRoles;
}

export async function saveRole(r) {
  const permsStr = JSON.stringify(r.permisos || {});
  if (usePostgres) {
    try {
      await pool.query("SELECT setval(pg_get_serial_sequence('Roles', 'id'), COALESCE((SELECT MAX(id) FROM Roles), 1))");
      const res = await pool.query(
        'INSERT INTO Roles (nombre, permisos) VALUES ($1, $2) RETURNING *',
        [r.nombre, permsStr]
      );
      if (res.rowCount > 0) {
        const row = res.rows[0];
        return { id: row.id, nombre: row.nombre, permisos: row.permisos ? (typeof row.permisos === 'string' ? JSON.parse(row.permisos) : row.permisos) : {} };
      }
    } catch (err) {
      console.error('Error en saveRole (Postgres):', err.message);
      throw err;
    }
  }
  const roles = await getRoles();
  const newRole = {
    id: Date.now(),
    nombre: r.nombre,
    permisos: r.permisos
  };
  roles.push(newRole);
  writeJsonFile('roles.json', roles);
  return newRole;
}

export async function updateRole(id, r) {
  const permsStr = JSON.stringify(r.permisos || {});
  if (usePostgres) {
    try {
      const res = await pool.query(
        'UPDATE Roles SET nombre = $1, permisos = $2 WHERE id = $3 RETURNING *',
        [r.nombre, permsStr, id]
      );
      if (res.rowCount > 0) {
        const row = res.rows[0];
        return { id: row.id, nombre: row.nombre, permisos: row.permisos ? (typeof row.permisos === 'string' ? JSON.parse(row.permisos) : row.permisos) : {} };
      }
    } catch (err) {
      console.error('Error en updateRole (Postgres):', err.message);
      throw err;
    }
  }
  const roles = await getRoles();
  const idx = roles.findIndex(role => role.id === parseInt(id) || role.id === id);
  if (idx !== -1) {
    roles[idx] = {
      ...roles[idx],
      nombre: r.nombre,
      permisos: r.permisos
    };
    writeJsonFile('roles.json', roles);
    return roles[idx];
  }
  return null;
}


export async function deleteRole(id) {
  if (usePostgres) {
    try {
      const res = await pool.query('DELETE FROM Roles WHERE id = $1 RETURNING id', [id]);
      return res.rowCount > 0;
    } catch (err) {
      console.error('Error en deleteRole (Postgres):', err.message);
      throw err;
    }
  }
  const roles = await getRoles();
  const idx = roles.findIndex(role => role.id === parseInt(id) || role.id === id);
  if (idx !== -1) {
    roles.splice(idx, 1);
    writeJsonFile('roles.json', roles);
    return true;
  }
  return false;
}

export async function wipeDatabase(options) {
  const isFullWipe = options.mode === 'all' || (options.wipeInventory && options.wipeSales && options.wipeClients);
  console.log('[DB Wipe] Ejecutando wipeDatabase. Opciones:', options, 'isFullWipe:', isFullWipe, 'usePostgres:', usePostgres);

  if (usePostgres) {
    if (isFullWipe) {
      const fullTables = [
        'Ventas_Detalle',
        'Pagos_Venta',
        'Ventas',
        'Movimientos_Caja',
        'Cajas_Apertura_Cierre',
        'Movimientos_Inventario',
        'Historial_Precios',
        'Productos',
        'Abonos',
        'Accionistas',
        'Inversiones_Accionistas',
        'Tasas_Cambio'
      ];
      for (const t of fullTables) {
        try {
          await pool.query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`);
          console.log(`[DB Wipe Postgres] Tabla ${t} vaciada exitosamente.`);
        } catch (errT) {
          console.warn(`[DB Wipe Postgres Warning] No se pudo truncar ${t}:`, errT.message);
        }
      }

      try {
        await pool.query("DELETE FROM Clientes WHERE LOWER(cedula_rif) <> 'v-00000000'");
        await pool.query("UPDATE Clientes SET limite_credito = 0, credito_disponible = 0, porcentaje_descuento = 0");
      } catch (errC) { console.warn('[DB Wipe Postgres Warning] Clientes:', errC.message); }

      try {
        await pool.query("DELETE FROM Usuarios WHERE LOWER(usuario) <> 'admin'");
      } catch (errU) { console.warn('[DB Wipe Postgres Warning] Usuarios:', errU.message); }

      try {
        await pool.query("DELETE FROM Roles WHERE LOWER(nombre) <> 'administrador'");
      } catch (errR) { console.warn('[DB Wipe Postgres Warning] Roles:', errR.message); }

      try {
        await pool.query('TRUNCATE TABLE Proveedores, Compras, Compras_Detalle, Pagos_Proveedores, Cotizaciones_Proveedores RESTART IDENTITY CASCADE');
      } catch (errProv) { console.warn('[DB Wipe Postgres Warning] Proveedores:', errProv.message); }

      try {
        await pool.query(`UPDATE Configuracion_Empresa SET 
          rif = '', nombre_comercio = '', direccion = '', telefono = '', 
          correo = '', mensaje_pie_ticket = '', logo_url = '', metodos_pago_activos = '[]'::jsonb`);
      } catch (errCfg) { console.warn('[DB Wipe Postgres Warning] Configuracion_Empresa:', errCfg.message); }

      // Clear JSON files
      writeJsonFile('products.json', []);
      writeJsonFile('movements.json', []);
      writeJsonFile('price-history.json', []);
      writeJsonFile('price_history.json', []);
      writeJsonFile('sales.json', []);
      writeJsonFile('abonos.json', []);
      writeJsonFile('cierres.json', []);
      writeJsonFile('caja_activa.json', { abierta: false, id: null, monto_usd: 0, monto_ves: 0 });
      writeJsonFile('caja_estado.json', { abierta: false, id: null, monto_usd: 0, monto_ves: 0 });
      writeJsonFile('tasa_history.json', []);
      writeJsonFile('tasas.json', []);
      writeJsonFile('accionistas.json', []);
      writeJsonFile('inversiones.json', []);
      writeJsonFile('proveedores.json', []);
      writeJsonFile('compras.json', []);
      writeJsonFile('pagos_proveedores.json', []);
      writeJsonFile('cotizaciones_proveedores.json', []);
      return true;
    }

    if (options.wipeInventory) {
      try { await pool.query('TRUNCATE TABLE Productos, Movimientos_Inventario, Historial_Precios RESTART IDENTITY CASCADE'); } catch (e) {}
      writeJsonFile('products.json', []);
      writeJsonFile('movements.json', []);
      writeJsonFile('price-history.json', []);
      writeJsonFile('price_history.json', []);
    }
    if (options.wipeStock) {
      try {
        await pool.query('UPDATE Productos SET stock_actual = 0');
        await pool.query('TRUNCATE TABLE Movimientos_Inventario RESTART IDENTITY CASCADE');
      } catch (e) {}
      const products = readJsonFile('products.json', []);
      writeJsonFile('products.json', products.map(p => ({ ...p, stock_actual: 0 })));
      writeJsonFile('movements.json', []);
    }
    if (options.wipeSales) {
      try { await pool.query('TRUNCATE TABLE Ventas, Ventas_Detalle, Pagos_Venta, Cajas_Apertura_Cierre, Movimientos_Caja RESTART IDENTITY CASCADE'); } catch (e) {}
      writeJsonFile('sales.json', []);
      writeJsonFile('abonos.json', []);
      writeJsonFile('cierres.json', []);
      writeJsonFile('caja_activa.json', { abierta: false, id: null, monto_usd: 0, monto_ves: 0 });
    }
    if (options.wipeClients) {
      try {
        await pool.query("DELETE FROM Clientes WHERE LOWER(cedula_rif) <> 'v-00000000'");
        await pool.query("UPDATE Clientes SET limite_credito = 0, credito_disponible = 0, porcentaje_descuento = 0");
      } catch (e) {}
      writeJsonFile('clients.json', [{ id: 1, cedula_rif: 'V-00000000', nombre: 'Consumidor Final', limite_credito: 0, credito_disponible: 0, porcentaje_descuento: 0, estado: 'Activo' }]);
    }
    if (options.wipeClientBalancesOnly) {
      try {
        await pool.query("TRUNCATE TABLE Abonos RESTART IDENTITY CASCADE");
        await pool.query("UPDATE Clientes SET credito_disponible = limite_credito");
      } catch (e) {}
      writeJsonFile('abonos.json', []);
    }
    if (options.wipeAccionistas) {
      try { await pool.query('TRUNCATE TABLE Accionistas, Inversiones_Accionistas RESTART IDENTITY CASCADE'); } catch (e) {}
      writeJsonFile('accionistas.json', []);
      writeJsonFile('inversiones.json', []);
    }
    if (options.wipeRatesHistory) {
      try { await pool.query('TRUNCATE TABLE Tasas_Cambio RESTART IDENTITY CASCADE'); } catch (e) {}
      writeJsonFile('tasa_history.json', []);
      writeJsonFile('tasas.json', []);
    }
    return true;
  }

  // JSON Mode
  if (options.wipeInventory || isFullWipe) {
    writeJsonFile('products.json', []);
    writeJsonFile('movements.json', []);
    writeJsonFile('price-history.json', []);
    writeJsonFile('price_history.json', []);
  }
  if (options.wipeStock) {
    const products = readJsonFile('products.json', []);
    const updatedProducts = products.map(p => ({ ...p, stock_actual: 0 }));
    writeJsonFile('products.json', updatedProducts);
    writeJsonFile('movements.json', []);
  }
  if (options.wipeSales || isFullWipe) {
    writeJsonFile('sales.json', []);
    writeJsonFile('abonos.json', []);
    writeJsonFile('cierres.json', []);
    writeJsonFile('movements.json', []);
    writeJsonFile('price-history.json', []);
    writeJsonFile('price_history.json', []);
    writeJsonFile('caja_activa.json', { abierta: false, id: null, monto_usd: 0, monto_ves: 0 });
    writeJsonFile('caja_estado.json', { abierta: false, id: null, monto_usd: 0, monto_ves: 0 });
  }
  if (options.wipeClients || isFullWipe) {
    const genericClient = { id: 1, cedula_rif: 'V-00000000', nombre: 'Consumidor Final', limite_credito: 0, credito_disponible: 0, porcentaje_descuento: 0, estado: 'Activo' };
    writeJsonFile('clients.json', [genericClient]);
  }
  if (options.wipeClientBalancesOnly) {
    writeJsonFile('abonos.json', []);
    const clients = readJsonFile('clients.json', []);
    const updatedClients = clients.map(c => ({
      ...c,
      saldo_pendiente: 0,
      credito_disponible: c.limite_credito || 0
    }));
    writeJsonFile('clients.json', updatedClients);
  }
  if (options.wipeRatesHistory || isFullWipe) {
    writeJsonFile('tasa_history.json', []);
    writeJsonFile('tasas.json', []);
  }
  if (options.wipeAccionistas || isFullWipe) {
    writeJsonFile('accionistas.json', []);
    writeJsonFile('inversiones.json', []);
  }
  if (isFullWipe) {
    // Clear users except admin
    const defaultAdminUser = {
      id: 1,
      usuario: 'admin',
      nombre: 'Administrador',
      rol: 'ADMINISTRADOR',
      estado: 'Activo',
      clave: 'admin',
      permisos: {
        caja: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        inventario: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        ventas: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        clientes: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        tasa: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        config: { ver: true, crear: true, editar: true, eliminar: true, admin: true }
      }
    };
    writeJsonFile('users.json', [defaultAdminUser]);

    // Clear perfiles/roles except Administrador
    const defaultAdminRole = {
      id: 1,
      nombre: "Administrador",
      permisos: {
        caja: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        inventario: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        ventas: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        clientes: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        tasa: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
        config: { ver: true, crear: true, editar: true, eliminar: true, admin: true }
      }
    };
    writeJsonFile('roles.json', [defaultAdminRole]);

    // Clear basic and fiscal data
    writeJsonFile('config.json', {
      rif: '',
      nombre_comercio: '',
      direccion: '',
      telefono: '',
      correo: '',
      moneda_base: 'USD',
      mensaje_pie_ticket: '',
      metodos_pago_activos: []
    });
  }
  return true;
}

export async function backupDatabase() {
  return {
    config: await getCompanyConfig(),
    users: await getUsers(),
    roles: await getRoles(),
    products: await getProducts(),
    clients: await getClients(),
    sales: await getSales(),
    abonos: await getAbonos(),
    movements: await getMovements(),
    tasas: await getTasaHistory(),
    cierres: await getCierres(),
    priceHistory: await getPriceHistory(),
    accionistas: await getAccionistas(),
    inversiones: await getInversiones(),
    proveedores: await getProveedores(),
    compras: await getCompras(),
    pagosProveedores: await getPagosProveedores(),
    cotizacionesProveedores: await getCotizacionesProveedores(),
    timestamp: new Date().toISOString()
  };
}

export async function restoreDatabase(data) {
  if (usePostgres) {
    try {
      if (data.products) {
        await pool.query('TRUNCATE TABLE Productos RESTART IDENTITY CASCADE');
        for (const p of data.products) {
          await pool.query(
            `INSERT INTO Productos (id, codigo_barras_clave, descripcion, categoria, stock_actual, stock_minimo, 
             precio_costo_usd, precio_detalle_usd, precio_mayor_usd, cantidad_mayorista, exento_impuesto, imagen_url, 
             estado, a_granel, fecha_vencimiento, porcentaje_impuesto) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [p.id, p.barcode || p.codigo_barras_clave, p.description || p.descripcion, p.category || p.categoria, p.stock_actual, p.stock_minimo,
             p.precio_costo_usd, p.precio_detalle_usd, p.precio_mayor_usd, p.cantidad_mayorista, p.exento_impuesto, p.imagen_url || '',
             p.estado || 'Activo', p.a_granel || false, p.fecha_vencimiento || null, p.porcentaje_impuesto || 0]
          );
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('Productos', 'id'), COALESCE((SELECT MAX(id) FROM Productos), 1))");
      }
      if (data.clients) {
        await pool.query('TRUNCATE TABLE Clientes RESTART IDENTITY CASCADE');
        for (const c of data.clients) {
          await pool.query(
            `INSERT INTO Clientes (id, cedula_rif, nombre, telefono, direccion, limite_credito, credito_disponible, porcentaje_descuento, estado, aplica_precio_costo) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [c.id, c.cedula_rif, c.nombre, c.telefono || '', c.direccion || '', c.limite_credito, c.credito_disponible, c.porcentaje_descuento, c.estado || 'Activo', c.aplica_precio_costo || false]
          );
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('Clientes', 'id'), COALESCE((SELECT MAX(id) FROM Clientes), 1))");
      }
      if (data.users) {
        await pool.query('TRUNCATE TABLE Usuarios RESTART IDENTITY CASCADE');
        for (const u of data.users) {
          await pool.query(
            'INSERT INTO Usuarios (id, usuario, nombre, rol, estado, clave, permisos) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [u.id, u.usuario, u.nombre, u.rol, u.estado || 'Activo', u.clave || 'admin', typeof u.permisos === 'string' ? u.permisos : JSON.stringify(u.permisos)]
          );
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('Usuarios', 'id'), COALESCE((SELECT MAX(id) FROM Usuarios), 1))");
      }
      if (data.roles) {
        await pool.query('TRUNCATE TABLE Roles RESTART IDENTITY CASCADE');
        for (const r of data.roles) {
          await pool.query(
            'INSERT INTO Roles (id, nombre, permisos) VALUES ($1, $2, $3)',
            [r.id, r.nombre, typeof r.permisos === 'string' ? r.permisos : JSON.stringify(r.permisos)]
          );
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('Roles', 'id'), COALESCE((SELECT MAX(id) FROM Roles), 1))");
      }
      if (data.accionistas) {
        await pool.query('TRUNCATE TABLE Accionistas RESTART IDENTITY CASCADE');
        for (const a of data.accionistas) {
          await pool.query(
            'INSERT INTO Accionistas (id, nombre, cedula_rif, telefono, estado) VALUES ($1, $2, $3, $4, $5)',
            [a.id, a.nombre, a.cedula_rif || '', a.telefono || '', a.estado || 'Activo']
          );
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('Accionistas', 'id'), COALESCE((SELECT MAX(id) FROM Accionistas), 1))");
      }
      if (data.inversiones) {
        await pool.query('TRUNCATE TABLE Inversiones_Accionistas RESTART IDENTITY CASCADE');
        for (const inv of data.inversiones) {
          await pool.query(
            'INSERT INTO Inversiones_Accionistas (id, accionista_id, fecha, monto_usd, observacion) VALUES ($1, $2, $3, $4, $5)',
            [inv.id, inv.accionista_id, inv.fecha, inv.monto_usd, inv.observacion || '']
          );
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('Inversiones_Accionistas', 'id'), COALESCE((SELECT MAX(id) FROM Inversiones_Accionistas), 1))");
      }
      if (data.proveedores) {
        await pool.query('TRUNCATE TABLE Proveedores RESTART IDENTITY CASCADE');
        for (const p of data.proveedores) {
          await pool.query(
            `INSERT INTO Proveedores (id, rif, razon_social, contacto_nombre, telefono, correo, direccion, dias_credito, limite_credito_usd, saldo_pendiente_usd, estado)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [p.id, p.rif, p.razon_social, p.contacto_nombre || '', p.telefono || '', p.correo || '', p.direccion || '', p.dias_credito || 0, p.limite_credito_usd || 0, p.saldo_pendiente_usd || 0, p.estado || 'Activo']
          );
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('Proveedores', 'id'), COALESCE((SELECT MAX(id) FROM Proveedores), 1))");
      }
      if (data.compras) {
        await pool.query('TRUNCATE TABLE Compras, Compras_Detalle RESTART IDENTITY CASCADE');
        for (const c of data.compras) {
          await pool.query(
            `INSERT INTO Compras (id, numero_factura, proveedor_id, usuario_id, fecha_emision, fecha_vencimiento, condicion_pago, subtotal_usd, impuesto_usd, descuento_usd, total_usd, total_ves, saldo_pendiente_usd, estatus, observaciones)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [c.id, c.numero_factura, c.proveedor_id, c.usuario_id || 1, c.fecha_emision, c.fecha_vencimiento || null, c.condicion_pago || 'Contado', c.subtotal_usd || 0, c.impuesto_usd || 0, c.descuento_usd || 0, c.total_usd || 0, c.total_ves || 0, c.saldo_pendiente_usd || 0, c.estatus || 'Pendiente', c.observaciones || '']
          );
          if (Array.isArray(c.items)) {
            for (const it of c.items) {
              await pool.query(
                `INSERT INTO Compras_Detalle (compra_id, producto_id, cantidad, costo_unitario_usd, total_usd)
                 VALUES ($1, $2, $3, $4, $5)`,
                [c.id, it.producto_id, it.cantidad, it.costo_unitario_usd, it.total_usd]
              );
            }
          }
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('Compras', 'id'), COALESCE((SELECT MAX(id) FROM Compras), 1))");
        await pool.query("SELECT setval(pg_get_serial_sequence('Compras_Detalle', 'id'), COALESCE((SELECT MAX(id) FROM Compras_Detalle), 1))");
      }
      const pagosList = data.pagosProveedores || data.pagos_proveedores;
      if (pagosList) {
        await pool.query('TRUNCATE TABLE Pagos_Proveedores RESTART IDENTITY CASCADE');
        for (const pg of pagosList) {
          await pool.query(
            `INSERT INTO Pagos_Proveedores (id, compra_id, proveedor_id, usuario_id, caja_id, monto_usd, monto_ves, tasa_cambio, metodo_pago, banco_origen, numero_referencia, afecto_caja_efectivo, observacion, fecha)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [pg.id, pg.compra_id || null, pg.proveedor_id, pg.usuario_id || 1, pg.caja_id || null, pg.monto_usd || 0, pg.monto_ves || 0, pg.tasa_cambio || 1, pg.metodo_pago || 'Efectivo$', pg.banco_origen || '', pg.numero_referencia || '', !!pg.afecto_caja_efectivo, pg.observacion || '', pg.fecha || new Date()]
          );
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('Pagos_Proveedores', 'id'), COALESCE((SELECT MAX(id) FROM Pagos_Proveedores), 1))");
      }
      const cotList = data.cotizacionesProveedores || data.cotizaciones_proveedores;
      if (cotList) {
        await pool.query('TRUNCATE TABLE Cotizaciones_Proveedores RESTART IDENTITY CASCADE');
        for (const cot of cotList) {
          await pool.query(
            `INSERT INTO Cotizaciones_Proveedores (id, numero_cotizacion, proveedor_id, usuario_id, fecha, fecha_vigencia, total_usd, total_ves, detalles_json, estatus)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [cot.id, cot.numero_cotizacion, cot.proveedor_id, cot.usuario_id || 1, cot.fecha, cot.fecha_vigencia || null, cot.total_usd || 0, cot.total_ves || 0, typeof cot.detalles_json === 'string' ? cot.detalles_json : JSON.stringify(cot.detalles_json || {}), cot.estatus || 'Pendiente']
          );
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('Cotizaciones_Proveedores', 'id'), COALESCE((SELECT MAX(id) FROM Cotizaciones_Proveedores), 1))");
      }
      if (data.config) {
        await saveCompanyConfig(data.config);
      }
    } catch (err) {
      console.error('Error al restaurar en Postgres:', err.message);
    }
  }

  // Backup restore write files
  if (data.config) writeJsonFile('config.json', data.config);
  if (data.users) writeJsonFile('users.json', data.users);
  if (data.roles) writeJsonFile('roles.json', data.roles);
  if (data.products) writeJsonFile('products.json', data.products);
  if (data.clients) writeJsonFile('clients.json', data.clients);
  if (data.sales) writeJsonFile('sales.json', data.sales);
  if (data.abonos) writeJsonFile('abonos.json', data.abonos);
  if (data.movements) writeJsonFile('movements.json', data.movements);
  if (data.tasas) writeJsonFile('tasas.json', data.tasas);
  if (data.cierres) writeJsonFile('cierres.json', data.cierres);
  if (data.priceHistory) {
    writeJsonFile('price-history.json', data.priceHistory);
    writeJsonFile('price_history.json', data.priceHistory);
  }
  if (data.accionistas) writeJsonFile('accionistas.json', data.accionistas);
  if (data.inversiones) writeJsonFile('inversiones.json', data.inversiones);
  if (data.proveedores) writeJsonFile('proveedores.json', data.proveedores);
  if (data.compras) writeJsonFile('compras.json', data.compras);
  if (data.pagosProveedores || data.pagos_proveedores) writeJsonFile('pagos_proveedores.json', data.pagosProveedores || data.pagos_proveedores);
  if (data.cotizacionesProveedores || data.cotizaciones_proveedores) writeJsonFile('cotizaciones_proveedores.json', data.cotizacionesProveedores || data.cotizaciones_proveedores);
  return true;
}

export async function getTasaHistory() {
  if (usePostgres) {
    try {
      const res = await pool.query(`
        SELECT t.id, t.tasa_cobro, t.tasa_vuelto, t.fecha_actualizacion, u.nombre as usuario 
        FROM Tasas_Cambio t 
        LEFT JOIN Usuarios u ON t.usuario_id = u.id 
        ORDER BY t.fecha_actualizacion ASC, t.id ASC
      `);
      const list = res.rows.map(r => ({
        id: r.id,
        tasa_cobro: parseFloat(r.tasa_cobro),
        tasa_vuelto: parseFloat(r.tasa_vuelto),
        fecha_actualizacion: getLocalISODateString(new Date(r.fecha_actualizacion)),
        usuario: r.usuario || 'SISTEMA'
      }));
      // Sort explicitly by date timestamp to guarantee latest rate is at array end
      return list.sort((a, b) => new Date(a.fecha_actualizacion).getTime() - new Date(b.fecha_actualizacion).getTime() || Number(a.id) - Number(b.id));
    } catch (err) {
      console.error('Error en getTasaHistory (Postgres):', err.message);
    }
  }
  return readJsonFile('tasa_history.json', []);
}

export async function saveTasa(t) {
  if (usePostgres) {
    try {
      let userId = parseInt(t.usuarioId || t.usuario_id);
      if (isNaN(userId) || userId <= 0) {
        if (t.usuario) {
          const uRes = await pool.query('SELECT id FROM Usuarios WHERE nombre = $1 OR usuario = $2 LIMIT 1', [t.usuario, t.usuario]);
          if (uRes.rowCount > 0) userId = uRes.rows[0].id;
        }
      }
      if (isNaN(userId) || userId <= 0) userId = 1;
      
      const nowStr = getLocalISODateString();
      const res = await pool.query(
        `INSERT INTO Tasas_Cambio (tasa_cobro, tasa_vuelto, fecha_actualizacion, usuario_id)
         VALUES ($1, $2, $3, $4) RETURNING id, fecha_actualizacion`,
        [t.tasa_cobro, t.tasa_vuelto, nowStr, userId]
      );

      const opRes = await pool.query('SELECT nombre FROM Usuarios WHERE id = $1', [userId]);
      const opName = opRes.rowCount > 0 ? opRes.rows[0].nombre : (t.usuario || 'SISTEMA');

      return { 
        id: res.rows[0].id,
        tasa_cobro: parseFloat(t.tasa_cobro),
        tasa_vuelto: parseFloat(t.tasa_vuelto),
        fecha_actualizacion: getLocalISODateString(res.rows[0].fecha_actualizacion),
        usuario: opName
      };
    } catch (err) {
      console.error('Error en saveTasa (Postgres):', err.message);
      throw err;
    }
  }
  const history = readJsonFile('tasa_history.json', []);
  const newItem = { ...t, id: Date.now(), fecha_actualizacion: getLocalISODateString() };
  history.push(newItem);
  writeJsonFile('tasa_history.json', history);
  return newItem;
}

export async function clearTasaHistory() {
  if (usePostgres) {
    try {
      await pool.query('TRUNCATE TABLE Tasas_Cambio RESTART IDENTITY');
      return true;
    } catch (err) {
      console.error('Error en clearTasaHistory (Postgres):', err.message);
      throw err;
    }
  }
  writeJsonFile('tasa_history.json', []);
  return true;
}


export async function getMovements() {
  if (usePostgres) {
    try {
      const res = await pool.query(`
        SELECT m.id, m.fecha as date, p.codigo_barras_clave as "productCode", p.descripcion as "productDescription",
               m.tipo, m.cantidad as qty, m.stock_anterior, m.stock_posterior, m.motivo, u.nombre as usuario
        FROM Movimientos_Inventario m
        LEFT JOIN Productos p ON m.producto_id = p.id
        LEFT JOIN Usuarios u ON m.usuario_id = u.id
        ORDER BY m.id DESC
      `);
      return res.rows.map(r => ({
        id: parseInt(r.id, 10),
        date: r.date ? getLocalISODateString(r.date) : getLocalISODateString(),
        productCode: r.productCode || '',
        productDescription: r.productDescription || '',
        type: r.tipo,
        qty: parseFloat(r.qty || 0),
        stock_anterior: parseFloat(r.stock_anterior || 0),
        stock_posterior: parseFloat(r.stock_posterior || 0),
        motivo: r.motivo || '',
        usuario: r.usuario || 'SISTEMA'
      }));
    } catch (err) {
      console.error('Error en getMovements (Postgres):', err.message);
    }
  }
  return readJsonFile('movements.json', []);
}

export async function saveMovement(m) {
  if (usePostgres) {
    try {
      const prodRes = await pool.query('SELECT id FROM Productos WHERE codigo_barras_clave = $1', [m.productCode]);
      const userRes = await pool.query('SELECT id FROM Usuarios LIMIT 1');
      
      if (prodRes.rowCount > 0) {
        const prodId = prodRes.rows[0].id;
        const userId = userRes.rowCount > 0 ? userRes.rows[0].id : 1;
        
        const res = await pool.query(
          `INSERT INTO Movimientos_Inventario (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_posterior, motivo)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, fecha`,
          [prodId, userId, m.type, m.qty, m.stock_anterior, m.stock_posterior, m.motivo]
        );
        return {
          ...m,
          id: res.rows[0].id,
          date: getLocalISODateString(new Date(res.rows[0].fecha))
        };
      }
    } catch (err) {
      console.error('Error en saveMovement (Postgres):', err.message);
    }
  }
  const movements = readJsonFile('movements.json', []);
  const newItem = { ...m, id: Date.now() };
  movements.push(newItem);
  writeJsonFile('movements.json', movements);
  return newItem;
}

export async function getPriceHistory() {
  if (usePostgres) {
    try {
      const res = await pool.query(`
        SELECT h.id, p.codigo_barras_clave as "productCode", p.descripcion as "productDescription",
               h.tipo_precio as "priceType", h.precio_anterior as "oldPrice", h.precio_nuevo as "newPrice",
               h.motivo, h.fecha, u.nombre as usuario
        FROM Historial_Precios h
        LEFT JOIN Productos p ON h.producto_id = p.id
        LEFT JOIN Usuarios u ON h.usuario_id = u.id
        ORDER BY h.id DESC
      `);
      return res.rows.map(r => ({
        id: parseInt(r.id, 10),
        date: r.fecha ? getLocalISODateString(r.fecha) : getLocalISODateString(),
        productCode: r.productCode || '',
        productDescription: r.productDescription || '',
        priceType: r.priceType,
        oldPrice: parseFloat(r.oldPrice || 0),
        newPrice: parseFloat(r.newPrice || 0),
        motivo: r.motivo || '',
        usuario: r.usuario || 'SISTEMA'
      }));
    } catch (err) {
      console.error('Error en getPriceHistory (Postgres):', err.message);
    }
  }
  return readJsonFile('price_history.json', []);
}

export async function savePriceHistory(h) {
  if (usePostgres) {
    try {
      const prodRes = await pool.query('SELECT id FROM Productos WHERE codigo_barras_clave = $1', [h.productCode]);
      const userRes = await pool.query('SELECT id FROM Usuarios LIMIT 1');
      
      if (prodRes.rowCount > 0) {
        const prodId = prodRes.rows[0].id;
        const userId = userRes.rowCount > 0 ? userRes.rows[0].id : 1;
        
        const res = await pool.query(
          `INSERT INTO Historial_Precios (producto_id, usuario_id, tipo_precio, precio_anterior, precio_nuevo, motivo)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, fecha`,
          [prodId, userId, h.priceType, h.oldPrice, h.newPrice, h.motivo]
        );
        return {
          ...h,
          id: res.rows[0].id,
          date: getLocalISODateString(new Date(res.rows[0].fecha))
        };
      }
    } catch (err) {
      console.error('Error en savePriceHistory (Postgres):', err.message);
    }
  }
  const history = readJsonFile('price_history.json', []);
  const newItem = { ...h, id: Date.now() };
  history.push(newItem);
  writeJsonFile('price_history.json', history);
  return newItem;
}

export async function getSales(limit = null, sinceId = null, excludeTerminal = null) {
  if (usePostgres) {
    try {
      const conditions = [];
      const params = [];

      if (sinceId && sinceId > 0) {
        params.push(sinceId);
        conditions.push(`v.id > $${params.length}`);
      }

      if (excludeTerminal) {
        params.push(excludeTerminal);
        conditions.push(`v.estacion_nombre <> $${params.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      let limitClause = '';
      if (limit && Number.isInteger(limit) && limit > 0) {
        params.push(limit);
        limitClause = `LIMIT $${params.length}`;
      }

      const salesRes = await pool.query(`
        SELECT v.id, v.factura_nro, v.fecha, v.subtotal_usd, v.descuento_usd, v.total_usd, v.total_ves, v.con_ticket,
               v.vuelto_usd as "vueltoUSD", v.vuelto_ves as "vueltoVES",
               v.tipo_documento, v.nro_fiscal, v.serial_fiscal, v.nro_z, v.estatus_fiscal,
               v.base_imponible_usd, v.iva_usd, v.exento_usd, v.igtf_usd,
               v.estacion_nombre as terminal, c.cedula_rif as "clientDoc", c.nombre as "clientName", u.nombre as usuario,
               cac.estatus as caja_estatus,
               COALESCE((
                 SELECT json_agg(json_build_object(
                   'qty', vd.cantidad,
                   'precio_unitario_usd', vd.precio_unitario_usd,
                   'tipo_precio', vd.tipo_precio,
                   'total_fila_usd', vd.total_fila_usd,
                   'priceUSD', vd.precio_unitario_usd,
                   'totalUSD', vd.total_fila_usd,
                   'product', json_build_object(
                     'barcode', p.codigo_barras_clave,
                     'description', p.descripcion,
                     'precio_costo_usd', p.precio_costo_usd,
                     'exento_impuesto', p.exento_impuesto,
                     'porcentaje_impuesto', p.porcentaje_impuesto
                   )
                 ))
                 FROM Ventas_Detalle vd
                 LEFT JOIN Productos p ON vd.producto_id = p.id
                 WHERE vd.venta_id = v.id
               ), '[]'::json) as items_json,
               COALESCE((
                 SELECT json_agg(json_build_object(
                   'metodo', pv.metodo_pago,
                   'monto', pv.monto_entregado_usd,
                   'montoVES', pv.monto_entregado_ves,
                   'banco', pv.banco_emisor,
                   'referencia', pv.numero_referencia
                 ))
                 FROM Pagos_Venta pv
                 WHERE pv.venta_id = v.id
               ), '[]'::json) as payments_json
        FROM Ventas v
        LEFT JOIN Clientes c ON v.cliente_id = c.id
        LEFT JOIN Usuarios u ON v.usuario_id = u.id
        LEFT JOIN Cajas_Apertura_Cierre cac ON v.caja_id = cac.id
        ${whereClause}
        ORDER BY v.id DESC
        ${limitClause}
      `, params);

      return salesRes.rows.map(row => ({
        id: row.id,
        factura_nro: row.factura_nro,
        fecha: getLocalISODateString(new Date(row.fecha)),
        caja_estatus: row.caja_estatus || 'Cerrada',
        tipo_documento: row.tipo_documento || (row.nro_fiscal ? 'FACTURA_FISCAL' : 'NOTA_ENTREGA'),
        nro_fiscal: row.nro_fiscal || null,
        serial_fiscal: row.serial_fiscal || null,
        nro_z: row.nro_z || null,
        estatus_fiscal: row.estatus_fiscal || 'NO_APLICA',
        base_imponible_usd: parseFloat(row.base_imponible_usd || 0),
        iva_usd: parseFloat(row.iva_usd || 0),
        exento_usd: parseFloat(row.exento_usd || 0),
        igtf_usd: parseFloat(row.igtf_usd || 0),
        client: {
          cedula_rif: row.clientDoc,
          nombre: row.clientName
        },
        items: (row.items_json || []).map(i => ({
          qty: parseFloat(i.qty || 0),
          precio_unitario_usd: parseFloat(i.precio_unitario_usd || 0),
          total_fila_usd: parseFloat(i.total_fila_usd || 0),
          priceUSD: parseFloat(i.priceUSD || i.precio_unitario_usd || 0),
          totalUSD: parseFloat(i.totalUSD || i.total_fila_usd || 0),
          product: {
            barcode: i.product?.barcode || '',
            description: i.product?.description || '',
            precio_costo_usd: parseFloat(i.product?.precio_costo_usd || 0),
            exento_impuesto: !!i.product?.exento_impuesto,
            porcentaje_impuesto: parseFloat(i.product?.porcentaje_impuesto || 0)
          }
        })),
        subtotal: parseFloat(row.subtotal_usd || 0),
        descuento: parseFloat(row.descuento_usd || 0),
        totalUSD: parseFloat(row.total_usd || 0),
        totalVES: parseFloat(row.total_ves || 0),
        pagos: (row.payments_json || []).map(p => ({
          metodo: p.metodo,
          monto: parseFloat(p.monto || 0),
          montoVES: parseFloat(p.montoVES || 0),
          banco: p.banco || '',
          referencia: p.referencia || ''
        })),
        vueltoUSD: parseFloat(row.vueltoUSD || 0),
        vueltoVES: parseFloat(row.vueltoVES || 0),
        usuario: row.usuario,
        terminal: row.terminal
      }));
    } catch (err) {
      console.error('Error en getSales (Postgres):', err.message);
    }
  }
  const sales = readJsonFile('sales.json', []);
  if (sinceId && sinceId > 0) {
    return sales.filter(s => s.id && s.id > sinceId && (excludeTerminal ? s.terminal !== excludeTerminal : true));
  }
  return sales;
}

export async function saveSale(s) {
  if (usePostgres) {
    const clientTarget = await pool.connect();
    try {
      await clientTarget.query('BEGIN');
      
      // Get IDs
      const clientDoc = s.client?.cedula_rif || s.client?.cedula || 'V-00000000';
      const clientRes = await clientTarget.query('SELECT id FROM Clientes WHERE cedula_rif = $1 OR id = $2', [clientDoc, s.client?.id || 0]);
      const myTerminal = s.terminal || s.estacion_nombre || 'CAJA_PRINCIPAL';

      let userId = 1;
      if (s.usuario) {
        const userLookup = await clientTarget.query('SELECT id FROM Usuarios WHERE nombre = $1 OR usuario = $2 LIMIT 1', [s.usuario, s.usuario]);
        if (userLookup.rowCount > 0) {
          userId = userLookup.rows[0].id;
        } else {
          const userRes = await clientTarget.query('SELECT id FROM Usuarios LIMIT 1');
          userId = userRes.rowCount > 0 ? userRes.rows[0].id : 1;
        }
      } else {
        const userRes = await clientTarget.query('SELECT id FROM Usuarios LIMIT 1');
        userId = userRes.rowCount > 0 ? userRes.rows[0].id : 1;
      }

      const sysConfig = await getCompanyConfig();
      const compartirApertura = sysConfig.compartir_apertura_caja !== false;

      let activeCaja;
      if (userId > 0) {
        if (compartirApertura) {
          activeCaja = await clientTarget.query(
            "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND usuario_id = $1 ORDER BY (estacion_nombre = $2) DESC, id DESC LIMIT 1",
            [userId, myTerminal]
          );
        } else {
          activeCaja = await clientTarget.query(
            "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND estacion_nombre = $1 AND usuario_id = $2 ORDER BY id DESC LIMIT 1",
            [myTerminal, userId]
          );
        }
      }

      if (!activeCaja || activeCaja.rowCount === 0) {
        activeCaja = await clientTarget.query(
          "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND (estacion_nombre = $1 OR estacion_nombre = 'CAJA_PRINCIPAL' OR estacion_nombre = 'LOCAL') ORDER BY id DESC LIMIT 1",
          [myTerminal]
        );
      }
      if (!activeCaja || activeCaja.rowCount === 0) {
        activeCaja = await clientTarget.query("SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' ORDER BY id DESC LIMIT 1");
      }

      const clientId = clientRes.rowCount > 0 ? clientRes.rows[0].id : 1;
      const cajaId = activeCaja.rowCount > 0 ? activeCaja.rows[0].id : 1;
      
      // Safe sequence generator for invoice numbers (auto-creates seq_factura if missing)
      const fetchNextSeqFactura = async () => {
        try {
          const seqRes = await clientTarget.query("SELECT 'FAC-' || LPAD(nextval('seq_factura')::text, 6, '0') AS factura_nro");
          return seqRes.rows[0].factura_nro;
        } catch (seqErr) {
          if (seqErr.message.includes('seq_factura')) {
            await clientTarget.query("CREATE SEQUENCE IF NOT EXISTS seq_factura START WITH 1");
            await clientTarget.query("SELECT setval('seq_factura', COALESCE((SELECT MAX(CAST(NULLIF(regexp_replace(factura_nro, '\\D', '', 'g'), '') AS INTEGER)) FROM Ventas WHERE factura_nro LIKE 'FAC-%'), 1))");
            const seqRes = await clientTarget.query("SELECT 'FAC-' || LPAD(nextval('seq_factura')::text, 6, '0') AS factura_nro");
            return seqRes.rows[0].factura_nro;
          }
          throw seqErr;
        }
      };

      let factura_nro = s.factura_nro;
      if (!factura_nro || (!factura_nro.startsWith('DEV-') && !factura_nro.startsWith('FAC-'))) {
        factura_nro = await fetchNextSeqFactura();
      } else if (!factura_nro.startsWith('DEV-')) {
        factura_nro = await fetchNextSeqFactura();
      } else {
        // Safe check for DEV- return invoices: if it already exists in database, make it unique with a suffix
        const existsRes = await clientTarget.query('SELECT id FROM Ventas WHERE factura_nro = $1', [factura_nro]);
        if (existsRes.rowCount > 0) {
          const baseDev = factura_nro.split('-').slice(0, 2).join('-');
          const countRes = await clientTarget.query('SELECT COUNT(*) FROM Ventas WHERE factura_nro LIKE $1', [`${baseDev}%`]);
          const devSuffix = parseInt(countRes.rows[0].count, 10) + 1;
          factura_nro = `${baseDev}-${devSuffix}`;
        }
      }
      const tipoDoc = s.tipo_documento || (s.nro_fiscal ? 'FACTURA_FISCAL' : 'NOTA_ENTREGA');
      const nroFiscal = s.nro_fiscal || null;
      const serialFiscal = s.serial_fiscal || null;
      const nroZ = s.nro_z || null;
      const estatusFiscal = s.estatus_fiscal || (s.nro_fiscal ? 'EMITIDA' : 'NO_APLICA');
      const baseImp = s.base_imponible_usd || s.baseImponible || 0;
      const ivaVal = s.iva_usd || s.iva || 0;
      const exentoVal = s.exento_usd || s.montoExento || 0;
      const igtfVal = s.igtf_usd || s.igtf || 0;

      const saleRes = await clientTarget.query(
        `INSERT INTO Ventas (
          factura_nro, cliente_id, usuario_id, caja_id, subtotal_usd, descuento_usd, total_usd, total_ves, 
          estacion_nombre, vuelto_usd, vuelto_ves, tipo_documento, nro_fiscal, serial_fiscal, nro_z, 
          estatus_fiscal, base_imponible_usd, iva_usd, exento_usd, igtf_usd
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) 
         RETURNING id, fecha`,
        [
          factura_nro, clientId, userId, cajaId, s.subtotal, s.descuento, s.totalUSD, s.totalVES, 
          s.terminal || 'CAJA_PRINCIPAL', s.vueltoUSD || 0, s.vueltoVES || 0,
          tipoDoc, nroFiscal, serialFiscal, nroZ, estatusFiscal, baseImp, ivaVal, exentoVal, igtfVal
        ]
      );
      
      const saleId = saleRes.rows[0].id;
      
      // Insert Items & adjust stock
      const isDevSale = factura_nro.startsWith('DEV-');
      for (const item of s.items) {
        const barcode = item.product?.barcode || item.product?.codigo_barras_clave || '';
        let prodRes = await clientTarget.query('SELECT id, stock_actual, precio_detalle_usd, a_granel FROM Productos WHERE codigo_barras_clave = $1', [barcode]);
        if (prodRes.rowCount === 0 && item.product?.id) {
          prodRes = await clientTarget.query('SELECT id, stock_actual, precio_detalle_usd, a_granel FROM Productos WHERE id = $1', [item.product.id]);
        }
        if (prodRes.rowCount > 0) {
          const prodId = prodRes.rows[0].id;
          const currentStock = parseFloat(prodRes.rows[0].stock_actual || 0);
          const isGranel = !!prodRes.rows[0].a_granel;
          
          const rawQty = Math.abs(item.qty);
          const cleanQty = isGranel ? rawQty : Math.round(rawQty);
          const stockDelta = isDevSale ? cleanQty : -cleanQty;
          let newStock = currentStock + stockDelta;
          if (!isGranel) {
            newStock = Math.round(newStock);
          }
          newStock = Math.max(0, newStock);
          
          // Insert details
          await clientTarget.query(
            `INSERT INTO Ventas_Detalle (venta_id, producto_id, cantidad, precio_unitario_usd, tipo_precio, total_fila_usd)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              saleId, 
              prodId, 
              cleanQty, 
              item.precio_unitario_usd || item.priceUSD || item.product?.precio_detalle_usd || 0, 
              item.tipo_precio || item.priceType || 'Detalle', 
              item.total_fila_usd || item.totalUSD || (cleanQty * (item.priceUSD || item.product?.precio_detalle_usd || 0))
            ]
          );
          
          // Update Stock (increment for DEV-, decrement for FAC-)
          await clientTarget.query('UPDATE Productos SET stock_actual = $1 WHERE id = $2', [newStock, prodId]);
          
          // Log Kardex
          await clientTarget.query(
            `INSERT INTO Movimientos_Inventario (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_posterior, motivo)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [prodId, userId, isDevSale ? 'Devolucion' : 'Venta', stockDelta, currentStock, newStock, isDevSale ? `Devolución Facturada: ${factura_nro}` : `Venta Facturada: ${factura_nro}`]
          );
        }
      }
      
      // Insert Payments
      for (const p of s.pagos) {
        // Adjust client credit if Credit was used (positive for credit purchase, negative for credit return)
        if (p.metodo === 'CreditoCliente' && (p.monto || p.montoUSD)) {
          const mUSD = p.montoUSD || p.monto || 0;
          if (mUSD !== 0) {
            await clientTarget.query(
              'UPDATE Clientes SET credito_disponible = GREATEST(0, LEAST(limite_credito, credito_disponible - $1)) WHERE id = $2',
              [mUSD, clientId]
            );
          }
        }
        
        try {
          await clientTarget.query(
            `INSERT INTO Pagos_Venta (venta_id, metodo_pago, monto_entregado_usd, monto_entregado_ves, monto_vuelto_usd, monto_vuelto_ves, banco_emisor, numero_referencia)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [saleId, p.metodo, p.monto, p.montoVES || 0, s.vueltoUSD || 0, s.vueltoVES || 0, p.banco || '', p.referencia || '']
          );
        } catch (payErr) {
          if (payErr.message && payErr.message.includes('pagos_venta_metodo_pago_check')) {
            console.log('⚠️ Eliminando restricción legacy CHECK pagos_venta_metodo_pago_check en caliente...');
            await pool.query('ALTER TABLE Pagos_Venta DROP CONSTRAINT IF EXISTS pagos_venta_metodo_pago_check');
            await clientTarget.query(
              `INSERT INTO Pagos_Venta (venta_id, metodo_pago, monto_entregado_usd, monto_entregado_ves, monto_vuelto_usd, monto_vuelto_ves, banco_emisor, numero_referencia)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [saleId, p.metodo, p.monto, p.montoVES || 0, s.vueltoUSD || 0, s.vueltoVES || 0, p.banco || '', p.referencia || '']
            );
          } else {
            throw payErr;
          }
        }
      }
      
      await clientTarget.query('COMMIT');
      return {
        ...s,
        id: saleId,
        factura_nro,
        fecha: getLocalISODateString(new Date(saleRes.rows[0].fecha))
      };
    } catch (err) {
      await clientTarget.query('ROLLBACK');
      console.error('Error al registrar venta en Postgres:', err.message);
      throw err; // Propagate error so server returns HTTP 500 and frontend knows the sale failed
    } finally {
      clientTarget.release();
    }
  }
  // JSON fallback: generate a sequential invoice number based on current max in file
  const sales = readJsonFile('sales.json', []);
  let factura_nro_json = s.factura_nro;
  if (!factura_nro_json || !factura_nro_json.startsWith('DEV-')) {
    const numbers = sales
      .map(sale => { const m = sale.factura_nro?.match(/^FAC-(\d+)$/); return m ? parseInt(m[1], 10) : 0; })
      .filter(n => n > 0);
    const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
    factura_nro_json = `FAC-${String(maxNum + 1).padStart(6, '0')}`;
  }
  // Adjust client credit in JSON fallback if Credit was used
  const creditPayment = (s.pagos || []).find(p => p.metodo === 'CreditoCliente');
  if (creditPayment) {
    const montoUsd = creditPayment.montoUSD || creditPayment.monto || 0;
    if (montoUsd !== 0) {
      const clients = readJsonFile('clients.json', mockClients);
      const cIdx = clients.findIndex(c => c.cedula_rif === s.client?.cedula_rif || c.id === s.client?.id);
      if (cIdx !== -1) {
        const lim = clients[cIdx].limite_credito || 0;
        clients[cIdx].credito_disponible = Math.min(lim, Math.max(0, (clients[cIdx].credito_disponible || 0) - montoUsd));
        clients[cIdx].saldo_pendiente = Math.max(0, lim - clients[cIdx].credito_disponible);
        writeJsonFile('clients.json', clients);
      }
    }
  }

  const newSale = {
    ...s,
    factura_nro: factura_nro_json,
    id: Date.now(),
    fecha: getLocalISODateString()
  };
  sales.push(newSale);
  writeJsonFile('sales.json', sales);
  return newSale;
}

export async function getCierres() {
  if (usePostgres) {
    try {
      const res = await pool.query(`
        SELECT c.id, c.fecha_apertura, c.fecha_cierre, c.monto_apertura_usd, c.monto_apertura_ves,
               c.monto_cierre_real_usd, c.monto_cierre_real_ves, c.monto_cierre_esperado_usd, c.monto_cierre_esperado_ves,
               c.venta_total_usd, c.utilidad_usd, c.detalles_json,
               c.vuelto_entregado_usd, c.vuelto_entregado_ves,
               c.ventas_efectivo_usd, c.ventas_efectivo_ves,
               c.abono_clientes_usd, c.abono_clientes_ves,
               c.entrada_efectivo_usd, c.entrada_efectivo_ves,
               c.salida_efectivo_usd, c.salida_efectivo_ves,
               c.devolucion_efectivo_usd, c.devolucion_efectivo_ves,
               u.nombre as usuario, c.estatus, c.estacion_nombre as terminal
        FROM Cajas_Apertura_Cierre c
        LEFT JOIN Usuarios u ON c.usuario_id = u.id
        ORDER BY c.id DESC
      `);
      return res.rows.map(r => {
        let parsedDetails = {};
        if (r.detalles_json) {
          try {
            parsedDetails = JSON.parse(r.detalles_json);
          } catch (e) {
            console.error('Error parsing detalles_json', e);
          }
        }
        const fApertura = r.fecha_apertura ? getLocalISODateString(r.fecha_apertura) : getLocalISODateString();
        const fCierre = r.estatus === 'Abierta' || !r.fecha_cierre ? null : getLocalISODateString(r.fecha_cierre);

        const cajeroName = parsedDetails.usuario || r.usuario || 'SISTEMA';

        const sqlVueltosUsd = parseFloat(r.vuelto_entregado_usd || '0');
        const sqlVueltosVes = parseFloat(r.vuelto_entregado_ves || '0');

        const finalVueltosUsd = sqlVueltosUsd > 0 ? sqlVueltosUsd : (parsedDetails.vueltosEntregadosUsd ?? parsedDetails.vueltosUsd ?? parsedDetails.vueltosEntregadosUSD ?? parsedDetails.vueltoUSD ?? 0);
        const finalVueltosVes = sqlVueltosVes > 0 ? sqlVueltosVes : (parsedDetails.vueltosEntregadosVes ?? parsedDetails.vueltosVes ?? parsedDetails.vueltosEntregadosVES ?? parsedDetails.vueltoVES ?? 0);

        const sqlVentasUsd = parseFloat(r.ventas_efectivo_usd || '0');
        const sqlVentasVes = parseFloat(r.ventas_efectivo_ves || '0');
        const finalVentasEfectivoUsd = sqlVentasUsd > 0 ? sqlVentasUsd : (parsedDetails.ventasEfectivoUsd ?? 0);
        const finalVentasEfectivoVes = sqlVentasVes > 0 ? sqlVentasVes : (parsedDetails.ventasEfectivoVes ?? 0);

        const sqlAbonosUsd = parseFloat(r.abono_clientes_usd || '0');
        const sqlAbonosVes = parseFloat(r.abono_clientes_ves || '0');
        const finalAbonosUsd = sqlAbonosUsd > 0 ? sqlAbonosUsd : (parsedDetails.abonoClientesUsd ?? parsedDetails.abonosUsd ?? 0);
        const finalAbonosVes = sqlAbonosVes > 0 ? sqlAbonosVes : (parsedDetails.abonoClientesVes ?? parsedDetails.abonosVes ?? 0);

        const sqlEntradasUsd = parseFloat(r.entrada_efectivo_usd || '0');
        const sqlEntradasVes = parseFloat(r.entrada_efectivo_ves || '0');
        const finalEntradasUsd = sqlEntradasUsd > 0 ? sqlEntradasUsd : (parsedDetails.entradaEfectivoUsd ?? 0);
        const finalEntradasVes = sqlEntradasVes > 0 ? sqlEntradasVes : (parsedDetails.entradaEfectivoVes ?? 0);

        const sqlSalidasUsd = parseFloat(r.salida_efectivo_usd || '0');
        const sqlSalidasVes = parseFloat(r.salida_efectivo_ves || '0');
        const finalSalidasUsd = sqlSalidasUsd > 0 ? sqlSalidasUsd : (parsedDetails.salidaEfectivoUsd ?? 0);
        const finalSalidasVes = sqlSalidasVes > 0 ? sqlSalidasVes : (parsedDetails.salidaEfectivoVes ?? 0);

        const sqlDevUsd = parseFloat(r.devolucion_efectivo_usd || '0');
        const sqlDevVes = parseFloat(r.devolucion_efectivo_ves || '0');
        const finalDevUsd = sqlDevUsd > 0 ? sqlDevUsd : (parsedDetails.devolucionEfectivoUsd ?? 0);
        const finalDevVes = sqlDevVes > 0 ? sqlDevVes : (parsedDetails.devolucionEfectivoVes ?? 0);

        return {
          ...parsedDetails,
          id: r.id,
          usuarioId: r.usuario_id || parsedDetails.usuarioId,
          timestamp: (parsedDetails.id && typeof parsedDetails.id === 'number' && parsedDetails.id > 1000000000000) ? parsedDetails.id : undefined,
          fechaApertura: fApertura,
          fechaCierre: fCierre,
          fecha: fCierre || fApertura,
          aperturaUsd: parseFloat(r.monto_apertura_usd || 0),
          aperturaVes: parseFloat(r.monto_apertura_ves || 0),
          realUsd: r.monto_cierre_real_usd ? parseFloat(r.monto_cierre_real_usd) : 0,
          realVes: r.monto_cierre_real_ves ? parseFloat(r.monto_cierre_real_ves) : 0,
          expectedUsd: r.monto_cierre_esperado_usd ? parseFloat(r.monto_cierre_esperado_usd) : 0,
          expectedVes: r.monto_cierre_esperado_ves ? parseFloat(r.monto_cierre_esperado_ves) : 0,
          ventaTotalUsd: r.venta_total_usd ? parseFloat(r.venta_total_usd) : 0,
          utilidadUsd: r.utilidad_usd ? parseFloat(r.utilidad_usd) : 0,
          vueltosEntregadosUsd: finalVueltosUsd,
          vueltosEntregadosVes: finalVueltosVes,
          ventasEfectivoUsd: finalVentasEfectivoUsd,
          ventasEfectivoVes: finalVentasEfectivoVes,
          abonoClientesUsd: finalAbonosUsd,
          abonoClientesVes: finalAbonosVes,
          entradaEfectivoUsd: finalEntradasUsd,
          entradaEfectivoVes: finalEntradasVes,
          salidaEfectivoUsd: finalSalidasUsd,
          salidaEfectivoVes: finalSalidasVes,
          devolucionEfectivoUsd: finalDevUsd,
          devolucionEfectivoVes: finalDevVes,
          usuario: cajeroName,
          terminal: r.terminal || parsedDetails.terminal || 'CAJA_PRINCIPAL',
          status: r.estatus === 'Abierta' ? 'Abierta' : 'Cerrada',
        };
      });
    } catch (err) {
      console.error('Error en getCierres (Postgres):', err.message);
    }
  }
  return readJsonFile('cierres.json', []);
}

export async function abrirCaja(usd, ves, usuarioId, terminal, usuarioNombre) {
  if (usePostgres) {
    try {
      let userId = parseInt(usuarioId);
      if (isNaN(userId) || userId <= 0) {
        if (usuarioNombre) {
          const uRes = await pool.query('SELECT id FROM Usuarios WHERE nombre = $1 OR usuario = $2 LIMIT 1', [usuarioNombre, usuarioNombre]);
          if (uRes.rowCount > 0) userId = uRes.rows[0].id;
        }
      }
      if (isNaN(userId) || userId <= 0) userId = 1;

      const termName = terminal || 'CAJA_PRINCIPAL';
      const nowStr = getLocalISODateString();

      const sysConfig = await getCompanyConfig();
      const compartirApertura = sysConfig.compartir_apertura_caja !== false;

      // Auto-close any previous stale open session for THIS user
      if (compartirApertura) {
        await pool.query(
          "UPDATE Cajas_Apertura_Cierre SET estatus = 'Cerrada', fecha_cierre = $2 WHERE usuario_id = $1 AND estatus = 'Abierta'",
          [userId, nowStr]
        );
      } else {
        await pool.query(
          "UPDATE Cajas_Apertura_Cierre SET estatus = 'Cerrada', fecha_cierre = $3 WHERE estacion_nombre = $1 AND usuario_id = $2 AND estatus = 'Abierta'",
          [termName, userId, nowStr]
        );
      }

      const res = await pool.query(
        `INSERT INTO Cajas_Apertura_Cierre (usuario_id, estacion_nombre, monto_apertura_usd, monto_apertura_ves, estatus, fecha_apertura)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, termName, usd, ves, 'Abierta', nowStr]
      );
      return res.rows[0].id;
    } catch (err) {
      console.error('Error en abrirCaja (Postgres):', err.message);
      throw err;
    }
  }

  const activeCheck = readJsonFile('caja_activa.json', { abierta: false });
  
  activeCheck.abierta = true;
  activeCheck.aperturaUsd = usd;
  activeCheck.aperturaVes = ves;
  activeCheck.ventasUsd = 0;
  activeCheck.ventasVes = 0;
  activeCheck.movimientosUsd = 0;
  activeCheck.movimientosVes = 0;
  activeCheck.movimientos = [];
  activeCheck.fechaApertura = getLocalISODateString();
  writeJsonFile('caja_activa.json', activeCheck);
  return Date.now();
}

export async function cerrarCaja(cierre) {
  if (usePostgres) {
    try {
      const termName = cierre.terminal || cierre.estacion_nombre || 'CAJA_PRINCIPAL';
      let userId = parseInt(cierre.usuarioId || cierre.usuario_id);
      if (isNaN(userId) || userId <= 0) {
        if (cierre.usuario) {
          const uRes = await pool.query('SELECT id FROM Usuarios WHERE nombre = $1 OR usuario = $2 LIMIT 1', [cierre.usuario, cierre.usuario]);
          if (uRes.rowCount > 0) userId = uRes.rows[0].id;
        }
      }

      let activeCaja;
      if (!isNaN(userId) && userId > 0) {
        activeCaja = await pool.query(
          "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND estacion_nombre = $1 AND usuario_id = $2 ORDER BY id DESC LIMIT 1",
          [termName, userId]
        );
      } else {
        activeCaja = await pool.query(
          "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND estacion_nombre = $1 ORDER BY id DESC LIMIT 1",
          [termName]
        );
      }
      if (activeCaja.rowCount > 0) {
        const cajaId = activeCaja.rows[0].id;

        const ventaTotalUsd = cierre.ventaTotalUsd ?? 0;
        const utilidadUsd = cierre.utilidadUsd ?? 0;
        const detallesJson = JSON.stringify(cierre);
        const nowStr = getLocalISODateString();

        await pool.query(
          `UPDATE Cajas_Apertura_Cierre SET 
            fecha_cierre = $9, 
            monto_cierre_esperado_usd = $1, 
            monto_cierre_esperado_ves = $2, 
            monto_cierre_real_usd = $3, 
            monto_cierre_real_ves = $4, 
            estatus = 'Cerrada',
            venta_total_usd = $5,
            utilidad_usd = $6,
            detalles_json = $7,
            vuelto_entregado_usd = $10,
            vuelto_entregado_ves = $11,
            ventas_efectivo_usd = $12,
            ventas_efectivo_ves = $13,
            abono_clientes_usd = $14,
            abono_clientes_ves = $15,
            entrada_efectivo_usd = $16,
            entrada_efectivo_ves = $17,
            salida_efectivo_usd = $18,
            salida_efectivo_ves = $19,
            devolucion_efectivo_usd = $20,
            devolucion_efectivo_ves = $21
           WHERE id = $8`,
          [
            cierre.expectedUsd || cierre.dineroEnCajaExpected || 0, 
            cierre.expectedVes || 0, 
            cierre.realUsd || 0, 
            cierre.realVes || 0, 
            ventaTotalUsd, 
            utilidadUsd, 
            detallesJson, 
            cajaId,
            nowStr,
            cierre.vueltosEntregadosUsd ?? cierre.vueltosUsd ?? 0,
            cierre.vueltosEntregadosVes ?? cierre.vueltosVes ?? 0,
            cierre.ventasEfectivoUsd || 0,
            cierre.ventasEfectivoVes || 0,
            cierre.abonoClientesUsd || cierre.abonosUsd || 0,
            cierre.abonoClientesVes || cierre.abonosVes || 0,
            cierre.entradaEfectivoUsd || 0,
            cierre.entradaEfectivoVes || 0,
            cierre.salidaEfectivoUsd || 0,
            cierre.salidaEfectivoVes || 0,
            cierre.devolucionEfectivoUsd || 0,
            cierre.devolucionEfectivoVes || 0
          ]
        );
        return true;
      }
    } catch (err) {
      console.error('Error en cerrarCaja (Postgres):', err.message);
      throw err;
    }
  }

  const cierres = readJsonFile('cierres.json', []);
  const activeCheck = readJsonFile('caja_activa.json', { abierta: false });
  
  const newCierreObj = {
    ...cierre,
    id: cierre.id || Date.now(),
    fechaApertura: activeCheck.fechaApertura || cierre.fechaApertura || getLocalISODateString(),
    fechaCierre: getLocalISODateString(),
    aperturaUsd: activeCheck.aperturaUsd ?? cierre.aperturaUsd ?? 0,
    aperturaVes: activeCheck.aperturaVes ?? cierre.aperturaVes ?? 0,
    expectedUsd: cierre.expectedUsd ?? (cierre.dineroEnCajaExpected ?? 0),
    expectedVes: cierre.expectedVes ?? (cierre.expectedVes ?? 0),
    realUsd: cierre.realUsd ?? 0,
    realVes: cierre.realVes ?? 0,
    usuario: cierre.usuario || 'Anderson Laguna',
    status: 'Cerrada'
  };
  
  cierres.push(newCierreObj);
  writeJsonFile('cierres.json', cierres);
  
  activeCheck.abierta = false;
  writeJsonFile('caja_activa.json', activeCheck);
  return true;
}

export async function updateCierre(id, updated) {
  if (usePostgres) {
    try {
      const cierreId = parseInt(id);
      const detallesJson = JSON.stringify(updated);
      await pool.query(
        `UPDATE Cajas_Apertura_Cierre SET 
          monto_apertura_usd = $1, 
          monto_apertura_ves = $2, 
          monto_cierre_real_usd = $3, 
          monto_cierre_real_ves = $4,
          monto_cierre_esperado_usd = $5,
          monto_cierre_esperado_ves = $6,
          venta_total_usd = $7,
          utilidad_usd = $8,
          detalles_json = $9
         WHERE id = $10`,
        [
          updated.aperturaUsd, 
          updated.aperturaVes, 
          updated.realUsd, 
          updated.realVes,
          updated.expectedUsd || updated.dineroEnCajaExpected,
          updated.expectedVes || 0,
          updated.ventaTotalUsd || 0,
          updated.utilidadUsd || 0,
          detallesJson,
          cierreId
        ]
      );
      return true;
    } catch (err) {
      console.error('Error en updateCierre (Postgres):', err.message);
      throw err;
    }
  }
  const cierres = readJsonFile('cierres.json', []);
  const idx = cierres.findIndex(c => String(c.id) === String(id));
  if (idx !== -1) {
    cierres[idx] = {
      ...cierres[idx],
      ...updated,
      id: cierres[idx].id
    };
    writeJsonFile('cierres.json', cierres);
    return cierres[idx];
  }
  return null;
}

export async function deleteCierre(id) {
  if (usePostgres) {
    try {
      const cierreId = parseInt(id);
      await pool.query('DELETE FROM Cajas_Apertura_Cierre WHERE id = $1', [cierreId]);
      return true;
    } catch (err) {
      console.error('Error en deleteCierre (Postgres):', err.message);
      throw err;
    }
  }
  const cierres = readJsonFile('cierres.json', []);
  const initialLength = cierres.length;
  const filtered = cierres.filter(c => String(c.id) !== String(id));
  if (filtered.length !== initialLength) {
    writeJsonFile('cierres.json', filtered);
    return true;
  }
  return false;
}

export async function getCajaEstado(terminal, usuarioId, usuarioNombre) {
  if (usePostgres) {
    try {
      const myTerminal = terminal || 'CAJA_PRINCIPAL';
      let userId = parseInt(usuarioId);
      if (isNaN(userId) || userId <= 0) {
        if (usuarioNombre) {
          const uRes = await pool.query('SELECT id FROM Usuarios WHERE nombre = $1 OR usuario = $2 LIMIT 1', [usuarioNombre, usuarioNombre]);
          if (uRes.rowCount > 0) userId = uRes.rows[0].id;
        }
      }

      const sysConfig = await getCompanyConfig();
      const compartirApertura = sysConfig.compartir_apertura_caja !== false;

      let activeRes;
      if (!isNaN(userId) && userId > 0) {
        if (compartirApertura) {
          activeRes = await pool.query(
            "SELECT * FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND usuario_id = $1 ORDER BY id DESC LIMIT 1",
            [userId]
          );
        } else {
          activeRes = await pool.query(
            "SELECT * FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND estacion_nombre = $1 AND usuario_id = $2 ORDER BY id DESC LIMIT 1",
            [myTerminal, userId]
          );
        }
      } else {
        activeRes = await pool.query(
          "SELECT * FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND estacion_nombre = $1 ORDER BY id DESC LIMIT 1",
          [myTerminal]
        );
      }
      if (activeRes.rowCount === 0) {
        return { abierta: false };
      }
      const caja = activeRes.rows[0];
      const cajaId = caja.id;
      
      const salesRes = await pool.query(`
        SELECT v.id, v.factura_nro, v.fecha, v.subtotal_usd, v.descuento_usd, v.total_usd, v.total_ves, v.con_ticket,
               v.vuelto_usd, v.vuelto_ves,
               v.estacion_nombre as terminal, c.cedula_rif as "clientDoc", c.nombre as "clientName", u.nombre as usuario,
               COALESCE((
                 SELECT json_agg(json_build_object(
                   'qty', vd.cantidad,
                   'precio_unitario_usd', vd.precio_unitario_usd,
                   'total_fila_usd', vd.total_fila_usd,
                   'product', json_build_object(
                     'barcode', p.codigo_barras_clave,
                     'description', p.descripcion,
                     'precio_costo_usd', p.precio_costo_usd,
                     'exento_impuesto', p.exento_impuesto,
                     'porcentaje_impuesto', p.porcentaje_impuesto
                   )
                 ))
                 FROM Ventas_Detalle vd
                 LEFT JOIN Productos p ON vd.producto_id = p.id
                 WHERE vd.venta_id = v.id
               ), '[]'::json) as items_json,
               COALESCE((
                 SELECT json_agg(json_build_object(
                   'metodo', pv.metodo_pago,
                   'monto', pv.monto_entregado_usd,
                   'montoVES', pv.monto_entregado_ves,
                   'vueltoUSD', pv.monto_vuelto_usd,
                   'vueltoVES', pv.monto_vuelto_ves
                 ))
                 FROM Pagos_Venta pv
                 WHERE pv.venta_id = v.id
               ), '[]'::json) as payments_json
        FROM Ventas v
        LEFT JOIN Clientes c ON v.cliente_id = c.id
        LEFT JOIN Usuarios u ON v.usuario_id = u.id
        WHERE v.caja_id = $1
        ORDER BY v.id ASC
      `, [cajaId]);
      
      const shiftSalesList = [];
      let salesCashUsd = 0;
      let salesCashVes = 0;
      
      for (const row of salesRes.rows) {
        let cashUsd = 0;
        let cashVes = 0;
        const pagos = (row.payments_json || []).map(p => {
          const m = parseFloat(p.monto || '0');
          const mVES = parseFloat(p.montoVES || '0');
          if (p.metodo === 'Efectivo$') cashUsd += m;
          if (p.metodo === 'EfectivoBs') cashVes += mVES;
          return {
            metodo: p.metodo,
            monto: m,
            montoVES: mVES
          };
        });
        
        let vUSD = parseFloat(row.vuelto_usd || '0');
        let vVES = parseFloat(row.vuelto_ves || '0');
        if (vUSD === 0 && row.payments_json && row.payments_json.length > 0) {
          vUSD = parseFloat(row.payments_json[0]?.vueltoUSD || '0');
        }
        if (vVES === 0 && row.payments_json && row.payments_json.length > 0) {
          vVES = parseFloat(row.payments_json[0]?.vueltoVES || '0');
        }
        salesCashUsd += (cashUsd - vUSD);
        salesCashVes += (cashVes - vVES);
        
        shiftSalesList.push({
          id: row.id,
          factura_nro: row.factura_nro,
          fecha: getLocalISODateString(new Date(row.fecha)),
          client: {
            cedula_rif: row.clientDoc,
            nombre: row.clientName
          },
          items: (row.items_json || []).map(i => ({
            qty: parseFloat(i.qty || 0),
            precio_unitario_usd: parseFloat(i.precio_unitario_usd || 0),
            total_fila_usd: parseFloat(i.total_fila_usd || 0),
            product: {
              barcode: i.product?.barcode || '',
              description: i.product?.description || '',
              precio_costo_usd: parseFloat(i.product?.precio_costo_usd || '0'),
              exento_impuesto: !!i.product?.exento_impuesto,
              porcentaje_impuesto: parseFloat(i.product?.porcentaje_impuesto || 0)
            }
          })),
          subtotal: parseFloat(row.subtotal_usd || 0),
          descuento: parseFloat(row.descuento_usd || 0),
          totalUSD: parseFloat(row.total_usd || 0),
          totalVES: parseFloat(row.total_ves || 0),
          pagos,
          vueltoUSD: vUSD,
          vueltoVES: vVES,
          usuario: row.usuario,
          terminal: row.terminal
        });
      }
      
      const movsRes = await pool.query("SELECT * FROM Movimientos_Caja WHERE caja_id = $1", [cajaId]);
      let totalMovUsd = 0;
      let totalMovVes = 0;
      let shiftAbonosUsd = 0;
      let shiftAbonosVes = 0;
      let shiftEntradasUsd = 0;
      let shiftEntradasVes = 0;
      let shiftSalidasUsd = 0;
      let shiftSalidasVes = 0;
      let shiftDevolucionesUsd = 0;
      let shiftDevolucionesVes = 0;

      let shiftPuntoVesMovs = 0;
      let shiftBiopagoVesMovs = 0;
      let shiftPagoMovilVesMovs = 0;
      let shiftTransferenciaVesMovs = 0;

      for (const m of movsRes.rows) {
        const mUsd = parseFloat(m.monto_usd || '0');
        const mVes = parseFloat(m.monto_ves || '0');
        const tipo = m.tipo;
        const desc = m.descripcion || '';
        const descUpper = desc.toUpperCase();
        const mPago = String(m.metodo_pago || 'EFECTIVO').toUpperCase();
        
        const isPunto = mPago === 'PUNTO' || mPago.includes('TARJETA') || descUpper.includes('PUNTO');
        const isBiopago = mPago === 'BIOPAGO' || descUpper.includes('BIOPAGO');
        const isPagoMovil = mPago === 'PAGO_MOVIL' || mPago === 'PAGOMOVIL' || descUpper.includes('PAGO MÓVIL') || descUpper.includes('PAGO_MOVIL');
        const isTransferencia = mPago === 'TRANSFERENCIA' || descUpper.includes('TRANSFERENCIA');

        const isDigitalAdvance = (descUpper.includes('VENTA EFECTIVO') || descUpper.includes('AVANCE')) && (isPunto || isBiopago || isPagoMovil || isTransferencia || descUpper.includes('COBRO DIGITAL')) || (mPago !== 'EFECTIVO' && mPago !== 'EFECTIVO$' && mPago !== 'EFECTIVOBS');

        if (tipo === 'Entrada' && isDigitalAdvance) {
          if (isPunto) shiftPuntoVesMovs += mVes;
          else if (isBiopago) shiftBiopagoVesMovs += mVes;
          else if (isPagoMovil) shiftPagoMovilVesMovs += mVes;
          else if (isTransferencia) shiftTransferenciaVesMovs += mVes;
        }

        if (tipo === 'Entrada') {
          totalMovUsd += mUsd;
          totalMovVes += mVes;
          if (desc.startsWith('Abono')) {
            shiftAbonosUsd += mUsd;
            shiftAbonosVes += mVes;
          } else if (!isDigitalAdvance) {
            shiftEntradasUsd += mUsd;
            shiftEntradasVes += mVes;
          }
        } else if (tipo === 'Devolucion') {
          totalMovUsd -= mUsd;
          totalMovVes -= mVes;
          shiftDevolucionesUsd += mUsd;
          shiftDevolucionesVes += mVes;
        } else {
          totalMovUsd -= mUsd;
          totalMovVes -= mVes;
          shiftSalidasUsd += mUsd;
          shiftSalidasVes += mVes;
        }
      }

      // Query Abonos strictly by caja_id for this exact session
      const abonosRes = await pool.query(`
        SELECT a.id, a.cliente_id, a.monto_usd as monto, a.monto_ves, a.metodo_pago, a.banco_emisor, a.numero_referencia as referencia, a.observacion, a.fecha, c.nombre, c.cedula_rif
        FROM Abonos a
        LEFT JOIN Clientes c ON a.cliente_id = c.id
        WHERE a.caja_id = $1
        ORDER BY a.id ASC
      `, [cajaId]);

      const shiftAbonosList = abonosRes.rows.map(r => ({
        ...r,
        monto: parseFloat(r.monto_usd || r.monto || '0'),
        monto_ves: parseFloat(r.monto_ves || '0'),
        metodo_pago: r.metodo_pago || 'Efectivo$',
        fecha: r.fecha ? getLocalISODateString(r.fecha) : getLocalISODateString()
      }));

      if (shiftAbonosList.length > 0) {
        let sqlAbonosUsd = 0;
        let sqlAbonosVes = 0;
        shiftAbonosList.forEach(a => {
          const m = String(a.metodo_pago || '');
          if (m === 'Efectivo$' || m === 'USD') sqlAbonosUsd += a.monto;
          if (m === 'EfectivoBs' || m === 'Biopago' || m === 'PagoMovil' || m === 'TarjetaBs') sqlAbonosVes += (a.monto_ves || 0);
        });
        if (sqlAbonosUsd > shiftAbonosUsd) shiftAbonosUsd = sqlAbonosUsd;
        if (sqlAbonosVes > shiftAbonosVes) shiftAbonosVes = sqlAbonosVes;
      }
      
      return {
        abierta: true,
        aperturaUsd: parseFloat(caja.monto_apertura_usd || 0),
        aperturaVes: parseFloat(caja.monto_apertura_ves || 0),
        fechaApertura: getLocalISODateString(caja.fecha_apertura),
        ventasUsd: salesCashUsd,
        ventasVes: salesCashVes,
        movimientosUsd: totalMovUsd,
        movimientosVes: totalMovVes,
        shiftSales: shiftSalesList,
        shiftAbonosList,
        shiftMovimientosList: movsRes.rows,
        shiftPuntoVesMovs,
        shiftBiopagoVesMovs,
        shiftPagoMovilVesMovs,
        shiftTransferenciaVesMovs,
        shiftAbonosUsd,
        shiftAbonosVes,
        shiftEntradasUsd,
        shiftEntradasVes,
        shiftSalidasUsd,
        shiftSalidasVes,
        shiftDevolucionesUsd,
        shiftDevolucionesVes
      };
    } catch (err) {
      console.error('Error en getCajaEstado (Postgres):', err.message);
    }
  }
  
  const activeCheck = readJsonFile('caja_activa.json', { abierta: false });
  if (!activeCheck.abierta) {
    return { abierta: false };
  }
  
  const sales = readJsonFile('sales.json', []);
  const activeSales = sales.filter(s => s.fecha >= activeCheck.fechaApertura);
  
  let salesCashUsd = 0;
  let salesCashVes = 0;
  activeSales.forEach(s => {
    let cashUsd = 0;
    let cashVes = 0;
    s.pagos.forEach(p => {
      if (p.metodo === 'Efectivo$') cashUsd += p.monto;
      if (p.metodo === 'EfectivoBs') cashVes += p.monto;
    });
    salesCashUsd += (cashUsd - (s.vueltoUSD || 0));
    salesCashVes += (cashVes - (s.vueltoVES || 0));
  });
  
  const movimientos = activeCheck.movimientos || [];
  let shiftAbonosUsd = 0;
  let shiftEntradasUsd = 0;
  let shiftSalidasUsd = 0;
  let totalMovUsd = 0;
  let totalMovVes = 0;
  
  movimientos.forEach(m => {
    if (m.tipo === 'Entrada') {
      totalMovUsd += m.usd;
      totalMovVes += m.ves;
      if (m.descripcion.startsWith('Abono')) {
        shiftAbonosUsd += m.usd;
      } else {
        shiftEntradasUsd += m.usd;
      }
    } else {
      totalMovUsd -= m.usd;
      totalMovVes -= m.ves;
      shiftSalidasUsd += m.usd;
    }
  });
  
  return {
    abierta: true,
    aperturaUsd: activeCheck.aperturaUsd,
    aperturaVes: activeCheck.aperturaVes,
    fechaApertura: activeCheck.fechaApertura,
    ventasUsd: salesCashUsd,
    ventasVes: salesCashVes,
    movimientosUsd: totalMovUsd,
    movimientosVes: totalMovVes,
    shiftSales: activeSales,
    shiftAbonosUsd,
    shiftEntradasUsd,
    shiftSalidasUsd
  };
}

export async function getOpenCajas() {
  if (usePostgres) {
    try {
      const res = await pool.query(`
        SELECT c.id, c.usuario_id, c.estacion_nombre as terminal, 
               c.monto_apertura_usd, c.monto_apertura_ves, c.fecha_apertura, c.estatus,
               u.usuario, u.nombre as "usuario_nombre", u.rol
        FROM Cajas_Apertura_Cierre c
        LEFT JOIN Usuarios u ON c.usuario_id = u.id
        WHERE c.estatus = 'Abierta'
        ORDER BY c.id DESC
      `);
      return res.rows.map(r => ({
        id: r.id,
        usuarioId: r.usuario_id,
        terminal: r.terminal || 'CAJA_PRINCIPAL',
        montoAperturaUsd: parseFloat(r.monto_apertura_usd || 0),
        montoAperturaVes: parseFloat(r.monto_apertura_ves || 0),
        fechaApertura: getLocalISODateString(r.fecha_apertura),
        usuario: r.usuario || 'Desconocido',
        usuarioNombre: r.usuario_nombre || r.usuario || 'Desconocido',
        rol: r.rol || 'Cajero'
      }));
    } catch (err) {
      console.error('Error en getOpenCajas (Postgres):', err.message);
      return [];
    }
  }
  const activeCheck = readJsonFile('caja_activa.json', { abierta: false });
  if (activeCheck && activeCheck.abierta) {
    return [{
      id: 1,
      usuarioId: activeCheck.usuarioId || 1,
      terminal: activeCheck.terminal || 'CAJA_01',
      montoAperturaUsd: activeCheck.aperturaUsd || 0,
      montoAperturaVes: activeCheck.aperturaVes || 0,
      fechaApertura: activeCheck.fechaApertura || getLocalISODateString(),
      usuario: activeCheck.usuario || 'Usuario',
      usuarioNombre: activeCheck.usuarioNombre || 'Usuario',
      rol: 'Cajero'
    }];
  }
  return [];
}

export async function forceCloseCaja(cajaId, adminName = 'ADMINISTRADOR') {
  if (usePostgres) {
    try {
      const id = parseInt(cajaId);
      const cajaRes = await pool.query('SELECT * FROM Cajas_Apertura_Cierre WHERE id = $1', [id]);
      if (cajaRes.rowCount === 0) return { success: false, message: 'Caja no encontrada.' };
      
      const caja = cajaRes.rows[0];
      const nowStr = getLocalISODateString();
      
      // Calculate sales under this caja
      const salesRes = await pool.query('SELECT COALESCE(SUM(total_usd), 0) as total FROM Ventas WHERE caja_id = $1', [id]);
      const ventaTotal = parseFloat(salesRes.rows[0]?.total || 0);

      await pool.query(`
        UPDATE Cajas_Apertura_Cierre SET
          estatus = 'Cerrada',
          fecha_cierre = $1,
          monto_cierre_real_usd = monto_apertura_usd,
          monto_cierre_real_ves = monto_apertura_ves,
          monto_cierre_esperado_usd = monto_apertura_usd,
          monto_cierre_esperado_ves = monto_apertura_ves,
          venta_total_usd = $2,
          detalles_json = $3
        WHERE id = $4
      `, [
        nowStr,
        ventaTotal,
        JSON.stringify({
          motivo: `Cierre Forzado por Administrador (${adminName})`,
          fechaCierre: nowStr,
          forzadoPorAdmin: true,
          admin: adminName
        }),
        id
      ]);
      
      return { 
        success: true, 
        usuarioId: caja.usuario_id,
        terminal: caja.estacion_nombre
      };
    } catch (err) {
      console.error('Error en forceCloseCaja (Postgres):', err.message);
      throw err;
    }
  }
  
  const activeCheck = readJsonFile('caja_activa.json', { abierta: false });
  activeCheck.abierta = false;
  writeJsonFile('caja_activa.json', activeCheck);
  return { success: true };
}

export async function registrarCajaMovimiento(tipo, descripcion, usd, ves, terminal, usuarioId, usuarioNombre, metodoPago = 'EFECTIVO', comisionVes = 0, comisionUsd = 0) {
  if (usePostgres) {
    try {
      const termName = terminal || 'CAJA_PRINCIPAL';
      const sysConfig = await getCompanyConfig();
      const compartirApertura = sysConfig.compartir_apertura_caja !== false;

      let userId = parseInt(usuarioId);
      if (isNaN(userId) || userId <= 0) {
        if (usuarioNombre) {
          const uRes = await pool.query('SELECT id FROM Usuarios WHERE nombre = $1 OR usuario = $2 LIMIT 1', [usuarioNombre, usuarioNombre]);
          if (uRes.rowCount > 0) userId = uRes.rows[0].id;
        }
      }

      let activeCaja;
      if (!isNaN(userId) && userId > 0 && compartirApertura) {
        activeCaja = await pool.query(
          "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND usuario_id = $1 ORDER BY (estacion_nombre = $2) DESC, id DESC LIMIT 1",
          [userId, termName]
        );
      }
      if (!activeCaja || activeCaja.rowCount === 0) {
        activeCaja = await pool.query(
          "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND (estacion_nombre = $1 OR estacion_nombre = 'CAJA_PRINCIPAL' OR estacion_nombre = 'LOCAL') ORDER BY id DESC LIMIT 1",
          [termName]
        );
      }
      if (!activeCaja || activeCaja.rowCount === 0) {
        activeCaja = await pool.query("SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' ORDER BY id DESC LIMIT 1");
      }

      if (activeCaja.rowCount > 0) {
        const cajaId = activeCaja.rows[0].id;
        // In Postgres we allow 'Devolucion' check constraint
        const typeDb = (tipo === 'Entrada' || tipo === 'Salida' || tipo === 'Devolucion') ? tipo : 'Salida';
        await pool.query(
          `INSERT INTO Movimientos_Caja (caja_id, tipo, descripcion, monto_usd, monto_ves, estacion_nombre, metodo_pago, comision_ves, comision_usd)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [cajaId, typeDb, descripcion, usd, ves, termName, metodoPago || 'EFECTIVO', comisionVes || 0, comisionUsd || 0]
        );
        return true;
      }
    } catch (err) {
      console.error('Error en registrarCajaMovimiento (Postgres):', err.message);
      throw err;
    }
  }
  const activeCheck = readJsonFile('caja_activa.json', { abierta: false });
  if (activeCheck.abierta) {
    if (!activeCheck.movimientos) {
      activeCheck.movimientos = [];
    }
    activeCheck.movimientos.push({ tipo, descripcion, usd, ves, terminal, metodo_pago: metodoPago || 'EFECTIVO', comision_ves: comisionVes || 0, comision_usd: comisionUsd || 0 });
    const mult = tipo === 'Entrada' ? 1 : -1;
    activeCheck.movimientosUsd += usd * mult;
    activeCheck.movimientosVes += ves * mult;
    writeJsonFile('caja_activa.json', activeCheck);
    return true;
  }
  return false;
}

export async function deleteProduct(id) {
  if (usePostgres) {
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await client.query('SELECT stock_actual FROM Productos WHERE id = $1', [id]);
        if (res.rowCount > 0 && parseInt(res.rows[0].stock_actual) > 0) {
          throw new Error('No se puede eliminar un producto con existencia mayor a 0');
        }
        await client.query('DELETE FROM Productos WHERE id = $1', [id]);
        await client.query('COMMIT');
        return true;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Error en deleteProduct (Postgres):', err.message);
      throw err;
    }
  }
  
  // JSON Fallback
  let products = readJsonFile('products.json', []);
  const initialLen = products.length;
  const prod = products.find(p => p.id == id);
  if (prod && prod.stock_actual > 0) {
    throw new Error('No se puede eliminar un producto con existencia mayor a 0');
  }
  products = products.filter(p => p.id != id);
  if (products.length < initialLen) {
    writeJsonFile('products.json', products);
    return true;
  }
  return false;
}

export async function saveProductsBulk(products) {
  if (usePostgres) {
    try {
      const savedList = [];
      for (const p of products) {
        const isGranel = !!p.a_granel;
        const stockActual = isGranel ? (p.stock_actual || 0) : Math.round(p.stock_actual || 0);
        const stockMinimo = isGranel ? (p.stock_minimo || 0) : Math.round(p.stock_minimo || 0);

        const res = await pool.query(
          `INSERT INTO Productos (codigo_barras_clave, descripcion, categoria, stock_actual, stock_minimo, precio_costo_usd, precio_detalle_usd, precio_mayor_usd, cantidad_mayorista, exento_impuesto, imagen_url, estado, a_granel, fecha_vencimiento, porcentaje_impuesto)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (codigo_barras_clave) 
           DO UPDATE SET 
             descripcion = EXCLUDED.descripcion,
             categoria = EXCLUDED.categoria,
             stock_actual = EXCLUDED.stock_actual,
             stock_minimo = EXCLUDED.stock_minimo,
             precio_costo_usd = EXCLUDED.precio_costo_usd,
             precio_detalle_usd = EXCLUDED.precio_detalle_usd,
             precio_mayor_usd = EXCLUDED.precio_mayor_usd,
             cantidad_mayorista = EXCLUDED.cantidad_mayorista,
             exento_impuesto = EXCLUDED.exento_impuesto,
             estado = EXCLUDED.estado,
             a_granel = EXCLUDED.a_granel,
             fecha_vencimiento = EXCLUDED.fecha_vencimiento,
             porcentaje_impuesto = EXCLUDED.porcentaje_impuesto
           RETURNING id`,
          [p.barcode, p.description, p.category || '', stockActual, stockMinimo, p.precio_costo_usd || 0, p.precio_detalle_usd || 0, p.precio_mayor_usd || 0, p.cantidad_mayorista || 12, p.exento_impuesto || false, p.imagen_url || '', p.estado || 'Activo', p.a_granel || false, p.fecha_vencimiento || null, p.porcentaje_impuesto || 0]
        );
        savedList.push({ ...p, id: res.rows[0].id, stock_actual: stockActual, stock_minimo: stockMinimo });
      }
      return savedList;
    } catch (err) {
      console.error('Error en saveProductsBulk (Postgres):', err.message);
      throw err;
    }
  }
  
  // JSON fallback
  const allProducts = readJsonFile('products.json', mockProducts);
  const savedList = [];
  for (const p of products) {
    const isGranel = !!p.a_granel;
    const stockActual = isGranel ? (p.stock_actual || 0) : Math.round(p.stock_actual || 0);
    const stockMinimo = isGranel ? (p.stock_minimo || 0) : Math.round(p.stock_minimo || 0);
    
    const cleanedP = {
      ...p,
      stock_actual: stockActual,
      stock_minimo: stockMinimo
    };

    const idx = allProducts.findIndex(item => item.barcode === cleanedP.barcode);
    if (idx !== -1) {
      const updated = { ...allProducts[idx], ...cleanedP };
      allProducts[idx] = updated;
      savedList.push(updated);
    } else {
      const newProduct = { ...cleanedP, id: Date.now() + Math.floor(Math.random() * 1000) };
      allProducts.push(newProduct);
      savedList.push(newProduct);
    }
  }
  writeJsonFile('products.json', allProducts);
  return savedList;
}

// ==========================================
// MASTER PASS & INVERSIONES DE ACCIONISTAS
// ==========================================

export async function getMasterPass() {
  if (usePostgres) {
    try {
      // Get current master_pass from DB; if NULL set default '1234'
      const res = await pool.query('SELECT id, master_pass FROM Configuracion_Empresa ORDER BY id DESC LIMIT 1');
      if (res.rowCount > 0) {
        const row = res.rows[0];
        if (!row.master_pass) {
          // First time: set default
          await pool.query('UPDATE Configuracion_Empresa SET master_pass = $1 WHERE id = $2', ['1234', row.id]);
          return '1234';
        }
        return row.master_pass;
      }
      // No config row at all — should not happen but handle gracefully
      return '1234';
    } catch (err) {
      console.error('Error al obtener master_pass (Postgres):', err.message);
      throw err;
    }
  }
  // JSON fallback (only if PG not connected)
  const config = readJsonFile('config.json', mockConfig);
  return config.master_pass || '1234';
}

export async function saveMasterPass(newPass) {
  if (usePostgres) {
    try {
      const existing = await pool.query('SELECT id FROM Configuracion_Empresa ORDER BY id DESC LIMIT 1');
      if (existing.rowCount > 0) {
        await pool.query('UPDATE Configuracion_Empresa SET master_pass = $1 WHERE id = $2', [newPass, existing.rows[0].id]);
        console.log(`✅ Master Pass actualizado en PostgreSQL.`);
        return true;
      }
      throw new Error('No existe registro de Configuracion_Empresa en la BD.');
    } catch (err) {
      console.error('Error al guardar master_pass (Postgres):', err.message);
      throw err;
    }
  }
  // JSON fallback (only if PG not connected)
  const config = readJsonFile('config.json', mockConfig);
  config.master_pass = newPass;
  writeJsonFile('config.json', config);
  return true;
}

export async function verifyMasterPass(enteredPass) {
  const currentPass = await getMasterPass();
  return (enteredPass || '').trim() === (currentPass || '').trim();
}

export async function getAccionistas() {
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT * FROM Accionistas ORDER BY id ASC');
      return res.rows.map(r => ({
        ...r,
        id: Number(r.id)
      }));
    } catch (err) {
      console.error('Error en getAccionistas (Postgres):', err.message);
    }
  }

  return readJsonFile('accionistas.json', []);
}

export async function saveAccionista(data) {
  if (usePostgres) {
    try {
      if (data.id) {
        const res = await pool.query(
          'UPDATE Accionistas SET nombre = $1, cedula_rif = $2, telefono = $3, estado = $4 WHERE id = $5 RETURNING *',
          [data.nombre, data.cedula_rif || '', data.telefono || '', data.estado || 'Activo', data.id]
        );
        return { ...res.rows[0], id: Number(res.rows[0].id) };
      } else {
        const res = await pool.query(
          'INSERT INTO Accionistas (nombre, cedula_rif, telefono, estado) VALUES ($1, $2, $3, $4) RETURNING *',
          [data.nombre, data.cedula_rif || '', data.telefono || '', data.estado || 'Activo']
        );
        return { ...res.rows[0], id: Number(res.rows[0].id) };
      }
    } catch (err) {
      console.error('Error en saveAccionista (Postgres):', err.message);
      throw err;
    }
  }

  const list = await getAccionistas();
  if (data.id) {
    const idx = list.findIndex(a => a.id === Number(data.id));
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...data, id: Number(data.id) };
    }
  } else {
    const newItem = {
      id: Date.now(),
      nombre: data.nombre,
      cedula_rif: data.cedula_rif || '',
      telefono: data.telefono || '',
      estado: data.estado || 'Activo'
    };
    list.push(newItem);
    data = newItem;
  }
  writeJsonFile('accionistas.json', list);
  return data;
}

export async function deleteAccionista(id) {
  if (usePostgres) {
    try {
      await pool.query('DELETE FROM Inversiones_Accionistas WHERE accionista_id = $1', [id]);
      await pool.query('DELETE FROM Accionistas WHERE id = $1', [id]);
      return true;
    } catch (err) {
      console.error('Error en deleteAccionista (Postgres):', err.message);
      throw err;
    }
  }
  const list = await getAccionistas();
  const updated = list.filter(a => a.id !== Number(id));
  writeJsonFile('accionistas.json', updated);
  return true;
}

export async function getInversiones() {
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT * FROM Inversiones_Accionistas ORDER BY fecha ASC, id ASC');
      return res.rows.map(r => ({
        ...r,
        id: Number(r.id),
        accionista_id: Number(r.accionista_id),
        monto_usd: parseFloat(r.monto_usd)
      }));
    } catch (err) {
      console.error('Error en getInversiones (Postgres):', err.message);
    }
  }

  return readJsonFile('inversiones.json', []);
}

export async function saveInversion(data) {
  if (usePostgres) {
    try {
      if (data.id) {
        const res = await pool.query(
          'UPDATE Inversiones_Accionistas SET accionista_id = $1, fecha = $2, monto_usd = $3, observacion = $4 WHERE id = $5 RETURNING *',
          [data.accionista_id, data.fecha, data.monto_usd, data.observacion || '', data.id]
        );
        return {
          ...res.rows[0],
          id: Number(res.rows[0].id),
          accionista_id: Number(res.rows[0].accionista_id),
          monto_usd: parseFloat(res.rows[0].monto_usd)
        };
      } else {
        const res = await pool.query(
          'INSERT INTO Inversiones_Accionistas (accionista_id, fecha, monto_usd, observacion) VALUES ($1, $2, $3, $4) RETURNING *',
          [data.accionista_id, data.fecha, data.monto_usd, data.observacion || '']
        );
        return {
          ...res.rows[0],
          id: Number(res.rows[0].id),
          accionista_id: Number(res.rows[0].accionista_id),
          monto_usd: parseFloat(res.rows[0].monto_usd)
        };
      }
    } catch (err) {
      console.error('Error en saveInversion (Postgres):', err.message);
      throw err;
    }
  }

  const list = await getInversiones();
  if (data.id) {
    const idx = list.findIndex(i => i.id === Number(data.id));
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        accionista_id: Number(data.accionista_id),
        fecha: data.fecha,
        monto_usd: parseFloat(data.monto_usd),
        observacion: data.observacion || ''
      };
      data = list[idx];
    }
  } else {
    const newItem = {
      id: Date.now(),
      accionista_id: Number(data.accionista_id),
      fecha: data.fecha,
      monto_usd: parseFloat(data.monto_usd),
      observacion: data.observacion || ''
    };
    list.push(newItem);
    data = newItem;
  }
  writeJsonFile('inversiones.json', list);
  return data;
}

export async function deleteInversion(id) {
  if (usePostgres) {
    try {
      await pool.query('DELETE FROM Inversiones_Accionistas WHERE id = $1', [id]);
      return true;
    } catch (err) {
      console.error('Error en deleteInversion (Postgres):', err.message);
      throw err;
    }
  }
  const list = await getInversiones();
  const updated = list.filter(i => i.id !== Number(id));
  writeJsonFile('inversiones.json', updated);
  return true;
}

export async function getGastosOperativos() {
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT * FROM Gastos_Operativos ORDER BY id DESC');
      return res.rows.map(r => ({
        id: Number(r.id),
        concepto: r.concepto,
        monto_usd: parseFloat(r.monto_usd || 0),
        fecha: r.fecha ? String(r.fecha).replace('T', ' ').substring(0, 16) : getLocalISODateString(),
        observacion: r.observacion || ''
      }));
    } catch (err) {
      console.error('Error en getGastosOperativos (Postgres):', err.message);
    }
  }
  return readJsonFile('gastos.json', []);
}

export async function saveGastoOperativo(data) {
  if (usePostgres) {
    try {
      if (data.id) {
        const res = await pool.query(
          'UPDATE Gastos_Operativos SET concepto = $1, monto_usd = $2, fecha = $3, observacion = $4 WHERE id = $5 RETURNING *',
          [data.concepto, data.monto_usd, data.fecha || getLocalISODateString(), data.observacion || '', data.id]
        );
        return {
          ...res.rows[0],
          id: Number(res.rows[0].id),
          monto_usd: parseFloat(res.rows[0].monto_usd)
        };
      } else {
        const res = await pool.query(
          'INSERT INTO Gastos_Operativos (concepto, monto_usd, fecha, observacion) VALUES ($1, $2, $3, $4) RETURNING *',
          [data.concepto, data.monto_usd, data.fecha || getLocalISODateString(), data.observacion || '']
        );
        return {
          ...res.rows[0],
          id: Number(res.rows[0].id),
          monto_usd: parseFloat(res.rows[0].monto_usd)
        };
      }
    } catch (err) {
      console.error('Error en saveGastoOperativo (Postgres):', err.message);
      throw err;
    }
  }

  const list = readJsonFile('gastos.json', []);
  if (data.id) {
    const idx = list.findIndex(g => g.id === Number(data.id));
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        concepto: data.concepto,
        monto_usd: parseFloat(data.monto_usd),
        fecha: data.fecha,
        observacion: data.observacion || ''
      };
      data = list[idx];
    }
  } else {
    const newItem = {
      id: Date.now(),
      concepto: data.concepto,
      monto_usd: parseFloat(data.monto_usd),
      fecha: data.fecha || getLocalISODateString(),
      observacion: data.observacion || ''
    };
    list.unshift(newItem);
    data = newItem;
  }
  writeJsonFile('gastos.json', list);
  return data;
}

export async function deleteGastoOperativo(id) {
  if (usePostgres) {
    try {
      await pool.query('DELETE FROM Gastos_Operativos WHERE id = $1', [id]);
      return true;
    } catch (err) {
      console.error('Error en deleteGastoOperativo (Postgres):', err.message);
      throw err;
    }
  }
  const list = readJsonFile('gastos.json', []);
  const updated = list.filter(g => g.id !== Number(id));
  writeJsonFile('gastos.json', updated);
  return true;
}

// --- PROVEEDORES CRUD ---
export async function getProveedores() {
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT * FROM Proveedores ORDER BY razon_social ASC');
      return res.rows.map(r => ({
        id: Number(r.id),
        rif: r.rif,
        razon_social: r.razon_social,
        contacto_nombre: r.contacto_nombre || '',
        telefono: r.telefono || '',
        correo: r.correo || '',
        direccion: r.direccion || '',
        dias_credito: Number(r.dias_credito || 0),
        limite_credito_usd: parseFloat(r.limite_credito_usd || 0),
        saldo_pendiente_usd: parseFloat(r.saldo_pendiente_usd || 0),
        estado: r.estado || 'Activo',
        created_at: r.created_at ? String(r.created_at).replace('T', ' ').substring(0, 16) : ''
      }));
    } catch (err) {
      console.error('Error en getProveedores (Postgres):', err.message);
    }
  }
  return readJsonFile('proveedores.json', []);
}

export async function saveProveedor(p) {
  if (usePostgres) {
    try {
      if (p.id) {
        const res = await pool.query(
          `UPDATE Proveedores
           SET rif = $1, razon_social = $2, contacto_nombre = $3, telefono = $4, correo = $5, direccion = $6, dias_credito = $7, limite_credito_usd = $8, estado = $9
           WHERE id = $10 RETURNING *`,
          [p.rif?.trim(), p.razon_social?.trim(), p.contacto_nombre?.trim() || '', p.telefono?.trim() || '', p.correo?.trim() || '', p.direccion?.trim() || '', Number(p.dias_credito || 0), parseFloat(p.limite_credito_usd || 0), p.estado || 'Activo', p.id]
        );
        const r = res.rows[0];
        return {
          id: Number(r.id),
          rif: r.rif,
          razon_social: r.razon_social,
          contacto_nombre: r.contacto_nombre,
          telefono: r.telefono,
          correo: r.correo,
          direccion: r.direccion,
          dias_credito: Number(r.dias_credito || 0),
          limite_credito_usd: parseFloat(r.limite_credito_usd || 0),
          saldo_pendiente_usd: parseFloat(r.saldo_pendiente_usd || 0),
          estado: r.estado
        };
      } else {
        const res = await pool.query(
          `INSERT INTO Proveedores (rif, razon_social, contacto_nombre, telefono, correo, direccion, dias_credito, limite_credito_usd, saldo_pendiente_usd, estado)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
          [p.rif?.trim(), p.razon_social?.trim(), p.contacto_nombre?.trim() || '', p.telefono?.trim() || '', p.correo?.trim() || '', p.direccion?.trim() || '', Number(p.dias_credito || 0), parseFloat(p.limite_credito_usd || 0), 0, p.estado || 'Activo']
        );
        const r = res.rows[0];
        return {
          id: Number(r.id),
          rif: r.rif,
          razon_social: r.razon_social,
          contacto_nombre: r.contacto_nombre,
          telefono: r.telefono,
          correo: r.correo,
          direccion: r.direccion,
          dias_credito: Number(r.dias_credito || 0),
          limite_credito_usd: parseFloat(r.limite_credito_usd || 0),
          saldo_pendiente_usd: 0,
          estado: r.estado
        };
      }
    } catch (err) {
      console.error('Error en saveProveedor (Postgres):', err.message);
      throw err;
    }
  }

  const list = readJsonFile('proveedores.json', []);
  if (p.id) {
    const idx = list.findIndex(item => item.id === Number(p.id));
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        rif: p.rif?.trim(),
        razon_social: p.razon_social?.trim(),
        contacto_nombre: p.contacto_nombre || '',
        telefono: p.telefono || '',
        correo: p.correo || '',
        direccion: p.direccion || '',
        dias_credito: Number(p.dias_credito || 0),
        limite_credito_usd: parseFloat(p.limite_credito_usd || 0),
        estado: p.estado || 'Activo'
      };
      p = list[idx];
    }
  } else {
    const newItem = {
      id: Date.now(),
      rif: p.rif?.trim(),
      razon_social: p.razon_social?.trim(),
      contacto_nombre: p.contacto_nombre || '',
      telefono: p.telefono || '',
      correo: p.correo || '',
      direccion: p.direccion || '',
      dias_credito: Number(p.dias_credito || 0),
      limite_credito_usd: parseFloat(p.limite_credito_usd || 0),
      saldo_pendiente_usd: 0,
      estado: p.estado || 'Activo',
      created_at: getLocalISODateString()
    };
    list.push(newItem);
    p = newItem;
  }
  writeJsonFile('proveedores.json', list);
  return p;
}

export async function deleteProveedor(id) {
  if (usePostgres) {
    try {
      const checkDebt = await pool.query('SELECT saldo_pendiente_usd FROM Proveedores WHERE id = $1', [id]);
      if (checkDebt.rowCount > 0 && parseFloat(checkDebt.rows[0].saldo_pendiente_usd || 0) > 0.01) {
        throw new Error('No se puede eliminar un proveedor con saldo deudor pendiente.');
      }
      await pool.query('DELETE FROM Proveedores WHERE id = $1', [id]);
      return true;
    } catch (err) {
      console.error('Error en deleteProveedor (Postgres):', err.message);
      throw err;
    }
  }

  const list = readJsonFile('proveedores.json', []);
  const idx = list.findIndex(p => p.id === Number(id));
  if (idx !== -1) {
    if ((list[idx].saldo_pendiente_usd || 0) > 0.01) {
      throw new Error('No se puede eliminar un proveedor con saldo deudor pendiente.');
    }
    list.splice(idx, 1);
    writeJsonFile('proveedores.json', list);
    return true;
  }
  return false;
}

// --- COMPRAS CRUD & INVENTORY INCREMENTS ---
export async function getCompras() {
  if (usePostgres) {
    try {
      const res = await pool.query(`
        SELECT c.*, 
               p.razon_social AS proveedor_nombre, 
               p.rif AS proveedor_rif, 
               u.nombre AS usuario_nombre,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id', d.id,
                     'producto_id', d.producto_id,
                     'cantidad', d.cantidad,
                     'costo_unitario_usd', d.costo_unitario_usd,
                     'total_usd', d.total_usd,
                     'descripcion', pr.descripcion,
                     'codigo_barras_clave', pr.codigo_barras_clave
                   )
                 ) FILTER (WHERE d.id IS NOT NULL), '[]'
               ) AS items
        FROM Compras c
        LEFT JOIN Proveedores p ON c.proveedor_id = p.id
        LEFT JOIN Usuarios u ON c.usuario_id = u.id
        LEFT JOIN Compras_Detalle d ON c.id = d.compra_id
        LEFT JOIN Productos pr ON d.producto_id = pr.id
        GROUP BY c.id, p.razon_social, p.rif, u.nombre
        ORDER BY c.id DESC
      `);
      return res.rows.map(r => ({
        id: Number(r.id),
        numero_factura: r.numero_factura,
        proveedor_id: Number(r.proveedor_id),
        proveedor_nombre: r.proveedor_nombre || '',
        proveedor_rif: r.proveedor_rif || '',
        usuario_id: Number(r.usuario_id),
        usuario_nombre: r.usuario_nombre || '',
        fecha_emision: r.fecha_emision ? String(r.fecha_emision).replace('T', ' ').substring(0, 16) : getLocalISODateString(),
        fecha_vencimiento: r.fecha_vencimiento ? String(r.fecha_vencimiento).replace('T', ' ').substring(0, 10) : '',
        condicion_pago: r.condicion_pago || 'Contado',
        subtotal_usd: parseFloat(r.subtotal_usd || 0),
        impuesto_usd: parseFloat(r.impuesto_usd || 0),
        descuento_usd: parseFloat(r.descuento_usd || 0),
        total_usd: parseFloat(r.total_usd || 0),
        total_ves: parseFloat(r.total_ves || 0),
        saldo_pendiente_usd: parseFloat(r.saldo_pendiente_usd || 0),
        estatus: r.estatus || 'Pendiente',
        observaciones: r.observaciones || '',
        items: r.items || []
      }));
    } catch (err) {
      console.error('Error en getCompras (Postgres):', err.message);
    }
  }
  return readJsonFile('compras.json', []);
}

export async function saveCompra(compraData) {
  const {
    numero_factura,
    proveedor_id,
    usuario_id,
    fecha_emision = getLocalISODateString(),
    fecha_vencimiento = '',
    condicion_pago = 'Contado',
    subtotal_usd = 0,
    impuesto_usd = 0,
    descuento_usd = 0,
    total_usd = 0,
    total_ves = 0,
    observaciones = '',
    items = [],
    metodo_pago_contado = 'Efectivo$',
    afecto_caja_efectivo = false,
    caja_id = null,
    tasa_cambio = 1
  } = compraData;

  const isCredit = condicion_pago === 'Credito';
  const initialSaldoPendiente = isCredit ? parseFloat(total_usd) : 0;
  const initialStatus = isCredit ? 'Pendiente' : 'Pagada';

  if (usePostgres) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert into Compras
      const compraRes = await client.query(
        `INSERT INTO Compras (
           numero_factura, proveedor_id, usuario_id, fecha_emision, fecha_vencimiento,
           condicion_pago, subtotal_usd, impuesto_usd, descuento_usd, total_usd, total_ves,
           saldo_pendiente_usd, estatus, observaciones
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          numero_factura?.trim() || `FAC-${Date.now()}`,
          proveedor_id,
          usuario_id,
          fecha_emision,
          fecha_vencimiento || null,
          condicion_pago,
          subtotal_usd,
          impuesto_usd,
          descuento_usd,
          total_usd,
          total_ves,
          initialSaldoPendiente,
          initialStatus,
          observaciones || ''
        ]
      );
      const newCompraId = compraRes.rows[0].id;

      // 2. Insert items and update inventory stock & costs
      for (const item of items) {
        const prodId = item.producto_id || item.product?.id || item.id;
        const qty = parseFloat(item.cantidad || item.qty || 0);
        const unitCost = parseFloat(item.costo_unitario_usd || item.priceUSD || item.precio_costo_usd || 0);
        const itemTotal = parseFloat(item.total_usd || (qty * unitCost));

        if (prodId && qty > 0) {
          // Insert detail
          await client.query(
            `INSERT INTO Compras_Detalle (compra_id, producto_id, cantidad, costo_unitario_usd, total_usd)
             VALUES ($1, $2, $3, $4, $5)`,
            [newCompraId, prodId, qty, unitCost, itemTotal]
          );

          // Get previous stock
          const prodCheck = await client.query('SELECT stock_actual, precio_costo_usd FROM Productos WHERE id = $1', [prodId]);
          if (prodCheck.rowCount > 0) {
            const prevStock = parseFloat(prodCheck.rows[0].stock_actual || 0);
            const nextStock = prevStock + qty;

            // Update product stock and optionally cost price (explicit NUMERIC cast for PostgreSQL)
            await client.query(
              `UPDATE Productos 
               SET stock_actual = $1, 
                   precio_costo_usd = CASE WHEN CAST($2 AS NUMERIC) > 0 THEN CAST($2 AS NUMERIC) ELSE precio_costo_usd END
               WHERE id = $3`,
              [nextStock, unitCost, prodId]
            );

            // Log Inventory Movement
            await client.query(
              `INSERT INTO Movimientos_Inventario (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_posterior, motivo)
               VALUES ($1, $2, 'Entrada', $3, $4, $5, $6)`,
              [prodId, usuario_id || 1, qty, prevStock, nextStock, `Compra Factura ${numero_factura}`]
            );
          }
        }
      }

      // 3. If credit, increase supplier pending debt. If cash, register immediate payment and cash out if toggled.
      if (isCredit) {
        await client.query(
          `UPDATE Proveedores 
           SET saldo_pendiente_usd = COALESCE(saldo_pendiente_usd, 0) + $1 
           WHERE id = $2`,
          [total_usd, proveedor_id]
        );
      } else {
        // Cash payment registration
        await client.query(
          `INSERT INTO Pagos_Proveedores (
             compra_id, proveedor_id, usuario_id, caja_id, monto_usd, monto_ves,
             tasa_cambio, metodo_pago, afecto_caja_efectivo, observacion
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            newCompraId,
            proveedor_id,
            usuario_id || 1,
            caja_id || null,
            total_usd,
            total_ves,
            tasa_cambio || 1,
            metodo_pago_contado || 'Efectivo$',
            !!afecto_caja_efectivo,
            `Pago de Contado Factura Compra #${numero_factura}`
          ]
        );

        // If cash out from active cashier station is requested
        if (afecto_caja_efectivo) {
          let targetCajaId = caja_id;
          if (!targetCajaId) {
            const openCajaRes = await client.query(
              "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND (usuario_id = $1 OR $1 IS NULL) ORDER BY id DESC LIMIT 1",
              [usuario_id || null]
            );
            if (openCajaRes.rowCount > 0) {
              targetCajaId = openCajaRes.rows[0].id;
            } else {
              const anyOpen = await client.query("SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' ORDER BY id DESC LIMIT 1");
              if (anyOpen.rowCount > 0) targetCajaId = anyOpen.rows[0].id;
            }
          }

          if (targetCajaId) {
            const provData = await client.query('SELECT razon_social FROM Proveedores WHERE id = $1', [proveedor_id]);
            const provName = provData.rowCount > 0 ? provData.rows[0].razon_social : 'PROVEEDOR';
            await client.query(
              `INSERT INTO Movimientos_Caja (caja_id, tipo, descripcion, monto_usd, monto_ves, metodo_pago)
               VALUES ($1, 'Salida', $2, $3, $4, $5)`,
              [
                targetCajaId,
                `Egreso de Caja: Pago Contado a Proveedor - ${provName} (Factura #${numero_factura})`,
                total_usd,
                total_ves,
                metodo_pago_contado || 'Efectivo$'
              ]
            );
          }
        }
      }

      await client.query('COMMIT');
      return { id: Number(newCompraId), ...compraData, estatus: initialStatus, saldo_pendiente_usd: initialSaldoPendiente };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error en saveCompra (Postgres):', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  // JSON fallback
  const compras = readJsonFile('compras.json', []);
  const newCompra = {
    id: Date.now(),
    ...compraData,
    saldo_pendiente_usd: initialSaldoPendiente,
    estatus: initialStatus,
    created_at: getLocalISODateString()
  };
  compras.unshift(newCompra);
  writeJsonFile('compras.json', compras);

  // Update products stock & costs in JSON mode
  const jsonProducts = readJsonFile('products.json', mockProducts);
  const jsonMovements = readJsonFile('movements.json', []);

  for (const item of items) {
    const prodId = item.producto_id || item.product?.id || item.id;
    const qty = parseFloat(item.cantidad || item.qty || 0);
    const unitCost = parseFloat(item.costo_unitario_usd || item.priceUSD || item.precio_costo_usd || 0);
    const pIdx = jsonProducts.findIndex(p => p.id === Number(prodId) || String(p.id) === String(prodId));
    if (pIdx !== -1 && qty > 0) {
      const prevStock = parseFloat(jsonProducts[pIdx].stock_actual || 0);
      const nextStock = prevStock + qty;
      jsonProducts[pIdx].stock_actual = nextStock;
      if (unitCost > 0) jsonProducts[pIdx].precio_costo_usd = unitCost;

      jsonMovements.unshift({
        id: Date.now() + Math.random(),
        date: getLocalISODateString(),
        productCode: jsonProducts[pIdx].barcode || jsonProducts[pIdx].codigo_barras_clave,
        productDescription: jsonProducts[pIdx].description || jsonProducts[pIdx].descripcion,
        type: 'Entrada',
        qty: qty,
        stock_anterior: prevStock,
        stock_posterior: nextStock,
        motivo: `Compra Factura ${numero_factura}`,
        usuario: usuario_id || 'SISTEMA'
      });
    }
  }
  writeJsonFile('products.json', jsonProducts);
  writeJsonFile('movements.json', jsonMovements);

  // Update supplier debt in JSON
  if (isCredit) {
    const proveedores = readJsonFile('proveedores.json', []);
    const pIdx = proveedores.findIndex(p => p.id === Number(proveedor_id));
    if (pIdx !== -1) {
      proveedores[pIdx].saldo_pendiente_usd = (proveedores[pIdx].saldo_pendiente_usd || 0) + parseFloat(total_usd);
      writeJsonFile('proveedores.json', proveedores);
    }
  }

  // Update caja movement in JSON
  if (!isCredit && afecto_caja_efectivo) {
    const jsonMovsCaja = readJsonFile('movimientos_caja.json', []);
    jsonMovsCaja.unshift({
      id: Date.now() + Math.random(),
      caja_id: caja_id || 'LOCAL',
      tipo: 'Salida',
      descripcion: `Egreso de Caja: Pago Contado a Proveedor (Factura #${numero_factura})`,
      monto_usd: parseFloat(total_usd || 0),
      monto_ves: parseFloat(total_ves || 0),
      metodo_pago: metodo_pago_contado || 'Efectivo$',
      fecha: getLocalISODateString()
    });
    writeJsonFile('movimientos_caja.json', jsonMovsCaja);
  }

  return newCompra;
}

// --- PAGOS Y ABONOS A PROVEEDORES (CXP) ---
export async function getPagosProveedores(proveedorId = null) {
  if (usePostgres) {
    try {
      let query = `
        SELECT p.*, prov.razon_social as proveedor_nombre, prov.rif as proveedor_rif,
               c.numero_factura as compra_factura, u.nombre as usuario_nombre
        FROM Pagos_Proveedores p
        LEFT JOIN Proveedores prov ON p.proveedor_id = prov.id
        LEFT JOIN Compras c ON p.compra_id = c.id
        LEFT JOIN Usuarios u ON p.usuario_id = u.id
      `;
      const params = [];
      if (proveedorId) {
        query += ' WHERE p.proveedor_id = $1';
        params.push(proveedorId);
      }
      query += ' ORDER BY p.id DESC';

      const result = await pool.query(query, params);
      return result.rows.map(r => ({
        ...r,
        monto_usd: parseFloat(r.monto_usd || 0),
        monto_ves: parseFloat(r.monto_ves || 0),
        tasa_cambio: parseFloat(r.tasa_cambio || 1),
        fecha: r.fecha ? getLocalISODateString(r.fecha) : getLocalISODateString()
      }));
    } catch (err) {
      console.error('Error al obtener pagos a proveedores (Postgres):', err.message);
      return [];
    }
  }

  const list = readJsonFile('pagos_proveedores.json', []);
  if (proveedorId) return list.filter(p => p.proveedor_id === Number(proveedorId));
  return list;
}

export async function savePagoProveedor(pagoData) {
  const {
    compra_id = null,
    proveedor_id,
    usuario_id,
    caja_id = null,
    monto_usd = 0,
    monto_ves = 0,
    tasa_cambio = 1,
    metodo_pago = 'Efectivo$',
    banco_origen = '',
    numero_referencia = '',
    afecto_caja_efectivo = false,
    observacion = '',
    fecha = getLocalISODateString()
  } = pagoData;

  const pagoAmountUSD = parseFloat(monto_usd || 0);

  if (usePostgres) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert into Pagos_Proveedores
      const res = await client.query(
        `INSERT INTO Pagos_Proveedores (
           compra_id, proveedor_id, usuario_id, caja_id, monto_usd, monto_ves,
           tasa_cambio, metodo_pago, banco_origen, numero_referencia, afecto_caja_efectivo, observacion, fecha
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          compra_id || null,
          proveedor_id,
          usuario_id,
          caja_id || null,
          pagoAmountUSD,
          parseFloat(monto_ves || 0),
          parseFloat(tasa_cambio || 1),
          metodo_pago,
          banco_origen || '',
          numero_referencia || '',
          !!afecto_caja_efectivo,
          observacion || '',
          fecha
        ]
      );
      const newPagoId = res.rows[0].id;

      // 2. Reduce debt in Compras if specific purchase is targeted
      if (compra_id) {
        const compraCheck = await client.query('SELECT saldo_pendiente_usd FROM Compras WHERE id = $1', [compra_id]);
        if (compraCheck.rowCount > 0) {
          const currentDebt = parseFloat(compraCheck.rows[0].saldo_pendiente_usd || 0);
          const newDebt = Math.max(0, currentDebt - pagoAmountUSD);
          const newStatus = newDebt <= 0.005 ? 'Pagada' : 'Parcial';
          await client.query(
            'UPDATE Compras SET saldo_pendiente_usd = $1, estatus = $2 WHERE id = $3',
            [newDebt, newStatus, compra_id]
          );
        }
      } else {
        // Auto-settle oldest pending purchases of this supplier
        const pendingPurchases = await client.query(
          "SELECT id, saldo_pendiente_usd FROM Compras WHERE proveedor_id = $1 AND estatus IN ('Pendiente', 'Parcial') AND saldo_pendiente_usd > 0 ORDER BY id ASC",
          [proveedor_id]
        );
        let remainingToApply = pagoAmountUSD;
        for (const row of pendingPurchases.rows) {
          if (remainingToApply <= 0) break;
          const pDebt = parseFloat(row.saldo_pendiente_usd || 0);
          const apply = Math.min(remainingToApply, pDebt);
          const nextDebt = pDebt - apply;
          const status = nextDebt <= 0.005 ? 'Pagada' : 'Parcial';
          await client.query(
            'UPDATE Compras SET saldo_pendiente_usd = $1, estatus = $2 WHERE id = $3',
            [nextDebt, status, row.id]
          );
          remainingToApply -= apply;
        }
      }

      // 3. Reduce supplier global debt
      await client.query(
        'UPDATE Proveedores SET saldo_pendiente_usd = GREATEST(0, COALESCE(saldo_pendiente_usd, 0) - $1) WHERE id = $2',
        [pagoAmountUSD, proveedor_id]
      );

      // 4. If cash out from active cashier station is requested
      if (afecto_caja_efectivo) {
        let targetCajaId = caja_id;
        if (!targetCajaId) {
          const openCajaRes = await client.query(
            "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND (usuario_id = $1 OR $1 IS NULL) ORDER BY id DESC LIMIT 1",
            [usuario_id || null]
          );
          if (openCajaRes.rowCount > 0) {
            targetCajaId = openCajaRes.rows[0].id;
          } else {
            const anyOpen = await client.query("SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' ORDER BY id DESC LIMIT 1");
            if (anyOpen.rowCount > 0) targetCajaId = anyOpen.rows[0].id;
          }
        }

        if (targetCajaId) {
          const provData = await client.query('SELECT razon_social FROM Proveedores WHERE id = $1', [proveedor_id]);
          const provName = provData.rowCount > 0 ? provData.rows[0].razon_social : 'PROVEEDOR';
          let factInfo = '';
          if (compra_id) {
            const cRes = await client.query('SELECT numero_factura FROM Compras WHERE id = $1', [compra_id]);
            if (cRes.rowCount > 0) factInfo = `(Factura #${cRes.rows[0].numero_factura})`;
          }
          await client.query(
            `INSERT INTO Movimientos_Caja (caja_id, tipo, descripcion, monto_usd, monto_ves, metodo_pago)
             VALUES ($1, 'Salida', $2, $3, $4, $5)`,
            [
              targetCajaId,
              `Egreso de Caja: Pago a Proveedor - ${provName} ${factInfo} ${observacion ? '[' + observacion + ']' : ''}`.trim(),
              pagoAmountUSD,
              parseFloat(monto_ves || 0),
              metodo_pago || 'Efectivo$'
            ]
          );
        }
      }

      await client.query('COMMIT');
      return { id: Number(newPagoId), ...pagoData };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error en savePagoProveedor (Postgres):', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  // JSON Fallback
  const list = readJsonFile('pagos_proveedores.json', []);
  const newItem = { id: Date.now(), ...pagoData };
  list.unshift(newItem);
  writeJsonFile('pagos_proveedores.json', list);

  // Update supplier in JSON
  const proveedores = readJsonFile('proveedores.json', []);
  const pIdx = proveedores.findIndex(p => p.id === Number(proveedor_id));
  if (pIdx !== -1) {
    proveedores[pIdx].saldo_pendiente_usd = Math.max(0, (proveedores[pIdx].saldo_pendiente_usd || 0) - pagoAmountUSD);
    writeJsonFile('proveedores.json', proveedores);
  }

  // Update caja movement in JSON
  if (afecto_caja_efectivo) {
    const jsonMovsCaja = readJsonFile('movimientos_caja.json', []);
    jsonMovsCaja.unshift({
      id: Date.now() + Math.random(),
      caja_id: caja_id || 'LOCAL',
      tipo: 'Salida',
      descripcion: `Egreso de Caja: Pago a Proveedor (${metodo_pago})`,
      monto_usd: pagoAmountUSD,
      monto_ves: parseFloat(monto_ves || 0),
      metodo_pago: metodo_pago || 'Efectivo$',
      fecha: getLocalISODateString()
    });
    writeJsonFile('movimientos_caja.json', jsonMovsCaja);
  }

  return newItem;
}

// --- COTIZACIONES DE PROVEEDORES CRUD ---
export async function getCotizacionesProveedores() {
  if (usePostgres) {
    try {
      const res = await pool.query(`
        SELECT c.*, p.razon_social AS proveedor_nombre, p.rif AS proveedor_rif, u.nombre AS usuario_nombre
        FROM Cotizaciones_Proveedores c
        LEFT JOIN Proveedores p ON c.proveedor_id = p.id
        LEFT JOIN Usuarios u ON c.usuario_id = u.id
        ORDER BY c.id DESC
      `);
      return res.rows.map(r => ({
        id: Number(r.id),
        numero_cotizacion: r.numero_cotizacion || '',
        proveedor_id: Number(r.proveedor_id),
        proveedor_nombre: r.proveedor_nombre || '',
        proveedor_rif: r.proveedor_rif || '',
        usuario_id: Number(r.usuario_id),
        usuario_nombre: r.usuario_nombre || '',
        fecha: r.fecha ? String(r.fecha).replace('T', ' ').substring(0, 16) : getLocalISODateString(),
        fecha_vigencia: r.fecha_vigencia ? String(r.fecha_vigencia).replace('T', ' ').substring(0, 10) : '',
        total_usd: parseFloat(r.total_usd || 0),
        total_ves: parseFloat(r.total_ves || 0),
        estatus: r.estatus || 'Pendiente',
        detalles_json: typeof r.detalles_json === 'string' ? JSON.parse(r.detalles_json) : (r.detalles_json || {})
      }));
    } catch (err) {
      console.error('Error en getCotizacionesProveedores (Postgres):', err.message);
    }
  }
  return readJsonFile('cotizaciones_proveedores.json', []);
}

export async function saveCotizacionProveedor(data) {
  const detallesObj = data.detalles_json || data.items || {};
  const detallesStr = typeof detallesObj === 'string' ? detallesObj : JSON.stringify(detallesObj);
  if (usePostgres) {
    try {
      let savedId;
      if (data.id) {
        const res = await pool.query(
          `UPDATE Cotizaciones_Proveedores 
           SET numero_cotizacion = $1, proveedor_id = $2, fecha = $3, fecha_vigencia = $4, total_usd = $5, total_ves = $6, detalles_json = $7, estatus = $8
           WHERE id = $9 RETURNING id`,
          [
            data.numero_cotizacion || '',
            data.proveedor_id,
            data.fecha || getLocalISODateString(),
            data.fecha_vigencia || null,
            parseFloat(data.total_usd || 0),
            parseFloat(data.total_ves || 0),
            detallesStr,
            data.estatus || 'Pendiente',
            data.id
          ]
        );
        savedId = res.rows[0].id;
      } else {
        const res = await pool.query(
          `INSERT INTO Cotizaciones_Proveedores (
             numero_cotizacion, proveedor_id, usuario_id, fecha, fecha_vigencia, total_usd, total_ves, detalles_json, estatus
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            data.numero_cotizacion || `COT-${Date.now().toString().slice(-6)}`,
            data.proveedor_id,
            data.usuario_id || 1,
            data.fecha || getLocalISODateString(),
            data.fecha_vigencia || null,
            parseFloat(data.total_usd || 0),
            parseFloat(data.total_ves || 0),
            detallesStr,
            data.estatus || 'Pendiente'
          ]
        );
        savedId = res.rows[0].id;
      }

      // Fetch unified joined record with provider name
      const fullRes = await pool.query(`
        SELECT c.*, p.razon_social AS proveedor_nombre, p.rif AS proveedor_rif, u.nombre AS usuario_nombre
        FROM Cotizaciones_Proveedores c
        LEFT JOIN Proveedores p ON c.proveedor_id = p.id
        LEFT JOIN Usuarios u ON c.usuario_id = u.id
        WHERE c.id = $1
      `, [savedId]);

      if (fullRes.rowCount > 0) {
        const r = fullRes.rows[0];
        return {
          id: Number(r.id),
          numero_cotizacion: r.numero_cotizacion || '',
          proveedor_id: Number(r.proveedor_id),
          proveedor_nombre: r.proveedor_nombre || '',
          proveedor_rif: r.proveedor_rif || '',
          usuario_id: Number(r.usuario_id),
          usuario_nombre: r.usuario_nombre || '',
          fecha: r.fecha ? String(r.fecha).replace('T', ' ').substring(0, 16) : getLocalISODateString(),
          fecha_vigencia: r.fecha_vigencia ? String(r.fecha_vigencia).replace('T', ' ').substring(0, 10) : '',
          total_usd: parseFloat(r.total_usd || 0),
          total_ves: parseFloat(r.total_ves || 0),
          estatus: r.estatus || 'Pendiente',
          detalles_json: typeof r.detalles_json === 'string' ? JSON.parse(r.detalles_json) : (r.detalles_json || {})
        };
      }
      return { id: Number(savedId), ...data, total_usd: parseFloat(data.total_usd || 0), total_ves: parseFloat(data.total_ves || 0) };
    } catch (err) {
      console.error('Error en saveCotizacionProveedor (Postgres):', err.message);
      throw err;
    }
  }

  const list = readJsonFile('cotizaciones_proveedores.json', []);
  if (data.id) {
    const idx = list.findIndex(c => c.id === Number(data.id));
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...data, total_usd: parseFloat(data.total_usd || 0), total_ves: parseFloat(data.total_ves || 0) };
      data = list[idx];
    }
  } else {
    const newItem = {
      id: Date.now(),
      ...data,
      total_usd: parseFloat(data.total_usd || 0),
      total_ves: parseFloat(data.total_ves || 0),
      created_at: getLocalISODateString()
    };
    list.unshift(newItem);
    data = newItem;
  }
  writeJsonFile('cotizaciones_proveedores.json', list);
  return data;
}

export async function deleteCotizacionProveedor(id) {
  if (usePostgres) {
    try {
      await pool.query('DELETE FROM Cotizaciones_Proveedores WHERE id = $1', [id]);
      return true;
    } catch (err) {
      console.error('Error en deleteCotizacionProveedor (Postgres):', err.message);
      throw err;
    }
  }
  const list = readJsonFile('cotizaciones_proveedores.json', []);
  const updated = list.filter(c => c.id !== Number(id));
  writeJsonFile('cotizaciones_proveedores.json', updated);
  return true;
}




