import { useState, useEffect } from 'react';
import { 
  X, AlertTriangle, RefreshCw, Check,
  TrendingUp, TrendingDown, ClipboardList
} from 'lucide-react';
import { getApiBaseUrl } from '../utils';

export interface MobileProductStockItem {
  id: number;
  barcode: string;
  description: string;
  category: string;
  stock_actual: number;
  stock_minimo: number;
  a_granel?: boolean;
}

interface MobileStockModalProps {
  isOpen: boolean;
  product: MobileProductStockItem | null;
  currentUser?: any;
  onClose: () => void;
  onStockUpdated: (productId: number, newStock: number) => void;
}

export default function MobileStockModal({
  isOpen,
  product,
  currentUser,
  onClose,
  onStockUpdated
}: MobileStockModalProps) {
  if (!isOpen || !product) return null;

  const isGranel = !!product.a_granel;
  const currentStock = parseFloat(String(product.stock_actual)) || 0;

  const [mode, setMode] = useState<'adjust' | 'set_exact'>('adjust');
  const [movementType, setMovementType] = useState<'Entrada' | 'Salida' | 'Merma' | 'Ajuste'>('Entrada');
  const [amountStr, setAmountStr] = useState<string>('1');
  const [exactStockStr, setExactStockStr] = useState<string>(String(currentStock));
  const [motivo, setMotivo] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    setAmountStr('1');
    setExactStockStr(String(currentStock));
    setMode('adjust');
    setMovementType('Entrada');
    setMotivo('');
    setErrorMsg('');
  }, [product]);

  // Compute preview of new stock
  const amountVal = Math.max(0, parseFloat(amountStr) || 0);
  let computedNewStock = currentStock;

  if (mode === 'set_exact') {
    computedNewStock = parseFloat(exactStockStr) || 0;
  } else {
    if (movementType === 'Entrada') {
      computedNewStock = currentStock + amountVal;
    } else if (movementType === 'Salida' || movementType === 'Merma') {
      computedNewStock = Math.max(0, currentStock - amountVal);
    } else {
      computedNewStock = currentStock + amountVal;
    }
  }

  if (!isGranel) {
    computedNewStock = Math.round(computedNewStock);
  } else {
    computedNewStock = Math.round(computedNewStock * 1000) / 1000;
  }

  const handleQuickAdd = (delta: number) => {
    if (mode === 'set_exact') {
      const cur = parseFloat(exactStockStr) || 0;
      const next = Math.max(0, cur + delta);
      setExactStockStr(isGranel ? next.toFixed(2) : String(Math.round(next)));
    } else {
      const cur = parseFloat(amountStr) || 0;
      const next = Math.max(0, cur + delta);
      setAmountStr(isGranel ? next.toFixed(2) : String(Math.round(next)));
    }
  };

  const handleSave = async () => {
    setErrorMsg('');
    setIsSaving(true);
    try {
      // 1. Update product stock on backend
      const resStock = await fetch(`${getApiBaseUrl()}/productos/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: product.id,
          stock_actual: computedNewStock
        })
      });

      if (!resStock.ok) {
        throw new Error('No se pudo actualizar el stock en el servidor');
      }

      // 2. Register inventory movement record for Kardex audit
      const deltaQty = Math.abs(computedNewStock - currentStock);
      if (deltaQty > 0) {
        let movementKind = movementType;
        if (mode === 'set_exact') {
          movementKind = computedNewStock >= currentStock ? 'Entrada' : 'Salida';
        }

        const isNegative = movementKind === 'Salida' || movementKind === 'Merma';
        const signedQty = isNegative ? -deltaQty : deltaQty;

        const effectiveMotivo = motivo.trim() || (
          mode === 'set_exact' 
            ? `Ajuste físico móvil (${computedNewStock >= currentStock ? '+' : '-'}${deltaQty} ${isGranel ? 'kg' : 'uds'} -> Conteo: ${computedNewStock})`
            : `${movementKind} rápida desde app móvil (${isNegative ? '-' : '+'}${deltaQty} ${isGranel ? 'kg' : 'uds'})`
        );

        let opUser = currentUser?.nombre || currentUser?.usuario || '';
        if (!opUser) {
          try {
            const saved = localStorage.getItem('pos_current_user');
            if (saved) {
              const parsed = JSON.parse(saved);
              opUser = parsed.nombre || parsed.usuario || '';
            }
          } catch {}
        }

        try {
          await fetch(`${getApiBaseUrl()}/movements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: product.id,
              productCode: product.barcode,
              productDescription: product.description,
              type: movementKind,
              qty: signedQty,
              stock_anterior: currentStock,
              stock_posterior: computedNewStock,
              motivo: effectiveMotivo,
              usuario: opUser || 'Móvil'
            })
          });
        } catch (movErr) {
          console.warn('Advertencia registrando movimiento en Kardex:', movErr);
        }
      }

      onStockUpdated(product.id, computedNewStock);
      onClose();
    } catch (err: any) {
      console.error('Error al guardar ajuste de stock:', err);
      setErrorMsg(err.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[92vh] flex flex-col shadow-2xl overflow-hidden pb-1 sm:pb-0">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-black">
              ±
            </div>
            <div>
              <h2 className="text-sm font-black text-white">Ajuste Rápido de Stock</h2>
              <p className="text-[10px] text-slate-400">Control de existencias en almacén</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Product Summary Card */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-blue-300">
                {product.barcode || 'S/C'}
              </span>
              <span className="text-[10px] text-slate-400 truncate">
                {product.category || 'General'}
              </span>
              {isGranel && (
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  A Granel (Kg)
                </span>
              )}
            </div>
            <h3 className="text-xs font-bold text-white line-clamp-2 leading-snug">
              {product.description}
            </h3>

            {/* Before vs After Stock comparison */}
            <div className="mt-3 grid grid-cols-2 gap-2 bg-slate-900/90 rounded-xl p-2.5 border border-slate-800">
              <div className="text-center">
                <span className="text-[10px] text-slate-400 block font-medium">Stock Actual</span>
                <span className="text-base font-black text-slate-200">
                  {currentStock} <span className="text-xs font-normal text-slate-400">{isGranel ? 'kg' : 'uds'}</span>
                </span>
              </div>
              <div className="text-center border-l border-slate-800 pl-2">
                <span className="text-[10px] text-blue-400 block font-medium">Nuevo Stock</span>
                <span className={`text-base font-black ${
                  computedNewStock < currentStock 
                    ? 'text-rose-400' 
                    : computedNewStock > currentStock 
                    ? 'text-emerald-400' 
                    : 'text-slate-200'
                }`}>
                  {computedNewStock} <span className="text-xs font-normal opacity-70">{isGranel ? 'kg' : 'uds'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setMode('adjust')}
              className={`py-2 text-xs font-bold rounded-lg transition ${
                mode === 'adjust'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Movimiento (+ / -)
            </button>
            <button
              type="button"
              onClick={() => setMode('set_exact')}
              className={`py-2 text-xs font-bold rounded-lg transition ${
                mode === 'set_exact'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Conteo Exacto
            </button>
          </div>

          {/* Mode: Movement Type & Quantity */}
          {mode === 'adjust' ? (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 mb-1.5 block">
                  Tipo de Operación
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMovementType('Entrada')}
                    className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition ${
                      movementType === 'Entrada'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/50'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>Entrada (+)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMovementType('Salida')}
                    className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition ${
                      movementType === 'Salida'
                        ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-950/50'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <TrendingDown className="w-4 h-4" />
                    <span>Salida (-)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMovementType('Merma')}
                    className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition ${
                      movementType === 'Merma'
                        ? 'bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-950/50'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Merma</span>
                  </button>
                </div>
              </div>

              {/* Amount input */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 mb-1.5 block">
                  Cantidad a {movementType === 'Entrada' ? 'Ingresar' : 'Descontar'}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickAdd(-1)}
                    className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 text-white font-black text-base flex items-center justify-center active:scale-95 transition"
                  >
                    -1
                  </button>
                  <input
                    type="number"
                    step={isGranel ? '0.01' : '1'}
                    min="0"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="flex-1 h-12 bg-slate-950 border border-slate-700 rounded-xl text-center text-xl font-black text-white focus:outline-none focus:border-blue-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => handleQuickAdd(1)}
                    className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 text-white font-black text-base flex items-center justify-center active:scale-95 transition"
                  >
                    +1
                  </button>
                </div>
              </div>

              {/* Quick Stepper Buttons */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[5, 10, 20, 50].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => handleQuickAdd(step)}
                    className="py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-lg text-xs font-bold text-slate-300 transition active:scale-95"
                  >
                    +{step}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Mode: Exact Physical Stock Count */
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Conteo Físico Real Encontrado</span>
                  <span className="text-[10px] text-blue-400 font-normal">Reemplaza el stock actual</span>
                </label>
                <input
                  type="number"
                  step={isGranel ? '0.01' : '1'}
                  min="0"
                  value={exactStockStr}
                  onChange={(e) => setExactStockStr(e.target.value)}
                  className="w-full h-12 bg-slate-950 border border-slate-700 rounded-xl text-center text-2xl font-black text-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Quick delta buttons for exact count */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[-10, -1, +1, +10].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => handleQuickAdd(delta)}
                    className={`py-1.5 border rounded-lg text-xs font-bold transition active:scale-95 ${
                      delta < 0
                        ? 'bg-rose-950/40 border-rose-800/60 text-rose-300 hover:bg-rose-900/60'
                        : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/60'
                    }`}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reason / Motivo */}
          <div>
            <label className="text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1">
              <ClipboardList className="w-3.5 h-3.5 text-slate-400" />
              <span>Motivo / Observación (opcional)</span>
            </label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Conteo físico de pasillo, reposición de proveedor..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300 transition active:scale-95 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-[2] py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-black text-white shadow-lg shadow-blue-900/50 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Confirmar Stock ({computedNewStock})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
