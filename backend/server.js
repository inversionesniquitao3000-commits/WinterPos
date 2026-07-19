import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  getCompanyConfig, saveCompanyConfig, getUsers, getProducts, saveProduct,
  updateProductStock, updateProductPrices, getClients, saveClient, registerAbono,
  getTasaHistory, saveTasa, getMovements, saveMovement, getPriceHistory, savePriceHistory,
  getSales, saveSale, getCierres, abrirCaja, cerrarCaja, getCajaEstado, registrarCajaMovimiento,
  updateClient, deleteClient, getAbonos, deleteProduct
} from './db-store.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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
  const { usd, ves } = req.body;
  const id = await abrirCaja(usd, ves);
  res.json({ success: true, id });
});

app.post('/api/cajas/cerrar', async (req, res) => {
  const success = await cerrarCaja(req.body);
  res.json({ success });
});

app.post('/api/cajas/movimiento', async (req, res) => {
  const { tipo, descripcion, usd, ves } = req.body;
  const success = await registrarCajaMovimiento(tipo, descripcion, usd, ves);
  res.json({ success });
});

app.get('/api/cajas/cierres', async (req, res) => {
  const cierres = await getCierres();
  res.json(cierres);
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor API de WinterPosAL corriendo en http://localhost:${PORT}`);
  console.log(`Expueto en red LAN para recibir conexiones de otras terminales.`);
});
