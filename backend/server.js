import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  getCompanyConfig, saveCompanyConfig, getUsers, getProducts, saveProduct,
  updateProductStock, updateProductPrices, getClients, saveClient, registerAbono,
  getTasaHistory, saveTasa, getMovements, saveMovement, getPriceHistory, savePriceHistory,
  getSales, saveSale, getCierres, abrirCaja, cerrarCaja, getCajaEstado, registrarCajaMovimiento, updateCierre,
  updateClient, deleteClient, getAbonos, deleteProduct, updateProduct, saveProductsBulk,
  saveUser, updateUser, deleteUser, getRoles, saveRole, updateRole, deleteRole, wipeDatabase, backupDatabase, restoreDatabase,
  readJsonFile, writeJsonFile
} from './db-store.js';
import { 
  initWhatsAppClient, getWhatsAppStatus, saveWhatsAppConfig, sendCierreReport 
} from './whatsapp-service.js';

dotenv.config();

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

app.post('/api/sales', async (req, res) => {
  const saved = await saveSale(req.body);
  res.json(saved);
});

app.get('/api/cajas/estado', async (req, res) => {
  const state = await getCajaEstado();
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
import fs from 'fs';
import path from 'path';

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

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor API de WinterPosAL corriendo en http://localhost:${PORT}`);
  console.log(`Expuesto en red LAN para recibir conexiones de otras terminales.`);
  
  // Initialize WhatsApp connection at startup if enabled
  setTimeout(() => {
    initWhatsAppClient();
  }, 1000);
});
