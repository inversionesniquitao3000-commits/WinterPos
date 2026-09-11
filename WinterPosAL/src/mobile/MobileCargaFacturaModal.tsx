import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileText, Search, Plus, X, Check, RefreshCw, AlertTriangle, 
  Trash2, Edit2, DollarSign, Calculator, Percent, Layers, 
  Calendar, Building2, Package, PauseCircle, PlayCircle, ArrowRight,
  Sparkles, CheckCircle2, ChevronDown
} from 'lucide-react';
import { getApiBaseUrl } from '../utils';

export interface InvoiceItemDraft {
  producto_id?: number;
  barcode: string;
  description: string;
  category: string;
  isNewProduct?: boolean;
  cantidad: number;
  costo_unitario_usd: number;
  costo_total_usd: number;
  precio_detalle_usd: number;
  precio_mayor_usd: number;
  margen_detalle_pct: number;
  margen_mayor_pct: number;
  costo_en_ves?: number;
}

interface ProveedorItem {
  id: number;
  rif: string;
  razon_social: string;
  telefono?: string;
  dias_credito?: number;
}

interface MobileCargaFacturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceProcessed: () => void;
  tasaDia: number;
  existingProducts: Array<{
    id: number;
    barcode: string;
    description: string;
    category: string;
    stock_actual: number;
    precio_costo_usd: number;
    precio_detalle_usd: number;
    precio_mayor_usd: number;
  }>;
  categories: string[];
}

const STORAGE_DRAFT_KEY = 'winterpos_mobile_factura_pausada';

const parseRateVal = (val: string | number | undefined): number => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (str.includes(',') && !str.includes('.')) {
    return parseFloat(str.replace(',', '.')) || 0;
  }
  if (str.includes('.') && str.includes(',')) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(str) || 0;
};

export default function MobileCargaFacturaModal({
  isOpen,
  onClose,
  onInvoiceProcessed,
  tasaDia,
  existingProducts,
  categories
}: MobileCargaFacturaModalProps) {
  if (!isOpen) return null;

  // Invoice Header states
  const [proveedores, setProveedores] = useState<ProveedorItem[]>([]);
  const [loadingProveedores, setLoadingProveedores] = useState(false);
  const [selectedProveedorId, setSelectedProveedorId] = useState<number | ''>('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [condicionPago, setCondicionPago] = useState<'Contado' | 'Credito'>('Contado');
  const [fechaEmision, setFechaEmision] = useState(() => new Date().toISOString().substring(0, 10));

  // Rates and selection mode ($ BCV, Euro BCV, Manual)
  const [tasaTipo, setTasaTipo] = useState<'USD_BCV' | 'EUR_BCV' | 'MANUAL'>('USD_BCV');
  const [tasaFactura, setTasaFactura] = useState<string>(String(tasaDia || 79.5));
  const [bcvRates, setBcvRates] = useState<{
    usd: number;
    eur: number;
    fechaValor?: string;
  } | null>(null);
  const [loadingBcv, setLoadingBcv] = useState(false);
  const [observaciones, setObservaciones] = useState('');

  // Items in current invoice
  const [items, setItems] = useState<InvoiceItemDraft[]>([]);

  // Paused Draft notification
  const [hasPausedDraft, setHasPausedDraft] = useState(false);

  // Quick Product Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Assistant / Item Builder state (Step to configure product before adding)
  const [activeBuilderProduct, setActiveBuilderProduct] = useState<{
    id?: number;
    barcode: string;
    description: string;
    category: string;
    isNewProduct?: boolean;
    stock_actual?: number;
  } | null>(null);

  // Price Calculator Assistant states
  const [builderQty, setBuilderQty] = useState<string>('1');
  const [builderCurrency, setBuilderCurrency] = useState<'USD' | 'VES'>('USD');
  const [builderCostoInput, setBuilderCostoInput] = useState<string>('0');
  const [builderIsPack, setBuilderIsPack] = useState(false);
  const [builderPackUnits, setBuilderPackUnits] = useState<string>('12');
  const [builderMargenDetalle, setBuilderMargenDetalle] = useState<string>('30');
  const [builderMargenMayor, setBuilderMargenMayor] = useState<string>('15');
  const [builderPrecioDetalleUSD, setBuilderPrecioDetalleUSD] = useState<string>('0');
  const [builderPrecioMayorUSD, setBuilderPrecioMayorUSD] = useState<string>('0');

  // New Provider Quick Modal
  const [showNewProvModal, setShowNewProvModal] = useState(false);
  const [newProvRif, setNewProvRif] = useState('');
  const [newProvRazon, setNewProvRazon] = useState('');
  const [savingNewProv, setSavingNewProv] = useState(false);

  // Submitting status
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load proveedores, rates & check paused draft on open
  useEffect(() => {
    fetchProveedores();
    checkPausedDraft();
    fetchBcvRates();
  }, [isOpen]);

  const fetchBcvRates = async () => {
    setLoadingBcv(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/bcv`);
      if (res.ok) {
        const data = await res.json();
        const parsedUsd = parseRateVal(data.usd) || tasaDia || 79.5;
        const parsedEur = parseRateVal(data.eur) || (parsedUsd * 1.16);
        setBcvRates({
          usd: parsedUsd,
          eur: parsedEur,
          fechaValor: data.fechaValor || ''
        });

        // If in auto mode, update current invoice rate
        setTasaTipo(prev => {
          if (prev === 'USD_BCV') {
            setTasaFactura(parsedUsd.toFixed(2));
          } else if (prev === 'EUR_BCV') {
            setTasaFactura(parsedEur.toFixed(2));
          }
          return prev;
        });
      }
    } catch (err) {
      console.warn('Error al consultar tasas BCV:', err);
    } finally {
      setLoadingBcv(false);
    }
  };

  const handleSelectRateTipo = (tipo: 'USD_BCV' | 'EUR_BCV' | 'MANUAL') => {
    setTasaTipo(tipo);
    if (tipo === 'USD_BCV') {
      const r = bcvRates?.usd || tasaDia || 79.5;
      setTasaFactura(r.toFixed(2));
    } else if (tipo === 'EUR_BCV') {
      const r = bcvRates?.eur || (bcvRates?.usd ? bcvRates.usd * 1.16 : 92.2);
      setTasaFactura(r.toFixed(2));
    }
  };

  const handleTasaInputChange = (val: string) => {
    setTasaFactura(val);
    if (tasaTipo !== 'MANUAL') {
      const num = parseFloat(val);
      const isUsd = bcvRates?.usd && Math.abs(num - bcvRates.usd) < 0.001;
      const isEur = bcvRates?.eur && Math.abs(num - bcvRates.eur) < 0.001;
      if (!isUsd && !isEur) {
        setTasaTipo('MANUAL');
      }
    }
  };

  const fetchProveedores = async () => {
    setLoadingProveedores(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/proveedores`);
      if (res.ok) {
        const list = await res.json();
        setProveedores(Array.isArray(list) ? list : []);
        if (list.length > 0 && !selectedProveedorId) {
          setSelectedProveedorId(list[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching proveedores:', err);
    } finally {
      setLoadingProveedores(false);
    }
  };

  const checkPausedDraft = () => {
    try {
      const saved = localStorage.getItem(STORAGE_DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          setHasPausedDraft(true);
        }
      }
    } catch (_) {}
  };

  const handleResumeDraft = () => {
    try {
      const saved = localStorage.getItem(STORAGE_DRAFT_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        setSelectedProveedorId(d.proveedor_id || '');
        setNumeroFactura(d.numero_factura || '');
        setCondicionPago(d.condicion_pago || 'Contado');
        setFechaEmision(d.fecha_emision || new Date().toISOString().substring(0, 10));
        if (d.tasa_tipo) setTasaTipo(d.tasa_tipo);
        if (d.tasa_factura) setTasaFactura(String(d.tasa_factura));
        setObservaciones(d.observaciones || '');
        setItems(d.items || []);
        setHasPausedDraft(false);
        setSuccessMsg('Factura pausada reanudada con éxito');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('Error reanudando factura pausada:', err);
    }
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem(STORAGE_DRAFT_KEY);
    setHasPausedDraft(false);
  };

  // Pause current invoice
  const handlePausarFactura = () => {
    if (items.length === 0 && !numeroFactura) {
      onClose();
      return;
    }
    const draft = {
      proveedor_id: selectedProveedorId,
      numero_factura: numeroFactura.trim(),
      condicion_pago: condicionPago,
      fecha_emision: fechaEmision,
      tasa_tipo: tasaTipo,
      tasa_factura: parseFloat(tasaFactura) || tasaDia,
      observaciones,
      items,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_DRAFT_KEY, JSON.stringify(draft));
    onClose();
  };

  // Quick search matching products (up to 6)
  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];
    return existingProducts
      .filter(p => 
        (p.description || '').toLowerCase().includes(q) || 
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [searchQuery, existingProducts]);

  // Start Assistant with an existing product
  const handleSelectExistingProduct = (prod: any) => {
    setActiveBuilderProduct({
      id: prod.id,
      barcode: prod.barcode,
      description: prod.description,
      category: prod.category || 'GENERAL',
      isNewProduct: false,
      stock_actual: prod.stock_actual
    });
    setSearchQuery('');
    // Prefill assistant with current cost & prices
    const cost = parseFloat(String(prod.precio_costo_usd || 0));
    setBuilderCurrency('USD');
    setBuilderCostoInput(cost > 0 ? cost.toFixed(2) : '0');
    setBuilderQty('1');
    setBuilderIsPack(false);
    setBuilderPackUnits('12');

    const margenDet = 30;
    setBuilderMargenDetalle(String(margenDet));
    setBuilderMargenMayor('15');

    const detPrice = parseFloat(String(prod.precio_detalle_usd || 0));
    const mayorPrice = parseFloat(String(prod.precio_mayor_usd || 0));
    setBuilderPrecioDetalleUSD(detPrice > 0 ? detPrice.toFixed(2) : (cost * 1.3).toFixed(2));
    setBuilderPrecioMayorUSD(mayorPrice > 0 ? mayorPrice.toFixed(2) : (cost * 1.15).toFixed(2));
  };

  // Start Assistant with a NEW product (not in DB)
  const handleStartNewProduct = () => {
    const autoCode = `770${Math.floor(100000 + Math.random() * 900000)}`;
    setActiveBuilderProduct({
      barcode: searchQuery.trim() || autoCode,
      description: '',
      category: categories[0] || 'GENERAL',
      isNewProduct: true,
      stock_actual: 0
    });
    setSearchQuery('');
    setBuilderCurrency('USD');
    setBuilderCostoInput('0');
    setBuilderQty('1');
    setBuilderIsPack(false);
    setBuilderPackUnits('12');
    setBuilderMargenDetalle('30');
    setBuilderMargenMayor('15');
    setBuilderPrecioDetalleUSD('0');
    setBuilderPrecioMayorUSD('0');
  };

  // Recalculate price in Assistant
  const effectiveUnitCostUSD = useMemo(() => {
    let raw = parseFloat(builderCostoInput) || 0;
    const rate = parseFloat(tasaFactura) || tasaDia || 1;
    if (builderCurrency === 'VES') {
      raw = raw > 0 && rate > 0 ? raw / rate : 0;
    }
    if (builderIsPack) {
      const units = parseInt(builderPackUnits, 10) || 1;
      raw = units > 0 ? raw / units : raw;
    }
    return Math.round(raw * 1000) / 1000;
  }, [builderCostoInput, builderCurrency, builderIsPack, builderPackUnits, tasaFactura, tasaDia]);

  // Handle cost or margin change in Assistant
  const handleCostOrMarginChange = (newCostStr?: string, newMarginDetStr?: string) => {
    const cost = newCostStr !== undefined ? parseFloat(newCostStr) || 0 : effectiveUnitCostUSD;
    const mDet = newMarginDetStr !== undefined ? parseFloat(newMarginDetStr) || 0 : (parseFloat(builderMargenDetalle) || 0);

    if (cost > 0) {
      const pDet = cost * (1 + mDet / 100);
      setBuilderPrecioDetalleUSD(pDet.toFixed(2));
      const pMay = cost * (1 + (parseFloat(builderMargenMayor) || 15) / 100);
      setBuilderPrecioMayorUSD(pMay.toFixed(2));
    }
  };

  // Confirm and add item to invoice
  const handleAddItemToInvoice = () => {
    if (!activeBuilderProduct) return;
    setErrorMsg('');

    if (!activeBuilderProduct.description.trim()) {
      setErrorMsg('Debes ingresar la descripción o nombre del producto');
      return;
    }

    const qty = parseFloat(builderQty) || 0;
    if (qty <= 0) {
      setErrorMsg('La cantidad a ingresar debe ser mayor a cero');
      return;
    }

    const unitCostUSD = effectiveUnitCostUSD;
    const precioDetalle = parseFloat(builderPrecioDetalleUSD) || 0;
    const precioMayor = parseFloat(builderPrecioMayorUSD) || 0;

    const newItem: InvoiceItemDraft = {
      producto_id: activeBuilderProduct.id,
      barcode: activeBuilderProduct.barcode.trim(),
      description: activeBuilderProduct.description.trim().toUpperCase(),
      category: activeBuilderProduct.category || 'GENERAL',
      isNewProduct: !!activeBuilderProduct.isNewProduct,
      cantidad: qty,
      costo_unitario_usd: unitCostUSD,
      costo_total_usd: Math.round(qty * unitCostUSD * 100) / 100,
      precio_detalle_usd: precioDetalle,
      precio_mayor_usd: precioMayor,
      margen_detalle_pct: parseFloat(builderMargenDetalle) || 0,
      margen_mayor_pct: parseFloat(builderMargenMayor) || 0
    };

    // Check if already in current invoice items list -> update
    setItems(prev => {
      const idx = prev.findIndex(item => 
        (item.producto_id && item.producto_id === newItem.producto_id) || 
        (item.barcode && item.barcode.toUpperCase() === newItem.barcode.toUpperCase())
      );
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = newItem;
        return updated;
      }
      return [newItem, ...prev];
    });

    setActiveBuilderProduct(null);
  };

  // Remove item from invoice
  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Save New Provider inline
  const handleCreateNewProvider = async () => {
    if (!newProvRif.trim() || !newProvRazon.trim()) {
      setErrorMsg('Ingresa RIF y Razón Social del nuevo proveedor');
      return;
    }
    setSavingNewProv(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/proveedores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rif: newProvRif.trim().toUpperCase(),
          razon_social: newProvRazon.trim().toUpperCase(),
          estado: 'Activo'
        })
      });
      if (!res.ok) throw new Error('Error al registrar nuevo proveedor');
      const saved = await res.json();
      setProveedores(prev => [saved, ...prev]);
      setSelectedProveedorId(saved.id);
      setShowNewProvModal(false);
      setNewProvRif('');
      setNewProvRazon('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando proveedor');
    } finally {
      setSavingNewProv(false);
    }
  };

  // Compute Invoice Totals
  const totalFacturaUSD = useMemo(() => {
    return items.reduce((acc, it) => acc + (it.costo_total_usd || 0), 0);
  }, [items]);

  const effectiveRateNum = parseFloat(tasaFactura) || tasaDia || 1;
  const totalFacturaVES = totalFacturaUSD * effectiveRateNum;

  // Process & Submit Invoice to Backend
  const handleProcessInvoice = async () => {
    setErrorMsg('');

    if (!selectedProveedorId) {
      setErrorMsg('Debes seleccionar el Proveedor de la factura');
      return;
    }

    if (!numeroFactura.trim()) {
      setErrorMsg('Debes ingresar el Número de Factura o Control');
      return;
    }

    if (items.length === 0) {
      setErrorMsg('La factura debe tener al menos un producto cargado');
      return;
    }

    setIsProcessing(true);
    try {
      // 1. If there are new products not in DB, create them first
      for (const item of items) {
        if (item.isNewProduct && !item.producto_id) {
          const resProd = await fetch(`${getApiBaseUrl()}/productos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              barcode: item.barcode,
              description: item.description,
              category: item.category,
              stock_actual: 0, // will be incremented by purchase
              stock_minimo: 5,
              precio_costo_usd: item.costo_unitario_usd,
              precio_detalle_usd: item.precio_detalle_usd,
              precio_mayor_usd: item.precio_mayor_usd,
              estado: 'Activo'
            })
          });
          if (resProd.ok) {
            const savedP = await resProd.json();
            item.producto_id = savedP.id;
          }
        }
      }

      // 2. Prepare payload for /api/compras
      const payload = {
        numero_factura: numeroFactura.trim().toUpperCase(),
        proveedor_id: Number(selectedProveedorId),
        usuario_id: 1, // Admin / default mobile operator
        fecha_emision: fechaEmision,
        condicion_pago: condicionPago,
        subtotal_usd: totalFacturaUSD,
        total_usd: totalFacturaUSD,
        total_ves: totalFacturaVES,
        tasa_cambio: effectiveRateNum,
        observaciones: observaciones.trim(),
        items: items.map(it => ({
          producto_id: it.producto_id,
          cantidad: it.cantidad,
          costo_unitario_usd: it.costo_unitario_usd,
          precio_detalle_usd: it.precio_detalle_usd,
          precio_mayor_usd: it.precio_mayor_usd,
          total_usd: it.costo_total_usd
        }))
      };

      const res = await fetch(`${getApiBaseUrl()}/compras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Error al registrar la compra en el servidor');
      }

      // Clear paused draft
      localStorage.removeItem(STORAGE_DRAFT_KEY);

      onInvoiceProcessed();
      onClose();
    } catch (err: any) {
      console.error('Error procesando factura de compra:', err);
      setErrorMsg(err.message || 'No se pudo procesar la factura');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-3 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[94dvh] flex flex-col shadow-2xl overflow-hidden pb-1 sm:pb-0">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white leading-tight">
                Carga de Mercancía por Factura
              </h2>
              <p className="text-[10px] text-slate-400">
                Recepción de compras y ajuste de costos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Pause Button */}
            <button
              type="button"
              onClick={handlePausarFactura}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center gap-1 transition active:scale-95"
              title="Pausar factura para continuar más tarde"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              <span>Pausar</span>
            </button>

            <button
              type="button"
              onClick={handlePausarFactura}
              className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 overscroll-contain">
          {/* Paused Draft Alert Banner */}
          {hasPausedDraft && (
            <div className="p-3 bg-amber-950/70 border border-amber-600/70 rounded-2xl flex items-center justify-between gap-2 text-xs text-amber-200 animate-fade-in">
              <div className="flex items-center gap-2">
                <PauseCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="font-bold">Factura Pausada Detectada</p>
                  <p className="text-[10px] opacity-80">Tienes un borrador previo sin procesar.</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="px-2 py-1 rounded-lg bg-slate-800 text-slate-400 text-[10px] font-bold"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={handleResumeDraft}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black shadow"
                >
                  Reanudar
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* 1. DATOS DE LA FACTURA DE COMPRA (CABECERA) */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-3">
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-wider flex items-center justify-between">
              <span>1. Cabecera de la Factura</span>
              <span className="text-[10px] text-blue-400 font-bold">
                Tasa: {effectiveRateNum.toFixed(2)} Bs ({tasaTipo === 'EUR_BCV' ? '€ BCV' : tasaTipo === 'USD_BCV' ? '$ BCV' : 'Manual'})
              </span>
            </h3>

            {/* Provider Selector & New Button */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-300">Proveedor *</label>
                <button
                  type="button"
                  onClick={() => setShowNewProvModal(true)}
                  className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Nuevo Proveedor</span>
                </button>
              </div>

              <select
                value={selectedProveedorId}
                onChange={(e) => setSelectedProveedorId(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition"
              >
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.razon_social} ({p.rif})
                  </option>
                ))}
              </select>
            </div>

            {/* Invoice Number & Date */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Nro. Factura / Control *</label>
                <input
                  type="text"
                  value={numeroFactura}
                  onChange={(e) => setNumeroFactura(e.target.value)}
                  placeholder="Ej. FAC-009412"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-mono uppercase focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Fecha Emisión</label>
                <input
                  type="date"
                  value={fechaEmision}
                  onChange={(e) => setFechaEmision(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            {/* Condición de Pago */}
            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">Condición de Pago</label>
              <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setCondicionPago('Contado')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition ${
                    condicionPago === 'Contado' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'
                  }`}
                >
                  Contado
                </button>
                <button
                  type="button"
                  onClick={() => setCondicionPago('Credito')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition ${
                    condicionPago === 'Credito' ? 'bg-amber-600 text-white shadow' : 'text-slate-400'
                  }`}
                >
                  Crédito
                </button>
              </div>
            </div>

            {/* SELECCIÓN DE TASA DE CAMBIO ($ BCV, EURO BCV, MANUAL) */}
            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-black text-slate-200 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tasa de la Factura (Bs por Divisa)</span>
                </label>
                <button
                  type="button"
                  onClick={fetchBcvRates}
                  disabled={loadingBcv}
                  className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 active:scale-95 transition"
                  title="Sincronizar tasas con el servidor BCV"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingBcv ? 'animate-spin text-blue-400' : ''}`} />
                  <span>Sincronizar BCV</span>
                </button>
              </div>

              {/* 3 Opciones Segmentadas: $ BCV, Euro BCV, Manual */}
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                {/* 1. $ BCV */}
                <button
                  type="button"
                  onClick={() => handleSelectRateTipo('USD_BCV')}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center justify-center transition active:scale-95 ${
                    tasaTipo === 'USD_BCV'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/60 font-black'
                      : 'bg-transparent text-slate-400 hover:text-white font-medium'
                  }`}
                >
                  <span className="text-[11px] flex items-center gap-0.5">
                    <span>💵 $ BCV</span>
                  </span>
                  <span className="text-[10px] font-mono opacity-90">
                    {bcvRates?.usd ? `${bcvRates.usd.toFixed(2)}` : `${tasaDia.toFixed(2)}`} Bs
                  </span>
                </button>

                {/* 2. EURO BCV */}
                <button
                  type="button"
                  onClick={() => handleSelectRateTipo('EUR_BCV')}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center justify-center transition active:scale-95 ${
                    tasaTipo === 'EUR_BCV'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-950/60 font-black'
                      : 'bg-transparent text-slate-400 hover:text-white font-medium'
                  }`}
                >
                  <span className="text-[11px] flex items-center gap-0.5">
                    <span>💶 Euro BCV</span>
                  </span>
                  <span className="text-[10px] font-mono opacity-90">
                    {bcvRates?.eur ? `${bcvRates.eur.toFixed(2)}` : `${(tasaDia * 1.16).toFixed(2)}`} Bs
                  </span>
                </button>

                {/* 3. MANUAL */}
                <button
                  type="button"
                  onClick={() => handleSelectRateTipo('MANUAL')}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center justify-center transition active:scale-95 ${
                    tasaTipo === 'MANUAL'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-950/60 font-black'
                      : 'bg-transparent text-slate-400 hover:text-white font-medium'
                  }`}
                >
                  <span className="text-[11px] flex items-center gap-0.5">
                    <span>✏️ Manual</span>
                  </span>
                  <span className="text-[10px] opacity-85">Personalizada</span>
                </button>
              </div>

              {/* Input Numérico de Tasa e Indicador de Modo */}
              <div className="flex items-center gap-2 pt-0.5">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                    Bs.
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={tasaFactura}
                    onChange={(e) => handleTasaInputChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono font-black text-white focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div className="text-[10px] font-bold flex-shrink-0">
                  {tasaTipo === 'USD_BCV' && (
                    <span className="px-2 py-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-lg flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Oficial $ BCV</span>
                    </span>
                  )}
                  {tasaTipo === 'EUR_BCV' && (
                    <span className="px-2 py-1.5 bg-blue-500/15 border border-blue-500/30 text-blue-300 rounded-lg flex items-center gap-1">
                      <Check className="w-3 h-3 text-blue-400" />
                      <span>Oficial € BCV</span>
                    </span>
                  )}
                  {tasaTipo === 'MANUAL' && (
                    <span className="px-2 py-1.5 bg-purple-500/15 border border-purple-500/30 text-purple-300 rounded-lg flex items-center gap-1">
                      <span>✏️ Manual</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. BUSCADOR RÁPIDO & CREACIÓN DE PRODUCTOS */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-wider flex items-center justify-between">
              <span>2. Agregar Productos a la Factura</span>
              <span className="text-[10px] text-emerald-400 font-bold">{items.length} cargados</span>
            </h3>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, código de barras..."
                className="w-full pl-9 pr-8 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Matching Product Suggestions dropdown */}
            {searchQuery && (
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-1.5 space-y-1 shadow-xl max-h-56 overflow-y-auto">
                {searchResults.map(p => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectExistingProduct(p)}
                    className="p-2 hover:bg-slate-800 rounded-lg cursor-pointer flex items-center justify-between transition"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-xs font-bold text-white truncate">{p.description}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {p.barcode || 'S/C'} · Stock actual: {p.stock_actual} uds
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 font-mono">
                      <span className="text-xs font-bold text-emerald-400">${(p.precio_costo_usd || 0).toFixed(2)}</span>
                      <span className="text-[9px] text-slate-500 block">Costo</span>
                    </div>
                  </div>
                ))}

                {/* Option to create brand new product */}
                <div
                  onClick={handleStartNewProduct}
                  className="p-2.5 bg-blue-950/50 hover:bg-blue-900/50 border border-blue-800/60 rounded-xl cursor-pointer flex items-center gap-2 text-blue-300 font-bold text-xs transition"
                >
                  <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="leading-tight">+ Crear y agregar nuevo producto a la factura</p>
                    <p className="text-[10px] text-blue-400/80 font-normal">"{searchQuery}" no existe en inventario</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. AYUDANTE DE CÁLCULO DE PRECIOS & PRODUCT BUILDER (DRAWER / POPUP) */}
          {activeBuilderProduct && (
            <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border-2 border-blue-500/70 rounded-2xl p-4 space-y-3.5 shadow-2xl animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/40 flex items-center justify-center">
                    <Calculator className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white leading-tight">
                      Ayudante de Cálculo de Precios
                    </h4>
                    <p className="text-[10px] text-blue-300">
                      {activeBuilderProduct.isNewProduct ? '✨ Producto Nuevo' : 'Producto Existente'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveBuilderProduct(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Product Basic Info (Editable if new) */}
              {activeBuilderProduct.isNewProduct ? (
                <div className="space-y-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-0.5">Nombre / Descripción *</label>
                    <input
                      type="text"
                      value={activeBuilderProduct.description}
                      onChange={(e) => setActiveBuilderProduct({ ...activeBuilderProduct, description: e.target.value })}
                      placeholder="Ej. GALLETAS OREO 108G"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white uppercase focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-300 block mb-0.5">Código de Barras</label>
                      <input
                        type="text"
                        value={activeBuilderProduct.barcode}
                        onChange={(e) => setActiveBuilderProduct({ ...activeBuilderProduct, barcode: e.target.value })}
                        className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-300 block mb-0.5">Categoría</label>
                      <select
                        value={activeBuilderProduct.category}
                        onChange={(e) => setActiveBuilderProduct({ ...activeBuilderProduct, category: e.target.value })}
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none"
                      >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <p className="text-xs font-bold text-white">{activeBuilderProduct.description}</p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {activeBuilderProduct.barcode || 'S/C'} · Cat: {activeBuilderProduct.category}
                  </p>
                </div>
              )}

              {/* Quantity to Receive */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Cantidad que entra en la Factura *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={builderQty}
                    onChange={(e) => setBuilderQty(e.target.value)}
                    className="w-24 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-center text-base font-black font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                  <div className="grid grid-cols-5 gap-1 flex-1">
                    {[1, 5, 10, 12, 24].map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setBuilderQty(String(q))}
                        className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold border border-slate-700/80 active:scale-95"
                      >
                        +{q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cost Input & Currency Switcher */}
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-300">
                    Costo según Factura de Compra
                  </label>
                  <div className="flex rounded-lg bg-slate-900 border border-slate-700 p-0.5 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setBuilderCurrency('USD')}
                      className={`px-2 py-0.5 rounded ${builderCurrency === 'USD' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                    >
                      USD ($)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuilderCurrency('VES')}
                      className={`px-2 py-0.5 rounded ${builderCurrency === 'VES' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                    >
                      Bs (VES)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs font-bold">
                      {builderCurrency === 'USD' ? '$' : 'Bs'}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={builderCostoInput}
                      onChange={(e) => {
                        setBuilderCostoInput(e.target.value);
                        handleCostOrMarginChange(e.target.value);
                      }}
                      className="w-full pl-7 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-black font-mono text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Pack / Box Divisor Toggle */}
                  <button
                    type="button"
                    onClick={() => setBuilderIsPack(!builderIsPack)}
                    className={`px-2.5 py-2 rounded-xl border text-[11px] font-bold transition ${
                      builderIsPack 
                        ? 'bg-amber-600 text-white border-amber-500' 
                        : 'bg-slate-900 text-slate-400 border-slate-700'
                    }`}
                  >
                    {builderIsPack ? 'Caja / Bulto ✓' : '¿Por Bulto?'}
                  </button>
                </div>

                {builderIsPack && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-amber-300">Unidades en el bulto:</span>
                    <input
                      type="number"
                      min="1"
                      value={builderPackUnits}
                      onChange={(e) => setBuilderPackUnits(e.target.value)}
                      className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono font-bold text-center text-white"
                    />
                    <span className="text-[10px] text-slate-400">
                      = <strong className="text-emerald-400">${effectiveUnitCostUSD.toFixed(2)}</strong> c/u
                    </span>
                  </div>
                )}

                {builderCurrency === 'VES' && (
                  <div className="p-2 bg-blue-950/40 border border-blue-800/50 rounded-lg text-[10px] text-blue-300 flex items-center justify-between">
                    <span>Equivale a:</span>
                    <strong className="text-emerald-400 font-mono text-xs">
                      ${effectiveUnitCostUSD.toFixed(3)} USD
                    </strong>
                    <span className="text-[9px] text-slate-400">
                      ({tasaTipo === 'EUR_BCV' ? 'Euro BCV' : tasaTipo === 'USD_BCV' ? '$ BCV' : 'Manual'}: {effectiveRateNum.toFixed(2)} Bs)
                    </span>
                  </div>
                )}
              </div>

              {/* Profit Margins & Final Selling Prices */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300">Margen Detalle (%)</span>
                  <div className="flex gap-1 text-[10px] font-bold">
                    {[25, 30, 35, 40].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setBuilderMargenDetalle(String(m));
                          handleCostOrMarginChange(undefined, String(m));
                        }}
                        className={`px-1.5 py-0.5 rounded border ${
                          builderMargenDetalle === String(m)
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-slate-900 text-slate-400 border-slate-700'
                        }`}
                      >
                        {m}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Precio Detalle ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={builderPrecioDetalleUSD}
                      onChange={(e) => setBuilderPrecioDetalleUSD(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-emerald-600/60 rounded-xl text-xs font-black font-mono text-emerald-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Equivalente Bs</label>
                    <div className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-300 truncate">
                      {((parseFloat(builderPrecioDetalleUSD) || 0) * effectiveRateNum).toFixed(2)} Bs
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-850">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Precio Mayor ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={builderPrecioMayorUSD}
                      onChange={(e) => setBuilderPrecioMayorUSD(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono font-bold text-white focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Costo Unit: <strong className="text-white">${effectiveUnitCostUSD.toFixed(2)}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Add to Invoice Button */}
              <button
                type="button"
                onClick={handleAddItemToInvoice}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-black text-white shadow-lg shadow-blue-900/50 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar a la Factura</span>
              </button>
            </div>
          )}

          {/* 4. LISTA DE PRODUCTOS CARGADOS EN LA FACTURA */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider">
                3. Productos en la Factura ({items.length})
              </h3>
              {items.length > 0 && (
                <span className="text-xs font-mono font-black text-emerald-400">
                  Total: ${totalFacturaUSD.toFixed(2)}
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 text-center text-slate-500">
                <Package className="w-8 h-8 text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-400">No hay productos agregados todavía</p>
                <p className="text-[10px] text-slate-500">Usa el buscador para agregar ítems de la factura física.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div
                    key={`${it.barcode}-${idx}`}
                    className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-800 text-blue-300">
                          {it.barcode || 'S/C'}
                        </span>
                        {it.isNewProduct && (
                          <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            NUEVO
                          </span>
                        )}
                      </div>
                      <p className="font-bold text-white truncate text-[11px]">{it.description}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono">
                        <span className="text-emerald-400 font-bold">+{it.cantidad} uds</span>
                        <span>x ${it.costo_unitario_usd.toFixed(2)}</span>
                        <span>= <strong>${it.costo_total_usd.toFixed(2)}</strong></span>
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">
                        Venta: <strong className="text-slate-300">${it.precio_detalle_usd.toFixed(2)}</strong> ({((it.precio_detalle_usd) * effectiveRateNum).toFixed(2)} Bs)
                      </div>
                    </div>

                    {/* Delete Item Button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-xl transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invoice Summary Totals Card */}
          {items.length > 0 && (
            <div className="bg-gradient-to-r from-emerald-950/60 to-slate-950 border border-emerald-800/50 rounded-2xl p-4 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold text-emerald-300 uppercase">Monto Total Factura</span>
                <span className="text-2xl font-black font-mono text-emerald-400">
                  ${totalFacturaUSD.toFixed(2)} USD
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs text-slate-300 pt-1 border-t border-emerald-900/40 font-mono">
                <span>Equivalente Bolívares (Tasa {effectiveRateNum.toFixed(2)}):</span>
                <span className="font-bold">
                  {totalFacturaVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex gap-2.5 flex-shrink-0">
          <button
            type="button"
            onClick={handlePausarFactura}
            disabled={isProcessing}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-amber-300 transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            <PauseCircle className="w-4 h-4" />
            <span>Pausar</span>
          </button>

          <button
            type="button"
            onClick={handleProcessInvoice}
            disabled={isProcessing || items.length === 0}
            className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-black text-white shadow-lg shadow-emerald-900/50 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Cargando Inventario...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Procesar Factura ({items.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* QUICK MODAL: REGISTRAR NUEVO PROVEEDOR */}
      {showNewProvModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-400" />
                Nuevo Proveedor
              </h3>
              <button onClick={() => setShowNewProvModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">RIF / Documento *</label>
                <input
                  type="text"
                  value={newProvRif}
                  onChange={(e) => setNewProvRif(e.target.value)}
                  placeholder="Ej. J-12345678-0"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono uppercase focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Razón Social / Nombre *</label>
                <input
                  type="text"
                  value={newProvRazon}
                  onChange={(e) => setNewProvRazon(e.target.value)}
                  placeholder="Ej. DISTRIBUIDORA POLAR C.A."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white uppercase focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewProvModal(false)}
                className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateNewProvider}
                disabled={savingNewProv}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black"
              >
                {savingNewProv ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
