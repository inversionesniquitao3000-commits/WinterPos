import {
  getSales, getCierres, getOpenCajas, getProducts, getClients,
  getProveedores, getCompras, getPagosProveedores, getAbonos,
  getTasaHistory, getCompanyConfig, getGastosOperativos, getAccionistas, getInversiones
} from './db-store.js';

function getTodayString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Returns Executive KPIs for the Manager Mobile Dashboard in real time
 */
export async function getManagerKPIs() {
  const todayStr = getTodayString();
  const sales = await getSales(500);
  const products = await getProducts();
  const clients = await getClients();
  const proveedores = await getProveedores();
  const openCajas = await getOpenCajas();
  const tasas = await getTasaHistory();
  const config = await getCompanyConfig();

  const latestTasa = tasas && tasas.length > 0 ? tasas[tasas.length - 1] : { tasa_cobro: 36.5, tasa_vuelto: 36.5 };

  // Map products by ID and barcode for instant cost lookup
  const productCostMap = new Map();
  for (const p of products) {
    if (p.id) productCostMap.set(String(p.id), parseFloat(p.precio_costo_usd) || 0);
    if (p.codigo_barras_clave) productCostMap.set(String(p.codigo_barras_clave), parseFloat(p.precio_costo_usd) || 0);
    if (p.barcode) productCostMap.set(String(p.barcode), parseFloat(p.precio_costo_usd) || 0);
  }

  // Filter sales for today (non-annulled)
  const todaySales = sales.filter(s => {
    const sDate = s.fecha ? s.fecha.substring(0, 10) : '';
    const isToday = sDate === todayStr || (s.fecha && s.fecha.includes(todayStr));
    const isNotAnnulled = s.estatus !== 'Anulada' && s.status !== 'Anulada';
    return isToday && isNotAnnulled;
  });

  // Yesterday sales for comparison
  const dYesterday = new Date();
  dYesterday.setDate(dYesterday.getDate() - 1);
  const pad = (n) => String(n).padStart(2, '0');
  const yesterdayStr = `${dYesterday.getFullYear()}-${pad(dYesterday.getMonth() + 1)}-${pad(dYesterday.getDate())}`;

  const yesterdaySales = sales.filter(s => {
    const sDate = s.fecha ? s.fecha.substring(0, 10) : '';
    return (sDate === yesterdayStr || (s.fecha && s.fecha.includes(yesterdayStr))) && s.estatus !== 'Anulada';
  });

  let totalVentasUSD = 0;
  let totalVentasVES = 0;
  let totalCostoUSD = 0;
  const productSalesCount = new Map();
  const paymentMethodsTotal = {
    efectivo_usd: 0,
    efectivo_ves: 0,
    debito: 0,
    pago_movil: 0,
    biopago: 0,
    credito: 0,
    otros: 0
  };

  const hourlyDistribution = Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, '0')}:00`,
    totalUSD: 0,
    tickets: 0
  }));

  for (const s of todaySales) {
    const saleUsd = parseFloat(s.total_usd || s.totalUSD) || 0;
    const saleVes = parseFloat(s.total_ves || s.totalVES) || 0;
    totalVentasUSD += saleUsd;
    totalVentasVES += saleVes;

    // Calculate estimated cost
    let saleCost = 0;
    const items = s.items || [];
    for (const it of items) {
      const pId = it.product?.id || it.productId || it.product_id;
      const barcode = it.product?.barcode || it.product?.codigo_barras_clave;
      const cost = productCostMap.get(String(pId)) || productCostMap.get(String(barcode)) || (parseFloat(it.product?.precio_costo_usd) || 0);
      const qty = parseFloat(it.qty || it.cantidad) || 1;
      const lineCost = cost * qty;
      saleCost += lineCost;

      // Track top products
      const pName = it.product?.description || it.description || `Producto #${pId || 'Desc'}`;
      const existing = productSalesCount.get(pName) || { name: pName, qty: 0, totalUSD: 0, image: it.product?.imagen_url || '' };
      existing.qty += qty;
      existing.totalUSD += (parseFloat(it.priceUSD || it.precio_unitario_usd) || 0) * qty;
      productSalesCount.set(pName, existing);
    }

    // If cost couldn't be calculated from items, estimate default 30% margin
    if (saleCost === 0 && saleUsd > 0) {
      saleCost = saleUsd * 0.70;
    }
    totalCostoUSD += saleCost;

    // Payment methods aggregation
    const payments = s.payments || [];
    if (payments.length > 0) {
      for (const p of payments) {
        const method = (p.metodo_pago || p.method || '').toLowerCase();
        const amtUSD = parseFloat(p.monto_usd || p.amountUSD || p.amount) || 0;
        if (method.includes('usd') || method.includes('dolar') || method === 'efectivo_usd') {
          paymentMethodsTotal.efectivo_usd += amtUSD;
        } else if (method.includes('ves') || method.includes('bolivar') || method === 'efectivo_ves') {
          paymentMethodsTotal.efectivo_ves += amtUSD;
        } else if (method.includes('debito') || method.includes('punto')) {
          paymentMethodsTotal.debito += amtUSD;
        } else if (method.includes('pago_movil') || method.includes('movil')) {
          paymentMethodsTotal.pago_movil += amtUSD;
        } else if (method.includes('biopago')) {
          paymentMethodsTotal.biopago += amtUSD;
        } else if (method.includes('credito')) {
          paymentMethodsTotal.credito += amtUSD;
        } else {
          paymentMethodsTotal.otros += amtUSD;
        }
      }
    } else {
      // Fallback
      paymentMethodsTotal.efectivo_usd += saleUsd;
    }

    // Hourly distribution
    try {
      if (s.fecha) {
        const hour = parseInt(s.fecha.substring(11, 13), 10);
        if (!isNaN(hour) && hour >= 0 && hour < 24) {
          hourlyDistribution[hour].totalUSD += saleUsd;
          hourlyDistribution[hour].tickets += 1;
        }
      }
    } catch (_) {}
  }

  const totalTickets = todaySales.length;
  const ticketPromedioUSD = totalTickets > 0 ? (totalVentasUSD / totalTickets) : 0;
  const utilidadBrutaUSD = totalVentasUSD - totalCostoUSD;
  const margenPorcentaje = totalVentasUSD > 0 ? ((utilidadBrutaUSD / totalVentasUSD) * 100) : 0;

  // Top 5 Products
  const topProducts = Array.from(productSalesCount.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // Accounts Receivable (CxC)
  const totalCxC_USD = clients.reduce((acc, c) => acc + (parseFloat(c.saldo_pendiente) || 0), 0);
  const clientsMorososCount = clients.filter(c => (parseFloat(c.saldo_pendiente) || 0) > 0).length;

  // Accounts Payable (CxP)
  const totalCxP_USD = proveedores.reduce((acc, p) => acc + (parseFloat(p.saldo_pendiente_usd) || 0), 0);

  // Yesterday total
  const yesterdayTotalUSD = yesterdaySales.reduce((acc, s) => acc + (parseFloat(s.total_usd || s.totalUSD) || 0), 0);
  const growthPercentage = yesterdayTotalUSD > 0 
    ? (((totalVentasUSD - yesterdayTotalUSD) / yesterdayTotalUSD) * 100)
    : 0;

  return {
    today: todayStr,
    company: {
      name: config.nombre_comercio || 'WinterPOS Comercio',
      rif: config.rif || 'J-00000000',
      phone: config.telefono || ''
    },
    tasa: {
      cobro: parseFloat(latestTasa.tasa_cobro) || 36.5,
      vuelto: parseFloat(latestTasa.tasa_vuelto) || 36.5
    },
    kpis: {
      totalVentasUSD: Math.round(totalVentasUSD * 100) / 100,
      totalVentasVES: Math.round(totalVentasVES * 100) / 100,
      utilidadBrutaUSD: Math.round(utilidadBrutaUSD * 100) / 100,
      margenPorcentaje: Math.round(margenPorcentaje * 10) / 10,
      totalTickets,
      ticketPromedioUSD: Math.round(ticketPromedioUSD * 100) / 100,
      yesterdayTotalUSD: Math.round(yesterdayTotalUSD * 100) / 100,
      growthPercentage: Math.round(growthPercentage * 10) / 10,
      cajasAbiertasCount: openCajas.length,
      totalCxC_USD: Math.round(totalCxC_USD * 100) / 100,
      clientsMorososCount,
      totalCxP_USD: Math.round(totalCxP_USD * 100) / 100
    },
    paymentMethods: paymentMethodsTotal,
    topProducts,
    hourlyDistribution: hourlyDistribution.filter(h => h.totalUSD > 0 || parseInt(h.hour) >= 8 && parseInt(h.hour) <= 20)
  };
}

/**
 * Returns Live Cash Registers data for all active terminals
 */
export async function getManagerCajasLive() {
  const openCajas = await getOpenCajas();
  const allSales = await getSales(200);
  const todayStr = getTodayString();

  const result = [];
  for (const c of openCajas) {
    const termName = c.estacion_nombre || c.terminal || 'CAJA';
    const cId = c.id;

    // Filter sales assigned to this cash drawer
    const cajaSales = allSales.filter(s => {
      const matchCaja = (s.caja_id && String(s.caja_id) === String(cId)) || s.terminal === termName;
      const matchDate = s.fecha && s.fecha.includes(todayStr);
      return matchCaja && matchDate && s.estatus !== 'Anulada';
    });

    let salesUsd = 0;
    let salesVes = 0;
    let cashUsd = 0;
    let cashVes = 0;
    let electronicUsd = 0;

    for (const s of cajaSales) {
      salesUsd += parseFloat(s.total_usd || s.totalUSD) || 0;
      salesVes += parseFloat(s.total_ves || s.totalVES) || 0;

      const payments = s.payments || [];
      for (const p of payments) {
        const meth = (p.metodo_pago || p.method || '').toLowerCase();
        const pUsd = parseFloat(p.monto_usd || p.amountUSD) || 0;
        const pVes = parseFloat(p.monto_ves || p.amountVES) || 0;

        if (meth.includes('usd') || meth === 'efectivo_usd') {
          cashUsd += pUsd;
        } else if (meth.includes('ves') || meth === 'efectivo_ves') {
          cashVes += pVes;
        } else {
          electronicUsd += pUsd;
        }
      }
    }

    const aperturaUsd = parseFloat(c.monto_apertura_usd) || 0;
    const aperturaVes = parseFloat(c.monto_apertura_ves) || 0;

    result.push({
      id: c.id,
      terminal: termName,
      cajero: c.usuario_nombre || c.usuario || 'Operador',
      fechaApertura: c.fecha_apertura,
      aperturaUsd,
      aperturaVes,
      salesUsd: Math.round(salesUsd * 100) / 100,
      salesVes: Math.round(salesVes * 100) / 100,
      cashExpectedUsd: Math.round((aperturaUsd + cashUsd) * 100) / 100,
      cashExpectedVes: Math.round((aperturaVes + cashVes) * 100) / 100,
      electronicUsd: Math.round(electronicUsd * 100) / 100,
      totalTickets: cajaSales.length,
      status: 'Abierta'
    });
  }

  return result;
}

/**
 * Returns Critical Inventory Alerts (Out of Stock, Low Stock, Valuation)
 */
export async function getManagerInventoryAlerts() {
  const products = await getProducts();

  const outOfStock = [];
  const lowStock = [];
  let totalItemsCount = products.length;
  let totalValuationCostUSD = 0;
  let totalValuationDetailUSD = 0;

  for (const p of products) {
    const stock = parseFloat(p.stock_actual) || 0;
    const minStock = parseFloat(p.stock_minimo) || 0;
    const cost = parseFloat(p.precio_costo_usd) || 0;
    const detail = parseFloat(p.precio_detalle_usd) || 0;

    totalValuationCostUSD += stock * cost;
    totalValuationDetailUSD += stock * detail;

    if (stock <= 0) {
      outOfStock.push({
        id: p.id,
        barcode: p.codigo_barras_clave || p.barcode,
        description: p.descripcion || p.description,
        category: p.categoria || p.category || 'General',
        stock: 0,
        priceUSD: detail,
        image: p.imagen_url || ''
      });
    } else if (stock <= minStock && minStock > 0) {
      lowStock.push({
        id: p.id,
        barcode: p.codigo_barras_clave || p.barcode,
        description: p.descripcion || p.description,
        category: p.categoria || p.category || 'General',
        stock,
        minStock,
        priceUSD: detail,
        image: p.imagen_url || ''
      });
    }
  }

  return {
    totalItemsCount,
    valuationCostUSD: Math.round(totalValuationCostUSD * 100) / 100,
    valuationDetailUSD: Math.round(totalValuationDetailUSD * 100) / 100,
    outOfStockCount: outOfStock.length,
    lowStockCount: lowStock.length,
    outOfStockItems: outOfStock.slice(0, 50),
    lowStockItems: lowStock.slice(0, 50)
  };
}

/**
 * Returns Financial Overview (CxC, CxP, Inversiones, Gastos)
 */
export async function getManagerFinancialSummary() {
  const clients = await getClients();
  const proveedores = await getProveedores();
  const gastos = await getGastosOperativos();
  const accionistas = await getAccionistas();
  const inversiones = await getInversiones();

  // Top Debtor Clients
  const topDebtors = clients
    .filter(c => (parseFloat(c.saldo_pendiente) || 0) > 0)
    .map(c => ({
      id: c.id,
      nombre: c.nombre,
      cedula_rif: c.cedula_rif,
      telefono: c.telefono,
      saldoPendiente: parseFloat(c.saldo_pendiente) || 0,
      limiteCredito: parseFloat(c.limite_credito) || 0
    }))
    .sort((a, b) => b.saldoPendiente - a.saldoPendiente)
    .slice(0, 10);

  // Top Creditor Suppliers (CxP)
  const topCreditors = proveedores
    .filter(p => (parseFloat(p.saldo_pendiente_usd) || 0) > 0)
    .map(p => ({
      id: p.id,
      razonSocial: p.razon_social,
      rif: p.rif,
      telefono: p.telefono,
      saldoPendienteUSD: parseFloat(p.saldo_pendiente_usd) || 0,
      diasCredito: p.dias_credito || 0
    }))
    .sort((a, b) => b.saldoPendienteUSD - a.saldoPendienteUSD)
    .slice(0, 10);

  const totalGastosUSD = gastos.reduce((acc, g) => acc + (parseFloat(g.monto_usd) || 0), 0);
  const totalInversionesUSD = inversiones.reduce((acc, i) => acc + (parseFloat(i.monto_usd) || 0), 0);

  return {
    totalCxC_USD: topDebtors.reduce((acc, d) => acc + d.saldoPendiente, 0),
    totalCxP_USD: topCreditors.reduce((acc, c) => acc + c.saldoPendienteUSD, 0),
    topDebtors,
    topCreditors,
    totalGastosUSD: Math.round(totalGastosUSD * 100) / 100,
    totalInversionesUSD: Math.round(totalInversionesUSD * 100) / 100,
    accionistasCount: accionistas.length,
    gastosRecientes: gastos.slice(0, 8)
  };
}
