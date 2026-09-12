import { useState, useEffect, useMemo } from 'react';
import { 
  Receipt, FileText, Search, X, RefreshCw, Clock, User, 
  Calendar, ChevronRight, Store, ChevronDown, Lock, RotateCcw
} from 'lucide-react';
import { getApiBaseUrl } from '../utils';
import MobileCierreCajaModal from './MobileCierreCajaModal';
import MobileDevolucionModal from './MobileDevolucionModal';

interface SaleItemData {
  product?: {
    id: number;
    description: string;
    barcode: string;
  };
  qty: number;
  priceType?: string;
  priceUSD: number;
  totalUSD: number;
}

interface PaymentData {
  metodo: string;
  monto: number;
  montoUSD: number;
  montoVES?: number;
  reference?: string;
  bancoEmisor?: string;
}

interface SaleData {
  id?: number;
  factura_nro: string;
  client?: {
    id?: number;
    nombre?: string;
    cedula_rif?: string;
    telefono?: string;
    direccion?: string;
  };
  cliente_nombre?: string;
  cliente_cedula?: string;
  items: SaleItemData[];
  subtotal?: number;
  descuento?: number;
  totalUSD: number;
  totalVES: number;
  pagos: PaymentData[];
  fecha: string;
  usuario: string;
  terminal?: string;
  tipo_documento?: string;
  nro_fiscal?: string;
}

interface CierreData {
  id: number;
  terminal?: string;
  usuario: string;
  fechaApertura?: string;
  fechaCierre?: string;
  aperturaUsd?: number;
  aperturaVes?: number;
  dineroEnCajaExpected?: number;
  expectedVes?: number;
  realUsd?: number;
  realVes?: number;
  diffUsd?: number;
  diffVes?: number;
  ventasTotalesUsd?: number;
  ventaTotalUsd?: number;
  ventasEfectivoUsd?: number;
  ventasEfectivoVes?: number;
  totalTickets?: number;
  salesCount?: number;
  pagosPagoMovilUsd?: number;
  pagosPuntoUsd?: number;
  pagosBiopagoUsd?: number;
  pagosCreditoUsd?: number;
  entradaEfectivoUsd?: number;
  salidaEfectivoUsd?: number;
}

// Helper to sort sales newest first (by timestamp descending, then ID descending)
const sortSalesDesc = (arr: SaleData[]): SaleData[] => {
  return [...arr].sort((a, b) => {
    const timeA = a.fecha ? new Date(a.fecha).getTime() : 0;
    const timeB = b.fecha ? new Date(b.fecha).getTime() : 0;
    if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) {
      return timeB - timeA;
    }
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
};

// Helper to sort cierres newest first (by timestamp descending, then ID descending)
const sortCierresDesc = (arr: CierreData[]): CierreData[] => {
  return [...arr].sort((a, b) => {
    const strA = a.fechaCierre || a.fechaApertura || '';
    const strB = b.fechaCierre || b.fechaApertura || '';
    const timeA = strA ? new Date(strA).getTime() : 0;
    const timeB = strB ? new Date(strB).getTime() : 0;
    if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) {
      return timeB - timeA;
    }
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
};

// Check if item date falls within [desde, hasta] range
const isDateInRange = (itemDateStr?: string | null, desde?: string, hasta?: string): boolean => {
  if (!desde && !hasta) return true;
  if (!itemDateStr) return false;
  const m = String(itemDateStr).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  const ymd = m ? m[1] : itemDateStr.substring(0, 10);
  if (desde && ymd < desde) return false;
  if (hasta && ymd > hasta) return false;
  return true;
};

export default function MobileVentas() {
  const [activeSubTab, setActiveSubTab] = useState<'facturas' | 'cierres'>('facturas');
  const [sales, setSales] = useState<SaleData[]>([]);
  const [cierres, setCierres] = useState<CierreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDocType, setFilterDocType] = useState<'ALL' | 'FAC' | 'NE'>('ALL');
  const [visibleSalesCount, setVisibleSalesCount] = useState<number>(30);
  const [tasaCobro, setTasaCobro] = useState<number>(36.5);

  // Date Range Filter States
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');
  const [showDateFilter, setShowDateFilter] = useState<boolean>(false);

  // Perform Cierre modal states
  const [isCierreModalOpen, setIsCierreModalOpen] = useState(false);
  const [activeCajaToClose, setActiveCajaToClose] = useState<any>(null);

  const fetchActiveCajaForCierre = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/manager/cajas-live`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          setActiveCajaToClose(list.find((c: any) => c.terminal === 'CAJA_01') || list[0]);
          return;
        }
      }
    } catch (_) {}
    setActiveCajaToClose({
      terminal: 'CAJA_01',
      cajero: 'Anderson Laguna',
      fechaApertura: new Date().toISOString(),
      aperturaUsd: 0,
      aperturaVes: 0,
      salesUsd: 0,
      salesVes: 0,
      cashExpectedUsd: 0,
      cashExpectedVes: 0,
      totalTickets: 0
    });
  };

  // Quick preset dates
  const applyDatePreset = (preset: 'hoy' | 'ayer' | '7dias' | 'mes' | 'todo') => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'hoy') {
      const t = toYMD(now);
      setFechaDesde(t);
      setFechaHasta(t);
    } else if (preset === 'ayer') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toYMD(y);
      setFechaDesde(yStr);
      setFechaHasta(yStr);
    } else if (preset === '7dias') {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      setFechaDesde(toYMD(past));
      setFechaHasta(toYMD(now));
    } else if (preset === 'mes') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setFechaDesde(toYMD(first));
      setFechaHasta(toYMD(now));
    } else if (preset === 'todo') {
      setFechaDesde('');
      setFechaHasta('');
    }
  };

  // Selected for modals
  const [selectedSale, setSelectedSale] = useState<SaleData | null>(null);
  const [selectedCierre, setSelectedCierre] = useState<CierreData | null>(null);
  const [saleToReturn, setSaleToReturn] = useState<any | null>(null);
  const [isDevModalOpen, setIsDevModalOpen] = useState(false);

  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const [resSales, resCierres, resTasas] = await Promise.all([
        fetch(`${getApiBaseUrl()}/sales`),
        fetch(`${getApiBaseUrl()}/cajas/cierres`),
        fetch(`${getApiBaseUrl()}/tasas`)
      ]);

      if (resSales.ok) {
        const salesJson = await resSales.json();
        // Explicitly sort newest first
        setSales(Array.isArray(salesJson) ? sortSalesDesc(salesJson) : []);
      }
      if (resCierres.ok) {
        const cierresJson = await resCierres.json();
        // Explicitly sort newest first
        setCierres(Array.isArray(cierresJson) ? sortCierresDesc(cierresJson) : []);
      }
      if (resTasas.ok) {
        const tasasJson = await resTasas.json();
        if (tasasJson.length > 0) {
          setTasaCobro(parseFloat(tasasJson[tasasJson.length - 1].tasa_cobro) || 36.5);
        }
      }
    } catch (err) {
      console.error('Error fetching sales / cierres:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered sales (Newest first + Search + DocType + Date range)
  const filteredSales = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const result = sales.filter((s) => {
      const facNum = (s.factura_nro || '').toLowerCase();
      const clientName = (s.client?.nombre || s.cliente_nombre || '').toLowerCase();
      const clientDoc = (s.client?.cedula_rif || s.cliente_cedula || '').toLowerCase();
      const cashier = (s.usuario || '').toLowerCase();

      const matchesSearch = !term || 
        facNum.includes(term) || 
        clientName.includes(term) || 
        clientDoc.includes(term) ||
        cashier.includes(term);

      if (!matchesSearch) return false;

      if (filterDocType === 'FAC') {
        const isFac = facNum.startsWith('fac') || s.tipo_documento === 'FACTURA_FISCAL';
        if (!isFac) return false;
      }
      if (filterDocType === 'NE') {
        const isNe = facNum.startsWith('ne') || s.tipo_documento === 'NOTA_ENTREGA';
        if (!isNe) return false;
      }

      // Date Range filter
      if (!isDateInRange(s.fecha, fechaDesde, fechaHasta)) {
        return false;
      }

      return true;
    });

    return sortSalesDesc(result);
  }, [sales, searchTerm, filterDocType, fechaDesde, fechaHasta]);

  // Filtered cierres (Newest first + Search + Date range)
  const filteredCierres = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const result = cierres.filter((c) => {
      const user = (c.usuario || '').toLowerCase();
      const termName = (c.terminal || '').toLowerCase();
      const fecha = (c.fechaCierre || c.fechaApertura || '').toLowerCase();

      const matchesSearch = !term || user.includes(term) || termName.includes(term) || fecha.includes(term);
      if (!matchesSearch) return false;

      // Date Range filter
      const cierreDate = c.fechaCierre || c.fechaApertura || '';
      if (!isDateInRange(cierreDate, fechaDesde, fechaHasta)) {
        return false;
      }

      return true;
    });

    return sortCierresDesc(result);
  }, [cierres, searchTerm, fechaDesde, fechaHasta]);

  // Summary Metrics
  const totalSalesUSD = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + (parseFloat(String(s.totalUSD || 0)) || 0), 0);
  }, [filteredSales]);

  const displayedSales = filteredSales.slice(0, visibleSalesCount);

  return (
    <div className="space-y-3 pb-28 pt-2 px-3 relative min-h-screen">
      {/* Header & Mode Switcher */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-400" />
              Auditoría de Ventas y Cierres
            </h2>
            <p className="text-xs text-slate-400">
              {sales.length} facturas registradas · {cierres.length} cierres de turno
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing || loading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>

        {/* Sub-Tabs: Facturas vs Cierres */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('facturas');
              setSearchTerm('');
            }}
            className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeSubTab === 'facturas'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Facturas ({sales.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab('cierres');
              setSearchTerm('');
            }}
            className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeSubTab === 'cierres'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Cierres de Caja ({cierres.length})</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeSubTab === 'facturas'
                ? 'Buscar por nro de factura, cliente o cajero...'
                : 'Buscar por cajero, terminal o fecha...'
            }
            className="w-full pl-9 pr-8 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
          />
          {searchTerm ? (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {/* Quick Filter Pills & Date Filter Button */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {activeSubTab === 'facturas' ? (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setFilterDocType('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  filterDocType === 'ALL'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setFilterDocType('FAC')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  filterDocType === 'FAC'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Facturas
              </button>
              <button
                type="button"
                onClick={() => setFilterDocType('NE')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  filterDocType === 'NE'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Notas Entrega
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400 font-medium">
              Turnos ordenados del más reciente al más antiguo
            </span>
          )}

          {/* Toggle Date Filter Button */}
          <button
            type="button"
            onClick={() => setShowDateFilter(!showDateFilter)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition active:scale-95 ${
              fechaDesde || fechaHasta
                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 shadow'
                : showDateFilter
                  ? 'bg-slate-800 border-slate-600 text-white'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {fechaDesde || fechaHasta
                ? `${fechaDesde ? fechaDesde.substring(5) : '...'} a ${fechaHasta ? fechaHasta.substring(5) : '...'}`
                : 'Fechas'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDateFilter ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Expandable Date Range Filter Drawer */}
        {showDateFilter && (
          <div className="p-3 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span>Rango de Fechas (Desde / Hasta)</span>
              </span>
              {(fechaDesde || fechaHasta) && (
                <button
                  type="button"
                  onClick={() => {
                    setFechaDesde('');
                    setFechaHasta('');
                  }}
                  className="text-[10px] text-rose-400 hover:text-rose-300 font-bold flex items-center gap-0.5"
                >
                  <X className="w-3 h-3" />
                  <span>Limpiar fechas</span>
                </button>
              )}
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
              {[
                { id: 'hoy', label: 'Hoy' },
                { id: 'ayer', label: 'Ayer' },
                { id: '7dias', label: 'Últimos 7 días' },
                { id: 'mes', label: 'Este Mes' },
                { id: 'todo', label: 'Todo' }
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyDatePreset(p.id as any)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold border border-slate-700 whitespace-nowrap active:scale-95"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Inputs Desde & Hasta */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Desde</label>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Hasta</label>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>

            {/* Range status badge */}
            {(fechaDesde || fechaHasta) && (
              <div className="pt-1 flex items-center justify-between text-[10px] text-emerald-400">
                <span>
                  ✓ Mostrando {activeSubTab === 'facturas' ? filteredSales.length : filteredCierres.length} registros en el período
                </span>
                <span className="font-mono text-slate-400">
                  {fechaDesde || 'Inicio'} → {fechaHasta || 'Hoy'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SUBTAB 1: FACTURAS LIST */}
      {activeSubTab === 'facturas' && (
        <>
          {/* Quick Metrics Banner */}
          <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-800/40 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">
                Total Facturado Filtrado
              </span>
              <span className="text-xl font-black text-white font-mono">
                ${totalSalesUSD.toFixed(2)} USD
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-medium">Equivalente Bs</span>
              <span className="text-xs font-bold text-slate-200 font-mono">
                {(totalSalesUSD * tasaCobro).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
              </span>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-3" />
              <p className="text-xs font-semibold">Cargando facturas registradas...</p>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
              <Receipt className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="font-bold text-slate-200 text-xs">No se encontraron facturas coincidentes</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayedSales.map((sale, idx) => {
                const clientName = sale.client?.nombre || sale.cliente_nombre || 'Consumidor Final';
                const clientDoc = sale.client?.cedula_rif || sale.cliente_cedula || 'V-00000000';
                const totalUSD = parseFloat(String(sale.totalUSD || 0));
                const totalVES = parseFloat(String(sale.totalVES || (totalUSD * tasaCobro)));
                const itemsCount = sale.items?.length || 0;
                const isFiscal = (sale.factura_nro || '').toUpperCase().startsWith('FAC');

                return (
                  <div
                    key={sale.id || `${sale.factura_nro}-${idx}`}
                    onClick={() => setSelectedSale(sale)}
                    className="bg-slate-900 border border-slate-800 hover:border-emerald-600/50 rounded-2xl p-3.5 shadow-md space-y-2.5 cursor-pointer transition active:scale-[0.99]"
                  >
                    {/* Top Row: Doc Number & Amount */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-black font-mono px-2 py-0.5 rounded-lg border ${
                          isFiscal 
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                            : 'bg-blue-950/80 text-blue-300 border-blue-800'
                        }`}>
                          {sale.factura_nro || 'S/N'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {sale.fecha ? sale.fecha.substring(0, 16) : ''}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-black font-mono text-emerald-400 block leading-tight">
                          ${totalUSD.toFixed(2)}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Client Info */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-bold text-white truncate">{clientName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{clientDoc}</p>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                          {itemsCount} {itemsCount === 1 ? 'producto' : 'productos'}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row: Cashier & Payments */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-500" />
                        <span>Cajero: <strong className="text-slate-300">{sale.usuario || 'SISTEMA'}</strong></span>
                      </div>

                      <div className="flex items-center gap-1 text-emerald-400 font-bold">
                        <span>Ver Detalle</span>
                        <ChevronRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Load more button */}
              {filteredSales.length > visibleSalesCount && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleSalesCount(prev => prev + 30)}
                    className="w-full py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-400 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow"
                  >
                    <ChevronDown className="w-4 h-4" />
                    <span>Cargar más facturas ({visibleSalesCount} de {filteredSales.length})</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* SUBTAB 2: CIERRES DE CAJA LIST */}
      {activeSubTab === 'cierres' && (
        <>
          {/* Quick Action: Perform Closing */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-3.5 flex items-center justify-between shadow-md">
            <div>
              <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                <Store className="w-4 h-4 text-amber-400" />
                <span>¿Deseas cerrar el turno actual?</span>
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Realiza el arqueo físico de efectivo y archiva el turno</p>
            </div>
            <button
              type="button"
              onClick={() => {
                fetchActiveCajaForCierre();
                setIsCierreModalOpen(true);
              }}
              className="py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow transition active:scale-95 shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Cerrar Turno</span>
            </button>
          </div>

          {loading ? (
            <div className="text-center py-16 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-xs font-semibold">Cargando historial de cierres...</p>
            </div>
          ) : filteredCierres.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
              <Store className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="font-bold text-slate-200 text-xs">No hay cierres de caja registrados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCierres.map((cierre) => {
                const diffUSD = parseFloat(String(cierre.diffUsd || 0));
                const totalVentasUSD = parseFloat(String(cierre.ventasTotalesUsd || cierre.ventaTotalUsd || 0));
                const expectedUSD = parseFloat(String(cierre.dineroEnCajaExpected || 0));
                const realUSD = parseFloat(String(cierre.realUsd || 0));
                const tickets = cierre.totalTickets || cierre.salesCount || 0;

                // Difference state
                const isCuadrada = Math.abs(diffUSD) < 0.01;
                const isSobrante = diffUSD > 0.01;

                return (
                  <div
                    key={cierre.id}
                    onClick={() => setSelectedCierre(cierre)}
                    className="bg-slate-900 border border-slate-800 hover:border-blue-600/50 rounded-2xl p-4 shadow-md space-y-3 cursor-pointer transition active:scale-[0.99]"
                  >
                    {/* Header Row: Terminal, Cashier & Badge */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
                          {cierre.terminal ? cierre.terminal.replace(/\D/g, '') || '#' : '#'}
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-white leading-tight">
                            {cierre.terminal || 'Caja Principal'}
                          </h3>
                          <p className="text-[10px] text-slate-400">
                            Cajero: <strong className="text-slate-200">{cierre.usuario || 'Operador'}</strong>
                          </p>
                        </div>
                      </div>

                      {/* Difference Badge */}
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                        isCuadrada
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                          : isSobrante
                          ? 'bg-blue-950/80 text-blue-300 border-blue-800'
                          : 'bg-rose-950/80 text-rose-300 border-rose-800'
                      }`}>
                        {isCuadrada 
                          ? 'Cuadrada' 
                          : isSobrante 
                          ? `Sobrante +$${diffUSD.toFixed(2)}` 
                          : `Faltante -$${Math.abs(diffUSD).toFixed(2)}`}
                      </span>
                    </div>

                    {/* Financial Metrics Row */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Ventas Turno
                        </span>
                        <span className="text-sm font-black text-white font-mono">
                          ${totalVentasUSD.toFixed(2)} USD
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {tickets} tickets emitidos
                        </span>
                      </div>

                      <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Efectivo en Gaveta
                        </span>
                        <span className="text-sm font-black text-emerald-400 font-mono">
                          ${realUSD.toFixed(2)} USD
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          Esperado: ${expectedUSD.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Footer Row: Timestamp & View Action */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>Cierre: {cierre.fechaCierre ? cierre.fechaCierre.substring(0, 16) : 'N/D'}</span>
                      </div>

                      <div className="flex items-center gap-1 text-blue-400 font-bold">
                        <span>Ver Arqueo Completo</span>
                        <ChevronRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DETALLE COMPLETO DE FACTURA / TICKET (MOBILE BOTTOM SHEET) */}
      {/* ========================================================================= */}
      {selectedSale && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-3 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white leading-tight">
                    Detalle de Factura
                  </h2>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {selectedSale.factura_nro} · {selectedSale.fecha ? selectedSale.fecha.substring(0, 16) : ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 overscroll-contain">
              {/* Client & Operator Info */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Cliente</span>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">
                    {selectedSale.client?.cedula_rif || selectedSale.cliente_cedula || 'V-00000000'}
                  </span>
                </div>
                <p className="text-xs font-bold text-white">
                  {selectedSale.client?.nombre || selectedSale.cliente_nombre || 'Consumidor Final'}
                </p>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Cajero: <strong className="text-slate-200">{selectedSale.usuario || 'Operador'}</strong></span>
                  <span>Terminal: <strong className="text-slate-200">{selectedSale.terminal || 'Caja 1'}</strong></span>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Productos Comprados</span>
                  <span className="text-[10px] text-slate-500">
                    {selectedSale.items?.length || 0} ítems
                  </span>
                </h4>

                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {selectedSale.items?.map((item, i) => {
                    const desc = item.product?.description || 'Producto';
                    const qty = item.qty || 1;
                    const price = parseFloat(String(item.priceUSD || 0));
                    const totalItem = parseFloat(String(item.totalUSD || (qty * price)));

                    return (
                      <div
                        key={i}
                        className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="font-bold text-white truncate text-[11px]">{desc}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {qty} x ${price.toFixed(2)} USD
                          </p>
                        </div>
                        <div className="text-right font-mono font-black text-white text-xs">
                          ${totalItem.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Payments Breakdown */}
              {selectedSale.pagos && selectedSale.pagos.length > 0 && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                  <h4 className="text-xs font-bold text-slate-300">Métodos de Pago Recibidos</h4>
                  <div className="space-y-1.5">
                    {selectedSale.pagos.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs text-slate-300">
                        <span className="font-medium text-[11px]">{p.metodo || 'Efectivo'}:</span>
                        <div className="text-right font-mono">
                          <span className="font-bold text-emerald-400">
                            ${(parseFloat(String(p.montoUSD || p.monto || 0))).toFixed(2)}
                          </span>
                          {p.reference && (
                            <span className="text-[9px] text-slate-500 block font-mono">
                              Ref: {p.reference}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total Summary */}
              <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-2xl p-4 space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold text-emerald-300 uppercase">Total a Pagar</span>
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    ${(parseFloat(String(selectedSale.totalUSD || 0))).toFixed(2)} USD
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-slate-300 pt-1 border-t border-emerald-900/40 font-mono">
                  <span>Equivalente en Bolívares:</span>
                  <span className="font-bold">
                    {(parseFloat(String(selectedSale.totalVES || (selectedSale.totalUSD * tasaCobro)))).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex-shrink-0 flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-white transition active:scale-95"
              >
                Cerrar Detalle
              </button>

              {!selectedSale.factura_nro?.startsWith('DEV-') && (
                <button
                  type="button"
                  onClick={() => {
                    setSaleToReturn(selectedSale);
                    setIsDevModalOpen(true);
                  }}
                  className="py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-lg shadow-purple-600/20"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Devolución</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DETALLE COMPLETO DE CIERRE DE CAJA (MOBILE BOTTOM SHEET) */}
      {/* ========================================================================= */}
      {selectedCierre && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-3 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-black">
                  <Store className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white leading-tight">
                    Detalle de Cierre de Caja
                  </h2>
                  <p className="text-[10px] text-slate-400">
                    {selectedCierre.terminal || 'Caja Principal'} · {selectedCierre.usuario}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCierre(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 overscroll-contain">
              {/* Shift Timing */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Fecha de Apertura:</span>
                  <span className="font-mono text-slate-200 font-bold">
                    {selectedCierre.fechaApertura ? selectedCierre.fechaApertura.substring(0, 16) : 'N/D'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Fecha de Cierre:</span>
                  <span className="font-mono text-slate-200 font-bold">
                    {selectedCierre.fechaCierre ? selectedCierre.fechaCierre.substring(0, 16) : 'N/D'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-800">
                  <span className="text-slate-400">Total Facturas / Tickets:</span>
                  <span className="font-mono font-black text-blue-400">
                    {selectedCierre.totalTickets || selectedCierre.salesCount || 0}
                  </span>
                </div>
              </div>

              {/* Cash Reconciliation (Arqueo de Efectivo) */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Arqueo de Efectivo en Gaveta
                </h4>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-bold">Apertura Inicial</span>
                    <span className="text-sm font-black text-slate-200 font-mono">
                      ${(selectedCierre.aperturaUsd || 0).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      Bs {(selectedCierre.aperturaVes || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-bold">Efectivo Esperado</span>
                    <span className="text-sm font-black text-slate-200 font-mono">
                      ${(selectedCierre.dineroEnCajaExpected || 0).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      Bs {(selectedCierre.expectedVes || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-blue-400 block font-bold">Físico Contado Real</span>
                    <span className="text-sm font-black text-blue-300 font-mono">
                      ${(selectedCierre.realUsd || 0).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      Bs {(selectedCierre.realVes || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-bold">Diferencia (Balance)</span>
                    <span className={`text-sm font-black font-mono ${
                      (selectedCierre.diffUsd || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {(selectedCierre.diffUsd || 0) >= 0 ? '+' : ''}${(selectedCierre.diffUsd || 0).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      Bs {(selectedCierre.diffVes || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Sales Summary */}
              <div className="bg-gradient-to-r from-blue-950/60 to-slate-900 border border-blue-900/40 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-300 uppercase">Ventas Totales del Turno</span>
                  <span className="text-xl font-black font-mono text-white">
                    ${(selectedCierre.ventasTotalesUsd || selectedCierre.ventaTotalUsd || 0).toFixed(2)} USD
                  </span>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-blue-900/30 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span>Ventas Efectivo USD:</span>
                    <span className="font-mono font-bold">${(selectedCierre.ventasEfectivoUsd || 0).toFixed(2)}</span>
                  </div>
                  {selectedCierre.pagosPagoMovilUsd ? (
                    <div className="flex justify-between">
                      <span>Ventas Pago Móvil:</span>
                      <span className="font-mono font-bold">${selectedCierre.pagosPagoMovilUsd.toFixed(2)}</span>
                    </div>
                  ) : null}
                  {selectedCierre.pagosPuntoUsd ? (
                    <div className="flex justify-between">
                      <span>Ventas Tarjeta / Punto:</span>
                      <span className="font-mono font-bold">${selectedCierre.pagosPuntoUsd.toFixed(2)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex-shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCierre(null)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-white transition active:scale-95"
              >
                Cerrar Arqueo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Realizar Cierre de Caja */}
      <MobileCierreCajaModal
        isOpen={isCierreModalOpen}
        onClose={() => setIsCierreModalOpen(false)}
        caja={activeCajaToClose}
        onSuccess={() => {
          fetchData();
        }}
      />

      {/* Modal Realizar Devolución de Venta */}
      <MobileDevolucionModal
        isOpen={isDevModalOpen}
        onClose={() => {
          setIsDevModalOpen(false);
          setSaleToReturn(null);
        }}
        preSelectedSale={saleToReturn}
        tasaDia={tasaCobro}
        onSuccess={() => {
          fetchData();
          setSelectedSale(null);
        }}
      />
    </div>
  );
}
