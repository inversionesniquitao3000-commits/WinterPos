import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Product, Client, User, CompanyConfig, SaleItem, Payment, Sale, CierreCaja, CierreDetails, Abono, DivisaOperation } from '../types';
import { 
  ShoppingBag, Search, Trash2, 
  XCircle, ArrowUpRight, 
  Calculator, CheckCircle2, Ticket,
  Clock, ListOrdered, Plus, AlertCircle, DollarSign, RotateCcw, Printer,
  Calendar, Lock, Coins, RefreshCw, ShieldCheck, FileText,
  Banknote, Eye, LogOut, X, Image as ImageIcon, ZoomIn,
  Edit, Minus, Sparkles, Package, Upload
} from 'lucide-react';
import { formatNumberToWordsUSD, printTicketReceipt, formatBs } from '../utils';
import { useDialog } from '../hooks/useDialog';
import CambioDivisasModal from './CambioDivisasModal';
import AuxiliarCalculoPrecios from './AuxiliarCalculoPrecios';

interface CajaPOSProps {
  products: Product[];
  clients: Client[];
  companyConfig: CompanyConfig;
  tasaDia: number;
  tasaVuelto: number;
  currentUser: User;
  onAddClient?: (cli: Client) => Promise<void> | void;
  onRegisterSale: (sale: {
    factura_nro: string;
    client: Client;
    items: SaleItem[];
    subtotal: number;
    descuento: number;
    totalUSD: number;
    totalVES: number;
    pagos: Payment[];
    vueltoUSD: number;
    vueltoVES: number;
  }) => Promise<Sale | undefined> | void;
  onRegisterCajaMovement: (type: 'Entrada' | 'Salida' | 'Devolucion', description: string, usd: number, ves: number, metodoPago?: string, comisionVes?: number, comisionUsd?: number) => void;
  onProcessDivisaOperation?: (op: DivisaOperation) => Promise<boolean> | void;
  cajaAbierta: boolean;
  montoAperturaUsd: number;
  montoAperturaVes: number;
  onAbrirCaja: (usd: number, ves: number) => void;
  onCerrarCaja: (
    realUsd: number, 
    realVes: number,
    details?: CierreDetails
  ) => Promise<CierreCaja>;
  shiftSales: Sale[];
  shiftAbonosUsd: number;
  shiftEntradasUsd: number;
  shiftEntradasVes: number;
  shiftSalidasUsd: number;
  shiftSalidasVes: number;
  shiftDevolucionesUsd: number;
  shiftDevolucionesVes: number;
  onUpdateProductStock: (
    prodId: number,
    type: 'Entrada' | 'Salida' | 'Merma' | 'Devolucion' | 'Entrada Rápida' | 'Devolución',
    qty: number,
    reason: string
  ) => Promise<void>;
  onUpdateProduct?: (prod: Product) => Promise<any> | any;
  onDeleteProduct?: (prodId: number) => Promise<any> | any;
  hasPermission?: (modulo: string, accion: 'ver' | 'crear' | 'editar' | 'eliminar') => boolean;
  onRegisterAbono: (
    clientId: number,
    amountUSD: number,
    payments: import('../types').AbonoPayment[],
    observacion?: string
  ) => void;
  abonos?: Abono[];
  getApiUrl: (path: string) => string;
  nextInvoiceNumber: string;
  lastInvoiceNumber: string | null;
  onLogout: () => void;
}

const formatStockVal = (val: any, aGranel?: boolean) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0';
  if (!aGranel) return Math.round(num).toString();
  return num.toFixed(3);
};

export default function CajaPOS({
  products,
  clients,
  onAddClient,
  companyConfig,
  tasaDia,
  tasaVuelto,
  currentUser,
  onRegisterSale,
  onRegisterCajaMovement,
  onProcessDivisaOperation,
  cajaAbierta,
  montoAperturaUsd: _montoAperturaUsd,
  montoAperturaVes: _montoAperturaVes,
  onAbrirCaja,
  onCerrarCaja,
  shiftSales,
  shiftAbonosUsd: _shiftAbonosUsd,
  shiftEntradasUsd,
  shiftEntradasVes,
  shiftSalidasUsd,
  shiftSalidasVes,
  shiftDevolucionesUsd,
  shiftDevolucionesVes,
  onUpdateProductStock,
  onUpdateProduct,
  onDeleteProduct,
  hasPermission: _hasPermission,
  onRegisterAbono,
  abonos,
  getApiUrl,
  nextInvoiceNumber,
  lastInvoiceNumber,
  onLogout
}: CajaPOSProps) {
  const { showAlert, showConfirm } = useDialog();
  const [isClosingCaja, setIsClosingCaja] = useState(false);
  const [userDismissedApertura, setUserDismissedApertura] = useState(false);
  const [showAperturaModal, setShowAperturaModal] = useState(!cajaAbierta);

  // Right-Click Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; product: Product } | null>(null);

  // Quick Product Modals from Context Menu
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [imageManagerProduct, setImageManagerProduct] = useState<Product | null>(null);
  const [imageManagerUrlInput, setImageManagerUrlInput] = useState<string>('');
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState<boolean>(false);

  // States for MODIFICAR FICHA DE PRODUCTO Modal
  const [editClave, setEditClave] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editCat, setEditCat] = useState('GENERAL');
  const [editTaxActive, setEditTaxActive] = useState(true);
  const [editTaxName, setEditTaxName] = useState('IVA');
  const [editTaxPct, setEditTaxPct] = useState('16');
  const [editDesc, setEditDesc] = useState('');
  const [editAGranel, setEditAGranel] = useState(false);
  const [editVencimiento, setEditVencimiento] = useState('');
  const [editCost, setEditCost] = useState('0');
  const [editDetail, setEditDetail] = useState('0');
  const [editMayor, setEditMayor] = useState('0');
  const [editMinStock, setEditMinStock] = useState('5');
  const [editWholesaleQty, setEditWholesaleQty] = useState('6');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [isAuxExpandedEdit, setIsAuxExpandedEdit] = useState(false);
  const [showQuickAddCatModal, setShowQuickAddCatModal] = useState(false);
  const [newCatInputName, setNewCatInputName] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    set.add('GENERAL');
    products.forEach(p => { if (p.category) set.add(p.category.toUpperCase()); });
    customCategories.forEach(c => set.add(c.toUpperCase()));
    return Array.from(set);
  }, [products, customCategories]);

  useEffect(() => {
    if (editingProduct) {
      setEditClave((editingProduct as any).clave || editingProduct.barcode || '');
      setEditBarcode(editingProduct.barcode || '');
      setEditCat(editingProduct.category || 'GENERAL');
      setEditTaxActive(editingProduct.exento_impuesto !== true);
      setEditTaxName((editingProduct as any).tax_name || 'IVA');
      setEditTaxPct((editingProduct as any).tax_pct?.toString() || editingProduct.porcentaje_impuesto?.toString() || '16');
      setEditDesc(editingProduct.description || '');
      setEditAGranel(editingProduct.a_granel === true);
      setEditVencimiento(editingProduct.fecha_vencimiento || '');
      setEditCost(editingProduct.precio_costo_usd?.toString() || '0');
      setEditDetail(editingProduct.precio_detalle_usd?.toString() || '0');
      setEditMayor(editingProduct.precio_mayor_usd?.toString() || '0');
      setEditMinStock(editingProduct.stock_minimo?.toString() || '5');
      setEditWholesaleQty(editingProduct.cantidad_mayorista?.toString() || '6');
      setEditImageUrl(editingProduct.imagen_url || '');
    }
  }, [editingProduct]);

  const handleUpdateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const desc = editDesc.trim();
    if (!desc) {
      showAlert('La descripción del artículo es obligatoria.', 'Campo Requerido', 'warning');
      return;
    }

    const cost = parseFloat(editCost) || 0;
    const detail = parseFloat(editDetail) || 0;
    const mayor = parseFloat(editMayor) || 0;
    const minStock = parseInt(editMinStock) || 5;
    const wholesaleQty = parseInt(editWholesaleQty) || 6;
    const taxPctNum = editTaxActive ? (parseFloat(editTaxPct) || 16) : 0;

    const updated: Product = {
      ...editingProduct,
      barcode: editBarcode.trim() || editClave.trim(),
      category: editCat.toUpperCase(),
      description: desc.toUpperCase(),
      a_granel: editAGranel,
      exento_impuesto: !editTaxActive,
      porcentaje_impuesto: taxPctNum,
      fecha_vencimiento: editVencimiento || undefined,
      precio_costo_usd: cost,
      precio_detalle_usd: detail,
      precio_mayor_usd: mayor,
      stock_minimo: minStock,
      cantidad_mayorista: wholesaleQty,
      imagen_url: editImageUrl.trim()
    };
    (updated as any).clave = editClave.trim() || editBarcode.trim();
    (updated as any).tax_name = editTaxActive ? editTaxName : undefined;
    (updated as any).tax_pct = taxPctNum;

    if (onUpdateProduct) {
      await onUpdateProduct(updated);
    }
    setEditingProduct(null);
    showAlert('✅ Ficha técnica del producto actualizada exitosamente.', 'Producto Guardado', 'info');
  };

  useEffect(() => {
    const handleCloseContextMenu = () => setContextMenu(null);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleCloseContextMenu);
    window.addEventListener('scroll', handleCloseContextMenu, true);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('click', handleCloseContextMenu);
      window.removeEventListener('scroll', handleCloseContextMenu, true);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const handleGenerateAiImageForProduct = async (prod: Product) => {
    setIsGeneratingAiImage(true);
    try {
      const res = await fetch(getApiUrl('/ai/generate-product-image'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: prod.description,
          category: prod.category,
          barcode: prod.barcode,
          saveLocal: true
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.imageUrl) {
        const updatedProd = { ...prod, imagen_url: data.imageUrl };
        if (onUpdateProduct) await onUpdateProduct(updatedProd);
        showAlert('✅ Imagen generada con Inteligencia Artificial y asociada al producto con éxito.', 'Imagen Generada', 'info');
      } else {
        showAlert('No se pudo generar la imagen: ' + (data.error || 'Respuesta no exitosa'), 'Error IA', 'warning');
      }
    } catch (err: any) {
      showAlert(`Error conectando con servicio de IA: ${err.message}`, 'Error IA', 'warning');
    } finally {
      setIsGeneratingAiImage(false);
    }
  };

  // Quick Client Registration Modal State
  const [showQuickClientModal, setShowQuickClientModal] = useState(false);
  const [quickDoc, setQuickDoc] = useState('V-');
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickAddress, setQuickAddress] = useState('');
  const [quickCreditLimit, setQuickCreditLimit] = useState('0');
  const [quickDiscount, setQuickDiscount] = useState('0');
  const [quickPrecioCosto, setQuickPrecioCosto] = useState(false);
  const [aperturaUsdVal, setAperturaUsdVal] = useState('');
  const [aperturaVesVal, setAperturaVesVal] = useState('');

  // Sync showAperturaModal whenever cajaAbierta prop changes
  useEffect(() => {
    if (isClosingCaja || cajaAbierta) {
      setShowAperturaModal(false);
      setUserDismissedApertura(false);
    } else if (!userDismissedApertura) {
      setShowAperturaModal(true);
    }
  }, [cajaAbierta, isClosingCaja, userDismissedApertura]);

  const isAdmin = useMemo(() => {
    if (!currentUser) return false;
    const r = (currentUser.rol || '').toLowerCase();
    return r.includes('admin') || r === 'administrador';
  }, [currentUser]);

  const [showCierreModal, setShowCierreModal] = useState(false);
  const [cierreRealUsd, setCierreRealUsd] = useState('0');
  const [cierreRealVes, setCierreRealVes] = useState('0');
  const [cierreRealEur, setCierreRealEur] = useState('0');
  const [hasEurInShift, setHasEurInShift] = useState(false);
  const [cierreResult, setCierreResult] = useState<CierreCaja | null>(null);

  // Product Image Zoom State
  const [zoomedProduct, setZoomedProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (!zoomedProduct) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedProduct(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [zoomedProduct]);

  // Manual movements state
  const [showMovementsModal, setShowMovementsModal] = useState(false);

  // WhatsApp Cierre State
  const [waCierreStatus, setWaCierreStatus] = useState({
    status: 'DISCONNECTED',
    enabled: false,
    groupId: '',
    messageTemplate: ''
  });
  const [sendToWhatsApp, setSendToWhatsApp] = useState(true);
  const [hideZeroLines, setHideZeroLines] = useState(true);
  const [isSendingWa, setIsSendingWa] = useState(false);

  const fetchWaCierreStatus = async () => {
    try {
      const res = await fetch(getApiUrl('/whatsapp/status'));
      if (res.ok) {
        const data = await res.json();
        setWaCierreStatus({
          status: data.status,
          enabled: data.config?.enabled || false,
          groupId: data.config?.groupId || '',
          messageTemplate: data.config?.messageTemplate || ''
        });
      }
    } catch (err) {
      console.error('Error fetching WhatsApp status for closeout:', err);
    }
  };

  useEffect(() => {
    if (showCierreModal) {
      fetchWaCierreStatus();
      // Check if there are EUR operations or EUR sales in active shift
      const checkEurOps = async () => {
        try {
          const termName = localStorage.getItem('pos_terminal_name') || 'CAJA_01';
          const uKey = currentUser?.id || currentUser?.usuario || 'default';
          let aperturaStr = localStorage.getItem(`pos_apertura_fecha_${uKey}`) || localStorage.getItem(`pos_apertura_fecha_${currentUser?.usuario}`) || localStorage.getItem('pos_apertura_fecha') || '';
          
          // Also try to get fresh estado from server
          try {
            const estadoRes = await fetch(getApiUrl(`/cajas/estado?terminal=${encodeURIComponent(termName)}&usuarioId=${currentUser.id}&usuarioNombre=${encodeURIComponent(currentUser.nombre)}`));
            if (estadoRes.ok) {
              const cajaData = await estadoRes.json();
              if (cajaData?.fechaApertura) {
                aperturaStr = cajaData.fechaApertura;
              }
            }
          } catch (err) {
            // fallback to local aperturaStr
          }

          const aperturaMs = aperturaStr ? new Date(aperturaStr).getTime() : 0;

          let hasEurInOps = false;
          const res = await fetch(getApiUrl('/cajas/divisas-operaciones'));
          if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list)) {
              const eurOps = list.filter((op: any) => {
                const opTime = op.timestamp || (op.fecha ? new Date(op.fecha).getTime() : 0);
                // Exclude operations prior to current session opening
                if (aperturaMs > 0 && opTime > 0 && opTime < (aperturaMs - 60000)) return false;
                // If aperturaMs is not available, do not include historical operations from past days
                if (!aperturaMs && opTime > 0 && (Date.now() - opTime > 12 * 60 * 60 * 1000)) return false;
                if (op.terminal && op.terminal !== termName) return false;
                if (op.usuario_id && currentUser?.id && Number(op.usuario_id) !== Number(currentUser.id)) return false;
                return op.currency === 'EUR' || (op.tipo_operacion === 'COMPRA_DIVISA' && op.currency === 'EUR');
              });
              hasEurInOps = eurOps.length > 0;
            }
          }

          // Check if any sale in current shift had Euro payments
          const hasEurInSales = (shiftSales || []).some(s => 
            s && !s.factura_nro?.startsWith('DEV-') && (s.pagos || []).some((p: any) => 
              p.metodo === 'Efectivo€' || p.metodo === 'EUR' || (p as any).currency === 'EUR' || (p.metodo && p.metodo.includes('€'))
            )
          );

          setHasEurInShift(hasEurInOps || hasEurInSales);
        } catch (e) {
          console.warn('⚠️ Error al verificar operaciones de Euro para el cierre:', e);
          setHasEurInShift(false);
        }
      };
      checkEurOps();
    }
  }, [showCierreModal, shiftSales]);
  const [movType, setMovType] = useState<'Entrada' | 'Salida'>('Entrada');
  const [movDesc, setMovDesc] = useState('');
  const [movUsd, setMovUsd] = useState('');
  const [movVes, setMovVes] = useState('');

  // Devolución state variables
  const [showDevolucionModal, setShowDevolucionModal] = useState(false);
  const [showCambioDivisasModal, setShowCambioDivisasModal] = useState(false);

  const handleProcessDivisaOperation = (op: any) => {
    if (op.tipo_operacion === 'COMPRA_DIVISA') {
      const usdAmount = op.currency === 'USD' 
        ? op.monto_divisa 
        : (op.monto_ves_entregado && tasaDia > 0 ? op.monto_ves_entregado / tasaDia : op.monto_divisa);
      const vesSalida = op.monto_ves_entregado;
      onRegisterCajaMovement('Entrada', `[CAMBIO DIVISAS] Recepción ${op.monto_divisa} ${op.currency} a tasa ${op.tasa_aplicada.toFixed(2)}`, usdAmount, 0);
      onRegisterCajaMovement('Salida', `[CAMBIO DIVISAS] Entrega de Bs Efectivo (${op.monto_divisa} ${op.currency} @ ${op.tasa_aplicada.toFixed(2)})`, 0, vesSalida);
    } else if (op.tipo_operacion === 'VENTA_EFECTIVO') {
      const vesSalida = op.monto_ves_entregado;
      const vesEntradaDigital = op.monto_digital_cobrado_ves;
      const metodoCobro = op.metodo_cobro || 'BIOPAGO';
      const cVes = op.comision_monto_ves || 0;
      const cUsd = op.comision_monto_usd || 0;
      // 1. Salida de billetes en Bs de la gaveta física
      onRegisterCajaMovement('Salida', `[VENTA EFECTIVO] Entrega Bs Efectivo (Comisión ${op.comision_pct}%)`, 0, vesSalida, 'EFECTIVO', 0, 0);
      // 2. Entrada digital con su método de pago correspondiente (para guardar en la tabla Movimientos_Caja de Postgres)
      onRegisterCajaMovement('Entrada', `[VENTA EFECTIVO] Cobro Digital via ${metodoCobro} (+${op.comision_pct}% comisión)`, 0, vesEntradaDigital, metodoCobro, cVes, cUsd);
    }

    if (onProcessDivisaOperation) {
      onProcessDivisaOperation(op);
    }
  };
  const [devSearchTerm, setDevSearchTerm] = useState('');
  const [allSalesList, setAllSalesList] = useState<Sale[]>([]);
  const [devSelectedSale, setDevSelectedSale] = useState<Sale | null>(null);
  const [devItems, setDevItems] = useState<Array<{ 
    product: Product; 
    qty: number; 
    prevReturnedQty: number; 
    remainingQty: number; 
    priceUSD: number; 
    returnQty: number;
    inventoryDest: 'disponible' | 'merma';
  }>>([]);
  const [devMotivo, setDevMotivo] = useState('');
  const [devRefundCurrency, setDevRefundCurrency] = useState<'USD' | 'VES'>('USD');
  const [showDevConfirmModal, setShowDevConfirmModal] = useState(false);

  // Canje / Reemplazo State
  const [devExchangeSearch, setDevExchangeSearch] = useState('');
  const [devExchangeItems, setDevExchangeItems] = useState<Array<{
    product: Product;
    qty: number;
    priceUSD: number;
  }>>([]);
  const [devExchangeDiffMethod, setDevExchangeDiffMethod] = useState<'Efectivo$' | 'EfectivoBs' | 'PagoMovil' | 'TarjetaBs' | 'Biopago' | 'CreditoCliente'>('Efectivo$');

  // ESC key listener to close modals
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAperturaModal) {
          onLogout();
          return;
        }
        setShowDevConfirmModal(false);
        setShowDevolucionModal(false);
        setShowCambioDivisasModal(false);
        setShowQuickClientModal(false);
        if (typeof setShowEntradaRapidaModal === 'function') {
          setShowEntradaRapidaModal(false);
        }
      }
    };
    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, [showAperturaModal, onLogout]);

  const [devDateFilter, setDevDateFilter] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  const handleOpenDevolucion = async () => {
    let salesData: Sale[] = [];
    try {
      const res = await fetch(getApiUrl('/sales'));
      if (res.ok) {
        salesData = await res.json();
      }
    } catch (e) {
      console.error('Error fetching sales for devolucion:', e);
    }

    if (!salesData || salesData.length === 0) {
      try {
        const local = JSON.parse(localStorage.getItem('pos_sales_log') || '[]');
        salesData = Array.isArray(local) && local.length > 0 ? local : shiftSales;
      } catch (err) {
        salesData = shiftSales;
      }
    }

    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    setAllSalesList(salesData);
    setDevSelectedSale(null);
    setDevItems([]);
    setDevMotivo('');
    setDevSearchTerm('');
    setDevDateFilter(todayStr);
    setDevRefundCurrency('USD');
    setShowDevolucionModal(true);
  };

  const filteredDevSales = useMemo(() => {
    const listToUse = allSalesList.length > 0 ? allSalesList : shiftSales;

    let sourceSales: Sale[] = [];
    if (isAdmin) {
      // Administrator can view all sales across dates, filtered by date selector if active
      sourceSales = listToUse.filter(s => {
        if (!s || !s.factura_nro || s.factura_nro.startsWith('DEV-')) return false;
        if (devDateFilter.trim() !== '') {
          const saleDateStr = (s.fecha || '').substring(0, 10);
          return saleDateStr === devDateFilter.trim();
        }
        return true;
      });
    } else {
      // Non-admin users (Cajeros, Operadores, etc.) can ONLY view and return invoices from their current active open session
      sourceSales = shiftSales.filter(s => s && s.factura_nro && !s.factura_nro.startsWith('DEV-'));
    }

    const sortedSales = [...sourceSales].sort((a, b) => {
      const idA = typeof a.id === 'number' ? a.id : 0;
      const idB = typeof b.id === 'number' ? b.id : 0;
      if (idA !== idB) return idB - idA;
      return (b.factura_nro || '').localeCompare(a.factura_nro || '');
    });

    if (devSearchTerm.trim() === '') return sortedSales;
    const term = devSearchTerm.toLowerCase();
    return sortedSales.filter(sale => 
      sale.factura_nro?.toLowerCase().includes(term) ||
      sale.client?.nombre?.toLowerCase().includes(term) ||
      sale.client?.cedula_rif?.toLowerCase().includes(term)
    );
  }, [devSearchTerm, devDateFilter, allSalesList, shiftSales, isAdmin]);

  // Helper para auditar las devoluciones previamente aplicadas a una factura
  const getSaleReturnInfo = useCallback((sale: Sale, salesList: Sale[]) => {
    if (!sale || !sale.factura_nro) {
      return { isFullyReturned: false, isPartiallyReturned: false, itemReturnedQtys: {} as Record<string, number>, totalReturnedUsd: 0, totalOriginalQty: 0, totalReturnedQty: 0 };
    }

    const rawDevCode = `DEV-${sale.factura_nro.replace('FAC-', '')}`;
    const affectedSales = salesList.filter(s => 
      s && s.factura_nro && s.factura_nro.startsWith('DEV-') && 
      ((s as any).factura_afectada === sale.factura_nro || 
       s.factura_nro === rawDevCode || 
       s.factura_nro.startsWith(`${rawDevCode}-`))
    );

    const itemReturnedQtys: Record<string, number> = {};
    let totalReturnedUsd = 0;

    affectedSales.forEach(devSale => {
      totalReturnedUsd += Math.abs(devSale.totalUSD || 0);
      (devSale.items || []).forEach(devItem => {
        const code = devItem.product?.barcode || (devItem as any).barcode || '';
        const qty = Math.abs(typeof devItem.qty === 'number' ? devItem.qty : (parseFloat(String(devItem.qty)) || 0));
        if (code) {
          itemReturnedQtys[code] = (itemReturnedQtys[code] || 0) + qty;
        }
      });
    });

    let totalOriginalQty = 0;
    let totalReturnedQty = 0;

    (sale.items || []).forEach(item => {
      const code = item.product?.barcode || (item as any).barcode || '';
      const originalQty = typeof item.qty === 'number' ? item.qty : (parseFloat(String(item.qty || 0)) || 0);
      const returnedQty = itemReturnedQtys[code] || 0;
      
      totalOriginalQty += originalQty;
      totalReturnedQty += Math.min(originalQty, returnedQty);
    });

    const isFullyReturned = totalOriginalQty > 0 && totalReturnedQty >= totalOriginalQty - 0.001;
    const isPartiallyReturned = !isFullyReturned && totalReturnedQty > 0.001;

    return {
      isFullyReturned,
      isPartiallyReturned,
      totalReturnedQty,
      totalOriginalQty,
      itemReturnedQtys,
      totalReturnedUsd
    };
  }, []);

  const handleSelectDevSale = (sale: Sale) => {
    setDevSelectedSale(sale);
    setDevMotivo('');
    setDevExchangeSearch('');
    setDevExchangeItems([]);
    const paidInBs = (sale.pagos || []).some(p => p.metodo !== 'Efectivo$' && p.metodo !== 'CreditoCliente');
    setDevRefundCurrency(paidInBs ? 'VES' : 'USD');

    const salesList = allSalesList.length > 0 ? allSalesList : shiftSales;
    const returnInfo = getSaleReturnInfo(sale, salesList);

    const items = (sale.items || []).map(item => {
      const barcode = item?.product?.barcode || '';
      const description = item?.product?.description || 'Producto sin descripción';
      const price = parseFloat(String((item as any)?.precio_unitario_usd || item?.priceUSD || item?.product?.precio_detalle_usd || 0));
      const qty = typeof item?.qty === 'number' ? item.qty : (parseFloat(String(item?.qty || 0)) || 0);
      const prevReturnedQty = returnInfo.itemReturnedQtys[barcode] || 0;
      const remainingQty = Math.max(0, parseFloat((qty - prevReturnedQty).toFixed(3)));

      const fullProd = products.find(p => p.barcode === barcode) || {
        id: item?.product?.id || Date.now() + Math.random(),
        barcode: barcode,
        description: description,
        precio_costo_usd: item?.product?.precio_costo_usd || 0
      } as Product;
      
      return {
        product: fullProd,
        qty: qty,
        prevReturnedQty,
        remainingQty,
        priceUSD: price,
        returnQty: 0,
        inventoryDest: 'disponible' as const
      };
    });
    setDevItems(items);
  };

  const handleUpdateDevQty = (index: number, val: number) => {
    setDevItems(prev => prev.map((item, idx) => {
      if (idx === index) {
        const cleanVal = item.product.a_granel ? val : Math.round(val);
        const clampedVal = Math.max(0, Math.min(item.remainingQty, cleanVal));
        return { ...item, returnQty: clampedVal };
      }
      return item;
    }));
  };

  const handleUpdateDevDest = (index: number, dest: 'disponible' | 'merma') => {
    setDevItems(prev => prev.map((item, idx) => idx === index ? { ...item, inventoryDest: dest } : item));
  };

  const handleSelectAllForDev = () => {
    setDevItems(prev => prev.map(item => ({
      ...item,
      returnQty: item.remainingQty
    })));
  };

  const handleAddExchangeProduct = (prod: Product) => {
    setDevExchangeItems(prev => {
      const exists = prev.find(p => p.product.id === prod.id || p.product.barcode === prod.barcode);
      if (exists) {
        return prev.map(p => (p.product.id === prod.id || p.product.barcode === prod.barcode) ? { ...p, qty: p.qty + 1 } : p);
      }
      return [...prev, { product: prod, qty: 1, priceUSD: prod.precio_detalle_usd }];
    });
    setDevExchangeSearch('');
  };

  const handleUpdateExchangeQty = (index: number, val: number) => {
    setDevExchangeItems(prev => prev.map((item, idx) => {
      if (idx === index) {
        const cleanVal = item.product.a_granel ? Math.max(0, val) : Math.max(0, Math.round(val));
        return { ...item, qty: cleanVal };
      }
      return item;
    }).filter(i => i.qty > 0));
  };

  const handleRemoveExchangeItem = (index: number) => {
    setDevExchangeItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const devRefundTotal = useMemo(() => {
    return devItems.reduce((acc, item) => acc + (item.returnQty * item.priceUSD), 0);
  }, [devItems]);

  const devExchangeTotal = useMemo(() => {
    return devExchangeItems.reduce((acc, item) => acc + (item.qty * item.priceUSD), 0);
  }, [devExchangeItems]);

  const devNetBalance = useMemo(() => {
    return devRefundTotal - devExchangeTotal;
  }, [devRefundTotal, devExchangeTotal]);

  const handleProcessDevolucion = () => {
    if (!devSelectedSale || devRefundTotal === 0 || !devMotivo.trim()) return;
    setShowDevConfirmModal(true);
  };

  const executeDevolucionProcess = async () => {
    const currentSale = devSelectedSale;
    if (!currentSale) return;
    setShowDevConfirmModal(false);
    try {
      const isCreditSale = currentSale.pagos?.some(p => p.metodo === 'CreditoCliente');
      const hasExchange = devExchangeItems.length > 0;
      
      let returnPagos: Payment[] = [];

      if (devNetBalance > 0) {
        // Client receives refund or credit reduction
        if (isCreditSale) {
          returnPagos = [{
            metodo: 'CreditoCliente',
            monto: -devNetBalance,
            montoUSD: -devNetBalance
          }];
        } else {
          const refundCurrency = devRefundCurrency === 'VES' ? 'EfectivoBs' : 'Efectivo$';
          const refundUsd = devRefundCurrency === 'USD' ? devNetBalance : 0;
          const refundVes = devRefundCurrency === 'VES' ? devNetBalance * tasaDia : 0;

          onRegisterCajaMovement(
            'Devolucion',
            `Devolución/Canje Saldo a Favor FAC: ${currentSale.factura_nro} - Motivo: ${devMotivo}`,
            refundUsd,
            refundVes
          );

          returnPagos = [{ 
            metodo: refundCurrency as any, 
            monto: devRefundCurrency === 'USD' ? -devNetBalance : -(devNetBalance * tasaDia), 
            montoUSD: -devNetBalance 
          }];
        }
      } else if (devNetBalance < 0) {
        // Client pays extra difference for higher price replacement items
        const extraToPay = Math.abs(devNetBalance);
        const extraVes = extraToPay * tasaDia;

        if (devExchangeDiffMethod === 'CreditoCliente') {
          returnPagos = [{
            metodo: 'CreditoCliente',
            monto: extraToPay,
            montoUSD: extraToPay
          }];
        } else {
          const payUsd = devExchangeDiffMethod === 'Efectivo$' ? extraToPay : 0;
          const payVes = devExchangeDiffMethod !== 'Efectivo$' ? extraVes : 0;

          onRegisterCajaMovement(
            'Entrada',
            `Diferencia Cobrada por Canje FAC: ${currentSale.factura_nro} - Motivo: ${devMotivo}`,
            payUsd,
            payVes,
            devExchangeDiffMethod
          );

          returnPagos = [{
            metodo: devExchangeDiffMethod as any,
            monto: devExchangeDiffMethod === 'Efectivo$' ? extraToPay : extraVes,
            montoUSD: extraToPay
          }];
        }
      } else {
        // Even exchange ($0 net difference)
        returnPagos = [{
          metodo: 'Efectivo$',
          monto: 0,
          montoUSD: 0
        }];
      }

      // Register return sale DEV-...
      const rawDevCode = `DEV-${currentSale.factura_nro.replace('FAC-', '')}`;
      const salesList = allSalesList.length > 0 ? allSalesList : shiftSales;
      const existingDevs = salesList.filter(s => 
        s && s.factura_nro && s.factura_nro.startsWith('DEV-') && 
        ((s as any).factura_afectada === currentSale.factura_nro || 
         s.factura_nro === rawDevCode || 
         s.factura_nro.startsWith(`${rawDevCode}-`))
      );

      const devFacturaNro = existingDevs.length === 0 
        ? rawDevCode 
        : `${rawDevCode}-${existingDevs.length + 1}`;

      const returnSaleResult = {
        factura_nro: devFacturaNro,
        factura_afectada: currentSale.factura_nro,
        client: currentSale.client,
        items: devItems.filter(i => i.returnQty > 0).map(i => ({
          product: i.product,
          qty: i.returnQty,
          priceType: 'Detalle' as const,
          priceUSD: i.priceUSD,
          totalUSD: -(i.returnQty * i.priceUSD),
          inventoryDest: i.inventoryDest || 'disponible'
        })),
        subtotal: -devRefundTotal,
        descuento: 0,
        totalUSD: -devRefundTotal,
        totalVES: -(devRefundTotal * tasaDia),
        pagos: returnPagos,
        vueltoUSD: 0,
        vueltoVES: 0
      };

      await onRegisterSale(returnSaleResult);

      // Register replacement products sale if exchange items were selected
      if (hasExchange) {
        const exchangeSaleResult = {
          factura_nro: '',
          client: currentSale.client,
          items: devExchangeItems.map(i => ({
            product: i.product,
            qty: i.qty,
            priceType: 'Detalle' as const,
            priceUSD: i.priceUSD,
            totalUSD: i.qty * i.priceUSD
          })),
          subtotal: devExchangeTotal,
          descuento: 0,
          totalUSD: devExchangeTotal,
          totalVES: devExchangeTotal * tasaDia,
          pagos: returnPagos.map(p => ({ ...p, monto: Math.abs(p.monto), montoUSD: Math.abs(p.montoUSD) })),
          vueltoUSD: 0,
          vueltoVES: 0
        };

        await onRegisterSale(exchangeSaleResult);
      }

      if (hasExchange) {
        showToast(`Canje y devolución procesados con éxito. Mercancía e inventario actualizados.`, 'success');
      } else if (isCreditSale) {
        showToast(`Devolución de $${devRefundTotal.toFixed(2)} USD procesada con éxito. Se abonó el monto a la cuenta del cliente y el inventario fue actualizado.`, 'success');
      } else {
        showToast(`Devolución de $${devRefundTotal.toFixed(2)} USD procesada con éxito. El inventario y la caja han sido actualizados.`, 'success');
      }
      
      setShowDevolucionModal(false);
      setDevSelectedSale(null);
      setDevItems([]);
      setDevExchangeItems([]);
      setDevMotivo('');
    } catch (e) {
      console.error(e);
      showToast("Error al registrar la devolución o canje de mercancía.", "error");
    }
  };

  // POS State
  const [selectedClient, setSelectedClient] = useState<Client>(() => {
    try {
      const savedDoc = localStorage.getItem('pos_current_client_doc');
      if (savedDoc) {
        const match = clients.find(c => c.cedula_rif === savedDoc);
        if (match) return match;
      }
    } catch (e) {
      console.error(e);
    }
    return clients.find(c => c.cedula_rif === 'V-00000000') || clients[0];
  });
  
  // Searchable Client Combobox State
  const [clientSearchTerm, setClientSearchTerm] = useState<string>('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState<boolean>(false);
  const [clientSelectedIndex, setClientSelectedIndex] = useState<number>(-1);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const clientListContainerRef = useRef<HTMLDivElement>(null);

  const filteredClients = useMemo(() => {
    const term = clientSearchTerm.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter(c =>
      c.nombre.toLowerCase().includes(term) ||
      c.cedula_rif.toLowerCase().includes(term) ||
      (c.telefono && c.telefono.toLowerCase().includes(term))
    );
  }, [clients, clientSearchTerm]);

  // Scroll active client item into view
  useEffect(() => {
    if (clientSelectedIndex >= 0 && clientListContainerRef.current) {
      const activeItem = clientListContainerRef.current.children[clientSelectedIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [clientSelectedIndex]);

  // Click outside to close client dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectClient = (cli: Client) => {
    setSelectedClient(cli);
    setDiscountPct(cli.porcentaje_descuento);
    setClientSearchTerm('');
    setClientSelectedIndex(-1);
    setIsClientDropdownOpen(false);
    localStorage.setItem('pos_current_client_doc', cli.cedula_rif);

    // Recalculate cart item prices for the selected client
    if (cli.aplica_precio_costo) {
      setSaleItems(prev => prev.map(item => {
        const costPrice = item.product.precio_costo_usd;
        return { ...item, priceUSD: costPrice, priceType: 'Costo', totalUSD: item.qty * costPrice };
      }));
    } else {
      setSaleItems(prev => prev.map(item => {
        const normalPrice = item.qty >= item.product.cantidad_mayorista ? item.product.precio_mayor_usd : item.product.precio_detalle_usd;
        const normalType = item.qty >= item.product.cantidad_mayorista ? 'Mayor' : 'Detalle';
        return { ...item, priceUSD: normalPrice, priceType: normalType, totalUSD: item.qty * normalPrice };
      }));
    }

    focusSearchInput();
  };
  
  const [selectedSeller, setSelectedSeller] = useState<string>(currentUser.nombre);
  
  const [searchProdTerm, setSearchProdTerm] = useState('');
  const [searchSelectedIndex, setSearchSelectedIndex] = useState<number>(-1);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  const productsByBarcodeMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (p.barcode) {
        map.set(p.barcode.toUpperCase().trim(), p);
      }
      if (p.id) {
        map.set(p.id.toString(), p);
      }
    }
    return map;
  }, [products]);

  const searchSuggestions = useMemo(() => {
    const term = searchProdTerm.trim().toLowerCase();
    if (!term) return [];

    // Si coincide exactamente con un código de barra, priorizar de inmediato
    const exact = productsByBarcodeMap.get(term.toUpperCase());
    if (exact && term.length >= 5) {
      return [exact];
    }

    const matches: Product[] = [];
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const desc = p.description.toLowerCase();
      const code = (p.barcode || '').toLowerCase();
      if (code.startsWith(term) || desc.includes(term) || code.includes(term)) {
        matches.push(p);
        if (matches.length >= 35) break; // Límite de colección para máximo rendimiento
      }
    }

    return matches.sort((a, b) => {
      const aStock = typeof a.stock_actual === 'number' ? a.stock_actual : (parseFloat(a.stock_actual as any) || 0);
      const bStock = typeof b.stock_actual === 'number' ? b.stock_actual : (parseFloat(b.stock_actual as any) || 0);
      const aHasStock = aStock > 0 ? 1 : 0;
      const bHasStock = bStock > 0 ? 1 : 0;

      // 1. Con stock primero
      if (aHasStock !== bHasStock) return bHasStock - aHasStock;

      // 2. Coincidencia al inicio por código
      const aCodeStarts = (a.barcode || '').toLowerCase().startsWith(term) ? 1 : 0;
      const bCodeStarts = (b.barcode || '').toLowerCase().startsWith(term) ? 1 : 0;
      if (aCodeStarts !== bCodeStarts) return bCodeStarts - aCodeStarts;

      // 3. Coincidencia al inicio por descripción
      const aDescStarts = (a.description || '').toLowerCase().startsWith(term) ? 1 : 0;
      const bDescStarts = (b.description || '').toLowerCase().startsWith(term) ? 1 : 0;
      if (aDescStarts !== bDescStarts) return bDescStarts - aDescStarts;

      // 4. Comparación rápida alfabética
      return a.description < b.description ? -1 : 1;
    }).slice(0, 25); // Máximo 25 elementos en el DOM para evitar congelamiento de pantalla
  }, [products, searchProdTerm, productsByBarcodeMap]);

  useEffect(() => {
    if (searchSelectedIndex >= 0 && searchDropdownRef.current) {
      const activeItem = searchDropdownRef.current.children[searchSelectedIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [searchSelectedIndex]);
  
  const [saleItems, setSaleItems] = useState<SaleItem[]>(() => {
    try {
      const saved = localStorage.getItem('pos_current_cart');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });

  const [discountPct, setDiscountPct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pos_current_discount');
      return saved ? parseFloat(saved) || 0 : 0;
    } catch (e) {
      console.error(e);
      return 0;
    }
  });

  // Tickets on hold state
  const [ticketsOnHold, setTicketsOnHold] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('pos_tickets_on_hold');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });

  const [showOnHoldModal, setShowOnHoldModal] = useState(false);

  // Entrada Rápida states
  const [showEntradaRapidaModal, setShowEntradaRapidaModal] = useState(false);
  const [entradaBarcode, setEntradaBarcode] = useState('');
  const [entradaQty, setEntradaQty] = useState('1');
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);



  // Search autocomplete dropdown visibility for Entrada Rápida
  const showEntradaDropdown = entradaBarcode.trim() !== "" && (!matchedProduct || matchedProduct.barcode !== entradaBarcode);

  const filteredSearchProducts = useMemo(() => {
    if (entradaBarcode.trim() === "") return [];
    return products.filter(
      p => p.description.toLowerCase().includes(entradaBarcode.toLowerCase()) ||
           p.barcode.toLowerCase().includes(entradaBarcode.toLowerCase())
    );
  }, [entradaBarcode, products]);

  // Automatically match if the entered text is an exact match for a barcode or id
  useEffect(() => {
    if (entradaBarcode.trim() === "") {
      setMatchedProduct(null);
      return;
    }
    const exactMatch = products.find(
      p => p.barcode.toUpperCase() === entradaBarcode.trim().toUpperCase() ||
           p.id.toString() === entradaBarcode.trim()
    );
    if (exactMatch) {
      setMatchedProduct(exactMatch);
    }
  }, [entradaBarcode, products]);

  const handleExecuteEntradaRapida = async () => {
    if (!matchedProduct) return;
    const qty = matchedProduct.a_granel ? parseFloat(entradaQty) : parseInt(entradaQty);
    if (isNaN(qty) || qty <= 0) {
      showAlert('Por favor ingrese una cantidad válida mayor a 0.', 'Cantidad Inválida', 'warning');
      return;
    }
    if (!matchedProduct.a_granel && !Number.isInteger(parseFloat(entradaQty))) {
      showAlert('Este producto se vende por unidad. La cantidad debe ser un número entero.', 'Cantidad Inválida', 'warning');
      return;
    }

    try {
      await onUpdateProductStock(
        matchedProduct.id, 
        'Entrada Rápida', 
        qty, 
        'Entrada Rápida desde Caja POS'
      );
      showToast(`Entrada Rápida procesada con éxito: Se añadieron ${qty} unidades a "${matchedProduct.description}".`, 'success');
      setShowEntradaRapidaModal(false);
      setEntradaBarcode('');
      setEntradaQty('1');
    } catch (e) {
      console.error(e);
      showToast("Ocurrió un error al registrar la entrada rápida de inventario.", "error");
    }
  };

  // Persist POS state to localStorage
  useEffect(() => {
    localStorage.setItem('pos_current_cart', JSON.stringify(saleItems));
  }, [saleItems]);

  useEffect(() => {
    localStorage.setItem('pos_current_discount', String(discountPct));
  }, [discountPct]);

  useEffect(() => {
    if (selectedClient) {
      localStorage.setItem('pos_current_client_doc', selectedClient.cedula_rif);
    }
  }, [selectedClient]);

  useEffect(() => {
    localStorage.setItem('pos_tickets_on_hold', JSON.stringify(ticketsOnHold));
  }, [ticketsOnHold]);

  const handlePutOnHold = () => {
    if (saleItems.length === 0) return;
    const defaultTag = `Ticket ${ticketsOnHold.length + 1} - ${selectedClient.nombre}`;
    setHoldTag(defaultTag);
    setShowHoldModal(true);
  };

  const handleConfirmHold = () => {
    const finalTag = holdTag.trim() || `Ticket ${ticketsOnHold.length + 1} - ${selectedClient.nombre}`;
    
    const newHold = {
      id: Date.now(),
      fecha: new Date().toLocaleString(),
      tag: finalTag,
      client: selectedClient,
      items: saleItems,
      discount: discountPct
    };

    setTicketsOnHold(prev => [...prev, newHold]);
    setShowHoldModal(false);
    
    // Clear active POS state
    setSaleItems([]);
    setDiscountPct(0);
    const defaultClient = clients.find(c => c.cedula_rif === 'V-00000000') || clients[0];
    if (defaultClient) {
      setSelectedClient(defaultClient);
    }
    localStorage.removeItem('pos_current_cart');
    localStorage.removeItem('pos_current_discount');
    localStorage.removeItem('pos_current_client_doc');
  };



  const handleRetrieveHold = async (hold: any) => {
    if (saleItems.length > 0) {
      const confirmReplace = await showConfirm(
        'Ya hay artículos en el carrito actual. ¿Desea reemplazarlos con el ticket recuperado?',
        'Reemplazar Carrito',
        { confirmLabel: 'Sí, Reemplazar' }
      );
      if (!confirmReplace) return;
    }

    setSaleItems(hold.items);
    setDiscountPct(hold.discount);
    setSelectedClient(hold.client);
    
    setTicketsOnHold(prev => prev.filter(h => h.id !== hold.id));
    setShowOnHoldModal(false);
  };

  const handleRemoveHold = async (holdId: number) => {
    const ok = await showConfirm(
      '¿Está seguro de eliminar permanentemente este ticket en espera?',
      'Eliminar Ticket',
      { confirmLabel: 'Eliminar', isDanger: true }
    );
    if (ok) {
      setTicketsOnHold(prev => prev.filter(h => h.id !== holdId));
    }
  };

  // Checkout modal state & Tipo de Comprobante Persistence
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [tipoDocumento, setTipoDocumento] = useState<'FACTURA_FISCAL' | 'NOTA_ENTREGA'>(() => {
    try {
      const active = localStorage.getItem('pos_tipo_documento_activo');
      if (active === 'NOTA_ENTREGA' || active === 'FACTURA_FISCAL') return active;
      const savedFiscal = localStorage.getItem('pos_fiscal_printer_config');
      if (savedFiscal) {
        const parsed = JSON.parse(savedFiscal);
        if (parsed.tipoDocumentoDefault === 'NOTA_ENTREGA' || parsed.tipoDocumentoDefault === 'FACTURA_FISCAL') {
          return parsed.tipoDocumentoDefault;
        }
      }
      const def = localStorage.getItem('pos_default_tipo_documento');
      if (def === 'NOTA_ENTREGA' || def === 'FACTURA_FISCAL') return def;
    } catch (_) {}
    return 'FACTURA_FISCAL';
  });

  const canEmitNoFiscal = useMemo(() => {
    if (currentUser?.rol?.toLowerCase() === 'administrador') return true;
    return !!currentUser?.permisos?.caja?.emitir_no_fiscal;
  }, [currentUser]);

  const handleSelectTipoDoc = (tipo: 'FACTURA_FISCAL' | 'NOTA_ENTREGA') => {
    if (tipo === 'NOTA_ENTREGA' && !canEmitNoFiscal) {
      showAlert('Su usuario no tiene permisos para emitir Notas de Entrega no fiscales. Contacte a un administrador.', 'Permiso Denegado', 'error');
      return;
    }
    setTipoDocumento(tipo);
    try {
      localStorage.setItem('pos_tipo_documento_activo', tipo);
    } catch (_) {}
  };

  // If user has no permission to emit no-fiscal, force FACTURA_FISCAL
  useEffect(() => {
    if (!canEmitNoFiscal && tipoDocumento === 'NOTA_ENTREGA') {
      setTipoDocumento('FACTURA_FISCAL');
      try {
        localStorage.setItem('pos_tipo_documento_activo', 'FACTURA_FISCAL');
      } catch (_) {}
    }
  }, [canEmitNoFiscal, tipoDocumento]);

  // Keyboard row selection and mixed change state
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0);
  const [mixedChangeUSDVal, setMixedChangeUSDVal] = useState('');
  const [abonoMode, setAbonoMode] = useState<'unico' | 'mixto'>('unico');
  const [abonoMethod, setAbonoMethod] = useState<import('../types').MetodoPagoAbono>('Efectivo$');
  const [abonoRef, setAbonoRef] = useState('');
  const [abonoLineAmount, setAbonoLineAmount] = useState('');
  const [abonoObservacion, setAbonoObservacion] = useState('');
  // Multi-payment lines for a single abono
  const [abonoPayments, setAbonoPayments] = useState<import('../types').AbonoPayment[]>([]);

  // Reset mixed change on open/close
  useEffect(() => {
    if (!showCheckoutModal) {
      setMixedChangeUSDVal('');
    }
  }, [showCheckoutModal]);

  // Clamp selection index
  useEffect(() => {
    if (saleItems.length === 0) {
      setSelectedItemIndex(-1);
    } else if (selectedItemIndex >= saleItems.length) {
      setSelectedItemIndex(saleItems.length - 1);
    } else if (selectedItemIndex < 0) {
      setSelectedItemIndex(0);
    }
  }, [saleItems, selectedItemIndex]);

  // Keyboard navigation inside the cart
  useEffect(() => {
    const handleCartKeys = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.tagName === 'TEXTAREA'
      );
      if (isInputActive) return;

      if (saleItems.length === 0) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedItemIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedItemIndex(prev => Math.min(saleItems.length - 1, prev + 1));
      } else if (e.key === '+' || e.key === 'Add') {
        e.preventDefault();
        const selectedItem = saleItems[selectedItemIndex];
        if (selectedItem) {
          const step = selectedItem.product.a_granel ? 0.1 : 1;
          handleUpdateItemQty(selectedItem.product.id, selectedItem.qty + step);
        }
      } else if (e.key === '-' || e.key === 'Subtract') {
        e.preventDefault();
        const selectedItem = saleItems[selectedItemIndex];
        if (selectedItem) {
          const step = selectedItem.product.a_granel ? 0.1 : 1;
          handleUpdateItemQty(selectedItem.product.id, Math.max(0.001, selectedItem.qty - step));
        }
      } else if (e.key === 'Delete' || e.key === 'Del') {
        e.preventDefault();
        const selectedItem = saleItems[selectedItemIndex];
        if (selectedItem) {
          handleRemoveItem(selectedItem.product.id);
        }
      }
    };
    window.addEventListener('keydown', handleCartKeys);
    return () => window.removeEventListener('keydown', handleCartKeys);
  }, [saleItems, selectedItemIndex]);

  
  // Mixed payment values
  const [payCashUSD, setPayCashUSD] = useState('');
  const [payCashVES, setPayCashVES] = useState('');
  const [payCardVES, setPayCardVES] = useState('');
  const [payCardUSD, setPayCardUSD] = useState('');    // Tarjeta $ USD
  const [payPagoMovilVES, setPayPagoMovilVES] = useState('');
  const [payBiopagoVES, setPayBiopagoVES] = useState('');
  const [payBinanceUSD, setPayBinanceUSD] = useState('');  // Binance $
  const [payPaypalUSD, setPayPaypalUSD] = useState('');    // PayPal $
  const [payCreditUSD, setPayCreditUSD] = useState('');

  const [refPagoMovil, setRefPagoMovil] = useState('');
  const [bankPagoMovil, setBankPagoMovil] = useState('');

  // Generated Ticket Modal state
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [printedTicketData, setPrintedTicketData] = useState<any>(null);
  const [ticketCurrency, setTicketCurrency] = useState<'USD' | 'VES'>('USD');

  // Search input ref and auto-focus handlers
  const searchInputRef = useRef<HTMLInputElement>(null);
  const checkoutModalRef = useRef<HTMLDivElement>(null);

  // Helper to re-focus the search / barcode input reliably
  const focusSearchInput = useCallback(() => {
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 50);
  }, []);

  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdTag, setHoldTag] = useState('');
  const holdModalRef = useRef<HTMLDivElement>(null);

  // Client Abono modal in Cashier view
  const [showCajaAbonoModal, setShowCajaAbonoModal] = useState(false);
  const [abonoClient, setAbonoClient] = useState<Client | null>(null);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoSearchTerm, setAbonoSearchTerm] = useState('');
  const abonoModalRef = useRef<HTMLDivElement>(null);

  // Bulk / Granel product modal state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkProduct, setBulkProduct] = useState<Product | null>(null);
  const [bulkQtyVal, setBulkQtyVal] = useState('1.000');
  const bulkModalRef = useRef<HTMLDivElement>(null);

  // Quantity edit modal state
  const [showQtyEditModal, setShowQtyEditModal] = useState(false);
  const [qtyEditItem, setQtyEditItem] = useState<SaleItem | null>(null);
  const [qtyEditVal, setQtyEditVal] = useState('');
  const qtyEditModalRef = useRef<HTMLDivElement>(null);

  // Anti-Double-Click & Concurrent Checkout Lock
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const isSubmittingRef = useRef(false);

  // Toast notifications state
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Auto-focus on state changes or mounting
  useEffect(() => {
    if (cajaAbierta && !showAperturaModal && !showCheckoutModal && !showCierreModal && !showMovementsModal && !showTicketModal) {
      focusSearchInput();
    }
  }, [cajaAbierta, showAperturaModal, showCheckoutModal, showCierreModal, showMovementsModal, showTicketModal, focusSearchInput]);

  // Click on blank / whitespace areas of Caja POS to refocus search bar
  const handlePosContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const isModalOpen =
      showCheckoutModal ||
      showMovementsModal ||
      showCierreModal ||
      showTicketModal ||
      showEntradaRapidaModal ||
      showHoldModal ||
      showCajaAbonoModal ||
      showBulkModal ||
      showQtyEditModal ||
      showOnHoldModal ||
      showDevolucionModal ||
      showQuickClientModal ||
      showCambioDivisasModal ||
      showAperturaModal;

    if (isModalOpen) return;

    const target = e.target as HTMLElement;
    if (!target) return;

    // Check if clicked element is interactive (buttons, inputs, quantity edits, selectors)
    const isInteractive = target.closest(
      'input, textarea, select, button, a, [role="button"], [contenteditable="true"], .select-text, .cursor-pointer'
    );

    if (!isInteractive) {
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;
      focusSearchInput();
    }
  };

  // Listener for F6 and Escape (modals closing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F6') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setShowCheckoutModal(false);
        setShowMovementsModal(false);
        setShowCierreModal(false);
        setShowTicketModal(false);
        setShowEntradaRapidaModal(false);
        setShowHoldModal(false);
        setShowCajaAbonoModal(false);
        setShowBulkModal(false);
        setShowQtyEditModal(false);
        setShowOnHoldModal(false);
        setCierreResult(null);
        setShowDevolucionModal(false);
        setShowQuickClientModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus Trap for Caja Abono Modal
  useEffect(() => {
    if (!showCajaAbonoModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (!abonoModalRef.current) return;
        const focusable = abonoModalRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), select:not([disabled])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCajaAbonoModal]);

  // Focus Trap & Keyboard navigation for Hold Modal
  useEffect(() => {
    if (!showHoldModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (!holdModalRef.current) return;
        const focusable = holdModalRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHoldModal]);

  // F12 keydown handler
  useEffect(() => {
    const handleF12Key = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        if (cajaAbierta && saleItems.length > 0 && !showCheckoutModal) {
          handleOpenCheckout();
        }
      }
    };

    window.addEventListener('keydown', handleF12Key);
    return () => window.removeEventListener('keydown', handleF12Key);
  }, [cajaAbierta, saleItems, showCheckoutModal]);

  // End keydown handler (Limpiar Pantalla / Cancelar Venta)
  useEffect(() => {
    const handleEndKey = (e: KeyboardEvent) => {
      if (e.key === 'End' || e.code === 'End') {
        const isModalOpen =
          showCheckoutModal ||
          showMovementsModal ||
          showCierreModal ||
          showTicketModal ||
          showEntradaRapidaModal ||
          showHoldModal ||
          showCajaAbonoModal ||
          showBulkModal ||
          showQtyEditModal ||
          showOnHoldModal ||
          showDevolucionModal ||
          showQuickClientModal ||
          showCambioDivisasModal;

        if (!isModalOpen) {
          e.preventDefault();
          if (saleItems.length > 0) {
            handleClearSale();
          } else {
            focusSearchInput();
          }
        }
      }
    };

    window.addEventListener('keydown', handleEndKey);
    return () => window.removeEventListener('keydown', handleEndKey);
  }, [
    saleItems,
    showCheckoutModal,
    showMovementsModal,
    showCierreModal,
    showTicketModal,
    showEntradaRapidaModal,
    showHoldModal,
    showCajaAbonoModal,
    showBulkModal,
    showQtyEditModal,
    showOnHoldModal,
    showDevolucionModal,
    showQuickClientModal,
    showCambioDivisasModal,
    focusSearchInput
  ]);

  // Focus Trap for Quantity Edit Modal
  useEffect(() => {
    if (!showQtyEditModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (!qtyEditModalRef.current) return;
        const focusable = qtyEditModalRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showQtyEditModal]);

  // Focus Trap for Bulk Modal
  useEffect(() => {
    if (!showBulkModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (!bulkModalRef.current) return;
        const focusable = bulkModalRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showBulkModal]);

  // Sync selected seller with currentUser
  useEffect(() => {
    setSelectedSeller(currentUser.nombre);
  }, [currentUser]);

  // Auto-focus opening modal if closed
  useEffect(() => {
    setShowAperturaModal(!cajaAbierta);
  }, [cajaAbierta]);

  // Compute Totals
  const subtotalUSD = Math.round(saleItems.reduce((acc, item) => acc + item.totalUSD, 0) * 100) / 100;
  const discountAmountUSD = Math.round((subtotalUSD * (discountPct / 100)) * 100) / 100;
  const discountFactor = (1 - discountPct / 100);

  // Tax calculations (Venezuelan standard: shelf prices are tax-inclusive for taxable items)
  const grossTaxableUSD = Math.round(saleItems.reduce((acc, item) => {
    const isExempt = item.product.exento_impuesto === true || (item.product.porcentaje_impuesto !== undefined && item.product.porcentaje_impuesto === 0);
    return acc + (isExempt ? 0 : item.totalUSD);
  }, 0) * 100) / 100;

  const grossExemptUSD = Math.round((subtotalUSD - grossTaxableUSD) * 100) / 100;

  const netTaxableUSD = Math.round((grossTaxableUSD * discountFactor) * 100) / 100;
  const netExemptUSD = Math.round((grossExemptUSD * discountFactor) * 100) / 100;

  const baseImponibleUSD = Math.round((netTaxableUSD / 1.16) * 100) / 100;
  const ivaAmount = Math.round((netTaxableUSD - baseImponibleUSD) * 100) / 100;

  const totalUSD = Math.round((netTaxableUSD + netExemptUSD) * 100) / 100;
  const totalVES = Math.round((totalUSD * tasaDia) * 100) / 100;

  const executeAddProduct = (prod: Product, finalQty: number) => {
    setSaleItems(prev => {
      const existing = prev.find(item => item.product.id === prod.id);
      const itemUnit = prod.a_granel ? 'kg' : 'und';
      const formattedQty = prod.a_granel ? finalQty.toFixed(3) : finalQty.toString();

      // Determine price based on client's aplica_precio_costo flag
      const useCostPrice = !!selectedClient.aplica_precio_costo;

      if (existing) {
        const nextQty = existing.qty + finalQty;
        if (nextQty > prod.stock_actual) {
          showToast(`No hay disponibilidad suficiente. Stock máximo disponible: ${formatStockVal(prod.stock_actual, prod.a_granel)} ${prod.a_granel ? 'kg' : 'uds'}`, 'error');
          return prev;
        }
        showToast(`Se agregaron ${formattedQty} ${itemUnit} de "${prod.description}" al carrito.`, 'success');
        return prev.map(item =>
          item.product.id === prod.id
            ? { ...item, qty: nextQty, totalUSD: nextQty * item.priceUSD }
            : item
        );
      } else {
        const priceUSD = useCostPrice ? prod.precio_costo_usd : prod.precio_detalle_usd;
        const priceType = useCostPrice ? 'Costo' : 'Detalle';
        showToast(`Se agregó "${prod.description}" (${formattedQty} ${itemUnit}) al carrito.`, 'success');
        return [...prev, {
          product: prod,
          qty: finalQty,
          priceType,
          priceUSD,
          totalUSD: finalQty * priceUSD
        }];
      }
    });
    focusSearchInput();
  };

  const handleAddProduct = (prod: Product, qty: number = 1) => {
    if (!cajaAbierta) {
      showToast('Debe abrir la caja registradora para poder realizar ventas.', 'error');
      return;
    }
    
    // Strict block: do not add to sales list if there is no stock
    if (prod.stock_actual <= 0) {
      showToast(`Sin Existencias: El producto "${prod.description}" no cuenta con stock disponible en almacén.`, 'error');
      return;
    }

    if (prod.a_granel) {
      setBulkProduct(prod);
      setBulkQtyVal('1.000');
      setShowBulkModal(true);
      return;
    }

    executeAddProduct(prod, qty);
  };

  const handleConfirmBulkAdd = () => {
    if (!bulkProduct) return;
    const parsed = parseFloat(bulkQtyVal);
    if (isNaN(parsed) || parsed <= 0) {
      showToast("Cantidad ingresada no es válida.", "error");
      return;
    }

    // Check availability (including existing in cart)
    const existing = saleItems.find(item => item.product.id === bulkProduct.id);
    const existingQty = existing ? existing.qty : 0;
    if (parsed + existingQty > bulkProduct.stock_actual) {
      showToast(`No hay disponibilidad suficiente. Stock máximo disponible: ${formatStockVal(bulkProduct.stock_actual, bulkProduct.a_granel)} ${bulkProduct.a_granel ? 'kg' : 'uds'}`, "error");
      return;
    }

    executeAddProduct(bulkProduct, parsed);
    setShowBulkModal(false);
    setBulkProduct(null);
    focusSearchInput();
  };

  const handleConfirmQtyEdit = () => {
    if (!qtyEditItem) return;
    const parsed = parseFloat(qtyEditVal);
    if (isNaN(parsed) || parsed <= 0) {
      showToast("Cantidad ingresada no es válida.", "error");
      return;
    }

    // If unit item, ensure it's integer
    if (!qtyEditItem.product.a_granel && !Number.isInteger(parsed)) {
      showToast("Este producto se vende por unidades enteras.", "error");
      return;
    }

    if (parsed > qtyEditItem.product.stock_actual) {
      showToast(`No hay disponibilidad suficiente. Stock máximo disponible: ${formatStockVal(qtyEditItem.product.stock_actual, qtyEditItem.product.a_granel)} ${qtyEditItem.product.a_granel ? 'kg' : 'uds'}`, "error");
      return;
    }

    handleUpdateItemQty(qtyEditItem.product.id, parsed);
    setShowQtyEditModal(false);
    setQtyEditItem(null);
    focusSearchInput();
  };

  const handleUpdateItemQty = (prodId: number, nextQty: number) => {
    const prod = products.find(p => p.id === prodId);
    if (!prod) return;

    if (nextQty <= 0) {
      handleRemoveItem(prodId);
      return;
    }

    if (nextQty > prod.stock_actual) {
      showAlert(`No hay disponibilidad suficiente. Stock máximo disponible: ${formatStockVal(prod.stock_actual, prod.a_granel)} ${prod.a_granel ? 'kg' : 'uds'}`, 'Stock Insuficiente', 'warning');
      return;
    }

    setSaleItems(prev =>
      prev.map(item =>
        item.product.id === prodId
          ? {
              ...item,
              qty: nextQty,
              priceUSD: selectedClient.aplica_precio_costo
                ? item.product.precio_costo_usd
                : (nextQty >= item.product.cantidad_mayorista ? item.product.precio_mayor_usd : item.product.precio_detalle_usd),
              priceType: selectedClient.aplica_precio_costo
                ? 'Costo'
                : (nextQty >= item.product.cantidad_mayorista ? 'Mayor' : 'Detalle'),
              totalUSD: nextQty * (selectedClient.aplica_precio_costo
                ? item.product.precio_costo_usd
                : (nextQty >= item.product.cantidad_mayorista ? item.product.precio_mayor_usd : item.product.precio_detalle_usd))
            }
          : item
      )
    );
  };

  const handleRemoveItem = (prodId: number) => {
    setSaleItems(prev => prev.filter(item => item.product.id !== prodId));
    focusSearchInput();
  };

  const handleClearSale = () => {
    setSaleItems([]);
    setDiscountPct(0);
    const defaultClient = clients.find(c => c.cedula_rif === 'V-00000000') || clients[0];
    if (defaultClient) {
      setSelectedClient(defaultClient);
    }
    localStorage.removeItem('pos_current_cart');
    localStorage.removeItem('pos_current_discount');
    localStorage.removeItem('pos_current_client_doc');
    showToast('🗑️ Pantalla de venta limpiada.');
    focusSearchInput();
  };

  const resetPaymentFields = useCallback(() => {
    setPayCashUSD('');
    setPayCashVES('');
    setPayCardVES('');
    setPayCardUSD('');
    setPayPagoMovilVES('');
    setPayBiopagoVES('');
    setPayBinanceUSD('');
    setPayPaypalUSD('');
    setPayCreditUSD('');
    setRefPagoMovil('');
    setBankPagoMovil('');
    setMixedChangeUSDVal('');
  }, []);

  const handleOpenCheckout = () => {
    if (saleItems.length === 0) return;
    
    resetPaymentFields();
    setShowCheckoutModal(true);
  };

  // Mixed currency calculations
  const cashUSDVal = parseFloat(payCashUSD) || 0;
  const cashVESVal = parseFloat(payCashVES) || 0;
  const cardVESVal = parseFloat(payCardVES) || 0;
  const cardUSDVal = parseFloat(payCardUSD) || 0;      // Tarjeta $ USD
  const pagoMovilVESVal = parseFloat(payPagoMovilVES) || 0;
  const biopagoVESVal = parseFloat(payBiopagoVES) || 0;
  const binanceUSDVal = parseFloat(payBinanceUSD) || 0;  // Binance $
  const paypalUSDVal = parseFloat(payPaypalUSD) || 0;    // PayPal $
  const creditUSDVal = parseFloat(payCreditUSD) || 0;

  // Round paid USD calculation to 2 decimals to avoid floating-point issues
  const totalPaidUSD = Math.round((
    cashUSDVal +
    (cashVESVal / tasaDia) +
    (cardVESVal / tasaDia) +
    cardUSDVal +
    (pagoMovilVESVal / tasaDia) +
    (biopagoVESVal / tasaDia) +
    binanceUSDVal +
    paypalUSDVal +
    creditUSDVal
  ) * 100) / 100;

  const remainingUSD = Math.max(0, Math.round((totalUSD - totalPaidUSD) * 100) / 100);
  const changeUSD = Math.max(0, Math.round((totalPaidUSD - totalUSD) * 100) / 100);
  const changeVES = Math.round((changeUSD * tasaVuelto) * 100) / 100;

  const isPagoMovilValid = pagoMovilVESVal === 0 || (refPagoMovil.trim().length >= 4 && bankPagoMovil !== '');
  const isBiopagoValid = true;
  const isCreditValid = creditUSDVal === 0 || creditUSDVal <= selectedClient.credito_disponible;

  const canConfirmCheckout = totalPaidUSD >= totalUSD && isPagoMovilValid && isBiopagoValid && isCreditValid;

  const getRemainingUSDForMethod = (method: string): number => {
    const cashUSD = method === 'cashUSD' ? 0 : (parseFloat(payCashUSD) || 0);
    const cashVESInUSD = method === 'cashVES' ? 0 : ((parseFloat(payCashVES) || 0) / tasaDia);
    const cardVESInUSD = method === 'cardVES' ? 0 : ((parseFloat(payCardVES) || 0) / tasaDia);
    const cardUSD = method === 'cardUSD' ? 0 : (parseFloat(payCardUSD) || 0);
    const pagoMovilVESInUSD = method === 'pagoMovilVES' ? 0 : ((parseFloat(payPagoMovilVES) || 0) / tasaDia);
    const biopagoVESInUSD = method === 'biopagoVES' ? 0 : ((parseFloat(payBiopagoVES) || 0) / tasaDia);
    const binanceUSD = method === 'binanceUSD' ? 0 : (parseFloat(payBinanceUSD) || 0);
    const paypalUSD = method === 'paypalUSD' ? 0 : (parseFloat(payPaypalUSD) || 0);
    const creditUSD = method === 'creditUSD' ? 0 : (parseFloat(payCreditUSD) || 0);

    const paidOtherUSD = cashUSD + cashVESInUSD + cardVESInUSD + cardUSD + 
                         pagoMovilVESInUSD + biopagoVESInUSD + binanceUSD + 
                         paypalUSD + creditUSD;
                         
    return Math.max(0, Math.round((totalUSD - paidOtherUSD) * 100) / 100);
  };

  const handlePaymentKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, method: string) => {
    if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      resetPaymentFields();
      return;
    }

    if (e.key !== 'Enter') return;

    e.preventDefault();
    e.stopPropagation();

    const remUSD = getRemainingUSDForMethod(method);

    let targetValStr = '0.00';
    let targetValNum = 0;

    if (['cashUSD', 'cardUSD', 'binanceUSD', 'paypalUSD'].includes(method)) {
      targetValNum = remUSD;
      targetValStr = remUSD > 0 ? remUSD.toFixed(2) : '0.00';
    } else if (['cashVES', 'cardVES', 'pagoMovilVES', 'biopagoVES'].includes(method)) {
      const remVES = Math.round((remUSD * tasaDia) * 100) / 100;
      targetValNum = remVES;
      targetValStr = remVES > 0 ? remVES.toFixed(2) : '0.00';
    } else if (method === 'creditUSD') {
      const maxCredit = selectedClient?.credito_disponible || 0;
      targetValNum = Math.min(remUSD, maxCredit);
      targetValStr = targetValNum > 0 ? targetValNum.toFixed(2) : '0.00';
    }

    const currentValNum = parseFloat(e.currentTarget.value) || 0;

    if (Math.abs(currentValNum - targetValNum) > 0.001 || e.currentTarget.value.trim() === '') {
      switch (method) {
        case 'cashUSD': setPayCashUSD(targetValStr); break;
        case 'cashVES': setPayCashVES(targetValStr); break;
        case 'cardVES': setPayCardVES(targetValStr); break;
        case 'cardUSD': setPayCardUSD(targetValStr); break;
        case 'pagoMovilVES': setPayPagoMovilVES(targetValStr); break;
        case 'biopagoVES': setPayBiopagoVES(targetValStr); break;
        case 'binanceUSD': setPayBinanceUSD(targetValStr); break;
        case 'paypalUSD': setPayPaypalUSD(targetValStr); break;
        case 'creditUSD': setPayCreditUSD(targetValStr); break;
      }
    } else {
      if (canConfirmCheckout) {
        handleConfirmCheckout(false);
      }
    }
  };

  const handleCreateQuickClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickDoc.trim() || !quickName.trim()) {
      showAlert('Por favor ingrese la Cédula/RIF y el Nombre o Razón Social del cliente.', 'Campos Requeridos', 'warning');
      return;
    }

    const limit = parseFloat(quickCreditLimit) || 0;
    const discount = parseFloat(quickDiscount) || 0;

    const newCli: Client = {
      id: Date.now(),
      cedula_rif: quickDoc.trim().toUpperCase(),
      nombre: quickName.trim().toUpperCase(),
      telefono: quickPhone.trim(),
      direccion: quickAddress.trim(),
      limite_credito: limit,
      credito_disponible: limit,
      porcentaje_descuento: discount,
      estado: 'Activo',
      aplica_precio_costo: quickPrecioCosto,
      saldo_pendiente: 0
    };

    if (onAddClient) {
      await onAddClient(newCli);
    }

    // Automatically set as active POS client
    setSelectedClient(newCli);
    setDiscountPct(newCli.porcentaje_descuento);
    localStorage.setItem('pos_current_client_doc', newCli.cedula_rif);
    showToast(`Cliente "${newCli.nombre}" registrado y seleccionado exitosamente.`, 'success');

    // Reset fields & close modal
    setQuickDoc('');
    setQuickName('');
    setQuickPhone('');
    setQuickAddress('');
    setQuickCreditLimit('0');
    setQuickDiscount('0');
    setQuickPrecioCosto(false);
    setShowQuickClientModal(false);
  };

  const handleConfirmCheckout = async (shouldPrint: boolean = false) => {
    // Atomic Anti-Double-Click Lock: reject any concurrent or rapid secondary click
    if (isSubmittingRef.current || isSubmittingSale) {
      console.warn('⚠️ [Seguridad POS] Intento de cobro concurrente/doble clic bloqueado.');
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmittingSale(true);

    try {
      if (!canConfirmCheckout) {
        showAlert('Información de cobro incompleta o inválida. Verifique los montos ingresados.', 'Pago Incompleto', 'warning');
        return;
      }

      // Reference validations (Pago Móvil)
      if (pagoMovilVESVal > 0) {
        if (!refPagoMovil.trim() || refPagoMovil.trim().length < 4) {
          showAlert('La referencia bancaria es obligatoria y debe tener mínimo 4 caracteres para pagos por Pago Móvil.', 'Referencia Requerida', 'warning');
          return;
        }
        if (!bankPagoMovil) {
          showAlert('Debe especificar el banco emisor para Pago Móvil.', 'Banco Requerido', 'warning');
          return;
        }
      }

      // Limit credit validations
      if (creditUSDVal > 0) {
        if (creditUSDVal > selectedClient.credito_disponible) {
          showAlert(`Crédito insuficiente. Límite disponible del cliente: $${selectedClient.credito_disponible.toFixed(2)} USD.`, 'Crédito Insuficiente', 'warning');
          return;
        }
      }

      // Build payment array
      const pagos: Payment[] = [];
      if (cashUSDVal > 0) pagos.push({ metodo: 'Efectivo$', monto: cashUSDVal, montoUSD: cashUSDVal });
      if (cashVESVal > 0) pagos.push({ metodo: 'EfectivoBs', monto: cashVESVal, montoUSD: cashVESVal / tasaDia });
      if (cardVESVal > 0) pagos.push({ metodo: 'TarjetaBs', monto: cardVESVal, montoUSD: cardVESVal / tasaDia });
      if (cardUSDVal > 0) pagos.push({ metodo: 'Tarjeta$', monto: cardUSDVal, montoUSD: cardUSDVal });
      if (pagoMovilVESVal > 0) {
        pagos.push({
          metodo: 'PagoMovil',
          monto: pagoMovilVESVal,
          montoUSD: pagoMovilVESVal / tasaDia,
          reference: refPagoMovil,
          bancoEmisor: bankPagoMovil
        });
      }
      if (biopagoVESVal > 0) {
        pagos.push({
          metodo: 'Biopago',
          monto: biopagoVESVal,
          montoUSD: biopagoVESVal / tasaDia,
          reference: '',
          bancoEmisor: ''
        });
      }
      if (binanceUSDVal > 0) pagos.push({ metodo: 'Binance', monto: binanceUSDVal, montoUSD: binanceUSDVal });
      if (paypalUSDVal > 0) pagos.push({ metodo: 'PayPal', monto: paypalUSDVal, montoUSD: paypalUSDVal });
      if (creditUSDVal > 0) {
        pagos.push({ metodo: 'CreditoCliente', monto: creditUSDVal, montoUSD: creditUSDVal });
      }

      let finalVueltoUSD = 0;
      let finalVueltoVES = 0;

      if (changeUSD > 0) {
        const mixedUsdInput = parseFloat(mixedChangeUSDVal);
        if (!isNaN(mixedUsdInput) && mixedChangeUSDVal.trim() !== '') {
          // Auxiliary mixed change calculator explicitly specified a USD amount to return in bills
          finalVueltoUSD = Math.min(changeUSD, Math.max(0, mixedUsdInput));
          finalVueltoVES = parseFloat(((changeUSD - finalVueltoUSD) * tasaVuelto).toFixed(2));
        } else {
          // Default change currency logic: if Auxiliar Vuelto field is left empty, return 0 USD bills and 100% in Bolívares (VES)
          const paidInCashUSD = cashUSDVal > 0;
          const paidInCashVES = cashVESVal > 0;

          if (paidInCashUSD && !paidInCashVES) {
            finalVueltoUSD = 0;
            finalVueltoVES = parseFloat((changeUSD * tasaVuelto).toFixed(2));
          } else if (paidInCashVES && !paidInCashUSD) {
            finalVueltoUSD = 0;
            finalVueltoVES = changeVES;
          } else {
            finalVueltoUSD = 0;
            finalVueltoVES = parseFloat((changeUSD * tasaVuelto).toFixed(2));
          }
        }
      }

      let nroFiscal: string | null = null;
      let serialFiscal: string | null = null;
      let nroZ: string | null = null;
      let estatusFiscal = 'NO_APLICA';

      // If document is marked as FACTURA_FISCAL, process with fiscal service
      if (tipoDocumento === 'FACTURA_FISCAL') {
        try {
          const savedFiscalConfig = localStorage.getItem('pos_fiscal_printer_config');
          const fiscalConfig = savedFiscalConfig ? JSON.parse(savedFiscalConfig) : { estadoFiscal: 'MODO_PRUEBA' };

          if (fiscalConfig.estadoFiscal !== 'DESACTIVADA') {
            const fiscalRes = await fetch(getApiUrl('/fiscal/print-invoice'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                saleData: {
                  client: selectedClient,
                  items: saleItems,
                  subtotal: subtotalUSD,
                  iva: ivaAmount,
                  totalUSD,
                  totalVES,
                  pagos
                },
                fiscalConfig
              })
            });

            if (fiscalRes.ok) {
              const fData = await fiscalRes.json();
              if (fData.ok) {
                nroFiscal = fData.nroFiscal || null;
                serialFiscal = fData.serialFiscal || null;
                nroZ = fData.nroZ || null;
                estatusFiscal = 'EMITIDA';
              }
            } else {
              const errData = await fiscalRes.json().catch(() => ({}));
              const proceed = await showConfirm(
                `⚠️ Error en la Máquina Fiscal SENIAT: ${errData.error || 'Fallo de conexión o impresora sin papel'}.\n\n¿Desea registrar esta venta como NOTA DE ENTREGA / CONTINGENCIA sin emisión física en la máquina fiscal?`,
                'Fallo de Impresión Fiscal',
                { confirmLabel: 'Emitir como Nota de Entrega', cancelLabel: 'Cancelar y Reintentar', isDanger: true }
              );
              if (!proceed) return;
              estatusFiscal = 'FALLO';
            }
          }
        } catch (fErr: any) {
          console.warn('Fallo de conexión con servicio fiscal:', fErr.message);
        }
      }

      const isActuallyFiscal = tipoDocumento === 'FACTURA_FISCAL' && estatusFiscal !== 'FALLO';

      const salePayload = {
        factura_nro: 'FAC-PENDIENTE', // Server will assign the real number via seq_factura
        client: selectedClient,
        items: saleItems,
        subtotal: subtotalUSD,
        descuento: discountAmountUSD,
        iva: ivaAmount,
        totalUSD,
        totalVES,
        pagos,
        vueltoUSD: finalVueltoUSD,
        vueltoVES: finalVueltoVES,
        tipo_documento: isActuallyFiscal ? 'FACTURA_FISCAL' : 'NOTA_ENTREGA',
        nro_fiscal: nroFiscal,
        serial_fiscal: serialFiscal,
        nro_z: nroZ,
        estatus_fiscal: estatusFiscal,
        base_imponible_usd: baseImponibleUSD,
        iva_usd: ivaAmount,
        exento_usd: netExemptUSD,
        igtf_usd: 0
      };

      // Await the server response to get the confirmed factura_nro
      let confirmedSale: any;
      try {
        confirmedSale = await onRegisterSale(salePayload);
      } catch (err: any) {
        // Server failed to save the sale — show error and abort
        showAlert(
          `❌ Error al guardar la venta en el servidor: ${err.message || 'Error desconocido'}. La venta NO fue registrada. Verifique la conexión con el servidor e intente de nuevo.`,
          'Error Crítico de Venta',
          'error'
        );
        return;
      }
      const finalSaleForTicket = confirmedSale ?? salePayload;

      setShowCheckoutModal(false);
      if (shouldPrint) {
        const defaultCur = companyConfig?.moneda_ticket_default || 'USD';
        setPrintedTicketData(finalSaleForTicket as any);
        setTicketCurrency(defaultCur);
        setShowTicketModal(true);
        setTimeout(() => {
          printTicketReceipt(finalSaleForTicket, companyConfig, currentUser, selectedSeller, defaultCur);
        }, 300);
      }

      // Clear sale state and reset client to default 'Público General'
      setSaleItems([]);
      setDiscountPct(0);
      localStorage.removeItem('pos_current_cart');
      localStorage.removeItem('pos_current_discount');
      localStorage.removeItem('pos_current_client_doc');

      const defaultCli = clients.find(c => c.cedula_rif === 'V-00000000') || clients[0];
      if (defaultCli) {
        setSelectedClient(defaultCli);
        setDiscountPct(defaultCli.porcentaje_descuento);
        setClientSearchTerm('');
      }
    } finally {
      // Cooldown timer to prevent accidental multi-key bounces
      setTimeout(() => {
        isSubmittingRef.current = false;
        setIsSubmittingSale(false);
      }, 500);
    }
  };

  // Focus Trap & Enter key listener for Checkout Modal
  useEffect(() => {
    if (!showCheckoutModal) return;

    // Focus the first enabled input
    const inputs = checkoutModalRef.current?.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
      'input, select, button'
    );
    if (inputs && inputs.length > 0) {
      const firstInput = Array.from(inputs).find(el => !el.disabled && el.tabIndex !== -1);
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 80);
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Tab') {
        if (!checkoutModalRef.current) return;
        const focusable = checkoutModalRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }

      if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        resetPaymentFields();
      }

      if (e.key === 'Enter') {
        if (canConfirmCheckout && !isSubmittingRef.current && !isSubmittingSale) {
          if (document.activeElement?.tagName === 'BUTTON') {
            return;
          }
          e.preventDefault();
          handleConfirmCheckout(false); // Cobrar sin imprimir by default
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCheckoutModal, canConfirmCheckout, isSubmittingSale]);

  const handleSaveApertura = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUsdStr = (aperturaUsdVal || '').toString().trim().replace(/[^\d.]/g, '');
    const cleanVesStr = (aperturaVesVal || '').toString().trim().replace(/[^\d.,]/g, '').replace(/\./g, '').replace(/,/g, '.');

    if (cleanUsdStr === "" && cleanVesStr === "") {
      const confirmZero = await showConfirm(
        'No ha ingresado montos de apertura. ¿Desea iniciar la caja en cero ($0 USD / Bs 0,00 VES)?',
        'Apertura en Cero',
        { confirmLabel: 'Sí, Iniciar en Cero' }
      );
      if (!confirmZero) {
        return;
      }
    }

    const usd = Math.round(parseFloat(cleanUsdStr) || 0);
    const ves = parseFloat(cleanVesStr) || 0;
    onAbrirCaja(usd, ves);
    setShowAperturaModal(false);
  };

  const handleSaveCierre = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsdStr = (cierreRealUsd || '').toString().trim().replace(/[^\d.]/g, '');
    const cleanVesStr = (cierreRealVes || '').toString().trim().replace(/[^\d.,]/g, '').replace(/\./g, '').replace(/,/g, '.');
    const cleanEurStr = (cierreRealEur || '').toString().trim().replace(/[^\d.]/g, '');

    const realUsd = parseFloat(cleanUsdStr) || 0;
    const realVes = parseFloat(cleanVesStr) || 0;
    const realEur = parseFloat(cleanEurStr) || 0;

    let targetShiftSales = shiftSales;
    let targetShiftAbonos = abonos || [];
    let targetAperturaUsd = _montoAperturaUsd;
    let targetAperturaVes = _montoAperturaVes;
    let targetEntradaUsd = shiftEntradasUsd;
    let targetEntradaVes = shiftEntradasVes;
    let targetSalidaUsd = shiftSalidasUsd;
    let targetSalidaVes = shiftSalidasVes;
    let targetDevolucionUsd = shiftDevolucionesUsd;
    let targetDevolucionVes = shiftDevolucionesVes;

    let serverPuntoVes = 0;
    let serverBiopagoVes = 0;
    let serverPagoMovilVes = 0;
    let serverTransferenciaVes = 0;

    const uKey = currentUser?.id || currentUser?.usuario || 'default';
    let fetchedFechaApertura = localStorage.getItem(`pos_apertura_fecha_${uKey}`) || localStorage.getItem(`pos_apertura_fecha_${currentUser?.usuario}`) || localStorage.getItem('pos_apertura_fecha') || '';
    // Fetch fresh unified caja estado from server before generating final cierre card
    try {
      const termName = localStorage.getItem('pos_terminal_name') || 'CAJA_01';
      const res = await fetch(getApiUrl(`/cajas/estado?terminal=${encodeURIComponent(termName)}&usuarioId=${currentUser.id}&usuarioNombre=${encodeURIComponent(currentUser.nombre)}`));
      if (res.ok) {
        const cajaData = await res.json();
        if (cajaData && cajaData.abierta) {
          if (cajaData.fechaApertura) fetchedFechaApertura = cajaData.fechaApertura;
          if (Array.isArray(cajaData.shiftSales)) targetShiftSales = cajaData.shiftSales;
          if (Array.isArray(cajaData.shiftAbonosList)) targetShiftAbonos = cajaData.shiftAbonosList;
          if (typeof cajaData.aperturaUsd === 'number') targetAperturaUsd = cajaData.aperturaUsd;
          if (typeof cajaData.aperturaVes === 'number') targetAperturaVes = cajaData.aperturaVes;
          if (typeof cajaData.shiftEntradasUsd === 'number') targetEntradaUsd = cajaData.shiftEntradasUsd;
          if (typeof cajaData.shiftEntradasVes === 'number') targetEntradaVes = cajaData.shiftEntradasVes;
          if (typeof cajaData.shiftSalidasUsd === 'number') targetSalidaUsd = cajaData.shiftSalidasUsd;
          if (typeof cajaData.shiftSalidasVes === 'number') targetSalidaVes = cajaData.shiftSalidasVes;
          if (typeof cajaData.shiftDevolucionesUsd === 'number') targetDevolucionUsd = cajaData.shiftDevolucionesUsd;
          if (typeof cajaData.shiftDevolucionesVes === 'number') targetDevolucionVes = cajaData.shiftDevolucionesVes;
          if (typeof cajaData.shiftPuntoVesMovs === 'number') serverPuntoVes = cajaData.shiftPuntoVesMovs;
          if (typeof cajaData.shiftBiopagoVesMovs === 'number') serverBiopagoVes = cajaData.shiftBiopagoVesMovs;
          if (typeof cajaData.shiftPagoMovilVesMovs === 'number') serverPagoMovilVes = cajaData.shiftPagoMovilVesMovs;
          if (typeof cajaData.shiftTransferenciaVesMovs === 'number') serverTransferenciaVes = cajaData.shiftTransferenciaVesMovs;
        }
      }
    } catch (err) {
      console.warn('⚠️ No se pudo refrescar el estado de caja desde el servidor antes del cierre, utilizando cache local:', err);
    }

    let shiftDivisaOps: any[] = [];
    try {
      const resOps = await fetch(getApiUrl('/cajas/divisas-operaciones'));
      if (resOps.ok) {
        const opsData = await resOps.json();
        if (Array.isArray(opsData)) {
          const aperturaMs = fetchedFechaApertura ? new Date(fetchedFechaApertura).getTime() : 0;
          const termName = localStorage.getItem('pos_terminal_name') || 'CAJA_01';
          
          shiftDivisaOps = opsData.filter((op: any) => {
            const opTime = op.timestamp || (op.fecha ? new Date(op.fecha).getTime() : 0);
            // Exclude operations prior to current session opening
            if (aperturaMs > 0 && opTime > 0 && opTime < (aperturaMs - 60000)) {
              return false;
            }
            if (op.terminal && op.terminal !== termName) {
              return false;
            }
            if (op.usuario_id && currentUser?.id && Number(op.usuario_id) !== Number(currentUser.id)) {
              return false;
            }
            return true;
          });
        }
      }
    } catch (e) {
      console.warn('⚠️ Error al consultar divisas-operaciones para el cierre:', e);
    }

    const avanceBiopagoVes = Math.max(serverBiopagoVes, shiftDivisaOps.reduce((acc, op) => {
      const isVentaEfectivo = op.tipo_operacion === 'VENTA_EFECTIVO' || String(op.descripcion || '').includes('[VENTA EFECTIVO]');
      const isBiopago = op.metodo_cobro === 'BIOPAGO' || op.metodo_pago === 'BIOPAGO' || String(op.descripcion || '').includes('BIOPAGO');
      if (isVentaEfectivo && isBiopago) {
        return acc + (op.monto_digital_cobrado_ves || op.monto_ves || op.ves || 0);
      }
      return acc;
    }, 0));

    const avancePuntoVes = Math.max(serverPuntoVes, shiftDivisaOps.reduce((acc, op) => {
      const isVentaEfectivo = op.tipo_operacion === 'VENTA_EFECTIVO' || String(op.descripcion || '').includes('[VENTA EFECTIVO]');
      const isPunto = op.metodo_cobro === 'PUNTO' || op.metodo_pago === 'PUNTO' || String(op.descripcion || '').includes('PUNTO');
      if (isVentaEfectivo && isPunto) {
        return acc + (op.monto_digital_cobrado_ves || op.monto_ves || op.ves || 0);
      }
      return acc;
    }, 0));

    const avancePagoMovilVes = Math.max(serverPagoMovilVes, shiftDivisaOps.reduce((acc, op) => {
      const isVentaEfectivo = op.tipo_operacion === 'VENTA_EFECTIVO' || String(op.descripcion || '').includes('[VENTA EFECTIVO]');
      const isPagoMovil = op.metodo_cobro === 'PAGO_MOVIL' || op.metodo_pago === 'PAGO_MOVIL' || String(op.descripcion || '').includes('PAGO MÓVIL') || String(op.descripcion || '').includes('PAGO_MOVIL');
      if (isVentaEfectivo && isPagoMovil) {
        return acc + (op.monto_digital_cobrado_ves || op.monto_ves || op.ves || 0);
      }
      return acc;
    }, 0));

    const avanceTransferenciaVes = Math.max(serverTransferenciaVes, shiftDivisaOps.reduce((acc, op) => {
      const isVentaEfectivo = op.tipo_operacion === 'VENTA_EFECTIVO' || String(op.descripcion || '').includes('[VENTA EFECTIVO]');
      const isTransferencia = op.metodo_cobro === 'TRANSFERENCIA' || op.metodo_pago === 'TRANSFERENCIA' || String(op.descripcion || '').includes('TRANSFERENCIA');
      if (isVentaEfectivo && isTransferencia) {
        return acc + (op.monto_digital_cobrado_ves || op.monto_ves || op.ves || 0);
      }
      return acc;
    }, 0));

    const avanceComisionTotalVes = shiftDivisaOps.reduce((acc, op) => {
      if (op.tipo_operacion === 'VENTA_EFECTIVO') {
        return acc + (op.comision_monto_ves || 0);
      }
      return acc;
    }, 0);

    const avanceComisionTotalUsd = shiftDivisaOps.reduce((acc, op) => {
      if (op.tipo_operacion === 'VENTA_EFECTIVO') {
        return acc + (op.comision_monto_usd || 0);
      }
      return acc;
    }, 0);

    const cambioDivisasUsd = shiftDivisaOps.reduce((acc, op) => {
      if (op.tipo_operacion === 'COMPRA_DIVISA' && (op.currency === 'USD' || !op.currency)) {
        return acc + (Number(op.monto_divisa) || 0);
      }
      return acc;
    }, 0);

    const cambioDivisasEur = shiftDivisaOps.reduce((acc, op) => {
      if (op.tipo_operacion === 'COMPRA_DIVISA' && op.currency === 'EUR') {
        return acc + (Number(op.monto_divisa) || 0);
      }
      return acc;
    }, 0);

    const cambioDivisasVesSalida = shiftDivisaOps.reduce((acc, op) => {
      if (op.tipo_operacion === 'COMPRA_DIVISA') {
        return acc + (Number(op.monto_ves_entregado) || 0);
      }
      return acc;
    }, 0);

    const cambioDivisasCount = shiftDivisaOps.filter(op => op.tipo_operacion === 'COMPRA_DIVISA').length;

    // Detailed metrics calculation
    const aperturaUsd = targetAperturaUsd;
    const aperturaVes = targetAperturaVes;
    const ventasEfectivoUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      const cashPay = (sale.pagos || []).find(p => p.metodo === 'Efectivo$');
      return acc + (cashPay ? cashPay.monto : 0);
    }, 0);
    const ventasEfectivoVes = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      const cashPay = (sale.pagos || []).find(p => p.metodo === 'EfectivoBs');
      return acc + (cashPay ? cashPay.monto : 0);
    }, 0);
    // Detailed abonos metrics calculation for active shift
    const abonosEfectivoUsd = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'Efectivo$' || m === 'USD') return acc + (a.monto || 0);
      return acc;
    }, 0);
    const abonosEfectivoBsVes = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'EfectivoBs' || m === 'VES' || m === 'Bolivares') return acc + (a.monto_ves || (a.monto || 0) * tasaDia);
      return acc;
    }, 0);
    const abonosEfectivoBsUsd = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'EfectivoBs' || m === 'VES' || m === 'Bolivares') return acc + (a.monto || 0);
      return acc;
    }, 0);
    const abonosBiopagoVes = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'Biopago') return acc + (a.monto_ves || (a.monto || 0) * tasaDia);
      return acc;
    }, 0);
    const abonosBiopagoUsd = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'Biopago') return acc + (a.monto || 0);
      return acc;
    }, 0);
    const abonosPagoMovilVes = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'PagoMovil') return acc + (a.monto_ves || (a.monto || 0) * tasaDia);
      return acc;
    }, 0);
    const abonosPagoMovilUsd = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'PagoMovil') return acc + (a.monto || 0);
      return acc;
    }, 0);
    const abonosPuntoVes = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'TarjetaBs' || m === 'Tarjeta$') return acc + (a.monto_ves || (a.monto || 0) * tasaDia);
      return acc;
    }, 0);
    const abonosPuntoUsd = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'TarjetaBs' || m === 'Tarjeta$') return acc + (a.monto || 0);
      return acc;
    }, 0);
    const abonosZelleUsd = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'Zelle') return acc + (a.monto || 0);
      return acc;
    }, 0);
    const abonosBinanceUsd = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'Binance') return acc + (a.monto || 0);
      return acc;
    }, 0);
    const abonosPayPalUsd = targetShiftAbonos.reduce((acc, a) => {
      const m = String(a.metodo_pago || '');
      if (m === 'PayPal') return acc + (a.monto || 0);
      return acc;
    }, 0);
    const abonoClientesUsd = abonosEfectivoUsd + abonosEfectivoBsUsd + abonosBiopagoUsd + abonosPagoMovilUsd + abonosPuntoUsd + abonosZelleUsd + abonosBinanceUsd + abonosPayPalUsd;

    const entradaEfectivoUsd = targetEntradaUsd;
    const entradaEfectivoVes = targetEntradaVes;
    const salidaEfectivoUsd = targetSalidaUsd;
    const salidaEfectivoVes = targetSalidaVes;
    const devolucionEfectivoUsd = targetDevolucionUsd;
    const devolucionEfectivoVes = targetDevolucionVes;
    const vueltosEntregadosUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro?.startsWith('DEV-')) return acc;
      if (typeof sale.vueltoUSD === 'number' && sale.vueltoUSD > 0) return acc + sale.vueltoUSD;
      if (typeof (sale as any).vuelto_usd === 'number' && (sale as any).vuelto_usd > 0) return acc + (sale as any).vuelto_usd;
      return acc;
    }, 0);

    const vueltosEntregadosVes = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro?.startsWith('DEV-')) return acc;
      if (typeof sale.vueltoVES === 'number' && sale.vueltoVES > 0) return acc + sale.vueltoVES;
      if (typeof (sale as any).vuelto_ves === 'number' && (sale as any).vuelto_ves > 0) return acc + (sale as any).vuelto_ves;
      
      const cashPayUsd = (sale.pagos || []).find((p: any) => p.metodo === 'Efectivo$');
      const cashPayVes = (sale.pagos || []).find((p: any) => p.metodo === 'EfectivoBs');
      const cashUsdMonto = cashPayUsd ? (cashPayUsd.montoUSD || cashPayUsd.monto || 0) : 0;
      const cashVesMonto = cashPayVes ? (cashPayVes.montoVES || cashPayVes.montoBs || (cashPayVes.monto && cashPayVes.monto > 100 ? cashPayVes.monto : 0)) : 0;

      if (cashUsdMonto > sale.totalUSD) {
        const diffUsd = cashUsdMonto - sale.totalUSD;
        return acc + parseFloat((diffUsd * tasaDia).toFixed(2));
      } else if (cashVesMonto > (sale.totalVES || sale.totalUSD * tasaDia)) {
        const diffVes = cashVesMonto - (sale.totalVES || sale.totalUSD * tasaDia);
        return acc + parseFloat(diffVes.toFixed(2));
      }
      return acc;
    }, 0);

    const cambioDivisasTotalUsdEquiv = cambioDivisasUsd + (tasaDia > 0 ? (cambioDivisasVesSalida - (cambioDivisasUsd * tasaDia)) / tasaDia : cambioDivisasEur);
    const rawExpectedUsd = aperturaUsd + ventasEfectivoUsd + abonosEfectivoUsd + entradaEfectivoUsd + cambioDivisasTotalUsdEquiv - salidaEfectivoUsd - devolucionEfectivoUsd - vueltosEntregadosUsd;
    const dineroEnCajaExpected = Math.max(0, parseFloat(rawExpectedUsd.toFixed(2)));

    const rawExpectedVes = aperturaVes + ventasEfectivoVes + abonosEfectivoBsVes + entradaEfectivoVes - salidaEfectivoVes - devolucionEfectivoVes - vueltosEntregadosVes;
    const expectedVes = Math.max(0, parseFloat(rawExpectedVes.toFixed(2)));
    
    const ventasTotalesUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.totalUSD || 0);
    }, 0);
    const descuentosUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.descuento || 0);
    }, 0);
    const ventaBrutaUsd = ventasTotalesUsd + descuentosUsd;
    
    const getPayUsd = (p: Payment) => {
      const val = typeof p?.montoUSD === 'number' && !isNaN(p.montoUSD) ? p.montoUSD : (typeof p?.monto === 'number' && !isNaN(p.monto) ? p.monto : 0);
      return isNaN(val) ? 0 : val;
    };

    const getPayVes = (p: Payment) => {
      const val = typeof p?.monto === 'number' && !isNaN(p.monto) ? p.monto : 0;
      return isNaN(val) ? 0 : val;
    };

    const pagosEfectivoUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => p.metodo === 'Efectivo$' ? a + getPayUsd(p) : a, 0);
    }, 0);

    const pagosEfectivoBsUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => p.metodo === 'EfectivoBs' ? a + getPayUsd(p) : a, 0);
    }, 0);

    const pagosEfectivoBsVes = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => p.metodo === 'EfectivoBs' ? a + getPayVes(p) : a, 0);
    }, 0) + abonosEfectivoBsVes;

    const pagosBiopagoUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => p.metodo === 'Biopago' ? a + getPayUsd(p) : a, 0);
    }, 0);

    const pagosBiopagoVes = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => p.metodo === 'Biopago' ? a + getPayVes(p) : a, 0);
    }, 0) + abonosBiopagoVes + avanceBiopagoVes;

    const pagosPagoMovilUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => p.metodo === 'PagoMovil' ? a + getPayUsd(p) : a, 0);
    }, 0);

    const pagosPagoMovilVes = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => p.metodo === 'PagoMovil' ? a + getPayVes(p) : a, 0);
    }, 0) + abonosPagoMovilVes + avancePagoMovilVes;

    const pagosTransferenciaUsd = 0;
    const pagosTransferenciaVes = avanceTransferenciaVes;

    const pagosPuntoUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => (p.metodo === 'Tarjeta$' || p.metodo === 'TarjetaBs') ? a + getPayUsd(p) : a, 0);
    }, 0);

    const pagosPuntoVes = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => (p.metodo === 'Tarjeta$' || p.metodo === 'TarjetaBs') ? a + getPayVes(p) : a, 0);
    }, 0) + abonosPuntoVes + avancePuntoVes;
    
    const pagosTarjetaUsd = pagosEfectivoBsUsd; 
    const pagosCreditoUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => p.metodo === 'CreditoCliente' ? a + getPayUsd(p) : a, 0);
    }, 0);
    const pagosPuntosUsd = pagosBiopagoUsd; 
    
    const totalDevolucionesUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) {
        const val = typeof sale.totalUSD === 'number' && !isNaN(sale.totalUSD) ? Math.abs(sale.totalUSD) : 0;
        return acc + val;
      }
      return acc;
    }, 0);

    const devolucionVentasUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) {
        const isUsdDev = (sale.pagos || []).some(p => {
          const m = String(p.metodo || '');
          return m === 'Efectivo$' || m.endsWith('$') || m === 'Binance' || m === 'PayPal' || m === 'Zelle';
        });
        const isVesDev = (sale.pagos || []).some(p => {
          const m = String(p.metodo || '');
          return m === 'EfectivoBs' || m.endsWith('Bs') || m === 'PagoMovil' || m === 'Biopago';
        });

        if (isUsdDev) {
          const val = typeof sale.totalUSD === 'number' && !isNaN(sale.totalUSD) ? Math.abs(sale.totalUSD) : 0;
          return acc + val;
        } else if (!isVesDev) {
          const val = (sale.totalUSD && (!sale.totalVES || sale.totalVES === 0)) ? Math.abs(sale.totalUSD) : 0;
          return acc + val;
        }
      }
      return acc;
    }, 0);

    const devolucionVentasVes = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) {
        const isVesDev = (sale.pagos || []).some(p => {
          const m = String(p.metodo || '');
          return m === 'EfectivoBs' || m.endsWith('Bs') || m === 'PagoMovil' || m === 'Biopago';
        });
        const isUsdDev = (sale.pagos || []).some(p => {
          const m = String(p.metodo || '');
          return m === 'Efectivo$' || m.endsWith('$') || m === 'Binance' || m === 'PayPal' || m === 'Zelle';
        });

        if (isVesDev) {
          const val = typeof sale.totalVES === 'number' && !isNaN(sale.totalVES) ? Math.abs(sale.totalVES) : 0;
          return acc + val;
        } else if (!isUsdDev && typeof sale.totalVES === 'number' && sale.totalVES > 0) {
          const val = Math.abs(sale.totalVES);
          return acc + val;
        }
      }
      return acc;
    }, 0);

    const rawVentaTotal = ventasTotalesUsd - totalDevolucionesUsd;
    const ventaTotalUsd = isNaN(rawVentaTotal) ? 0 : parseFloat(rawVentaTotal.toFixed(2));

    const getItemUnitCost = (item: any) => {
      if (!item) return 0;
      let cost = 0;
      if (typeof item.product?.precio_costo_usd === 'number' && item.product.precio_costo_usd > 0) {
        cost = item.product.precio_costo_usd;
      } else if (typeof item.precio_costo_usd === 'number' && item.precio_costo_usd > 0) {
        cost = item.precio_costo_usd;
      } else if (typeof item.costo_usd === 'number' && item.costo_usd > 0) {
        cost = item.costo_usd;
      }
      
      if (!cost) {
        const code = item.product?.barcode || item.barcode || item.productCode || item.code;
        if (code) {
          const match = products.find(p => p.barcode === code);
          if (match && typeof match.precio_costo_usd === 'number' && match.precio_costo_usd > 0) {
            cost = match.precio_costo_usd;
          }
        }
      }
      return isNaN(cost) ? 0 : cost;
    };

    const safeNum = (val: any) => {
      const n = typeof val === 'number' ? val : parseFloat(String(val || 0));
      return isNaN(n) ? 0 : n;
    };

    const isItemExempt = (i: any) => {
      if (i.product?.exento_impuesto === true || (i.product?.porcentaje_impuesto !== undefined && i.product?.porcentaje_impuesto === 0)) return true;
      if (i.exento_impuesto === true || (i.porcentaje_impuesto !== undefined && i.porcentaje_impuesto === 0)) return true;
      const desc = (i.product?.description || i.product?.descripcion || (i as any)?.descripcion || (i as any)?.description || '').toLowerCase();
      if (desc.includes('harina pan') || desc.includes('harina p.a.n.')) return true;
      return false;
    };

    const calculateSaleNetWithoutIVA = (sale: any) => {
      const isDev = sale.factura_nro?.startsWith('DEV-');
      const items = sale.items || [];
      let netVal = 0;
      if (!items.length) {
        const total = Math.abs(safeNum(sale.totalUSD));
        const iva = Math.abs(safeNum(sale.iva));
        netVal = Math.max(0, total - iva);
      } else {
        const discount = safeNum(sale.descuento);
        const rawTotalSale = items.reduce((acc: number, i: any) => {
          const qty = safeNum(i.qty ?? (i as any).cantidad);
          const price = safeNum(i.priceUSD ?? (i as any).precio_unitario_usd) || (qty > 0 ? Math.abs(safeNum(i.totalUSD ?? (i as any).total_fila_usd)) / qty : 0);
          return acc + (price * qty);
        }, 0);

        const discountFactor = rawTotalSale > 0 ? (1 - (discount / rawTotalSale)) : 1;

        let grossTaxable = 0;
        let grossExempt = 0;

        items.forEach((i: any) => {
          const qty = safeNum(i.qty ?? (i as any).cantidad);
          const price = safeNum(i.priceUSD ?? (i as any).precio_unitario_usd) || (qty > 0 ? Math.abs(safeNum(i.totalUSD ?? (i as any).total_fila_usd)) / qty : 0);
          const itemSale = price * qty;
          if (isItemExempt(i)) {
            grossExempt += itemSale;
          } else {
            grossTaxable += itemSale;
          }
        });

        const netTaxable = grossTaxable * discountFactor;
        const netExempt = grossExempt * discountFactor;
        const baseImponible = netTaxable > 0 ? (netTaxable / 1.16) : 0;
        netVal = baseImponible + netExempt;
      }

      return isDev ? -Math.abs(netVal) : netVal;
    };

    const subtotalNetoUsd = targetShiftSales.reduce((acc, sale) => {
      return acc + calculateSaleNetWithoutIVA(sale);
    }, 0);

    const costoTotalUsd = targetShiftSales.reduce((acc, sale) => {
      const isDev = sale.factura_nro?.startsWith('DEV-');
      const mult = isDev ? -1 : 1;
      return acc + (sale.items || []).reduce((itemAcc, item) => {
        const qty = typeof item.qty === 'number' && !isNaN(item.qty) ? item.qty : (parseFloat(String(item.qty)) || 0);
        return itemAcc + (getItemUnitCost(item) * qty * mult);
      }, 0);
    }, 0);

    const utilidadUsd = subtotalNetoUsd - costoTotalUsd;

    const pagosBinanceUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => p.metodo === 'Binance' ? a + getPayUsd(p) : a, 0);
    }, 0);

    const pagosPayPalUsd = targetShiftSales.reduce((acc, sale) => {
      if (sale.factura_nro.startsWith('DEV-')) return acc;
      return acc + (sale.pagos || []).reduce((a, p) => p.metodo === 'PayPal' ? a + getPayUsd(p) : a, 0);
    }, 0);

    const localCierreResult: CierreCaja = {
      id: Date.now(),
      fecha: new Date().toLocaleString(),
      fechaCierre: new Date().toLocaleString(),
      fechaApertura: localStorage.getItem('pos_apertura_fecha') || new Date().toLocaleString(),
      usuario: currentUser?.nombre || 'SISTEMA',
      aperturaUsd,
      aperturaVes,
      realUsd,
      realVes,
      expectedVes,
      costoTotalUsd,
      utilidadUsd,
      ventasEfectivoUsd,
      ventasEfectivoVes,
      abonoClientesUsd,
      abonosEfectivoUsd,
      abonosEfectivoBsVes,
      abonosEfectivoBsUsd,
      abonosBiopagoVes,
      abonosBiopagoUsd,
      abonosPagoMovilVes,
      abonosPagoMovilUsd,
      abonosPuntoVes,
      abonosPuntoUsd,
      abonosZelleUsd,
      abonosBinanceUsd,
      abonosPayPalUsd,
      entradaEfectivoUsd,
      entradaEfectivoVes,
      salidaEfectivoUsd,
      salidaEfectivoVes,
      devolucionEfectivoUsd,
      devolucionEfectivoVes,
      vueltosEntregadosUsd,
      vueltosEntregadosVes,
      dineroEnCajaExpected,
      ventasTotalesUsd,
      descuentosUsd,
      ventaBrutaUsd,
      pagosEfectivoUsd,
      pagosEfectivoBsUsd,
      pagosEfectivoBsVes,
      pagosBiopagoUsd,
      pagosBiopagoVes,
      pagosPuntoUsd,
      pagosPuntoVes,
      pagosPagoMovilUsd,
      pagosPagoMovilVes,
      pagosTransferenciaUsd,
      pagosTransferenciaVes,
      pagosBinanceUsd,
      pagosPayPalUsd,
      pagosTarjetaUsd,
      pagosCreditoUsd,
      pagosPuntosUsd,
      devolucionVentasUsd,
      devolucionVentasVes,
      ventaTotalUsd,
      subtotalNetoUsd,
      cambioDivisasCount,
      cambioDivisasUsd,
      cambioDivisasEur,
      cambioDivisasVesSalida,
      realEur,
      diffEur: realEur - cambioDivisasEur,
      diffVes: realVes - expectedVes,
      diffUsd: realUsd - dineroEnCajaExpected,
      ventaEfectivoComisionVes: avanceComisionTotalVes,
      ventaEfectivoComisionUsd: avanceComisionTotalUsd
    };

    setCierreResult(localCierreResult);
  };

  const handleConfirmCierre = async () => {
    if (!cierreResult) return;
    setIsClosingCaja(true);
    setShowAperturaModal(false);
    setIsSendingWa(true);


    const realUsd = parseFloat(cierreRealUsd) || 0;
    const realVes = parseFloat(cierreRealVes) || 0;
    const diffUsd = realUsd - cierreResult.dineroEnCajaExpected;
    const diffVes = realVes - cierreResult.expectedVes;

    const template = waCierreStatus.messageTemplate || 
      `📊 *REPORTE DE ARQUEO Y CIERRE DE CAJA*\n\n` +
      `📅 *Fecha:* {fecha}\n` +
      `👤 *Cajero:* {usuario}\n` +
      `🖥️ *Terminal:* {terminal}\n\n` +
      `💵 *EFECTIVO ESPERADO EN GAVETA:*\n` +
      `• Dólares (USD): $ {dineroEnCajaExpected}\n` +
      `• Bolívares (VES): Bs {expectedVes}\n\n` +
      `📥 *EFECTIVO FÍSICO RECIBIDO:*\n` +
      `• Dólares (USD): $ {realUsd}\n` +
      `• Bolívares (VES): Bs {realVes}\n\n` +
      `⚖️ *DIFERENCIA (BALANCE):*\n` +
      `• Dólares (USD): {diffUsd}\n` +
      `• Bolívares (VES): {diffVes}\n\n` +
      `🛍️ *VENTAS TOTALES DEL TURNO:* $ {ventaTotalUsd} USD\n` +
      `📉 *DESCUENTOS APLICADOS:* $ {descuentosUsd} USD\n\n` +
      `*WinterPosAL Cloud System*`;

    const summaryText = template
      .replace(/{fecha}/g, cierreResult.fechaCierre || cierreResult.fecha || '')
      .replace(/{usuario}/g, cierreResult.usuario.toUpperCase())
      .replace(/{terminal}/g, localStorage.getItem('pos_terminal_name') || 'CAJA_01')
      .replace(/{dineroEnCajaExpected}/g, cierreResult.dineroEnCajaExpected.toFixed(2))
      .replace(/{expectedVes}/g, cierreResult.expectedVes.toFixed(2))
      .replace(/{realUsd}/g, realUsd.toFixed(2))
      .replace(/{realVes}/g, realVes.toFixed(2))
      .replace(/{diffUsd}/g, diffUsd >= 0 ? `+$${diffUsd.toFixed(2)} (Sobrante)` : `-$${Math.abs(diffUsd).toFixed(2)} (Faltante)`)
      .replace(/{diffVes}/g, diffVes >= 0 ? `+Bs ${diffVes.toFixed(2)} (Sobrante)` : `-Bs ${Math.abs(diffVes).toFixed(2)} (Faltante)`)
      .replace(/{ventaTotalUsd}/g, cierreResult.ventaTotalUsd.toFixed(2))
      .replace(/{descuentosUsd}/g, cierreResult.descuentosUsd.toFixed(2));

    let waSuccess = false;
    let fallbackTriggered = false;
    let imageBase64 = '';

    if (waCierreStatus.enabled && sendToWhatsApp) {
      try {
        const htmlToImage = await import(/* @vite-ignore */ 'html-to-image');
        const element = document.getElementById('cierre-arqueo-card');
        
        if (element) {
          imageBase64 = await htmlToImage.toPng(element, { backgroundColor: '#ffffff', quality: 0.95 });
        }

        const res = await fetch(getApiUrl('/whatsapp/send-cierre'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: imageBase64 || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            textSummary: summaryText
          })
        });

        if (res.ok) {
          waSuccess = true;
        } else {
          const errData = await res.json();
          console.warn('Failed to send closure to WhatsApp server:', errData.error);
        }
      } catch (err) {
        console.error('Error generating/sending WhatsApp cierre:', err);
      }

      if (!waSuccess) {
        fallbackTriggered = true;
        try {
          if (imageBase64) {
            const resBlob = await fetch(imageBase64);
            const blob = await resBlob.blob();
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type]: blob })
            ]);
          } else {
            await navigator.clipboard.writeText(summaryText);
          }
        } catch (clipErr) {
          console.warn('Failed to copy to clipboard:', clipErr);
        }
      }
    }

    await onCerrarCaja(cierreResult.realUsd, cierreResult.realVes ?? 0, {
      ...cierreResult,
      terminal: localStorage.getItem('pos_terminal_name') || 'CAJA_01'
    });

    setIsSendingWa(false);
    setShowCierreModal(false);
    setCierreResult(null);

    if (waCierreStatus.enabled && sendToWhatsApp && fallbackTriggered) {
      await showAlert(
        '⚠️ El reporte no pudo enviarse automáticamente por WhatsApp (sin conexión o bot inactivo).\n\n' +
        'El cierre se guardó con éxito en el sistema. Hemos copiado la información al portapapeles.',
        'Cierre Guardado con Alerta',
        'warning'
      );
    } else if (waCierreStatus.enabled && sendToWhatsApp && waSuccess) {
      await showAlert('¡Cierre registrado y notificado exitosamente por WhatsApp al grupo!', 'Cierre Exitoso', 'success');
    }
  };


  const handleSaveCajaMovement = (e: React.FormEvent) => {
    e.preventDefault();
    const usd = parseFloat(movUsd) || 0;
    const ves = parseFloat(movVes) || 0;
    if (!movDesc.trim()) {
      showAlert('Debe especificar una descripción para el movimiento de caja.', 'Descripción Requerida', 'warning');
      return;
    }
    onRegisterCajaMovement(movType, movDesc.trim(), usd, ves);
    setShowMovementsModal(false);
    setMovDesc('');
    setMovUsd('');
    setMovVes('');
    showToast('Movimiento de caja registrado exitosamente.', 'success');
  };

  const venezuelanBanks = [
    'BANCO DE VENEZUELA S.A.',
    'BANESCO BANCO UNIVERSAL',
    'BANCO MERCANTIL C.A.',
    'BANCO PROVINCIAL',
    'BANCO OCCIDENTAL DE DESCUENTO (BOD)',
    'BANCO EXTERIOR C.A.',
    'BANCO NACIONAL DE CREDITO (BNC)',
    'BANCO FONDO COMUN (BFC)'
  ];

  return (
    <div 
      onClick={handlePosContainerClick}
      className="grid grid-cols-1 xl:grid-cols-4 gap-6 font-mono text-xs text-slate-800 select-none"
    >
      
      {/* WARNING BANNER: MODO CONSULTA */}
      {!cajaAbierta && (
        <div className="xl:col-span-4 bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm font-sans mb-1">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <span className="text-xs font-bold text-amber-900 block">Modo Solo Consulta Activo (Caja Cerrada)</span>
              <span className="text-[11px] text-amber-800 block">Puede consultar catálogo, inventario, ventas pasadas y tasas. Para procesar cobros debe aperturar caja.</span>
            </div>
          </div>
          <button
            onClick={() => {
              setUserDismissedApertura(false);
              setShowAperturaModal(true);
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold px-3.5 py-1.5 rounded-lg text-xs tracking-wide transition-all shadow whitespace-nowrap"
          >
            Aperturar Caja Ahora
          </button>
        </div>
      )}

      {/* LEFT TERMINAL AREA: PRODUCTS SELECTION & SALE TABLE */}
      <div className="xl:col-span-3 space-y-4 flex flex-col h-[calc(100vh-180px)]">
        
        {/* INPUTS HEADER STACK - Light Mode with 12-Column Responsive Proportions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-2.5 bg-white p-2.5 sm:p-3 border border-slate-200 rounded-xl shadow-sm items-end">
          
          {/* SEARCH PRODUCT SELECTOR (4 Cols - 33.3% Width) */}
          <div className="md:col-span-1 lg:col-span-4 space-y-1">
            <label className="text-[10px] text-slate-500 font-sans block font-semibold">Buscar Producto (F6)</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                autoFocus={true}
                type="text"
                placeholder="Escriba código o descripción..."
                value={searchProdTerm}
                onChange={(e) => {
                  setSearchProdTerm(e.target.value);
                  setSearchSelectedIndex(-1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    if (searchSuggestions.length > 0) {
                      e.preventDefault();
                      setSearchSelectedIndex(prev => (prev < searchSuggestions.length - 1 ? prev + 1 : 0));
                    }
                  } else if (e.key === 'ArrowUp') {
                    if (searchSuggestions.length > 0) {
                      e.preventDefault();
                      setSearchSelectedIndex(prev => (prev > 0 ? prev - 1 : searchSuggestions.length - 1));
                    }
                  } else if (e.key === 'Escape') {
                    setSearchSelectedIndex(-1);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    const term = searchProdTerm.trim();
                    if (!term) return;

                    let matched: Product | undefined;

                    if (searchSelectedIndex >= 0 && searchSelectedIndex < searchSuggestions.length) {
                      matched = searchSuggestions[searchSelectedIndex];
                    } else {
                      // Búsqueda ultra rápida O(1) por código de barra exacto
                      matched = productsByBarcodeMap.get(term.toUpperCase()) || productsByBarcodeMap.get(term);

                      // Si no hay código de barra exacto pero hay sugerencias, tomar la primera
                      if (!matched && searchSuggestions.length > 0) {
                        matched = searchSuggestions[0];
                      }
                    }

                    if (matched) {
                      handleAddProduct(matched);
                      setSearchProdTerm('');
                      setSearchSelectedIndex(-1);
                      focusSearchInput();
                    } else {
                      showToast(`Código "${term}" no registrado o inexistente en el inventario.`, 'error');
                      setSearchProdTerm('');
                      setSearchSelectedIndex(-1);
                      focusSearchInput();
                    }
                  }
                }}
                className="w-full h-[38px] bg-slate-50 border border-slate-350 rounded-lg p-2 pl-9 text-xs outline-none text-slate-800 focus:bg-white focus:border-winter-blueBtn font-sans"
              />
              
              {/* Autocomplete Dropdown - Light Styled */}
              {searchProdTerm && searchSuggestions.length > 0 && (
                <div 
                  ref={searchDropdownRef}
                  className="absolute left-0 right-0 top-11 bg-white border border-slate-250 rounded-lg max-h-48 overflow-y-auto z-40 shadow-2xl divide-y divide-slate-100"
                >
                  {searchSuggestions.map((p, idx) => {
                    const hasStock = p.stock_actual > 0;
                    const priceVES = p.precio_detalle_usd * tasaDia;
                    const isSelected = idx === searchSelectedIndex;

                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!hasStock}
                        onMouseEnter={() => setSearchSelectedIndex(idx)}
                        onClick={() => {
                          if (!hasStock) return;
                          handleAddProduct(p);
                          setSearchProdTerm('');
                          setSearchSelectedIndex(-1);
                          focusSearchInput();
                        }}
                        className={`w-full text-left p-2.5 text-[11px] font-sans block transition-all ${
                          isSelected
                            ? 'bg-blue-100 text-slate-900 border-l-4 border-winter-blueBtn font-semibold shadow-inner'
                            : hasStock 
                              ? 'hover:bg-slate-100 text-slate-800 hover:text-slate-900' 
                              : 'opacity-50 cursor-not-allowed text-slate-400 bg-slate-50'
                        }`}
                      >
                        <span className="font-mono text-slate-500 font-bold mr-1.5">{p.barcode}</span>
                        <span className={`${!hasStock ? 'line-through' : ''}`}>{p.description}</span>
                        {p.exento_impuesto === true ? (
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[8.5px] px-1 py-0.2 rounded font-mono ml-1.5 inline-block shadow-2xs" title="Producto Exento de IVA (0%)">
                            (E)
                          </span>
                        ) : (
                          <span className="bg-sky-50 text-sky-800 border border-sky-200 font-bold text-[8px] px-1 py-0.2 rounded font-mono ml-1.5 inline-block" title="Producto Gravable con IVA">
                            (G)
                          </span>
                        )}
                        {hasStock ? (
                          <span className="float-right text-emerald-600 font-bold font-mono text-right flex flex-col items-end">
                            <span>${p.precio_detalle_usd.toFixed(2)} <span className="text-slate-600 font-bold text-[11px] font-mono">/ {formatBs(priceVES)}</span></span>
                            <span className="text-[9px] text-slate-500 font-sans font-semibold">Stock: {formatStockVal(p.stock_actual, p.a_granel)} {p.a_granel ? 'kg' : 'uds'}</span>
                          </span>
                        ) : (
                          <span className="float-right text-red-500 font-bold font-mono text-right flex flex-col items-end">
                            <span>SIN STOCK</span>
                            <span className="text-[9px] text-slate-400 font-sans font-normal">Stock: {formatStockVal(p.stock_actual, p.a_granel)} {p.a_granel ? 'kg' : 'uds'}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* SEARCHABLE CLIENT SELECTOR (4 Cols - 33.3% Width) */}
          <div className="md:col-span-1 lg:col-span-4 space-y-1 relative" ref={clientDropdownRef}>
            <label className="text-[10px] text-slate-500 font-sans block font-semibold">Cliente Facturación</label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-grow">
                <input
                  type="text"
                  placeholder="Buscar por Nombre o Cédula/RIF..."
                  value={isClientDropdownOpen ? clientSearchTerm : `${selectedClient.nombre} (${selectedClient.cedula_rif})${selectedClient.aplica_precio_costo ? ' ★ P.COSTO' : ''}${selectedClient.porcentaje_descuento > 0 ? ` [Desc ${selectedClient.porcentaje_descuento}%]` : ''}`}
                  onFocus={() => {
                    setIsClientDropdownOpen(true);
                    setClientSearchTerm('');
                    setClientSelectedIndex(-1);
                  }}
                  onChange={(e) => {
                    setClientSearchTerm(e.target.value);
                    setClientSelectedIndex(-1);
                    if (!isClientDropdownOpen) setIsClientDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      if (filteredClients.length > 0) {
                        e.preventDefault();
                        if (!isClientDropdownOpen) setIsClientDropdownOpen(true);
                        setClientSelectedIndex(prev => (prev < filteredClients.length - 1 ? prev + 1 : 0));
                      }
                    } else if (e.key === 'ArrowUp') {
                      if (filteredClients.length > 0) {
                        e.preventDefault();
                        if (!isClientDropdownOpen) setIsClientDropdownOpen(true);
                        setClientSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredClients.length - 1));
                      }
                    } else if (e.key === 'Enter') {
                      if (isClientDropdownOpen) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (clientSelectedIndex >= 0 && clientSelectedIndex < filteredClients.length) {
                          handleSelectClient(filteredClients[clientSelectedIndex]);
                        } else if (filteredClients.length === 1) {
                          handleSelectClient(filteredClients[0]);
                        }
                      }
                    } else if (e.key === 'Escape') {
                      setIsClientDropdownOpen(false);
                      setClientSelectedIndex(-1);
                    }
                  }}
                  className={`w-full h-[38px] border rounded-lg p-2 pr-7 text-slate-800 text-xs font-sans font-bold outline-none focus:bg-white focus:border-winter-blueBtn transition-all ${
                    selectedClient.aplica_precio_costo ? 'bg-amber-50 border-amber-400 text-amber-900' : 'bg-slate-50 border-slate-350'
                  }`}
                />
                
                <button
                  type="button"
                  onClick={() => {
                    setIsClientDropdownOpen(prev => !prev);
                    if (!isClientDropdownOpen) {
                      setClientSearchTerm('');
                      setClientSelectedIndex(-1);
                    }
                  }}
                  className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 font-sans font-bold text-[10px]"
                >
                  ▼
                </button>

                {/* SEARCHABLE CLIENTS DROPDOWN LIST */}
                {isClientDropdownOpen && (
                  <div 
                    ref={clientListContainerRef}
                    className="absolute left-0 right-0 top-11 bg-white border border-slate-250 rounded-lg max-h-60 overflow-y-auto z-50 shadow-2xl divide-y divide-slate-100 animate-fade-in font-sans"
                  >
                    {filteredClients.length > 0 ? (
                      filteredClients.map((c, idx) => {
                        const isSelected = c.id === selectedClient.id;
                        const isHighlighted = idx === clientSelectedIndex;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onMouseEnter={() => setClientSelectedIndex(idx)}
                            onClick={() => handleSelectClient(c)}
                            className={`w-full text-left p-2.5 text-xs block transition-all ${
                              isHighlighted
                                ? 'bg-blue-100 text-slate-900 border-l-4 border-winter-blueBtn font-bold shadow-inner'
                                : isSelected
                                  ? 'bg-blue-50 text-slate-900 font-semibold'
                                  : 'hover:bg-slate-100 text-slate-800 hover:text-slate-900 font-medium'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-bold uppercase text-slate-800">{c.nombre}</span>
                                <span className="text-[11px] font-mono font-bold text-slate-500 ml-2">({c.cedula_rif})</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {c.porcentaje_descuento > 0 && (
                                  <span className="bg-sky-100 text-sky-800 border border-sky-200 rounded px-1.5 py-0.5 text-[9px] font-bold">
                                    Desc {c.porcentaje_descuento}%
                                  </span>
                                )}
                                {c.aplica_precio_costo && (
                                  <span className="bg-amber-100 text-amber-800 border border-amber-300 rounded px-1.5 py-0.5 text-[9px] font-extrabold">
                                    ★ P.COSTO
                                  </span>
                                )}
                              </div>
                            </div>
                            {c.telefono && (
                              <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                                Tel: {c.telefono}
                              </div>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-400 font-sans italic">
                        No se encontraron clientes registrados con "{clientSearchTerm}".
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!quickDoc || quickDoc.trim() === '') setQuickDoc('V-');
                  setShowQuickClientModal(true);
                }}
                className="h-[38px] w-[38px] bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-base rounded-lg shadow-sm transition-all flex items-center justify-center flex-shrink-0"
                title="Registrar Nuevo Cliente (+)"
              >
                +
              </button>
            </div>
            {selectedClient.aplica_precio_costo && (
              <div className="flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded px-2 py-0.5 mt-1">
                <span className="text-amber-700 text-[9.5px] font-bold font-sans">⚠ CLIENTE A PRECIO COSTO — Facturación al costo</span>
              </div>
            )}
          </div>

          {/* VENDEDOR SELECTOR (2 Cols - 16.6% Width) */}
          <div className="md:col-span-1 lg:col-span-2 space-y-1">
            <label className="text-[10px] text-slate-500 font-sans block font-semibold truncate" title="Vendedor Asignado">
              Vendedor Asignado
            </label>
            <select
              value={selectedSeller}
              disabled={true}
              onChange={(e) => setSelectedSeller(e.target.value)}
              className="w-full h-[38px] bg-slate-100 border border-slate-300 rounded-lg px-2 text-slate-600 text-xs font-sans font-bold outline-none cursor-not-allowed truncate"
            >
              <option value={currentUser.nombre}>{currentUser.nombre}</option>
            </select>
          </div>

          {/* SELECTOR TIPO DE COMPROBANTE (2 Cols - 16.6% Width) */}
          <div className="md:col-span-1 lg:col-span-2 space-y-1">
            <label className="text-[10px] text-slate-500 font-sans block font-semibold flex items-center justify-between truncate">
              <span>Comprobante</span>
              {!canEmitNoFiscal && (
                <span className="text-[8px] text-amber-700 bg-amber-100 px-1 rounded font-mono font-bold">Solo Fiscal</span>
              )}
            </label>
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-300 gap-0.5 h-[38px] items-center">
              <button
                type="button"
                onClick={() => handleSelectTipoDoc('FACTURA_FISCAL')}
                className={`flex-1 h-full rounded-md font-bold text-[10px] font-sans transition-all flex items-center justify-center gap-1 cursor-pointer truncate px-1 ${
                  tipoDocumento === 'FACTURA_FISCAL'
                    ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-500'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="Emite Factura Fiscal Homologada por el SENIAT"
              >
                <ShieldCheck className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">Fiscal</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTipoDoc('NOTA_ENTREGA')}
                className={`flex-1 h-full rounded-md font-bold text-[10px] font-sans transition-all flex items-center justify-center gap-1 cursor-pointer truncate px-1 ${
                  tipoDocumento === 'NOTA_ENTREGA'
                    ? 'bg-blue-600 text-white shadow-xs ring-1 ring-blue-500'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title={canEmitNoFiscal ? "Emite Nota de Entrega / Comprobante de Control Interno" : "No autorizado para emitir notas de entrega"}
              >
                <FileText className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">Nota Entrega</span>
              </button>
            </div>
          </div>

        </div>

        {/* SALE ITEMS TABLE - Light Mode */}
        <div className="flex-grow bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-0">
          <div className="flex-grow overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr className="text-slate-550">
                  <th className="px-4 py-2.5 w-24">CÓDIGO</th>
                  <th className="px-4 py-2.5">DESCRIPCIÓN</th>
                  <th className="px-4 py-2.5 text-center w-24">TIPO P.</th>
                  <th className="px-4 py-2.5 text-center w-28">CANTIDAD</th>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap min-w-[110px] font-extrabold text-xs">PRECIO U.</th>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap min-w-[110px] font-extrabold text-xs">TOTAL</th>
                  <th className="px-4 py-2.5 w-12 text-center">
                    {saleItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearSale}
                        className="text-red-400 hover:text-red-600 transition-all p-1 rounded hover:bg-red-50"
                        title="Limpiar Pantalla / Cancelar Venta (End)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {saleItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-slate-450 font-sans text-xs">
                      No hay artículos cargados en la venta actual. Use el buscador de arriba.
                    </td>
                  </tr>
                ) : (
                  saleItems.map((item, idx) => {
                    const isSelected = idx === selectedItemIndex;
                    return (
                      <tr 
                        key={item.product.id} 
                        onClick={() => setSelectedItemIndex(idx)}
                        className={`cursor-pointer hover:bg-slate-50/50 transition-all ${
                          isSelected ? 'bg-blue-50/70 border-l-2 border-winter-blueBtn shadow-sm' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-bold font-mono text-slate-450">{item.product.barcode}</td>
                        <td className="px-4 py-3 font-sans select-text">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-850">{item.product.description}</span>
                            {item.product.exento_impuesto === true ? (
                              <span className="bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[9px] px-1.5 py-0.5 rounded font-mono shadow-2xs" title="Producto Exento de IVA (0%)">
                                (E)
                              </span>
                            ) : (
                              <span className="bg-sky-50 text-sky-800 border border-sky-200 font-bold text-[8.5px] px-1 py-0.5 rounded font-mono" title="Producto Gravable con IVA">
                                (G)
                              </span>
                            )}
                            {item.product.a_granel && (
                              <span className="bg-orange-100 text-orange-800 text-[9px] px-1.5 py-0.5 rounded font-bold font-sans">A Granel</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] border font-bold ${
                            item.priceType === 'Mayor' 
                              ? 'bg-purple-50 border-purple-200 text-purple-700' 
                              : 'bg-emerald-50 border-emerald-250 text-emerald-700'
                          }`}>
                            {item.priceType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleUpdateItemQty(item.product.id, item.qty - (item.product.a_granel ? 0.1 : 1)); }}
                              className="bg-slate-100 border border-slate-205 hover:bg-slate-200 hover:border-slate-350 w-6 h-6 flex items-center justify-center rounded text-slate-700 text-sm font-bold"
                            >
                              -
                            </button>
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                setQtyEditItem(item);
                                setQtyEditVal(item.product.a_granel ? item.qty.toFixed(3) : item.qty.toString());
                                setShowQtyEditModal(true);
                              }}
                              className="font-bold text-center text-slate-800 text-sm cursor-pointer underline decoration-dotted text-blue-600 hover:text-blue-800 px-1 min-w-[32px] inline-block"
                            >
                              {item.product.a_granel ? item.qty.toFixed(3) : item.qty}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleUpdateItemQty(item.product.id, item.qty + (item.product.a_granel ? 0.1 : 1)); }}
                              className="bg-slate-100 border border-slate-205 hover:bg-slate-200 hover:border-slate-350 w-6 h-6 flex items-center justify-center rounded text-slate-700 text-sm font-bold"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          <div className="flex flex-col text-right">
                            <span className="text-sm font-black text-slate-900 font-mono">${item.priceUSD.toFixed(2)}</span>
                            <span className="text-[13px] font-extrabold text-blue-700 font-mono tracking-tight">{formatBs(item.priceUSD * tasaDia)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          <div className="flex flex-col text-right">
                            <span className="text-base font-black text-emerald-600 font-mono">${item.totalUSD.toFixed(2)}</span>
                            <span className="text-[13px] font-extrabold text-emerald-700 font-mono tracking-tight">{formatBs(item.totalUSD * tasaDia)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.product.id); }}
                            className="text-red-500 hover:text-red-655"
                          >
                            <Trash2 className="w-4 h-4" />
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

      </div>

      {/* RIGHT SIDEBAR: FINANCIALS & CONTROL BUTTONS */}
      <div className="space-y-2.5 flex flex-col xl:h-[calc(100vh-180px)] xl:overflow-y-auto pr-1 pb-1">
        
        {/* PRODUCT VISUAL PREVIEW CARD (Selected or Active Item in Cart) */}
        {(() => {
          const activeItem = (selectedItemIndex >= 0 && saleItems[selectedItemIndex]) 
            ? saleItems[selectedItemIndex].product 
            : (saleItems.length > 0 ? saleItems[saleItems.length - 1].product : null);

          if (!activeItem) return null;

          return (
            <div 
              onClick={() => activeItem.imagen_url && setZoomedProduct(activeItem)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const menuWidth = 250;
                const menuHeight = 350;
                const x = Math.min(e.clientX, window.innerWidth - menuWidth - 15);
                const y = Math.min(e.clientY, window.innerHeight - menuHeight - 15);
                setContextMenu({ x: Math.max(10, x), y: Math.max(10, y), product: activeItem });
              }}
              className="bg-white border border-blue-200 rounded-xl p-3 shadow-sm flex items-center gap-3 bg-gradient-to-r from-blue-50/40 to-white transition-all cursor-pointer hover:border-blue-400 hover:shadow-md group select-none"
              title="Clic Izquierdo: Ampliar Foto | Clic Derecho: Menú de Opciones del Producto"
            >
              <div className="w-14 h-14 rounded-lg bg-slate-100 border border-slate-200 flex-shrink-0 flex items-center justify-center overflow-hidden relative shadow-inner group-hover:ring-2 group-hover:ring-blue-400 transition-all">
                <div className="text-slate-400 text-center text-[9px] font-bold">
                  <ImageIcon className="w-5 h-5 mx-auto text-slate-300 mb-0.5" />
                  Sin Foto
                </div>
                {activeItem.imagen_url && (
                  <>
                    <img 
                      key={`pos-item-img-${activeItem.id}-${activeItem.imagen_url}`}
                      src={activeItem.imagen_url} 
                      alt={activeItem.description} 
                      className="w-full h-full object-cover absolute inset-0 bg-white group-hover:scale-105 transition-transform" 
                      onLoad={(e) => { (e.currentTarget as HTMLElement).style.display = 'block'; }}
                      onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                      <ZoomIn className="w-4 h-4" />
                    </div>
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9.5px] text-slate-400 font-mono font-bold block">{activeItem.barcode || 'S/C'}</span>
                  {activeItem.imagen_url && (
                    <span className="text-[8.5px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                      <ZoomIn className="w-2.5 h-2.5" /> Ver Grande
                    </span>
                  )}
                </div>
                <h4 className="text-xs font-black text-slate-900 truncate leading-tight mt-0.5">{activeItem.description}</h4>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Detal:</span>
                    <span className="text-xs font-black text-emerald-600 font-mono">${activeItem.precio_detalle_usd.toFixed(2)}</span>
                    <span className="text-[9.5px] font-extrabold text-slate-500 font-mono">({formatBs(activeItem.precio_detalle_usd * tasaDia)})</span>
                  </div>

                  <div className="flex items-baseline gap-1 pl-1 border-l border-slate-200">
                    <span className="text-[9px] font-bold text-blue-600 uppercase">Mayor:</span>
                    <span className="text-xs font-black text-blue-700 font-mono">${activeItem.precio_mayor_usd.toFixed(2)}</span>
                    <span className="text-[8.5px] font-bold text-blue-700 font-mono bg-blue-50 px-1 py-0.2 rounded border border-blue-200">≥{activeItem.cantidad_mayorista || 12}</span>
                  </div>

                  <span className="text-[9px] text-slate-500 ml-auto bg-slate-100 px-1.5 py-0.5 rounded font-bold font-mono">
                    Stock: {formatStockVal(activeItem.stock_actual, activeItem.a_granel)}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* TOTALS CARD - Light Mode */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-sm">
          <div className="flex justify-between items-center text-[10.5px] border-b border-slate-100 pb-1.5">
            <div className="flex flex-col gap-0.5">
              <span className="font-sans text-slate-400 uppercase tracking-tight">SUCURSAL NIQUITAO 3000</span>
              {lastInvoiceNumber && (
                <span className="text-[9.5px] font-mono text-slate-500 tracking-wider">
                  ÚLT: <span className="text-emerald-600 font-bold">{lastInvoiceNumber}</span>
                </span>
              )}
              <span className="text-[11.5px] font-mono font-extrabold text-slate-800 tracking-wider">
                PRÓX: <span className="text-winter-blueBtn">{nextInvoiceNumber === '---' ? 'Cargando...' : nextInvoiceNumber}</span>
              </span>
            </div>
            <span className="text-winter-blueBtn font-black uppercase text-[10px]">MONEDA: USD</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-600 text-[11px]">
              <span className="font-sans">Subtotal</span>
              <span className="font-mono">${subtotalUSD.toFixed(2)}</span>
            </div>

            {grossTaxableUSD > 0 && (
              <div className="flex justify-between text-slate-500 text-[10.5px]">
                <span className="font-sans">Base Imponible (G 16%)</span>
                <span className="font-mono">${baseImponibleUSD.toFixed(2)}</span>
              </div>
            )}

            {ivaAmount > 0 && (
              <div className="flex justify-between text-slate-600 text-[11px]">
                <span className="font-sans text-slate-700 font-bold">IVA (16%)</span>
                <span className="font-mono text-slate-750 font-bold">${ivaAmount.toFixed(2)}</span>
              </div>
            )}

            {netExemptUSD > 0 && (
              <div className="flex justify-between text-emerald-700 text-[10.5px]">
                <span className="font-sans font-medium">Monto Exento (E)</span>
                <span className="font-mono font-bold">${netExemptUSD.toFixed(2)}</span>
              </div>
            )}
            
            <div className="flex justify-between items-center text-slate-655 text-[11px]">
              <span className="flex items-center gap-1 font-sans">
                Descuento
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountPct}
                  onChange={(e) => {
                    if (!isAdmin) return;
                    setDiscountPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)));
                  }}
                  disabled={!isAdmin || (selectedClient && selectedClient.porcentaje_descuento > 0)}
                  className={`w-12 text-center rounded p-0.5 font-bold font-mono text-[10px] transition-all ${
                    !isAdmin || (selectedClient && selectedClient.porcentaje_descuento > 0)
                      ? 'bg-slate-200/80 border-slate-300 text-slate-500 cursor-not-allowed opacity-90 select-none'
                      : 'bg-slate-50 border-slate-300 text-emerald-700 hover:border-emerald-500 focus:border-emerald-600'
                  }`}
                  title={
                    !isAdmin 
                      ? "🔒 Solo los usuarios administradores pueden modificar el % de descuento" 
                      : (selectedClient && selectedClient.porcentaje_descuento > 0)
                        ? "Descuento fijado automáticamente desde la ficha del cliente"
                        : "Porcentaje de descuento manual"
                  }
                />
                %
              </span>
              <span className="text-red-500 font-mono">-${discountAmountUSD.toFixed(2)}</span>
            </div>

            <div className="border-t border-slate-150 pt-2 flex justify-between items-baseline">
              <span className="font-extrabold text-slate-700 text-xs font-sans">TOTAL USD:</span>
              <span className="text-xl font-black text-emerald-600 font-mono">${totalUSD.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-baseline text-slate-500 border-t border-dashed border-slate-200 pt-1.5">
              <span className="text-[10px] font-sans uppercase font-bold text-slate-500">Ref VES (Tasa {formatBs(tasaDia, false)}):</span>
              <span className="text-sm font-black font-mono text-slate-800">{formatBs(totalVES)}</span>
            </div>
          </div>
        </div>

        {/* CONTROLS BUTTONS GRID - 3 ROWS X 2 COLUMNS */}
        <div className="grid grid-cols-2 gap-1.5">
          
          {/* FILA 1: Movimiento Caja y Cierre de Caja */}
          <button
            onClick={() => setShowMovementsModal(true)}
            disabled={!cajaAbierta}
            className="flex flex-col items-center justify-center py-2.5 px-2 bg-white border border-slate-200 rounded-lg hover:border-slate-350 hover:bg-slate-50 transition-all gap-1.5 text-center text-[11.5px] font-sans font-bold text-slate-700 shadow-sm disabled:opacity-40"
          >
            <ArrowUpRight className="w-[17px] h-[17px] text-green-600" />
            Movimiento Caja
          </button>

          <button
            onClick={() => setShowCierreModal(true)}
            disabled={!cajaAbierta}
            className="flex flex-col items-center justify-center py-2.5 px-2 bg-white border border-slate-200 rounded-lg hover:border-slate-350 hover:bg-slate-50 transition-all gap-1.5 text-center text-[11.5px] font-sans font-bold text-slate-700 shadow-sm disabled:opacity-40"
          >
            <XCircle className="w-[17px] h-[17px] text-red-500" />
            Cierre de Caja
          </button>

          {/* FILA 2: Entrada Rápida y Abono Cliente */}
          <button
            onClick={() => {
              setEntradaBarcode('');
              setEntradaQty('1');
              setShowEntradaRapidaModal(true);
            }}
            disabled={!cajaAbierta}
            className="flex flex-col items-center justify-center py-2.5 px-2 bg-white border border-slate-200 rounded-lg hover:border-slate-350 hover:bg-slate-50 transition-all gap-1.5 text-center text-[11.5px] font-sans font-bold text-slate-700 shadow-sm disabled:opacity-40"
            title="Ingreso rápido de mercancía a inventario"
          >
            <Plus className="w-[17px] h-[17px] text-sky-500" />
            Entrada Rápida
          </button>

          <button
            onClick={() => {
              setAbonoClient(null);
              setAbonoAmount('');
              setAbonoSearchTerm('');
              setShowCajaAbonoModal(true);
            }}
            disabled={!cajaAbierta}
            className="flex flex-col items-center justify-center py-2.5 px-2 bg-white border border-slate-200 rounded-lg hover:border-slate-350 hover:bg-slate-50 transition-all gap-1.5 text-center text-[11.5px] font-sans font-bold text-slate-700 shadow-sm disabled:opacity-40"
            title="Registrar abono de deuda de un cliente"
          >
            <DollarSign className="w-[17px] h-[17px] text-emerald-600" />
            Abono Cliente
          </button>

          {/* FILA 3: Devolución de Producto y Cambio / Venta Efectivo */}
          <button
            onClick={handleOpenDevolucion}
            disabled={!cajaAbierta}
            className="flex flex-col items-center justify-center py-2.5 px-2 bg-white border border-slate-200 rounded-lg hover:border-slate-350 hover:bg-slate-50 transition-all gap-1.5 text-center text-[11.5px] font-sans font-bold text-slate-700 shadow-sm disabled:opacity-40"
            title="Registrar devolución de algún producto vendido"
          >
            <RotateCcw className="w-[17px] h-[17px] text-rose-500" />
            Devolución de Producto (Ticket)
          </button>

          <button
            onClick={() => setShowCambioDivisasModal(true)}
            disabled={!cajaAbierta}
            className="flex flex-col items-center justify-center py-2.5 px-2 bg-white border border-slate-200 rounded-lg hover:border-slate-350 hover:bg-slate-50 transition-all gap-1 text-center text-[11px] font-sans font-bold text-slate-700 shadow-sm disabled:opacity-40"
            title="Cambio de divisas ($/€) y Venta de efectivo en Bs con comisión"
          >
            <div className="flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
              <Coins className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            Cambio / Venta Efectivo
          </button>

        </div>

        {/* BIG COBRAR ACTION BUTTON - WinterPOS Blue */}
        <button
          onClick={handleOpenCheckout}
          disabled={saleItems.length === 0 || !cajaAbierta}
          className="w-full bg-winter-blueBtn hover:bg-winter-blueBtnHover disabled:bg-slate-300 disabled:text-slate-500 text-white font-black text-xs tracking-wider py-2.5 rounded-xl transition-all shadow-[0_4px_12px_rgba(11,95,165,0.2)] flex items-center justify-center gap-2 select-none font-sans"
        >
          <ShoppingBag className="w-4 h-4" />
          COBRAR (F12)
        </button>

        {/* TICKETS EN ESPERA CONTROLS */}
        <div className="space-y-1.5 pt-1.5 border-t border-slate-200 mt-1 flex flex-col gap-1">
          {saleItems.length > 0 && (
            <button
              onClick={handlePutOnHold}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white py-1.5 rounded-lg text-xs font-sans font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
              title="Poner venta actual en espera"
            >
              <Clock className="w-3.5 h-3.5" />
              Poner en Espera
            </button>
          )}
          
          {ticketsOnHold.length > 0 && (
            <button
              onClick={() => setShowOnHoldModal(true)}
              className="w-full bg-slate-700 hover:bg-slate-800 text-white py-1.5 rounded-lg text-xs font-sans font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm relative"
              title="Ver ventas en espera"
            >
              <ListOrdered className="w-3.5 h-3.5 text-sky-400" />
              <span>Tickets en Espera</span>
              <span className="absolute -top-1.5 -right-1.5 bg-red-650 text-white text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white animate-bounce">
                {ticketsOnHold.length}
              </span>
            </button>
          )}

          {/* BOTÓN LIMPIAR PANTALLA (TECLA END / FIN) */}
          <button
            type="button"
            onClick={handleClearSale}
            disabled={saleItems.length === 0}
            className={`w-full py-2 rounded-xl text-xs font-sans font-black transition-all flex items-center justify-center gap-2 shadow-sm ${
              saleItems.length > 0
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-95 cursor-pointer'
                : 'bg-slate-100 text-slate-400 border border-slate-200 opacity-60 cursor-not-allowed'
            }`}
            title="Limpiar todos los productos de la pantalla y cancelar venta actual (Tecla End / Fin)"
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
            <span>LIMPIAR PANTALLA (End)</span>
          </button>
        </div>

      </div>

      {/* MODAL: CAJA APERTURA - Ultra-Modern High Visibility Styled with Focus Trap */}
      {showAperturaModal && (
        <div 
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              const container = e.currentTarget;
              const focusable = Array.from(
                container.querySelectorAll<HTMLElement>(
                  'input:not([disabled]):not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"])'
                )
              );
              if (focusable.length === 0) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];

              if (e.shiftKey) {
                if (document.activeElement === first || !container.contains(document.activeElement)) {
                  e.preventDefault();
                  last.focus();
                }
              } else {
                if (document.activeElement === last || !container.contains(document.activeElement)) {
                  e.preventDefault();
                  first.focus();
                }
              }
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onLogout();
            }
          }}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 font-sans text-slate-800 animate-fade-in"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden w-full max-w-[480px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.3)] flex flex-col">
            
            {/* Top Accent Gradient Line */}
            <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-600 flex-shrink-0" />

            <div className="p-5 sm:p-6 space-y-4">
              
              {/* HEADER SECTION */}
              <div className="text-center space-y-2">
                <div className="inline-flex p-3 bg-gradient-to-br from-emerald-50 to-teal-100 border border-emerald-200 rounded-2xl shadow-inner text-emerald-600">
                  <Banknote className="w-7 h-7 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black tracking-wide text-slate-900 uppercase">
                    Apertura de Caja Registradora
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Indique los fondos físicos en gaveta al inicio del turno
                  </p>
                </div>

                {/* Station & Cashier Info Pills */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-[11px] font-semibold text-slate-600">
                  <span className="bg-slate-100 border border-slate-250 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping" />
                    Estación: <strong className="text-slate-800">{localStorage.getItem('pos_terminal_name') || 'CAJA_01'}</strong>
                  </span>
                  <span className="bg-slate-100 border border-slate-250 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    Cajero: <strong className="text-slate-800">{currentUser?.nombre || 'Operador'}</strong>
                  </span>
                  {tasaDia > 0 && (
                    <span className="bg-blue-50 border border-blue-200 text-blue-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      Tasa: <strong>{formatBs(tasaDia)}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* FORM CONTROLS */}
              <form onSubmit={handleSaveApertura} className="space-y-3.5">
                
                {/* 1. DÓLARES USD INPUT CARD */}
                <div className="bg-gradient-to-br from-emerald-50/70 via-emerald-50/30 to-white border-2 border-emerald-300 hover:border-emerald-500 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-500/25 focus-within:shadow-md rounded-xl p-3.5 transition-all shadow-sm">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-black text-emerald-950 flex items-center gap-1.5 uppercase tracking-wide">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      Efectivo en Dólares ($ USD)
                    </label>
                    <span className="text-[10px] font-extrabold bg-emerald-100/90 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200/80">
                      Billetes Enteros
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="bg-emerald-600 text-white font-black font-mono text-xl px-3.5 py-2 rounded-lg flex items-center justify-center shadow-sm select-none">
                      $
                    </div>
                    <div className="relative flex-1">
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={aperturaUsdVal ? parseInt(aperturaUsdVal.replace(/\D/g, '') || '0', 10).toLocaleString('es-VE') : ''}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '');
                          setAperturaUsdVal(digits);
                        }}
                        className="w-full bg-white border-2 border-emerald-200 rounded-lg px-3 py-2 text-3xl sm:text-4xl font-black font-mono text-emerald-950 text-right tracking-tight focus:outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-400/40 focus:bg-emerald-50/20 shadow-inner transition-all"
                      />
                      {aperturaUsdVal !== '' && aperturaUsdVal !== '0' && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setAperturaUsdVal('')}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                          title="Limpiar monto en $"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <span className="text-xs font-black font-mono text-emerald-800 bg-emerald-100/80 px-2 py-2.5 rounded-lg border border-emerald-200 select-none">
                      USD
                    </span>
                  </div>
                </div>

                {/* 2. BOLÍVARES VES INPUT CARD */}
                <div className="bg-gradient-to-br from-indigo-50/70 via-indigo-50/30 to-white border-2 border-indigo-300 hover:border-indigo-500 focus-within:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-500/25 focus-within:shadow-md rounded-xl p-3.5 transition-all shadow-sm">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-black text-indigo-950 flex items-center gap-1.5 uppercase tracking-wide">
                      <Coins className="w-4 h-4 text-indigo-600" />
                      Efectivo en Bolívares (Bs VES)
                    </label>
                    <span className="text-[10px] font-extrabold bg-indigo-100/90 text-indigo-800 px-2 py-0.5 rounded-md border border-indigo-200/80">
                      Billetes Enteros
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="bg-indigo-600 text-white font-black font-mono text-base px-3 py-2 rounded-lg flex items-center justify-center shadow-sm select-none">
                      Bs
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={aperturaVesVal ? parseInt(aperturaVesVal.replace(/\D/g, '') || '0', 10).toLocaleString('es-VE') : ''}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '');
                          setAperturaVesVal(digits);
                        }}
                        className="w-full bg-white border-2 border-indigo-200 rounded-lg px-3 py-2 text-3xl sm:text-4xl font-black font-mono text-indigo-950 text-right tracking-tight focus:outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-400/40 focus:bg-indigo-50/20 shadow-inner transition-all"
                      />
                      {aperturaVesVal !== '' && aperturaVesVal !== '0' && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setAperturaVesVal('')}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                          title="Limpiar monto en Bs"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <span className="text-xs font-black font-mono text-indigo-800 bg-indigo-100/80 px-2 py-2.5 rounded-lg border border-indigo-200 select-none">
                      VES
                    </span>
                  </div>
                </div>

                {/* 3. RESUMEN EN VIVO DE FONDO EN CAJA */}
                <div className="bg-slate-50 border border-slate-250 rounded-xl p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-600 font-bold">Total Inicial en Gaveta:</span>
                  </div>
                  <div className="text-right font-mono font-black text-sm">
                    <span className="text-slate-900">
                      ${parseInt(aperturaUsdVal.replace(/\D/g, '') || '0', 10).toLocaleString('es-VE')} USD
                    </span>
                    <span className="text-slate-400 mx-1.5">+</span>
                    <span className="text-indigo-700">
                      Bs {parseInt(aperturaVesVal.replace(/\D/g, '') || '0', 10).toLocaleString('es-VE')} VES
                    </span>
                  </div>
                </div>

                {/* 4. BOTONES DE ACCIÓN CON FOCO DE ALTO CONTRASTE */}
                <div className="space-y-2 pt-1">
                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-winter-blueBtn to-indigo-700 hover:from-winter-blueBtnHover hover:to-indigo-800 focus:from-winter-blueBtnHover focus:to-indigo-900 text-white py-3.5 rounded-xl font-black font-sans text-xs sm:text-sm tracking-wider transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer focus:outline-none focus:ring-4 focus:ring-blue-400 focus:ring-offset-2 focus:scale-[1.02] border-2 border-transparent focus:border-white"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                    CONFIRMAR E INICIAR APERTURA (Enter)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUserDismissedApertura(true);
                      setShowAperturaModal(false);
                    }}
                    className="w-full bg-amber-500 hover:bg-amber-600 focus:bg-amber-600 text-slate-950 font-black py-2.5 rounded-xl font-sans text-xs tracking-wider transition-all shadow-sm flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer focus:outline-none focus:ring-4 focus:ring-amber-400 focus:ring-offset-2 focus:scale-[1.02] border-2 border-transparent focus:border-slate-900"
                  >
                    <Eye className="w-4 h-4" />
                    INGRESAR EN MODO CONSULTA (SIN APERTURA)
                  </button>

                  <button
                    type="button"
                    onClick={onLogout}
                    className="w-full bg-slate-100 hover:bg-slate-200 focus:bg-rose-50 text-slate-600 focus:text-rose-950 border-2 border-slate-300 focus:border-rose-400 py-2 rounded-xl font-bold font-sans text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-rose-400 focus:ring-offset-2 focus:scale-[1.02]"
                  >
                    <LogOut className="w-4 h-4" />
                    CANCELAR Y CERRAR SESIÓN (Esc)
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CHECKOUT - Light Styled */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div ref={checkoutModalRef} className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-3xl shadow-2xl flex flex-col my-auto max-h-[92vh]">
            
            <div className="bg-slate-100 border-b border-slate-250 px-6 py-3.5 flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-slate-700 tracking-widest uppercase flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-winter-blueBtn" />
                  Liquidación (Checkout)
                </span>
                
                {/* DOCUMENT TYPE BADGE IN MODAL */}
                <div className="flex items-center bg-white border border-slate-250 rounded-lg p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setTipoDocumento('FACTURA_FISCAL')}
                    className={`px-2.5 py-0.5 rounded text-[10px] font-sans font-extrabold flex items-center gap-1 transition-all ${
                      tipoDocumento === 'FACTURA_FISCAL'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    Fiscal SENIAT
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!canEmitNoFiscal) {
                        showAlert('No posee permisos para emitir comprobantes no fiscales.', 'Acceso Restringido', 'error');
                        return;
                      }
                      setTipoDocumento('NOTA_ENTREGA');
                    }}
                    className={`px-2.5 py-0.5 rounded text-[10px] font-sans font-extrabold flex items-center gap-1 transition-all ${
                      tipoDocumento === 'NOTA_ENTREGA'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    Nota Entrega
                  </button>
                </div>
              </div>
              <button onClick={() => setShowCheckoutModal(false)} className="text-slate-400 hover:text-slate-700 focus:ring-2 focus:ring-winter-blueBtn focus:outline-none p-1 rounded">✕</button>
            </div>

            <div className="overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              
              {/* Payments Form */}
              <div className="space-y-3.5">
                <div className="flex justify-between items-center border-b border-slate-200 pb-1.5 mb-1 font-sans">
                  <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest">
                    Distribución de Métodos de Cobro
                  </h3>
                  <span
                    onClick={resetPaymentFields}
                    tabIndex={-1}
                    title="Presione 'L' para limpiar todos los montos de cobro"
                    className="text-[10px] font-black text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer select-none hover:bg-red-100 transition-all"
                  >
                    🧹 Limpiar (L)
                  </span>
                </div>

                {/* ROW 1: EFECTIVO (USD & VES Side by Side) */}
                <div className="grid grid-cols-2 gap-3">
                  {companyConfig.metodos_pago_activos.includes('efectivo_usd') && (
                    <div>
                      <label className={`text-xs block mb-1 font-sans flex items-center justify-between ${cashUSDVal > 0 ? 'text-emerald-800 font-black' : 'text-slate-700 font-bold'}`}>
                        <span>Efectivo ($ USD)</span>
                        {cashUSDVal > 0 && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-sans uppercase font-black tracking-wider">✓ En uso</span>}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={payCashUSD}
                        onChange={(e) => setPayCashUSD(e.target.value)}
                        onKeyDown={(e) => handlePaymentKeyDown(e, 'cashUSD')}
                        className={`w-full border-2 rounded-lg p-2.5 text-base font-mono focus:bg-amber-50 focus:border-sky-600 focus:ring-4 focus:ring-sky-500/40 focus:shadow-md focus:outline-none transition-all ${
                          cashUSDVal > 0 
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-black ring-2 ring-emerald-400/40 shadow-sm' 
                            : 'bg-slate-50 border-slate-300 font-bold text-emerald-750'
                        }`}
                      />
                    </div>
                  )}

                  {companyConfig.metodos_pago_activos.includes('efectivo_ves') && (
                    <div>
                      <label className={`text-xs block mb-1 font-sans flex items-center justify-between ${cashVESVal > 0 ? 'text-purple-900 font-black' : 'text-slate-700 font-bold'}`}>
                        <span>Efectivo (Bs VES)</span>
                        {cashVESVal > 0 && <span className="text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full font-sans uppercase font-black tracking-wider">✓ En uso</span>}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={payCashVES}
                        onChange={(e) => setPayCashVES(e.target.value)}
                        onKeyDown={(e) => handlePaymentKeyDown(e, 'cashVES')}
                        className={`w-full border-2 rounded-lg p-2.5 text-base font-mono focus:bg-amber-50 focus:border-sky-600 focus:ring-4 focus:ring-sky-500/40 focus:shadow-md focus:outline-none transition-all ${
                          cashVESVal > 0 
                            ? 'bg-emerald-50 border-emerald-500 text-purple-950 font-black ring-2 ring-emerald-400/40 shadow-sm' 
                            : 'bg-slate-50 border-slate-300 font-bold text-purple-750'
                        }`}
                      />
                    </div>
                  )}
                </div>

                {/* ROW 2: PAGO MÓVIL & BIOPAGO (Side by Side) */}
                <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-2">
                  {companyConfig.metodos_pago_activos.includes('pago_movil') && (
                    <div className="space-y-1">
                      <label className={`text-xs block font-sans flex items-center justify-between ${pagoMovilVESVal > 0 ? 'text-emerald-800 font-black' : 'text-emerald-700 font-bold'}`}>
                        <span>Pago Móvil (Bs VES)</span>
                        {pagoMovilVESVal > 0 && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-sans uppercase font-black tracking-wider">✓ En uso</span>}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={payPagoMovilVES}
                        onChange={(e) => setPayPagoMovilVES(e.target.value)}
                        onKeyDown={(e) => handlePaymentKeyDown(e, 'pagoMovilVES')}
                        className={`w-full border-2 rounded-lg p-2.5 text-base font-mono focus:bg-amber-50 focus:border-sky-600 focus:ring-4 focus:ring-sky-500/40 focus:shadow-md focus:outline-none transition-all ${
                          pagoMovilVESVal > 0 
                            ? 'bg-emerald-50 border-emerald-500 text-slate-900 font-black ring-2 ring-emerald-400/40 shadow-sm' 
                            : 'bg-slate-50 border-slate-300 font-bold text-slate-800'
                        }`}
                      />
                    </div>
                  )}

                  {companyConfig.metodos_pago_activos.includes('biopago') && (
                    <div className="space-y-1">
                      <label className={`text-xs block font-sans flex items-center justify-between ${biopagoVESVal > 0 ? 'text-purple-900 font-black' : 'text-purple-800 font-bold'}`}>
                        <span>Biopago (Bs VES)</span>
                        {biopagoVESVal > 0 && <span className="text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full font-sans uppercase font-black tracking-wider">✓ En uso</span>}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={payBiopagoVES}
                        onChange={(e) => setPayBiopagoVES(e.target.value)}
                        onKeyDown={(e) => handlePaymentKeyDown(e, 'biopagoVES')}
                        className={`w-full border-2 rounded-lg p-2.5 text-base font-mono focus:bg-amber-50 focus:border-sky-600 focus:ring-4 focus:ring-sky-500/40 focus:shadow-md focus:outline-none transition-all ${
                          biopagoVESVal > 0 
                            ? 'bg-emerald-50 border-emerald-500 text-slate-900 font-black ring-2 ring-emerald-400/40 shadow-sm' 
                            : 'bg-slate-50 border-slate-300 font-bold text-slate-800'
                        }`}
                      />
                    </div>
                  )}
                </div>

                {/* Pago Movil Bank & Reference details expansion */}
                {pagoMovilVESVal > 0 && companyConfig.metodos_pago_activos.includes('pago_movil') && (
                  <div className="bg-emerald-50/70 border border-emerald-200 p-2.5 rounded-lg space-y-1.5 animate-fade-in">
                    <span className="text-[10px] font-black text-emerald-800 uppercase block font-sans">Datos de Pago Móvil:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={bankPagoMovil}
                        onChange={(e) => setBankPagoMovil(e.target.value)}
                        className="bg-white border-2 border-slate-300 text-xs p-2 rounded-lg text-slate-800 font-bold outline-none focus:bg-amber-50 focus:border-sky-600 focus:ring-4 focus:ring-sky-500/40 font-sans transition-all"
                      >
                        <option value="">Banco Emisor...</option>
                        {venezuelanBanks.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <input
                        type="text"
                        placeholder="N° Referencia (>3 dig)..."
                        value={refPagoMovil}
                        onChange={(e) => setRefPagoMovil(e.target.value)}
                        className="bg-white border-2 border-slate-300 p-2 rounded-lg text-xs font-bold text-yellow-800 outline-none focus:bg-amber-50 focus:border-sky-600 focus:ring-4 focus:ring-sky-500/40 transition-all font-mono"
                      />
                    </div>
                    {!isPagoMovilValid && (
                      <span className="text-[9.5px] text-red-500 font-bold block mt-1 font-sans">
                        * Ingrese Banco y Referencia (mín. 4 caracteres)
                      </span>
                    )}
                  </div>
                )}

                {/* ROW 3: DEBIT CARD & CARDS/OTHER (Side by Side) */}
                <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-2">
                  {companyConfig.metodos_pago_activos.includes('tarjeta_ves') && (
                    <div>
                      <label className={`text-xs block mb-1 font-sans flex items-center justify-between ${cardVESVal > 0 ? 'text-slate-900 font-black' : 'text-slate-700 font-bold'}`}>
                        <span>Tarjeta de Débito (Bs VES)</span>
                        {cardVESVal > 0 && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-sans uppercase font-black tracking-wider">✓ En uso</span>}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={payCardVES}
                        onChange={(e) => setPayCardVES(e.target.value)}
                        onKeyDown={(e) => handlePaymentKeyDown(e, 'cardVES')}
                        className={`w-full border-2 rounded-lg p-2.5 text-base font-mono focus:bg-amber-50 focus:border-sky-600 focus:ring-4 focus:ring-sky-500/40 focus:shadow-md focus:outline-none transition-all ${
                          cardVESVal > 0 
                            ? 'bg-emerald-50 border-emerald-500 text-slate-900 font-black ring-2 ring-emerald-400/40 shadow-sm' 
                            : 'bg-slate-50 border-slate-300 font-bold text-slate-800'
                        }`}
                      />
                    </div>
                  )}

                  {companyConfig.metodos_pago_activos.includes('tarjeta_usd') && (
                    <div>
                      <label className={`text-xs block mb-1 font-sans flex items-center justify-between ${cardUSDVal > 0 ? 'text-blue-900 font-black' : 'text-blue-800 font-bold'}`}>
                        <span>Tarjeta $ (USD)</span>
                        {cardUSDVal > 0 && <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-sans uppercase font-black tracking-wider">✓ En uso</span>}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={payCardUSD}
                        onChange={(e) => setPayCardUSD(e.target.value)}
                        onKeyDown={(e) => handlePaymentKeyDown(e, 'cardUSD')}
                        className={`w-full border-2 rounded-lg p-2.5 text-base font-mono focus:bg-amber-50 focus:border-sky-600 focus:ring-4 focus:ring-sky-500/40 focus:shadow-md focus:outline-none transition-all ${
                          cardUSDVal > 0 
                            ? 'bg-emerald-50 border-emerald-500 text-blue-950 font-black ring-2 ring-emerald-400/40 shadow-sm' 
                            : 'bg-slate-50 border-slate-300 font-bold text-blue-700'
                        }`}
                      />
                    </div>
                  )}
                </div>

                {/* Binance & PayPal side by side if active */}
                {(companyConfig.metodos_pago_activos.includes('binance') || companyConfig.metodos_pago_activos.includes('paypal')) && (
                  <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-2">
                    {companyConfig.metodos_pago_activos.includes('binance') && (
                      <div>
                        <label className={`text-xs block mb-1 font-sans flex items-center justify-between ${binanceUSDVal > 0 ? 'text-yellow-900 font-black' : 'text-yellow-800 font-bold'}`}>
                          <span>Binance ($ USD)</span>
                          {binanceUSDVal > 0 && <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-sans uppercase font-black tracking-wider">✓ En uso</span>}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={payBinanceUSD}
                          onChange={(e) => setPayBinanceUSD(e.target.value)}
                          onKeyDown={(e) => handlePaymentKeyDown(e, 'binanceUSD')}
                          className={`w-full border-2 rounded-lg p-2.5 text-base font-mono focus:bg-amber-50 focus:border-sky-600 focus:ring-4 focus:ring-sky-500/40 focus:shadow-md focus:outline-none transition-all ${
                            binanceUSDVal > 0 
                              ? 'bg-emerald-50 border-emerald-500 text-yellow-950 font-black ring-2 ring-emerald-400/40 shadow-sm' 
                              : 'bg-slate-50 border-slate-300 font-bold text-yellow-700'
                          }`}
                        />
                      </div>
                    )}

                    {companyConfig.metodos_pago_activos.includes('paypal') && (
                      <div>
                        <label className={`text-xs block mb-1 font-sans flex items-center justify-between ${paypalUSDVal > 0 ? 'text-indigo-900 font-black' : 'text-indigo-800 font-bold'}`}>
                          <span>PayPal ($ USD)</span>
                          {paypalUSDVal > 0 && <span className="text-[9px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded-full font-sans uppercase font-black tracking-wider">✓ En uso</span>}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={payPaypalUSD}
                          onChange={(e) => setPayPaypalUSD(e.target.value)}
                          onKeyDown={(e) => handlePaymentKeyDown(e, 'paypalUSD')}
                          className={`w-full border-2 rounded-lg p-2.5 text-base font-mono focus:bg-amber-50 focus:border-sky-600 focus:ring-4 focus:ring-sky-500/40 focus:shadow-md focus:outline-none transition-all ${
                            paypalUSDVal > 0 
                              ? 'bg-emerald-50 border-emerald-500 text-indigo-950 font-black ring-2 ring-emerald-400/40 shadow-sm' 
                              : 'bg-slate-50 border-slate-300 font-bold text-indigo-700'
                          }`}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Client Credit limit option */}
                {companyConfig.metodos_pago_activos.includes('credito') && selectedClient && selectedClient.limite_credito > 0 && (
                  <div className="border-t border-slate-200 pt-2 space-y-1">
                    <label className={`text-xs block font-sans flex items-center justify-between ${creditUSDVal > 0 ? 'text-red-900 font-black' : 'text-red-700 font-bold'}`}>
                      <span>Financiar a Crédito ($ USD)</span>
                      {creditUSDVal > 0 && <span className="text-[9px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded-full font-sans uppercase font-black tracking-wider">✓ En uso</span>}
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        placeholder={`Máximo $${selectedClient.credito_disponible.toFixed(2)}`}
                        value={payCreditUSD}
                        onChange={(e) => {
                          const val = e.target.value;
                          let numVal = parseFloat(val);
                          const totalPaidExcludingCreditUSD =
                            (parseFloat(payCashUSD) || 0) +
                            ((parseFloat(payCashVES) || 0) / tasaDia) +
                            ((parseFloat(payCardVES) || 0) / tasaDia) +
                            ((parseFloat(payPagoMovilVES) || 0) / tasaDia) +
                            ((parseFloat(payBiopagoVES) || 0) / tasaDia);
                          const remainingToPay = Math.max(0, totalUSD - totalPaidExcludingCreditUSD);
                          
                          if (!isNaN(numVal) && numVal > remainingToPay) {
                            setPayCreditUSD(remainingToPay.toFixed(2));
                          } else {
                            setPayCreditUSD(val);
                          }
                        }}
                        onKeyDown={(e) => handlePaymentKeyDown(e, 'creditUSD')}
                        className={`flex-grow border-2 rounded-lg p-2.5 text-base font-mono focus:bg-amber-50 focus:border-sky-600 focus:ring-4 focus:ring-sky-500/40 focus:shadow-md focus:outline-none transition-all ${
                          creditUSDVal > 0 
                            ? 'bg-emerald-50 border-emerald-500 text-red-950 font-black ring-2 ring-emerald-400/40 shadow-sm' 
                            : 'bg-slate-50 border-slate-300 font-bold text-red-600'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const totalPaidExcludingCreditUSD =
                            (parseFloat(payCashUSD) || 0) +
                            ((parseFloat(payCashVES) || 0) / tasaDia) +
                            ((parseFloat(payCardVES) || 0) / tasaDia) +
                            ((parseFloat(payPagoMovilVES) || 0) / tasaDia) +
                            ((parseFloat(payBiopagoVES) || 0) / tasaDia);
                          const remainingToPay = Math.max(0, totalUSD - totalPaidExcludingCreditUSD);
                          setPayCreditUSD(remainingToPay.toFixed(2));
                        }}
                        className="bg-red-50 border border-red-200 hover:bg-red-100 text-red-650 px-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all whitespace-nowrap flex items-center justify-center cursor-pointer"
                        title="Completar el saldo restante con crédito"
                      >
                        Completar
                      </button>
                    </div>
                    {!isCreditValid && (
                      <span className="text-[9.5px] text-red-550 font-bold block mt-1 font-sans">
                        * Límite de crédito excedido (máx: ${selectedClient.credito_disponible.toFixed(2)} USD)
                      </span>
                    )}
                    <span className="text-[9px] text-slate-500 block font-sans">
                      * El saldo pendiente del cliente se incrementará al confirmar la venta.
                    </span>
                  </div>
                )}

                {/* BOTONERÍA DE COBRAR: UBICADA JUSTO DEBAJO DEL ÚLTIMO INPUT DE MÉTODO DE PAGO */}
                <div className="space-y-2.5 pt-3 border-t-2 border-slate-200">
                  <div className={`p-3 rounded-lg border text-center font-bold tracking-wider font-sans text-xs ${
                    canConfirmCheckout
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-black text-sm'
                      : 'bg-red-50 border-red-200 text-red-700 font-black'
                  }`}>
                    {canConfirmCheckout 
                      ? '✓ PAGO COMPLETO Y VALIDADO' 
                      : (totalPaidUSD < totalUSD 
                          ? 'INGRESE LOS MEDIOS DE PAGO' 
                          : (!isPagoMovilValid || !isBiopagoValid 
                              ? 'VERIFIQUE BANCO Y REFERENCIA' 
                              : 'CRÉDITO EXCEDIDO'))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => handleConfirmCheckout(true)}
                      disabled={!canConfirmCheckout || isSubmittingSale}
                      className="bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 text-white py-3.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 font-sans focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 focus:outline-none shadow-sm cursor-pointer disabled:cursor-not-allowed active:scale-[0.98]"
                    >
                      {isSubmittingSale ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                          <span>Procesando...</span>
                        </>
                      ) : (
                        <>
                          <Ticket className="w-4 h-4" />
                          <span>Cobrar con Ticket</span>
                        </>
                      )}
                    </button>
                    
                    <button
                      onClick={() => handleConfirmCheckout(false)}
                      disabled={!canConfirmCheckout || isSubmittingSale}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white py-3.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 font-sans focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:outline-none ring-2 ring-emerald-500/20 shadow-sm cursor-pointer disabled:cursor-not-allowed active:scale-[0.98]"
                      title="Presione Enter para confirmar"
                    >
                      {isSubmittingSale ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                          <span>Guardando Venta...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Cobrar Sin Imprimir (Enter)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>

              {/* Receipt Summary Card (Right Column) */}
              <div className="flex flex-col space-y-3.5">
                
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 shadow-xs">
                  
                  {/* CLIENT INFO BANNER FOR OPERATOR CHECK */}
                  <div className="bg-sky-50 border border-sky-100 py-1.5 px-3 rounded-lg flex flex-col font-sans text-xs leading-tight">
                    <span className="text-[9px] text-sky-800 font-bold uppercase tracking-wider mb-0.5">Cliente Facturación</span>
                    <span className="font-black text-slate-850 uppercase">{selectedClient.nombre}</span>
                    <span className="font-mono font-bold text-slate-550 text-[10px] mt-0.5">{selectedClient.cedula_rif}</span>
                  </div>

                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 font-sans">
                    Resumen de Liquidación
                  </h3>
                  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-550 font-sans">Subtotal USD:</span>
                      <span className="font-bold text-slate-600 font-mono">${subtotalUSD.toFixed(2)}</span>
                    </div>
                    {discountAmountUSD > 0 && (
                      <div className="flex justify-between text-xs text-red-500">
                        <span className="font-sans">Descuento USD:</span>
                        <span className="font-bold font-mono">-${discountAmountUSD.toFixed(2)}</span>
                      </div>
                    )}
                    {grossTaxableUSD > 0 && (
                      <>
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span className="font-sans">Base Imponible (G 16%):</span>
                          <span className="font-mono">${baseImponibleUSD.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-700">
                          <span className="font-sans">IVA (16%) USD:</span>
                          <span className="font-bold font-mono">${ivaAmount.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    {netExemptUSD > 0 && (
                      <div className="flex justify-between text-xs text-emerald-700 font-medium">
                        <span className="font-sans">Monto Exento (E):</span>
                        <span className="font-bold font-mono">${netExemptUSD.toFixed(2)}</span>
                      </div>
                    )}

                    {/* HIGHLIGHTED TOTALS BOX */}
                    <div className="bg-slate-100 border border-slate-250 p-2.5 rounded-xl my-1.5 space-y-1 shadow-2xs">
                      <div className="flex justify-between items-baseline text-slate-900">
                        <span className="font-sans font-black text-xs uppercase tracking-wide">TOTAL USD:</span>
                        <span className="font-mono text-2xl font-black text-emerald-600">${totalUSD.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-baseline text-slate-700 border-t border-slate-200/80 pt-1">
                        <span className="font-sans font-bold text-xs uppercase tracking-wide">TOTAL VES:</span>
                        <span className="font-mono text-xl font-black text-slate-900">{formatBs(totalVES)}</span>
                      </div>
                    </div>
                    
                    <div className="border-t border-slate-200 pt-1.5 flex justify-between text-emerald-700 font-bold text-xs">
                      <span className="font-sans">Total Pagado USD:</span>
                      <span className="font-mono font-black text-sm">${totalPaidUSD.toFixed(2)}</span>
                    </div>

                    {/* MONTO POR LIQUIDAR */}
                    <div className={`p-2.5 rounded-xl transition-all ${
                      remainingUSD > 0 
                        ? 'bg-amber-200/90 border-2 border-amber-400 shadow-sm animate-pulse' 
                        : 'bg-emerald-50 border border-emerald-200'
                    }`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className={`font-sans font-black ${remainingUSD > 0 ? 'text-amber-950 uppercase tracking-wide text-xs' : 'text-emerald-800'}`}>
                          {remainingUSD > 0 ? '⚠️ Monto por Liquidar:' : '✅ Total Cancelado:'}
                        </span>
                        <div className="text-right font-mono flex flex-col items-end">
                          <span className={`font-black ${remainingUSD > 0 ? 'text-red-700 text-lg' : 'text-emerald-700 text-sm'}`}>
                            ${remainingUSD.toFixed(2)} USD
                          </span>
                          {remainingUSD > 0 && (
                            <span className="text-base text-red-800 font-black font-mono mt-0.5 tracking-tight">
                              {formatBs(remainingUSD * tasaDia)} VES
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* HIGHLIGHTED CHANGE / VUELTO BOX */}
                    <div className="border-t border-dashed border-slate-250 pt-2">
                      <span className="text-[10px] text-slate-500 block font-sans uppercase tracking-wider font-bold">Diferencia / Cambio (Vuelto):</span>
                      <div className="flex justify-between items-center mt-1 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg font-mono">
                        <span className="text-purple-700 font-black text-2xl">
                          {formatBs(changeVES)}
                        </span>
                        <span className="text-purple-800 font-extrabold text-xs">
                          (${changeUSD.toFixed(2)} USD)
                        </span>
                      </div>
                    </div>

                    {/* MIXED CHANGE HELPER CALCULATOR */}
                    {changeUSD > 0 && (
                      <div className="bg-purple-50/60 border border-purple-100 p-2.5 rounded-lg mt-2 space-y-1.5 text-[10px] font-sans text-purple-955">
                        <div className="font-bold border-b border-purple-100 pb-0.5 uppercase tracking-wider text-[9px] text-purple-800">
                          🧮 Auxiliar Vuelto Mixto
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9.5px] text-slate-500 block mb-0.5">Entregar en USD ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              max={changeUSD}
                              min="0"
                              placeholder="Monto en $"
                              value={mixedChangeUSDVal}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                if (val > changeUSD) {
                                  setMixedChangeUSDVal(changeUSD.toString());
                                } else {
                                  setMixedChangeUSDVal(e.target.value);
                                }
                              }}
                              className="w-full bg-white border border-purple-200 rounded p-1 font-bold font-mono text-slate-800 outline-none text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[9.5px] text-slate-500 block mb-0.5">Restante en VES (Bs)</label>
                            <div className="w-full bg-purple-100/50 border border-purple-200 rounded p-1 font-bold font-mono text-purple-900 text-sm">
                              {formatBs((changeUSD - (Math.min(changeUSD, Math.max(0, parseFloat(mixedChangeUSDVal) || 0)))) * tasaVuelto)}
                            </div>
                          </div>
                        </div>
                        <div className="text-[8.5px] text-slate-500 italic mt-0.5 leading-tight">
                          * Ingrese el monto en USD que devolverá en billetes. El sistema calcula la diferencia a devolver en Bolívares usando la tasa de vuelto ({formatBs(tasaVuelto, false)} Bs).
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* MODAL: EDITAR CANTIDAD DE ITEM */}
      {showQtyEditModal && qtyEditItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div ref={qtyEditModalRef} className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-sm shadow-2xl flex flex-col">
            
            <div className="bg-slate-100 border-b border-slate-250 px-5 py-3.5 flex justify-between items-center">
              <span className="text-xs font-black text-slate-700 tracking-widest uppercase flex items-center gap-1.5 font-sans">
                <Calculator className="w-4 h-4 text-sky-500" />
                Modificar Cantidad
              </span>
              <button onClick={() => setShowQtyEditModal(false)} className="text-slate-400 hover:text-slate-700 focus:ring-2 focus:ring-sky-500 focus:outline-none p-1 rounded">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-sky-50 border border-sky-100 p-3 rounded-lg text-xs leading-tight font-sans">
                <div className="font-extrabold uppercase text-sky-900 mb-0.5">{qtyEditItem.product.description}</div>
                <div className="font-mono text-slate-500 text-[10px] font-bold">Código: {qtyEditItem.product.barcode}</div>
                <div className="flex justify-between font-mono font-bold mt-2">
                  <span>Existencia disponible:</span>
                  <span className="text-sky-700">{formatStockVal(qtyEditItem.product.stock_actual, qtyEditItem.product.a_granel)} {qtyEditItem.product.a_granel ? 'kg' : 'und'}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-1.5 font-sans font-bold uppercase tracking-wider">
                  Ingrese nueva cantidad ({qtyEditItem.product.a_granel ? 'KG / Gramos' : 'Unidades'}):
                </label>
                <input
                  type="number"
                  step={qtyEditItem.product.a_granel ? "0.001" : "1"}
                  value={qtyEditVal}
                  onChange={(e) => setQtyEditVal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs font-bold font-mono focus:bg-white focus:ring-2 focus:ring-sky-500 focus:border-transparent focus:outline-none text-center"
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleConfirmQtyEdit();
                    }
                    if (e.key === 'Escape') {
                      setShowQtyEditModal(false);
                    }
                  }}
                />
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                onClick={() => setShowQtyEditModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold font-sans transition-all active:scale-95 focus:ring-2 focus:ring-slate-400 focus:outline-none"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmQtyEdit}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold font-sans transition-all active:scale-95 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              >
                Aceptar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: CANTIDAD A GRANEL (KG / GRAMOS) */}
      {showBulkModal && bulkProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div ref={bulkModalRef} className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-sm shadow-2xl flex flex-col">
            
            <div className="bg-slate-100 border-b border-slate-250 px-5 py-3.5 flex justify-between items-center">
              <span className="text-xs font-black text-slate-700 tracking-widest uppercase flex items-center gap-1.5 font-sans">
                <Calculator className="w-4 h-4 text-amber-500" />
                Producto a Granel
              </span>
              <button onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-slate-700 focus:ring-2 focus:ring-amber-500 focus:outline-none p-1 rounded">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-xs leading-tight font-sans">
                <div className="font-extrabold uppercase text-amber-900 mb-0.5">{bulkProduct.description}</div>
                <div className="font-mono text-slate-500 text-[10px] font-bold">Código: {bulkProduct.barcode}</div>
                <div className="flex justify-between font-mono font-bold mt-2">
                  <span>Existencia disponible:</span>
                  <span className="text-amber-700">{formatStockVal(bulkProduct.stock_actual, true)} kg</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-1.5 font-sans font-bold uppercase tracking-wider">Ingrese cantidad (KG / Gramos):</label>
                <input
                  type="number"
                  step="0.001"
                  value={bulkQtyVal}
                  onChange={(e) => setBulkQtyVal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs font-bold font-mono focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent focus:outline-none text-center"
                  placeholder="1.000"
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleConfirmBulkAdd();
                    }
                    if (e.key === 'Escape') {
                      setShowBulkModal(false);
                    }
                  }}
                />
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold font-sans transition-all active:scale-95 focus:ring-2 focus:ring-slate-400 focus:outline-none"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmBulkAdd}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold font-sans transition-all active:scale-95 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                Aceptar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: CUSTOM PUT ON HOLD - Beautiful In-System Alert */}
      {showHoldModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div ref={holdModalRef} className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl flex flex-col">
            
            <div className="bg-slate-100 border-b border-slate-250 px-5 py-3.5 flex justify-between items-center">
              <span className="text-xs font-black text-slate-700 tracking-widest uppercase flex items-center gap-1.5 font-sans">
                <Clock className="w-4 h-4 text-winter-blueBtn" />
                Guardar Ticket en Espera
              </span>
              <button onClick={() => setShowHoldModal(false)} className="text-slate-400 hover:text-slate-700 focus:ring-2 focus:ring-winter-blueBtn focus:outline-none p-1 rounded">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1.5 font-sans font-bold uppercase tracking-wider">Nota o Referencia para el Ticket:</label>
                <input
                  type="text"
                  value={holdTag}
                  onChange={(e) => setHoldTag(e.target.value)}
                  className="w-full bg-slate-55 border border-slate-300 rounded p-2 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-winter-blueBtn focus:border-transparent focus:outline-none font-sans"
                  placeholder="Ej: Mesa 5, Cliente Hugo, etc."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleConfirmHold();
                    }
                    if (e.key === 'Escape') {
                      setShowHoldModal(false);
                    }
                  }}
                />
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                onClick={() => setShowHoldModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold font-sans transition-all active:scale-95 focus:ring-2 focus:ring-slate-400 focus:outline-none"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmHold}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold font-sans transition-all active:scale-95 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                Guardar Ticket
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: CAJA REGISTRAR ABONO */}
      {showCajaAbonoModal && (() => {
        const filteredAbonoClients = clients.filter(c => {
          if (c.cedula_rif === 'V-00000000') return false;
          if ((c.saldo_pendiente || 0) <= 0.001) return false; // Mostrar únicamente clientes con deuda activa
          return c.nombre.toLowerCase().includes(abonoSearchTerm.toLowerCase()) ||
                 c.cedula_rif.toLowerCase().includes(abonoSearchTerm.toLowerCase());
        }).sort((a, b) => {
          const debtA = a.saldo_pendiente || 0;
          const debtB = b.saldo_pendiente || 0;
          if (debtB !== debtA) {
            return debtB - debtA; // Mayor deuda primero
          }
          return a.nombre.localeCompare(b.nombre);
        });

        const USD_METHODS: import('../types').MetodoPagoAbono[] = ['Efectivo$', 'Tarjeta$', 'Binance', 'PayPal', 'Zelle'];
        const isUsdMethod = (m: import('../types').MetodoPagoAbono) => USD_METHODS.includes(m);

        const totalPagadoUsd = abonoPayments.reduce((acc, p) => acc + (p.monto_usd > 0 ? p.monto_usd : (p.monto_ves / (tasaDia || 1))), 0);
        const totalAbono = parseFloat(abonoAmount || '0') || 0;
        const restanteUsd = parseFloat(Math.max(0, totalAbono - totalPagadoUsd).toFixed(2));
        const restanteVes = parseFloat((restanteUsd * tasaDia).toFixed(2));

        const handleAddPaymentLine = () => {
          const montoPago = parseFloat(abonoLineAmount.replace(',', '.')) || 0;
          if (montoPago <= 0) {
            showAlert('Ingrese un monto válido para esta forma de pago.', 'Monto Inválido', 'warning');
            return;
          }
          
          let usd = 0;
          let ves = 0;
          if (isUsdMethod(abonoMethod)) {
            usd = montoPago;
            ves = parseFloat((montoPago * tasaDia).toFixed(2));
            if (usd > restanteUsd + 0.01) {
              showAlert(`El monto ingresado ($${usd.toFixed(2)}) excede el saldo restante por cubrir ($${restanteUsd.toFixed(2)}).`, 'Monto Excedido', 'warning');
              return;
            }
          } else {
            ves = montoPago;
            usd = parseFloat((montoPago / (tasaDia || 1)).toFixed(2));
            if (ves > restanteVes + 0.5) {
              showAlert(`El monto ingresado (Bs ${ves.toFixed(2)}) excede el saldo restante por cubrir (Bs ${restanteVes.toFixed(2)}).`, 'Monto Excedido', 'warning');
              return;
            }
          }

          setAbonoPayments(prev => [...prev, { metodo_pago: abonoMethod, monto_usd: usd, monto_ves: ves, referencia: abonoRef.trim() }]);
          setAbonoLineAmount('');
          setAbonoRef('');
        };

        const handleSaveCajaAbono = () => {
          if (!abonoClient) return;
          const val = parseFloat(abonoAmount);
          if (isNaN(val) || val <= 0) {
            showAlert('Por favor ingrese un monto total válido para el abono.', 'Monto Inválido', 'warning');
            return;
          }
          if (val > abonoClient.saldo_pendiente + 0.01) {
            showAlert(`El abono ($${val.toFixed(2)}) no puede ser mayor que el saldo pendiente ($${abonoClient.saldo_pendiente.toFixed(2)}).`, 'Abono Excedido', 'warning');
            return;
          }

          let finalPayments: import('../types').AbonoPayment[];
          if (abonoMode === 'unico' || abonoPayments.length === 0) {
            // Pago único
            const usd = isUsdMethod(abonoMethod) ? val : 0;
            const ves = !isUsdMethod(abonoMethod) ? parseFloat((val * tasaDia).toFixed(2)) : 0;
            finalPayments = [{ metodo_pago: abonoMethod, monto_usd: usd, monto_ves: ves, referencia: abonoRef.trim() }];
          } else {
            // Pago mixto desglosado
            if (Math.abs(totalPagadoUsd - val) > 0.02) {
              showAlert(`Los pagos registrados en el desglose deben cubrir exactamente $${val.toFixed(2)}. Actualmente suman $${totalPagadoUsd.toFixed(2)}.`, 'Distribución Incompleta', 'warning');
              return;
            }
            finalPayments = abonoPayments;
          }

          onRegisterAbono(abonoClient.id, val, finalPayments, abonoObservacion.trim());
          setShowCajaAbonoModal(false);
          setAbonoMethod('Efectivo$');
          setAbonoRef('');
          setAbonoLineAmount('');
          setAbonoObservacion('');
          setAbonoPayments([]);
          setAbonoMode('unico');
          showToast('Abono registrado exitosamente en la base de datos.', 'success');
        };

        return (
          <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
            <div ref={abonoModalRef} className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl flex flex-col">
              
              <div className="bg-slate-100 border-b border-slate-250 px-5 py-3.5 flex justify-between items-center">
                <span className="text-xs font-black text-slate-700 tracking-widest uppercase flex items-center gap-1.5 font-sans">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  Registrar Abono de Crédito
                </span>
                <button onClick={() => setShowCajaAbonoModal(false)} className="text-slate-400 hover:text-slate-700 focus:ring-2 focus:ring-winter-blueBtn focus:outline-none p-1 rounded">✕</button>
              </div>

              <div className="p-5 space-y-4">
                
                {/* BÚSQUEDA DE CLIENTE DE CRÉDITO */}
                {!abonoClient ? (
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 block font-sans font-bold uppercase tracking-wider">Buscar Cliente:</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={abonoSearchTerm}
                        onChange={(e) => setAbonoSearchTerm(e.target.value)}
                        placeholder="Cédula, RIF o Nombre..."
                        className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs focus:bg-white focus:ring-2 focus:ring-winter-blueBtn focus:border-transparent focus:outline-none font-sans"
                        autoFocus
                      />
                    </div>
                    
                    <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs font-sans">
                      {filteredAbonoClients.length === 0 ? (
                        <div className="p-3 text-center text-slate-400 italic">No se encontraron clientes con deuda pendiente.</div>
                      ) : (
                        filteredAbonoClients.map(c => (
                          <div 
                            key={c.id}
                            onClick={() => {
                              setAbonoClient(c);
                              setAbonoAmount(c.saldo_pendiente.toFixed(2));
                            }}
                            className="p-2.5 hover:bg-slate-50 cursor-pointer flex justify-between items-center transition-colors"
                          >
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 uppercase">{c.nombre}</span>
                              <span className="text-[10px] text-slate-450 font-mono">{c.cedula_rif}</span>
                            </div>
                            <div className="text-right flex flex-col items-end">
                              <span className={`font-mono font-bold ${c.saldo_pendiente > 0 ? 'text-red-600' : 'text-slate-500'}`}>Deuda: ${c.saldo_pendiente.toFixed(2)}</span>
                              <span className="text-[9px] text-slate-400 font-mono">Bs {(c.saldo_pendiente * tasaDia).toFixed(2)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  
                  /* FORMULARIO DE ABONO DE CRÉDITO */
                  <div className="space-y-3.5">
                    
                    {/* TARJETA DE DEUDA DEL CLIENTE */}
                    <div className="bg-sky-50 border border-sky-150 p-3.5 rounded-xl text-xs font-sans leading-tight shadow-sm space-y-1.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-black uppercase text-sky-950 text-sm">{abonoClient.nombre}</div>
                          <div className="font-mono text-slate-500 text-[10px] font-bold">{abonoClient.cedula_rif}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setAbonoClient(null); setAbonoPayments([]); setAbonoRef(''); setAbonoMode('unico'); }}
                          className="text-[10px] text-sky-700 hover:text-sky-900 font-bold underline"
                        >
                          Cambiar
                        </button>
                      </div>

                      <div className="bg-white/80 border border-sky-200 p-2 rounded-lg flex justify-between items-center font-mono">
                        <span className="font-sans text-[11px] font-bold text-slate-600">Deuda Pendiente:</span>
                        <div className="text-right">
                          <span className="text-red-600 font-black text-sm block">${abonoClient.saldo_pendiente.toFixed(2)} USD</span>
                          <span className="text-slate-500 text-[10px] font-bold block">Bs {(abonoClient.saldo_pendiente * tasaDia).toFixed(2)} VES</span>
                        </div>
                      </div>
                    </div>

                    {/* SELECTOR DE TIPO DE ABONO: PAGO ÚNICO vs PAGO MIXTO */}
                    <div className="flex border border-slate-250 rounded-lg p-0.5 bg-slate-100 font-sans text-xs">
                      <button
                        type="button"
                        onClick={() => { setAbonoMode('unico'); setAbonoPayments([]); }}
                        className={`flex-1 py-1.5 rounded-md font-bold transition-all ${abonoMode === 'unico' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        💵 Pago Único
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAbonoMode('mixto'); }}
                        className={`flex-1 py-1.5 rounded-md font-bold transition-all ${abonoMode === 'mixto' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        🔀 Pago Mixto / Combinado
                      </button>
                    </div>

                    {/* MONTO PRINCIPAL A ABONAR */}
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold uppercase tracking-wider">Monto Total a Abonar ($ USD):</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={abonoAmount}
                          onChange={(e) => setAbonoAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-black font-mono text-emerald-700 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          autoFocus
                        />
                        {totalAbono > 0 && (
                          <span className="absolute right-3 top-2.5 text-[11px] font-mono text-slate-500 font-bold">
                            = {formatBs(totalAbono * tasaDia)} VES
                          </span>
                        )}
                      </div>
                    </div>

                    {/* VISTA 1: PAGO ÚNICO (UN SOLO MÉTODO DE PAGO) */}
                    {abonoMode === 'unico' && (
                      <div className="space-y-3 bg-slate-50 border border-slate-200 p-3 rounded-xl">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-sans font-bold uppercase tracking-wider">Forma de Pago:</label>
                          <select
                            value={abonoMethod}
                            onChange={(e) => setAbonoMethod(e.target.value as import('../types').MetodoPagoAbono)}
                            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-sans text-slate-800 font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          >
                            <option value="Efectivo$">💵 Efectivo en Dólares ($ USD)</option>
                            <option value="EfectivoBs">🇻🇪 Efectivo en Bolívares (Bs VES)</option>
                            <option value="TarjetaBs">💳 Tarjeta de Débito / Crédito (Bs)</option>
                            <option value="PagoMovil">📱 Pago Móvil (Bs)</option>
                            <option value="Biopago">👆 Biopago (Bs)</option>
                            <option value="Binance">₿ Binance / USDT</option>
                            <option value="PayPal">🅿️ PayPal</option>
                            <option value="Zelle">💸 Zelle</option>
                          </select>
                        </div>

                        {/* Mostrar equivalencia en Bs si es un método en Bolívares */}
                        {!isUsdMethod(abonoMethod) && (
                          <div className="bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg flex justify-between items-center text-xs font-mono">
                            <span className="font-sans text-[10px] font-bold uppercase text-emerald-800">Cobrar en Bolívares:</span>
                            <span className="font-black text-emerald-700 text-sm">{formatBs(totalAbono * tasaDia)} VES</span>
                          </div>
                        )}

                        {/* Número de Referencia (si aplica) */}
                        {abonoMethod !== 'Efectivo$' && abonoMethod !== 'EfectivoBs' && (
                          <div>
                            <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold uppercase tracking-wider">Nº de Referencia / Transacción:</label>
                            <input
                              type="text"
                              value={abonoRef}
                              onChange={(e) => setAbonoRef(e.target.value)}
                              placeholder="Ej: 123456"
                              className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* VISTA 2: PAGO MIXTO / COMBINADO (MÚLTIPLES LÍNEAS DE PAGO) */}
                    {abonoMode === 'mixto' && (
                      <div className="space-y-3 bg-slate-50 border border-slate-200 p-3 rounded-xl">
                        
                        {/* RESUMEN DE SALDO RESTANTE EN TIEMPO REAL */}
                        <div className={`p-2.5 rounded-lg border text-xs font-sans flex justify-between items-center ${restanteUsd <= 0.01 ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold' : 'bg-amber-50 border-amber-200 text-amber-900 font-bold'}`}>
                          <span>Falta por Cubrir:</span>
                          <div className="text-right font-mono font-black">
                            <span className="text-sm block">${restanteUsd.toFixed(2)} USD</span>
                            <span className="text-[10px] block opacity-80">{formatBs(restanteVes)} VES</span>
                          </div>
                        </div>

                        {/* TABLA DE LÍNEAS DE PAGO INGRESADAS */}
                        {abonoPayments.length > 0 && (
                          <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 bg-white">
                            {abonoPayments.map((p, i) => (
                              <div key={i} className="p-2 flex justify-between items-center text-xs font-mono">
                                <div>
                                  <span className="font-bold text-slate-800 block">{p.metodo_pago}</span>
                                  {p.referencia && <span className="text-[9px] text-slate-400 block font-sans">Ref: {p.referencia}</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  {p.monto_usd > 0 && <span className="text-emerald-700 font-bold">${p.monto_usd.toFixed(2)}</span>}
                                  {p.monto_ves > 0 && <span className="text-blue-700 font-bold">{formatBs(p.monto_ves)}</span>}
                                  <button onClick={() => setAbonoPayments(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs p-1">✕</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* FORMULARIO PARA AGREGAR NUEVA LÍNEA EN PAGO MIXTO */}
                        {restanteUsd > 0.01 && (
                          <div className="border border-dashed border-slate-300 rounded-lg p-2.5 space-y-2 bg-white">
                            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-slate-600 block">
                              ➕ Agregar pago desglosado:
                            </span>

                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={abonoMethod}
                                onChange={(e) => setAbonoMethod(e.target.value as import('../types').MetodoPagoAbono)}
                                className="bg-slate-50 border border-slate-300 rounded p-1.5 text-xs font-sans text-slate-800 font-bold focus:outline-none"
                              >
                                <option value="Efectivo$">💵 Efectivo $ USD</option>
                                <option value="EfectivoBs">🇻🇪 Efectivo Bs VES</option>
                                <option value="TarjetaBs">💳 Tarjeta Bs</option>
                                <option value="PagoMovil">📱 Pago Móvil</option>
                                <option value="Biopago">👆 Biopago</option>
                                <option value="Binance">₿ Binance / USDT</option>
                                <option value="PayPal">🅿️ PayPal</option>
                                <option value="Zelle">💸 Zelle</option>
                              </select>

                              <input
                                type="number"
                                step="0.01"
                                value={abonoLineAmount}
                                onChange={(e) => setAbonoLineAmount(e.target.value)}
                                placeholder={isUsdMethod(abonoMethod) ? `Monto en $ (máx $${restanteUsd.toFixed(2)})` : `Monto en Bs (máx Bs ${restanteVes.toFixed(2)})`}
                                className="bg-slate-50 border border-slate-300 rounded p-1.5 text-xs font-bold font-mono text-emerald-700 focus:outline-none"
                              />
                            </div>

                            <div className="flex gap-2">
                              {abonoMethod !== 'Efectivo$' && abonoMethod !== 'EfectivoBs' && (
                                <input
                                  type="text"
                                  value={abonoRef}
                                  onChange={(e) => setAbonoRef(e.target.value)}
                                  placeholder="Nº Referencia (Opcional)"
                                  className="flex-1 bg-slate-50 border border-slate-300 rounded p-1.5 text-xs font-mono focus:outline-none"
                                />
                              )}
                              <button
                                type="button"
                                onClick={handleAddPaymentLine}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-bold font-sans ml-auto"
                              >
                                + Añadir Pago
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* OBSERVACIÓN OPCIONAL */}
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold uppercase tracking-wider">Observación / Nota (Opcional):</label>
                      <input
                        type="text"
                        value={abonoObservacion}
                        onChange={(e) => setAbonoObservacion(e.target.value)}
                        placeholder="Ej: Pago parcial correspondiente a factura FAC-0045"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-sans focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-250 flex justify-end gap-2.5">
                <button
                  onClick={() => setShowCajaAbonoModal(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold font-sans transition-all active:scale-95 focus:outline-none"
                >
                  Cancelar
                </button>
                {abonoClient && (
                  <button
                    onClick={handleSaveCajaAbono}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold font-sans tracking-wider transition-all active:scale-95 shadow-md focus:outline-none"
                  >
                    Registrar Abono
                  </button>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      {/* GENERATED TICKET MODAL */}
      {showTicketModal && printedTicketData && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl overflow-hidden w-full max-w-md shadow-2xl p-5 space-y-4">
            
            {/* Currency Selector Toggle */}
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-slate-400">
                Moneda Ticket:
              </span>
              <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setTicketCurrency('USD')}
                  className={`px-3 py-1 text-[11px] font-extrabold font-sans rounded-md transition-all ${
                    ticketCurrency === 'USD'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  💵 $ (USD)
                </button>
                <button
                  type="button"
                  onClick={() => setTicketCurrency('VES')}
                  className={`px-3 py-1 text-[11px] font-extrabold font-sans rounded-md transition-all ${
                    ticketCurrency === 'VES'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🇻🇪 Bs (VES)
                </button>
              </div>
            </div>

            {/* Receipt Preview Body */}
            {(() => {
              const isVES = ticketCurrency === 'VES';
              const tasaVenta = (printedTicketData.totalUSD > 0 && printedTicketData.totalVES > 0)
                ? (printedTicketData.totalVES / printedTicketData.totalUSD)
                : (companyConfig?.tasa_oficial_bcv || 1);

              return (
                <div className="max-h-[65vh] overflow-y-auto bg-white p-5 rounded-xl font-mono text-[10px] space-y-3 shadow-inner">
                  
                  {/* Commerce info */}
                  <div className="text-center">
                    <h4 className="font-extrabold text-sm uppercase">{companyConfig.nombre_comercio}</h4>
                    <p className="font-bold">RIF: {companyConfig.rif}</p>
                    <p className="text-[9px] mt-0.5">{companyConfig.direccion}</p>
                    <p>Telf: {companyConfig.telefono}</p>
                  </div>

                  <p className="text-center select-none text-slate-400">----------------------------------------</p>

                  {/* Metadata */}
                  <div className="space-y-0.5">
                    <div>FACTURA: {printedTicketData.factura_nro}</div>
                    <div>FECHA: {new Date().toLocaleDateString()}</div>
                    <div>HORA: {new Date().toLocaleTimeString()}</div>
                    <div>CAJERO: {currentUser.nombre.toUpperCase()}</div>
                    <div>VENDEDOR: {selectedSeller.toUpperCase()}</div>
                    <div>CLIENTE: {printedTicketData.client.nombre.toUpperCase()}</div>
                    <div>ID/RIF: {printedTicketData.client.cedula_rif}</div>
                  </div>

                  <p className="text-center select-none text-slate-400">----------------------------------------</p>

                  {/* Header Items */}
                  <div className="flex font-bold justify-between text-slate-500 text-[9px] border-b border-slate-200 pb-1">
                    <span>DESCRIPCIÓN / CANT x PRECIO</span>
                    <span>TOTAL</span>
                  </div>

                  {/* Items List - Two-line High Clarity Format */}
                  <div className="space-y-2 py-1">
                    {printedTicketData.items.map((item: any) => {
                      const isBulk = item.product?.a_granel || item.a_granel;
                      const rawQty = parseFloat(item.qty || '0');
                      const qtyDisplay = (isBulk || (rawQty % 1 !== 0))
                        ? (rawQty % 1 === 0 ? rawQty.toString() : rawQty.toFixed(3))
                        : Math.round(rawQty).toString();
                      const isExempt = item.product?.exento_impuesto === true || item.exento_impuesto === true || (item.product?.porcentaje_impuesto !== undefined && item.product?.porcentaje_impuesto === 0);
                      const taxLabel = isExempt ? ' (E)' : ' (G)';

                      const priceNumUSD = item.priceUSD ? item.priceUSD : (item.precioUSD ? item.precioUSD : 0);
                      const totalNumUSD = item.totalUSD ? item.totalUSD : (priceNumUSD * rawQty);

                      const priceDisplay = isVES 
                        ? formatBs(priceNumUSD * tasaVenta) 
                        : `$${priceNumUSD.toFixed(2)}`;
                      const totalDisplay = isVES 
                        ? formatBs(totalNumUSD * tasaVenta) 
                        : `$${totalNumUSD.toFixed(2)}`;

                      return (
                        <div key={item.product?.id || item.productCode || item.code} className="border-b border-dashed border-slate-150 pb-1.5 last:border-none last:pb-0">
                          <div className="font-bold text-slate-900 break-words text-[11px] leading-tight uppercase">
                            {item.product?.description || item.description}
                            <span className={isExempt ? "text-amber-700 font-extrabold text-[9px] ml-1" : "text-sky-700 font-bold text-[9px] ml-1"}>
                              {taxLabel}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10.5px] mt-0.5 pl-2 text-slate-650">
                            <span className="font-mono text-slate-600">
                              <span className="font-bold text-slate-850">{qtyDisplay}</span> x {priceDisplay}
                            </span>
                            <span className="font-black text-slate-900 font-mono">
                              {totalDisplay}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-center select-none text-slate-400">----------------------------------------</p>

                  {/* Summary */}
                  {isVES ? (
                    <div className="text-right space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span>SUBTOTAL VES:</span>
                        <span>{formatBs(printedTicketData.subtotal * tasaVenta)}</span>
                      </div>
                      {printedTicketData.exento_usd > 0 && (
                        <div className="flex justify-between text-slate-700">
                          <span>MONTO EXENTO (E):</span>
                          <span>{formatBs(printedTicketData.exento_usd * tasaVenta)}</span>
                        </div>
                      )}
                      {printedTicketData.descuento > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>DESCUENTO:</span>
                          <span>-{formatBs(printedTicketData.descuento * tasaVenta)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-extrabold text-sm border-t border-slate-300 pt-1 text-slate-900">
                        <span>TOTAL VES:</span>
                        <span>{formatBs(printedTicketData.totalVES || (printedTicketData.totalUSD * tasaVenta))}</span>
                      </div>
                      <div className="flex justify-between text-slate-500 font-bold border-t border-dashed border-slate-300 pt-1 text-[10px]">
                        <span>REF TOTAL USD:</span>
                        <span>${printedTicketData.totalUSD.toFixed(2)} (Tasa: {formatBs(tasaVenta)})</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-right space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span>SUBTOTAL USD:</span>
                        <span>${printedTicketData.subtotal.toFixed(2)}</span>
                      </div>
                      {printedTicketData.exento_usd > 0 && (
                        <div className="flex justify-between text-slate-700">
                          <span>MONTO EXENTO (E):</span>
                          <span>${printedTicketData.exento_usd.toFixed(2)}</span>
                        </div>
                      )}
                      {printedTicketData.iva > 0 && (
                        <div className="flex justify-between text-slate-700">
                          <span>IVA (16%) USD:</span>
                          <span>${printedTicketData.iva.toFixed(2)}</span>
                        </div>
                      )}
                      {printedTicketData.descuento > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>DESCUENTO:</span>
                          <span>-${printedTicketData.descuento.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-extrabold text-sm border-t border-slate-300 pt-1">
                        <span>TOTAL USD:</span>
                        <span>${printedTicketData.totalUSD.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 font-bold border-t border-dashed border-slate-350 pt-1">
                        <span>TOTAL VES:</span>
                        <span>{formatBs(printedTicketData.totalVES)}</span>
                      </div>
                    </div>
                  )}

                  <p className="text-center select-none text-slate-400">----------------------------------------</p>

                  {/* Payments & Change */}
                  <div className="space-y-0.5">
                    <span className="font-bold block">MEDIOS DE PAGO LIQUIDADOS:</span>
                    {printedTicketData.pagos.map((p: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span>{p.metodo} {p.bancoEmisor ? `(${p.bancoEmisor})` : ''} {p.reference ? `Ref:${p.reference}` : ''}:</span>
                        <span>{p.metodo.endsWith('$') || p.metodo.includes('Credito') ? `$${p.monto.toFixed(2)}` : formatBs(p.montoVES || p.monto)}</span>
                      </div>
                    ))}
                    
                    {printedTicketData.vueltoVES > 0 && (
                      <div className="flex justify-between font-bold border-t border-slate-300 pt-1 text-[11px]">
                        <span>CAMBIO ENTREGADO VES:</span>
                        <span>{formatBs(printedTicketData.vueltoVES)}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-center select-none text-slate-400">----------------------------------------</p>

                  <div className="text-center text-[9px] italic leading-relaxed text-slate-500 font-sans">
                    {companyConfig.mensaje_pie_ticket}
                  </div>

                  <div className="text-center text-[7px] text-slate-400 font-sans">
                    WINTERPOS - DOCUMENTO DIGITAL DE CAJA
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={() => printTicketReceipt(printedTicketData, companyConfig, currentUser, selectedSeller, ticketCurrency)}
                className="w-full bg-sky-600 hover:bg-sky-500 text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 shadow active:scale-95"
                title="Abrir diálogo de impresión para enviar a la impresora de ticket o elegir otra"
              >
                <Printer className="w-4 h-4" />
                IMPRIMIR TICKET ({ticketCurrency === 'VES' ? 'Bs' : '$'})
              </button>
              <button
                onClick={() => { setShowTicketModal(false); setPrintedTicketData(null); }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 shadow active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                ACEPTAR Y CONTINUAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CIERRE DE CAJA - Ultra-Modern High Visibility Styled with Focus Trap */}
      {showCierreModal && (
        <div 
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              const container = e.currentTarget;
              const focusable = Array.from(
                container.querySelectorAll<HTMLElement>(
                  'input:not([disabled]):not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"])'
                )
              );
              if (focusable.length === 0) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];

              if (e.shiftKey) {
                if (document.activeElement === first || !container.contains(document.activeElement)) {
                  e.preventDefault();
                  last.focus();
                }
              } else {
                if (document.activeElement === last || !container.contains(document.activeElement)) {
                  e.preventDefault();
                  first.focus();
                }
              }
            } else if (e.key === 'Escape' && !cierreResult) {
              e.preventDefault();
              setShowCierreModal(false);
              setCierreResult(null);
            }
          }}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 font-sans text-slate-800 animate-fade-in"
        >
          <div className={`bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.3)] transition-all max-h-[96vh] flex flex-col ${cierreResult ? 'max-w-4xl w-full' : 'max-w-[480px] w-full'}`}>
            
            {/* Top Accent Gradient Line */}
            <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 via-red-500 to-amber-500 flex-shrink-0" />

            {!cierreResult ? (
              <div className="p-5 sm:p-6 space-y-4">
                
                {/* HEADER SECTION */}
                <div className="text-center space-y-2">
                  <div className="inline-flex p-3 bg-gradient-to-br from-rose-50 to-red-100 border border-rose-200 rounded-2xl shadow-inner text-rose-600">
                    <Lock className="w-7 h-7 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black tracking-wide text-slate-900 uppercase">
                      Conciliación y Cierre de Caja
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Ingrese el saldo físico real disponible en gaveta para auditar el arqueo final
                    </p>
                  </div>

                  {/* Station & Cashier Info Pills */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-[11px] font-semibold text-slate-600">
                    <span className="bg-slate-100 border border-slate-250 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-ping" />
                      Estación: <strong className="text-slate-800">{localStorage.getItem('pos_terminal_name') || 'CAJA_01'}</strong>
                    </span>
                    <span className="bg-slate-100 border border-slate-250 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      Cajero: <strong className="text-slate-800">{currentUser?.nombre || 'Operador'}</strong>
                    </span>
                    {tasaDia > 0 && (
                      <span className="bg-blue-50 border border-blue-200 text-blue-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        Tasa: <strong>{formatBs(tasaDia)}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* FORM CONTROLS */}
                <form onSubmit={handleSaveCierre} className="space-y-3.5">
                  
                  {/* 1. DÓLARES USD INPUT CARD */}
                  <div className="bg-gradient-to-br from-emerald-50/70 via-emerald-50/30 to-white border-2 border-emerald-300 hover:border-emerald-500 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-500/25 focus-within:shadow-md rounded-xl p-3.5 transition-all shadow-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-black text-emerald-950 flex items-center gap-1.5 uppercase tracking-wide">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        Efectivo en Caja Real ($ USD)
                      </label>
                      <span className="text-[10px] font-extrabold bg-emerald-100/90 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200/80">
                        Billetes Enteros
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="bg-emerald-600 text-white font-black font-mono text-xl px-3.5 py-2 rounded-lg flex items-center justify-center shadow-sm select-none">
                        $
                      </div>
                      <div className="relative flex-1">
                        <input
                          autoFocus
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={cierreRealUsd ? parseInt(cierreRealUsd.replace(/\D/g, '') || '0', 10).toLocaleString('es-VE') : ''}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '');
                            setCierreRealUsd(digits);
                          }}
                          className="w-full bg-white border-2 border-emerald-200 rounded-lg px-3 py-2 text-3xl sm:text-4xl font-black font-mono text-emerald-950 text-right tracking-tight focus:outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-400/40 focus:bg-emerald-50/20 shadow-inner transition-all"
                        />
                        {cierreRealUsd !== '' && cierreRealUsd !== '0' && (
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setCierreRealUsd('')}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                            title="Limpiar monto en $"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <span className="text-xs font-black font-mono text-emerald-800 bg-emerald-100/80 px-2 py-2.5 rounded-lg border border-emerald-200 select-none">
                        USD
                      </span>
                    </div>
                  </div>

                  {/* 2. BOLÍVARES VES INPUT CARD */}
                  <div className="bg-gradient-to-br from-indigo-50/70 via-indigo-50/30 to-white border-2 border-indigo-300 hover:border-indigo-500 focus-within:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-500/25 focus-within:shadow-md rounded-xl p-3.5 transition-all shadow-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-black text-indigo-950 flex items-center gap-1.5 uppercase tracking-wide">
                        <Coins className="w-4 h-4 text-indigo-600" />
                        Efectivo en Caja Real (Bs VES)
                      </label>
                      <span className="text-[10px] font-extrabold bg-indigo-100/90 text-indigo-800 px-2 py-0.5 rounded-md border border-indigo-200/80">
                        Billetes Enteros
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="bg-indigo-600 text-white font-black font-mono text-base px-3 py-2 rounded-lg flex items-center justify-center shadow-sm select-none">
                        Bs
                      </div>
                      <div className="relative flex-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={cierreRealVes ? parseInt(cierreRealVes.replace(/\D/g, '') || '0', 10).toLocaleString('es-VE') : ''}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '');
                            setCierreRealVes(digits);
                          }}
                          className="w-full bg-white border-2 border-indigo-200 rounded-lg px-3 py-2 text-3xl sm:text-4xl font-black font-mono text-indigo-950 text-right tracking-tight focus:outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-400/40 focus:bg-indigo-50/20 shadow-inner transition-all"
                        />
                        {cierreRealVes !== '' && cierreRealVes !== '0' && (
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setCierreRealVes('')}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                            title="Limpiar monto en Bs"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <span className="text-xs font-black font-mono text-indigo-800 bg-indigo-100/80 px-2 py-2.5 rounded-lg border border-indigo-200 select-none">
                        VES
                      </span>
                    </div>
                  </div>

                  {/* 3. EURO EUR INPUT CARD (SOLO SI HUBO OPERACIONES EN EUROS EN EL TURNO) */}
                  {hasEurInShift && (
                    <div className="bg-gradient-to-br from-purple-50/70 via-purple-50/30 to-white border-2 border-purple-300 hover:border-purple-500 focus-within:border-purple-600 focus-within:ring-4 focus-within:ring-purple-500/25 focus-within:shadow-md rounded-xl p-3.5 transition-all shadow-sm">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-black text-purple-950 flex items-center gap-1.5 uppercase tracking-wide">
                          <Coins className="w-4 h-4 text-purple-600" />
                          Efectivo en Caja Real (€ EUR)
                        </label>
                        <span className="text-[10px] font-extrabold bg-purple-100/90 text-purple-800 px-2 py-0.5 rounded-md border border-purple-200/80">
                          Billetes Enteros
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="bg-purple-600 text-white font-black font-mono text-xl px-3.5 py-2 rounded-lg flex items-center justify-center shadow-sm select-none">
                          €
                        </div>
                        <div className="relative flex-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={cierreRealEur ? parseInt(cierreRealEur.replace(/\D/g, '') || '0', 10).toLocaleString('es-VE') : ''}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '');
                              setCierreRealEur(digits);
                            }}
                            className="w-full bg-white border-2 border-purple-200 rounded-lg px-3 py-2 text-3xl sm:text-4xl font-black font-mono text-purple-950 text-right tracking-tight focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-400/40 focus:bg-purple-50/20 shadow-inner transition-all"
                          />
                          {cierreRealEur !== '' && cierreRealEur !== '0' && (
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => setCierreRealEur('')}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                              title="Limpiar monto en €"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <span className="text-xs font-black font-mono text-purple-800 bg-purple-100/80 px-2 py-2.5 rounded-lg border border-purple-200 select-none">
                          EUR
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 4. RESUMEN EN VIVO DE FONDO FÍSICO DECLARADO */}
                  <div className="bg-slate-50 border border-slate-250 rounded-xl p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-600 font-bold">Total Físico Declarado:</span>
                    </div>
                    <div className="text-right font-mono font-black text-sm">
                      <span className="text-slate-900">
                        ${parseInt(cierreRealUsd.replace(/\D/g, '') || '0', 10).toLocaleString('es-VE')} USD
                      </span>
                      <span className="text-slate-400 mx-1.5">+</span>
                      <span className="text-indigo-700">
                        Bs {parseInt(cierreRealVes.replace(/\D/g, '') || '0', 10).toLocaleString('es-VE')} VES
                      </span>
                      {hasEurInShift && (
                        <>
                          <span className="text-slate-400 mx-1.5">+</span>
                          <span className="text-purple-700">
                            € {parseInt(cierreRealEur.replace(/\D/g, '') || '0', 10).toLocaleString('es-VE')} EUR
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 5. BOTONES DE ACCIÓN CON FOCO DE ALTO CONTRASTE */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="submit"
                      className="w-full bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 focus:from-red-700 focus:to-rose-900 text-white py-3.5 rounded-xl font-black font-sans text-xs sm:text-sm tracking-wider transition-all shadow-lg shadow-red-500/25 flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer focus:outline-none focus:ring-4 focus:ring-rose-400 focus:ring-offset-2 focus:scale-[1.02] border-2 border-transparent focus:border-white"
                    >
                      <Lock className="w-5 h-5 text-rose-200" />
                      EJECUTAR CIERRE FINAL (Enter)
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowCierreModal(false); setCierreResult(null); }}
                      className="w-full bg-slate-100 hover:bg-slate-200 focus:bg-slate-200 text-slate-600 focus:text-slate-900 border-2 border-slate-300 focus:border-slate-800 py-2 rounded-xl font-bold font-sans text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-slate-400 focus:ring-offset-2 focus:scale-[1.02]"
                    >
                      <X className="w-4 h-4" />
                      CANCELAR Y VOLVER AL POS (Esc)
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="flex flex-col max-h-[94vh] h-full">
                {/* STICKY TOP HEADER */}
                <div className="flex justify-between items-center border-b border-slate-200 px-5 py-3 bg-white flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 tracking-wide font-sans uppercase">
                        Auditoría y Cierre de Caja
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Resumen final de arqueo, ventas y reconciliación de fondos
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setShowCierreModal(false); setCierreResult(null); }} 
                    className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    Cerrar [ESC]
                  </button>
                </div>

                {/* SCROLLABLE BODY CONTAINING ARQUEO CARD */}
                <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4 scrollbar-thin max-h-[calc(94vh-160px)]">
                  <div id="cierre-arqueo-card" className="space-y-4 w-full bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
                  
                    {/* BLUE HEADER TICKET STYLE */}
                    <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-5 py-3 flex items-center justify-between rounded-xl shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-5 h-5 text-blue-400" />
                        <div>
                          <h3 className="text-sm sm:text-base font-black font-sans uppercase tracking-wider">
                            Comprobante de Cierre de Caja
                          </h3>
                          <span className="text-[11px] text-slate-300 font-mono">
                            Estación: <strong>{localStorage.getItem('pos_terminal_name') || 'CAJA_01'}</strong> • Cajero: <strong>{currentUser?.nombre || currentUser?.usuario}</strong>
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black font-mono bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg">
                          {new Date().toLocaleDateString('es-VE')} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-5 shadow-inner">
                      
                      {/* Left Column: Cash Drawer Arqueo */}
                      <div className="space-y-3.5">
                        <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg flex justify-between items-center">
                          <div>
                            <span className="text-slate-500 font-sans block text-[10px] font-extrabold uppercase">Operador Responsable</span>
                            <strong className="text-slate-900 text-xs sm:text-sm font-black uppercase">
                              {currentUser.usuario.toUpperCase()} - {currentUser.nombre}
                            </strong>
                          </div>
                          <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-md border border-blue-200">
                            {localStorage.getItem('pos_terminal_name') || 'CAJA_01'}
                          </span>
                        </div>

                        <div className="space-y-2 border-t border-slate-200 pt-2.5 font-mono text-xs sm:text-sm">
                          <div className="flex justify-between items-center py-1 border-b border-dashed border-slate-150">
                            <span className="text-slate-600 font-semibold font-sans">Apertura de Caja :</span>
                            <span className="font-black text-slate-900 text-sm sm:text-base">
                              $ {cierreResult.aperturaUsd.toFixed(2)} <span className="text-slate-400 font-normal">/</span> {formatBs(cierreResult.aperturaVes)}
                            </span>
                          </div>
                          
                          {/* Ventas en Efectivo ($) */}
                          <div className="flex justify-between items-center py-0.5">
                            <span className="text-slate-600 font-semibold font-sans">Ventas en Efectivo ($) :</span>
                            <span className="font-black text-emerald-700 text-sm sm:text-base">$ {cierreResult.ventasEfectivoUsd.toFixed(2)}</span>
                          </div>

                          {((cierreResult.ventasEfectivoVes ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5">
                              <span className="text-slate-600 font-semibold font-sans">Ventas en Efectivo (Bs) :</span>
                              <span className="font-black text-indigo-700 text-sm sm:text-base">{formatBs(cierreResult.ventasEfectivoVes)}</span>
                            </div>
                          )}

                          {((cierreResult.abonosEfectivoUsd ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-emerald-700">
                              <span className="font-semibold font-sans">Abono Clientes (Efectivo $) :</span>
                              <span className="font-black text-sm sm:text-base">$ {cierreResult.abonosEfectivoUsd!.toFixed(2)}</span>
                            </div>
                          )}

                          {((cierreResult.abonosEfectivoBsVes ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-emerald-700">
                              <span className="font-semibold font-sans">Abono Clientes (Efectivo Bs) :</span>
                              <span className="font-black text-sm sm:text-base">{formatBs(cierreResult.abonosEfectivoBsVes)}</span>
                            </div>
                          )}

                          {((cierreResult.abonosBiopagoVes ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-sky-700">
                              <span className="font-semibold font-sans">Abono Clientes (Biopago) :</span>
                              <span className="font-black text-sm sm:text-base">{formatBs(cierreResult.abonosBiopagoVes)}</span>
                            </div>
                          )}

                          {((cierreResult.abonosPuntoVes ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-indigo-700">
                              <span className="font-semibold font-sans">Abono Clientes (Punto / Tarjeta) :</span>
                              <span className="font-black text-sm sm:text-base">{formatBs(cierreResult.abonosPuntoVes)}</span>
                            </div>
                          )}

                          {((cierreResult.abonosPagoMovilVes ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-blue-700">
                              <span className="font-semibold font-sans">Abono Clientes (Pago Móvil) :</span>
                              <span className="font-black text-sm sm:text-base">{formatBs(cierreResult.abonosPagoMovilVes)}</span>
                            </div>
                          )}

                          {((cierreResult.abonosZelleUsd ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-purple-700">
                              <span className="font-semibold font-sans">Abono Clientes (Zelle $) :</span>
                              <span className="font-black text-sm sm:text-base">$ {cierreResult.abonosZelleUsd!.toFixed(2)}</span>
                            </div>
                          )}

                          {((cierreResult.abonosBinanceUsd ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-amber-700">
                              <span className="font-semibold font-sans">Abono Clientes (Binance $) :</span>
                              <span className="font-black text-sm sm:text-base">$ {cierreResult.abonosBinanceUsd!.toFixed(2)}</span>
                            </div>
                          )}

                          {((cierreResult.abonosPayPalUsd ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-sky-600">
                              <span className="font-semibold font-sans">Abono Clientes (PayPal $) :</span>
                              <span className="font-black text-sm sm:text-base">$ {cierreResult.abonosPayPalUsd!.toFixed(2)}</span>
                            </div>
                          )}

                          {(cierreResult.entradaEfectivoUsd > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-emerald-700">
                              <span className="font-semibold font-sans">Entrada Efectivo ($) :</span>
                              <span className="font-black text-sm sm:text-base">$ {cierreResult.entradaEfectivoUsd.toFixed(2)}</span>
                            </div>
                          )}

                          {((cierreResult.entradaEfectivoVes ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-emerald-700">
                              <span className="font-semibold font-sans">Entrada Efectivo (Bs) :</span>
                              <span className="font-black text-sm sm:text-base">{formatBs(cierreResult.entradaEfectivoVes ?? 0)}</span>
                            </div>
                          )}

                          {/* Divisas Compradas (€ EUR) - Only shown if there were EUR operations in shift */}
                          {hasEurInShift && (cierreResult.cambioDivisasEur || 0) > 0 && (
                            <div className="flex justify-between items-center py-0.5 text-indigo-700">
                              <span className="font-semibold font-sans">Divisas Compradas (€) :</span>
                              <span className="font-black text-sm sm:text-base">+ € {(cierreResult.cambioDivisasEur || 0).toFixed(2)}</span>
                            </div>
                          )}

                          {(cierreResult.salidaEfectivoUsd > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-rose-600">
                              <span className="font-semibold font-sans">Salida Efectivo ($) :</span>
                              <span className="font-black text-sm sm:text-base">- $ {cierreResult.salidaEfectivoUsd.toFixed(2)}</span>
                            </div>
                          )}

                          {((cierreResult.salidaEfectivoVes ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-rose-600">
                              <span className="font-semibold font-sans">Salida Efectivo (Bs) :</span>
                              <span className="font-black text-sm sm:text-base">- {formatBs(cierreResult.salidaEfectivoVes ?? 0)}</span>
                            </div>
                          )}

                          {(cierreResult.devolucionEfectivoUsd > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-rose-600">
                              <span className="font-semibold font-sans">Devolución Efectivo ($) :</span>
                              <span className="font-black text-sm sm:text-base">- $ {cierreResult.devolucionEfectivoUsd.toFixed(2)}</span>
                            </div>
                          )}

                          {((cierreResult.devolucionEfectivoVes ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-rose-600">
                              <span className="font-semibold font-sans">Devolución Efectivo (Bs) :</span>
                              <span className="font-black text-sm sm:text-base">- {formatBs(cierreResult.devolucionEfectivoVes ?? 0)}</span>
                            </div>
                          )}

                          {((cierreResult.vueltosEntregadosUsd ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-amber-700">
                              <span className="font-semibold font-sans">Vuelto Entregado ($) :</span>
                              <span className="font-black text-sm sm:text-base">- $ {(cierreResult.vueltosEntregadosUsd ?? 0).toFixed(2)}</span>
                            </div>
                          )}

                          {((cierreResult.vueltosEntregadosVes ?? 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-amber-700">
                              <span className="font-semibold font-sans">Vuelto Entregado (Bs) :</span>
                              <span className="font-black text-sm sm:text-base">- {formatBs(cierreResult.vueltosEntregadosVes ?? 0)}</span>
                            </div>
                          )}
                        </div>

                        {/* Dinero en Caja Expected Card */}
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-3.5 space-y-1 shadow-sm">
                          <div className="flex justify-between items-center">
                            <span className="font-sans uppercase text-xs font-black text-blue-900 tracking-wide">
                              Dinero en Caja (Esperado) :
                            </span>
                            <span className="text-2xl sm:text-3xl text-blue-700 font-mono font-black tracking-tight">
                              $ {cierreResult.dineroEnCajaExpected.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-[10px] text-blue-600/80 italic font-mono font-medium uppercase tracking-tight text-right">
                            {formatNumberToWordsUSD(cierreResult.dineroEnCajaExpected)}
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Sales Performance & Payment breakdown */}
                      <div className="space-y-3.5 border-t md:border-t-0 md:border-l border-slate-200 md:pl-5">
                        <div className="space-y-2 font-mono text-xs sm:text-sm">
                          <div className="flex justify-between items-center py-0.5">
                            <span className="font-sans font-semibold text-slate-600">Ventas Totales :</span>
                            <span className="font-black text-slate-900 text-sm sm:text-base">$ {cierreResult.ventasTotalesUsd.toFixed(2)}</span>
                          </div>
                          {(cierreResult.descuentosUsd > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-amber-700">
                              <span className="font-sans font-semibold">Descuentos :</span>
                              <span className="font-black text-sm sm:text-base">$ {cierreResult.descuentosUsd.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center font-bold text-slate-900 border-b border-dashed border-slate-200 pb-1.5">
                            <span className="font-sans text-xs font-black text-slate-500 uppercase">Venta Bruta :</span>
                            <span className="font-black text-slate-900 text-sm sm:text-base">$ {cierreResult.ventaBrutaUsd.toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-1 font-mono text-xs sm:text-sm">
                          {(cierreResult.pagosEfectivoUsd > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5">
                              <span className="font-sans font-semibold text-slate-600">Efectivo $ :</span>
                              <span className="font-black text-emerald-700 text-sm sm:text-base">$ {(cierreResult.pagosEfectivoUsd && !isNaN(cierreResult.pagosEfectivoUsd) ? cierreResult.pagosEfectivoUsd : 0).toFixed(2)}</span>
                            </div>
                          )}
                          
                          {(cierreResult.pagosEfectivoBsVes > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5">
                              <span className="font-sans font-semibold text-slate-600">Efectivo Bs :</span>
                              <span className="font-black text-indigo-700 text-sm sm:text-base">Bs {(cierreResult.pagosEfectivoBsVes && !isNaN(cierreResult.pagosEfectivoBsVes) ? cierreResult.pagosEfectivoBsVes : 0).toFixed(2)}</span>
                            </div>
                          )}

                          {(cierreResult.pagosBiopagoVes > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5">
                              <span className="font-sans font-semibold text-slate-600">Biopago :</span>
                              <span className="font-black text-sky-700 text-sm sm:text-base">Bs {(cierreResult.pagosBiopagoVes && !isNaN(cierreResult.pagosBiopagoVes) ? cierreResult.pagosBiopagoVes : 0).toFixed(2)}</span>
                            </div>
                          )}

                          {(cierreResult.pagosPuntoVes > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5">
                              <span className="font-sans font-semibold text-slate-600">Punto / Tarjeta :</span>
                              <span className="font-black text-indigo-700 text-sm sm:text-base">Bs {(cierreResult.pagosPuntoVes && !isNaN(cierreResult.pagosPuntoVes) ? cierreResult.pagosPuntoVes : 0).toFixed(2)}</span>
                            </div>
                          )}

                          {((cierreResult.pagosPagoMovilVes || 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5">
                              <span className="font-sans font-semibold text-slate-600">Pago Móvil :</span>
                              <span className="font-black text-blue-700 text-sm sm:text-base">Bs {(cierreResult.pagosPagoMovilVes && !isNaN(cierreResult.pagosPagoMovilVes) ? cierreResult.pagosPagoMovilVes : 0).toFixed(2)}</span>
                            </div>
                          )}

                          {((cierreResult.pagosTransferenciaVes || 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5">
                              <span className="font-sans font-semibold text-slate-600">Transferencia :</span>
                              <span className="font-black text-purple-700 text-sm sm:text-base">Bs {(cierreResult.pagosTransferenciaVes && !isNaN(cierreResult.pagosTransferenciaVes) ? cierreResult.pagosTransferenciaVes : 0).toFixed(2)}</span>
                            </div>
                          )}

                          {(cierreResult.pagosCreditoUsd > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5">
                              <span className="font-sans font-semibold text-slate-600">A Crédito :</span>
                              <span className="font-black text-slate-800 text-sm sm:text-base">$ {(cierreResult.pagosCreditoUsd && !isNaN(cierreResult.pagosCreditoUsd) ? cierreResult.pagosCreditoUsd : 0).toFixed(2)}</span>
                            </div>
                          )}

                          {(cierreResult.devolucionVentasUsd > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-rose-600 font-bold">
                              <span className="font-sans">Devolución Ventas ($) :</span>
                              <span className="font-black text-sm sm:text-base">- $ {(cierreResult.devolucionVentasUsd && !isNaN(cierreResult.devolucionVentasUsd) ? cierreResult.devolucionVentasUsd : 0).toFixed(2)}</span>
                            </div>
                          )}

                          {((cierreResult.devolucionVentasVes || 0) > 0 || !hideZeroLines) && (
                            <div className="flex justify-between items-center py-0.5 text-rose-600 font-bold">
                              <span className="font-sans">Devolución Ventas (Bs) :</span>
                              <span className="font-black text-sm sm:text-base">- Bs {(cierreResult.devolucionVentasVes && !isNaN(cierreResult.devolucionVentasVes) ? cierreResult.devolucionVentasVes : 0).toFixed(2)}</span>
                            </div>
                          )}
                        </div>

                        {/* Venta Total Footer Card */}
                        <div className="bg-slate-100 border border-slate-300 rounded-xl p-3 space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-sans uppercase text-xs font-black text-slate-700">Venta Total :</span>
                            <span className="text-2xl sm:text-3xl text-slate-900 font-mono font-black">
                              $ {(cierreResult.ventaTotalUsd && !isNaN(cierreResult.ventaTotalUsd) ? cierreResult.ventaTotalUsd : 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 italic font-mono font-medium uppercase tracking-tight text-right">
                            {formatNumberToWordsUSD(cierreResult.ventaTotalUsd && !isNaN(cierreResult.ventaTotalUsd) ? cierreResult.ventaTotalUsd : 0)}
                          </div>
                        </div>

                        {/* PROFITABILITY BREAKDOWN */}
                        {(() => {
                          const subtotalNeto = cierreResult.subtotalNetoUsd ?? cierreResult.ventaTotalUsd ?? 0;
                          const costoTotal = cierreResult.costoTotalUsd ?? 0;
                          const utilidadBrutaProductos = subtotalNeto - costoTotal;
                          const comisionVes = cierreResult.ventaEfectivoComisionVes ?? 0;
                          const comisionUsd = cierreResult.ventaEfectivoComisionUsd ?? (tasaDia > 0 ? comisionVes / tasaDia : 0);
                          const utilidadNetaTotalCierre = utilidadBrutaProductos + comisionUsd;

                          return (
                            <div className="font-sans space-y-2 text-xs text-slate-700 bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 mt-2 select-text">
                              <div className="font-black text-[11px] text-emerald-900 uppercase border-b border-emerald-200 pb-1 font-sans flex justify-between">
                                <span>Cálculo de Utilidad del Cierre</span>
                              </div>
                              <div className="flex justify-between font-mono">
                                <span className="font-sans text-slate-600 font-semibold">Ventas Netas (sin IVA):</span>
                                <span className="font-black text-slate-900 text-sm">$ {subtotalNeto.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between font-mono">
                                <span className="font-sans text-slate-600 font-semibold">Costo de Mercancía:</span>
                                <span className="font-black text-rose-600 text-sm">- $ {costoTotal.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between font-mono border-t border-emerald-200 pt-1 font-bold text-emerald-900">
                                <span className="font-sans">Utilidad Bruta por Productos:</span>
                                <span className="font-black text-sm">$ {utilidadBrutaProductos.toFixed(2)}</span>
                              </div>
                              {comisionVes > 0 && (
                                <div className="flex justify-between font-mono text-emerald-950 font-black bg-emerald-100/80 p-2 rounded-lg border border-emerald-300">
                                  <span className="font-sans">+ Comisiones Venta Efectivo:</span>
                                  <span>+ Bs {comisionVes.toFixed(2)} (+${comisionUsd.toFixed(2)})</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center font-mono border-t-2 border-emerald-500 pt-1.5 mt-1 font-black text-emerald-950 bg-emerald-200/80 p-2.5 rounded-lg shadow-sm">
                                <span className="font-sans uppercase text-xs">UTILIDAD NETA TOTAL:</span>
                                <span className="text-xl sm:text-2xl font-black text-emerald-800">$ {utilidadNetaTotalCierre.toFixed(2)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                    </div>

                    {/* Arqueo Audit differences table */}
                    {(() => {
                      const expectedEur = cierreResult.cambioDivisasEur || 0;
                      const realEurVal = hasEurInShift || expectedEur > 0 ? (parseFloat(cierreRealEur) || 0) : 0;
                      const diffUsd = parseFloat(cierreRealUsd) - cierreResult.dineroEnCajaExpected;
                      const diffVes = parseFloat(cierreRealVes) - cierreResult.expectedVes;
                      const diffEur = realEurVal - expectedEur;
                      const showEur = hasEurInShift && (expectedEur > 0 || realEurVal > 0);

                      const hasLoss = diffUsd < -0.01 || diffVes < -0.01 || (showEur && diffEur < -0.01);
                      const hasGain = diffUsd > 0.01 || diffVes > 0.01 || (showEur && diffEur > 0.01);
                      
                      let boxBgClass = 'bg-slate-50 border-slate-200';
                      let titleClass = 'text-slate-900 border-slate-200';
                      
                      if (hasLoss) {
                        boxBgClass = 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-500/10';
                        titleClass = 'text-rose-950 border-rose-200';
                      } else if (hasGain) {
                        boxBgClass = 'bg-emerald-50/70 border-emerald-300';
                        titleClass = 'text-emerald-950 border-emerald-200';
                      }

                      return (
                        <div className={`${boxBgClass} p-4 border rounded-xl space-y-3 font-sans shadow-sm transition-all`}>
                          <div className={`font-black text-center border-b pb-2 uppercase text-xs sm:text-sm tracking-wider ${titleClass}`}>
                            RECONCILIACIÓN DE EFECTIVO ENTREGADO (ARQUEO FÍSICO)
                          </div>
                          
                          <div className="grid grid-cols-3 gap-3 text-slate-500 font-extrabold text-[11px] uppercase tracking-wide border-b border-slate-200/80 pb-1">
                            <span>Efectivo</span>
                            <span className="text-right">Gaveta Esperado</span>
                            <span className="text-right">Físico Recibido</span>
                          </div>

                          <div className="grid grid-cols-3 gap-3 font-mono font-black text-sm sm:text-base py-1">
                            <span className="text-emerald-800 font-sans font-bold flex items-center gap-1">
                              <DollarSign className="w-4 h-4 text-emerald-600" /> Dólares USD:
                            </span>
                            <span className="text-right text-slate-800">${cierreResult.dineroEnCajaExpected.toFixed(2)}</span>
                            <span className="text-right text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md border border-emerald-200">
                              ${parseFloat(cierreRealUsd || '0').toFixed(2)}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-3 font-mono font-black text-sm sm:text-base py-1 border-t border-slate-200/60">
                            <span className="text-indigo-800 font-sans font-bold flex items-center gap-1">
                              <Coins className="w-4 h-4 text-indigo-600" /> Bolívares Bs:
                            </span>
                            <span className="text-right text-slate-800">Bs {cierreResult.expectedVes.toFixed(2)}</span>
                            <span className="text-right text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-md border border-indigo-200">
                              Bs {parseFloat(cierreRealVes || '0').toFixed(2)}
                            </span>
                          </div>

                          {showEur && (
                            <div className="grid grid-cols-3 gap-3 font-mono font-black text-sm sm:text-base py-1 border-t border-slate-200/60">
                              <span className="text-purple-800 font-sans font-bold flex items-center gap-1">
                                <Coins className="w-4 h-4 text-purple-600" /> Euros EUR:
                              </span>
                              <span className="text-right text-slate-800">€{expectedEur.toFixed(2)}</span>
                              <span className="text-right text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-md border border-purple-200">
                                €{realEurVal.toFixed(2)}
                              </span>
                            </div>
                          )}

                          {/* DIFFERENCE CARDS */}
                          <div className="pt-2 border-t-2 border-slate-200/80">
                            <span className="text-[11px] font-black uppercase text-slate-600 block mb-1.5">
                              Diferencias Auditadas en Gaveta:
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm font-mono font-black">
                              <div className={`p-2.5 rounded-lg border flex items-center justify-between ${diffUsd === 0 ? 'bg-slate-100 border-slate-200 text-slate-800' : diffUsd > 0 ? 'bg-emerald-100 border-emerald-300 text-emerald-900' : 'bg-rose-100 border-rose-300 text-rose-950'}`}>
                                <span className="font-sans font-bold text-xs">Diferencia USD:</span>
                                <span className="text-base sm:text-lg">
                                  {diffUsd >= 0 ? '+' : ''}${diffUsd.toFixed(2)}
                                </span>
                              </div>

                              <div className={`p-2.5 rounded-lg border flex items-center justify-between ${diffVes === 0 ? 'bg-slate-100 border-slate-200 text-slate-800' : diffVes > 0 ? 'bg-emerald-100 border-emerald-300 text-emerald-900' : 'bg-rose-100 border-rose-300 text-rose-950'}`}>
                                <span className="font-sans font-bold text-xs">Diferencia Bs:</span>
                                <span className="text-base sm:text-lg">
                                  {diffVes >= 0 ? '+' : ''}Bs {diffVes.toFixed(2)}
                                </span>
                              </div>

                              {showEur && (
                                <div className={`sm:col-span-2 p-2.5 rounded-lg border flex items-center justify-between ${diffEur === 0 ? 'bg-slate-100 border-slate-200 text-slate-800' : diffEur > 0 ? 'bg-emerald-100 border-emerald-300 text-emerald-900' : 'bg-rose-100 border-rose-300 text-rose-950'}`}>
                                  <span className="font-sans font-bold text-xs">Diferencia EUR:</span>
                                  <span className="text-base sm:text-lg">
                                    {diffEur >= 0 ? '+' : ''}€ {diffEur.toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* STICKY BOTTOM ACTION FOOTER (ALWAYS VISIBLE AT 100% ZOOM) */}
                <div className="bg-slate-50 border-t border-slate-200 px-5 py-3.5 space-y-2.5 flex-shrink-0 shadow-lg">
                  <div className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-[11px] text-amber-900 font-sans font-medium flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span>Al confirmar, se guardará el arqueo inmutable en el historial y se cerrará su sesión automáticamente.</span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      {waCierreStatus.enabled && (
                        <label className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs cursor-pointer select-none hover:bg-indigo-100 transition-all font-sans font-bold text-indigo-950">
                          <input
                            type="checkbox"
                            checked={sendToWhatsApp}
                            onChange={(e) => setSendToWhatsApp(e.target.checked)}
                            disabled={isSendingWa}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                          />
                          <span>Enviar a WhatsApp</span>
                        </label>
                      )}

                      <label className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs cursor-pointer select-none hover:bg-emerald-100 transition-all font-sans font-bold text-emerald-950">
                        <input
                          type="checkbox"
                          checked={hideZeroLines}
                          onChange={(e) => setHideZeroLines(e.target.checked)}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300"
                        />
                        <span>Solo con data (Ocultar ceros)</span>
                      </label>
                    </div>

                    <button
                      onClick={handleConfirmCierre}
                      disabled={isSendingWa}
                      className="w-full sm:w-auto sm:min-w-[320px] bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 hover:from-blue-700 hover:to-indigo-900 active:scale-[0.99] disabled:bg-slate-300 text-white py-3 px-6 rounded-xl font-sans text-xs sm:text-sm font-black uppercase tracking-wider transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSendingWa ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                          <span>PROCESANDO Y ENVIANDO...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-blue-200" />
                          <span>CONFIRMAR REGISTRO Y REINICIAR TERMINAL</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: MANUAL CASH MOVEMENT - Light Styled */}
      {showMovementsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl p-6 space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Ticket className="w-4 h-4 text-winter-blueBtn" />
                MOVIMIENTO MANUAL DE CAJA
              </h3>
              <button onClick={() => setShowMovementsModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleSaveCajaMovement} className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Tipo de Movimiento</label>
                <select
                  value={movType}
                  onChange={(e) => setMovType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 outline-none focus:bg-white focus:border-winter-blueBtn font-sans"
                >
                  <option value="Entrada">Entrada (Aporte de Efectivo, Cambio inicial...)</option>
                  <option value="Salida">Salida (Retiro de Efectivo, Pago a proveedores...)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Descripción / Concepto <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pago de flete a camión, reposición de caja chica..."
                  value={movDesc}
                  onChange={(e) => setMovDesc(e.target.value)}
                  className="w-full bg-slate-55 border border-slate-350 rounded p-2.5 text-xs text-slate-800 outline-none focus:bg-white focus:border-winter-blueBtn font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Monto ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={movUsd}
                    onChange={(e) => setMovUsd(e.target.value)}
                    className="w-full bg-slate-55 border border-slate-350 rounded p-2.5 text-xs text-emerald-600 font-bold focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Monto (Bs VES)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={movVes}
                    onChange={(e) => setMovVes(e.target.value)}
                    className="w-full bg-slate-55 border border-slate-350 rounded p-2.5 text-xs text-purple-700 font-bold focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMovementsModal(false)}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-600 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-winter-blueBtn hover:bg-winter-blueBtnHover text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
                >
                  REGISTRAR MOVIMIENTO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TICKETS EN ESPERA */}
      {showOnHoldModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                TICKETS EN ESPERA (VENTAS SUSPENDIDAS)
              </h3>
              <button onClick={() => setShowOnHoldModal(false)} className="text-slate-400 hover:text-slate-705">✕</button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {ticketsOnHold.length === 0 ? (
                <div className="text-center py-8 text-slate-400 font-sans italic">
                  No hay tickets en espera registrados.
                </div>
              ) : (
                ticketsOnHold.map(h => (
                  <div key={h.id} className="border border-slate-250 p-3 rounded-lg flex justify-between items-center bg-slate-55 hover:bg-slate-100 transition-colors shadow-sm">
                    <div className="space-y-1 font-sans text-xs">
                      <div className="font-extrabold text-slate-800 uppercase">{h.tag}</div>
                      <div className="text-[10px] text-slate-500">Fecha: {h.fecha}</div>
                      <div className="text-[10px] text-slate-600 font-mono">
                        Artículos: <span className="font-bold text-slate-800">{h.items.reduce((acc: number, item: any) => acc + item.qty, 0)}</span> | Total: <span className="font-bold text-emerald-600">${(h.items.reduce((acc: number, item: any) => acc + item.totalUSD, 0) * (1 - h.discount / 100)).toFixed(2)} USD</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRetrieveHold(h)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded text-[10px] uppercase shadow-sm transition-all"
                      >
                        Recuperar
                      </button>
                      <button
                        onClick={() => handleRemoveHold(h.id)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 font-bold p-1.5 rounded border border-red-200 transition-all"
                        title="Eliminar ticket"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end border-t border-slate-200 pt-3">
              <button
                onClick={() => setShowOnHoldModal(false)}
                className="bg-slate-100 border border-slate-250 text-slate-650 px-4 py-2 rounded text-xs hover:bg-slate-200 transition-all font-sans"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ENTRADA RÁPIDA */}
      {showEntradaRapidaModal && (
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-sm shadow-2xl p-6 space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-500 bg-sky-50 rounded-full p-0.5" />
                ENTRADA RÁPIDA (INVENTARIO)
              </h3>
              <button onClick={() => setShowEntradaRapidaModal(false)} className="text-slate-400 hover:text-slate-705">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans font-bold">Clave (Código o Barras):</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Escriba código..."
                    value={entradaBarcode}
                    onChange={(e) => setEntradaBarcode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded pl-3 pr-9 py-2 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none"
                    autoFocus
                  />
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4" />
                  </span>

                  {/* Autocomplete Dropdown for Entrada Rápida */}
                  {showEntradaDropdown && filteredSearchProducts.length > 0 && (
                    <div className="absolute left-0 right-0 top-10 bg-white border border-slate-250 rounded max-h-40 overflow-y-auto z-50 shadow-2xl divide-y divide-slate-100 font-sans">
                      {filteredSearchProducts.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setMatchedProduct(p);
                            setEntradaBarcode(p.barcode);
                          }}
                          className="w-full text-left p-2.5 text-[11px] font-sans hover:bg-slate-100 text-slate-800 transition-all block"
                        >
                          <span className="font-mono text-slate-500 font-bold mr-1.5">{p.barcode}</span>
                          <span>{p.description}</span>
                          <span className="float-right text-slate-500 text-[9px] font-sans font-semibold">Stock: {formatStockVal(p.stock_actual, p.a_granel)} {p.a_granel ? 'kg' : 'uds'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* PRODUCT INFORMATION DISPLAY AREA */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 min-h-[70px] flex flex-col justify-center text-xs">
                {entradaBarcode.trim() === "" ? (
                  <div className="text-center text-slate-400 font-sans italic">
                    Ingrese el código del producto para buscarlo.
                  </div>
                ) : matchedProduct ? (
                  <div className="space-y-1">
                    <div className="font-extrabold text-slate-800 uppercase font-sans">{matchedProduct.description}</div>
                    <div className="text-[10px] text-slate-500">Categoría: {matchedProduct.category || 'N/A'}</div>
                    <div className="text-[11px] font-bold text-slate-700 flex justify-between border-t border-slate-200 pt-1 mt-1 font-sans">
                      <span>Existencia Actual:</span>
                      <span className="font-mono text-blue-600 font-extrabold">{formatStockVal(matchedProduct.stock_actual, matchedProduct.a_granel)} {matchedProduct.a_granel ? 'kg' : 'uds'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-red-500 font-bold font-sans flex items-center justify-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    <span>El producto no está registrado en el sistema.</span>
                  </div>
                )}
              </div>

              {/* QUANTITY INPUT */}
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans font-bold">Cantidad Entrada Inventario:</label>
                <input
                  type="number"
                  step={matchedProduct?.a_granel ? "0.001" : "1"}
                  min={matchedProduct?.a_granel ? "0.001" : "1"}
                  required
                  placeholder={matchedProduct?.a_granel ? "0.00" : "1"}
                  value={entradaQty}
                  onChange={(e) => setEntradaQty(e.target.value)}
                  disabled={!matchedProduct}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2 text-xs font-bold font-mono text-center text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEntradaRapidaModal(false)}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-655 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Regresar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteEntradaRapida}
                  disabled={!matchedProduct}
                  className="w-2/3 bg-winter-blueBtn hover:bg-winter-blueBtnHover disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  AGREGAR
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* MODAL: DEVOLUCIÓN DE PRODUCTOS (TICKET) */}
      {showDevolucionModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
            
            <div className="bg-rose-50 border-b border-rose-100 px-6 py-4 flex justify-between items-center">
              <span className="text-xs font-black text-rose-700 tracking-widest uppercase flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-rose-600" />
                MÓDULO DE DEVOLUCIONES DE INVENTARIO Y CAJA
              </span>
              <button 
                onClick={() => {
                  setShowDevolucionModal(false);
                  setDevSelectedSale(null);
                  setDevSearchTerm('');
                }} 
                className="text-slate-400 hover:text-slate-700 font-sans"
              >
                ✕ Cerrar [ESC]
              </button>
            </div>

            <div className="flex-grow overflow-hidden flex flex-col md:flex-row min-h-[500px]">
              
              {/* Left Column: Search & Find Ticket */}
              <div className="w-full md:w-2/5 border-r border-slate-200 p-5 flex flex-col space-y-4">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-sans font-bold uppercase">Buscar Ticket Vendido</label>
                  <input
                    type="text"
                    placeholder="N° Factura, Nombre Cliente, Cédula..."
                    value={devSearchTerm}
                    onChange={(e) => setDevSearchTerm(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs focus:bg-white focus:ring-2 focus:ring-rose-500 focus:border-transparent focus:outline-none"
                    autoFocus
                  />
                </div>

                {/* Date filter selector for Administrators */}
                {isAdmin && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-slate-500 block font-sans font-bold uppercase flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-rose-600" />
                        Filtrar por Fecha (Admin)
                      </label>
                      {devDateFilter && (
                        <button
                          type="button"
                          onClick={() => setDevDateFilter('')}
                          className="text-[9px] text-slate-400 hover:text-rose-600 font-bold uppercase underline font-mono"
                        >
                          Ver Todo
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={devDateFilter}
                      onChange={(e) => setDevDateFilter(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs text-slate-800 font-mono focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex-grow overflow-y-auto space-y-2 pr-1 max-h-[350px]">
                  <div className="flex justify-between items-center border-b pb-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                      {isAdmin ? (devDateFilter ? `Facturas del ${devDateFilter}` : 'Todas las Facturas') : 'Facturas Turno Actual'}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">Total: {filteredDevSales.length}</span>
                  </div>

                  {filteredDevSales.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-[10px] font-sans">
                      {isAdmin ? 'No se encontraron facturas para los filtros seleccionados.' : 'No se encontraron facturas en el turno de caja abierto actual.'}
                    </div>
                  ) : (
                    filteredDevSales.map(sale => {
                      const salesList = allSalesList.length > 0 ? allSalesList : shiftSales;
                      const returnInfo = getSaleReturnInfo(sale, salesList);
                      const isSelected = devSelectedSale?.factura_nro === sale.factura_nro;
                      const isClosedCaja = sale.caja_estatus 
                        ? sale.caja_estatus === 'Cerrada' 
                        : !shiftSales.some(s => s.id === sale.id || s.factura_nro === sale.factura_nro);

                      let bgBorderClass = 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800';
                      if (isSelected) {
                        bgBorderClass = 'bg-rose-50 border-rose-400 text-rose-950 shadow-md ring-2 ring-rose-400';
                      } else if (returnInfo.isFullyReturned) {
                        bgBorderClass = 'bg-rose-100/90 border-rose-500 text-rose-950 font-bold shadow-xs';
                      } else if (returnInfo.isPartiallyReturned) {
                        bgBorderClass = 'bg-amber-50 border-amber-400 text-amber-950 font-bold shadow-xs';
                      } else if (isClosedCaja) {
                        bgBorderClass = 'bg-indigo-50/60 border-indigo-200 hover:bg-indigo-100/60 text-slate-800';
                      }

                      return (
                        <button
                          key={sale.id || sale.factura_nro}
                          onClick={() => handleSelectDevSale(sale)}
                          className={`w-full text-left p-3 rounded-lg border transition-all flex flex-col gap-1.5 ${bgBorderClass}`}
                        >
                          <div className="flex justify-between font-mono font-bold text-[10px] items-center">
                            <div>
                              <span className="block">{sale.factura_nro}</span>
                              {sale.usuario && (
                                <span className="text-[8px] text-sky-700 font-sans font-bold block uppercase mt-0.5">
                                  Emitida por: <strong className="text-slate-800 font-extrabold">{sale.usuario}</strong>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {returnInfo.isFullyReturned && (
                                <span className="bg-red-600 text-white text-[8px] px-1.5 py-0.5 rounded font-black tracking-wider uppercase">
                                  🔴 DEVOLUCIÓN TOTAL
                                </span>
                              )}
                              {returnInfo.isPartiallyReturned && (
                                <span className="bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded font-black tracking-wider uppercase">
                                  ⚠️ DEV. PARCIAL
                                </span>
                              )}
                              {isClosedCaja && !returnInfo.isFullyReturned && (
                                <span className="bg-indigo-900 text-indigo-100 text-[8px] px-1.5 py-0.5 rounded font-black tracking-wider uppercase flex items-center gap-0.5 border border-indigo-700">
                                  <Lock className="w-2.5 h-2.5 text-indigo-300" />
                                  CAJA CERRADA
                                </span>
                              )}
                              <span className="font-mono text-xs font-black text-slate-800 ml-1">${sale.totalUSD.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="text-[9px] uppercase font-sans text-slate-500 flex justify-between border-t border-slate-200/60 pt-1">
                            <span className="truncate max-w-[130px]">{sale.client.nombre}</span>
                            <span>{sale.fecha}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Return Items and Refund Details */}
              <div className="w-full md:w-3/5 p-5 flex flex-col justify-between bg-slate-50 overflow-y-auto">
                {devSelectedSale ? (() => {
                  const salesList = allSalesList.length > 0 ? allSalesList : shiftSales;
                  const selectedReturnInfo = getSaleReturnInfo(devSelectedSale, salesList);
                  const isSelectedSaleClosedCaja = devSelectedSale.caja_estatus 
                    ? devSelectedSale.caja_estatus === 'Cerrada' 
                    : !shiftSales.some(s => s.id === devSelectedSale.id || s.factura_nro === devSelectedSale.factura_nro);
                  
                  return (
                    <div className="space-y-4 flex-grow flex flex-col justify-between">
                      <div className="space-y-4">
                        {/* BANNER DE ADVERTENCIA SEGÚN ESTADO DE DEVOLUCIÓN */}
                        {selectedReturnInfo.isFullyReturned && (
                          <div className="bg-red-600 text-white p-3.5 rounded-xl font-sans text-xs flex items-center gap-3 shadow-md border border-red-700">
                            <XCircle className="w-5 h-5 flex-shrink-0" />
                            <div>
                              <strong className="block text-sm uppercase">⛔ Factura Totalmente Devuelta</strong>
                              <span className="text-[11px] opacity-90 block">Esta factura ya fue devuelta en su totalidad (100% de productos reembolsados). No se permite registrar devoluciones adicionales.</span>
                            </div>
                          </div>
                        )}

                        {selectedReturnInfo.isPartiallyReturned && !selectedReturnInfo.isFullyReturned && (
                          <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded-xl font-sans text-xs flex items-center gap-2.5 shadow-sm">
                            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <div>
                              <strong className="block uppercase text-amber-950">⚠️ Factura con Devolución Parcial</strong>
                              <span className="text-[11px] text-amber-800 block">Esta factura registra productos devueltos previamente. Solo podrá devolver la cantidad faltante de cada producto.</span>
                            </div>
                          </div>
                        )}

                        {isSelectedSaleClosedCaja && !selectedReturnInfo.isFullyReturned && (
                          <div className="bg-indigo-900 text-white p-3 rounded-xl font-sans text-xs flex items-center gap-3 shadow-md border border-indigo-700">
                            <Lock className="w-4 h-4 text-indigo-300 flex-shrink-0" />
                            <div>
                              <strong className="block text-xs uppercase text-indigo-200">🔒 Devolución de Caja Cerrada (Aprobado por Administrador)</strong>
                              <span className="text-[11px] text-indigo-100 opacity-90 block">Esta factura pertenece a un turno de caja cerrado. El reembolso reingresará el producto al inventario actual y se registrará como un Egreso Administrativo Especial.</span>
                            </div>
                          </div>
                        )}

                        {/* Ticket header info banner */}
                        <div className="bg-white border border-slate-200 p-3 rounded-lg flex justify-between items-center text-xs font-sans shadow-xs">
                          <div>
                            <span className="text-[9px] text-slate-400 block uppercase">Cliente</span>
                            <strong className="text-slate-800 block uppercase">{devSelectedSale.client.nombre} ({devSelectedSale.client.cedula_rif})</strong>
                            {devSelectedSale.usuario && (
                              <span className="text-[10px] text-sky-700 font-mono font-bold block mt-0.5">
                                Emitida por: <strong className="text-slate-800">{devSelectedSale.usuario}</strong>
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-slate-400 block uppercase">Total Original</span>
                            <strong className="text-slate-800 block font-mono">${devSelectedSale.totalUSD.toFixed(2)}</strong>
                          </div>
                        </div>

                        {/* Método de Pago Original */}
                        <div className="bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg text-[10px] font-sans flex flex-col gap-1 shadow-xs">
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Forma de Pago Original:</span>
                          <div className="flex flex-wrap gap-2.5 font-semibold text-slate-700">
                            {devSelectedSale.pagos?.map((p, pIdx) => {
                              let label: string = p.metodo;
                              if (p.metodo === 'Efectivo$') label = 'Efectivo $';
                              else if (p.metodo === 'EfectivoBs') label = 'Efectivo Bs';
                              else if (p.metodo === 'TarjetaBs') label = 'Tarjeta Bs';
                              else if (p.metodo === 'PagoMovil') label = 'Pago Móvil Bs';
                              else if (p.metodo === 'Biopago') label = 'Biopago Bs';
                              else if (p.metodo === 'CreditoCliente') label = 'Crédito';
                              
                              const currency = p.metodo.includes('$') || p.metodo === 'CreditoCliente' ? '$' : 'Bs';
                              const formattedMonto = currency === '$' ? `$${p.monto.toFixed(2)}` : `Bs ${p.monto.toFixed(2)}`;
                              
                              return (
                                <div key={pIdx} className="bg-white border border-slate-200 px-2 py-0.5 rounded shadow-xs text-[9px] flex items-center gap-1">
                                  <span className="text-[8px] text-sky-700 font-bold uppercase">{label}:</span>
                                  <span className="font-mono font-bold text-slate-800">{formattedMonto}</span>
                                  {p.reference && <span className="text-[8px] text-slate-400 font-mono">Ref: {p.reference}</span>}
                                </div>
                              );
                            })}
                          </div>
                          {/* Display vuelto (change) if any */}
                          {((devSelectedSale.vueltoUSD || 0) > 0 || (devSelectedSale.vueltoVES || 0) > 0) && (
                            <div className="text-[8px] text-slate-500 italic mt-0.5 flex gap-2 font-mono border-t border-slate-200/60 pt-1">
                              <span>Vuelto entregado:</span>
                              {(devSelectedSale.vueltoUSD || 0) > 0 && <span>${(devSelectedSale.vueltoUSD || 0).toFixed(2)} USD</span>}
                              {(devSelectedSale.vueltoVES || 0) > 0 && <span>Bs {(devSelectedSale.vueltoVES || 0).toFixed(2)} VES</span>}
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-center border-b border-slate-200 pb-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Modificar Cantidades a Devolver</span>
                          <button
                            type="button"
                            onClick={handleSelectAllForDev}
                            disabled={selectedReturnInfo.isFullyReturned}
                            className="text-[9px] text-rose-700 hover:text-white font-bold font-sans bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-transparent disabled:opacity-40 disabled:hover:bg-rose-50 disabled:hover:text-rose-700 px-2.5 py-0.5 rounded transition-all flex items-center gap-1 shadow-xs"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            {selectedReturnInfo.isPartiallyReturned ? 'Devolver Faltantes' : 'Devolver Factura Completa'}
                          </button>
                        </div>

                        {/* Items list to return */}
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {devItems.map((item, idx) => {
                            const isItemFullyReturned = item.remainingQty <= 0;
                            
                            if (isItemFullyReturned) {
                              return (
                                <div key={idx} className="bg-slate-100 border border-slate-200 p-3 rounded-lg flex items-center justify-between text-xs gap-4 opacity-75">
                                  <div className="flex-grow min-w-0">
                                    <span className="font-bold text-slate-500 uppercase block truncate line-through">{item.product.description}</span>
                                    <span className="text-[10px] text-rose-700 font-mono font-bold">✓ Totalmente Devuelto ({item.prevReturnedQty} de {item.qty})</span>
                                  </div>
                                  <span className="bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase">
                                    DEVUELTO
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <div key={idx} className="bg-white border border-slate-200 p-3 rounded-lg flex items-center justify-between text-xs gap-4 shadow-sm">
                                <div className="flex-grow min-w-0">
                                  <span className="font-bold text-slate-800 uppercase block truncate">{item.product.description}</span>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 font-mono mt-0.5">
                                    <span>Precio: ${item.priceUSD.toFixed(2)}</span>
                                    <span>| Original: {item.qty}</span>
                                    {item.prevReturnedQty > 0 && <span className="text-amber-800 font-bold bg-amber-100/70 px-1 rounded">Ya devueltos: {item.prevReturnedQty}</span>}
                                    <span className="text-emerald-800 font-bold bg-emerald-100/70 px-1 rounded">Disponibles: {item.remainingQty}</span>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-1">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase font-sans">Destino:</span>
                                    <select
                                      value={item.inventoryDest || 'disponible'}
                                      onChange={(e) => handleUpdateDevDest(idx, e.target.value as any)}
                                      className="text-[9px] font-bold font-sans bg-transparent focus:outline-none cursor-pointer text-slate-700"
                                    >
                                      <option value="disponible">🟢 Stock Vendible</option>
                                      <option value="merma">🔴 Defectuoso / Merma</option>
                                    </select>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <label className="text-[9px] text-slate-400 uppercase block font-sans">Devolver:</label>
                                    <div className="flex items-center border border-slate-300 rounded overflow-hidden">
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateDevQty(idx, item.returnQty - (item.product.a_granel ? 0.1 : 1))}
                                        disabled={selectedReturnInfo.isFullyReturned}
                                        className="bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-slate-600 font-bold disabled:opacity-40"
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        min="0"
                                        max={item.remainingQty}
                                        step={item.product.a_granel ? "0.001" : "1"}
                                        value={item.returnQty === 0 ? '' : item.returnQty}
                                        placeholder="0"
                                        disabled={selectedReturnInfo.isFullyReturned}
                                        onChange={(e) => handleUpdateDevQty(idx, item.product.a_granel ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)}
                                        className="w-12 text-center font-bold font-mono text-xs focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateDevQty(idx, item.returnQty + (item.product.a_granel ? 0.1 : 1))}
                                        disabled={selectedReturnInfo.isFullyReturned}
                                        className="bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-slate-600 font-bold disabled:opacity-40"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* SECCIÓN DE PRODUCTOS DE CANJE / REEMPLAZO */}
                        <div className="border-t border-slate-200 pt-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-extrabold text-slate-700 uppercase tracking-wider block font-sans">
                              🔄 Productos de Canje / Reemplazo (Opcional)
                            </span>
                            {devExchangeItems.length > 0 && (
                              <span className="text-[9px] font-mono text-purple-700 font-bold bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                                {devExchangeItems.length} producto(s) a entregar
                              </span>
                            )}
                          </div>

                          {/* Search Bar for Exchange Products */}
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="🔍 Buscar producto nuevo a entregar al cliente..."
                              value={devExchangeSearch}
                              onChange={(e) => setDevExchangeSearch(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded p-2 text-xs text-slate-800 focus:outline-none font-sans shadow-xs"
                            />

                            {/* Search dropdown */}
                            {devExchangeSearch.trim() !== '' && (
                              <div className="absolute top-full left-0 right-0 z-20 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto mt-1 divide-y divide-slate-100">
                                {products
                                  .filter(p => p.description.toLowerCase().includes(devExchangeSearch.toLowerCase()) || p.barcode.toLowerCase().includes(devExchangeSearch.toLowerCase()))
                                  .sort((a, b) => {
                                    const aStock = (parseFloat(a.stock_actual as any) || 0) > 0 ? 1 : 0;
                                    const bStock = (parseFloat(b.stock_actual as any) || 0) > 0 ? 1 : 0;
                                    if (aStock !== bStock) return bStock - aStock;
                                    return a.description.localeCompare(b.description, 'es', { sensitivity: 'base' });
                                  })
                                  .slice(0, 8)
                                  .map(p => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => handleAddExchangeProduct(p)}
                                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex justify-between items-center text-xs font-sans"
                                    >
                                      <div>
                                        <strong className="text-slate-800 block text-[11px] uppercase">{p.description}</strong>
                                        <span className="text-[9px] text-slate-400 font-mono">Cod: {p.barcode} | Stock: {p.stock_actual}</span>
                                      </div>
                                      <span className="font-mono font-extrabold text-emerald-700 text-xs">${p.precio_detalle_usd.toFixed(2)}</span>
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>

                          {/* Exchange items list table */}
                          {devExchangeItems.length > 0 && (
                            <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                              {devExchangeItems.map((ex, exIdx) => (
                                <div key={exIdx} className="bg-purple-50/50 border border-purple-200/80 p-2 rounded-lg flex items-center justify-between text-xs font-sans">
                                  <div className="min-w-0 flex-grow">
                                    <span className="font-bold text-slate-800 uppercase block text-[10.5px] truncate">{ex.product.description}</span>
                                    <span className="text-[9.5px] text-slate-500 font-mono">${ex.priceUSD.toFixed(2)} USD c/u</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center border border-purple-200 rounded bg-white overflow-hidden">
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateExchangeQty(exIdx, ex.qty - 1)}
                                        className="px-2 py-0.5 text-slate-600 font-bold bg-slate-100 hover:bg-slate-200"
                                      >-</button>
                                      <span className="px-2 font-mono font-bold text-xs">{ex.qty}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateExchangeQty(exIdx, ex.qty + 1)}
                                        className="px-2 py-0.5 text-slate-600 font-bold bg-slate-100 hover:bg-slate-200"
                                      >+</button>
                                    </div>
                                    <span className="font-mono font-extrabold text-purple-900 text-xs min-w-[50px] text-right">
                                      ${(ex.qty * ex.priceUSD).toFixed(2)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveExchangeItem(exIdx)}
                                      className="text-rose-500 hover:text-rose-700 p-1"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Refund Summary and Action Form */}
                        <div className="border-t border-slate-200 pt-3 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 bg-slate-100 p-3 rounded-lg border border-slate-200 font-mono text-xs shadow-xs">
                            <div className="text-center md:text-left">
                              <span className="text-[9px] text-slate-500 uppercase block font-sans font-bold">Devolución (A Favor)</span>
                              <strong className="text-emerald-700 text-sm font-black">${devRefundTotal.toFixed(2)} USD</strong>
                            </div>
                            <div className="text-center md:text-left border-y md:border-y-0 md:border-x border-slate-250 py-1 md:py-0 md:px-3">
                              <span className="text-[9px] text-slate-500 uppercase block font-sans font-bold">Canje (Nuevos)</span>
                              <strong className="text-purple-700 text-sm font-black">${devExchangeTotal.toFixed(2)} USD</strong>
                            </div>
                            <div className="text-center md:text-right">
                              <span className="text-[9px] text-slate-500 uppercase block font-sans font-bold">
                                {devNetBalance > 0 ? 'Reembolso al Cliente' : devNetBalance < 0 ? 'Diferencia a Cobrar' : 'Mano a Mano'}
                              </span>
                              <strong className={`text-base font-black ${devNetBalance > 0 ? 'text-emerald-600' : devNetBalance < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                                ${Math.abs(devNetBalance).toFixed(2)} USD
                              </strong>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">Concepto / Motivo de Devolución o Canje</label>
                              <input
                                type="text"
                                required
                                disabled={selectedReturnInfo.isFullyReturned}
                                placeholder={selectedReturnInfo.isFullyReturned ? 'Factura devuelta en su totalidad' : 'ej. Producto defectuoso, cambio por otro modelo...'}
                                value={devMotivo}
                                onChange={(e) => setDevMotivo(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded p-2 text-xs text-slate-800 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                              />
                            </div>

                            {devNetBalance < 0 ? (
                              <div>
                                <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">Cobrar Diferencia al Cliente vía</label>
                                <select
                                  value={devExchangeDiffMethod}
                                  onChange={(e) => setDevExchangeDiffMethod(e.target.value as any)}
                                  className="w-full bg-white border border-slate-300 rounded p-2 text-xs text-slate-800 focus:outline-none font-sans font-bold"
                                >
                                  <option value="Efectivo$">Efectivo ($ USD)</option>
                                  <option value="EfectivoBs">Efectivo (Bs VES)</option>
                                  <option value="PagoMovil">Pago Móvil (Bs VES)</option>
                                  <option value="TarjetaBs">Tarjeta / Punto (Bs VES)</option>
                                  <option value="Biopago">Biopago (Bs VES)</option>
                                  <option value="CreditoCliente">Cargar a Deuda de Crédito</option>
                                </select>
                              </div>
                            ) : (
                              <div>
                                <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">Moneda de Reembolso (si aplica)</label>
                                <select
                                  value={devRefundCurrency}
                                  disabled={selectedReturnInfo.isFullyReturned}
                                  onChange={(e) => setDevRefundCurrency(e.target.value as 'USD' | 'VES')}
                                  className="w-full bg-white border border-slate-355 rounded p-2 text-xs text-slate-800 focus:outline-none font-sans disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                  <option value="USD">Dólares ($ USD)</option>
                                  <option value="VES">Bolívares (Bs VES)</option>
                                </select>
                              </div>
                            )}
                          </div>

                          <button
                            onClick={handleProcessDevolucion}
                            disabled={selectedReturnInfo.isFullyReturned || devRefundTotal === 0 || !devMotivo.trim()}
                            className="w-full bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:text-slate-500 text-white py-3.5 rounded-lg font-bold font-sans text-xs tracking-wider transition-all shadow-md flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            {selectedReturnInfo.isFullyReturned 
                              ? 'FACTURA TOTALMENTE DEVUELTA' 
                              : devExchangeItems.length > 0
                                ? 'PROCESAR CANJE Y ACTUALIZAR INVENTARIO / CAJA'
                                : 'PROCESAR DEVOLUCIÓN Y REEMBOLSAR EFECTIVO'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div className="flex-grow flex flex-col items-center justify-center text-slate-400 text-[11px] font-sans gap-2">
                    <RotateCcw className="w-8 h-8 text-slate-300" />
                    <span>Seleccione un ticket vendido a la izquierda para iniciar la devolución.</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRM MODAL FOR DEVOLUCION */}
      {showDevConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[99] font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-sm shadow-2xl flex flex-col transform transition-all animate-scale-in">
            <div className="bg-rose-50 border-b border-rose-100 px-5 py-4 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-rose-600 animate-spin-reverse" />
              <span className="text-xs font-bold text-rose-800 tracking-wider uppercase font-sans">Confirmar Reembolso</span>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-700 leading-relaxed font-sans">
                ¿Está seguro de procesar la devolución de{' '}
                <strong className="text-rose-700 font-mono font-black">
                  {devRefundCurrency === 'USD' ? `$${devRefundTotal.toFixed(2)} USD` : `Bs ${(devRefundTotal * tasaDia).toFixed(2)} VES`}
                </strong>{' '}
                y reintegrar el dinero al cliente?
              </p>
              
              <div className="bg-slate-55 border border-slate-200 rounded-lg p-3 text-[10px] space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Factura de origen:</span>
                  <strong className="font-mono text-slate-800">{devSelectedSale?.factura_nro}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Motivo:</span>
                  <span className="italic text-slate-700 truncate max-w-[180px] font-sans">{devMotivo}</span>
                </div>
                <div className="flex justify-between">
                  <span>Reembolso en:</span>
                  <strong className="text-slate-850 uppercase font-sans">{devRefundCurrency === 'USD' ? 'Dólares ($)' : 'Bolívares (Bs)'}</strong>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-150 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowDevConfirmModal(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded text-xs font-sans font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDevolucionProcess}
                className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded text-xs font-sans font-bold transition-all shadow-md animate-pulse"
              >
                Confirmar Registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert overlay */}
      {toast && (
        toast.type === 'error' ? (
          <div className="fixed inset-0 flex items-center justify-center z-[110] pointer-events-none animate-fade-in font-mono">
            <div className="bg-red-50 border-2 border-red-300 text-red-900 px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3 max-w-sm text-center ring-8 ring-red-500/10 pointer-events-auto">
              <AlertCircle className="w-12 h-12 text-red-600 animate-bounce" />
              <div className="space-y-1">
                <span className="block text-xs font-black text-red-650 uppercase font-sans tracking-wide">Error de Lectura</span>
                <span className="block text-sm font-extrabold font-sans leading-snug">{toast.text}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="fixed bottom-6 right-6 z-[100] animate-fade-in font-mono">
            <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border shadow-2xl text-xs font-bold font-sans ${
              toast.type === 'success' ? 'bg-emerald-50 border-emerald-250 text-emerald-800 ring-4 ring-emerald-500/10' :
              'bg-sky-50 border-sky-250 text-sky-850 ring-4 ring-sky-500/10'
            }`}>
              <CheckCircle2 className="w-5 h-5 text-emerald-600 animate-bounce" />
              <span>{toast.text}</span>
            </div>
          </div>
        )
      )}

      {/* MODAL RÁPIDO: REGISTRAR NUEVO CLIENTE DESDE POS */}
      {showQuickClientModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[90] animate-fade-in font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600 bg-emerald-50 rounded-full p-0.5" />
                REGISTRAR NUEVO CLIENTE
              </h3>
              <button 
                type="button"
                onClick={() => setShowQuickClientModal(false)} 
                className="text-slate-400 hover:text-slate-700 font-sans font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateQuickClient} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Cédula / RIF <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: V-12345678"
                    value={quickDoc}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (!val || val.trim() === '') {
                        setQuickDoc('V-');
                      } else if (!val.startsWith('V-') && !val.startsWith('J-') && !val.startsWith('E-') && !val.startsWith('G-') && !val.startsWith('P-')) {
                        setQuickDoc('V-' + val.replace(/^[^\d]+/, ''));
                      } else {
                        setQuickDoc(val);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej: 0414-1234567"
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Nombre o Razón Social <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Nombre completo..."
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none font-sans"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Dirección de Domicilio</label>
                <input
                  type="text"
                  placeholder="Ciudad, calle, local..."
                  value={quickAddress}
                  onChange={(e) => setQuickAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Límite de Crédito ($ USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quickCreditLimit}
                    onChange={(e) => setQuickCreditLimit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none font-mono text-center"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Descuento Pre-aprobado (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    disabled={quickPrecioCosto}
                    value={quickDiscount}
                    onChange={(e) => setQuickDiscount(e.target.value)}
                    className={`w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none font-mono text-center ${quickPrecioCosto ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}`}
                  />
                </div>
              </div>

              {/* Precio Costo Toggle */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickPrecioCosto}
                    onChange={(e) => {
                      setQuickPrecioCosto(e.target.checked);
                      if (e.target.checked) {
                        setQuickDiscount('0');
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
                <div>
                  <span className="text-xs font-bold text-amber-800 font-sans">Cobrar a Precio Costo</span>
                  <p className="text-[10px] text-amber-600 font-sans">Si se activa, todos los productos que compre este cliente se facturarán al precio de costo del inventario.</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuickClientModal(false)}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-655 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all shadow"
                >
                  REGISTRAR CLIENTE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CAMBIO DE DIVISAS Y VENTA DE EFECTIVO */}
      <CambioDivisasModal
        isOpen={showCambioDivisasModal}
        onClose={() => setShowCambioDivisasModal(false)}
        tasaDia={tasaDia}
        bcvRateUSD={tasaDia}
        currentUser={currentUser}
        companyConfig={companyConfig}
        onProcessOperation={handleProcessDivisaOperation}
      />

      {/* MODAL: ZOOM / VISTA PREVIA EN GRANDE DEL PRODUCTO */}
      {zoomedProduct && (
        <div 
          onClick={() => setZoomedProduct(null)}
          className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in cursor-zoom-out"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xl max-w-lg w-full flex flex-col cursor-default transform transition-all animate-scale-in"
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white px-5 py-3.5 flex justify-between items-center border-b border-slate-700">
              <div className="min-w-0 flex-1 pr-3">
                <span className="text-[10px] text-blue-300 font-mono font-bold block">{zoomedProduct.barcode || 'SIN CÓDIGO'}</span>
                <h3 className="text-sm font-black uppercase truncate text-white">{zoomedProduct.description}</h3>
              </div>
              <button 
                onClick={() => setZoomedProduct(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-rose-600 text-white flex items-center justify-center transition-colors text-sm font-bold flex-shrink-0"
                title="Cerrar vista previa (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Large Image Canvas */}
            <div className="p-6 bg-slate-100/70 flex items-center justify-center min-h-[320px] max-h-[60vh] overflow-hidden relative">
              {zoomedProduct.imagen_url ? (
                <img 
                  src={zoomedProduct.imagen_url} 
                  alt={zoomedProduct.description} 
                  className="max-h-[50vh] max-w-full object-contain rounded-xl shadow-lg bg-white p-2 border border-slate-200"
                />
              ) : (
                <div className="text-center text-slate-400 p-8">
                  <ImageIcon className="w-16 h-16 mx-auto mb-2 text-slate-300" />
                  <span className="text-sm font-bold">Sin Imagen</span>
                </div>
              )}
            </div>

            {/* Footer with Price Details (Detal & Mayor) & Stock */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 font-sans">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* 1. PRECIO DETALLE */}
                <div className="bg-white border border-emerald-200 rounded-xl p-2.5 shadow-2xs">
                  <span className="text-[9.5px] text-emerald-800 uppercase font-extrabold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Precio Detal (P1)
                  </span>
                  <div className="mt-1">
                    <span className="text-lg font-black text-emerald-600 font-mono block leading-tight">
                      ${zoomedProduct.precio_detalle_usd.toFixed(2)}
                    </span>
                    <span className="text-[10.5px] font-bold text-slate-600 font-mono">
                      {formatBs(zoomedProduct.precio_detalle_usd * tasaDia)}
                    </span>
                  </div>
                </div>

                {/* 2. PRECIO AL MAYOR */}
                <div className="bg-white border border-blue-200 rounded-xl p-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] text-blue-800 uppercase font-extrabold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      Precio Mayor (P2)
                    </span>
                    <span className="text-[8.5px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 px-1 py-0.2 rounded font-mono">
                      ≥ {zoomedProduct.cantidad_mayorista || 12} {zoomedProduct.a_granel ? 'kg' : 'uds'}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="text-lg font-black text-blue-700 font-mono block leading-tight">
                      ${zoomedProduct.precio_mayor_usd.toFixed(2)}
                    </span>
                    <span className="text-[10.5px] font-bold text-slate-600 font-mono">
                      {formatBs(zoomedProduct.precio_mayor_usd * tasaDia)}
                    </span>
                  </div>
                </div>

                {/* 3. STOCK ACTUAL */}
                <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs flex flex-col justify-between">
                  <span className="text-[9.5px] text-slate-500 uppercase font-bold">Stock Disponible</span>
                  <div className="mt-1">
                    <span className={`text-sm font-mono font-black px-2 py-0.5 rounded-lg border inline-block ${
                      zoomedProduct.stock_actual <= zoomedProduct.stock_minimo 
                        ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse' 
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}>
                      {formatStockVal(zoomedProduct.stock_actual, zoomedProduct.a_granel)} {zoomedProduct.a_granel ? 'kg' : 'uds'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING CONTEXT MENU (RIGHT-CLICK ON PRODUCT PREVIEW OR IMAGE) */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden w-64 text-slate-800 text-xs font-sans animate-in fade-in zoom-in duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-3 bg-slate-900 text-white flex items-center gap-2 border-b border-slate-800">
            <div className="p-2 bg-slate-800 rounded-lg text-blue-400">
              <Package className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] text-blue-300 font-mono font-bold block truncate">{contextMenu.product.barcode || 'S/C'}</span>
              <span className="text-[11px] font-black text-white block uppercase truncate leading-tight">{contextMenu.product.description}</span>
              <span className="text-[9px] text-emerald-400 font-mono block mt-0.5">
                Stock: {formatStockVal(contextMenu.product.stock_actual, contextMenu.product.a_granel)} {contextMenu.product.a_granel ? 'kg' : 'uds'}
              </span>
            </div>
          </div>

          <div className="p-1 space-y-0.5 font-bold">
            {/* 1. Modificar Ficha Técnica */}
            <button
              type="button"
              onClick={() => {
                const prod = contextMenu.product;
                setContextMenu(null);
                setEditingProduct(prod);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 hover:text-slate-900 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Edit className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
              <span>Modificar Ficha Técnica</span>
            </button>

            <div className="border-t border-slate-100 my-1"></div>

            {/* 2. Generar Foto con IA */}
            <button
              type="button"
              onClick={() => {
                const prod = contextMenu.product;
                setContextMenu(null);
                handleGenerateAiImageForProduct(prod);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 hover:text-indigo-900 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span>Generar Foto con IA</span>
            </button>

            {/* 6. Ver Imagen Ampliada */}
            {contextMenu.product.imagen_url && (
              <button
                type="button"
                onClick={() => {
                  const prod = contextMenu.product;
                  setContextMenu(null);
                  setZoomedProduct(prod);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-emerald-50 hover:text-emerald-900 rounded-lg flex items-center gap-2 transition-colors text-emerald-700"
              >
                <ZoomIn className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span>Ver Imagen Ampliada</span>
              </button>
            )}

            {/* 7. Eliminar Producto */}
            <div className="border-t border-slate-100 my-1"></div>
            <button
              type="button"
              disabled={contextMenu.product.stock_actual > 0}
              onClick={async () => {
                const prod = contextMenu.product;
                setContextMenu(null);
                if (prod.stock_actual > 0) return;
                const ok = await showConfirm(`¿Eliminar permanentemente "${prod.description}"?`, 'Confirmar Eliminación', { confirmLabel: 'Eliminar', isDanger: true });
                if (ok && onDeleteProduct) {
                  await onDeleteProduct(prod.id);
                  showAlert('🗑️ Producto eliminado del sistema.', 'Producto Eliminado', 'info');
                }
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors ${
                contextMenu.product.stock_actual > 0 
                  ? 'opacity-40 cursor-not-allowed text-slate-400' 
                  : 'hover:bg-rose-50 text-rose-600 hover:text-rose-700'
              }`}
              title={contextMenu.product.stock_actual > 0 ? "Solo se puede eliminar con existencia 0" : "Eliminar producto"}
            >
              <Minus className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
              <span>Eliminar Producto</span>
            </button>
          </div>
        </div>
      )}

      {/* QUICK IMAGE MANAGER MODAL */}
      {imageManagerProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Gestionar Foto del Producto</h3>
                  <p className="text-xs text-slate-500 font-mono">{imageManagerProduct.barcode} • {imageManagerProduct.description}</p>
                </div>
              </div>
              <button onClick={() => setImageManagerProduct(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">URL Directa de Imagen (HTTPS)</label>
                <input
                  type="text"
                  placeholder="https://ejemplo.com/imagen.jpg"
                  value={imageManagerUrlInput}
                  onChange={(e) => setImageManagerUrlInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">o Subir Archivo Local (JPG, PNG)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && imageManagerProduct) {
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const base64 = reader.result as string;
                        const updated = { ...imageManagerProduct, imagen_url: base64 };
                        if (onUpdateProduct) await onUpdateProduct(updated);
                        setImageManagerProduct(null);
                        showAlert('✅ Imagen subida y asociada exitosamente.', 'Imagen Guardada', 'info');
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleGenerateAiImageForProduct(imageManagerProduct)}
                disabled={isGeneratingAiImage}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl flex items-center gap-1 border border-amber-200"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>{isGeneratingAiImage ? 'Generando...' : 'Generar con IA'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImageManagerProduct(null)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 text-xs font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (imageManagerProduct) {
                      const updated = { ...imageManagerProduct, imagen_url: imageManagerUrlInput.trim() };
                      if (onUpdateProduct) await onUpdateProduct(updated);
                      setImageManagerProduct(null);
                      showAlert('✅ Imagen actualizada con éxito.', 'Imagen Guardada', 'info');
                    }
                  }}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm"
                >
                  Guardar Imagen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MODIFICAR FICHA DE PRODUCTO (EXACT DESIGN MATCH) */}
      {editingProduct && (
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-sans text-slate-800">
          <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden w-full ${isAuxExpandedEdit ? 'max-w-2xl sm:max-w-3xl' : 'max-w-xl'} shadow-2xl p-6 space-y-4 transition-all duration-300 max-h-[92vh] overflow-y-auto`}>
            
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Edit className="w-4 h-4 text-slate-600 bg-slate-100 rounded-full p-0.5" />
                MODIFICAR FICHA DE PRODUCTO
              </h3>
              <button type="button" onClick={() => setEditingProduct(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleUpdateProductSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Clave del Producto <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. HARINA-PAN-1K"
                    value={editClave.toUpperCase()}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      if (editBarcode === editClave || editBarcode === '') {
                        setEditBarcode(val);
                      }
                      setEditClave(val);
                    }}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-855 focus:bg-white focus:border-blue-600 focus:outline-none uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Código de Barras</label>
                  <input
                    type="text"
                    placeholder="Vacío = usar Clave"
                    value={editBarcode}
                    onChange={(e) => setEditBarcode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Categoría</label>
                  <div className="flex gap-2">
                    <select
                      value={editCat}
                      onChange={(e) => setEditCat(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none font-bold"
                    >
                      {allCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowQuickAddCatModal(true)}
                      className="bg-red-800 hover:bg-red-900 text-white px-3 py-2.5 rounded text-xs font-bold font-mono transition-all flex items-center justify-center shadow-sm"
                      title="Agregar nueva categoría"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Impuesto</label>
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-350 rounded p-2 text-xs select-none h-[38px]">
                    <label className="flex items-center gap-1.5 cursor-pointer font-sans font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={editTaxActive}
                        onChange={(e) => setEditTaxActive(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span>Si</span>
                    </label>
                    <input
                      type="text"
                      placeholder="IVA"
                      disabled={!editTaxActive}
                      value={editTaxName}
                      onChange={(e) => setEditTaxName(e.target.value.toUpperCase())}
                      className="w-full bg-white border border-slate-300 rounded p-1 text-[11px] font-sans font-bold text-slate-800 uppercase disabled:opacity-40 disabled:bg-slate-100"
                    />
                    <span className="font-bold text-slate-500 font-sans">%</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      disabled={!editTaxActive}
                      value={editTaxPct}
                      onChange={(e) => setEditTaxPct(e.target.value)}
                      className="w-12 text-center bg-white border border-slate-300 rounded p-1 font-bold font-mono text-[11px] text-slate-855 disabled:opacity-40 disabled:bg-slate-100"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Descripción del Artículo <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Descripción del artículo..."
                  value={editDesc.toUpperCase()}
                  onChange={(e) => setEditDesc(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-855 focus:bg-white focus:border-blue-600 focus:outline-none font-sans font-bold uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Forma de Venta</label>
                  <select
                    value={editAGranel ? 'granel' : 'unidad'}
                    onChange={(e) => setEditAGranel(e.target.value === 'granel')}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none font-sans font-semibold"
                  >
                    <option value="unidad">Venta por Unidad / Entero</option>
                    <option value="granel">Venta a Granel (Peso / Kg / Fraccional)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Fecha de Vencimiento (Opcional)</label>
                  <input
                    type="date"
                    value={editVencimiento}
                    onChange={(e) => setEditVencimiento(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2 text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none font-sans font-medium"
                  />
                </div>
              </div>

              {/* AUXILIAR DE CÁLCULO DE PRECIOS */}
              <AuxiliarCalculoPrecios
                initialCost={editCost}
                initialDetail={editDetail}
                initialMayor={editMayor}
                tasaBCV={tasaDia}
                tasaFallback={tasaDia}
                taxActive={editTaxActive}
                taxPct={parseFloat(editTaxPct) || 16}
                onToggleExpand={(expanded) => setIsAuxExpandedEdit(expanded)}
                onApplyPrices={({ cost, detail, mayor }) => {
                  setEditCost(cost);
                  setEditDetail(detail);
                  setEditMayor(mayor);
                }}
              />

              <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Costo ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs font-mono font-bold focus:ring-1 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Detalle ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editDetail}
                    onChange={(e) => setEditDetail(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs font-mono font-bold focus:ring-1 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Mayor ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editMayor}
                    onChange={(e) => setEditMayor(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs font-mono font-bold focus:ring-1 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Stock Mínimo (Alerta)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editMinStock}
                    onChange={(e) => setEditMinStock(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none font-mono text-center font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Cant. Mayorista</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editWholesaleQty}
                    onChange={(e) => setEditWholesaleQty(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none font-mono text-center font-bold"
                  />
                </div>
              </div>

              {/* SECCIÓN DE IMAGEN DEL PRODUCTO (MANUAL / IA) */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase font-sans flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>IMAGEN DEL PRODUCTO</span>
                  </label>
                  {editImageUrl && (
                    <button
                      type="button"
                      onClick={() => setEditImageUrl('')}
                      className="text-[10px] text-red-600 hover:text-red-800 font-bold underline"
                    >
                      Quitar Imagen
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Vista Previa */}
                  <div className="w-16 h-16 rounded-lg bg-white border border-slate-300 flex items-center justify-center flex-shrink-0 overflow-hidden relative shadow-inner">
                    <div className="text-center p-1">
                      <ImageIcon className="w-5 h-5 text-slate-300 mx-auto" />
                      <span className="text-[8px] text-slate-400 font-bold block">Sin Foto</span>
                    </div>
                    {editImageUrl && (
                      <img 
                        key={`edit-prod-img-${editImageUrl}`}
                        src={editImageUrl} 
                        alt="Preview" 
                        className="w-full h-full object-cover absolute inset-0 bg-white" 
                        onLoad={(e) => { (e.currentTarget as HTMLElement).style.display = 'block'; }}
                        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                      />
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Pegar URL de imagen (https://...)"
                        value={editImageUrl}
                        onChange={(e) => setEditImageUrl(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-800 font-mono focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-3 py-1.5 rounded text-xs font-bold font-sans cursor-pointer transition-all flex items-center gap-1">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Subir desde PC</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                setEditImageUrl(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>

                      {editingProduct && (
                        <button
                          type="button"
                          onClick={() => handleGenerateAiImageForProduct(editingProduct)}
                          disabled={isGeneratingAiImage}
                          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-3 py-1.5 rounded text-xs font-bold font-sans transition-all flex items-center gap-1 shadow-sm"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>{isGeneratingAiImage ? 'Generando...' : 'Generar con IA'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold font-sans"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-xs font-black font-sans uppercase shadow-md"
                >
                  GUARDAR CAMBIOS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK ADD CATEGORY MODAL */}
      {showQuickAddCatModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-2xl max-w-xs w-full p-5 shadow-2xl space-y-3">
            <h4 className="font-bold text-slate-800 text-xs uppercase">Agregar Nueva Categoría</h4>
            <input
              type="text"
              placeholder="Nombre de la Categoría..."
              value={newCatInputName}
              onChange={(e) => setNewCatInputName(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold uppercase"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowQuickAddCatModal(false)}
                className="px-3 py-1.5 text-xs text-slate-500 font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newCatInputName.trim()) {
                    const cat = newCatInputName.trim().toUpperCase();
                    setCustomCategories(prev => [...prev, cat]);
                    setEditCat(cat);
                    setNewCatInputName('');
                    setShowQuickAddCatModal(false);
                  }
                }}
                className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
