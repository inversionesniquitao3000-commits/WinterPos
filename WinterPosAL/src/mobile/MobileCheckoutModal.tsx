import { useState, useMemo, useEffect } from 'react';
import { 
  X, Check, DollarSign, Smartphone, CreditCard, Banknote, Shield, 
  Wallet, AlertCircle, ArrowRight, User as UserIcon
} from 'lucide-react';
import { Payment, Client } from '../types';

interface MobileCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalUSD: number;
  tasaDia: number;
  tasaVuelto: number;
  client: Client;
  onConfirmSale: (pagos: Payment[], vueltoUSD: number, vueltoVES: number) => Promise<void>;
  isProcessing?: boolean;
}

export default function MobileCheckoutModal({
  isOpen,
  onClose,
  totalUSD,
  tasaDia,
  tasaVuelto,
  client,
  onConfirmSale,
  isProcessing = false
}: MobileCheckoutModalProps) {
  const activeTasaCobro = tasaDia > 0 ? tasaDia : 1;
  const activeTasaVuelto = tasaVuelto > 0 ? tasaVuelto : activeTasaCobro;
  const totalVES = totalUSD * activeTasaCobro;

  // Individual payment inputs
  const [cashUSD, setCashUSD] = useState<string>('');
  const [cashVES, setCashVES] = useState<string>('');
  const [pagoMovilVES, setPagoMovilVES] = useState<string>('');
  const [pagoMovilBank, setPagoMovilBank] = useState<string>('BANCO DE VENEZUELA');
  const [pagoMovilRef, setPagoMovilRef] = useState<string>('');
  
  const [debitoVES, setDebitoVES] = useState<string>('');
  const [debitoBank, setDebitoBank] = useState<string>('BANCO DE VENEZUELA');
  const [debitoRef, setDebitoRef] = useState<string>('');

  const [biopagoVES, setBiopagoVES] = useState<string>('');
  const [biopagoRef, setBiopagoRef] = useState<string>('');

  const [creditoUSD, setCreditoUSD] = useState<string>('');

  // Selected method tab for quick input
  const [activeMethod, setActiveMethod] = useState<'cashUSD' | 'cashVES' | 'pagoMovil' | 'debito' | 'biopago' | 'credito'>('cashUSD');

  // Change preference: 'USD' or 'VES'
  const [vueltoCurrency, setVueltoCurrency] = useState<'USD' | 'VES'>('USD');

  // Reset inputs when modal opens
  useEffect(() => {
    if (isOpen) {
      setCashUSD(totalUSD.toFixed(2));
      setCashVES('');
      setPagoMovilVES('');
      setPagoMovilRef('');
      setDebitoVES('');
      setDebitoRef('');
      setBiopagoVES('');
      setBiopagoRef('');
      setCreditoUSD('');
      setActiveMethod('cashUSD');
      setVueltoCurrency('USD');
    }
  }, [isOpen, totalUSD]);

  // Numerical values
  const valCashUSD = parseFloat(cashUSD) || 0;
  const valCashVES = parseFloat(cashVES) || 0;
  const valPagoMovilVES = parseFloat(pagoMovilVES) || 0;
  const valDebitoVES = parseFloat(debitoVES) || 0;
  const valBiopagoVES = parseFloat(biopagoVES) || 0;
  const valCreditoUSD = parseFloat(creditoUSD) || 0;

  // Total paid in USD
  const totalPaidUSD = useMemo(() => {
    const usdFromVes = (valCashVES + valPagoMovilVES + valDebitoVES + valBiopagoVES) / activeTasaCobro;
    return valCashUSD + valCreditoUSD + usdFromVes;
  }, [valCashUSD, valCashVES, valPagoMovilVES, valDebitoVES, valBiopagoVES, valCreditoUSD, activeTasaCobro]);

  const differenceUSD = totalPaidUSD - totalUSD;
  const isSettled = differenceUSD >= -0.009; // Allow 1 cent roundings
  const remainingUSD = Math.max(0, -differenceUSD);
  const remainingVES = remainingUSD * activeTasaCobro;
  
  const rawChangeUSD = Math.max(0, differenceUSD);
  const calculatedVueltoUSD = vueltoCurrency === 'USD' ? Math.round(rawChangeUSD * 100) / 100 : 0;
  const calculatedVueltoVES = vueltoCurrency === 'VES' ? Math.round(rawChangeUSD * activeTasaVuelto * 100) / 100 : 0;

  // Quick cash buttons
  const billDenominations = [1, 5, 10, 20, 50, 100];

  const handleExactCashUSD = () => {
    setCashUSD(totalUSD.toFixed(2));
    setCashVES('');
    setPagoMovilVES('');
    setDebitoVES('');
    setBiopagoVES('');
    setCreditoUSD('');
  };

  const handleExactCashVES = () => {
    setCashVES(totalVES.toFixed(2));
    setCashUSD('');
    setPagoMovilVES('');
    setDebitoVES('');
    setBiopagoVES('');
    setCreditoUSD('');
    setActiveMethod('cashVES');
  };

  const handleExactPagoMovil = () => {
    setPagoMovilVES(totalVES.toFixed(2));
    setCashUSD('');
    setCashVES('');
    setDebitoVES('');
    setBiopagoVES('');
    setCreditoUSD('');
    setActiveMethod('pagoMovil');
  };

  const handleExactDebito = () => {
    setDebitoVES(totalVES.toFixed(2));
    setCashUSD('');
    setCashVES('');
    setPagoMovilVES('');
    setBiopagoVES('');
    setCreditoUSD('');
    setActiveMethod('debito');
  };

  const handleCreditAll = () => {
    setCreditoUSD(totalUSD.toFixed(2));
    setCashUSD('');
    setCashVES('');
    setPagoMovilVES('');
    setDebitoVES('');
    setBiopagoVES('');
    setActiveMethod('credito');
  };

  const handleSubmit = async () => {
    if (!isSettled || isProcessing) return;

    const pagos: Payment[] = [];

    if (valCashUSD > 0) {
      pagos.push({
        metodo: 'Efectivo$',
        monto: valCashUSD,
        montoUSD: valCashUSD,
        montoVES: valCashUSD * activeTasaCobro
      });
    }

    if (valCashVES > 0) {
      const usdEquivalent = valCashVES / activeTasaCobro;
      pagos.push({
        metodo: 'EfectivoBs',
        monto: valCashVES,
        montoUSD: usdEquivalent,
        montoVES: valCashVES
      });
    }

    if (valPagoMovilVES > 0) {
      const usdEquivalent = valPagoMovilVES / activeTasaCobro;
      pagos.push({
        metodo: 'PagoMovil',
        monto: valPagoMovilVES,
        montoUSD: usdEquivalent,
        montoVES: valPagoMovilVES,
        bancoEmisor: pagoMovilBank,
        reference: pagoMovilRef || 'S/R'
      });
    }

    if (valDebitoVES > 0) {
      const usdEquivalent = valDebitoVES / activeTasaCobro;
      pagos.push({
        metodo: 'TarjetaBs',
        monto: valDebitoVES,
        montoUSD: usdEquivalent,
        montoVES: valDebitoVES,
        bancoEmisor: debitoBank,
        reference: debitoRef || 'S/R'
      });
    }

    if (valBiopagoVES > 0) {
      const usdEquivalent = valBiopagoVES / activeTasaCobro;
      pagos.push({
        metodo: 'Biopago',
        monto: valBiopagoVES,
        montoUSD: usdEquivalent,
        montoVES: valBiopagoVES,
        reference: biopagoRef || 'S/R'
      });
    }

    if (valCreditoUSD > 0) {
      pagos.push({
        metodo: 'CreditoCliente',
        monto: valCreditoUSD,
        montoUSD: valCreditoUSD,
        montoVES: valCreditoUSD * activeTasaCobro
      });
    }

    await onConfirmSale(pagos, calculatedVueltoUSD, calculatedVueltoVES);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col justify-end max-w-md mx-auto">
      <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
        
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <span>Cobrar Venta</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-300 font-bold">
                <UserIcon className="w-3 h-3 text-blue-400" />
                {client?.nombre || 'Consumidor Final'}
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-white font-mono tracking-tight">
                ${totalUSD.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                ({totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs)
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Quick Method Tabs */}
          <div className="grid grid-cols-3 gap-1.5 bg-slate-950/60 p-1 rounded-2xl border border-slate-800/80">
            <button
              onClick={() => setActiveMethod('cashUSD')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-bold transition ${
                activeMethod === 'cashUSD'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Efectivo $</span>
            </button>

            <button
              onClick={() => setActiveMethod('cashVES')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-bold transition ${
                activeMethod === 'cashVES'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>Efectivo Bs</span>
            </button>

            <button
              onClick={() => setActiveMethod('pagoMovil')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-bold transition ${
                activeMethod === 'pagoMovil'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Pago Móvil</span>
            </button>

            <button
              onClick={() => setActiveMethod('debito')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-bold transition ${
                activeMethod === 'debito'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Punto Débito</span>
            </button>

            <button
              onClick={() => setActiveMethod('biopago')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-bold transition ${
                activeMethod === 'biopago'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Biopago</span>
            </button>

            <button
              onClick={() => setActiveMethod('credito')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-bold transition ${
                activeMethod === 'credito'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>A Crédito</span>
            </button>
          </div>

          {/* Active Method Input Panel */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-3">
            
            {/* CASH USD */}
            {activeMethod === 'cashUSD' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    Monto Entregado en Efectivo USD ($)
                  </label>
                  <button
                    onClick={handleExactCashUSD}
                    className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-lg transition"
                  >
                    Exacto (${totalUSD.toFixed(2)})
                  </button>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-emerald-400 font-mono">$</span>
                  <input
                    type="number"
                    step="any"
                    value={cashUSD}
                    onChange={(e) => setCashUSD(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border-2 border-emerald-500/40 focus:border-emerald-400 rounded-xl pl-8 pr-4 py-2.5 text-2xl font-black text-white font-mono outline-none transition"
                  />
                </div>

                {/* Quick denomination chips */}
                <div className="flex flex-wrap gap-1.5">
                  {billDenominations.map((bill) => (
                    <button
                      key={bill}
                      type="button"
                      onClick={() => setCashUSD(bill.toString())}
                      className="flex-1 min-w-[50px] py-1.5 bg-slate-900 hover:bg-emerald-950 border border-slate-700 hover:border-emerald-500 rounded-xl text-xs font-black text-slate-200 hover:text-emerald-400 font-mono transition active:scale-95"
                    >
                      ${bill}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* CASH VES */}
            {activeMethod === 'cashVES' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-emerald-400" />
                    Monto Entregado en Efectivo Bs
                  </label>
                  <button
                    onClick={handleExactCashVES}
                    className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-lg transition"
                  >
                    Exacto ({totalVES.toFixed(2)} Bs)
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={cashVES}
                    onChange={(e) => setCashVES(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border-2 border-emerald-500/40 focus:border-emerald-400 rounded-xl px-4 py-2.5 text-2xl font-black text-white font-mono outline-none transition"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">Bs</span>
                </div>
              </div>
            )}

            {/* PAGO MOVIL */}
            {activeMethod === 'pagoMovil' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-blue-400" />
                    Monto Pago Móvil (Bs)
                  </label>
                  <button
                    onClick={handleExactPagoMovil}
                    className="text-[11px] font-bold text-blue-400 hover:text-blue-300 bg-blue-950/60 border border-blue-800/50 px-2 py-0.5 rounded-lg transition"
                  >
                    Exacto ({totalVES.toFixed(2)} Bs)
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={pagoMovilVES}
                    onChange={(e) => setPagoMovilVES(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border-2 border-blue-500/40 focus:border-blue-400 rounded-xl px-4 py-2.5 text-2xl font-black text-white font-mono outline-none transition"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">Bs</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Banco</label>
                    <select
                      value={pagoMovilBank}
                      onChange={(e) => setPagoMovilBank(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-200 outline-none"
                    >
                      <option value="BANCO DE VENEZUELA">Venezuela (0102)</option>
                      <option value="BANESCO">Banesco (0134)</option>
                      <option value="MERCANTIL">Mercantil (0105)</option>
                      <option value="BANCAMIGA">Bancamiga (0172)</option>
                      <option value="BBVA PROVINCIAL">Provincial (0108)</option>
                      <option value="BNC">BNC (0191)</option>
                      <option value="OTRO">Otro Banco</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Referencia</label>
                    <input
                      type="text"
                      value={pagoMovilRef}
                      onChange={(e) => setPagoMovilRef(e.target.value)}
                      placeholder="Últimos 4 o 6 dígitos"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* DEBITO */}
            {activeMethod === 'debito' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-blue-400" />
                    Punto de Venta / Débito (Bs)
                  </label>
                  <button
                    onClick={handleExactDebito}
                    className="text-[11px] font-bold text-blue-400 hover:text-blue-300 bg-blue-950/60 border border-blue-800/50 px-2 py-0.5 rounded-lg transition"
                  >
                    Exacto ({totalVES.toFixed(2)} Bs)
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={debitoVES}
                    onChange={(e) => setDebitoVES(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border-2 border-blue-500/40 focus:border-blue-400 rounded-xl px-4 py-2.5 text-2xl font-black text-white font-mono outline-none transition"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">Bs</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Banco / Lote</label>
                    <select
                      value={debitoBank}
                      onChange={(e) => setDebitoBank(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-200 outline-none"
                    >
                      <option value="BANCO DE VENEZUELA">Venezuela</option>
                      <option value="BANESCO">Banesco</option>
                      <option value="MERCANTIL">Mercantil</option>
                      <option value="BANCAMIGA">Bancamiga</option>
                      <option value="BNC">BNC</option>
                      <option value="PUNTO INALAMBRICO">Punto Inalámbrico</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Referencia / Aprobación</label>
                    <input
                      type="text"
                      value={debitoRef}
                      onChange={(e) => setDebitoRef(e.target.value)}
                      placeholder="Nro Aprobación"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* BIOPAGO */}
            {activeMethod === 'biopago' && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-purple-400" />
                  Monto Biopago BDV (Bs)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={biopagoVES}
                    onChange={(e) => setBiopagoVES(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border-2 border-purple-500/40 focus:border-purple-400 rounded-xl px-4 py-2.5 text-2xl font-black text-white font-mono outline-none transition"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">Bs</span>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Referencia Biopago</label>
                  <input
                    type="text"
                    value={biopagoRef}
                    onChange={(e) => setBiopagoRef(e.target.value)}
                    placeholder="Referencia de la transacción"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* CREDITO */}
            {activeMethod === 'credito' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-amber-400" />
                    Cargar a Cuenta por Cobrar (Crédito)
                  </label>
                  <button
                    onClick={handleCreditAll}
                    className="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 rounded-lg transition"
                  >
                    Todo a Crédito (${totalUSD.toFixed(2)})
                  </button>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-amber-400 font-mono">$</span>
                  <input
                    type="number"
                    step="any"
                    value={creditoUSD}
                    onChange={(e) => setCreditoUSD(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border-2 border-amber-500/40 focus:border-amber-400 rounded-xl pl-8 pr-4 py-2.5 text-2xl font-black text-white font-mono outline-none transition"
                  />
                </div>

                {client.cedula_rif === 'V-00000000' && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Se recomienda seleccionar un cliente con cédula/nombre registrado para asignar un crédito.</span>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Payment Breakdown & Status */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Total a Pagar:</span>
              <span className="font-bold text-white font-mono">${totalUSD.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Total Ingresado:</span>
              <span className={`font-bold font-mono ${totalPaidUSD >= totalUSD ? 'text-emerald-400' : 'text-slate-200'}`}>
                ${totalPaidUSD.toFixed(2)}
              </span>
            </div>

            {/* Pending or Change Row */}
            {!isSettled ? (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs text-rose-400 font-bold">
                <span className="flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Saldo Restante:
                </span>
                <span className="font-mono text-sm">
                  ${remainingUSD.toFixed(2)} ({remainingVES.toFixed(2)} Bs)
                </span>
              </div>
            ) : rawChangeUSD > 0.005 ? (
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                  <span>Vuelto / Cambio al Cliente:</span>
                  <span className="font-mono text-sm">
                    {vueltoCurrency === 'USD' 
                      ? `$${calculatedVueltoUSD.toFixed(2)} USD` 
                      : `${calculatedVueltoVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`}
                  </span>
                </div>

                {/* Vuelto Currency Switcher */}
                <div className="flex items-center justify-between bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 text-[11px]">
                  <span className="text-slate-400 font-medium pl-1">Entregar cambio en:</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setVueltoCurrency('USD')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${
                        vueltoCurrency === 'USD'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Dólares ($)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVueltoCurrency('VES')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${
                        vueltoCurrency === 'VES'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Bolívares (Bs)
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs text-emerald-400 font-bold">
                <span className="flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Pago Exacto Completado
                </span>
                <span className="font-mono">$0.00</span>
              </div>
            )}
          </div>

        </div>

        {/* Action Footer */}
        <div className="p-4 pb-8 bg-slate-950 border-t border-slate-800">
          <button
            onClick={handleSubmit}
            disabled={!isSettled || isProcessing}
            className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition active:scale-[0.98] ${
              isSettled && !isProcessing
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-900/40 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isProcessing ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : isSettled ? (
              <>
                <span>CONFIRMAR Y REGISTRAR VENTA</span>
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </>
            ) : (
              <span>FALTA POR PAGAR ${remainingUSD.toFixed(2)}</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
