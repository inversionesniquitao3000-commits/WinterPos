import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  getCompanyConfig, saveCompanyConfig, getUsers, getProducts, saveProduct,
  updateProductStock, updateProductPrices, updateProductPricesBulk, getClients, saveClient, registerAbono,
  getTasaHistory, saveTasa, getMovements, saveMovement, getPriceHistory, savePriceHistory,
  getSales, saveSale, getCierres, abrirCaja, cerrarCaja, getCajaEstado, registrarCajaMovimiento, updateCierre, deleteCierre,
  updateClient, deleteClient, getAbonos, deleteProduct, updateProduct, saveProductsBulk,
  saveUser, updateUser, deleteUser, getRoles, saveRole, updateRole, deleteRole, wipeDatabase, backupDatabase, restoreDatabase,
  readJsonFile, writeJsonFile
} from './db-store.js';
import { 
  initWhatsAppClient, getWhatsAppStatus, saveWhatsAppConfig, sendCierreReport 
} from './whatsapp-service.js';

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Serve static frontend build if dist directory exists
const distPath = path.resolve(__dirname, '../WinterPosAL/dist');
if (fs.existsSync(distPath)) {
  console.log(`Serving static frontend build from: ${distPath}`);
  app.use(express.static(distPath));
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

app.put('/api/productos/:id', async (req, res) => {
  const updated = await updateProduct(req.body);
  res.json(updated);
});

app.get('/api/clientes', async (req, res) => {
  const clients = await getClients();
  res.json(clients);
});

app.post('/api/clientes', async (req, res) => {
  const saved = await saveClient(req.body);
  res.json(saved);
});

app.post('/api/clientes/abono', async (req, res) => {
  const { id, monto } = req.body;
  const success = await registerAbono(id, monto);
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
    const usuario = req.query.usuario || null;
    const sessionSince = req.query.session_since || null;

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
    //    on a DIFFERENT terminal after the current session started
    if (usuario && sessionSince) {
      const sessionStart = new Date(sessionSince);
      const userClosedElsewhere = cierres.some(c => {
        if (!c.usuario || !c.fechaCierre) return false;
        // Same user, different terminal, closed AFTER current session started
        const isSameUser = c.usuario.toLowerCase() === usuario.toLowerCase();
        const isDiffTerminal = terminal ? c.terminal !== terminal : false;
        const closedAfterSession = new Date(c.fechaCierre) > sessionStart;
        const isClosed = c.status === 'Cerrada';
        return isSameUser && isDiffTerminal && closedAfterSession && isClosed;
      });
      result.sessionClosed = userClosedElsewhere;
    }

    res.json(result);
  } catch (err) {
    console.error('Error en /api/sync/poll:', err.message);
    res.json({ sales: [], tasas: null, cierres: null, sessionClosed: false, serverTime: new Date().toISOString() });
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
  const state = await getCajaEstado(terminal);
  res.json(state);
});

app.post('/api/cajas/abrir', async (req, res) => {
  const { usd, ves, usuarioId, terminal } = req.body;
  const id = await abrirCaja(usd, ves, usuarioId, terminal);
  res.json({ success: true, id });
});

app.post('/api/cajas/cerrar', async (req, res) => {
  const success = await cerrarCaja(req.body);
  res.json({ success });
});

app.post('/api/cajas/movimiento', async (req, res) => {
  const { tipo, descripcion, usd, ves, terminal } = req.body;
  const success = await registrarCajaMovimiento(tipo, descripcion, usd, ves, terminal);
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

app.post('/api/db/backup/schedule', async (req, res) => {
  try {
    const { schedule } = req.body;
    const sched = readJsonFile('backup_schedule.json', { schedule: 'Diario', lastBackup: '' });
    sched.schedule = schedule;
    writeJsonFile('backup_schedule.json', sched);
    res.json({ success: true });
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
    const sched = readJsonFile('backup_schedule.json', { schedule: 'Diario', lastBackup: '' });
    if (sched.schedule === 'Desactivado') return;

    const now = new Date();
    let shouldBackup = false;

    if (!sched.lastBackup) {
      shouldBackup = true;
    } else {
      const last = new Date(sched.lastBackup);
      const diffMs = now.getTime() - last.getTime();
      const diffHours = diffMs / (1000 * 60 * 65); // approximate checking buffer

      if (sched.schedule === 'Diario' && diffHours >= 23.5) {
        shouldBackup = true;
      } else if (sched.schedule === 'Semanal' && diffHours >= 24 * 7 - 0.5) {
        shouldBackup = true;
      } else if (sched.schedule === 'Mensual' && diffHours >= 24 * 30 - 0.5) {
        shouldBackup = true;
      }
    }

    if (shouldBackup) {
      console.log(`⏱️ [Backups] Iniciando copia de seguridad automática programada (${sched.schedule})...`);
      const backupData = await backupDatabase();
      const fileName = `backup_auto_${now.toISOString().split('T')[0]}_${now.getTime()}.json`;
      fs.writeFileSync(path.join(BACKUPS_DIR, fileName), JSON.stringify(backupData, null, 2), 'utf8');
      
      sched.lastBackup = now.toISOString();
      writeJsonFile('backup_schedule.json', sched);
      console.log(`✅ [Backups] Backup automático guardado correctamente: ${fileName}`);
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
      if (error) {
        console.error('[WhatsApp Error] Error al instalar Chromium:', error.message);
        return res.status(500).json({ success: false, error: error.message, details: stderr });
      }
      console.log('[WhatsApp] Chromium instalado con éxito. Reiniciando cliente de WhatsApp...');
      await initWhatsAppClient();
      res.json({ success: true, message: 'Chromium instalado con éxito. Intentando reconexión...', output: stdout });
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

app.post('/api/whatsapp/send-cierre', async (req, res) => {
  try {
    const { imageBase64, textSummary } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'La imagen en Base64 es requerida.' });
    }
    const result = await sendCierreReport(imageBase64, textSummary || 'Cierre de caja');
    res.json(result);
  } catch (err) {
    console.error('Error en /api/whatsapp/send-cierre:', err.message);
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

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor API de WinterPosAL corriendo en http://localhost:${PORT}`);
  console.log(`Expuesto en red LAN para recibir conexiones de otras terminales.`);
  
  // Initialize WhatsApp connection at startup if enabled
  setTimeout(() => {
    initWhatsAppClient();
  }, 1000);
});
