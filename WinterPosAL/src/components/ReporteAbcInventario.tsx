import { useState, useEffect, useMemo } from 'react';
import { 
  PieChart, 
  AlertTriangle, 
  RefreshCw, 
  Search, 
  Filter, 
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { getApiBaseUrl } from '../utils';

interface AbcItem {
  id: number;
  barcode: string;
  description: string;
  category: string;
  stock_actual: number;
  stock_minimo: number;
  precio_costo_usd: number;
  precio_detalle_usd: number;
  stock_value_cost_usd: number;
  stock_value_detail_usd: number;
  es_combo: boolean;
  a_granel: boolean;
  total_qty_sold: number;
  total_sales_usd: number;
  total_cogs_usd: number;
  total_profit_usd: number;
  abc_class: 'A' | 'B' | 'C';
  accumulated_pct: number;
}

interface AbcSummary {
  periodDays: number;
  metric: 'sales' | 'profit' | 'qty';
  grandTotalSalesUSD: number;
  grandTotalProfitUSD: number;
  grandTotalQtySold: number;
  totalProductsCount: number;
  classA: { count: number; salesUSD: number; pctOfTotal: number };
  classB: { count: number; salesUSD: number; pctOfTotal: number };
  classC: { count: number; salesUSD: number; pctOfTotal: number; capitalFrozenCostUSD: number };
}

interface ReporteAbcInventarioProps {
  tasaDia: number;
  onRefreshProducts?: () => void;
}

export default function ReporteAbcInventario({ tasaDia, onRefreshProducts }: ReporteAbcInventarioProps) {
  const [periodDays, setPeriodDays] = useState<number>(90);
  const [metric, setMetric] = useState<'sales' | 'profit' | 'qty'>('sales');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AbcItem[]>([]);
  const [summary, setSummary] = useState<AbcSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [classFilter, setClassFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fetchAbcData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/reports/inventory-abc?days=${periodDays}&metric=${metric}`);
      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch (_) {
        throw new Error(`Respuesta inválida (${res.status}): ${resText || 'Sin respuesta'}`);
      }

      if (res.ok && data.success) {
        setItems(data.items || []);
        setSummary(data.summary || null);
        if (onRefreshProducts) onRefreshProducts();
      } else {
        throw new Error(data.error || `HTTP ${res.status}: Error al obtener el reporte ABC`);
      }
    } catch (err: any) {
      console.error('Error fetching ABC report:', err);
      setError(err.message || 'No se pudo cargar la clasificación ABC');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAbcData();
  }, [periodDays, metric]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = 
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchClass = classFilter === 'all' || item.abc_class === classFilter;
      return matchSearch && matchClass;
    });
  }, [items, searchQuery, classFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, classFilter, periodDays, metric, pageSize]);

  const totalPages = useMemo(() => {
    if (pageSize === 0 || filteredItems.length === 0) return 1;
    return Math.ceil(filteredItems.length / pageSize);
  }, [filteredItems.length, pageSize]);

  const paginatedItems = useMemo(() => {
    if (pageSize === 0) return filteredItems;
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const startIndex = useMemo(() => {
    if (filteredItems.length === 0) return 0;
    if (pageSize === 0) return 1;
    return (currentPage - 1) * pageSize + 1;
  }, [filteredItems.length, currentPage, pageSize]);

  const endIndex = useMemo(() => {
    if (pageSize === 0) return filteredItems.length;
    return Math.min(currentPage * pageSize, filteredItems.length);
  }, [filteredItems.length, currentPage, pageSize]);

  const activeSummary = useMemo(() => {
    if (!items || items.length === 0) return summary;

    let countA = 0, salesA = 0;
    let countB = 0, salesB = 0;
    let countC = 0, salesC = 0;
    let capitalFrozenC = 0;
    let totalSales = 0;

    items.forEach(item => {
      totalSales += item.total_sales_usd;
      if (item.abc_class === 'A') {
        countA++;
        salesA += item.total_sales_usd;
      } else if (item.abc_class === 'B') {
        countB++;
        salesB += item.total_sales_usd;
      } else {
        countC++;
        salesC += item.total_sales_usd;
        capitalFrozenC += item.stock_value_cost_usd;
      }
    });

    return {
      totalProductsCount: items.length,
      grandTotalSalesUSD: totalSales,
      classA: {
        count: countA,
        salesUSD: salesA,
        pctOfTotal: totalSales > 0 ? parseFloat(((salesA / totalSales) * 100).toFixed(1)) : 0
      },
      classB: {
        count: countB,
        salesUSD: salesB,
        pctOfTotal: totalSales > 0 ? parseFloat(((salesB / totalSales) * 100).toFixed(1)) : 0
      },
      classC: {
        count: countC,
        salesUSD: salesC,
        pctOfTotal: totalSales > 0 ? parseFloat(((salesC / totalSales) * 100).toFixed(1)) : 0,
        capitalFrozenCostUSD: capitalFrozenC
      }
    };
  }, [items, summary]);

  const formatBs = (valUsd: number) => {
    return (valUsd * tasaDia).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs';
  };

  const renderPaginationControls = () => {
    if (pageSize === 0 || totalPages <= 1) return null;

    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setCurrentPage(1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 cursor-pointer transition-all shadow-2xs"
          title="Primera página"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-all shadow-2xs text-xs"
        >
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>

        <div className="flex items-center gap-1 px-2 font-mono font-bold text-xs text-slate-800">
          <span>Página</span>
          <span className="px-2 py-0.5 bg-slate-900 text-white rounded-md">{currentPage}</span>
          <span>de {totalPages}</span>
        </div>

        <button
          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-all shadow-2xs text-xs"
        >
          Siguiente <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setCurrentPage(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 cursor-pointer transition-all shadow-2xs"
          title="Última página"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* HEADER BAR & FILTERS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-sm text-slate-900">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 shadow-2xs">
              <PieChart className="w-6 h-6 text-slate-800" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900 font-mono uppercase">
                Clasificación ABC de Inventario (Regla Pareto 80/20)
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Identifica productos estrella (Clase A), rotación moderada (Clase B) y capital estancado o sin rotación (Clase C).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Period selector */}
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-1">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase px-2 font-mono">Periodo:</span>
              {[
                { label: '30 Días', value: 30 },
                { label: '60 Días', value: 60 },
                { label: '90 Días', value: 90 },
                { label: '180 Días', value: 180 },
                { label: '1 Año', value: 365 },
              ].map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriodDays(p.value)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    periodDays === p.value
                      ? 'bg-slate-900 text-white shadow-xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Metric selector */}
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-1">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase px-2 font-mono">Criterio:</span>
              {[
                { label: 'Ingresos ($)', value: 'sales' },
                { label: 'Utilidad ($)', value: 'profit' },
                { label: 'Unidades Sold', value: 'qty' },
              ].map(m => (
                <button
                  key={m.value}
                  onClick={() => setMetric(m.value as any)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    metric === m.value
                      ? 'bg-slate-800 text-white shadow-xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <button
              onClick={fetchAbcData}
              disabled={loading}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 hover:text-slate-900 rounded-xl transition-all shadow-2xs flex items-center justify-center cursor-pointer"
              title="Recargar reporte ABC"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-slate-600' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI SUMMARY CARDS - EXECUTIVE FORMAL FINANCING CARDS */}
      {activeSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* CLASE A CARD */}
          <div className="bg-slate-50/80 border border-slate-200 border-l-4 border-l-emerald-600 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-2xs"></span>
                Clase A (80% Rotación)
              </div>
              <span className="text-[11px] font-semibold font-mono text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                {activeSummary.classA?.count || 0} prods
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                ${(activeSummary.classA?.salesUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500 font-medium flex-wrap gap-1">
                <span className="font-mono text-slate-700 font-bold">{formatBs(activeSummary.classA?.salesUSD || 0)}</span>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded font-mono border border-emerald-200">
                  {activeSummary.classA?.pctOfTotal || 0}% del Total
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/80 text-[11px] text-slate-500 font-medium">
              ⭐ Productos Alta Rotación: Mantener 0 quiebres.
            </div>
          </div>

          {/* CLASE B CARD */}
          <div className="bg-slate-50/80 border border-slate-200 border-l-4 border-l-amber-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-2xs"></span>
                Clase B (15% Rotación)
              </div>
              <span className="text-[11px] font-semibold font-mono text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                {activeSummary.classB?.count || 0} prods
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                ${(activeSummary.classB?.salesUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500 font-medium flex-wrap gap-1">
                <span className="font-mono text-slate-700 font-bold">{formatBs(activeSummary.classB?.salesUSD || 0)}</span>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded font-mono border border-amber-200">
                  {activeSummary.classB?.pctOfTotal || 0}% del Total
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/80 text-[11px] text-slate-500 font-medium">
              📦 Rotación Moderada: Monitorear niveles de reposición.
            </div>
          </div>

          {/* CLASE C CARD */}
          <div className="bg-slate-50/80 border border-slate-200 border-l-4 border-l-rose-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-2xs"></span>
                Clase C (5% / Sin Ventas)
              </div>
              <span className="text-[11px] font-semibold font-mono text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                {activeSummary.classC?.count || 0} prods
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                ${(activeSummary.classC?.salesUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500 font-medium flex-wrap gap-1">
                <span className="font-mono text-slate-700 font-bold">{formatBs(activeSummary.classC?.salesUSD || 0)}</span>
                <span className="text-[10px] font-bold text-rose-800 bg-rose-100/80 px-2 py-0.5 rounded font-mono border border-rose-200">
                  {activeSummary.classC?.pctOfTotal || 0}% del Total
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/80 text-[11px] text-slate-500 font-medium">
              ⚠️ Baja Rotación: Promocionar combos o liquidar.
            </div>
          </div>

          {/* CAPITAL FROZEN CARD */}
          <div className="bg-slate-50/80 border border-slate-200 border-l-4 border-l-slate-700 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700 inline-block shadow-2xs"></span>
                Capital Congelado (Clase C)
              </div>
              <div className="p-1 text-slate-500">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                ${(activeSummary.classC?.capitalFrozenCostUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500 font-medium flex-wrap gap-1 font-mono">
                <span className="font-bold text-slate-700">{formatBs(activeSummary.classC?.capitalFrozenCostUSD || 0)}</span>
                <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold">(Costo en Almacén)</span>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/80 text-[11px] text-slate-500 font-medium">
              💡 Dinero atrapado en mercancía de lenta salida.
            </div>
          </div>
        </div>
      )}

      {/* SEARCH, CLASS FILTERS, AND PAGE SIZE SELECTOR */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por producto, código o categoría..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Class Filters */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 uppercase hidden sm:flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" /> Clase:
            </span>
            {[
              { label: 'Todos', value: 'all' },
              { label: '🟢 Clase A', value: 'A' },
              { label: '🟡 Clase B', value: 'B' },
              { label: '🔴 Clase C', value: 'C' },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setClassFilter(f.value as any)}
                className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  classFilter === f.value
                    ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Page Size Selector dropdown matching image 2 */}
          <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
            <span className="text-xs font-bold text-slate-600">Mostrar:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
            >
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
              <option value={250}>250 por página</option>
              <option value={0}>Mostrar Todos ({filteredItems.length})</option>
            </select>
          </div>
        </div>
      </div>

      {/* PRODUCT ABC TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Calculando clasificación Pareto ABC...</p>
          </div>
        ) : error ? (
          <div className="p-10 text-center text-rose-600 space-y-2">
            <AlertTriangle className="w-8 h-8 mx-auto text-rose-500" />
            <p className="text-sm font-bold">{error}</p>
            <button
              onClick={fetchAbcData}
              className="px-4 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-slate-700 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Info className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold">No se encontraron productos en la clasificación ABC con los filtros actuales.</p>
          </div>
        ) : (
          <div>
            {/* HEADER PAGINATION CONTROLS (TOP OF TABLE) */}
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-700">
              <div className="font-medium text-slate-600">
                Mostrando <span className="font-extrabold text-slate-900">{startIndex}</span> - <span className="font-extrabold text-slate-900">{endIndex}</span> de <span className="font-extrabold text-slate-900">{filteredItems.length}</span> productos
              </div>
              {renderPaginationControls()}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-slate-200 text-[11px] font-black uppercase font-mono tracking-wider">
                    <th className="px-4 py-3 border-b border-slate-800">Clase ABC</th>
                    <th className="px-4 py-3 border-b border-slate-800">% Acumulado</th>
                    <th className="px-4 py-3 border-b border-slate-800">Código</th>
                    <th className="px-4 py-3 border-b border-slate-800">Producto</th>
                    <th className="px-4 py-3 border-b border-slate-800">Categoría</th>
                    <th className="px-4 py-3 border-b border-slate-800 text-right">Stock Actual</th>
                    <th className="px-4 py-3 border-b border-slate-800 text-right">Unid. Vendidas</th>
                    <th className="px-4 py-3 border-b border-slate-800 text-right">Ventas Total ($)</th>
                    <th className="px-4 py-3 border-b border-slate-800 text-right">Utilidad Bruta ($)</th>
                    <th className="px-4 py-3 border-b border-slate-800 text-right">Valor Stock Costo ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs text-slate-800 font-sans">
                  {paginatedItems.map((item) => {
                    const classBadge = 
                      item.abc_class === 'A' 
                        ? 'bg-emerald-600 text-white font-black shadow-2xs' 
                        : item.abc_class === 'B' 
                        ? 'bg-amber-500 text-white font-black shadow-2xs' 
                        : 'bg-rose-600 text-white font-black shadow-2xs';

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-lg text-xs inline-flex items-center gap-1 ${classBadge}`}>
                            {item.abc_class === 'A' && '🟢 Clase A'}
                            {item.abc_class === 'B' && '🟡 Clase B'}
                            {item.abc_class === 'C' && '🔴 Clase C'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap font-mono font-bold text-slate-700">
                          {item.accumulated_pct.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap font-mono text-slate-600 font-medium">
                          {item.barcode || `#${item.id}`}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-900">
                          {item.description}
                          {item.es_combo && (
                            <span className="ml-2 px-2 py-0.5 text-[9px] font-black uppercase bg-blue-100 text-blue-800 border border-blue-300 rounded-md">
                              🎁 COMBO
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 font-semibold">
                          {item.category}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right font-mono font-bold text-slate-900">
                          {item.stock_actual} {item.a_granel ? 'Kg' : 'Uds'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right font-mono font-bold text-slate-800">
                          {item.total_qty_sold.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right font-mono font-extrabold text-slate-900">
                          ${item.total_sales_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <div className="text-[10px] text-slate-500 font-normal">{formatBs(item.total_sales_usd)}</div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right font-mono font-bold text-emerald-700">
                          ${item.total_profit_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right font-mono font-bold text-blue-900">
                          ${item.stock_value_cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* FOOTER PAGINATION CONTROLS (BOTTOM OF TABLE) */}
            <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-700">
              <div className="font-medium text-slate-600">
                Mostrando <span className="font-extrabold text-slate-900">{startIndex}</span> - <span className="font-extrabold text-slate-900">{endIndex}</span> de <span className="font-extrabold text-slate-900">{filteredItems.length}</span> productos
              </div>
              {renderPaginationControls()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
