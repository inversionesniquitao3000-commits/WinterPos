import { useState, useEffect } from 'react';
import { Store, RefreshCw, Clock, User } from 'lucide-react';

interface CajaLive {
  id: number;
  terminal: string;
  cajero: string;
  fechaApertura: string;
  aperturaUsd: number;
  aperturaVes: number;
  salesUsd: number;
  salesVes: number;
  cashExpectedUsd: number;
  cashExpectedVes: number;
  electronicUsd: number;
  totalTickets: number;
  status: string;
}

export default function MobileCajas() {
  const [cajas, setCajas] = useState<CajaLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCajas = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/manager/cajas-live');
      if (res.ok) {
        const json = await res.json();
        setCajas(json);
      }
    } catch (err) {
      console.error('Error fetching live cajas:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCajas();
    const interval = setInterval(() => fetchCajas(), 15000);
    return () => clearInterval(interval);
  }, []);

  const totalCashExpectedUSD = cajas.reduce((acc, c) => acc + (c.cashExpectedUsd || 0), 0);
  const totalSalesUSD = cajas.reduce((acc, c) => acc + (c.salesUsd || 0), 0);

  return (
    <div className="space-y-4 pb-20 pt-2 px-3">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
        <div>
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-400" />
            Monitor de Cajas en Vivo
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Arqueo de efectivo y transacciones activas
          </p>
        </div>
        <button
          onClick={() => fetchCajas(true)}
          disabled={refreshing}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 transition"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>

      {/* Global Cash Summary Card */}
      <div className="bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-800/40 rounded-2xl p-4 shadow-md">
        <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-400 block mb-1">
          Efectivo Total en Gavetas (Todas las Cajas)
        </span>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-black text-white font-mono">
            ${totalCashExpectedUSD.toFixed(2)}
          </span>
          <span className="text-xs text-slate-400 font-semibold">
            Ventas Turno: <strong className="text-emerald-400 font-mono">${totalSalesUSD.toFixed(2)}</strong>
          </span>
        </div>
      </div>

      {/* Cajas List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-xs font-semibold">Consultando terminales activas...</p>
        </div>
      ) : cajas.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
          <Store className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="font-bold text-slate-200 text-sm">No hay cajas abiertas en este momento</p>
          <p className="text-xs text-slate-400 mt-1">Los cajeros deben realizar la apertura de turno desde el Punto de Venta.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cajas.map((caja) => (
            <div key={caja.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <h3 className="font-black text-sm text-white">{caja.terminal}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/50 font-bold">
                    Abierta
                  </span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                  <Clock className="w-3 h-3" />
                  <span>{caja.fechaApertura ? caja.fechaApertura.substring(11, 16) : '--:--'}</span>
                </div>
              </div>

              {/* Cashier Info */}
              <div className="flex items-center gap-2 text-xs text-slate-300 mb-3 bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                <User className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <span className="font-semibold text-slate-400">Cajero:</span>
                <span className="font-bold text-white truncate">{caja.cajero}</span>
              </div>

              {/* Balances Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/50">
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Efectivo en Gaveta ($)</span>
                  <span className="text-base font-black text-emerald-400 font-mono">
                    ${caja.cashExpectedUsd.toFixed(2)}
                  </span>
                </div>

                <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/50">
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Efectivo en Gaveta (Bs)</span>
                  <span className="text-base font-black text-blue-300 font-mono">
                    {caja.cashExpectedVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                  </span>
                </div>
              </div>

              {/* Total Sold & Tickets */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80 text-slate-400">
                <span>Vendido en Turno: <strong className="text-white">${caja.salesUsd.toFixed(2)}</strong></span>
                <span>Tickets: <strong className="text-blue-400">{caja.totalTickets}</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
