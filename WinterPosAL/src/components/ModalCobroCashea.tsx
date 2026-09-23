import React, { useState, useEffect } from 'react';
import {
  X, CheckCircle2, CreditCard, Sparkles,
  Calendar, ShieldCheck, ArrowRight,
  Info, AlertCircle, QrCode, RefreshCw
} from 'lucide-react';
import { getApiBaseUrl } from '../utils';

export interface CasheaSaleData {
  nivel: string;
  nivelNombre: string;
  inicialPct: number;
  inicialUSD: number;
  inicialVES: number;
  financiadoUSD: number;
  financiadoVES: number;
  metodoInicial: string;
  refInicial?: string;
  codigoCashea: string;
  cedulaCliente?: string;
  telefonoCliente?: string;
  tasaMoneda?: 'USD' | 'EUR';
  tasaUsada?: number;
}

interface ModalCobroCasheaProps {
  isOpen: boolean;
  onClose: () => void;
  totalUSD: number;
  tasaBCV: number;
  tasaEuroBCV?: number;
  clienteActual?: { id?: any; nombre?: string; cedula_rif?: string; telefono?: string };
  onConfirmCasheaSale: (data: CasheaSaleData) => void;
}

const NIVELES_CASHEA = [
  { id: 'nivel3', label: 'Nivel 3, 4 y 5', badge: 'Estándar', pct: 40, desc: 'Inicial 40% + 3 cuotas' },
  { id: 'nivel2', label: 'Nivel 2', badge: 'Inicial 50%', pct: 50, desc: 'Inicial 50% + 3 cuotas' },
  { id: 'nivel1', label: 'Nivel 1', badge: 'Inicial 60%', pct: 60, desc: 'Inicial 60% + 3 cuotas' },
  { id: 'promo_20', label: 'Promo 20%', badge: 'Especial', pct: 20, desc: 'Inicial 20% + 3 cuotas' },
  { id: 'sin_inicial', label: 'Sin Inicial', badge: '100% Cashea', pct: 0, desc: '100% financiado' },
  { id: 'personalizado', label: 'Manual %', badge: 'Libre', pct: 40, desc: 'Porcentaje a medida' },
];

export const ModalCobroCashea: React.FC<ModalCobroCasheaProps> = ({
  isOpen,
  onClose,
  totalUSD,
  tasaBCV,
  tasaEuroBCV,
  clienteActual,
  onConfirmCasheaSale,
}) => {
  const [selectedNivel, setSelectedNivel] = useState('nivel3');
  const [customPct, setCustomPct] = useState('40');
  const [metodoInicial, setMetodoInicial] = useState<'Efectivo$' | 'EfectivoBs' | 'TarjetaBs' | 'PagoMovil' | 'AppCashea'>('TarjetaBs');
  const [refInicial, setRefInicial] = useState('');
  const [codigoCashea, setCodigoCashea] = useState('');
  const [cedulaCliente, setCedulaCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // SELECCIÓN DE TASA OFICIAL BCV: DÓLAR ($) vs EURO (€)
  const [rateMode, setRateMode] = useState<'USD' | 'EUR'>('USD');
  const [usdRate, setUsdRate] = useState<number>(0);
  const [eurRate, setEurRate] = useState<number>(0);
  const [isLoadingRates, setIsLoadingRates] = useState<boolean>(false);

  // Soporte universal para cerrar con la tecla Escape (ESC) tanto en Web como en Desktop (Electron)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Carga e inspección de Tasas Oficiales en tiempo real desde la API del BCV
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setCodigoCashea('');
      setRefInicial('');

      if (clienteActual) {
        setCedulaCliente(clienteActual.cedula_rif || '');
        setTelefonoCliente(clienteActual.telefono || '');
      }

      const fetchBcvOfficial = async () => {
        setIsLoadingRates(true);
        try {
          const baseUrl = getApiBaseUrl();
          const res = await fetch(`${baseUrl}/bcv`);
          if (res.ok) {
            const data = await res.json();
            if (data?.usd) {
              const u = parseFloat(data.usd);
              if (!isNaN(u) && u > 0) setUsdRate(u);
            }
            if (data?.eur) {
              const e = parseFloat(data.eur);
              if (!isNaN(e) && e > 0) setEurRate(e);
            }
          }
        } catch (e) {
          console.warn('⚠️ No se pudo obtener la tasa BCV en tiempo real:', e);
        } finally {
          setIsLoadingRates(false);
        }
      };

      fetchBcvOfficial();
    }
  }, [isOpen, clienteActual]);

  if (!isOpen) return null;

  const currentNivelObj = NIVELES_CASHEA.find(n => n.id === selectedNivel) || NIVELES_CASHEA[0];
  const activePct = selectedNivel === 'personalizado'
    ? Math.min(100, Math.max(0, parseFloat(customPct) || 0))
    : currentNivelObj.pct;

  const safeTotalUSD = Math.max(0, totalUSD);

  // Determinar tasas oficiales reales del BCV (o fallback oficial exacto)
  const officialUsd = usdRate > 0 ? usdRate : (tasaBCV > 0 && tasaBCV < 920 ? tasaBCV : 853.4993);
  const officialEur = eurRate > 0 ? eurRate : (tasaEuroBCV > 0 ? tasaEuroBCV : 976.5483);
  const safeRate = rateMode === 'EUR' ? officialEur : officialUsd;

  const inicialUSD = Math.round((safeTotalUSD * (activePct / 100)) * 100) / 100;
  const financiadoUSD = Math.max(0, Math.round((safeTotalUSD - inicialUSD) * 100) / 100);

  const inicialVES = Math.round((inicialUSD * safeRate) * 100) / 100;
  const financiadoVES = Math.round((financiadoUSD * safeRate) * 100) / 100;

  // Cuotas de 14 días
  const cuotaUSD = financiadoUSD > 0 ? Math.round((financiadoUSD / 3) * 100) / 100 : 0;
  const cuota3USD = financiadoUSD > 0 ? Math.round((financiadoUSD - (cuotaUSD * 2)) * 100) / 100 : 0;

  const formatFecha = (dias: number) => {
    const d = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
  };

  const handleConfirm = () => {
    if (!codigoCashea.trim()) {
      setErrorMsg('Debe ingresar el Código de Aprobación u Orden de Cashea.');
      return;
    }
    if (metodoInicial === 'PagoMovil' && !refInicial.trim()) {
      setErrorMsg('Ingrese la referencia del Pago Móvil de la inicial.');
      return;
    }

    onConfirmCasheaSale({
      nivel: selectedNivel,
      nivelNombre: currentNivelObj.label,
      inicialPct: activePct,
      inicialUSD,
      inicialVES,
      financiadoUSD,
      financiadoVES,
      metodoInicial,
      refInicial: refInicial.trim(),
      codigoCashea: codigoCashea.trim().toUpperCase(),
      cedulaCliente: cedulaCliente.trim(),
      telefonoCliente: telefonoCliente.trim(),
      tasaMoneda: rateMode,
      tasaUsada: safeRate
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-3 font-sans animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-indigo-100 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* HEADER CASHEA STYLE */}
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-700 px-6 py-4 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
              <Sparkles className="w-6 h-6 text-yellow-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white font-sans">Cobro Asistido Cashea</h2>
                <span className="bg-yellow-400/90 text-indigo-950 font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                  BNPL 0% Interés
                </span>
              </div>
              <p className="text-xs text-indigo-100 font-medium">Compra ahora y paga después a cuotas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all"
            title="Cerrar modal (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">

          {/* TOTAL BANNER & SELECCIÓN DE TASA OFICIAL BCV */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Monto Total de la Compra</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-800">${safeTotalUSD.toFixed(2)}</span>
                <span className="text-xs font-bold text-slate-500">
                  Ref ({rateMode}): Bs. {(safeTotalUSD * safeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* SELECCIÓN INTERACTIVA DE TASA OFICIAL BCV ($ O EURO) */}
            <div className="sm:text-right">
              <div className="flex items-center justify-end gap-1 mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Tasa Oficial BCV ({rateMode === 'EUR' ? '€ Euro' : '$ Dólar'})
                </span>
                {isLoadingRates && <RefreshCw className="w-3 h-3 text-indigo-500 animate-spin" />}
              </div>
              <div className="inline-flex p-1 bg-slate-200/80 rounded-xl border border-slate-300 gap-1 shadow-inner">
                <button
                  type="button"
                  onClick={() => setRateMode('USD')}
                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    rateMode === 'USD'
                      ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-500/30 font-black'
                      : 'text-slate-700 hover:bg-slate-300/60'
                  }`}
                  title={`Tasa Oficial Dólar BCV: Bs. ${officialUsd.toFixed(4)} / $`}
                >
                  <span>💵 $ USD</span>
                  <span>{officialUsd.toFixed(2)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRateMode('EUR')}
                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    rateMode === 'EUR'
                      ? 'bg-purple-600 text-white shadow-md ring-2 ring-purple-500/30 font-black'
                      : 'text-slate-700 hover:bg-slate-300/60'
                  }`}
                  title={`Tasa Oficial Euro BCV: Bs. ${officialEur.toFixed(4)} / €`}
                >
                  <span>💶 € EUR</span>
                  <span>{officialEur.toFixed(2)}</span>
                </button>
              </div>
            </div>
          </div>

          {/* SELECTOR DE NIVEL CASHEA */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">
              Seleccione Nivel de Cashea del Cliente:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {NIVELES_CASHEA.map(n => {
                const isSelected = selectedNivel === n.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelectedNivel(n.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all relative ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-600 text-indigo-900 shadow-sm ring-2 ring-indigo-500/20'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-black">{n.label}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                        isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {n.badge}
                      </span>
                    </div>
                    <span className="text-[10.5px] text-slate-500 block leading-tight">{n.desc}</span>
                  </button>
                );
              })}
            </div>

            {selectedNivel === 'personalizado' && (
              <div className="mt-2.5 flex items-center gap-2 bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100">
                <span className="text-xs font-bold text-indigo-900">Porcentaje de Inicial personalizada:</span>
                <div className="flex items-center gap-1 w-28">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={customPct}
                    onChange={(e) => setCustomPct(e.target.value)}
                    className="w-full text-center font-bold text-sm bg-white border border-indigo-300 rounded-lg py-1 px-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <span className="font-bold text-indigo-700">%</span>
                </div>
              </div>
            )}
          </div>

          {/* TARJETAS DE DESGLOSE FINANCIERO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            {/* TARJETA 1: INICIAL */}
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-900 uppercase flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Pago Inicial ({activePct}%)
                </span>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  Cobrar en Tienda
                </span>
              </div>
              <div>
                <div className="text-xl font-black text-emerald-900">${inicialUSD.toFixed(2)}</div>
                <div className="text-xs font-bold text-emerald-700">
                  Ref ({rateMode}): Bs. {inicialVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </div>
              </div>

              {/* METODO PAGO INICIAL */}
              {inicialUSD > 0 && (
                <div className="pt-2 border-t border-emerald-200/60 space-y-1.5">
                  <label className="text-[11px] font-bold text-emerald-800 block">Forma de Pago de la Inicial:</label>
                  <select
                    value={metodoInicial}
                    onChange={(e: any) => setMetodoInicial(e.target.value)}
                    className="w-full text-xs font-bold bg-white border border-emerald-300 rounded-lg p-1.5 text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="TarjetaBs">Tarjeta de Débito Bs (Punto)</option>
                    <option value="PagoMovil">Pago Móvil Bs</option>
                    <option value="Efectivo$">Efectivo $ (USD)</option>
                    <option value="EfectivoBs">Efectivo Bs</option>
                    <option value="AppCashea">Pagado en App Cashea</option>
                  </select>

                  {metodoInicial === 'PagoMovil' && (
                    <input
                      type="text"
                      placeholder="Referencia Pago Móvil inicial..."
                      value={refInicial}
                      onChange={(e) => setRefInicial(e.target.value)}
                      className="w-full text-xs font-bold bg-white border border-emerald-300 rounded-lg p-1.5 text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                </div>
              )}
            </div>

            {/* TARJETA 2: FINANCIAMIENTO CASHEA Y CUOTAS */}
            <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-indigo-900 uppercase flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  Financiado por Cashea ({100 - activePct}%)
                </span>
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                  3 Cuotas sin interés
                </span>
              </div>
              <div>
                <div className="text-xl font-black text-indigo-900">${financiadoUSD.toFixed(2)}</div>
                <div className="text-xs font-bold text-indigo-700">
                  Ref ({rateMode}): Bs. {financiadoVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </div>
              </div>

              {/* CALENDARIO DE CUOTAS */}
              {financiadoUSD > 0 && (
                <div className="pt-2 border-t border-indigo-200/60 space-y-1">
                  <div className="flex items-center justify-between text-[10.5px] font-medium text-slate-600">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-indigo-500" /> Cuota 1 ({formatFecha(14)}):</span>
                    <span className="font-bold text-slate-800">${cuotaUSD.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10.5px] font-medium text-slate-600">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-indigo-500" /> Cuota 2 ({formatFecha(28)}):</span>
                    <span className="font-bold text-slate-800">${cuotaUSD.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10.5px] font-medium text-slate-600">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-indigo-500" /> Cuota 3 ({formatFecha(42)}):</span>
                    <span className="font-bold text-slate-800">${cuota3USD.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* DATOS DE LA APROBACIÓN CASHEA */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">Validación de la Orden Cashea</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-1">
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Cédula / RIF</label>
                <input
                  type="text"
                  placeholder="V-12345678"
                  value={cedulaCliente}
                  onChange={(e) => setCedulaCliente(e.target.value)}
                  className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Teléfono Móvil</label>
                <input
                  type="text"
                  placeholder="04121234567"
                  value={telefonoCliente}
                  onChange={(e) => setTelefonoCliente(e.target.value)}
                  className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="text-[11px] font-bold text-indigo-900 block mb-1 flex items-center justify-between">
                  <span>Código Aprobación *</span>
                  <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                </label>
                <input
                  type="text"
                  placeholder="Ej: CSH-984210"
                  value={codigoCashea}
                  onChange={(e) => setCodigoCashea(e.target.value.toUpperCase())}
                  className="w-full text-xs font-mono font-black bg-indigo-50/50 border-2 border-indigo-400 rounded-lg p-2 text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500 uppercase placeholder:text-slate-400"
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-500 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              Solicite al cliente que abra su app Cashea, confirme la compra y proporcione el código de aprobación o muestre el QR.
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold p-2.5 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

        </div>

        {/* FOOTER ACTIONS */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all"
          >
            Cancelar (ESC)
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-black text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Confirmar y Facturar con Cashea</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
