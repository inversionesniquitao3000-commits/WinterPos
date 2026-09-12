import { useState, useEffect } from 'react';
import { Store, RefreshCw, Clock, User, Wallet, ArrowDownUp, Lock, CreditCard, RotateCcw } from 'lucide-react';
import { getApiBaseUrl } from '../utils';
import MobileMovimientoCajaModal from './MobileMovimientoCajaModal';
import MobileCierreCajaModal from './MobileCierreCajaModal';
import MobileAbonoModal from './MobileAbonoModal';
import MobileDevolucionModal from './MobileDevolucionModal';

interface CajaLive {
  id: number;
  terminal: string;
  cajero: string;
  fechaApertura: string;
  aperturaUsd: number;
  aperturaVes: number;
  salesUsd: number;
  salesVes: number;
  cashSalesUsd?: number;
  cashSalesVes?: number;
  cashExpectedUsd: number;
  cashExpectedVes: number;
  electronicUsd: number;
  entradasUsd?: number;
  salidasUsd?: number;
  totalTickets: number;
  status: string;
}

export default function MobileCajas() {
  const [cajas, setCajas] = useState<CajaLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal States
  const [isMovModalOpen, setIsMovModalOpen] = useState(false);
  const [selectedCajaMov, setSelectedCajaMov] = useState<CajaLive | null>(null);
  const [isCierreModalOpen, setIsCierreModalOpen] = useState(false);
  const [selectedCajaCierre, setSelectedCajaCierre] = useState<CajaLive | null>(null);
  const [isAbonoModalOpen, setIsAbonoModalOpen] = useState(false);
  const [selectedCajaAbono, setSelectedCajaAbono] = useState<CajaLive | null>(null);
  const [isDevModalOpen, setIsDevModalOpen] = useState(false);
  const [selectedCajaDev, setSelectedCajaDev] = useState<CajaLive | null>(null);

  const fetchCajas = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/manager/cajas-live`);
      if (res.ok) {
        const json = await res.json();
        setCajas(Array.isArray(json) ? json : []);
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
    const interval = setInterval(() => fetchCajas(), 10000);
    return () => clearInterval(interval);
  }, []);

  const totalCashExpectedUSD = cajas.reduce((acc, c) => acc + (c.cashExpectedUsd || 0), 0);
  const totalCashExpectedVES = cajas.reduce((acc, c) => acc + (c.cashExpectedVes || 0), 0);
  const totalSalesUSD = cajas.reduce((acc, c) => acc + (c.salesUsd || 0), 0);

  return (
    <div className="space-y-4 pb-24 pt-2 px-3">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
        <div>
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-400" />
            Monitor de Cajas en Vivo
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Arqueo de efectivo en tiempo real y transacciones activas
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchCajas(true)}
          disabled={refreshing}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 transition"
          title="Refrescar estado de cajas"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>

      {/* Global Cash Summary Card */}
      <div className="bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-800/40 rounded-2xl p-4 shadow-md space-y-2">
        <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-400 flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-emerald-400" />
          <span>Efectivo Total en Gavetas (Todas las Cajas)</span>
        </span>

        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-black text-white font-mono">
              ${totalCashExpectedUSD.toFixed(2)}
            </span>
            <span className="text-xs text-emerald-300 font-mono block mt-0.5 font-bold">
              {totalCashExpectedVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-medium">Ventas del Turno</span>
            <span className="text-sm font-black text-white font-mono">
              ${totalSalesUSD.toFixed(2)} USD
            </span>
          </div>
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
          {cajas.map((caja) => {
            const openTime = caja.fechaApertura
              ? caja.fechaApertura.length >= 16
                ? caja.fechaApertura.substring(11, 16)
                : caja.fechaApertura
              : '--:--';

            return (
              <div key={caja.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md relative overflow-hidden space-y-3">
                {/* Header Row: Terminal Name & Status */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <h3 className="font-black text-sm text-white">{caja.terminal}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 font-bold">
                      Abierta
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-[11px] font-mono">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>Apertura: {openTime}</span>
                  </div>
                </div>

                {/* Cashier and Initial Base Info */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 bg-slate-800/50 p-2 rounded-xl border border-slate-800">
                    <User className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-400 block font-medium">Cajero Activo</span>
                      <span className="font-bold text-white truncate block">{caja.cajero}</span>
                    </div>
                  </div>

                  <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-medium">Base Apertura</span>
                    <span className="font-black font-mono text-slate-200 text-xs block">
                      ${caja.aperturaUsd.toFixed(2)} · {caja.aperturaVes.toLocaleString('es-VE', { minimumFractionDigits: 0 })} Bs
                    </span>
                  </div>
                </div>

                {/* Live Cash Balances (Large Cards) */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800/80 rounded-xl p-3 border border-emerald-500/30">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                      Efectivo en Gaveta ($)
                    </span>
                    <span className="text-xl font-black text-emerald-400 font-mono block mt-0.5">
                      ${caja.cashExpectedUsd.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-slate-800/80 rounded-xl p-3 border border-blue-500/30">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                      Efectivo en Gaveta (Bs)
                    </span>
                    <span className="text-base font-black text-blue-300 font-mono block mt-0.5 truncate">
                      {caja.cashExpectedVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                    </span>
                  </div>
                </div>

                {/* Breakdown and Turn Totals */}
                <div className="pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-1 text-[11px] text-center text-slate-300">
                  <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-500 uppercase block font-bold">Ventas Turno</span>
                    <strong className="text-white font-mono">${caja.salesUsd.toFixed(2)}</strong>
                  </div>

                  <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-500 uppercase block font-bold">Digital / Tarj</span>
                    <strong className="text-purple-300 font-mono">${caja.electronicUsd.toFixed(2)}</strong>
                  </div>

                  <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-500 uppercase block font-bold">Comprobantes</span>
                    <strong className="text-blue-400 font-mono">{caja.totalTickets}</strong>
                  </div>
                </div>

                {/* Action Buttons: Movimientos, Abono, Devolución, Cierre */}
                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCajaMov(caja);
                        setIsMovModalOpen(true);
                      }}
                      className="py-2 px-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <ArrowDownUp className="w-3.5 h-3.5 text-blue-400" />
                      <span>Movimiento (+ / -)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCajaAbono(caja);
                        setIsAbonoModalOpen(true);
                      }}
                      className="py-2 px-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Abono Cliente</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCajaDev(caja);
                        setIsDevModalOpen(true);
                      }}
                      className="py-2 px-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
                      <span>Devolución</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCajaCierre(caja);
                        setIsCierreModalOpen(true);
                      }}
                      className="py-2 px-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Cerrar Turno</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cash In/Out Movement Modal */}
      <MobileMovimientoCajaModal
        isOpen={isMovModalOpen}
        onClose={() => setIsMovModalOpen(false)}
        terminal={selectedCajaMov?.terminal}
        cajero={selectedCajaMov?.cajero}
        onSuccess={fetchCajas}
      />

      {/* Client Abono Modal */}
      <MobileAbonoModal
        isOpen={isAbonoModalOpen}
        onClose={() => setIsAbonoModalOpen(false)}
        terminal={selectedCajaAbono?.terminal}
        cajero={selectedCajaAbono?.cajero}
        onSuccess={fetchCajas}
      />

      {/* Return / Devolución Modal */}
      <MobileDevolucionModal
        isOpen={isDevModalOpen}
        onClose={() => setIsDevModalOpen(false)}
        terminal={selectedCajaDev?.terminal}
        cajero={selectedCajaDev?.cajero}
        onSuccess={fetchCajas}
      />

      {/* Shift Closure Modal */}
      <MobileCierreCajaModal
        isOpen={isCierreModalOpen}
        onClose={() => setIsCierreModalOpen(false)}
        caja={selectedCajaCierre}
        onSuccess={fetchCajas}
      />
    </div>
  );
}
