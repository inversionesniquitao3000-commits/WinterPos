import { useState, useEffect, useRef } from 'react';
import { 
  mockUsers, 
  mockConfig 
} from './mockData';
import { 
  User, Product, Client, TasaHistoryItem, CompanyConfig, 
  InventoryMovement, PriceAdjustmentHistory, SaleItem, Payment,
  Sale, CierreCaja, Abono, CierreDetails
} from './types';

// Helper to get local date and time string in YYYY-MM-DD HH:MM format
export function getLocalISODateString(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

import LoginTerminal from './components/LoginTerminal';
import CajaPOS from './components/CajaPOS';
import Inventario from './components/Inventario';
import Clientes from './components/Clientes';
import TasaCambio from './components/TasaCambio';
import ConfiguracionEmpresa from './components/ConfiguracionEmpresa';
import VentasHistorico from './components/VentasHistorico';
import LicenciaModal from './components/LicenciaModal';
import { 
  ShoppingBag, Package, Users, 
  TrendingUp, Settings, LogOut, Globe, Cpu, History, Printer, CheckCircle2, ShieldCheck
} from 'lucide-react';
import { printTicketReceipt } from './utils';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [terminalName] = useState<string>(() => {
    const saved = localStorage.getItem('pos_terminal_name');
    if (saved) return saved;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const name = isLocal ? 'CAJA_01' : `CAJA_${window.location.hostname.replace(/\./g, '_')}`;
    localStorage.setItem('pos_terminal_name', name);
    return name;
  });
  
  // App States populated from local storage / backend API
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('pos_products');
    return saved ? JSON.parse(saved) : [];
  });

  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem('pos_clients');
    if (saved) return JSON.parse(saved);
    return [
      { id: 1, cedula_rif: 'V-00000000', nombre: 'CONSUMIDOR FINAL', telefono: '', direccion: 'LOCAL', limite_credito: 0, credito_disponible: 0, porcentaje_descuento: 0, estado: 'Activo', saldo_pendiente: 0 }
    ];
  });

  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(() => {
    const saved = localStorage.getItem('pos_biz_info');
    return saved ? JSON.parse(saved) : mockConfig;
  });

  const [tasaHistory, setTasaHistory] = useState<TasaHistoryItem[]>(() => {
    const saved = localStorage.getItem('pos_tasa_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [movements, setMovements] = useState<InventoryMovement[]>(() => {
    const saved = localStorage.getItem('pos_movements');
    return saved ? JSON.parse(saved) : [];
  });

  const [priceHistory, setPriceHistory] = useState<PriceAdjustmentHistory[]>(() => {
    const saved = localStorage.getItem('pos_price_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [sales, setSales] = useState<Sale[]>(() => {
    const saved = localStorage.getItem('pos_sales_log');
    return saved ? JSON.parse(saved) : [];
  });

  // Invoice reference state: fetched from server after each sale so the operator
  // sees the real last FAC- number and the estimated next correlative.
  // Actual assignment is always done server-side via seq_factura (atomic, collision-free).
  const [lastInvoiceInfo, setLastInvoiceInfo] = useState<{ last: string | null; next: string }>({ last: null, next: '---' });

  const [abonos, setAbonos] = useState<Abono[]>(() => {
    const saved = localStorage.getItem('pos_abonos');
    return saved ? JSON.parse(saved) : [];
  });

  const [cierres, setCierres] = useState<CierreCaja[]>(() => {
    const saved = localStorage.getItem('pos_cierres_log');
    return saved ? JSON.parse(saved) : [];
  });

  const [cajaAbierta, setCajaAbierta] = useState<boolean>(() => {
    const savedUser = localStorage.getItem('pos_current_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u && u.id) {
          return localStorage.getItem(`pos_caja_abierta_u_${u.id}`) === 'true';
        }
      } catch (_) {}
    }
    return false;
  });
  const [montoAperturaUsd, setMontoAperturaUsd] = useState<number>(() => {
    const savedUser = localStorage.getItem('pos_current_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u && u.id) {
          return parseFloat(localStorage.getItem(`pos_apertura_usd_u_${u.id}`) || '0');
        }
      } catch (_) {}
    }
    return 0;
  });
  const [montoAperturaVes, setMontoAperturaVes] = useState<number>(() => {
    const savedUser = localStorage.getItem('pos_current_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u && u.id) {
          return parseFloat(localStorage.getItem(`pos_apertura_ves_u_${u.id}`) || '0');
        }
      } catch (_) {}
    }
    return 0;
  });

  // Current session totals for Cash (USD/VES)
  const [cajaVentasUsd, setCajaVentasUsd] = useState<number>(0);
  const [cajaVentasVes, setCajaVentasVes] = useState<number>(0);
  const [cajaMovimientosUsd, setCajaMovimientosUsd] = useState<number>(0);
  const [cajaMovimientosVes, setCajaMovimientosVes] = useState<number>(0);

  // Shift logs states for detailed closing reports
  const [shiftSales, setShiftSales] = useState<Sale[]>([]);
  const [shiftAbonosUsd, setShiftAbonosUsd] = useState<number>(0);
  const [shiftEntradasUsd, setShiftEntradasUsd] = useState<number>(0);
  const [shiftEntradasVes, setShiftEntradasVes] = useState<number>(0);
  const [shiftSalidasUsd, setShiftSalidasUsd] = useState<number>(0);
  const [shiftSalidasVes, setShiftSalidasVes] = useState<number>(0);
  const [shiftDevolucionesUsd, setShiftDevolucionesUsd] = useState<number>(0);
  const [shiftDevolucionesVes, setShiftDevolucionesVes] = useState<number>(0);

  const [lanIP, setLanIP] = useState('192.168.1.100');
  const [dbMode, setDbMode] = useState('local');
  const [reprintSale, setReprintSale] = useState<Sale | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string>('');

  // Active Pestaña Tab F1-F10
  const [activeTab, setActiveTab] = useState<'caja' | 'inventario' | 'ventas' | 'clientes' | 'tasa' | 'config'>('caja');
  const [users, setUsers] = useState<User[]>(mockUsers);

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
    const current = tasaHistory[tasaHistory.length - 1];
    if (current && current.tasa_cobro > 0) {
      localStorage.setItem('pos_tasa_activa', current.tasa_cobro.toString());
    }
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
    localStorage.setItem('pos_abonos', JSON.stringify(abonos));
  }, [abonos]);

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
    localStorage.setItem('pos_shift_entradas_ves', shiftEntradasVes.toString());
  }, [shiftEntradasVes]);

  useEffect(() => {
    localStorage.setItem('pos_shift_salidas', shiftSalidasUsd.toString());
  }, [shiftSalidasUsd]);

  useEffect(() => {
    localStorage.setItem('pos_shift_salidas_ves', shiftSalidasVes.toString());
  }, [shiftSalidasVes]);

  useEffect(() => {
    localStorage.setItem('pos_shift_devoluciones', shiftDevolucionesUsd.toString());
  }, [shiftDevolucionesUsd]);

  useEffect(() => {
    localStorage.setItem('pos_shift_devoluciones_ves', shiftDevolucionesVes.toString());
  }, [shiftDevolucionesVes]);

  useEffect(() => {
    const ip = localStorage.getItem('pos_lan_ip') || '192.168.1.100';
    const mode = localStorage.getItem('pos_db_mode') || 'local';
    setLanIP(ip);
    setDbMode(mode);
  }, [currentUser]);

  const getApiUrl = (path: string) => {
    // Auto-detect: if browser is accessed via a LAN IP (not localhost), use that same IP for API
    const browserHost = window.location.hostname;
    const isRemoteAccess = browserHost !== 'localhost' && browserHost !== '127.0.0.1';
    const host = isRemoteAccess ? browserHost : (dbMode === 'local' ? 'localhost' : lanIP);
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

  const [licenseStatus, setLicenseStatus] = useState<{
    status: string;
    isValid: boolean;
    hwid: string;
    payload?: any;
    daysRemaining?: number | null;
    message?: string;
  } | null>(null);

  const fetchLicenseStatus = async () => {
    try {
      const res = await fetch(getApiUrl(`/license/status?terminal=${encodeURIComponent(terminalName)}`), {
        headers: { 'X-Terminal-ID': terminalName }
      });
      if (res.ok) {
        const data = await res.json();
        setLicenseStatus(data);
      }
    } catch (err) {
      console.warn('⚠️ No se pudo consultar el estado de la licencia al servidor.');
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
    const interval = setInterval(fetchLicenseStatus, 60000);
    return () => clearInterval(interval);
  }, [terminalName, lanIP, dbMode]);

  // Load business config, users, and official BCV rate immediately when app starts
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configRes = await fetch(getApiUrl('/config'));
        if (configRes.ok) {
          const configData = await configRes.json();
          setCompanyConfig(configData);
        }
      } catch (err) {
        console.warn('⚠️ No se pudo obtener la configuración del negocio al iniciar.');
      }
      try {
        const usersRes = await fetch(getApiUrl('/users'));
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setUsers(usersData);
        }
      } catch (err) {
        console.warn('⚠️ No se pudo obtener la lista de usuarios al iniciar.');
      }
      try {
        const bcvRes = await fetch(getApiUrl('/bcv'));
        if (bcvRes.ok) {
          const bcvData = await bcvRes.json();
          if (bcvData && bcvData.usd) {
            const parsed = parseFloat(bcvData.usd.toString().replace(',', '.'));
            if (!isNaN(parsed) && parsed > 0) {
              setBcvRateUSD(parsed);
              localStorage.setItem('pos_bcv_usd', parsed.toString());
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ No se pudo obtener la tasa oficial del BCV al iniciar.');
      }
    };
    loadConfig();
  }, [lanIP, dbMode]);

  // Fetch last invoice number from server for operator reference display
  const fetchLastInvoice = async () => {
    try {
      const res = await fetch(getApiUrl('/sales/last-invoice'));
      if (res.ok) {
        const data = await res.json();
        setLastInvoiceInfo({ last: data.last, next: data.next });
      }
    } catch (_) {
      // Silent fail — not critical
    }
  };

  // Load on login
  useEffect(() => {
    if (currentUser) fetchLastInvoice();
  }, [currentUser, lanIP, dbMode]);

  // Refresh clients automatically when entering the clients tab
  useEffect(() => {
    if (activeTab === 'clientes') {
      const fetchClients = async () => {
        try {
          const res = await fetch(getApiUrl('/clientes'));
          if (res.ok) {
            const data = await res.json();
            setClients(data);
          }
        } catch (err) {
          console.error('Error al actualizar clientes al entrar al módulo:', err);
        }
      };
      fetchClients();
    }
  }, [activeTab, lanIP, dbMode]);

  // Refresh products, movements, and price history automatically when entering the inventario tab
  useEffect(() => {
    if (activeTab === 'inventario') {
      const fetchInventarioData = async () => {
        try {
          const productsRes = await fetch(getApiUrl('/productos'));
          if (productsRes.ok) {
            const productsData = await productsRes.json();
            setProducts(productsData.map((p: any) => ({
              ...p,
              stock_actual: parseFloat(p.stock_actual) || 0,
              stock_minimo: parseFloat(p.stock_minimo) || 0,
            })));
          }
        } catch (err) {
          console.error('Error al actualizar productos al entrar al inventario:', err);
        }

        try {
          const movementsRes = await fetch(getApiUrl('/movements'));
          if (movementsRes.ok) {
            const movementsData = await movementsRes.json();
            setMovements(movementsData);
          }
        } catch (err) {
          console.error('Error al actualizar movimientos al entrar al inventario:', err);
        }

        try {
          const priceRes = await fetch(getApiUrl('/price-history'));
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            const normalized = priceData.map((h: any) => ({
              id: h.id,
              date: h.date,
              productCode: h.productCode,
              productDescription: h.productDescription || '',
              type: h.type || h.priceType || 'Costo',
              precio_anterior: parseFloat(h.precio_anterior ?? h.oldPrice ?? 0),
              precio_nuevo: parseFloat(h.precio_nuevo ?? h.newPrice ?? 0),
              motivo: h.motivo || '',
              usuario: h.usuario || 'SISTEMA'
            }));
            setPriceHistory(normalized);
          }
        } catch (err) {
          console.error('Error al actualizar historial de precios al entrar al inventario:', err);
        }
      };
      fetchInventarioData();
    }
  }, [activeTab, lanIP, dbMode]);

  // Refresh sales (facturas/transacciones) and cierres de caja automatically when entering the ventas tab
  useEffect(() => {
    if (activeTab === 'ventas') {
      const fetchVentasData = async () => {
        try {
          const salesRes = await fetch(getApiUrl('/sales'));
          if (salesRes.ok) {
            const salesData = await salesRes.json();
            setSales(salesData);
            localStorage.setItem('pos_sales_log', JSON.stringify(salesData));
          }
        } catch (err) {
          console.error('Error al actualizar ventas al entrar al módulo:', err);
        }

        try {
          const cierresRes = await fetch(getApiUrl('/cajas/cierres'));
          if (cierresRes.ok) {
            const cierresData = await cierresRes.json();
            setCierres(cierresData);
            localStorage.setItem('pos_cierres_log', JSON.stringify(cierresData));
          }
        } catch (err) {
          console.error('Error al actualizar cierres de caja al entrar al módulo:', err);
        }
      };
      fetchVentasData();
    }
  }, [activeTab, lanIP, dbMode]);

  // Refresh rate history (tasas) automatically from database when entering tasa tab or on login
  useEffect(() => {
    if (activeTab === 'tasa' || currentUser) {
      const fetchTasasData = async () => {
        try {
          const res = await fetch(getApiUrl('/tasas'));
          if (res.ok) {
            const data = await res.json();
            setTasaHistory(data);
            localStorage.setItem('pos_tasa_history', JSON.stringify(data));
          }
        } catch (err) {
          console.error('Error al actualizar historial de tasas desde BD:', err);
        }
      };
      fetchTasasData();
    }
  }, [activeTab, currentUser, lanIP, dbMode]);

  // Load initial company config and users on mount (so Login screen updates immediately)
  useEffect(() => {
    const fetchInitialConfigAndUsers = async () => {
      try {
        const configRes = await fetch(getApiUrl('/config'));
        if (configRes.ok) {
          const configData = await configRes.json();
          setCompanyConfig(configData);
          localStorage.setItem('pos_biz_info', JSON.stringify(configData));
        }
        const usersRes = await fetch(getApiUrl('/users'));
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setUsers(usersData);
        }
      } catch (_) {}
    };
    fetchInitialConfigAndUsers();
  }, [lanIP, dbMode]);

  // Multi-terminal unified sync polling (every 1 second)
  // Syncs: new sales (by ID), tasa changes, cierres updates, company config updates, and session closure detection
  const sessionStartRef = useRef<number>(Date.now());
  const salesRef = useRef(sales);
  salesRef.current = sales;
  const cierresRef = useRef(cierres);
  cierresRef.current = cierres;
  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  const productsRef = useRef(products);
  productsRef.current = products;
  const tasaHistoryRef = useRef(tasaHistory);
  tasaHistoryRef.current = tasaHistory;
  const companyConfigRef = useRef(companyConfig);
  companyConfigRef.current = companyConfig;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  useEffect(() => {
    if (currentUser) {
      sessionStartRef.current = Date.now();
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const myTerminal = localStorage.getItem('pos_terminal_name') || 'CAJA_01';

    const pollSync = async () => {
      try {
        const user = currentUserRef.current;
        if (!user) return;

        const safeSales = Array.isArray(salesRef.current) ? salesRef.current : [];
        const safeCierres = Array.isArray(cierresRef.current) ? cierresRef.current : [];
        const safeClients = Array.isArray(clientsRef.current) ? clientsRef.current : [];
        const safeProducts = Array.isArray(productsRef.current) ? productsRef.current : [];
        const safeTasas = Array.isArray(tasaHistoryRef.current) ? tasaHistoryRef.current : [];

        // Calculate max known IDs from current state
        const maxSaleId = safeSales.reduce((max, s) => Math.max(max, s?.id || 0), 0);
        
        // Calculate latest active rate details
        const currentTasaObj = safeTasas[safeTasas.length - 1];
        const lastTasaCobro = currentTasaObj ? (currentTasaObj.tasa_cobro || 0) : 0;
        const lastTasaVuelto = currentTasaObj ? (currentTasaObj.tasa_vuelto || 0) : 0;
        const tasasCount = safeTasas.length;
        
        // Calculate cierres parameters
        const cierresCount = safeCierres.length;
        const maxCierreId = safeCierres.reduce((max, c) => Math.max(max, c?.id || 0), 0);
        const cierresSig = safeCierres.reduce((acc, c) => acc + (c?.realUsd || 0) + (c?.realVes || 0), 0);

        // Calculate clients parameters
        const clientsCount = safeClients.length;
        const clientsSig = safeClients.reduce((acc, c) => acc + (c?.id || 0) + (c?.limite_credito || 0) + (c?.saldo_pendiente || 0), 0);

        // Calculate products parameters
        const productsCount = safeProducts.length;
        const productsSig = safeProducts.reduce((acc, p) => acc + (p?.id || 0) + (p?.stock_actual || 0) + (p?.precio_detalle_usd || 0), 0);

        // Calculate abonos parameters
        const safeAbonos = Array.isArray(abonos) ? abonos : [];
        const abonosCount = safeAbonos.length;
        const abonosSig = safeAbonos.reduce((acc, a) => acc + (a?.id || 0) + (a?.monto || 0) + (a?.monto_ves || 0), 0);

        const params = new URLSearchParams({
          since_id: String(maxSaleId),
          last_tasa_cobro: String(lastTasaCobro),
          last_tasa_vuelto: String(lastTasaVuelto),
          tasas_count: String(tasasCount),
          cierres_count: String(cierresCount),
          last_cierre_id: String(maxCierreId),
          cierres_signature: String(cierresSig),
          clients_count: String(clientsCount),
          clients_sig: String(clientsSig),
          products_count: String(productsCount),
          products_sig: String(productsSig),
          abonos_count: String(abonosCount),
          abonos_sig: String(abonosSig),
          config_name: companyConfigRef.current?.nombre_comercio || '',
          config_rif: companyConfigRef.current?.rif || '',
          terminal: myTerminal,
          usuario: user ? (user.nombre || user.usuario) : '',
          usuario_id: user ? String(user.id) : '',
          session_since: String(sessionStartRef.current)
        });

        const res = await fetch(getApiUrl(`/sync/poll?${params.toString()}`));
        if (!res.ok) return;
        const data = await res.json();

        // 1. Company config updated from central server
        if (data.config) {
          console.log('[Sync] Configuración de empresa actualizada desde el servidor central.');
          setCompanyConfig(data.config);
          localStorage.setItem('pos_biz_info', JSON.stringify(data.config));
        }

        // 2. New sales from other terminals
        if (data.sales && data.sales.length > 0) {
          console.log(`[Sync] ${data.sales.length} venta(s) nueva(s) de otras terminales.`);
          setSales(prev => {
            const existingIds = new Set(prev.map(s => s.id));
            const existingFacs = new Set(prev.map(s => s.factura_nro));
            const trulyNew = data.sales.filter((s: any) => !existingIds.has(s.id) && !existingFacs.has(s.factura_nro));
            return trulyNew.length > 0 ? [...prev, ...trulyNew] : prev;
          });
          fetchLastInvoice();
        }

        // Always sync active caja state for the current logged in user across all terminals
        if (currentUserRef.current) {
          const u = currentUserRef.current;
          fetch(getApiUrl(`/cajas/estado?terminal=${encodeURIComponent(myTerminal)}&usuarioId=${u.id}&usuarioNombre=${encodeURIComponent(u.nombre)}`))
            .then(r => r.ok ? r.json() : null)
            .then(cajaData => {
              if (cajaData) {
                const uKey = `u_${u.id}`;
                if (cajaData.abierta) {
                  setCajaAbierta(true);
                  const openUsd = cajaData.aperturaUsd || 0;
                  const openVes = cajaData.aperturaVes || 0;
                  setMontoAperturaUsd(openUsd);
                  setMontoAperturaVes(openVes);
                  setCajaVentasUsd(cajaData.ventasUsd || 0);
                  setCajaVentasVes(cajaData.ventasVes || 0);
                  setCajaMovimientosUsd(cajaData.movimientosUsd || 0);
                  setCajaMovimientosVes(cajaData.movimientosVes || 0);
                  setShiftSales(cajaData.shiftSales || []);
                  setShiftAbonosUsd(cajaData.shiftAbonosUsd || 0);
                  setShiftEntradasUsd(cajaData.shiftEntradasUsd || 0);
                  setShiftSalidasUsd(cajaData.shiftSalidasUsd || 0);

                  localStorage.setItem(`pos_caja_abierta_${uKey}`, 'true');
                  localStorage.setItem(`pos_apertura_usd_${uKey}`, openUsd.toString());
                  localStorage.setItem(`pos_apertura_ves_${uKey}`, openVes.toString());
                } else {
                  setCajaAbierta(false);
                  setMontoAperturaUsd(0);
                  setMontoAperturaVes(0);
                  localStorage.removeItem(`pos_caja_abierta_${uKey}`);
                  localStorage.removeItem(`pos_apertura_usd_${uKey}`);
                  localStorage.removeItem(`pos_apertura_ves_${uKey}`);
                }
              }
            })
            .catch(() => {});
        }

        // 3. Tasa updated from another terminal
        if (data.tasas) {
          console.log('[Sync] Tasa de cambio actualizada desde otra terminal.');
          setTasaHistory(data.tasas);
        }

        // 4. Cierres list updated from another terminal
        if (data.cierres) {
          console.log('[Sync] Historial de cierres de caja actualizado desde el servidor central.');
          setCierres(data.cierres);
        }

        // 5. Clients list updated from another terminal
        if (data.clients) {
          console.log('[Sync] Catálogo de clientes actualizado desde otra terminal.');
          setClients(data.clients);
        }

        // 6. Products catalog updated from another terminal
        if (data.products) {
          console.log('[Sync] Catálogo de productos actualizado desde otra terminal.');
          setProducts(data.products);
        }

        // 7. Abonos history updated from another terminal
        if (data.abonos) {
          console.log('[Sync] Historial de abonos de clientes actualizado desde otra terminal.');
          setAbonos(data.abonos);
        }

        // 7. Session closure detection for non-administrators
        if (data.sessionClosed && user && user.rol.toLowerCase() !== 'administrador') {
          console.warn('[Sync] Cierre de caja detectado para el usuario actual. Finalizando sesión en la red local.');
          
          const uKey = `u_${user.id}`;
          localStorage.removeItem(`pos_caja_abierta_${uKey}`);
          localStorage.removeItem(`pos_apertura_usd_${uKey}`);
          localStorage.removeItem(`pos_apertura_ves_${uKey}`);
          localStorage.removeItem(`pos_ventas_usd_${uKey}`);
          localStorage.removeItem(`pos_ventas_ves_${uKey}`);
          localStorage.removeItem(`pos_movimientos_usd_${uKey}`);
          localStorage.removeItem(`pos_movimientos_ves_${uKey}`);
          localStorage.removeItem(`pos_apertura_fecha_${uKey}`);
          
          setCajaAbierta(false);
          setMontoAperturaUsd(0);
          setMontoAperturaVes(0);
          setCajaVentasUsd(0);
          setCajaVentasVes(0);
          setCajaMovimientosUsd(0);
          setCajaMovimientosVes(0);
          setShiftSales([]);
          
          setSessionNotice('⚠️ Su turno de caja ha sido cerrado desde la red local. Su sesión fue finalizada. Inicie sesión nuevamente para realizar una nueva apertura.');
          setCurrentUser(null);
        }
      } catch (pollErr) {
        console.error('[Sync Poll Error]', pollErr);
      }
    };

    pollSync();
    const interval = setInterval(pollSync, 1000);
    return () => clearInterval(interval);
  }, [currentUser?.id, lanIP, dbMode]);

  // Load all initial data from centralized backend database
  useEffect(() => {
    if (!currentUser) return;

    // Synchronously set user shift state from local storage immediately so UI doesn't delay or flicker
    const uKey = `u_${currentUser.id}`;
    const localOpen = localStorage.getItem(`pos_caja_abierta_${uKey}`) === 'true';
    setCajaAbierta(localOpen);
    if (localOpen) {
      setMontoAperturaUsd(parseFloat(localStorage.getItem(`pos_apertura_usd_${uKey}`) || '0'));
      setMontoAperturaVes(parseFloat(localStorage.getItem(`pos_apertura_ves_${uKey}`) || '0'));
      setCajaVentasUsd(parseFloat(localStorage.getItem(`pos_ventas_usd_${uKey}`) || '0'));
      setCajaVentasVes(parseFloat(localStorage.getItem(`pos_ventas_ves_${uKey}`) || '0'));
      setCajaMovimientosUsd(parseFloat(localStorage.getItem(`pos_movimientos_usd_${uKey}`) || '0'));
      setCajaMovimientosVes(parseFloat(localStorage.getItem(`pos_movimientos_ves_${uKey}`) || '0'));
      const savedSales = localStorage.getItem(`pos_shift_sales_${uKey}`);
      setShiftSales(savedSales ? JSON.parse(savedSales) : []);
    } else {
      setMontoAperturaUsd(0);
      setMontoAperturaVes(0);
      setCajaVentasUsd(0);
      setCajaVentasVes(0);
      setCajaMovimientosUsd(0);
      setCajaMovimientosVes(0);
      setShiftSales([]);
    }

    const loadAllData = async () => {
      console.log('Intentando conectar al servidor central:', getApiUrl('/status'));
      try {
        const statusRes = await fetch(getApiUrl('/status'));
        if (!statusRes.ok) throw new Error('Servidor no disponible');

        // Fetch all endpoints in parallel for maximum network performance (1 single round trip over LAN)
        const [
          configRes,
          productsRes,
          clientsRes,
          tasasRes,
          movementsRes,
          priceRes,
          salesRes,
          abonosRes,
          cajaRes,
          cierresRes
        ] = await Promise.all([
          fetch(getApiUrl('/config')),
          fetch(getApiUrl('/productos')),
          fetch(getApiUrl('/clientes')),
          fetch(getApiUrl('/tasas')),
          fetch(getApiUrl('/movements')),
          fetch(getApiUrl('/price-history')),
          fetch(getApiUrl('/sales')),
          fetch(getApiUrl('/abonos')),
          fetch(getApiUrl(`/cajas/estado?terminal=${encodeURIComponent(terminalName)}&usuarioId=${currentUser.id}&usuarioNombre=${encodeURIComponent(currentUser.nombre)}`)),
          fetch(getApiUrl('/cajas/cierres'))
        ]);

        if (configRes.ok) {
          const configData = await configRes.json();
          setCompanyConfig(configData);
        }

        if (productsRes.ok) {
          const productsData = await productsRes.json();
          setProducts(productsData.map((p: any) => ({
            ...p,
            stock_actual: parseFloat(p.stock_actual) || 0,
            stock_minimo: parseFloat(p.stock_minimo) || 0,
          })));
        }

        if (clientsRes.ok) {
          const clientsData = await clientsRes.json();
          setClients(clientsData);
        }

        if (tasasRes.ok) {
          const tasasData = await tasasRes.json();
          setTasaHistory(tasasData);
        }

        if (movementsRes.ok) {
          const movementsData = await movementsRes.json();
          setMovements(movementsData);
        }

        if (priceRes.ok) {
          const priceData = await priceRes.json();
          const normalized = priceData.map((h: any) => ({
            id: h.id,
            date: h.date,
            productCode: h.productCode,
            productDescription: h.productDescription || '',
            type: h.type || h.priceType || 'Costo',
            precio_anterior: parseFloat(h.precio_anterior ?? h.oldPrice ?? 0),
            precio_nuevo: parseFloat(h.precio_nuevo ?? h.newPrice ?? 0),
            motivo: h.motivo || '',
            usuario: h.usuario || 'SISTEMA'
          }));
          setPriceHistory(normalized);
        }

        if (salesRes.ok) {
          const salesData = await salesRes.json();
          setSales(salesData);
        }

        if (abonosRes.ok) {
          const abonosData = await abonosRes.json();
          setAbonos(abonosData);
        }

        if (cajaRes.ok) {
          const cajaData = await cajaRes.json();
          const uKey = `u_${currentUser.id}`;
          if (cajaData.abierta) {
            setCajaAbierta(true);
            const openUsd = cajaData.aperturaUsd || 0;
            const openVes = cajaData.aperturaVes || 0;
            setMontoAperturaUsd(openUsd);
            setMontoAperturaVes(openVes);
            setCajaVentasUsd(cajaData.ventasUsd || 0);
            setCajaVentasVes(cajaData.ventasVes || 0);
            setCajaMovimientosUsd(cajaData.movimientosUsd || 0);
            setCajaMovimientosVes(cajaData.movimientosVes || 0);
            setShiftSales(cajaData.shiftSales || []);
            setShiftAbonosUsd(cajaData.shiftAbonosUsd || 0);
            setShiftEntradasUsd(cajaData.shiftEntradasUsd || 0);
            setShiftSalidasUsd(cajaData.shiftSalidasUsd || 0);

            // Sync with local storage so remote machines don't retain stale local storage values
            localStorage.setItem(`pos_caja_abierta_${uKey}`, 'true');
            localStorage.setItem(`pos_apertura_usd_${uKey}`, openUsd.toString());
            localStorage.setItem(`pos_apertura_ves_${uKey}`, openVes.toString());
            localStorage.setItem(`pos_ventas_usd_${uKey}`, (cajaData.ventasUsd || 0).toString());
            localStorage.setItem(`pos_ventas_ves_${uKey}`, (cajaData.ventasVes || 0).toString());
            localStorage.setItem(`pos_movimientos_usd_${uKey}`, (cajaData.movimientosUsd || 0).toString());
            localStorage.setItem(`pos_movimientos_ves_${uKey}`, (cajaData.movimientosVes || 0).toString());
          } else {
            // Explicitly reset caja state for fresh session so user is prompted for Apertura
            setCajaAbierta(false);
            setMontoAperturaUsd(0);
            setMontoAperturaVes(0);
            setCajaVentasUsd(0);
            setCajaVentasVes(0);
            setCajaMovimientosUsd(0);
            setCajaMovimientosVes(0);
            setShiftSales([]);
            setShiftAbonosUsd(0);
            setShiftEntradasUsd(0);
            setShiftSalidasUsd(0);
            localStorage.removeItem(`pos_caja_abierta_${uKey}`);
            localStorage.removeItem(`pos_apertura_usd_${uKey}`);
            localStorage.removeItem(`pos_apertura_ves_${uKey}`);
            localStorage.removeItem('pos_caja_abierta');
            localStorage.removeItem('pos_apertura_usd');
            localStorage.removeItem('pos_apertura_ves');
          }
        }

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
      
      if (e.key === 'F1' && hasModulePermission('caja', 'ver')) {
        e.preventDefault();
        setActiveTab('caja');
      } else if (e.key === 'F2' && hasModulePermission('inventario', 'ver')) {
        e.preventDefault();
        setActiveTab('inventario');
      } else if (e.key === 'F3' && hasModulePermission('ventas', 'ver')) {
        e.preventDefault();
        setActiveTab('ventas');
      } else if (e.key === 'F4' && hasModulePermission('clientes', 'ver')) {
        e.preventDefault();
        setActiveTab('clientes');
      } else if ((e.key === 'F5' || e.key === 'F9') && hasModulePermission('tasa', 'ver')) {
        e.preventDefault();
        setActiveTab('tasa');
      } else if (e.key === 'F10' && hasModulePermission('config', 'ver')) {
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

  const handleUpdateTasa = async (newDia: number, newVuelto: number, userOverrideLabel?: string) => {
    const newItem = {
      tasa_cobro: newDia,
      tasa_vuelto: newVuelto,
      usuarioId: currentUser?.id,
      usuario: userOverrideLabel || currentUser?.nombre || 'SISTEMA'
    };
    const saved = await postApiData('/tasas', newItem);
    if (saved) {
      setTasaHistory(prev => [...prev, saved]);
    }
  };

  // Auto BCV Rate Sync on User Login (Executes once per login session with duplicate prevention)
  useEffect(() => {
    if (!currentUser) return;

    const autoMode = (localStorage.getItem('pos_auto_tasa_mode') as 'off' | 'usd' | 'eur') || 'off';
    if (autoMode === 'off') return;

    const sessionKey = `pos_auto_rate_synced_${currentUser.id}_${new Date().toISOString().substring(0, 10)}`;
    if (sessionStorage.getItem(sessionKey)) {
      return; // Already ran for this login session
    }

    const syncAutoBcvRateOnLogin = async () => {
      try {
        const res = await fetch(getApiUrl('/bcv'));
        if (!res.ok) throw new Error('Respuesta HTTP no exitosa');
        const bcvData = await res.json();
        if (!bcvData) throw new Error('Respuesta vacía');

        const rawValStr = autoMode === 'eur' ? bcvData.eur : bcvData.usd;
        if (!rawValStr) throw new Error('Tasa no encontrada en respuesta BCV');

        const cleanedVal = parseFloat(rawValStr.toString().replace(',', '.'));
        if (isNaN(cleanedVal) || cleanedVal <= 0) throw new Error('Valor numérico de tasa inválido');

        const targetRate = Math.round(cleanedVal * 100) / 100;
        const todayStr = new Date().toISOString().substring(0, 10);

        // Strict Duplicate Prevention Filter
        const latestHistory = tasaHistory.length > 0 ? tasaHistory[tasaHistory.length - 1] : null;
        const latestDateStr = latestHistory?.fecha_actualizacion ? latestHistory.fecha_actualizacion.substring(0, 10) : '';

        const isDuplicate = latestHistory &&
          latestDateStr === todayStr &&
          Math.abs(latestHistory.tasa_cobro - targetRate) < 0.001 &&
          Math.abs(latestHistory.tasa_vuelto - targetRate) < 0.001;

        sessionStorage.setItem(sessionKey, 'done');

        if (isDuplicate) {
          console.log(`[Auto BCV] La tasa del día ya está actualizada a ${targetRate} Bs (${autoMode.toUpperCase()}). Se omite registro duplicado.`);
          return;
        }

        console.log(`[Auto BCV] Sincronizando automáticamente al inicio de sesión: ${targetRate} Bs (${autoMode.toUpperCase()} BCV)...`);
        const userLabel = autoMode === 'eur' ? 'SISTEMA (Auto BCV €)' : 'SISTEMA (Auto BCV $)';
        await handleUpdateTasa(targetRate, targetRate, userLabel);
      } catch (err: any) {
        console.warn(`[Auto BCV Fallback] Sin conexión a internet o API BCV no disponible (${err?.message || err}). La operativa del sistema continúa normalmente con la última tasa activa registrada.`);
        sessionStorage.setItem(sessionKey, 'done');
      }
    };

    syncAutoBcvRateOnLogin();
  }, [currentUser?.id, tasaHistory.length]);

  const handleClearTasaHistory = async () => {
    try {
      const res = await fetch(getApiUrl('/tasas/clear'), { method: 'DELETE' });
      if (res.ok) {
        setTasaHistory([]);
      }
    } catch (err) {
      console.error('Error al vaciar historial de tasas:', err);
    }
  };


  const handleAddProduct = async (prod: Product) => {
    const saved = await postApiData('/productos', prod);
    const cleanedSaved = saved ? {
      ...saved,
      stock_actual: parseFloat(saved.stock_actual) || 0,
      stock_minimo: parseFloat(saved.stock_minimo) || 0,
    } : null;
    const cleanedProd = {
      ...prod,
      stock_actual: parseFloat(prod.stock_actual as any) || 0,
      stock_minimo: parseFloat(prod.stock_minimo as any) || 0,
    };
    if (cleanedSaved) {
      setProducts(prev => [...prev, cleanedSaved]);
    } else {
      setProducts(prev => [...prev, cleanedProd]);
    }
  };

  const handleAddProductsBulk = async (productsArray: any[]) => {
    try {
      const res = await fetch(getApiUrl('/productos/bulk'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(productsArray)
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.removeItem('pos_products');
        return data.count;
      } else {
        const errData = await res.json();
        alert(`Error al importar productos: ${errData.error || 'No se pudo guardar'}`);
        return null;
      }
    } catch (err: any) {
      alert(`Error de conexión con el servidor: ${err.message}`);
      return null;
    }
  };

  const handleUpdateProduct = async (prod: Product) => {
    try {
      const res = await fetch(getApiUrl(`/productos/${prod.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(prod)
      });
      if (res.ok) {
        const saved = await res.json();
        const cleanedSaved = {
          ...saved,
          stock_actual: parseFloat(saved.stock_actual) || 0,
          stock_minimo: parseFloat(saved.stock_minimo) || 0,
        };
        setProducts(prev => prev.map(p => p.id === prod.id ? cleanedSaved : p));
        return true;
      } else {
        const errData = await res.json();
        alert(`Error al actualizar producto: ${errData.error || 'No se pudo guardar'}`);
        return false;
      }
    } catch (err: any) {
      alert(`Error de conexión con el servidor: ${err.message}`);
      return false;
    }
  };

  const handleDeleteProduct = async (prodId: number) => {
    try {
      const response = await fetch(getApiUrl(`/productos/${prodId}`), {
        method: 'DELETE'
      });
      if (response.ok) {
        setProducts(prev => prev.filter(p => p.id !== prodId));
        return true;
      } else {
        const err = await response.json();
        alert(`Error al eliminar producto: ${err.error || 'No se pudo completar la operación'}`);
        return false;
      }
    } catch (err: any) {
      alert(`Error al conectar con el servidor: ${err.message}`);
      return false;
    }
  };

  const handleUpdateProductStock = async (
    prodId: number,
    type: 'Entrada' | 'Salida' | 'Merma' | 'Devolucion' | 'Entrada Rápida' | 'Devolución',
    qty: number,
    reason: string
  ) => {
    const product = products.find(p => p.id === prodId);
    if (!product) return;

    const normalizedType = type === 'Devolución' ? 'Devolucion' : type;
    const isAdd = normalizedType === 'Entrada' || normalizedType === 'Devolucion' || normalizedType === 'Entrada Rápida';
    const multiplier = isAdd ? 1 : -1;
    
    const cleanQty = product.a_granel ? qty : Math.round(qty);
    let nextStock = product.stock_actual + cleanQty * multiplier;
    if (!product.a_granel) {
      nextStock = Math.round(nextStock);
    }
    nextStock = Math.max(0, nextStock);
    
    setProducts(prev =>
      prev.map(p => {
        if (p.id === prodId) {
          return {
            ...p,
            stock_actual: nextStock
          };
        }
        return p;
      })
    );

    const newMov: InventoryMovement = {
      id: Date.now(),
      date: getLocalISODateString(),
      productCode: product.barcode,
      productDescription: product.description,
      type: normalizedType,
      qty: cleanQty * multiplier,
      stock_anterior: product.stock_actual,
      stock_posterior: nextStock,
      motivo: reason,
      usuario: currentUser?.nombre || 'SISTEMA'
    };
    setMovements(prevMovs => [...prevMovs, newMov]);

    await postApiData('/productos/stock', { id: prodId, stock_actual: nextStock });
    await postApiData('/movements', newMov);
  };

  const handleUpdateProductStockBulk = async (
    updates: {
      prodId: number;
      qty: number;
      precio_costo_usd: number;
      precio_detalle_usd: number;
      precio_mayor_usd: number;
    }[],
    reason: string
  ) => {
    try {
      const updatedProducts = [...products];
      const newMovements: InventoryMovement[] = [];
      const newPriceLogs: PriceAdjustmentHistory[] = [];

      for (const update of updates) {
        const productIndex = updatedProducts.findIndex(p => p.id === update.prodId);
        if (productIndex === -1) continue;
        const product = updatedProducts[productIndex];

        const cleanQty = product.a_granel ? update.qty : Math.round(update.qty);
        let nextStock = product.stock_actual + cleanQty;
        if (!product.a_granel) {
          nextStock = Math.round(nextStock);
        }
        nextStock = Math.max(0, nextStock);

        const oldCost = product.precio_costo_usd;
        const oldDetail = product.precio_detalle_usd;
        const oldMayor = product.precio_mayor_usd;

        let costChanged = update.precio_costo_usd !== oldCost;
        let detailChanged = update.precio_detalle_usd !== oldDetail;
        let mayorChanged = update.precio_mayor_usd !== oldMayor;

        updatedProducts[productIndex] = {
          ...product,
          stock_actual: nextStock,
          precio_costo_usd: update.precio_costo_usd,
          precio_detalle_usd: update.precio_detalle_usd,
          precio_mayor_usd: update.precio_mayor_usd
        };

        const newMov: InventoryMovement = {
          id: Date.now() + Math.random(),
          date: getLocalISODateString(),
          productCode: product.barcode,
          productDescription: product.description,
          type: 'Entrada',
          qty: cleanQty,
          stock_anterior: product.stock_actual,
          stock_posterior: nextStock,
          motivo: reason,
          usuario: currentUser?.nombre || 'SISTEMA'
        };
        newMovements.push(newMov);

        const adjDate = getLocalISODateString();
        const user = currentUser?.nombre || 'SISTEMA';

        if (costChanged) {
          newPriceLogs.push({
            id: Date.now() + Math.random(),
            date: adjDate,
            productCode: product.barcode,
            productDescription: product.description,
            type: 'Costo',
            precio_anterior: oldCost,
            precio_nuevo: update.precio_costo_usd,
            motivo: `Carga por Factura: ${reason}`,
            usuario: user
          });
        }
        if (detailChanged) {
          newPriceLogs.push({
            id: Date.now() + Math.random() + 0.1,
            date: adjDate,
            productCode: product.barcode,
            productDescription: product.description,
            type: 'Detalle',
            precio_anterior: oldDetail,
            precio_nuevo: update.precio_detalle_usd,
            motivo: `Carga por Factura: ${reason}`,
            usuario: user
          });
        }
        if (mayorChanged) {
          newPriceLogs.push({
            id: Date.now() + Math.random() + 0.2,
            date: adjDate,
            productCode: product.barcode,
            productDescription: product.description,
            type: 'Mayor',
            precio_anterior: oldMayor,
            precio_nuevo: update.precio_mayor_usd,
            motivo: `Carga por Factura: ${reason}`,
            usuario: user
          });
        }
      }

      setProducts(updatedProducts);
      setMovements(prev => [...prev, ...newMovements]);
      if (newPriceLogs.length > 0) {
        setPriceHistory(prev => [...prev, ...newPriceLogs]);
      }

      // Save stocks
      await Promise.all(updates.map(update => {
        const prod = updatedProducts.find(p => p.id === update.prodId);
        if (!prod) return Promise.resolve();
        return postApiData('/productos/stock', { id: update.prodId, stock_actual: prod.stock_actual });
      }));

      // Save prices in bulk using existing endpoint
      const priceUpdates = updates.map(update => ({
        id: update.prodId,
        cost: update.precio_costo_usd,
        detail: update.precio_detalle_usd,
        mayor: update.precio_mayor_usd
      }));
      await postApiData('/productos/precios/bulk', {
        updates: priceUpdates,
        historyLogs: newPriceLogs
      });

      // Save movements
      await Promise.all(newMovements.map(mov => postApiData('/movements', mov)));

      return true;
    } catch (err) {
      console.error('Error al actualizar inventario en lote:', err);
      return false;
    }
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

    const adjDate = getLocalISODateString();
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

  const handleUpdateProductPricesBulk = async (
    updates: { id: number; cost: number; detail: number; mayor: number }[],
    historyLogs: any[]
  ) => {
    try {
      const res = await fetch(getApiUrl('/productos/precios/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, historyLogs })
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.success) {
          return false;
        }
        setProducts(prev =>
          prev.map(p => {
            const upd = updates.find(u => u.id === p.id);
            if (upd) {
              return {
                ...p,
                precio_costo_usd: upd.cost,
                precio_detalle_usd: upd.detail,
                precio_mayor_usd: upd.mayor
              };
            }
            return p;
          })
        );
        const adjDate = getLocalISODateString();
        const user = currentUser?.nombre || 'SISTEMA';
        const formattedLogs = historyLogs.map(l => {
          const matchedProd = products.find(p => p.barcode === l.productCode);
          return {
            id: Math.random(),
            date: adjDate,
            productCode: l.productCode,
            productDescription: matchedProd ? matchedProd.description : '',
            type: l.priceType || l.type || 'Costo',
            precio_anterior: parseFloat(l.precio_anterior ?? l.oldPrice ?? 0),
            precio_nuevo: parseFloat(l.precio_nuevo ?? l.newPrice ?? 0),
            motivo: l.motivo || '',
            usuario: user
          };
        });
        setPriceHistory(prev => [...prev, ...formattedLogs]);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error al actualizar precios masivamente:', err);
      return false;
    }
  };

  const handleAddClient = async (cli: Client) => {
    const saved = await postApiData('/clientes', cli);
    if (saved) {
      setClients(prev => [...prev, saved]);
    } else {
      setClients(prev => [...prev, cli]);
    }
  };

  const handleRegisterAbono = async (
    clientId: number, 
    amountUSD: number,   // total abono in USD (for client credit update)
    payments: import('./types').AbonoPayment[],  // one entry per payment method used
    observacion: string = ''
  ) => {
    // 1. Update local client state (credit/balance)
    setClients(prev =>
      prev.map(c => {
        if (c.id === clientId) {
          const nextPending = Math.max(0, c.saldo_pendiente - amountUSD);
          const nextCreditAvailable = Math.min(c.limite_credito, c.credito_disponible + amountUSD);
          return { ...c, saldo_pendiente: nextPending, credito_disponible: nextCreditAvailable };
        }
        return c;
      })
    );

    // 2. Register one caja movement and one Abono record per payment method
    for (const pago of payments) {
      const { metodo_pago, monto_usd, monto_ves, referencia } = pago;

      // Update local caja movement tracker
      handleRegisterCajaMovement(
        'Entrada',
        `Abono de Crédito Cliente (${metodo_pago})`,
        monto_usd,
        monto_ves
      );

      // Append to local abonos state
      const clientData = clients.find(c => c.id === clientId);
      const newAbonoLog: Abono = {
        id: Date.now() + Math.random(),
        cliente_id: clientId,
        nombre: clientData?.nombre || '',
        cedula_rif: clientData?.cedula_rif || '',
        monto: monto_usd,
        metodo_pago: metodo_pago as import('./types').MetodoPagoAbono,
        monto_ves: monto_ves,
        referencia: referencia || undefined,
        observacion: observacion || undefined,
        usuario: currentUser?.nombre || 'SISTEMA',
        fecha: getLocalISODateString()
      };
      setAbonos(prev => [...prev, newAbonoLog]);

      // 3. Persist each payment line separately in the DB
      await postApiData('/clientes/abono', {
        id: clientId,
        monto_usd,
        monto_ves,
        metodo_pago,
        referencia: referencia || '',
        observacion: observacion || '',
        usuario_id: currentUser?.id || null
      });
    }
  };

  const handleUpdateClient = async (updatedCli: Client) => {
    try {
      const res = await fetch(getApiUrl(`/clientes/${updatedCli.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedCli)
      });
      if (res.ok) {
        const saved = await res.json();
        setClients(prev => prev.map(c => c.id === updatedCli.id ? saved : c));
        return true;
      } else {
        const errData = await res.json();
        alert(`Error al actualizar cliente: ${errData.error || 'Error desconocido'}`);
        return false;
      }
    } catch (err: any) {
      console.error('Error al actualizar cliente:', err);
      setClients(prev => prev.map(c => c.id === updatedCli.id ? updatedCli : c));
      return true;
    }
  };

  const handleDeleteClient = async (clientId: number) => {
    try {
      const res = await fetch(getApiUrl(`/clientes/${clientId}`), {
        method: 'DELETE'
      });
      if (res.ok) {
        setClients(prev => prev.filter(c => c.id !== clientId));
        return true;
      } else {
        const errData = await res.json();
        alert(`Error al eliminar cliente: ${errData.error || 'Error desconocido'}`);
        return false;
      }
    } catch (err: any) {
      console.error('Error al eliminar cliente:', err);
      setClients(prev => prev.filter(c => c.id !== clientId));
      return true;
    }
  };


  const handleAbrirCaja = async (usd: number, ves: number) => {
    try {
      const uKey = currentUser ? `u_${currentUser.id}` : 'guest';

      // 1. Send opening request to centralized server
      await postApiData('/cajas/abrir', { 
        usd, 
        ves, 
        usuarioId: currentUser?.id, 
        usuarioNombre: currentUser?.nombre, 
        terminal: terminalName 
      });

      // 2. Set active state and local cache
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
      localStorage.removeItem(`pos_shift_sales_${uKey}`);
      localStorage.removeItem(`pos_shift_abonos_${uKey}`);
      localStorage.removeItem(`pos_shift_entradas_${uKey}`);
      localStorage.removeItem(`pos_shift_salidas_${uKey}`);

      localStorage.setItem(`pos_caja_abierta_${uKey}`, 'true');
      localStorage.setItem(`pos_apertura_usd_${uKey}`, usd.toString());
      localStorage.setItem(`pos_apertura_ves_${uKey}`, ves.toString());
      localStorage.setItem(`pos_ventas_usd_${uKey}`, '0');
      localStorage.setItem(`pos_ventas_ves_${uKey}`, '0');
      localStorage.setItem(`pos_movimientos_usd_${uKey}`, '0');
      localStorage.setItem(`pos_movimientos_ves_${uKey}`, '0');
      localStorage.setItem(`pos_apertura_fecha_${uKey}`, getLocalISODateString());
      
      // Clean up legacy global keys
      localStorage.removeItem('pos_caja_abierta');
      localStorage.removeItem('pos_apertura_usd');
      localStorage.removeItem('pos_apertura_ves');
    } catch (err) {
      console.error('Error al aperturar caja:', err);
    }
  };

  const handleCerrarCaja = async (
    realUsd: number, 
    realVes: number,
    details?: CierreDetails
  ): Promise<CierreCaja> => {
    const uKey = currentUser ? `u_${currentUser.id}` : 'guest';
    const expectedUsd = montoAperturaUsd + cajaVentasUsd + cajaMovimientosUsd;
    const expectedVes = montoAperturaVes + cajaVentasVes + cajaMovimientosVes;
    
    // Calculate total cost of items sold during this shift
    const costoTotalUsd = shiftSales.reduce((acc, sale) => {
      return acc + (sale.items || []).reduce((itemAcc, item) => {
        return itemAcc + ((item.product.precio_costo_usd || 0) * item.qty);
      }, 0);
    }, 0);
    const ventaTotalUsd = details?.ventaTotalUsd ?? shiftSales.reduce((acc, s) => acc + s.totalUSD, 0);
    const utilidadUsd = Math.max(0, ventaTotalUsd - costoTotalUsd);
    
    const newCierre: CierreCaja = {
      ...details,
      id: Date.now(),
      fecha: getLocalISODateString(),
      fechaCierre: getLocalISODateString(),
      fechaApertura: localStorage.getItem(`pos_apertura_fecha_${uKey}`) || localStorage.getItem('pos_apertura_fecha') || getLocalISODateString(),
      usuario: currentUser?.nombre || 'SISTEMA',
      usuarioId: currentUser?.id,
      terminal: terminalName,
      aperturaUsd: details?.aperturaUsd ?? montoAperturaUsd,
      aperturaVes: details?.aperturaVes ?? montoAperturaVes,
      realUsd,
      realVes,
      expectedVes: details?.expectedVes ?? expectedVes,
      costoTotalUsd: details?.costoTotalUsd ?? costoTotalUsd,
      utilidadUsd: details?.utilidadUsd ?? utilidadUsd,

      // Detailed cash registry metrics
      ventasEfectivoUsd: details?.ventasEfectivoUsd ?? cajaVentasUsd,
      ventasEfectivoVes: details?.ventasEfectivoVes ?? cajaVentasVes,
      abonoClientesUsd: details?.abonoClientesUsd ?? shiftAbonosUsd,
      abonoClientesVes: details?.abonoClientesVes ?? 0,
      entradaEfectivoUsd: details?.entradaEfectivoUsd ?? shiftEntradasUsd,
      entradaEfectivoVes: details?.entradaEfectivoVes ?? shiftEntradasVes,
      salidaEfectivoUsd: details?.salidaEfectivoUsd ?? shiftSalidasUsd,
      salidaEfectivoVes: details?.salidaEfectivoVes ?? shiftSalidasVes,
      devolucionEfectivoUsd: details?.devolucionEfectivoUsd ?? shiftDevolucionesUsd,
      devolucionEfectivoVes: details?.devolucionEfectivoVes ?? shiftDevolucionesVes,
      vueltosEntregadosUsd: details?.vueltosEntregadosUsd ?? 0,
      vueltosEntregadosVes: details?.vueltosEntregadosVes ?? 0,
      dineroEnCajaExpected: details?.dineroEnCajaExpected ?? expectedUsd,
      
      // Detailed sales metrics
      ventasTotalesUsd: details?.ventasTotalesUsd ?? shiftSales.reduce((acc, s) => acc + s.totalUSD, 0),
      descuentosUsd: details?.descuentosUsd ?? shiftSales.reduce((acc, s) => acc + s.descuento, 0),
      ventaBrutaUsd: details?.ventaBrutaUsd ?? (shiftSales.reduce((acc, s) => acc + s.totalUSD, 0) + shiftSales.reduce((acc, s) => acc + s.descuento, 0)),
      pagosEfectivoUsd: details?.pagosEfectivoUsd ?? 0,
      pagosEfectivoBsUsd: details?.pagosEfectivoBsUsd ?? 0,
      pagosEfectivoBsVes: details?.pagosEfectivoBsVes ?? 0,
      pagosBiopagoUsd: details?.pagosBiopagoUsd ?? 0,
      pagosBiopagoVes: details?.pagosBiopagoVes ?? 0,
      pagosPuntoUsd: details?.pagosPuntoUsd ?? 0,
      pagosPuntoVes: details?.pagosPuntoVes ?? 0,
      pagosPagoMovilUsd: details?.pagosPagoMovilUsd ?? 0,
      pagosPagoMovilVes: details?.pagosPagoMovilVes ?? 0,
      pagosTarjetaUsd: details?.pagosTarjetaUsd ?? 0,
      pagosCreditoUsd: details?.pagosCreditoUsd ?? 0,
      pagosPuntosUsd: details?.pagosPuntosUsd ?? 0,
      devolucionVentasUsd: details?.devolucionVentasUsd ?? 0,
      devolucionVentasVes: details?.devolucionVentasVes ?? 0,
      ventaTotalUsd,
    };
    
    setCierres(prev => [...prev, newCierre]);

    setCajaAbierta(false);
    setMontoAperturaUsd(0);
    setMontoAperturaVes(0);
    setCajaVentasUsd(0);
    setCajaVentasVes(0);
    setCajaMovimientosUsd(0);
    setCajaMovimientosVes(0);

    // Clear active shift logs for this user
    setShiftSales([]);
    setShiftAbonosUsd(0);
    setShiftEntradasUsd(0);
    setShiftEntradasVes(0);
    setShiftSalidasUsd(0);
    setShiftSalidasVes(0);
    setShiftDevolucionesUsd(0);
    setShiftDevolucionesVes(0);
    localStorage.removeItem(`pos_shift_sales_${uKey}`);
    localStorage.removeItem(`pos_shift_abonos_${uKey}`);
    localStorage.removeItem(`pos_shift_entradas_${uKey}`);
    localStorage.removeItem(`pos_shift_entradas_ves_${uKey}`);
    localStorage.removeItem(`pos_shift_salidas_${uKey}`);
    localStorage.removeItem(`pos_shift_salidas_ves_${uKey}`);
    localStorage.removeItem(`pos_shift_devoluciones_${uKey}`);
    localStorage.removeItem(`pos_shift_devoluciones_ves_${uKey}`);

    localStorage.removeItem(`pos_caja_abierta_${uKey}`);
    localStorage.removeItem(`pos_apertura_usd_${uKey}`);
    localStorage.removeItem(`pos_apertura_ves_${uKey}`);
    localStorage.removeItem(`pos_ventas_usd_${uKey}`);
    localStorage.removeItem(`pos_ventas_ves_${uKey}`);
    localStorage.removeItem(`pos_movimientos_usd_${uKey}`);
    localStorage.removeItem(`pos_movimientos_ves_${uKey}`);
    localStorage.removeItem(`pos_apertura_fecha_${uKey}`);

    // Clear legacy global keys
    localStorage.removeItem('pos_caja_abierta');
    localStorage.removeItem('pos_apertura_usd');
    localStorage.removeItem('pos_apertura_ves');
    localStorage.removeItem('pos_ventas_usd');
    localStorage.removeItem('pos_ventas_ves');
    localStorage.removeItem('pos_movimientos_usd');
    localStorage.removeItem('pos_movimientos_ves');
    localStorage.removeItem('pos_apertura_fecha');

    await postApiData('/cajas/cerrar', newCierre);
    setCurrentUser(null);
    return newCierre;
  };


  const handleRegisterCajaMovement = async (type: 'Entrada' | 'Salida' | 'Devolucion', description: string, usd: number, ves: number) => {
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
        if (usd > 0) setShiftAbonosUsd(prev => prev + usd);
      } else {
        setShiftEntradasUsd(prev => prev + usd);
        setShiftEntradasVes(prev => prev + ves);
      }
    } else if (type === 'Salida') {
      setShiftSalidasUsd(prev => prev + usd);
      setShiftSalidasVes(prev => prev + ves);
    } else if (type === 'Devolucion') {
      if (usd > 0) {
        setShiftDevolucionesUsd(prev => {
          const next = prev + usd;
          localStorage.setItem('pos_shift_devoluciones', next.toString());
          return next;
        });
      }
      if (ves > 0) {
        setShiftDevolucionesVes(prev => {
          const next = prev + ves;
          localStorage.setItem('pos_shift_devoluciones_ves', next.toString());
          return next;
        });
      }
    }

    await postApiData('/cajas/movimiento', {
      tipo: type,
      descripcion: description,
      usd,
      ves,
      terminal: terminalName,
      usuarioId: currentUser?.id,
      usuarioNombre: currentUser?.nombre
    });
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
    // 1. Decrement products stock and log Kardex (only for regular sales, not returns)
    const isDev = sale.factura_nro.startsWith('DEV-');
    if (!isDev) {
      setProducts(prevProds =>
        prevProds.map(p => {
          const item = sale.items.find(i => i.product.id === p.id);
          if (item) {
            const cleanQty = p.a_granel ? item.qty : Math.round(item.qty);
            let nextStock = p.stock_actual - cleanQty;
            if (!p.a_granel) {
              nextStock = Math.round(nextStock);
            }
            nextStock = Math.max(0, nextStock);
            
            const newMov: InventoryMovement = {
              id: Math.random(),
              date: getLocalISODateString(),
              productCode: p.barcode,
              productDescription: p.description,
              type: 'Venta',
              qty: -cleanQty,
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
    }

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

    // 3. Log sale to processed list with a temporary invoice number
    const tempSaleObj: Sale = {
      ...sale,
      fecha: getLocalISODateString(),
      usuario: currentUser?.nombre || 'SISTEMA',
      terminal: terminalName
    };
    setSales(prev => [...prev, tempSaleObj]);
    setShiftSales(prev => [...prev, tempSaleObj]);

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

    // 5. Send to server — server returns the definitive factura_nro from seq_factura
    try {
      const res = await fetch(getApiUrl('/sales'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tempSaleObj)
      });

      if (!res.ok) {
        // Server returned error (HTTP 500) — ROLLBACK local state to avoid phantom sale
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || `Error HTTP ${res.status} al guardar la venta en el servidor.`;
        console.error('❌ Error al registrar venta en servidor:', errMsg);
        
        // Revert optimistic local state updates
        setSales(prev => prev.filter(s => s !== tempSaleObj));
        setShiftSales(prev => prev.filter(s => s !== tempSaleObj));
        setCajaVentasUsd(cajaVentasUsd);
        setCajaVentasVes(cajaVentasVes);
        localStorage.setItem('pos_ventas_usd', cajaVentasUsd.toString());
        localStorage.setItem('pos_ventas_ves', cajaVentasVes.toString());
        
        throw new Error(errMsg);
      }

      const saved = await res.json();
      if (saved && saved.factura_nro && saved.factura_nro !== tempSaleObj.factura_nro) {
        // Update state with the confirmed server-assigned invoice number
        const confirmedSale: Sale = { ...tempSaleObj, factura_nro: saved.factura_nro, id: saved.id };
        setSales(prev => prev.map(s => s === tempSaleObj ? confirmedSale : s));
        setShiftSales(prev => prev.map(s => s === tempSaleObj ? confirmedSale : s));
        // Refresh the invoice reference display with the new last number
        fetchLastInvoice();
        return confirmedSale; // Return confirmed sale so CajaPOS can print the real number
      }
      fetchLastInvoice();
      return tempSaleObj;
    } catch (err) {
      // Re-throw so CajaPOS can display the error alert to the operator
      throw err;
    }
  };

  const confirmLogoutUser = () => {
    setCurrentUser(null);
    setActiveTab('caja');
  };

  const handleLogout = () => {
    if (cajaAbierta) {
      setShowLogoutConfirm(true);
      return;
    }
    confirmLogoutUser();
  };

  // Periodic active session heartbeat (every 20 seconds) while user is logged in
  useEffect(() => {
    if (!currentUser) return;

    const sendHeartbeat = async () => {
      try {
        const res = await fetch(getApiUrl('/users/heartbeat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            username: currentUser.usuario,
            terminal: terminalName
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.sessionClosed && currentUser) {
            console.warn('[Heartbeat] Cierre de sesión remoto detectado. Expulsando usuario.');
            const uKey = `u_${currentUser.id}`;
            localStorage.removeItem(`pos_caja_abierta_${uKey}`);
            localStorage.removeItem(`pos_apertura_usd_${uKey}`);
            localStorage.removeItem(`pos_apertura_ves_${uKey}`);
            localStorage.removeItem(`pos_ventas_usd_${uKey}`);
            localStorage.removeItem(`pos_ventas_ves_${uKey}`);
            localStorage.removeItem(`pos_movimientos_usd_${uKey}`);
            localStorage.removeItem(`pos_movimientos_ves_${uKey}`);
            localStorage.removeItem(`pos_apertura_fecha_${uKey}`);
            setCajaAbierta(false);
            setSessionNotice(data.message || '⚠️ Su sesión ha sido finalizada remotamente. Inicie sesión nuevamente.');
            setCurrentUser(null);
          }
        }
      } catch (_) {}
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 5000);
    return () => clearInterval(interval);
  }, [currentUser, terminalName, lanIP, dbMode]);

  const hasModulePermission = (modulo: string, accion: 'ver' | 'crear' | 'editar' | 'eliminar' = 'ver') => {
    if (!currentUser) return false;
    if (currentUser.rol.toLowerCase() === 'administrador') return true;
    if (!currentUser.permisos) return true; // fallback to true if no permissions specified
    return !!currentUser.permisos[modulo]?.[accion];
  };

  const handleReprint = (sale: Sale) => {
    setReprintSale(sale);
  };

  if (licenseStatus && !licenseStatus.isValid) {
    return (
      <LicenciaModal 
        licenseStatus={licenseStatus} 
        onLicenseActivated={fetchLicenseStatus} 
        getApiUrl={getApiUrl} 
      />
    );
  }

  if (!currentUser) {
    return (
      <LoginTerminal 
        onLoginSuccess={(user) => {
          setSessionNotice('');
          sessionStartRef.current = Date.now();
          setCurrentUser(user);
        }} 
        systemUsers={users} 
        companyConfig={companyConfig} 
        sessionNotice={sessionNotice}
      />
    );
  }

  return (
    <div className="h-screen bg-winter-bg text-slate-800 flex flex-col overflow-hidden font-mono selection:bg-winter-blueBtn selection:text-white">
      
      {/* HEADER SECTION - WinterPOS Colors */}
      <header className="bg-winter-header border-b border-slate-700/20 px-6 py-4 flex flex-row items-center justify-between gap-4 select-none relative z-20 shadow-md text-white flex-shrink-0">
        
        {/* Left operator info */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-emerald-450 font-black shadow-inner">
            <Cpu className="w-5 h-5 text-emerald-455" />
          </div>
          <div>
            <span className="text-slate-100 font-bold block flex items-center gap-1.5">
              {currentUser.nombre.toUpperCase()}
              {licenseStatus?.isValid && (
                <span className="text-[9px] bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-full font-mono font-bold inline-flex items-center gap-1" title={`Licencia asignada a: ${licenseStatus.payload?.cliente || 'Cliente'}`}>
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>{licenseStatus.payload?.fechaExpiracion === 'VITALICIA' ? 'Vitalicia' : `${licenseStatus.daysRemaining ?? '---'}d`}</span>
                </span>
              )}
            </span>
            <span className="text-[10px] text-slate-400 block uppercase font-sans tracking-wide">
              Rol: {currentUser.rol} | Estación: {terminalName}
            </span>
          </div>
        </div>

        {/* Center business brand */}
        <div className="text-center flex-grow mx-4 flex flex-col items-center justify-center min-w-0">
          <h2 className="text-sm font-extrabold tracking-widest text-winter-yellow uppercase truncate w-full" title={companyConfig.nombre_comercio}>
            {companyConfig.nombre_comercio}
          </h2>
          <span className="text-[10px] text-slate-350 block mt-0.5 font-sans truncate w-full">
            RIF: {companyConfig.rif} | Telf: {companyConfig.telefono}
          </span>
        </div>

        {/* Right rates and network details */}
        <div className="flex items-center gap-4 text-[10px] font-sans flex-shrink-0">
          {cajaAbierta ? (
            <div className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-extrabold px-3 py-1.5 rounded flex flex-col justify-center items-start font-mono leading-none">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>CAJA ABIERTA</span>
              </div>
              <span className="text-[9px] text-slate-300 font-normal mt-1 block">
                Inicio: ${montoAperturaUsd.toFixed(2)} / {montoAperturaVes.toFixed(2)} Bs
              </span>
            </div>
          ) : (
            <div className="bg-amber-950/60 border border-amber-500/40 text-amber-300 font-extrabold px-3 py-1.5 rounded flex items-center gap-2 font-mono">
              <span>⚠️ MODO CONSULTA</span>
              <button
                onClick={() => setActiveTab('caja')}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded text-[9px] uppercase transition-all shadow"
              >
                Aperturar Caja
              </button>
            </div>
          )}

          <div 
            onClick={() => setActiveTab('tasa')}
            className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 border border-emerald-500/60 px-3.5 py-1 rounded-lg flex items-center gap-2 shadow-md hover:border-emerald-400 transition-all cursor-pointer group"
            title="Haga clic para consultar o actualizar la Tasa de Cambio BCV"
          >
            <div className="bg-emerald-500/20 p-1 rounded-md border border-emerald-500/30 group-hover:bg-emerald-500/30 transition-all">
              <TrendingUp className="w-4 h-4 text-emerald-400 animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5 font-sans">
              <span className="text-emerald-300 font-extrabold text-[11px] uppercase tracking-wider">TASA BCV:</span>
              <span className="bg-slate-950 text-white font-mono font-black text-xs px-2.5 py-0.5 rounded border border-emerald-400/60 shadow-inner flex items-center gap-1">
                <span className="text-emerald-300 text-sm font-extrabold">{tasaDia.toFixed(2)}</span>
                <span className="text-[10px] text-emerald-200/90 font-bold">Bs</span>
              </span>
            </div>
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
      <nav className="bg-winter-tabBar border-b border-slate-900/40 px-6 py-2 select-none flex flex-wrap gap-1.5 z-10 text-slate-300 flex-shrink-0">
        {hasModulePermission('caja', 'ver') && (
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
        )}

        {hasModulePermission('inventario', 'ver') && (
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
        )}

        {hasModulePermission('ventas', 'ver') && (
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
        )}

        {hasModulePermission('clientes', 'ver') && (
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
        )}

        {hasModulePermission('tasa', 'ver') && (
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
        )}

        {hasModulePermission('config', 'ver') && (
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
        )}
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="flex-grow p-6 overflow-y-auto min-h-0">
        <div className="w-full">
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
              shiftEntradasVes={shiftEntradasVes}
              shiftSalidasUsd={shiftSalidasUsd}
              shiftSalidasVes={shiftSalidasVes}
              shiftDevolucionesUsd={shiftDevolucionesUsd}
              shiftDevolucionesVes={shiftDevolucionesVes}
              onUpdateProductStock={handleUpdateProductStock}
              onRegisterAbono={handleRegisterAbono}
              abonos={abonos}
              getApiUrl={getApiUrl}
              nextInvoiceNumber={lastInvoiceInfo.next}
              lastInvoiceNumber={lastInvoiceInfo.last}
              onLogout={handleLogout}
            />
          )}

          {activeTab === 'inventario' && (
            <Inventario
              products={products}
              movements={movements}
              priceHistory={priceHistory}
              currentUser={currentUser}
              tasaDia={tasaDia}
              bcvRateUSD={bcvRateUSD}
              companyConfig={companyConfig}
              onAddProduct={handleAddProduct}
              onAddProductsBulk={handleAddProductsBulk}
              onUpdateProductStock={handleUpdateProductStock}
              onUpdateProductPrices={handleUpdateProductPrices}
              onUpdateProductPricesBulk={handleUpdateProductPricesBulk}
              onDeleteProduct={handleDeleteProduct}
              onUpdateProduct={handleUpdateProduct}
              onUpdateProductStockBulk={handleUpdateProductStockBulk}
            />
          )}

          {activeTab === 'ventas' && (
            <VentasHistorico
              sales={sales}
              cierres={cierres}
              onReprintTicket={handleReprint}
              currentUser={currentUser}
              onUpdateCierre={async (cierreId: number, updatedData: any) => {
                try {
                  const res = await fetch(getApiUrl(`/cajas/cierres/${cierreId}`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedData)
                  });
                  if (res.ok) {
                    const saved = await res.json();
                    setCierres(prev => prev.map(c => c.id === cierreId ? saved : c));
                    return true;
                  }
                } catch (e) {
                  console.error('Error actualizando cierre:', e);
                }
                return false;
              }}
              onDeleteCierre={async (cierreId: number): Promise<boolean> => {
                try {
                  const res = await fetch(getApiUrl(`/cajas/cierres/${cierreId}`), {
                    method: 'DELETE'
                  });
                  if (res.ok) {
                    setCierres(prev => prev.filter(c => c.id !== cierreId));
                    return true;
                  }
                } catch (e) {
                  console.error('Error eliminando cierre:', e);
                }
                return false;
              }}
              getApiUrl={getApiUrl}
            />

          )}

          {activeTab === 'clientes' && (
            <Clientes
              clients={clients}
              currentUser={currentUser}
              cajaAbierta={cajaAbierta}
              onAddClient={handleAddClient}
              onRegisterAbono={handleRegisterAbono}
              onUpdateClient={handleUpdateClient}
              onDeleteClient={handleDeleteClient}
              sales={sales}
              abonos={abonos}
              tasaDia={tasaDia}
            />
          )}

          {activeTab === 'tasa' && (
            <TasaCambio
              tasaDia={tasaDia}
              tasaVuelto={tasaVuelto}
              tasaHistory={tasaHistory}
              currentUser={currentUser}
              isServer={terminalName === 'CAJA_01' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'}
              getApiUrl={getApiUrl}
              onUpdateTasa={handleUpdateTasa}
              onClearHistory={handleClearTasaHistory}
            />
          )}


          {activeTab === 'config' && (
            <ConfiguracionEmpresa
              config={companyConfig}
              onSaveConfig={setCompanyConfig}
              currentUser={currentUser}
              getApiUrl={getApiUrl}
              onReloadUsers={async () => {
                try {
                  const res = await fetch(getApiUrl('/users'));
                  if (res.ok) {
                    const data = await res.json();
                    setUsers(data);
                  }
                } catch (e) {
                  console.error('Error reloading users:', e);
                }
              }}
              onWipeData={(mode) => {
                if (mode === 'sales' || mode === 'all') {
                  setSales([]);
                  setCierres([]);
                  setMovements([]);
                  setPriceHistory([]);
                  setAbonos([]);
                  setShiftSales([]);
                  setShiftAbonosUsd(0);
                  setShiftEntradasUsd(0);
                  setShiftEntradasVes(0);
                  setShiftSalidasUsd(0);
                  setShiftSalidasVes(0);
                  setShiftDevolucionesUsd(0);
                  setShiftDevolucionesVes(0);
                  setCajaAbierta(false);
                }
                if (mode === 'inventory' || mode === 'all') {
                  setProducts([]);
                  setMovements([]);
                  setPriceHistory([]);
                }
                if (mode === 'stock') {
                  setProducts(prev => prev.map(p => ({ ...p, stock_actual: 0 })));
                  setMovements([]);
                }
                if (mode === 'clients' || mode === 'all') {
                  setClients(prev => prev.filter(c => c.cedula_rif === 'V-00000000'));
                }
                if (mode === 'client_balances') {
                  setAbonos([]);
                  setClients(prev => prev.map(c => ({
                    ...c,
                    saldo_pendiente: 0,
                    credito_disponible: c.limite_credito
                  })));
                }
              }}
            />
          )}
        </div>
      </main>

      {/* FOOTER BAR */}
      <footer className="bg-slate-900 border-t border-slate-800 py-3 px-6 select-none flex justify-between items-center text-[9px] text-slate-450 text-white flex-shrink-0">
        <span>Licencia activa para {companyConfig.nombre_comercio || 'su empresa'}</span>
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
                {reprintSale.items.map((item: any, idx: number) => {
                  const isBulk = item.product?.a_granel || item.a_granel;
                  const rawQty = parseFloat(item.qty || '0');
                  const qtyDisplay = (isBulk || (rawQty % 1 !== 0))
                    ? (rawQty % 1 === 0 ? rawQty.toString() : rawQty.toFixed(3))
                    : Math.round(rawQty).toString();
                  return (
                    <div key={idx} className="flex justify-between">
                      <span className="w-1/2 overflow-hidden truncate">{item.product?.description || item.description}</span>
                      <span className="w-1/12 text-center">{qtyDisplay}</span>
                      <span className="w-1/4 text-right">${item.priceUSD.toFixed(2)}</span>
                      <span className="w-1/6 text-right">${item.totalUSD.toFixed(2)}</span>
                    </div>
                  );
                })}
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
                  <span>TOTAL VES:</span>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={() => printTicketReceipt(reprintSale, companyConfig, currentUser, (reprintSale as any)?.vendedor || reprintSale.usuario)}
                className="w-full bg-sky-600 hover:bg-sky-500 text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 shadow active:scale-95"
                title="Imprimir copia de ticket en la impresora"
              >
                <Printer className="w-4 h-4" />
                IMPRIMIR TICKET
              </button>
              <button
                onClick={() => setReprintSale(null)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 shadow active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                ACEPTAR Y REGRESAR
              </button>
            </div>

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
                  confirmLogoutUser();
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
