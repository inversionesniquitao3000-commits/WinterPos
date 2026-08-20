import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Truck, Plus, DollarSign, Search, 
  Edit, FileText, 
  CheckCircle2,
  MessageCircle, X, Trash2, ShoppingCart, 
  FileSpreadsheet, AlertTriangle, TrendingUp,
  Pause, Play
} from 'lucide-react';
import { Proveedor, Compra, CompraDetalleItem, PagoProveedor, CotizacionProveedor, Product, User, CompanyConfig } from '../types';
import { useDialog } from '../hooks/useDialog';
import { getLocalISODateString } from '../utils';

export interface PausedCompraDraft {
  id: string;
  timestamp: string;
  compraProveedorId: number | string;
  proveedorNombre?: string;
  compraNumeroFactura: string;
  compraFechaEmision: string;
  compraFechaVencimiento: string;
  compraCondicion: 'Contado' | 'Credito';
  compraMetodoContado: 'Efectivo$' | 'EfectivoBs' | 'TransferenciaVES' | 'PagoMovil' | 'Zelle';
  compraAfectaCaja: boolean;
  compraObservaciones: string;
  compraItems: CompraDetalleItem[];
  compraTasaMode: 'dolar_bcv' | 'euro_bcv' | 'manual';
  compraCustomTasa: string;
  totalUSD: number;
}

export interface PausedCotizacionDraft {
  id: string;
  timestamp: string;
  cotProveedorId: number | string;
  proveedorNombre?: string;
  cotNumero: string;
  cotFechaVigencia: string;
  cotItems: any[];
  cotNotas: string;
  totalUSD: number;
}

// Dynamic loader for XLSX (SheetJS)
const loadXlsx = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).XLSX) return resolve((window as any).XLSX);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => {
      const lib = (window as any).XLSX;
      lib ? resolve(lib) : reject(new Error('No se pudo inicializar XLSX'));
    };
    script.onerror = () => reject(new Error('Error al cargar librería XLSX desde CDN'));
  });
};

// Safe number parser to prevent runtime .toFixed errors
const safeNum = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const parsed = parseFloat(String(val || '0').replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
};

// Safe extractor for quotation items
const getCotItems = (cot: CotizacionProveedor | any): any[] => {
  if (!cot) return [];
  let dj: any = cot.detalles_json;
  if (typeof dj === 'string') {
    try {
      dj = JSON.parse(dj);
    } catch (_) {
      dj = {};
    }
  }
  if (Array.isArray(dj)) return dj;
  if (dj && Array.isArray(dj.items)) return dj.items;
  return [];
};

interface ProveedoresProps {
  proveedores: Proveedor[];
  compras: Compra[];
  pagos?: PagoProveedor[];
  pagosProveedores?: PagoProveedor[];
  cotizaciones?: CotizacionProveedor[];
  cotizacionesProveedores?: CotizacionProveedor[];
  products: Product[];
  currentUser: User;
  cajaAbierta?: boolean;
  companyConfig?: CompanyConfig;
  tasaDia?: number;
  getApiUrl?: (path: string) => string;
  onAddProveedor: (newProv: Proveedor) => Promise<Proveedor | null>;
  onUpdateProveedor: (updatedProv: Proveedor) => Promise<boolean>;
  onDeleteProveedor: (id: number) => Promise<boolean>;
  onAddCompra: (newCompra: any) => Promise<Compra | null>;
  onAddPagoProveedor: (newPago: any) => Promise<boolean>;
  onAddCotizacion: (newCot: any) => Promise<boolean>;
  onDeleteCotizacion: (id: number) => Promise<boolean>;
  onRefreshData?: () => Promise<void>;
}

export default function Proveedores({
  proveedores = [],
  compras = [],
  pagos = [],
  pagosProveedores,
  cotizaciones = [],
  cotizacionesProveedores,
  products = [],
  currentUser,
  cajaAbierta = true,
  companyConfig,
  tasaDia = 1,
  getApiUrl,
  onAddProveedor,
  onUpdateProveedor,
  onDeleteProveedor,
  onAddCompra,
  onAddPagoProveedor,
  onAddCotizacion,
  onDeleteCotizacion,
  onRefreshData
}: ProveedoresProps) {
  const { showAlert, showConfirm } = useDialog();
  const effectivePagos = pagosProveedores || pagos;
  const effectiveCotizaciones = cotizacionesProveedores || cotizaciones;

  // Navigation Subtabs
  type SubTab = 'catalogo' | 'compras' | 'cxp' | 'cotizaciones';
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('catalogo');

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Activo' | 'Inactivo'>('all');
  const [comprasFilterStatus, setComprasFilterStatus] = useState<'all' | 'Pendiente' | 'Parcial' | 'Pagada'>('all');
  const [selectedCompraDetail, setSelectedCompraDetail] = useState<Compra | null>(null);

  // Modals state
  const [showAddProvModal, setShowAddProvModal] = useState(false);
  const [editingProv, setEditingProv] = useState<Proveedor | null>(null);
  const [showNewCompraModal, setShowNewCompraModal] = useState(false);
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [showNewCotizacionModal, setShowNewCotizacionModal] = useState(false);
  const [showPausedComprasModal, setShowPausedComprasModal] = useState(false);
  const [showPausedCotizacionesModal, setShowPausedCotizacionesModal] = useState(false);

  // Paused drafts state with localStorage persistence
  const [pausedCompras, setPausedCompras] = useState<PausedCompraDraft[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('winterpos_paused_compras') || '[]');
    } catch {
      return [];
    }
  });

  const [pausedCotizaciones, setPausedCotizaciones] = useState<PausedCotizacionDraft[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('winterpos_paused_cotizaciones') || '[]');
    } catch {
      return [];
    }
  });

  // Loading state
  const [isActionLoading, setIsActionLoading] = useState(false);

  // ESC key listener to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddProvModal(false);
        setShowNewCompraModal(false);
        setShowAbonoModal(false);
        setShowNewCotizacionModal(false);
        setShowPausedComprasModal(false);
        setShowPausedCotizacionesModal(false);
        setSelectedCompraDetail(null);
        setIsProdSearchOpen(false);
        setIsCotProdSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Form: Proveedor
  const [formRif, setFormRif] = useState('');
  const [formRazonSocial, setFormRazonSocial] = useState('');
  const [formContacto, setFormContacto] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formCorreo, setFormCorreo] = useState('');
  const [formDireccion, setFormDireccion] = useState('');
  const [formDiasCredito, setFormDiasCredito] = useState('0');
  const [formLimiteCredito, setFormLimiteCredito] = useState('0');
  const [formEstado, setFormEstado] = useState<'Activo' | 'Inactivo'>('Activo');

  // Form: Compra (Recepción)
  const [compraProveedorId, setCompraProveedorId] = useState<number | string>('');
  const [compraNumeroFactura, setCompraNumeroFactura] = useState('');
  const [compraFechaEmision, setCompraFechaEmision] = useState(() => getLocalISODateString().split(' ')[0]);
  const [compraFechaVencimiento, setCompraFechaVencimiento] = useState('');
  const [compraCondicion, setCompraCondicion] = useState<'Contado' | 'Credito'>('Contado');
  const [compraMetodoContado, setCompraMetodoContado] = useState<'Efectivo$' | 'EfectivoBs' | 'TransferenciaVES' | 'PagoMovil' | 'Zelle'>('Efectivo$');
  const [compraAfectaCaja, setCompraAfectaCaja] = useState(false);
  const [compraObservaciones, setCompraObservaciones] = useState('');
  const [compraItems, setCompraItems] = useState<CompraDetalleItem[]>([]);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string>('');
  const [itemQtyInput, setItemQtyInput] = useState('1');
  const [itemCostInput, setItemCostInput] = useState('');
  const [itemMargenDetalle] = useState('30');
  const [itemMargenMayor] = useState('15');

  // --- INTERACTIVE RATE SELECTOR ($ BCV, € BCV, MANUAL) ---
  const [compraTasaMode, setCompraTasaMode] = useState<'dolar_bcv' | 'euro_bcv' | 'manual'>('dolar_bcv');
  const [compraCustomTasa, setCompraCustomTasa] = useState('');
  const [bcvRates, setBcvRates] = useState<{ usd: number; eur: number }>({ usd: 0, eur: 0 });

  const fetchBcvRates = async () => {
    try {
      const url = getApiUrl ? getApiUrl('/bcv') : '/api/bcv';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const u = parseFloat(String(data.usd || '').replace(',', '.')) || 0;
        const e = parseFloat(String(data.eur || '').replace(',', '.')) || 0;
        setBcvRates({ usd: u, eur: e });
        if (u > 0 && !compraCustomTasa) {
          setCompraCustomTasa(u.toFixed(2));
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchBcvRates();
  }, [getApiUrl]);

  // Effective Exchange Rate applied to the purchase invoice
  const effectiveCompraTasa = useMemo(() => {
    if (compraTasaMode === 'dolar_bcv') {
      return bcvRates.usd > 0 ? bcvRates.usd : tasaDia;
    }
    if (compraTasaMode === 'euro_bcv') {
      return bcvRates.eur > 0 ? bcvRates.eur : (tasaDia * 1.08);
    }
    if (compraTasaMode === 'manual') {
      const val = parseFloat(compraCustomTasa);
      return val > 0 ? val : (bcvRates.usd > 0 ? bcvRates.usd : tasaDia);
    }
    return tasaDia;
  }, [compraTasaMode, compraCustomTasa, bcvRates, tasaDia]);

  // --- SMART PRODUCT AUTOCOMPLETE & SEARCH FOR COMPRAS ---
  const [prodSearchQuery, setProdSearchQuery] = useState('');
  const [selectedProdObj, setSelectedProdObj] = useState<Product | null>(null);
  const [isProdSearchOpen, setIsProdSearchOpen] = useState(false);
  const [prodHighlightedIndex, setProdHighlightedIndex] = useState(0);
  const prodSearchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const costInputRef = useRef<HTMLInputElement>(null);
  const prodDropdownRef = useRef<HTMLDivElement>(null);

  // Filtered products for compra modal (only search when user has typed text)
  const searchMatchedProducts = useMemo(() => {
    const q = prodSearchQuery.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return products.filter(p => {
      const code = (p.barcode || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      return code.includes(q) || desc.includes(q) || cat.includes(q);
    }).slice(0, 25);
  }, [products, prodSearchQuery]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        prodDropdownRef.current && 
        !prodDropdownRef.current.contains(event.target as Node) &&
        prodSearchInputRef.current &&
        !prodSearchInputRef.current.contains(event.target as Node)
      ) {
        setIsProdSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProduct = (p: Product) => {
    setSelectedProdObj(p);
    setSelectedProductToAdd(String(p.id));
    setProdSearchQuery(p.description);
    setItemCostInput(p.precio_costo_usd !== undefined && p.precio_costo_usd !== null ? String(p.precio_costo_usd) : '');
    setIsProdSearchOpen(false);
    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 50);
  };

  const handleClearSelectedProduct = () => {
    setSelectedProdObj(null);
    setSelectedProductToAdd('');
    setProdSearchQuery('');
    setItemCostInput('');
    setItemQtyInput('1');
    setIsProdSearchOpen(false);
  };

  const handleProdSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!prodSearchQuery.trim()) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsProdSearchOpen(true);
      setProdHighlightedIndex(prev => (prev + 1) % Math.max(1, searchMatchedProducts.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsProdSearchOpen(true);
      setProdHighlightedIndex(prev => (prev - 1 + searchMatchedProducts.length) % Math.max(1, searchMatchedProducts.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Check for exact barcode match first
      const exactBarcode = products.find(p => p.barcode?.toLowerCase() === prodSearchQuery.trim().toLowerCase());
      if (exactBarcode) {
        handleSelectProduct(exactBarcode);
        return;
      }
      if (isProdSearchOpen && searchMatchedProducts[prodHighlightedIndex]) {
        handleSelectProduct(searchMatchedProducts[prodHighlightedIndex]);
      } else if (searchMatchedProducts.length === 1) {
        handleSelectProduct(searchMatchedProducts[0]);
      }
    } else if (e.key === 'Escape') {
      setIsProdSearchOpen(false);
    }
  };

  // Form: Abono / Pago CxP
  const [abonoProveedorId, setAbonoProveedorId] = useState<number | string>('');
  const [abonoCompraId, setAbonoCompraId] = useState<number | string>('');
  const [abonoMontoUSD, setAbonoMontoUSD] = useState('');
  const [abonoMetodoPago, setAbonoMetodoPago] = useState<'Efectivo$' | 'EfectivoBs' | 'TransferenciaVES' | 'PagoMovil' | 'Punto' | 'Zelle' | 'Binance' | 'PayPal'>('Efectivo$');
  const [abonoBancoOrigen, setAbonoBancoOrigen] = useState('');
  const [abonoReferencia, setAbonoReferencia] = useState('');
  const [abonoAfectaCaja, setAbonoAfectaCaja] = useState(false);
  const [abonoObservacion, setAbonoObservacion] = useState('');

  // Form: Cotizacion
  const [cotProveedorId, setCotProveedorId] = useState<number | string>('');
  const [cotNumero, setCotNumero] = useState('');
  const [cotFechaVigencia, setCotFechaVigencia] = useState('');
  const [cotItems, setCotItems] = useState<any[]>([]);
  const [cotItemDesc, setCotItemDesc] = useState('');
  const [cotItemQty, setCotItemQty] = useState('1');
  const [cotItemCost, setCotItemCost] = useState('');
  const [cotNotas, setCotNotas] = useState('');
  const [isCotProdSearchOpen, setIsCotProdSearchOpen] = useState(false);

  // --- CALCULATED METRICS ---
  const totalDeudaGlobalUSD = useMemo(() => {
    return proveedores.reduce((sum, p) => sum + (p.saldo_pendiente_usd || 0), 0);
  }, [proveedores]);

  const totalDeudaGlobalVES = useMemo(() => {
    return totalDeudaGlobalUSD * tasaDia;
  }, [totalDeudaGlobalUSD, tasaDia]);

  const totalComprasMesUSD = useMemo(() => {
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    return compras
      .filter(c => c.fecha_emision && c.fecha_emision.startsWith(currentMonth))
      .reduce((sum, c) => sum + (c.total_usd || 0), 0);
  }, [compras]);

  const totalVencidoUSD = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    return compras
      .filter(c => c.estatus !== 'Pagada' && c.fecha_vencimiento && c.fecha_vencimiento < today)
      .reduce((sum, c) => sum + (c.saldo_pendiente_usd || 0), 0);
  }, [compras]);

  // Filtered Suppliers
  const filteredProveedores = useMemo(() => {
    return proveedores.filter(p => {
      const matchSearch = 
        p.razon_social?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.rif?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.contacto_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.telefono?.includes(searchTerm);
      const matchStatus = statusFilter === 'all' || p.estado === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [proveedores, searchTerm, statusFilter]);

  // Filtered Compras
  const filteredCompras = useMemo(() => {
    return compras.filter(c => {
      const matchSearch = 
        c.numero_factura?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.proveedor_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.proveedor_rif?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = comprasFilterStatus === 'all' || c.estatus === comprasFilterStatus;
      return matchSearch && matchStatus;
    });
  }, [compras, searchTerm, comprasFilterStatus]);

  // Helper to open Add/Edit Supplier modal
  const handleOpenEditProv = (prov: Proveedor) => {
    setEditingProv(prov);
    setFormRif(prov.rif);
    setFormRazonSocial(prov.razon_social);
    setFormContacto(prov.contacto_nombre || '');
    setFormTelefono(prov.telefono || '');
    setFormCorreo(prov.correo || '');
    setFormDireccion(prov.direccion || '');
    setFormDiasCredito(String(prov.dias_credito || 0));
    setFormLimiteCredito(String(prov.limite_credito_usd || 0));
    setFormEstado(prov.estado || 'Activo');
    setShowAddProvModal(true);
  };

  const handleOpenNewProv = () => {
    setEditingProv(null);
    setFormRif('');
    setFormRazonSocial('');
    setFormContacto('');
    setFormTelefono('');
    setFormCorreo('');
    setFormDireccion('');
    setFormDiasCredito('0');
    setFormLimiteCredito('0');
    setFormEstado('Activo');
    setShowAddProvModal(true);
  };

  const handleSaveProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRif.trim() || !formRazonSocial.trim()) {
      showAlert('El RIF y la Razón Social son campos obligatorios.', 'Atención', 'warning');
      return;
    }

    setIsActionLoading(true);
    try {
      const provData: any = {
        id: editingProv?.id,
        rif: formRif.trim().toUpperCase(),
        razon_social: formRazonSocial.trim().toUpperCase(),
        contacto_nombre: formContacto.trim(),
        telefono: formTelefono.trim(),
        correo: formCorreo.trim().toLowerCase(),
        direccion: formDireccion.trim(),
        dias_credito: parseInt(formDiasCredito) || 0,
        limite_credito_usd: parseFloat(formLimiteCredito) || 0,
        saldo_pendiente_usd: editingProv?.saldo_pendiente_usd || 0,
        estado: formEstado
      };

      if (editingProv?.id) {
        const ok = await onUpdateProveedor(provData);
        if (ok) {
          showAlert('Proveedor actualizado correctamente.', 'Éxito', 'success');
          setShowAddProvModal(false);
        }
      } else {
        const res = await onAddProveedor(provData);
        if (res) {
          showAlert('Proveedor registrado correctamente.', 'Éxito', 'success');
          setShowAddProvModal(false);
        }
      }
    } catch (err: any) {
      showAlert(err.message || 'No se pudo guardar el proveedor.', 'Error', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteProv = async (prov: Proveedor) => {
    if (prov.saldo_pendiente_usd > 0.01) {
      showAlert(`No se puede eliminar el proveedor "${prov.razon_social}" porque tiene una deuda pendiente de $${prov.saldo_pendiente_usd.toFixed(2)}.`, 'Acción Bloqueada', 'warning');
      return;
    }

    const confirmed = await showConfirm(
      `¿Está seguro de que desea eliminar a "${prov.razon_social}" (${prov.rif})? Esta acción no se puede deshacer.`,
      'Eliminar Proveedor',
      { isDanger: true }
    );
    if (!confirmed) return;

    setIsActionLoading(true);
    try {
      const ok = await onDeleteProveedor(prov.id);
      if (ok) {
        showAlert('Proveedor eliminado exitosamente.', 'Eliminado', 'success');
      }
    } catch (err: any) {
      showAlert(err.message || 'Error al eliminar el proveedor.', 'Error', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // --- ITEM MANAGEMENT IN NEW COMPRA MODAL ---
  const handleAddItemToCompra = () => {
    if (!selectedProductToAdd && !selectedProdObj) {
      showAlert('Seleccione o busque un producto del inventario.', 'Atención', 'warning');
      prodSearchInputRef.current?.focus();
      return;
    }
    const prod = selectedProdObj || products.find(p => String(p.id) === String(selectedProductToAdd));
    if (!prod) return;

    const qty = parseFloat(itemQtyInput) || 0;
    const cost = parseFloat(itemCostInput) || 0;

    if (qty <= 0) {
      showAlert('La cantidad debe ser mayor a 0.', 'Atención', 'warning');
      qtyInputRef.current?.focus();
      return;
    }
    if (cost < 0) {
      showAlert('El costo unitario no puede ser negativo.', 'Atención', 'warning');
      costInputRef.current?.focus();
      return;
    }

    const mDet = parseFloat(itemMargenDetalle) || 30;
    const mMay = parseFloat(itemMargenMayor) || 15;
    const precioDetalleSugerido = cost * (1 + mDet / 100);
    const precioMayorSugerido = cost * (1 + mMay / 100);

    const existingIdx = compraItems.findIndex(i => i.producto_id === prod.id);
    if (existingIdx !== -1) {
      const updated = [...compraItems];
      updated[existingIdx].cantidad += qty;
      updated[existingIdx].costo_unitario_usd = cost;
      updated[existingIdx].total_usd = updated[existingIdx].cantidad * cost;
      setCompraItems(updated);
    } else {
      const newItem: CompraDetalleItem = {
        producto_id: prod.id,
        descripcion: prod.description,
        codigo_barras_clave: prod.barcode,
        cantidad: qty,
        costo_unitario_usd: cost,
        total_usd: qty * cost,
        margen_detalle_pct: mDet,
        precio_detalle_sugerido_usd: precioDetalleSugerido,
        margen_mayor_pct: mMay,
        precio_mayor_sugerido_usd: precioMayorSugerido
      };
      setCompraItems(prev => [...prev, newItem]);
    }

    // Reset selection and return focus to product search
    handleClearSelectedProduct();
  };

  const handleRemoveItemFromCompra = (index: number) => {
    setCompraItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Compra Totals
  const subtotalCompraUSD = useMemo(() => {
    return compraItems.reduce((acc, item) => acc + (item.total_usd || 0), 0);
  }, [compraItems]);

  const totalCompraUSD = subtotalCompraUSD;
  const totalCompraVES = totalCompraUSD * effectiveCompraTasa;

  const handleSaveCompra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compraProveedorId) {
      showAlert('Debe seleccionar un proveedor.', 'Atención', 'warning');
      return;
    }
    if (!compraNumeroFactura.trim()) {
      showAlert('Ingrese el número de factura o nota de entrega del proveedor.', 'Atención', 'warning');
      return;
    }
    if (compraItems.length === 0) {
      showAlert('Debe agregar al menos un producto a la compra.', 'Atención', 'warning');
      return;
    }

    setIsActionLoading(true);
    try {
      const compraPayload = {
        numero_factura: compraNumeroFactura.trim().toUpperCase(),
        proveedor_id: Number(compraProveedorId),
        usuario_id: currentUser?.id || 1,
        usuario_nombre: currentUser?.nombre || 'Administrador',
        fecha_emision: compraFechaEmision || getLocalISODateString().split(' ')[0],
        fecha_vencimiento: compraCondicion === 'Credito' ? (compraFechaVencimiento || null) : null,
        condicion_pago: compraCondicion,
        subtotal_usd: subtotalCompraUSD,
        impuesto_usd: 0,
        descuento_usd: 0,
        total_usd: totalCompraUSD,
        total_ves: totalCompraVES,
        observaciones: compraObservaciones.trim(),
        items: compraItems,
        metodo_pago_contado: compraMetodoContado,
        afecto_caja_efectivo: compraCondicion === 'Contado' ? (cajaAbierta && compraAfectaCaja) : false,
        tasa_cambio: effectiveCompraTasa
      };

      const res = await onAddCompra(compraPayload);
      if (res) {
        showAlert(`Se registró exitosamente la compra #${compraNumeroFactura}. El stock y kardex fueron actualizados automáticamente.`, 'Compra Registrada', 'success');
        setShowNewCompraModal(false);
        setCompraItems([]);
        setCompraNumeroFactura('');
        setCompraObservaciones('');
        handleClearSelectedProduct();
        if (onRefreshData) onRefreshData();
      }
    } catch (err: any) {
      showAlert(err.message || 'No se pudo registrar la recepción de compra.', 'Error al Guardar', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // --- PAUSE / HOLD MANAGEMENT FOR COMPRAS ---
  const handlePauseCurrentCompra = () => {
    if (!compraProveedorId && !compraNumeroFactura.trim() && compraItems.length === 0) {
      showAlert('No hay datos en la recepción para pausar.', 'Atención', 'warning');
      return;
    }

    const provObj = proveedores.find(p => p.id === Number(compraProveedorId));
    const newDraft: PausedCompraDraft = {
      id: `COMPRA-PAUSE-${Date.now()}`,
      timestamp: new Date().toLocaleString('es-VE'),
      compraProveedorId,
      proveedorNombre: provObj ? `${provObj.razon_social} (${provObj.rif})` : 'Proveedor sin asignar',
      compraNumeroFactura: compraNumeroFactura.trim().toUpperCase() || 'S/N',
      compraFechaEmision,
      compraFechaVencimiento,
      compraCondicion,
      compraMetodoContado,
      compraAfectaCaja,
      compraObservaciones,
      compraItems: [...compraItems],
      compraTasaMode,
      compraCustomTasa,
      totalUSD: totalCompraUSD
    };

    const updated = [newDraft, ...pausedCompras];
    setPausedCompras(updated);
    try {
      localStorage.setItem('winterpos_paused_compras', JSON.stringify(updated));
    } catch (_) {}

    // Reset current form
    setCompraProveedorId('');
    setCompraNumeroFactura('');
    setCompraItems([]);
    setCompraObservaciones('');
    handleClearSelectedProduct();
    setShowNewCompraModal(false);
    showAlert(`Recepción de compra guardada en pausa como borrador (${newDraft.compraItems.length} ítems). Puede retomarla en cualquier momento.`, 'Recepción en Pausa', 'success');
  };

  const handleResumePausedCompra = (draft: PausedCompraDraft) => {
    setCompraProveedorId(draft.compraProveedorId);
    setCompraNumeroFactura(draft.compraNumeroFactura === 'S/N' ? '' : draft.compraNumeroFactura);
    setCompraFechaEmision(draft.compraFechaEmision || getLocalISODateString().split(' ')[0]);
    setCompraFechaVencimiento(draft.compraFechaVencimiento || '');
    setCompraCondicion(draft.compraCondicion || 'Contado');
    setCompraMetodoContado(draft.compraMetodoContado || 'Efectivo$');
    setCompraAfectaCaja(draft.compraAfectaCaja ?? false);
    setCompraObservaciones(draft.compraObservaciones || '');
    setCompraItems(draft.compraItems || []);
    if (draft.compraTasaMode) setCompraTasaMode(draft.compraTasaMode);
    if (draft.compraCustomTasa) setCompraCustomTasa(draft.compraCustomTasa);

    // Remove from paused list
    const updated = pausedCompras.filter(p => p.id !== draft.id);
    setPausedCompras(updated);
    try {
      localStorage.setItem('winterpos_paused_compras', JSON.stringify(updated));
    } catch (_) {}

    setShowPausedComprasModal(false);
    setShowNewCompraModal(true);
    handleClearSelectedProduct();
  };

  const handleDeletePausedCompra = (id: string) => {
    const updated = pausedCompras.filter(p => p.id !== id);
    setPausedCompras(updated);
    try {
      localStorage.setItem('winterpos_paused_compras', JSON.stringify(updated));
    } catch (_) {}
  };

  // --- ABONO / PAGO A PROVEEDOR (CXP) ---
  const handleOpenAbonoModal = (prov?: Proveedor, comp?: Compra) => {
    if (prov) {
      setAbonoProveedorId(prov.id);
    } else if (comp) {
      setAbonoProveedorId(comp.proveedor_id);
      setAbonoCompraId(comp.id || '');
      setAbonoMontoUSD(String(comp.saldo_pendiente_usd || ''));
    } else {
      setAbonoProveedorId('');
      setAbonoCompraId('');
      setAbonoMontoUSD('');
    }
    setAbonoMetodoPago('Efectivo$');
    setAbonoBancoOrigen('');
    setAbonoReferencia('');
    setAbonoAfectaCaja(cajaAbierta);
    setAbonoObservacion('');
    setShowAbonoModal(true);
  };

  const handleSaveAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!abonoProveedorId) {
      showAlert('Seleccione un proveedor.', 'Atención', 'warning');
      return;
    }
    const montoUSD = parseFloat(abonoMontoUSD) || 0;
    if (montoUSD <= 0) {
      showAlert('El monto a pagar debe ser mayor a 0.', 'Atención', 'warning');
      return;
    }

    const prov = proveedores.find(p => p.id === Number(abonoProveedorId));
    if (prov && montoUSD > (prov.saldo_pendiente_usd + 0.05)) {
      const confirmExceed = await showConfirm(
        `El monto ingresado ($${montoUSD.toFixed(2)}) supera el saldo adeudado actual ($${prov.saldo_pendiente_usd.toFixed(2)}). ¿Desea continuar de todas formas?`,
        'Monto Superior a la Deuda',
        { isDanger: false }
      );
      if (!confirmExceed) return;
    }

    setIsActionLoading(true);
    try {
      const pagoPayload = {
        compra_id: abonoCompraId ? Number(abonoCompraId) : null,
        proveedor_id: Number(abonoProveedorId),
        usuario_id: currentUser?.id || 1,
        usuario_nombre: currentUser?.nombre || 'Administrador',
        monto_usd: montoUSD,
        monto_ves: montoUSD * tasaDia,
        tasa_cambio: tasaDia,
        metodo_pago: abonoMetodoPago,
        banco_origen: abonoBancoOrigen.trim(),
        numero_referencia: abonoReferencia.trim(),
        afecto_caja_efectivo: cajaAbierta && abonoAfectaCaja,
        observacion: abonoObservacion.trim(),
        fecha: getLocalISODateString()
      };

      const ok = await onAddPagoProveedor(pagoPayload);
      if (ok) {
        showAlert(`Se procesó exitosamente el pago de $${montoUSD.toFixed(2)} al proveedor.`, 'Pago Registrado', 'success');
        setShowAbonoModal(false);
        if (onRefreshData) onRefreshData();
      }
    } catch (err: any) {
      showAlert(err.message || 'Error al procesar el pago al proveedor.', 'Error', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // --- COTIZACIONES MANAGEMENT ---
  const handleAddItemToCotizacion = () => {
    if (!cotItemDesc.trim()) {
      showAlert('Ingrese la descripción del producto o servicio.', 'Atención', 'warning');
      return;
    }
    const qty = parseFloat(cotItemQty) || 1;
    const cost = parseFloat(cotItemCost) || 0;
    if (qty <= 0 || cost < 0) {
      showAlert('Cantidad y costo deben ser válidos.', 'Atención', 'warning');
      return;
    }

    setCotItems(prev => [
      ...prev,
      {
        descripcion: cotItemDesc.trim().toUpperCase(),
        cantidad: qty,
        costo_unitario_usd: cost,
        total_usd: qty * cost
      }
    ]);
    setCotItemDesc('');
    setCotItemQty('1');
    setCotItemCost('');
  };

  const handleSaveCotizacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cotProveedorId) {
      showAlert('Seleccione un proveedor.', 'Atención', 'warning');
      return;
    }
    if (cotItems.length === 0) {
      showAlert('Debe incluir al menos un producto cotizado.', 'Atención', 'warning');
      return;
    }

    const totalCotUSD = cotItems.reduce((acc, i) => acc + (i.total_usd || 0), 0);

    setIsActionLoading(true);
    try {
      const payload = {
        numero_cotizacion: cotNumero.trim() || `COT-${Date.now().toString().slice(-6)}`,
        proveedor_id: Number(cotProveedorId),
        usuario_id: currentUser?.id || 1,
        usuario_nombre: currentUser?.nombre || 'Administrador',
        fecha: getLocalISODateString(),
        fecha_vigencia: cotFechaVigencia || null,
        total_usd: totalCotUSD,
        total_ves: totalCotUSD * tasaDia,
        detalles_json: {
          items: cotItems,
          notas: cotNotas.trim()
        },
        estatus: 'Pendiente'
      };

      const ok = await onAddCotizacion(payload);
      if (ok) {
        showAlert('La cotización del proveedor se registró correctamente.', 'Cotización Guardada', 'success');
        setShowNewCotizacionModal(false);
        setCotItems([]);
        setCotNumero('');
        setCotNotas('');
        if (onRefreshData) onRefreshData();
      }
    } catch (err: any) {
      showAlert(err.message || 'Error al guardar la cotización.', 'Error', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // --- PAUSE / HOLD MANAGEMENT FOR COTIZACIONES ---
  const handlePauseCurrentCotizacion = () => {
    if (!cotProveedorId && !cotNumero.trim() && cotItems.length === 0) {
      showAlert('No hay datos en la cotización para pausar.', 'Atención', 'warning');
      return;
    }

    const provObj = proveedores.find(p => p.id === Number(cotProveedorId));
    const totalCotUSD = cotItems.reduce((acc, i) => acc + (i.total_usd || 0), 0);
    const newDraft: PausedCotizacionDraft = {
      id: `COT-PAUSE-${Date.now()}`,
      timestamp: new Date().toLocaleString('es-VE'),
      cotProveedorId,
      proveedorNombre: provObj ? `${provObj.razon_social} (${provObj.rif})` : 'Proveedor sin asignar',
      cotNumero: cotNumero.trim() || 'S/N',
      cotFechaVigencia,
      cotItems: [...cotItems],
      cotNotas,
      totalUSD: totalCotUSD
    };

    const updated = [newDraft, ...pausedCotizaciones];
    setPausedCotizaciones(updated);
    try {
      localStorage.setItem('winterpos_paused_cotizaciones', JSON.stringify(updated));
    } catch (_) {}

    // Reset current form
    setCotProveedorId('');
    setCotNumero('');
    setCotItems([]);
    setCotNotas('');
    setShowNewCotizacionModal(false);
    showAlert(`Cotización guardada en pausa como borrador (${newDraft.cotItems.length} productos). Puede retomarla en cualquier momento.`, 'Cotización en Pausa', 'success');
  };

  const handleResumePausedCotizacion = (draft: PausedCotizacionDraft) => {
    setCotProveedorId(draft.cotProveedorId);
    setCotNumero(draft.cotNumero === 'S/N' ? '' : draft.cotNumero);
    setCotFechaVigencia(draft.cotFechaVigencia || '');
    setCotItems(draft.cotItems || []);
    setCotNotas(draft.cotNotas || '');

    // Remove from paused list
    const updated = pausedCotizaciones.filter(p => p.id !== draft.id);
    setPausedCotizaciones(updated);
    try {
      localStorage.setItem('winterpos_paused_cotizaciones', JSON.stringify(updated));
    } catch (_) {}

    setShowPausedCotizacionesModal(false);
    setShowNewCotizacionModal(true);
  };

  const handleDeletePausedCotizacion = (id: string) => {
    const updated = pausedCotizaciones.filter(p => p.id !== id);
    setPausedCotizaciones(updated);
    try {
      localStorage.setItem('winterpos_paused_cotizaciones', JSON.stringify(updated));
    } catch (_) {}
  };

  // Convert Quotation into Purchase automatically
  const handleConvertCotToCompra = (cot: CotizacionProveedor) => {
    setCompraProveedorId(cot.proveedor_id);
    setCompraNumeroFactura(`FAC-COT-${cot.numero_cotizacion || cot.id}`);
    setCompraCondicion('Contado');
    setCompraObservaciones(`Generado desde Cotización #${cot.numero_cotizacion || cot.id}`);

    const items = getCotItems(cot);
    const mappedItems: CompraDetalleItem[] = items.map(ci => {
      const matchingProd = products.find(p => p.description.toLowerCase() === (ci.descripcion || '').toLowerCase());
      const cost = safeNum(ci.costo_unitario_usd);
      const qty = safeNum(ci.cantidad) || 1;
      return {
        producto_id: matchingProd ? matchingProd.id : 0,
        descripcion: ci.descripcion || 'Producto Cotizado',
        codigo_barras_clave: matchingProd ? matchingProd.barcode : '',
        cantidad: qty,
        costo_unitario_usd: cost,
        total_usd: safeNum(ci.total_usd) || (qty * cost)
      };
    });

    setCompraItems(mappedItems);
    setShowNewCompraModal(true);
    setActiveSubTab('compras');
  };

  // WhatsApp statement sender
  const handleSendWhatsAppStatement = (prov: Proveedor) => {
    if (!prov.telefono) {
      showAlert(`El proveedor "${prov.razon_social}" no tiene número de teléfono registrado.`, 'Sin Teléfono', 'warning');
      return;
    }
    const cleanPhone = prov.telefono.replace(/[^0-9]/g, '');
    const msg = `*ESTADO DE CUENTA - ${companyConfig?.nombre_comercio || 'WINTERPOS'}*\n` +
      `Proveedor: *${prov.razon_social}* (RIF: ${prov.rif})\n` +
      `Saldo Pendiente de Pago: *$${(prov.saldo_pendiente_usd || 0).toFixed(2)} USD* (Bs ${(prov.saldo_pendiente_usd * tasaDia).toFixed(2)})\n` +
      `Días de Crédito: ${prov.dias_credito || 0} días\n` +
      `Fecha de Consulta: ${getLocalISODateString()}`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Export Suppliers to Excel
  const handleExportExcel = async () => {
    try {
      const XLSX = await loadXlsx();
      const exportData = proveedores.map(p => ({
        'RIF': p.rif,
        'Razón Social': p.razon_social,
        'Contacto': p.contacto_nombre || 'N/A',
        'Teléfono': p.telefono,
        'Correo': p.correo || 'N/A',
        'Días Crédito': p.dias_credito,
        'Límite Crédito ($)': p.limite_credito_usd,
        'Saldo Deuda ($)': p.saldo_pendiente_usd,
        'Saldo Deuda (Bs)': (p.saldo_pendiente_usd * tasaDia).toFixed(2),
        'Estado': p.estado
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Proveedores');
      XLSX.writeFile(wb, `Proveedores_WinterPos_${new Date().toISOString().split('T')[0]}.xlsx`);
      showAlert('El archivo Excel se generó correctamente.', 'Exportación Exitosa', 'success');
    } catch (err: any) {
      showAlert(err.message || 'No se pudo generar el archivo Excel.', 'Error al Exportar', 'error');
    }
  };

  return (
    <div className="space-y-4 text-slate-800 font-sans text-xs animate-fade-in">
      
      {/* HEADER SECTION */}
      <div>
        <h1 className="text-xl font-extrabold text-slate-800 tracking-wider flex items-center gap-2">
          <Truck className="w-5 h-5 text-indigo-700" />
          GESTIÓN DE PROVEEDORES, COMPRAS Y CUENTAS POR PAGAR (CxP)
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-sans">
          Administre el catálogo maestro de proveedores, recepción de compras con aumento de stock, control de pagos y cotizaciones.
        </p>
      </div>

      {/* TOP STATS BANNER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* Total Deuda Global */}
        <div className="bg-white border border-rose-200 rounded-xl p-4 shadow-xs flex items-center justify-between relative overflow-hidden group">
          <div>
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">Deuda Total a Proveedores</span>
            <div className="text-2xl font-black font-mono text-rose-600 mt-1 flex items-baseline gap-1.5">
              <span>${totalDeudaGlobalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-xs text-slate-500 font-sans font-normal">USD</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
              Bs {totalDeudaGlobalVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Deuda Vencida */}
        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs flex items-center justify-between relative overflow-hidden group">
          <div>
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Deuda Vencida (Alarma)</span>
            <div className="text-2xl font-black font-mono text-amber-600 mt-1 flex items-baseline gap-1.5">
              <span>${totalVencidoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-xs text-slate-500 font-sans font-normal">USD</span>
            </div>
            <span className="text-[10px] text-slate-500 font-sans mt-0.5 block">
              {compras.filter(c => c.estatus !== 'Pagada' && c.fecha_vencimiento && c.fecha_vencimiento < new Date().toISOString().split('T')[0]).length} facturas vencidas
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Compras del Mes */}
        <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-xs flex items-center justify-between relative overflow-hidden group">
          <div>
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Compras del Mes</span>
            <div className="text-2xl font-black font-mono text-emerald-600 mt-1 flex items-baseline gap-1.5">
              <span>${totalComprasMesUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-xs text-slate-500 font-sans font-normal">USD</span>
            </div>
            <span className="text-[10px] text-slate-500 font-sans mt-0.5 block">
              {compras.length} facturas registradas
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-xs">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        {/* Total Proveedores Registrados */}
        <div className="bg-white border border-sky-200 rounded-xl p-4 shadow-xs flex items-center justify-between relative overflow-hidden group">
          <div>
            <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wider block">Proveedores Activos</span>
            <div className="text-2xl font-black font-mono text-sky-600 mt-1 flex items-baseline gap-1.5">
              <span>{proveedores.filter(p => p.estado === 'Activo').length}</span>
              <span className="text-xs text-slate-500 font-sans font-normal">/ {proveedores.length} Totales</span>
            </div>
            <span className="text-[10px] text-slate-500 font-sans mt-0.5 block">
              {effectiveCotizaciones.length} cotizaciones registradas
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shadow-xs">
            <Truck className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* SUBTABS NAVIGATION */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveSubTab('catalogo')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all flex items-center gap-1.5 ${
            activeSubTab === 'catalogo'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xs font-extrabold'
              : 'bg-slate-100/80 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          Catálogo Proveedores
        </button>
        <button
          onClick={() => setActiveSubTab('compras')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all flex items-center gap-1.5 ${
            activeSubTab === 'compras'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xs font-extrabold'
              : 'bg-slate-100/80 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Recepción Compras
        </button>
        <button
          onClick={() => setActiveSubTab('cxp')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all flex items-center gap-1.5 ${
            activeSubTab === 'cxp'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xs font-extrabold'
              : 'bg-slate-100/80 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          Cuentas por Pagar (CxP)
        </button>
        <button
          onClick={() => setActiveSubTab('cotizaciones')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all flex items-center gap-1.5 ${
            activeSubTab === 'cotizaciones'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xs font-extrabold'
              : 'bg-slate-100/80 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Cotizaciones & Comparador
        </button>
      </div>

      {/* ACTION BAR & FILTERS HEADER */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        
        {/* Search and Filters */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeSubTab === 'catalogo' ? "Buscar por RIF, Razón Social o Teléfono..." :
                activeSubTab === 'compras' ? "Buscar factura o proveedor..." :
                "Buscar proveedor o deuda..."
              }
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none w-full sm:w-72 font-sans"
            />
          </div>

          {activeSubTab === 'catalogo' && (
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-700 focus:bg-white focus:border-indigo-500 focus:outline-none font-sans"
            >
              <option value="all">Todos los Estados</option>
              <option value="Activo">Solo Activos</option>
              <option value="Inactivo">Solo Inactivos</option>
            </select>
          )}

          {activeSubTab === 'compras' && (
            <select
              value={comprasFilterStatus}
              onChange={e => setComprasFilterStatus(e.target.value as any)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-700 focus:bg-white focus:border-indigo-500 focus:outline-none font-sans"
            >
              <option value="all">Todas las Facturas</option>
              <option value="Pendiente">Pendientes de Pago</option>
              <option value="Pagada">Pagadas (Liquidada)</option>
            </select>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {activeSubTab === 'catalogo' && (
            <>
              <button
                onClick={handleExportExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5"
                title="Exportar base de datos de proveedores a Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel (.xlsx)
              </button>

              <button
                onClick={handleOpenNewProv}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Nuevo Proveedor
              </button>
            </>
          )}

          {activeSubTab === 'compras' && (
            <div className="flex items-center gap-2">
              {pausedCompras.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPausedComprasModal(true)}
                  className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-900 font-extrabold text-xs px-3.5 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5 border border-amber-600 animate-pulse cursor-pointer"
                  title="Ver y retomar recepciones de compra en pausa"
                >
                  <Pause className="w-3.5 h-3.5 fill-slate-900" />
                  <span>En Pausa ({pausedCompras.length})</span>
                </button>
              )}

              <button
                onClick={() => {
                  setShowNewCompraModal(true);
                  handleClearSelectedProduct();
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nueva Recepción de Compra
              </button>
            </div>
          )}

          {activeSubTab === 'cxp' && (
            <button
              onClick={() => handleOpenAbonoModal()}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5"
            >
              <DollarSign className="w-4 h-4" />
              Registrar Pago a Proveedor
            </button>
          )}

          {activeSubTab === 'cotizaciones' && (
            <div className="flex items-center gap-2">
              {pausedCotizaciones.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPausedCotizacionesModal(true)}
                  className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-900 font-extrabold text-xs px-3.5 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5 border border-amber-600 animate-pulse cursor-pointer"
                  title="Ver y retomar cotizaciones en pausa"
                >
                  <Pause className="w-3.5 h-3.5 fill-slate-900" />
                  <span>En Pausa ({pausedCotizaciones.length})</span>
                </button>
              )}

              <button
                onClick={() => setShowNewCotizacionModal(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Cargar Presupuesto / Cotización
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 1. SUBTAB: CATÁLOGO DE PROVEEDORES */}
      {/* ========================================================================= */}
      {activeSubTab === 'catalogo' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-250 text-[11px] font-extrabold text-slate-650 uppercase tracking-wider">
                  <th className="py-3 px-4">RIF / Cédula</th>
                  <th className="py-3 px-4">Razón Social / Proveedor</th>
                  <th className="py-3 px-4">Contacto / Teléfono</th>
                  <th className="py-3 px-4 text-center">Crédito</th>
                  <th className="py-3 px-4 text-right">Saldo Deuda ($)</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 bg-white">
                {filteredProveedores.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Truck className="w-8 h-8 mx-auto text-slate-300 mb-2 opacity-60" />
                      No se encontraron proveedores registrados.
                    </td>
                  </tr>
                ) : (
                  filteredProveedores.map(prov => (
                    <tr key={prov.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                        {prov.rif}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-xs">{prov.razon_social}</div>
                        {prov.direccion && (
                          <div className="text-[10px] text-slate-400 truncate max-w-xs">{prov.direccion}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800 font-medium">{prov.contacto_nombre || 'Sin contacto'}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{prov.telefono}</div>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className="font-mono text-slate-700 font-semibold">{prov.dias_credito || 0} días</span>
                        <span className="block text-[10px] text-slate-400 font-mono">Lím: ${prov.limite_credito_usd || 0}</span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className={`font-mono font-bold text-sm ${prov.saldo_pendiente_usd > 0.01 ? 'text-rose-600' : 'text-slate-400'}`}>
                          ${(prov.saldo_pendiente_usd || 0).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Bs {((prov.saldo_pendiente_usd || 0) * tasaDia).toFixed(2)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          prov.estado === 'Activo' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-slate-100 text-slate-500 border-slate-300'
                        }`}>
                          {prov.estado}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* WhatsApp Statement */}
                          <button
                            onClick={() => handleSendWhatsAppStatement(prov)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg transition-all"
                            title="Enviar estado de cuenta por WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>

                          {/* Quick Payment */}
                          {prov.saldo_pendiente_usd > 0.01 && (
                            <button
                              onClick={() => handleOpenAbonoModal(prov)}
                              className="px-2 py-1 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-bold rounded-lg text-[10px] transition-all"
                              title="Pagar o abonar a este proveedor"
                            >
                              Pagar
                            </button>
                          )}

                          {/* Edit */}
                          <button
                            onClick={() => handleOpenEditProv(prov)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg transition-all"
                            title="Editar Proveedor"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteProv(prov)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-lg transition-all"
                            title="Eliminar Proveedor (Solo si deuda = $0)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SUBTAB: RECEPCIÓN DE COMPRAS */}
      {/* ========================================================================= */}
      {activeSubTab === 'compras' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-250 text-[11px] font-extrabold text-slate-650 uppercase tracking-wider">
                  <th className="py-3 px-4">Fecha Emisión</th>
                  <th className="py-3 px-4">N° Factura</th>
                  <th className="py-3 px-4">Proveedor</th>
                  <th className="py-3 px-4 text-center">Condición</th>
                  <th className="py-3 px-4 text-right">Total Compra</th>
                  <th className="py-3 px-4 text-right">Saldo Pendiente</th>
                  <th className="py-3 px-4 text-center">Estatus</th>
                  <th className="py-3 px-4 text-center">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 bg-white">
                {filteredCompras.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <ShoppingCart className="w-8 h-8 mx-auto text-slate-300 mb-2 opacity-60" />
                      No hay compras registradas en el período seleccionado.
                    </td>
                  </tr>
                ) : (
                  filteredCompras.map(comp => (
                    <tr key={comp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {comp.fecha_emision?.split(' ')[0] || comp.fecha_emision}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {comp.numero_factura}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {comp.proveedor_nombre}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          comp.condicion_pago === 'Credito' 
                            ? 'bg-amber-50 text-amber-700 border-amber-200' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {comp.condicion_pago}
                        </span>
                        {comp.fecha_vencimiento && comp.condicion_pago === 'Credito' && (
                          <span className="block text-[9px] text-slate-400 font-mono mt-0.5">
                            Vence: {comp.fecha_vencimiento}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                        ${comp.total_usd?.toFixed(2)}
                        <span className="block text-[10px] text-slate-500 font-mono font-normal">
                          Bs {comp.total_ves?.toFixed(2)} (Tasa: {comp.tasa_cambio || tasaDia})
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold text-rose-600">
                        ${(comp.saldo_pendiente_usd || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          comp.estatus === 'Pagada'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : comp.estatus === 'Parcial'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {comp.estatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedCompraDetail(comp)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-all"
                            title="Ver detalle de ítems de compra"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          {comp.saldo_pendiente_usd > 0.01 && (
                            <button
                              onClick={() => handleOpenAbonoModal(undefined, comp)}
                              className="px-2 py-1 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-bold rounded-lg text-[10px] transition-all"
                            >
                              Pagar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUBTAB: CUENTAS POR PAGAR (CxP) */}
      {/* ========================================================================= */}
      {activeSubTab === 'cxp' && (
        <div className="space-y-4">
          
          {/* Pending Debt per Supplier */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
              <h3 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-rose-600" />
                Resumen de Saldos Adeudados por Proveedor
              </h3>
              <span className="text-xs text-slate-500">
                Total Deuda: <strong className="text-rose-600 font-mono">${totalDeudaGlobalUSD.toFixed(2)} USD</strong>
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs font-sans border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-250 text-[11px] font-extrabold text-slate-650 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Proveedor</th>
                    <th className="py-2.5 px-3">RIF</th>
                    <th className="py-2.5 px-3">Teléfono</th>
                    <th className="py-2.5 px-3 text-center">Días Crédito</th>
                    <th className="py-2.5 px-3 text-right">Saldo Pendiente (USD)</th>
                    <th className="py-2.5 px-3 text-right">Saldo Pendiente (VES)</th>
                    <th className="py-2.5 px-3 text-center">Operación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {proveedores.filter(p => (p.saldo_pendiente_usd || 0) > 0.01).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-emerald-600 font-bold">
                        <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-500" />
                        ¡Excelente! No hay deudas pendientes con proveedores. Todas las cuentas están al día.
                      </td>
                    </tr>
                  ) : (
                    proveedores.filter(p => (p.saldo_pendiente_usd || 0) > 0.01).map(prov => {
                      const vesDebt = (prov.saldo_pendiente_usd || 0) * tasaDia;
                      return (
                        <tr key={prov.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-slate-900">{prov.razon_social}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">{prov.rif}</td>
                          <td className="py-2.5 px-3 text-slate-600">{prov.telefono}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-700">{prov.dias_credito} días</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 text-sm">
                            ${(prov.saldo_pendiente_usd || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            Bs {vesDebt.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => handleOpenAbonoModal(prov)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-xs"
                            >
                              Liquidar / Abonar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payments / Abonos History Log */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
              <h3 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-600" />
                Histórico de Pagos y Abonos a Proveedores
              </h3>
              <span className="text-xs text-slate-500">{effectivePagos.length} pagos registrados</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs font-sans border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-250 text-[11px] font-extrabold text-slate-650 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Proveedor</th>
                    <th className="py-2.5 px-3">Factura Aplicada</th>
                    <th className="py-2.5 px-3">Método de Pago</th>
                    <th className="py-2.5 px-3">Ref / Banco</th>
                    <th className="py-2.5 px-3 text-right">Monto Pagado</th>
                    <th className="py-2.5 px-3 text-center">Caja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {effectivePagos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No se han registrado pagos a proveedores aún.
                      </td>
                    </tr>
                  ) : (
                    effectivePagos.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">{p.fecha}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{p.proveedor_nombre}</td>
                        <td className="py-2.5 px-3 font-mono text-emerald-700 font-semibold">{p.compra_factura || 'Abono Global'}</td>
                        <td className="py-2.5 px-3">
                          <span className="bg-slate-100 border border-slate-300 px-2 py-0.5 rounded text-[11px] font-mono text-slate-700">
                            {p.metodo_pago}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                          {p.banco_origen ? `${p.banco_origen} ` : ''}{p.numero_referencia ? `Ref:${p.numero_referencia}` : ''}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 text-sm whitespace-nowrap">
                          ${(p.monto_usd || 0).toFixed(2)}
                          <span className="block text-[10px] text-slate-400 font-mono font-normal">
                            Bs {(p.monto_ves || ((p.monto_usd || 0) * (p.tasa_cambio || tasaDia))).toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {p.afecto_caja_efectivo ? (
                            <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">
                              Gaveta Turno
                            </span>
                          ) : (
                            <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded">
                              Externo / Banco
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SUBTAB: COTIZACIONES & COMPARADOR */}
      {/* ========================================================================= */}
      {activeSubTab === 'cotizaciones' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-4 p-4">
          
          <div className="flex justify-between items-center border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-600" />
                Presupuestos y Cotizaciones de Proveedores
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-sans">
                Compare ofertas antes de comprar y conviértalas a recepciones de compra con un solo clic.
              </p>
            </div>
          </div>

          {/* Quotations List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {effectiveCotizaciones.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-400">
                <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2 opacity-60" />
                <p className="font-semibold text-slate-600">No hay cotizaciones registradas.</p>
                <button
                  onClick={() => setShowNewCotizacionModal(true)}
                  className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                >
                  + Cargar una cotización de proveedor
                </button>
              </div>
            ) : (
              effectiveCotizaciones.map(cot => {
                const provName = cot.proveedor_nombre || proveedores.find(p => p.id === cot.proveedor_id)?.razon_social || 'Proveedor';
                const itemsList = getCotItems(cot);
                return (
                  <div key={cot.id} className="bg-white border border-slate-200 hover:border-amber-400 rounded-xl p-4 space-y-3 shadow-xs transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-amber-700 uppercase">Cotización #{cot.numero_cotizacion || cot.id}</span>
                        <h4 className="text-sm font-bold text-slate-900 truncate max-w-[200px]" title={provName}>
                          {provName}
                        </h4>
                        <span className="text-[10px] text-slate-500 block font-mono">Fecha: {cot.fecha}</span>
                      </div>
                      <span className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                        {cot.estatus || 'Pendiente'}
                      </span>
                    </div>

                    {/* Items summary */}
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-500 text-[10px] font-bold border-b border-slate-200 pb-1">
                        <span>PRODUCTO</span>
                        <span>TOTAL</span>
                      </div>
                      {itemsList.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-[11px] text-slate-700">
                          <span className="truncate max-w-[140px]">{item.descripcion || 'Producto'} (x{item.cantidad || 1})</span>
                          <span className="font-mono font-bold">${safeNum(item.total_usd).toFixed(2)}</span>
                        </div>
                      ))}
                      {itemsList.length > 3 && (
                        <span className="text-[10px] text-slate-400 block italic">
                          + {(itemsList.length - 3)} producto(s) más...
                        </span>
                      )}
                    </div>

                    {/* Total & Action */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Total Cotizado:</span>
                        <span className="text-base font-black font-mono text-slate-900">
                          ${safeNum(cot.total_usd).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConvertCotToCompra(cot)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-xs"
                          title="Aprobar cotización y crear recepción de compra"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          Comprar
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await showConfirm('¿Desea eliminar este presupuesto?', 'Eliminar Cotización', { isDanger: true });
                            if (ok && cot.id) onDeleteCotizacion(cot.id);
                          }}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-lg transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REGISTRAR / EDITAR PROVEEDOR (Light Theme) */}
      {/* ========================================================================= */}
      {showAddProvModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden w-full max-w-lg shadow-2xl space-y-4 p-6 text-slate-800 text-left">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600" />
                {editingProv ? 'Modificar Proveedor' : 'Registrar Nuevo Proveedor'}
              </h3>
              <button onClick={() => setShowAddProvModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProveedor} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">RIF / Cédula *</label>
                  <input
                    type="text"
                    required
                    placeholder="J-12345678-9 / V-..."
                    value={formRif}
                    onChange={e => setFormRif(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-mono uppercase focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Razón Social / Comercio *</label>
                  <input
                    type="text"
                    required
                    placeholder="Distribuidora Alimentos C.A."
                    value={formRazonSocial}
                    onChange={e => setFormRazonSocial(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Persona de Contacto</label>
                  <input
                    type="text"
                    placeholder="Ej: Lic. Carlos Pérez"
                    value={formContacto}
                    onChange={e => setFormContacto(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Teléfono / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="0414-1234567"
                    value={formTelefono}
                    onChange={e => setFormTelefono(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    placeholder="ventas@proveedor.com"
                    value={formCorreo}
                    onChange={e => setFormCorreo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Días de Crédito Otorgados</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 = Contado, 15, 30..."
                    value={formDiasCredito}
                    onChange={e => setFormDiasCredito(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-mono focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Dirección / Ubicación</label>
                  <input
                    type="text"
                    placeholder="Av. Principal, Galpón N° 4..."
                    value={formDireccion}
                    onChange={e => setFormDireccion(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddProvModal(false)}
                  className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg text-xs font-bold transition-all"
                >
                  Cancelar (ESC)
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading}
                  className="w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95 disabled:opacity-50"
                >
                  {isActionLoading ? 'Guardando...' : (editingProv ? 'Guardar Cambios' : 'Registrar Proveedor')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NUEVA RECEPCIÓN DE COMPRA / FACTURA DE PROVEEDOR (Light Theme) */}
      {/* ========================================================================= */}
      {showNewCompraModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col text-slate-800 text-left">
            
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-600" />
                Recepción de Mercancía / Factura de Proveedor
              </h3>
              <button onClick={() => setShowNewCompraModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompra} className="flex-1 overflow-y-auto p-5 space-y-5">
              
              {/* Top Purchase Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Proveedor *</label>
                  <select
                    required
                    value={compraProveedorId}
                    onChange={e => setCompraProveedorId(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">-- Seleccione Proveedor --</option>
                    {proveedores.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.razon_social} ({p.rif})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">N° Factura / Control *</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-mono font-bold text-xs pointer-events-none select-none">
                      N°
                    </span>
                    <input
                      type="text"
                      required
                      maxLength={10}
                      placeholder="00012345"
                      value={compraNumeroFactura}
                      onChange={e => {
                        const val = e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase().slice(0, 10);
                        setCompraNumeroFactura(val);
                      }}
                      className="w-full bg-white border border-slate-300 text-slate-800 pl-9 pr-3 py-2 rounded-lg text-xs font-mono font-bold uppercase focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 focus:outline-none shadow-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Condición de Pago</label>
                  <select
                    value={compraCondicion}
                    onChange={e => setCompraCondicion(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Contado">Contado (Pagado ya)</option>
                    <option value="Credito">A Crédito (Genera CxP)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                    {compraCondicion === 'Credito' ? 'Fecha de Vencimiento' : 'Fecha de Emisión'}
                  </label>
                  <input
                    type="date"
                    value={compraCondicion === 'Credito' ? compraFechaVencimiento : compraFechaEmision}
                    onChange={e => compraCondicion === 'Credito' ? setCompraFechaVencimiento(e.target.value) : setCompraFechaEmision(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {compraCondicion === 'Contado' && (
                  <>
                    <div>
                      <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Método de Pago Contado</label>
                      <select
                        value={compraMetodoContado}
                        onChange={e => setCompraMetodoContado(e.target.value as any)}
                        className="w-full bg-white border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="Efectivo$">Efectivo Dólares ($)</option>
                        <option value="EfectivoBs">Efectivo Bolívares (Bs)</option>
                        <option value="TransferenciaVES">Transferencia Bancaria</option>
                        <option value="PagoMovil">Pago Móvil</option>
                        <option value="Zelle">Zelle / Divisas</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        id="compraAfectaCaja"
                        checked={compraAfectaCaja}
                        onChange={e => setCompraAfectaCaja(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500"
                      />
                      <label htmlFor="compraAfectaCaja" className="text-xs text-emerald-700 font-bold cursor-pointer select-none">
                        ¿Egresar de Caja Registradora de turno?
                      </label>
                    </div>
                  </>
                )}
              </div>

              {/* Interactive Rate Selector ($ BCV, € BCV, Manual/Proveedor) */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Tasa de Cambio para la Factura:
                    </span>
                  </div>

                  {/* Rate Mode Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCompraTasaMode('dolar_bcv');
                        setCompraCustomTasa(String(bcvRates.usd || tasaDia));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                        compraTasaMode === 'dolar_bcv'
                          ? 'bg-emerald-600 text-white shadow-2xs font-extrabold'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <span>$ Dólar BCV</span>
                      <span className="font-mono text-[11px] opacity-90">({(bcvRates.usd || tasaDia).toFixed(2)} Bs)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCompraTasaMode('euro_bcv');
                        if (bcvRates.eur) setCompraCustomTasa(String(bcvRates.eur));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                        compraTasaMode === 'euro_bcv'
                          ? 'bg-indigo-600 text-white shadow-2xs font-extrabold'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <span>€ Euro BCV</span>
                      <span className="font-mono text-[11px] opacity-90">({(bcvRates.eur || (tasaDia * 1.08)).toFixed(2)} Bs)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCompraTasaMode('manual')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        compraTasaMode === 'manual'
                          ? 'bg-amber-600 text-white shadow-2xs font-extrabold'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      ⚙️ Manual / Proveedor
                    </button>
                  </div>
                </div>

                {/* Manual Rate Input & Applied Rate Confirmation */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  {compraTasaMode === 'manual' ? (
                    <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 text-xs">
                      <span className="font-bold text-amber-900">Ingrese Tasa de Facturación del Proveedor:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={compraCustomTasa}
                          onChange={e => setCompraCustomTasa(e.target.value)}
                          placeholder="Ej: 920.00"
                          className="w-28 bg-white border border-amber-300 text-slate-900 font-mono font-bold px-2 py-1 rounded text-xs focus:outline-none focus:border-amber-600 shadow-2xs"
                        />
                        <span className="font-bold text-amber-800 font-mono">Bs / USD</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 italic">
                      {compraTasaMode === 'dolar_bcv' ? 'Calculando a tasa oficial Dólar Banco Central de Venezuela.' : 'Calculando a tasa oficial Euro Banco Central de Venezuela.'}
                    </span>
                  )}

                  <div className="text-right">
                    <span className="text-[11px] text-slate-600 mr-1.5">Tasa Aplicada al Cálculo:</span>
                    <strong className="text-emerald-700 font-mono text-sm bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                      {effectiveCompraTasa.toFixed(2)} Bs
                    </strong>
                  </div>
                </div>
              </div>

              {/* Add Product Line with Smart Autocomplete & Barcode Search */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-600" />
                    Buscador Inteligente de Productos (Código de Barras o Descripción)
                  </h4>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Factor de conversión: <strong className="text-slate-700">1 USD = {effectiveCompraTasa.toFixed(2)} Bs</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                  
                  {/* Interactive Autocomplete Search Box */}
                  <div className="sm:col-span-6 relative">
                    <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                      Buscar Producto (Escáner / Código / Nombre)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                        <Search className="w-4 h-4 text-emerald-600" />
                      </span>
                      <input
                        ref={prodSearchInputRef}
                        type="text"
                        placeholder="Escriba descripción o escanee código de barras..."
                        value={prodSearchQuery}
                        onChange={e => {
                          const val = e.target.value;
                          setProdSearchQuery(val);
                          setIsProdSearchOpen(val.trim().length > 0);
                          setProdHighlightedIndex(0);
                          if (selectedProdObj && val !== selectedProdObj.description) {
                            setSelectedProdObj(null);
                            setSelectedProductToAdd('');
                          }
                        }}
                        onFocus={() => {
                          if (prodSearchQuery.trim().length > 0) {
                            setIsProdSearchOpen(true);
                          }
                        }}
                        onKeyDown={handleProdSearchKeyDown}
                        className="w-full bg-white border border-slate-300 text-slate-900 pl-8 pr-8 py-2 rounded-lg text-xs font-sans focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none shadow-xs"
                      />
                      {(prodSearchQuery || selectedProdObj) && (
                        <button
                          type="button"
                          onClick={handleClearSelectedProduct}
                          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                          title="Limpiar búsqueda"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Floating Autocomplete Dropdown List - Solo si el usuario ha escrito */}
                    {isProdSearchOpen && prodSearchQuery.trim().length > 0 && (
                      <div 
                        ref={prodDropdownRef}
                        className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs font-sans"
                      >
                        {searchMatchedProducts.length === 0 ? (
                          <div className="p-3 text-center text-slate-400 text-[11px]">
                            No se encontraron productos que coincidan con "{prodSearchQuery}".
                          </div>
                        ) : (
                          searchMatchedProducts.map((p, idx) => {
                            const isHighlighted = idx === prodHighlightedIndex;
                            const isSelected = selectedProdObj?.id === p.id;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleSelectProduct(p)}
                                onMouseEnter={() => setProdHighlightedIndex(idx)}
                                className={`w-full text-left p-2.5 flex items-center justify-between gap-2 transition-colors ${
                                  isHighlighted ? 'bg-emerald-50 text-emerald-900 border-l-4 border-emerald-500' : 
                                  isSelected ? 'bg-emerald-50/50 text-slate-900' : 'hover:bg-slate-50 text-slate-800'
                                }`}
                              >
                                <div className="flex flex-col min-w-0">
                                  <span className="font-bold truncate text-xs">{p.description}</span>
                                  <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-slate-500">
                                    <span className="bg-slate-100 font-mono text-slate-700 px-1.5 py-0.2 rounded border border-slate-200">
                                      {p.barcode}
                                    </span>
                                    <span>Stock: <strong className={p.stock_actual <= (p.stock_minimo || 0) ? 'text-amber-600' : 'text-slate-700'}>{p.stock_actual}</strong></span>
                                    {p.category && <span className="text-slate-400">• {p.category}</span>}
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <span className="text-[10px] text-slate-400 block uppercase">P. Costo</span>
                                  <span className="font-mono font-bold text-emerald-700 text-xs">
                                    ${p.precio_costo_usd?.toFixed(2) || '0.00'}
                                  </span>
                                  <span className="font-mono text-[9.5px] text-slate-400 block">
                                    Bs {((p.precio_costo_usd || 0) * effectiveCompraTasa).toFixed(2)}
                                  </span>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* Selected Product Pill / Badge */}
                    {selectedProdObj && (
                      <div className="mt-1.5 flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <div className="truncate">
                            <span className="font-bold text-slate-900 text-[11px] block truncate">{selectedProdObj.description}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Cod: <strong className="text-slate-700">{selectedProdObj.barcode}</strong> | Stock actual: <strong className="text-slate-700">{selectedProdObj.stock_actual}</strong>
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="bg-emerald-600 text-white font-mono font-bold text-[10px] px-2 py-0.5 rounded">
                            Costo: ${selectedProdObj.precio_costo_usd?.toFixed(2)}
                          </span>
                          <span className="block text-[9.5px] font-mono text-emerald-800 mt-0.5">
                            Bs {((selectedProdObj.precio_costo_usd || 0) * effectiveCompraTasa).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quantity Input */}
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Cantidad</label>
                    <input
                      ref={qtyInputRef}
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={itemQtyInput}
                      onChange={e => setItemQtyInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddItemToCompra();
                        }
                      }}
                      placeholder="1"
                      className="w-full bg-white border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-mono font-bold focus:border-emerald-500 focus:outline-none shadow-xs"
                    />
                  </div>

                  {/* Cost Input */}
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Costo Unitario ($)</label>
                    <input
                      ref={costInputRef}
                      type="number"
                      step="0.01"
                      min="0"
                      value={itemCostInput}
                      onChange={e => setItemCostInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddItemToCompra();
                        }
                      }}
                      placeholder="0.00"
                      className="w-full bg-white border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-mono font-bold focus:border-emerald-500 focus:outline-none shadow-xs"
                    />
                    {itemCostInput && (
                      <span className="text-[9.5px] text-slate-500 font-mono block mt-0.5 truncate">
                        ≈ Bs {((parseFloat(itemCostInput) || 0) * effectiveCompraTasa).toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Add Button */}
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-transparent block mb-1">Acción</label>
                    <button
                      type="button"
                      onClick={handleAddItemToCompra}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-2 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      + Agregar
                    </button>
                  </div>

                </div>
              </div>

              {/* Items List Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-xs font-sans border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-250 text-[10px] font-extrabold text-slate-650 uppercase">
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Descripción</th>
                      <th className="py-2.5 px-3 text-center">Cantidad</th>
                      <th className="py-2.5 px-3 text-right">Costo Unitario</th>
                      <th className="py-2.5 px-3 text-right">Total USD</th>
                      <th className="py-2.5 px-3 text-right">Total VES</th>
                      <th className="py-2.5 px-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {compraItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400">
                          Ningún producto agregado todavía a esta recepción de compra.
                        </td>
                      </tr>
                    ) : (
                      compraItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-slate-600 text-[11px]">{item.codigo_barras_clave}</td>
                          <td className="py-2 px-3 font-bold text-slate-900">{item.descripcion}</td>
                          <td className="py-2 px-3 text-center font-mono">{item.cantidad}</td>
                          <td className="py-2 px-3 text-right font-mono">${item.costo_unitario_usd.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">${item.total_usd.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">Bs {(item.total_usd * effectiveCompraTasa).toFixed(2)}</td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItemFromCompra(idx)}
                              className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="text-xs text-slate-600">Total Items: <strong className="text-slate-900 font-mono">{compraItems.length}</strong></span>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    Tasa de Facturación: <strong>{effectiveCompraTasa.toFixed(2)} Bs / USD</strong>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-600 uppercase">TOTAL FACTURA:</div>
                  <div className="text-2xl font-black font-mono text-emerald-700">
                    ${totalCompraUSD.toFixed(2)} USD
                  </div>
                  <div className="text-xs text-slate-600 font-mono font-bold">
                    Bs {totalCompraVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewCompraModal(false)}
                  className="w-full sm:w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar (ESC)
                </button>

                <button
                  type="button"
                  onClick={handlePauseCurrentCompra}
                  disabled={!compraProveedorId && !compraNumeroFactura.trim() && compraItems.length === 0}
                  className="w-full sm:w-1/3 bg-amber-500 hover:bg-amber-600 text-slate-900 py-3 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title="Guardar borrador y pausar para continuar más tarde"
                >
                  <Pause className="w-4 h-4 fill-slate-900" />
                  <span>Pausar Recepción</span>
                </button>

                <button
                  type="submit"
                  disabled={isActionLoading || compraItems.length === 0}
                  className="w-full sm:w-1/3 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isActionLoading ? 'Procesando...' : 'GUARDAR Y AUMENTAR STOCK'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REGISTRAR ABONO / PAGO CXP (Light Theme) */}
      {/* ========================================================================= */}
      {showAbonoModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden w-full max-w-lg shadow-2xl space-y-4 p-6 text-slate-800 text-left">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-600" />
                Registrar Pago a Proveedor (CxP)
              </h3>
              <button onClick={() => setShowAbonoModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAbono} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Proveedor *</label>
                <select
                  required
                  value={abonoProveedorId}
                  onChange={e => setAbonoProveedorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:bg-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">-- Seleccionar Proveedor --</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.razon_social} (Deuda: ${p.saldo_pendiente_usd?.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Monto a Pagar (USD) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={abonoMontoUSD}
                    onChange={e => setAbonoMontoUSD(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 pl-8 pr-4 py-2.5 rounded-lg text-sm font-mono font-bold focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                {abonoMontoUSD && (
                  <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                    Equivalente en Bolívares: <strong className="text-slate-800">Bs {((parseFloat(abonoMontoUSD) || 0) * tasaDia).toFixed(2)}</strong> (Tasa: {tasaDia.toFixed(2)})
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Método de Pago</label>
                  <select
                    value={abonoMetodoPago}
                    onChange={e => setAbonoMetodoPago(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:bg-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="Efectivo$">Efectivo Dólares ($)</option>
                    <option value="EfectivoBs">Efectivo Bolívares (Bs)</option>
                    <option value="TransferenciaVES">Transferencia Bancaria (Bs)</option>
                    <option value="PagoMovil">Pago Móvil (Bs)</option>
                    <option value="Zelle">Zelle ($)</option>
                    <option value="Binance">Binance USDT</option>
                    <option value="PayPal">PayPal</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">N° Referencia / Transacción</label>
                  <input
                    type="text"
                    placeholder="Ej: 987456"
                    value={abonoReferencia}
                    onChange={e => setAbonoReferencia(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-mono focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Banco Origen / Destino</label>
                <input
                  type="text"
                  placeholder="Ej: Banesco, Mercantil, Wells Fargo..."
                  value={abonoBancoOrigen}
                  onChange={e => setAbonoBancoOrigen(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="abonoAfectaCaja"
                  checked={abonoAfectaCaja}
                  onChange={e => setAbonoAfectaCaja(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="abonoAfectaCaja" className="text-xs text-slate-800 font-bold cursor-pointer select-none">
                  ¿Descontar de la Caja Abierta del Turno Actual?
                  <span className="block text-[10px] text-slate-500 font-normal">
                    Genera automáticamente un egreso en los movimientos de caja para cuadrar el arqueo.
                  </span>
                </label>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAbonoModal(false)}
                  className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg text-xs font-bold transition-all"
                >
                  Cancelar (ESC)
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading}
                  className="w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95 disabled:opacity-50"
                >
                  {isActionLoading ? 'Procesando...' : 'PROCESAR PAGO CXP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DETALLE DE COMPRA / FACTURA (Light Theme) */}
      {/* ========================================================================= */}
      {selectedCompraDetail && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden w-full max-w-2xl shadow-2xl space-y-4 p-6 text-slate-800 text-left">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  Factura de Compra #{selectedCompraDetail.numero_factura}
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  Proveedor: {selectedCompraDetail.proveedor_nombre} ({selectedCompraDetail.proveedor_rif})
                </span>
              </div>
              <button onClick={() => setSelectedCompraDetail(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs font-sans border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-250 text-[10px] font-extrabold text-slate-650 uppercase">
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Descripción</th>
                    <th className="py-2.5 px-3 text-center">Cantidad</th>
                    <th className="py-2.5 px-3 text-right">Costo Unitario</th>
                    <th className="py-2.5 px-3 text-right">Total USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(selectedCompraDetail.items || []).map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-slate-500 text-[11px]">{item.codigo_barras_clave}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{item.descripcion}</td>
                      <td className="py-2 px-3 text-center font-mono">{item.cantidad}</td>
                      <td className="py-2 px-3 text-right font-mono">${(item.costo_unitario_usd || 0).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">${(item.total_usd || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-600 block">Condición: <strong className="text-slate-900">{selectedCompraDetail.condicion_pago}</strong></span>
                <span className="text-slate-600 block">Estado: <strong className="text-emerald-700">{selectedCompraDetail.estatus}</strong></span>
                <span className="text-slate-500 text-[11px] font-mono block">Tasa de Registro: <strong>{selectedCompraDetail.tasa_cambio || tasaDia} Bs</strong></span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 uppercase block">Total Factura:</span>
                <span className="text-xl font-black font-mono text-emerald-700">${(selectedCompraDetail.total_usd || 0).toFixed(2)}</span>
                <span className="text-xs text-slate-500 font-mono block">Bs {(selectedCompraDetail.total_ves || ((selectedCompraDetail.total_usd || 0) * (selectedCompraDetail.tasa_cambio || tasaDia))).toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedCompraDetail(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-2.5 rounded-lg text-xs font-bold transition-all"
              >
                Cerrar (ESC)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NUEVA COTIZACIÓN DE PROVEEDOR (Light Theme) */}
      {/* ========================================================================= */}
      {showNewCotizacionModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden w-full max-w-2xl shadow-2xl space-y-4 p-6 max-h-[90vh] overflow-y-auto text-slate-800 text-left">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-600" />
                Cargar Presupuesto / Cotización de Proveedor
              </h3>
              <button onClick={() => setShowNewCotizacionModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCotizacion} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Proveedor *</label>
                  <select
                    required
                    value={cotProveedorId}
                    onChange={e => setCotProveedorId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:bg-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">-- Seleccionar --</option>
                    {proveedores.map(p => (
                      <option key={p.id} value={p.id}>{p.razon_social}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">N° Cotización</label>
                  <input
                    type="text"
                    placeholder="COT-0045"
                    value={cotNumero}
                    onChange={e => setCotNumero(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-mono focus:bg-white focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Fecha Vigencia</label>
                  <input
                    type="date"
                    value={cotFechaVigencia}
                    onChange={e => setCotFechaVigencia(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-mono focus:bg-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Add item to quote */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-700 block uppercase">Agregar Producto a Cotizar</span>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-6 relative">
                    <input
                      type="text"
                      placeholder="Escriba o busque producto..."
                      value={cotItemDesc}
                      onChange={e => {
                        setCotItemDesc(e.target.value);
                        setIsCotProdSearchOpen(true);
                      }}
                      onFocus={() => setIsCotProdSearchOpen(true)}
                      className="w-full bg-white border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-sans focus:border-amber-500 focus:outline-none"
                    />

                    {/* Quick suggestion list for cotizaciones */}
                    {isCotProdSearchOpen && cotItemDesc.trim() && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {products
                          .filter(p => p.description.toLowerCase().includes(cotItemDesc.toLowerCase()) || (p.barcode || '').includes(cotItemDesc))
                          .slice(0, 8)
                          .map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setCotItemDesc(p.description);
                                setCotItemCost(String(p.precio_costo_usd || ''));
                                setIsCotProdSearchOpen(false);
                              }}
                              className="w-full text-left p-2 hover:bg-amber-50 text-xs flex justify-between items-center"
                            >
                              <span className="font-bold text-slate-800 truncate">{p.description}</span>
                              <span className="font-mono text-slate-500 text-[11px]">${p.precio_costo_usd?.toFixed(2)}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Cant."
                      value={cotItemQty}
                      onChange={e => setCotItemQty(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Costo $"
                      value={cotItemCost}
                      onChange={e => setCotItemCost(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-800 px-3 py-2 rounded-lg text-xs font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddItemToCotizacion}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg text-xs font-bold transition-all shadow-xs"
                    >
                      + Item
                    </button>
                  </div>
                </div>
              </div>

              {/* Items in quote */}
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-xs font-sans border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-250 text-[10px] text-slate-650 uppercase font-extrabold">
                      <th className="py-2 px-3">Descripción</th>
                      <th className="py-2 px-3 text-center">Cant.</th>
                      <th className="py-2 px-3 text-right">Costo Unit.</th>
                      <th className="py-2 px-3 text-right">Total USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {cotItems.length === 0 ? (
                      <tr><td colSpan={4} className="py-4 text-center text-slate-400">Sin items agregados aún.</td></tr>
                    ) : (
                      cotItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-bold text-slate-800">{item.descripcion}</td>
                          <td className="py-1.5 px-3 text-center font-mono">{item.cantidad}</td>
                          <td className="py-1.5 px-3 text-right font-mono">${item.costo_unitario_usd.toFixed(2)}</td>
                          <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-700">${item.total_usd.toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewCotizacionModal(false)}
                  className="w-full sm:w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar (ESC)
                </button>

                <button
                  type="button"
                  onClick={handlePauseCurrentCotizacion}
                  disabled={!cotProveedorId && !cotNumero.trim() && cotItems.length === 0}
                  className="w-full sm:w-1/3 bg-amber-500 hover:bg-amber-600 text-slate-900 py-2.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title="Guardar borrador y pausar para continuar más tarde"
                >
                  <Pause className="w-4 h-4 fill-slate-900" />
                  <span>Pausar Cotización</span>
                </button>

                <button
                  type="submit"
                  disabled={isActionLoading || cotItems.length === 0}
                  className="w-full sm:w-1/3 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isActionLoading ? 'Guardando...' : 'GUARDAR COTIZACIÓN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECEPCIONES DE COMPRA EN PAUSA (BORRADORES) */}
      {/* ========================================================================= */}
      {showPausedComprasModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col text-slate-800 text-left">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-amber-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-700">
                  <Pause className="w-5 h-5 fill-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Recepciones de Compra en Pausa
                  </h3>
                  <p className="text-xs text-slate-600">
                    Seleccione una recepción guardada para retomar su carga o eliminarla.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowPausedComprasModal(false)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {pausedCompras.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <Pause className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold">No hay recepciones de compra en pausa.</p>
                  <p className="text-xs text-slate-500">
                    Al cargar una nueva recepción de compra, puede presionar "Pausar Recepción" para guardarla y continuar más tarde.
                  </p>
                </div>
              ) : (
                pausedCompras.map((draft) => (
                  <div 
                    key={draft.id} 
                    className="p-4 bg-slate-50 hover:bg-amber-50/40 border border-slate-200 hover:border-amber-300 rounded-xl transition-all shadow-xs space-y-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900 uppercase">
                            {draft.proveedorNombre || 'Proveedor sin asignar'}
                          </span>
                          <span className="bg-slate-200 text-slate-700 font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                            Factura: {draft.compraNumeroFactura || 'S/N'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>📅 Pausado: {draft.timestamp}</span>
                          <span>•</span>
                          <span>Condición: <strong>{draft.compraCondicion}</strong></span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-base font-black font-mono text-emerald-700 block">
                          ${draft.totalUSD.toFixed(2)} USD
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {draft.compraItems.length} {draft.compraItems.length === 1 ? 'producto' : 'productos'}
                        </span>
                      </div>
                    </div>

                    {/* Preview Items */}
                    {draft.compraItems.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200/80">
                        {draft.compraItems.slice(0, 4).map((it, i) => (
                          <span key={i} className="text-[10px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-sans truncate max-w-[200px]">
                            {it.cantidad}x {it.descripcion}
                          </span>
                        ))}
                        {draft.compraItems.length > 4 && (
                          <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md font-bold">
                            +{draft.compraItems.length - 4} más
                          </span>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleDeletePausedCompra(draft.id)}
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Descartar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResumePausedCompra(draft)}
                        className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs px-4 py-1.5 rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Retomar Recepción</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPausedComprasModal(false)}
                className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cerrar (ESC)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: COTIZACIONES EN PAUSA (BORRADORES) */}
      {/* ========================================================================= */}
      {showPausedCotizacionesModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col text-slate-800 text-left">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-amber-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-700">
                  <Pause className="w-5 h-5 fill-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Cotizaciones / Presupuestos en Pausa
                  </h3>
                  <p className="text-xs text-slate-600">
                    Seleccione una cotización guardada para continuar su edición o eliminarla.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowPausedCotizacionesModal(false)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {pausedCotizaciones.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <Pause className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold">No hay cotizaciones en pausa.</p>
                  <p className="text-xs text-slate-500">
                    Al cargar un presupuesto o cotización, puede presionar "Pausar Cotización" para retomarla después.
                  </p>
                </div>
              ) : (
                pausedCotizaciones.map((draft) => (
                  <div 
                    key={draft.id} 
                    className="p-4 bg-slate-50 hover:bg-amber-50/40 border border-slate-200 hover:border-amber-300 rounded-xl transition-all shadow-xs space-y-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900 uppercase">
                            {draft.proveedorNombre || 'Proveedor sin asignar'}
                          </span>
                          <span className="bg-slate-200 text-slate-700 font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                            N°: {draft.cotNumero || 'S/N'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <span>📅 Pausado: {draft.timestamp}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-base font-black font-mono text-amber-700 block">
                          ${draft.totalUSD.toFixed(2)} USD
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {draft.cotItems.length} {draft.cotItems.length === 1 ? 'producto' : 'productos'}
                        </span>
                      </div>
                    </div>

                    {/* Preview Items */}
                    {draft.cotItems.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200/80">
                        {draft.cotItems.slice(0, 4).map((it, i) => (
                          <span key={i} className="text-[10px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-sans truncate max-w-[200px]">
                            {it.cantidad}x {it.descripcion}
                          </span>
                        ))}
                        {draft.cotItems.length > 4 && (
                          <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md font-bold">
                            +{draft.cotItems.length - 4} más
                          </span>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleDeletePausedCotizacion(draft.id)}
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Descartar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResumePausedCotizacion(draft)}
                        className="bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs px-4 py-1.5 rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Retomar Cotización</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPausedCotizacionesModal(false)}
                className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cerrar (ESC)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
