import { useState } from 'react';
import { DollarSign, Banknote, X, CheckCircle2, AlertCircle, FileText, Tag } from 'lucide-react';
import { getApiBaseUrl } from '../utils';

interface MobileGastoModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasaDia?: number;
  onSuccess: () => void;
}

export default function MobileGastoModal({
  isOpen,
  onClose,
  tasaDia = 1,
  onSuccess
}: MobileGastoModalProps) {
  const activeTasa = tasaDia > 0 ? tasaDia : 1;
  const [concepto, setConcepto] = useState('');
  const [montoUSD, setMontoUSD] = useState('');
  const [montoVES, setMontoVES] = useState('');
  const [categoria, setCategoria] = useState('Insumos / Suministros');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const categories = [
    'Insumos / Suministros',
    'Servicios Públicos',
    'Mantenimiento / Reparación',
    'Flete / Transporte',
    'Refrigerios / Comida',
    'Nómina / Adelanto',
    'Varios'
  ];

  const presets = [
    'Compra de bolsas plásticas',
    'Compra de bombillos / ferretería',
    'Pago de flete / despacho',
    'Almuerzo / refrigerio del personal',
    'Artículos de limpieza',
    'Recarga de agua / hielo'
  ];

  const handleAmountChange = (val: string, type: 'USD' | 'VES') => {
    if (type === 'USD') {
      setMontoUSD(val);
      const num = parseFloat(val) || 0;
      setMontoVES(num > 0 ? (num * activeTasa).toFixed(2) : '');
    } else {
      setMontoVES(val);
      const num = parseFloat(val) || 0;
      setMontoUSD(num > 0 ? (num / activeTasa).toFixed(2) : '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const valUsd = parseFloat(montoUSD) || 0;
    const valVes = parseFloat(montoVES) || 0;

    if (!concepto.trim()) {
      setError('Por favor indica el concepto o descripción del gasto.');
      return;
    }

    if (valUsd <= 0 && valVes <= 0) {
      setError('Debes ingresar un monto válido.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/gastos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concepto: concepto.trim(),
          monto_usd: valUsd,
          monto_ves: valVes,
          categoria,
          fecha: new Date().toISOString()
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP ${res.status}`);
      }

      onSuccess();
      onClose();
      setConcepto('');
      setMontoUSD('');
      setMontoVES('');
    } catch (err: any) {
      console.error('Error al registrar gasto:', err);
      setError(err.message || 'Error al guardar el gasto.');
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
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Registrar Gasto Operativo</h3>
              <p className="text-[11px] text-slate-400">Salida administrativa o cotidiana</p>
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
          
          {/* Concept Input */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Concepto del Gasto
            </label>
            <input
              type="text"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej: Compra de bombillos, bolsas plásticas..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
            />

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5 pt-2">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setConcepto(p)}
                  className="text-[10px] font-bold py-1 px-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition active:scale-95"
                >
                  + {p}
                </button>
              ))}
            </div>
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
                  onChange={(e) => handleAmountChange(e.target.value, 'USD')}
                  placeholder="0.00"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl pl-8 pr-4 py-2.5 text-xl font-black text-white font-mono outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1">
                <Banknote className="w-3.5 h-3.5 text-blue-400" />
                Equivalente en Bolívares (Bs)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={montoVES}
                  onChange={(e) => handleAmountChange(e.target.value, 'VES')}
                  placeholder="0.00"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-xl px-4 py-2.5 text-xl font-black text-white font-mono outline-none"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">Bs</span>
              </div>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Categoría</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-rose-900/40 flex items-center justify-center gap-2 transition active:scale-[0.98]"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>GUARDAR GASTO OPERATIVO</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
