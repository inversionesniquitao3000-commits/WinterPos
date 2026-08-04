import { useState, useEffect } from 'react';
import { RefreshCw, DollarSign, CheckCircle2, Printer, Sparkles, Coins, CreditCard, Smartphone } from 'lucide-react';
import { User, CompanyConfig } from '../types';

interface CambioDivisasModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasaDia: number;
  bcvRateUSD?: number;
  currentUser: User;
  companyConfig?: CompanyConfig;
  onProcessOperation: (operation: {
    tipo_operacion: 'COMPRA_DIVISA' | 'VENTA_EFECTIVO';
    currency: 'USD' | 'EUR';
    monto_divisa: number;
    tasa_aplicada: number;
    es_tasa_manual: boolean;
    monto_ves_entregado: number;
    metodo_cobro?: 'BIOPAGO' | 'PUNTO' | 'PAGO_MOVIL' | 'TRANSFERENCIA' | 'EFECTIVO_USD';
    comision_pct?: number;
    comision_monto_ves?: number;
    comision_monto_usd?: number;
    monto_digital_cobrado_ves?: number;
    monto_digital_cobrado_usd?: number;
    observacion?: string;
  }) => void;
}

export default function CambioDivisasModal({
  isOpen,
  onClose,
  tasaDia,
  bcvRateUSD,
  currentUser,
  companyConfig,
  onProcessOperation
}: CambioDivisasModalProps) {
  if (!isOpen) return null;

  const defaultRate = bcvRateUSD || tasaDia || 1;

  // Active Subtab inside modal
  const [activeTab, setActiveTab] = useState<'compra' | 'avance'>('compra');

  // ESC key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Reset states when modal opens
  useEffect(() => {
    if (isOpen) {
      setCompraMontoDivisa('');
      setAvanceBsSolicitado('');
      setLastProcessedTicket(null);
    }
  }, [isOpen]);

  // --- ESTADOS: COMPRA / CAMBIO DE DIVISAS ---
  const [compraCurrency, setCompraCurrency] = useState<'USD' | 'EUR'>('USD');
  const [compraMontoDivisa, setCompraMontoDivisa] = useState<string>('');
  const [compraTasaMode, setCompraTasaMode] = useState<'oficial' | 'manual'>('oficial');
  const [compraTasaManual, setCompraTasaManual] = useState<string>(defaultRate.toFixed(2));
  const [compraObs, setCompraObs] = useState<string>('');

  // Tasa efectiva aplicada en cambio de divisas
  const effectiveCompraRate = compraTasaMode === 'oficial' ? defaultRate : (parseFloat(compraTasaManual) || defaultRate);
  const divisaValNum = parseFloat(compraMontoDivisa) || 0;
  const totalBsEntregarCompra = divisaValNum * effectiveCompraRate;

  // --- ESTADOS: VENTA DE EFECTIVO (AVANCE) ---
  const [avanceBsSolicitado, setAvanceBsSolicitado] = useState<string>('');
  const [avanceMetodoCobro, setAvanceMetodoCobro] = useState<'BIOPAGO' | 'PUNTO' | 'PAGO_MOVIL' | 'TRANSFERENCIA'>('BIOPAGO');
  const [avanceComisionPct, setAvanceComisionPct] = useState<number>(20);
  const [avanceComisionCustom, setAvanceComisionCustom] = useState<string>('20');
  const [isCustomComision, setIsCustomComision] = useState<boolean>(false);
  const [avanceObs, setAvanceObs] = useState<string>('');

  const bsSolicitadoNum = parseFloat(avanceBsSolicitado) || 0;
  const activeComisionPct = isCustomComision ? (parseFloat(avanceComisionCustom) || 0) : avanceComisionPct;
  const comisionMontoBs = bsSolicitadoNum * (activeComisionPct / 100);
  const totalBsACobrarDigital = bsSolicitadoNum + comisionMontoBs;
  const totalUsdCobrarDigital = defaultRate > 0 ? (totalBsACobrarDigital / defaultRate) : 0;
  const comisionMontoUsd = defaultRate > 0 ? (comisionMontoBs / defaultRate) : 0;

  // Estado para impresión / comprobante procesado
  const [lastProcessedTicket, setLastProcessedTicket] = useState<any | null>(null);

  const handleProcesarCompraDivisa = () => {
    if (divisaValNum <= 0) return;

    const opData = {
      tipo_operacion: 'COMPRA_DIVISA' as const,
      currency: compraCurrency,
      monto_divisa: divisaValNum,
      tasa_aplicada: effectiveCompraRate,
      es_tasa_manual: compraTasaMode === 'manual',
      monto_ves_entregado: totalBsEntregarCompra,
      observacion: compraObs.trim() || `Cambio de ${divisaValNum} ${compraCurrency} a tasa ${effectiveCompraRate.toFixed(2)}`
    };

    onProcessOperation(opData);
    setLastProcessedTicket({
      ...opData,
      nroTicket: `DIV-${Date.now().toString().slice(-6)}`,
      fecha: new Date().toLocaleString('es-VE'),
      usuario: currentUser.nombre || currentUser.usuario
    });
  };

  const handleProcesarVentaEfectivo = () => {
    if (bsSolicitadoNum <= 0) return;

    const opData = {
      tipo_operacion: 'VENTA_EFECTIVO' as const,
      currency: 'USD' as const,
      monto_divisa: defaultRate > 0 ? (bsSolicitadoNum / defaultRate) : 0,
      tasa_aplicada: defaultRate,
      es_tasa_manual: false,
      monto_ves_entregado: bsSolicitadoNum,
      metodo_cobro: avanceMetodoCobro,
      comision_pct: activeComisionPct,
      comision_monto_ves: comisionMontoBs,
      comision_monto_usd: comisionMontoUsd,
      monto_digital_cobrado_ves: totalBsACobrarDigital,
      monto_digital_cobrado_usd: totalUsdCobrarDigital,
      observacion: avanceObs.trim() || `Venta de Efectivo Bs ${bsSolicitadoNum} con ${activeComisionPct}% comision via ${avanceMetodoCobro}`
    };

    onProcessOperation(opData);
    setLastProcessedTicket({
      ...opData,
      nroTicket: `AVN-${Date.now().toString().slice(-6)}`,
      fecha: new Date().toLocaleString('es-VE'),
      usuario: currentUser.nombre || currentUser.usuario
    });
  };

  const handleImprimirComprobante = () => {
    if (!lastProcessedTicket) return;

    const printWin = window.open('', '_blank');
    if (!printWin) return;

    const companyName = companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.';
    const companyRif = companyConfig?.rif || 'J-41132631';
    const isCompra = lastProcessedTicket.tipo_operacion === 'COMPRA_DIVISA';

    printWin.document.write(`
      <html>
        <head>
          <title>Comprobante ${lastProcessedTicket.nroTicket}</title>
          <style>
            body { font-family: monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .border-b { border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px; }
            .line { border-top: 1px dashed #000; margin: 8px 0; }
            .big-val { font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="text-center font-bold">${companyName}</div>
          <div class="text-center">RIF: ${companyRif}</div>
          <div class="text-center font-bold border-b">
            ${isCompra ? 'COMPROBANTE DE CAMBIO DE DIVISA' : 'COMPROBANTE VENTA DE EFECTIVO'}
          </div>

          <div><b>NRO OPERACIÓN:</b> ${lastProcessedTicket.nroTicket}</div>
          <div><b>FECHA:</b> ${lastProcessedTicket.fecha}</div>
          <div><b>OPERADOR:</b> ${lastProcessedTicket.usuario}</div>

          <div class="line"></div>

          ${isCompra ? `
            <div><b>DIVISA RECIBIDA:</b> $${lastProcessedTicket.monto_divisa.toFixed(2)} ${lastProcessedTicket.currency}</div>
            <div><b>TASA APLICADA:</b> Bs ${lastProcessedTicket.tasa_aplicada.toFixed(2)}</div>
            <div class="line"></div>
            <div class="big-val text-right">ENTREGADO BS: ${lastProcessedTicket.monto_ves_entregado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
          ` : `
            <div><b>EFECTIVO ENTREGADO:</b> Bs ${lastProcessedTicket.monto_ves_entregado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
            <div><b>MEDIO COBRO DIGITAL:</b> ${lastProcessedTicket.metodo_cobro}</div>
            <div><b>COMISIÓN (${lastProcessedTicket.comision_pct}%):</b> Bs ${lastProcessedTicket.comision_monto_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
            <div class="line"></div>
            <div class="big-val text-right">TOTAL COBRADO: Bs ${lastProcessedTicket.monto_digital_cobrado_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
          `}

          <div class="line"></div>
          <div class="text-center" style="margin-top: 30px;">_______________________</div>
          <div class="text-center">FIRMA CLIENTE</div>
          <div class="text-center font-bold" style="margin-top: 15px;">*** GRACIAS POR SU PREFERENCIA ***</div>
        </body>
      </html>
    `);

    printWin.document.close();
    printWin.focus();
    printWin.print();
    printWin.close();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[90] animate-fade-in font-sans text-slate-800">
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden w-full max-w-xl shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* HEADER TOOLBAR */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/30 border border-indigo-400/40 rounded-xl">
              <RefreshCw className="w-5 h-5 text-indigo-300 animate-spin-slow" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-2">
                CAMBIO DE DIVISAS Y VENTA DE EFECTIVO
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h3>
              <p className="text-[11px] text-slate-300 font-medium">
                Conciliación automática en efectivo Bs, divisas y terminales digitales
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-bold text-lg p-1 rounded-lg hover:bg-slate-800 transition-all"
          >
            ✕
          </button>
        </div>

        {/* TABS SELECTION */}
        {!lastProcessedTicket && (
          <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1.5">
            <button
              onClick={() => setActiveTab('compra')}
              className={`flex-1 py-2.5 px-3 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                activeTab === 'compra'
                  ? 'bg-white text-indigo-950 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Coins className="w-4 h-4 text-emerald-600" />
              1. Compra / Cambio Divisas
            </button>

            <button
              onClick={() => setActiveTab('avance')}
              className={`flex-1 py-2.5 px-3 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                activeTab === 'avance'
                  ? 'bg-white text-indigo-950 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <CreditCard className="w-4 h-4 text-indigo-600" />
              2. Venta de Efectivo (Avance)
            </button>
          </div>
        )}

        {/* MODAL BODY CONTENT */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">

          {/* CASO A: SI YA SE PROCESÓ LA OPERACIÓN MOSTRAR COMPROBANTE EXITOSO */}
          {lastProcessedTicket ? (
            <div className="text-center space-y-5 animate-fade-in py-4">
              <div className="w-16 h-16 bg-emerald-100 border border-emerald-300 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h4 className="text-lg font-black text-slate-900 uppercase">OPERACIÓN PROCESADA CON ÉXITO</h4>
                <p className="text-xs text-slate-500 font-mono">Comprobante Nro: {lastProcessedTicket.nroTicket}</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs font-mono space-y-2 max-w-md mx-auto">
                <div className="flex justify-between border-b border-slate-200 pb-1">
                  <span className="text-slate-500">Tipo Operación:</span>
                  <span className="font-bold text-slate-900">{lastProcessedTicket.tipo_operacion}</span>
                </div>
                {lastProcessedTicket.tipo_operacion === 'COMPRA_DIVISA' ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Divisa Ingresada a Caja:</span>
                      <span className="font-extrabold text-emerald-700">${lastProcessedTicket.monto_divisa.toFixed(2)} {lastProcessedTicket.currency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tasa de Cambio Aplicada:</span>
                      <span className="font-bold text-slate-800">Bs {lastProcessedTicket.tasa_aplicada.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1 text-sm">
                      <span className="font-bold text-slate-700">Entregado en Bs Efectivo:</span>
                      <span className="font-black text-emerald-800">Bs {lastProcessedTicket.monto_ves_entregado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Efectivo Bs Entregado (Salida):</span>
                      <span className="font-extrabold text-amber-800">Bs {lastProcessedTicket.monto_ves_entregado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Medio Cobrado Digital:</span>
                      <span className="font-bold text-indigo-700">{lastProcessedTicket.metodo_cobro}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Comisión Ganada ({lastProcessedTicket.comision_pct}%):</span>
                      <span className="font-bold text-emerald-600">Bs {lastProcessedTicket.comision_monto_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1 text-sm">
                      <span className="font-bold text-slate-700">Total Cobrado en Punto:</span>
                      <span className="font-black text-indigo-900">Bs {lastProcessedTicket.monto_digital_cobrado_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleImprimirComprobante}
                  className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-extrabold text-xs uppercase flex items-center gap-2 hover:bg-slate-800 transition-all shadow-md"
                >
                  <Printer className="w-4 h-4 text-emerald-400" />
                  Imprimir Comprobante Ticket
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLastProcessedTicket(null);
                    onClose();
                  }}
                  className="px-5 py-2.5 bg-slate-100 border border-slate-300 text-slate-700 rounded-xl font-bold text-xs uppercase hover:bg-slate-200 transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* TAB 1: COMPRA / CAMBIO DE DIVISAS */}
              {activeTab === 'compra' && (
                <div className="space-y-5 animate-fade-in">
                  
                  {/* Selector de Moneda Divisa Recibida */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                      1. Selección de Moneda Recibida en Efectivo:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCompraCurrency('USD')}
                        className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-black text-xs uppercase transition-all ${
                          compraCurrency === 'USD'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        $ Dólar (USD)
                      </button>

                      <button
                        type="button"
                        onClick={() => setCompraCurrency('EUR')}
                        className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-black text-xs uppercase transition-all ${
                          compraCurrency === 'EUR'
                            ? 'bg-blue-50 border-blue-500 text-blue-900 ring-2 ring-blue-500/20'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-sm font-extrabold text-blue-600">€</span>
                        € Euro (EUR)
                      </button>
                    </div>
                  </div>

                  {/* Monto Recibido */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                        2. Monto Recibido en Divisa ({compraCurrency}):
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 font-bold text-slate-400 font-mono text-sm">
                          {compraCurrency === 'USD' ? '$' : '€'}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={compraMontoDivisa}
                          onChange={e => setCompraMontoDivisa(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base font-black font-mono text-slate-900 focus:bg-white focus:border-indigo-600 outline-none"
                        />
                      </div>
                    </div>

                    {/* Selector de Modo Tasa */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                        3. Tasa de Cambio Aplicada:
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setCompraTasaMode('oficial')}
                          className={`flex-1 py-2 px-2 rounded-lg text-[11px] font-extrabold uppercase border transition-all ${
                            compraTasaMode === 'oficial'
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-900'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          BCV Oficial (Bs {defaultRate.toFixed(2)})
                        </button>

                        <button
                          type="button"
                          onClick={() => setCompraTasaMode('manual')}
                          className={`flex-1 py-2 px-2 rounded-lg text-[11px] font-extrabold uppercase border transition-all ${
                            compraTasaMode === 'manual'
                              ? 'bg-amber-50 border-amber-500 text-amber-900'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          Tasa Manual
                        </button>
                      </div>

                      {compraTasaMode === 'manual' && (
                        <div className="mt-2 relative">
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400 font-mono">Bs</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Tasa acordada..."
                            value={compraTasaManual}
                            onChange={e => setCompraTasaManual(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-amber-50/50 border border-amber-300 rounded-lg font-mono text-xs font-extrabold text-amber-900 outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RESULTADO GIANT DISPLAY */}
                  <div className="bg-gradient-to-br from-emerald-900 via-teal-950 to-slate-900 text-white rounded-2xl p-5 shadow-lg space-y-2 border border-emerald-700/50">
                    <div className="flex justify-between items-center text-xs text-emerald-300 font-bold uppercase tracking-wider">
                      <span>Bolívares en Efectivo a Entregar al Cliente</span>
                      <span className="font-mono bg-emerald-800/60 px-2 py-0.5 rounded text-[10px]">Tasa: Bs {effectiveCompraRate.toFixed(2)}</span>
                    </div>

                    <div className="text-3xl sm:text-4xl font-black font-mono text-emerald-400 text-right">
                      Bs {totalBsEntregarCompra.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>

                  </div>

                  {/* Observación / Notas */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 block uppercase">Observaciones / Referencia (Opcional):</label>
                    <input
                      type="text"
                      placeholder="Ej. Billete $10 serie ABC..."
                      value={compraObs}
                      onChange={e => setCompraObs(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans outline-none focus:bg-white focus:border-indigo-500"
                    />
                  </div>

                  {/* Botón Procesar */}
                  <button
                    type="button"
                    onClick={handleProcesarCompraDivisa}
                    disabled={divisaValNum <= 0}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-extrabold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Procesar Cambio y Emitir Ticket
                  </button>

                </div>
              )}

              {/* TAB 2: VENTA DE EFECTIVO (AVANCE EN BS CON COMISIÓN) */}
              {activeTab === 'avance' && (
                <div className="space-y-5 animate-fade-in">
                  
                  {/* Monto en Bs Solicitado */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                      1. Monto en Efectivo Bs a Entregar al Cliente (Salida de Caja):
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 font-bold text-slate-400 font-mono text-sm">Bs</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="0.00"
                        value={avanceBsSolicitado}
                        onChange={e => setAvanceBsSolicitado(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-lg font-black font-mono text-slate-900 focus:bg-white focus:border-indigo-600 outline-none"
                      />
                    </div>
                  </div>

                  {/* Medio de Pago Digital Recibido */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                      2. Medio de Pago Digital Recibido del Cliente:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-sans">
                      {[
                        { id: 'BIOPAGO', label: 'Biopago', icon: CreditCard },
                        { id: 'PUNTO', label: 'Punto Venta', icon: CreditCard },
                        { id: 'PAGO_MOVIL', label: 'Pago Móvil', icon: Smartphone },
                        { id: 'TRANSFERENCIA', label: 'Transferencia', icon: RefreshCw }
                      ].map(m => {
                        const Icon = m.icon;
                        const isSelected = avanceMetodoCobro === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setAvanceMetodoCobro(m.id as any)}
                            className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 font-extrabold text-[11px] transition-all ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-950 ring-2 ring-indigo-500/20'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <Icon className={`w-4 h-4 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selección de Porcentaje de Comisión */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex justify-between items-center">
                      <span>3. Porcentaje de Comisión por Avance:</span>
                      <span className="font-mono text-indigo-700 font-extrabold">{activeComisionPct}% Comisión</span>
                    </label>

                    <div className="flex flex-wrap gap-2">
                      {[10, 15, 20, 25, 30].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            setAvanceComisionPct(pct);
                            setIsCustomComision(false);
                          }}
                          className={`px-3 py-2 rounded-lg font-black text-xs font-mono border transition-all ${
                            !isCustomComision && avanceComisionPct === pct
                              ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => setIsCustomComision(true)}
                        className={`px-3 py-2 rounded-lg font-bold text-xs border transition-all ${
                          isCustomComision
                            ? 'bg-indigo-600 text-white border-indigo-700'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        Personalizada %
                      </button>
                    </div>

                    {isCustomComision && (
                      <div className="mt-2 relative w-36">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="Ej. 18"
                          value={avanceComisionCustom}
                          onChange={e => setAvanceComisionCustom(e.target.value)}
                          className="w-full px-3 py-1.5 bg-indigo-50 border border-indigo-300 rounded-lg text-xs font-black font-mono text-indigo-900 outline-none"
                        />
                        <span className="absolute right-2.5 top-1.5 font-mono text-xs font-bold text-indigo-600">%</span>
                      </div>
                    )}
                  </div>

                  {/* DESGLOSE Y RESULTADO DE VENTA DE EFECTIVO */}
                  <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-lg space-y-3 border border-indigo-800/60">
                    <div className="flex justify-between items-center text-xs text-slate-300 font-bold uppercase tracking-wider">
                      <span>Total a Cobrar en Terminal ({avanceMetodoCobro})</span>
                      <span className="font-mono bg-amber-500 text-slate-950 px-2 py-0.5 rounded font-black text-[10px]">
                        +{activeComisionPct}% Comisión
                      </span>
                    </div>

                    <div className="text-3xl sm:text-4xl font-black font-mono text-indigo-300 text-right">
                      Bs {totalBsACobrarDigital.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-[11px] font-mono text-slate-300">
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase">Efectivo a Entregar:</span>
                        <b className="text-amber-300 font-bold">Bs {bsSolicitadoNum.toFixed(2)}</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase">Ganancia Comisión:</span>
                        <b className="text-emerald-400 font-bold">Bs {comisionMontoBs.toFixed(2)} (${comisionMontoUsd.toFixed(2)})</b>
                      </div>
                    </div>
                  </div>

                  {/* Observación / Notas */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 block uppercase">Observaciones / Nro Aprobación (Opcional):</label>
                    <input
                      type="text"
                      placeholder="Ej. Aprobación Biopago Nro #123456..."
                      value={avanceObs}
                      onChange={e => setAvanceObs(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans outline-none focus:bg-white focus:border-indigo-500"
                    />
                  </div>

                  {/* Botón Procesar Venta Efectivo */}
                  <button
                    type="button"
                    onClick={handleProcesarVentaEfectivo}
                    disabled={bsSolicitadoNum <= 0}
                    className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl font-extrabold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Procesar Venta de Efectivo y Emitir Ticket
                  </button>

                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
