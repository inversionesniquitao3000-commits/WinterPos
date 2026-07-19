import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { 
  mockUsers, mockProducts, mockClients, mockTasaHistory, mockConfig 
} from './mockData.js';

dotenv.config();

const { Pool } = pg;
const DATA_DIR = path.resolve('./data');

// Ensure data directory exists for JSON storage
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Local timezone Date/Time formatter helper
function getLocalISODateString(d = new Date()) {
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
    CREATE TABLE IF NOT EXISTS Roles (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) UNIQUE,
      permisos TEXT
    );
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
          permisos: r.permisos ? JSON.parse(r.permisos) : (r.rol === 'administrador' ? defaultPermsAdmin : defaultPermsUser)
        }));
      }
    } catch (err) {
      console.error('Error en getUsers (Postgres):', err.message);
    }
  }
  const localUsers = readJsonFile('users.json', mockUsers);
  return localUsers.map(u => ({
    clave: 'admin',
    permisos: u.permisos || (u.rol === 'administrador' ? defaultPermsAdmin : defaultPermsUser),
    ...u
  }));
}

export async function getProducts() {
  if (usePostgres) {
    try {
      const res = await pool.query('SELECT * FROM Productos ORDER BY id ASC');
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
        cantidad_mayorista: r.cantidad_mayorista,
        exento_impuesto: r.exento_impuesto,
        imagen_url: r.imagen_url || '',
        estado: r.estado
      }));
    } catch (err) {
      console.error('Error en getProducts (Postgres):', err.message);
    }
  }
  return readJsonFile('products.json', mockProducts);
}

export async function saveProduct(p) {
  if (usePostgres) {
    try {
      const res = await pool.query(
        `INSERT INTO Productos (codigo_barras_clave, descripcion, categoria, stock_actual, stock_minimo, precio_costo_usd, precio_detalle_usd, precio_mayor_usd, cantidad_mayorista, exento_impuesto, imagen_url, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [p.barcode, p.description, p.category, p.stock_actual, p.stock_minimo, p.precio_costo_usd, p.precio_detalle_usd, p.precio_mayor_usd, p.cantidad_mayorista, p.exento_impuesto, p.imagen_url, p.estado]
      );
      return { ...p, id: res.rows[0].id };
    } catch (err) {
      console.error('Error en saveProduct (Postgres):', err.message);
    }
  }
  const products = readJsonFile('products.json', mockProducts);
  const newProduct = { ...p, id: Date.now() };
  products.push(newProduct);
  writeJsonFile('products.json', products);
  return newProduct;
}

export async function updateProduct(p) {
  if (usePostgres) {
    try {
      await pool.query(
        `UPDATE Productos 
         SET codigo_barras_clave = $1, descripcion = $2, categoria = $3, stock_minimo = $4, precio_costo_usd = $5, precio_detalle_usd = $6, precio_mayor_usd = $7, cantidad_mayorista = $8, exento_impuesto = $9, imagen_url = $10, estado = $11
         WHERE id = $12`,
        [p.barcode, p.description, p.category, p.stock_minimo, p.precio_costo_usd, p.precio_detalle_usd, p.precio_mayor_usd, p.cantidad_mayorista, p.exento_impuesto, p.imagen_url, p.estado, p.id]
      );
      return p;
    } catch (err) {
      console.error('Error en updateProduct (Postgres):', err.message);
    }
  }
  const products = readJsonFile('products.json', mockProducts);
  const idx = products.findIndex(item => item.id === p.id);
  if (idx !== -1) {
    products[idx] = { ...products[idx], ...p };
    writeJsonFile('products.json', products);
    return products[idx];
  }
  return null;
}

export async function updateProductStock(prodId, stockActual) {
  if (usePostgres) {
    try {
      await pool.query('UPDATE Productos SET stock_actual = $1 WHERE id = $2', [stockActual, prodId]);
      return true;
    } catch (err) {
      console.error('Error en updateProductStock (Postgres):', err.message);
    }
  }
  const products = readJsonFile('products.json', mockProducts);
  const idx = products.findIndex(p => p.id === prodId);
  if (idx !== -1) {
    products[idx].stock_actual = stockActual;
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
        limite_credito: parseFloat(r.limite_credito),
        credito_disponible: parseFloat(r.credito_disponible),
        porcentaje_descuento: parseFloat(r.porcentaje_descuento),
        estado: r.estado,
        aplica_precio_costo: !!r.aplica_precio_costo,
        saldo_pendiente: parseFloat(r.limite_credito) - parseFloat(r.credito_disponible)
      }));
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
  const permsStr = JSON.stringify(u.permisos);
  if (usePostgres) {
    try {
      const res = await pool.query(
        'INSERT INTO Usuarios (usuario, nombre, rol, estado, clave, permisos) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [u.usuario, u.nombre, u.rol, u.estado || 'Activo', u.clave || 'admin', permsStr]
      );
      if (res.rowCount > 0) {
        const r = res.rows[0];
        return { ...r, permisos: r.permisos ? JSON.parse(r.permisos) : null };
      }
    } catch (err) {
      console.error('Error en saveUser (Postgres):', err.message);
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
  const permsStr = JSON.stringify(u.permisos);
  if (usePostgres) {
    try {
      const res = await pool.query(
        'UPDATE Usuarios SET usuario = $1, nombre = $2, rol = $3, estado = $4, clave = $5, permisos = $6 WHERE id = $7 RETURNING *',
        [u.usuario, u.nombre, u.rol, u.estado, u.clave, permsStr, id]
      );
      if (res.rowCount > 0) {
        const r = res.rows[0];
        return { ...r, permisos: r.permisos ? JSON.parse(r.permisos) : null };
      }
    } catch (err) {
      console.error('Error en updateUser (Postgres):', err.message);
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
          permisos: r.permisos ? JSON.parse(r.permisos) : {}
        }));
      }
    } catch (err) {
      console.error('Error en getRoles (Postgres):', err.message);
    }
  }
  return readJsonFile('roles.json', defaultRoles);
}

export async function saveRole(r) {
  const permsStr = JSON.stringify(r.permisos);
  if (usePostgres) {
    try {
      const res = await pool.query(
        'INSERT INTO Roles (nombre, permisos) VALUES ($1, $2) RETURNING *',
        [r.nombre, permsStr]
      );
      if (res.rowCount > 0) {
        const row = res.rows[0];
        return { id: row.id, nombre: row.nombre, permisos: row.permisos ? JSON.parse(row.permisos) : {} };
      }
    } catch (err) {
      console.error('Error en saveRole (Postgres):', err.message);
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
  const permsStr = JSON.stringify(r.permisos);
  if (usePostgres) {
    try {
      const res = await pool.query(
        'UPDATE Roles SET nombre = $1, permisos = $2 WHERE id = $3 RETURNING *',
        [r.nombre, permsStr, id]
      );
      if (res.rowCount > 0) {
        const row = res.rows[0];
        return { id: row.id, nombre: row.nombre, permisos: row.permisos ? JSON.parse(row.permisos) : {} };
      }
    } catch (err) {
      console.error('Error en updateRole (Postgres):', err.message);
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
  if (usePostgres) {
    try {
      if (options.wipeInventory) {
        await pool.query('TRUNCATE TABLE Productos, Movimientos_Inventario, Historial_Precios RESTART IDENTITY CASCADE');
      }
      if (options.wipeSales) {
        await pool.query('TRUNCATE TABLE Ventas, Ventas_Detalle, Abonos RESTART IDENTITY CASCADE');
        // Reset Caja shifts
        await pool.query('TRUNCATE TABLE Cajas_Apertura_Cierre RESTART IDENTITY CASCADE');
      }
      if (options.wipeClients) {
        await pool.query("DELETE FROM Clientes WHERE cedula_rif <> 'V-00000000'");
        await pool.query("UPDATE Clientes SET limite_credito = 0, credito_disponible = 0, saldo_pendiente = 0");
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
  }
  if (options.wipeSales) {
    writeJsonFile('sales.json', []);
    writeJsonFile('abonos.json', []);
    writeJsonFile('cierres.json', []);
    // Close active shift
    fs.writeFileSync(path.join(DATA_DIR, 'caja_estado.json'), JSON.stringify({ abierta: false, id: null, monto_usd: 0, monto_ves: 0 }));
  }
  if (options.wipeClients) {
    const genericClient = mockClients.filter(c => c.cedula_rif === 'V-00000000');
    writeJsonFile('clients.json', genericClient);
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
        ORDER BY t.id ASC
      `);
      return res.rows.map(r => ({
        id: r.id,
        tasa_cobro: parseFloat(r.tasa_cobro),
        tasa_vuelto: parseFloat(r.tasa_vuelto),
        fecha_actualizacion: getLocalISODateString(new Date(r.fecha_actualizacion)),
        usuario: r.usuario || 'SISTEMA'
      }));
    } catch (err) {
      console.error('Error en getTasaHistory (Postgres):', err.message);
    }
  }
  return readJsonFile('tasa_history.json', mockTasaHistory);
}

export async function saveTasa(t) {
  if (usePostgres) {
    try {
      // Find database user ID or default to admin (id 1)
      const userRes = await pool.query('SELECT id FROM Usuarios LIMIT 1');
      const userId = userRes.rowCount > 0 ? userRes.rows[0].id : 1;
      
      const res = await pool.query(
        `INSERT INTO Tasas_Cambio (tasa_cobro, tasa_vuelto, usuario_id)
         VALUES ($1, $2, $3) RETURNING id, fecha_actualizacion`,
        [t.tasa_cobro, t.tasa_vuelto, userId]
      );
      return { 
        ...t, 
        id: res.rows[0].id,
        fecha_actualizacion: getLocalISODateString(new Date(res.rows[0].fecha_actualizacion))
      };
    } catch (err) {
      console.error('Error en saveTasa (Postgres):', err.message);
    }
  }
  const history = readJsonFile('tasa_history.json', mockTasaHistory);
  const newItem = { ...t, id: Date.now() };
  history.push(newItem);
  writeJsonFile('tasa_history.json', history);
  return newItem;
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
               c.cedula_rif as "clientDoc", c.nombre as "clientName", u.nombre as usuario
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
          usuario: row.usuario
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
      const userRes = await clientTarget.query('SELECT id FROM Usuarios LIMIT 1');
      const activeCaja = await clientTarget.query("SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' ORDER BY id DESC LIMIT 1");
      
      const clientId = clientRes.rowCount > 0 ? clientRes.rows[0].id : 1;
      const userId = userRes.rowCount > 0 ? userRes.rows[0].id : 1;
      const cajaId = activeCaja.rowCount > 0 ? activeCaja.rows[0].id : 1;
      
      // Insert Sale
      const saleRes = await clientTarget.query(
        `INSERT INTO Ventas (factura_nro, cliente_id, usuario_id, caja_id, subtotal_usd, descuento_usd, total_usd, total_ves)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, fecha`,
        [s.factura_nro, clientId, userId, cajaId, s.subtotal, s.descuento, s.totalUSD, s.totalVES]
      );
      
      const saleId = saleRes.rows[0].id;
      
      // Insert Items & adjust stock
      for (const item of s.items) {
        const prodRes = await clientTarget.query('SELECT id, stock_actual, precio_detalle_usd FROM Productos WHERE codigo_barras_clave = $1', [item.product.barcode]);
        if (prodRes.rowCount > 0) {
          const prodId = prodRes.rows[0].id;
          const currentStock = prodRes.rows[0].stock_actual;
          const newStock = Math.max(0, currentStock - item.qty);
          
          // Insert details
          await clientTarget.query(
            `INSERT INTO Ventas_Detalle (venta_id, producto_id, cantidad, precio_unitario_usd, tipo_precio, total_fila_usd)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              saleId, 
              prodId, 
              item.qty, 
              item.precio_unitario_usd || item.priceUSD || item.product.precio_detalle_usd, 
              item.tipo_precio || item.priceType || 'Detalle', 
              item.total_fila_usd || item.totalUSD || (item.qty * (item.priceUSD || item.product.precio_detalle_usd))
            ]
          );
          
          // Update Stock
          await clientTarget.query('UPDATE Productos SET stock_actual = $1 WHERE id = $2', [newStock, prodId]);
          
          // Log Kardex
          await clientTarget.query(
            `INSERT INTO Movimientos_Inventario (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_posterior, motivo)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [prodId, userId, 'Venta', -item.qty, currentStock, newStock, `Venta Facturada: ${s.factura_nro}`]
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
        fecha: getLocalISODateString(new Date(saleRes.rows[0].fecha))
      };
    } catch (err) {
      await clientTarget.query('ROLLBACK');
      console.error('Error al registrar venta en Postgres:', err.message);
    } finally {
      clientTarget.release();
    }
  }
  const sales = readJsonFile('sales.json', []);
  const newSale = {
    ...s,
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
               u.nombre as usuario, c.estatus
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
        return {
          id: r.id,
          fechaApertura: getLocalISODateString(new Date(r.fecha_apertura)),
          fechaCierre: r.fecha_cierre ? getLocalISODateString(new Date(r.fecha_cierre)) : null,
          aperturaUsd: parseFloat(r.monto_apertura_usd),
          aperturaVes: parseFloat(r.monto_apertura_ves),
          realUsd: r.monto_cierre_real_usd ? parseFloat(r.monto_cierre_real_usd) : 0,
          realVes: r.monto_cierre_real_ves ? parseFloat(r.monto_cierre_real_ves) : 0,
          expectedUsd: r.monto_cierre_esperado_usd ? parseFloat(r.monto_cierre_esperado_usd) : 0,
          expectedVes: r.monto_cierre_esperado_ves ? parseFloat(r.monto_cierre_esperado_ves) : 0,
          ventaTotalUsd: r.venta_total_usd ? parseFloat(r.venta_total_usd) : 0,
          utilidadUsd: r.utilidad_usd ? parseFloat(r.utilidad_usd) : 0,
          usuario: r.usuario,
          status: r.estatus === 'Abierta' ? 'Abierta' : 'Cerrada',
          ...parsedDetails
        };
      });
    } catch (err) {
      console.error('Error en getCierres (Postgres):', err.message);
    }
  }
  return readJsonFile('cierres.json', []);
}

export async function abrirCaja(usd, ves) {
  if (usePostgres) {
    try {
      const userRes = await pool.query('SELECT id FROM Usuarios LIMIT 1');
      const userId = userRes.rowCount > 0 ? userRes.rows[0].id : 1;
      
      const res = await pool.query(
        `INSERT INTO Cajas_Apertura_Cierre (usuario_id, estacion_nombre, monto_apertura_usd, monto_apertura_ves, estatus)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [userId, 'TERMINAL_01', usd, ves, 'Abierta']
      );
      return res.rows[0].id;
    } catch (err) {
      console.error('Error en abrirCaja (Postgres):', err.message);
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
      const activeCaja = await pool.query("SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' ORDER BY id DESC LIMIT 1");
      if (activeCaja.rowCount > 0) {
        const cajaId = activeCaja.rows[0].id;
        
        const ventaTotalUsd = cierre.ventaTotalUsd ?? 0;
        const utilidadUsd = cierre.utilidadUsd ?? 0;
        const detallesJson = JSON.stringify(cierre);

        await pool.query(
          `UPDATE Cajas_Apertura_Cierre SET 
            fecha_cierre = CURRENT_TIMESTAMP, 
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
            cierre.expectedUsd, 
            cierre.expectedVes, 
            cierre.realUsd, 
            cierre.realVes, 
            ventaTotalUsd, 
            utilidadUsd, 
            detallesJson, 
            cajaId
          ]
        );
        return true;
      }
    } catch (err) {
      console.error('Error en cerrarCaja (Postgres):', err.message);
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

export async function getCajaEstado() {
  if (usePostgres) {
    try {
      const activeRes = await pool.query("SELECT * FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' ORDER BY id DESC LIMIT 1");
      if (activeRes.rowCount === 0) {
        return { abierta: false };
      }
      const caja = activeRes.rows[0];
      const cajaId = caja.id;
      
      const salesRes = await pool.query(`
        SELECT v.id, v.factura_nro, v.fecha, v.subtotal_usd, v.descuento_usd, v.total_usd, v.total_ves, v.con_ticket,
               c.cedula_rif as "clientDoc", c.nombre as "clientName", u.nombre as usuario
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
          usuario: row.usuario
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
        aperturaUsd: parseFloat(caja.monto_apertura_usd),
        aperturaVes: parseFloat(caja.monto_apertura_ves),
        fechaApertura: getLocalISODateString(new Date(caja.fecha_apertura)),
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

export async function registrarCajaMovimiento(tipo, descripcion, usd, ves) {
  if (usePostgres) {
    try {
      const activeCaja = await pool.query("SELECT id FROM Cajas_Apertura_Cierre WHERE estatus = 'Abierta' ORDER BY id DESC LIMIT 1");
      if (activeCaja.rowCount > 0) {
        const cajaId = activeCaja.rows[0].id;
        await pool.query(
          `INSERT INTO Movimientos_Caja (caja_id, tipo, descripcion, monto_usd, monto_ves)
           VALUES ($1, $2, $3, $4, $5)`,
          [cajaId, tipo === 'Entrada' ? 'Entrada' : 'Salida', descripcion, usd, ves]
        );
        return true;
      }
    } catch (err) {
      console.error('Error en registrarCajaMovimiento (Postgres):', err.message);
    }
  }
  const activeCheck = readJsonFile('caja_activa.json', { abierta: false });
  if (activeCheck.abierta) {
    if (!activeCheck.movimientos) {
      activeCheck.movimientos = [];
    }
    activeCheck.movimientos.push({ tipo, descripcion, usd, ves });
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
