import { useState, useEffect } from 'react';
import { 
  TrendingUp, Receipt, Store, Package, Briefcase, Settings, 
  Monitor, ShoppingBag
} from 'lucide-react';
import MobileDashboard from './MobileDashboard';
import MobilePOS from './MobilePOS';
import MobileVentas from './MobileVentas';
import MobileCajas from './MobileCajas';
import MobileInventario from './MobileInventario';
import MobileFinanzas from './MobileFinanzas';
import MobileSettings from './MobileSettings';
import MobileTasaModal from './MobileTasaModal';
import { Product, Client, User, CompanyConfig, Sale } from '../types';
import { getApiBaseUrl } from '../utils';

interface Props {
  onSwitchToDesktop: () => void;
  products?: Product[];
  clients?: Client[];
  companyConfig?: CompanyConfig;
  tasaDia?: number;
  tasaVuelto?: number;
  currentUser?: User | null;
  cajaAbierta?: boolean;
  montoAperturaUsd?: number;
  montoAperturaVes?: number;
  onAbrirCaja?: (usd: number, ves: number) => void;
  onRegisterSale?: (sale: any) => Promise<Sale | undefined> | void;
  onAddClient?: (cli: Client) => Promise<void> | void;
}

export default function MobileApp({
  onSwitchToDesktop,
  products: initialProducts = [],
  clients: initialClients = [],
  companyConfig: initialCompanyConfig,
  tasaDia: initialTasaDia = 0,
  tasaVuelto: initialTasaVuelto = 0,
  currentUser = null,
  cajaAbierta: initialCajaAbierta = true,
  montoAperturaUsd = 0,
  montoAperturaVes = 0,
  onAbrirCaja,
  onRegisterSale,
  onAddClient
}: Props) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ventas' | 'inventario' | 'cajas' | 'finanzas' | 'settings'>('dashboard');
  const [ventasMode, setVentasMode] = useState<'pos' | 'historico'>('pos');
  const [isTasaModalOpen, setIsTasaModalOpen] = useState(false);

  // Local state fallback if props not provided or empty
  const [localProducts, setLocalProducts] = useState<Product[]>(initialProducts);
  const [localClients, setLocalClients] = useState<Client[]>(initialClients);
  const [localTasaDia, setLocalTasaDia] = useState<number>(initialTasaDia);
  const [localTasaVuelto, setLocalTasaVuelto] = useState<number>(initialTasaVuelto);
  const [localMoneda, setLocalMoneda] = useState<'usd' | 'eur'>(() => {
    return (localStorage.getItem('pos_mobile_tasa_currency') as 'usd' | 'eur') || 'usd';
  });
  const [localCajaAbierta, setLocalCajaAbierta] = useState<boolean>(initialCajaAbierta);
  const [localCompanyConfig, setLocalCompanyConfig] = useState<CompanyConfig>(
    initialCompanyConfig || {
      nombre: 'INVERSIONES NIQUITAO JB AL 3000',
      rif: 'J-411332631',
      telefono: '',
      direccion: ''
    } as any
  );

  // Sync props to state if props update
  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) setLocalProducts(initialProducts);
  }, [initialProducts]);

  useEffect(() => {
    if (initialClients && initialClients.length > 0) setLocalClients(initialClients);
  }, [initialClients]);

  useEffect(() => {
    if (initialTasaDia > 0) setLocalTasaDia(initialTasaDia);
  }, [initialTasaDia]);

  useEffect(() => {
    if (initialTasaVuelto > 0) setLocalTasaVuelto(initialTasaVuelto);
  }, [initialTasaVuelto]);

  useEffect(() => {
    setLocalCajaAbierta(initialCajaAbierta);
  }, [initialCajaAbierta]);

  useEffect(() => {
    if (initialCompanyConfig) setLocalCompanyConfig(initialCompanyConfig);
  }, [initialCompanyConfig]);

  // Fallback initial fetch if standalone
  useEffect(() => {
    const fetchFallbackData = async () => {
      try {
        if (localProducts.length === 0) {
          const resP = await fetch(`${getApiBaseUrl()}/productos`);
          if (resP.ok) {
            const dataP = await resP.json();
            setLocalProducts(Array.isArray(dataP) ? dataP : []);
          }
        }

        if (localClients.length === 0) {
          const resC = await fetch(`${getApiBaseUrl()}/clientes`);
          if (resC.ok) {
            const dataC = await resC.json();
            setLocalClients(Array.isArray(dataC) ? dataC : []);
          }
        }

        if (!localTasaDia) {
          const resT = await fetch(`${getApiBaseUrl()}/tasas`);
          if (resT.ok) {
            const dataT = await resT.json();
            if (dataT && dataT.tasa) {
              setLocalTasaDia(parseFloat(dataT.tasa) || 1);
              setLocalTasaVuelto(parseFloat(dataT.tasa_vuelto || dataT.tasa) || 1);
            }
          }
        }
      } catch (err) {
        console.warn('Fallback data fetch warning:', err);
      }
    };

    fetchFallbackData();
  }, []);

  // Handle sale register with fallback
  const handleRegisterSaleFallback = async (saleData: any): Promise<Sale | undefined> => {
    if (onRegisterSale) {
      return await onRegisterSale(saleData);
    }

    // Direct fetch fallback
    const res = await fetch(`${getApiBaseUrl()}/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saleData)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error HTTP ${res.status} al registrar venta.`);
    }

    const saved = await res.json();
    return saved;
  };

  // Handle abrir caja with fallback
  const handleAbrirCajaFallback = async (usd: number, ves: number) => {
    if (onAbrirCaja) {
      onAbrirCaja(usd, ves);
      setLocalCajaAbierta(true);
      return;
    }

    try {
      await fetch(`${getApiBaseUrl()}/cajas/abrir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminal: 'CAJA_01',
          montoAperturaUsd: usd,
          montoAperturaVes: ves,
          usuarioId: currentUser?.id || 1,
          usuarioNombre: currentUser?.nombre || 'Operador'
        })
      });
      setLocalCajaAbierta(true);
    } catch (e) {
      console.warn('Abrir caja fallback error:', e);
      setLocalCajaAbierta(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 selection:text-white flex flex-col max-w-md mx-auto relative shadow-2xl">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-blue-900/40">
            WP
          </div>
          <div>
            <h1 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5 leading-none">
              WinterPos
              <span className="text-[9px] bg-blue-500/20 text-blue-400 font-bold px-1.5 py-0.5 rounded-full border border-blue-500/30">
                MÓVIL
              </span>
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Punto de Venta & Gerencial</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Quick BCV Rate button */}
          <button
            onClick={() => setIsTasaModalOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition active:scale-95 shadow-sm border ${
              localMoneda === 'eur'
                ? 'bg-blue-950/70 hover:bg-blue-900/80 border-blue-500/40 text-blue-300'
                : 'bg-emerald-950/70 hover:bg-emerald-900/80 border-emerald-500/40 text-emerald-300'
            }`}
            title="Actualizar Tasa del Día ($ / Euro)"
          >
            <span className={`text-[9px] font-black uppercase px-1 py-0.5 rounded ${
              localMoneda === 'eur'
                ? 'text-blue-300 bg-blue-900/60'
                : 'text-emerald-400 bg-emerald-900/60'
            }`}>
              {localMoneda === 'eur' ? 'BCV €' : 'BCV $'}
            </span>
            <span className="text-xs font-black font-mono">{localTasaDia > 0 ? localTasaDia.toFixed(2) : '36.50'}</span>
          </button>

          <button
            onClick={onSwitchToDesktop}
            className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2.5 py-1.5 rounded-xl transition active:scale-95"
            title="Ver versión de escritorio completa"
          >
            <Monitor className="w-3.5 h-3.5 text-blue-400" />
            <span>Escritorio</span>
          </button>
        </div>
      </header>

      {/* Ventas Subheader Tabs (POS Facturar vs Historial) */}
      {activeTab === 'ventas' && (
        <div className="bg-slate-900 border-b border-slate-800 p-2 flex items-center gap-1.5 sticky top-12 z-30 shadow-md">
          <button
            onClick={() => setVentasMode('pos')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
              ventasMode === 'pos'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Facturar (POS)</span>
          </button>

          <button
            onClick={() => setVentasMode('historico')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
              ventasMode === 'historico'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Historial</span>
          </button>

          <button
            onClick={() => setActiveTab('cajas')}
            className="py-1.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/50 active:scale-95"
            title="Ir al monitor y cierres de cajas"
          >
            <Store className="w-3.5 h-3.5 text-amber-400" />
            <span>Cajas / Cierre</span>
          </button>
        </div>
      )}

      {/* Main View Body */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <MobileDashboard 
            onNavigateTab={(tab) => {
              if (tab === 'ventas' as any) {
                setActiveTab('ventas');
                setVentasMode('pos');
              } else {
                setActiveTab(tab);
              }
            }} 
          />
        )}

        {activeTab === 'ventas' && (
          ventasMode === 'pos' ? (
            <MobilePOS
              products={localProducts}
              clients={localClients}
              companyConfig={localCompanyConfig}
              tasaDia={localTasaDia}
              tasaVuelto={localTasaVuelto}
              currentUser={currentUser}
              cajaAbierta={localCajaAbierta}
              montoAperturaUsd={montoAperturaUsd}
              montoAperturaVes={montoAperturaVes}
              onAbrirCaja={handleAbrirCajaFallback}
              onRegisterSale={handleRegisterSaleFallback}
              onAddClient={onAddClient}
            />
          ) : (
            <MobileVentas />
          )
        )}

        {activeTab === 'inventario' && <MobileInventario currentUser={currentUser} />}
        {activeTab === 'cajas' && <MobileCajas />}
        {activeTab === 'finanzas' && (
          <MobileFinanzas 
            tasaDia={localTasaDia} 
            companyConfig={localCompanyConfig} 
          />
        )}
        {activeTab === 'settings' && <MobileSettings onSwitchToDesktop={onSwitchToDesktop} />}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 max-w-md mx-auto px-1 py-1.5 grid grid-cols-6 items-center shadow-2xl">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition ${
            activeTab === 'dashboard'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <TrendingUp className={`w-4 h-4 ${activeTab === 'dashboard' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[9px] mt-0.5">KPIs</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('ventas');
            setVentasMode('pos');
          }}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition ${
            activeTab === 'ventas'
              ? 'text-emerald-400 font-bold'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <ShoppingBag className={`w-4 h-4 ${activeTab === 'ventas' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[9px] mt-0.5 font-black">Vender</span>
        </button>

        <button
          onClick={() => setActiveTab('inventario')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition ${
            activeTab === 'inventario'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Package className={`w-4 h-4 ${activeTab === 'inventario' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[9px] mt-0.5">Stock</span>
        </button>

        <button
          onClick={() => setActiveTab('cajas')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition ${
            activeTab === 'cajas'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Store className={`w-4 h-4 ${activeTab === 'cajas' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[9px] mt-0.5">Cajas</span>
        </button>

        <button
          onClick={() => setActiveTab('finanzas')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition ${
            activeTab === 'finanzas'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Briefcase className={`w-4 h-4 ${activeTab === 'finanzas' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[9px] mt-0.5">Finanzas</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition ${
            activeTab === 'settings'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Settings className={`w-4 h-4 ${activeTab === 'settings' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[9px] mt-0.5">Ajustes</span>
        </button>
      </nav>

      {/* Modal Actualización Rápida Tasa BCV ($ o Euro) */}
      <MobileTasaModal
        isOpen={isTasaModalOpen}
        onClose={() => setIsTasaModalOpen(false)}
        currentTasa={localTasaDia || 36.5}
        currentTasaVuelto={localTasaVuelto || localTasaDia || 36.5}
        initialMoneda={localMoneda}
        userName={currentUser?.nombre || 'Administrador Móvil'}
        onRateUpdated={(newCobro, newVuelto, nuevaMoneda) => {
          setLocalTasaDia(newCobro);
          setLocalTasaVuelto(newVuelto);
          if (nuevaMoneda) setLocalMoneda(nuevaMoneda);
        }}
      />
    </div>
  );
}
