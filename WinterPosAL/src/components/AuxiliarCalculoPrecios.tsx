import { useState, useEffect } from 'react';
import { Calculator, Percent, DollarSign, Zap, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Edit2, ShieldAlert, TrendingUp } from 'lucide-react';

interface AuxiliarCalculoPreciosProps {
  onApplyPrices: (prices: { cost: string; detail: string; mayor: string; bulto: string }) => void;
  tasaBCV?: number;       // Official BCV Rate
  tasaFallback?: number;  // Fallback system rate
  initialCost?: string;
  initialDetail?: string;
  initialMayor?: string;
  initialBulto?: string;
  cantBulto?: number;
  taxActive?: boolean;
  taxPct?: number;
  onToggleExpand?: (expanded: boolean) => void;
}

export default function AuxiliarCalculoPrecios({
  onApplyPrices,
  tasaBCV = 0,
  tasaFallback = 0,
  initialCost = '',
  initialDetail = '',
  initialMayor = '',
  initialBulto = '',
  cantBulto = 1,
  taxActive = false,
  taxPct = 16,
  onToggleExpand
}: AuxiliarCalculoPreciosProps) {
  const [isEnabled, setIsEnabled] = useState(false);

  // Determine effective rate
  const isBcvAvailable = tasaBCV > 0;
  const effectiveRate = isBcvAvailable 
    ? tasaBCV 
    : (tasaFallback > 0 ? tasaFallback : 742.23);

  // Cost calculation states
  const [totalCost, setTotalCost] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const [units, setUnits] = useState('1');
  const [customRate, setCustomRate] = useState<string>(effectiveRate.toFixed(2));
  const [isCustomEditing, setIsCustomEditing] = useState<boolean>(false);
  
  // Profit margin states (%)
  const [marginDetail, setMarginDetail] = useState('30');
  const [marginMayor, setMarginMayor] = useState('15');
  const [marginBulto, setMarginBulto] = useState('8');

  // Initial previous prices for comparison guide
  const prevCost = parseFloat(initialCost) || 0;
  const prevDetail = parseFloat(initialDetail) || 0;
  const prevMayor = parseFloat(initialMayor) || 0;
  const prevBulto = parseFloat(initialBulto) || 0;
  const hasInitialPrices = prevCost > 0 || prevDetail > 0 || prevMayor > 0 || prevBulto > 0;

  // Helper to enforce max 2 decimal places strictly for manual inputs
  const sanitize2Decimals = (val: string) => {
    if (val === '') return '';
    if (/^\d*(\.\d{0,2})?$/.test(val)) {
      return val;
    }
    const parts = val.split('.');
    if (parts.length > 1) {
      return `${parts[0]}.${parts[1].slice(0, 2)}`;
    }
    return val;
  };

  // Sync customRate when official BCV rate arrives or updates
  useEffect(() => {
    if (isBcvAvailable && !isCustomEditing) {
      setCustomRate(tasaBCV.toFixed(2));
    } else if (!isBcvAvailable && !customRate) {
      setCustomRate(effectiveRate.toFixed(2));
    }
  }, [tasaBCV, isBcvAvailable]);

  // Notify parent component when toggled
  const handleToggle = (checked: boolean) => {
    setIsEnabled(checked);
    onToggleExpand?.(checked);
  };

  // Derived calculations with zero-error safety
  const parsedTotalCost = Math.max(parseFloat(totalCost) || 0, 0);
  const parsedUnits = Math.max(parseFloat(units) || 1, 0.001);
  const activeRateNum = isCustomEditing 
    ? (parseFloat(customRate) || effectiveRate || 1)
    : (effectiveRate || parseFloat(customRate) || 1);
  
  const parsedRate = Math.max(activeRateNum, 0.0001);

  // Total cost converted to USD
  const totalCostUSD = currency === 'VES' ? (parsedTotalCost / parsedRate) : parsedTotalCost;
  
  // Calculated unit cost in USD
  const unitCostUSD = parsedTotalCost > 0 ? (totalCostUSD / parsedUnits) : (parseFloat(initialCost) || 0);

  // Calculated prices in USD
  const pctDetail = Math.max(parseFloat(marginDetail) || 0, 0);
  let pctMayor = Math.max(parseFloat(marginMayor) || 0, 0);
  let pctBulto = Math.max(parseFloat(marginBulto) || 0, 0);

  // CONSTRAINT RULE: Wholesale margin/price MUST be less than retail, and bulk MUST be less than wholesale
  let isMayorAdjusted = false;
  if (pctMayor >= pctDetail && pctDetail > 0) {
    pctMayor = Math.max(0, pctDetail - 1);
    isMayorAdjusted = true;
  }

  let isBultoAdjusted = false;
  if (pctBulto >= pctMayor && pctMayor > 0) {
    pctBulto = Math.max(0, pctMayor - 1);
    isBultoAdjusted = true;
  }

  const rawDetailUSD = unitCostUSD > 0 ? (unitCostUSD * (1 + pctDetail / 100)) : (parseFloat(initialDetail) || 0);
  let rawMayorUSD = unitCostUSD > 0 ? (unitCostUSD * (1 + pctMayor / 100)) : (parseFloat(initialMayor) || 0);
  let rawBultoUSD = unitCostUSD > 0 ? (unitCostUSD * (1 + pctBulto / 100)) : (parseFloat(initialBulto) || 0);

  // Additional check to enforce rawMayorUSD < rawDetailUSD and rawBultoUSD < rawMayorUSD
  if (rawMayorUSD >= rawDetailUSD && rawDetailUSD > 0) {
    rawMayorUSD = Math.max(0, rawDetailUSD - 0.01);
    isMayorAdjusted = true;
  }
  if (rawBultoUSD >= rawMayorUSD && rawMayorUSD > 0) {
    rawBultoUSD = Math.max(0, rawMayorUSD - 0.01);
    isBultoAdjusted = true;
  }

  const calculatedDetailUSD = rawDetailUSD;
  const calculatedMayorUSD = rawMayorUSD;
  const calculatedBultoUSD = rawBultoUSD;

  // IVA Calculations
  const taxMultiplier = taxActive && taxPct > 0 ? (1 + taxPct / 100) : 1;
  const detailWithIva = calculatedDetailUSD * taxMultiplier;
  const mayorWithIva = calculatedMayorUSD * taxMultiplier;
  const bultoWithIva = calculatedBultoUSD * taxMultiplier;

  const [appliedToast, setAppliedToast] = useState(false);

  const handleManualApply = () => {
    if (unitCostUSD >= 0) {
      onApplyPrices({
        cost: unitCostUSD.toFixed(2),
        detail: calculatedDetailUSD.toFixed(2),
        mayor: calculatedMayorUSD.toFixed(2),
        bulto: calculatedBultoUSD.toFixed(2)
      });
      setAppliedToast(true);
      setTimeout(() => setAppliedToast(false), 2500);
    }
  };

  return (
    <div className={`transition-all duration-300 rounded-xl border-2 ${
      isEnabled 
        ? 'bg-amber-50/70 border-amber-400 shadow-md p-3' 
        : 'bg-slate-50 border-dashed border-slate-300 p-2.5 hover:border-amber-300'
    }`}>
      {/* HEADER / TOGGLE BAR */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-350 cursor-pointer"
          />
          <div className="flex items-center gap-1.5">
            <Calculator className={`w-4 h-4 ${isEnabled ? 'text-amber-700' : 'text-slate-500'}`} />
            <span className={`text-xs font-extrabold font-sans uppercase tracking-wide ${
              isEnabled ? 'text-amber-900' : 'text-slate-700'
            }`}>
              🧮 Auxiliar de Cálculo de Precios (Lote & Márgenes)
            </span>
          </div>
        </label>

        <button
          type="button"
          onClick={() => handleToggle(!isEnabled)}
          className={`text-[11px] font-bold px-2.5 py-1 rounded flex items-center gap-1 transition-all ${
            isEnabled 
              ? 'bg-amber-200 hover:bg-amber-300 text-amber-900' 
              : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
          }`}
        >
          <span>{isEnabled ? 'Ocultar Auxiliar' : 'Usar Auxiliar'}</span>
          {isEnabled ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* EXPANDABLE BODY */}
      {isEnabled && (
        <div className="mt-3 space-y-2.5 pt-2.5 border-t border-amber-200/80 animate-fade-in font-sans text-slate-800">
          
          {/* SECTION 1: COST CALCULATOR */}
          <div className="bg-white border border-amber-200 rounded-lg p-2.5 space-y-2 shadow-sm">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-extrabold text-amber-800 uppercase flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                1. Costo de Compra (Lote / Empaque)
              </span>
              
              {/* Rate Status Indicator */}
              <div className="flex items-center gap-1 text-[10px]">
                {isBcvAvailable ? (
                  <div className="flex items-center gap-1">
                    <span className="text-emerald-700 font-extrabold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Tasa Oficial BCV: {tasaBCV.toFixed(2)} Bs/$
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCustomEditing(!isCustomEditing)}
                      className="text-[9px] font-extrabold text-slate-600 hover:text-amber-800 bg-slate-100 hover:bg-amber-100 px-1.5 py-0.5 rounded border border-slate-300 transition-all flex items-center gap-0.5"
                      title="Editar tasa manualmente"
                    >
                      <Edit2 className="w-2.5 h-2.5" />
                      <span>{isCustomEditing ? 'Usar BCV' : 'Editar'}</span>
                    </button>
                  </div>
                ) : (
                  <span className="text-amber-800 font-extrabold flex items-center gap-1 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 font-mono">
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                    Tasa Manual (BCV no disponible)
                  </span>
                )}
              </div>
            </div>

            <div className={`grid grid-cols-1 ${currency === 'VES' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-2`}>
              {/* Total Cost Input (Strictly max 2 decimals) */}
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-0.5 whitespace-nowrap">
                  Monto Total Pagado (Máx 2 dec.)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={totalCost}
                    onChange={(e) => setTotalCost(sanitize2Decimals(e.target.value))}
                    onBlur={() => {
                      if (totalCost && !isNaN(parseFloat(totalCost))) {
                        setTotalCost(parseFloat(totalCost).toFixed(2));
                      }
                    }}
                    className="w-full bg-amber-50/40 border border-amber-300 rounded p-1.5 pr-14 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                  />
                  <div className="absolute right-1 flex bg-slate-100 border border-slate-200 rounded text-[10px] font-extrabold overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCurrency('USD')}
                      className={`px-1.5 py-0.5 ${currency === 'USD' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                    >
                      $
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrency('VES')}
                      className={`px-1.5 py-0.5 ${currency === 'VES' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                    >
                      Bs
                    </button>
                  </div>
                </div>
              </div>

              {/* Manual Rate Input (Strictly max 2 decimals) */}
              {currency === 'VES' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-600 flex items-center justify-between mb-0.5">
                    <span>Tasa (Bs/$ - 2 dec.)</span>
                    <span className="text-[9px] text-emerald-700 font-extrabold">
                      {isBcvAvailable && !isCustomEditing ? '🟢 BCV' : '✏️ Manual'}
                    </span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={isBcvAvailable && !isCustomEditing}
                    placeholder="Ej. 742.23"
                    value={isCustomEditing ? customRate : parsedRate.toFixed(2)}
                    onChange={(e) => {
                      setIsCustomEditing(true);
                      setCustomRate(sanitize2Decimals(e.target.value));
                    }}
                    onBlur={() => {
                      if (customRate && !isNaN(parseFloat(customRate))) {
                        setCustomRate(parseFloat(customRate).toFixed(2));
                      }
                    }}
                    className={`w-full border rounded p-1.5 text-xs font-mono font-bold focus:outline-none ${
                      isBcvAvailable && !isCustomEditing 
                        ? 'bg-slate-100 text-slate-700 border-slate-300 cursor-not-allowed' 
                        : 'bg-emerald-50/70 text-emerald-900 border-emerald-400 focus:bg-white focus:border-emerald-600'
                    }`}
                  />
                </div>
              )}

              {/* Units Input */}
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                  Cant. Unidades
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  placeholder="1"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  className="w-full bg-amber-50/40 border border-amber-300 rounded p-1.5 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Calculated Unit Cost Display */}
              <div className="bg-amber-100/70 border border-amber-300 rounded p-1 flex flex-col justify-center items-center text-center">
                <span className="text-[9px] font-extrabold uppercase text-amber-800">Costo Unitario ($)</span>
                <span className="text-sm font-black font-mono text-amber-950">
                  ${unitCostUSD.toFixed(2)}
                </span>
                {currency === 'VES' && parsedTotalCost > 0 && (
                  <span className="text-[9px] font-mono text-emerald-800 font-bold">
                    Eq: Bs {(unitCostUSD * parsedRate).toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2: MARGIN CALCULATOR */}
          <div className="bg-white border border-amber-200 rounded-lg p-2.5 space-y-2 shadow-sm">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-extrabold text-amber-800 uppercase flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-amber-600" />
                2. Márgenes de Ganancia Deseados (%)
              </span>
              {taxActive && (
                <span className="text-[9px] font-extrabold bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200 font-sans">
                  🏷️ Incluye Impuesto ({taxPct}% IVA)
                </span>
              )}
            </div>

            {(isMayorAdjusted || isBultoAdjusted) && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 p-1.5 rounded border border-amber-300">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Nota: Los precios se calibraron automáticamente para garantizar la jerarquía: Costo &lt; Bulto &lt; Mayor &lt; Detalle.</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Retail Margin */}
              <div className="space-y-1 bg-emerald-50/50 border border-emerald-200 rounded-lg p-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-extrabold text-emerald-900">
                    % Ganancia Venta (Detalle)
                  </label>
                  <div className="text-right font-mono">
                    <span className="text-xs font-black text-emerald-700 block">
                      Base: ${calculatedDetailUSD.toFixed(2)}
                    </span>
                    {taxActive && (
                      <span className="text-[9px] font-extrabold text-blue-700 block">
                        +{taxPct}% IVA: ${detailWithIva.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="30"
                    value={marginDetail}
                    onChange={(e) => setMarginDetail(e.target.value)}
                    className="w-16 bg-white border border-emerald-300 rounded p-1 text-xs font-mono font-bold text-center focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                  <span className="text-xs font-bold text-emerald-800">%</span>
                  {/* Preset Buttons */}
                  <div className="flex flex-wrap gap-1 ml-auto">
                    {['20', '30', '40', '50'].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setMarginDetail(pct)}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${
                          marginDetail === pct 
                            ? 'bg-emerald-600 text-white border-emerald-600' 
                            : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Wholesale Margin */}
              <div className="space-y-1 bg-purple-50/50 border border-purple-200 rounded-lg p-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-extrabold text-purple-900">
                    % Ganancia Mayorista
                  </label>
                  <div className="text-right font-mono">
                    <span className="text-xs font-black text-purple-700 block">
                      Base: ${calculatedMayorUSD.toFixed(2)}
                    </span>
                    {taxActive && (
                      <span className="text-[9px] font-extrabold text-blue-700 block">
                        +{taxPct}% IVA: ${mayorWithIva.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="15"
                    value={marginMayor}
                    onChange={(e) => setMarginMayor(e.target.value)}
                    className="w-16 bg-white border border-purple-300 rounded p-1 text-xs font-mono font-bold text-center focus:ring-1 focus:ring-purple-500 focus:outline-none"
                  />
                  <span className="text-xs font-bold text-purple-800">%</span>
                  {/* Preset Buttons */}
                  <div className="flex flex-wrap gap-1 ml-auto">
                    {['10', '15', '20', '25'].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setMarginMayor(pct)}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${
                          marginMayor === pct 
                            ? 'bg-purple-600 text-white border-purple-600' 
                            : 'bg-white text-purple-800 border-purple-300 hover:bg-purple-100'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bulk / Case Margin */}
              <div className="space-y-1 bg-amber-50/80 border border-amber-300 rounded-lg p-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-extrabold text-amber-900">
                    % Ganancia Bulto / Empaque
                  </label>
                  <div className="text-right font-mono">
                    <span className="text-xs font-black text-amber-700 block">
                      Base: ${calculatedBultoUSD.toFixed(2)}
                    </span>
                    <span className="text-[8.5px] font-bold text-amber-800 block">
                      Bulto x{cantBulto || 1}: ${(calculatedBultoUSD * (cantBulto || 1)).toFixed(2)}
                    </span>
                    {taxActive && (
                      <span className="text-[9px] font-extrabold text-blue-700 block">
                        +{taxPct}% IVA: ${bultoWithIva.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="8"
                    value={marginBulto}
                    onChange={(e) => setMarginBulto(e.target.value)}
                    className="w-16 bg-white border border-amber-300 rounded p-1 text-xs font-mono font-bold text-center focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                  <span className="text-xs font-bold text-amber-800">%</span>
                  {/* Preset Buttons */}
                  <div className="flex flex-wrap gap-1 ml-auto">
                    {['5', '8', '10', '12'].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setMarginBulto(pct)}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${
                          marginBulto === pct 
                            ? 'bg-amber-600 text-white border-amber-600' 
                            : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: INTEGRATED PRICE COMPARISON GUIDE (INSIDE AUXILIAR) */}
          {hasInitialPrices && (
            <div className="bg-gradient-to-r from-amber-100/90 via-amber-50 to-orange-100/90 border border-amber-300/90 rounded-lg p-2.5 space-y-2 shadow-sm font-sans">
              <div className="flex justify-between items-center border-b border-amber-200/80 pb-1.5">
                <span className="text-[11px] font-extrabold text-amber-900 uppercase flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-700" />
                  3. Guía Comparativa (Precio Anterior ➡️ Nuevo Previo)
                </span>
                <span className="text-[9px] font-extrabold bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                  💡 Se aplicará al guardar
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                {/* COSTO */}
                <div className="bg-white/95 border border-amber-200 rounded-md p-1.5 space-y-0.5 shadow-2xs">
                  <span className="text-[10px] font-extrabold text-amber-800 block uppercase">Costo ($)</span>
                  <div className="flex items-center justify-center gap-1 font-mono flex-wrap">
                    <span className="text-slate-400 text-xs font-bold line-through">
                      ${prevCost.toFixed(2)}
                    </span>
                    <span className="text-amber-600 font-extrabold text-xs">➡️</span>
                    <span className="text-amber-900 font-black text-xs bg-amber-100 px-1 py-0.5 rounded">
                      ${unitCostUSD.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* VENTA DETALLE */}
                <div className="bg-white/95 border border-emerald-200 rounded-md p-1.5 space-y-0.5 shadow-2xs">
                  <span className="text-[10px] font-extrabold text-emerald-800 block uppercase">Venta Detalle ($)</span>
                  <div className="flex items-center justify-center gap-1 font-mono flex-wrap">
                    <span className="text-slate-400 text-xs font-bold line-through">
                      ${prevDetail.toFixed(2)}
                    </span>
                    <span className="text-emerald-600 font-extrabold text-xs">➡️</span>
                    <span className="text-emerald-900 font-black text-xs bg-emerald-100 px-1 py-0.5 rounded">
                      ${calculatedDetailUSD.toFixed(2)}
                    </span>
                  </div>
                  {taxActive && taxPct > 0 && (
                    <span className="text-[9px] font-bold text-blue-700 block font-mono">
                      +IVA: ${detailWithIva.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* VENTA MAYOR */}
                <div className="bg-white/95 border border-purple-200 rounded-md p-1.5 space-y-0.5 shadow-2xs">
                  <span className="text-[10px] font-extrabold text-purple-800 block uppercase">Venta Mayor ($)</span>
                  <div className="flex items-center justify-center gap-1 font-mono flex-wrap">
                    <span className="text-slate-400 text-xs font-bold line-through">
                      ${prevMayor.toFixed(2)}
                    </span>
                    <span className="text-purple-600 font-extrabold text-xs">➡️</span>
                    <span className="text-purple-900 font-black text-xs bg-purple-100 px-1 py-0.5 rounded">
                      ${calculatedMayorUSD.toFixed(2)}
                    </span>
                  </div>
                  {taxActive && taxPct > 0 && (
                    <span className="text-[9px] font-bold text-blue-700 block font-mono">
                      +IVA: ${mayorWithIva.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* VENTA BULTO */}
                <div className="bg-white/95 border border-amber-300 rounded-md p-1.5 space-y-0.5 shadow-2xs">
                  <span className="text-[10px] font-extrabold text-amber-900 block uppercase">Venta Bulto ($)</span>
                  <div className="flex items-center justify-center gap-1 font-mono flex-wrap">
                    <span className="text-slate-400 text-xs font-bold line-through">
                      ${prevBulto.toFixed(2)}
                    </span>
                    <span className="text-amber-600 font-extrabold text-xs">➡️</span>
                    <span className="text-amber-900 font-black text-xs bg-amber-100 px-1 py-0.5 rounded">
                      ${calculatedBultoUSD.toFixed(2)}
                    </span>
                  </div>
                  {taxActive && taxPct > 0 && (
                    <span className="text-[9px] font-bold text-blue-700 block font-mono">
                      +IVA: ${bultoWithIva.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MANUAL APPLY BUTTON & NOTE */}
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[10px] font-bold text-amber-900">
              {appliedToast ? (
                <span className="text-emerald-700 font-extrabold flex items-center gap-1 animate-pulse bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                  ⚡ ¡Precios aplicados a los campos de la ficha técnica!
                </span>
              ) : (
                <span>💡 Presiona "Aplicar al Producto" para transferir estos precios a la ficha.</span>
              )}
            </span>
            <button
              type="button"
              onClick={handleManualApply}
              className={`text-white text-[11px] font-extrabold px-3 py-1 rounded-lg transition-all flex items-center gap-1 shadow-sm active:scale-95 shrink-0 ${
                appliedToast ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{appliedToast ? '¡Aplicado!' : 'Aplicar al Producto'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
