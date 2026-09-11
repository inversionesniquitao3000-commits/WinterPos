import {
  getSales, getCierres, getOpenCajas, getProducts, getClients,
  getProveedores, getCompras, getPagosProveedores, getAbonos,
  getTasaHistory, getCompanyConfig, getGastosOperativos, getAccionistas, getInversiones,
  getMovimientosCajaByCajaId
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
  const allSales = await getSales(1000);
  const todayStr = getTodayString();

  const result = [];
  for (const c of openCajas) {
    const termName = c.terminal || c.estacion_nombre || 'CAJA_01';
    const cId = c.id;
    const fechaApertura = c.fechaApertura || c.fecha_apertura || '';
    const aperturaYMD = fechaApertura ? fechaApertura.substring(0, 10) : todayStr;

    // Filter sales assigned to this cash drawer session
    const cajaSales = allSales.filter(s => {
      if (s.estatus === 'Anulada') return false;
      // 1. Direct match by exact caja_id session
      if (s.caja_id && String(s.caja_id) === String(cId)) return true;
      // 2. Terminal name match and sale date on or after shift opening date
      const sTerm = String(s.terminal || '').trim().toUpperCase();
      const cTerm = String(termName).trim().toUpperCase();
      if (sTerm && cTerm && sTerm === cTerm) {
        const sYMD = s.fecha ? s.fecha.substring(0, 10) : '';
        return !sYMD || sYMD >= aperturaYMD;
      }
      return false;
    });

    let salesUsd = 0;
    let salesVes = 0;
    let cashSalesUsd = 0;
    let cashSalesVes = 0;
    let electronicUsd = 0;

    for (const s of cajaSales) {
      const sTotUsd = parseFloat(s.totalUSD ?? s.total_usd ?? 0) || 0;
      const sTotVes = parseFloat(s.totalVES ?? s.total_ves ?? 0) || 0;
      salesUsd += sTotUsd;
      salesVes += sTotVes;

      // Handle payments array (s.pagos or s.payments)
      const pagos = s.pagos || s.payments || [];
      for (const p of pagos) {
        const meth = String(p.metodo || p.metodo_pago || p.method || '').toLowerCase().trim();
        const pUsd = parseFloat(p.montoUSD ?? p.monto ?? p.monto_usd ?? p.amountUSD ?? 0) || 0;
        const pVes = parseFloat(p.montoVES ?? p.monto_ves ?? p.amountVES ?? 0) || 0;

        // Detection of cash payments ($ and Bs)
        const isCashUsd = meth === 'efectivo$' || meth === 'efectivo_usd' || meth === 'efectivousd' || (meth.includes('efectivo') && (meth.includes('$') || meth.includes('usd')));
        const isCashVes = meth === 'efectivobs' || meth === 'efectivo_ves' || meth === 'efectivoves' || (meth.includes('efectivo') && (meth.includes('bs') || meth.includes('ves')));
        const isGenericCash = meth === 'efectivo';

        if (isCashUsd || (isGenericCash && pUsd > 0 && pVes === 0)) {
          cashSalesUsd += pUsd;
        } else if (isCashVes || (isGenericCash && pVes > 0)) {
          cashSalesVes += pVes;
        } else {
          electronicUsd += pUsd;
        }
      }

      // If customer was given change from cash drawer, subtract change
      const vUsd = parseFloat(s.vueltoUSD ?? s.vuelto_usd ?? 0) || 0;
      const vVes = parseFloat(s.vueltoVES ?? s.vuelto_ves ?? 0) || 0;
      if (vUsd > 0) cashSalesUsd -= vUsd;
      if (vVes > 0) cashSalesVes -= vVes;
    }

    // Cash Drawer Base amounts on Opening
    const aperturaUsd = parseFloat(c.montoAperturaUsd ?? c.monto_apertura_usd ?? 0) || 0;
    const aperturaVes = parseFloat(c.montoAperturaVes ?? c.monto_apertura_ves ?? 0) || 0;

    // Shift Cash In / Cash Out Movements
    let shiftEntradasUsd = 0;
    let shiftEntradasVes = 0;
    let shiftSalidasUsd = 0;
    let shiftSalidasVes = 0;

    try {
      const movs = await getMovimientosCajaByCajaId(cId);
      for (const m of movs) {
        const mUsd = parseFloat(m.monto_usd || 0);
        const mVes = parseFloat(m.monto_ves || 0);
        const tipo = m.tipo;
        const mPago = String(m.metodo_pago || 'EFECTIVO').toUpperCase();
        const isCashUsd = mPago.includes('USD') || mPago.includes('$') || mPago === 'EFECTIVO';
        const isCashVes = mPago.includes('VES') || mPago.includes('BS');

        if (tipo === 'Entrada') {
          if (isCashUsd && mUsd > 0) shiftEntradasUsd += mUsd;
          if (isCashVes && mVes > 0) shiftEntradasVes += mVes;
        } else if (tipo === 'Salida' || tipo === 'Devolucion') {
          if (isCashUsd && mUsd > 0) shiftSalidasUsd += mUsd;
          if (isCashVes && mVes > 0) shiftSalidasVes += mVes;
        }
      }
    } catch (movErr) {
      console.warn('Error reading live cash drawer movements:', movErr.message);
    }

    // Live Cash Expected in Drawer: Base + Cash Sales + Entradas - Salidas
    const cashExpectedUsd = Math.max(0, aperturaUsd + cashSalesUsd + shiftEntradasUsd - shiftSalidasUsd);
    const cashExpectedVes = Math.max(0, aperturaVes + cashSalesVes + shiftEntradasVes - shiftSalidasVes);

    result.push({
      id: c.id,
      terminal: termName,
      cajero: c.usuarioNombre || c.usuario_nombre || c.usuario || 'Operador',
      fechaApertura,
      aperturaUsd: Math.round(aperturaUsd * 100) / 100,
      aperturaVes: Math.round(aperturaVes * 100) / 100,
      salesUsd: Math.round(salesUsd * 100) / 100,
      salesVes: Math.round(salesVes * 100) / 100,
      cashSalesUsd: Math.round(cashSalesUsd * 100) / 100,
      cashSalesVes: Math.round(cashSalesVes * 100) / 100,
      cashExpectedUsd: Math.round(cashExpectedUsd * 100) / 100,
      cashExpectedVes: Math.round(cashExpectedVes * 100) / 100,
      electronicUsd: Math.round(electronicUsd * 100) / 100,
      entradasUsd: Math.round(shiftEntradasUsd * 100) / 100,
      salidasUsd: Math.round(shiftSalidasUsd * 100) / 100,
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
