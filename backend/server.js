import './build_ico_now.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  getCompanyConfig, saveCompanyConfig, getUsers, getProducts, saveProduct,
  updateProductStock, updateProductPrices, updateProductPricesBulk, getClients, saveClient, registerAbono,
  getTasaHistory, saveTasa, clearTasaHistory, getMovements, saveMovement, getPriceHistory, savePriceHistory,
  getSales, saveSale, getCierres, abrirCaja, cerrarCaja, getCajaEstado, registrarCajaMovimiento, updateCierre, deleteCierre,
  updateClient, deleteClient, getAbonos, deleteProduct, updateProduct, saveProductsBulk, saveClientsBulk,
  saveUser, updateUser, deleteUser, getRoles, saveRole, updateRole, deleteRole, wipeDatabase, backupDatabase, restoreDatabase,
  readJsonFile, writeJsonFile,
  getMasterPass, saveMasterPass, verifyMasterPass, getAccionistas, saveAccionista, deleteAccionista, getInversiones, saveInversion, deleteInversion,
  getGastosOperativos, saveGastoOperativo, deleteGastoOperativo,
  getProveedores, saveProveedor, deleteProveedor,
  getCompras, saveCompra,
  getPagosProveedores, savePagoProveedor,
  getCotizacionesProveedores, saveCotizacionProveedor, deleteCotizacionProveedor
} from './db-store.js';

import { 
  initWhatsAppClient, getWhatsAppStatus, saveWhatsAppConfig, sendCierreReport,
  unlockWhatsAppSession, resetWhatsAppSession, logoutWhatsAppSession
} from './whatsapp-service.js';

import { verifyLicense, activateLicense, registerTerminalActivity } from './license-manager.js';

import path from 'path';
import fs from 'fs';
import net from 'net';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-generate installer/app_icon.ico if missing
const icoTargetPath = path.resolve(__dirname, '../installer/app_icon.ico');
if (!fs.existsSync(icoTargetPath)) {
  const srcPngPath = 'C:\\Users\\NM29402.SC1_MZ1_JBTES\\.gemini\\antigravity-ide\\brain\\2dee14b5-c638-4898-be82-4522901e1212\\winterpos_al_icon_1786021999064.png';
  if (fs.existsSync(srcPngPath)) {
    const pngBuffer = fs.readFileSync(srcPngPath);
    const header = Buffer.alloc(22);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header.writeUInt8(0, 6);
    header.writeUInt8(0, 7);
    header.writeUInt8(0, 8);
    header.writeUInt8(0, 9);
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(pngBuffer.length, 14);
    header.writeUInt32LE(22, 18);
    const icoBuffer = Buffer.concat([header, pngBuffer]);
    fs.writeFileSync(icoTargetPath, icoBuffer);
    console.log(`[Icon Build] ✅ Creado icono oficial app_icon.ico en ${icoTargetPath}`);
  }
}

dotenv.config();

// Global crash guards for asynchronous library errors (e.g. WhatsApp LocalAuth EBUSY)
process.on('uncaughtException', (err) => {
  console.warn('⚠️ [Server] Excepción no capturada controlada:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ [Server] Rechazo de promesa no capturado controlado:', reason?.message || reason);
});

const app = express();
const PORT = process.env.PORT || 5000;

// Global in-memory map tracking shift closure timestamps by user ID and username
const userShiftClosureEvents = new Map();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// -------------------------------------------------------------
// LICENSE MANAGEMENT ENDPOINTS & MIDDLEWARE
// -------------------------------------------------------------
app.get('/api/license/status', (req, res) => {
  const terminalName = req.headers['x-terminal-id'] || req.query.terminal || 'LOCAL';
  registerTerminalActivity(terminalName);
  const statusInfo = verifyLicense();
  res.json(statusInfo);
});

app.post('/api/license/activate', (req, res) => {
  const { licenseContent, licenseText } = req.body || {};
  const input = licenseContent || licenseText;
  const result = activateLicense(input);
  res.json(result);
});

// Enforce License Validation on all business APIs
app.use((req, res, next) => {
  if (
    req.path.startsWith('/api/license') ||
    req.path === '/api/status' ||
    req.path === '/api/health' ||
    !req.path.startsWith('/api/')
  ) {
    return next();
  }

  const terminalName = req.headers['x-terminal-id'] || req.query.terminal || 'LOCAL';
  const license = verifyLicense();
  if (!license.isValid) {
    return res.status(403).json({
      error: 'LICENSE_INVALID',
      licenseStatus: license.status,
      hwid: license.hwid,
      message: license.message,
      payload: license.payload
    });
  }

  next();
});

app.get('/api/make-ico', (req, res) => {
  const icoTargetPath = path.resolve(__dirname, '../installer/app_icon.ico');
  const srcPngPath = 'C:\\Users\\NM29402.SC1_MZ1_JBTES\\.gemini\\antigravity-ide\\brain\\2dee14b5-c638-4898-be82-4522901e1212\\winterpos_al_icon_1786021999064.png';
  const fallbackPng = path.resolve(__dirname, '../WinterPosAL/public/cashier.png');

  let pngBuffer = null;
  if (fs.existsSync(srcPngPath)) {
    pngBuffer = fs.readFileSync(srcPngPath);
  } else if (fs.existsSync(fallbackPng)) {
    pngBuffer = fs.readFileSync(fallbackPng);
  }

  if (pngBuffer) {
    const header = Buffer.alloc(22);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header.writeUInt8(0, 6);
    header.writeUInt8(0, 7);
    header.writeUInt8(0, 8);
    header.writeUInt8(0, 9);
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(pngBuffer.length, 14);
    header.writeUInt32LE(22, 18);
    const icoBuffer = Buffer.concat([header, pngBuffer]);
    fs.writeFileSync(icoTargetPath, icoBuffer);
    console.log(`[Icon Build] Generated ${icoTargetPath} (${icoBuffer.length} bytes)`);
    return res.json({ success: true, message: `Created ${icoTargetPath}`, size: icoBuffer.length });
  }
  return res.status(500).json({ error: 'Source PNG not found' });
});

// Serve static frontend build if dist directory exists with no-cache headers for instant updates
const distPath = path.resolve(__dirname, '../WinterPosAL/dist');
if (fs.existsSync(distPath)) {
  console.log(`Serving static frontend build from: ${distPath}`);
  app.use(express.static(distPath, {
    etag: false,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));
}

// Endpoints
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

app.get('/api/config', async (req, res) => {
  const config = await getCompanyConfig();
  res.json(config);
});

app.post('/api/config', async (req, res) => {
  const saved = await saveCompanyConfig(req.body);
  res.json(saved);
});

app.put('/api/config', async (req, res) => {
  const saved = await saveCompanyConfig(req.body);
  res.json(saved);
});

app.get('/api/users', async (req, res) => {
  const users = await getUsers();
  res.json(users);
});

app.get('/api/productos', async (req, res) => {
  const products = await getProducts();
  res.json(products);
});

app.post('/api/productos', async (req, res) => {
  const saved = await saveProduct(req.body);
  res.json(saved);
});

app.post('/api/productos/bulk', async (req, res) => {
  try {
    const products = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'El cuerpo de la solicitud debe ser un arreglo de productos.' });
    }
    const saved = await saveProductsBulk(products);
    res.json({ success: true, count: saved.length, products: saved });
  } catch (err) {
    console.error('Error en /api/productos/bulk:', err.message);
    res.status(500).json({ error: 'Error interno al cargar productos de forma masiva.' });
  }
});

app.post('/api/productos/stock', async (req, res) => {
  const { id, stock_actual } = req.body;
  const success = await updateProductStock(id, stock_actual);
  res.json({ success });
});

app.post('/api/productos/precios', async (req, res) => {
  const { id, cost, detail, mayor } = req.body;
  const success = await updateProductPrices(id, { cost, detail, mayor });
  res.json({ success });
});

app.post('/api/productos/precios/bulk', async (req, res) => {
  const { updates, historyLogs } = req.body;
  const success = await updateProductPricesBulk(updates);
  if (success && historyLogs && historyLogs.length > 0) {
    for (const log of historyLogs) {
      await savePriceHistory(log);
    }
  }
  res.json({ success });
});

app.get('/api/price-history', async (req, res) => {
  const history = await getPriceHistory();
  res.json(history);
});

app.post('/api/price-history', async (req, res) => {
  const saved = await savePriceHistory(req.body);
  res.json({ success: saved });
});

app.put('/api/productos/:id', async (req, res) => {
  try {
    const prodData = { ...req.body, id: req.params.id || req.body.id };
    const updated = await updateProduct(prodData);
    if (updated) {
      res.json(updated);
    } else {
      res.status(404).json({ error: 'Producto no encontrado' });
    }
  } catch (err) {
    console.error('Error en PUT /api/productos/:id:', err.message);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un producto con esa clave o código de barras.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clientes', async (req, res) => {
  const clients = await getClients();
  res.json(clients);
});

app.post('/api/clientes', async (req, res) => {
  const saved = await saveClient(req.body);
  res.json(saved);
});

app.post('/api/clientes/bulk', async (req, res) => {
  try {
    const { clients, mode } = req.body;
    if (!Array.isArray(clients)) {
      return res.status(400).json({ error: 'El cuerpo de la solicitud debe incluir un arreglo de clientes.' });
    }
    const saved = await saveClientsBulk(clients, mode || 'update');
    res.json({ success: true, count: saved.length, clients: saved });
  } catch (err) {
    console.error('Error en /api/clientes/bulk:', err.message);
    res.status(500).json({ error: 'Error interno al procesar la carga masiva de clientes.' });
  }
});

app.post('/api/clientes/abono', async (req, res) => {
  const { id, monto_usd, monto_ves, metodo_pago, referencia, observacion, usuario_id } = req.body;
  const success = await registerAbono(id, monto_usd || 0, monto_ves || 0, metodo_pago, referencia || '', observacion || '', usuario_id || null);
  res.json({ success });
});

app.get('/api/abonos', async (req, res) => {
  const abonos = await getAbonos();
  res.json(abonos);
});


app.put('/api/clientes/:id', async (req, res) => {
  try {
    const updated = await updateClient(req.params.id, req.body);
    if (updated) {
      res.json(updated);
    } else {
      res.status(404).json({ error: 'Cliente no encontrado' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clientes/:id', async (req, res) => {
  try {
    const success = await deleteClient(req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Cliente no encontrado o no pudo ser eliminado' });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/productos/:id', async (req, res) => {
  try {
    const success = await deleteProduct(req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Producto no encontrado o no pudo ser eliminado' });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/tasas', async (req, res) => {
  const history = await getTasaHistory();
  res.json(history);
});

app.post('/api/tasas', async (req, res) => {
  const saved = await saveTasa(req.body);
  res.json(saved);
});

app.delete('/api/tasas/clear', async (req, res) => {
  await clearTasaHistory();
  res.json({ success: true });
});

app.get('/api/movements', async (req, res) => {
  const movements = await getMovements();
  res.json(movements);
});

app.post('/api/movements', async (req, res) => {
  const saved = await saveMovement(req.body);
  res.json(saved);
});

app.get('/api/price-history', async (req, res) => {
  const history = await getPriceHistory();
  res.json(history);
});

app.post('/api/price-history', async (req, res) => {
  const saved = await savePriceHistory(req.body);
  res.json(saved);
});

app.get('/api/sales', async (req, res) => {
  const sales = await getSales();
  res.json(sales);
});

// Returns the last confirmed FAC- invoice number stored in the database
// Used by terminals to show the operator the last sale and estimate the next correlative
app.get('/api/sales/last-invoice', async (req, res) => {
  try {
    const sales = await getSales();
    const facSales = sales.filter(s => s.factura_nro?.startsWith('FAC-'));
    if (facSales.length > 0) {
      // Sales come ordered DESC from getSales (Postgres), so first is the latest
      const last = facSales[0].factura_nro;
      const num = parseInt(last.replace('FAC-', ''), 10);
      const next = `FAC-${String(num + 1).padStart(6, '0')}`;
      return res.json({ last, next });
    }
    return res.json({ last: null, next: 'FAC-000001' });
  } catch (err) {
    console.error('Error en /api/sales/last-invoice:', err.message);
    res.json({ last: null, next: 'FAC-000001' });
  }
});

// Unified sync/poll endpoint for multi-terminal real-time synchronization
// Returns: new sales (by ID), updated tasas, session closure detection, updated cierres list
// Fixes the timezone bug by comparing integer IDs instead of date strings
app.get('/api/sync/poll', async (req, res) => {
  try {
    const sinceId = parseInt(req.query.since_id) || 0;
    const terminal = req.query.terminal || null;
    const sessionSince = req.query.session_since || null;

    const usuario = req.query.usuario || null;
    const usuarioId = req.query.usuario_id || null;

    if (usuario && typeof activeSessions !== 'undefined') {
      if (typeof cleanExpiredSessions === 'function') cleanExpiredSessions();
      for (const [id, sess] of activeSessions.entries()) {
        if (sess.username && sess.username.toLowerCase() === String(usuario).toLowerCase()) {
          sess.lastHeartbeat = Date.now();
          if (terminal) sess.terminal = terminal;
          activeSessions.set(id, sess);
        }
      }
    }

    // Tasas sync parameters (immune to sequential vs timestamp ID mismatches)
    const clientTasaCobro = parseFloat(req.query.last_tasa_cobro) || 0;
    const clientTasaVuelto = parseFloat(req.query.last_tasa_vuelto) || 0;
    const clientTasasCount = parseInt(req.query.tasas_count) || 0;

    // Cierres sync parameters
    const clientCierreCount = parseInt(req.query.cierres_count) || 0;
    const clientLastCierreId = parseInt(req.query.last_cierre_id) || 0;
    const clientCierresSignature = parseFloat(req.query.cierres_signature) || 0;

    const result = {
      sales: [],
      tasas: null,        // null = no changes; array = full updated list
      cierres: null,      // null = no changes; array = full updated list
      clients: null,      // null = no changes; array = full updated list
      products: null,     // null = no changes; array = full updated list
      sessionClosed: false,
      serverTime: new Date().toISOString()
    };

    // 1. New sales with id > since_id (excluding this terminal's own sales)
    const allSales = await getSales();
    if (sinceId > 0) {
      result.sales = allSales.filter(s => {
        const hasHigherId = s.id && s.id > sinceId;
        const isOtherTerminal = terminal ? s.terminal !== terminal : true;
        return hasHigherId && isOtherTerminal;
      });
    }

    // 2. Tasa changes: compare by quantity and latest tasa values to avoid mixed ID bugs (sequential vs Date.now)
    const tasas = await getTasaHistory();
    const serverTasasCount = tasas.length;
    const latestTasa = tasas.length > 0 ? tasas[tasas.length - 1] : null;

    let tasasChanged = false;
    if (serverTasasCount !== clientTasasCount) {
      tasasChanged = true;
    } else if (latestTasa) {
      // Use epsilon-like comparison or standard != for float check
      if (Math.abs(latestTasa.tasa_cobro - clientTasaCobro) > 0.0001 || 
          Math.abs(latestTasa.tasa_vuelto - clientTasaVuelto) > 0.0001) {
        tasasChanged = true;
      }
    }

    if (tasasChanged) {
      result.tasas = tasas;
    }

    // 3. Cierres sync: if count, last ID, or signature (realUsd + realVes sum) differs, send full list
    const cierres = await getCierres();
    const maxCierreId = cierres.length > 0 ? Math.max(...cierres.map(c => c.id || 0)) : 0;
    const serverCierresSignature = cierres.reduce((acc, c) => acc + (c.realUsd || 0) + (c.realVes || 0), 0);

    // Round signature to 2 decimal places to avoid floating point precision mismatches
    const roundedServerSig = Math.round(serverCierresSignature * 100) / 100;
    const roundedClientSig = Math.round(clientCierresSignature * 100) / 100;

    if (cierres.length !== clientCierreCount || maxCierreId !== clientLastCierreId || roundedServerSig !== roundedClientSig) {
      result.cierres = cierres;
    }

    // 4. Session closure detection: check if this user closed their register
    // Exemption: Users with role 'Administrador' are exempt and never forced out by shift closure.
    if ((usuario || usuarioId) && sessionSince) {
      const allUsers = await getUsers();
      const userObj = allUsers.find(u => 
        (usuarioId && String(u.id) === String(usuarioId)) ||
        (u.usuario && u.usuario.toLowerCase().trim() === String(usuario).toLowerCase().trim()) ||
        (u.nombre && u.nombre.toLowerCase().trim() === String(usuario).toLowerCase().trim())
      );

      const isAdmin = userObj && userObj.rol && userObj.rol.toLowerCase() === 'administrador';

      if (!isAdmin) {
        function parseLocalDateToTimestamp(dateStr) {
          if (!dateStr) return 0;
          if (typeof dateStr === 'number') return dateStr;
          const str = String(dateStr).trim();
          if (!str) return 0;
          if (/^\d{10,13}$/.test(str)) return parseInt(str);

          const matchIso = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
          if (matchIso) {
            return new Date(parseInt(matchIso[1]), parseInt(matchIso[2]) - 1, parseInt(matchIso[3]), parseInt(matchIso[4]), parseInt(matchIso[5]), parseInt(matchIso[6] || '0')).getTime();
          }

          const matchEs = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
          if (matchEs) {
            return new Date(parseInt(matchEs[3]), parseInt(matchEs[2]) - 1, parseInt(matchEs[1]), parseInt(matchEs[4]), parseInt(matchEs[5]), parseInt(matchEs[6] || '0')).getTime();
          }

          const parsed = new Date(str).getTime();
          return isNaN(parsed) ? 0 : parsed;
        }

        let sessionTimeMs = parseInt(sessionSince) || 0;
        if (sessionTimeMs <= 0) {
          sessionTimeMs = parseLocalDateToTimestamp(sessionSince);
        }

        let isClosed = false;

        // Fast path 1: Instant check against in-memory shift closure events map
        if (userObj) {
          const closureTimeById = userShiftClosureEvents.get(`id_${userObj.id}`);
          const closureTimeByName = userShiftClosureEvents.get(`name_${userObj.usuario?.toLowerCase().trim()}`);
          const closureTimeByNombre = userShiftClosureEvents.get(`name_${userObj.nombre?.toLowerCase().trim()}`);

          if (closureTimeById && sessionTimeMs < closureTimeById) {
            isClosed = true;
          } else if (closureTimeByName && sessionTimeMs < closureTimeByName) {
            isClosed = true;
          } else if (closureTimeByNombre && sessionTimeMs < closureTimeByNombre) {
            isClosed = true;
          }
        }

        // Fast path 2: Fallback check against database cierres
        if (!isClosed) {
          isClosed = cierres.some(c => {
            if (!c.usuario) return false;
            if (c.status === 'Abierta') return false;

            const cUser = String(c.usuario).toLowerCase().trim();
            const reqUser = String(usuario).toLowerCase().trim();
            const isSameUser = 
              (userObj && c.usuarioId && String(c.usuarioId) === String(userObj.id)) ||
              cUser === reqUser || 
              (userObj && userObj.nombre && cUser === userObj.nombre.toLowerCase().trim()) ||
              (userObj && userObj.usuario && cUser === userObj.usuario.toLowerCase().trim());

            if (!isSameUser) return false;

            let closureTime = 0;
            if (typeof c.timestamp === 'number' && c.timestamp > 1000000000000) {
              closureTime = c.timestamp;
            }
            if (!closureTime && c.fechaCierre) {
              closureTime = parseLocalDateToTimestamp(c.fechaCierre);
            }
            if (!closureTime && c.fecha) {
              closureTime = parseLocalDateToTimestamp(c.fecha);
            }

            return closureTime > 0 && sessionTimeMs > 0 && sessionTimeMs < (closureTime - 5000);
          });
        }

        result.sessionClosed = isClosed;
        if (isClosed) {
          console.log(`[Sync] 🔒 Evicción de sesión activa enviada para usuario ${usuario} (ID: ${usuarioId}).`);
        }
      } else {
        result.sessionClosed = false;
      }
    }

    // 5. Company config sync: check if client's company name/RIF differs
    const companyConfig = await getCompanyConfig();
    const clientConfigName = req.query.config_name || '';
    const clientConfigRif = req.query.config_rif || '';
    if (companyConfig && (companyConfig.nombre_comercio !== clientConfigName || companyConfig.rif !== clientConfigRif)) {
      result.config = companyConfig;
    }

    // 6. Clients sync: check count & signature
    const clientClientsCount = parseInt(req.query.clients_count) || 0;
    const clientClientsSig = parseFloat(req.query.clients_sig) || 0;
    const clients = await getClients();
    const serverClientsSig = clients.reduce((acc, c) => acc + (c.id || 0) + (c.limite_credito || 0) + (c.saldo_pendiente || 0), 0);
    const roundedServerClientsSig = Math.round(serverClientsSig * 100) / 100;
    const roundedClientClientsSig = Math.round(clientClientsSig * 100) / 100;

    if (clients.length !== clientClientsCount || roundedServerClientsSig !== roundedClientClientsSig) {
      result.clients = clients;
    }

    // 7. Products sync: check count & signature
    const clientProductsCount = parseInt(req.query.products_count) || 0;
    const clientProductsSig = parseFloat(req.query.products_sig) || 0;
    const products = await getProducts();
    const serverProductsSig = products.reduce((acc, p) => acc + (p.id || 0) + (p.stock_actual || 0) + (p.precio_detalle_usd || 0), 0);
    const roundedServerProductsSig = Math.round(serverProductsSig * 100) / 100;
    const roundedClientProductsSig = Math.round(clientProductsSig * 100) / 100;

    if (products.length !== clientProductsCount || roundedServerProductsSig !== roundedClientProductsSig) {
      result.products = products;
    }

    // 8. Abonos sync: check count & signature
    const clientAbonosCount = parseInt(req.query.abonos_count) || 0;
    const clientAbonosSig = parseFloat(req.query.abonos_sig) || 0;
    const abonosList = await getAbonos();
    const serverAbonosSig = abonosList.reduce((acc, a) => acc + (a.id || 0) + (a.monto || 0) + (a.monto_ves || 0), 0);
    const roundedServerAbonosSig = Math.round(serverAbonosSig * 100) / 100;
    const roundedClientAbonosSig = Math.round(clientAbonosSig * 100) / 100;

    if (abonosList.length !== clientAbonosCount || roundedServerAbonosSig !== roundedClientAbonosSig) {
      result.abonos = abonosList;
    }

    res.json(result);
  } catch (err) {
    console.error('Error en /api/sync/poll:', err.message);
    res.json({ sales: [], tasas: null, cierres: null, abonos: null, sessionClosed: false, serverTime: new Date().toISOString() });
  }
});


import https from 'https';

// Cache for BCV rates
let bcvCache = {
  success: true,
  usd: '36.5432',
  eur: '39.7821',
  fechaValor: 'Pendiente de actualización'
};

async function fetchBcvRates() {
  return new Promise((resolve) => {
    const agent = new https.Agent({
      rejectUnauthorized: false
    });
    
    const req = https.get('https://www.bcv.org.ve/', { agent, timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          // Parse USD and EUR from BCV home page elements
          const dolarRegex = /id="dolar"[^]*?<strong[^>]*?>\s*([\d,.]+)\s*<\/strong>/i;
          const euroRegex = /id="euro"[^]*?<strong[^>]*?>\s*([\d,.]+)\s*<\/strong>/i;
          const fechaRegex = /class="date-display-single"[^]*?>\s*([^<]+?)\s*<\/span>/i;

          const dolarMatch = data.match(dolarRegex);
          const euroMatch = data.match(euroRegex);
          const fechaMatch = data.match(fechaRegex);

          if (dolarMatch && euroMatch) {
            const usd = dolarMatch[1].replace(',', '.').trim();
            const eur = euroMatch[1].replace(',', '.').trim();
            
            let fechaValor = 'Desconocida';
            if (fechaMatch) {
              fechaValor = fechaMatch[1].trim();
            } else {
              const secondaryFechaRegex = /Fecha Valor:[^]*?<strong>\s*([^<]+?)\s*<\/strong>/i;
              const secondaryMatch = data.match(secondaryFechaRegex);
              if (secondaryMatch) {
                fechaValor = secondaryMatch[1].trim();
              }
            }

            bcvCache = {
              success: true,
              usd,
              eur,
              fechaValor
            };
          }
        } catch (parseErr) {
          console.error('Error al parsear HTML del BCV:', parseErr.message);
        }
        resolve(bcvCache);
      });
    });

    req.on('error', (err) => {
      console.error('Error al consultar tasas del BCV (sin internet o caída de servidor):', err.message);
      resolve(bcvCache);
    });

    req.on('timeout', () => {
      req.destroy();
      console.warn('Timeout al consultar tasas del BCV (límite de 4s excedido).');
      resolve(bcvCache);
    });
  });
}

// Background query on startup
fetchBcvRates().catch(() => {});

app.get('/api/bcv', async (req, res) => {
  const rates = await fetchBcvRates();
  res.json(rates);
});

app.post('/api/sales', async (req, res) => {
  try {
    const saved = await saveSale(req.body);
    if (!saved) {
      // saveSale throws on Postgres error, but guard against null return from JSON fallback
      return res.status(500).json({ error: 'Error interno al registrar la venta. Intente de nuevo.' });
    }
    res.json(saved);
  } catch (err) {
    console.error('❌ Error crítico al registrar venta:', err.message);
    res.status(500).json({ error: err.message || 'Error interno al registrar la venta.' });
  }
});

app.get('/api/cajas/estado', async (req, res) => {
  const terminal = req.query.terminal || req.query.estacion_nombre;
  const usuarioId = req.query.usuarioId || req.query.usuario_id;
  const usuarioNombre = req.query.usuarioNombre || req.query.usuario;
  const state = await getCajaEstado(terminal, usuarioId, usuarioNombre);
  res.json(state);
});

app.post('/api/cajas/abrir', async (req, res) => {
  const { usd, ves, usuarioId, usuarioNombre, terminal } = req.body;
  const id = await abrirCaja(usd, ves, usuarioId, terminal, usuarioNombre);
  res.json({ success: true, id });
});

app.post('/api/cajas/cerrar', async (req, res) => {
  const cierreData = req.body;
  const success = await cerrarCaja(cierreData);
  if (success && cierreData) {
    const closureTime = Date.now();
    if (cierreData.usuarioId) {
      userShiftClosureEvents.set(`id_${cierreData.usuarioId}`, closureTime);
      activeSessions.delete(cierreData.usuarioId);
      activeSessions.delete(String(cierreData.usuarioId));
      activeSessions.delete(parseInt(cierreData.usuarioId));
    }
    if (cierreData.usuario) {
      const uName = String(cierreData.usuario).toLowerCase().trim();
      userShiftClosureEvents.set(`name_${uName}`, closureTime);
      for (const [sId, sess] of activeSessions.entries()) {
        if (sess.username && sess.username.toLowerCase().trim() === uName) {
          activeSessions.delete(sId);
        }
      }
    }
    console.log(`[Shift Closure] 🔒 Cierre registrado para usuario ${cierreData.usuario} (ID: ${cierreData.usuarioId}). Evicción de sesiones activas completada.`);
  }
  res.json({ success });
});

app.post('/api/cajas/movimiento', async (req, res) => {
  const { tipo, descripcion, usd, ves, terminal, usuarioId, usuarioNombre, metodo_pago, metodoPago, comision_ves, comisionVes, comision_usd, comisionUsd } = req.body;
  const payMethod = metodo_pago || metodoPago || 'EFECTIVO';
  const cVes = comision_ves || comisionVes || 0;
  const cUsd = comision_usd || comisionUsd || 0;
  const success = await registrarCajaMovimiento(tipo, descripcion, usd, ves, terminal, usuarioId, usuarioNombre, payMethod, cVes, cUsd);
  res.json({ success });
});

app.get('/api/cajas/cierres', async (req, res) => {
  const cierres = await getCierres();
  res.json(cierres);
});

app.delete('/api/cajas/cierres/:id', async (req, res) => {
  try {
    const success = await deleteCierre(req.params.id);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cajas/cierres/:id', async (req, res) => {
  try {
    const updated = await updateCierre(req.params.id, req.body);
    if (updated) {
      res.json(updated);
    } else {
      res.status(404).json({ error: 'Cierre de caja no encontrado' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// USER CRUD ENDPOINTS
app.get('/api/users', async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Active Network Sessions Store (Map: userId -> sessionObj)
const activeSessions = new Map();
const forcedLogoutUsers = new Map();

// Helper to clean up expired sessions (older than 5 minutes of total heartbeat silence)
const cleanExpiredSessions = () => {
  const now = Date.now();
  for (const [key, session] of activeSessions.entries()) {
    if (now - session.lastHeartbeat > 300000) {
      activeSessions.delete(key);
    }
  }
};

// Check & register login endpoint
app.post('/api/users/login-check', async (req, res) => {
  try {
    const { username, password, terminal } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Usuario y contraseña requeridos.' });
    }

    cleanExpiredSessions();

    const users = await getUsers();
    const user = users.find(
      u => u.usuario.toLowerCase() === username.trim().toLowerCase() && password === (u.clave || 'admin')
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos. Verifique sus credenciales.' });
    }

    if (user.estado === 'Inactivo') {
      return res.status(403).json({ success: false, message: 'Su usuario se encuentra inactivo. Consulte al Administrador.' });
    }

    const isAdmin = user.rol && user.rol.toLowerCase() === 'administrador';
    const activeTerm = terminal || 'LOCAL';

    // Check company configuration for multi-session policy
    const companyConfig = await getCompanyConfig();
    const permitirMultisesion = companyConfig.permitir_multisesion !== false;

    // If multi-session is disabled by company policy and user is NOT admin, block login on 2nd terminal
    if (!permitirMultisesion && !isAdmin) {
      for (const [key, existing] of activeSessions.entries()) {
        const isSameUser = String(existing.userId) === String(user.id) || (existing.username && existing.username.toLowerCase() === user.usuario.toLowerCase());
        const isDifferentTerminal = existing.terminal && existing.terminal !== activeTerm;
        const isHeartbeatFresh = (Date.now() - existing.lastHeartbeat) < 45000;

        if (isSameUser && isDifferentTerminal && isHeartbeatFresh) {
          return res.status(403).json({
            success: false,
            isBlocked: true,
            message: 'Usuario conectado actualmente en otro equipo (Multisesión deshabilitada en Configuración).'
          });
        }
      }
    }

    // Clear previous shift closure eviction & forced logout events for this user so new session can run cleanly
    if (user.id) {
      userShiftClosureEvents.delete(`id_${user.id}`);
      forcedLogoutUsers.delete(String(user.id));
    }
    if (user.usuario) {
      userShiftClosureEvents.delete(`name_${user.usuario.toLowerCase().trim()}`);
      forcedLogoutUsers.delete(String(user.usuario).toLowerCase().trim());
    }
    if (user.nombre) {
      userShiftClosureEvents.delete(`name_${user.nombre.toLowerCase().trim()}`);
    }

    // Register or update active session (keyed by userId and terminal to allow multi-device logins)
    const sessionKey = `${user.id}_${activeTerm}`;
    activeSessions.set(sessionKey, {
      userId: user.id,
      username: user.usuario,
      nombre: user.nombre || user.usuario,
      rol: user.rol,
      terminal: activeTerm,
      loginTime: new Date().toISOString(),
      lastHeartbeat: Date.now()
    });

    res.json({ success: true, user });
  } catch (err) {
    console.error('Error en /api/users/login-check:', err.message);
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
});

// Logout endpoint
app.post('/api/users/logout', (req, res) => {
  const { userId, username, terminal } = req.body;
  cleanExpiredSessions();
  for (const [key, sess] of activeSessions.entries()) {
    const matchUser = (userId && String(sess.userId) === String(userId)) || (username && sess.username.toLowerCase() === String(username).toLowerCase());
    const matchTerminal = !terminal || sess.terminal === terminal;
    if (matchUser && matchTerminal) {
      activeSessions.delete(key);
    }
  }
  res.json({ success: true });
});

// Heartbeat endpoint
app.post('/api/users/heartbeat', async (req, res) => {
  const { userId, username, terminal } = req.body;
  cleanExpiredSessions();

  let userObj = null;
  if (userId || username) {
    const idKey = userId ? String(userId) : '';
    const nameKey = username ? String(username).toLowerCase().trim() : '';

    // Check if admin performed a forced logout (kill session) on this user
    if ((idKey && forcedLogoutUsers.has(idKey)) || (nameKey && forcedLogoutUsers.has(nameKey))) {
      if (idKey) forcedLogoutUsers.delete(idKey);
      if (nameKey) forcedLogoutUsers.delete(nameKey);
      for (const [key, sess] of activeSessions.entries()) {
        if ((idKey && String(sess.userId) === idKey) || (nameKey && sess.username.toLowerCase() === nameKey)) {
          activeSessions.delete(key);
        }
      }
      return res.json({
        success: false,
        sessionClosed: true,
        message: '⚠️ Su sesión ha sido cerrada remotamente por un Administrador.'
      });
    }

    try {
      const allUsers = await getUsers();
      userObj = allUsers.find(u => 
        (userId && String(u.id) === String(userId)) ||
        (username && u.usuario && u.usuario.toLowerCase().trim() === String(username).toLowerCase().trim())
      );

      const isAdmin = userObj && userObj.rol && userObj.rol.toLowerCase() === 'administrador';
      if (!isAdmin) {
        const cById = userId ? userShiftClosureEvents.get(`id_${userId}`) : null;
        const cByName = username ? userShiftClosureEvents.get(`name_${String(username).toLowerCase().trim()}`) : null;
        if (cById || cByName) {
          return res.json({ success: false, sessionClosed: true, message: 'Shift closed' });
        }
      }
    } catch (_) {}
  }

  let found = false;
  for (const [key, sess] of activeSessions.entries()) {
    const matchUser = (userId && String(sess.userId) === String(userId)) || (username && sess.username.toLowerCase() === String(username).toLowerCase());
    const matchTerminal = !terminal || sess.terminal === terminal;
    if (matchUser && matchTerminal) {
      sess.lastHeartbeat = Date.now();
      if (terminal) sess.terminal = terminal;
      activeSessions.set(key, sess);
      found = true;
    }
  }

  // Si la sesión no estaba en memoria (por reinicio del servidor backend o reconexión), la restaura dinámicamente
  if (!found && (userObj || userId || username)) {
    const activeTerm = terminal || 'LOCAL';
    const finalUserId = userObj ? userObj.id : (userId || '1');
    const finalUsername = userObj ? userObj.usuario : (username || 'usuario');
    const finalNombre = userObj ? (userObj.nombre || userObj.usuario) : finalUsername;
    const finalRol = userObj ? userObj.rol : 'Usuario';
    const sessionKey = `${finalUserId}_${activeTerm}`;

    activeSessions.set(sessionKey, {
      userId: finalUserId,
      username: finalUsername,
      nombre: finalNombre,
      rol: finalRol,
      terminal: activeTerm,
      loginTime: new Date().toISOString(),
      lastHeartbeat: Date.now()
    });
  }

  res.json({ success: true });
});

// Get active sessions list (for Admin)
app.get('/api/users/active-sessions', (req, res) => {
  cleanExpiredSessions();
  res.json(Array.from(activeSessions.values()));
});

// Force disconnect user session (release network lock - Admin action)
app.delete('/api/users/active-sessions/:target', (req, res) => {
  const target = req.params.target;
  cleanExpiredSessions();
  for (const [key, sess] of activeSessions.entries()) {
    if (String(key) === String(target) || String(sess.userId) === String(target) || sess.username.toLowerCase() === String(target).toLowerCase() || sess.terminal === target) {
      activeSessions.delete(key);
    }
  }
  res.json({ success: true });
});

// Force logout user (kill session remotely - Admin action)
app.post('/api/users/force-logout/:target', (req, res) => {
  const target = String(req.params.target).toLowerCase().trim();
  cleanExpiredSessions();
  
  for (const [key, sess] of activeSessions.entries()) {
    const matchId = String(sess.userId).toLowerCase() === target;
    const matchName = String(sess.username).toLowerCase() === target;
    const matchKey = String(key).toLowerCase() === target;
    const matchTerm = String(sess.terminal).toLowerCase() === target;

    if (matchId || matchName || matchKey || matchTerm) {
      activeSessions.delete(key);
      if (sess.userId) forcedLogoutUsers.set(String(sess.userId), Date.now());
      if (sess.username) forcedLogoutUsers.set(String(sess.username).toLowerCase().trim(), Date.now());
    }
  }
  // Register target identifier in forcedLogoutUsers map
  forcedLogoutUsers.set(target, Date.now());

  res.json({ success: true });
});

app.post('/api/users', async (req, res) => {
  try {
    const saved = await saveUser(req.body);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const updated = await updateUser(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const success = await deleteUser(req.params.id);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ROLE CRUD ENDPOINTS
app.get('/api/roles', async (req, res) => {
  try {
    const roles = await getRoles();
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/roles', async (req, res) => {
  try {
    const saved = await saveRole(req.body);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/roles/:id', async (req, res) => {
  try {
    const updated = await updateRole(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/roles/:id', async (req, res) => {
  try {
    const success = await deleteRole(req.params.id);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registra operaciones de cambio de divisas y venta de efectivo con comisiones
app.post('/api/cajas/divisas-operaciones', async (req, res) => {
  try {
    const op = req.body;
    console.log(`[Divisas/Efectivo] Registrando operación ${op?.tipo_operacion}:`, op);
    const file = path.join(__dirname, 'data', 'divisas_operaciones.json');
    let list = [];
    if (fs.existsSync(file)) {
      try {
        list = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        list = [];
      }
    }
    const newOp = {
      id: Date.now(),
      timestamp: Date.now(),
      ...op
    };
    list.push(newOp);
    fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
    res.json({ success: true, operation: newOp });
  } catch (err) {
    console.error('Error registrando divisas-operaciones:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cajas/divisas-operaciones', async (req, res) => {
  try {
    const file = path.join(__dirname, 'data', 'divisas_operaciones.json');
    let list = [];
    if (fs.existsSync(file)) {
      try {
        list = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        list = [];
      }
    }
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DATABASE ADMINISTRATION ENDPOINTS
app.post('/api/db/wipe', async (req, res) => {
  try {
    const success = await wipeDatabase(req.body);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/db/backup', async (req, res) => {
  try {
    const backup = await backupDatabase();
    // Return file attachment or JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=winterpos_backup_${Date.now()}.json`);
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/restore', async (req, res) => {
  try {
    const success = await restoreDatabase(req.body);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/db/backup/schedule', async (req, res) => {
  try {
    const defaultDir = path.resolve('./data/backups');
    const sched = readJsonFile('backup_schedule.json', { 
      schedule: 'Diario', 
      hour: '02:00',
      backupDir: defaultDir, 
      lastBackup: '' 
    });
    if (!sched.backupDir) sched.backupDir = defaultDir;
    res.json({ ...sched, defaultBackupDir: defaultDir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/backup/schedule', async (req, res) => {
  try {
    const { schedule, hour, specificDate, backupDir } = req.body;
    const defaultDir = path.resolve('./data/backups');
    const sched = readJsonFile('backup_schedule.json', { schedule: 'Diario', lastBackup: '' });
    
    if (schedule !== undefined) sched.schedule = schedule;
    if (hour !== undefined) sched.hour = hour;
    if (specificDate !== undefined) sched.specificDate = specificDate;
    if (backupDir !== undefined) sched.backupDir = backupDir.trim() || defaultDir;
    
    const targetDir = sched.backupDir || defaultDir;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    writeJsonFile('backup_schedule.json', sched);
    res.json({ success: true, config: sched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AUTOMATIC BACKGROUND BACKUP SCHEDULER
const BACKUPS_DIR = path.resolve('./data/backups');
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

async function runBackupTask() {
  try {
    const defaultDir = path.resolve('./data/backups');
    const sched = readJsonFile('backup_schedule.json', { schedule: 'Diario', lastBackup: '' });
    if (sched.schedule === 'Desactivado') return;

    const now = new Date();
    let shouldBackup = false;

    if (!sched.lastBackup) {
      shouldBackup = true;
    } else {
      const last = new Date(sched.lastBackup);
      const diffMs = now.getTime() - last.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (sched.schedule === 'Diario' && diffHours >= 23.5) {
        shouldBackup = true;
      } else if (sched.schedule === 'Semanal' && diffHours >= 24 * 7 - 0.5) {
        shouldBackup = true;
      } else if (sched.schedule === 'Mensual' && diffHours >= 24 * 30 - 0.5) {
        shouldBackup = true;
      }
    }

    if (shouldBackup) {
      const saveDir = sched.backupDir || defaultDir;
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }
      console.log(`⏱️ [Backups] Iniciando copia de seguridad automática programada (${sched.schedule}) en "${saveDir}"...`);
      const backupData = await backupDatabase();
      const fileName = `backup_auto_${now.toISOString().split('T')[0]}_${now.getTime()}.json`;
      fs.writeFileSync(path.join(saveDir, fileName), JSON.stringify(backupData, null, 2), 'utf8');
      
      sched.lastBackup = now.toISOString();
      writeJsonFile('backup_schedule.json', sched);
      console.log(`✅ [Backups] Backup automático guardado correctamente: ${path.join(saveDir, fileName)}`);
    }
  } catch (err) {
    console.error('⚠️ [Backups] Error en backup automático:', err.message);
  }
}

// Check every 1 hour
setInterval(runBackupTask, 3600000);
// Check once at startup after 5 seconds
setTimeout(runBackupTask, 5000);

// WHATSAPP INTEGRATION ENDPOINTS
app.get('/api/whatsapp/status', (req, res) => {
  try {
    const status = getWhatsAppStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/install-chromium', async (req, res) => {
  console.log('[WhatsApp] Petición recibida para instalar/reparar Chromium para Puppeteer...');
  try {
    const { exec } = await import('child_process');
    exec('npx puppeteer install', async (error, stdout, stderr) => {
      // Intenta reinicializar el cliente incluso si npx falla (por estar offline pero tener Chrome instalado)
      try {
        await initWhatsAppClient();
        const currentStatus = getWhatsAppStatus();

        if (currentStatus.isMock) {
          console.warn('[WhatsApp] La instalación o reconexión no logró iniciar un navegador Chrome real.');
          const detailMsg = currentStatus.lastError || (error ? error.message : stderr) || 'Error desconocido';
          return res.status(400).json({
            success: false,
            error: currentStatus.detectedChromePath 
              ? `Chrome detectado en (${currentStatus.detectedChromePath}), pero falló al iniciar: ${detailMsg}`
              : 'No se encontró Google Chrome en la ruta predeterminada (C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe).',
            details: detailMsg,
            detectedPath: currentStatus.detectedChromePath
          });
        }

        res.json({
          success: true,
          message: 'Google Chrome / Puppeteer configurado y listo. Conexión de WhatsApp inicializada.',
          output: stdout
        });
      } catch (initErr) {
        res.status(500).json({ success: false, error: `Error al reiniciar WhatsApp: ${initErr.message}` });
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/config', (req, res) => {
  try {
    const saved = saveWhatsAppConfig(req.body);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/unlock-session', async (req, res) => {
  try {
    const result = await unlockWhatsAppSession();
    res.json(result);
  } catch (err) {
    console.error('Error al desbloquear sesión de WhatsApp:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/reset-session', async (req, res) => {
  try {
    const result = await resetWhatsAppSession();
    res.json(result);
  } catch (err) {
    console.error('Error al resetear sesión de WhatsApp:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/logout', async (req, res) => {
  try {
    const result = await logoutWhatsAppSession();
    res.json(result);
  } catch (err) {
    console.error('Error al cerrar sesión de WhatsApp:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/restart', async (req, res) => {
  try {
    const result = await unlockWhatsAppSession();
    res.json(result);
  } catch (err) {
    console.error('Error al reiniciar WhatsApp:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post(['/api/whatsapp/send-cierre', '/api/whatsapp/send-report'], async (req, res) => {
  try {
    const { imageBase64, textSummary } = req.body;
    if (!imageBase64 && !textSummary) {
      return res.status(400).json({ error: 'Se requiere una imagen o un mensaje de texto para enviar por WhatsApp.' });
    }
    const result = await sendCierreReport(imageBase64 || '', textSummary || 'Reporte de Sistema');
    res.json(result);
  } catch (err) {
    console.error('Error en /api/whatsapp/send-report:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// MASTER PASS & INVERSIONES DE ACCIONISTAS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/config/master-pass', async (req, res) => {
  try {
    const masterPass = await getMasterPass();
    res.json({ configured: true, masterPass });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/master-pass', async (req, res) => {
  try {
    const { currentPass, newPass } = req.body;
    const isValid = await verifyMasterPass(currentPass);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'La clave Master Pass actual es incorrecta.' });
    }
    if (!newPass || newPass.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'La nueva clave Master Pass no puede estar vacía.' });
    }
    await saveMasterPass(newPass.trim());
    res.json({ success: true, message: 'Clave Master Pass actualizada exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/verify-master-pass', async (req, res) => {
  try {
    const { masterPass } = req.body;
    const isValid = await verifyMasterPass(masterPass);
    if (isValid) {
      res.json({ success: true, message: 'Clave Master Pass autorizada.' });
    } else {
      res.status(401).json({ success: false, message: 'Clave Master Pass incorrecta.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ACCIONISTAS REST API
app.get('/api/inversiones/accionistas', async (req, res) => {
  try {
    const accionistas = await getAccionistas();
    res.json(accionistas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inversiones/accionistas', async (req, res) => {
  try {
    const data = req.body;
    if (!data.nombre || !data.nombre.trim()) {
      return res.status(400).json({ error: 'El nombre del accionista es requerido.' });
    }
    const saved = await saveAccionista(data);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inversiones/accionistas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteAccionista(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// INVERSIONES REST API
app.get('/api/inversiones', async (req, res) => {
  try {
    const inversiones = await getInversiones();
    res.json(inversiones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inversiones', async (req, res) => {
  try {
    const data = req.body;
    if (!data.accionista_id || !data.fecha || data.monto_usd === undefined) {
      return res.status(400).json({ error: 'Accionista, fecha y monto son requeridos.' });
    }
    const saved = await saveInversion(data);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inversiones/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteInversion(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GASTOS OPERATIVOS REST API
app.get('/api/gastos', async (req, res) => {
  try {
    const gastos = await getGastosOperativos();
    res.json(gastos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gastos', async (req, res) => {
  try {
    const data = req.body;
    if (!data.concepto || data.monto_usd === undefined) {
      return res.status(400).json({ error: 'Concepto y monto son requeridos.' });
    }
    const saved = await saveGastoOperativo(data);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/gastos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteGastoOperativo(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// PROVEEDORES & COMPRAS & CXP REST API ENDPOINTS
// -------------------------------------------------------------
app.get('/api/proveedores', async (req, res) => {
  try {
    const proveedores = await getProveedores();
    res.json(proveedores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/proveedores', async (req, res) => {
  try {
    const data = req.body;
    if (!data.rif || !data.razon_social) {
      return res.status(400).json({ error: 'RIF y Razón Social son requeridos para registrar el proveedor.' });
    }
    const saved = await saveProveedor(data);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/proveedores/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body, id };
    const saved = await saveProveedor(data);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/proveedores/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteProveedor(id);
    res.json({ success: true, message: 'Proveedor eliminado exitosamente.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// COMPRAS REST API
app.get('/api/compras', async (req, res) => {
  try {
    const compras = await getCompras();
    res.json(compras);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/compras', async (req, res) => {
  try {
    const data = req.body;
    if (!data.proveedor_id || !data.numero_factura) {
      return res.status(400).json({ error: 'Proveedor y Número de Factura son requeridos.' });
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      return res.status(400).json({ error: 'Debe ingresar al menos un producto a la recepción de compra.' });
    }
    const saved = await saveCompra(data);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PAGOS / ABONOS A PROVEEDORES (CXP) REST API
app.get(['/api/cxp/pagos', '/api/proveedores/pagos'], async (req, res) => {
  try {
    const proveedorId = req.query.proveedor_id || null;
    const pagos = await getPagosProveedores(proveedorId);
    res.json(pagos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/cxp/abonos', '/api/cxp/pagos', '/api/proveedores/abonos'], async (req, res) => {
  try {
    const data = req.body;
    if (!data.proveedor_id || (!data.monto_usd && !data.monto_ves)) {
      return res.status(400).json({ error: 'Proveedor y monto de pago/abono son requeridos.' });
    }
    const saved = await savePagoProveedor(data);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// COTIZACIONES DE PROVEEDORES REST API
app.get('/api/cotizaciones-proveedores', async (req, res) => {
  try {
    const cotizaciones = await getCotizacionesProveedores();
    res.json(cotizaciones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cotizaciones-proveedores', async (req, res) => {
  try {
    const data = req.body;
    if (!data.proveedor_id) {
      return res.status(400).json({ error: 'Proveedor es requerido para registrar la cotización.' });
    }
    const saved = await saveCotizacionProveedor(data);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cotizaciones-proveedores/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body, id };
    const saved = await saveCotizacionProveedor(data);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cotizaciones-proveedores/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteCotizacionProveedor(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).send('WinterPos API backend running. Frontend dist build not found.');
});

// Helper: Auto-free port if occupied by a previous node process on startup
function freePortIfOccupied(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ Puerto ${port} en uso. Liberando proceso previo automáticamente...`);
        try {
          if (process.platform === 'win32') {
            const output = execSync(`netstat -ano | findstr :${port}`).toString();
            const lines = output.trim().split('\n');
            const pids = new Set();
            for (const line of lines) {
              const parts = line.trim().split(/\s+/);
              if (parts.length >= 5 && parts[1].includes(`:${port}`)) {
                const pid = parseInt(parts[4], 10);
                if (pid && pid !== process.pid) pids.add(pid);
              }
            }
            for (const pid of pids) {
              try {
                execSync(`taskkill /F /PID ${pid}`);
                console.log(`✅ Proceso anterior (${pid}) liberado del puerto ${port}.`);
              } catch (_) {}
            }
          }
        } catch (e) {
          console.warn(`Advertencia al liberar puerto ${port}:`, e.message);
        }
      }
      resolve();
    });
    tester.once('listening', () => {
      tester.close(() => resolve());
    });
    tester.listen(port);
  });
}

// Start Server with Auto-Port Freeing
freePortIfOccupied(PORT).then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor API de WinterPosAL corriendo en http://localhost:${PORT}`);
    console.log(`Expuesto en red LAN para recibir conexiones de otras terminales.`);
    
    // Launch Native App Window (Edge App Mode / Browser) on startup
    setTimeout(() => {
      import('child_process').then(({ exec }) => {
        const targetUrl = `http://localhost:${PORT}?mode=desktop`;
        if (process.platform === 'win32') {
          exec(`start "" chrome --app=${targetUrl} --window-size=1080,700`, (err) => {
            if (err) exec(`start ${targetUrl}`);
          });
        } else {
          exec(`start ${targetUrl}`);
        }
      }).catch(() => {});
    }, 1500);

    // Initialize WhatsApp connection at startup if enabled
    setTimeout(() => {
      initWhatsAppClient();
    }, 1000);
  });
});
