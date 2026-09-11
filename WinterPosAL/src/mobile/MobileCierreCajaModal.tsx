import { useState, useMemo } from 'react';
import { Lock, X, DollarSign, Banknote, CheckCircle2, AlertTriangle, AlertCircle, FileText } from 'lucide-react';
import { getApiBaseUrl } from '../utils';

interface MobileCierreCajaModalProps {
  isOpen: boolean;
  onClose: () => void;
  caja: {
    id: number | string;
    terminal: string;
    cajero: string;
    aperturaUsd: number;
    aperturaVes: number;
    salesUsd: number;
    salesVes: number;
    cashExpectedUsd: number;
    cashExpectedVes: number;
    electronicUsd?: number;
    totalTickets: number;
  } | null;
  onSuccess: () => void;
}

export default function MobileCierreCajaModal({
  isOpen,
  onClose,
  caja,
  onSuccess
}: MobileCierreCajaModalProps) {
  const [realUSD, setRealUSD] = useState<string>('');
  const [realVES, setRealVES] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !caja) return null;

  const expectedUsd = caja.cashExpectedUsd || 0;
  const expectedVes = caja.cashExpectedVes || 0;

  const valRealUSD = parseFloat(realUSD) || 0;
  const valRealVES = parseFloat(realVES) || 0;

  const diffUSD = valRealUSD - expectedUsd;
  const diffVES = valRealVES - expectedVes;

  const handleFillExact = () => {
    setRealUSD(expectedUsd.toFixed(2));
    setRealVES(expectedVes.toFixed(2));
  };

  const handleExecuteCierre = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const now = new Date();
      const fechaStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const cierrePayload = {
        id: Date.now(),
        fecha: fechaStr,
        fechaCierre: fechaStr,
        usuario: caja.cajero || 'Anderson Laguna',
        usuarioId: (caja as any).usuarioId || (caja as any).usuario_id || 1,
        terminal: caja.terminal || 'CAJA_01',
        estacion_nombre: caja.terminal || 'CAJA_01',
        aperturaUsd: caja.aperturaUsd || 0,
        aperturaVes: caja.aperturaVes || 0,
        monto_apertura_usd: caja.aperturaUsd || 0,
        monto_apertura_ves: caja.aperturaVes || 0,
        salesUsd: caja.salesUsd || 0,
        salesVes: caja.salesVes || 0,
        total_ventas_usd: caja.salesUsd || 0,
        total_ventas_ves: caja.salesVes || 0,
        ventaTotalUsd: caja.salesUsd || 0,
        venta_total_usd: caja.salesUsd || 0,
        expectedUsd: expectedUsd,
        expectedVes: expectedVes,
        dineroEnCajaExpected: expectedUsd,
        total_esperado_usd: expectedUsd,
        total_esperado_ves: expectedVes,
        monto_cierre_esperado_usd: expectedUsd,
        monto_cierre_esperado_ves: expectedVes,
        realUsd: valRealUSD,
        realVes: valRealVES,
        total_real_usd: valRealUSD,
        total_real_ves: valRealVES,
        monto_cierre_real_usd: valRealUSD,
        monto_cierre_real_ves: valRealVES,
        diferencia_usd: Math.round(diffUSD * 100) / 100,
        diferencia_ves: Math.round(diffVES * 100) / 100,
        tickets_emitidos: caja.totalTickets || 0,
        detalles: {
          observaciones: observaciones.trim() || 'Cierre registrado desde versión móvil',
          cerradoDesde: 'Mobile POS'
        }
      };

      console.log('Enviando cierre de caja móvil:', cierrePayload);
      const res = await fetch(`${getApiBaseUrl()}/cajas/cerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cierrePayload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP ${res.status}`);
      }

      // Limpiar claves locales de caja abierta
      try {
        localStorage.removeItem('pos_caja_abierta');
        localStorage.removeItem(`pos_caja_abierta_${caja.terminal}`);
        localStorage.removeItem('pos_apertura_usd');
        localStorage.removeItem('pos_apertura_ves');
      } catch (e) {
        // Ignore localStorage error
      }

      setIsSuccess(true);
      setShowConfirm(false);
      
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Error al cerrar caja móvil:', err);
      setError(err.message || 'Error al procesar el cierre de caja.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col justify-end max-w-md mx-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
        
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Arqueo y Cierre de Turno</h3>
              <p className="text-[11px] text-slate-400">{caja.terminal} • Cajero: {caja.cajero}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center transition active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 pb-8 space-y-4">
          
          {/* Shift Summary Cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3">
              <span className="text-[9px] text-slate-400 font-bold uppercase block">Ventas Turno</span>
              <p className="text-base font-black text-white font-mono mt-0.5">${caja.salesUsd.toFixed(2)}</p>
              <p className="text-[10px] text-slate-400">{caja.totalTickets} comprobantes</p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3">
              <span className="text-[9px] text-slate-400 font-bold uppercase block">Efectivo Esperado</span>
              <p className="text-base font-black text-emerald-400 font-mono mt-0.5">${expectedUsd.toFixed(2)}</p>
              <p className="text-[10px] text-slate-400 font-mono">{expectedVes.toFixed(2)} Bs</p>
            </div>
          </div>

          {/* Money Counted Inputs */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">
                Conteo Físico en Gaveta
              </label>
              <button
                type="button"
                onClick={handleFillExact}
                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 bg-blue-950/60 border border-blue-800/40 px-2 py-0.5 rounded-lg"
              >
                Llenar Esperado
              </button>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 font-bold block mb-1">
                Efectivo Contado en Dólares ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-emerald-400 font-mono">$</span>
                <input
                  type="number"
                  step="any"
                  value={realUSD}
                  onChange={(e) => setRealUSD(e.target.value)}
                  placeholder={expectedUsd.toFixed(2)}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl pl-8 pr-4 py-2.5 text-xl font-black text-white font-mono outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 font-bold block mb-1">
                Efectivo Contado en Bolívares (Bs)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={realVES}
                  onChange={(e) => setRealVES(e.target.value)}
                  placeholder={expectedVes.toFixed(2)}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-xl px-4 py-2.5 text-xl font-black text-white font-mono outline-none"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">Bs</span>
              </div>
            </div>
          </div>

          {/* Differences Result Indicator */}
          <div className={`p-3 rounded-2xl border text-xs font-bold space-y-1 ${
            Math.abs(diffUSD) < 0.05 && Math.abs(diffVES) < 0.05
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : diffUSD < -0.05 || diffVES < -0.05
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}>
            <div className="flex items-center justify-between">
              <span>Estado del Cuadre:</span>
              <span>
                {Math.abs(diffUSD) < 0.05 && Math.abs(diffVES) < 0.05
                  ? '✅ Caja Cuadrada Exacta'
                  : diffUSD < -0.05 || diffVES < -0.05
                  ? '⚠️ Faltante en Gaveta'
                  : 'ℹ️ Sobrante en Gaveta'}
              </span>
            </div>
            <div className="flex items-center justify-between font-mono text-[11px] pt-1 border-t border-slate-800">
              <span>Diferencia USD:</span>
              <span className={diffUSD < -0.01 ? 'text-rose-400' : diffUSD > 0.01 ? 'text-emerald-400' : ''}>
                {diffUSD > 0 ? `+$${diffUSD.toFixed(2)}` : `$${diffUSD.toFixed(2)}`}
              </span>
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span>Diferencia VES:</span>
              <span className={diffVES < -0.01 ? 'text-rose-400' : diffVES > 0.01 ? 'text-emerald-400' : ''}>
                {diffVES > 0 ? `+${diffVES.toFixed(2)} Bs` : `${diffVES.toFixed(2)} Bs`}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              Observaciones de Cierre (Opcional)
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas sobre el turno, incidencias o entregas de dinero..."
              rows={2}
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs text-white outline-none resize-none"
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Feedback */}
          {isSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-center gap-2 font-bold animate-in fade-in duration-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>¡Cierre de turno registrado con éxito! Cerrando...</span>
            </div>
          )}

          {/* In-Modal Confirmation or Trigger Button */}
          {showConfirm ? (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-white">¿Confirmas el cierre del turno de {caja.terminal}?</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">Esta acción registrará el arqueo y finalizará la sesión de caja actual.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={isSubmitting}
                  className="py-3 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteCierre}
                  disabled={isSubmitting}
                  className="py-3 px-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black text-xs rounded-xl shadow-lg shadow-amber-900/40 flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Sí, Cerrar Turno</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null);
                if (realUSD.trim() === '' && realVES.trim() === '') {
                  setError('Por favor ingresa el conteo de dinero físico en gaveta.');
                  return;
                }
                setShowConfirm(true);
              }}
              disabled={isSubmitting || isSuccess}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 hover:from-amber-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-amber-900/40 flex items-center justify-center gap-2 transition active:scale-[0.98]"
            >
              <Lock className="w-4 h-4" />
              <span>CONFIRMAR CIERRE DE TURNO</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
