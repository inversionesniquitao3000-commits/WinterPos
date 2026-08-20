import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import {
  getCompanyConfig, saveCompanyConfig, getUsers, getProducts, saveProduct,
  updateProductStock, updateProductStockBulk, updateProductPrices, updateProductPricesBulk, getClients, saveClient, registerAbono,
  getTasaHistory, saveTasa, clearTasaHistory, getMovements, saveMovement, saveMovementsBulk, getPriceHistory, savePriceHistory,
  getSales, saveSale, getCierres, abrirCaja, cerrarCaja, getCajaEstado, registrarCajaMovimiento, updateCierre, deleteCierre,
  getOpenCajas, forceCloseCaja,
  updateClient, deleteClient, getAbonos, deleteProduct, updateProduct, saveProductsBulk, saveClientsBulk,
  saveUser, updateUser, deleteUser, getRoles, saveRole, updateRole, deleteRole, wipeDatabase, backupDatabase, restoreDatabase,
  readJsonFile, writeJsonFile,
  getMasterPass, saveMasterPass, verifyMasterPass, getAccionistas, saveAccionista, deleteAccionista, getInversiones, saveInversion, deleteInversion,
  getGastosOperativos, saveGastoOperativo, deleteGastoOperativo,
  getProveedores, saveProveedor, deleteProveedor,
  getCompras, saveCompra,
  getPagosProveedores, savePagoProveedor,
  getCotizacionesProveedores, saveCotizacionProveedor, deleteCotizacionProveedor,
  saveSalidaInventario, getSalidasPausadas, saveSalidasPausadas,
  getLastInvoiceNumber, getSyncSummary
} from './db-store.js';

import { 
  initWhatsAppClient, getWhatsAppStatus, saveWhatsAppConfig, sendCierreReport,
  sendDirectWhatsAppMessage, unlockWhatsAppSession, resetWhatsAppSession, logoutWhatsAppSession
} from './whatsapp-service.js';

import { verifyLicense, activateLicense, registerTerminalActivity } from './license-manager.js';
import { processFiscalSale, emitReporteX, emitReporteZ, checkFiscalStatus } from './fiscal-service.js';
import { getDriveConfig, saveDriveConfig, uploadBackupToGoogleDrive } from './gdrive-service.js';
import { getManagerKPIs, getManagerCajasLive, getManagerInventoryAlerts, getManagerFinancialSummary } from './manager-service.js';
import { generateProductImage, saveUploadedImageBase64, IMAGES_DIR } from './ai-image-service.js';

import path from 'path';
import fs from 'fs';
import net from 'net';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get local LAN IP filtering virtual interfaces (VMware, VirtualBox, etc.)
export function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const virtualKeywords = ['vmware', 'vmnet', 'virtual', 'vbox', 'vethernet', 'tap', 'tun', 'docker', 'wsl', 'loopback', 'bluetooth', 'npcap'];
  
  let candidates = [];
  for (const name of Object.keys(interfaces)) {
    const isVirtual = virtualKeywords.some(k => name.toLowerCase().includes(k));
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
        if (!isVirtual) {
          const isWifiOrEth = /wi-?fi|ethernet|lan|inal[aá]mbrica|conexi[oó]n/i.test(name);
          candidates.push({ address: iface.address, priority: isWifiOrEth ? 1 : 2 });
        } else {
          candidates.push({ address: iface.address, priority: 3 });
        }
      }
    }
  }
  
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates.length > 0 ? candidates[0].address : '127.0.0.1';
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

// Serve product images publicly with CORS headers for all client terminals & browsers (multi-folder fallback)
app.use('/api/ai/images', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  next();
}, express.static(IMAGES_DIR));

app.use('/api/ai/images', express.static(path.join(__dirname, 'data', 'product_images')));
app.use('/api/ai/images', express.static(path.resolve(process.cwd(), 'backend', 'data', 'product_images')));
app.use('/api/ai/images', express.static(path.resolve(process.cwd(), 'data', 'product_images')));
if (process.env.APPDATA) {
  app.use('/api/ai/images', express.static(path.join(process.env.APPDATA, 'WinterPos', 'data', 'product_images')));
}
if (process.env.LOCALAPPDATA) {
  app.use('/api/ai/images', express.static(path.join(process.env.LOCALAPPDATA, 'WinterPos', 'data', 'product_images')));
}
app.use('/api/ai/images', express.static(path.resolve(__dirname, '../data/product_images')));

// Enforce License Validation on all business APIs
app.use((req, res, next) => {
  if (
    req.path.startsWith('/api/license') ||
    req.path.startsWith('/api/ai') ||
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
  res.json({ 
    status: 'ok', 
    serverTime: new Date().toISOString(),
    localIp: getLocalIpAddress()
  });
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

app.post('/api/productos/stock/bulk', async (req, res) => {
  const updates = req.body;
  const success = await updateProductStockBulk(updates);
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

app.post('/api/movements/bulk', async (req, res) => {
  const saved = await saveMovementsBulk(req.body);
  res.json({ success: true, count: saved.length, movements: saved });
});

// SALIDA DE INVENTARIO (MERMAS, REVERSIÓN, USO INTERNO)
app.post('/api/inventario/salida', async (req, res) => {
  try {
    const result = await saveSalidaInventario(req.body);
    res.json(result);
  } catch (err) {
    console.error('Error procesando salida de inventario:', err.message);
    res.status(500).json({ success: false, message: err.message, error: err.message });
  }
});

app.get('/api/inventario/salidas-pausadas', async (req, res) => {
  try {
    const list = await getSalidasPausadas();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventario/salidas-pausadas', async (req, res) => {
  try {
    const list = await saveSalidasPausadas(req.body);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
// Used by terminals to show the operator the last sale and estimate the next correlative (instant indexed lookup)
app.get('/api/sales/last-invoice', async (req, res) => {
  try {
    const info = await getLastInvoiceNumber();
    res.json(info);
  } catch (err) {
    console.error('Error en /api/sales/last-invoice:', err.message);
    res.json({ last: null, next: 'FAC-000001' });
  }
});

// Unified ultra-fast sync/poll endpoint for multi-terminal real-time synchronization
// Uses database aggregation hashes/counters to return in < 1ms without full table scans
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

    // Client sync parameters
    const clientTasaCobro = parseFloat(req.query.last_tasa_cobro) || 0;
    const clientTasaVuelto = parseFloat(req.query.last_tasa_vuelto) || 0;
    const clientTasasCount = parseInt(req.query.tasas_count) || 0;

    const clientCierreCount = parseInt(req.query.cierres_count) || 0;
    const clientLastCierreId = parseInt(req.query.last_cierre_id) || 0;
    const clientCierresSignature = parseFloat(req.query.cierres_signature) || 0;
    const roundedClientCierresSig = Math.round(clientCierresSignature * 100) / 100;

    const clientClientsCount = parseInt(req.query.clients_count) || 0;
    const clientClientsSig = parseFloat(req.query.clients_sig) || 0;
    const roundedClientClientsSig = Math.round(clientClientsSig * 100) / 100;

    const clientProductsCount = parseInt(req.query.products_count) || 0;
    const clientProductsSig = parseFloat(req.query.products_sig) || 0;
    const roundedClientProductsSig = Math.round(clientProductsSig * 100) / 100;

    const clientAbonosCount = parseInt(req.query.abonos_count) || 0;
    const clientAbonosSig = parseFloat(req.query.abonos_sig) || 0;
    const roundedClientAbonosSig = Math.round(clientAbonosSig * 100) / 100;

    const result = {
      sales: [],
      tasas: null,        // null = no changes; array = full updated list
      cierres: null,      // null = no changes; array = full updated list
      clients: null,      // null = no changes; array = full updated list
      products: null,     // null = no changes; array = full updated list
      abonos: null,
      sessionClosed: false,
      serverTime: new Date().toISOString()
    };

    // Fast-path: single aggregated check across all database tables (executes in ~1ms)
    const summary = await getSyncSummary();

    if (summary) {
      // 1. Sales sync: only fetch if server has sales with ID > sinceId
      if (sinceId > 0 && summary.maxSaleId > sinceId) {
        result.sales = await getSales(50, sinceId, terminal);
      }

      // 2. Tasas sync: compare aggregate metrics
      if (summary.tasasCount !== clientTasasCount ||
          Math.abs(summary.lastTasaCobro - clientTasaCobro) > 0.0001 ||
          Math.abs(summary.lastTasaVuelto - clientTasaVuelto) > 0.0001) {
        result.tasas = await getTasaHistory();
      }

      // 3. Cierres sync: compare aggregate metrics
      if (summary.cierresCount !== clientCierreCount ||
          summary.lastCierreId !== clientLastCierreId ||
          Math.abs(summary.cierresSig - roundedClientCierresSig) > 0.01) {
        result.cierres = await getCierres();
      }

      // 4. Clients sync: compare count and checksum
      if (summary.clientsCount !== clientClientsCount ||
          Math.abs(summary.clientsSig - roundedClientClientsSig) > 0.01) {
        result.clients = await getClients();
      }

      // 5. Products sync: compare count and checksum
      if (summary.productsCount !== clientProductsCount ||
          Math.abs(summary.productsSig - roundedClientProductsSig) > 0.01) {
        result.products = await getProducts();
      }

      // 6. Abonos sync: compare count and checksum
      if (summary.abonosCount !== clientAbonosCount ||
          Math.abs(summary.abonosSig - roundedClientAbonosSig) > 0.01) {
        result.abonos = await getAbonos();
      }
    } else {
      // JSON / Fallback mode
      const allSales = await getSales();
      if (sinceId > 0) {
        result.sales = allSales.filter(s => {
          const hasHigherId = s.id && s.id > sinceId;
          const isOtherTerminal = terminal ? s.terminal !== terminal : true;
          return hasHigherId && isOtherTerminal;
        });
      }

      const tasas = await getTasaHistory();
      const serverTasasCount = tasas.length;
      const latestTasa = tasas.length > 0 ? tasas[tasas.length - 1] : null;
      if (serverTasasCount !== clientTasasCount || (latestTasa && (Math.abs(latestTasa.tasa_cobro - clientTasaCobro) > 0.0001 || Math.abs(latestTasa.tasa_vuelto - clientTasaVuelto) > 0.0001))) {
        result.tasas = tasas;
      }

      const cierres = await getCierres();
      const maxCierreId = cierres.length > 0 ? Math.max(...cierres.map(c => c.id || 0)) : 0;
      const serverCierresSignature = Math.round(cierres.reduce((acc, c) => acc + (c.realUsd || 0) + (c.realVes || 0), 0) * 100) / 100;
      if (cierres.length !== clientCierreCount || maxCierreId !== clientLastCierreId || serverCierresSignature !== roundedClientCierresSig) {
        result.cierres = cierres;
      }

      const clients = await getClients();
      const serverClientsSig = Math.round(clients.reduce((acc, c) => acc + (c.id || 0) + (c.limite_credito || 0) + (c.saldo_pendiente || 0), 0) * 100) / 100;
      if (clients.length !== clientClientsCount || serverClientsSig !== roundedClientClientsSig) {
        result.clients = clients;
      }

      const products = await getProducts();
      const serverProductsSig = Math.round(products.reduce((acc, p) => acc + (p.id || 0) + (p.stock_actual || 0) + (p.precio_detalle_usd || 0), 0) * 100) / 100;
      if (products.length !== clientProductsCount || serverProductsSig !== roundedClientProductsSig) {
        result.products = products;
      }

      const abonosList = await getAbonos();
      const serverAbonosSig = Math.round(abonosList.reduce((acc, a) => acc + (a.id || 0) + (a.monto || 0) + (a.monto_ves || 0), 0) * 100) / 100;
      if (abonosList.length !== clientAbonosCount || serverAbonosSig !== roundedClientAbonosSig) {
        result.abonos = abonosList;
      }
    }

    // Company config sync: check in-memory cached company config
    const companyConfig = await getCompanyConfig();
    const clientConfigName = req.query.config_name || '';
    const clientConfigRif = req.query.config_rif || '';
    if (companyConfig && (companyConfig.nombre_comercio !== clientConfigName || companyConfig.rif !== clientConfigRif)) {
      result.config = companyConfig;
    }

    // Session closure detection
    if ((usuario || usuarioId) && sessionSince) {
      const uKeyId = usuarioId ? userShiftClosureEvents.get(`id_${usuarioId}`) : 0;
      const uKeyName = usuario ? userShiftClosureEvents.get(`name_${String(usuario).toLowerCase().trim()}`) : 0;
      let sessionTimeMs = parseInt(sessionSince) || 0;

      if (sessionTimeMs > 0 && ((uKeyId && sessionTimeMs < uKeyId) || (uKeyName && sessionTimeMs < uKeyName))) {
        result.sessionClosed = true;
      }
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

// Recent Sales Deduplication Cache (Anti-Double-Charge Idempotency Shield)
const recentSalesDeduplication = new Map();

app.post('/api/sales', async (req, res) => {
  try {
    const saleData = req.body;

    // Build unique sale fingerprint
    const clientDoc = saleData.client?.cedula_rif || saleData.client?.cedula || 'V-00000000';
    const itemsSig = (saleData.items || []).map(i => `${i.product?.id || i.product?.barcode || i.description}_${i.qty}`).join('|');
    const signature = `${saleData.terminal || 'LOCAL'}_${clientDoc}_${saleData.totalUSD}_${itemsSig}`;

    const now = Date.now();
    const existing = recentSalesDeduplication.get(signature);

    // If identical request arrives within 3.5 seconds, return the existing confirmed sale without creating a duplicate
    if (existing && (now - existing.timestamp < 3500)) {
      console.warn(`🛡️ [Anti-Duplicación] Petición concurrente detectada (${now - existing.timestamp}ms). Retornando venta confirmada "${existing.result.factura_nro}" para evitar cobro duplicado.`);
      return res.json(existing.result);
    }

    const saved = await saveSale(saleData);
    if (!saved) {
      return res.status(500).json({ error: 'Error interno al registrar la venta. Intente de nuevo.' });
    }

    // Save in deduplication cache
    recentSalesDeduplication.set(signature, { timestamp: now, result: saved });

    // Clean up expired cache items
    for (const [key, val] of recentSalesDeduplication.entries()) {
      if (now - val.timestamp > 15000) {
        recentSalesDeduplication.delete(key);
      }
    }

    res.json(saved);
  } catch (err) {
    console.error('❌ Error crítico al registrar venta:', err.message);
    res.status(500).json({ error: err.message || 'Error interno al registrar la venta.' });
  }
});

// ==========================================
// FISCAL PRINTER ENDPOINTS (SENIAT / HKA / BIXOLON / SIMULATOR)
// ==========================================
app.post('/api/fiscal/print-invoice', async (req, res) => {
  try {
    const { saleData, fiscalConfig } = req.body;
    const result = await processFiscalSale(saleData, fiscalConfig);
    res.json(result);
  } catch (err) {
    console.error('❌ Error emitiendo factura fiscal:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fiscal/reporte-x', async (req, res) => {
  try {
    const result = await emitReporteX(req.body.fiscalConfig || req.body);
    res.json(result);
  } catch (err) {
    console.error('❌ Error emitiendo Reporte X:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fiscal/reporte-z', async (req, res) => {
  try {
    const result = await emitReporteZ(req.body.fiscalConfig || req.body);
    res.json(result);
  } catch (err) {
    console.error('❌ Error emitiendo Reporte Z:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fiscal/status', async (req, res) => {
  try {
    const result = await checkFiscalStatus(req.body.fiscalConfig || req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

app.get('/api/cajas/abiertas', async (req, res) => {
  try {
    const openList = await getOpenCajas();
    res.json(openList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cajas/forzar-cierre', async (req, res) => {
  try {
    const { cajaId, adminName } = req.body;
    if (!cajaId) {
      return res.status(400).json({ success: false, message: 'cajaId es requerido' });
    }
    const result = await forceCloseCaja(cajaId, adminName || 'ADMINISTRADOR');
    if (result && result.success) {
      const closureTime = Date.now();
      if (result.usuarioId) {
        userShiftClosureEvents.set(`id_${result.usuarioId}`, closureTime);
        activeSessions.delete(result.usuarioId);
        activeSessions.delete(String(result.usuarioId));
        activeSessions.delete(parseInt(result.usuarioId));
      }
      if (result.terminal) {
        for (const [sId, sess] of activeSessions.entries()) {
          if (sess.terminal === result.terminal) {
            activeSessions.delete(sId);
          }
        }
      }
      console.log(`[Admin Force Shift Closure] 🔒 Cierre forzado de caja ID ${cajaId} por ${adminName || 'Admin'}. Usuario ID ${result.usuarioId} liberado.`);
    }
    res.json(result);
  } catch (err) {
    console.error('Error en /api/cajas/forzar-cierre:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
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

      // Automatic Google Drive Cloud Sync if enabled
      try {
        const dConfig = getDriveConfig();
        if (dConfig.enabled) {
          uploadBackupToGoogleDrive(backupData, fileName).catch(gErr => {
            console.warn('⚠️ [Backups] Error en subida automática a Google Drive:', gErr.message);
          });
        }
      } catch (gErr) {}
    }
  } catch (err) {
    console.error('⚠️ [Backups] Error en backup automático:', err.message);
  }
}

// Check every 1 hour
setInterval(runBackupTask, 3600000);
// Check once at startup after 5 seconds
setTimeout(runBackupTask, 5000);

// ==========================================
// GOOGLE DRIVE BACKUP ENDPOINTS
// ==========================================
app.get('/api/backup/gdrive-config', async (req, res) => {
  try {
    const config = await getDriveConfig();
    res.json(config);
  } catch (err) {
    console.error('Error en GET /api/backup/gdrive-config:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/gdrive-config', async (req, res) => {
  try {
    const saved = await saveDriveConfig(req.body);
    res.json(saved);
  } catch (err) {
    console.error('Error en POST /api/backup/gdrive-config:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/gdrive-test', async (req, res) => {
  try {
    const testConfig = req.body && Object.keys(req.body).length > 0 ? req.body : null;
    const testData = { test: true, app: 'WinterPOS', date: new Date().toISOString() };
    const result = await uploadBackupToGoogleDrive(testData, `winterpos_test_ping_${Date.now()}.json`, testConfig);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/gdrive-sync', async (req, res) => {
  try {
    const backup = await backupDatabase();
    const fileName = `winterpos_manual_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;
    const result = await uploadBackupToGoogleDrive(backup, fileName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WHATSAPP INTEGRATION ENDPOINTS
app.get('/api/whatsapp/status', async (req, res) => {
  try {
    const status = await getWhatsAppStatus();
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
        const currentStatus = await getWhatsAppStatus();

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

app.post('/api/whatsapp/config', async (req, res) => {
  try {
    const saved = await saveWhatsAppConfig(req.body);
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

app.post(['/api/whatsapp/send-direct', '/api/whatsapp/send-single'], async (req, res) => {
  try {
    const { phone, textMessage, text, imageBase64 } = req.body;
    const targetMsg = textMessage || text;
    if (!phone || !targetMsg) {
      return res.status(400).json({ error: 'Se requieren el número de teléfono y el mensaje para enviar.' });
    }
    const result = await sendDirectWhatsAppMessage(phone, targetMsg, imageBase64);
    res.json(result);
  } catch (err) {
    console.error('Error en /api/whatsapp/send-direct:', err.message);
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
    if (!newPass || String(newPass).trim().length === 0) {
      return res.status(400).json({ success: false, message: 'La nueva clave Master Pass no puede estar vacía.' });
    }
    await saveMasterPass(String(newPass).trim());
    res.json({ success: true, message: 'Clave Master Pass actualizada exitosamente.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Error al actualizar clave en el servidor.', error: err.message });
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
    res.status(500).json({ success: false, message: err.message || 'Error al verificar la clave.', error: err.message });
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

// ==========================================
// AI PRODUCT IMAGES ENDPOINTS
// ==========================================

app.post('/api/ai/generate-product-image', async (req, res) => {
  try {
    const { description, category, barcode, saveLocal } = req.body || {};
    const result = await generateProductImage(description, category, barcode, saveLocal !== false);
    res.json(result);
  } catch (err) {
    console.error('Error generando imagen con IA:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual Image Upload from PC (Base64 file)
app.post('/api/ai/upload-product-image', (req, res) => {
  try {
    const { imageBase64, filename } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'imageBase64 es requerido.' });
    }
    const result = saveUploadedImageBase64(imageBase64, filename || 'product.jpg');
    res.json(result);
  } catch (err) {
    console.error('Error subiendo imagen:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk AI Image Generation for multiple products
app.post('/api/ai/generate-bulk-images', async (req, res) => {
  try {
    const { products: itemsToProcess } = req.body || {};
    if (!Array.isArray(itemsToProcess) || itemsToProcess.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de productos requerida.' });
    }

    const results = [];
    // Process items sequentially with intelligent multi-tier barcode & text lookup
    for (const item of itemsToProcess) {
      try {
        const genRes = await generateProductImage(item.description, item.category, item.barcode, true);
        results.push({
          id: item.id,
          description: item.description,
          barcode: item.barcode,
          imageUrl: genRes.imageUrl,
          source: genRes.source,
          success: genRes.success
        });
      } catch (err) {
        results.push({
          id: item.id,
          description: item.description,
          barcode: item.barcode,
          imageUrl: '',
          success: false,
          error: err.message
        });
      }
    }

    res.json({ success: true, count: results.length, results });
  } catch (err) {
    console.error('Error en generación masiva:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// MANAGER MOBILE DASHBOARD & KPIS ENDPOINTS
// ==========================================
app.get('/api/manager/kpis', async (req, res) => {
  try {
    const kpis = await getManagerKPIs();
    res.json(kpis);
  } catch (err) {
    console.error('Error en /api/manager/kpis:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/manager/cajas-live', async (req, res) => {
  try {
    const data = await getManagerCajasLive();
    res.json(data);
  } catch (err) {
    console.error('Error en /api/manager/cajas-live:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/manager/inventory-alerts', async (req, res) => {
  try {
    const data = await getManagerInventoryAlerts();
    res.json(data);
  } catch (err) {
    console.error('Error en /api/manager/inventory-alerts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/manager/financial-summary', async (req, res) => {
  try {
    const data = await getManagerFinancialSummary();
    res.json(data);
  } catch (err) {
    console.error('Error en /api/manager/financial-summary:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/manager/whatsapp-report-now', async (req, res) => {
  try {
    const kpis = await getManagerKPIs();
    const text = `📊 *RESUMEN GERENCIAL AL MOMENTO*\n🏢 *${kpis.company.name}*\n📅 Fecha: ${kpis.today}\n\n💵 *Ventas Totales:* $${kpis.kpis.totalVentasUSD} (${kpis.kpis.totalVentasVES} Bs)\n📈 *Utilidad Estimada:* $${kpis.kpis.utilidadBrutaUSD} (${kpis.kpis.margenPorcentaje}%)\n🎫 *Tickets Emitidos:* ${kpis.kpis.totalTickets} (Promedio: $${kpis.kpis.ticketPromedioUSD})\n🏪 *Cajas Abiertas:* ${kpis.kpis.cajasAbiertasCount}\n💳 *CxC Clientes:* $${kpis.kpis.totalCxC_USD}\n\n_Generado automáticamente desde WinterPos Mobile Executive_`;
    const sendRes = await sendCierreReport('', text);
    res.json({ success: true, message: 'Reporte gerencial enviado exitosamente a WhatsApp', sendRes });
  } catch (err) {
    console.error('Error enviando reporte gerencial a WhatsApp:', err.message);
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

// JSON fallback for any unhandled /api/* routes (prevents HTML 404 responses for API calls)
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Ruta API no encontrada: ${req.method} ${req.originalUrl}. Verifique la versión instalada.` });
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
