import { useState, useEffect, useMemo } from 'react';
import { RotateCcw, X, Search, CheckCircle2, AlertCircle, ArrowLeft, Package, User, DollarSign, Banknote, Calendar, ChevronRight, AlertTriangle } from 'lucide-react';
import { getApiBaseUrl } from '../utils';

interface SaleItem {
  product: {
    id?: number;
    barcode?: string;
    description?: string;
    precio_costo_usd?: number;
    stock?: number;
  };
  qty: number;
  precio_unitario_usd?: number;
  priceUSD?: number;
  total_fila_usd?: number;
}

interface ReturnItemState {
  item: SaleItem;
  barcode: string;
  description: string;
  priceUSD: number;
  originalQty: number;
  alreadyReturnedQty: number;
  remainingQty: number;
  returnQty: number;
  destination: 'disponible' | 'merma';
}

interface MobileDevolucionModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedSale?: any | null;
  terminal?: string;
  cajero?: string;
  usuarioId?: number;
  tasaDia?: number;
  onSuccess?: () => void;
}

export default function MobileDevolucionModal({
  isOpen,
  onClose,
  preSelectedSale = null,
  terminal = 'CAJA_01',
  cajero = 'Anderson Laguna',
  usuarioId = 1,
  tasaDia = 1,
  onSuccess
}: MobileDevolucionModalProps) {
  const activeTasa = tasaDia > 0 ? tasaDia : 1;

  const [selectedSale, setSelectedSale] = useState<any | null>(preSelectedSale || null);
  const [salesList, setSalesList] = useState<any[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([]);
  const [motivo, setMotivo] = useState('');
  const [refundMethod, setRefundMethod] = useState<'Efectivo$' | 'EfectivoBs' | 'CreditoCliente'>('Efectivo$');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presetsMotivo = [
    'Producto defectuoso / vencido',
    'Error en pedido o factura',
    'Cambio por otro producto',
    'Inconformidad del cliente',
    'Garantía de tienda'
  ];

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSuccess(false);
      setMotivo('');
      setRefundMethod('Efectivo$');

      if (preSelectedSale) {
        initSaleForReturn(preSelectedSale);
      } else {
        setSelectedSale(null);
        setReturnItems([]);
        fetchSales();
      }
    }
  }, [isOpen, preSelectedSale]);

  const fetchSales = async () => {
    setIsLoadingSales(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/sales`);
      if (res.ok) {
        const data = await res.json();
        const validSales = (Array.isArray(data) ? data : []).filter(
          (s: any) => s && s.factura_nro && !s.factura_nro.startsWith('DEV-')
        );
        setSalesList(validSales);
      }
    } catch (err) {
      console.error('Error fetching sales for return:', err);
    } finally {
      setIsLoadingSales(false);
    }
  };

  const initSaleForReturn = (sale: any) => {
    setSelectedSale(sale);
    const items: SaleItem[] = Array.isArray(sale.items) ? sale.items : [];
    
    // Check if some payments were in bolivares to suggest VES refund
    const paidInBs = Array.isArray(sale.pagos) && sale.pagos.some((p: any) => p.metodo !== 'Efectivo$' && p.metodo !== 'CreditoCliente');
    setRefundMethod(paidInBs ? 'EfectivoBs' : 'Efectivo$');

    const formatted: ReturnItemState[] = items.map(it => {
      const barcode = it.product?.barcode || (it as any).codigo || '';
      const description = it.product?.description || (it as any).descripcion || 'Producto';
      const price = parseFloat(String(it.precio_unitario_usd || it.priceUSD || (it as any).precio || 0));
      const qty = parseFloat(String(it.qty || (it as any).cantidad || 0));
      
      return {
        item: it,
        barcode,
        description,
        priceUSD: price,
        originalQty: qty,
        alreadyReturnedQty: 0,
        remainingQty: qty,
        returnQty: 0,
        destination: 'disponible'
      };
    });

    setReturnItems(formatted);
  };

  const filteredSales = useMemo(() => {
    return salesList.filter(s => {
      const term = searchQuery.toLowerCase();
      const fac = (s.factura_nro || '').toLowerCase();
      const clientName = (s.client?.nombre || s.clientName || '').toLowerCase();
      const clientDoc = (s.client?.cedula_rif || s.clientDoc || '').toLowerCase();
      return fac.includes(term) || clientName.includes(term) || clientDoc.includes(term);
    }).slice(0, 30);
  }, [salesList, searchQuery]);

  const totalRefundUSD = useMemo(() => {
    return returnItems.reduce((sum, i) => sum + (i.returnQty * i.priceUSD), 0);
  }, [returnItems]);

  const totalRefundVES = totalRefundUSD * activeTasa;

  const totalUnitsToReturn = useMemo(() => {
    return returnItems.reduce((sum, i) => sum + i.returnQty, 0);
  }, [returnItems]);

  const handleUpdateQty = (idx: number, delta: number) => {
    setReturnItems(prev => prev.map((item, i) => {
      if (i === idx) {
        const next = Math.max(0, Math.min(item.remainingQty, item.returnQty + delta));
        return { ...item, returnQty: next };
      }
      return item;
    }));
  };

  const handleToggleDestination = (idx: number) => {
    setReturnItems(prev => prev.map((item, i) => {
      if (i === idx) {
        return { ...item, destination: item.destination === 'disponible' ? 'merma' : 'disponible' };
      }
      return item;
    }));
  };

  const handleReturnAll = () => {
    setReturnItems(prev => prev.map(item => ({ ...item, returnQty: item.remainingQty })));
  };

  const handleExecuteDevolucion = async () => {
    if (!selectedSale) return;
    setError(null);

    const itemsToReturn = returnItems.filter(i => i.returnQty > 0);
    if (itemsToReturn.length === 0) {
      setError('Debes seleccionar al menos una unidad de algún producto para devolver.');
      return;
    }

    if (!motivo.trim()) {
      setError('Por favor indica el motivo de la devolución.');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const timeStr = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
      const devCode = `DEV-${(selectedSale.factura_nro || 'FAC').replace('FAC-', '')}-${Date.now().toString().slice(-4)}`;

      // 1. Registrar venta negativa / comprobante de devolución
      const devSalePayload = {
        factura_nro: devCode,
        factura_afectada: selectedSale.factura_nro,
        fecha: now.toISOString(),
        tipo_documento: 'DEVOLUCION',
        cliente_id: selectedSale.cliente_id || selectedSale.client?.id || 1,
        client: selectedSale.client || { nombre: 'Público General', cedula_rif: 'V-00000000' },
        totalUSD: -totalRefundUSD,
        totalVES: -totalRefundVES,
        tasa_bcv: activeTasa,
        con_ticket: true,
        items: itemsToReturn.map(it => ({
          product: {
            ...it.item.product,
            barcode: it.barcode,
            description: it.description
          },
          qty: -it.returnQty,
          precio_unitario_usd: it.priceUSD,
          priceUSD: it.priceUSD,
          total_fila_usd: -(it.returnQty * it.priceUSD),
          destino: it.destination
        })),
        pagos: [{
          metodo: refundMethod,
          monto: refundMethod === 'Efectivo$' ? -totalRefundUSD : -totalRefundVES,
          montoUSD: -totalRefundUSD
        }],
        detalles: {
          motivo: motivo.trim(),
          usuario: cajero,
          terminal: terminal,
          tiempo: timeStr
        }
      };

      const resSale = await fetch(`${getApiBaseUrl()}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(devSalePayload)
      });

      if (!resSale.ok) {
        const errData = await resSale.json().catch(() => ({}));
        throw new Error(errData.error || `Error al guardar comprobante de devolución (${resSale.status})`);
      }

      // 2. Si el reintegro es en efectivo ($ o Bs), registrar salida física en gaveta de caja
      if (refundMethod === 'Efectivo$' || refundMethod === 'EfectivoBs') {
        await fetch(`${getApiBaseUrl()}/cajas/movimiento`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'Devolucion',
            descripcion: `Devolución ${selectedSale.factura_nro} - Motivo: ${motivo.trim()}`,
            usd: refundMethod === 'Efectivo$' ? totalRefundUSD : 0,
            ves: refundMethod === 'EfectivoBs' ? totalRefundVES : 0,
            terminal: terminal,
            usuarioId: usuarioId || 1,
            usuarioNombre: cajero,
            metodo_pago: refundMethod
          })
        }).catch(err => console.warn('Advertencia al registrar movimiento de caja por devolución:', err));
      }

      // 3. Reincorporar stock de productos al inventario para ítems con destino 'disponible'
      for (const it of itemsToReturn) {
        if (it.destination === 'disponible' && it.item.product?.id) {
          try {
            await fetch(`${getApiBaseUrl()}/productos/stock`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: it.item.product.id,
                quantity: it.returnQty,
                type: 'Devolucion',
                motivo: `Devolución ${selectedSale.factura_nro}`
              })
            });
          } catch (stockErr) {
            console.warn('Advertencia al restaurar stock de producto:', stockErr);
          }
        }
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 1200);

    } catch (err: any) {
      console.error('Error al procesar devolución:', err);
      setError(err.message || 'Error al procesar la devolución.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col justify-end max-w-md mx-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
        
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Devolución y Reintegro</h3>
              <p className="text-[10px] text-slate-400">
                {selectedSale ? `${selectedSale.factura_nro} · ${selectedSale.client?.nombre || 'Cliente'}` : 'Selecciona una factura'}
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
          
          {/* STEP 1: SELECT SALE (if not chosen) */}
          {!selectedSale ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por N° factura (FAC-...) o cliente..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none"
                />
              </div>

              {/* Sales List */}
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                {isLoadingSales ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Cargando comprobantes recientes...
                  </div>
                ) : filteredSales.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No se encontraron comprobantes con el criterio de búsqueda.
                  </div>
                ) : (
                  filteredSales.map((s) => {
                    const totalUSD = parseFloat(String(s.totalUSD || s.total_usd || 0));
                    const totalVES = parseFloat(String(s.totalVES || s.total_ves || (totalUSD * activeTasa)));
                    const clientName = s.client?.nombre || s.clientName || 'Público General';
                    const itemsCount = Array.isArray(s.items) ? s.items.length : 0;
                    const dateStr = s.fecha ? s.fecha.substring(0, 16).replace('T', ' ') : '';

                    return (
                      <button
                        key={s.id || s.factura_nro}
                        type="button"
                        onClick={() => initSaleForReturn(s)}
                        className="w-full p-3 bg-slate-950 hover:bg-slate-800/90 border border-slate-800 rounded-xl text-left flex items-center justify-between gap-2 transition active:scale-[0.98]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-xs text-white">{s.factura_nro}</span>
                            <span className="text-[9px] text-slate-400 font-mono">{dateStr}</span>
                          </div>
                          <p className="text-[11px] text-slate-300 truncate font-semibold mt-0.5">{clientName}</p>
                          <p className="text-[10px] text-slate-400">{itemsCount} ítems comprados</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-emerald-400 font-mono block">
                            ${totalUSD.toFixed(2)}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono">
                            {totalVES.toLocaleString('es-VE', { minimumFractionDigits: 0 })} Bs
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (

            /* STEP 2: CONFIGURE ITEMS & REFUND */
            <div className="space-y-4">
              {/* Back to list button */}
              {!preSelectedSale && (
                <button
                  type="button"
                  onClick={() => setSelectedSale(null)}
                  className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 -mt-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Elegir otra Factura</span>
                </button>
              )}

              {/* Original Sale Header Card */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase block">Comprobante Original</span>
                  <span className="font-mono font-black text-white text-sm">{selectedSale.factura_nro}</span>
                  <span className="text-[10px] text-slate-400 block">{selectedSale.client?.nombre || 'Público General'}</span>
                </div>
                <button
                  type="button"
                  onClick={handleReturnAll}
                  className="py-1 px-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg text-[10px] font-bold transition active:scale-95"
                >
                  Devolver Todo
                </button>
              </div>

              {/* Items to Return Stepper */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">
                  Selecciona los productos y unidades a devolver:
                </label>

                <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                  {returnItems.map((item, idx) => {
                    const isSelected = item.returnQty > 0;
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-2xl border transition ${
                          isSelected
                            ? 'bg-amber-950/20 border-amber-500/40'
                            : 'bg-slate-950 border-slate-800/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-white truncate">{item.description}</h4>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              ${item.priceUSD.toFixed(2)} c/u · Comprado: {item.originalQty}
                            </p>
                          </div>

                          {/* Stepper (+ / -) */}
                          <div className="flex items-center gap-1.5 shrink-0 bg-slate-900 border border-slate-700/80 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(idx, -1)}
                              disabled={item.returnQty <= 0}
                              className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-black text-xs flex items-center justify-center disabled:opacity-30 active:scale-95"
                            >
                              -
                            </button>
                            <span className="w-7 text-center font-mono font-black text-xs text-white">
                              {item.returnQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(idx, 1)}
                              disabled={item.returnQty >= item.remainingQty}
                              className="w-6 h-6 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-black text-xs flex items-center justify-center disabled:opacity-30 active:scale-95"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Destination toggle when item selected */}
                        {isSelected && (
                          <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Destino físico:</span>
                            <button
                              type="button"
                              onClick={() => handleToggleDestination(idx)}
                              className={`py-0.5 px-2 rounded-md font-bold border transition ${
                                item.destination === 'disponible'
                                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                                  : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                              }`}
                            >
                              {item.destination === 'disponible' ? '📦 Retornar a Inventario' : '⚠️ Descartar como Merma'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Refund Banner */}
              <div className="bg-gradient-to-r from-amber-950/40 to-orange-950/40 border border-amber-500/40 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                    Total a Reintegrar ({totalUnitsToReturn} {totalUnitsToReturn === 1 ? 'unidad' : 'unidades'})
                  </span>
                  <p className="text-2xl font-black text-white font-mono mt-0.5">
                    ${totalRefundUSD.toFixed(2)} USD
                  </p>
                  <p className="text-xs text-amber-300 font-mono">
                    {totalRefundVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                  </p>
                </div>
              </div>

              {/* Method of Refund */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Forma de Reintegro al Cliente</label>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  {[
                    { id: 'Efectivo$', label: 'Efectivo ($)', icon: DollarSign },
                    { id: 'EfectivoBs', label: 'Efectivo (Bs)', icon: Banknote },
                    { id: 'CreditoCliente', label: 'Saldo a Favor', icon: User }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setRefundMethod(m.id as any)}
                      className={`py-2 px-1.5 rounded-xl border font-bold flex flex-col items-center justify-center gap-1 transition ${
                        refundMethod === m.id
                          ? 'bg-amber-600 border-amber-500 text-white shadow'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <m.icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </button>
                  ))}
                </div>
                {(refundMethod === 'Efectivo$' || refundMethod === 'EfectivoBs') && (
                  <p className="text-[10px] text-rose-400/90 mt-1.5 flex items-center gap-1 font-semibold">
                    <span>⚠️ Se registrará una salida física de gaveta en {terminal}.</span>
                  </p>
                )}
              </div>

              {/* Reason Input & Presets */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">Motivo de la Devolución</label>
                <input
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej: Producto en mal estado, error en despacho..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                />
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {presetsMotivo.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMotivo(preset)}
                      className="text-[9px] font-bold py-0.5 px-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
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
                  <span>¡Devolución registrada con éxito!</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="button"
                onClick={handleExecuteDevolucion}
                disabled={isSubmitting || isSuccess || totalRefundUSD <= 0}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 hover:from-amber-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-amber-900/40 flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-40"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>CONFIRMAR DEVOLUCIÓN (${totalRefundUSD.toFixed(2)})</span>
                  </>
                )}
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
