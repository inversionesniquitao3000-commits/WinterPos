import { useState, useEffect, useMemo } from 'react';
import { DollarSign, Banknote, X, CheckCircle2, AlertCircle, User, CreditCard, Smartphone, Search, ArrowLeft, ChevronRight } from 'lucide-react';
import { getApiBaseUrl } from '../utils';

export interface MobileAbonoClient {
  id: number;
  nombre: string;
  cedula_rif: string;
  telefono?: string;
  saldoPendiente?: number;
  limite_credito?: number;
}

interface MobileAbonoModalProps {
  isOpen: boolean;
  onClose: () => void;
  client?: MobileAbonoClient | null;
  terminal?: string;
  usuarioNombre?: string;
  usuarioId?: number;
  tasaDia?: number;
  onSuccess: () => void;
}

export default function MobileAbonoModal({
  isOpen,
  onClose,
  client = null,
  terminal = 'CAJA_01',
  usuarioNombre = 'Anderson Laguna',
  usuarioId = 1,
  tasaDia = 1,
  onSuccess
}: MobileAbonoModalProps) {
  const activeTasa = tasaDia > 0 ? tasaDia : 1;
  const [selectedClient, setSelectedClient] = useState<MobileAbonoClient | null>(client || null);
  const [allClients, setAllClients] = useState<MobileAbonoClient[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterWithDebtOnly, setFilterWithDebtOnly] = useState(true);

  const [montoUSD, setMontoUSD] = useState<string>('');
  const [montoVES, setMontoVES] = useState<string>('');
  const [metodoPago, setMetodoPago] = useState<string>('Efectivo$');
  const [referencia, setReferencia] = useState<string>('');
  const [observacion, setObservacion] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch clients when opened without a pre-selected client
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSuccess(false);
      if (client) {
        setSelectedClient(client);
      } else {
        setSelectedClient(null);
        fetchClients();
      }
      setMontoUSD('');
      setMontoVES('');
      setReferencia('');
      setObservacion('');
      setMetodoPago('Efectivo$');
    }
  }, [isOpen, client]);

  const fetchClients = async () => {
    setIsLoadingClients(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/clientes`);
      if (res.ok) {
        const data = await res.json();
        const formatted: MobileAbonoClient[] = (Array.isArray(data) ? data : []).map((c: any) => ({
          id: c.id,
          nombre: c.nombre || 'Sin Nombre',
          cedula_rif: c.cedula_rif || '',
          telefono: c.telefono || '',
          saldoPendiente: parseFloat(c.saldoPendiente || c.saldo_deudor || c.deuda_total || 0),
          limite_credito: parseFloat(c.limite_credito || 0)
        }));
        setAllClients(formatted);
      }
    } catch (err) {
      console.error('Error fetching clients for abono:', err);
    } finally {
      setIsLoadingClients(false);
    }
  };

  const filteredClients = useMemo(() => {
    return allClients.filter(c => {
      const matchesSearch = 
        c.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.cedula_rif.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.telefono && c.telefono.includes(searchQuery));
      
      if (filterWithDebtOnly) {
        return matchesSearch && (c.saldoPendiente || 0) > 0.01;
      }
      return matchesSearch;
    }).sort((a, b) => (b.saldoPendiente || 0) - (a.saldoPendiente || 0));
  }, [allClients, searchQuery, filterWithDebtOnly]);

  if (!isOpen) return null;

  const totalDeudaUSD = selectedClient?.saldoPendiente || 0;
  const totalDeudaVES = totalDeudaUSD * activeTasa;

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

  const handleFillTotal = () => {
    if (totalDeudaUSD > 0) {
      setMontoUSD(totalDeudaUSD.toFixed(2));
      setMontoVES(totalDeudaVES.toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) {
      setError('Por favor selecciona un cliente para registrar el abono.');
      return;
    }

    setError(null);
    const valUsd = parseFloat(montoUSD) || 0;
    const valVes = parseFloat(montoVES) || 0;

    if (valUsd <= 0 && valVes <= 0) {
      setError('Por favor ingresa un monto válido a abonar.');
      return;
    }

    if (totalDeudaUSD > 0 && valUsd > totalDeudaUSD + 0.1) {
      setError(`El abono ($${valUsd.toFixed(2)}) no puede ser mayor que la deuda pendiente ($${totalDeudaUSD.toFixed(2)}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Registrar abono en cliente
      const res = await fetch(`${getApiBaseUrl()}/clientes/abono`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedClient.id,
          cliente_id: selectedClient.id,
          monto_usd: valUsd,
          monto_ves: valVes,
          metodo_pago: metodoPago,
          referencia: referencia.trim(),
          observacion: observacion.trim() || `Abono móvil en ${terminal}`,
          usuario_id: usuarioId || 1
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP ${res.status}`);
      }

      // 2. Si el pago fue en efectivo, reflejar la entrada física en la gaveta activa
      if (metodoPago === 'Efectivo$' || metodoPago === 'EfectivoBs') {
        await fetch(`${getApiBaseUrl()}/cajas/movimiento`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'Entrada',
            descripcion: `Abono Cliente: ${selectedClient.nombre} (${metodoPago})`,
            usd: metodoPago === 'Efectivo$' ? valUsd : 0,
            ves: metodoPago === 'EfectivoBs' ? valVes : 0,
            terminal: terminal,
            usuarioId: usuarioId || 1,
            usuarioNombre: usuarioNombre,
            metodo_pago: metodoPago
          })
        }).catch(err => console.warn('Advertencia al sincronizar entrada de caja por abono:', err));
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Error al registrar abono móvil:', err);
      setError(err.message || 'Error al procesar el abono.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col justify-end max-w-md mx-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
        
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Registrar Abono a Cuenta</h3>
              <p className="text-[11px] text-slate-400">
                {selectedClient ? `${selectedClient.nombre} (${selectedClient.cedula_rif})` : 'Selecciona un cliente deudor'}
              </p>
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 pb-8 space-y-4">

          {/* STEP 1: SELECT CLIENT (if not preselected) */}
          {!selectedClient ? (
            <div className="space-y-3">
              {/* Search and Filters */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar cliente por nombre o cédula..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none"
                />
              </div>

              {/* Debt Filter Pill */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFilterWithDebtOnly(true)}
                  className={`py-1 px-2.5 rounded-lg text-[10px] font-bold transition ${
                    filterWithDebtOnly
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Con Deuda Pendiente
                </button>
                <button
                  type="button"
                  onClick={() => setFilterWithDebtOnly(false)}
                  className={`py-1 px-2.5 rounded-lg text-[10px] font-bold transition ${
                    !filterWithDebtOnly
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Todos los Clientes
                </button>
              </div>

              {/* Clients List */}
              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
                {isLoadingClients ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Cargando clientes...
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No se encontraron clientes con el criterio especificado.
                  </div>
                ) : (
                  filteredClients.map((c) => {
                    const hasDebt = (c.saldoPendiente || 0) > 0.01;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedClient(c)}
                        className="w-full p-3 bg-slate-950 hover:bg-slate-800/90 border border-slate-800/90 rounded-xl text-left flex items-center justify-between gap-2 transition active:scale-[0.98]"
                      >
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-white truncate">{c.nombre}</h4>
                          <p className="text-[10px] text-slate-400">{c.cedula_rif}</p>
                        </div>
                        <div className="text-right shrink-0">
                          {hasDebt ? (
                            <div>
                              <span className="text-xs font-black text-amber-400 font-mono">
                                ${(c.saldoPendiente || 0).toFixed(2)}
                              </span>
                              <span className="text-[9px] text-amber-500/80 block uppercase font-bold">Saldo Deudor</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-md">
                              Al día
                            </span>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (

            /* STEP 2: PAYMENT FORM (Client Selected) */
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Back to Client Selection (if client was not fixed via props) */}
              {!client && (
                <button
                  type="button"
                  onClick={() => setSelectedClient(null)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 -mt-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Cambiar Cliente</span>
                </button>
              )}

              {/* Debt Status Card */}
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Saldo Deudor Actual</span>
                  <p className="text-2xl font-black text-white font-mono mt-0.5">
                    ${totalDeudaUSD.toFixed(2)} USD
                  </p>
                  <p className="text-xs text-amber-300 font-mono">
                    {totalDeudaVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                  </p>
                </div>

                {totalDeudaUSD > 0 && (
                  <button
                    type="button"
                    onClick={handleFillTotal}
                    className="py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow transition active:scale-95"
                  >
                    Liquidar Todo
                  </button>
                )}
              </div>

              {/* Amount Inputs */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    Monto del Abono en Dólares ($ USD)
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

              {/* Payment Method Selector */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Forma de Pago del Abono</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'Efectivo$', label: 'Efectivo ($)', icon: DollarSign },
                    { id: 'EfectivoBs', label: 'Efectivo (Bs)', icon: Banknote },
                    { id: 'PagoMovil', label: 'Pago Móvil (Bs)', icon: Smartphone },
                    { id: 'TarjetaBs', label: 'Tarjeta Débito (Bs)', icon: CreditCard },
                    { id: 'Transferencia', label: 'Transferencia', icon: CreditCard }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMetodoPago(m.id)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                        metodoPago === m.id
                          ? 'bg-blue-600 border-blue-500 text-white shadow'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <m.icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </button>
                  ))}
                </div>
                {(metodoPago === 'Efectivo$' || metodoPago === 'EfectivoBs') && (
                  <p className="text-[10px] text-emerald-400/90 mt-1.5 flex items-center gap-1 font-semibold">
                    <span>ℹ️ Este pago en efectivo sumará automáticamente al efectivo en gaveta de {terminal}.</span>
                  </p>
                )}
              </div>

              {/* Reference & Notes */}
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Número de Referencia (Opcional)</label>
                  <input
                    type="text"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    placeholder="Ej: 123456"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Notas / Observación</label>
                  <input
                    type="text"
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    placeholder="Ej: Pago parcial entregado en tienda"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
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
                  <span>¡Abono registrado con éxito!</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting || isSuccess}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-2 transition active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>CONFIRMAR ABONO DE ${(parseFloat(montoUSD) || 0).toFixed(2)}</span>
                  </>
                )}
              </button>
            </form>
          )}

        </div>

      </div>
    </div>
  );
}
