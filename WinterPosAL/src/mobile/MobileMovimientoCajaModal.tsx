import { useState } from 'react';
import { PlusCircle, MinusCircle, X, DollarSign, Banknote, FileText, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { getApiBaseUrl } from '../utils';

interface MobileMovimientoCajaModalProps {
  isOpen: boolean;
  onClose: () => void;
  terminal?: string;
  cajero?: string;
  usuarioNombre?: string;
  usuarioId?: number;
  tasaDia?: number;
  initialTipo?: 'Entrada' | 'Salida' | 'Devolucion';
  onSuccess: () => void;
}

export default function MobileMovimientoCajaModal({
  isOpen,
  onClose,
  terminal = 'CAJA_01',
  cajero = 'Operador',
  usuarioNombre,
  usuarioId,
  initialTipo = 'Salida',
  onSuccess
}: MobileMovimientoCajaModalProps) {
  const [tipo, setTipo] = useState<'Entrada' | 'Salida' | 'Devolucion'>(initialTipo);
  const [montoUSD, setMontoUSD] = useState<string>('');
  const [montoVES, setMontoVES] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const presetsEntrada = [
    'Cambio / Sencillo adicional',
    'Fondo base adicional',
    'Aporte de socio / gerencia',
    'Reintegro de caja chica'
  ];

  const presetsSalida = [
    'Retiro a caja fuerte / custodia',
    'Pago a proveedor local',
    'Compra de insumos / bolsas',
    'Pago de flete / despacho',
    'Gasto menor / refrigerio'
  ];

  const presetsDevolucion = [
    'Devolución de venta al contado',
    'Reintegro de dinero por garantía',
    'Cancelación / anulación de ticket',
    'Diferencia cobrada de más'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const valUsd = parseFloat(montoUSD) || 0;
    const valVes = parseFloat(montoVES) || 0;

    if (valUsd <= 0 && valVes <= 0) {
      setError('Debes ingresar un monto en Dólares ($) o en Bolívares (Bs).');
      return;
    }

    if (!descripcion.trim()) {
      setError('Por favor indica el motivo o concepto del movimiento.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/cajas/movimiento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: tipo,
          descripcion: descripcion.trim(),
          usd: valUsd,
          ves: valVes,
          terminal: terminal,
          usuarioId: usuarioId || 1,
          usuarioNombre: usuarioNombre || cajero,
          metodo_pago: valUsd > 0 && valVes === 0 ? 'Efectivo$' : 'EfectivoBs'
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP ${res.status}`);
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onSuccess();
        onClose();
        // Reset form
        setMontoUSD('');
        setMontoVES('');
        setDescripcion('');
      }, 900);
    } catch (err: any) {
      console.error('Error al registrar movimiento:', err);
      setError(err.message || 'Error al procesar el movimiento de caja.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col justify-end max-w-md mx-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
        
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2">
            {tipo === 'Entrada' ? (
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <PlusCircle className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <MinusCircle className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-black text-white">Movimiento de Caja</h3>
              <p className="text-[11px] text-slate-400">{terminal} • {cajero}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center transition active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 pb-8 space-y-4">
          
          {/* Tipo de Movimiento Switcher (3 Tabs) */}
          <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => setTipo('Salida')}
              className={`py-2 px-1.5 rounded-xl font-bold flex items-center justify-center gap-1 transition ${
                tipo === 'Salida'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MinusCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Salida</span>
            </button>

            <button
              type="button"
              onClick={() => setTipo('Entrada')}
              className={`py-2 px-1.5 rounded-xl font-bold flex items-center justify-center gap-1 transition ${
                tipo === 'Entrada'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Entrada</span>
            </button>

            <button
              type="button"
              onClick={() => setTipo('Devolucion')}
              className={`py-2 px-1.5 rounded-xl font-bold flex items-center justify-center gap-1 transition ${
                tipo === 'Devolucion'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Devolución</span>
            </button>
          </div>

          {/* Amount Inputs */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Monto en Dólares ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-emerald-400 font-mono">$</span>
                <input
                  type="number"
                  step="any"
                  value={montoUSD}
                  onChange={(e) => setMontoUSD(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl pl-8 pr-4 py-2.5 text-xl font-black text-white font-mono outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1">
                <Banknote className="w-3.5 h-3.5 text-blue-400" />
                Monto en Bolívares (Bs)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={montoVES}
                  onChange={(e) => setMontoVES(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-xl px-4 py-2.5 text-xl font-black text-white font-mono outline-none"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">Bs</span>
              </div>
            </div>
          </div>

          {/* Concept / Reason Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Motivo o Concepto
            </label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={tipo === 'Devolucion' ? 'Ej: Devolución ticket #123 por garantía...' : 'Ej: Pago de flete, retiro a caja fuerte...'}
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
            />

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(tipo === 'Entrada' ? presetsEntrada : tipo === 'Devolucion' ? presetsDevolucion : presetsSalida).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDescripcion(preset)}
                  className="text-[10px] font-bold py-1 px-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition active:scale-95"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {isSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-center gap-2 font-bold animate-in fade-in duration-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>¡Movimiento registrado con éxito!</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || isSuccess}
            className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition active:scale-[0.98] ${
              tipo === 'Salida'
                ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 text-white shadow-rose-900/40'
                : tipo === 'Devolucion'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 text-white shadow-amber-900/40'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white shadow-emerald-900/40'
            }`}
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>REGISTRAR {tipo === 'Devolucion' ? 'DEVOLUCIÓN' : tipo.toUpperCase()}</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
