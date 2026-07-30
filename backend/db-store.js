import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
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
  if (typeof d === 'string') {
    const cleaned = d.replace('T', ' ').substring(0, 16);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cleaned)) {
      return cleaned;
    }
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) d = parsed;
    else return cleaned;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let usePostgres = false;
let pool = null;

// Initialize PostgreSQL connection pool
try {
  pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_DATABASE,
    connectionTimeoutMillis: 3000 // fail fast if not connected
  });

  // Try to connect to test if Postgres is accessible with configured user/pass
  const client = await pool.connect();
  console.log('✅ Base de datos central PostgreSQL conectada exitosamente.');
  usePostgres = true;
  
  // Run schema migration to add new closure fields if they do not exist
  await client.query(`
    ALTER TABLE Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS venta_total_usd NUMERIC DEFAULT 0;
    ALTER TABLE Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS utilidad_usd NUMERIC DEFAULT 0;
    ALTER TABLE Cajas_Apertura_Cierre ADD COLUMN IF NOT EXISTS detalles_json TEXT;
    ALTER TABLE Clientes ADD COLUMN IF NOT EXISTS aplica_precio_costo BOOLEAN DEFAULT FALSE;
    ALTER TABLE Ventas_Detalle DROP CONSTRAINT IF EXISTS ventas_detalle_tipo_precio_check;
    ALTER TABLE Usuarios ADD COLUMN IF NOT EXISTS clave VARCHAR(100) DEFAULT 'admin';
    ALTER TABLE Usuarios ADD COLUMN IF NOT EXISTS permisos TEXT;
    ALTER TABLE Usuarios ALTER COLUMN rol TYPE VARCHAR(100) USING rol::text;
    ALTER TABLE Ventas ADD COLUMN IF NOT EXISTS estacion_nombre VARCHAR(50) DEFAULT 'CAJA_PRINCIPAL';
    ALTER TABLE Movimientos_Caja ADD COLUMN IF NOT EXISTS estacion_nombre VARCHAR(50) DEFAULT 'CAJA_PRINCIPAL';
    ALTER TABLE Productos ADD COLUMN IF NOT EXISTS a_granel BOOLEAN DEFAULT FALSE;
    ALTER TABLE Productos ADD COLUMN IF NOT EXISTS fecha_vencimiento VARCHAR(50);
    ALTER TABLE Productos ADD COLUMN IF NOT EXISTS porcentaje_impuesto NUMERIC DEFAULT 0;
    CREATE SEQUENCE IF NOT EXISTS seq_factura START WITH 1;
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
    -- Resincronizar secuencias de claves primarias para evitar colisiones de llaves duplicadas (usuarios_pkey, etc.)
    SELECT setval(pg_get_serial_sequence('Usuarios', 'id'), COALESCE((SELECT MAX(id) FROM Usuarios), 1));
    SELECT setval(pg_get_serial_sequence('Roles', 'id'), COALESCE((SELECT MAX(id) FROM Roles), 1));
    SELECT setval(pg_get_serial_sequence('Productos', 'id'), COALESCE((SELECT MAX(id) FROM Productos), 1));
    SELECT setval(pg_get_serial_sequence('Clientes', 'id'), COALESCE((SELECT MAX(id) FROM Clientes), 1));
    SELECT setval(pg_get_serial_sequence('Ventas', 'id'), COALESCE((SELECT MAX(id) FROM Ventas), 1));
    SELECT setval(pg_get_serial_sequence('Tasas_Cambio', 'id'), COALESCE((SELECT MAX(id) FROM Tasas_Cambio), 1));
    SELECT setval('seq_factura', COALESCE((SELECT MAX(CAST(NULLIF(regexp_replace(factura_nro, '\D', '', 'g'), '') AS INTEGER)) FROM Ventas WHERE factura_nro LIKE 'FAC-%'), 1));
    -- Asegurar que todos los cierres tengan fecha_cierre asignada y estatus 'Cerrada' si ya tienen detalles de conciliación
    UPDATE Cajas_Apertura_Cierre SET fecha_cierre = COALESCE(fecha_cierre, fecha_apertura, CURRENT_TIMESTAMP) WHERE fecha_cierre IS NULL;
    UPDATE Cajas_Apertura_Cierre SET estatus = 'Cerrada' WHERE (monto_cierre_real_usd IS NOT NULL OR detalles_json IS NOT NULL) AND (estatus IS NULL OR estatus = 'Abierta');
    -- Eliminar cualquier registro de muestra de tasas si existía previamente
    DELETE FROM Tasas_Cambio WHERE fecha_actualizacion IN ('2026-07-10 08:15', '2026-07-10 14:00', '2026-07-15 08:05');
  `);

  // Alter enum type outside of main multi-statement query to prevent implicit transaction block errors in Postgres
  try {
    await client.query("ALTER TYPE tipo_movimiento_inv ADD VALUE IF NOT EXISTS 'Entrada Rápida'");
  } catch (enumErr) {
    console.log("ℹ️ Nota: No se pudo alterar tipo_movimiento_inv (puede que ya exista o no sea compatible):", enumErr.message);
  }
  
  console.log('📋 Migración de base de datos PostgreSQL completada (columnas de cierres verificadas).');
  
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
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
    return defaultValue;
  }
  try {
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
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error al escribir archivo JSON ${filename}:`, err);
  }
}

// CORE DATA ACCESS METHODS (Dual Mode: PostgreSQL / JSON)
export async function getCompanyConfig() {
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT * FROM Configuracion_Empresa ORDER BY id DESC LIMIT 1');
      if (res.rowCount > 0) {
        const row = res.rows[0];
        return {
          rif: row.rif,
          nombre_comercio: row.nombre_comercio,
          direccion: row.direccion,
          telefono: row.telefono,
          correo: row.correo,
          moneda_base: row.moneda_base,
          mensaje_pie_ticket: row.mensaje_pie_ticket,
          metodos_pago_activos: row.metodos_pago_activos
        };
      }
    } catch (err) {
      console.error('Error en getCompanyConfig (Postgres):', err.message);
    }
  }
  return readJsonFile('config.json', mockConfig);
}

export async function saveCompanyConfig(config) {
  if (usePostgres) {
    try {
      const existing = await pool.query('SELECT id FROM Configuracion_Empresa ORDER BY id DESC LIMIT 1');
      if (existing.rowCount > 0) {
        await pool.query(
          `UPDATE Configuracion_Empresa SET 
            rif = $1, nombre_comercio = $2, direccion = $3, telefono = $4, 
            correo = $5, moneda_base = $6, mensaje_pie_ticket = $7, metodos_pago_activos = $8
           WHERE id = $9`,
          [config.rif, config.nombre_comercio, config.direccion, config.telefono, config.correo, config.moneda_base, config.mensaje_pie_ticket, JSON.stringify(config.metodos_pago_activos), existing.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO Configuracion_Empresa (rif, nombre_comercio, direccion, telefono, correo, moneda_base, mensaje_pie_ticket, metodos_pago_activos)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [config.rif, config.nombre_comercio, config.direccion, config.telefono, config.correo, config.moneda_base, config.mensaje_pie_ticket, JSON.stringify(config.metodos_pago_activos)]
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

export async function getUsers() {
  const defaultPermsAdmin = {
    caja: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
    inventario: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
    ventas: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
    clientes: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
    tasa: { ver: true, crear: true, editar: true, eliminar: true, admin: true },
    config: { ver: true, crear: true, editar: true, eliminar: true, admin: true }
  };
  const defaultPermsUser = {
    caja: { ver: true, crear: true, editar: true, eliminar: false, admin: false },
    inventario: { ver: true, crear: false, editar: false, eliminar: false, admin: false },
    ventas: { ver: true, crear: false, editar: false, eliminar: false, admin: false },
    clientes: { ver: true, crear: true, editar: true, eliminar: false, admin: false },
    tasa: { ver: true, crear: false, editar: false, eliminar: false, admin: false },
    config: { ver: false, crear: false, editar: false, eliminar: false, admin: false }
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
          permisos: r.permisos ? JSON.parse(r.permisos) : (r.rol?.toLowerCase() === 'administrador' ? defaultPermsAdmin : defaultPermsUser)
        }));
      } else {
        console.log('Seeding default users to Postgres database...');
        const localUsers = readJsonFile('users.json', mockUsers);
        for (const u of localUsers) {
          const clave = u.clave || 'admin';
          const perms = u.permisos || (u.rol?.toLowerCase() === 'administrador' ? defaultPermsAdmin : defaultPermsUser);
          await pool.query(
            `INSERT INTO Usuarios (id, usuario, clave, nombre, rol, estado, permisos)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [u.id, u.usuario, clave, u.nombre, u.rol, u.estado || 'Activo', JSON.stringify(perms)]
          );
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('Usuarios', 'id'), COALESCE((SELECT MAX(id) FROM Usuarios), 1))");
        const res2 = await pool.query('SELECT id, usuario, nombre, rol, estado, clave, permisos FROM Usuarios ORDER BY id ASC');
        return res2.rows.map(r => ({
          id: r.id,
          usuario: r.usuario,
          nombre: r.nombre,
          rol: r.rol,
          estado: r.estado,
          clave: r.clave || 'admin',
          permisos: r.permisos ? JSON.parse(r.permisos) : (r.rol?.toLowerCase() === 'administrador' ? defaultPermsAdmin : defaultPermsUser)
        }));
      }
    } catch (err) {
      console.error('Error en getUsers (Postgres):', err.message);
    }
  }
  const localUsers = readJsonFile('users.json', mockUsers);
  return localUsers.map(u => ({
    clave: 'admin',
    permisos: u.permisos || (u.rol?.toLowerCase() === 'administrador' ? defaultPermsAdmin : defaultPermsUser),
    ...u
  }));
}

export async function getProducts() {
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT * FROM Productos ORDER BY id ASC');
      if (res.rowCount > 0) {
        return res.rows.map(r => ({
          id: r.id,
          barcode: r.codigo_barras_clave,
          description: r.descripcion,
          category: r.categoria,
          stock_actual: r.stock_actual,
          stock_minimo: r.stock_minimo,
          precio_costo_usd: parseFloat(r.precio_costo_usd),
          precio_detalle_usd: parseFloat(r.precio_detalle_usd),
          precio_mayor_usd: parseFloat(r.precio_mayor_usd),
          navigator: r.cantidad_mayorista,
          cantidad_mayorista: r.cantidad_mayorista,
          exento_impuesto: r.exento_impuesto,
          imagen_url: r.imagen_url || '',
          estado: r.estado,
          a_granel: r.a_granel,
          fecha_vencimiento: r.fecha_vencimiento,
          porcentaje_impuesto: parseFloat(r.porcentaje_impuesto || 0)
        }));
      } else {
        console.log('Seeding default products to Postgres database...');
        const localProducts = readJsonFile('products.json', mockProducts);
        for (const p of localProducts) {
          await pool.query(
            `INSERT INTO Productos (id, codigo_barras_clave, descripcion, categoria, stock_actual, stock_minimo, precio_costo_usd, precio_detalle_usd, precio_mayor_usd, cantidad_mayorista, exento_impuesto, imagen_url, estado, a_granel, fecha_vencimiento, porcentaje_impuesto)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [p.id, p.barcode, p.description, p.category, p.stock_actual || 0, p.stock_minimo || 0, p.precio_costo_usd, p.precio_detalle_usd, p.precio_mayor_usd, p.cantidad_mayorista || 12, p.exento_impuesto, p.imagen_url, p.estado || 'Activo', p.a_granel || false, p.fecha_vencimiento || null, p.porcentaje_impuesto || 0]
          );
        }
        const res2 = await pool.query('SELECT * FROM Productos ORDER BY id ASC');
        return res2.rows.map(r => ({
          id: r.id,
          barcode: r.codigo_barras_clave,
          description: r.descripcion,
          category: r.categoria,
          stock_actual: r.stock_actual,
          stock_minimo: r.stock_minimo,
          precio_costo_usd: parseFloat(r.precio_costo_usd),
          precio_detalle_usd: parseFloat(r.precio_detalle_usd),
          precio_mayor_usd: parseFloat(r.precio_mayor_usd),
          cantidad_mayorista: r.cantidad_mayorista,
          exento_impuesto: r.exento_impuesto,
          imagen_url: r.imagen_url || '',
          estado: r.estado,
          a_granel: r.a_granel,
          fecha_vencimiento: r.fecha_vencimiento,
          porcentaje_impuesto: parseFloat(r.porcentaje_impuesto || 0)
        }));
      }
    } catch (err) {
      console.error('Error en getProducts (Postgres):', err.message);
    }
  }
  return readJsonFile('products.json', mockProducts);
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
  const stockMinimo = isGranel ? (p.stock_minimo || 0) : Math.round(p.stock_minimo || 0);
  const stockActual = isGranel ? (p.stock_actual || 0) : Math.round(p.stock_actual || 0);

  if (usePostgres) {
    try {
      await pool.query(
        `UPDATE Productos 
         SET codigo_barras_clave = $1, descripcion = $2, categoria = $3, stock_minimo = $4, precio_costo_usd = $5, precio_detalle_usd = $6, precio_mayor_usd = $7, cantidad_mayorista = $8, exento_impuesto = $9, imagen_url = $10, estado = $11, a_granel = $12, fecha_vencimiento = $13, porcentaje_impuesto = $14, stock_actual = $15
         WHERE id = $16`,
        [p.barcode, p.description, p.category, stockMinimo, p.precio_costo_usd, p.precio_detalle_usd, p.precio_mayor_usd, p.cantidad_mayorista || 12, p.exento_impuesto, p.imagen_url, p.estado, p.a_granel || false, p.fecha_vencimiento || null, p.porcentaje_impuesto || 0, stockActual, p.id]
      );
      return { ...p, stock_minimo: stockMinimo, stock_actual: stockActual };
    } catch (err) {
      console.error('Error en updateProduct (Postgres):', err.message);
    }
  }
  const products = readJsonFile('products.json', mockProducts);
  const idx = products.findIndex(item => item.id === p.id);
  if (idx !== -1) {
    products[idx] = { ...products[idx], ...p, stock_minimo: stockMinimo, stock_actual: stockActual };
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
      if (res.rowCount > 0) {
        return res.rows.map(r => ({
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
        }));
      } else {
        console.log('Seeding default clients to Postgres database...');
        const localClients = readJsonFile('clients.json', mockClients);
        for (const c of localClients) {
          await pool.query(
            `INSERT INTO Clientes (id, cedula_rif, nombre, telefono, direccion, limite_credito, credito_disponible, porcentaje_descuento, estado, aplica_precio_costo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [c.id, c.cedula_rif, c.nombre, c.telefono || '', c.direccion || '', c.limite_credito || 0.00, c.credito_disponible || 0.00, c.porcentaje_descuento || 0.00, c.estado || 'Activo', !!c.aplica_precio_costo]
          );
        }
        const res2 = await pool.query('SELECT * FROM Clientes ORDER BY id ASC');
        return res2.rows.map(r => ({
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
        }));
      }
    } catch (err) {
      console.error('Error en getClients (Postgres):', err.message);
    }
  }
  return readJsonFile('clients.json', mockClients);
}

export async function saveClient(c) {
  if (usePostgres) {
    try {
      const res = await pool.query(
        `INSERT INTO Clientes (cedula_rif, nombre, telefono, direccion, limite_credito, credito_disponible, porcentaje_descuento, estado, aplica_precio_costo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [c.cedula_rif, c.nombre, c.telefono, c.direccion, c.limite_credito, c.credito_disponible, c.porcentaje_descuento, c.estado, !!c.aplica_precio_costo]
      );
      return { ...c, id: res.rows[0].id, saldo_pendiente: 0, aplica_precio_costo: !!c.aplica_precio_costo };
    } catch (err) {
      console.error('Error en saveClient (Postgres):', err.message);
    }
  }
  const clients = readJsonFile('clients.json', mockClients);
  const newClient = { ...c, id: Date.now(), saldo_pendiente: 0, aplica_precio_costo: !!c.aplica_precio_costo };
  clients.push(newClient);
  writeJsonFile('clients.json', clients);
  return newClient;
}


export async function getAbonos() {
  return readJsonFile('abonos.json', []);
}

export async function registerAbono(clientId, amountUSD) {
  let clientNombre = '';
  let clientDoc = '';
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT nombre, cedula_rif, limite_credito, credito_disponible FROM Clientes WHERE id = $1', [clientId]);
      if (res.rowCount > 0) {
        const client = res.rows[0];
        clientNombre = client.nombre;
        clientDoc = client.cedula_rif;
        const nextCredito = Math.min(parseFloat(client.limite_credito), parseFloat(client.credito_disponible) + amountUSD);
        await pool.query('UPDATE Clientes SET credito_disponible = $1 WHERE id = $2', [nextCredito, clientId]);
        
        // Log abono
        const abonos = readJsonFile('abonos.json', []);
        abonos.push({
          id: Date.now(),
          cliente_id: clientId,
          nombre: clientNombre,
          cedula_rif: clientDoc,
          monto: amountUSD,
          fecha: getLocalISODateString()
        });
        writeJsonFile('abonos.json', abonos);
        return true;
      }
    } catch (err) {
      console.error('Error en registerAbono (Postgres):', err.message);
    }
  } else {
    const clients = readJsonFile('clients.json', mockClients);
    const idx = clients.findIndex(c => c.id === clientId || c.id === parseInt(clientId));
    if (idx !== -1) {
      clientNombre = clients[idx].nombre;
      clientDoc = clients[idx].cedula_rif;
      clients[idx].saldo_pendiente = Math.max(0, clients[idx].saldo_pendiente - amountUSD);
      clients[idx].credito_disponible = Math.min(clients[idx].limite_credito, clients[idx].credito_disponible + amountUSD);
      writeJsonFile('clients.json', clients);
      
      // Log abono
      const abonos = readJsonFile('abonos.json', []);
      abonos.push({
        id: Date.now(),
        cliente_id: clientId,
        nombre: clientNombre,
        cedula_rif: clientDoc,
        monto: amountUSD,
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
        console.log('Seeding default roles to Postgres database...');
        for (const role of defaultRoles) {
          await pool.query(
            'INSERT INTO Roles (nombre, permisos) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [role.nombre, JSON.stringify(role.permisos)]
          );
        }
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
  return readJsonFile('roles.json', defaultRoles);
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
  const isFullWipe = options.wipeInventory && options.wipeSales && options.wipeClients;

  if (usePostgres) {
    try {
      if (options.wipeInventory) {
        await pool.query('TRUNCATE TABLE Productos, Movimientos_Inventario, Historial_Precios RESTART IDENTITY CASCADE');
      }
      if (options.wipeStock) {
        await pool.query('UPDATE Productos SET stock_actual = 0');
        await pool.query('TRUNCATE TABLE Movimientos_Inventario RESTART IDENTITY CASCADE');
      }
      if (options.wipeSales) {
        await pool.query('TRUNCATE TABLE Ventas, Ventas_Detalle, Pagos_Venta RESTART IDENTITY CASCADE');
        await pool.query('TRUNCATE TABLE Cajas_Apertura_Cierre, Movimientos_Caja RESTART IDENTITY CASCADE');
        await pool.query('TRUNCATE TABLE Movimientos_Inventario RESTART IDENTITY CASCADE');
        await pool.query('TRUNCATE TABLE Historial_Precios RESTART IDENTITY CASCADE');
        writeJsonFile('abonos.json', []);
      }
      if (options.wipeClients) {
        await pool.query("DELETE FROM Clientes WHERE cedula_rif <> 'V-00000000'");
        await pool.query("UPDATE Clientes SET limite_credito = 0, credito_disponible = 0, saldo_pendiente = 0");
      }
      if (isFullWipe) {
        // Clear users except admin
        await pool.query("DELETE FROM Usuarios WHERE usuario <> 'admin'");
        // Clear perfiles/roles except Administrador
        await pool.query("DELETE FROM Roles WHERE LOWER(nombre) <> 'administrador'");
        // Clear basic and fiscal data
        await pool.query(`UPDATE Configuracion_Empresa SET 
          rif = '', nombre_comercio = '', direccion = '', telefono = '', 
          correo = '', mensaje_pie_ticket = '', metodos_pago_activos = '[]'::jsonb`);
      }
      return true;
    } catch (err) {
      console.error('Error en wipeDatabase (Postgres):', err.message);
      throw err;
    }
  }

  // JSON Mode
  if (options.wipeInventory) {
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
  if (options.wipeSales) {
    writeJsonFile('sales.json', []);
    writeJsonFile('abonos.json', []);
    writeJsonFile('cierres.json', []);
    writeJsonFile('movements.json', []);
    writeJsonFile('price-history.json', []);
    writeJsonFile('price_history.json', []);
    writeJsonFile('caja_activa.json', { abierta: false, id: null, monto_usd: 0, monto_ves: 0 });
    // Also write fallback file just in case
    writeJsonFile('caja_estado.json', { abierta: false, id: null, monto_usd: 0, monto_ves: 0 });
  }
  if (options.wipeClients) {
    const clients = readJsonFile('clients.json', mockClients);
    const genericClients = clients.filter(c => c.cedula_rif === 'V-00000000');
    writeJsonFile('clients.json', genericClients);
  }
  if (isFullWipe) {
    // Clear users except admin
    const users = readJsonFile('users.json', mockUsers);
    const adminUsers = users.filter(u => u.usuario === 'admin');
    writeJsonFile('users.json', adminUsers);

    // Clear perfiles/roles except Administrador
    const roles = readJsonFile('roles.json', []);
    const rolesSource = roles.length > 0 ? roles : [
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
      }
    ];
    const adminRoles = rolesSource.filter(r => r.nombre.toLowerCase() === 'administrador');
    writeJsonFile('roles.json', adminRoles);

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
    timestamp: new Date().toISOString()
  };
}

export async function restoreDatabase(data) {
  if (usePostgres) {
    try {
      // In Postgres, we'll restore by cleaning tables first, then inserting items
      // This is a powerful backup utility. Let's make sure it handles clean-up and inserts
      if (data.products) {
        await pool.query('TRUNCATE TABLE Productos RESTART IDENTITY CASCADE');
        for (const p of data.products) {
          await pool.query(
            `INSERT INTO Productos (id, codigo_barras_clave, descripcion, categoria, stock_actual, stock_minimo, 
             precio_costo_usd, precio_detalle_usd, precio_mayor_usd, cantidad_mayorista, exento_impuesto, imagen_url, 
             estado, a_granel, fecha_vencimiento, porcentaje_impuesto) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [p.id, p.barcode, p.description, p.category, p.stock_actual, p.stock_minimo,
             p.precio_costo_usd, p.precio_detalle_usd, p.precio_mayor_usd, p.cantidad_mayorista, p.exento_impuesto, p.imagen_url || '',
             p.estado || 'Activo', p.a_granel || false, p.fecha_vencimiento || null, p.porcentaje_impuesto || 0]
          );
        }
      }
      if (data.clients) {
        await pool.query('TRUNCATE TABLE Clientes RESTART IDENTITY CASCADE');
        for (const c of data.clients) {
          await pool.query(
            `INSERT INTO Clientes (id, cedula_rif, nombre, telefono, direccion, limite_credito, credito_disponible, porcentaje_descuento, estado, saldo_pendiente, aplica_precio_costo) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [c.id, c.cedula_rif, c.nombre, c.telefono || '', c.direccion || '', c.limite_credito, c.credito_disponible, c.porcentaje_descuento, c.estado || 'Activo', c.saldo_pendiente || 0, c.aplica_precio_costo || false]
          );
        }
      }
      if (data.users) {
        await pool.query('TRUNCATE TABLE Usuarios RESTART IDENTITY CASCADE');
        for (const u of data.users) {
          await pool.query(
            'INSERT INTO Usuarios (id, usuario, nombre, rol, estado, clave, permisos) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [u.id, u.usuario, u.nombre, u.rol, u.estado || 'Activo', u.clave || 'admin', JSON.stringify(u.permisos)]
          );
        }
      }
      if (data.roles) {
        await pool.query('TRUNCATE TABLE Roles RESTART IDENTITY CASCADE');
        for (const r of data.roles) {
          await pool.query(
            'INSERT INTO Roles (id, nombre, permisos) VALUES ($1, $2, $3)',
            [r.id, r.nombre, JSON.stringify(r.permisos)]
          );
        }
      }
      // Config restore
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
        id: r.id,
        date: getLocalISODateString(new Date(r.date)),
        productCode: r.productCode,
        productDescription: r.productDescription,
        type: r.tipo,
        qty: r.qty,
        stock_anterior: r.stock_anterior,
        stock_posterior: r.stock_posterior,
        motivo: r.motivo,
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
        id: r.id,
        date: getLocalISODateString(new Date(r.fecha)),
        productCode: r.productCode,
        productDescription: r.productDescription,
        priceType: r.priceType,
        oldPrice: parseFloat(r.oldPrice),
        newPrice: parseFloat(r.newPrice),
        motivo: r.motivo,
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

export async function getSales() {
  if (usePostgres) {
    try {
      // Query sales from Postgres database
      // Join clients and payments details
      const salesRes = await pool.query(`
        SELECT v.id, v.factura_nro, v.fecha, v.subtotal_usd, v.descuento_usd, v.total_usd, v.total_ves, v.con_ticket,
               v.estacion_nombre as terminal, c.cedula_rif as "clientDoc", c.nombre as "clientName", u.nombre as usuario
        FROM Ventas v
        LEFT JOIN Clientes c ON v.cliente_id = c.id
        LEFT JOIN Usuarios u ON v.usuario_id = u.id
        ORDER BY v.id DESC
      `);
      
      const salesList = [];
      for (const row of salesRes.rows) {
        // Fetch items
        const itemsRes = await pool.query(`
          SELECT vd.cantidad as qty, vd.precio_unitario_usd, vd.tipo_precio, vd.total_fila_usd,
                 p.codigo_barras_clave as barcode, p.descripcion, p.precio_costo_usd
          FROM Ventas_Detalle vd
          LEFT JOIN Productos p ON vd.producto_id = p.id
          WHERE vd.venta_id = $1
        `, [row.id]);
        
        // Fetch payments
        const paymentsRes = await pool.query(`
          SELECT metodo_pago as metodo, monto_entregado_usd as monto, monto_entregado_ves as montoVES, 
                 banco_emisor as banco, numero_referencia as referencia
          FROM Pagos_Venta
          WHERE venta_id = $1
        `, [row.id]);
        
        salesList.push({
          id: row.id,
          factura_nro: row.factura_nro,
          fecha: getLocalISODateString(new Date(row.fecha)),
          client: {
            cedula_rif: row.clientDoc,
            nombre: row.clientName
          },
          items: itemsRes.rows.map(i => ({
            qty: i.qty,
            precio_unitario_usd: parseFloat(i.precio_unitario_usd),
            total_fila_usd: parseFloat(i.total_fila_usd),
            priceUSD: parseFloat(i.precio_unitario_usd),
            totalUSD: parseFloat(i.total_fila_usd),
            product: {
              barcode: i.barcode,
              description: i.descripcion,
              precio_costo_usd: parseFloat(i.precio_costo_usd || 0)
            }
          })),
          subtotal: parseFloat(row.subtotal_usd),
          descuento: parseFloat(row.descuento_usd),
          totalUSD: parseFloat(row.total_usd),
          totalVES: parseFloat(row.total_ves),
          pagos: paymentsRes.rows.map(p => ({
            metodo: p.metodo,
            monto: parseFloat(p.monto || '0'),
            montoVES: parseFloat(p.montoVES || '0'),
            banco: p.banco || '',
            referencia: p.referencia || ''
          })),
          vueltoUSD: 0,
          vueltoVES: 0,
          usuario: row.usuario,
          terminal: row.terminal
        });
      }
      return salesList;
    } catch (err) {
      console.error('Error en getSales (Postgres):', err.message);
    }
  }
  return readJsonFile('sales.json', []);
}

export async function saveSale(s) {
  if (usePostgres) {
    const clientTarget = await pool.connect();
    try {
      await clientTarget.query('BEGIN');
      
      // Get IDs
      const clientRes = await clientTarget.query('SELECT id FROM Clientes WHERE cedula_rif = $1', [s.client.cedula_rif]);
      const myTerminal = s.terminal || s.estacion_nombre || 'CAJA_PRINCIPAL';
      let activeCaja = await clientTarget.query(
        "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND (estacion_nombre = $1 OR estacion_nombre = 'CAJA_PRINCIPAL') ORDER BY id DESC LIMIT 1",
        [myTerminal]
      );
      if (activeCaja.rowCount === 0) {
        activeCaja = await clientTarget.query("SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' ORDER BY id DESC LIMIT 1");
      }
      
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
      }
      const saleRes = await clientTarget.query(
        `INSERT INTO Ventas (factura_nro, cliente_id, usuario_id, caja_id, subtotal_usd, descuento_usd, total_usd, total_ves, estacion_nombre)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, fecha`,
        [factura_nro, clientId, userId, cajaId, s.subtotal, s.descuento, s.totalUSD, s.totalVES, s.terminal || 'CAJA_PRINCIPAL']
      );
      
      const saleId = saleRes.rows[0].id;
      
      // Insert Items & adjust stock
      for (const item of s.items) {
        const prodRes = await clientTarget.query('SELECT id, stock_actual, precio_detalle_usd, a_granel FROM Productos WHERE codigo_barras_clave = $1', [item.product.barcode]);
        if (prodRes.rowCount > 0) {
          const prodId = prodRes.rows[0].id;
          const currentStock = prodRes.rows[0].stock_actual;
          const isGranel = !!prodRes.rows[0].a_granel;
          
          const cleanQty = isGranel ? item.qty : Math.round(item.qty);
          let newStock = currentStock - cleanQty;
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
              item.precio_unitario_usd || item.priceUSD || item.product.precio_detalle_usd, 
              item.tipo_precio || item.priceType || 'Detalle', 
              item.total_fila_usd || item.totalUSD || (cleanQty * (item.priceUSD || item.product.precio_detalle_usd))
            ]
          );
          
          // Update Stock
          await clientTarget.query('UPDATE Productos SET stock_actual = $1 WHERE id = $2', [newStock, prodId]);
          
          // Log Kardex
          await clientTarget.query(
            `INSERT INTO Movimientos_Inventario (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_posterior, motivo)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [prodId, userId, 'Venta', -cleanQty, currentStock, newStock, `Venta Facturada: ${factura_nro}`]
          );
        }
      }
      
      // Insert Payments
      for (const p of s.pagos) {
        // Adjust client credit if Credit was used
        if (p.metodo === 'CreditoCliente' && p.monto > 0) {
          await clientTarget.query(
            'UPDATE Clientes SET credito_disponible = credito_disponible - $1 WHERE id = $2',
            [p.monto, clientId]
          );
        }
        
        await clientTarget.query(
          `INSERT INTO Pagos_Venta (venta_id, metodo_pago, monto_entregado_usd, monto_entregado_ves, banco_emisor, numero_referencia)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [saleId, p.metodo, p.monto, p.montoVES || 0, p.banco || '', p.referencia || '']
        );
      }
      
      await clientTarget.query('COMMIT');
      return {
        ...s,
        id: saleId,
        factura_nro, // Return the server-assigned invoice number to the frontend
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

        return {
          id: r.id,
          fechaApertura: fApertura,
          fechaCierre: fCierre,
          fecha: fCierre || fApertura,
          aperturaUsd: parseFloat(r.monto_apertura_usd),
          aperturaVes: parseFloat(r.monto_apertura_ves),
          realUsd: r.monto_cierre_real_usd ? parseFloat(r.monto_cierre_real_usd) : 0,
          realVes: r.monto_cierre_real_ves ? parseFloat(r.monto_cierre_real_ves) : 0,
          expectedUsd: r.monto_cierre_esperado_usd ? parseFloat(r.monto_cierre_esperado_usd) : 0,
          expectedVes: r.monto_cierre_esperado_ves ? parseFloat(r.monto_cierre_esperado_ves) : 0,
          ventaTotalUsd: r.venta_total_usd ? parseFloat(r.venta_total_usd) : 0,
          utilidadUsd: r.utilidad_usd ? parseFloat(r.utilidad_usd) : 0,
          ...parsedDetails,
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

      // Auto-close any previous stale open session for THIS user on THIS terminal
      await pool.query(
        "UPDATE Cajas_Apertura_Cierre SET estatus = 'Cerrada', fecha_cierre = $3 WHERE estacion_nombre = $1 AND usuario_id = $2 AND estatus = 'Abierta'",
        [termName, userId, nowStr]
      );

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
            detalles_json = $7
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
            nowStr
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

      let activeRes;
      if (!isNaN(userId) && userId > 0) {
        activeRes = await pool.query(
          "SELECT * FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND estacion_nombre = $1 AND usuario_id = $2 ORDER BY id DESC LIMIT 1",
          [myTerminal, userId]
        );
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
               v.estacion_nombre as terminal, c.cedula_rif as "clientDoc", c.nombre as "clientName", u.nombre as usuario
        FROM Ventas v
        LEFT JOIN Clientes c ON v.cliente_id = c.id
        LEFT JOIN Usuarios u ON v.usuario_id = u.id
        WHERE v.caja_id = $1
      `, [cajaId]);
      
      const shiftSalesList = [];
      let salesCashUsd = 0;
      let salesCashVes = 0;
      
      for (const row of salesRes.rows) {
        const paymentsRes = await pool.query(`
          SELECT metodo_pago as metodo, monto_entregado_usd as monto, monto_entregado_ves as montoVES, 
                 monto_vuelto_usd as "vueltoUSD", monto_vuelto_ves as "vueltoVES"
          FROM Pagos_Venta
          WHERE venta_id = $1
        `, [row.id]);
        
        let cashUsd = 0;
        let cashVes = 0;
        const pagos = paymentsRes.rows.map(p => {
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
        
        const vUSD = parseFloat(paymentsRes.rows[0]?.vueltoUSD || '0');
        const vVES = parseFloat(paymentsRes.rows[0]?.vueltoVES || '0');
        salesCashUsd += (cashUsd - vUSD);
        salesCashVes += (cashVes - vVES);
        
        const itemsRes = await pool.query(`
          SELECT vd.cantidad as qty, vd.precio_unitario_usd, vd.total_fila_usd, p.codigo_barras_clave as barcode, p.descripcion
          FROM Ventas_Detalle vd
          LEFT JOIN Productos p ON vd.producto_id = p.id
          WHERE vd.venta_id = $1
        `, [row.id]);
        
        shiftSalesList.push({
          id: row.id,
          factura_nro: row.factura_nro,
          fecha: getLocalISODateString(new Date(row.fecha)),
          client: {
            cedula_rif: row.clientDoc,
            nombre: row.clientName
          },
          items: itemsRes.rows.map(i => ({
            qty: i.qty,
            precio_unitario_usd: parseFloat(i.precio_unitario_usd),
            total_fila_usd: parseFloat(i.total_fila_usd),
            product: {
              barcode: i.barcode,
              description: i.descripcion
            }
          })),
          subtotal: parseFloat(row.subtotal_usd),
          descuento: parseFloat(row.descuento_usd),
          totalUSD: parseFloat(row.total_usd),
          totalVES: parseFloat(row.total_ves),
          pagos,
          vueltoUSD: vUSD,
          vueltoVES: vVES,
          usuario: row.usuario,
          terminal: row.terminal
        });
      }
      
      const movsRes = await pool.query("SELECT * FROM Movimientos_Caja WHERE caja_id = $1", [cajaId]);
      let shiftAbonosUsd = 0;
      let shiftEntradasUsd = 0;
      let shiftSalidasUsd = 0;
      let totalMovUsd = 0;
      let totalMovVes = 0;
      
      for (const m of movsRes.rows) {
        const mUsd = parseFloat(m.monto_usd);
        const mVes = parseFloat(m.monto_ves);
        const tipo = m.tipo;
        const desc = m.descripcion;
        
        if (tipo === 'Entrada') {
          totalMovUsd += mUsd;
          totalMovVes += mVes;
          if (desc.startsWith('Abono')) {
            shiftAbonosUsd += mUsd;
          } else {
            shiftEntradasUsd += mUsd;
          }
        } else {
          totalMovUsd -= mUsd;
          totalMovVes -= mVes;
          shiftSalidasUsd += mUsd;
        }
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
        shiftAbonosUsd,
        shiftEntradasUsd,
        shiftSalidasUsd
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

export async function registrarCajaMovimiento(tipo, descripcion, usd, ves, terminal) {
  if (usePostgres) {
    try {
      const termName = terminal || 'CAJA_PRINCIPAL';
      const activeCaja = await pool.query(
        "SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' AND estacion_nombre = $1 ORDER BY id DESC LIMIT 1",
        [termName]
      );
      if (activeCaja.rowCount > 0) {
        const cajaId = activeCaja.rows[0].id;
        // In Postgres we allow 'Devolucion' check constraint
        const typeDb = (tipo === 'Entrada' || tipo === 'Salida' || tipo === 'Devolucion') ? tipo : 'Salida';
        await pool.query(
          `INSERT INTO Movimientos_Caja (caja_id, tipo, descripcion, monto_usd, monto_ves, estacion_nombre)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [cajaId, typeDb, descripcion, usd, ves, termName]
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
    activeCheck.movimientos.push({ tipo, descripcion, usd, ves, terminal });
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
