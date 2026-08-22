import { useState, useEffect, useRef } from 'react';
import { 
  mockUsers, 
  mockConfig 
} from './mockData';
import { 
  User, Product, Client, TasaHistoryItem, CompanyConfig, 
  InventoryMovement, PriceAdjustmentHistory, SaleItem, Payment,
  Sale, CierreCaja, Abono, CierreDetails,
  Proveedor, Compra, PagoProveedor, CotizacionProveedor
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
import Proveedores from './components/Proveedores';
import TasaCambio from './components/TasaCambio';
import ConfiguracionEmpresa from './components/ConfiguracionEmpresa';
import VentasHistorico from './components/VentasHistorico';
import LicenciaModal from './components/LicenciaModal';
import ErrorBoundary from './components/ErrorBoundary';
import { MasterPassModal } from './components/MasterPassModal';
import { InversionesModulo } from './components/InversionesModulo';
import { RepositorioDocumental } from './components/RepositorioDocumental';
import MobileApp from './mobile/MobileApp';
import ManualAccesoMovilModal from './components/ManualAccesoMovilModal';
import { ThemeSelectorModal, ThemeMode, ThemePalette } from './components/ThemeSelectorModal';
import { 
  ShoppingBag, Package, Users, Truck,
  TrendingUp, Settings, LogOut, Globe, Cpu, History, Printer, CheckCircle2, ShieldCheck, Briefcase,
  Smartphone, QrCode, PauseCircle, Play, Palette, Sun, Moon
} from 'lucide-react';
import { printTicketReceipt, formatBs, formatUSD, getApiBaseUrl } from './utils';

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
    try {
      const saved = localStorage.getItem('pos_products');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });

  const [clients, setClients] = useState<Client[]>(() => {
    try {
      const saved = localStorage.getItem('pos_clients');
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return [
      { id: 1, cedula_rif: 'V-00000000', nombre: 'CONSUMIDOR FINAL', telefono: '', direccion: 'LOCAL', limite_credito: 0, credito_disponible: 0, porcentaje_descuento: 0, estado: 'Activo', saldo_pendiente: 0 }
    ];
  });

  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(() => {
    try {
      const saved = localStorage.getItem('pos_biz_info');
      return saved ? JSON.parse(saved) : mockConfig;
    } catch (_) {
      return mockConfig;
    }
  });

  const [tasaHistory, setTasaHistory] = useState<TasaHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('pos_tasa_history');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });

  const [movements, setMovements] = useState<InventoryMovement[]>(() => {
    try {
      const saved = localStorage.getItem('pos_movements');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });

  const [priceHistory, setPriceHistory] = useState<PriceAdjustmentHistory[]>(() => {
    try {
      const saved = localStorage.getItem('pos_price_history');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });

  const [sales, setSales] = useState<Sale[]>(() => {
    try {
      const saved = localStorage.getItem('pos_sales_log');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });

  // Invoice reference state: fetched from server after each sale so the operator
  // sees the real last FAC- number and the estimated next correlative.
  // Actual assignment is always done server-side via seq_factura (atomic, collision-free).
  const [lastInvoiceInfo, setLastInvoiceInfo] = useState<{ last: string | null; next: string }>({ last: null, next: '---' });

  const [abonos, setAbonos] = useState<Abono[]>(() => {
    try {
      const saved = localStorage.getItem('pos_abonos');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });

  const [proveedores, setProveedores] = useState<Proveedor[]>(() => {
    try {
      const saved = localStorage.getItem('pos_proveedores');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });

  // Theme Engine (Modo Claro/Oscuro y Paletas de Colores)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('pos_theme_mode') as ThemeMode) || 'light';
  });
  const [themePalette, setThemePalette] = useState<ThemePalette>(() => {
    return (localStorage.getItem('pos_theme_palette') as ThemePalette) || 'winter';
  });
  const [showThemeModal, setShowThemeModal] = useState<boolean>(false);

  // Sincronización en tiempo real del tema visual en el DOM y LocalStorage
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme-mode', themeMode);
    root.setAttribute('data-theme-palette', themePalette);
    if (themeMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('pos_theme_mode', themeMode);
    localStorage.setItem('pos_theme_palette', themePalette);
  }, [themeMode, themePalette]);

  const handleResetThemeDefault = () => {
    setThemeMode('light');
    setThemePalette('winter');
  };

  const [compras, setCompras] = useState<Compra[]>(() => {
    try {
      const saved = localStorage.getItem('pos_compras');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });

  const [pagosProveedores, setPagosProveedores] = useState<PagoProveedor[]>(() => {
    try {
      const saved = localStorage.getItem('pos_pagos_proveedores');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });

  const [cotizacionesProveedores, setCotizacionesProveedores] = useState<CotizacionProveedor[]>(() => {
    try {
      const saved = localStorage.getItem('pos_cotizaciones_proveedores');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });

  const [cierres, setCierres] = useState<CierreCaja[]>(() => {
    try {
      const saved = localStorage.getItem('pos_cierres_log');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
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

  const [bcvRateUSD, setBcvRateUSD] = useState<number>(0);
  const [lanIP, setLanIP] = useState('192.168.1.100');
  const [dbMode, setDbMode] = useState('local');
  const [reprintSale, setReprintSale] = useState<Sale | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string>('');

  // Active Pestaña Tab F1-F10 + Inversiones + Proveedores + Documentos Legales
  const [activeTab, setActiveTab] = useState<'caja' | 'inventario' | 'ventas' | 'clientes' | 'proveedores' | 'tasa' | 'config' | 'inversiones' | 'documentos'>('caja');
  const [users, setUsers] = useState<User[]>(mockUsers);
  // Inversiones module: Master Pass modal guard + persistent sub-tab
  const [showMasterPassModal, setShowMasterPassModal] = useState(false);
  const [inversionesUnlocked, setInversionesUnlocked] = useState(false);
  const [inversionesSubTab, setInversionesSubTab] = useState<'matriz' | 'historial' | 'utilidades' | 'accionistas'>('matriz');

  // Persistent Paused Product Draft across all tabs (F1-F10)
  const [pausedProductDraft, setPausedProductDraft] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('pos_paused_product_draft');
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });

  useEffect(() => {
    const handleDraftUpdate = () => {
      try {
        const saved = localStorage.getItem('pos_paused_product_draft');
        setPausedProductDraft(saved ? JSON.parse(saved) : null);
      } catch (_) {
        setPausedProductDraft(null);
      }
    };
    window.addEventListener('pos_paused_draft_changed', handleDraftUpdate);
    window.addEventListener('storage', handleDraftUpdate);
    return () => {
      window.removeEventListener('pos_paused_draft_changed', handleDraftUpdate);
      window.removeEventListener('storage', handleDraftUpdate);
    };
  }, []);

  const handleGlobalResumePausedDraft = () => {
    setActiveTab('inventario');
    setTimeout(() => {
      window.dispatchEvent(new Event('pos_resume_product_draft'));
    }, 120);
  };

  // Mobile mode detection (screen size < 768px or query parameter ?mode=mobile)
  const [isMobileMode, setIsMobileMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'mobile') return true;
    if (params.get('mode') === 'desktop') return false;
    return window.innerWidth < 768;
  });
  const [showManualAccesoModal, setShowManualAccesoModal] = useState(false);

  // Debounced Sync to localStorage (avoids blocking the UI thread on large catalogs)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('pos_products', JSON.stringify(products));
      } catch (_) {}
    }, 600);
    return () => clearTimeout(timer);
  }, [products]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('pos_clients', JSON.stringify(clients));
      } catch (_) {}
    }, 600);
    return () => clearTimeout(timer);
  }, [clients]);

  useEffect(() => {
    localStorage.setItem('pos_proveedores', JSON.stringify(proveedores));
  }, [proveedores]);

  useEffect(() => {
    localStorage.setItem('pos_compras', JSON.stringify(compras));
  }, [compras]);

  useEffect(() => {
    localStorage.setItem('pos_pagos_proveedores', JSON.stringify(pagosProveedores));
  }, [pagosProveedores]);

  useEffect(() => {
    localStorage.setItem('pos_cotizaciones_proveedores', JSON.stringify(cotizacionesProveedores));
  }, [cotizacionesProveedores]);

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
    const updateNetworkSettings = async () => {
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      let mode = localStorage.getItem('pos_db_mode');
      if (!mode) {
        mode = isLocalHost ? 'local' : 'remote';
        localStorage.setItem('pos_db_mode', mode);
      }
      
      let ip = localStorage.getItem('pos_lan_ip');
      
      if (mode === 'local') {
        try {
          const res = await fetch(`http://localhost:5000/api/status`);
          if (res.ok) {
            const data = await res.json();
            if (data.localIp && !ip) {
              ip = data.localIp;
              localStorage.setItem('pos_lan_ip', data.localIp);
            }
          }
        } catch (_) {}
      }

      setLanIP(ip || (mode === 'remote' ? window.location.hostname : '127.0.0.1'));
      setDbMode(mode);
    };

    updateNetworkSettings();
    const timer = setInterval(updateNetworkSettings, 10000);
    return () => clearInterval(timer);
  }, []);

  const getApiUrl = (path: string) => {
    const cleanPath = path.startsWith('/api/') ? path.substring(4) : path;
    return `${getApiBaseUrl()}${cleanPath}`;
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

  // Update browser favicon dynamically when company logo_url changes
  useEffect(() => {
    if (companyConfig?.logo_url) {
      let faviconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.rel = 'shortcut icon';
        document.head.appendChild(faviconLink);
      }
      faviconLink.href = companyConfig.logo_url;
    }
  }, [companyConfig?.logo_url]);

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

const cleanProductObject = (p: any): Product => ({
  ...p,
  stock_actual: parseFloat(p.stock_actual) || 0,
  stock_minimo: parseFloat(p.stock_minimo) || 0,
  precio_costo_usd: parseFloat(p.precio_costo_usd) || 0,
  precio_detalle_usd: parseFloat(p.precio_detalle_usd) || 0,
  precio_mayor_usd: parseFloat(p.precio_mayor_usd) || 0,
  precio_bulto_usd: parseFloat(p.precio_bulto_usd) || 0,
  cantidad_mayorista: parseInt(p.cantidad_mayorista) || 12,
  cant_bulto: parseInt(p.cant_bulto) || 0,
  ganancia_bulto: parseFloat(p.ganancia_bulto) || 0
});

  // Refresh products, movements, and price history automatically when entering the inventario tab
  useEffect(() => {
    if (activeTab === 'inventario') {
      const fetchInventarioData = async () => {
        try {
          const productsRes = await fetch(getApiUrl('/productos'));
          if (productsRes.ok) {
            const productsData = await productsRes.json();
            setProducts(productsData.map(cleanProductObject));
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
    const interval = setInterval(pollSync, 2500);
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
          cierresRes,
          proveedoresRes,
          comprasRes,
          pagosRes,
          cotizacionesRes
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
          fetch(getApiUrl('/cajas/cierres')),
          fetch(getApiUrl('/proveedores')),
          fetch(getApiUrl('/compras')),
          fetch(getApiUrl('/cxp/pagos')),
          fetch(getApiUrl('/cotizaciones-proveedores'))
        ]);

        if (configRes.ok) {
          const configData = await configRes.json();
          setCompanyConfig(configData);
        }

        if (productsRes.ok) {
          const productsData = await productsRes.json();
          setProducts(productsData.map(cleanProductObject));
        }

        if (clientsRes.ok) {
          const clientsData = await clientsRes.json();
          setClients(clientsData);
        }

        if (proveedoresRes && proveedoresRes.ok) {
          const provData = await proveedoresRes.json();
          setProveedores(provData);
        }

        if (comprasRes && comprasRes.ok) {
          const comprasData = await comprasRes.json();
          setCompras(comprasData);
        }

        if (pagosRes && pagosRes.ok) {
          const pagosData = await pagosRes.json();
          setPagosProveedores(pagosData);
        }

        if (cotizacionesRes && cotizacionesRes.ok) {
          const cotData = await cotizacionesRes.json();
          setCotizacionesProveedores(cotData);
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
      } else if (e.key === 'F5' && hasModulePermission('proveedores', 'ver')) {
        e.preventDefault();
        setActiveTab('proveedores');
      } else if (e.key === 'F6') {
        e.preventDefault();
        if (currentUser && (currentUser.rol?.toLowerCase() === 'administrador' || currentUser.rol?.toLowerCase() === 'admin')) {
          if (inversionesUnlocked) {
            setActiveTab('inversiones');
          } else {
            setShowMasterPassModal(true);
          }
        }
      } else if (e.key === 'F7' && hasModulePermission('documentos', 'ver')) {
        e.preventDefault();
        setActiveTab('documentos');
      } else if (e.key === 'F9' && hasModulePermission('tasa', 'ver')) {
        e.preventDefault();
        setActiveTab('tasa');
      } else if (e.key === 'F10' && hasModulePermission('config', 'ver')) {
        e.preventDefault();
        setActiveTab('config');
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [currentUser, inversionesUnlocked]);

  // Escape key listener to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReprintSale(null);
        setShowThemeModal(false);
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

  // Engine de sincronización y validación automática de tasa BCV parametrizable
  useEffect(() => {
    if (!currentUser) return;

    let timer: any = null;

    const syncAutoBcvRate = async (isForced = false) => {
      const autoMode = (localStorage.getItem('pos_auto_tasa_mode') as 'off' | 'usd' | 'eur') || 'off';
      if (autoMode === 'off') return;

      const intervalType = localStorage.getItem('pos_auto_tasa_interval') || '10';
      const fixedTime = localStorage.getItem('pos_auto_tasa_fixed_time') || '17:00';

      // Si es hora fija, verificar si coincide con la hora actual (a menos que sea forzado por cambio de config)
      if (intervalType === 'fixed' && !isForced) {
        const now = new Date();
        const currentHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const todayKey = `pos_fixed_tasa_done_${now.toISOString().substring(0, 10)}`;
        if (currentHM !== fixedTime) {
          return;
        }
        if (sessionStorage.getItem(todayKey)) {
          return; // Ya ejecutado en este minuto del día
        }
      }

      try {
        const res = await fetch(getApiUrl('/bcv'));
        if (!res.ok) throw new Error('Respuesta HTTP no exitosa al consultar BCV');
        const bcvData = await res.json();
        if (!bcvData) throw new Error('Respuesta vacía del servicio BCV');

        const rawValStr = autoMode === 'eur' ? bcvData.eur : bcvData.usd;
        if (!rawValStr) throw new Error('Tasa no encontrada en respuesta BCV');

        const cleanedVal = parseFloat(rawValStr.toString().replace(',', '.'));
        if (isNaN(cleanedVal) || cleanedVal <= 0) throw new Error('Valor numérico de tasa inválido');

        const targetRate = Math.round(cleanedVal * 100) / 100;

        // Comprobación contra la tasa de cobro activa actualmente
        const latestHistory = tasaHistory.length > 0 ? tasaHistory[tasaHistory.length - 1] : null;
        const currentCobro = latestHistory ? latestHistory.tasa_cobro : 0;

        if (Math.abs(currentCobro - targetRate) >= 0.01) {
          console.log(`[Auto BCV] 🔄 Actualización automática detectada: ${currentCobro} Bs ➡️ ${targetRate} Bs (${autoMode === 'eur' ? '€ Euro' : '$ Dólar'}). Aplicando en sistema...`);
          const userLabel = autoMode === 'eur' ? 'SISTEMA (Auto BCV €)' : 'SISTEMA (Auto BCV $)';
          await handleUpdateTasa(targetRate, targetRate, userLabel);
        } else {
          console.log(`[Auto BCV] ✅ Validación periódica: Tasa al día con el BCV (${targetRate} Bs).`);
        }

        if (intervalType === 'fixed') {
          sessionStorage.setItem(`pos_fixed_tasa_done_${new Date().toISOString().substring(0, 10)}`, 'done');
        }
      } catch (err: any) {
        // En caso de fallo de red o caída de la API del BCV, el sistema mantiene intacta la última tasa establecida (Resguardo Offline)
        console.warn(`[Auto BCV Resguardo Offline] Sin conexión a Internet o API BCV no disponible. Operación continúa normalmente con la última tasa activa (${tasaDia} Bs).`);
      }
    };

    const setupTimer = () => {
      if (timer) clearInterval(timer);

      const autoMode = (localStorage.getItem('pos_auto_tasa_mode') as 'off' | 'usd' | 'eur') || 'off';
      if (autoMode === 'off') return;

      const intervalVal = localStorage.getItem('pos_auto_tasa_interval') || '10';
      const intervalMs = intervalVal === 'fixed' 
        ? 60 * 1000 // Si es hora fija, revisar cada 1 minuto si ya es la hora
        : (parseInt(intervalVal, 10) || 10) * 60 * 1000;

      timer = setInterval(() => syncAutoBcvRate(false), intervalMs);
    };

    // Ejecutar inmediatamente al inicio
    syncAutoBcvRate(true);
    setupTimer();

    const onConfigChanged = () => {
      syncAutoBcvRate(true);
      setupTimer();
    };
    window.addEventListener('pos_auto_tasa_config_changed', onConfigChanged);

    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener('pos_auto_tasa_config_changed', onConfigChanged);
    };
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
    const cleanedSaved = saved ? cleanProductObject(saved) : null;
    const cleanedProd = cleanProductObject(prod);
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
        const cleanedSaved = cleanProductObject(saved);
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

      // Save stocks in bulk
      const stockUpdates = updates.map(update => {
        const prod = updatedProducts.find(p => p.id === update.prodId);
        return { prodId: update.prodId, stock_actual: prod ? prod.stock_actual : update.qty };
      });
      await postApiData('/productos/stock/bulk', stockUpdates);

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

      // Save movements in bulk
      await postApiData('/movements/bulk', newMovements);

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

  const handleAddClientsBulk = async (clientsArray: any[], mode: 'update' | 'skip' = 'update') => {
    try {
      const res = await fetch(getApiUrl('/clientes/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clients: clientsArray, mode })
      });
      if (res.ok) {
        const data = await res.json();
        // Refresh catalog from central backend
        const listRes = await fetch(getApiUrl('/clientes'));
        if (listRes.ok) {
          const freshClients = await listRes.json();
          setClients(freshClients);
        }
        return data.count;
      }
      return null;
    } catch (err: any) {
      console.error('Error al realizar carga masiva de clientes:', err);
      return null;
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
      
      // Reset shift metrics - ALL variables must be zeroed for a clean new session
      setShiftSales([]);
      setShiftAbonosUsd(0);
      setShiftEntradasUsd(0);
      setShiftEntradasVes(0);
      setShiftSalidasUsd(0);
      setShiftSalidasVes(0);
      setShiftDevolucionesUsd(0);
      setShiftDevolucionesVes(0);
      // Clear abonos list so previous session abonos don't show in new session
      setAbonos([]);
      localStorage.removeItem(`pos_shift_sales_${uKey}`);
      localStorage.removeItem(`pos_shift_abonos_${uKey}`);
      localStorage.removeItem(`pos_shift_entradas_${uKey}`);
      localStorage.removeItem(`pos_shift_entradas_ves_${uKey}`);
      localStorage.removeItem(`pos_shift_salidas_${uKey}`);
      localStorage.removeItem(`pos_shift_salidas_ves_${uKey}`);
      localStorage.removeItem(`pos_shift_devoluciones_${uKey}`);
      localStorage.removeItem(`pos_shift_devoluciones_ves_${uKey}`);
      localStorage.removeItem('pos_abonos');
      localStorage.removeItem('pos_shift_entradas_ves');
      localStorage.removeItem('pos_shift_salidas_ves');
      localStorage.removeItem('pos_movimientos_usd');
      localStorage.removeItem('pos_movimientos_ves');

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
    // Clear abonos list so it doesn't carry over to next session
    setAbonos([]);
    localStorage.removeItem(`pos_shift_sales_${uKey}`);
    localStorage.removeItem(`pos_shift_abonos_${uKey}`);
    localStorage.removeItem(`pos_shift_entradas_${uKey}`);
    localStorage.removeItem(`pos_shift_entradas_ves_${uKey}`);
    localStorage.removeItem(`pos_shift_salidas_${uKey}`);
    localStorage.removeItem(`pos_shift_salidas_ves_${uKey}`);
    localStorage.removeItem(`pos_shift_devoluciones_${uKey}`);
    localStorage.removeItem(`pos_shift_devoluciones_ves_${uKey}`);
    localStorage.removeItem('pos_abonos');

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


  const handleRegisterCajaMovement = async (
    type: 'Entrada' | 'Salida' | 'Devolucion', 
    description: string, 
    usd: number, 
    ves: number,
    metodoPago: string = 'EFECTIVO',
    comisionVes: number = 0,
    comisionUsd: number = 0
  ) => {
    const isDigitalAdvance = description.includes('[VENTA EFECTIVO] Cobro Digital') || (metodoPago !== 'EFECTIVO' && metodoPago !== 'EFECTIVO$' && metodoPago !== 'EFECTIVOBS');
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
      } else if (!isDigitalAdvance) {
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
      usuarioNombre: currentUser?.nombre,
      metodo_pago: metodoPago,
      comision_ves: comisionVes,
      comision_usd: comisionUsd
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
    // 1. Increment/Decrement products stock and log Kardex (FAC- decrements, DEV- increments)
    const isDev = sale.factura_nro.startsWith('DEV-');
    setProducts(prevProds =>
      prevProds.map(p => {
        const item = sale.items.find(i => (i.product?.id === p.id || i.product?.barcode === p.barcode));
        if (item) {
          const rawQty = Math.abs(item.qty);
          const cleanQty = p.a_granel ? rawQty : Math.round(rawQty);
          const stockDelta = isDev ? cleanQty : -cleanQty;
          let nextStock = p.stock_actual + stockDelta;
          if (!p.a_granel) {
            nextStock = Math.round(nextStock);
          }
          nextStock = Math.max(0, nextStock);
          
          const newMov: InventoryMovement = {
            id: Math.random(),
            date: getLocalISODateString(),
            productCode: p.barcode,
            productDescription: p.description,
            type: isDev ? 'Devolución' : 'Venta',
            qty: stockDelta,
            stock_anterior: p.stock_actual,
            stock_posterior: nextStock,
            motivo: isDev ? `Devolución Facturada: ${sale.factura_nro}` : `Venta Facturada: ${sale.factura_nro}`,
            usuario: currentUser?.nombre || 'SISTEMA'
          };
          setMovements(prevMovs => [...prevMovs, newMov]);

          return { ...p, stock_actual: nextStock };
        }
        return p;
      })
    );

    // 2. Increment/Decrement client pending balance if Credit was used (supports credit sales and credit returns)
    const creditPayment = sale.pagos?.find(p => p.metodo === 'CreditoCliente');
    if (creditPayment && creditPayment.montoUSD !== 0) {
      setClients(prevClients =>
        prevClients.map(c => {
          if (c.id === sale.client?.id || c.cedula_rif === sale.client?.cedula_rif) {
            const nextSaldo = Math.max(0, (c.saldo_pendiente || 0) + creditPayment.montoUSD);
            const nextCredito = Math.min(c.limite_credito || 0, Math.max(0, c.credito_disponible - creditPayment.montoUSD));
            return {
              ...c,
              saldo_pendiente: nextSaldo,
              credito_disponible: nextCredito
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
    sessionStorage.removeItem('pos_inventory_search_term');
    sessionStorage.removeItem('pos_caja_search_term');
    try {
      localStorage.removeItem('pos_paused_product_draft');
      window.dispatchEvent(new Event('pos_paused_draft_changed'));
    } catch (_) {}
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

  // --- PROVEEDORES & COMPRAS & CXP HANDLERS ---
  const handleAddProveedor = async (newProv: Proveedor) => {
    try {
      const res = await fetch(getApiUrl('/proveedores'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProv)
      });
      if (res.ok) {
        const saved = await res.json();
        setProveedores(prev => [saved, ...prev.filter(p => p.id !== saved.id)]);
        return saved;
      }
    } catch (e) {
      console.error('Error al agregar proveedor:', e);
    }
    return null;
  };

  const handleUpdateProveedor = async (updatedProv: Proveedor) => {
    try {
      const res = await fetch(getApiUrl(`/proveedores/${updatedProv.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProv)
      });
      if (res.ok) {
        const saved = await res.json();
        setProveedores(prev => prev.map(p => p.id === saved.id ? saved : p));
        return true;
      }
    } catch (e) {
      console.error('Error al actualizar proveedor:', e);
    }
    return false;
  };

  const handleDeleteProveedor = async (id: number) => {
    try {
      const res = await fetch(getApiUrl(`/proveedores/${id}`), {
        method: 'DELETE'
      });
      if (res.ok) {
        setProveedores(prev => prev.filter(p => p.id !== id));
        return true;
      }
    } catch (e) {
      console.error('Error al eliminar proveedor:', e);
    }
    return false;
  };

  const handleAddCompra = async (newCompra: any) => {
    try {
      const res = await fetch(getApiUrl('/compras'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCompra)
      });
      if (res.ok) {
        const saved = await res.json();
        setCompras(prev => [saved, ...prev]);
        
        // Refresh products to get updated stock and costs
        try {
          const pRes = await fetch(getApiUrl('/productos'));
          if (pRes.ok) {
            const pData = await pRes.json();
            setProducts(pData.map(cleanProductObject));
          }
        } catch (_) {}

        // Refresh movements
        try {
          const mRes = await fetch(getApiUrl('/movements'));
          if (mRes.ok) setMovements(await mRes.json());
        } catch (_) {}

        // Refresh proveedores to update debt
        try {
          const provRes = await fetch(getApiUrl('/proveedores'));
          if (provRes.ok) setProveedores(await provRes.json());
        } catch (_) {}

        return saved;
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status} al guardar compra en el servidor.`);
      }
    } catch (e: any) {
      console.error('Error al registrar compra:', e);
      throw e;
    }
  };

  const handleAddPagoProveedor = async (newPago: any) => {
    try {
      const res = await fetch(getApiUrl('/cxp/abonos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPago)
      });
      if (res.ok) {
        const saved = await res.json();
        setPagosProveedores(prev => [saved, ...prev]);

        // Refresh proveedores and compras
        try {
          const [provRes, compRes] = await Promise.all([
            fetch(getApiUrl('/proveedores')),
            fetch(getApiUrl('/compras'))
          ]);
          if (provRes.ok) setProveedores(await provRes.json());
          if (compRes.ok) setCompras(await compRes.json());
        } catch (_) {}

        return true;
      }
    } catch (e) {
      console.error('Error al registrar pago a proveedor:', e);
    }
    return false;
  };

  const handleAddCotizacion = async (newCot: any) => {
    try {
      const res = await fetch(getApiUrl('/cotizaciones-proveedores'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCot)
      });
      if (res.ok) {
        const saved = await res.json();
        // Refresh full list from server to guarantee proper joins
        try {
          const cRes = await fetch(getApiUrl('/cotizaciones-proveedores'));
          if (cRes.ok) {
            setCotizacionesProveedores(await cRes.json());
            return true;
          }
        } catch (_) {}
        setCotizacionesProveedores(prev => [saved, ...prev]);
        return true;
      }
    } catch (e) {
      console.error('Error al registrar cotización:', e);
    }
    return false;
  };

  const handleDeleteCotizacion = async (id: number) => {
    try {
      const res = await fetch(getApiUrl(`/cotizaciones-proveedores/${id}`), {
        method: 'DELETE'
      });
      if (res.ok) {
        setCotizacionesProveedores(prev => prev.filter(c => c.id !== id));
        return true;
      }
    } catch (e) {
      console.error('Error al eliminar cotización:', e);
    }
    return false;
  };

  const handleRefreshProveedoresData = async () => {
    try {
      const [provRes, compRes, pagosRes, cotRes] = await Promise.all([
        fetch(getApiUrl('/proveedores')),
        fetch(getApiUrl('/compras')),
        fetch(getApiUrl('/cxp/pagos')),
        fetch(getApiUrl('/cotizaciones-proveedores'))
      ]);
      if (provRes.ok) setProveedores(await provRes.json());
      if (compRes.ok) setCompras(await compRes.json());
      if (pagosRes.ok) setPagosProveedores(await pagosRes.json());
      if (cotRes.ok) setCotizacionesProveedores(await cotRes.json());
    } catch (_) {}
  };

  const hasModulePermission = (modulo: string, accion: 'ver' | 'crear' | 'editar' | 'eliminar' = 'ver') => {
    if (!currentUser) return false;
    const isUserAdmin = currentUser.rol?.toLowerCase() === 'administrador' || currentUser.rol?.toLowerCase() === 'admin';
    if (isUserAdmin) return true;
    if (!currentUser.permisos) return false;
    return !!currentUser.permisos[modulo]?.[accion];
  };

  const [reprintCurrency, setReprintCurrency] = useState<'USD' | 'VES'>('USD');

  const handleReprint = (sale: Sale) => {
    setReprintCurrency(companyConfig?.moneda_ticket_default || 'USD');
    setReprintSale(sale);
  };

  const [showLicenseModalManually, setShowLicenseModalManually] = useState(false);

  useEffect(() => {
    const handleGlobalF9 = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        setShowLicenseModalManually(prev => !prev);
      } else if (e.key === 'Escape') {
        if (reprintSale) {
          setReprintSale(null);
        }
        if (showLicenseModalManually) {
          setShowLicenseModalManually(false);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalF9);
    return () => window.removeEventListener('keydown', handleGlobalF9);
  }, [reprintSale, showLicenseModalManually]);

  // Render Mobile Executive App directly if on mobile device or ?mode=mobile (solo si tiene permiso movil)
  if (isMobileMode && hasModulePermission('movil', 'ver')) {
    return <MobileApp onSwitchToDesktop={() => setIsMobileMode(false)} />;
  }

  const isLicenseBlocking = licenseStatus && !licenseStatus.isValid;

  if (isLicenseBlocking || showLicenseModalManually) {
    return (
      <LicenciaModal 
        licenseStatus={licenseStatus} 
        onLicenseActivated={fetchLicenseStatus} 
        getApiUrl={getApiUrl} 
        onClose={isLicenseBlocking ? undefined : () => setShowLicenseModalManually(false)}
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
          // Activate Full Screen on Login Success
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        }} 
        systemUsers={users} 
        companyConfig={companyConfig} 
        sessionNotice={sessionNotice}
        onOpenLicenseModal={() => setShowLicenseModalManually(true)}
      />
    );
  }

  return (
    <div className="h-screen bg-theme-main text-slate-800 dark:text-slate-100 flex flex-col overflow-hidden font-mono selection:bg-winter-blueBtn selection:text-white transition-colors duration-300">
      
      {/* HEADER SECTION - Dynamic Theme Header */}
      <header className="bg-theme-header border-b border-slate-700/20 px-6 py-4 flex flex-row items-center justify-between gap-4 select-none relative z-20 shadow-md text-white flex-shrink-0 transition-colors duration-300">
        
        {/* Left operator info */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-emerald-450 font-black shadow-inner">
            <Cpu className="w-5 h-5 text-emerald-455" />
          </div>
          <div>
            <span className="text-slate-100 font-bold block flex items-center gap-1.5">
              {currentUser.nombre.toUpperCase()}
              {licenseStatus?.isValid && (
                <button
                  onClick={() => setShowLicenseModalManually(true)}
                  className="text-[9px] bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-full font-mono font-bold inline-flex items-center gap-1 hover:bg-emerald-900 transition-all cursor-pointer"
                  title="Haga clic para ver detalles de licencia o actualizar (F9)"
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>{licenseStatus.payload?.fechaExpiracion === 'VITALICIA' ? 'Vitalicia' : `${licenseStatus.daysRemaining ?? '---'}d (F9)`}</span>
                </button>
              )}
            </span>
            <span className="text-[10px] text-slate-400 block uppercase font-sans tracking-wide">
              Rol: {currentUser.rol} | Estación: {terminalName}
            </span>
          </div>
        </div>

        {/* Center business brand */}
        <div className="text-center flex-grow mx-4 flex items-center justify-center gap-2.5 min-w-0">
          {companyConfig?.logo_url && (
            <img 
              src={companyConfig.logo_url} 
              alt="Logo Comercio" 
              className="w-8 h-8 object-contain rounded bg-white/10 p-0.5 border border-white/20 shadow-xs flex-shrink-0"
            />
          )}
          <div className="flex flex-col items-center min-w-0">
            <h2 className="text-sm font-extrabold tracking-widest text-winter-yellow uppercase truncate w-full" title={companyConfig.nombre_comercio}>
              {companyConfig.nombre_comercio}
            </h2>
            <span className="text-[10px] text-slate-350 block mt-0.5 font-sans truncate w-full">
              RIF: {companyConfig.rif} | Telf: {companyConfig.telefono}
            </span>
          </div>
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
                Inicio: {formatUSD(montoAperturaUsd)} / {formatBs(montoAperturaVes)}
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
                <span className="text-emerald-300 text-sm font-extrabold">{formatBs(tasaDia, false)}</span>
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

      {/* TABS BAR - Dynamic Theme TabBar with High-Visibility Typography */}
      <nav className="bg-theme-tabbar border-b border-slate-900/60 px-4 sm:px-6 py-2 select-none flex flex-wrap items-center gap-2 z-10 text-slate-300 flex-shrink-0 shadow-md transition-colors duration-300">
        {hasModulePermission('caja', 'ver') && (
          <button
            onClick={() => setActiveTab('caja')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-[15px] font-black font-sans rounded-lg transition-all active:scale-[0.98] cursor-pointer ${
              activeTab === 'caja'
                ? 'tab-grad-caja text-white shadow-md ring-1 ring-white/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShoppingBag className="w-5 h-5 flex-shrink-0" />
            <span>F1 CAJA</span>
          </button>
        )}

        {hasModulePermission('inventario', 'ver') && (
          <button
            onClick={() => setActiveTab('inventario')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-[15px] font-black font-sans rounded-lg transition-all active:scale-[0.98] cursor-pointer ${
              activeTab === 'inventario'
                ? 'tab-grad-inventario text-white shadow-md ring-1 ring-white/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Package className="w-5 h-5 flex-shrink-0" />
            <span>F2 Inventario</span>
          </button>
        )}

        {hasModulePermission('ventas', 'ver') && (
          <button
            onClick={() => setActiveTab('ventas')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-[15px] font-black font-sans rounded-lg transition-all active:scale-[0.98] cursor-pointer ${
              activeTab === 'ventas'
                ? 'tab-grad-ventas text-white shadow-md ring-1 ring-white/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <History className="w-5 h-5 flex-shrink-0" />
            <span>F3 Ventas</span>
          </button>
        )}

        {hasModulePermission('clientes', 'ver') && (
          <button
            onClick={() => setActiveTab('clientes')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-[15px] font-black font-sans rounded-lg transition-all active:scale-[0.98] cursor-pointer ${
              activeTab === 'clientes'
                ? 'tab-grad-clientes text-white shadow-md ring-1 ring-white/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-5 h-5 flex-shrink-0" />
            <span>F4 Clientes</span>
          </button>
        )}

        {hasModulePermission('proveedores', 'ver') && (
          <button
            onClick={() => setActiveTab('proveedores')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-[15px] font-black font-sans rounded-lg transition-all active:scale-[0.98] cursor-pointer ${
              activeTab === 'proveedores'
                ? 'tab-grad-proveedores text-white shadow-md ring-1 ring-white/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Truck className="w-5 h-5 flex-shrink-0" />
            <span>F5 Proveedores</span>
          </button>
        )}

        {/* F6 Inversiones & Accionistas */}
        {currentUser && (currentUser.rol?.toLowerCase() === 'administrador' || currentUser.rol?.toLowerCase() === 'admin') && (
          <button
            onClick={() => {
              if (inversionesUnlocked) {
                setActiveTab('inversiones');
              } else {
                setShowMasterPassModal(true);
              }
            }}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-[15px] font-black font-sans rounded-lg transition-all active:scale-[0.98] cursor-pointer ${
              activeTab === 'inversiones'
                ? 'tab-grad-inversiones text-white shadow-md ring-1 ring-white/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Módulo de Control de Inversiones y Accionistas [F6] (Solo Administrador)"
          >
            <Briefcase className="w-5 h-5 flex-shrink-0" />
            <span>F6 Inversiones</span>
          </button>
        )}

        {/* F7 Documentos Legales y Fiscales */}
        {hasModulePermission('documentos', 'ver') && (
          <button
            onClick={() => setActiveTab('documentos')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-[15px] font-black font-sans rounded-lg transition-all active:scale-[0.98] cursor-pointer ${
              activeTab === 'documentos'
                ? 'tab-grad-documentos text-white shadow-md ring-1 ring-white/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Bóveda de Documentos Legales y Fiscales de la Empresa [F7]"
          >
            <ShieldCheck className="w-5 h-5 flex-shrink-0 text-blue-400" />
            <span>F7 Docs. Legales</span>
          </button>
        )}

        {hasModulePermission('tasa', 'ver') && (
          <button
            onClick={() => setActiveTab('tasa')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-[15px] font-black font-sans rounded-lg transition-all active:scale-[0.98] cursor-pointer ${
              activeTab === 'tasa'
                ? 'tab-grad-tasa text-white shadow-md ring-1 ring-white/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <TrendingUp className="w-5 h-5 flex-shrink-0" />
            <span>F9 Tasa</span>
          </button>
        )}

        {hasModulePermission('config', 'ver') && (
          <button
            onClick={() => setActiveTab('config')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-[15px] font-black font-sans rounded-lg transition-all active:scale-[0.98] cursor-pointer ${
              activeTab === 'config'
                ? 'tab-grad-config text-white shadow-md ring-1 ring-white/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            <span>F10 Config.</span>
          </button>
        )}

        {/* Action Buttons: Theme Selector + Mobile View & QR Connector */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Botón Selector de Paleta / Modo Claro-Oscuro */}
          <button
            type="button"
            onClick={() => setShowThemeModal(true)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-amber-300 border border-slate-700/80 shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-bold font-sans"
            title="Personalización Visual: Paleta de Colores y Modo Claro / Oscuro"
          >
            <Palette className="w-4 h-4 text-amber-400" />
            <span className="text-[11px] text-slate-200 hidden md:inline">Temas</span>
            {themeMode === 'dark' ? (
              <Moon className="w-3.5 h-3.5 text-indigo-300" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-yellow-400" />
            )}
          </button>

          {hasModulePermission('movil', 'ver') && (
            <>
              <button
                onClick={() => setIsMobileMode(true)}
                className="p-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-sm transition-all active:scale-95 cursor-pointer"
                title="Vista Móvil (Optimizado para Smartphones y Tablets)"
              >
                <Smartphone className="w-4 h-4" />
              </button>

              <button
                onClick={() => setShowManualAccesoModal(true)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 shadow-sm transition-all active:scale-95 cursor-pointer"
                title="Conectar Celular (Código QR e instrucciones de acceso)"
              >
                <QrCode className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="flex-grow p-6 overflow-y-auto min-h-0">
        <div className="w-full">
          {activeTab === 'caja' && (
            <CajaPOS
              products={products}
              clients={clients}
              onAddClient={handleAddClient}
              companyConfig={companyConfig}
              tasaDia={tasaDia}
              tasaVuelto={tasaVuelto}
              currentUser={currentUser}
              onRegisterSale={handleRegisterSale}
              onRegisterCajaMovement={handleRegisterCajaMovement}
              onProcessDivisaOperation={async (opData) => {
                await postApiData('/cajas/divisas-operaciones', opData);
                return true;
              }}
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
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              hasPermission={hasModulePermission}
              onRegisterAbono={handleRegisterAbono}
              abonos={abonos}
              getApiUrl={getApiUrl}
              nextInvoiceNumber={lastInvoiceInfo.next}
              lastInvoiceNumber={lastInvoiceInfo.last}
              onLogout={handleLogout}
            />
          )}

          {activeTab === 'inventario' && (
            <ErrorBoundary moduleName="Inventario">
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
            </ErrorBoundary>
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
              tasaDia={tasaDia}
            />

          )}

          {activeTab === 'clientes' && (
            <ErrorBoundary moduleName="Clientes">
              <Clientes
                clients={clients}
                currentUser={currentUser}
                cajaAbierta={cajaAbierta}
                companyConfig={companyConfig}
                getApiUrl={getApiUrl}
                onAddClient={handleAddClient}
                onAddClientsBulk={handleAddClientsBulk}
                onRegisterAbono={handleRegisterAbono}
                onUpdateClient={handleUpdateClient}
                onDeleteClient={handleDeleteClient}
                sales={sales}
                abonos={abonos}
                tasaDia={tasaDia}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'proveedores' && (
            <Proveedores
              proveedores={proveedores}
              compras={compras}
              pagosProveedores={pagosProveedores}
              cotizacionesProveedores={cotizacionesProveedores}
              products={products}
              currentUser={currentUser}
              cajaAbierta={cajaAbierta}
              tasaDia={tasaDia}
              companyConfig={companyConfig}
              getApiUrl={getApiUrl}
              onAddProveedor={handleAddProveedor}
              onUpdateProveedor={handleUpdateProveedor}
              onDeleteProveedor={handleDeleteProveedor}
              onAddCompra={handleAddCompra}
              onAddPagoProveedor={handleAddPagoProveedor}
              onAddCotizacion={handleAddCotizacion}
              onDeleteCotizacion={handleDeleteCotizacion}
              onRefreshData={handleRefreshProveedoresData}
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
                if (mode === 'all') {
                  setTasaHistory([]);
                  setUsers(prev => prev.filter(u => u.usuario.toLowerCase() === 'admin'));
                  setCompanyConfig({
                    rif: '',
                    nombre_comercio: '',
                    direccion: '',
                    telefono: '',
                    correo: '',
                    moneda_base: 'USD',
                    mensaje_pie_ticket: '',
                    metodos_pago_activos: []
                  });
                  localStorage.removeItem('pos_tasa_history');
                  localStorage.removeItem('pos_biz_info');
                  localStorage.removeItem('pos_users');
                  localStorage.removeItem('pos_roles');
                  localStorage.removeItem('pos_products');
                  localStorage.removeItem('pos_sales_log');
                  localStorage.removeItem('pos_clients');
                }
              }}
            />
          )}

          {/* TAB: INVERSIONES & ACCIONISTAS - Solo Administrador */}
          {activeTab === 'inversiones' && (
            <ErrorBoundary moduleName="Control de Inversiones y Accionistas">
              <InversionesModulo
                isOpen={true}
                onClose={() => setActiveTab('caja')}
                currentUser={currentUser}
                inline={true}
                subTab={inversionesSubTab}
                onSubTabChange={setInversionesSubTab}
                tasaDia={tasaDia}
                companyConfig={companyConfig}
              />
            </ErrorBoundary>
          )}

          {/* TAB: REPOSITORIO DE DOCUMENTOS LEGALES Y FISCALES */}
          {activeTab === 'documentos' && currentUser && (
            <ErrorBoundary moduleName="Bóveda Documental Legal y Fiscal">
              <RepositorioDocumental
                currentUser={currentUser}
                getApiUrl={getApiUrl}
                hasPermission={hasModulePermission}
              />
            </ErrorBoundary>
          )}
        </div>
      </main>

      {/* FOOTER BAR */}
      <footer className="bg-slate-900 border-t border-slate-800 py-3 px-6 select-none flex justify-between items-center text-[9px] text-slate-450 text-white flex-shrink-0">
        <span>Licencia activa para {companyConfig.nombre_comercio || 'su empresa'}</span>
        <span>Operador: {currentUser.nombre} (Turno Activo)</span>
        <span>SISTEMA WINTERPOS-AL v4.1.0</span>
      </footer>

      {/* MODAL DE REIMPRESIÓN DE TICKET */}
      {reprintSale && (
        <div 
          onClick={() => setReprintSale(null)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-750 rounded-2xl overflow-hidden w-full max-w-md shadow-2xl p-5 space-y-4"
          >
            
            {/* Currency Selector Toggle */}
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-slate-400">
                Moneda Ticket:
              </span>
              <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setReprintCurrency('USD')}
                  className={`px-3 py-1 text-[11px] font-extrabold font-sans rounded-md transition-all ${
                    reprintCurrency === 'USD'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  💵 $ (USD)
                </button>
                <button
                  type="button"
                  onClick={() => setReprintCurrency('VES')}
                  className={`px-3 py-1 text-[11px] font-extrabold font-sans rounded-md transition-all ${
                    reprintCurrency === 'VES'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🇻🇪 Bs (VES)
                </button>
              </div>
            </div>

            {/* Receipt Preview Body */}
            {(() => {
              const isVES = reprintCurrency === 'VES';
              const tasaVenta = (reprintSale.totalUSD > 0 && reprintSale.totalVES > 0)
                ? (reprintSale.totalVES / reprintSale.totalUSD)
                : (companyConfig?.tasa_oficial_bcv || 1);

              return (
                <div className="bg-white border border-slate-250 rounded-xl p-5 shadow-inner space-y-3 text-[10px] text-slate-900 max-h-[65vh] overflow-y-auto">
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

                  {/* Header Items */}
                  <div className="flex font-bold justify-between text-slate-500 text-[9px] border-b border-slate-200 pb-1">
                    <span>DESCRIPCIÓN / CANT x PRECIO</span>
                    <span>TOTAL</span>
                  </div>

                  {/* Items List - Two-line High Clarity Format */}
                  <div className="space-y-2 py-1">
                    {reprintSale.items.map((item: any, idx: number) => {
                      const isBulk = item.product?.a_granel || item.a_granel;
                      const rawQty = parseFloat(item.qty || '0');
                      const qtyDisplay = (isBulk || (rawQty % 1 !== 0))
                        ? (rawQty % 1 === 0 ? rawQty.toString() : rawQty.toFixed(3))
                        : Math.round(rawQty).toString();
                      const isExempt = item.product?.exento_impuesto === true || item.exento_impuesto === true || (item.product?.porcentaje_impuesto !== undefined && item.product?.porcentaje_impuesto === 0);
                      const taxLabel = isExempt ? ' (E)' : ' (G)';

                      const priceNumUSD = item.priceUSD ? item.priceUSD : (item.precioUSD ? item.precioUSD : 0);
                      const totalNumUSD = item.totalUSD ? item.totalUSD : (priceNumUSD * rawQty);

                      const priceDisplay = isVES 
                        ? formatBs(priceNumUSD * tasaVenta)
                        : `$${priceNumUSD.toFixed(2)}`;
                      const totalDisplay = isVES 
                        ? formatBs(totalNumUSD * tasaVenta)
                        : `$${totalNumUSD.toFixed(2)}`;

                      return (
                        <div key={idx} className="border-b border-dashed border-slate-150 pb-1.5 last:border-none last:pb-0">
                          <div className="font-bold text-slate-900 break-words text-[11px] leading-tight uppercase">
                            {item.product?.description || item.description}
                            <span className={isExempt ? "text-amber-700 font-extrabold text-[9px] ml-1" : "text-sky-700 font-bold text-[9px] ml-1"}>
                              {taxLabel}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10.5px] mt-0.5 pl-2 text-slate-650">
                            <span className="font-mono text-slate-600">
                              <span className="font-bold text-slate-850">{qtyDisplay}</span> x {priceDisplay}
                            </span>
                            <span className="font-black text-slate-900 font-mono">
                              {totalDisplay}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-center select-none text-slate-400">----------------------------------------</p>

                  {/* Summary */}
                  {isVES ? (
                    <div className="text-right space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span>SUBTOTAL VES:</span>
                        <span>{formatBs(reprintSale.subtotal * tasaVenta)}</span>
                      </div>
                      {((reprintSale.exento_usd ?? 0) > 0) && (
                        <div className="flex justify-between text-slate-700">
                          <span>MONTO EXENTO (E):</span>
                          <span>{formatBs((reprintSale.exento_usd || 0) * tasaVenta)}</span>
                        </div>
                      )}
                      {reprintSale.descuento > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>DESCUENTO:</span>
                          <span>-{formatBs(reprintSale.descuento * tasaVenta)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-extrabold text-sm border-t border-slate-300 pt-1 text-slate-900">
                        <span>TOTAL VES:</span>
                        <span>{formatBs(reprintSale.totalVES || (reprintSale.totalUSD * tasaVenta))}</span>
                      </div>
                      <div className="flex justify-between text-slate-500 font-bold border-t border-dashed border-slate-300 pt-1 text-[10px]">
                        <span>REF TOTAL USD:</span>
                        <span>${reprintSale.totalUSD.toFixed(2)} (Tasa: {formatBs(tasaVenta)})</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-right space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span>SUBTOTAL USD:</span>
                        <span>${reprintSale.subtotal.toFixed(2)}</span>
                      </div>
                      {((reprintSale.exento_usd ?? 0) > 0) && (
                        <div className="flex justify-between text-slate-700">
                          <span>MONTO EXENTO (E):</span>
                          <span>${(reprintSale.exento_usd || 0).toFixed(2)}</span>
                        </div>
                      )}
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
                        <span>{formatBs(reprintSale.totalVES)}</span>
                      </div>
                    </div>
                  )}

                  <p className="text-center select-none text-slate-400">----------------------------------------</p>

                  {/* Payments & Change */}
                  <div className="space-y-0.5">
                    <span className="font-bold block">MEDIOS DE PAGO LIQUIDADOS:</span>
                    {reprintSale.pagos.map((p, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{p.metodo} {p.bancoEmisor ? `(${p.bancoEmisor})` : ''} {p.reference ? `Ref:${p.reference}` : ''}:</span>
                        <span>{p.metodo.endsWith('$') || p.metodo.includes('Credito') ? `$${p.monto.toFixed(2)}` : formatBs(p.montoVES || p.monto)}</span>
                      </div>
                    ))}
                    {reprintSale.vueltoVES > 0 && (
                      <div className="flex justify-between font-bold border-t border-slate-300 pt-1 text-[11px]">
                        <span>CAMBIO VES:</span>
                        <span>{formatBs(reprintSale.vueltoVES)}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-center select-none text-slate-400">----------------------------------------</p>

                  <div className="text-center text-[9px] italic leading-relaxed text-slate-500">
                    {companyConfig.mensaje_pie_ticket}
                  </div>

                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={() => printTicketReceipt(reprintSale, companyConfig, currentUser, (reprintSale as any)?.vendedor || reprintSale.usuario, reprintCurrency)}
                className="w-full bg-sky-600 hover:bg-sky-500 text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 shadow active:scale-95"
                title="Imprimir copia de ticket en la impresora"
              >
                <Printer className="w-4 h-4" />
                IMPRIMIR TICKET ({reprintCurrency === 'VES' ? 'Bs' : '$'})
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

      {/* MASTER PASS MODAL - Guards Inversiones Tab access */}
      <MasterPassModal
        isOpen={showMasterPassModal}
        onClose={() => setShowMasterPassModal(false)}
        onSuccess={() => {
          setShowMasterPassModal(false);
          setInversionesUnlocked(true);
          setActiveTab('inversiones');
        }}
      />

      {/* MODAL GUÍA DE ACCESO MÓVIL Y CÓDIGO QR */}
      <ManualAccesoMovilModal
        isOpen={showManualAccesoModal}
        onClose={() => setShowManualAccesoModal(false)}
        lanIp={lanIP}
      />

      {/* DOCK FLOTANTE GLOBAL PARA REANUDAR PRODUCTO PAUSADO DESDE CUALQUIER MÓDULO (F1 - F10) */}
      {pausedProductDraft && currentUser && (
        <div 
          onClick={handleGlobalResumePausedDraft}
          className="fixed bottom-5 right-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white pl-4 pr-5 py-3 rounded-2xl shadow-2xl z-[999] flex items-center gap-3.5 cursor-pointer border border-amber-500/50 hover:border-amber-400 select-none group transition-all animate-bounce"
          title="Haga clic para reanudar el registro/edición del producto pausado"
        >
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400 font-black">
            <PauseCircle className="w-4 h-4 text-amber-400 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                {pausedProductDraft.type === 'new' ? 'REGISTRO EN PAUSA' : 'EDICIÓN EN PAUSA'}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div className="text-xs font-mono font-bold text-slate-100 max-w-[220px] truncate">
              {pausedProductDraft.data?.desc?.toUpperCase() || pausedProductDraft.data?.clave?.toUpperCase() || 'Producto...'}
            </div>
          </div>
          <div className="bg-amber-500 group-hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-xs ml-1 transition-all">
            <Play className="w-3 h-3 fill-current" />
            <span>Reanudar</span>
          </div>
        </div>
      )}

      {/* MODAL SELECTOR DE TEMAS Y PALETAS DE COLOR */}
      <ThemeSelectorModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        currentMode={themeMode}
        currentPalette={themePalette}
        onSelectMode={(mode) => setThemeMode(mode)}
        onSelectPalette={(palette) => setThemePalette(palette)}
        onResetDefault={handleResetThemeDefault}
      />

    </div>
  );
}
