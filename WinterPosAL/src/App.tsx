import { useState, useEffect } from 'react';
import { 
  mockUsers, mockProducts, mockClients, mockTasaHistory, 
  mockConfig, mockMovements 
} from './mockData';
import { 
  User, Product, Client, TasaHistoryItem, CompanyConfig, 
  InventoryMovement, PriceAdjustmentHistory, SaleItem, Payment,
  Sale, CierreCaja
} from './types';
import LoginTerminal from './components/LoginTerminal';
import CajaPOS from './components/CajaPOS';
import Inventario from './components/Inventario';
import Clientes from './components/Clientes';
import TasaCambio from './components/TasaCambio';
import ConfiguracionEmpresa from './components/ConfiguracionEmpresa';
import VentasHistorico from './components/VentasHistorico';
import { 
  ShoppingBag, Package, Users, 
  TrendingUp, Settings, LogOut, Globe, Cpu, History
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // App States populated from mock data / local storage
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('pos_products');
    return saved ? JSON.parse(saved) : mockProducts;
  });

  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem('pos_clients');
    return saved ? JSON.parse(saved) : mockClients;
  });

  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(() => {
    const saved = localStorage.getItem('pos_biz_info');
    return saved ? JSON.parse(saved) : mockConfig;
  });

  const [tasaHistory, setTasaHistory] = useState<TasaHistoryItem[]>(() => {
    const saved = localStorage.getItem('pos_tasa_history');
    return saved ? JSON.parse(saved) : mockTasaHistory;
  });

  const [movements, setMovements] = useState<InventoryMovement[]>(() => {
    const saved = localStorage.getItem('pos_movements');
    return saved ? JSON.parse(saved) : mockMovements;
  });

  const [priceHistory, setPriceHistory] = useState<PriceAdjustmentHistory[]>(() => {
    const saved = localStorage.getItem('pos_price_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [sales, setSales] = useState<Sale[]>(() => {
    const saved = localStorage.getItem('pos_sales_log');
    return saved ? JSON.parse(saved) : [];
  });

  const [cierres, setCierres] = useState<CierreCaja[]>(() => {
    const saved = localStorage.getItem('pos_cierres_log');
    return saved ? JSON.parse(saved) : [];
  });

  const [cajaAbierta, setCajaAbierta] = useState<boolean>(() => {
    return localStorage.getItem('pos_caja_abierta') === 'true';
  });
  const [montoAperturaUsd, setMontoAperturaUsd] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pos_apertura_usd') || '0');
  });
  const [montoAperturaVes, setMontoAperturaVes] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pos_apertura_ves') || '0');
  });

  // Current session totals for Cash (USD/VES)
  const [cajaVentasUsd, setCajaVentasUsd] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pos_ventas_usd') || '0');
  });
  const [cajaVentasVes, setCajaVentasVes] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pos_ventas_ves') || '0');
  });
  const [cajaMovimientosUsd, setCajaMovimientosUsd] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pos_movimientos_usd') || '0'); 
  });
  const [cajaMovimientosVes, setCajaMovimientosVes] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pos_movimientos_ves') || '0'); 
  });

  // Shift logs states for detailed closing reports
  const [shiftSales, setShiftSales] = useState<Sale[]>(() => {
    const saved = localStorage.getItem('pos_shift_sales');
    return saved ? JSON.parse(saved) : [];
  });
  const [shiftAbonosUsd, setShiftAbonosUsd] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pos_shift_abonos') || '0');
  });
  const [shiftEntradasUsd, setShiftEntradasUsd] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pos_shift_entradas') || '0');
  });
  const [shiftSalidasUsd, setShiftSalidasUsd] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pos_shift_salidas') || '0');
  });

  const [lanIP, setLanIP] = useState('192.168.1.100');
  const [dbMode, setDbMode] = useState('remote');
  const [reprintSale, setReprintSale] = useState<Sale | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Active Pestaña Tab F1-F10
  const [activeTab, setActiveTab] = useState<'caja' | 'inventario' | 'ventas' | 'clientes' | 'tasa' | 'config'>('caja');

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('pos_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('pos_clients', JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem('pos_biz_info', JSON.stringify(companyConfig));
  }, [companyConfig]);

  useEffect(() => {
    localStorage.setItem('pos_tasa_history', JSON.stringify(tasaHistory));
  }, [tasaHistory]);

  useEffect(() => {
    localStorage.setItem('pos_movements', JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    localStorage.setItem('pos_price_history', JSON.stringify(priceHistory));
  }, [priceHistory]);

  useEffect(() => {
    localStorage.setItem('pos_sales_log', JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    localStorage.setItem('pos_cierres_log', JSON.stringify(cierres));
  }, [cierres]);

  useEffect(() => {
    localStorage.setItem('pos_shift_sales', JSON.stringify(shiftSales));
  }, [shiftSales]);

  useEffect(() => {
    localStorage.setItem('pos_shift_abonos', shiftAbonosUsd.toString());
  }, [shiftAbonosUsd]);

  useEffect(() => {
    localStorage.setItem('pos_shift_entradas', shiftEntradasUsd.toString());
  }, [shiftEntradasUsd]);

  useEffect(() => {
    localStorage.setItem('pos_shift_salidas', shiftSalidasUsd.toString());
  }, [shiftSalidasUsd]);

  useEffect(() => {
    const ip = localStorage.getItem('pos_lan_ip') || '192.168.1.100';
    const mode = localStorage.getItem('pos_db_mode') || 'remote';
    setLanIP(ip);
    setDbMode(mode);
  }, [currentUser]);

  const getApiUrl = (path: string) => {
    const host = dbMode === 'local' ? 'localhost' : lanIP;
    return `http://${host}:5000/api${path}`;
  };

  const postApiData = async (path: string, body: any) => {
    try {
      const res = await fetch(getApiUrl(path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error(`Error al enviar datos al servidor API central (${path}):`, err);
    }
    return null;
  };

  // Load all initial data from centralized backend database
  useEffect(() => {
    if (!currentUser) return;

    const loadAllData = async () => {
      console.log('Intentando conectar al servidor central:', getApiUrl('/status'));
      try {
        const statusRes = await fetch(getApiUrl('/status'));
        if (!statusRes.ok) throw new Error('Servidor no disponible');

        // Fetch config
        const configRes = await fetch(getApiUrl('/config'));
        if (configRes.ok) {
          const configData = await configRes.json();
          setCompanyConfig(configData);
        }

        // Fetch products
        const productsRes = await fetch(getApiUrl('/productos'));
        if (productsRes.ok) {
          const productsData = await productsRes.json();
          setProducts(productsData);
        }

        // Fetch clients
        const clientsRes = await fetch(getApiUrl('/clientes'));
        if (clientsRes.ok) {
          const clientsData = await clientsRes.json();
          setClients(clientsData);
        }

        // Fetch tasas
        const tasasRes = await fetch(getApiUrl('/tasas'));
        if (tasasRes.ok) {
          const tasasData = await tasasRes.json();
          setTasaHistory(tasasData);
        }

        // Fetch movements
        const movementsRes = await fetch(getApiUrl('/movements'));
        if (movementsRes.ok) {
          const movementsData = await movementsRes.json();
          setMovements(movementsData);
        }

        // Fetch price history
        const priceRes = await fetch(getApiUrl('/price-history'));
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          setPriceHistory(priceData);
        }

        // Fetch sales
        const salesRes = await fetch(getApiUrl('/sales'));
        if (salesRes.ok) {
          const salesData = await salesRes.json();
          setSales(salesData);
        }

        // Fetch active caja state
        const cajaRes = await fetch(getApiUrl('/cajas/estado'));
        if (cajaRes.ok) {
          const cajaData = await cajaRes.json();
          if (cajaData.abierta) {
            setCajaAbierta(true);
            setMontoAperturaUsd(cajaData.aperturaUsd || 0);
            setMontoAperturaVes(cajaData.aperturaVes || 0);
            setCajaVentasUsd(cajaData.ventasUsd || 0);
            setCajaVentasVes(cajaData.ventasVes || 0);
            setCajaMovimientosUsd(cajaData.movimientosUsd || 0);
            setCajaMovimientosVes(cajaData.movimientosVes || 0);
            setShiftSales(cajaData.shiftSales || []);
            setShiftAbonosUsd(cajaData.shiftAbonosUsd || 0);
            setShiftEntradasUsd(cajaData.shiftEntradasUsd || 0);
            setShiftSalidasUsd(cajaData.shiftSalidasUsd || 0);
          }
        }

        // Fetch cierres history
        const cierresRes = await fetch(getApiUrl('/cajas/cierres'));
        if (cierresRes.ok) {
          const cierresData = await cierresRes.json();
          setCierres(cierresData);
        }
      } catch (err) {
        console.warn('⚠️ No se pudo establecer conexión con el servidor API central. Utilizando datos locales (localStorage).');
      }
    };

    loadAllData();
  }, [currentUser, lanIP, dbMode]);

  // Keyboard Navigation Listener
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (!currentUser) return;
      
      if (e.key === 'F1') {
        e.preventDefault();
        setActiveTab('caja');
      } else if (e.key === 'F2') {
        e.preventDefault();
        setActiveTab('inventario');
      } else if (e.key === 'F3') {
        e.preventDefault();
        setActiveTab('ventas');
      } else if (e.key === 'F4') {
        e.preventDefault();
        setActiveTab('clientes');
      } else if (e.key === 'F5' || e.key === 'F9') {
        e.preventDefault();
        setActiveTab('tasa');
      } else if (e.key === 'F10') {
        e.preventDefault();
        setActiveTab('config');
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [currentUser]);

  // Escape key listener to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReprintSale(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Current active rates
  const currentTasa = tasaHistory[tasaHistory.length - 1];
  const tasaDia = currentTasa ? currentTasa.tasa_cobro : 40.00;
  const tasaVuelto = currentTasa ? currentTasa.tasa_vuelto : 40.00;

  const handleUpdateTasa = async (newDia: number, newVuelto: number) => {
    const newItem: TasaHistoryItem = {
      id: Date.now(),
      tasa_cobro: newDia,
      tasa_vuelto: newVuelto,
      fecha_actualizacion: new Date().toISOString().replace('T', ' ').substring(0, 16),
      usuario: currentUser?.nombre || 'SISTEMA'
    };
    const saved = await postApiData('/tasas', newItem);
    if (saved) {
      setTasaHistory(prev => [...prev, saved]);
    } else {
      setTasaHistory(prev => [...prev, newItem]);
    }
  };

  const handleAddProduct = async (prod: Product) => {
    const saved = await postApiData('/productos', prod);
    if (saved) {
      setProducts(prev => [...prev, saved]);
    } else {
      setProducts(prev => [...prev, prod]);
    }
  };

  const handleUpdateProductStock = async (
    prodId: number,
    type: 'Entrada' | 'Salida' | 'Merma' | 'Devolucion',
    qty: number,
    reason: string
  ) => {
    let nextStock = 0;
    let barcode = '';
    let description = '';
    
    setProducts(prev =>
      prev.map(p => {
        if (p.id === prodId) {
          const multiplier = (type === 'Entrada' || type === 'Devolucion') ? 1 : -1;
          nextStock = Math.max(0, p.stock_actual + qty * multiplier);
          barcode = p.barcode;
          description = p.description;
          return {
            ...p,
            stock_actual: nextStock
          };
        }
        return p;
      })
    );

    const multiplier = (type === 'Entrada' || type === 'Devolucion') ? 1 : -1;
    const newMov: InventoryMovement = {
      id: Date.now(),
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      productCode: barcode,
      productDescription: description,
      type,
      qty: qty * multiplier,
      stock_anterior: nextStock - (qty * multiplier),
      stock_posterior: nextStock,
      motivo: reason,
      usuario: currentUser?.nombre || 'SISTEMA'
    };
    setMovements(prevMovs => [...prevMovs, newMov]);

    await postApiData('/productos/stock', { id: prodId, stock_actual: nextStock });
    await postApiData('/movements', newMov);
  };

  const handleUpdateProductPrices = async (
    prodId: number,
    prices: { cost: number; detail: number; mayor: number },
    reason: string
  ) => {
    let oldCost = 0, oldDetail = 0, oldMayor = 0;
    let barcode = '';
    let description = '';

    setProducts(prev =>
      prev.map(p => {
        if (p.id === prodId) {
          oldCost = p.precio_costo_usd;
          oldDetail = p.precio_detalle_usd;
          oldMayor = p.precio_mayor_usd;
          barcode = p.barcode;
          description = p.description;
          return {
            ...p,
            precio_costo_usd: prices.cost,
            precio_detalle_usd: prices.detail,
            precio_mayor_usd: prices.mayor
          };
        }
        return p;
      })
    );

    const adjDate = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const user = currentUser?.nombre || 'SISTEMA';
    const logs: PriceAdjustmentHistory[] = [];

    if (oldCost !== prices.cost) {
      logs.push({
        id: Math.random(),
        date: adjDate,
        productCode: barcode,
        productDescription: description,
        type: 'Costo',
        precio_anterior: oldCost,
        precio_nuevo: prices.cost,
        motivo: reason,
        usuario: user
      });
    }

    if (oldDetail !== prices.detail) {
      logs.push({
        id: Math.random(),
        date: adjDate,
        productCode: barcode,
        productDescription: description,
        type: 'Detalle',
        precio_anterior: oldDetail,
        precio_nuevo: prices.detail,
        motivo: reason,
        usuario: user
      });
    }

    if (oldMayor !== prices.mayor) {
      logs.push({
        id: Math.random(),
        date: adjDate,
        productCode: barcode,
        productDescription: description,
        type: 'Mayor',
        precio_anterior: oldMayor,
        precio_nuevo: prices.mayor,
        motivo: reason,
        usuario: user
      });
    }

    if (logs.length > 0) {
      setPriceHistory(prevLogs => [...prevLogs, ...logs]);
      for (const log of logs) {
        await postApiData('/price-history', log);
      }
    }

    await postApiData('/productos/precios', { id: prodId, cost: prices.cost, detail: prices.detail, mayor: prices.mayor });
  };

  const handleAddClient = async (cli: Client) => {
    const saved = await postApiData('/clientes', cli);
    if (saved) {
      setClients(prev => [...prev, saved]);
    } else {
      setClients(prev => [...prev, cli]);
    }
  };

  const handleRegisterAbono = async (clientId: number, amountUSD: number) => {
    setClients(prev =>
      prev.map(c => {
        if (c.id === clientId) {
          const nextPending = Math.max(0, c.saldo_pendiente - amountUSD);
          const nextCreditAvailable = Math.min(c.limite_credito, c.credito_disponible + amountUSD);
          handleRegisterCajaMovement('Entrada', `Abono de Crédito Cliente: ${c.nombre}`, amountUSD, 0);
          return {
            ...c,
            saldo_pendiente: nextPending,
            credito_disponible: nextCreditAvailable
          };
        }
        return c;
      })
    );

    await postApiData('/clientes/abono', { id: clientId, monto: amountUSD });
  };

  const handleAbrirCaja = async (usd: number, ves: number) => {
    setCajaAbierta(true);
    setMontoAperturaUsd(usd);
    setMontoAperturaVes(ves);
    setCajaVentasUsd(0);
    setCajaVentasVes(0);
    setCajaMovimientosUsd(0);
    setCajaMovimientosVes(0);
    
    // Reset shift metrics
    setShiftSales([]);
    setShiftAbonosUsd(0);
    setShiftEntradasUsd(0);
    setShiftSalidasUsd(0);
    localStorage.removeItem('pos_shift_sales');
    localStorage.removeItem('pos_shift_abonos');
    localStorage.removeItem('pos_shift_entradas');
    localStorage.removeItem('pos_shift_salidas');

    localStorage.setItem('pos_caja_abierta', 'true');
    localStorage.setItem('pos_apertura_usd', usd.toString());
    localStorage.setItem('pos_apertura_ves', ves.toString());
    localStorage.setItem('pos_ventas_usd', '0');
    localStorage.setItem('pos_ventas_ves', '0');
    localStorage.setItem('pos_movimientos_usd', '0');
    localStorage.setItem('pos_movimientos_ves', '0');

    await postApiData('/cajas/abrir', { usd, ves });
  };

  const handleCerrarCaja = (
    realUsd: number, 
    realVes: number,
    details?: {
      ventasEfectivoUsd: number;
      abonoClientesUsd: number;
      entradaEfectivoUsd: number;
      salidaEfectivoUsd: number;
      devolucionEfectivoUsd: number;
      dineroEnCajaExpected: number;
      ventasTotalesUsd: number;
      descuentosUsd: number;
      ventaBrutaUsd: number;
      pagosEfectivoUsd: number;
      pagosTarjetaUsd: number;
      pagosCreditoUsd: number;
      pagosPuntosUsd: number;
      devolucionVentasUsd: number;
      ventaTotalUsd: number;
    }
  ): CierreCaja => {
    const expectedUsd = montoAperturaUsd + cajaVentasUsd + cajaMovimientosUsd;
    const expectedVes = montoAperturaVes + cajaVentasVes + cajaMovimientosVes;
    
    const newCierre: CierreCaja = {
      id: Date.now(),
      fecha: new Date().toISOString().replace('T', ' ').substring(0, 16),
      usuario: currentUser?.nombre || 'SISTEMA',
      aperturaUsd: montoAperturaUsd,
      aperturaVes: montoAperturaVes,
      realUsd,
      realVes,
      expectedVes,

      // Detailed cash registry metrics
      ventasEfectivoUsd: details?.ventasEfectivoUsd ?? cajaVentasUsd,
      abonoClientesUsd: details?.abonoClientesUsd ?? shiftAbonosUsd,
      entradaEfectivoUsd: details?.entradaEfectivoUsd ?? shiftEntradasUsd,
      salidaEfectivoUsd: details?.salidaEfectivoUsd ?? shiftSalidasUsd,
      devolucionEfectivoUsd: details?.devolucionEfectivoUsd ?? 0,
      dineroEnCajaExpected: details?.dineroEnCajaExpected ?? expectedUsd,
      
      // Detailed sales metrics
      ventasTotalesUsd: details?.ventasTotalesUsd ?? shiftSales.reduce((acc, s) => acc + s.totalUSD, 0),
      descuentosUsd: details?.descuentosUsd ?? shiftSales.reduce((acc, s) => acc + s.descuento, 0),
      ventaBrutaUsd: details?.ventaBrutaUsd ?? (shiftSales.reduce((acc, s) => acc + s.totalUSD, 0) + shiftSales.reduce((acc, s) => acc + s.descuento, 0)),
      pagosEfectivoUsd: details?.pagosEfectivoUsd ?? 0,
      pagosTarjetaUsd: details?.pagosTarjetaUsd ?? 0,
      pagosCreditoUsd: details?.pagosCreditoUsd ?? 0,
      pagosPuntosUsd: details?.pagosPuntosUsd ?? 0,
      devolucionVentasUsd: details?.devolucionVentasUsd ?? 0,
      ventaTotalUsd: details?.ventaTotalUsd ?? shiftSales.reduce((acc, s) => acc + s.totalUSD, 0),
    };
    
    setCierres(prev => [...prev, newCierre]);

    setCajaAbierta(false);
    setMontoAperturaUsd(0);
    setMontoAperturaVes(0);
    setCajaVentasUsd(0);
    setCajaVentasVes(0);
    setCajaMovimientosUsd(0);
    setCajaMovimientosVes(0);

    // Clear active shift logs
    setShiftSales([]);
    setShiftAbonosUsd(0);
    setShiftEntradasUsd(0);
    setShiftSalidasUsd(0);
    localStorage.removeItem('pos_shift_sales');
    localStorage.removeItem('pos_shift_abonos');
    localStorage.removeItem('pos_shift_entradas');
    localStorage.removeItem('pos_shift_salidas');

    localStorage.removeItem('pos_caja_abierta');
    localStorage.removeItem('pos_apertura_usd');
    localStorage.removeItem('pos_apertura_ves');
    localStorage.removeItem('pos_ventas_usd');
    localStorage.removeItem('pos_ventas_ves');
    localStorage.removeItem('pos_movimientos_usd');
    localStorage.removeItem('pos_movimientos_ves');

    postApiData('/cajas/cerrar', newCierre);
    return newCierre;
  };

  const handleRegisterCajaMovement = async (type: 'Entrada' | 'Salida', description: string, usd: number, ves: number) => {
    const mult = type === 'Entrada' ? 1 : -1;
    const nextUsd = cajaMovimientosUsd + usd * mult;
    const nextVes = cajaMovimientosVes + ves * mult;
    setCajaMovimientosUsd(nextUsd);
    setCajaMovimientosVes(nextVes);
    localStorage.setItem('pos_movimientos_usd', nextUsd.toString());
    localStorage.setItem('pos_movimientos_ves', nextVes.toString());

    // Track shift statistics
    if (type === 'Entrada') {
      if (description.startsWith('Abono')) {
        setShiftAbonosUsd(prev => prev + usd);
      } else {
        setShiftEntradasUsd(prev => prev + usd);
      }
    } else {
      setShiftSalidasUsd(prev => prev + usd);
    }

    await postApiData('/cajas/movimiento', { tipo: type, descripcion: description, usd, ves });
  };

  const handleRegisterSale = async (sale: {
    factura_nro: string;
    client: Client;
    items: SaleItem[];
    subtotal: number;
    descuento: number;
    totalUSD: number;
    totalVES: number;
    pagos: Payment[];
    vueltoUSD: number;
    vueltoVES: number;
  }) => {
    // 1. Decrement products stock and log Kardex
    setProducts(prevProds =>
      prevProds.map(p => {
        const item = sale.items.find(i => i.product.id === p.id);
        if (item) {
          const nextStock = Math.max(0, p.stock_actual - item.qty);
          
          const newMov: InventoryMovement = {
            id: Math.random(),
            date: new Date().toISOString().replace('T', ' ').substring(0, 16),
            productCode: p.barcode,
            productDescription: p.description,
            type: 'Venta',
            qty: -item.qty,
            stock_anterior: p.stock_actual,
            stock_posterior: nextStock,
            motivo: `Venta Facturada: ${sale.factura_nro}`,
            usuario: currentUser?.nombre || 'SISTEMA'
          };
          setMovements(prevMovs => [...prevMovs, newMov]);

          return { ...p, stock_actual: nextStock };
        }
        return p;
      })
    );

    // 2. Increment client pending balance if Credit was used
    const creditPayment = sale.pagos.find(p => p.metodo === 'CreditoCliente');
    if (creditPayment && creditPayment.montoUSD > 0) {
      setClients(prevClients =>
        prevClients.map(c => {
          if (c.id === sale.client.id) {
            return {
              ...c,
              saldo_pendiente: c.saldo_pendiente + creditPayment.montoUSD,
              credito_disponible: Math.max(0, c.credito_disponible - creditPayment.montoUSD)
            };
          }
          return c;
        })
      );
    }

    // 3. Log sale to processed list
    const newSaleObj: Sale = {
      ...sale,
      fecha: new Date().toISOString().replace('T', ' ').substring(0, 16),
      usuario: currentUser?.nombre || 'SISTEMA'
    };
    setSales(prev => [...prev, newSaleObj]);
    setShiftSales(prev => [...prev, newSaleObj]);

    // 4. Increment cash counters
    let cashUSDReceived = 0;
    let cashVESReceived = 0;
    
    sale.pagos.forEach(p => {
      if (p.metodo === 'Efectivo$') cashUSDReceived += p.monto;
      if (p.metodo === 'EfectivoBs') cashVESReceived += p.monto;
    });

    const nextVentasUsd = cajaVentasUsd + cashUSDReceived - sale.vueltoUSD;
    const nextVentasVes = cajaVentasVes + cashVESReceived - sale.vueltoVES;

    setCajaVentasUsd(nextVentasUsd);
    setCajaVentasVes(nextVentasVes);

    localStorage.setItem('pos_ventas_usd', nextVentasUsd.toString());
    localStorage.setItem('pos_ventas_ves', nextVentasVes.toString());

    await postApiData('/sales', newSaleObj);
  };

  const handleLogout = () => {
    if (cajaAbierta) {
      setShowLogoutConfirm(true);
      return;
    }
    setCurrentUser(null);
  };

  const handleReprint = (sale: Sale) => {
    setReprintSale(sale);
  };

  if (!currentUser) {
    return <LoginTerminal onLoginSuccess={setCurrentUser} systemUsers={mockUsers} companyConfig={companyConfig} />;
  }

  return (
    <div className="min-h-screen bg-winter-bg text-slate-800 flex flex-col font-mono selection:bg-winter-blueBtn selection:text-white">
      
      {/* HEADER SECTION - WinterPOS Colors */}
      <header className="bg-winter-header border-b border-slate-700/20 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none relative z-20 shadow-md text-white">
        
        {/* Left operator info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-emerald-450 font-black shadow-inner">
            <Cpu className="w-5 h-5 text-emerald-455" />
          </div>
          <div>
            <span className="text-slate-100 font-bold block">{currentUser.nombre.toUpperCase()}</span>
            <span className="text-[10px] text-slate-400 block uppercase font-sans tracking-wide">
              Rol: {currentUser.rol} | Estación: CAJA_01
            </span>
          </div>
        </div>

        {/* Center business brand */}
        <div className="text-center md:absolute md:left-1/2 md:-translate-x-1/2">
          <h2 className="text-sm font-extrabold tracking-widest text-winter-yellow uppercase">
            {companyConfig.nombre_comercio}
          </h2>
          <span className="text-[10px] text-slate-350 block mt-0.5 font-sans">
            RIF: {companyConfig.rif} | Telf: {companyConfig.telefono}
          </span>
        </div>

        {/* Right rates and network details */}
        <div className="flex items-center gap-4 text-[10px] font-sans">
          <div className="bg-slate-900 border border-slate-750 px-3 py-1.5 rounded flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-450" />
            <span className="text-slate-300 font-mono">Tasa BCV: <strong className="text-emerald-455">{tasaDia.toFixed(2)}</strong> Bs</span>
          </div>

          <div className="bg-slate-900 border border-slate-750 px-3 py-1.5 rounded flex items-center gap-1.5 text-slate-300">
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            <span>LAN Mode: <strong className="text-yellow-300 uppercase font-mono">{dbMode}</strong> ({lanIP})</span>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 bg-red-950/40 border border-red-900/30 text-red-400 hover:bg-red-900/40 hover:text-red-300 rounded transition-all"
            title="Cerrar Sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </header>

      {/* TABS BAR - WinterPOS Colors */}
      <nav className="bg-winter-tabBar border-b border-slate-900/40 px-6 py-2 select-none flex flex-wrap gap-1.5 z-10 text-slate-300">
        <button
          onClick={() => setActiveTab('caja')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold font-sans rounded-md transition-all ${
            activeTab === 'caja'
              ? 'tab-grad-caja text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          F1 CAJA
        </button>

        <button
          onClick={() => setActiveTab('inventario')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold font-sans rounded-md transition-all ${
            activeTab === 'inventario'
              ? 'tab-grad-inventario text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <Package className="w-4 h-4" />
          F2 Inventario
        </button>

        <button
          onClick={() => setActiveTab('ventas')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold font-sans rounded-md transition-all ${
            activeTab === 'ventas'
              ? 'tab-grad-ventas text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <History className="w-4 h-4" />
          F3 Ventas
        </button>

        <button
          onClick={() => setActiveTab('clientes')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold font-sans rounded-md transition-all ${
            activeTab === 'clientes'
              ? 'tab-grad-clientes text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <Users className="w-4 h-4" />
          F4 Clientes
        </button>

        <button
          onClick={() => setActiveTab('tasa')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold font-sans rounded-md transition-all ${
            activeTab === 'tasa'
              ? 'tab-grad-tasa text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          F9 Tasa
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold font-sans rounded-md transition-all ${
            activeTab === 'config'
              ? 'tab-grad-config text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <Settings className="w-4 h-4" />
          F10 Config.
        </button>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="flex-grow p-6 overflow-y-auto max-h-[calc(100vh-130px)]">
        <div className="max-w-[1600px] mx-auto">
          {activeTab === 'caja' && (
            <CajaPOS
              products={products}
              clients={clients}
              companyConfig={companyConfig}
              tasaDia={tasaDia}
              tasaVuelto={tasaVuelto}
              currentUser={currentUser}
              onRegisterSale={handleRegisterSale}
              onRegisterCajaMovement={handleRegisterCajaMovement}
              cajaAbierta={cajaAbierta}
              montoAperturaUsd={montoAperturaUsd}
              montoAperturaVes={montoAperturaVes}
              onAbrirCaja={handleAbrirCaja}
              onCerrarCaja={handleCerrarCaja}
              shiftSales={shiftSales}
              shiftAbonosUsd={shiftAbonosUsd}
              shiftEntradasUsd={shiftEntradasUsd}
              shiftSalidasUsd={shiftSalidasUsd}
            />
          )}

          {activeTab === 'inventario' && (
            <Inventario
              products={products}
              movements={movements}
              priceHistory={priceHistory}
              currentUser={currentUser}
              onAddProduct={handleAddProduct}
              onUpdateProductStock={handleUpdateProductStock}
              onUpdateProductPrices={handleUpdateProductPrices}
            />
          )}

          {activeTab === 'ventas' && (
            <VentasHistorico
              sales={sales}
              cierres={cierres}
              onReprintTicket={handleReprint}
            />
          )}

          {activeTab === 'clientes' && (
            <Clientes
              clients={clients}
              currentUser={currentUser}
              onAddClient={handleAddClient}
              onRegisterAbono={handleRegisterAbono}
            />
          )}

          {activeTab === 'tasa' && (
            <TasaCambio
              tasaDia={tasaDia}
              tasaVuelto={tasaVuelto}
              tasaHistory={tasaHistory}
              currentUser={currentUser}
              onUpdateTasa={handleUpdateTasa}
            />
          )}

          {activeTab === 'config' && (
            <ConfiguracionEmpresa
              config={companyConfig}
              onSaveConfig={setCompanyConfig}
            />
          )}
        </div>
      </main>

      {/* FOOTER BAR */}
      <footer className="bg-slate-900 border-t border-slate-800 py-3 px-6 select-none flex justify-between items-center text-[9px] text-slate-450 text-white">
        <span>Licencia activa para Inversiones Niquitao 3000 C.A.</span>
        <span>Operador: {currentUser.nombre} (Turno Activo)</span>
        <span>SISTEMA WINTERPOS-AL v4.0.0</span>
      </footer>

      {/* REPRINT TICKET MODAL */}
      {reprintSale && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-900">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden w-full max-w-sm shadow-2xl p-6 space-y-4">
            
            <div className="max-h-[60vh] overflow-y-auto bg-white p-5 rounded text-[10px] space-y-3">
              
              {/* Commerce info */}
              <div className="text-center">
                <h4 className="font-extrabold text-sm uppercase">{companyConfig.nombre_comercio}</h4>
                <p className="font-bold">RIF: {companyConfig.rif}</p>
                <p className="text-[9px] mt-0.5">{companyConfig.direccion}</p>
                <p>Telf: {companyConfig.telefono}</p>
              </div>

              <p className="text-center select-none text-slate-400">----------------------------------------</p>

              {/* Metadata */}
              <div className="space-y-0.5">
                <div>FACTURA: {reprintSale.factura_nro} (REIMPRESIÓN)</div>
                <div>FECHA: {reprintSale.fecha}</div>
                <div>CAJERO: {reprintSale.usuario.toUpperCase()}</div>
                <div>CLIENTE: {reprintSale.client.nombre.toUpperCase()}</div>
                <div>ID/RIF: {reprintSale.client.cedula_rif}</div>
              </div>

              <p className="text-center select-none text-slate-400">----------------------------------------</p>

              {/* Items */}
              <div className="space-y-1">
                <div className="flex font-bold justify-between">
                  <span className="w-1/2">CONCEPTO</span>
                  <span className="w-1/12 text-center">CT</span>
                  <span className="w-1/4 text-right">P.UN</span>
                  <span className="w-1/6 text-right">TOTAL</span>
                </div>
                {reprintSale.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="w-1/2 overflow-hidden truncate">{item.product.description}</span>
                    <span className="w-1/12 text-center">{item.qty}</span>
                    <span className="w-1/4 text-right">${item.priceUSD.toFixed(2)}</span>
                    <span className="w-1/6 text-right">${item.totalUSD.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <p className="text-center select-none text-slate-400">----------------------------------------</p>

              {/* Summary */}
              <div className="text-right space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>SUBTOTAL USD:</span>
                  <span>${reprintSale.subtotal.toFixed(2)}</span>
                </div>
                {reprintSale.descuento > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>DESCUENTO:</span>
                    <span>-${reprintSale.descuento.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-sm border-t border-slate-300 pt-1">
                  <span>TOTAL USD:</span>
                  <span>${reprintSale.totalUSD.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 font-bold border-t border-dashed border-slate-350 pt-1">
                  <span>TOTAL VES (Tasa {tasaDia.toFixed(2)}):</span>
                  <span>Bs {reprintSale.totalVES.toFixed(2)}</span>
                </div>
              </div>

              <p className="text-center select-none text-slate-400">----------------------------------------</p>

              {/* Payments & Change */}
              <div className="space-y-0.5">
                <span className="font-bold block">MEDIOS DE PAGO LIQUIDADOS:</span>
                {reprintSale.pagos.map((p, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{p.metodo} {p.bancoEmisor ? `(${p.bancoEmisor})` : ''} {p.reference ? `Ref:${p.reference}` : ''}:</span>
                    <span>{p.metodo.endsWith('$') || p.metodo.includes('Credito') ? `$${p.monto.toFixed(2)}` : `Bs ${p.monto.toFixed(2)}`}</span>
                  </div>
                ))}
                {reprintSale.vueltoVES > 0 && (
                  <div className="flex justify-between font-bold border-t border-slate-300 pt-1 text-[11px]">
                    <span>CAMBIO VES:</span>
                    <span>Bs {reprintSale.vueltoVES.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <p className="text-center select-none text-slate-400">----------------------------------------</p>

              <div className="text-center text-[9px] italic leading-relaxed text-slate-500">
                {companyConfig.mensaje_pie_ticket}
              </div>

            </div>

            <button
              onClick={() => setReprintSale(null)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all"
            >
              ACEPTAR Y REGRESAR
            </button>

          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE CIERRE DE SESIÓN */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-red-650 flex items-center gap-2">
                <LogOut className="w-4 h-4 text-red-600" />
                ADVERTENCIA DE SEGURIDAD
              </h3>
              <button onClick={() => setShowLogoutConfirm(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="text-xs space-y-3 font-sans text-slate-600">
              <p className="font-bold text-slate-800 text-sm">
                ⚠️ La caja registradora de este terminal se encuentra abierta.
              </p>
              <p>
                Si cierra la sesión, el turno y saldo de caja continuarán activos. Al volver a iniciar sesión, podrá continuar con las operaciones pendientes.
              </p>
              <p className="font-semibold text-red-500">
                ¿Está seguro de que desea cerrar la sesión actual del operador?
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="w-1/2 bg-slate-100 border border-slate-250 text-slate-600 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  setCurrentUser(null);
                }}
                className="w-1/2 bg-red-600 hover:bg-red-750 text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
              >
                SÍ, CERRAR SESIÓN
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
