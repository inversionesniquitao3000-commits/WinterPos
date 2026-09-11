import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Banknote, X, CheckCircle2, RefreshCw, AlertCircle, Coins } from 'lucide-react';
import { getApiBaseUrl } from '../utils';

interface MobileTasaModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTasa: number;
  currentTasaVuelto?: number;
  initialMoneda?: 'usd' | 'eur';
  userName?: string;
  onRateUpdated: (newTasaCobro: number, newTasaVuelto: number, moneda: 'usd' | 'eur') => void;
}

export default function MobileTasaModal({
  isOpen,
  onClose,
  currentTasa,
  currentTasaVuelto,
  initialMoneda,
  userName = 'Administrador Móvil',
  onRateUpdated
}: MobileTasaModalProps) {
  // Currency selection: 'usd' ($) or 'eur' (€)
  const [moneda, setMoneda] = useState<'usd' | 'eur'>(() => {
    return initialMoneda || (localStorage.getItem('pos_mobile_tasa_currency') as 'usd' | 'eur') || 'usd';
  });

  const [tasaCobro, setTasaCobro] = useState<string>('');
  const [tasaVuelto, setTasaVuelto] = useState<string>('');
  const [sameVuelto, setSameVuelto] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isFetchingBcv, setIsFetchingBcv] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Cached live BCV rates for both currencies
  const [bcvRates, setBcvRates] = useState<{ usd: number; eur: number; fechaValor?: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const savedMoneda = initialMoneda || (localStorage.getItem('pos_mobile_tasa_currency') as 'usd' | 'eur') || 'usd';
      setMoneda(savedMoneda);
      setTasaCobro(currentTasa ? currentTasa.toString() : '');
      const vuelto = currentTasaVuelto || currentTasa;
      setTasaVuelto(vuelto ? vuelto.toString() : '');
      setSameVuelto(currentTasa === (currentTasaVuelto || currentTasa));
      setFeedback(null);

      // Auto query BCV rates upon opening modal
      fetchBcvRates(savedMoneda, false);
    }
  }, [isOpen, currentTasa, currentTasaVuelto, initialMoneda]);

  if (!isOpen) return null;

  const fetchBcvRates = async (targetMoneda = moneda, showUserFeedback = true) => {
    setIsFetchingBcv(true);
    if (showUserFeedback) setFeedback(null);

    try {
      // 1. Try /api/bcv (standard endpoint with both USD and EUR)
      const res = await fetch(`${getApiBaseUrl()}/bcv`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        const usdVal = parseFloat(data.usd);
        const eurVal = parseFloat(data.eur);

        if (usdVal > 0) {
          const rates = {
            usd: usdVal,
            eur: eurVal > 0 ? eurVal : usdVal * 1.08,
            fechaValor: data.fechaValor || 'Al día'
          };
          setBcvRates(rates);

          const selectedRate = targetMoneda === 'eur' ? rates.eur : rates.usd;
          setTasaCobro(selectedRate.toFixed(2));
          if (sameVuelto) setTasaVuelto(selectedRate.toFixed(2));

          if (showUserFeedback) {
            setFeedback({
              type: 'success',
              message: `Tasas BCV obtenidas: $ ${rates.usd.toFixed(2)} Bs | € ${rates.eur.toFixed(2)} Bs`
            });
          }
          return;
        }
      }

      // 2. Fallback: try /api/tasas/consultar-bcv
      const resOld = await fetch(`${getApiBaseUrl()}/tasas/consultar-bcv`).catch(() => null);
      if (resOld && resOld.ok) {
        const dataOld = await resOld.json();
        if (dataOld.tasa) {
          const usdVal = parseFloat(dataOld.tasa);
          if (usdVal > 0) {
            const rates = {
              usd: usdVal,
              eur: usdVal * 1.08,
              fechaValor: 'Al día'
            };
            setBcvRates(rates);

            const selectedRate = targetMoneda === 'eur' ? rates.eur : rates.usd;
            setTasaCobro(selectedRate.toFixed(2));
            if (sameVuelto) setTasaVuelto(selectedRate.toFixed(2));

            if (showUserFeedback) {
              setFeedback({
                type: 'success',
                message: `Tasa BCV obtenida: ${selectedRate.toFixed(2)} Bs`
              });
            }
            return;
          }
        }
      }

      // 3. Fallback: check GET /api/tasas history
      const fallbackRes = await fetch(`${getApiBaseUrl()}/tasas`);
      if (fallbackRes.ok) {
        const hist = await fallbackRes.json();
        if (Array.isArray(hist) && hist.length > 0) {
          const latest = hist[hist.length - 1];
          const val = parseFloat(latest.tasa_cobro || latest.tasa || latest.monto);
          if (val > 0) {
            setTasaCobro(val.toFixed(2));
            if (sameVuelto) setTasaVuelto(val.toFixed(2));
            if (showUserFeedback) {
              setFeedback({ type: 'success', message: `Última tasa en sistema: ${val.toFixed(2)} Bs` });
            }
            return;
          }
        }
      }

      if (showUserFeedback) {
        setFeedback({ type: 'error', message: 'No se pudo consultar automáticamente. Por favor ingresa el valor manual.' });
      }
    } catch (err: any) {
      if (showUserFeedback) {
        setFeedback({ type: 'error', message: 'Error al consultar tasa en línea.' });
      }
    } finally {
      setIsFetchingBcv(false);
    }
  };

  const handleSelectMoneda = (newMoneda: 'usd' | 'eur') => {
    setMoneda(newMoneda);
    localStorage.setItem('pos_mobile_tasa_currency', newMoneda);

    if (bcvRates) {
      const targetVal = newMoneda === 'eur' ? bcvRates.eur : bcvRates.usd;
      if (targetVal > 0) {
        setTasaCobro(targetVal.toFixed(2));
        if (sameVuelto) setTasaVuelto(targetVal.toFixed(2));
        setFeedback({
          type: 'success',
          message: `Seleccionada tasa ${newMoneda === 'eur' ? 'Euro (€)' : 'Dólar ($)'}: ${targetVal.toFixed(2)} Bs`
        });
      }
    }
  };

  const handleCobroChange = (val: string) => {
    setTasaCobro(val);
    if (sameVuelto) {
      setTasaVuelto(val);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const cobroNum = parseFloat(tasaCobro);
    const vueltoNum = sameVuelto ? cobroNum : parseFloat(tasaVuelto);

    if (isNaN(cobroNum) || cobroNum <= 0) {
      setFeedback({ type: 'error', message: 'Por favor ingresa un valor de tasa válido mayor a 0.' });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        tasa_cobro: cobroNum,
        tasa_vuelto: vueltoNum,
        tasa_oficial: cobroNum,
        moneda: moneda,
        diferencial_porcentaje: 0,
        usuario: `${userName} (${moneda === 'eur' ? 'Euro €' : 'Dólar $'})`
      };

      const res = await fetch(`${getApiBaseUrl()}/tasas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        console.warn(`Respuesta POST /api/tasas HTTP ${res.status}`);
      }

      // Persist chosen currency for app and background sync
      localStorage.setItem('pos_mobile_tasa_currency', moneda);
      localStorage.setItem('pos_auto_tasa_mode', moneda);
      window.dispatchEvent(new Event('pos_auto_tasa_config_changed'));

      onRateUpdated(cobroNum, vueltoNum, moneda);
      onClose();
    } catch (err: any) {
      console.error('Error al guardar tasa:', err);
      // Local fallback
      localStorage.setItem('pos_mobile_tasa_currency', moneda);
      onRateUpdated(cobroNum, vueltoNum, moneda);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const currencySymbol = moneda === 'eur' ? '€' : '$';
  const currencyLabel = moneda === 'eur' ? 'Euro (EUR)' : 'Dólar (USD)';
  const currencyUnit = moneda === 'eur' ? 'Bs/€' : 'Bs/$';

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col justify-end max-w-md mx-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
        
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-sm transition-colors ${
              moneda === 'eur' 
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              {moneda === 'eur' ? (
                <span className="text-base leading-none">€</span>
              ) : (
                <TrendingUp className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-black text-white leading-tight">Tasa de Cambio del Día</h3>
              <p className="text-[11px] text-slate-400">Actualización oficial BCV / Cobro</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center transition active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-4 pb-8 space-y-4 overflow-y-auto">

          {/* SELECTOR DE MONEDA: DÓLAR ($) vs EURO (€) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
              <Coins className="w-3.5 h-3.5 text-blue-400" />
              <span>Seleccionar Moneda de Cobro</span>
            </label>

            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800">
              {/* Opción Dólar */}
              <button
                type="button"
                onClick={() => handleSelectMoneda('usd')}
                className={`py-3 px-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs transition active:scale-95 ${
                  moneda === 'usd'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/60 font-black ring-1 ring-emerald-400/40'
                    : 'text-slate-400 hover:text-slate-200 bg-transparent'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                  moneda === 'usd' ? 'bg-white text-emerald-700' : 'bg-slate-800 text-slate-400'
                }`}>
                  $
                </div>
                <span>Dólar ($ USD)</span>
              </button>

              {/* Opción Euro */}
              <button
                type="button"
                onClick={() => handleSelectMoneda('eur')}
                className={`py-3 px-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs transition active:scale-95 ${
                  moneda === 'eur'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/60 font-black ring-1 ring-blue-400/40'
                    : 'text-slate-400 hover:text-slate-200 bg-transparent'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                  moneda === 'eur' ? 'bg-white text-blue-700' : 'bg-slate-800 text-slate-400'
                }`}>
                  €
                </div>
                <span>Euro (€ EUR)</span>
              </button>
            </div>
          </div>
          
          {/* Current Rate Display & BCV Sync */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Tasa Activa ({currencyLabel})
              </span>
              <p className={`text-2xl font-black font-mono mt-0.5 ${moneda === 'eur' ? 'text-blue-400' : 'text-emerald-400'}`}>
                {currentTasa.toFixed(2)} <span className="text-xs text-slate-400">{currencyUnit}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => fetchBcvRates(moneda, true)}
              disabled={isFetchingBcv}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isFetchingBcv ? 'animate-spin' : ''}`} />
              <span>{isFetchingBcv ? 'Consultando...' : 'Consultar BCV'}</span>
            </button>
          </div>

          {/* Quick BCV Rate Pills (USD & EUR) */}
          {bcvRates && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  handleSelectMoneda('usd');
                  handleCobroChange(bcvRates.usd.toFixed(2));
                }}
                className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition active:scale-95 ${
                  moneda === 'usd'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-1 font-bold text-[11px]">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>BCV Dólar</span>
                </span>
                <span className="font-mono font-black text-xs text-white">{bcvRates.usd.toFixed(2)} Bs</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleSelectMoneda('eur');
                  handleCobroChange(bcvRates.eur.toFixed(2));
                }}
                className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition active:scale-95 ${
                  moneda === 'eur'
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-1 font-bold text-[11px]">
                  <span className="text-sm leading-none text-blue-400 shrink-0">€</span>
                  <span>BCV Euro</span>
                </span>
                <span className="font-mono font-black text-xs text-white">{bcvRates.eur.toFixed(2)} Bs</span>
              </button>
            </div>
          )}

          {/* New Rate Input */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1">
                <Banknote className={`w-3.5 h-3.5 ${moneda === 'eur' ? 'text-blue-400' : 'text-emerald-400'}`} />
                <span>Nueva Tasa de Cobro (Bs / {moneda === 'eur' ? 'EUR €' : 'USD $'})</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={tasaCobro}
                  onChange={(e) => handleCobroChange(e.target.value)}
                  placeholder="Ej: 36.50"
                  autoFocus
                  className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-2xl font-black text-white font-mono outline-none transition-colors ${
                    moneda === 'eur'
                      ? 'border-slate-700 focus:border-blue-500'
                      : 'border-slate-700 focus:border-emerald-500'
                  }`}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                  {currencyUnit}
                </span>
              </div>
            </div>

            {/* Same rate toggle */}
            <div
              onClick={() => {
                const next = !sameVuelto;
                setSameVuelto(next);
                if (next) setTasaVuelto(tasaCobro);
              }}
              className="flex items-center gap-2 cursor-pointer py-1 px-1"
            >
              <input
                type="checkbox"
                checked={sameVuelto}
                onChange={() => {}}
                className="w-4 h-4 rounded text-emerald-600 bg-slate-800 border-slate-700 focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-slate-300 font-medium select-none">
                Usar la misma tasa para entrega de vueltos
              </span>
            </div>

            {/* Separate Tasa Vuelto if unchecked */}
            {!sameVuelto && (
              <div className="animate-in fade-in duration-150">
                <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tasa para Entrega de Vueltos ({currencyUnit})</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={tasaVuelto}
                    onChange={(e) => setTasaVuelto(e.target.value)}
                    placeholder="Ej: 36.00"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xl font-black text-white font-mono outline-none"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                    {currencyUnit}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Feedback */}
          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSaving}
            className={`w-full py-3.5 px-4 font-black text-sm rounded-2xl shadow-xl flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-60 text-white ${
              moneda === 'eur'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 shadow-blue-900/40'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 shadow-emerald-900/40'
            }`}
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>APLICAR TASA {moneda === 'eur' ? 'EURO (€)' : 'DÓLAR ($)'}</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
