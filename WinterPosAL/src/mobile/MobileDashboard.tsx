import { useState, useEffect } from 'react';
import { 
  DollarSign, ShoppingBag, Users, Store, 
  RefreshCw, Sparkles, Send, CheckCircle2, ChevronRight
} from 'lucide-react';

interface ManagerKPIs {
  today: string;
  company: {
    name: string;
    rif: string;
    phone: string;
  };
  tasa: {
    cobro: number;
    vuelto: number;
  };
  kpis: {
    totalVentasUSD: number;
    totalVentasVES: number;
    utilidadBrutaUSD: number;
    margenPorcentaje: number;
    totalTickets: number;
    ticketPromedioUSD: number;
    yesterdayTotalUSD: number;
    growthPercentage: number;
    cajasAbiertasCount: number;
    totalCxC_USD: number;
    clientsMorososCount: number;
    totalCxP_USD: number;
  };
  paymentMethods: {
    efectivo_usd: number;
    efectivo_ves: number;
    debito: number;
    pago_movil: number;
    biopago: number;
    credito: number;
    otros: number;
  };
  topProducts: Array<{
    name: string;
    qty: number;
    totalUSD: number;
    image?: string;
  }>;
  hourlyDistribution: Array<{
    hour: string;
    totalUSD: number;
    tickets: number;
  }>;
}

interface Props {
  onNavigateTab: (tab: 'dashboard' | 'cajas' | 'inventario' | 'finanzas' | 'settings') => void;
}

export default function MobileDashboard({ onNavigateTab }: Props) {
  const [data, setData] = useState<ManagerKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [whatsappSentMsg, setWhatsappSentMsg] = useState('');

  const fetchKpis = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/manager/kpis');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Error fetching manager KPIs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchKpis();
    const interval = setInterval(() => fetchKpis(), 15000); // Live poll every 15s
    return () => clearInterval(interval);
  }, []);

  const handleSendWhatsAppReport = async () => {
    setSendingWhatsapp(true);
    setWhatsappSentMsg('');
    try {
      const res = await fetch('/api/manager/whatsapp-report-now', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setWhatsappSentMsg('✅ Reporte enviado a WhatsApp');
        setTimeout(() => setWhatsappSentMsg(''), 4000);
      } else {
        setWhatsappSentMsg('⚠️ No se pudo enviar reporte');
      }
    } catch (err) {
      setWhatsappSentMsg('⚠️ Error de conexión');
    } finally {
      setSendingWhatsapp(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400 p-6">
        <RefreshCw className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <p className="font-semibold text-slate-200">Cargando métricas gerenciales en vivo...</p>
        <p className="text-xs text-slate-400 mt-1">Conectando con terminal principal WinterPOS</p>
      </div>
    );
  }

  const kpis = data?.kpis || {
    totalVentasUSD: 0,
    totalVentasVES: 0,
    utilidadBrutaUSD: 0,
    margenPorcentaje: 0,
    totalTickets: 0,
    ticketPromedioUSD: 0,
    growthPercentage: 0,
    cajasAbiertasCount: 0,
    totalCxC_USD: 0,
    clientsMorososCount: 0,
    totalCxP_USD: 0
  };

  const tasa = data?.tasa || { cobro: 36.5, vuelto: 36.5 };

  return (
    <div className="space-y-4 pb-20 pt-2 px-3">
      {/* Top Banner Status */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 rounded-2xl p-3.5 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <span className="w-3 h-3 rounded-full bg-emerald-500 block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-400 block animate-ping absolute inset-0 opacity-75"></span>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white leading-none">{data?.company.name || 'WinterPos'}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Tasa Cobro: <span className="text-amber-400 font-bold">{tasa.cobro.toFixed(2)} Bs</span> | Vuelto: {tasa.vuelto.toFixed(2)} Bs</p>
          </div>
        </div>
        <button 
          onClick={() => fetchKpis(true)}
          disabled={refreshing}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 transition"
          title="Actualizar datos"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>

      {/* Main Big Metric Card: Ventas del Día */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 rounded-3xl p-5 text-white shadow-xl shadow-blue-950/40 border border-blue-400/20">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-blue-400/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center justify-between text-blue-100 text-xs font-semibold mb-1">
          <span className="flex items-center gap-1.5 uppercase tracking-wider">
            <DollarSign className="w-4 h-4 text-emerald-300" />
            Ventas Totales de Hoy
          </span>
          <span className="bg-white/10 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[11px] text-blue-200 border border-white/10">
            {kpis.totalTickets} {kpis.totalTickets === 1 ? 'ticket' : 'tickets'}
          </span>
        </div>

        <div className="mt-2">
          <div className="text-3xl font-black tracking-tight text-white flex items-baseline gap-1">
            <span className="text-xl text-emerald-300 font-semibold">$</span>
            {kpis.totalVentasUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-sm font-semibold text-blue-200/90 mt-0.5">
            ≈ {kpis.totalVentasVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
          </div>
        </div>

        {/* Profit and growth pills */}
        <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-black/20 rounded-xl p-2 backdrop-blur-sm">
            <span className="text-slate-300 block text-[10px] uppercase font-bold">Ganancia Bruta Est.</span>
            <span className="font-extrabold text-emerald-400 text-sm">
              +${kpis.utilidadBrutaUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-emerald-300/80 ml-1">({kpis.margenPorcentaje}%)</span>
          </div>

          <div className="bg-black/20 rounded-xl p-2 backdrop-blur-sm">
            <span className="text-slate-300 block text-[10px] uppercase font-bold">Ticket Promedio</span>
            <span className="font-extrabold text-white text-sm">
              ${kpis.ticketPromedioUSD.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-300/80 ml-1">/cliente</span>
          </div>
        </div>
      </div>

      {/* Quick Status Bar */}
      <div className="grid grid-cols-2 gap-2.5">
        <div 
          onClick={() => onNavigateTab('cajas')}
          className="bg-slate-800/90 border border-slate-700/70 active:scale-[0.98] transition cursor-pointer rounded-2xl p-3 flex items-center justify-between"
        >
          <div>
            <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-blue-400" />
              Cajas Activas
            </div>
            <div className="text-lg font-black text-white mt-0.5">
              {kpis.cajasAbiertasCount} {kpis.cajasAbiertasCount === 1 ? 'Caja' : 'Cajas'}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </div>

        <div 
          onClick={() => onNavigateTab('finanzas')}
          className="bg-slate-800/90 border border-slate-700/70 active:scale-[0.98] transition cursor-pointer rounded-2xl p-3 flex items-center justify-between"
        >
          <div>
            <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              CxC Clientes
            </div>
            <div className="text-lg font-black text-amber-300 mt-0.5">
              ${kpis.totalCxC_USD.toLocaleString('es-VE', { minimumFractionDigits: 0 })}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </div>
      </div>

      {/* Métodos de Pago Recaudados */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between">
          <span>Recaudación por Forma de Pago</span>
          <span className="text-[10px] text-slate-400 font-normal">Hoy</span>
        </h3>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
            <span className="flex items-center gap-2 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              Efectivo USD ($)
            </span>
            <span className="font-extrabold text-emerald-400 font-mono">
              ${data?.paymentMethods.efectivo_usd.toFixed(2) || '0.00'}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
            <span className="flex items-center gap-2 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              Efectivo VES (Bs)
            </span>
            <span className="font-extrabold text-blue-300 font-mono">
              ${data?.paymentMethods.efectivo_ves.toFixed(2) || '0.00'}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
            <span className="flex items-center gap-2 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              Punto Débito / Tarjetas
            </span>
            <span className="font-extrabold text-purple-300 font-mono">
              ${data?.paymentMethods.debito.toFixed(2) || '0.00'}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
            <span className="flex items-center gap-2 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              Pago Móvil
            </span>
            <span className="font-extrabold text-amber-300 font-mono">
              ${data?.paymentMethods.pago_movil.toFixed(2) || '0.00'}
            </span>
          </div>

          {data?.paymentMethods.credito ? (
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
              <span className="flex items-center gap-2 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                Ventas a Crédito
              </span>
              <span className="font-extrabold text-rose-400 font-mono">
                ${data.paymentMethods.credito.toFixed(2)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Top 5 Productos Vendidos */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShoppingBag className="w-4 h-4 text-blue-400" />
            Top 5 Productos Más Vendidos
          </span>
          <button 
            onClick={() => onNavigateTab('inventario')}
            className="text-[11px] text-blue-400 font-semibold hover:underline"
          >
            Ver Stock
          </button>
        </h3>

        {data?.topProducts && data.topProducts.length > 0 ? (
          <div className="space-y-2">
            {data.topProducts.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40 border border-slate-800 text-xs">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 font-black text-[10px] flex items-center justify-center flex-shrink-0">
                    #{idx + 1}
                  </span>
                  <div className="truncate">
                    <p className="font-bold text-slate-200 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400">{p.qty} {p.qty === 1 ? 'unidad' : 'unidades'} vendidas</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="font-extrabold text-emerald-400 font-mono">${p.totalUSD.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-slate-400 text-xs">
            Aún no se han registrado ventas hoy.
          </div>
        )}
      </div>

      {/* Action: Enviar Reporte a WhatsApp al Dueño */}
      <div className="bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-800/40 rounded-2xl p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-xs mb-1">
          <Sparkles className="w-4 h-4" />
          Disparo Automático de Reporte
        </div>
        <p className="text-[11px] text-slate-300 mb-3">
          Envía el resumen gerencial con las ventas y caja al WhatsApp configurado.
        </p>

        {whatsappSentMsg ? (
          <div className="p-2 rounded-xl bg-emerald-900/60 border border-emerald-600 text-emerald-200 text-xs font-bold mb-2 flex items-center justify-center gap-1.5 animate-bounce">
            <CheckCircle2 className="w-4 h-4" />
            {whatsappSentMsg}
          </div>
        ) : null}

        <button
          onClick={handleSendWhatsAppReport}
          disabled={sendingWhatsapp}
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 transition"
        >
          {sendingWhatsapp ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Generando y Enviando...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Enviar Resumen a mi WhatsApp Ahora
            </>
          )}
        </button>
      </div>
    </div>
  );
}
