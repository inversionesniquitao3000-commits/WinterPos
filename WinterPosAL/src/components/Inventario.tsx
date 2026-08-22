import { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Product, InventoryMovement, PriceAdjustmentHistory, User, CompanyConfig } from '../types';
import { Package, History, PenTool, Plus, Search, Layers, RefreshCw, Minus, Printer, ArrowUpDown, ArrowUp, ArrowDown, Edit, CheckCircle2, Upload, Download, Tag, FileSpreadsheet, MessageCircle, ChevronDown, Calculator, PauseCircle, Play, Trash2, Wand2, Sparkles, ShieldAlert, RotateCcw, BarChart3, TrendingUp, Award, DollarSign, Calendar, X, Image as ImageIcon, Link as LinkIcon, UploadCloud, Check, Loader2, Building2, QrCode, Truck, AlertOctagon, Clock, Copy, ClipboardCheck } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { getLocalDateStr, getApiBaseUrl, formatImageUrl } from '../utils';
import AuxiliarCalculoPrecios from './AuxiliarCalculoPrecios';
import AsistenteImportacionPDF from './AsistenteImportacionPDF';
import BarcodeVisualizer from './BarcodeVisualizer';

interface InventarioProps {
  products: Product[];
  movements: InventoryMovement[];
  priceHistory: PriceAdjustmentHistory[];
  currentUser: User;
  tasaDia?: number;
  bcvRateUSD?: number;
  companyConfig?: CompanyConfig;
  onAddProduct: (prod: Product) => void;
  onAddProductsBulk: (productsArray: any[]) => Promise<number | null>;
  onUpdateProductStock: (prodId: number, type: 'Entrada' | 'Salida' | 'Merma' | 'Devolucion', qty: number, reason: string) => void;
  onUpdateProductPrices: (prodId: number, prices: { cost: number; detail: number; mayor: number }, reason: string) => void;
  onUpdateProductPricesBulk: (updates: { id: number; cost: number; detail: number; mayor: number }[], historyLogs: any[]) => Promise<boolean>;
  onDeleteProduct: (prodId: number) => Promise<boolean>;
  onUpdateProduct: (prod: Product) => Promise<boolean>;
  onUpdateProductStockBulk: (
    updates: {
      prodId: number;
      qty: number;
      precio_costo_usd: number;
      precio_detalle_usd: number;
      precio_mayor_usd: number;
    }[],
    reason: string
  ) => Promise<boolean>;
}

const formatStockVal = (val: any, aGranel?: boolean) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0';
  if (!aGranel) return Math.round(num).toString();
  return num.toFixed(3);
};

export default function Inventario({
  products,
  movements,
  priceHistory,
  currentUser: _currentUser,
  tasaDia,
  bcvRateUSD,
  companyConfig,
  onAddProduct,
  onAddProductsBulk,
  onUpdateProductStock,
  onUpdateProductPrices,
  onUpdateProductPricesBulk,
  onDeleteProduct,
  onUpdateProduct,
  onUpdateProductStockBulk: _onUpdateProductStockBulk
}: InventarioProps) {
  const { showAlert, showConfirm } = useDialog();
  const hasPermission = (action: 'ver' | 'crear' | 'editar' | 'eliminar') => {
    if (!_currentUser || !_currentUser.rol) return true;
    if ((_currentUser.rol || '').toLowerCase() === 'administrador') return true;
    if (!_currentUser.permisos) return true; // default fallback if none specified
    return !!_currentUser.permisos.inventario?.[action];
  };

  const canViewCost = useMemo(() => {
    if (!_currentUser || !_currentUser.rol) return true;
    if ((_currentUser.rol || '').toLowerCase() === 'administrador') return true;
    return !!_currentUser.permisos?.inventario?.ver_costos;
  }, [_currentUser]);

  const [activeSubTab, setActiveSubTab] = useState<'catalogo' | 'movimientos' | 'precios' | 'estadisticas'>('catalogo');
  const [selectedMovementDetail, setSelectedMovementDetail] = useState<any>(null);
  const [successMsg, setSuccessMsg] = useState('');

  // AI & Manual Image generation states & handlers
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [showImageManagerModal, setShowImageManagerModal] = useState(false);
  const [imageManagerProduct, setImageManagerProduct] = useState<Product | null>(null);
  const [imageManagerUrlInput, setImageManagerUrlInput] = useState('');
  const [isUploadingManualImage, setIsUploadingManualImage] = useState(false);

  // Estados para Generación Masiva con IA
  const [showBulkAiModal, setShowBulkAiModal] = useState(false);
  const [bulkAiScope, setBulkAiScope] = useState<'sin_foto' | 'todos' | 'categoria'>('sin_foto');
  const [selectedBulkCategory, setSelectedBulkCategory] = useState<string>('');
  const [bulkCategoryNoPhotoOnly, setBulkCategoryNoPhotoOnly] = useState<boolean>(true);
  const [isBulkAiRunning, setIsBulkAiRunning] = useState(false);
  const [bulkAiProgress, setBulkAiProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [bulkAiLogs, setBulkAiLogs] = useState<Array<{ id: number; description: string; barcode: string; imageUrl: string; success: boolean; discarded: boolean }>>([]);
  const isBulkAiCancelledRef = useRef(false);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim().toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [products]);

  // Context Menu state for right-click on inventory table rows
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    product: Product;
  } | null>(null);

  useEffect(() => {
    const handleCloseContextMenu = () => setContextMenu(null);
    window.addEventListener('click', handleCloseContextMenu);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleCloseContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleGenerateAiImageForProduct = async (prod: Product) => {
    setIsGeneratingAiImage(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/ai/generate-product-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: prod.description,
          category: prod.category,
          barcode: prod.barcode,
          saveLocal: true
        })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Servidor devolvió respuesta no válida (${res.status}). Verifique la instalación del servidor.`);
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || `Error HTTP ${res.status}`);
      }
      if (data.success && data.imageUrl) {
        const updatedProd = { ...prod, imagen_url: data.imageUrl };
        await onUpdateProduct(updatedProd);
        setSelectedProduct(updatedProd);
        if (imageManagerProduct && imageManagerProduct.id === prod.id) {
          setImageManagerProduct(updatedProd);
          setImageManagerUrlInput(data.imageUrl);
        }
        showAlert('✅ Imagen generada con Inteligencia Artificial y asociada al producto con éxito.', 'Imagen Generada con IA', 'info');
      } else {
        showAlert('No se pudo generar la imagen: ' + (data.error || 'Respuesta no exitosa'), 'Error IA', 'warning');
      }
    } catch (err: any) {
      showAlert(`Error conectando con servicio de IA: ${err.message}`, 'Error IA', 'warning');
    } finally {
      setIsGeneratingAiImage(false);
    }
  };

  const handleUploadImageFile = async (file: File, target: 'new' | 'edit' | 'manager', product?: Product) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showAlert('El archivo seleccionado debe ser una imagen válida (JPG, PNG, WEBP).', 'Formato Inválido', 'warning');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showAlert('La imagen no debe superar los 5MB de tamaño.', 'Archivo muy grande', 'warning');
      return;
    }

    setIsUploadingManualImage(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        if (!base64Data) return;

        const res = await fetch(`${getApiBaseUrl()}/ai/upload-product-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64Data,
            filename: file.name
          })
        });
        const data = await res.json();
        if (data.success && data.imageUrl) {
          if (target === 'new') {
            setNewImageUrl(data.imageUrl);
          } else if (target === 'edit') {
            setEditImageUrl(data.imageUrl);
          } else if (target === 'manager' && product) {
            const updated = { ...product, imagen_url: data.imageUrl };
            await onUpdateProduct(updated);
            setSelectedProduct(updated);
            setImageManagerProduct(updated);
            setImageManagerUrlInput(data.imageUrl);
          }
          showToast('📸 Foto subida y guardada exitosamente.');
        } else {
          showAlert('Error al subir la imagen: ' + (data.error || 'Desconocido'), 'Error', 'warning');
        }
        setIsUploadingManualImage(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setIsUploadingManualImage(false);
      showAlert('Error al procesar la imagen: ' + err.message, 'Error', 'warning');
    }
  };

  const ensureCleanImageUrl = async (rawUrl: string, barcodeName?: string): Promise<string> => {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed.startsWith('data:image/')) return trimmed;
    try {
      setIsUploadingManualImage(true);
      const res = await fetch(`${getApiBaseUrl()}/ai/upload-product-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: trimmed,
          filename: `${barcodeName || 'manual'}.jpg`
        })
      });
      const data = await res.json();
      if (data.success && data.imageUrl) {
        return data.imageUrl;
      }
    } catch (_) {
    } finally {
      setIsUploadingManualImage(false);
    }
    return trimmed;
  };

  const handleOpenImageManager = (prod: Product) => {
    setImageManagerProduct(prod);
    setImageManagerUrlInput(prod.imagen_url || '');
    setShowImageManagerModal(true);
  };

  const handleSaveManagerUrl = async () => {
    if (!imageManagerProduct) return;
    const finalUrl = await ensureCleanImageUrl(imageManagerUrlInput, imageManagerProduct.barcode);
    const updated = { ...imageManagerProduct, imagen_url: finalUrl };
    await onUpdateProduct(updated);
    setSelectedProduct(updated);
    setImageManagerProduct(updated);
    setShowImageManagerModal(false);
    showToast('✅ Imagen del producto actualizada con éxito.');
  };

  const handleRemoveManagerImage = async () => {
    if (!imageManagerProduct) return;
    const updated = { ...imageManagerProduct, imagen_url: '' };
    await onUpdateProduct(updated);
    setSelectedProduct(updated);
    setImageManagerProduct(updated);
    setImageManagerUrlInput('');
    showToast('🗑️ Imagen removida del producto.');
  };

  const handleStartBulkAiGeneration = async () => {
    let targetProducts: Product[] = [];

    if (bulkAiScope === 'sin_foto') {
      targetProducts = products.filter(p => !p.imagen_url || p.imagen_url.trim() === '');
    } else if (bulkAiScope === 'todos') {
      targetProducts = products;
    } else if (bulkAiScope === 'categoria') {
      if (!selectedBulkCategory) {
        showAlert('Por favor seleccione una categoría para procesar.', 'Atención', 'warning');
        return;
      }
      targetProducts = products.filter(p => (p.category || '').toUpperCase() === selectedBulkCategory.toUpperCase());
      if (bulkCategoryNoPhotoOnly) {
        targetProducts = targetProducts.filter(p => !p.imagen_url || p.imagen_url.trim() === '');
      }
    }

    if (targetProducts.length === 0) {
      showAlert('No hay productos que cumplan con el criterio seleccionado para generar fotos.', 'Sin Productos', 'warning');
      return;
    }

    const confirm = await showConfirm(
      `¿Desea iniciar la generación automática con IA para ${targetProducts.length} productos? Este proceso procesará cada artículo en segundo plano y guardará las imágenes automáticamente.`,
      'Confirmar Generación Masiva con IA'
    );
    if (!confirm) return;

    setIsBulkAiRunning(true);
    isBulkAiCancelledRef.current = false;
    setBulkAiProgress({ current: 0, total: targetProducts.length, percent: 0 });
    setBulkAiLogs([]);

    let processedCount = 0;
    for (const prod of targetProducts) {
      if (isBulkAiCancelledRef.current) break;

      try {
        const res = await fetch(`${getApiBaseUrl()}/ai/generate-product-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: prod.description,
            category: prod.category,
            barcode: prod.barcode,
            saveLocal: true
          })
        });
        const contentType = res.headers.get('content-type') || '';
        const data = (contentType.includes('application/json') && res.ok) ? await res.json() : null;
        if (data && data.success && data.imageUrl) {
          setBulkAiLogs(prev => [{
            id: prod.id,
            description: prod.description,
            barcode: prod.barcode || '',
            imageUrl: data.imageUrl,
            success: true,
            discarded: false
          }, ...prev]);
        } else {
          setBulkAiLogs(prev => [{
            id: prod.id,
            description: prod.description,
            barcode: prod.barcode || '',
            imageUrl: '',
            success: false,
            discarded: true
          }, ...prev]);
        }
      } catch (_) {
        setBulkAiLogs(prev => [{
          id: prod.id,
          description: prod.description,
          barcode: prod.barcode || '',
          imageUrl: '',
          success: false,
          discarded: true
        }, ...prev]);
      }

      processedCount++;
      const pct = Math.round((processedCount / targetProducts.length) * 100);
      setBulkAiProgress({ current: processedCount, total: targetProducts.length, percent: pct });
    }

    setIsBulkAiRunning(false);
    if (!isBulkAiCancelledRef.current) {
      showToast(`🎉 ¡Generación con IA finalizada! Revise las imágenes y haga clic en las que desee descartar antes de aplicar.`);
    } else {
      showToast(`⏸️ Proceso pausado. Puede revisar las fotos generadas.`);
    }
  };

  const handleToggleDiscardBulkAiItem = (id: number) => {
    setBulkAiLogs(prev => prev.map(item => item.id === id ? { ...item, discarded: !item.discarded } : item));
  };

  const handleApplyBulkAiSelected = async () => {
    const validToApply = bulkAiLogs.filter(l => l.success && l.imageUrl && !l.discarded);
    if (validToApply.length === 0) {
      showAlert('No hay fotos seleccionadas para aplicar al catálogo.', 'Sin Selección', 'warning');
      return;
    }

    const confirm = await showConfirm(
      `¿Desea aplicar las ${validToApply.length} fotos conservadas a los productos del catálogo?`,
      'Confirmar Asignación de Fotos'
    );
    if (!confirm) return;

    let updatedCount = 0;
    for (const log of validToApply) {
      const prod = products.find(p => p.id === log.id);
      if (prod) {
        await onUpdateProduct({ ...prod, imagen_url: log.imageUrl });
        updatedCount++;
      }
    }

    setShowBulkAiModal(false);
    setBulkAiLogs([]);
    showToast(`✅ ¡Éxito! Se aplicaron ${updatedCount} fotos al catálogo (${bulkAiLogs.length - updatedCount} descartadas).`);
  };

  // Estados para Carga por Factura
  const [showInvoiceLoadModal, setShowInvoiceLoadModal] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceProveedorId, setInvoiceProveedorId] = useState<number | string>(1);
  const [proveedoresList, setProveedoresList] = useState<{ id: number; razon_social: string; rif?: string }[]>([]);
  const [proveedorSearchTerm, setProveedorSearchTerm] = useState('');
  const [showProveedorDropdown, setShowProveedorDropdown] = useState(false);
  const [invoiceProducts, setInvoiceProducts] = useState<{
    product: Product;
    qty: number;
    precio_costo_usd: number;
    precio_detalle_usd: number;
    precio_mayor_usd: number;
  }[]>([]);
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState('');
  const [invoiceAuxItemIndex, setInvoiceAuxItemIndex] = useState<number | null>(null);
  const [isProcessingInvoiceLoad, setIsProcessingInvoiceLoad] = useState(false);

  useEffect(() => {
    if (showInvoiceLoadModal) {
      fetch(`${getApiBaseUrl()}/proveedores`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setProveedoresList(data);
            const ocasional = data.find(p => String(p.id) === '1' || (p.razon_social || '').toUpperCase().includes('OCASIONAL')) || data[0];
            if (ocasional) {
              setInvoiceProveedorId(ocasional.id);
              setProveedorSearchTerm(ocasional.razon_social);
            }
          }
        })
        .catch(() => {});
    }
  }, [showInvoiceLoadModal]);

  const filteredInvoiceSearchProducts = useMemo(() => {
    if (!showInvoiceLoadModal) return [];
    const term = invoiceSearchTerm.trim().toLowerCase();
    if (!term) {
      return products.slice(0, 35);
    }

    const matches: Product[] = [];
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const desc = (p.description || '').toLowerCase();
      const code = (p.barcode || '').toLowerCase();
      const idStr = p.id ? p.id.toString() : '';

      if (code === term || code.startsWith(term) || code.includes(term) || desc.includes(term) || idStr === term) {
        matches.push(p);
        if (matches.length >= 80) break;
      }
    }

    return matches.sort((a, b) => {
      const aCode = (a.barcode || '').toLowerCase();
      const bCode = (b.barcode || '').toLowerCase();
      const aId = a.id ? a.id.toString() : '';
      const bId = b.id ? b.id.toString() : '';

      // 1. Exact match by barcode, key, or ID
      const aExact = aCode === term || aId === term ? 1 : 0;
      const bExact = bCode === term || bId === term ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      // 2. Barcode or key starts with search term
      const aCodeStarts = aCode.startsWith(term) ? 1 : 0;
      const bCodeStarts = bCode.startsWith(term) ? 1 : 0;
      if (aCodeStarts !== bCodeStarts) return bCodeStarts - aCodeStarts;

      // 3. Products with stock first
      const aStock = typeof a.stock_actual === 'number' ? a.stock_actual : (parseFloat(a.stock_actual as any) || 0);
      const bStock = typeof b.stock_actual === 'number' ? b.stock_actual : (parseFloat(b.stock_actual as any) || 0);
      const aHasStock = aStock > 0 ? 1 : 0;
      const bHasStock = bStock > 0 ? 1 : 0;
      if (aHasStock !== bHasStock) return bHasStock - aHasStock;

      // 4. Description starts with search term
      const aDescStarts = (a.description || '').toLowerCase().startsWith(term) ? 1 : 0;
      const bDescStarts = (b.description || '').toLowerCase().startsWith(term) ? 1 : 0;
      if (aDescStarts !== bDescStarts) return bDescStarts - aDescStarts;

      return (a.description || '').localeCompare(b.description || '');
    }).slice(0, 35);
  }, [products, invoiceSearchTerm, showInvoiceLoadModal]);

  // Cargas de Factura Pausadas (En Espera)
  interface PausedInvoice {
    id: string;
    invoiceNumber: string;
    date: string;
    items: {
      product: Product;
      qty: number;
      precio_costo_usd: number;
      precio_detalle_usd: number;
      precio_mayor_usd: number;
    }[];
  }

  const [pausedInvoices, setPausedInvoices] = useState<PausedInvoice[]>(() => {
    const saved = localStorage.getItem('pos_paused_invoices');
    return saved ? JSON.parse(saved) : [];
  });
  const [showPausedInvoicesModal, setShowPausedInvoicesModal] = useState(false);

  useEffect(() => {
    localStorage.setItem('pos_paused_invoices', JSON.stringify(pausedInvoices));
  }, [pausedInvoices]);

  // Estados para Ajuste Masivo de Stock Físico (Solo Administrador)
  const [showBulkStockAdjustModal, setShowBulkStockAdjustModal] = useState(false);
  const [bulkStockScope, setBulkStockScope] = useState<'todos' | 'categoria'>('todos');
  const [bulkStockCategory, setBulkStockCategory] = useState('ALIMENTOS');
  const [bulkStockSearch, setBulkStockSearch] = useState('');
  const [bulkStockReason, setBulkStockReason] = useState('Toma de inventario físico de stock');
  const [bulkStockCounts, setBulkStockCounts] = useState<{ [prodId: number]: string }>({});
  const [showCatalogAuditModal, setShowCatalogAuditModal] = useState(false);
  const [auditFilterTab, setAuditFilterTab] = useState<'todos' | 'sin_precios' | 'sin_categoria' | 'sin_codigo' | 'sin_descripcion' | 'sin_stock_min'>('todos');
  const [auditDefaultCategory, setAuditDefaultCategory] = useState('ALIMENTOS');
  const [auditDefaultStockMin, setAuditDefaultStockMin] = useState('5');
  const [auditDefaultDetailMargin, setAuditDefaultDetailMargin] = useState('30');
  const [auditDefaultMayorMargin, setAuditDefaultMayorMargin] = useState('15');
  const [auditDefaultBultoMargin, setAuditDefaultBultoMargin] = useState('8');
  const [auditDefaultCost, setAuditDefaultCost] = useState('1.00');
  const [auditAuxProduct, setAuditAuxProduct] = useState<Product | null>(null);
  const [editedAuditProducts, setEditedAuditProducts] = useState<{
    [id: number]: {
      barcode?: string;
      description?: string;
      category?: string;
      stock_minimo?: number;
      precio_costo_usd?: number;
      precio_detalle_usd?: number;
      precio_mayor_usd?: number;
      precio_bulto_usd?: number;
      cant_bulto?: number;
      ganancia_bulto?: number;
    }
  }>({});
  const [isSavingAuditCorrections, setIsSavingAuditCorrections] = useState(false);
  const [auditSaveProgress, setAuditSaveProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // Estados para Asistente Inteligente de Reabastecimiento y Compras
  const [showReplenishmentModal, setShowReplenishmentModal] = useState(false);
  const [replenishmentTargetDays, setReplenishmentTargetDays] = useState<number>(30); // 15, 30, 45, 60
  const [replenishmentHistoryDays, setReplenishmentHistoryDays] = useState<number | 'all'>(30); // 30, 60, 90, 'all'
  const [replenishmentUrgencyFilter, setReplenishmentUrgencyFilter] = useState<'all' | 'critico' | 'alto' | 'moderado' | 'optimo' | 'sin_rotacion'>('all');
  const [replenishmentCategoryFilter, setReplenishmentCategoryFilter] = useState<string>('todos');
  const [replenishmentSearchTerm, setReplenishmentSearchTerm] = useState<string>('');
  const [replenishmentCustomQuantities, setReplenishmentCustomQuantities] = useState<{ [prodId: number]: number }>({});
  const [replenishmentCopied, setReplenishmentCopied] = useState(false);

  // Estados para Salida de Inventario (Mermas, Daños, Errores y Reversiones)
  interface SalidaItem {
    producto_id: number;
    codigo: string;
    descripcion: string;
    stock_actual: number;
    cantidad_sacar: number;
    costo_unitario_usd: number;
    motivo_especifico: string;
  }

  interface PausedSalida {
    id: string;
    fecha: string;
    usuario_nombre: string;
    motivo: string;
    origen: 'manual' | 'factura';
    factura_id?: number | null;
    numero_factura?: string;
    observaciones: string;
    items: SalidaItem[];
  }

  const [showSalidaModal, setShowSalidaModal] = useState(false);
  const [showPausedSalidasModal, setShowPausedSalidasModal] = useState(false);
  const [salidasPausadas, setSalidasPausadas] = useState<PausedSalida[]>(() => {
    try {
      const saved = localStorage.getItem('pos_paused_salidas');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [salidaMotivo, setSalidaMotivo] = useState('Merma / Daño / Vencimiento');
  const [salidaModo, setSalidaModo] = useState<'manual' | 'factura'>('manual');
  const [salidaObservaciones, setSalidaObservaciones] = useState('');
  const [salidaSearchTerm, setSalidaSearchTerm] = useState('');
  const [salidaSelectedInvoiceId, setSalidaSelectedInvoiceId] = useState<string>('');
  const [salidaItems, setSalidaItems] = useState<SalidaItem[]>([]);
  const [salidaEditingDraftId, setSalidaEditingDraftId] = useState<string | null>(null);
  const [isProcessingSalida, setIsProcessingSalida] = useState(false);
  const [comprasHistory, setComprasHistory] = useState<any[]>([]);

  const [salidaInvoiceSearch, setSalidaInvoiceSearch] = useState('');
  const [salidaInvoiceDateFilter, setSalidaInvoiceDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const [localMovements, setLocalMovements] = useState<InventoryMovement[]>([]);

  useEffect(() => {
    if (Array.isArray(movements) && movements.length > 0) {
      setLocalMovements(movements);
    }
  }, [movements]);

  const refreshKardexMovements = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/movements`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLocalMovements(data);
        }
      }
    } catch (e) {
      console.error('Error refrescando Kardex:', e);
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (invoiceAuxItemIndex !== null) { setInvoiceAuxItemIndex(null); return; }
        if (showPausedSalidasModal) { setShowPausedSalidasModal(false); return; }
        if (showPausedInvoicesModal) { setShowPausedInvoicesModal(false); return; }
        if (showInvoiceLoadModal) { setShowInvoiceLoadModal(false); return; }
        if (showSalidaModal) { setShowSalidaModal(false); return; }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showSalidaModal, showInvoiceLoadModal, showPausedSalidasModal, showPausedInvoicesModal, invoiceAuxItemIndex]);

  const filteredSalidaSearchProducts = useMemo(() => {
    if (!showSalidaModal || salidaModo !== 'manual') return [];
    const term = salidaSearchTerm.trim().toLowerCase();
    if (!term) return [];

    const matches: Product[] = [];
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const desc = (p.description || '').toLowerCase();
      const code = (p.barcode || '').toLowerCase();
      const idStr = p.id ? p.id.toString() : '';

      if (code === term || code.startsWith(term) || code.includes(term) || desc.includes(term) || idStr === term) {
        matches.push(p);
        if (matches.length >= 80) break;
      }
    }

    return matches.sort((a, b) => {
      const aCode = (a.barcode || '').toLowerCase();
      const bCode = (b.barcode || '').toLowerCase();
      const aId = a.id ? a.id.toString() : '';
      const bId = b.id ? b.id.toString() : '';

      // 1. Exact match by barcode, key, or ID
      const aExact = aCode === term || aId === term ? 1 : 0;
      const bExact = bCode === term || bId === term ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      // 2. Barcode or key starts with search term
      const aCodeStarts = aCode.startsWith(term) ? 1 : 0;
      const bCodeStarts = bCode.startsWith(term) ? 1 : 0;
      if (aCodeStarts !== bCodeStarts) return bCodeStarts - aCodeStarts;

      // 3. Products with stock first
      const aStock = typeof a.stock_actual === 'number' ? a.stock_actual : (parseFloat(a.stock_actual as any) || 0);
      const bStock = typeof b.stock_actual === 'number' ? b.stock_actual : (parseFloat(b.stock_actual as any) || 0);
      const aHasStock = aStock > 0 ? 1 : 0;
      const bHasStock = bStock > 0 ? 1 : 0;
      if (aHasStock !== bHasStock) return bHasStock - aHasStock;

      // 4. Description starts with search term
      const aDescStarts = (a.description || '').toLowerCase().startsWith(term) ? 1 : 0;
      const bDescStarts = (b.description || '').toLowerCase().startsWith(term) ? 1 : 0;
      if (aDescStarts !== bDescStarts) return bDescStarts - aDescStarts;

      return (a.description || '').localeCompare(b.description || '');
    }).slice(0, 25);
  }, [products, salidaSearchTerm, showSalidaModal, salidaModo]);

  useEffect(() => {
    localStorage.setItem('pos_paused_salidas', JSON.stringify(salidasPausadas));
  }, [salidasPausadas]);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/inventario/salidas-pausadas`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setSalidasPausadas(data);
        }
      })
      .catch(() => {});
  }, []);

  const syncPausedSalidas = (newList: PausedSalida[]) => {
    setSalidasPausadas(newList);
    localStorage.setItem('pos_paused_salidas', JSON.stringify(newList));
    fetch(`${getApiBaseUrl()}/inventario/salidas-pausadas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newList)
    }).catch(() => {});
  };

  const loadComprasHistory = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/compras`);
      if (res.ok) {
        const data = await res.json();
        setComprasHistory(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Error cargando compras:', e);
    }
  };

  const combinedInvoices = useMemo(() => {
    return (comprasHistory || [])
      .filter(c => c && c.numero_factura && Array.isArray(c.items) && c.items.length > 0)
      .map(c => ({
        ...c,
        numero_factura: String(c.numero_factura).trim()
      }));
  }, [comprasHistory]);

  const filteredInvoicesForSalida = useMemo(() => {
    let list = combinedInvoices || [];

    const term = salidaInvoiceSearch.trim().toLowerCase();
    if (term) {
      const filtered = list.filter(c =>
        String(c.numero_factura || '').toLowerCase().includes(term) ||
        String(c.proveedor_nombre || '').toLowerCase().includes(term) ||
        String(c.observaciones || '').toLowerCase().includes(term) ||
        (Array.isArray(c.items) && c.items.some((it: any) =>
          String(it.codigo || '').toLowerCase().includes(term) ||
          String(it.descripcion || '').toLowerCase().includes(term) ||
          String(it.product?.barcode || '').toLowerCase().includes(term) ||
          String(it.product?.description || '').toLowerCase().includes(term)
        ))
      );
      return filtered.sort((a, b) => String(b.fecha_emision || '').localeCompare(String(a.fecha_emision || '')));
    }

    const todayStr = getLocalDateStr();
    if (salidaInvoiceDateFilter === 'today') {
      list = list.filter(c => String(c.fecha_emision || '').startsWith(todayStr));
    } else if (salidaInvoiceDateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split('T')[0];
      list = list.filter(c => String(c.fecha_emision || '') >= weekAgoStr);
    } else if (salidaInvoiceDateFilter === 'month') {
      const monthStart = todayStr.slice(0, 7);
      list = list.filter(c => String(c.fecha_emision || '').startsWith(monthStart));
    }

    return list.sort((a, b) => {
      const dateA = String(a.fecha_emision || '');
      const dateB = String(b.fecha_emision || '');
      return dateB.localeCompare(dateA);
    }).slice(0, 30);
  }, [combinedInvoices, salidaInvoiceSearch, salidaInvoiceDateFilter]);

  const openSalidaModal = () => {
    setSalidaMotivo('Merma / Daño / Vencimiento');
    setSalidaModo('manual');
    setSalidaObservaciones('');
    setSalidaSearchTerm('');
    setSalidaSelectedInvoiceId('');
    setSalidaItems([]);
    setSalidaEditingDraftId(null);
    setShowSalidaModal(true);
    loadComprasHistory();
  };

  const handlePauseSalida = () => {
    if (salidaItems.length === 0) {
      showAlert('Advertencia', 'Agregue al menos un producto a la salida antes de pausar.');
      return;
    }
    const draftId = salidaEditingDraftId || `PAUSE-${Date.now()}`;
    const selectedComp = comprasHistory.find(c => String(c.id) === String(salidaSelectedInvoiceId));

    const newDraft: PausedSalida = {
      id: draftId,
      fecha: getLocalDateStr(),
      usuario_nombre: _currentUser?.nombre || 'OPERADOR',
      motivo: salidaMotivo,
      origen: salidaModo,
      factura_id: selectedComp ? selectedComp.id : null,
      numero_factura: selectedComp ? selectedComp.numero_factura : '',
      observaciones: salidaObservaciones,
      items: salidaItems
    };

    const updated = salidasPausadas.filter(s => s.id !== draftId);
    updated.unshift(newDraft);
    syncPausedSalidas(updated);

    setShowSalidaModal(false);
    showAlert('Salida Pausada', 'La salida de inventario ha sido guardada en borrador. Puedes retomarla en cualquier momento desde "Salidas en Espera".');
  };

  const handleProcessSalida = async () => {
    if (salidaItems.length === 0) {
      showAlert('Advertencia', 'No hay productos seleccionados para realizar la salida de inventario.');
      return;
    }

    const invalidQty = salidaItems.some(i => !i.cantidad_sacar || i.cantidad_sacar <= 0);
    if (invalidQty) {
      showAlert('Error en cantidades', 'Todos los productos deben tener una cantidad a sacar mayor a 0.');
      return;
    }

    const selectedComp = (combinedInvoices || []).find(c => String(c.id) === String(salidaSelectedInvoiceId) || String(c.numero_factura || '').toUpperCase() === String(salidaSelectedInvoiceId || '').toUpperCase()) || comprasHistory.find(c => String(c.id) === String(salidaSelectedInvoiceId));
    const isFullInvoiceReversal = salidaModo === 'factura' && selectedComp && salidaItems.length === (selectedComp.items?.length || 0);

    const invoiceNumToUse = selectedComp ? selectedComp.numero_factura : (salidaSelectedInvoiceId ? String(salidaSelectedInvoiceId) : '');
    const confirmMsg = `¿Está seguro de procesar la salida de inventario?\n\n- Total Productos: ${salidaItems.length}\n- Motivo: ${salidaMotivo}\n${invoiceNumToUse ? `- Factura Ref: ${invoiceNumToUse}\n` : ''}`;

    const ok = await showConfirm('Confirmar Salida de Inventario', confirmMsg);
    if (!ok) return;

    setIsProcessingSalida(true);
    try {
      const payload = {
        usuario_id: _currentUser?.id || 1,
        usuario_nombre: _currentUser?.nombre || 'ADMINISTRADOR',
        motivo: salidaMotivo,
        origen: salidaModo,
        factura_id: selectedComp ? selectedComp.id : null,
        numero_factura: invoiceNumToUse,
        observaciones: salidaObservaciones,
        items: salidaItems,
        anular_factura_completa: isFullInvoiceReversal
      };

      const res = await fetch(`${getApiBaseUrl()}/inventario/salida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (salidaEditingDraftId) {
          const updated = salidasPausadas.filter(s => s.id !== salidaEditingDraftId);
          syncPausedSalidas(updated);
        }

        salidaItems.forEach(item => {
          const p = products.find(prod => prod.id === item.producto_id);
          if (p) {
            const qtyNum = item.cantidad_sacar || 0;
            p.stock_actual = Math.max(0, (parseFloat(p.stock_actual as any) || 0) - qtyNum);
          }
        });

        await refreshKardexMovements();
        setShowSalidaModal(false);
        showAlert('Salida Exitosa', `Se procesó la salida de inventario exitosamente (${data.count || salidaItems.length} ítems descontados).`);
      } else {
        showAlert('Error', data.message || data.error || 'No se pudo procesar la salida de inventario.');
      }
    } catch (err: any) {
      showAlert('Error de Conexión', 'No se pudo conectar con el servidor para procesar la salida.');
    } finally {
      setIsProcessingSalida(false);
    }
  };

  const catalogAuditIssues = useMemo(() => {
    return products.map(p => {
      const edit = editedAuditProducts[p.id] || {};
      const cat = edit.category !== undefined ? edit.category : p.category;
      const code = edit.barcode !== undefined ? edit.barcode : p.barcode;
      const desc = edit.description !== undefined ? edit.description : p.description;
      const minStk = edit.stock_minimo !== undefined ? edit.stock_minimo : p.stock_minimo;
      const cost = edit.precio_costo_usd !== undefined ? edit.precio_costo_usd : (parseFloat(p.precio_costo_usd as any) || 0);
      const detail = edit.precio_detalle_usd !== undefined ? edit.precio_detalle_usd : (parseFloat(p.precio_detalle_usd as any) || 0);
      const mayor = edit.precio_mayor_usd !== undefined ? edit.precio_mayor_usd : (parseFloat(p.precio_mayor_usd as any) || 0);
      const bulto = edit.precio_bulto_usd !== undefined ? edit.precio_bulto_usd : (parseFloat(p.precio_bulto_usd as any) || 0);
      const cantBulto = edit.cant_bulto !== undefined ? edit.cant_bulto : (parseInt(p.cant_bulto as any) || 0);

      const missingCategory = !cat || !cat.trim() || cat.trim().toUpperCase() === 'SIN CATEGORIA';
      const missingBarcode = !code || !code.trim();
      const missingDescription = !desc || !desc.trim();
      const missingStockMin = minStk === undefined || minStk === null || minStk <= 0;

      // Price issues: Costo <= 0, Detalle <= Costo, Mayor <= Costo o Mayor >= Detalle, Bulto <= Costo o Bulto >= Mayor
      const zeroCost = cost <= 0;
      const zeroDetail = detail <= 0 || detail <= cost;
      const zeroMayor = mayor <= 0 || mayor <= cost || (detail > 0 && mayor >= detail);
      const invalidBulto = bulto > 0 && (bulto <= cost || (mayor > 0 && bulto >= mayor));
      const zeroOrInvalidPrices = zeroCost || zeroDetail || zeroMayor || invalidBulto;

      const origCost = parseFloat(p.precio_costo_usd as any) || 0;
      const origDetail = parseFloat(p.precio_detalle_usd as any) || 0;
      const origMayor = parseFloat(p.precio_mayor_usd as any) || 0;
      const origBulto = parseFloat(p.precio_bulto_usd as any) || 0;
      const origCat = !p.category || !p.category.trim() || p.category.trim().toUpperCase() === 'SIN CATEGORIA';
      const origCode = !p.barcode || !p.barcode.trim();
      const origDesc = !p.description || !p.description.trim();
      const origMin = !p.stock_minimo || p.stock_minimo <= 0;
      const origPriceIssue = origCost <= 0 || origDetail <= 0 || origMayor <= 0 || origDetail <= origCost || origMayor <= origCost || (origDetail > 0 && origMayor >= origDetail) || (origBulto > 0 && (origBulto <= origCost || (origMayor > 0 && origBulto >= origMayor)));

      const hasOriginalIssue = origCat || origCode || origDesc || origMin || origPriceIssue;
      const isEdited = editedAuditProducts[p.id] !== undefined;

      const hasIssue = hasOriginalIssue || isEdited;

      return {
        product: p,
        currentCategory: cat || '',
        currentBarcode: code || '',
        currentDescription: desc || '',
        currentStockMin: minStk || 0,
        currentCost: cost,
        currentDetail: detail,
        currentMayor: mayor,
        currentBulto: bulto,
        currentCantBulto: cantBulto,
        missingCategory,
        missingBarcode,
        missingDescription,
        missingStockMin,
        zeroCost,
        zeroDetail,
        zeroMayor,
        invalidBulto,
        zeroOrInvalidPrices,
        hasIssue
      };
    }).filter(item => item.hasIssue);
  }, [products, editedAuditProducts]);

  const catalogAuditIssuesCount = catalogAuditIssues.length;

  // Asistente Inteligente de Corrección de Violaciones de Precios
  const [showViolationAssistantModal, setShowViolationAssistantModal] = useState(false);
  const [assistantDetailMargin, setAssistantDetailMargin] = useState('30');
  const [assistantMayorMargin, setAssistantMayorMargin] = useState('15');
  const [assistantAuxProduct, setAssistantAuxProduct] = useState<Product | null>(null);
  const [customPriceOverrides, setCustomPriceOverrides] = useState<{
    [prodId: number]: { cost?: number; detail?: number; mayor?: number }
  }>({});

  const handlePauseInvoiceLoad = () => {
    if (invoiceProducts.length === 0) return;

    const numStr = invoiceNumber.trim() || `Factura #${pausedInvoices.length + 1}`;
    const newPaused: PausedInvoice = {
      id: Date.now().toString(),
      invoiceNumber: numStr,
      date: new Date().toLocaleString(),
      items: invoiceProducts
    };

    setPausedInvoices(prev => [newPaused, ...prev]);
    showToast(`⏸️ Carga de "${numStr}" puesta en espera (${invoiceProducts.length} ítems).`);
    setShowInvoiceLoadModal(false);
    setInvoiceNumber('');
    setInvoiceProducts([]);
  };

  const handleResumeInvoiceLoad = (paused: PausedInvoice) => {
    setInvoiceNumber(paused.invoiceNumber.startsWith('Factura #') ? '' : paused.invoiceNumber);
    setInvoiceProducts(paused.items);
    setPausedInvoices(prev => prev.filter(p => p.id !== paused.id));
    setShowPausedInvoicesModal(false);
    setShowInvoiceLoadModal(true);
    showToast(`▶️ Carga de "${paused.invoiceNumber}" reanudada.`);
  };

  const handleDeletePausedInvoice = async (id: string, num: string) => {
    const ok = await showConfirm(
      `¿Desea eliminar la carga en espera "${num}"? Se perderán los ítems seleccionados.`,
      'Eliminar Carga en Espera',
      { confirmLabel: 'Eliminar', isDanger: true }
    );
    if (ok) {
      setPausedInvoices(prev => prev.filter(p => p.id !== id));
      showToast('Carga en espera eliminada.');
    }
  };

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };
  const [searchTerm, setSearchTerm] = useState<string>(() => {
    return sessionStorage.getItem('pos_inventory_search_term') || '';
  });

  useEffect(() => {
    if (searchTerm) {
      sessionStorage.setItem('pos_inventory_search_term', searchTerm);
    } else {
      sessionStorage.removeItem('pos_inventory_search_term');
    }
  }, [searchTerm]);
  
  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  const [filterStock, setFilterStock] = useState<'todos' | 'con_existencia' | 'sin_existencia' | 'menor_igual' | 'mayor_igual'>('todos');
  const [customStockValue, setCustomStockValue] = useState<string>('5');
  const [filterMinStock, setFilterMinStock] = useState<'todos' | 'bajo_minimo'>('todos');
  const [filterTax, setFilterTax] = useState<'todos' | 'exentos' | 'gravables'>('todos');



  // Sorting states
  interface SortRule {
    field: 'descripcion' | 'categoria' | 'stock_minimo' | 'existencia' | 'precio_costo' | 'precio_detalle' | 'precio_mayor' | 'precio_bulto';
    direction: 'asc' | 'desc';
  }

  const [sortRules, setSortRules] = useState<SortRule[]>([]);

  const handleSort = (field: SortRule['field']) => {
    setSortRules(prev => {
      const idx = prev.findIndex(r => r.field === field);
      if (idx === -1) {
        return [...prev, { field, direction: 'asc' }];
      } else {
        const current = prev[idx];
        if (current.direction === 'asc') {
          const updated = [...prev];
          updated[idx] = { ...current, direction: 'desc' };
          return updated;
        } else {
          return prev.filter(r => r.field !== field);
        }
      }
    });
  };

  const renderSortHeader = (label: string, field: SortRule['field'], align: 'left' | 'right' | 'center' = 'left') => {
    const ruleIdx = sortRules.findIndex(r => r.field === field);
    const isSorted = ruleIdx !== -1;
    const rule = isSorted ? sortRules[ruleIdx] : null;

    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className={`flex items-center gap-1 hover:text-winter-inventarioStart transition-colors font-sans uppercase font-bold focus:outline-none whitespace-nowrap ${
          align === 'right' ? 'justify-end ml-auto' : align === 'center' ? 'justify-center mx-auto' : ''
        }`}
      >
        <span>{label}</span>
        {isSorted ? (
          <div className="flex items-center gap-0.5">
            {rule?.direction === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-winter-inventarioStart" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-winter-inventarioStart" />
            )}
            <span className="text-[9px] bg-sky-100 text-sky-850 rounded-full w-4 h-4 flex items-center justify-center font-sans font-bold leading-none">
              {ruleIdx + 1}
            </span>
          </div>
        ) : (
          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
        )}
      </button>
    );
  };
  
  // Modals / Actions states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showNewProdModal, setShowNewProdModal] = useState(false);
  const [showEditProdModal, setShowEditProdModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddTarget, setQuickAddTarget] = useState<'new' | 'edit'>('new');
  const [showReportMenu, setShowReportMenu] = useState(false);
  const reportMenuRef = useRef<HTMLDivElement>(null);

  const [showGeneralAdjustModal, setShowGeneralAdjustModal] = useState(false);
  const [adjustScope, setAdjustScope] = useState<'todos' | 'categoria' | 'seleccionados'>('todos');
  const [selectedScopeCategory, setSelectedScopeCategory] = useState('ALIMENTOS');
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [generalAdjustType, setGeneralAdjustType] = useState<'aumento' | 'disminucion'>('aumento');
  const [generalAdjustPct, setGeneralAdjustPct] = useState('10');
  const [generalAdjustCost, setGeneralAdjustCost] = useState(true);
  const [generalAdjustDetail, setGeneralAdjustDetail] = useState(true);
  const [generalAdjustMayor, setGeneralAdjustMayor] = useState(true);
  const [generalAdjustReason, setGeneralAdjustReason] = useState('');
  const [generalAdjustSearch, setGeneralAdjustSearch] = useState('');

  // History page filters
  const [historySearch, setHistorySearch] = useState('');
  
  // Sub-navegación y Filtros Kardex
  const [kardexView, setKardexView] = useState<'detallada' | 'resumen'>('detallada');
  const [kardexSearchTerm, setKardexSearchTerm] = useState('');
  const [kardexDateFilter, setKardexDateFilter] = useState('');
  const [kardexTypeFilter, setKardexTypeFilter] = useState('todos');
  const [kardexOperatorFilter, setKardexOperatorFilter] = useState('todos');
  const [selectedGroupedMovements, setSelectedGroupedMovements] = useState<InventoryMovement[] | null>(null);

  const ALL_STATS_MONTHS = [
    { id: 1, name: 'Enero', short: 'Ene' },
    { id: 2, name: 'Febrero', short: 'Feb' },
    { id: 3, name: 'Marzo', short: 'Mar' },
    { id: 4, name: 'Abril', short: 'Abr' },
    { id: 5, name: 'Mayo', short: 'May' },
    { id: 6, name: 'Junio', short: 'Jun' },
    { id: 7, name: 'Julio', short: 'Jul' },
    { id: 8, name: 'Agosto', short: 'Ago' },
    { id: 9, name: 'Septiembre', short: 'Sep' },
    { id: 10, name: 'Octubre', short: 'Oct' },
    { id: 11, name: 'Noviembre', short: 'Nov' },
    { id: 12, name: 'Diciembre', short: 'Dic' },
  ];

  // Filtros de período para el submódulo Estadísticas (Año y Meses seleccionables)
  const currentYear = new Date().getFullYear();
  const [statsYear, setStatsYear] = useState<number | 'todos'>(currentYear);
  const [statsMonths, setStatsMonths] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const [showMonthMenu, setShowMonthMenu] = useState(false);
  const monthMenuRef = useRef<HTMLDivElement>(null);

  // Tasa y Moneda seleccionable para el submódulo Estadísticas ($ BCV, € Euro BCV o Manual editable)
  const [statsRateMode, setStatsRateMode] = useState<'usd' | 'eur' | 'manual'>(() => {
    return (localStorage.getItem('pos_stats_rate_mode') as 'usd' | 'eur' | 'manual') || 'usd';
  });
  const [statsManualRate, setStatsManualRate] = useState<string>(() => {
    return localStorage.getItem('pos_stats_manual_rate') || '';
  });
  const [bcvRatesLive, setBcvRatesLive] = useState<{ usd: number; eur: number }>({ usd: 0, eur: 0 });

  useEffect(() => {
    localStorage.setItem('pos_stats_rate_mode', statsRateMode);
  }, [statsRateMode]);

  useEffect(() => {
    localStorage.setItem('pos_stats_manual_rate', statsManualRate);
  }, [statsManualRate]);

  useEffect(() => {
    const fetchBcvRatesForStats = async () => {
      try {
        const res = await fetch(getApiBaseUrl() + '/api/bcv');
        if (res.ok) {
          const data = await res.json();
          if (data) {
            const usd = typeof data.usd === 'number' ? data.usd : parseFloat(data.usd?.toString().replace(',', '.')) || 0;
            const eur = typeof data.eur === 'number' ? data.eur : parseFloat(data.eur?.toString().replace(',', '.')) || 0;
            setBcvRatesLive({ usd, eur });
          }
        }
      } catch (err) {
        console.warn('No se pudo obtener tasas BCV para estadísticas:', err);
      }
    };
    fetchBcvRatesForStats();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monthMenuRef.current && !monthMenuRef.current.contains(event.target as Node)) {
        setShowMonthMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleStatsMonth = (mId: number) => {
    setStatsMonths(prev => {
      if (prev.includes(mId)) {
        return prev.filter(id => id !== mId);
      } else {
        return [...prev, mId].sort((a, b) => a - b);
      }
    });
  };

  const toggleAllStatsMonths = () => {
    if (statsMonths.length > 0) {
      setStatsMonths([]);
    } else {
      setStatsMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
  };

  const getTodayLocalDateStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [historyStartDate, setHistoryStartDate] = useState(getTodayLocalDateStr);
  const [historyEndDate, setHistoryEndDate] = useState(getTodayLocalDateStr);
  const [historySortField, setHistorySortField] = useState<string>('date');
  const [historySortOrder, setHistorySortOrder] = useState<'asc' | 'desc'>('desc');

  // Hierarchical Escape key listener (closes top-most open modal first)
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      // -2. Assistant Auxiliar de Precios Modal (z-[100])
      if (assistantAuxProduct !== null) {
        setAssistantAuxProduct(null);
        return;
      }

      // -1.8. Bulk Stock Adjust Modal (z-[91])
      if (showBulkStockAdjustModal) {
        setShowBulkStockAdjustModal(false);
        return;
      }

      // -1.6. Replenishment Advisor Modal (z-[93])
      if (showReplenishmentModal) {
        setShowReplenishmentModal(false);
        return;
      }

      // -1.5. Catalog Audit Assistant Modal (z-[92])
      if (showCatalogAuditModal) {
        if (isSavingAuditCorrections) return;
        setShowCatalogAuditModal(false);
        return;
      }

      // -1. Violation Assistant Modal (z-[95])
      if (showViolationAssistantModal) {
        setShowViolationAssistantModal(false);
        return;
      }

      // 0. Paused Invoices Modal (z-[90])
      if (showPausedInvoicesModal) {
        setShowPausedInvoicesModal(false);
        return;
      }

      // 0.5. Image Manager & Bulk AI Modals (z-[88])
      if (showImageManagerModal) {
        setShowImageManagerModal(false);
        return;
      }
      if (showBulkAiModal) {
        if (!isBulkAiRunning) setShowBulkAiModal(false);
        return;
      }

      // 1. Quick Add Category Modal (z-[80])
      if (showQuickAddModal) {
        setShowQuickAddModal(false);
        return;
      }

      // 2. Invoice Item Auxiliar de Precios Modal (z-[85])
      if (invoiceAuxItemIndex !== null) {
        setInvoiceAuxItemIndex(null);
        return;
      }

      // 3. New Product Modal (z-[70])
      if (showNewProdModal) {
        setShowNewProdModal(false);
        return;
      }

      // 4. Grouped Kardex movements detail
      if (selectedGroupedMovements !== null) {
        setSelectedGroupedMovements(null);
        return;
      }

      // 5. Single Kardex movement detail
      if (selectedMovementDetail !== null) {
        setSelectedMovementDetail(null);
        return;
      }

      // 6. Invoice Load Modal (z-[50])
      if (showInvoiceLoadModal) {
        setShowInvoiceLoadModal(false);
        return;
      }

      // 7. General Adjust Modal
      if (showGeneralAdjustModal) {
        setShowGeneralAdjustModal(false);
        setGeneralAdjustSearch('');
        return;
      }

      // 8. Categories Management Modal
      if (showCategoriesModal) {
        setShowCategoriesModal(false);
        return;
      }

      // 9. Bulk Import Modal
      if (showBulkModal) {
        setShowBulkModal(false);
        return;
      }

      // 10. Edit Product Modal
      if (showEditProdModal) {
        setShowEditProdModal(false);
        return;
      }

      // 11. Adjust Stock Modal
      if (showAdjustModal) {
        setShowAdjustModal(false);
        setSelectedProduct(null);
        return;
      }

      // 12. Edit Price Modal
      if (showPriceModal) {
        setShowPriceModal(false);
        setSelectedProduct(null);
        return;
      }

      // 13. Dropdown menus
      if (showCategoryMenu) {
        setShowCategoryMenu(false);
        return;
      }
      if (showReportMenu) {
        setShowReportMenu(false);
        return;
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [
    assistantAuxProduct,
    showBulkStockAdjustModal,
    showReplenishmentModal,
    showCatalogAuditModal,
    showViolationAssistantModal,
    showPausedInvoicesModal,
    showQuickAddModal,
    invoiceAuxItemIndex,
    showNewProdModal,
    selectedGroupedMovements,
    selectedMovementDetail,
    showInvoiceLoadModal,
    showGeneralAdjustModal,
    showCategoriesModal,
    showBulkModal,
    showEditProdModal,
    showImageManagerModal,
    showBulkAiModal,
    isBulkAiRunning,
    showAdjustModal,
    showPriceModal,
    showCategoryMenu,
    showReportMenu,
    isSavingAuditCorrections
  ]);

  const safeProducts = useMemo(() => Array.isArray(products) ? products : [], [products]);
  const safeMovements = useMemo(() => Array.isArray(localMovements) && localMovements.length > 0 ? localMovements : (Array.isArray(movements) ? movements : []), [localMovements, movements]);
  const safePriceHistory = useMemo(() => Array.isArray(priceHistory) ? priceHistory : [], [priceHistory]);

  const effectiveStatsRate = useMemo(() => {
    if (statsRateMode === 'manual') {
      const parsed = parseFloat(statsManualRate.replace(',', '.'));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    } else if (statsRateMode === 'eur') {
      if (bcvRatesLive.eur > 0) return bcvRatesLive.eur;
    } else {
      // 'usd'
      if (bcvRatesLive.usd > 0) return bcvRatesLive.usd;
      if (bcvRateUSD && bcvRateUSD > 0) return bcvRateUSD;
    }

    if (tasaDia && tasaDia > 0) return tasaDia;
    if (companyConfig?.tasa_oficial_bcv && companyConfig.tasa_oficial_bcv > 0) return companyConfig.tasa_oficial_bcv;
    const cachedRate = parseFloat(localStorage.getItem('winterpos_bcv_rate') || '0');
    if (cachedRate > 0) return cachedRate;
    return 1;
  }, [statsRateMode, statsManualRate, bcvRatesLive, bcvRateUSD, tasaDia, companyConfig]);

  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    yearsSet.add(currentYear);
    safeMovements.forEach(m => {
      if (m?.date) {
        const y = new Date(m.date).getFullYear();
        if (!isNaN(y)) yearsSet.add(y);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [safeMovements, currentYear]);

  // Estadísticas Avanzadas de Inventario y Movimientos (Filtrados por Año y Mes)
  const statisticsData = useMemo(() => {
    const totalProdCount = safeProducts.length;
    const unitProdCount = safeProducts.filter(p => !p?.a_granel).length;
    const bulkProdCount = safeProducts.filter(p => p?.a_granel).length;

    const unitStockQty = safeProducts.reduce((acc, p) => acc + (!p?.a_granel ? (parseFloat(p?.stock_actual as any) || 0) : 0), 0);
    const bulkStockQty = safeProducts.reduce((acc, p) => acc + (p?.a_granel ? (parseFloat(p?.stock_actual as any) || 0) : 0), 0);
    const totalStockQty = unitStockQty + bulkStockQty;

    const totalValueDetailUsd = safeProducts.reduce((acc, p) => acc + (p?.precio_detalle_usd || 0) * (parseFloat(p?.stock_actual as any) || 0), 0);
    const totalValueCostUsd = safeProducts.reduce((acc, p) => acc + (p?.precio_costo_usd || 0) * (parseFloat(p?.stock_actual as any) || 0), 0);
    const totalEstimatedProfitUsd = totalValueDetailUsd - totalValueCostUsd;
    const avgMarginPct = totalValueCostUsd > 0 ? (totalEstimatedProfitUsd / totalValueCostUsd) * 100 : 0;

    // Filtrar movimientos por Año y Meses seleccionados
    const filteredMovements = safeMovements.filter(m => {
      if (!m?.date) return true;
      const d = new Date(m.date);
      const y = d.getFullYear();
      const monthNum = d.getMonth() + 1; // 1..12

      if (statsYear !== 'todos' && y !== statsYear) return false;
      if (statsMonths.length === 0) return false;
      if (statsMonths.length < 12 && !statsMonths.includes(monthNum)) return false;
      return true;
    });

    // Top 10 productos más vendidos desde los movimientos del Kardex filtrados
    const salesMap: Record<string, { code: string; description: string; qty: number; totalUsd: number }> = {};
    filteredMovements.forEach(m => {
      if (m?.type === 'Venta' || (typeof m?.qty === 'number' && m.qty < 0 && m.type !== 'Salida' && m.type !== 'Merma')) {
        const key = m.productCode || m.productDescription;
        if (!key) return;
        const soldQty = Math.abs(m.qty);
        const prod = safeProducts.find(p => p.barcode === m.productCode || p.description === m.productDescription);
        const unitPrice = prod ? prod.precio_detalle_usd : 0;

        if (!salesMap[key]) {
          salesMap[key] = {
            code: m.productCode || '',
            description: m.productDescription || key,
            qty: 0,
            totalUsd: 0
          };
        }
        salesMap[key].qty += soldQty;
        salesMap[key].totalUsd += soldQty * unitPrice;
      }
    });

    const topSoldProducts = Object.values(salesMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    const maxSoldQty = topSoldProducts.length > 0 ? Math.max(...topSoldProducts.map(p => p.qty)) : 1;

    // Movimientos por tipo filtrados
    const movementsByTypeMap: Record<string, { type: string; count: number; qtyTotal: number; costUsd: number; priceUsd: number }> = {};
    filteredMovements.forEach(m => {
      const typeKey = m?.type || 'Ajuste';
      if (!movementsByTypeMap[typeKey]) {
        movementsByTypeMap[typeKey] = { type: typeKey, count: 0, qtyTotal: 0, costUsd: 0, priceUsd: 0 };
      }
      const qtyAbs = Math.abs(m?.qty || 0);
      const prod = safeProducts.find(p => p.barcode === m.productCode || p.description === m.productDescription);
      const unitCost = prod ? prod.precio_costo_usd : 0;
      const unitDetail = prod ? prod.precio_detalle_usd : 0;

      movementsByTypeMap[typeKey].count += 1;
      movementsByTypeMap[typeKey].qtyTotal += qtyAbs;
      movementsByTypeMap[typeKey].costUsd += qtyAbs * unitCost;
      movementsByTypeMap[typeKey].priceUsd += qtyAbs * unitDetail;
    });

    const movementsByType = Object.values(movementsByTypeMap).sort((a, b) => b.qtyTotal - a.qtyTotal);
    const maxMovementQty = movementsByType.length > 0 ? Math.max(...movementsByType.map(m => m.qtyTotal)) : 1;

    // Distribución por Categorías
    const categoryMap: Record<string, { category: string; count: number; costUsd: number; detailUsd: number }> = {};
    safeProducts.forEach(p => {
      const cat = p.category || 'SIN CATEGORIA';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { category: cat, count: 0, costUsd: 0, detailUsd: 0 };
      }
      const stk = parseFloat(p.stock_actual as any) || 0;
      categoryMap[cat].count += 1;
      categoryMap[cat].costUsd += p.precio_costo_usd * stk;
      categoryMap[cat].detailUsd += p.precio_detalle_usd * stk;
    });

    const topCategories = Object.values(categoryMap)
      .sort((a, b) => b.detailUsd - a.detailUsd)
      .slice(0, 8);

    return {
      totalProdCount,
      unitProdCount,
      bulkProdCount,
      totalStockQty,
      unitStockQty,
      bulkStockQty,
      totalValueDetailUsd,
      totalValueCostUsd,
      totalEstimatedProfitUsd,
      avgMarginPct,
      topSoldProducts,
      maxSoldQty,
      movementsByType,
      maxMovementQty,
      topCategories
    };
  }, [safeProducts, safeMovements, statsYear, statsMonths]);

  // --- ANÁLISIS INTELIGENTE DE REABASTECIMIENTO Y COMPRAS ---
  const replenishmentAnalysis = useMemo(() => {
    // 1. Filtrar ventas según período histórico seleccionado (30, 60, 90 días o 'all')
    const now = new Date();
    const historyDaysNum = typeof replenishmentHistoryDays === 'number' ? replenishmentHistoryDays : 90;
    const cutoffDate = typeof replenishmentHistoryDays === 'number'
      ? new Date(now.getTime() - replenishmentHistoryDays * 24 * 60 * 60 * 1000)
      : null;

    // Agrupar ventas del Kardex por producto
    const productSalesMap: Record<string, number> = {};
    safeMovements.forEach(m => {
      if (m?.type === 'Venta' || (typeof m?.qty === 'number' && m.qty < 0 && m.type !== 'Salida' && m.type !== 'Merma')) {
        if (cutoffDate && m.date) {
          const mDate = new Date(m.date);
          if (mDate < cutoffDate) return;
        }
        const key = m.productCode || m.productDescription;
        if (!key) return;
        const qtySold = Math.abs(m.qty || 0);
        productSalesMap[key] = (productSalesMap[key] || 0) + qtySold;
      }
    });

    const items = safeProducts.map(p => {
      const soldQty = productSalesMap[p.barcode] || productSalesMap[p.description] || 0;
      const salesVelocityPerDay = soldQty / (historyDaysNum > 0 ? historyDaysNum : 30);
      const estimatedMonthlySales = salesVelocityPerDay * 30;

      const currentStock = parseFloat(p.stock_actual as any) || 0;
      const minStock = parseFloat(p.stock_minimo as any) || 0;
      const cantBulto = parseInt(p.cant_bulto as any) || 1;
      const costUSD = parseFloat(p.precio_costo_usd as any) || 0;
      const detailUSD = parseFloat(p.precio_detalle_usd as any) || 0;

      // Runway / Días de Stock Restante
      let runwayDays = 999;
      if (salesVelocityPerDay > 0) {
        runwayDays = currentStock / salesVelocityPerDay;
      } else if (currentStock === 0) {
        runwayDays = 0;
      }

      // Clasificación de Urgencia
      let urgency: 'critico' | 'alto' | 'moderado' | 'optimo' | 'sin_rotacion' = 'optimo';
      if (salesVelocityPerDay > 0) {
        if (runwayDays <= 7 || currentStock <= minStock) {
          urgency = 'critico';
        } else if (runwayDays <= 15) {
          urgency = 'alto';
        } else if (runwayDays <= 30) {
          urgency = 'moderado';
        } else {
          urgency = 'optimo';
        }
      } else {
        if (currentStock === 0) {
          urgency = 'sin_rotacion';
        } else {
          urgency = 'optimo';
        }
      }

      // Cálculo de Pedido Sugerido (Cobertura en Días)
      let suggestedUnitsRaw = 0;
      if (salesVelocityPerDay > 0) {
        const targetStock = (salesVelocityPerDay * replenishmentTargetDays) + minStock;
        suggestedUnitsRaw = Math.max(0, targetStock - currentStock);
      }

      // Redondeo a Bultos / Cajas si aplica
      let suggestedBultos = 0;
      let suggestedUnits = 0;
      if (suggestedUnitsRaw > 0) {
        if (cantBulto > 1) {
          suggestedBultos = Math.ceil(suggestedUnitsRaw / cantBulto);
          suggestedUnits = suggestedBultos * cantBulto;
        } else {
          suggestedUnits = Math.ceil(suggestedUnitsRaw);
          suggestedBultos = suggestedUnits;
        }
      }

      const customQty = replenishmentCustomQuantities[p.id];
      const finalOrderQty = customQty !== undefined ? customQty : suggestedUnits;
      const finalBultos = cantBulto > 1 ? Math.ceil(finalOrderQty / cantBulto) : finalOrderQty;
      const subtotalCostUSD = finalOrderQty * costUSD;

      return {
        product: p,
        soldQty,
        salesVelocityPerDay,
        estimatedMonthlySales,
        currentStock,
        minStock,
        cantBulto,
        costUSD,
        detailUSD,
        runwayDays,
        urgency,
        suggestedUnitsRaw,
        suggestedBultos,
        suggestedUnits,
        finalOrderQty,
        finalBultos,
        subtotalCostUSD
      };
    });

    // Ordenamiento: Críticos primero (menor runway), luego Altos, Moderados, Óptimos, Sin Rotación
    const urgencyOrder: Record<string, number> = {
      'critico': 1,
      'alto': 2,
      'moderado': 3,
      'optimo': 4,
      'sin_rotacion': 5
    };

    const sortedItems = [...items].sort((a, b) => {
      const orderA = urgencyOrder[a.urgency] || 99;
      const orderB = urgencyOrder[b.urgency] || 99;
      if (orderA !== orderB) return orderA - orderB;
      if (a.urgency === 'critico' || a.urgency === 'alto') {
        return a.runwayDays - b.runwayDays;
      }
      return b.soldQty - a.soldQty;
    });

    const criticosCount = sortedItems.filter(i => i.urgency === 'critico').length;
    const altosCount = sortedItems.filter(i => i.urgency === 'alto').length;
    const moderadosCount = sortedItems.filter(i => i.urgency === 'moderado').length;
    const sinRotacionCount = sortedItems.filter(i => i.urgency === 'sin_rotacion').length;

    // Filtrar según controles interactivos del modal
    const filteredItems = sortedItems.filter(item => {
      // 1. Filtro de Urgencia
      if (replenishmentUrgencyFilter !== 'all' && item.urgency !== replenishmentUrgencyFilter) {
        return false;
      }
      // 2. Filtro de Categoría
      if (replenishmentCategoryFilter !== 'todos' && (item.product.category || 'SIN CATEGORIA') !== replenishmentCategoryFilter) {
        return false;
      }
      // 3. Buscador
      if (replenishmentSearchTerm.trim()) {
        const term = replenishmentSearchTerm.toLowerCase();
        const matchDesc = item.product.description?.toLowerCase().includes(term);
        const matchCode = item.product.barcode?.toLowerCase().includes(term);
        const matchCat = item.product.category?.toLowerCase().includes(term);
        if (!matchDesc && !matchCode && !matchCat) return false;
      }
      return true;
    });

    // Ítems con orden activa (> 0)
    const orderItems = sortedItems.filter(i => i.finalOrderQty > 0);
    const totalOrderCostUSD = orderItems.reduce((acc, i) => acc + i.subtotalCostUSD, 0);
    const totalOrderUnits = orderItems.reduce((acc, i) => acc + i.finalOrderQty, 0);
    const totalOrderBultos = orderItems.reduce((acc, i) => acc + i.finalBultos, 0);

    return {
      allItems: sortedItems,
      filteredItems,
      orderItems,
      criticosCount,
      altosCount,
      moderadosCount,
      sinRotacionCount,
      totalOrderCostUSD,
      totalOrderUnits,
      totalOrderBultos
    };
  }, [safeProducts, safeMovements, replenishmentHistoryDays, replenishmentTargetDays, replenishmentUrgencyFilter, replenishmentCategoryFilter, replenishmentSearchTerm, replenishmentCustomQuantities]);

  // Exportar Orden de Reabastecimiento a PDF Vectorial
  const handleExportReplenishmentPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'letter'
      });

      const companyName = companyConfig?.nombre_comercio || 'WINTER POS';
      const companyRif = companyConfig?.rif ? `RIF: ${companyConfig.rif}` : '';
      const companyPhone = companyConfig?.telefono ? `Tel: ${companyConfig.telefono}` : '';
      const dateStr = new Date().toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

      // Title Banner
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 279.4, 24, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text(companyName.toUpperCase(), 14, 10);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      const subHeader = [companyRif, companyPhone, `Generado: ${dateStr}`].filter(Boolean).join('  |  ');
      doc.text(subHeader, 14, 16);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(251, 191, 36); // amber-400
      doc.text('SUGERENCIA DE PEDIDO Y REABASTECIMIENTO INTELIGENTE', 265, 12, { align: 'right' });

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(255, 255, 255);
      doc.text(`Cobertura: ${replenishmentTargetDays} Días | Tasa Ref: Bs ${(effectiveStatsRate).toFixed(2)}`, 265, 18, { align: 'right' });

      // KPI Summary Box
      const orderItems = replenishmentAnalysis.allItems.filter(i => i.finalOrderQty > 0);
      const totalInvUSD = orderItems.reduce((acc, i) => acc + i.subtotalCostUSD, 0);
      const totalInvBs = totalInvUSD * effectiveStatsRate;
      const totalUnits = orderItems.reduce((acc, i) => acc + i.finalOrderQty, 0);
      const totalBultos = orderItems.reduce((acc, i) => acc + i.finalBultos, 0);

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 28, 251.4, 14, 2, 2, 'FD');

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text(`ITEMS A PEDIR: ${orderItems.length} productos`, 20, 36);
      doc.text(`TOTAL UNIDADES: ${totalUnits.toLocaleString('es-VE')} uds`, 85, 36);
      doc.text(`TOTAL BULTOS/CAJAS: ${totalBultos.toLocaleString('es-VE')}`, 145, 36);
      
      doc.setTextColor(180, 83, 9); // amber-700
      doc.text(`INVERSIÓN TOTAL: $${totalInvUSD.toFixed(2)} USD  (Bs ${totalInvBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, 260, 36, { align: 'right' });

      // Table columns
      const tableData = orderItems.map((item, idx) => {
        const urgencyTag = item.urgency === 'critico' ? 'CRITICO' : item.urgency === 'alto' ? 'ALTO' : item.urgency === 'moderado' ? 'MODERADO' : 'NORMAL';
        const runwayStr = item.runwayDays < 900 ? `${item.runwayDays.toFixed(0)}d` : 'Sin Vta';
        const packStr = item.cantBulto > 1 ? `${item.finalBultos} bts (x${item.cantBulto})` : `${item.finalOrderQty} uds`;
        
        return [
          idx + 1,
          urgencyTag,
          item.product.barcode || '—',
          item.product.description.toUpperCase(),
          item.product.category || 'GENERAL',
          item.currentStock.toLocaleString('es-VE', { maximumFractionDigits: 2 }),
          item.minStock.toLocaleString('es-VE', { maximumFractionDigits: 0 }),
          item.salesVelocityPerDay.toFixed(2),
          runwayStr,
          `${item.finalOrderQty.toLocaleString('es-VE')} uds`,
          packStr,
          `$${item.costUSD.toFixed(2)}`,
          `$${item.subtotalCostUSD.toFixed(2)}`
        ];
      });

      autoTable(doc, {
        head: [[
          '#',
          'PRIORIDAD',
          'CÓDIGO',
          'DESCRIPCIÓN',
          'CATEGORÍA',
          'STOCK ACT',
          'STK MÍN',
          'VTA/DÍA',
          'DÍAS STK',
          'A PEDIR',
          'EMPAQUE',
          'COSTO ($)',
          'TOTAL ($)'
        ]],
        body: tableData,
        startY: 46,
        theme: 'striped',
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'center'
        },
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          valign: 'middle'
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          1: { halign: 'center', cellWidth: 18 },
          2: { halign: 'left', cellWidth: 24 },
          3: { halign: 'left', cellWidth: 55 },
          4: { halign: 'left', cellWidth: 25 },
          5: { halign: 'right', cellWidth: 16 },
          6: { halign: 'right', cellWidth: 14 },
          7: { halign: 'right', cellWidth: 14 },
          8: { halign: 'center', cellWidth: 14 },
          9: { halign: 'right', cellWidth: 16, fontStyle: 'bold' },
          10: { halign: 'center', cellWidth: 20 },
          11: { halign: 'right', cellWidth: 15 },
          12: { halign: 'right', cellWidth: 18, fontStyle: 'bold' }
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        didDrawPage: (data) => {
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(`Página ${data.pageNumber} de ${doc.getNumberOfPages()} - Reporte Confidencial de Compras`, 14, 208);
        }
      });

      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      window.open(blobUrl, '_blank');
      showToast('📄 Orden de Reabastecimiento generada en PDF con éxito.');
    } catch (err: any) {
      console.error('Error generando PDF de reabastecimiento:', err);
      showToast('❌ Error generando PDF de reabastecimiento.');
    }
  };

  // Copiar Orden al Portapapeles para WhatsApp
  const handleCopyReplenishmentWhatsApp = () => {
    try {
      const orderItems = replenishmentAnalysis.allItems.filter(i => i.finalOrderQty > 0);
      if (orderItems.length === 0) {
        showToast('⚠️ No hay productos con cantidades sugeridas para pedir.');
        return;
      }

      const companyName = companyConfig?.nombre_comercio || 'WINTER POS';
      const dateStr = new Date().toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const totalUSD = orderItems.reduce((acc, i) => acc + i.subtotalCostUSD, 0);

      let text = `📦 *ORDEN DE PEDIDO / COTIZACIÓN DE REABASTECIMIENTO*\n`;
      text += `🏢 *Empresa:* ${companyName}\n`;
      text += `📅 *Fecha:* ${dateStr}\n`;
      text += `⏱️ *Cobertura Deseada:* ${replenishmentTargetDays} Días\n`;
      text += `--------------------------------------------------\n\n`;

      orderItems.forEach((item, idx) => {
        const icon = item.urgency === 'critico' ? '🔴' : item.urgency === 'alto' ? '🟠' : '🟡';
        const packStr = item.cantBulto > 1 ? ` (${item.finalBultos} bultos x ${item.cantBulto} uds)` : '';
        text += `${idx + 1}. ${icon} *${item.product.description}*\n`;
        text += `   • Cód: ${item.product.barcode || 'N/A'}\n`;
        text += `   • Cantidad a pedir: *${item.finalOrderQty} uds*${packStr}\n`;
        if (item.costUSD > 0) {
          text += `   • Costo Ref: $${item.costUSD.toFixed(2)} | Subtotal: $${item.subtotalCostUSD.toFixed(2)}\n`;
        }
        text += `\n`;
      });

      text += `--------------------------------------------------\n`;
      text += `📊 *Total Productos:* ${orderItems.length}\n`;
      text += `💰 *Presupuesto Estimado:* $${totalUSD.toFixed(2)} USD\n`;
      if (effectiveStatsRate > 1) {
        text += `🇻🇪 *Ref. Bolívares (Tasa ${effectiveStatsRate.toFixed(2)}):* Bs ${(totalUSD * effectiveStatsRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      }

      navigator.clipboard.writeText(text);
      setReplenishmentCopied(true);
      setTimeout(() => setReplenishmentCopied(false), 3000);
      showToast('📋 ¡Lista de pedido copiada al portapapeles con formato para WhatsApp!');
    } catch (err: any) {
      console.error('Error copiando lista:', err);
      showToast('❌ Error copiando lista al portapapeles.');
    }
  };

  // Exportar Orden a CSV / Excel
  const handleExportReplenishmentCSV = () => {
    try {
      const orderItems = replenishmentAnalysis.allItems.filter(i => i.finalOrderQty > 0);
      if (orderItems.length === 0) {
        showToast('⚠️ No hay productos con cantidades para exportar.');
        return;
      }

      const rows = orderItems.map((item, idx) => ({
        '#': idx + 1,
        'Prioridad': item.urgency.toUpperCase(),
        'Código': item.product.barcode || '',
        'Descripción': item.product.description,
        'Categoría': item.product.category || '',
        'Stock Actual': item.currentStock,
        'Stock Mínimo': item.minStock,
        'Venta Diaria Prom': item.salesVelocityPerDay.toFixed(2),
        'Días Stock Restante': item.runwayDays < 900 ? item.runwayDays.toFixed(1) : 'Sin Ventas',
        'Cantidad Sugerida (Uds)': item.finalOrderQty,
        'Bultos / Empaques': item.cantBulto > 1 ? `${item.finalBultos} bultos (x${item.cantBulto})` : `${item.finalOrderQty} uds`,
        'Costo Unitario ($)': item.costUSD,
        'Subtotal Inversión ($)': item.subtotalCostUSD,
        'Subtotal Ref (Bs)': item.subtotalCostUSD * effectiveStatsRate
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sugerencia_Pedidos');
      XLSX.writeFile(workbook, `Sugerencia_Pedidos_Reabastecimiento_${getLocalDateStr()}.xlsx`);
      showToast('📥 Archivo Excel de Reabastecimiento exportado con éxito.');
    } catch (err: any) {
      console.error('Error exportando Excel:', err);
      showToast('❌ Error exportando archivo Excel.');
    }
  };

  const prevProductsLengthRef = useRef(safeProducts.length);

  useEffect(() => {
    if (showInvoiceLoadModal && safeProducts.length > prevProductsLengthRef.current) {
      const newProduct = safeProducts[safeProducts.length - 1];
      if (newProduct) {
        setInvoiceProducts(prev => {
          const exists = prev.some(item => item.product.id === newProduct.id);
          if (exists) return prev;
          return [...prev, {
            product: newProduct,
            qty: 1,
            precio_costo_usd: newProduct.precio_costo_usd,
            precio_detalle_usd: newProduct.precio_detalle_usd,
            precio_mayor_usd: newProduct.precio_mayor_usd
          }];
        });
      }
    }
    prevProductsLengthRef.current = safeProducts.length;
  }, [safeProducts, showInvoiceLoadModal]);

  const kardexOperatorsList = useMemo(() => {
    const ops = new Set<string>();
    safeMovements.forEach(m => {
      if (m && m.usuario && m.usuario.trim()) {
        ops.add(m.usuario.trim());
      }
    });
    return Array.from(ops).sort();
  }, [safeMovements]);

  const filteredMovements = useMemo(() => {
    let result = [...safeMovements];

    // Ordenar por fecha más reciente primero (DESC)
    result.sort((a, b) => {
      const dateA = new Date(a.date).getTime() || 0;
      const dateB = new Date(b.date).getTime() || 0;
      if (dateA !== dateB) return dateB - dateA;
      return (b.id || 0) - (a.id || 0);
    });

    // Filtro por Buscador (Código, Descripción o Motivo/Justificación)
    if (kardexSearchTerm.trim() !== '') {
      const term = kardexSearchTerm.toLowerCase();
      result = result.filter(m => 
        (m.productCode || '').toLowerCase().includes(term) ||
        (m.productDescription || '').toLowerCase().includes(term) ||
        (m.motivo || '').toLowerCase().includes(term)
      );
    }

    // Filtro por Fecha
    if (kardexDateFilter.trim() !== '') {
      const dateTerm = kardexDateFilter.trim();
      result = result.filter(m => (m.date || '').includes(dateTerm));
    }

    // Filtro por Tipo de Movimiento
    if (kardexTypeFilter !== 'todos') {
      result = result.filter(m => {
        const mType = (m.type || '').toLowerCase();
        const fType = kardexTypeFilter.toLowerCase();
        if (fType === 'devolucion') {
          return mType === 'devolucion' || mType === 'devolución';
        }
        return mType === fType;
      });
    }

    // Filtro por Operador
    if (kardexOperatorFilter !== 'todos') {
      result = result.filter(m => (m.usuario || '').trim() === kardexOperatorFilter.trim());
    }

    return result;
  }, [safeMovements, kardexSearchTerm, kardexDateFilter, kardexTypeFilter, kardexOperatorFilter]);

  const groupedMovements = useMemo(() => {
    const groups: Record<string, {
      key: string;
      date: string;
      motivo: string;
      usuario: string;
      type: string;
      totalItems: number;
      totalQty: number;
      movements: InventoryMovement[];
    }> = {};

    filteredMovements.forEach(m => {
      const dateMin = m.date ? m.date.replace('T', ' ').substring(0, 16) : '';
      const cleanMotivo = (m.motivo || '').trim();
      const groupKey = `${dateMin}_${cleanMotivo}_${m.usuario}_${m.type}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          date: dateMin || m.date,
          motivo: cleanMotivo,
          usuario: m.usuario,
          type: m.type,
          totalItems: 0,
          totalQty: 0,
          movements: []
        };
      }
      groups[groupKey].totalItems += 1;
      groups[groupKey].totalQty += m.qty;
      groups[groupKey].movements.push(m);
    });

    return Object.values(groups);
  }, [filteredMovements]);

  const existingCategories = useMemo(() => {
    const cats = new Set<string>();
    safeProducts.forEach(p => {
      if (p && p.category && p.category.trim() && p.category.trim().toUpperCase() !== 'SIN CATEGORIA') {
        cats.add(p.category.trim().toUpperCase());
      }
    });
    return Array.from(cats);
  }, [safeProducts]);

  // Bulk Upload state
  const [bulkImportTab, setBulkImportTab] = useState<'pdf' | 'csv'>('pdf');
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsing' | 'validating' | 'importing' | 'success'>('idle');

  const handleProcessPdfImport = async (productsToImport: any[]) => {
    try {
      setImportStatus('importing');
      const count = await onAddProductsBulk(productsToImport);
      if (count !== null) {
        showToast(`✨ ¡Se importaron ${count} productos exitosamente desde el reporte PDF!`);
        setShowBulkModal(false);
        setBulkFile(null);
        setBulkPreview([]);
        setBulkErrors([]);
        setImportStatus('idle');
      } else {
        setImportStatus('idle');
      }
    } catch (err) {
      console.error('Error importando desde PDF:', err);
      setImportStatus('idle');
    }
  };

  const downloadTemplate = () => {
    const sampleData = [
      {
        'codigo_barras_clave': '75010001',
        'descripcion': 'Coca Cola 1.5L',
        'categoria': 'BEBIDAS',
        'stock_actual': 100,
        'stock_minimo': 10,
        'precio_costo_usd': 1.20,
        'precio_detalle_usd': 1.80,
        'precio_mayor_usd': 1.50,
        'cantidad_mayorista': 6,
        'precio_bulto_usd': 1.35,
        'cant_bulto': 24,
        'exento_impuesto': 'NO',
        'a_granel': 'NO'
      },
      {
        'codigo_barras_clave': '1000200',
        'descripcion': 'Jamon Ahumado Especial',
        'categoria': 'CHARCUTERIA',
        'stock_actual': 25.5,
        'stock_minimo': 5,
        'precio_costo_usd': 4.50,
        'precio_detalle_usd': 6.80,
        'precio_mayor_usd': 5.90,
        'cantidad_mayorista': 3,
        'precio_bulto_usd': 0,
        'cant_bulto': 0,
        'exento_impuesto': 'NO',
        'a_granel': 'SI'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PlantillaProductos');
    XLSX.writeFile(wb, 'plantilla_carga_masiva_productos.xlsx');
  };

  const exportInventoryToCsv = () => {
    const data = products.map(p => ({
      'codigo_barras_clave': p.barcode,
      'descripcion': p.description,
      'categoria': p.category,
      'stock_actual': p.stock_actual,
      'stock_minimo': p.stock_minimo,
      'precio_costo_usd': p.precio_costo_usd,
      'precio_detalle_usd': p.precio_detalle_usd,
      'precio_mayor_usd': p.precio_mayor_usd,
      'cantidad_mayorista': p.cantidad_mayorista,
      'precio_bulto_usd': p.precio_bulto_usd || 0,
      'cant_bulto': p.cant_bulto || 0,
      'exento_impuesto': p.exento_impuesto ? 'SI' : 'NO',
      'a_granel': p.a_granel ? 'SI' : 'NO'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `respaldo_inventario_${getLocalDateStr()}.xlsx`);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    setBulkErrors([]);
    setImportStatus('parsing');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rows || rows.length < 2) {
          setBulkErrors(['El archivo debe contener al menos la cabecera y una fila de datos.']);
          setImportStatus('idle');
          return;
        }

        const rawHeaders = (rows[0] || []).map((h: any) => String(h).trim());
        const expectedHeaders = [
          'codigo_barras_clave',
          'descripcion',
          'categoria',
          'stock_actual',
          'stock_minimo',
          'precio_costo_usd',
          'precio_detalle_usd',
          'precio_mayor_usd',
          'cantidad_mayorista',
          'precio_bulto_usd',
          'cant_bulto',
          'exento_impuesto',
          'a_granel'
        ];

        const headerIndices: { [key: string]: number } = {};
        expectedHeaders.forEach(expected => {
          const index = rawHeaders.findIndex((h: string) => 
            h.toLowerCase() === expected.toLowerCase() || 
            h.toLowerCase().replace(/[\s_]+/g, '') === expected.toLowerCase().replace(/[\s_]+/g, '')
          );
          headerIndices[expected] = index;
        });

        const missingCritical = ['codigo_barras_clave', 'descripcion', 'precio_costo_usd', 'precio_detalle_usd'].filter(
          h => headerIndices[h] === -1
        );

        if (missingCritical.length > 0) {
          setBulkErrors([`Cabeceras obligatorias faltantes: ${missingCritical.join(', ')}`]);
          setImportStatus('idle');
          return;
        }

        const parsedProducts: any[] = [];
        const errors: string[] = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0 || row.every((val: any) => String(val).trim() === '')) continue;

          const getValue = (headerKey: string, defaultValue: string = '') => {
            const idx = headerIndices[headerKey];
            return idx !== -1 && idx < row.length ? String(row[idx]).trim() : defaultValue;
          };

          const barcode = getValue('codigo_barras_clave');
          const description = getValue('descripcion');
          const category = getValue('categoria', 'ALIMENTOS').toUpperCase();
          
          const cleanFloat = (val: string) => val.replace(/,/g, '.');

          const granelStr = getValue('a_granel', 'NO').toUpperCase();
          const a_granel = granelStr === 'SI' || granelStr === 'YES' || granelStr === 'TRUE' || granelStr === '1';

          const raw_stock_actual = parseFloat(cleanFloat(getValue('stock_actual', '0'))) || 0;
          const raw_stock_minimo = parseFloat(cleanFloat(getValue('stock_minimo', '0'))) || 0;
          const stock_actual = a_granel ? raw_stock_actual : Math.round(raw_stock_actual);
          const stock_minimo = a_granel ? raw_stock_minimo : Math.round(raw_stock_minimo);

          const precio_costo_usd = parseFloat(cleanFloat(getValue('precio_costo_usd'))) || 0;
          const precio_detalle_usd = parseFloat(cleanFloat(getValue('precio_detalle_usd'))) || 0;
          const precio_mayor_usd = parseFloat(cleanFloat(getValue('precio_mayor_usd'))) || 0;
          const cantidad_mayorista = parseInt(cleanFloat(getValue('cantidad_mayorista', '12')), 10) || 12;

          const precio_bulto_usd = parseFloat(cleanFloat(getValue('precio_bulto_usd', '0'))) || 0;
          const cant_bulto = parseInt(cleanFloat(getValue('cant_bulto', '0')), 10) || 0;

          const exentoStr = getValue('exento_impuesto', 'NO').toUpperCase();
          const exento_impuesto = exentoStr === 'SI' || exentoStr === 'YES' || exentoStr === 'TRUE' || exentoStr === '1';

          if (!barcode) {
            errors.push(`Fila ${i + 1}: El código de barras o clave es obligatorio.`);
          }
          if (!description) {
            errors.push(`Fila ${i + 1}: La descripción es obligatoria.`);
          }
          if (precio_costo_usd < 0 || precio_detalle_usd < 0 || precio_mayor_usd < 0 || precio_bulto_usd < 0) {
            errors.push(`Fila ${i + 1}: Los precios no pueden ser negativos.`);
          }

          parsedProducts.push({
            barcode,
            description,
            category,
            stock_actual,
            stock_minimo,
            precio_costo_usd,
            precio_detalle_usd,
            precio_mayor_usd,
            cantidad_mayorista,
            precio_bulto_usd,
            cant_bulto,
            exento_impuesto,
            a_granel,
            estado: 'Activo',
            imagen_url: ''
          });
        }

        setBulkPreview(parsedProducts);
        setBulkErrors(errors);
        setImportStatus(errors.length > 0 ? 'idle' : 'validating');
      } catch (err: any) {
        setBulkErrors([`Error al procesar el archivo Excel/CSV: ${err.message}`]);
        setImportStatus('idle');
      }
    };
    reader.onerror = () => {
      setBulkErrors(['Error al leer el archivo.']);
      setImportStatus('idle');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExecuteBulkImport = async () => {
    if (bulkPreview.length === 0 || bulkErrors.length > 0) return;
    setImportStatus('importing');
    try {
      const count = await onAddProductsBulk(bulkPreview);
      if (count !== null) {
        setImportStatus('success');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setBulkErrors(['Error al procesar la carga masiva en el servidor.']);
        setImportStatus('idle');
      }
    } catch (err: any) {
      setBulkErrors([`Error de red: ${err.message}`]);
      setImportStatus('idle');
    }
  };
  
  // Stock Adjustment form state
  const [adjustType, setAdjustType] = useState<'Entrada' | 'Salida' | 'Merma' | 'Devolucion'>('Entrada');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // Price adjustment form state
  const [inputCost, setInputCost] = useState('');
  const [inputDetail, setInputDetail] = useState('');
  const [inputMayor, setInputMayor] = useState('');
  const [priceReason, setPriceReason] = useState('');

  const handleDeleteProductClick = async () => {
    if (!selectedProduct) return;
    if (selectedProduct.stock_actual > 0) {
      showAlert('No se puede eliminar un producto con existencia mayor a 0. Ajuste el stock a cero primero.', 'Operación No Permitida', 'error');
      return;
    }
    
    const ok = await showConfirm(
      `¿Está seguro de que desea eliminar el producto "${selectedProduct.description}" permanentemente del sistema? Esta acción no se puede deshacer.`,
      'Eliminar Producto',
      { confirmLabel: 'Eliminar', isDanger: true }
    );
    if (ok) {
      const success = await onDeleteProduct(selectedProduct.id);
      if (success) {
        setSelectedProduct(null);
      }
    }
  };

  // Dynamic categories state
  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('pos_categories');
    return saved ? JSON.parse(saved) : ["ALIMENTOS", "BEBIDAS", "FERRETERIA", "HOGAR"];
  });

  useEffect(() => {
    localStorage.setItem('pos_categories', JSON.stringify(categories));
  }, [categories]);

  const allCategories = useMemo(() => {
    const catSet = new Set<string>();
    categories.forEach(c => {
      if (c && c.trim()) catSet.add(c.trim().toUpperCase());
    });
    products.forEach(p => {
      if (p.category && p.category.trim()) {
        catSet.add(p.category.trim().toUpperCase());
      }
    });
    return Array.from(catSet).sort((a, b) => a.localeCompare(b));
  }, [categories, products]);

  // Categories management modal states
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) return;
    const cleanName = newCategoryName.trim().toUpperCase();
    if (allCategories.includes(cleanName)) {
      showAlert('La categoría ya existe.', 'Categoría Duplicada', 'warning');
      return;
    }
    setCategories(prev => [...prev, cleanName]);
    setNewCategoryName('');
    showToast(`Categoría "${cleanName}" creada con éxito.`);
  };

  const handleExecuteQuickAdd = () => {
    if (!quickAddName.trim()) return;
    const cleanName = quickAddName.trim().toUpperCase();
    if (allCategories.includes(cleanName)) {
      showAlert('La categoría ya existe en el sistema.', 'Categoría Duplicada', 'warning');
      return;
    }
    setCategories(prev => [...prev, cleanName]);
    if (quickAddTarget === 'new') {
      setNewCat(cleanName);
    } else {
      setEditCat(cleanName);
    }
    setShowQuickAddModal(false);
    setQuickAddName('');
    showToast(`Categoría "${cleanName}" creada con éxito.`);
  };

  const handleRenameCategory = async (oldName: string) => {
    if (!editingCategoryName.trim()) return;
    const cleanName = editingCategoryName.trim().toUpperCase();
    if (cleanName === oldName) {
      setEditingCategory(null);
      return;
    }
    if (allCategories.includes(cleanName)) {
      showAlert('Ese nombre de categoría ya existe.', 'Categoría Duplicada', 'warning');
      return;
    }
    
    // Rename in the list
    setCategories(prev => prev.map(cat => cat === oldName ? cleanName : cat));
    
    // Rename in all products in the database
    const productsToUpdate = products.filter(p => p.category === oldName);
    for (const p of productsToUpdate) {
      await onUpdateProduct({ ...p, category: cleanName });
    }
    
    setEditingCategory(null);
    setEditingCategoryName('');
    showToast(`Categoría renombrada de "${oldName}" a "${cleanName}" con éxito.`);
  };

  const handleDeleteCategory = async (catName: string) => {
    const hasActive = products.some(p => p.category === catName && p.estado === 'Activo');
    if (hasActive) {
      showAlert('No se puede eliminar la categoría porque existen productos activos asociados a ella.', 'Error al eliminar', 'error');
      return;
    }

    const confirm = await showConfirm(
      `¿Está seguro de eliminar la categoría "${catName}"? Los productos inactivos en ella quedarán sin categoría.`,
      'Eliminar Categoría'
    );
    if (!confirm) return;

    // Set category of inactive products to empty
    const productsToUpdate = products.filter(p => p.category === catName);
    for (const p of productsToUpdate) {
      await onUpdateProduct({ ...p, category: '' });
    }

    setCategories(prev => prev.filter(cat => cat !== catName));
    showToast(`Categoría "${catName}" eliminada con éxito.`);
  };

  const getFilteredAndSortedHistory = () => {
    let list = [...safePriceHistory];

    // 1. Text Search Filter
    if (historySearch.trim() !== '') {
      const term = historySearch.toLowerCase();
      list = list.filter(h => 
        (h.productCode || '').toLowerCase().includes(term) ||
        (h.productDescription || '').toLowerCase().includes(term) ||
        (h.motivo || '').toLowerCase().includes(term) ||
        (h.usuario || '').toLowerCase().includes(term) ||
        ((h as any).priceType || h.type || '').toLowerCase().includes(term)
      );
    }

    // 2. Date Range Filter
    if (historyStartDate) {
      list = list.filter(h => {
        const itemDate = h.date.split(' ')[0];
        return itemDate >= historyStartDate;
      });
    }

    if (historyEndDate) {
      list = list.filter(h => {
        const itemDate = h.date.split(' ')[0];
        return itemDate <= historyEndDate;
      });
    }

    // 3. Sorting
    list.sort((a, b) => {
      let valA: any = a[historySortField as keyof typeof a] ?? (a as any)[historySortField];
      let valB: any = b[historySortField as keyof typeof b] ?? (b as any)[historySortField];

      if (historySortField === 'type') {
        valA = a.type || (a as any).priceType || '';
        valB = b.type || (b as any).priceType || '';
      } else if (historySortField === 'precio_anterior') {
        valA = a.precio_anterior ?? (a as any).oldPrice ?? 0;
        valB = b.precio_anterior ?? (b as any).oldPrice ?? 0;
      } else if (historySortField === 'precio_nuevo') {
        valA = a.precio_nuevo ?? (a as any).newPrice ?? 0;
        valB = b.precio_nuevo ?? (b as any).newPrice ?? 0;
      }

      if (typeof valA === 'string') {
        return historySortOrder === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        const numA = parseFloat(valA || 0);
        const numB = parseFloat(valB || 0);
        return historySortOrder === 'asc' 
          ? numA - numB 
          : numB - numA;
      }
    });

    return list;
  };

  const toggleHistorySort = (field: string) => {
    if (historySortField === field) {
      setHistorySortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setHistorySortField(field);
      setHistorySortOrder('asc');
    }
  };

  const getGeneralAdjustTargetProducts = () => {
    return products.filter(p => {
      if (adjustScope === 'todos') return true;
      if (adjustScope === 'categoria') return p.category === selectedScopeCategory;
      if (adjustScope === 'seleccionados') return selectedProductIds.includes(p.id);
      return false;
    });
  };

  const computePriceChange = (val: number) => {
    const pct = parseFloat(generalAdjustPct) || 0;
    const factor = pct / 100;
    if (generalAdjustType === 'aumento') {
      return parseFloat((val * (1 + factor)).toFixed(4));
    } else {
      return parseFloat((val * (1 - factor)).toFixed(4));
    }
  };

  const handleApplyGeneralAdjustment = async () => {
    if (!generalAdjustReason.trim()) {
      showAlert('Debe especificar una justificación obligatoria.', 'Justificación Requerida', 'warning');
      return;
    }

    const pctVal = parseFloat(generalAdjustPct);
    if (isNaN(pctVal) || pctVal <= 0) {
      showAlert('Por favor ingrese un porcentaje de ajuste válido mayor a cero.', 'Porcentaje Inválido', 'warning');
      return;
    }

    const targetProducts = getGeneralAdjustTargetProducts();
    if (targetProducts.length === 0) {
      showAlert('No hay productos que coincidan con la selección actual.', 'Sin Productos', 'warning');
      return;
    }

    // Compute changes and validate
    const updates: { id: number; cost: number; detail: number; mayor: number }[] = [];
    const historyLogs: any[] = [];
    let violationsCount = 0;

    for (const p of targetProducts) {
      const override = customPriceOverrides[p.id];
      const nextCost = override?.cost !== undefined ? override.cost : (generalAdjustCost ? computePriceChange(p.precio_costo_usd) : p.precio_costo_usd);
      const nextDetail = override?.detail !== undefined ? override.detail : (generalAdjustDetail ? computePriceChange(p.precio_detalle_usd) : p.precio_detalle_usd);
      const nextMayor = override?.mayor !== undefined ? override.mayor : (generalAdjustMayor ? computePriceChange(p.precio_mayor_usd) : p.precio_mayor_usd);

      if (nextDetail <= nextCost || nextMayor <= nextCost) {
        violationsCount++;
      }

      updates.push({
        id: p.id,
        cost: nextCost,
        detail: nextDetail,
        mayor: nextMayor
      });

      const isCustomized = override?.cost !== undefined || override?.detail !== undefined || override?.mayor !== undefined;
      const baseReason = generalAdjustReason.trim();
      const finalReason = isCustomized 
        ? (baseReason ? `${baseReason} (Corrección con Asistente/Auxiliar)` : 'Ajustado con Asistente de Corrección')
        : baseReason;

      if (p.precio_costo_usd !== nextCost) {
        historyLogs.push({
          productCode: p.barcode,
          priceType: 'Costo',
          oldPrice: p.precio_costo_usd,
          newPrice: nextCost,
          motivo: finalReason
        });
      }
      if (p.precio_detalle_usd !== nextDetail) {
        historyLogs.push({
          productCode: p.barcode,
          priceType: 'Detalle',
          oldPrice: p.precio_detalle_usd,
          newPrice: nextDetail,
          motivo: finalReason
        });
      }
      if (p.precio_mayor_usd !== nextMayor) {
        historyLogs.push({
          productCode: p.barcode,
          priceType: 'Mayor',
          oldPrice: p.precio_mayor_usd,
          newPrice: nextMayor,
          motivo: finalReason
        });
      }
    }

    if (violationsCount > 0) {
      showAlert(
        `El ajuste no puede aplicarse. ${violationsCount} productos quedarían con precio de venta menor o igual a su precio de costo. Verifique los porcentajes.`,
        'Violación de Regla de Precios',
        'error'
      );
      return;
    }

    const confirm = await showConfirm(
      `¿Está seguro de aplicar este ajuste del ${generalAdjustPct}% a los ${targetProducts.length} productos seleccionados?`,
      'Confirmar Ajuste General'
    );
    if (!confirm) return;

    const success = await onUpdateProductPricesBulk(updates, historyLogs);
    if (success) {
      setShowGeneralAdjustModal(false);
      setSelectedProductIds([]);
      setCustomPriceOverrides({});
      setGeneralAdjustReason('');
      showToast('Ajuste general de precios aplicado con éxito.');
    } else {
      showAlert('Hubo un error al guardar los cambios masivos.', 'Error de Servidor', 'error');
    }
  };

  // New product form state
  const [newClave, setNewClave] = useState('');
  const [newBarcode, setNewBarcode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCat, setNewCat] = useState('ALIMENTOS');
  const [newCost, setNewCost] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [newMayor, setNewMayor] = useState('');
  const [newBulto, setNewBulto] = useState('');
  const [newMinStock, setNewMinStock] = useState('5');
  const [newWholesaleQty, setNewWholesaleQty] = useState('12');
  const [newCantBulto, setNewCantBulto] = useState('0');
  const [newTaxActive, setNewTaxActive] = useState(true);
  const [newTaxName, setNewTaxName] = useState('IVA');
  const [newTaxPct, setNewTaxPct] = useState('16');
  const [newAGranel, setNewAGranel] = useState(false);
  const [newVencimiento, setNewVencimiento] = useState('');

  // Edit product modal state
  const [editClave, setEditClave] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCat, setEditCat] = useState('ALIMENTOS');
  const [editCost, setEditCost] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editMayor, setEditMayor] = useState('');
  const [editBulto, setEditBulto] = useState('');
  const [editMinStock, setEditMinStock] = useState('5');
  const [editWholesaleQty, setEditWholesaleQty] = useState('12');
  const [editCantBulto, setEditCantBulto] = useState('0');
  const [editTaxActive, setEditTaxActive] = useState(true);
  const [editTaxName, setEditTaxName] = useState('IVA');
  const [editTaxPct, setEditTaxPct] = useState('16');
  const [editAGranel, setEditAGranel] = useState(false);
  const [editVencimiento, setEditVencimiento] = useState('');

  const handleOpenEditProduct = (p: Product) => {
    setSelectedProduct(p);
    setEditClave(p.barcode || '');
    setEditBarcode(p.barcode || '');
    setEditDesc(p.description || '');
    setEditCat(p.category || 'ALIMENTOS');
    setEditCost((p.precio_costo_usd ?? 0).toString());
    setEditDetail((p.precio_detalle_usd ?? 0).toString());
    setEditMayor((p.precio_mayor_usd ?? 0).toString());
    setEditBulto((p.precio_bulto_usd ?? 0).toString());
    setEditMinStock((p.stock_minimo ?? 5).toString());
    setEditWholesaleQty((p.cantidad_mayorista ?? 12).toString());
    setEditCantBulto((p.cant_bulto ?? 0).toString());
    setEditTaxActive(!p.exento_impuesto);
    setEditTaxName('IVA');
    setEditTaxPct((p.porcentaje_impuesto && p.porcentaje_impuesto > 0 ? p.porcentaje_impuesto : 16).toString());
    setEditAGranel(p.a_granel || false);
    setEditVencimiento(p.fecha_vencimiento || '');
    setEditImageUrl(p.imagen_url || '');
    setShowEditProdModal(true);
  };

  const handleUpdateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const finalBarcode = (editBarcode.trim() !== '' ? editBarcode.trim() : editClave.trim()).toUpperCase();
    if (!finalBarcode) {
      showAlert('La clave o código de barras del producto es obligatorio.', 'Campo Requerido', 'warning');
      return;
    }
    if (!editDesc.trim()) {
      showAlert('La descripción del artículo es obligatoria.', 'Campo Requerido', 'warning');
      return;
    }

    const existingDuplicate = products.find(p => p.id !== selectedProduct.id && p.barcode.trim().toUpperCase() === finalBarcode);
    if (existingDuplicate) {
      showAlert(`Ya existe otro producto registrado con la clave o código "${finalBarcode}" (${existingDuplicate.description}). Cada producto debe tener una clave única para evitar conflictos.`, 'Código o Clave Duplicada', 'error');
      return;
    }

    const cost = parseFloat(editCost) || 0;
    const detail = parseFloat(editDetail) || 0;
    const mayor = parseFloat(editMayor) || 0;

    if (detail <= cost) {
      showAlert('El precio de venta al detalle debe ser mayor al precio de costo.', 'Precios Inválidos', 'warning');
      return;
    }
    if (mayor <= cost) {
      showAlert('El precio de venta al mayor debe ser mayor al precio de costo.', 'Precios Inválidos', 'warning');
      return;
    }
    if (mayor >= detail) {
      showAlert('El precio de venta al mayor debe ser estrictamente menor al precio de venta al detalle.', 'Precios Inválidos', 'warning');
      return;
    }

    const finalImg = await ensureCleanImageUrl(editImageUrl, finalBarcode);

    const bulto = parseFloat(editBulto) || 0;
    const cantBulto = parseInt(editCantBulto) || 0;

    const updatedProd: Product = {
      ...selectedProduct,
      barcode: finalBarcode,
      description: editDesc.trim().toUpperCase(),
      category: editCat.trim().toUpperCase(),
      stock_actual: editAGranel ? selectedProduct.stock_actual : Math.round(selectedProduct.stock_actual),
      stock_minimo: editAGranel ? (parseFloat(editMinStock) || 0) : (parseInt(editMinStock) || 0),
      cantidad_mayorista: parseInt(editWholesaleQty) || 12,
      cant_bulto: cantBulto,
      exento_impuesto: !editTaxActive,
      porcentaje_impuesto: editTaxActive ? (parseFloat(editTaxPct) || 0) : 0,
      imagen_url: finalImg,
      a_granel: editAGranel,
      fecha_vencimiento: editVencimiento.trim() !== '' ? editVencimiento.trim() : undefined,
      precio_costo_usd: cost,
      precio_detalle_usd: detail,
      precio_mayor_usd: mayor,
      precio_bulto_usd: bulto
    };

    const success = await onUpdateProduct(updatedProd);
    if (success) {
      clearPausedDraft();
      setShowEditProdModal(false);
      setSelectedProduct(updatedProd);
      showToast('Producto actualizado con éxito.');
    }
  };

  // Persistent Paused Product Draft State & Methods
  const clearPausedDraft = () => {
    try {
      localStorage.removeItem('pos_paused_product_draft');
      window.dispatchEvent(new Event('pos_paused_draft_changed'));
    } catch (_) {}
  };

  const handlePauseRegistration = () => {
    const draft = {
      type: 'new',
      timestamp: new Date().toISOString(),
      data: {
        clave: newClave,
        barcode: newBarcode,
        desc: newDesc,
        cat: newCat,
        cost: newCost,
        detail: newDetail,
        mayor: newMayor,
        bulto: newBulto,
        minStock: newMinStock,
        wholesaleQty: newWholesaleQty,
        cantBulto: newCantBulto,
        taxActive: newTaxActive,
        taxName: newTaxName,
        taxPct: newTaxPct,
        aGranel: newAGranel,
        vencimiento: newVencimiento,
        imageUrl: newImageUrl,
      }
    };
    try {
      localStorage.setItem('pos_paused_product_draft', JSON.stringify(draft));
      window.dispatchEvent(new Event('pos_paused_draft_changed'));
    } catch (_) {}
    setShowNewProdModal(false);
    showToast('⏸️ Registro de producto en pausa. Puede trabajar con normalidad y retomarlo cuando decida.');
  };

  const handlePauseEdit = () => {
    const draft = {
      type: 'edit',
      timestamp: new Date().toISOString(),
      data: {
        clave: editClave,
        barcode: editBarcode,
        desc: editDesc,
        cat: editCat,
        cost: editCost,
        detail: editDetail,
        mayor: editMayor,
        bulto: editBulto,
        minStock: editMinStock,
        wholesaleQty: editWholesaleQty,
        cantBulto: editCantBulto,
        taxActive: editTaxActive,
        taxName: editTaxName,
        taxPct: editTaxPct,
        aGranel: editAGranel,
        vencimiento: editVencimiento,
        imageUrl: editImageUrl,
        selectedProduct: selectedProduct
      }
    };
    try {
      localStorage.setItem('pos_paused_product_draft', JSON.stringify(draft));
      window.dispatchEvent(new Event('pos_paused_draft_changed'));
    } catch (_) {}
    setShowEditProdModal(false);
    showToast('⏸️ Edición de producto en pausa. Puede trabajar con normalidad y retomarlo cuando decida.');
  };

  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem('pos_paused_product_draft');
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (draft.type === 'new' && draft.data) {
        setNewClave(draft.data.clave || '');
        setNewBarcode(draft.data.barcode || draft.data.clave || '');
        setNewDesc(draft.data.desc || '');
        setNewCat(draft.data.cat || 'ALIMENTOS');
        setNewCost(draft.data.cost || '');
        setNewDetail(draft.data.detail || '');
        setNewMayor(draft.data.mayor || '');
        setNewBulto(draft.data.bulto || '');
        setNewMinStock(draft.data.minStock || '5');
        setNewWholesaleQty(draft.data.wholesaleQty || '12');
        setNewCantBulto(draft.data.cantBulto || '0');
        setNewTaxActive(draft.data.taxActive ?? true);
        setNewTaxName(draft.data.taxName || 'IVA');
        setNewTaxPct(draft.data.taxPct || '16');
        setNewAGranel(draft.data.aGranel || false);
        setNewVencimiento(draft.data.vencimiento || '');
        setNewImageUrl(draft.data.imageUrl || '');
        setShowNewProdModal(true);
      } else if (draft.type === 'edit' && draft.data) {
        setSelectedProduct(draft.data.selectedProduct || null);
        setEditClave(draft.data.clave || '');
        setEditBarcode(draft.data.barcode || draft.data.clave || '');
        setEditDesc(draft.data.desc || '');
        setEditCat(draft.data.cat || 'ALIMENTOS');
        setEditCost(draft.data.cost || '');
        setEditDetail(draft.data.detail || '');
        setEditMayor(draft.data.mayor || '');
        setEditBulto(draft.data.bulto || '');
        setEditMinStock(draft.data.minStock || '5');
        setEditWholesaleQty(draft.data.wholesaleQty || '12');
        setEditCantBulto(draft.data.cantBulto || '0');
        setEditTaxActive(draft.data.taxActive ?? true);
        setEditTaxName(draft.data.taxName || 'IVA');
        setEditTaxPct(draft.data.taxPct || '16');
        setEditAGranel(draft.data.aGranel || false);
        setEditVencimiento(draft.data.vencimiento || '');
        setEditImageUrl(draft.data.imageUrl || '');
        setShowEditProdModal(true);
      }
    } catch (e) {
      console.error('Error restaurando borrador pausado:', e);
    }
  };

  // Listen to resume event ONLY when user clicks Reanudar
  useEffect(() => {
    const handleGlobalResume = () => {
      restoreDraft();
    };

    window.addEventListener('pos_resume_product_draft', handleGlobalResume);
    return () => {
      window.removeEventListener('pos_resume_product_draft', handleGlobalResume);
    };
  }, []);

  // Modal position state
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Reset positions when modal toggles
  useEffect(() => {
    if (!showNewProdModal) {
      setDragPos({ x: 0, y: 0 });
    }
  }, [showNewProdModal]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'BUTTON' || target.closest('button') || target.closest('input') || target.closest('select')) return;

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - dragPos.x,
      y: e.clientY - dragPos.y
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragPos({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Reset page when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategories, filterStock, customStockValue, filterMinStock, filterTax]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const customVal = parseFloat(customStockValue) || 0;

    return safeProducts.filter(p => {
      if (!p) return false;
      const desc = (p.description || '').toLowerCase();
      const code = (p.barcode || '').toLowerCase();
      const matchesSearch = !term || desc.includes(term) || code.includes(term);
        
      const matchesCategory = selectedCategories.length === 0 ||
        selectedCategories.includes((p.category || '').trim().toUpperCase());
      
      const stockAct = typeof p.stock_actual === 'number' ? p.stock_actual : (parseFloat(p.stock_actual as any) || 0);
      const stockMin = typeof p.stock_minimo === 'number' ? p.stock_minimo : (parseFloat(p.stock_minimo as any) || 0);

      const matchesStock = 
        filterStock === 'todos' ? true :
        filterStock === 'con_existencia' ? stockAct > 0 :
        filterStock === 'sin_existencia' ? stockAct === 0 :
        filterStock === 'menor_igual' ? stockAct <= customVal :
        filterStock === 'mayor_igual' ? stockAct >= customVal : true;
        
      const matchesMinStock = 
        filterMinStock === 'todos' ? true :
        filterMinStock === 'bajo_minimo' ? stockAct <= stockMin : true;

      const isExempt = p.exento_impuesto === true || p.porcentaje_impuesto === 0;
      const matchesTax = 
        filterTax === 'todos' ? true :
        filterTax === 'exentos' ? isExempt :
        filterTax === 'gravables' ? !isExempt : true;
        
      return matchesSearch && matchesCategory && matchesStock && matchesMinStock && matchesTax;
    });
  }, [safeProducts, searchTerm, selectedCategories, filterStock, customStockValue, filterMinStock, filterTax]);

  const sortedProducts = useMemo(() => {
    if (sortRules.length === 0) return filteredProducts;

    return [...filteredProducts].sort((a, b) => {
      for (const rule of sortRules) {
        let aVal: any = '';
        let bVal: any = '';

        switch (rule.field) {
          case 'descripcion':
            aVal = (a.description || '').toLowerCase();
            bVal = (b.description || '').toLowerCase();
            break;
          case 'categoria':
            aVal = (a.category || '').toLowerCase();
            bVal = (b.category || '').toLowerCase();
            break;
          case 'stock_minimo':
            aVal = a.stock_minimo;
            bVal = b.stock_minimo;
            break;
          case 'existencia':
            aVal = a.stock_actual;
            bVal = b.stock_actual;
            break;
          case 'precio_costo':
            aVal = a.precio_costo_usd;
            bVal = b.precio_costo_usd;
            break;
          case 'precio_detalle':
            aVal = a.precio_detalle_usd;
            bVal = b.precio_detalle_usd;
            break;
          case 'precio_mayor':
            aVal = a.precio_mayor_usd;
            bVal = b.precio_mayor_usd;
            break;
          case 'precio_bulto':
            aVal = a.precio_bulto_usd || 0;
            bVal = b.precio_bulto_usd || 0;
            break;
          default:
            break;
        }

        if (aVal !== bVal) {
          if (typeof aVal === 'string' && typeof bVal === 'string') {
            return rule.direction === 'asc' 
              ? aVal.localeCompare(bVal)
              : bVal.localeCompare(aVal);
          } else {
            return rule.direction === 'asc'
              ? (aVal > bVal ? 1 : -1)
              : (aVal < bVal ? 1 : -1);
          }
        }
      }
      return 0;
    });
  }, [filteredProducts, sortRules]);

  const totalPages = Math.ceil(sortedProducts.length / pageSize) || 1;

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedProducts.slice(start, start + pageSize);
  }, [sortedProducts, currentPage, pageSize]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept arrow keys if user is typing inside an input, textarea, or select
      const targetTag = (e.target as HTMLElement)?.tagName?.toUpperCase();
      const isInput = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      if (isInput) return;

      // Don't intercept arrow keys if any modal is open
      if (
        showNewProdModal || showEditProdModal || showBulkAiModal || showBulkStockAdjustModal ||
        showInvoiceLoadModal || showCatalogAuditModal || showCategoriesModal || showGeneralAdjustModal ||
        showQuickAddModal || showViolationAssistantModal || showImageManagerModal || showPausedInvoicesModal ||
        contextMenu !== null
      ) {
        return;
      }

      // Keyboard arrow navigation (ArrowDown / ArrowUp) for inventory catalog table
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (activeSubTab !== 'catalogo' || paginatedProducts.length === 0) return;

        e.preventDefault();

        const currentIndex = paginatedProducts.findIndex(p => p.id === selectedProduct?.id);
        let nextIndex = 0;

        if (e.key === 'ArrowDown') {
          if (currentIndex === -1) {
            nextIndex = 0;
          } else {
            nextIndex = Math.min(paginatedProducts.length - 1, currentIndex + 1);
          }
        } else if (e.key === 'ArrowUp') {
          if (currentIndex === -1) {
            nextIndex = paginatedProducts.length - 1;
          } else {
            nextIndex = Math.max(0, currentIndex - 1);
          }
        }

        const nextProduct = paginatedProducts[nextIndex];
        if (nextProduct) {
          setSelectedProduct(nextProduct);
          const rowEl = document.getElementById(`inv-prod-row-${nextProduct.id}`);
          if (rowEl) {
            rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    activeSubTab, paginatedProducts, selectedProduct,
    showNewProdModal, showEditProdModal, showBulkAiModal, showBulkStockAdjustModal,
    showInvoiceLoadModal, showCatalogAuditModal, showCategoriesModal, showGeneralAdjustModal,
    showQuickAddModal, showViolationAssistantModal, showImageManagerModal, showPausedInvoicesModal,
    contextMenu
  ]);

  const handleOpenAdjust = (prod: Product) => {
    setSelectedProduct(prod);
    setAdjustType('Entrada');
    setAdjustQty('');
    setAdjustReason('');
    setShowAdjustModal(true);
  };

  const handleOpenPrices = (prod: Product) => {
    setSelectedProduct(prod);
    setInputCost(prod.precio_costo_usd.toString());
    setInputDetail(prod.precio_detalle_usd.toString());
    setInputMayor(prod.precio_mayor_usd.toString());
    setPriceReason('');
    setShowPriceModal(true);
  };

  const handleSaveStockAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    
    const qty = selectedProduct.a_granel ? parseFloat(adjustQty) : parseInt(adjustQty);
    if (isNaN(qty) || qty <= 0) {
      showAlert('Por favor ingrese una cantidad válida mayor a cero.', 'Cantidad Inválida', 'warning');
      return;
    }

    if (!selectedProduct.a_granel && !Number.isInteger(parseFloat(adjustQty))) {
      showAlert('Este producto se vende por unidad. La cantidad debe ser un número entero.', 'Cantidad Inválida', 'warning');
      return;
    }

    if (!adjustReason.trim()) {
      showAlert('Debe especificar un motivo/justificación de manera obligatoria.', 'Justificación Requerida', 'warning');
      return;
    }

    onUpdateProductStock(selectedProduct.id, adjustType, qty, adjustReason.trim());
    setShowAdjustModal(false);
    setSelectedProduct(null);
  };

  const handleSavePriceAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const cost = parseFloat(inputCost);
    const detail = parseFloat(inputDetail);
    const mayor = parseFloat(inputMayor);

    if (isNaN(cost) || cost < 0 || isNaN(detail) || detail < 0 || isNaN(mayor) || mayor < 0) {
      showAlert('Los precios ingresados deben ser valores numéricos no negativos.', 'Precios Inválidos', 'warning');
      return;
    }

    if (detail <= cost) {
      showAlert('El precio de venta al detalle debe ser mayor al precio de costo.', 'Precios Inválidos', 'warning');
      return;
    }
    if (mayor <= cost) {
      showAlert('El precio de venta al mayor debe ser mayor al precio de costo.', 'Precios Inválidos', 'warning');
      return;
    }

    if (!priceReason.trim()) {
      showAlert('Debe especificar una justificación obligatoria para la actualización de precios.', 'Justificación Requerida', 'warning');
      return;
    }

    onUpdateProductPrices(selectedProduct.id, { cost, detail, mayor }, priceReason.trim());
    setShowPriceModal(false);
    setSelectedProduct(null);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClave.trim() || !newDesc.trim()) {
      showAlert('Clave del producto y descripción son obligatorios.', 'Campos Requeridos', 'warning');
      return;
    }

    // Generate barcode if not provided
    const barcodeVal = newBarcode.trim() !== '' ? newBarcode.trim() : newClave.trim();

    const existingDuplicate = products.find(p => p.barcode.trim().toUpperCase() === barcodeVal.trim().toUpperCase());
    if (existingDuplicate) {
      showAlert(`Ya existe un producto registrado con la clave o código "${barcodeVal.toUpperCase()}" (${existingDuplicate.description}). Cada producto debe tener una clave única para evitar conflictos.`, 'Código o Clave Duplicada', 'error');
      return;
    }

    const cost = parseFloat(newCost) || 0;
    const detail = parseFloat(newDetail) || 0;
    const mayor = parseFloat(newMayor) || 0;

    if (detail <= cost) {
      showAlert('El precio de venta al detalle debe ser mayor al precio de costo.', 'Precios Inválidos', 'warning');
      return;
    }
    if (mayor <= cost) {
      showAlert('El precio de venta al mayor debe ser mayor al precio de costo.', 'Precios Inválidos', 'warning');
      return;
    }
    if (mayor >= detail) {
      showAlert('El precio de venta al mayor debe ser estrictamente menor al precio de venta al detalle.', 'Precios Inválidos', 'warning');
      return;
    }

    const min = newAGranel ? (parseFloat(newMinStock) || 0) : (parseInt(newMinStock) || 0);
    const wholesale = parseInt(newWholesaleQty) || 12;
    const bulto = parseFloat(newBulto) || 0;
    const cantBulto = parseInt(newCantBulto) || 0;

    const finalImg = await ensureCleanImageUrl(newImageUrl, barcodeVal);

    const newProd: Product = {
      id: Date.now(),
      barcode: barcodeVal.toUpperCase(),
      description: newDesc.trim().toUpperCase(),
      category: newCat.trim().toUpperCase(),
      stock_actual: 0, 
      stock_minimo: min,
      precio_costo_usd: cost,
      precio_detalle_usd: detail,
      precio_mayor_usd: mayor,
      precio_bulto_usd: bulto,
      cantidad_mayorista: wholesale,
      cant_bulto: cantBulto,
      exento_impuesto: !newTaxActive,
      porcentaje_impuesto: newTaxActive ? (parseFloat(newTaxPct) || 0) : 0,
      imagen_url: finalImg || '',
      estado: 'Activo',
      a_granel: newAGranel,
      fecha_vencimiento: newVencimiento.trim() !== '' ? newVencimiento.trim() : undefined
    };

    onAddProduct(newProd);
    clearPausedDraft();
    setShowNewProdModal(false);
    
    // Clear form
    setNewClave('');
    setNewBarcode('');
    setNewDesc('');
    setNewCost('');
    setNewDetail('');
    setNewMayor('');
    setNewTaxActive(true);
    setNewTaxName('IVA');
    setNewTaxPct('16');
    setNewAGranel(false);
    setNewVencimiento('');
    setNewImageUrl('');
  };



  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setShowCategoryMenu(false);
      }
      if (reportMenuRef.current && !reportMenuRef.current.contains(e.target as Node)) {
        setShowReportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [capturingReportMode, setCapturingReportMode] = useState<'general' | 'faltantes' | null>(null);

  const captureInventarioReportPNG = async (isOnlyFaltantes = false) => {
    let imageBase64 = '';
    try {
      showToast('📸 Generando documento del reporte en formato gráfico para adjuntar...');
      setCapturingReportMode(isOnlyFaltantes ? 'faltantes' : 'general');
      await new Promise(resolve => setTimeout(resolve, 400));

      const htmlToImage = await import('html-to-image');
      const element = document.getElementById('inventario-report-capture-card');

      if (element) {
        imageBase64 = await htmlToImage.toPng(element, { backgroundColor: '#ffffff', quality: 0.95 });
      }
    } catch (err) {
      console.warn('Error capturando PNG del reporte de inventario:', err);
    } finally {
      setCapturingReportMode(null);
    }
    return imageBase64;
  };

  const handlePrintReport = () => {
    if (sortedProducts.length === 0) {
      showAlert('No hay productos en el listado para generar el reporte.', 'Sin Datos', 'warning');
      return;
    }

    try {
      const totalFilteredProducts = sortedProducts.length;
      const totalFilteredQty = sortedProducts.reduce((acc, p) => acc + (parseFloat(p.stock_actual as any) || 0), 0);
      const totalFilteredValueVenta = sortedProducts.reduce((acc, p) => acc + p.precio_detalle_usd * (parseFloat(p.stock_actual as any) || 0), 0);
      const totalFilteredValueCosto = sortedProducts.reduce((acc, p) => acc + p.precio_costo_usd * (parseFloat(p.stock_actual as any) || 0), 0);

      const companyName = companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.';
      const companyRif = companyConfig?.rif || 'J-41132631';
      const companyTel = companyConfig?.telefono || '0424-2042877';
      const now = new Date().toLocaleString('es-VE');

      const categoryFilterLabel = selectedCategories.length === 0 ? 'TODAS' : selectedCategories.join(', ');
      const stockFilterLabel = 
        (filterStock as string) === 'todos' ? 'TODOS' :
        (filterStock as string) === 'con_existencia' ? 'CON EXISTENCIA (>0)' :
        (filterStock as string) === 'sin_existencia' ? 'SIN EXISTENCIA (0)' :
        (filterStock as string) === 'menor_5' ? 'EXISTENCIA ≤ 5' :
        (filterStock as string) === 'menor_10' ? 'EXISTENCIA ≤ 10' :
        (filterStock as string) === 'menor_15' ? 'EXISTENCIA ≤ 15' : 'TODOS';
      const minStockFilterLabel = 
        filterMinStock === 'todos' ? 'TODOS' : 'BAJO STOCK MÍNIMO';
      const taxFilterLabel = 
        filterTax === 'todos' ? 'TODOS' :
        filterTax === 'exentos' ? 'SOLO EXENTOS (E)' : 'SOLO GRAVABLES (G)';

      // 1. Crear documento PDF en orientación Horizontal (Landscape) para máxima legibilidad de todas las columnas
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'letter'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 28;

      // Header Empresa
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(companyName.toUpperCase(), margin, 32);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(`RIF: ${companyRif}  |  Tel: ${companyTel}  |  Reporte General de Inventario y Auditoría`, margin, 46);

      // Estación y Fecha (lado derecho)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      const terminalStr = `Estación: ${localStorage.getItem('pos_terminal_name') || 'CAJA_01'}`;
      doc.text(terminalStr, pageWidth - margin - doc.getTextWidth(terminalStr), 32);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      const dateStr = `Generado: ${now}`;
      doc.text(dateStr, pageWidth - margin - doc.getTextWidth(dateStr), 46);

      // Línea divisoria decorativa
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(1);
      doc.line(margin, 54, pageWidth - margin, 54);

      // Filtros Aplicados
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`FILTROS: Categoría: [${categoryFilterLabel}]  |  Stock: [${stockFilterLabel}]  |  Alerta: [${minStockFilterLabel}]  |  IVA: [${taxFilterLabel}]`, margin, 66);

      // Resumen KPI (Cuadro informativo superior)
      const kpiY = 74;
      const kpiHeight = 32;
      const kpiBoxWidth = (pageWidth - (margin * 2) - (3 * 8)) / 4;

      const kpis = [
        { label: 'PRODUCTOS LISTADOS', value: `${totalFilteredProducts} artículos`, color: [15, 23, 42] },
        { label: 'TOTAL UNIDADES', value: totalFilteredQty.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 3 }), color: [15, 23, 42] },
        { label: 'VALOR INV. (DETALLE)', value: `$${totalFilteredValueVenta.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: [5, 150, 105] },
        { label: 'VALOR INV. (COSTO)', value: `$${totalFilteredValueCosto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: [30, 41, 59] },
      ];

      kpis.forEach((kpi, idx) => {
        const x = margin + idx * (kpiBoxWidth + 8);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, kpiY, kpiBoxWidth, kpiHeight, 3, 3, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.label, x + 6, kpiY + 11);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
        doc.text(kpi.value, x + 6, kpiY + 25);
      });

      // Tabla de Datos (AutoTable)
      const tableHeaders = [
        ['CÓDIGO', 'DESCRIPCIÓN', 'CATEGORÍA', 'MÍNIMO', 'EXIST.', 'P. COSTO', 'P. DETALLE', 'P. MAYOR', 'P. BULTO']
      ];

      const tableBody = sortedProducts.map(p => [
        p.barcode || '—',
        `${p.description} ${p.exento_impuesto === true ? '(E)' : '(G)'}`,
        p.category || '—',
        formatStockVal(p.stock_minimo, p.a_granel),
        formatStockVal(p.stock_actual, p.a_granel),
        `$${p.precio_costo_usd.toFixed(2)}`,
        `$${p.precio_detalle_usd.toFixed(2)}`,
        `$${p.precio_mayor_usd.toFixed(2)}${p.cantidad_mayorista ? ` (x${p.cantidad_mayorista})` : ''}`,
        p.precio_bulto_usd && p.precio_bulto_usd > 0 ? `$${p.precio_bulto_usd.toFixed(2)}${p.cant_bulto && p.cant_bulto > 0 ? ` (x${p.cant_bulto})` : ''}` : '—'
      ]);

      autoTable(doc, {
        head: tableHeaders,
        body: tableBody,
        startY: kpiY + kpiHeight + 10,
        margin: { left: margin, right: margin, bottom: 26 },
        theme: 'striped',
        styles: {
          fontSize: 7.5,
          cellPadding: 3,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.5
        },
        headStyles: {
          fillColor: [15, 23, 42], // slate-900
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'left'
        },
        columnStyles: {
          0: { cellWidth: 70, fontStyle: 'bold' }, // Código
          1: { cellWidth: 'auto', fontStyle: 'bold' }, // Descripción
          2: { cellWidth: 95 }, // Categoría
          3: { cellWidth: 42, halign: 'right' }, // Mínimo
          4: { cellWidth: 46, halign: 'right', fontStyle: 'bold' }, // Existencia
          5: { cellWidth: 50, halign: 'right' }, // Costo
          6: { cellWidth: 55, halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] }, // Detalle
          7: { cellWidth: 65, halign: 'right' }, // Mayor
          8: { cellWidth: 65, halign: 'right', fontStyle: 'bold', textColor: [180, 83, 9] } // Bulto
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        didParseCell: (data) => {
          // Destacar en rojo si existencia es menor o igual al mínimo
          if (data.section === 'body' && data.column.index === 4) {
            const rowProd = sortedProducts[data.row.index];
            if (rowProd && (parseFloat(rowProd.stock_actual as any) || 0) <= (parseFloat(rowProd.stock_minimo as any) || 0)) {
              data.cell.styles.textColor = [220, 38, 38]; // red-600
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        didDrawPage: (data) => {
          const str = `Página ${data.pageNumber} de ${doc.getNumberOfPages()}  |  WinterPOS AL System - Reporte Oficial de Inventario`;
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(148, 163, 184);
          doc.text(str, margin, doc.internal.pageSize.getHeight() - 10);
        }
      });

      // 2. Generar Blob y abrir directamente en el visor de PDF nativo del navegador
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');
      showToast('📄 Reporte PDF generado y abierto exitosamente.');
    } catch (err: any) {
      console.error('Error generando PDF:', err);
      showAlert(`Error al generar el PDF del reporte: ${err?.message || err}`, 'Error PDF', 'error');
    }
  };

  const handleExportExcel = () => {
    if (sortedProducts.length === 0) {
      showAlert('No hay productos en el listado para exportar.', 'Sin Datos', 'warning');
      return;
    }

    const headers = [
      'CÓDIGO DE BARRAS',
      'DESCRIPCIÓN',
      'CATEGORÍA',
      'STOCK MÍNIMO',
      'EXISTENCIA ACTUAL',
      'PRECIO COSTO USD',
      'PRECIO DETALLE USD',
      'PRECIO MAYOR USD',
      'CANTIDAD MAYORISTA',
      'PRECIO BULTO USD',
      'CANTIDAD POR BULTO',
      'ESTADO'
    ];

    const escapeCsv = (val: any) => {
      const str = val === null || val === undefined ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = sortedProducts.map(p => [
      escapeCsv(p.barcode),
      escapeCsv(p.description),
      escapeCsv(p.category),
      escapeCsv(p.stock_minimo),
      escapeCsv(p.stock_actual),
      escapeCsv(p.precio_costo_usd),
      escapeCsv(p.precio_detalle_usd),
      escapeCsv(p.precio_mayor_usd),
      escapeCsv(p.cantidad_mayorista),
      escapeCsv(p.precio_bulto_usd || 0),
      escapeCsv(p.cant_bulto || 0),
      escapeCsv(p.estado || 'Activo')
    ]);

    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = getLocalDateStr();
    link.setAttribute('download', `reporte_inventario_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✅ Reporte exportado a Excel (CSV) con éxito.');
  };

  // Opción 1: Enviar Reporte General por WhatsApp (Directo a Grupo Configurado como Adjunto + Fallback PDF + WhatsApp Web)
  const handleSendWhatsAppReport = async () => {
    if (sortedProducts.length === 0) {
      showAlert('No hay productos en el listado para compartir por WhatsApp.', 'Sin Datos', 'warning');
      return;
    }

    const companyName = companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.';
    const totalItems = sortedProducts.length;
    const totalValueVenta = sortedProducts.reduce((acc, p) => acc + p.precio_detalle_usd * (parseFloat(p.stock_actual as any) || 0), 0);
    const totalValueCosto = sortedProducts.reduce((acc, p) => acc + p.precio_costo_usd * (parseFloat(p.stock_actual as any) || 0), 0);
    const dateStr = new Date().toLocaleDateString('es-VE');
    const timeStr = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

    const categoryLabel = selectedCategories.length === 0 ? 'TODAS' : selectedCategories.join(', ');
    const stockFilterLabel = 
      (filterStock as string) === 'todos' ? 'TODOS' :
      (filterStock as string) === 'con_existencia' ? 'CON EXISTENCIA (>0)' :
      (filterStock as string) === 'sin_existencia' ? 'SIN EXISTENCIA (0)' :
      (filterStock as string) === 'menor_5' ? 'EXISTENCIA ≤ 5' :
      (filterStock as string) === 'menor_10' ? 'EXISTENCIA ≤ 10' :
      (filterStock as string) === 'menor_15' ? 'EXISTENCIA ≤ 15' : 'TODOS';

    let text = `📦 *REPORTE GENERAL DE INVENTARIO Y AUDITORÍA*\n`;
    text += `🏢 *${companyName}*\n`;
    text += `📅 Generado: ${dateStr} - ${timeStr}\n`;
    text += `───────────────\n`;
    text += `📊 *RESUMEN EJECUTIVO:*\n`;
    text += `• Total Artículos: *${totalItems} productos*\n`;
    text += `• Valor Total (Detalle): *$${totalValueVenta.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n`;
    text += `• Valor Total (Costo): *$${totalValueCosto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n`;
    text += `• Filtro Categoría: ${categoryLabel}\n`;
    text += `• Filtro Stock: ${stockFilterLabel}\n`;
    text += `───────────────\n`;
    text += `📎 *Se adjunta documento gráfico oficial de auditoría de inventario.*`;

    // 1. Capturar Documento Gráfico en Formato Base64
    const imageBase64 = await captureInventarioReportPNG(false);

    // 2. Intentar Envío Directo al Grupo de WhatsApp Configurado en el Bot Backend
    try {
      showToast('🔄 Verificando servicio de WhatsApp Bot...');
      const statusRes = await fetch('/api/whatsapp/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        
        if (!statusData.enabled) {
          showAlert('El servicio de WhatsApp Bot está deshabilitado en F10 Configuración.', 'Bot WhatsApp Deshabilitado', 'warning');
        } else if (statusData.status !== 'CONNECTED') {
          showAlert(`El servicio de WhatsApp no está conectado (Estado: ${statusData.status}).\n\nPor favor escanee el código QR en F10 Configuración ➔ INTEGRACIÓN WHATSAPP.`, 'WhatsApp No Vinculado', 'warning');
        } else {
          showToast('🚀 Enviando documento del reporte adjunto al grupo de WhatsApp...');
          const sendRes = await fetch('/api/whatsapp/send-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64, textSummary: text })
          });
          const sendData = await sendRes.json();

          if (sendRes.ok && sendData.success) {
            showToast('✅ Reporte General enviado exitosamente ADJUNTO al grupo de WhatsApp.');
            
            // Generar también ventana del documento PDF
            handlePrintReport();

            showAlert(
              `✅ El reporte general de inventario se guardó automáticamente en formato gráfico y se envió ADJUNTO al grupo de WhatsApp configurado.\n\nTambién se abrió la ventana para imprimir o guardar el PDF físicamente si lo requieres.`,
              'Envío Automático Exitoso con Adjunto',
              'success'
            );
            return;
          } else {
            showAlert(`No se pudo enviar el reporte vía Bot WhatsApp: ${sendData.error || sendData.message || 'Error en el servidor.'}`, 'Fallo en Envío Directo', 'error');
          }
        }
      }
    } catch (err: any) {
      console.warn('Bot de WhatsApp no disponible para envío directo:', err);
    }

    // 3. FALLBACK A IMPRESIÓN PDF + WHATSAPP WEB si no hay bot directo activo
    handlePrintReport();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    setTimeout(() => {
      showAlert(
        `📄 Se ha generado la vista preliminar del Reporte PDF para guardarlo en tu equipo.\n\nComo el bot directo no está activo, se copió el resumen al portapapeles. Puedes adjuntar el archivo guardado en WhatsApp Web o presionar Ctrl + V para pegar el resumen.`,
        'Reporte PDF Generado (Fallback)',
        'info'
      );
    }, 400);
  };

  // Opción 2: Envío de Lista de Mercancía / Faltantes (Envío Directo a Grupo WhatsApp + Fallback a WhatsApp Web)
  const handleSendWhatsAppSupplierList = async (onlyLowStock = false) => {
    let listToExport = sortedProducts;
    if (onlyLowStock) {
      listToExport = sortedProducts.filter(p => (parseFloat(p.stock_actual as any) || 0) <= (parseFloat(p.stock_minimo as any) || 0));
    }

    if (listToExport.length === 0) {
      showAlert(
        onlyLowStock 
          ? 'No hay productos con bajo stock o alerta de existencia en la selección actual.' 
          : 'No hay productos en el listado para generar la lista de proveedores.',
        'Sin Datos',
        'warning'
      );
      return;
    }

    const companyName = companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.';
    const dateStr = new Date().toLocaleDateString('es-VE');
    const timeStr = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

    // Group products by category
    const grouped: { [category: string]: typeof listToExport } = {};
    listToExport.forEach(p => {
      const cat = (p.category || 'GENERAL / SIN CATEGORÍA').toUpperCase();
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });

    let text = `📝 *REPORTE DE PRODUCTOS FALTANTES ${onlyLowStock ? '(SOLO FALTANTES / BAJO STOCK)' : '(COMPLETO POR CATEGORÍAS)'}*\n`;
    text += `🏢 *${companyName}*\n`;
    text += `📅 Fecha: ${dateStr} - ${timeStr}\n`;
    text += `───────────────\n`;

    const categoriesList = Object.keys(grouped).sort();

    categoriesList.forEach(cat => {
      text += `\n📌 *CATEGORÍA: ${cat}*\n`;
      grouped[cat].forEach(p => {
        const curStock = formatStockVal(p.stock_actual, p.a_granel);
        const minStock = formatStockVal(p.stock_minimo, p.a_granel);
        text += `• ${p.description} *(Existencia: ${curStock} / Mínimo: ${minStock})*\n`;
      });
    });

    text += `\n───────────────\n`;
    text += `_Total de productos faltantes reportados: ${listToExport.length}_\n`;
    text += `📎 *Se adjunta documento gráfico detallado con los productos faltantes.*`;

    // 1. Capturar Documento Gráfico en Formato Base64
    const imageBase64 = await captureInventarioReportPNG(onlyLowStock);

    // 2. Intentar Envío Directo al Grupo de WhatsApp Configurado en el Bot Backend
    try {
      showToast('🔄 Verificando servicio de WhatsApp Bot...');
      const statusRes = await fetch('/api/whatsapp/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();

        if (!statusData.enabled) {
          showAlert('El servicio de WhatsApp Bot está deshabilitado en F10 Configuración.', 'Bot WhatsApp Deshabilitado', 'warning');
        } else if (statusData.status !== 'CONNECTED') {
          showAlert(`El servicio de WhatsApp no está conectado (Estado: ${statusData.status}).\n\nPor favor escanee el código QR en F10 Configuración ➔ INTEGRACIÓN WHATSAPP.`, 'WhatsApp No Vinculado', 'warning');
        } else {
          showToast('🚀 Enviando documento de faltantes adjunto al grupo de WhatsApp...');
          const sendRes = await fetch('/api/whatsapp/send-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64, textSummary: text })
          });
          const sendData = await sendRes.json();

          if (sendRes.ok && sendData.success) {
            showToast('✅ Reporte de faltantes enviado exitosamente ADJUNTO al grupo de WhatsApp.');
            showAlert(
              `✅ El reporte de productos faltantes (${listToExport.length} ítems ordenados por categoría) se guardó automáticamente en formato gráfico y se envió ADJUNTO al grupo de WhatsApp configurado.`,
              'Envío Automático Exitoso con Adjunto',
              'success'
            );
            return;
          } else {
            showAlert(`No se pudo enviar la lista por el Bot de WhatsApp: ${sendData.error || sendData.message || 'Error en el servidor.'}`, 'Fallo en Envío Directo', 'error');
          }
        }
      }
    } catch (err) {
      console.warn('Bot de WhatsApp no disponible o no configurado, procediendo con fallback a WhatsApp Web:', err);
    }

    // 3. FALLBACK A WHATSAPP WEB si el bot direct no está conectado o configurado
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Lista de faltantes copiada al portapapeles.');
      }).catch(() => {});
    }

    // Protection against URL length limits (> 1500 chars causes WhatsApp Web blank screen)
    if (text.length < 1500) {
      const encodedText = encodeURIComponent(text);
      window.open(`https://web.whatsapp.com/send?text=${encodedText}`, '_blank');
      showAlert(
        `Se ha abierto WhatsApp Web para enviar la lista de faltantes (${listToExport.length} productos).\n\n(Servicio bot directo no activo o sin grupo. Redirigido a WhatsApp Web).`,
        'Enviando vía WhatsApp Web',
        'info'
      );
    } else {
      window.open('https://web.whatsapp.com/', '_blank');
      showAlert(
        `La lista contiene ${listToExport.length} productos faltantes (${text.length} caracteres).\n\nComo el bot directo no está activo y para evitar pantalla blanca en WhatsApp Web por la longitud del texto, la lista se copió automáticamente a tu portapapeles.\n\nEn WhatsApp Web, solo abre el chat o grupo deseado y presiona Ctrl + V para pegar la lista entera ordenada por categoría.`,
        '📋 Lista Copiada al Portapapeles',
        'info'
      );
    }
  };

  return (
    <div className="space-y-6 text-slate-800 font-mono text-xs">
      
      {/* TOAST DE ÉXITO */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-250 text-emerald-700 px-4 py-3 rounded-lg text-xs flex items-center gap-2 font-sans transition-all animate-pulse">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* HEADER SECTION WITH INTEGRATED METRICS PANEL IN RED AREA */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-winter-inventarioStart tracking-wider flex items-center gap-2">
            <Package className="w-5 h-5 text-winter-inventarioStart" />
            CONTROL DE INVENTARIO Y AUDITORÍA
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Gestión centralizada del stock, mermas de almacén, auditorías de Kardex y registro histórico de precios.
          </p>
        </div>

        {/* Right side metrics cards placed exactly in the red outline box */}
        {activeSubTab === 'catalogo' && (() => {
          const totalP1 = safeProducts.reduce((acc, p) => acc + (p?.precio_detalle_usd || 0) * (parseFloat(p?.stock_actual as any) || 0), 0);
          const totalCost = safeProducts.reduce((acc, p) => acc + (p?.precio_costo_usd || 0) * (parseFloat(p?.stock_actual as any) || 0), 0);
          const totalUds = safeProducts.reduce((acc, p) => acc + (!p?.a_granel ? (parseFloat(p?.stock_actual as any) || 0) : 0), 0);
          const totalKg = safeProducts.reduce((acc, p) => acc + (p?.a_granel ? (parseFloat(p?.stock_actual as any) || 0) : 0), 0);

          const filtP1 = filteredProducts.reduce((acc, p) => acc + (p?.precio_detalle_usd || 0) * (parseFloat(p?.stock_actual as any) || 0), 0);
          const filtCost = filteredProducts.reduce((acc, p) => acc + (p?.precio_costo_usd || 0) * (parseFloat(p?.stock_actual as any) || 0), 0);
          const filtUds = filteredProducts.reduce((acc, p) => acc + (!p?.a_granel ? (parseFloat(p?.stock_actual as any) || 0) : 0), 0);
          const filtKg = filteredProducts.reduce((acc, p) => acc + (p?.a_granel ? (parseFloat(p?.stock_actual as any) || 0) : 0), 0);

          const hasFilters = filteredProducts.length !== safeProducts.length;

          return (
            <div className="flex flex-col items-end gap-2 font-mono text-xs">
              {/* FILA 1: TARJETAS DE MÉTRICAS GENERALES */}
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                {canViewCost ? (
                  <>
                    <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-2xs flex items-center gap-2.5">
                      <span className="text-[11px] font-sans font-bold text-slate-500 uppercase tracking-wide">Precio 1 del Inventario:</span>
                      <span className="font-extrabold text-slate-900 text-base md:text-lg font-mono">
                        ${totalP1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-2xs flex items-center gap-2.5">
                      <span className="text-[11px] font-sans font-bold text-slate-500 uppercase tracking-wide">Costo del Inventario:</span>
                      <span className="font-extrabold text-slate-900 text-base md:text-lg font-mono">
                        ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-2xs flex items-center gap-2.5">
                      <span className="text-[11px] font-sans font-bold text-slate-500 uppercase tracking-wide">Total Productos:</span>
                      <span className="font-extrabold text-slate-900 text-base md:text-lg font-mono">
                        {safeProducts.length}
                      </span>
                      <span className="text-[10px] text-slate-400 font-sans font-normal">
                        ({totalUds} uds + {totalKg.toFixed(3)} kg)
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-2xs flex items-center gap-2.5">
                    <span className="text-[11px] font-sans font-bold text-slate-500 uppercase tracking-wide">Total Productos:</span>
                    <span className="font-extrabold text-slate-900 text-base md:text-lg font-mono">
                      {safeProducts.length}
                    </span>
                    <span className="text-[10px] text-slate-400 font-sans font-normal">
                      ({totalUds} uds + {totalKg.toFixed(3)} kg)
                    </span>
                  </div>
                )}
              </div>

              {/* FILA 2: TARJETAS DE MÉTRICAS FILTRADAS (HOMOGÉNEAS CON SOMBREADO CELESTE PARA DISTINGUIR ABAJO) */}
              {hasFilters && (
                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  {canViewCost ? (
                    <>
                      <div className="bg-sky-50/90 border border-sky-200 rounded-xl px-4 py-1.5 shadow-2xs flex items-center gap-2.5">
                        <span className="text-[11px] font-sans font-bold text-sky-700 uppercase tracking-wide flex items-center gap-1">
                          🔍 Precio 1 (Filtrado):
                        </span>
                        <span className="font-extrabold text-sky-950 text-base md:text-lg font-mono">
                          ${filtP1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="bg-sky-50/90 border border-sky-200 rounded-xl px-4 py-1.5 shadow-2xs flex items-center gap-2.5">
                        <span className="text-[11px] font-sans font-bold text-sky-700 uppercase tracking-wide flex items-center gap-1">
                          🔍 Costo (Filtrado):
                        </span>
                        <span className="font-extrabold text-sky-950 text-base md:text-lg font-mono">
                          ${filtCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="bg-sky-50/90 border border-sky-200 rounded-xl px-4 py-1.5 shadow-2xs flex items-center gap-2.5">
                        <span className="text-[11px] font-sans font-bold text-sky-700 uppercase tracking-wide flex items-center gap-1">
                          🎯 Total (Filtrado):
                        </span>
                        <span className="font-extrabold text-sky-950 text-base md:text-lg font-mono">
                          {filteredProducts.length}
                        </span>
                        <span className="text-[10px] text-sky-600 font-sans font-normal">
                          ({filtUds} uds + {filtKg.toFixed(3)} kg)
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="bg-sky-50/90 border border-sky-200 rounded-xl px-4 py-1.5 shadow-2xs flex items-center gap-2.5">
                      <span className="text-[11px] font-sans font-bold text-sky-700 uppercase tracking-wide flex items-center gap-1">
                        🎯 Total (Filtrado):
                      </span>
                      <span className="font-extrabold text-sky-950 text-base md:text-lg font-mono">
                        {filteredProducts.length}
                      </span>
                      <span className="text-[10px] text-sky-600 font-sans font-normal">
                        ({filtUds} uds + {filtKg.toFixed(3)} kg)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* TOP TABS NAVIGATION - Aligned Left */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveSubTab('catalogo')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all ${
            activeSubTab === 'catalogo'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xs font-extrabold'
              : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          Catálogo
        </button>
        <button
          onClick={() => setActiveSubTab('movimientos')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all ${
            activeSubTab === 'movimientos'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xs font-extrabold'
              : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          Kardex
        </button>
        <button
          onClick={() => setActiveSubTab('precios')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all ${
            activeSubTab === 'precios'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xs font-extrabold'
              : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          Historial Precios
        </button>
        <button
          onClick={() => setActiveSubTab('estadisticas')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all flex items-center gap-1.5 ${
            activeSubTab === 'estadisticas'
              ? 'bg-white border-slate-200 text-indigo-900 shadow-2xs font-extrabold'
              : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
          Estadísticas
        </button>
      </div>

      {/* RENDER ACTIVE PANEL */}
      {activeSubTab === 'catalogo' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 shadow-sm">
            {/* Search Input */}
            <div className="relative flex-grow max-w-md">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Buscar por código o descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && paginatedProducts.length > 0) {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                    const firstProd = paginatedProducts[0];
                    setSelectedProduct(firstProd);
                    const rowEl = document.getElementById(`inv-prod-row-${firstProd.id}`);
                    if (rowEl) rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:border-winter-inventarioStart font-sans focus:outline-none"
              />
            </div>
            
            <div className="relative" ref={reportMenuRef}>
              <button
                type="button"
                onClick={() => setShowReportMenu(prev => !prev)}
                className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-2 shadow-sm"
              >
                <Printer className="w-4 h-4 text-sky-400" />
                <span>Generar Reporte</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showReportMenu ? 'rotate-180' : ''}`} />
              </button>

              {showReportMenu && (
                <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 text-xs text-slate-700 font-sans">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    Seleccionar Formato
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReportMenu(false);
                      handlePrintReport();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5 transition-colors font-medium"
                  >
                    <Printer className="w-4 h-4 text-indigo-600" />
                    <div>
                      <div className="font-bold text-slate-800">Ver / Imprimir PDF</div>
                      <div className="text-[10px] text-slate-400">Documento PDF nativo vectorial</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReportMenu(false);
                      handleExportExcel();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5 transition-colors font-medium border-t border-slate-100"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="font-bold text-slate-800">Exportar a Excel (.csv)</div>
                      <div className="text-[10px] text-slate-400">Formato UTF-8 compatible con Excel</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReportMenu(false);
                      handleSendWhatsAppReport();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5 transition-colors font-medium border-t border-slate-100"
                  >
                    <MessageCircle className="w-4 h-4 text-green-600" />
                    <div>
                      <div className="font-bold text-slate-800">WhatsApp: Reporte General (con PDF)</div>
                      <div className="text-[10px] text-slate-400">Genera documento PDF + copia resumen</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReportMenu(false);
                      handleSendWhatsAppSupplierList(true);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5 transition-colors font-medium border-t border-slate-100"
                  >
                    <MessageCircle className="w-4 h-4 text-amber-600" />
                    <div>
                      <div className="font-bold text-slate-800">WhatsApp: Envío de Lista (Solo Faltantes ⚠️)</div>
                      <div className="text-[10px] text-slate-400">Lista por categorías de productos con bajo stock</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReportMenu(false);
                      handleSendWhatsAppSupplierList(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5 transition-colors font-medium border-t border-slate-100"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="font-bold text-slate-800">WhatsApp: Envío de Lista (Completo por Categorías)</div>
                      <div className="text-[10px] text-slate-400">Lista completa organizada para proveedores (sin límite)</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* FILTER CONTROLS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-slate-50/50 border border-slate-200/60 rounded-xl py-1.5 px-3 shadow-sm">
            {/* Multi-Category Selector */}
            <div className="relative flex flex-col gap-0.5" ref={categoryMenuRef}>
              <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Categorías (Multi-Selección)</label>
              <button
                type="button"
                onClick={() => setShowCategoryMenu(prev => !prev)}
                className="bg-white border border-slate-300 rounded-lg py-1 px-2.5 text-xs text-slate-800 font-sans focus:border-winter-inventarioStart focus:outline-none flex items-center justify-between gap-1 text-left shadow-sm"
              >
                <span className="truncate font-bold">
                  {selectedCategories.length === 0
                    ? 'TODAS LAS CATEGORÍAS'
                    : selectedCategories.length === 1
                      ? selectedCategories[0]
                      : `${selectedCategories.length} SELECCIONADAS (${selectedCategories.join(', ')})`}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform ${showCategoryMenu ? 'rotate-180' : ''}`} />
              </button>

              {showCategoryMenu && (
                <div className="absolute top-full left-0 mt-1 w-full min-w-[240px] bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 text-xs font-sans text-slate-700 max-h-64 overflow-y-auto space-y-1">
                  <label className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer font-bold border-b border-slate-100 text-slate-900">
                    <input
                      type="checkbox"
                      checked={selectedCategories.length === 0}
                      onChange={() => setSelectedCategories([])}
                      className="rounded text-winter-inventarioStart focus:ring-winter-inventarioStart w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>TODAS LAS CATEGORÍAS</span>
                  </label>
                  {allCategories.map(cat => {
                    const isChecked = selectedCategories.includes(cat);
                    return (
                      <label key={cat} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedCategories(selectedCategories.filter(c => c !== cat));
                            } else {
                              setSelectedCategories([...selectedCategories, cat]);
                            }
                          }}
                          className="rounded text-winter-inventarioStart focus:ring-winter-inventarioStart w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="truncate font-medium">{cat}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Stock Existence Filter */}
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Existencia (Stock)</label>
              <div className="flex items-center gap-1.5">
                <select
                  value={filterStock}
                  onChange={(e) => setFilterStock(e.target.value as any)}
                  className="bg-white border border-slate-300 rounded-lg py-1 px-2 text-xs text-slate-800 font-sans font-bold focus:border-winter-inventarioStart focus:outline-none shadow-sm flex-1"
                >
                  <option value="todos">TODOS LOS PRODUCTOS</option>
                  <option value="con_existencia">CON EXISTENCIA (&gt; 0)</option>
                  <option value="sin_existencia">SIN EXISTENCIA (0)</option>
                  <option value="menor_igual">EXISTENCIA MENOR O IGUAL A (≤ NÚMERO)</option>
                  <option value="mayor_igual">EXISTENCIA MAYOR O IGUAL A (≥ NÚMERO)</option>
                </select>

                {(filterStock === 'menor_igual' || filterStock === 'mayor_igual') && (
                  <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-0.5 shadow-sm">
                    <span className="text-[11px] font-extrabold text-indigo-700">
                      {filterStock === 'menor_igual' ? '≤' : '≥'}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={customStockValue}
                      onChange={(e) => setCustomStockValue(e.target.value)}
                      placeholder="Ej: 10"
                      className="w-14 text-xs font-mono font-bold text-slate-800 outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Min Stock Warning Filter */}
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Alertas de Stock</label>
              <select
                value={filterMinStock}
                onChange={(e) => setFilterMinStock(e.target.value as any)}
                className="bg-white border border-slate-300 rounded-lg py-1 px-2 text-xs text-slate-800 font-sans focus:border-winter-inventarioStart focus:outline-none"
              >
                <option value="todos">MOSTRAR TODO EL STOCK</option>
                <option value="bajo_minimo">BAJO STOCK MÍNIMO (ALERTA)</option>
              </select>
            </div>

            {/* Tax Regime Filter (Exentos vs Gravables) */}
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Régimen IVA (Exento / Gravable)</label>
              <select
                value={filterTax}
                onChange={(e) => setFilterTax(e.target.value as any)}
                className="bg-white border border-slate-300 rounded-lg py-1 px-2 text-xs text-slate-800 font-sans font-bold focus:border-winter-inventarioStart focus:outline-none shadow-sm"
              >
                <option value="todos">TODOS (TODOS LOS PRODUCTOS)</option>
                <option value="exentos">🟢 SOLO EXENTOS (E) - 0% IVA</option>
                <option value="gravables">🔵 SOLO GRAVABLES (G) - CON IVA 16%</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Catalog Table */}
            <div className="lg:col-span-10 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
              {/* ORDEN COMBINADO BAR */}
              {sortRules.length > 0 && (
                <div className="bg-sky-50/40 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center gap-2 text-xs font-sans text-slate-700">
                  <div className="flex items-center gap-1 font-bold text-sky-900 mr-2 uppercase tracking-wider text-[10px]">
                    <ArrowUpDown className="w-3.5 h-3.5 text-sky-700" />
                    <span>ORDEN COMBINADO ({sortRules.length}):</span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    {sortRules.map((rule, idx) => {
                      const fieldNames: Record<string, string> = {
                        descripcion: 'Descripción',
                        categoria: 'Categoría',
                        stock_minimo: 'Stock Mínimo',
                        existencia: 'Existencia',
                        precio_costo: 'P. Costo',
                        precio_detalle: 'P. Detalle',
                        precio_mayor: 'P. Mayor',
                      };
                      
                      const fieldName = fieldNames[rule.field] || rule.field;
                      const directionText = rule.direction === 'asc' ? 'Menor a Mayor' : 'Mayor a Menor';
                      
                      return (
                        <div 
                          key={rule.field}
                          className="flex items-center gap-1 bg-white border border-sky-200 rounded-full pl-1.5 pr-1 py-0.5 text-[10.5px] shadow-sm font-sans"
                        >
                          <span className="bg-sky-600 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold text-[9px] leading-none">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-800 ml-0.5">{fieldName}</span>
                          {rule.direction === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-sky-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-sky-600" />
                          )}
                          <span className="text-[9.5px] text-slate-455">({directionText})</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSortRules(prev => prev.filter(r => r.field !== rule.field));
                            }}
                            className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-slate-100 transition-colors ml-0.5"
                            title="Quitar de la ordenación"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                    
                    <button
                      type="button"
                      onClick={() => setSortRules([])}
                      className="text-[10px] text-slate-500 hover:text-red-650 hover:underline font-bold transition-all px-2 py-0.5 ml-1"
                    >
                      Limpiar orden
                    </button>
                  </div>
                </div>
              )}

              {/* TOP PAGINATION CONTROLS */}
              {sortedProducts.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border-b border-slate-200 px-4 py-2 text-xs font-sans text-slate-600">
                  <div className="flex items-center gap-2">
                    <span>Mostrar:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none font-sans font-bold"
                    >
                      <option value={25}>25 por página</option>
                      <option value={50}>50 por página</option>
                      <option value={100}>100 por página</option>
                      <option value={250}>250 por página</option>
                      <option value={sortedProducts.length}>Mostrar Todos ({sortedProducts.length})</option>
                    </select>
                    <span className="text-slate-400">
                      Mostrando {Math.min((currentPage - 1) * pageSize + 1, sortedProducts.length)} - {Math.min(currentPage * pageSize, sortedProducts.length)} de {sortedProducts.length} productos
                    </span>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5 font-bold">
                      <button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-2 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100 transition-all"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100 transition-all"
                      >
                        Anterior
                      </button>
                      <span className="px-3 py-1 bg-sky-100 text-sky-800 rounded font-mono">
                        Pág {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100 transition-all"
                      >
                        Siguiente
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-2 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100 transition-all"
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-360px)] min-h-[380px] border-b border-slate-200">
                <table className="w-full border-collapse text-xs text-left table-fixed min-w-[920px]">
                  <colgroup>
                    <col className="w-[11%]" /> {/* Código */}
                    <col className={canViewCost ? "w-[26%]" : "w-[30%]"} /> {/* Descripción */}
                    <col className={canViewCost ? "w-[12%]" : "w-[14%]"} /> {/* Categoría */}
                    <col className="w-[7%]" />  {/* Stk. Mín */}
                    <col className="w-[9%]" /> {/* Existencia */}
                    {canViewCost && <col className="w-[8%]" />}  {/* P. Costo */}
                    <col className={canViewCost ? "w-[9%]" : "w-[10%]"} />  {/* P. Detalle */}
                    <col className={canViewCost ? "w-[9%]" : "w-[10%]"} />  {/* P. Mayor */}
                    <col className={canViewCost ? "w-[9%]" : "w-[10%]"} />  {/* P. Bulto */}
                  </colgroup>
                  <thead className="bg-slate-100 sticky top-0 z-20 border-b border-slate-300 shadow-2xs">
                    <tr className="text-slate-550 border-b border-slate-200">
                      <th className="px-2 py-1.5 font-sans uppercase truncate">Código</th>
                      <th className="px-2 py-1.5 font-sans uppercase">
                        {renderSortHeader('Descripción', 'descripcion')}
                      </th>
                      <th className="px-2 py-1.5 font-sans uppercase">
                        {renderSortHeader('Categoría', 'categoria')}
                      </th>
                      <th className="px-2 py-1.5 text-center font-sans uppercase">
                        {renderSortHeader('Stk. Mín', 'stock_minimo', 'center')}
                      </th>
                      <th className="px-2 py-1.5 text-center text-slate-800 font-sans uppercase">
                        {renderSortHeader('Existencia', 'existencia', 'center')}
                      </th>
                      {canViewCost && (
                        <th className="px-2 py-1.5 text-center font-sans uppercase">
                          {renderSortHeader('P. Costo', 'precio_costo', 'center')}
                        </th>
                      )}
                      <th className="px-2 py-1.5 text-center text-emerald-600 font-sans uppercase">
                        {renderSortHeader('P. Detalle', 'precio_detalle', 'center')}
                      </th>
                      <th className="px-2 py-1.5 text-center font-sans uppercase">
                        {renderSortHeader('P. Mayor', 'precio_mayor', 'center')}
                      </th>
                      <th className="px-2 py-1.5 text-center text-amber-700 font-sans uppercase">
                        {renderSortHeader('P. Bulto', 'precio_bulto', 'center')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 text-[11px]">
                    {sortedProducts.length === 0 ? (
                      <tr>
                        <td colSpan={canViewCost ? 9 : 8} className="text-center py-8 text-slate-400 font-sans">
                          No se encontraron productos registrados.
                        </td>
                      </tr>
                    ) : (
                      paginatedProducts.map(p => {
                        const isLowStock = p.stock_actual <= p.stock_minimo;
                        return (
                          <tr 
                            key={p.id} 
                            id={`inv-prod-row-${p.id}`}
                            onClick={() => {
                              const sel = window.getSelection()?.toString();
                              if (sel && sel.trim().length > 0) return;
                              setSelectedProduct(selectedProduct?.id === p.id ? null : p);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedProduct(p);
                              const menuWidth = 250;
                              const menuHeight = 350;
                              const x = Math.min(e.clientX, window.innerWidth - menuWidth - 15);
                              const y = Math.min(e.clientY, window.innerHeight - menuHeight - 15);
                              setContextMenu({ x: Math.max(10, x), y: Math.max(10, y), product: p });
                            }}
                            className={`hover:bg-slate-50/50 cursor-pointer transition-all border-b border-slate-100 select-text ${
                              selectedProduct?.id === p.id 
                                ? 'bg-sky-50 hover:bg-sky-100/70 border-l-4 border-l-winter-inventarioStart' 
                                : ''
                            }`}
                          >
                            <td 
                              className="px-2 py-1 font-mono font-bold text-slate-800 select-text cursor-text truncate selection:bg-indigo-600 selection:text-white" 
                              title={p.barcode}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="select-text cursor-text font-mono font-bold text-slate-800 selection:bg-indigo-600 selection:text-white">
                                {p.barcode}
                              </span>
                            </td>
                            <td 
                              className="px-2 py-1 font-sans select-text cursor-text break-words selection:bg-indigo-600 selection:text-white"
                              onClick={(e) => {
                                const sel = window.getSelection()?.toString();
                                if (sel && sel.trim().length > 0) e.stopPropagation();
                              }}
                            >
                              <div className="font-bold text-slate-850 text-[11px] leading-tight flex items-center gap-1.5 flex-wrap select-text">
                                <span className="select-text cursor-text selection:bg-indigo-600 selection:text-white">{p.description}</span>
                                {p.exento_impuesto === true ? (
                                  <span className="bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[8.5px] px-1 py-0.2 rounded font-mono shadow-2xs select-none" title="Producto Exento de IVA (0%)">
                                    (E)
                                  </span>
                                ) : (
                                  <span className="bg-sky-50 text-sky-800 border border-sky-200 font-bold text-[8px] px-1 py-0.2 rounded font-mono select-none" title="Producto Gravable con IVA">
                                    (G)
                                  </span>
                                )}
                              </div>
                              {(p.a_granel || p.fecha_vencimiento) && (
                                <div className="flex gap-1.5 mt-0.5 text-[8px] leading-none">
                                  {p.a_granel && (
                                    <span className="bg-amber-50 border border-amber-250 text-amber-700 px-1 py-0.2 rounded font-bold uppercase font-sans">A Granel</span>
                                  )}
                                  {p.fecha_vencimiento && (
                                    <span className="bg-red-50 border border-red-250 text-red-700 px-1 py-0.2 rounded font-bold font-sans">
                                      Vence: {p.fecha_vencimiento}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1 font-sans truncate select-text cursor-text selection:bg-indigo-600 selection:text-white" title={p.category}>{p.category}</td>
                            <td className="px-2 py-1 text-center font-mono text-slate-500 select-text cursor-text selection:bg-indigo-600 selection:text-white">{formatStockVal(p.stock_minimo, p.a_granel)}</td>
                            <td className={`px-2 py-1 text-center font-black font-mono select-text cursor-text selection:bg-indigo-600 selection:text-white ${isLowStock ? 'text-red-500 animate-pulse font-bold' : 'text-slate-800'}`}>
                              {formatStockVal(p.stock_actual, p.a_granel)}
                            </td>
                            {canViewCost && (
                              <td className="px-2 py-1 text-center font-mono text-slate-600 select-text cursor-text selection:bg-indigo-600 selection:text-white">${p.precio_costo_usd.toFixed(2)}</td>
                            )}
                            <td className="px-2 py-1 text-center font-mono text-emerald-600 font-bold select-text cursor-text selection:bg-indigo-600 selection:text-white">${p.precio_detalle_usd.toFixed(2)}</td>
                            <td className="px-2 py-1 text-center font-mono text-slate-600 select-text cursor-text selection:bg-indigo-600 selection:text-white">
                              ${p.precio_mayor_usd.toFixed(2)}
                              <span className="text-[8px] text-slate-400 block font-sans">x{p.cantidad_mayorista}</span>
                            </td>
                            <td className="px-2 py-1 text-center font-mono text-amber-900 font-extrabold select-text cursor-text selection:bg-indigo-600 selection:text-white">
                              {p.precio_bulto_usd && p.precio_bulto_usd > 0 ? (
                                <>
                                  ${p.precio_bulto_usd.toFixed(2)}
                                  <span className="text-[8px] text-amber-700 block font-sans font-extrabold">x{p.cant_bulto || 1}</span>
                                </>
                              ) : (
                                <span className="text-slate-300 italic text-[10px]">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION CONTROLS */}
              {sortedProducts.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border-t border-slate-200 px-4 py-2 text-xs font-sans text-slate-600">
                  <div className="flex items-center gap-2">
                    <span>Mostrar:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none font-sans font-bold"
                    >
                      <option value={25}>25 por página</option>
                      <option value={50}>50 por página</option>
                      <option value={100}>100 por página</option>
                      <option value={250}>250 por página</option>
                      <option value={sortedProducts.length}>Mostrar Todos ({sortedProducts.length})</option>
                    </select>
                    <span className="text-slate-400">
                      Mostrando {Math.min((currentPage - 1) * pageSize + 1, sortedProducts.length)} - {Math.min(currentPage * pageSize, sortedProducts.length)} de {sortedProducts.length} productos
                    </span>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5 font-bold">
                      <button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-2 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100 transition-all"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100 transition-all"
                      >
                        Anterior
                      </button>
                      <span className="px-3 py-1 bg-sky-100 text-sky-800 rounded font-mono">
                        Pág {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100 transition-all"
                      >
                        Siguiente
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-2 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100 transition-all"
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sidebar Operations Column - Sticky persistent while scrolling products */}
            <div className="lg:col-span-2 space-y-3 font-sans text-slate-800 sticky top-2 self-start max-h-[calc(100vh-80px)] overflow-y-auto pr-0.5">
              <div className="bg-slate-150 border border-slate-200 rounded-lg p-3 shadow-inner flex flex-col justify-start h-fit">
                <h4 className="text-[10px] font-sans font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5 text-slate-450" />
                  Operaciones
                </h4>

                {/* Selected Product Preview with Image & AI Generator */}
                {selectedProduct && (
                  <div className="bg-sky-50 border border-sky-200 text-sky-900 text-[10px] p-2.5 rounded-lg mb-3 font-sans shadow-sm leading-tight flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div 
                        onClick={() => handleOpenImageManager(selectedProduct)}
                        className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden relative shadow-inner cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
                        title="Haga clic para gestionar o cambiar la imagen"
                      >
                        <div className="text-center">
                          <ImageIcon className="w-4 h-4 text-slate-300 mx-auto" />
                          <span className="text-[7.5px] text-slate-400 font-bold block">Sin Foto</span>
                        </div>
                        {selectedProduct.imagen_url && (
                          <img 
                            key={`sel-prod-img-${selectedProduct.id}-${selectedProduct.imagen_url}`}
                            src={formatImageUrl(selectedProduct.imagen_url)} 
                            alt={selectedProduct.description} 
                            className="w-full h-full object-cover absolute inset-0 bg-white" 
                            onLoad={(e) => { (e.currentTarget as HTMLElement).style.display = 'block'; }}
                            onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-extrabold uppercase truncate block text-slate-900">{selectedProduct.description}</span>
                        <span className="font-mono text-slate-500 font-bold block text-[9.5px]">{selectedProduct.barcode}</span>
                        <span className={`font-mono font-black block mt-0.5 ${selectedProduct.stock_actual <= selectedProduct.stock_minimo ? 'text-red-700 animate-pulse' : 'text-slate-700'}`}>
                          Stock: {formatStockVal(selectedProduct.stock_actual, selectedProduct.a_granel)} {selectedProduct.a_granel ? 'kg' : 'uds'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                      <button
                        type="button"
                        onClick={() => handleOpenImageManager(selectedProduct)}
                        className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold py-1 px-1.5 rounded text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 shadow-2xs transition-all active:scale-95"
                        title="Subir foto desde PC o pegar URL"
                      >
                        <ImageIcon className="w-3 h-3 text-blue-600" />
                        <span>Foto Manual</span>
                      </button>
                      <button
                        type="button"
                        disabled={isGeneratingAiImage}
                        onClick={() => handleGenerateAiImageForProduct(selectedProduct)}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black py-1 px-1.5 rounded text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95 disabled:opacity-50"
                        title="Generar foto con IA automáticamente"
                      >
                        <Sparkles className="w-3 h-3 text-amber-300" />
                        <span>{isGeneratingAiImage ? 'IA...' : 'Foto IA'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Operations buttons */}
                <div className="flex flex-col gap-2.5">
                  {/* BUTTON: GENERADOR MASIVO DE FOTOS CON IA */}
                  {hasPermission('editar') && (
                    <button
                      onClick={() => setShowBulkAiModal(true)}
                      className="w-full bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 hover:from-indigo-800 hover:to-blue-800 text-white border border-indigo-500/60 py-2 px-3 rounded shadow-md flex items-center justify-between font-sans text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                      title="Generar fotos automáticamente con Inteligencia Artificial para los productos del catálogo"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                        <span className="font-extrabold text-amber-300">Fotos IA Masivas</span>
                      </div>
                      <span className="bg-slate-950 text-emerald-400 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-black border border-indigo-500/40">
                        {products.filter(p => !p.imagen_url || p.imagen_url.trim() === '').length} sin foto
                      </span>
                    </button>
                  )}
                  {/* BUTTON 1: AGREGAR */}
                  {hasPermission('crear') && (
                    <button
                      onClick={() => setShowNewProdModal(true)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4 bg-emerald-700/50 rounded-full p-0.5" />
                      <span>Agregar</span>
                    </button>
                  )}

                  {/* BUTTON: CARGA POR FACTURA */}
                  {hasPermission('crear') && (
                    <button
                      onClick={() => {
                        setInvoiceNumber('');
                        setInvoiceProducts([]);
                        setInvoiceSearchTerm('');
                        setShowInvoiceLoadModal(true);
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 py-2 px-3 rounded shadow-sm flex items-center justify-between font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 bg-emerald-700/50 rounded-full p-0.5" />
                        <span>Carga por Factura</span>
                      </div>
                      {pausedInvoices.length > 0 && (
                        <span className="bg-amber-400 text-slate-950 text-[9px] px-1.5 py-0.2 rounded-full font-mono font-black" title={`${pausedInvoices.length} carga(s) en espera`}>
                          {pausedInvoices.length} en espera
                        </span>
                      )}
                    </button>
                  )}

                  {/* BUTTON: CARGAS EN ESPERA (PAUSADAS) */}
                  {hasPermission('crear') && pausedInvoices.length > 0 && (
                    <button
                      onClick={() => setShowPausedInvoicesModal(true)}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-600 py-2 px-3 rounded shadow flex items-center justify-between font-sans font-extrabold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                    >
                      <div className="flex items-center gap-2">
                        <PauseCircle className="w-4 h-4" />
                        <span>Cargas en Espera</span>
                      </div>
                      <span className="bg-slate-950 text-amber-400 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
                        {pausedInvoices.length}
                      </span>
                    </button>
                  )}

                  {/* BUTTON: SALIDA DE INVENTARIO (MERMAS, DAÑOS, REVERSIÓN) */}
                  {hasPermission('editar') && (
                    <button
                      onClick={openSalidaModal}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white border border-rose-700 py-2 px-3 rounded shadow-sm flex items-center justify-between font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                      title="Registrar merma, daño, vencimiento o reversión de factura de proveedor"
                    >
                      <div className="flex items-center gap-2">
                        <Minus className="w-4 h-4 bg-rose-700/50 rounded-full p-0.5" />
                        <span>Salida de Inventario</span>
                      </div>
                      {salidasPausadas.length > 0 && (
                        <span className="bg-amber-400 text-slate-950 text-[9px] px-1.5 py-0.2 rounded-full font-mono font-black" title={`${salidasPausadas.length} salida(s) pausada(s)`}>
                          {salidasPausadas.length} pausada(s)
                        </span>
                      )}
                    </button>
                  )}

                  {/* BUTTON: SALIDAS EN ESPERA (PAUSADAS) */}
                  {hasPermission('editar') && salidasPausadas.length > 0 && (
                    <button
                      onClick={() => setShowPausedSalidasModal(true)}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-600 py-2 px-3 rounded shadow flex items-center justify-between font-sans font-extrabold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                    >
                      <div className="flex items-center gap-2">
                        <PauseCircle className="w-4 h-4 text-slate-950" />
                        <span>Salidas en Espera</span>
                      </div>
                      <span className="bg-slate-950 text-amber-400 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black">
                        {salidasPausadas.length}
                      </span>
                    </button>
                  )}

                  {/* BUTTON: AUDITORÍA DE CATÁLOGO Y PRECIOS */}
                  {hasPermission('editar') && (
                    <button
                      onClick={() => setShowCatalogAuditModal(true)}
                      className={`w-full py-2 px-3 rounded shadow flex items-center justify-between font-sans text-[11px] uppercase tracking-wider text-left transition-all active:scale-95 ${
                        catalogAuditIssuesCount > 0
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 border border-amber-600 font-black animate-pulse'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold'
                      }`}
                      title={catalogAuditIssuesCount > 0 ? "Existen productos con inconsistencias de datos o precios en $0.00" : "Auditoría de Integridad del Catálogo y Precios"}
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className={`w-4 h-4 ${catalogAuditIssuesCount > 0 ? 'text-slate-950 fill-current' : 'text-amber-500'}`} />
                        <span>Auditoría Catálogo</span>
                      </div>
                      {catalogAuditIssuesCount > 0 ? (
                        <span className="bg-slate-950 text-amber-400 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black">
                          {catalogAuditIssuesCount}
                        </span>
                      ) : (
                        <span className="text-emerald-700 text-[10px] font-mono font-bold">
                          ✓ OK
                        </span>
                      )}
                    </button>
                  )}

                  {/* BUTTON: IMPORTAR MASIVO */}
                  {hasPermission('crear') && (
                    <button
                      onClick={() => setShowBulkModal(true)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                    >
                      <Upload className="w-4 h-4 bg-emerald-700/50 rounded-full p-0.5" />
                      <span>Carga Masiva</span>
                    </button>
                  )}

                  {/* BUTTON: CATEGORIAS */}
                  {_currentUser.rol.toLowerCase() === 'administrador' && (
                    <button
                      onClick={() => setShowCategoriesModal(true)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                    >
                      <Tag className="w-4 h-4 bg-emerald-700/50 rounded-full p-0.5" />
                      <span>Categorías</span>
                    </button>
                  )}

                  {/* BUTTON: AJUSTE GENERAL */}
                  {_currentUser.rol.toLowerCase() === 'administrador' && (
                    <button
                      onClick={() => {
                        setSelectedProductIds([]);
                        setGeneralAdjustReason('');
                        setShowGeneralAdjustModal(true);
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                    >
                      <Layers className="w-4 h-4 bg-emerald-700/50 rounded-full p-0.5" />
                      <span>Ajuste General</span>
                    </button>
                  )}

                  {/* BUTTON: EXPORTAR INVENTARIO (EXCEL/CSV) */}
                  <button
                    onClick={exportInventoryToCsv}
                    className="w-full bg-slate-700 hover:bg-slate-800 text-white border border-slate-800 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                    title="Exportar catálogo completo de productos con stock y precios a un archivo CSV para Excel"
                  >
                    <Download className="w-4 h-4 bg-slate-800/50 rounded-full p-0.5" />
                    <span>Resp. Inventario</span>
                  </button>

                  {/* BUTTON 2: STOCK (CON ACCESO A AJUSTE MASIVO SI NO HAY PRODUCTO SELECCIONADO Y ES ADMIN) */}
                  <button
                    onClick={() => {
                      if (selectedProduct) {
                        handleOpenAdjust(selectedProduct);
                      } else if (_currentUser.rol.toLowerCase() === 'administrador') {
                        setBulkStockCounts({});
                        setBulkStockSearch('');
                        setBulkStockReason('Toma de inventario físico de stock');
                        setShowBulkStockAdjustModal(true);
                      } else {
                        showAlert('Debe seleccionar un producto de la tabla para ajustar su stock.', 'Seleccione Producto', 'warning');
                      }
                    }}
                    disabled={!selectedProduct && _currentUser.rol.toLowerCase() !== 'administrador'}
                    className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-cyan-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                    title={!selectedProduct ? (_currentUser.rol.toLowerCase() === 'administrador' ? "Abrir Ajuste Masivo de Stock Físico (Conteo Simultáneo)" : "Seleccione un producto para ajustar stock") : "Ajustar stock del producto seleccionado"}
                  >
                    <RefreshCw className="w-4 h-4 bg-cyan-750/50 disabled:bg-transparent rounded-full p-0.5" />
                    <span>{selectedProduct ? 'Ajustar Stock' : 'Ajuste Masivo Stock 👑'}</span>
                  </button>

                  {/* BUTTON 3: PRECIOS */}
                  <button
                    onClick={() => selectedProduct && handleOpenPrices(selectedProduct)}
                    disabled={!selectedProduct || !hasPermission('editar')}
                    className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-amber-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                    title={!selectedProduct ? "Seleccione un producto para editar precios" : !hasPermission('editar') ? "No posee permisos para editar precios" : "Editar precios del producto"}
                  >
                    <PenTool className="w-4 h-4 bg-amber-750/50 disabled:bg-transparent rounded-full p-0.5" />
                    <span>Editar Precios</span>
                  </button>

                  {/* BUTTON: MODIFICAR FICHA */}
                  <button
                    onClick={() => selectedProduct && handleOpenEditProduct(selectedProduct)}
                    disabled={!selectedProduct || !hasPermission('editar')}
                    className="w-full bg-slate-700 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-slate-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                    title={!selectedProduct ? "Seleccione un producto para modificar" : !hasPermission('editar') ? "No posee permisos para modificar" : "Modificar ficha técnica del producto"}
                  >
                    <Edit className="w-4 h-4 bg-slate-800/50 disabled:bg-transparent rounded-full p-0.5" />
                    <span>Modificar</span>
                  </button>

                  {/* BUTTON 4: ELIMINAR */}
                  {hasPermission('eliminar') && (
                    <button
                      onClick={handleDeleteProductClick}
                      disabled={!selectedProduct || selectedProduct.stock_actual > 0}
                      className="w-full bg-red-655 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-red-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                      title={
                        !selectedProduct 
                          ? "Seleccione un producto para eliminar" 
                          : selectedProduct.stock_actual > 0 
                            ? "No se puede eliminar un producto con existencia mayor a 0" 
                            : "Eliminar producto permanentemente"
                      }
                    >
                      <Minus className="w-4 h-4 bg-red-700/50 disabled:bg-transparent rounded-full p-0.5" />
                      <span>Eliminar</span>
                    </button>
                  )}
                </div>

                {selectedProduct && (
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="mt-6 text-[10px] text-slate-455 hover:text-slate-650 underline font-sans text-center transition-all"
                  >
                    Limpiar selección
                  </button>
                )}

                {/* Informative Tooltip */}
                <div className="mt-4 p-2 bg-slate-200 border border-slate-300 text-[9px] font-sans text-slate-500 rounded flex gap-1.5 leading-tight">
                  <span>Seleccione un producto de la tabla para activar los botones de operaciones de Stock, Precios y Eliminar. El botón de eliminar se activará únicamente si la existencia del producto es 0.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOVIMIENTOS KARDEX PANEL */}
      {activeSubTab === 'movimientos' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          {/* HEADER & FILTER CONTROLS */}
          <div className="bg-slate-55 px-5 py-3 border-b border-slate-200 space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2 font-sans">
                  <History className="w-4 h-4 text-winter-inventarioStart" />
                  Kardex de Movimientos de Inventario
                </h2>
                
                {/* Selector de Sub-Navegación */}
                <div className="flex bg-slate-200 p-0.5 rounded-lg border border-slate-300 text-[10.5px] font-sans">
                  <button
                    type="button"
                    onClick={() => setKardexView('detallada')}
                    className={`px-3 py-1 rounded-md font-bold transition-all ${
                      kardexView === 'detallada'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Vista Detallada
                  </button>
                  <button
                    type="button"
                    onClick={() => setKardexView('resumen')}
                    className={`px-3 py-1 rounded-md font-bold transition-all ${
                      kardexView === 'resumen'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Vista Resumen
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(kardexSearchTerm || kardexDateFilter || kardexTypeFilter !== 'todos' || kardexOperatorFilter !== 'todos') && (
                  <button
                    type="button"
                    onClick={() => {
                      setKardexSearchTerm('');
                      setKardexDateFilter('');
                      setKardexTypeFilter('todos');
                      setKardexOperatorFilter('todos');
                    }}
                    className="text-[10px] text-rose-600 hover:text-rose-800 font-sans font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    Limpiar Filtros
                  </button>
                )}
                <span className="text-[10px] bg-slate-200 border border-slate-300 px-2.5 py-0.5 rounded text-slate-600 font-sans font-bold">
                  {kardexView === 'detallada' ? filteredMovements.length : groupedMovements.length} {kardexView === 'detallada' ? 'registros' : 'lotes'}
                </span>
              </div>
            </div>

            {/* BARRA DE BÚSQUEDA Y FILTROS KARDEX */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 font-sans text-xs pt-1 border-t border-slate-200/80">
              {/* Buscador de Producto / Código / Motivo */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="🔍 Código, producto o motivo..."
                  value={kardexSearchTerm}
                  onChange={(e) => setKardexSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-2.5 py-1.5 text-[11px] text-slate-800 focus:outline-none focus:border-winter-inventarioStart shadow-xs"
                />
              </div>

              {/* Buscador / Filtro por Fecha */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-xs">
                <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <input
                  type="date"
                  value={kardexDateFilter}
                  onChange={(e) => setKardexDateFilter(e.target.value)}
                  className="w-full text-[11px] font-mono text-slate-800 bg-transparent focus:outline-none"
                />
                {kardexDateFilter && (
                  <button type="button" onClick={() => setKardexDateFilter('')} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Filtro por Tipo de Movimiento */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase flex-shrink-0">Tipo:</span>
                <select
                  value={kardexTypeFilter}
                  onChange={(e) => setKardexTypeFilter(e.target.value)}
                  className="w-full bg-transparent text-[11px] text-slate-800 font-sans focus:outline-none font-medium cursor-pointer"
                >
                  <option value="todos">Todos los Tipos</option>
                  <option value="Venta">Venta</option>
                  <option value="Devolucion">Devolución</option>
                  <option value="Merma">Merma</option>
                  <option value="Entrada">Entrada</option>
                  <option value="Salida">Salida</option>
                  <option value="Entrada Rápida">Entrada Rápida</option>
                </select>
              </div>

              {/* Filtro por Operador */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase flex-shrink-0">Operador:</span>
                <select
                  value={kardexOperatorFilter}
                  onChange={(e) => setKardexOperatorFilter(e.target.value)}
                  className="w-full bg-transparent text-[11px] text-slate-800 font-sans focus:outline-none font-medium cursor-pointer"
                >
                  <option value="todos">Todos los Operadores</option>
                  {kardexOperatorsList.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto">
            {kardexView === 'detallada' ? (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-slate-55 border-b border-slate-200 text-slate-550">
                  <tr>
                    <th className="px-4 py-3 font-sans uppercase">Fecha/Hora</th>
                    <th className="px-4 py-3 font-sans uppercase">Código</th>
                    <th className="px-4 py-3 font-sans uppercase">Producto</th>
                    <th className="px-4 py-3 text-center font-sans uppercase">Tipo Mov.</th>
                    <th className="px-4 py-3 text-right font-sans uppercase">Cantidad</th>
                    <th className="px-4 py-3 text-right font-sans uppercase">Stock Ant.</th>
                    <th className="px-4 py-3 text-right font-sans uppercase">Stock Post.</th>
                    <th className="px-4 py-3 font-sans uppercase">Justificación / Motivo</th>
                    <th className="px-4 py-3 font-sans uppercase">Operador</th>
                    <th className="px-4 py-3 text-center font-sans uppercase">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-8 text-slate-400 font-sans">
                        No se encontraron movimientos con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map(m => {
                      let typeColor = 'text-blue-700 bg-blue-50 border-blue-200';
                      if (m.type === 'Entrada') typeColor = 'text-green-700 bg-green-50 border-green-200';
                      if (m.type === 'Salida') typeColor = 'text-orange-700 bg-orange-50 border-orange-200';
                      if (m.type === 'Merma') typeColor = 'text-red-700 bg-red-50 border-red-200 font-bold';
                      if (m.type === 'Devolucion' || m.type === 'Devolución') typeColor = 'text-yellow-700 bg-yellow-50 border-yellow-250 font-bold';

                      const relatedProd = products.find(p => p.barcode === m.productCode || p.description === m.productDescription);
                      const isBulk = relatedProd?.a_granel === true || (m as any).a_granel === true;

                      const formatKardexVal = (numVal: number, showSign: boolean = false) => {
                        const val = typeof numVal === 'number' ? numVal : (parseFloat(numVal) || 0);
                        const formatted = isBulk ? val.toFixed(3) : (Math.round(val * 1000) / 1000 % 1 === 0 ? Math.round(val).toString() : val.toFixed(3));
                        if (showSign && val > 0) return `+${formatted}`;
                        return formatted;
                      };

                      return (
                        <tr key={m.id} className="hover:bg-slate-55/50">
                          <td className="px-4 py-2.5 font-mono text-slate-450">{m.date}</td>
                          <td className="px-4 py-2.5 font-mono font-bold text-slate-500">{m.productCode}</td>
                          <td className="px-4 py-2.5 font-sans">{m.productDescription}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded border text-[9px] ${typeColor}`}>
                              {m.type}
                            </span>
                          </td>
                          <td className={`px-4 py-2.5 text-right font-black font-mono ${m.type === 'Salida' || m.type === 'Merma' ? 'text-red-600' : (m.qty > 0 ? 'text-green-600' : 'text-red-600')}`}>
                            {m.type === 'Salida' || m.type === 'Merma' ? `-${Math.abs(m.qty)}` : formatKardexVal(m.qty, true)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-450">{formatKardexVal(m.stock_anterior)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-600">{formatKardexVal(m.stock_posterior)}</td>
                          <td className="px-4 py-2.5 text-slate-655 italic font-sans">{m.motivo}</td>
                          <td className="px-4 py-2.5 font-sans">{m.usuario}</td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedMovementDetail(m)}
                              className="text-sky-600 hover:text-sky-850 hover:underline font-bold font-sans text-[10px]"
                            >
                              Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-slate-55 border-b border-slate-200 text-slate-550">
                  <tr>
                    <th className="px-4 py-3 font-sans uppercase">Fecha/Hora (Minuto)</th>
                    <th className="px-4 py-3 font-sans uppercase">Tipo Mov.</th>
                    <th className="px-4 py-3 font-sans uppercase">Justificación / Motivo</th>
                    <th className="px-4 py-3 text-right font-sans uppercase">Total Ítems</th>
                    <th className="px-4 py-3 text-right font-sans uppercase">Cantidad Total</th>
                    <th className="px-4 py-3 font-sans uppercase">Operador</th>
                    <th className="px-4 py-3 text-center font-sans uppercase">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                  {groupedMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 font-sans">
                        No se han registrado lotes de movimientos.
                      </td>
                    </tr>
                  ) : (
                    groupedMovements.map(g => {
                      let typeColor = 'text-blue-700 bg-blue-50 border-blue-200';
                      if (g.type === 'Entrada') typeColor = 'text-green-700 bg-green-50 border-green-200';
                      if (g.type === 'Salida') typeColor = 'text-orange-700 bg-orange-50 border-orange-200';
                      if (g.type === 'Merma') typeColor = 'text-red-700 bg-red-50 border-red-200 font-bold';
                      if (g.type === 'Devolucion' || g.type === 'Devolución') typeColor = 'text-yellow-700 bg-yellow-50 border-yellow-250 font-bold';

                      return (
                        <tr key={g.key} className="hover:bg-slate-55/50">
                          <td className="px-4 py-2.5 font-mono text-slate-450">{g.date}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded border text-[9px] ${typeColor}`}>
                              {g.type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-655 italic font-sans font-bold">{g.motivo}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-600">{g.totalItems}</td>
                          <td className={`px-4 py-2.5 text-right font-black font-mono ${g.type === 'Salida' || g.type === 'Merma' ? 'text-red-600' : (g.totalQty > 0 ? 'text-green-600' : 'text-red-600')}`}>
                            {g.type === 'Salida' || g.type === 'Merma' ? `-${Math.abs(g.totalQty)}` : (g.totalQty > 0 ? `+${g.totalQty}` : g.totalQty)}
                          </td>
                          <td className="px-4 py-2.5 font-sans">{g.usuario}</td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedGroupedMovements(g.movements)}
                              className="bg-sky-50 border border-sky-250 text-sky-700 hover:bg-sky-100/80 px-2.5 py-1 rounded font-bold font-sans text-[10px] active:scale-95 transition-all shadow-sm"
                            >
                              Ver Detalle
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* DETALLE DE MOVIMIENTO AGRUPADO POPUP */}
      {selectedGroupedMovements && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[75vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-sky-600 to-sky-700 px-5 py-3 flex justify-between items-center text-white">
              <h3 className="text-xs font-extrabold uppercase tracking-wider font-mono flex items-center gap-2">
                <History className="w-3.5 h-3.5" />
                Detalle de Lote - {selectedGroupedMovements[0]?.motivo}
              </h3>
              <button 
                onClick={() => setSelectedGroupedMovements(null)} 
                className="text-white/80 hover:text-white text-base focus:outline-none"
              >
                ✕
              </button>
            </div>

            {/* Info Row */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex justify-between text-[10px] font-sans text-slate-500">
              <span>Fecha: <strong className="text-slate-700 font-mono">{selectedGroupedMovements[0]?.date}</strong></span>
              <span>Operador: <strong className="text-slate-700 uppercase">{selectedGroupedMovements[0]?.usuario}</strong></span>
              <span>Tipo: <strong className="text-slate-700 uppercase">{selectedGroupedMovements[0]?.type}</strong></span>
            </div>

            {/* Content Table */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-[10px] uppercase text-slate-500 font-mono sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2">Código</th>
                    <th className="px-4 py-2">Producto</th>
                    <th className="px-4 py-2 text-right">Cantidad</th>
                    <th className="px-4 py-2 text-right">Stock Ant.</th>
                    <th className="px-4 py-2 text-right">Stock Post.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans text-slate-700">
                  {selectedGroupedMovements.map(m => {
                    const relatedProd = products.find(p => p.barcode === m.productCode || p.description === m.productDescription);
                    const isBulk = relatedProd?.a_granel === true || (m as any).a_granel === true;

                    const formatKardexVal = (numVal: number, showSign: boolean = false) => {
                      const val = typeof numVal === 'number' ? numVal : (parseFloat(numVal) || 0);
                      const formatted = isBulk ? val.toFixed(3) : (Math.round(val * 1000) / 1000 % 1 === 0 ? Math.round(val).toString() : val.toFixed(3));
                      if (showSign && val > 0) return `+${formatted}`;
                      return formatted;
                    };

                    return (
                      <tr key={m.id} className="hover:bg-slate-55/30">
                        <td className="px-4 py-2 font-mono font-bold text-slate-500">{m.productCode}</td>
                        <td className="px-4 py-2">{m.productDescription}</td>
                        <td className={`px-4 py-2 text-right font-bold font-mono ${m.qty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatKardexVal(m.qty, true)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-400">{formatKardexVal(m.stock_anterior)}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">{formatKardexVal(m.stock_posterior)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedGroupedMovements(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-[11px] font-sans font-bold transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORIAL PRECIOS PANEL */}
      {activeSubTab === 'precios' && (() => {
        const filteredHistory = getFilteredAndSortedHistory();
        return (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
            <div className="bg-slate-55 px-5 py-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2 font-sans">
                <Layers className="w-4 h-4 text-winter-inventarioStart" />
                Auditoría de Ajustes de Precios
              </h2>
              <span className="text-[10px] bg-slate-200 border border-slate-300 px-2.5 py-0.5 rounded text-slate-600 font-sans">
                {filteredHistory.length} de {priceHistory.length} ajustes
              </span>
            </div>

            {/* FILTERS BAR */}
            <div className="bg-slate-50 border-b border-slate-200 p-3 grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Buscador */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-450">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Buscar código, descripción, motivo..."
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 pl-8 text-xs text-slate-800 focus:outline-none focus:border-winter-inventarioStart font-sans"
                />
              </div>
              
              {/* Fecha Desde */}
              <div className="flex items-center gap-2">
                <label className="text-[9px] uppercase font-bold font-mono text-slate-500 whitespace-nowrap">Desde:</label>
                <input
                  type="date"
                  value={historyStartDate}
                  onChange={(e) => setHistoryStartDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-winter-inventarioStart font-mono"
                />
              </div>

              {/* Fecha Hasta */}
              <div className="flex items-center gap-2">
                <label className="text-[9px] uppercase font-bold font-mono text-slate-500 whitespace-nowrap">Hasta:</label>
                <input
                  type="date"
                  value={historyEndDate}
                  onChange={(e) => setHistoryEndDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-winter-inventarioStart font-mono"
                />
              </div>

              {/* Limpiar Filtros */}
              <div className="flex justify-end items-center">
                {(historySearch || historyStartDate || historyEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistorySearch('');
                      setHistoryStartDate('');
                      setHistoryEndDate('');
                    }}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold px-3 py-1.5 rounded transition-all flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Limpiar</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex-grow overflow-y-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-555 z-10">
                  <tr>
                    <th 
                      onClick={() => toggleHistorySort('date')}
                      className="px-4 py-2 text-[10px] font-sans uppercase cursor-pointer hover:bg-slate-100 select-none transition-all group"
                    >
                      <div className="flex items-center gap-1">
                        <span>Fecha/Hora</span>
                        {historySortField === 'date' ? (
                          historySortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-slate-500" /> : <ArrowDown className="w-3 h-3 text-slate-500" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-350 opacity-0 group-hover:opacity-100 transition-all" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleHistorySort('productCode')}
                      className="px-4 py-2 text-[10px] font-sans uppercase cursor-pointer hover:bg-slate-100 select-none transition-all group"
                    >
                      <div className="flex items-center gap-1">
                        <span>Código</span>
                        {historySortField === 'productCode' ? (
                          historySortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-slate-500" /> : <ArrowDown className="w-3 h-3 text-slate-500" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-350 opacity-0 group-hover:opacity-100 transition-all" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleHistorySort('productDescription')}
                      className="px-4 py-2 text-[10px] font-sans uppercase cursor-pointer hover:bg-slate-100 select-none transition-all group"
                    >
                      <div className="flex items-center gap-1">
                        <span>Producto</span>
                        {historySortField === 'productDescription' ? (
                          historySortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-slate-500" /> : <ArrowDown className="w-3 h-3 text-slate-500" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-350 opacity-0 group-hover:opacity-100 transition-all" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleHistorySort('type')}
                      className="px-4 py-2 text-[10px] text-center font-sans uppercase cursor-pointer hover:bg-slate-100 select-none transition-all group"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Tipo Precio</span>
                        {historySortField === 'type' ? (
                          historySortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-slate-500" /> : <ArrowDown className="w-3 h-3 text-slate-500" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-350 opacity-0 group-hover:opacity-100 transition-all" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleHistorySort('precio_anterior')}
                      className="px-4 py-2 text-[10px] text-right text-red-500 font-sans uppercase cursor-pointer hover:bg-slate-100 select-none transition-all group"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>P. Anterior</span>
                        {historySortField === 'precio_anterior' ? (
                          historySortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-slate-500" /> : <ArrowDown className="w-3 h-3 text-slate-500" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-350 opacity-0 group-hover:opacity-100 transition-all" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleHistorySort('precio_nuevo')}
                      className="px-4 py-2 text-[10px] text-right text-green-600 font-sans uppercase cursor-pointer hover:bg-slate-100 select-none transition-all group"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>P. Nuevo</span>
                        {historySortField === 'precio_nuevo' ? (
                          historySortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-slate-500" /> : <ArrowDown className="w-3 h-3 text-slate-500" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-350 opacity-0 group-hover:opacity-100 transition-all" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleHistorySort('motivo')}
                      className="px-4 py-2 text-[10px] font-sans uppercase cursor-pointer hover:bg-slate-100 select-none transition-all group"
                    >
                      <div className="flex items-center gap-1">
                        <span>Motivo del Cambio</span>
                        {historySortField === 'motivo' ? (
                          historySortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-slate-500" /> : <ArrowDown className="w-3 h-3 text-slate-500" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-350 opacity-0 group-hover:opacity-100 transition-all" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => toggleHistorySort('usuario')}
                      className="px-4 py-2 text-[10px] font-sans uppercase cursor-pointer hover:bg-slate-100 select-none transition-all group"
                    >
                      <div className="flex items-center gap-1">
                        <span>Usuario</span>
                        {historySortField === 'usuario' ? (
                          historySortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-slate-500" /> : <ArrowDown className="w-3 h-3 text-slate-500" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-350 opacity-0 group-hover:opacity-100 transition-all" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-400 font-sans">
                        No se han registrado modificaciones de precios de venta o costo que coincidan.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map(h => (
                      <tr key={h.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 font-mono text-slate-450">{h.date}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-500">{h.productCode}</td>
                        <td className="px-4 py-2.5 font-sans">{h.productDescription}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="px-2 py-0.5 rounded border border-purple-200 text-purple-750 bg-purple-50 text-[9px] uppercase">
                            {(h as any).type || (h as any).priceType || 'Costo'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-red-550 font-bold">
                          ${(parseFloat((h as any).precio_anterior ?? (h as any).oldPrice ?? 0)).toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-green-600 font-bold">
                          ${(parseFloat((h as any).precio_nuevo ?? (h as any).newPrice ?? 0)).toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-655 font-sans italic">{h.motivo}</td>
                        <td className="px-4 py-2.5 font-sans">{h.usuario}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ESTADÍSTICAS Y PANEL DE RENDIMIENTO */}
      {activeSubTab === 'estadisticas' && (
        <div className="space-y-6 animate-fade-in font-sans text-slate-800">
          
          {/* HEADER & SUMMARY TOOLBAR CON FILTROS POR AÑO / MES Y RESGUARDO BCV OFFLINE */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600/30 border border-indigo-400/40 rounded-xl shadow-inner">
                <BarChart3 className="w-7 h-7 text-indigo-300" />
              </div>
              <div>
                <h3 className="text-base font-extrabold tracking-wide uppercase flex items-center gap-2">
                  ESTADÍSTICAS Y RENDIMIENTO DEL INVENTARIO
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </h3>
                <p className="text-xs text-slate-300 font-medium">
                  Análisis de valorización, rotación de mercancía y movimientos de Kardex.
                </p>
              </div>
            </div>

            {/* CONTROLES DE FILTRADO Y TASA BCV RESGUARDADA */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              
              {/* Filtro por Año */}
              <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-700/60 font-sans text-xs">
                <span className="text-slate-400 font-bold">Año:</span>
                <select
                  value={statsYear}
                  onChange={e => setStatsYear(e.target.value === 'todos' ? 'todos' : parseInt(e.target.value))}
                  className="bg-slate-900 text-amber-400 font-extrabold font-mono px-2 py-0.5 rounded border border-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="todos">Todos los Años</option>
                  {availableYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Filtro por Meses (Multi-Selección) */}
              <div className="relative font-sans text-xs" ref={monthMenuRef}>
                <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-700/60 font-sans text-xs">
                  <span className="text-slate-400 font-bold">Meses:</span>
                  <button
                    type="button"
                    onClick={() => setShowMonthMenu(prev => !prev)}
                    className="bg-slate-900 text-indigo-300 font-extrabold font-mono px-2.5 py-1 rounded border border-slate-700 hover:border-slate-500 focus:outline-none cursor-pointer flex items-center gap-1.5 max-w-[220px]"
                  >
                    <span className="truncate">
                      {statsMonths.length === 12
                        ? 'Todos los Meses (1-12)'
                        : statsMonths.length === 0
                          ? 'Ningún mes seleccionado'
                          : statsMonths.length === 1
                            ? ALL_STATS_MONTHS.find(m => m.id === statsMonths[0])?.name
                            : `${statsMonths.length} Meses (${statsMonths.map(id => ALL_STATS_MONTHS.find(m => m.id === id)?.short).join(', ')})`
                      }
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  </button>
                </div>

                {showMonthMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-3 animate-fade-in font-sans text-xs">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800 mb-2">
                      <span className="font-extrabold text-slate-300 uppercase tracking-wider text-[11px]">Seleccionar Meses</span>
                      <button
                        type="button"
                        onClick={toggleAllStatsMonths}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
                      >
                        {statsMonths.length > 0 ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                      {ALL_STATS_MONTHS.map(m => {
                        const isChecked = statsMonths.includes(m.id);
                        return (
                          <label
                            key={m.id}
                            className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors select-none ${
                              isChecked ? 'bg-indigo-950/70 border border-indigo-500/40 text-indigo-200 font-bold' : 'hover:bg-slate-800 text-slate-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleStatsMonth(m.id)}
                              className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                            />
                            <span className="text-[11px] truncate">{m.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Selector de Tasa para Estadísticas: Dólar ($), Euro (€) o Manual editable */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/90 p-1.5 rounded-xl border border-slate-700/80 font-sans text-xs shadow-inner">
                <span className="text-slate-400 font-bold pl-1.5 text-[11px] uppercase tracking-wider">Tasa:</span>
                
                {/* Botones de Selección de Moneda / Modo */}
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setStatsRateMode('usd')}
                    className={`px-2.5 py-1 rounded-md font-bold text-xs transition-all flex items-center gap-1 cursor-pointer ${
                      statsRateMode === 'usd'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Usar Tasa Oficial BCV Dólar USD"
                  >
                    <span>$ BCV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatsRateMode('eur')}
                    className={`px-2.5 py-1 rounded-md font-bold text-xs transition-all flex items-center gap-1 cursor-pointer ${
                      statsRateMode === 'eur'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Usar Tasa Oficial BCV Euro EUR"
                  >
                    <span>€ Euro</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatsRateMode('manual')}
                    className={`px-2.5 py-1 rounded-md font-bold text-xs transition-all flex items-center gap-1 cursor-pointer ${
                      statsRateMode === 'manual'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Ingresar tasa personalizada manualmente"
                  >
                    <span>Manual</span>
                  </button>
                </div>

                {/* Input de Tasa Manual o Visualización de Tasa Automática */}
                {statsRateMode === 'manual' ? (
                  <div className="flex items-center gap-1 pl-1 pr-1">
                    <span className="text-[11px] font-bold text-amber-400 font-mono">Bs:</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={statsManualRate}
                      onChange={e => setStatsManualRate(e.target.value)}
                      placeholder={effectiveStatsRate > 1 ? effectiveStatsRate.toFixed(2) : "0.00"}
                      className="w-24 bg-slate-900 text-amber-300 font-extrabold font-mono text-xs px-2 py-1 rounded border border-amber-500/60 focus:border-amber-400 focus:outline-none text-right placeholder-slate-600"
                    />
                  </div>
                ) : (
                  <div className="px-2 py-1 font-mono font-black text-xs text-emerald-300 flex items-center gap-1">
                    <span>Bs {effectiveStatsRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-[10px] text-slate-400 font-normal">/ {statsRateMode === 'eur' ? '€' : '$'}</span>
                  </div>
                )}
              </div>

              {/* Botón Asistente de Reabastecimiento y Compras */}
              <button
                type="button"
                onClick={() => setShowReplenishmentModal(true)}
                className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs font-sans transition-all shadow-md active:scale-95 flex items-center gap-2 border border-amber-300 cursor-pointer"
                title="Abrir Asistente Inteligente de Reabastecimiento y Sugerencia de Pedidos"
              >
                <Truck className="w-4 h-4 text-slate-950" />
                <span className="tracking-wide uppercase text-[11px]">Asistente de Pedidos</span>
                {replenishmentAnalysis.criticosCount > 0 ? (
                  <span className="bg-red-600 text-white text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full shadow-xs animate-pulse">
                    {replenishmentAnalysis.criticosCount}
                  </span>
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-900" />
                )}
              </button>

            </div>
          </div>

          {/* ROW 1: EXEC KPI SUMMARY CARDS (Montos de Inventario General) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            
            {/* Card 1: No. Productos */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">No. Productos</span>
                <Package className="w-4 h-4 text-sky-600" />
              </div>
              <div className="text-2xl font-black font-mono text-slate-900">
                {statisticsData.totalProdCount.toLocaleString('es-VE')}
              </div>
              <div className="text-[10px] text-slate-500 font-sans font-medium mt-1 flex justify-between">
                <span>{statisticsData.unitProdCount} por Piezas</span>
                <span className="font-bold text-amber-700">{statisticsData.bulkProdCount} Granel</span>
              </div>
            </div>

            {/* Card 2: Existencia Total (Separado Unidades vs Kilos) */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Existencia Física</span>
                <Layers className="w-4 h-4 text-indigo-600" />
              </div>
              
              <div className="space-y-1.5 py-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-600 font-sans">Unidades / Piezas:</span>
                  <span className="text-sm font-black font-mono text-indigo-900">
                    {statisticsData.unitStockQty.toLocaleString('es-VE', { maximumFractionDigits: 0 })} <span className="text-[9px] text-slate-400 font-normal font-sans">UDS</span>
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-1">
                  <span className="text-[11px] font-bold text-amber-800 font-sans">Kilos / A Granel:</span>
                  <span className="text-sm font-black font-mono text-amber-900">
                    {statisticsData.bulkStockQty.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} <span className="text-[9px] text-amber-600 font-bold font-sans">KG</span>
                  </span>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 font-semibold mt-0.5 flex justify-between border-t border-slate-100 pt-1">
                <span>Total Físico:</span>
                <span className="font-mono font-extrabold text-slate-700">{statisticsData.totalStockQty.toLocaleString('es-VE', { maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Card 3: Precio Total (Detalle) */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Precio Total</span>
                <DollarSign className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-black font-mono text-amber-900">
                ${statisticsData.totalValueDetailUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-1 font-bold flex items-center justify-between">
                <span>Bs {(statisticsData.totalValueDetailUsd * effectiveStatsRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-[9px] text-slate-400 font-normal">({statsRateMode === 'usd' ? '$ BCV' : statsRateMode === 'eur' ? '€ Euro' : 'Manual'})</span>
              </div>
            </div>

            {/* Card 4: Costo Total */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Costo Total</span>
                <Calculator className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl font-black font-mono text-purple-900">
                ${statisticsData.totalValueCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-1 font-bold flex items-center justify-between">
                <span>Bs {(statisticsData.totalValueCostUsd * effectiveStatsRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-[9px] text-slate-400 font-normal">({statsRateMode === 'usd' ? '$ BCV' : statsRateMode === 'eur' ? '€ Euro' : 'Manual'})</span>
              </div>
            </div>

            {/* Card 5: Utilidad / Ganancia Estimada */}
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex justify-between items-center text-emerald-800 mb-2">
                <span className="text-xs font-black uppercase tracking-wider">Utilidad Total</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black font-mono text-emerald-950">
                ${statisticsData.totalEstimatedProfitUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center justify-between">
                <span>Margen Est: +{statisticsData.avgMarginPct.toFixed(1)}%</span>
                <span className="font-mono text-emerald-900 font-extrabold">Bs {(statisticsData.totalEstimatedProfitUsd * effectiveStatsRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>

          </div>

          {/* ROW 2: TOP 10 PRODUCTOS MÁS VENDIDOS POR CANTIDAD */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                <h4 className="font-extrabold text-sm uppercase text-slate-850 tracking-wider">TOP 10 - PRODUCTOS MÁS VENDIDOS POR CANTIDAD</h4>
              </div>
              <span className="text-xs text-slate-500 font-mono">Basado en registros auditados del Kardex</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
              {/* Table side (5 cols) */}
              <div className="lg:col-span-5 border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5 text-center">#</th>
                      <th className="p-2.5">Descripción</th>
                      <th className="p-2.5 text-right">Cant.</th>
                      <th className="p-2.5 text-right font-mono">Total ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statisticsData.topSoldProducts.length > 0 ? (
                      statisticsData.topSoldProducts.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 text-center font-bold font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-800 uppercase text-[11px] truncate max-w-[160px]">{p.description}</td>
                          <td className="p-2.5 text-right font-bold font-mono text-indigo-700">{p.qty.toLocaleString('es-VE')}</td>
                          <td className="p-2.5 text-right font-mono text-emerald-600 font-bold">${p.totalUsd.toFixed(2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-400 italic text-xs">No hay ventas registradas aún en Kardex.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bar Chart Visual Side (7 cols) */}
              <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-5 h-72 flex flex-col justify-end">
                <div className="flex items-end justify-between gap-2 h-56 pt-6 px-2">
                  {statisticsData.topSoldProducts.length > 0 ? (
                    statisticsData.topSoldProducts.map((p, idx) => {
                      const heightPct = Math.max(10, Math.min(100, (p.qty / statisticsData.maxSoldQty) * 100));
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 group h-full justify-end">
                          <span className="text-[10px] font-bold font-mono text-indigo-900 group-hover:scale-110 transition-all">{p.qty}</span>
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full max-w-[36px] bg-gradient-to-t from-blue-700 to-indigo-500 rounded-t-md shadow-sm group-hover:from-blue-600 group-hover:to-indigo-400 transition-all relative"
                          >
                            <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-2 py-1 rounded font-mono font-bold whitespace-nowrap z-30 shadow-lg pointer-events-none">
                              {p.description}: {p.qty} un (${p.totalUsd.toFixed(2)})
                            </div>
                          </div>
                          <span className="text-[9px] font-bold text-slate-600 truncate w-full text-center tracking-tighter uppercase font-sans mt-1">
                            {p.description.split(' ')[0]}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="w-full text-center text-slate-400 text-xs my-auto">Sin datos de gráfico para ventas.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ROW 3: MONTOS DE MOVIMIENTOS DE INVENTARIO (Kardex audit values) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                <h4 className="font-extrabold text-sm uppercase text-slate-850 tracking-wider">MONTOS DE MOVIMIENTOS DE INVENTARIO</h4>
              </div>
              <span className="text-xs text-slate-500 font-mono">Consolidado por tipo de operación</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
              {/* Table side (5 cols) */}
              <div className="lg:col-span-5 border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">Tipo Movimiento</th>
                      <th className="p-2.5 text-right font-mono">Cant.</th>
                      <th className="p-2.5 text-right font-mono">Costos ($)</th>
                      <th className="p-2.5 text-right font-mono">Precios ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statisticsData.movementsByType.length > 0 ? (
                      statisticsData.movementsByType.map((m, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 font-mono">
                          <td className="p-2.5 font-bold font-sans uppercase text-slate-800 text-[11px]">{m.type}</td>
                          <td className="p-2.5 text-right font-bold text-slate-700">{m.qtyTotal.toLocaleString('es-VE', { maximumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right text-purple-700 font-bold">${m.costUsd.toFixed(2)}</td>
                          <td className="p-2.5 text-right text-emerald-600 font-bold">${m.priceUsd.toFixed(2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-400 italic text-xs">No hay movimientos registrados en Kardex.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bar Chart Visual Side (7 cols) */}
              <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-5 h-72 flex flex-col justify-end">
                <div className="flex items-end justify-between gap-3 h-56 pt-6 px-2">
                  {statisticsData.movementsByType.length > 0 ? (
                    statisticsData.movementsByType.map((m, idx) => {
                      const heightPct = Math.max(10, Math.min(100, (m.qtyTotal / statisticsData.maxMovementQty) * 100));
                      const barGradient = 
                        m.type === 'Venta' || m.type === 'Ticket Venta' ? 'from-blue-700 to-indigo-500' :
                        m.type === 'Entrada' ? 'from-emerald-600 to-teal-500' :
                        m.type === 'Merma' ? 'from-rose-600 to-red-500' :
                        m.type === 'Salida' ? 'from-amber-600 to-orange-500' : 'from-indigo-600 to-purple-500';

                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 group h-full justify-end">
                          <span className="text-[10px] font-bold font-mono text-slate-800 group-hover:scale-110 transition-all">
                            {m.qtyTotal.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                          </span>
                          <div
                            style={{ height: `${heightPct}%` }}
                            className={`w-full max-w-[42px] bg-gradient-to-t ${barGradient} rounded-t-md shadow-sm transition-all relative`}
                          >
                            <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-2 py-1 rounded font-mono font-bold whitespace-nowrap z-30 shadow-lg pointer-events-none">
                              {m.type}: {m.qtyTotal.toFixed(2)} unidades (${m.priceUsd.toFixed(2)})
                            </div>
                          </div>
                          <span className="text-[9px] font-bold text-slate-700 truncate w-full text-center uppercase font-sans mt-1">
                            {m.type}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="w-full text-center text-slate-400 text-xs my-auto">Sin datos de movimientos para gráfico.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ROW 4: RENDIMIENTO Y DISTRIBUCIÓN POR CATEGORÍAS */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <h4 className="font-extrabold text-sm uppercase text-slate-850 tracking-wider">TOP CATEGORÍAS POR VALORIZACIÓN Y MARGEN</h4>
              </div>
              <span className="text-xs text-slate-500 font-mono">Participación de inventario</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statisticsData.topCategories.map((c, idx) => {
                const profit = c.detailUsd - c.costUsd;
                const margin = c.costUsd > 0 ? (profit / c.costUsd) * 100 : 0;
                const sharePct = statisticsData.totalValueDetailUsd > 0 ? (c.detailUsd / statisticsData.totalValueDetailUsd) * 100 : 0;

                return (
                  <div key={idx} className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 space-y-2.5 hover:bg-slate-100/90 transition-all shadow-2xs">
                    <div className="flex justify-between items-center pb-0.5 border-b border-slate-200/60">
                      <span className="font-black text-sm text-slate-900 uppercase tracking-wide truncate max-w-[160px]" title={c.category}>{c.category}</span>
                      <span className="bg-indigo-100 text-indigo-800 text-xs font-extrabold font-mono rounded-md px-2 py-0.5 whitespace-nowrap">
                        {sharePct.toFixed(1)}% del Inv.
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs pt-0.5">
                      <div className="flex justify-between items-center text-slate-600 font-sans">
                        <span>Productos:</span>
                        <span className="font-extrabold font-mono text-slate-900 text-xs">{c.count} items</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 font-sans">
                        <span>Valor Detalle:</span>
                        <span className="font-extrabold font-mono text-emerald-600 text-xs">
                          ${c.detailUsd.toFixed(2)} <span className="text-[10px] text-slate-400 font-normal font-sans">(Bs {(c.detailUsd * effectiveStatsRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })})</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 font-sans">
                        <span>Valor Costo:</span>
                        <span className="font-extrabold font-mono text-purple-600 text-xs">
                          ${c.costUsd.toFixed(2)} <span className="text-[10px] text-slate-400 font-normal font-sans">(Bs {(c.costUsd * effectiveStatsRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })})</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-emerald-800 font-sans font-bold border-t border-slate-200 pt-1.5 mt-1">
                        <span>Margen Est.:</span>
                        <span className="font-mono font-extrabold text-emerald-700 text-xs">+{margin.toFixed(1)}% (${profit.toFixed(2)})</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* MODAL: STOCK ADJUSTMENT - Light theme */}
      {showAdjustModal && selectedProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-winter-inventarioStart" />
                AJUSTAR EXISTENCIAS
              </h3>
              <button onClick={() => { setShowAdjustModal(false); setSelectedProduct(null); }} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
              <div><span className="text-slate-500 font-sans">Producto:</span> <span className="text-slate-800 font-bold select-text">{selectedProduct.description}</span></div>
              <div><span className="text-slate-500 font-sans">Código:</span> <span className="text-slate-600 font-bold font-mono">{selectedProduct.barcode}</span></div>
              <div><span className="text-slate-500 font-sans">Stock Físico Actual:</span> <span className="text-emerald-700 font-black font-mono">{selectedProduct.stock_actual} UND</span></div>
            </div>

            <form onSubmit={handleSaveStockAdjust} className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Tipo de Ajuste</label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value as any)}
                  className="w-full bg-slate-55 border border-slate-350 rounded p-2.5 text-xs text-slate-800 outline-none focus:bg-white focus:border-winter-inventarioStart"
                >
                  <option value="Entrada">Entrada (Compras, Ajustes Positivos)</option>
                  <option value="Salida">Salida (Ajustes Negativos)</option>
                  <option value="Merma">Merma (Deterioro, Pérdida, Rotura, Vencimiento)</option>
                  <option value="Devolucion">Devolución (Retorno de Cliente)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Cantidad de Ajuste</label>
                <input
                  type="number"
                  step={selectedProduct?.a_granel ? "0.001" : "1"}
                  min={selectedProduct?.a_granel ? "0.001" : "1"}
                  required
                  placeholder={selectedProduct?.a_granel ? "Ej: 1.50" : "Ej: 15"}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full bg-slate-55 border border-slate-350 rounded p-2.5 text-xs text-slate-850 font-bold font-mono focus:bg-white focus:border-winter-inventarioStart focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">
                  Justificación de Auditoría <span className="text-red-500 font-bold">*</span>
                </label>
                <textarea
                  required
                  placeholder="Escriba detalladamente la justificación física de este ajuste de inventario..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-55 border border-slate-355 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-sans resize-none"
                />
                {adjustType === 'Merma' && (
                  <p className="text-[10px] text-red-650 font-bold font-sans mt-1">
                    ⚠️ Al marcar como 'Merma', el inventario se deducirá automáticamente y se auditará con especial severidad en el Kardex.
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAdjustModal(false); setSelectedProduct(null); }}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-600 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-winter-inventarioStart hover:bg-winter-inventarioEnd text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
                >
                  AUDITAR Y REGISTRAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PRICE ADJUSTMENT - Light theme */}
      {showPriceModal && selectedProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-850 flex items-center gap-2">
                <PenTool className="w-4 h-4 text-purple-650" />
                MODIFICACIÓN DE PRECIOS USD
              </h3>
              <button onClick={() => { setShowPriceModal(false); setSelectedProduct(null); }} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
              <div><span className="text-slate-500 font-sans">Producto:</span> <span className="text-slate-800 font-bold select-text">{selectedProduct.description}</span></div>
              <div><span className="text-slate-500 font-sans">Código:</span> <span className="text-slate-600 font-bold font-mono">{selectedProduct.barcode}</span></div>
            </div>

            <form onSubmit={handleSavePriceAdjust} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Precio Costo ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={inputCost}
                    onChange={(e) => setInputCost(e.target.value)}
                    className="w-full bg-slate-55 border border-slate-350 rounded p-2 text-xs text-yellow-600 font-bold font-mono focus:bg-white focus:border-winter-inventarioStart focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Precio Detalle ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={inputDetail}
                    onChange={(e) => setInputDetail(e.target.value)}
                    className="w-full bg-slate-55 border border-slate-350 rounded p-2 text-xs text-emerald-700 font-bold font-mono focus:bg-white focus:border-winter-inventarioStart focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Precio Mayor ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={inputMayor}
                    onChange={(e) => setInputMayor(e.target.value)}
                    className="w-full bg-slate-55 border border-slate-350 rounded p-2 text-xs text-purple-750 font-bold font-mono focus:bg-white focus:border-winter-inventarioStart focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">
                  Motivo de Ajuste de Tarifas <span className="text-red-500 font-bold">*</span>
                </label>
                <textarea
                  required
                  placeholder="Justifique el cambio de precios (Ej: Alza inflacionaria, cambio de proveedor, promoción...)"
                  value={priceReason}
                  onChange={(e) => setPriceReason(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-55 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-sans resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowPriceModal(false); setSelectedProduct(null); }}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-655 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-winter-inventarioStart hover:bg-winter-inventarioEnd text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
                >
                  ACTUALIZAR PRECIOS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE PRODUCT - 2 Column Responsive Grid, Draggable & Pausable */}
      {showNewProdModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-[70] animate-fade-in font-sans text-slate-800">
          <div 
            style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)` }}
            className="bg-white border border-slate-200 rounded-2xl overflow-hidden w-full max-w-[1380px] shadow-2xl pointer-events-auto select-none transition-all duration-300 max-h-[94vh] flex flex-col"
          >
            {/* Header Draggable */}
            <div 
              onMouseDown={handleMouseDown}
              className="flex justify-between items-center border-b border-slate-200 px-6 py-3.5 bg-slate-50 cursor-grab active:cursor-grabbing select-none flex-shrink-0"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-winter-inventarioStart/10 text-winter-inventarioStart rounded-lg">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-wide flex items-center gap-2 pointer-events-none">
                    REGISTRAR PRODUCTO EN EL MAESTRO
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full font-mono">NUEVO</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium pointer-events-none">
                    Complete la información comercial, código de barras y estrategia de precios.
                  </p>
                </div>
              </div>

              {/* Controles de Ventana (Pausar, Minimizar, Cerrar) */}
              <div className="flex items-center gap-1.5">
                <button 
                  type="button"
                  onClick={handlePauseRegistration}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
                  title="Pausar el registro para hacer otra tarea y retomar después"
                >
                  <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Pausar</span>
                </button>
                <button 
                  type="button"
                  onClick={handlePauseRegistration}
                  className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-200 rounded-lg transition-all"
                  title="Minimizar ventana"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    clearPausedDraft();
                    setShowNewProdModal(false);
                  }} 
                  className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                  title="Cerrar ventana"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Form Body - 2 Columns Grid (4 Cols Izq / 8 Cols Der para máxima prioridad al Auxiliar) */}
            <form onSubmit={handleCreateProduct} className="p-4 overflow-y-auto space-y-3 flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                
                {/* === COLUMNA IZQUIERDA: CÓDIGO, DATOS GENERALES, IMAGEN Y CONTROL DE STOCK (4 Cols) === */}
                <div className="lg:col-span-4 space-y-2.5">
                  
                  {/* Bloque Identificación & Código de Barras */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 space-y-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                        Código / Clave del Producto <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={15}
                        value={newClave.toUpperCase()}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase().slice(0, 15);
                          setNewClave(val);
                          setNewBarcode(val);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 focus:border-winter-inventarioStart focus:outline-none uppercase font-bold shadow-2xs font-mono tracking-wider"
                      />
                    </div>

                    {/* Visor Dinámico de Código de Barras */}
                    <div>
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Vista Previa del Código de Barras (Escaneable)</span>
                      </div>
                      <BarcodeVisualizer
                        value={newBarcode || newClave}
                        description={newDesc}
                        compact={true}
                      />
                    </div>
                  </div>

                  {/* Bloque Datos del Artículo */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 space-y-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                        DESCRIPCIÓN DEL ARTÍCULO <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={newDesc.toUpperCase()}
                        onChange={(e) => setNewDesc(e.target.value.toUpperCase())}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 focus:border-winter-inventarioStart focus:outline-none font-bold uppercase shadow-2xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10.5px] font-bold text-slate-700 block mb-0.5">Categoría</label>
                        <div className="flex gap-1">
                          <select
                            value={newCat}
                            onChange={(e) => setNewCat(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:border-winter-inventarioStart focus:outline-none font-medium shadow-2xs"
                          >
                            {allCategories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              setQuickAddTarget('new');
                              setShowQuickAddModal(true);
                            }}
                            className="bg-winter-inventarioStart hover:bg-winter-inventarioEnd text-white px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                            title="Agregar nueva categoría"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10.5px] font-bold text-slate-700 block mb-0.5">Impuesto IVA</label>
                        <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs select-none shadow-2xs h-[30px]">
                          <label className="flex items-center gap-1 cursor-pointer font-bold text-slate-700 text-xs">
                            <input
                              type="checkbox"
                              checked={newTaxActive}
                              onChange={(e) => setNewTaxActive(e.target.checked)}
                              className="rounded border-slate-300 text-winter-inventarioStart focus:ring-winter-inventarioStart w-3.5 h-3.5"
                            />
                            <span>Sí</span>
                          </label>
                          <input
                            type="text"
                            placeholder="IVA"
                            disabled={!newTaxActive}
                            value={newTaxName}
                            onChange={(e) => setNewTaxName(e.target.value.toUpperCase())}
                            className="w-10 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-[10px] font-bold text-slate-800 uppercase disabled:opacity-40"
                          />
                          <span className="font-bold text-slate-400 text-[10px]">%</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            disabled={!newTaxActive}
                            value={newTaxPct}
                            onChange={(e) => setNewTaxPct(e.target.value)}
                            className="w-9 text-center bg-slate-50 border border-slate-200 rounded px-0.5 py-0.5 font-bold font-mono text-[10px] text-slate-900 disabled:opacity-40"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10.5px] font-bold text-slate-700 block mb-0.5">Forma de Venta</label>
                        <select
                          value={newAGranel ? 'granel' : 'unidad'}
                          onChange={(e) => setNewAGranel(e.target.value === 'granel')}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:border-winter-inventarioStart focus:outline-none font-medium shadow-2xs"
                        >
                          <option value="unidad">Por Unidad</option>
                          <option value="granel">A Granel (Kg)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10.5px] font-bold text-slate-700 block mb-0.5">Vencimiento (Opcional)</label>
                        <input
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={newVencimiento}
                          onChange={(e) => setNewVencimiento(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs text-slate-800 focus:border-winter-inventarioStart focus:outline-none font-mono shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bloque Imagen del Producto */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10.5px] font-bold text-slate-700 uppercase flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        <span>Imagen del Producto (Opcional)</span>
                      </label>
                      {newImageUrl && (
                        <button
                          type="button"
                          onClick={() => setNewImageUrl('')}
                          className="text-[9.5px] text-red-600 hover:text-red-800 font-bold underline cursor-pointer"
                        >
                          Quitar
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-300 flex items-center justify-center flex-shrink-0 overflow-hidden relative shadow-2xs">
                        <div className="text-center p-0.5">
                          <ImageIcon className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                          <span className="text-[6.5px] text-slate-400 font-bold block">Sin Foto</span>
                        </div>
                        {newImageUrl && (
                          <img 
                            key={`new-prod-img-${newImageUrl}`}
                            src={formatImageUrl(newImageUrl)} 
                            alt="Preview" 
                            className="w-full h-full object-cover absolute inset-0 bg-white" 
                            onLoad={(e) => { (e.currentTarget as HTMLElement).style.display = 'block'; }}
                            onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                          />
                        )}
                      </div>

                      <div className="flex-1 space-y-1">
                        <div className="relative flex items-center">
                          <LinkIcon className="w-3 h-3 text-slate-400 absolute left-2" />
                          <input
                            type="text"
                            placeholder="URL de imagen (https://...)"
                            value={newImageUrl}
                            onChange={(e) => setNewImageUrl(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg pl-6 pr-2 py-0.5 text-[10px] text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <label className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[9.5px] font-bold py-0.5 px-2 rounded-md cursor-pointer flex items-center gap-1 transition-all active:scale-95">
                            <UploadCloud className="w-3 h-3 text-slate-600" />
                            <span>{isUploadingManualImage ? 'Subiendo...' : 'Subir'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadImageFile(file, 'new');
                              }}
                            />
                          </label>

                          <button
                            type="button"
                            disabled={isGeneratingAiImage || !newDesc.trim()}
                            onClick={async () => {
                              if (!newDesc.trim()) {
                                showAlert('Escriba una descripción primero para que la IA sepa qué imagen generar.', 'Descripción Requerida', 'warning');
                                return;
                              }
                              setIsGeneratingAiImage(true);
                              try {
                                const res = await fetch(`${getApiBaseUrl()}/ai/generate-product-image`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ description: newDesc, category: newCat, barcode: newBarcode, saveLocal: true })
                                });
                                const data = await res.json();
                                if (data.success && data.imageUrl) {
                                  setNewImageUrl(data.imageUrl);
                                  showToast('✨ Imagen generada con IA para este producto.');
                                } else {
                                  showAlert('No se pudo generar la imagen para este producto.', 'Error IA', 'warning');
                                }
                              } catch (err: any) {
                                showAlert(`Error: ${err.message}`, 'Error IA', 'warning');
                              } finally {
                                setIsGeneratingAiImage(false);
                              }
                            }}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white text-[9.5px] font-bold py-0.5 px-2 rounded-md flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
                            title="Generar imagen automáticamente basada en la descripción"
                          >
                            <Sparkles className="w-3 h-3 text-amber-300" />
                            <span>{isGeneratingAiImage ? 'Generando...' : 'Generar IA'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bloque Control de Inventario y Empaque (Ubicado debajo de las imágenes) */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                      Control de Inventario y Empaque
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {/* Stock Mínimo */}
                      <div className="bg-white border border-slate-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-slate-700 block mb-0.5 whitespace-nowrap">Stock Mínimo</label>
                        <input
                          type="number"
                          min="0"
                          value={newMinStock}
                          onChange={(e) => setNewMinStock(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-xs text-slate-900 focus:outline-none font-mono text-center font-bold"
                        />
                      </div>

                      {/* Cant. Mayorista */}
                      <div className="bg-white border border-slate-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-slate-700 block mb-0.5 whitespace-nowrap">Cant. Mayor</label>
                        <input
                          type="number"
                          min="1"
                          value={newWholesaleQty}
                          onChange={(e) => setNewWholesaleQty(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-xs text-slate-900 focus:outline-none font-mono text-center font-bold"
                        />
                      </div>

                      {/* Cant. por Bulto */}
                      <div className="bg-white border border-amber-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-amber-900 block mb-0.5 whitespace-nowrap">Unids / Bulto</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={newCantBulto}
                          onChange={(e) => setNewCantBulto(e.target.value)}
                          className="w-full bg-slate-50 border border-amber-300 rounded px-1.5 py-1 text-xs text-slate-900 focus:outline-none font-mono text-center font-bold"
                        />
                      </div>
                    </div>
                  </div>

                </div>

                {/* === COLUMNA DERECHA: PRECIOS Y AUXILIAR (8 Cols - Prioridad Máxima 66.7%) === */}
                <div className="lg:col-span-8 space-y-2.5 flex flex-col">
                  
                  {/* AUXILIAR DE CÁLCULO DE PRECIOS */}
                  <div className="flex-shrink-0">
                    <AuxiliarCalculoPrecios
                      initialCost={newCost}
                      initialDetail={newDetail}
                      initialMayor={newMayor}
                      initialBulto={newBulto}
                      cantBulto={parseInt(newCantBulto) || 1}
                      tasaBCV={bcvRateUSD || parseFloat(localStorage.getItem('pos_bcv_usd') || '0') || 0}
                      tasaFallback={tasaDia || parseFloat(localStorage.getItem('pos_tasa_activa') || '0') || 0}
                      taxActive={newTaxActive}
                      taxPct={parseFloat(newTaxPct) || 16}
                      onApplyPrices={({ cost, detail, mayor, bulto }) => {
                        setNewCost(cost);
                        setNewDetail(detail);
                        setNewMayor(mayor);
                        setNewBulto(bulto);
                      }}
                    />
                  </div>

                  {/* ESTRATEGIA DE PRECIOS ($ USD - 4 COLUMNAS ESPACIOSAS) */}
                  <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-2.5 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                      <span>Estrategia de Precios ($ USD)</span>
                      <span className="text-[9px] text-slate-400 font-normal">Jerarquía: Costo &lt; Bulto &lt; Mayor &lt; Detalle</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {/* Costo */}
                      <div className="bg-white border border-yellow-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-amber-800 block mb-0.5 whitespace-nowrap">Precio Costo ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={newCost}
                          onChange={(e) => setNewCost(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-xs text-yellow-700 font-mono font-bold focus:bg-white focus:outline-none"
                        />
                      </div>

                      {/* Detalle */}
                      <div className="bg-white border border-emerald-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-emerald-800 block mb-0.5 whitespace-nowrap">Venta Detalle ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={newDetail}
                          onChange={(e) => setNewDetail(e.target.value)}
                          className="w-full bg-slate-50 border border-emerald-300 rounded px-1.5 py-1 text-xs text-emerald-700 font-mono font-black focus:bg-white focus:outline-none"
                        />
                        <span className="text-[8px] text-slate-400 block mt-0.5 font-mono truncate">
                          {newTaxActive 
                            ? `+IVA: $${((parseFloat(newDetail) || 0) * (1 + (parseFloat(newTaxPct) || 0) / 100)).toFixed(2)}` 
                            : 'Exento'}
                        </span>
                      </div>

                      {/* Mayor */}
                      <div className="bg-white border border-purple-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-purple-800 block mb-0.5 whitespace-nowrap">Precio Mayor ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={newMayor}
                          onChange={(e) => setNewMayor(e.target.value)}
                          className="w-full bg-slate-50 border border-purple-300 rounded px-1.5 py-1 text-xs text-purple-800 font-mono font-bold focus:bg-white focus:outline-none"
                        />
                        <span className="text-[8px] text-slate-400 block mt-0.5 font-mono truncate">
                          {newTaxActive 
                            ? `+IVA: $${((parseFloat(newMayor) || 0) * (1 + (parseFloat(newTaxPct) || 0) / 100)).toFixed(2)}` 
                            : 'Exento'}
                        </span>
                      </div>

                      {/* Bulto */}
                      <div className="bg-white border border-amber-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-amber-900 block mb-0.5 whitespace-nowrap">Bulto / Caja ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={newBulto}
                          onChange={(e) => setNewBulto(e.target.value)}
                          className="w-full bg-slate-50 border border-amber-300 rounded px-1.5 py-1 text-xs text-amber-950 font-mono font-black focus:bg-white focus:outline-none"
                        />
                        <span className="text-[8px] text-amber-700 block mt-0.5 font-bold">
                          Opcional
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* FOOTER ACTIONS */}
              <div className="border-t border-slate-200 pt-2 flex flex-col sm:flex-row justify-between items-center gap-2">
                <span className="text-[10px] text-slate-400">
                  * El producto iniciará con stock 0. Para registrar existencias iniciales, use el botón "Stock / Auditoría".
                </span>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setShowNewProdModal(false)}
                    className="flex-1 sm:flex-none px-4 py-1.5 bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 sm:flex-none px-6 py-1.5 bg-winter-inventarioStart hover:bg-winter-inventarioEnd text-white rounded-xl text-xs font-bold tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    CREAR PRODUCTO
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PRODUCT - 2 Column Responsive Grid, Draggable & Pausable */}
      {showEditProdModal && (
        <div className="fixed inset-0 bg-slate-955/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in font-sans text-slate-800">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden w-full max-w-[1380px] shadow-2xl transition-all duration-300 max-h-[94vh] flex flex-col">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-200 px-6 py-3.5 bg-slate-50 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-slate-200 text-slate-700 rounded-lg">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-wide flex items-center gap-2">
                    MODIFICAR FICHA DE PRODUCTO
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black px-2 py-0.5 rounded-full font-mono">ID: {selectedProduct?.id || '—'}</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Actualice los precios, códigos de barras, empaques y características del artículo.
                  </p>
                </div>
              </div>

              {/* Controles de Ventana (Pausar, Minimizar, Cerrar) */}
              <div className="flex items-center gap-1.5">
                <button 
                  type="button"
                  onClick={handlePauseEdit}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
                  title="Pausar la edición para hacer otra tarea y retomar después"
                >
                  <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Pausar</span>
                </button>
                <button 
                  type="button"
                  onClick={handlePauseEdit}
                  className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-200 rounded-lg transition-all"
                  title="Minimizar ventana"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    clearPausedDraft();
                    setShowEditProdModal(false);
                  }} 
                  className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                  title="Cerrar ventana"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Form Body - 2 Columns Grid (4 Cols Izq / 8 Cols Der para máxima prioridad al Auxiliar) */}
            <form onSubmit={handleUpdateProductSubmit} className="p-4 overflow-y-auto space-y-3 flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                
                {/* === COLUMNA IZQUIERDA: CÓDIGO, DATOS GENERALES, IMAGEN Y CONTROL DE STOCK (4 Cols) === */}
                <div className="lg:col-span-4 space-y-2.5">
                  
                  {/* Bloque Identificación & Código de Barras */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 space-y-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                        Código / Clave del Producto <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={15}
                        value={editClave.toUpperCase()}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase().slice(0, 15);
                          setEditClave(val);
                          setEditBarcode(val);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 focus:border-winter-inventarioStart focus:outline-none uppercase font-bold shadow-2xs font-mono tracking-wider"
                      />
                    </div>

                    {/* Visor Dinámico de Código de Barras */}
                    <div>
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Vista Previa del Código de Barras (Escaneable)</span>
                      </div>
                      <BarcodeVisualizer
                        value={editBarcode || editClave}
                        description={editDesc}
                        compact={true}
                      />
                    </div>
                  </div>

                  {/* Bloque Datos del Artículo */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 space-y-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                        Descripción del Artículo <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={editDesc.toUpperCase()}
                        onChange={(e) => setEditDesc(e.target.value.toUpperCase())}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 focus:border-winter-inventarioStart focus:outline-none font-bold uppercase shadow-2xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10.5px] font-bold text-slate-700 block mb-0.5">Categoría</label>
                        <div className="flex gap-1">
                          <select
                            value={editCat}
                            onChange={(e) => setEditCat(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:border-winter-inventarioStart focus:outline-none font-medium shadow-2xs"
                          >
                            {allCategories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              setQuickAddTarget('edit');
                              setShowQuickAddModal(true);
                            }}
                            className="bg-winter-inventarioStart hover:bg-winter-inventarioEnd text-white px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                            title="Agregar nueva categoría"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10.5px] font-bold text-slate-700 block mb-0.5">Impuesto IVA</label>
                        <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs select-none shadow-2xs h-[30px]">
                          <label className="flex items-center gap-1 cursor-pointer font-bold text-slate-700 text-xs">
                            <input
                              type="checkbox"
                              checked={editTaxActive}
                              onChange={(e) => setEditTaxActive(e.target.checked)}
                              className="rounded border-slate-300 text-winter-inventarioStart focus:ring-winter-inventarioStart w-3.5 h-3.5"
                            />
                            <span>Sí</span>
                          </label>
                          <input
                            type="text"
                            placeholder="IVA"
                            disabled={!editTaxActive}
                            value={editTaxName}
                            onChange={(e) => setEditTaxName(e.target.value.toUpperCase())}
                            className="w-10 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-[10px] font-bold text-slate-800 uppercase disabled:opacity-40"
                          />
                          <span className="font-bold text-slate-400 text-[10px]">%</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            disabled={!editTaxActive}
                            value={editTaxPct}
                            onChange={(e) => setEditTaxPct(e.target.value)}
                            className="w-9 text-center bg-slate-50 border border-slate-200 rounded px-0.5 py-0.5 font-bold font-mono text-[10px] text-slate-900 disabled:opacity-40"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10.5px] font-bold text-slate-700 block mb-0.5">Forma de Venta</label>
                        <select
                          value={editAGranel ? 'granel' : 'unidad'}
                          onChange={(e) => setEditAGranel(e.target.value === 'granel')}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:border-winter-inventarioStart focus:outline-none font-medium shadow-2xs"
                        >
                          <option value="unidad">Por Unidad</option>
                          <option value="granel">A Granel (Kg)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10.5px] font-bold text-slate-700 block mb-0.5">Vencimiento (Opcional)</label>
                        <input
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={editVencimiento}
                          onChange={(e) => setEditVencimiento(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs text-slate-800 focus:border-winter-inventarioStart focus:outline-none font-mono shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bloque Imagen del Producto */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10.5px] font-bold text-slate-700 uppercase flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        <span>Imagen del Producto (Opcional)</span>
                      </label>
                      {editImageUrl && (
                        <button
                          type="button"
                          onClick={() => setEditImageUrl('')}
                          className="text-[9.5px] text-red-600 hover:text-red-800 font-bold underline cursor-pointer"
                        >
                          Quitar
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-300 flex items-center justify-center flex-shrink-0 overflow-hidden relative shadow-2xs">
                        <div className="text-center p-0.5">
                          <ImageIcon className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                          <span className="text-[6.5px] text-slate-400 font-bold block">Sin Foto</span>
                        </div>
                        {editImageUrl && (
                          <img 
                            key={`edit-prod-img-${editImageUrl}`}
                            src={formatImageUrl(editImageUrl)} 
                            alt="Preview" 
                            className="w-full h-full object-cover absolute inset-0 bg-white" 
                            onLoad={(e) => { (e.currentTarget as HTMLElement).style.display = 'block'; }}
                            onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                          />
                        )}
                      </div>

                      <div className="flex-1 space-y-1">
                        <div className="relative flex items-center">
                          <LinkIcon className="w-3 h-3 text-slate-400 absolute left-2" />
                          <input
                            type="text"
                            placeholder="URL de imagen (https://...)"
                            value={editImageUrl}
                            onChange={(e) => setEditImageUrl(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg pl-6 pr-2 py-0.5 text-[10px] text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <label className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[9.5px] font-bold py-0.5 px-2 rounded-md cursor-pointer flex items-center gap-1 transition-all active:scale-95">
                            <UploadCloud className="w-3 h-3 text-slate-600" />
                            <span>{isUploadingManualImage ? 'Subiendo...' : 'Subir'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadImageFile(file, 'edit');
                              }}
                            />
                          </label>

                          <button
                            type="button"
                            disabled={isGeneratingAiImage || !editDesc.trim()}
                            onClick={async () => {
                              if (!editDesc.trim()) {
                                showAlert('Escriba una descripción primero para que la IA sepa qué imagen generar.', 'Descripción Requerida', 'warning');
                                return;
                              }
                              setIsGeneratingAiImage(true);
                              try {
                                const res = await fetch(`${getApiBaseUrl()}/ai/generate-product-image`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ description: editDesc, category: editCat, barcode: editBarcode, saveLocal: true })
                                });
                                const data = await res.json();
                                if (data.success && data.imageUrl) {
                                  setEditImageUrl(data.imageUrl);
                                  showToast('✨ Imagen generada con IA para este producto.');
                                } else {
                                  showAlert('No se pudo generar la imagen para este producto.', 'Error IA', 'warning');
                                }
                              } catch (err: any) {
                                showAlert(`Error: ${err.message}`, 'Error IA', 'warning');
                              } finally {
                                setIsGeneratingAiImage(false);
                              }
                            }}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white text-[9.5px] font-bold py-0.5 px-2 rounded-md flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
                            title="Generar imagen automáticamente basada en la descripción"
                          >
                            <Sparkles className="w-3 h-3 text-amber-300" />
                            <span>{isGeneratingAiImage ? 'Generando...' : 'Generar IA'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bloque Control de Inventario y Empaque (Ubicado debajo de las imágenes) */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                      Control de Inventario y Empaque
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {/* Stock Mínimo */}
                      <div className="bg-white border border-slate-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-slate-700 block mb-0.5 whitespace-nowrap">Stock Mínimo</label>
                        <input
                          type="number"
                          min="0"
                          value={editMinStock}
                          onChange={(e) => setEditMinStock(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-xs text-slate-900 focus:outline-none font-mono text-center font-bold"
                        />
                      </div>

                      {/* Cant. Mayorista */}
                      <div className="bg-white border border-slate-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-slate-700 block mb-0.5 whitespace-nowrap">Cant. Mayor</label>
                        <input
                          type="number"
                          min="1"
                          value={editWholesaleQty}
                          onChange={(e) => setEditWholesaleQty(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-xs text-slate-900 focus:outline-none font-mono text-center font-bold"
                        />
                      </div>

                      {/* Cant. por Bulto */}
                      <div className="bg-white border border-amber-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-amber-900 block mb-0.5 whitespace-nowrap">Unids / Bulto</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={editCantBulto}
                          onChange={(e) => setEditCantBulto(e.target.value)}
                          className="w-full bg-white border border-amber-300 rounded px-1.5 py-1 text-xs text-slate-900 focus:outline-none font-mono text-center font-bold"
                        />
                      </div>
                    </div>
                  </div>

                </div>

                {/* === COLUMNA DERECHA: PRECIOS Y AUXILIAR (8 Cols - Prioridad Máxima 66.7%) === */}
                <div className="lg:col-span-8 space-y-2.5 flex flex-col">
                  
                  {/* AUXILIAR DE CÁLCULO DE PRECIOS */}
                  <div className="flex-shrink-0">
                    <AuxiliarCalculoPrecios
                      initialCost={editCost}
                      initialDetail={editDetail}
                      initialMayor={editMayor}
                      initialBulto={editBulto}
                      cantBulto={parseInt(editCantBulto) || 1}
                      tasaBCV={bcvRateUSD || parseFloat(localStorage.getItem('pos_bcv_usd') || '0') || 0}
                      tasaFallback={tasaDia || parseFloat(localStorage.getItem('pos_tasa_activa') || '0') || 0}
                      taxActive={editTaxActive}
                      taxPct={parseFloat(editTaxPct) || 16}
                      onApplyPrices={({ cost, detail, mayor, bulto }) => {
                        setEditCost(cost);
                        setEditDetail(detail);
                        setEditMayor(mayor);
                        setEditBulto(bulto);
                      }}
                    />
                  </div>

                  {/* ESTRATEGIA DE PRECIOS ($ USD - 4 COLUMNAS ESPACIOSAS) */}
                  <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-2.5 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                      <span>Estrategia de Precios ($ USD)</span>
                      <span className="text-[9px] text-slate-400 font-normal">Jerarquía: Costo &lt; Bulto &lt; Mayor &lt; Detalle</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {/* Costo */}
                      <div className="bg-white border border-yellow-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-amber-800 block mb-0.5 whitespace-nowrap">Precio Costo ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={editCost}
                          onChange={(e) => setEditCost(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-xs text-yellow-700 font-mono font-bold focus:bg-white focus:outline-none"
                        />
                      </div>

                      {/* Detalle */}
                      <div className="bg-white border border-emerald-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-emerald-800 block mb-0.5 whitespace-nowrap">Venta Detalle ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={editDetail}
                          onChange={(e) => setEditDetail(e.target.value)}
                          className="w-full bg-slate-50 border border-emerald-300 rounded px-1.5 py-1 text-xs text-emerald-700 font-mono font-black focus:bg-white focus:outline-none"
                        />
                        <span className="text-[8px] text-slate-400 block mt-0.5 font-mono truncate">
                          {editTaxActive 
                            ? `+IVA: $${((parseFloat(editDetail) || 0) * (1 + (parseFloat(editTaxPct) || 0) / 100)).toFixed(2)}` 
                            : 'Exento'}
                        </span>
                      </div>

                      {/* Mayor */}
                      <div className="bg-white border border-purple-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-purple-800 block mb-0.5 whitespace-nowrap">Precio Mayor ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={editMayor}
                          onChange={(e) => setEditMayor(e.target.value)}
                          className="w-full bg-slate-50 border border-purple-300 rounded px-1.5 py-1 text-xs text-purple-800 font-mono font-bold focus:bg-white focus:outline-none"
                        />
                        <span className="text-[8px] text-slate-400 block mt-0.5 font-mono truncate">
                          {editTaxActive 
                            ? `+IVA: $${((parseFloat(editMayor) || 0) * (1 + (parseFloat(editTaxPct) || 0) / 100)).toFixed(2)}` 
                            : 'Exento'}
                        </span>
                      </div>

                      {/* Bulto */}
                      <div className="bg-white border border-amber-200 rounded-lg p-1.5 shadow-2xs">
                        <label className="text-[9.5px] font-bold text-amber-900 block mb-0.5 whitespace-nowrap">Bulto / Caja ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={editBulto}
                          onChange={(e) => setEditBulto(e.target.value)}
                          className="w-full bg-slate-50 border border-amber-300 rounded px-1.5 py-1 text-xs text-amber-950 font-mono font-black focus:bg-white focus:outline-none"
                        />
                        <span className="text-[8px] text-amber-700 block mt-0.5 font-bold">
                          Opcional
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* FOOTER ACTIONS */}
              <div className="border-t border-slate-200 pt-2 flex flex-col sm:flex-row justify-between items-center gap-2">
                <span className="text-[10px] text-slate-400">
                  * Cambios en precios y empaque se actualizarán inmediatamente en la base de datos.
                </span>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setShowEditProdModal(false)}
                    className="flex-1 sm:flex-none px-4 py-1.5 bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 sm:flex-none px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    GUARDAR CAMBIOS
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DETALLE DE MOVIMIENTO */}
      {selectedMovementDetail && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl flex flex-col">
            <div className="bg-slate-50 border-b border-slate-150 px-5 py-3.5 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-700 tracking-wider uppercase">Detalle del Movimiento</span>
              <button onClick={() => setSelectedMovementDetail(null)} className="text-slate-400 hover:text-slate-700 font-sans">✕</button>
            </div>
            
            <div className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-sans">Fecha / Hora:</span>
                <span className="col-span-2 font-bold text-slate-700">{selectedMovementDetail.date}</span>
              </div>
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-sans">Producto:</span>
                <span className="col-span-2 font-bold text-slate-700 uppercase">
                  {selectedMovementDetail.productDescription} 
                  <span className="block text-[10px] text-slate-450 font-mono mt-0.5">({selectedMovementDetail.productCode})</span>
                </span>
              </div>
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-sans">Tipo:</span>
                <span className="col-span-2">
                  <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${
                    selectedMovementDetail.type === 'Entrada' || selectedMovementDetail.type === 'Entrada Rápida' ? 'text-green-700 bg-green-50 border-green-200' :
                    selectedMovementDetail.type === 'Salida' ? 'text-orange-700 bg-orange-50 border-orange-200' :
                    selectedMovementDetail.type === 'Merma' ? 'text-red-700 bg-red-50 border-red-200 font-bold' :
                    selectedMovementDetail.type.includes('Devoluc') ? 'text-yellow-700 bg-yellow-50 border-yellow-250 font-bold' :
                    'text-blue-700 bg-blue-50 border-blue-200'
                  }`}>
                    {selectedMovementDetail.type}
                  </span>
                </span>
              </div>
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-sans">Cantidad:</span>
                <span className={`col-span-2 font-black font-mono ${selectedMovementDetail.qty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedMovementDetail.qty > 0 ? `+${selectedMovementDetail.qty}` : selectedMovementDetail.qty}
                </span>
              </div>
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-sans">Stock Ant / Post:</span>
                <span className="col-span-2 font-mono text-slate-700">
                  {selectedMovementDetail.stock_anterior} ➜ {selectedMovementDetail.stock_posterior}
                </span>
              </div>
              <div className="grid grid-cols-3 border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-sans">Motivo:</span>
                <span className="col-span-2 text-slate-800 italic font-sans">{selectedMovementDetail.motivo || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-slate-400 font-sans">Operador:</span>
                <span className="col-span-2 font-bold text-slate-700 uppercase">{selectedMovementDetail.usuario}</span>
              </div>
            </div>
            
            <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-150 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMovementDetail(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded text-xs font-sans font-bold transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CARGA MASIVA DE PRODUCTOS */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-slate-800 animate-in fade-in duration-200">
          {bulkImportTab === 'pdf' ? (
            <div className="w-full max-w-5xl space-y-2">
              {/* Tab Selector Bar above Assistant */}
              <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-xl border border-slate-700/60 shadow-lg w-fit">
                <button
                  type="button"
                  onClick={() => setBulkImportTab('pdf')}
                  className="bg-indigo-600 text-white font-black px-4 py-2 rounded-lg text-xs font-sans uppercase tracking-wider flex items-center gap-2 shadow"
                >
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                  🤖 Asistente Inteligente (PDF / POS)
                </button>
                <button
                  type="button"
                  onClick={() => setBulkImportTab('csv')}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-lg text-xs font-sans uppercase tracking-wider flex items-center gap-2 transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  📄 Plantilla CSV Oficial
                </button>
              </div>

              <AsistenteImportacionPDF
                existingCategories={existingCategories}
                existingProducts={products}
                onProcessImport={handleProcessPdfImport}
                onCancel={() => {
                  setShowBulkModal(false);
                  setBulkFile(null);
                  setBulkPreview([]);
                  setBulkErrors([]);
                  setImportStatus('idle');
                }}
              />
            </div>
          ) : (
            <div className="bg-white border border-indigo-200 rounded-xl overflow-hidden w-full max-w-4xl shadow-2xl flex flex-col max-h-[85vh]">
              
              {/* Header with tabs */}
              <div className="bg-indigo-650 text-white px-6 py-3.5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-indigo-900/60 p-1 rounded-lg border border-indigo-400/30">
                    <button
                      type="button"
                      onClick={() => setBulkImportTab('pdf')}
                      className="bg-indigo-800 hover:bg-indigo-700 text-indigo-100 px-3 py-1 rounded text-xs font-bold font-sans flex items-center gap-1.5 transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      🤖 Asistente PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkImportTab('csv')}
                      className="bg-white text-indigo-950 px-3 py-1 rounded text-xs font-black font-sans flex items-center gap-1.5 shadow-sm"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      📄 Plantilla CSV Oficial
                    </button>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkFile(null);
                    setBulkPreview([]);
                    setBulkErrors([]);
                    setImportStatus('idle');
                  }} 
                  className="text-white hover:text-indigo-200 text-lg font-bold font-sans"
                >
                  ✕
                </button>
              </div>

              {/* Content Area */}
              <div className="p-6 overflow-y-auto space-y-5 flex-grow">
                
                {/* Instructions and Template download */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-2 space-y-2 bg-indigo-50 border border-indigo-150 p-4 rounded-lg text-xs leading-relaxed text-indigo-900">
                    <h4 className="font-bold text-[13px] text-indigo-900 font-sans uppercase mb-1">📋 Instrucciones de Importación CSV</h4>
                    <p>1. Descarga la plantilla oficial en formato CSV haciendo clic en el botón de la derecha.</p>
                    <p>2. Abre el archivo en Microsoft Excel o cualquier editor y rellena las columnas con tus productos.</p>
                    <p>3. Los campos <strong className="text-red-700">Obligatorios</strong> son: <strong>Código/Clave</strong>, <strong>Descripción</strong>, <strong>Costo</strong> y <strong>Precio Venta</strong>.</p>
                    <p>4. Valores válidos para <strong>Exento Impuesto</strong> y <strong>A Granel</strong>: escribe <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold font-mono">SI</code> o <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold font-mono">NO</code>.</p>
                    <p>5. Sube el archivo completado en el selector inferior y presiona <strong>Procesar Importación</strong>.</p>
                  </div>
                  
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg flex flex-col justify-center items-center text-center space-y-3">
                    <span className="text-[11px] font-sans font-bold text-slate-500 uppercase tracking-tight">Formato Oficial</span>
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-bold text-xs py-3 px-4 rounded-lg shadow transition-all active:scale-95 flex items-center gap-2 uppercase tracking-wide"
                    >
                      Descargar Plantilla
                    </button>
                    <span className="text-[9px] text-slate-400 font-sans">Compatible con Excel (CSV UTF-8)</span>
                  </div>
                </div>

                {/* Upload Input */}
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-5 flex flex-col justify-center items-center text-center bg-slate-50 hover:bg-slate-100/50 transition-all relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={importStatus === 'importing'}
                  />
                  <Upload className="w-8 h-8 text-slate-400 mb-2" />
                  <span className="text-xs font-sans font-bold text-slate-700">
                    {bulkFile ? `Archivo seleccionado: ${bulkFile.name}` : 'Seleccione o arrastre el archivo CSV con la lista de productos aquí'}
                  </span>
                  <span className="text-[10px] text-slate-450 font-sans mt-1">Límite máximo recomendado: 1000 productos por carga</span>
                </div>

                {/* Errors Display */}
                {bulkErrors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg text-[11px] space-y-1 font-sans">
                    <h5 className="font-extrabold uppercase text-red-900">⚠️ Errores de Validación Encontrados:</h5>
                    <div className="max-h-24 overflow-y-auto space-y-0.5">
                      {bulkErrors.map((err, idx) => (
                        <div key={idx} className="font-mono">{err}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview Table */}
                {bulkPreview.length > 0 && bulkErrors.length === 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-sans font-bold text-slate-655 uppercase">Vista Previa de Productos a Importar ({bulkPreview.length}):</span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-255 px-2 py-0.5 rounded text-[10px] uppercase font-sans">Listo para procesar</span>
                    </div>
                    <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-[10.5px]">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase font-sans font-bold">
                            <th className="p-2 font-mono">Código</th>
                            <th className="p-2">Descripción</th>
                            <th className="p-2">Categoría</th>
                            <th className="p-2 text-right">Existencia</th>
                            <th className="p-2 text-right">Min. Stock</th>
                            <th className="p-2 text-right">Costo</th>
                            <th className="p-2 text-right">Venta Detalle</th>
                            <th className="p-2 text-right">Venta Mayor</th>
                            <th className="p-2 text-center">Mayorista</th>
                            <th className="p-2 text-center">A Granel</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkPreview.map((p, idx) => (
                            <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="p-2 font-mono font-bold text-slate-600">{p.barcode}</td>
                              <td className="p-2 font-bold text-slate-800 uppercase">{p.description}</td>
                              <td className="p-2 text-slate-500">{p.category}</td>
                              <td className="p-2 text-right font-mono font-bold text-slate-700">{p.stock_actual}</td>
                              <td className="p-2 text-right font-mono text-slate-500">{p.stock_minimo}</td>
                              <td className="p-2 text-right font-mono text-slate-600">${p.precio_costo_usd.toFixed(2)}</td>
                              <td className="p-2 text-right font-mono font-bold text-emerald-600">${p.precio_detalle_usd.toFixed(2)}</td>
                              <td className="p-2 text-right font-mono text-slate-600">${p.precio_mayor_usd.toFixed(2)}</td>
                              <td className="p-2 text-center font-sans text-slate-500 font-bold">{p.cantidad_mayorista} un.</td>
                              <td className="p-2 text-center">
                                {p.a_granel ? (
                                  <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.2 text-[9px] font-bold uppercase">SI</span>
                                ) : (
                                  <span className="text-slate-400">NO</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkFile(null);
                    setBulkPreview([]);
                    setBulkErrors([]);
                    setImportStatus('idle');
                  }}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2.5 rounded-lg text-xs font-sans font-bold transition-all"
                  disabled={importStatus === 'importing'}
                >
                  Cerrar
                </button>

                <button
                  type="button"
                  onClick={handleExecuteBulkImport}
                  disabled={bulkPreview.length === 0 || bulkErrors.length > 0 || importStatus === 'importing' || importStatus === 'success'}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-sans font-bold text-xs py-2.5 px-6 rounded-lg shadow-sm uppercase tracking-wide transition-all active:scale-95"
                >
                  {importStatus === 'importing' ? 'Procesando Carga...' :
                   importStatus === 'success' ? '✓ ¡Importado con Éxito!' : 'Procesar Importación'}
                </button>
              </div>

            </div>
          )}
        </div>
      )}

      {/* CATEGORIES MODAL */}
      {showCategoriesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-650 to-violet-755 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="text-sm font-extrabold uppercase tracking-wider font-mono flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Gestión de Categorías
              </h3>
              <button 
                onClick={() => {
                  setShowCategoriesModal(false);
                  setEditingCategory(null);
                  setNewCategoryName('');
                }} 
                className="text-white/80 hover:text-white text-base focus:outline-none"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-grow">
              {/* Form Create */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono block">Crear Nueva Categoría</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Escriba el nombre..."
                    className="flex-grow bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-violet-600 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateCategory();
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    className="bg-violet-600 hover:bg-violet-700 text-white font-bold font-mono px-4 py-2 rounded-lg text-xs transition-all flex items-center justify-center shadow-sm"
                  >
                    + Agregar
                  </button>
                </div>
              </div>

              {/* Categories list */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono block">Categorías Existentes</label>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[40vh] overflow-y-auto bg-slate-50/50">
                  {allCategories.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs italic">
                      No hay categorías registradas en el sistema.
                    </div>
                  ) : (
                    allCategories.map(cat => {
                      const activeCount = products.filter(p => (p.category || '').trim().toUpperCase() === cat && p.estado === 'Activo').length;
                      const isEditing = editingCategory === cat;

                      return (
                        <div key={cat} className="p-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50/40 transition-colors">
                          {isEditing ? (
                            <div className="flex gap-2 flex-grow">
                              <input
                                type="text"
                                value={editingCategoryName}
                                onChange={(e) => setEditingCategoryName(e.target.value)}
                                className="flex-grow bg-slate-50 border border-slate-350 rounded px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:outline-none"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameCategory(cat);
                                }}
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleRenameCategory(cat)}
                                className="text-emerald-600 hover:text-emerald-700 font-bold text-xs uppercase"
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCategory(null)}
                                className="text-slate-400 hover:text-slate-500 font-bold text-xs uppercase"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-800 uppercase">{cat}</span>
                                <span className="text-[9px] font-semibold text-slate-450 font-sans mt-0.5">
                                  {activeCount === 0 ? 'Sin productos activos' : `${activeCount} prod. activos`}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCategory(cat);
                                    setEditingCategoryName(cat);
                                  }}
                                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded hover:bg-slate-100 transition-all"
                                  title="Renombrar categoría"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(cat)}
                                  disabled={activeCount > 0}
                                  className={`p-1.5 rounded transition-all ${
                                    activeCount > 0
                                      ? 'text-slate-200 cursor-not-allowed'
                                      : 'text-red-500 hover:text-red-750 hover:bg-red-50'
                                  }`}
                                  title={activeCount > 0 ? 'No se puede eliminar una categoría con productos activos' : 'Eliminar categoría'}
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowCategoriesModal(false);
                  setEditingCategory(null);
                  setNewCategoryName('');
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2 rounded-lg text-xs font-sans font-bold transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ADD CATEGORY MODAL */}
      {showQuickAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-3 flex justify-between items-center text-white">
              <h3 className="text-xs font-extrabold uppercase tracking-wider font-mono flex items-center gap-2">
                <Tag className="w-3.5 h-3.5" />
                Nueva Categoría
              </h3>
              <button 
                onClick={() => {
                  setShowQuickAddModal(false);
                  setQuickAddName('');
                }} 
                className="text-white/80 hover:text-white text-base focus:outline-none"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono block">Nombre de la Categoría</label>
                <input
                  type="text"
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder="Ej: BEBIDAS FRÍAS..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleExecuteQuickAdd();
                    }
                  }}
                  autoFocus
                />
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowQuickAddModal(false);
                  setQuickAddName('');
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-[11px] font-sans font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteQuickAdd}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-[11px] font-sans font-bold transition-all"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ASISTENTE INTELIGENTE DE CORRECCIÓN DE VIOLACIONES DE MARGEN */}
      {showViolationAssistantModal && (() => {
        const targetProducts = getGeneralAdjustTargetProducts();
        
        // Compute current preview items & find violations
        const violatingItems = targetProducts.map(p => {
          const override = customPriceOverrides[p.id];
          const nextCost = override?.cost !== undefined ? override.cost : (generalAdjustCost ? computePriceChange(p.precio_costo_usd) : p.precio_costo_usd);
          const nextDetail = override?.detail !== undefined ? override.detail : (generalAdjustDetail ? computePriceChange(p.precio_detalle_usd) : p.precio_detalle_usd);
          const nextMayor = override?.mayor !== undefined ? override.mayor : (generalAdjustMayor ? computePriceChange(p.precio_mayor_usd) : p.precio_mayor_usd);
          
          const violates = nextDetail <= nextCost || nextMayor <= nextCost;
          const detailMarginPct = nextCost > 0 ? ((nextDetail - nextCost) / nextCost) * 100 : 0;
          const mayorMarginPct = nextCost > 0 ? ((nextMayor - nextCost) / nextCost) * 100 : 0;
          
          return {
            p,
            nextCost,
            nextDetail,
            nextMayor,
            violates,
            detailMarginPct,
            mayorMarginPct
          };
        }).filter(item => item.violates);

        const applyAutoMarginStrategy = (detailPct: number, mayorPct: number) => {
          const newOverrides = { ...customPriceOverrides };
          violatingItems.forEach(({ p, nextCost }) => {
            const safeCost = nextCost > 0 ? nextCost : p.precio_costo_usd;
            const targetDetail = Number((safeCost * (1 + detailPct / 100)).toFixed(4));
            const targetMayor = Number((safeCost * (1 + mayorPct / 100)).toFixed(4));

            newOverrides[p.id] = {
              ...(newOverrides[p.id] || {}),
              cost: safeCost,
              detail: targetDetail,
              mayor: targetMayor
            };
          });
          setCustomPriceOverrides(newOverrides);
          showToast(`✨ Se ajustaron ${violatingItems.length} productos con un margen de +${detailPct}% Detalle y +${mayorPct}% Mayor.`);
        };

        return (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[95] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200 font-sans">
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 px-6 py-4 flex justify-between items-center text-slate-950 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-slate-950/10 rounded-xl">
                    <Wand2 className="w-5 h-5 text-slate-950" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider font-mono text-slate-950">
                      Asistente Inteligente de Margen y Violaciones
                    </h3>
                    <p className="text-[11px] text-slate-900 font-medium">
                      Ayudante interactivo para resolver precios de venta menores o iguales al costo.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowViolationAssistantModal(false)}
                  className="text-slate-950/80 hover:text-slate-950 text-base font-bold focus:outline-none"
                >
                  ✕
                </button>
              </div>

              {/* Status Banner */}
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0" />
                  <span className="text-xs text-amber-950 font-bold">
                    {violatingItems.length === 0 ? (
                      <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ¡Excelente! No quedan violaciones de precio. Puede aplicar el ajuste.
                      </span>
                    ) : (
                      <span>Quedan <strong className="font-mono underline font-black text-amber-900">{violatingItems.length} violaciones</strong> pendientes por corregir.</span>
                    )}
                  </span>
                </div>

                {Object.keys(customPriceOverrides).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCustomPriceOverrides({})}
                    className="text-[11px] text-red-700 hover:text-red-800 font-bold flex items-center gap-1 bg-red-100/60 px-2.5 py-1 rounded-md transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restablecer Correcciones
                  </button>
                )}
              </div>

              {/* Body Section */}
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left Column: Quick Action Strategies */}
                <div className="w-2/5 p-5 border-r border-slate-200 overflow-y-auto space-y-4 bg-slate-50/50">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono block">Estrategias Rápidas de Corrección</label>
                  
                  {/* Strategy 1: Standard Margins */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs hover:border-amber-400 transition-all">
                    <span className="font-extrabold text-xs text-slate-800 block flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      Margen Recomendado (+30% / +15%)
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Aplica automáticamente un +30% sobre el costo para Venta Detalle y +15% para Venta Mayor a todos los productos violados.
                    </p>
                    <button
                      type="button"
                      disabled={violatingItems.length === 0}
                      onClick={() => applyAutoMarginStrategy(30, 15)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2 rounded-lg text-xs font-sans transition-all shadow-xs"
                    >
                      ⚡ Aplicar (+30% Detalle / +15% Mayor)
                    </button>
                  </div>

                  {/* Strategy 2: Custom Margins */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs hover:border-amber-400 transition-all">
                    <span className="font-extrabold text-xs text-slate-800 block flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-amber-600" />
                      Margen Personalizado (%)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-slate-500 font-bold block mb-1">Margen Detalle %</label>
                        <input
                          type="number"
                          value={assistantDetailMargin}
                          onChange={(e) => setAssistantDetailMargin(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-500 font-bold block mb-1">Margen Mayor %</label>
                        <input
                          type="number"
                          value={assistantMayorMargin}
                          onChange={(e) => setAssistantMayorMargin(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={violatingItems.length === 0}
                      onClick={() => {
                        const dPct = parseFloat(assistantDetailMargin) || 30;
                        const mPct = parseFloat(assistantMayorMargin) || 15;
                        applyAutoMarginStrategy(dPct, mPct);
                      }}
                      className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-extrabold py-2 rounded-lg text-xs font-sans transition-all shadow-xs"
                    >
                      🎯 Aplicar Margen Personalizado
                    </button>
                  </div>
                </div>

                {/* Right Column: Inspection Table */}
                <div className="w-3/5 p-5 flex flex-col overflow-hidden bg-white">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono">
                      Inspector de Productos con Violación ({violatingItems.length})
                    </label>
                  </div>

                  <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden flex flex-col min-h-0 shadow-inner">
                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-100 text-[10px] uppercase text-slate-500 font-mono sticky top-0 z-10 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2 w-[35%]">Producto</th>
                            <th className="px-2 py-2 text-right w-[18%]">Costo $</th>
                            <th className="px-2 py-2 text-right w-[23%]">Detalle $</th>
                            <th className="px-2 py-2 text-right w-[24%]">Mayor $</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {violatingItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-12 text-center text-slate-400 font-sans italic">
                                🎉 No hay violaciones pendientes en este momento.
                              </td>
                            </tr>
                          ) : (
                            violatingItems.map(({ p, nextCost, nextDetail, nextMayor, detailMarginPct }) => {
                              const hasLocalOverride = customPriceOverrides[p.id] !== undefined;

                              return (
                                <tr key={p.id} className={`hover:bg-slate-50 ${hasLocalOverride ? 'bg-emerald-50/30' : 'bg-red-50/40'}`}>
                                  <td className="px-3 py-2 font-sans">
                                    <p className="font-bold text-slate-800 text-xs truncate max-w-[140px]" title={p.description}>
                                      {p.description}
                                    </p>
                                    <span className="text-[9px] text-slate-400 font-mono block">{p.barcode}</span>
                                    <span className={`inline-block text-[9px] font-extrabold px-1.5 py-0.2 rounded font-mono mt-0.5 ${
                                      detailMarginPct <= 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                                    }`}>
                                      Margen: {detailMarginPct.toFixed(1)}%
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() => setAssistantAuxProduct(p)}
                                        className="bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 p-1 rounded transition-all flex-shrink-0 active:scale-95"
                                        title="Abrir Auxiliar de Cálculo de Precios para calcular costo por factura, paquete o divisas"
                                      >
                                        <Calculator className="w-3.5 h-3.5 text-amber-700" />
                                      </button>
                                      <input
                                        type="number"
                                        step="any"
                                        value={nextCost}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setCustomPriceOverrides(prev => ({
                                            ...prev,
                                            [p.id]: {
                                              ...(prev[p.id] || {}),
                                              cost: val,
                                              detail: nextDetail,
                                              mayor: nextMayor
                                            }
                                          }));
                                        }}
                                        className="w-16 text-right text-xs font-mono font-bold border border-slate-300 rounded px-1.5 py-0.5 focus:bg-white focus:outline-none"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <input
                                      type="number"
                                      step="any"
                                      value={nextDetail}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setCustomPriceOverrides(prev => ({
                                          ...prev,
                                          [p.id]: {
                                            ...(prev[p.id] || {}),
                                            cost: nextCost,
                                            detail: val,
                                            mayor: nextMayor
                                          }
                                        }));
                                      }}
                                      className={`w-16 text-right text-xs font-mono font-bold border rounded px-1.5 py-0.5 focus:bg-white focus:outline-none ${
                                        nextDetail <= nextCost ? 'border-red-500 bg-red-50 text-red-700' : 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <input
                                      type="number"
                                      step="any"
                                      value={nextMayor}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setCustomPriceOverrides(prev => ({
                                          ...prev,
                                          [p.id]: {
                                            ...(prev[p.id] || {}),
                                            cost: nextCost,
                                            detail: nextDetail,
                                            mayor: val
                                          }
                                        }));
                                      }}
                                      className={`w-16 text-right text-xs font-mono font-bold border rounded px-1.5 py-0.5 focus:bg-white focus:outline-none ${
                                        nextMayor <= nextCost ? 'border-red-500 bg-red-50 text-red-700' : 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                      }`}
                                    />
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
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center text-xs">
                <span className="text-slate-500 font-mono text-[11px]">
                  Al cerrar esta ventana, los precios ajustados se reflejarán en el resumen global para poder aplicar el cambio.
                </span>
                <button
                  type="button"
                  onClick={() => setShowViolationAssistantModal(false)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-lg font-sans transition-all shadow-md active:scale-95"
                >
                  Confirmar Correcciones
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* AUXILIAR DE CÁLCULO DE PRECIOS DESDE EL ASISTENTE DE VIOLACIONES */}
      {assistantAuxProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto font-sans">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-sm font-black uppercase text-slate-800 font-mono flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-amber-600" />
                  Auxiliar de Cálculo de Precios — {assistantAuxProduct.description}
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">Código / Clave: {assistantAuxProduct.barcode}</span>
              </div>
              <button
                type="button"
                onClick={() => setAssistantAuxProduct(null)}
                className="text-slate-400 hover:text-slate-700 text-base font-bold"
              >
                ✕
              </button>
            </div>

            <AuxiliarCalculoPrecios
              tasaBCV={bcvRateUSD}
              tasaFallback={tasaDia}
              initialCost={
                (customPriceOverrides[assistantAuxProduct.id]?.cost !== undefined
                  ? customPriceOverrides[assistantAuxProduct.id]?.cost ?? 0
                  : assistantAuxProduct.precio_costo_usd
                ).toString()
              }
              initialDetail={
                (customPriceOverrides[assistantAuxProduct.id]?.detail !== undefined
                  ? customPriceOverrides[assistantAuxProduct.id]?.detail ?? 0
                  : assistantAuxProduct.precio_detalle_usd
                ).toString()
              }
              initialMayor={
                (customPriceOverrides[assistantAuxProduct.id]?.mayor !== undefined
                  ? customPriceOverrides[assistantAuxProduct.id]?.mayor ?? 0
                  : assistantAuxProduct.precio_mayor_usd
                ).toString()
              }
              onApplyPrices={(prices) => {
                const costVal = parseFloat(prices.cost) || 0;
                const detailVal = parseFloat(prices.detail) || 0;
                const mayorVal = parseFloat(prices.mayor) || 0;

                setCustomPriceOverrides(prev => ({
                  ...prev,
                  [assistantAuxProduct.id]: {
                    cost: costVal,
                    detail: detailVal,
                    mayor: mayorVal
                  }
                }));

                setAssistantAuxProduct(null);
                showToast(`✅ Precios y costo calculados y aplicados a "${assistantAuxProduct.description}".`);
              }}
            />

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setAssistantAuxProduct(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs font-sans"
              >
                Cancelar / Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AJUSTE MASIVO DE STOCK FÍSICO (SOLO ADMINISTRADOR) */}
      {showBulkStockAdjustModal && (() => {
        if (_currentUser.rol.toLowerCase() !== 'administrador') {
          return null;
        }

        const filteredTargetProducts = products.filter(p => {
          const matchScope = bulkStockScope === 'todos' || (p.category && p.category.toUpperCase() === bulkStockCategory.toUpperCase());
          const matchSearch = p.description.toLowerCase().includes(bulkStockSearch.toLowerCase()) || p.barcode.toLowerCase().includes(bulkStockSearch.toLowerCase());
          return matchScope && matchSearch;
        });

        // Compute items with diffs
        const itemsWithDiffs = filteredTargetProducts.map(p => {
          const inputVal = bulkStockCounts[p.id];
          const hasInput = inputVal !== undefined && inputVal !== '';
          const realStock = hasInput ? parseFloat(inputVal) || 0 : p.stock_actual;
          const diff = realStock - p.stock_actual;

          return {
            p,
            realStock,
            diff,
            hasInput,
            isChanged: hasInput && Math.abs(diff) > 0.0001
          };
        });

        const changedItems = itemsWithDiffs.filter(i => i.isChanged);
        const countEntradas = changedItems.filter(i => i.diff > 0).length;
        const countSalidas = changedItems.filter(i => i.diff < 0).length;

        const handlePopulateWithCurrentStock = () => {
          const newCounts: { [id: number]: string } = {};
          filteredTargetProducts.forEach(p => {
            newCounts[p.id] = p.stock_actual.toString();
          });
          setBulkStockCounts(newCounts);
          showToast('📋 Se rellenaron las casillas con el stock actual del sistema.');
        };

        const handleApplyBulkStockAdjust = async () => {
          if (!bulkStockReason.trim()) {
            showAlert('Debe ingresar un motivo u observación obligatoria para la toma de inventario.', 'Motivo Requerido', 'warning');
            return;
          }

          if (changedItems.length === 0) {
            showAlert('No ha realizado cambios en el stock físico de ningún producto.', 'Sin Cambios', 'info');
            return;
          }

          const ok = await showConfirm(
            `¿Confirma aplicar el ajuste físico de stock a los ${changedItems.length} productos modificados? (${countEntradas} Entradas / ${countSalidas} Salidas)`,
            'Confirmar Ajuste Masivo de Stock',
            { confirmLabel: 'Aplicar Ajuste Físico' }
          );
          if (!ok) return;

          let successCount = 0;
          for (const { p, diff, realStock } of changedItems) {
            const type = diff > 0 ? 'Entrada' : 'Salida';
            const absQty = Math.abs(diff);

            // Execute single stock update which logs Kardex movement
            await onUpdateProductStock(p.id, type, absQty, `${bulkStockReason.trim()} (Stock Físico Real: ${realStock})`);
            successCount++;
          }

          setShowBulkStockAdjustModal(false);
          setBulkStockCounts({});
          setBulkStockReason('Toma de inventario físico de stock');
          showToast(`✅ Ajuste físico de stock aplicado con éxito a ${successCount} productos.`);
        };

        return (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[91] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full h-[88vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200 font-sans">
              {/* Header */}
              <div className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-cyan-800 px-6 py-4 flex justify-between items-center text-white shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-white/10 rounded-xl">
                    <RefreshCw className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider font-mono text-white flex items-center gap-2">
                      Ajuste Masivo de Stock Físico (Inventario Físico)
                      <span className="bg-amber-400 text-slate-950 text-[10px] px-2 py-0.5 rounded-full font-mono font-black">SOLO ADMINISTRADOR 👑</span>
                    </h3>
                    <p className="text-[11px] text-cyan-100 font-medium">
                      Modifique el stock real contado en almacén de forma simultánea para múltiples productos.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowBulkStockAdjustModal(false)}
                  className="text-white/80 hover:text-white text-base font-bold focus:outline-none"
                >
                  ✕
                </button>
              </div>

              {/* Filters & Actions Bar */}
              <div className="bg-slate-100 border-b border-slate-200 px-6 py-3 flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-3">
                  {/* Scope filter */}
                  <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => setBulkStockScope('todos')}
                      className={`px-3 py-1 rounded text-xs font-extrabold font-sans transition-all ${
                        bulkStockScope === 'todos' ? 'bg-cyan-600 text-white shadow' : 'text-slate-650 hover:bg-slate-100'
                      }`}
                    >
                      Todos ({products.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkStockScope('categoria')}
                      className={`px-3 py-1 rounded text-xs font-extrabold font-sans transition-all ${
                        bulkStockScope === 'categoria' ? 'bg-cyan-600 text-white shadow' : 'text-slate-650 hover:bg-slate-100'
                      }`}
                    >
                      Por Categoría
                    </button>
                  </div>

                  {bulkStockScope === 'categoria' && (
                    <select
                      value={bulkStockCategory}
                      onChange={(e) => setBulkStockCategory(e.target.value)}
                      className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none"
                    >
                      {allCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  )}

                  {/* Search */}
                  <div className="relative w-64">
                    <input
                      type="text"
                      placeholder="Buscar por código o descripción..."
                      value={bulkStockSearch}
                      onChange={(e) => setBulkStockSearch(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 pl-8 text-xs text-slate-800 focus:outline-none focus:border-cyan-600 font-sans"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePopulateWithCurrentStock}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-3 py-1.5 rounded-lg text-xs font-sans transition-all"
                    title="Copia el stock actual a las casillas para modificar solo las diferencias"
                  >
                    📋 Copiar Stock Actual a Todos
                  </button>

                  {Object.keys(bulkStockCounts).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBulkStockCounts({})}
                      className="text-[11px] text-red-700 hover:text-red-800 font-bold bg-red-100/70 px-2.5 py-1.5 rounded-lg transition-all"
                    >
                      Limpiar Conteo
                    </button>
                  )}
                </div>
              </div>

              {/* Table Section */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex flex-col min-h-0">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] uppercase font-mono font-extrabold text-slate-450 tracking-wider">
                    Conteo Físico de Productos ({filteredTargetProducts.length} Mostrados)
                  </span>
                  {changedItems.length > 0 && (
                    <span className="text-xs font-extrabold font-mono bg-cyan-100 text-cyan-900 px-3 py-1 rounded-full border border-cyan-200">
                      Modificados: {changedItems.length} ({countEntradas} Entradas / {countSalidas} Salidas)
                    </span>
                  )}
                </div>

                <div className="flex-1 border border-slate-250 rounded-xl overflow-hidden bg-white shadow-inner flex flex-col min-h-0">
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-[10px] uppercase text-slate-500 font-mono sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 w-[30%]">Producto</th>
                          <th className="px-2 py-2.5 w-[15%]">Categoría</th>
                          <th className="px-2 py-2.5 text-right w-[18%]">Stock Sistema</th>
                          <th className="px-2 py-2.5 text-right w-[20%]">Stock Físico (Conteo)</th>
                          <th className="px-3 py-2.5 text-right w-[17%]">Diferencia</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {filteredTargetProducts.map(p => {
                          const inputVal = bulkStockCounts[p.id];
                          const hasInput = inputVal !== undefined && inputVal !== '';
                          const realStock = hasInput ? parseFloat(inputVal) || 0 : p.stock_actual;
                          const diff = realStock - p.stock_actual;
                          const isChanged = hasInput && Math.abs(diff) > 0.0001;

                          return (
                            <tr key={p.id} className={`hover:bg-slate-50 ${isChanged ? (diff > 0 ? 'bg-emerald-50/50' : 'bg-red-50/50') : ''}`}>
                              <td className="px-3 py-2">
                                <p className="font-bold text-slate-800 truncate max-w-[220px]" title={p.description}>
                                  {p.description}
                                </p>
                                <span className="text-[9px] text-slate-400 font-mono block">{p.barcode}</span>
                              </td>

                              <td className="px-2 py-2">
                                <span className="bg-slate-100 text-slate-700 font-bold text-[10px] px-2 py-0.5 rounded-full font-mono">
                                  {p.category || 'SIN CATEGORIA'}
                                </span>
                              </td>

                              <td className="px-2 py-2 text-right font-mono font-black text-slate-700">
                                {formatStockVal(p.stock_actual, p.a_granel)} {p.a_granel ? 'kg' : 'uds'}
                              </td>

                              <td className="px-2 py-2 text-right">
                                <input
                                  type="number"
                                  step={p.a_granel ? '0.001' : '1'}
                                  placeholder={p.stock_actual.toString()}
                                  value={inputVal !== undefined ? inputVal : ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setBulkStockCounts(prev => ({
                                      ...prev,
                                      [p.id]: val
                                    }));
                                  }}
                                  className={`w-24 text-right text-xs font-mono font-bold border rounded px-2 py-1 focus:bg-white focus:outline-none ${
                                    isChanged ? (diff > 0 ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-red-500 bg-red-50 text-red-900') : 'border-slate-300 text-slate-800'
                                  }`}
                                />
                              </td>

                              <td className="px-3 py-2 text-right font-mono">
                                {isChanged ? (
                                  <span className={`font-black text-xs px-2 py-0.5 rounded ${
                                    diff > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                  }`}>
                                    {diff > 0 ? `+${diff.toFixed(p.a_granel ? 3 : 0)} (Entrada)` : `${diff.toFixed(p.a_granel ? 3 : 0)} (Salida)`}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[11px] font-bold">0.00 (Sin cambio)</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3 text-xs">
                <div className="flex flex-col">
                  <label className="text-[10px] uppercase font-mono font-extrabold text-slate-400">Motivo u Observación del Ajuste</label>
                  <input
                    type="text"
                    value={bulkStockReason}
                    onChange={(e) => setBulkStockReason(e.target.value)}
                    placeholder="Escriba la razón de la toma física (Obligatorio)..."
                    className="bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 font-sans focus:outline-none focus:border-cyan-600 w-80 mt-0.5"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBulkStockAdjustModal(false)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-lg font-bold font-sans transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyBulkStockAdjust}
                    disabled={changedItems.length === 0 || !bulkStockReason.trim()}
                    className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 disabled:text-slate-400 text-white font-black px-6 py-2.5 rounded-lg font-sans transition-all shadow-md active:scale-95 flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Aplicar Ajuste Físico ({changedItems.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL ASISTENTE INTELIGENTE DE AUDITORÍA Y CALIDAD DE CATÁLOGO */}
      {showCatalogAuditModal && (() => {
        const filteredIssues = catalogAuditIssues.filter(item => {
          if (auditFilterTab === 'sin_precios') return item.zeroOrInvalidPrices;
          if (auditFilterTab === 'sin_categoria') return item.missingCategory;
          if (auditFilterTab === 'sin_codigo') return item.missingBarcode;
          if (auditFilterTab === 'sin_descripcion') return item.missingDescription;
          if (auditFilterTab === 'sin_stock_min') return item.missingStockMin;
          return true;
        });

        const countSinPrecios = catalogAuditIssues.filter(i => i.zeroOrInvalidPrices).length;
        const countZeroCost = catalogAuditIssues.filter(i => i.zeroCost).length;
        const countSinCat = catalogAuditIssues.filter(i => i.missingCategory).length;
        const countSinCod = catalogAuditIssues.filter(i => i.missingBarcode).length;
        const countSinDesc = catalogAuditIssues.filter(i => i.missingDescription).length;
        const countSinMin = catalogAuditIssues.filter(i => i.missingStockMin).length;

        const countPricelessWithCost = catalogAuditIssues.filter(i => i.currentCost > 0 && (i.zeroDetail || i.zeroMayor || i.currentDetail <= i.currentCost)).length;

        const handleApplyAutoMarginToPriceless = (detailMargin = 30, mayorMargin = 15, bultoMargin = 8) => {
          const newEdits = { ...editedAuditProducts };
          let count = 0;
          catalogAuditIssues.forEach(({ product, currentCost, zeroDetail, zeroMayor, currentDetail }) => {
            if (currentCost > 0 && (zeroDetail || zeroMayor || currentDetail <= currentCost)) {
              const newDetail = Number((currentCost * (1 + detailMargin / 100)).toFixed(2));
              const newMayor = Number((currentCost * (1 + mayorMargin / 100)).toFixed(2));
              const newBulto = ((product.cant_bulto || 0) > 0) ? Number((currentCost * (1 + bultoMargin / 100)).toFixed(2)) : (product.precio_bulto_usd || 0);
              newEdits[product.id] = {
                ...(newEdits[product.id] || {}),
                precio_costo_usd: currentCost,
                precio_detalle_usd: newDetail,
                precio_mayor_usd: newMayor,
                precio_bulto_usd: newBulto
              };
              count++;
            }
          });
          setEditedAuditProducts(newEdits);
          showToast(`⚡ Se calcularon precios (+${detailMargin}% Detalle / +${mayorMargin}% Mayor / +${bultoMargin}% Bulto) para ${count} productos con costo existente.`);
        };

        const handleApplyDefaultCostAndMargins = () => {
          const baseCost = parseFloat(auditDefaultCost) || 1.0;
          const dMargin = parseFloat(auditDefaultDetailMargin) || 30;
          const mMargin = parseFloat(auditDefaultMayorMargin) || 15;
          const bMargin = parseFloat(auditDefaultBultoMargin) || 8;
          const newDetail = Number((baseCost * (1 + dMargin / 100)).toFixed(2));
          const newMayor = Number((baseCost * (1 + mMargin / 100)).toFixed(2));

          const newEdits = { ...editedAuditProducts };
          let count = 0;
          catalogAuditIssues.forEach(({ product, currentCost }) => {
            if (currentCost <= 0) {
              const newBulto = ((product.cant_bulto || 0) > 0) ? Number((baseCost * (1 + bMargin / 100)).toFixed(2)) : (product.precio_bulto_usd || 0);
              newEdits[product.id] = {
                ...(newEdits[product.id] || {}),
                precio_costo_usd: baseCost,
                precio_detalle_usd: newDetail,
                precio_mayor_usd: newMayor,
                precio_bulto_usd: newBulto
              };
              count++;
            }
          });
          setEditedAuditProducts(newEdits);
          showToast(`⚡ Se asignó Costo $${baseCost.toFixed(2)}, Detalle $${newDetail.toFixed(2)} y Mayor $${newMayor.toFixed(2)} a ${count} productos.`);
        };

        const handleApplyBulkDefaultCategory = () => {
          if (!auditDefaultCategory.trim()) return;
          const newEdits = { ...editedAuditProducts };
          catalogAuditIssues.forEach(({ product, missingCategory }) => {
            if (missingCategory) {
              newEdits[product.id] = {
                ...(newEdits[product.id] || {}),
                category: auditDefaultCategory.trim().toUpperCase()
              };
            }
          });
          setEditedAuditProducts(newEdits);
          showToast(`⚡ Asignada la categoría "${auditDefaultCategory}" a los productos sin categoría.`);
        };

        const handleApplyBulkDefaultStockMin = () => {
          const val = parseFloat(auditDefaultStockMin) || 5;
          const newEdits = { ...editedAuditProducts };
          catalogAuditIssues.forEach(({ product, missingStockMin }) => {
            if (missingStockMin) {
              newEdits[product.id] = {
                ...(newEdits[product.id] || {}),
                stock_minimo: val
              };
            }
          });
          setEditedAuditProducts(newEdits);
          showToast(`⚡ Asignado Stock Mínimo de ${val} a los productos con stock mínimo cero.`);
        };

        const handleAutoGenerateBarcodes = () => {
          const newEdits = { ...editedAuditProducts };
          catalogAuditIssues.forEach(({ product, missingBarcode }) => {
            if (missingBarcode) {
              const code = `PROD-${Math.floor(100000 + Math.random() * 900000)}`;
              newEdits[product.id] = {
                ...(newEdits[product.id] || {}),
                barcode: code
              };
            }
          });
          setEditedAuditProducts(newEdits);
          showToast(`⚡ Códigos de barras auto-generados para los productos sin código.`);
        };

        const handleSaveAllAuditCorrections = async () => {
          const editedKeys = Object.keys(editedAuditProducts);
          if (editedKeys.length === 0) {
            showToast('⚠️ No se han realizado cambios para guardar.');
            return;
          }

          // Validate price integrity before saving
          const invalidPriceProducts: string[] = [];
          for (const keyStr of editedKeys) {
            const product = products.find(p => String(p.id) === String(keyStr));
            const edit = editedAuditProducts[keyStr as any];
            if (product && edit) {
              const finalCost = edit.precio_costo_usd !== undefined ? edit.precio_costo_usd : product.precio_costo_usd;
              const finalDetail = edit.precio_detalle_usd !== undefined ? edit.precio_detalle_usd : product.precio_detalle_usd;
              const finalMayor = edit.precio_mayor_usd !== undefined ? edit.precio_mayor_usd : product.precio_mayor_usd;
              const finalBulto = edit.precio_bulto_usd !== undefined ? edit.precio_bulto_usd : (product.precio_bulto_usd || 0);
              if (finalDetail <= finalCost || finalMayor <= finalCost || finalMayor >= finalDetail || (finalBulto > 0 && (finalBulto <= finalCost || finalBulto > finalMayor))) {
                invalidPriceProducts.push(edit.description || product.description);
              }
            }
          }

          if (invalidPriceProducts.length > 0) {
            showAlert(`Hay ${invalidPriceProducts.length} producto(s) con precios inválidos (El Detalle debe ser mayor al Mayor, el Mayor mayor al Bulto, y todos mayores al Costo). Corríjalos antes de guardar.`, 'Precios Inválidos', 'warning');
            return;
          }

          setIsSavingAuditCorrections(true);
          setAuditSaveProgress({ current: 0, total: editedKeys.length });

          let updatedCount = 0;
          try {
            for (let i = 0; i < editedKeys.length; i++) {
              const keyStr = editedKeys[i];
              setAuditSaveProgress({ current: i + 1, total: editedKeys.length });
              const product = products.find(p => String(p.id) === String(keyStr));
              const edit = editedAuditProducts[keyStr as any];
              if (product && edit) {
                const updatedProd: Product = {
                  ...product,
                  barcode: edit.barcode !== undefined ? edit.barcode.trim() : product.barcode,
                  description: edit.description !== undefined ? edit.description.trim().toUpperCase() : product.description,
                  category: edit.category !== undefined ? edit.category.trim().toUpperCase() : product.category,
                  stock_minimo: edit.stock_minimo !== undefined ? edit.stock_minimo : product.stock_minimo,
                  precio_costo_usd: edit.precio_costo_usd !== undefined ? edit.precio_costo_usd : product.precio_costo_usd,
                  precio_detalle_usd: edit.precio_detalle_usd !== undefined ? edit.precio_detalle_usd : product.precio_detalle_usd,
                  precio_mayor_usd: edit.precio_mayor_usd !== undefined ? edit.precio_mayor_usd : product.precio_mayor_usd,
                  precio_bulto_usd: edit.precio_bulto_usd !== undefined ? edit.precio_bulto_usd : (product.precio_bulto_usd || 0),
                  cant_bulto: edit.cant_bulto !== undefined ? edit.cant_bulto : (product.cant_bulto || 0),
                  ganancia_bulto: edit.ganancia_bulto !== undefined ? edit.ganancia_bulto : (product.ganancia_bulto || 0),
                };
                const ok = await onUpdateProduct(updatedProd);
                if (ok) updatedCount++;
              }
            }
            setEditedAuditProducts({});
            setShowCatalogAuditModal(false);
            showToast(`✨ Se guardaron con éxito las correcciones de catálogo para ${updatedCount} productos en la Base de Datos.`);
          } catch (error) {
            console.error("Error guardando correcciones de catálogo:", error);
            showToast("❌ Error al guardar las correcciones de catálogo.");
          } finally {
            setIsSavingAuditCorrections(false);
          }
        };

        return (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[92] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-6xl w-full h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200 font-sans relative">
              {/* Overlay de procesamiento cuando se guardan correcciones masivas */}
              {isSavingAuditCorrections && (
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-white text-center animate-in fade-in duration-200">
                  <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6">
                    <div className="relative flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
                      <RefreshCw className="w-7 h-7 text-amber-400 absolute animate-pulse" />
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="text-base font-black uppercase tracking-wider text-amber-400 font-mono">
                        Procesando Correcciones ({auditSaveProgress.current} de {auditSaveProgress.total})
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed font-sans">
                        Guardando cambios masivos en la base de datos. Por favor espere sin cerrar ni volver a ejecutar la petición.
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="w-full bg-slate-800 rounded-full h-3.5 overflow-hidden border border-slate-700 p-0.5">
                        <div 
                          className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full transition-all duration-200 rounded-full shadow-md"
                          style={{ width: `${Math.round((auditSaveProgress.current / Math.max(1, auditSaveProgress.total)) * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-amber-300 font-bold">
                        <span>Progreso</span>
                        <span>{Math.round((auditSaveProgress.current / Math.max(1, auditSaveProgress.total)) * 100)}%</span>
                      </div>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-300 font-medium">
                      ⚠️ Para evitar peticiones duplicadas y sobrecarga en el servidor, no cierre esta ventana ni refresque la página.
                    </div>
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 px-6 py-4 flex justify-between items-center text-slate-950 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-slate-950/10 rounded-xl">
                    <Sparkles className="w-5 h-5 text-slate-950 fill-current" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider font-mono text-slate-950 flex items-center gap-2">
                      Asistente de Auditoría e Integridad de Catálogo y Precios
                    </h3>
                    <p className="text-[11px] text-slate-900 font-medium">
                      Ayudante interactivo para corregir productos con precios $0, sin categoría, sin código o sin stock mínimo.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => !isSavingAuditCorrections && setShowCatalogAuditModal(false)}
                  disabled={isSavingAuditCorrections}
                  className="text-slate-950/80 hover:text-slate-950 text-base font-bold focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ✕
                </button>
              </div>

              {/* Status & Filter Bar */}
              <div className="bg-slate-100 border-b border-slate-200 px-6 py-3 flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setAuditFilterTab('todos')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold font-sans transition-all flex items-center gap-1.5 ${
                      auditFilterTab === 'todos' ? 'bg-slate-950 text-amber-400 shadow' : 'bg-white text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>Todos</span>
                    <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black">{catalogAuditIssuesCount}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditFilterTab('sin_precios')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold font-sans transition-all flex items-center gap-1.5 ${
                      auditFilterTab === 'sin_precios' ? 'bg-amber-600 text-white shadow' : 'bg-white text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>Precios $0 / Inválidos</span>
                    {countSinPrecios > 0 && <span className="bg-red-100 text-red-800 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold">{countSinPrecios}</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditFilterTab('sin_categoria')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold font-sans transition-all flex items-center gap-1.5 ${
                      auditFilterTab === 'sin_categoria' ? 'bg-amber-600 text-white shadow' : 'bg-white text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>Sin Categoría</span>
                    {countSinCat > 0 && <span className="bg-red-100 text-red-800 px-1.5 py-0.2 rounded-full text-[10px] font-mono">{countSinCat}</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditFilterTab('sin_stock_min')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold font-sans transition-all flex items-center gap-1.5 ${
                      auditFilterTab === 'sin_stock_min' ? 'bg-amber-600 text-white shadow' : 'bg-white text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>Stock Mínimo Cero</span>
                    {countSinMin > 0 && <span className="bg-red-100 text-red-800 px-1.5 py-0.2 rounded-full text-[10px] font-mono">{countSinMin}</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditFilterTab('sin_codigo')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold font-sans transition-all flex items-center gap-1.5 ${
                      auditFilterTab === 'sin_codigo' ? 'bg-amber-600 text-white shadow' : 'bg-white text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>Sin Código</span>
                    {countSinCod > 0 && <span className="bg-red-100 text-red-800 px-1.5 py-0.2 rounded-full text-[10px] font-mono">{countSinCod}</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditFilterTab('sin_descripcion')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold font-sans transition-all flex items-center gap-1.5 ${
                      auditFilterTab === 'sin_descripcion' ? 'bg-amber-600 text-white shadow' : 'bg-white text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>Sin Descripción</span>
                    {countSinDesc > 0 && <span className="bg-red-100 text-red-800 px-1.5 py-0.2 rounded-full text-[10px] font-mono">{countSinDesc}</span>}
                  </button>
                </div>

                {Object.keys(editedAuditProducts).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditedAuditProducts({})}
                    className="text-[11px] text-red-700 hover:text-red-800 font-bold flex items-center gap-1 bg-red-100/70 px-2.5 py-1 rounded-md transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Limpiar Cambios Locales
                  </button>
                )}
              </div>

              {/* Main Section */}
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left Panel: Bulk Actions */}
                <div className="w-1/3 p-5 border-r border-slate-200 overflow-y-auto space-y-4 bg-slate-50/50">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono block">Correcciones Masivas Rápidas</label>

                  {/* Bulk Precios 1: Auto Margen a productos con Costo > 0 */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs hover:border-amber-400 transition-all">
                    <span className="font-extrabold text-xs text-slate-800 block flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Margen a Productos con Costo
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Calcula Detalle (+{auditDefaultDetailMargin}%), Mayor (+{auditDefaultMayorMargin}%) y Bulto (+{auditDefaultBultoMargin}%) para productos con costo existente ({countPricelessWithCost}).
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <label className="text-[8.5px] text-slate-500 font-bold block mb-0.5">Detalle %</label>
                        <input
                          type="number"
                          value={auditDefaultDetailMargin}
                          onChange={(e) => setAuditDefaultDetailMargin(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[8.5px] text-slate-500 font-bold block mb-0.5">Mayor %</label>
                        <input
                          type="number"
                          value={auditDefaultMayorMargin}
                          onChange={(e) => setAuditDefaultMayorMargin(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[8.5px] text-slate-500 font-bold block mb-0.5">Bulto %</label>
                        <input
                          type="number"
                          value={auditDefaultBultoMargin}
                          onChange={(e) => setAuditDefaultBultoMargin(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={countPricelessWithCost === 0}
                      onClick={() => handleApplyAutoMarginToPriceless(parseFloat(auditDefaultDetailMargin) || 30, parseFloat(auditDefaultMayorMargin) || 15, parseFloat(auditDefaultBultoMargin) || 8)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2 rounded-lg text-xs font-sans transition-all shadow-xs"
                    >
                      ⚡ Calcular Precios ({countPricelessWithCost})
                    </button>
                  </div>

                  {/* Bulk Precios 2: Asignar Costo Base a Costo $0 */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs hover:border-amber-400 transition-all">
                    <span className="font-extrabold text-xs text-slate-800 block flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-amber-600" />
                      Asignar Costo Base a Costo $0
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Asigna un costo inicial y calcula sus precios a todos los productos con costo $0 ({countZeroCost}).
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-600 font-bold whitespace-nowrap">Costo Base ($):</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={auditDefaultCost}
                        onChange={(e) => setAuditDefaultCost(e.target.value)}
                        className="w-24 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={countZeroCost === 0}
                      onClick={handleApplyDefaultCostAndMargins}
                      className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-extrabold py-2 rounded-lg text-xs font-sans transition-all shadow-xs"
                    >
                      ⚡ Asignar Precios Base ({countZeroCost})
                    </button>
                  </div>

                  {/* Bulk 1: Asignar Categoría */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs hover:border-amber-400 transition-all">
                    <span className="font-extrabold text-xs text-slate-800 block flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-amber-600" />
                      Asignar Categoría Masiva
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Asigna la categoría elegida a todos los productos que no tienen categoría ({countSinCat}).
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={auditDefaultCategory}
                        onChange={(e) => setAuditDefaultCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none"
                      >
                        {allCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={countSinCat === 0}
                        onClick={handleApplyBulkDefaultCategory}
                        className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-3 py-1 rounded text-xs transition-all whitespace-nowrap"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>

                  {/* Bulk 2: Asignar Stock Mínimo */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs hover:border-amber-400 transition-all">
                    <span className="font-extrabold text-xs text-slate-800 block flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-amber-600" />
                      Asignar Stock Mínimo Masivo
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Asigna el stock mínimo elegido a los productos con stock mínimo 0 ({countSinMin}).
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="1"
                        value={auditDefaultStockMin}
                        onChange={(e) => setAuditDefaultStockMin(e.target.value)}
                        className="w-20 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={countSinMin === 0}
                        onClick={handleApplyBulkDefaultStockMin}
                        className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-3 py-1 rounded text-xs transition-all whitespace-nowrap flex-1"
                      >
                        Aplicar ({countSinMin})
                      </button>
                    </div>
                  </div>

                  {/* Bulk 3: Auto-generar Códigos */}
                  {countSinCod > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs hover:border-amber-400 transition-all">
                      <span className="font-extrabold text-xs text-slate-800 block flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-sky-600" />
                        Auto-Generar Códigos
                      </span>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Crea códigos aleatorios únicos para todos los productos sin código ({countSinCod}).
                      </p>
                      <button
                        type="button"
                        onClick={handleAutoGenerateBarcodes}
                        className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 rounded-lg text-xs font-sans transition-all shadow-xs"
                      >
                        ⚡ Generar Códigos ({countSinCod})
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Panel: Inline Table */}
                <div className="w-2/3 p-5 flex flex-col overflow-hidden bg-white">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono">
                      Inspector de Inconsistencias ({filteredIssues.length})
                    </label>
                  </div>

                  <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden flex flex-col min-h-0 shadow-inner">
                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-100 text-[10px] uppercase text-slate-500 font-mono sticky top-0 z-10 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2 w-[22%]">Producto</th>
                            <th className="px-2 py-2 w-[15%]">Categoría</th>
                            <th className="px-2 py-2 w-[15%] text-right">Costo $</th>
                            <th className="px-2 py-2 w-[13%] text-right">Detalle $</th>
                            <th className="px-2 py-2 w-[13%] text-right">Mayor $</th>
                            <th className="px-2 py-2 w-[14%] text-right">Bulto $</th>
                            <th className="px-2 py-2 w-[8%] text-center">Stk Mín</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {filteredIssues.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                                🎉 No se encontraron inconsistencias en este filtro.
                              </td>
                            </tr>
                          ) : (
                            filteredIssues.map(({ product: p, currentBarcode, currentDescription, currentCategory, currentStockMin, currentCost, currentDetail, currentMayor, currentBulto, currentCantBulto, missingCategory, missingBarcode, missingDescription, missingStockMin, zeroCost, zeroDetail, zeroMayor, invalidBulto, zeroOrInvalidPrices }) => {
                              const edit = editedAuditProducts[p.id];
                              const isEdited = edit !== undefined;

                              return (
                                <tr key={p.id} className={`hover:bg-slate-50 ${isEdited ? 'bg-emerald-50/40' : zeroOrInvalidPrices ? 'bg-amber-50/30' : 'bg-white'}`}>
                                  {/* Code and Description */}
                                  <td className="px-2 py-2">
                                    <div className="space-y-1">
                                      <input
                                        type="text"
                                        value={currentDescription}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setEditedAuditProducts(prev => ({
                                            ...prev,
                                            [p.id]: {
                                              ...(prev[p.id] || {}),
                                              description: val
                                            }
                                          }));
                                        }}
                                        placeholder="Descripción..."
                                        title={missingDescription ? "⚠️ INCONSISTENCIA: La descripción del producto no puede estar vacía." : currentDescription}
                                        className={`w-full text-xs font-bold border rounded px-1.5 py-0.5 focus:bg-white focus:outline-none ${
                                          missingDescription ? 'border-red-400 bg-red-50 text-red-800' : 'border-slate-300 text-slate-800'
                                        }`}
                                      />
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={currentBarcode}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setEditedAuditProducts(prev => ({
                                              ...prev,
                                              [p.id]: {
                                                ...(prev[p.id] || {}),
                                                barcode: val
                                              }
                                            }));
                                          }}
                                          placeholder="Código..."
                                          title={missingBarcode ? "⚠️ INCONSISTENCIA: El producto debe tener un código de barras o referencia único." : `Código: ${currentBarcode}`}
                                          className={`w-full text-[10px] font-mono border rounded px-1 py-0.5 focus:bg-white focus:outline-none ${
                                            missingBarcode ? 'border-red-400 bg-red-50 text-red-800' : 'border-slate-250 text-slate-500'
                                          }`}
                                        />
                                      </div>
                                    </div>
                                  </td>

                                  {/* Category */}
                                  <td className="px-2 py-2">
                                    <select
                                      value={currentCategory}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setEditedAuditProducts(prev => ({
                                          ...prev,
                                          [p.id]: {
                                            ...(prev[p.id] || {}),
                                            category: val
                                          }
                                        }));
                                      }}
                                      title={missingCategory ? "⚠️ INCONSISTENCIA: Debe seleccionar una categoría válida para el producto." : `Categoría: ${currentCategory}`}
                                      className={`w-full text-xs font-bold border rounded px-1.5 py-1 focus:bg-white focus:outline-none ${
                                        missingCategory ? 'border-red-400 bg-red-50 text-red-800' : 'border-slate-300 text-slate-800'
                                      }`}
                                    >
                                      <option value="">-- Sin Categoría --</option>
                                      {allCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                      ))}
                                    </select>
                                  </td>

                                  {/* Cost ($) + Calc Button */}
                                  <td className="px-2 py-2 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() => setAuditAuxProduct(p)}
                                        className="bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 p-1 rounded transition-all flex-shrink-0 active:scale-95"
                                        title="Abrir Auxiliar de Cálculo de Precios para calcular costo y margen"
                                      >
                                        <Calculator className="w-3.5 h-3.5 text-amber-700" />
                                      </button>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={currentCost}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setEditedAuditProducts(prev => ({
                                            ...prev,
                                            [p.id]: {
                                              ...(prev[p.id] || {}),
                                              precio_costo_usd: val
                                            }
                                          }));
                                        }}
                                        title={zeroCost ? "⚠️ INCONSISTENCIA: El precio de costo debe ser mayor a $0.00." : `Costo Base: $${currentCost.toFixed(2)}`}
                                        className={`w-16 text-right text-xs font-mono font-bold border rounded px-1.5 py-1 focus:bg-white focus:outline-none ${
                                          zeroCost ? 'border-red-400 bg-red-50 text-red-800' : 'border-slate-300 text-slate-800'
                                        }`}
                                      />
                                    </div>
                                  </td>

                                  {/* Detail ($) */}
                                  <td className="px-2 py-2 text-right">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={currentDetail}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setEditedAuditProducts(prev => ({
                                          ...prev,
                                          [p.id]: {
                                            ...(prev[p.id] || {}),
                                            precio_detalle_usd: val
                                          }
                                        }));
                                      }}
                                      title={zeroDetail ? (currentDetail <= 0 ? "⚠️ INCONSISTENCIA: El precio al detalle debe ser mayor a $0.00." : `⚠️ INCONSISTENCIA: El precio al detalle ($${currentDetail.toFixed(2)}) no puede ser menor o igual al costo ($${currentCost.toFixed(2)}).`) : `Precio Detalle: $${currentDetail.toFixed(2)} (Margen: +${currentCost > 0 ? (((currentDetail - currentCost) / currentCost) * 100).toFixed(1) : 0}%)`}
                                      className={`w-16 text-right text-xs font-mono font-bold border rounded px-1.5 py-1 focus:bg-white focus:outline-none ${
                                        zeroDetail ? 'border-red-400 bg-red-50 text-red-800' : 'border-emerald-400 bg-emerald-50 text-emerald-900'
                                      }`}
                                    />
                                  </td>

                                  {/* Mayor ($) */}
                                  <td className="px-2 py-2 text-right">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={currentMayor}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setEditedAuditProducts(prev => ({
                                          ...prev,
                                          [p.id]: {
                                            ...(prev[p.id] || {}),
                                            precio_mayor_usd: val
                                          }
                                        }));
                                      }}
                                      title={zeroMayor ? (currentMayor <= 0 ? "⚠️ INCONSISTENCIA: El precio al mayor debe ser mayor a $0.00." : currentMayor <= currentCost ? `⚠️ INCONSISTENCIA: El precio al mayor ($${currentMayor.toFixed(2)}) no puede ser menor o igual al costo ($${currentCost.toFixed(2)}).` : `⚠️ INCONSISTENCIA: El precio al mayor ($${currentMayor.toFixed(2)}) debe ser MENOR al precio detalle ($${currentDetail.toFixed(2)}) y mayor al costo.`) : `Precio Mayor: $${currentMayor.toFixed(2)} (Margen: +${currentCost > 0 ? (((currentMayor - currentCost) / currentCost) * 100).toFixed(1) : 0}%)`}
                                      className={`w-16 text-right text-xs font-mono font-bold border rounded px-1.5 py-1 focus:bg-white focus:outline-none ${
                                        zeroMayor ? 'border-red-400 bg-red-50 text-red-800' : 'border-emerald-400 bg-emerald-50 text-emerald-900'
                                      }`}
                                    />
                                  </td>

                                  {/* Bulto ($) */}
                                  <td className="px-2 py-2 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      {currentCantBulto > 0 && (
                                        <span className="text-[8.5px] font-mono text-amber-700 bg-amber-100 px-1 py-0.5 rounded font-bold whitespace-nowrap" title={`Empaque de ${currentCantBulto} unidades`}>
                                          x{currentCantBulto}
                                        </span>
                                      )}
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={currentBulto}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setEditedAuditProducts(prev => ({
                                            ...prev,
                                            [p.id]: {
                                              ...(prev[p.id] || {}),
                                              precio_bulto_usd: val
                                            }
                                          }));
                                        }}
                                        title={invalidBulto ? (currentBulto <= currentCost ? `⚠️ INCONSISTENCIA: El precio por bulto ($${currentBulto.toFixed(2)}) no puede ser menor o igual al costo ($${currentCost.toFixed(2)}).` : `⚠️ INCONSISTENCIA: El precio por bulto ($${currentBulto.toFixed(2)}) debe ser MENOR al precio al mayor ($${currentMayor.toFixed(2)}) y mayor al costo ($${currentCost.toFixed(2)}).`) : currentBulto > 0 ? `Precio Bulto: $${currentBulto.toFixed(2)} (Margen: +${currentCost > 0 ? (((currentBulto - currentCost) / currentCost) * 100).toFixed(1) : 0}%)` : "Sin precio por bulto configurado (Opcional)"}
                                        className={`w-16 text-right text-xs font-mono font-bold border rounded px-1.5 py-1 focus:bg-white focus:outline-none ${
                                          invalidBulto ? 'border-red-400 bg-red-50 text-red-800' : currentBulto > 0 ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-slate-300 text-slate-700'
                                        }`}
                                      />
                                    </div>
                                  </td>

                                  {/* Stock Minimum */}
                                  <td className="px-2 py-2 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      value={currentStockMin}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setEditedAuditProducts(prev => ({
                                          ...prev,
                                          [p.id]: {
                                            ...(prev[p.id] || {}),
                                            stock_minimo: val
                                          }
                                        }));
                                      }}
                                      title={missingStockMin ? "⚠️ INCONSISTENCIA: El stock mínimo debe ser al menos 1 unidad para alertas de reposición." : `Stock mínimo de alerta: ${currentStockMin}`}
                                      className={`w-12 text-center text-xs font-mono font-bold border rounded px-1 py-1 focus:bg-white focus:outline-none ${
                                        missingStockMin ? 'border-red-400 bg-red-50 text-red-800' : 'border-slate-300 text-slate-800'
                                      }`}
                                    />
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
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center text-xs">
                <span className="text-slate-500 font-mono text-[11px]">
                  {isSavingAuditCorrections ? (
                    <strong className="text-amber-700 animate-pulse">⏳ Procesando y guardando correcciones en la base de datos... Por favor espere.</strong>
                  ) : Object.keys(editedAuditProducts).length > 0 ? (
                    <strong className="text-emerald-700">Se han preparado cambios para {Object.keys(editedAuditProducts).length} productos. Presione Guardar.</strong>
                  ) : (
                    'Realice ajustes masivos o edite individualmente y luego presione Guardar.'
                  )}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCatalogAuditModal(false)}
                    disabled={isSavingAuditCorrections}
                    className="bg-slate-200 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 px-4 py-2 rounded-lg font-bold font-sans transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAllAuditCorrections}
                    disabled={isSavingAuditCorrections || Object.keys(editedAuditProducts).length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-400 text-white font-bold px-6 py-2 rounded-lg font-sans transition-all shadow-md active:scale-95 flex items-center gap-2"
                  >
                    {isSavingAuditCorrections ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Guardando ({auditSaveProgress.current}/{auditSaveProgress.total})...</span>
                      </>
                    ) : (
                      <span>Guardar Correcciones ({Object.keys(editedAuditProducts).length})</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* AUXILIAR DE CÁLCULO DE PRECIOS DESDE LA AUDITORÍA DE CATÁLOGO */}
      {auditAuxProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[105] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto font-sans">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-sm font-black uppercase text-slate-800 font-mono flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-amber-600" />
                  Auxiliar de Cálculo de Precios — {auditAuxProduct.description}
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">Código / Clave: {auditAuxProduct.barcode}</span>
              </div>
              <button
                type="button"
                onClick={() => setAuditAuxProduct(null)}
                className="text-slate-400 hover:text-slate-700 text-base font-bold"
              >
                ✕
              </button>
            </div>

            <AuxiliarCalculoPrecios
              tasaBCV={bcvRateUSD || parseFloat(localStorage.getItem('pos_bcv_usd') || '0') || 0}
              tasaFallback={tasaDia || parseFloat(localStorage.getItem('pos_tasa_activa') || '0') || 0}
              initialCost={
                (editedAuditProducts[auditAuxProduct.id]?.precio_costo_usd !== undefined
                  ? editedAuditProducts[auditAuxProduct.id]?.precio_costo_usd ?? 0
                  : auditAuxProduct.precio_costo_usd
                ).toString()
              }
              initialDetail={
                (editedAuditProducts[auditAuxProduct.id]?.precio_detalle_usd !== undefined
                  ? editedAuditProducts[auditAuxProduct.id]?.precio_detalle_usd ?? 0
                  : auditAuxProduct.precio_detalle_usd
                ).toString()
              }
              initialMayor={
                (editedAuditProducts[auditAuxProduct.id]?.precio_mayor_usd !== undefined
                  ? editedAuditProducts[auditAuxProduct.id]?.precio_mayor_usd ?? 0
                  : auditAuxProduct.precio_mayor_usd
                ).toString()
              }
              onApplyPrices={(prices) => {
                const costVal = parseFloat(prices.cost) || 0;
                const detailVal = parseFloat(prices.detail) || 0;
                const mayorVal = parseFloat(prices.mayor) || 0;

                setEditedAuditProducts(prev => ({
                  ...prev,
                  [auditAuxProduct.id]: {
                    ...(prev[auditAuxProduct.id] || {}),
                    precio_costo_usd: costVal,
                    precio_detalle_usd: detailVal,
                    precio_mayor_usd: mayorVal
                  }
                }));

                setAuditAuxProduct(null);
                showToast(`✅ Precios calculados para "${auditAuxProduct.description}".`);
              }}
            />

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setAuditAuxProduct(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs font-sans"
              >
                Cancelar / Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ASISTENTE INTELIGENTE DE REABASTECIMIENTO Y COMPRAS */}
      {showReplenishmentModal && (() => {
        const {
          allItems,
          filteredItems,
          orderItems,
          criticosCount,
          altosCount,
          moderadosCount,
          sinRotacionCount,
          totalOrderCostUSD,
          totalOrderUnits,
          totalOrderBultos
        } = replenishmentAnalysis;

        const totalInvestmentBs = totalOrderCostUSD * effectiveStatsRate;
        const hasCustomOverrides = Object.keys(replenishmentCustomQuantities).length > 0;

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[93] flex items-center justify-center p-3 sm:p-5 font-sans animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-7xl w-full flex flex-col h-[94vh] overflow-hidden">
              
              {/* HEADER */}
              <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-6 py-4 text-white flex justify-between items-center border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 border border-amber-400/40 rounded-xl">
                    <Truck className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold uppercase tracking-wide flex items-center gap-2">
                      ASISTENTE INTELIGENTE DE REABASTECIMIENTO Y COMPRAS
                      <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full font-mono">AI SUGGESTION</span>
                    </h3>
                    <p className="text-xs text-slate-300 font-medium">
                      Análisis de rotación histórica de Kardex, días de stock restante y cantidades sugeridas ajustadas a empaques.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReplenishmentModal(false)}
                  className="text-slate-400 hover:text-white text-xl font-bold bg-slate-800/60 hover:bg-slate-800 p-2 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* KPI STRIP SUMMARY (4 CARDS) */}
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
                
                {/* Presupuesto Total Requerido */}
                <div className="bg-white border border-amber-200 rounded-xl p-3 shadow-xs flex flex-col justify-between">
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800">Inversión Estimada</span>
                    <DollarSign className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-xl font-black font-mono text-slate-900 mt-1">
                    ${totalOrderCostUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-amber-700 font-mono font-bold mt-0.5">
                    Bs {totalInvestmentBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Productos Críticos */}
                <div className="bg-white border border-red-200 rounded-xl p-3 shadow-xs flex flex-col justify-between">
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-700">🔴 Críticos (Urgente)</span>
                    <AlertOctagon className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="text-xl font-black font-mono text-red-600 mt-1">
                    {criticosCount} <span className="text-xs font-sans text-slate-400 font-bold">productos</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-sans">
                    Stock &le; mínimo o autonomía &le; 7 días
                  </div>
                </div>

                {/* Reposición Próxima */}
                <div className="bg-white border border-amber-200 rounded-xl p-3 shadow-xs flex flex-col justify-between">
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">🟠 Reposición Próxima</span>
                    <Clock className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-xl font-black font-mono text-amber-600 mt-1">
                    {altosCount} <span className="text-xs font-sans text-slate-400 font-bold">productos</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-sans">
                    Autonomía entre 8 y 15 días
                  </div>
                </div>

                {/* Total Volumen */}
                <div className="bg-white border border-indigo-200 rounded-xl p-3 shadow-xs flex flex-col justify-between">
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">📦 Total Volumen</span>
                    <Package className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-xl font-black font-mono text-indigo-900 mt-1">
                    {totalOrderUnits.toLocaleString('es-VE')} <span className="text-xs font-sans text-slate-400 font-bold">uds</span>
                  </div>
                  <div className="text-[10px] text-indigo-600 font-bold font-sans">
                    {totalOrderBultos} bultos / empaques en {orderItems.length} items
                  </div>
                </div>

              </div>

              {/* TOOLBAR CONTROLS & FILTERS */}
              <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
                
                {/* Search & Urgency Pills */}
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[300px]">
                  
                  {/* Buscador */}
                  <div className="relative w-56">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={replenishmentSearchTerm}
                      onChange={(e) => setReplenishmentSearchTerm(e.target.value)}
                      placeholder="Buscar producto o código..."
                      className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-sans focus:outline-none focus:border-indigo-600 focus:bg-white"
                    />
                    {replenishmentSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setReplenishmentSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Filtro Urgencia */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setReplenishmentUrgencyFilter('all')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all text-xs cursor-pointer ${
                        replenishmentUrgencyFilter === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Todos ({allItems.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplenishmentUrgencyFilter('critico')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all text-xs flex items-center gap-1 cursor-pointer ${
                        replenishmentUrgencyFilter === 'critico' ? 'bg-red-600 text-white shadow-xs' : 'text-red-700 hover:bg-red-100'
                      }`}
                    >
                      <span>🔴 Críticos</span>
                      <span className="font-mono text-[10px]">({criticosCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplenishmentUrgencyFilter('alto')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all text-xs flex items-center gap-1 cursor-pointer ${
                        replenishmentUrgencyFilter === 'alto' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-amber-800 hover:bg-amber-100'
                      }`}
                    >
                      <span>🟠 Altos</span>
                      <span className="font-mono text-[10px]">({altosCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplenishmentUrgencyFilter('moderado')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all text-xs flex items-center gap-1 cursor-pointer ${
                        replenishmentUrgencyFilter === 'moderado' ? 'bg-yellow-500 text-slate-950 shadow-xs' : 'text-yellow-800 hover:bg-yellow-100'
                      }`}
                    >
                      <span>🟡 Moderados</span>
                      <span className="font-mono text-[10px]">({moderadosCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplenishmentUrgencyFilter('sin_rotacion')}
                      className={`px-2 py-1 rounded-md font-bold transition-all text-xs flex items-center gap-1 cursor-pointer ${
                        replenishmentUrgencyFilter === 'sin_rotacion' ? 'bg-slate-600 text-white shadow-xs' : 'text-slate-500 hover:bg-slate-200'
                      }`}
                      title="Productos con stock 0 y sin ventas registradas"
                    >
                      <span>⚪ Sin Rotación ({sinRotacionCount})</span>
                    </button>
                  </div>

                </div>

                {/* Parameters: Target Days, History Days, Category */}
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  
                  {/* Cobertura Deseada */}
                  <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                    <span className="text-slate-500 font-bold text-[11px]">⏱️ Cobertura:</span>
                    <select
                      value={replenishmentTargetDays}
                      onChange={(e) => setReplenishmentTargetDays(parseInt(e.target.value))}
                      className="bg-white border border-slate-300 rounded px-2 py-0.5 font-bold font-mono text-indigo-700 focus:outline-none"
                    >
                      <option value={15}>15 Días</option>
                      <option value={30}>30 Días (1 Mes)</option>
                      <option value={45}>45 Días</option>
                      <option value={60}>60 Días (2 Meses)</option>
                    </select>
                  </div>

                  {/* Período de Ventas Histórico */}
                  <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                    <span className="text-slate-500 font-bold text-[11px]">📊 Historial:</span>
                    <select
                      value={replenishmentHistoryDays}
                      onChange={(e) => setReplenishmentHistoryDays(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                      className="bg-white border border-slate-300 rounded px-2 py-0.5 font-bold font-mono text-slate-800 focus:outline-none"
                    >
                      <option value={30}>Últimos 30 días</option>
                      <option value={60}>Últimos 60 días</option>
                      <option value={90}>Últimos 90 días</option>
                      <option value="all">Todo el Kardex</option>
                    </select>
                  </div>

                  {/* Categoría */}
                  <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                    <span className="text-slate-500 font-bold text-[11px]">🏷️ Cat:</span>
                    <select
                      value={replenishmentCategoryFilter}
                      onChange={(e) => setReplenishmentCategoryFilter(e.target.value)}
                      className="bg-white border border-slate-300 rounded px-2 py-0.5 font-bold text-slate-800 focus:outline-none max-w-[140px] truncate"
                    >
                      <option value="todos">Todas las categorías</option>
                      {allCategories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                </div>

              </div>

              {/* TABLE AREA */}
              <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0 bg-white">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200 shadow-2xs">
                    <tr>
                      <th className="p-2.5 text-center w-10">#</th>
                      <th className="p-2.5 w-28 text-center">Prioridad</th>
                      <th className="p-2.5">Producto</th>
                      <th className="p-2.5 text-right w-24">Stock Act / Mín</th>
                      <th className="p-2.5 text-right w-24">Venta Período</th>
                      <th className="p-2.5 text-center w-28">Días Stock (Runway)</th>
                      <th className="p-2.5 text-center w-36 bg-amber-50/70 border-x border-amber-200 text-amber-950 font-black">A Pedir (Uds)</th>
                      <th className="p-2.5 text-center w-28">Empaque</th>
                      <th className="p-2.5 text-right w-20">Costo $</th>
                      <th className="p-2.5 text-right w-24">Subtotal $</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans text-slate-700">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-16 text-center text-slate-400 italic">
                          🎉 No se encontraron productos para los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item, idx) => {
                        const { product: p, soldQty, salesVelocityPerDay, currentStock, minStock, cantBulto, costUSD, runwayDays, urgency, finalOrderQty, finalBultos, subtotalCostUSD } = item;
                        
                        const isCritico = urgency === 'critico';
                        const isAlto = urgency === 'alto';
                        const isModerado = urgency === 'moderado';
                        const isSinRotacion = urgency === 'sin_rotacion';
                        const hasCustom = replenishmentCustomQuantities[p.id] !== undefined;

                        return (
                          <tr
                            key={p.id}
                            className={`hover:bg-slate-50 transition-colors ${
                              isCritico
                                ? 'bg-red-50/40'
                                : isAlto
                                  ? 'bg-amber-50/30'
                                  : isModerado
                                    ? 'bg-yellow-50/20'
                                    : isSinRotacion
                                      ? 'bg-slate-50/50 opacity-70'
                                      : 'bg-white'
                            }`}
                          >
                            {/* # */}
                            <td className="p-2.5 text-center font-mono font-bold text-slate-400">{idx + 1}</td>

                            {/* Prioridad Badge */}
                            <td className="p-2.5 text-center">
                              {isCritico ? (
                                <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 border border-red-300 font-extrabold px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap shadow-2xs">
                                  🔴 CRÍTICO
                                </span>
                              ) : isAlto ? (
                                <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 font-extrabold px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">
                                  🟠 ALTO
                                </span>
                              ) : isModerado ? (
                                <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-900 border border-yellow-300 font-extrabold px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">
                                  🟡 MODERADO
                                </span>
                              ) : isSinRotacion ? (
                                <span className="inline-flex items-center gap-1 bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">
                                  ⚪ SIN ROTACIÓN
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">
                                  🟢 ÓPTIMO
                                </span>
                              )}
                            </td>

                            {/* Producto */}
                            <td className="p-2.5">
                              <div className="font-bold text-slate-900 uppercase text-xs leading-tight">
                                {p.description}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                                <span>Cód: {p.barcode || '—'}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-indigo-600 font-sans font-bold">{p.category || 'SIN CATEGORIA'}</span>
                              </div>
                            </td>

                            {/* Stock Act / Min */}
                            <td className="p-2.5 text-right font-mono">
                              <div className={`font-black text-xs ${currentStock <= minStock ? 'text-red-600' : 'text-slate-800'}`}>
                                {currentStock.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                              </div>
                              <div className="text-[10px] text-slate-400 font-bold">
                                Mín: {minStock.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                              </div>
                            </td>

                            {/* Venta Periodo / Venta Dia */}
                            <td className="p-2.5 text-right font-mono">
                              <div className="font-bold text-indigo-700 text-xs">
                                {soldQty.toLocaleString('es-VE')} uds
                              </div>
                              <div className="text-[10px] text-slate-400 font-bold">
                                ~{salesVelocityPerDay.toFixed(2)}/día
                              </div>
                            </td>

                            {/* Runway / Dias de Stock */}
                            <td className="p-2.5 text-center">
                              {runwayDays < 900 ? (
                                <div className="space-y-1 max-w-[90px] mx-auto">
                                  <div className={`font-mono font-black text-xs ${
                                    runwayDays <= 7 ? 'text-red-600 font-black' : runwayDays <= 15 ? 'text-amber-600' : 'text-slate-700'
                                  }`}>
                                    {runwayDays.toFixed(0)} días
                                  </div>
                                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                    <div
                                      style={{ width: `${Math.min(100, (runwayDays / 30) * 100)}%` }}
                                      className={`h-full rounded-full ${
                                        runwayDays <= 7 ? 'bg-red-500' : runwayDays <= 15 ? 'bg-amber-500' : 'bg-emerald-500'
                                      }`}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-mono italic">Sin Ventas</span>
                              )}
                            </td>

                            {/* Input Cantidad a Pedir */}
                            <td className="p-2 bg-amber-50/40 border-x border-amber-200 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  value={finalOrderQty}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                    setReplenishmentCustomQuantities(prev => ({
                                      ...prev,
                                      [p.id]: val
                                    }));
                                  }}
                                  className={`w-20 text-center font-mono font-black text-xs px-2 py-1 rounded border focus:outline-none focus:bg-white shadow-2xs ${
                                    hasCustom
                                      ? 'bg-amber-100 border-amber-400 text-amber-950 font-black'
                                      : finalOrderQty > 0
                                        ? 'bg-white border-slate-300 text-slate-900'
                                        : 'bg-slate-100 border-slate-200 text-slate-400'
                                  }`}
                                />
                                {hasCustom && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = { ...replenishmentCustomQuantities };
                                      delete next[p.id];
                                      setReplenishmentCustomQuantities(next);
                                    }}
                                    title="Restablecer a sugerencia automática"
                                    className="text-amber-700 hover:text-amber-900 text-xs font-bold"
                                  >
                                    ↺
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Empaque / Bultos */}
                            <td className="p-2.5 text-center font-mono text-xs">
                              {cantBulto > 1 ? (
                                <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-extrabold text-[10px] whitespace-nowrap">
                                  {finalBultos} bts (x{cantBulto})
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </td>

                            {/* Costo Unitario */}
                            <td className="p-2.5 text-right font-mono font-bold text-xs text-slate-700">
                              ${costUSD.toFixed(2)}
                            </td>

                            {/* Subtotal Inversión */}
                            <td className="p-2.5 text-right font-mono font-black text-xs text-slate-900">
                              ${subtotalCostUSD.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* FOOTER ACTIONS */}
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3 flex-shrink-0 text-xs font-sans">
                
                {/* Left side info */}
                <div className="flex items-center gap-3 text-slate-500">
                  <span>
                    Mostrando <strong>{filteredItems.length}</strong> de {allItems.length} productos analizados.
                  </span>
                  {hasCustomOverrides && (
                    <button
                      type="button"
                      onClick={() => setReplenishmentCustomQuantities({})}
                      className="text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer text-xs"
                    >
                      Restablecer cambios manuales
                    </button>
                  )}
                </div>

                {/* Right side buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  
                  {/* Copiar WhatsApp */}
                  <button
                    type="button"
                    onClick={handleCopyReplenishmentWhatsApp}
                    disabled={orderItems.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-400 text-white font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs active:scale-95 flex items-center gap-1.5 cursor-pointer"
                    title="Copiar lista de productos y cantidades formateada para WhatsApp"
                  >
                    {replenishmentCopied ? <ClipboardCheck className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                    <span>{replenishmentCopied ? '¡Copiado!' : 'Copiar WhatsApp'}</span>
                  </button>

                  {/* Descargar PDF */}
                  <button
                    type="button"
                    onClick={handleExportReplenishmentPDF}
                    disabled={orderItems.length === 0}
                    className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-400 text-white font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs active:scale-95 flex items-center gap-1.5 cursor-pointer"
                    title="Generar e imprimir orden de reabastecimiento en PDF"
                  >
                    <Printer className="w-4 h-4 text-amber-400" />
                    <span>Descargar PDF</span>
                  </button>

                  {/* Exportar Excel */}
                  <button
                    type="button"
                    onClick={handleExportReplenishmentCSV}
                    disabled={orderItems.length === 0}
                    className="bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-800 font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Excel</span>
                  </button>

                  {/* Cerrar */}
                  <button
                    type="button"
                    onClick={() => setShowReplenishmentModal(false)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-4 py-2 rounded-xl transition-all cursor-pointer"
                  >
                    Cerrar
                  </button>

                </div>

              </div>

            </div>
          </div>
        );
      })()}

      {/* GENERAL ADJUSTMENT MODAL */}
      {showGeneralAdjustModal && (() => {
        const targetProducts = getGeneralAdjustTargetProducts();
        
        // Check violations
        let violationsCount = 0;
        const updatesPreview = targetProducts.map(p => {
          const override = customPriceOverrides[p.id];
          const nextCost = override?.cost !== undefined ? override.cost : (generalAdjustCost ? computePriceChange(p.precio_costo_usd) : p.precio_costo_usd);
          const nextDetail = override?.detail !== undefined ? override.detail : (generalAdjustDetail ? computePriceChange(p.precio_detalle_usd) : p.precio_detalle_usd);
          const nextMayor = override?.mayor !== undefined ? override.mayor : (generalAdjustMayor ? computePriceChange(p.precio_mayor_usd) : p.precio_mayor_usd);
          
          const violates = nextDetail <= nextCost || nextMayor <= nextCost;
          if (violates) violationsCount++;
          
          return {
            p,
            nextCost,
            nextDetail,
            nextMayor,
            violates
          };
        });

        // Filter products for the manual selection list
        const filteredForSelection = products.filter(p => 
          p.description.toLowerCase().includes(generalAdjustSearch.toLowerCase()) ||
          p.barcode.toLowerCase().includes(generalAdjustSearch.toLowerCase())
        );

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[50] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-4xl w-full h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
              {/* Header */}
              <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 flex justify-between items-center text-white">
                <h3 className="text-sm font-extrabold uppercase tracking-wider font-mono flex items-center gap-2">
                  <Layers className="w-4 h-4 bg-emerald-700/50 rounded-full p-0.5" />
                  Ajuste General de Precios (Porcentaje)
                </h3>
                <button 
                  onClick={() => setShowGeneralAdjustModal(false)}
                  className="text-white/80 hover:text-white text-base focus:outline-none"
                >
                  ✕
                </button>
              </div>

              {/* Main Content Area (Two Columns) */}
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left Column: Settings */}
                <div className="w-1/2 p-6 border-r border-slate-200 overflow-y-auto space-y-5">
                  {/* 1. Scope selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono block">Ámbito de Aplicación</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjustScope('todos')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold font-sans transition-all border ${
                          adjustScope === 'todos'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-650'
                        }`}
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustScope('categoria')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold font-sans transition-all border ${
                          adjustScope === 'categoria'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-650'
                        }`}
                      >
                        Por Categoría
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustScope('seleccionados')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold font-sans transition-all border ${
                          adjustScope === 'seleccionados'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-650'
                        }`}
                      >
                        Manual (Uno a Uno)
                      </button>
                    </div>

                    {/* Category Selection Dropdown */}
                    {adjustScope === 'categoria' && (
                      <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                        <label className="text-[10px] text-slate-500 block mb-1 font-sans">Seleccione Categoría</label>
                        <select
                          value={selectedScopeCategory}
                          onChange={(e) => setSelectedScopeCategory(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-350 rounded p-2 text-xs text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none"
                        >
                          {allCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* 2. Adjustment Type and Percentage */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono block">Tipo de Ajuste y Valor</label>
                    <div className="flex gap-3">
                      <div className="w-1/2">
                        <label className="text-[10px] text-slate-500 block mb-1 font-sans">Acción</label>
                        <select
                          value={generalAdjustType}
                          onChange={(e) => setGeneralAdjustType(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-350 rounded p-2 text-xs font-bold text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none"
                        >
                          <option value="aumento">Aumento (+)</option>
                          <option value="disminucion">Disminución (-)</option>
                        </select>
                      </div>
                      <div className="w-1/2">
                        <label className="text-[10px] text-slate-500 block mb-1 font-sans">Porcentaje (%)</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={generalAdjustPct}
                          onChange={(e) => setGeneralAdjustPct(e.target.value)}
                          placeholder="Ej: 10"
                          className="w-full bg-slate-50 border border-slate-350 rounded p-2 text-xs text-slate-800 font-mono focus:bg-white focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. Fields to Adjust Checkboxes */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono block">Precios a Modificar</label>
                    <div className="flex gap-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-sans text-slate-700 select-none">
                        <input
                          type="checkbox"
                          checked={generalAdjustCost}
                          onChange={(e) => setGeneralAdjustCost(e.target.checked)}
                          className="rounded border-slate-350 text-emerald-600 focus:ring-emerald-500"
                        />
                        Precio Costo
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-sans text-slate-700 select-none">
                        <input
                          type="checkbox"
                          checked={generalAdjustDetail}
                          onChange={(e) => setGeneralAdjustDetail(e.target.checked)}
                          className="rounded border-slate-350 text-emerald-600 focus:ring-emerald-500"
                        />
                        Venta Detalle
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-sans text-slate-700 select-none">
                        <input
                          type="checkbox"
                          checked={generalAdjustMayor}
                          onChange={(e) => setGeneralAdjustMayor(e.target.checked)}
                          className="rounded border-slate-350 text-emerald-600 focus:ring-emerald-500"
                        />
                        Venta Mayor
                      </label>
                    </div>
                  </div>

                  {/* 4. Reason / Justification */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono block">Justificación / Motivo</label>
                    <textarea
                      rows={2}
                      value={generalAdjustReason}
                      onChange={(e) => setGeneralAdjustReason(e.target.value)}
                      placeholder="Motivo de la actualización de precios (Obligatorio)..."
                      className="w-full bg-slate-50 border border-slate-350 rounded-lg px-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none font-sans"
                    />
                  </div>
                </div>

                {/* Right Column: Preview & Selection */}
                <div className="w-1/2 p-6 bg-slate-50 flex flex-col overflow-hidden">
                  {adjustScope === 'seleccionados' ? (
                    /* Manual Selection Mode view */
                    <div className="flex-1 flex flex-col min-h-0 space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono">Selección de Productos ({selectedProductIds.length})</label>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedProductIds.length === filteredForSelection.length) {
                              setSelectedProductIds([]);
                            } else {
                              setSelectedProductIds(filteredForSelection.map(p => p.id));
                            }
                          }}
                          className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold"
                        >
                          {selectedProductIds.length === filteredForSelection.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                        </button>
                      </div>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-450">
                          <Search className="w-3.5 h-3.5" />
                        </span>
                        <input
                          type="text"
                          placeholder="Buscar por descripción o código..."
                          value={generalAdjustSearch}
                          onChange={(e) => setGeneralAdjustSearch(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 pl-8 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-sans"
                        />
                      </div>
                      
                      <div className="flex-1 border border-slate-200 rounded-lg bg-white overflow-y-auto divide-y divide-slate-100">
                        {filteredForSelection.map(p => {
                          const isChecked = selectedProductIds.includes(p.id);
                          return (
                            <label 
                              key={p.id} 
                              className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer text-xs select-none"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setSelectedProductIds(prev => prev.filter(id => id !== p.id));
                                  } else {
                                    setSelectedProductIds(prev => [...prev, p.id]);
                                  }
                                }}
                                className="rounded border-slate-350 text-emerald-600 focus:ring-emerald-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-700 truncate">{p.description}</p>
                                <p className="text-[10px] text-slate-400 font-mono truncate">{p.barcode} • Costo: ${p.precio_costo_usd.toFixed(2)}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* General Preview Mode view */
                    <div className="flex-1 flex flex-col min-h-0 space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold font-mono">
                          Resumen Global ({targetProducts.length} Afectados)
                        </label>
                        {violationsCount > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded font-extrabold animate-pulse">
                              ⚠️ {violationsCount} Violaciones de Regla Costo/Venta
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowViolationAssistantModal(true)}
                              className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-1 rounded-md shadow-sm transition-all flex items-center gap-1 font-mono uppercase active:scale-95"
                            >
                              <Wand2 className="w-3.5 h-3.5" />
                              <span>✨ Asistente de Corrección</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 border border-slate-250 rounded-lg overflow-hidden bg-white flex flex-col min-h-0">
                        <div className="overflow-x-auto flex-1">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="bg-slate-100 text-[10px] uppercase text-slate-500 font-mono sticky top-0 z-10 border-b border-slate-200">
                              <tr>
                                <th className="px-3 py-2">Producto</th>
                                <th className="px-2 py-2 text-right">Costo</th>
                                <th className="px-2 py-2 text-right">Detalle</th>
                                <th className="px-2 py-2 text-right">Mayor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {updatesPreview.slice(0, 100).map(({ p, nextCost, nextDetail, nextMayor, violates }) => (
                                <tr key={p.id} className={`hover:bg-slate-50 ${violates ? 'bg-red-50/50' : ''}`}>
                                  <td className="px-3 py-1.5 font-sans min-w-[120px]">
                                    <p className="font-bold text-slate-700 truncate max-w-[150px]" title={p.description}>
                                      {p.description}
                                    </p>
                                    <span className="text-[9px] text-slate-400 font-mono block">{p.barcode}</span>
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    <span className="text-[9px] text-slate-400 block decoration-red-500 line-through">${p.precio_costo_usd.toFixed(2)}</span>
                                    <span className={`font-bold ${generalAdjustCost ? 'text-slate-800' : 'text-slate-500'}`}>${nextCost.toFixed(2)}</span>
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    <span className="text-[9px] text-slate-400 block line-through">${p.precio_detalle_usd.toFixed(2)}</span>
                                    <span className={`font-bold ${violates ? 'text-red-600' : generalAdjustDetail ? 'text-emerald-600' : 'text-slate-500'}`}>${nextDetail.toFixed(2)}</span>
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    <span className="text-[9px] text-slate-400 block line-through">${p.precio_mayor_usd.toFixed(2)}</span>
                                    <span className={`font-bold ${violates ? 'text-red-600' : generalAdjustMayor ? 'text-slate-800' : 'text-slate-500'}`}>${nextMayor.toFixed(2)}</span>
                                  </td>
                                </tr>
                              ))}
                              {updatesPreview.length > 100 && (
                                <tr>
                                  <td colSpan={4} className="px-3 py-2 text-center text-slate-450 italic text-[10px] bg-slate-50">
                                    Mostrando los primeros 100 productos de {updatesPreview.length} totales...
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center">
                <span className="text-[10px] text-slate-400 italic">
                  * Todos los precios resultantes serán redondeados a 4 decimales.
                </span>
                <div className="flex gap-2">
                  {violationsCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowViolationAssistantModal(true)}
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2.5 rounded-lg text-xs font-sans font-extrabold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                    >
                      <Wand2 className="w-4 h-4" />
                      <span>✨ Asistente de Corrección ({violationsCount})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowGeneralAdjustModal(false)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2.5 rounded-lg text-xs font-sans font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyGeneralAdjustment}
                    disabled={violationsCount > 0 || targetProducts.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-400 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-xs font-sans font-bold transition-all"
                  >
                    Aplicar Ajuste ({targetProducts.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SALIDA DE INVENTARIO MODAL (MERMAS, DAÑOS, REVERSIÓN) */}
      {showSalidaModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[50] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-5xl w-full h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-rose-700 via-rose-600 to-rose-700 px-6 py-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-white/20 rounded-lg">
                  <Minus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider font-mono flex items-center gap-2">
                    Salida de Inventario (Mermas, Errores y Reversiones)
                  </h3>
                  <p className="text-[11px] text-rose-100 font-sans">
                    Descontar productos del stock por merma, daño, vencimiento o reversión de compra a proveedor.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {salidasPausadas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowSalidaModal(false);
                      setShowPausedSalidasModal(true);
                    }}
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-extrabold px-3 py-1.5 rounded-full font-mono flex items-center gap-1 shadow transition-all active:scale-95"
                    title="Ver salidas pausadas en espera"
                  >
                    <PauseCircle className="w-4 h-4" />
                    <span>En Espera ({salidasPausadas.length})</span>
                  </button>
                )}
                <button 
                  onClick={() => setShowSalidaModal(false)}
                  className="text-white/80 hover:text-white text-lg font-bold focus:outline-none"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Controls Bar: Motivo, Modo, Observaciones */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 space-y-3 font-sans">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Selector de Motivo Principal */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Motivo General de Salida:
                  </label>
                  <select
                    value={salidaMotivo}
                    onChange={(e) => setSalidaMotivo(e.target.value)}
                    className="w-full border border-slate-300 focus:border-rose-500 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none bg-white"
                  >
                    <option value="Merma / Daño / Vencimiento">⚠️ Merma / Daño / Vencimiento</option>
                    <option value="Uso Interno / Consumo">🏢 Uso Interno / Consumo del Negocio</option>
                    <option value="Error de Carga Manual">✏️ Ajuste por Error de Carga Manual</option>
                    <option value="Reversión de Carga por Factura">📄 Reversión / Anulación Factura Proveedor</option>
                  </select>
                </div>

                {/* Tabs de Modo de Selección */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Método de Selección:
                  </label>
                  <div className="flex bg-slate-200 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setSalidaModo('manual')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                        salidaModo === 'manual'
                          ? 'bg-rose-600 text-white shadow'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Uno a Uno</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSalidaModo('factura');
                        loadComprasHistory();
                      }}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                        salidaModo === 'factura'
                          ? 'bg-rose-600 text-white shadow'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Por Factura</span>
                    </button>
                  </div>
                </div>

                {/* Observaciones generales */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Observaciones / Detalles:
                  </label>
                  <input
                    type="text"
                    value={salidaObservaciones}
                    onChange={(e) => setSalidaObservaciones(e.target.value)}
                    placeholder="Ej. Paquete dañado al descargar..."
                    className="w-full border border-slate-300 focus:border-rose-500 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none bg-white"
                  />
                </div>
              </div>

              {/* Mode Specific Controls */}
              {salidaModo === 'manual' ? (
                /* Búsqueda Uno a Uno */
                <div className="relative">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Buscar Producto para Agregar a la Salida:
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={salidaSearchTerm}
                      onChange={(e) => setSalidaSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && filteredSalidaSearchProducts.length > 0) {
                          e.preventDefault();
                          const p = filteredSalidaSearchProducts[0];
                          const exists = salidaItems.some(i => i.producto_id === p.id);
                          if (exists) {
                            showAlert('Producto Ya Agregado', `El producto "${p.description}" ya se encuentra agregado en la lista de salida.`);
                            showToast(`⚠️ "${p.description}" ya está en la lista.`);
                          } else {
                            setSalidaItems(prev => [
                              ...prev,
                              {
                                producto_id: p.id,
                                codigo: p.barcode || 'S/C',
                                descripcion: p.description,
                                stock_actual: p.stock_actual,
                                cantidad_sacar: 1,
                                costo_unitario_usd: parseFloat(p.precio_costo_usd as any) || 0,
                                motivo_especifico: salidaMotivo
                              }
                            ]);
                            setSalidaSearchTerm('');
                          }
                        }
                      }}
                      placeholder="Buscar por código, clave o descripción (Enter para añadir)..."
                      className="w-full border border-slate-300 focus:border-rose-500 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-800 outline-none bg-white font-mono font-bold shadow-xs"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  </div>

                  {/* Autocomplete dropdown */}
                  {salidaSearchTerm.trim().length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-300 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-20 font-sans text-xs divide-y divide-slate-100">
                      {filteredSalidaSearchProducts.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 italic">No se encontró ningún producto.</div>
                      ) : (
                        filteredSalidaSearchProducts.map(p => {
                          const isAdded = salidaItems.some(i => i.producto_id === p.id);
                          const currentStk = typeof p.stock_actual === 'number' ? p.stock_actual : (parseFloat(p.stock_actual as any) || 0);

                          return (
                            <div
                              key={p.id}
                              onClick={() => {
                                if (isAdded) {
                                  showAlert('Producto Ya Agregado', `El producto "${p.description}" ya se encuentra agregado en la lista de salida.`);
                                  showToast(`⚠️ "${p.description}" ya está en la lista.`);
                                } else {
                                  setSalidaItems(prev => [
                                    ...prev,
                                    {
                                      producto_id: p.id,
                                      codigo: p.barcode || 'S/C',
                                      descripcion: p.description,
                                      stock_actual: p.stock_actual,
                                      cantidad_sacar: 1,
                                      costo_unitario_usd: parseFloat(p.precio_costo_usd as any) || 0,
                                      motivo_especifico: salidaMotivo
                                    }
                                  ]);
                                  setSalidaSearchTerm('');
                                }
                              }}
                              className="p-3 hover:bg-rose-50/60 cursor-pointer flex justify-between items-center transition-colors font-sans"
                            >
                              <div className="space-y-0.5">
                                <div className="font-extrabold text-slate-900 text-xs">
                                  {p.description}
                                </div>
                                <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                  {p.barcode || 'S/C'}
                                </span>
                              </div>
                              <div className="text-right flex items-center gap-3">
                                <span className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold ${
                                  currentStk > 0 
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  Stock: {formatStockVal(currentStk, p.a_granel)}
                                </span>
                                <span className="text-emerald-700 font-mono font-black text-xs">${(parseFloat(p.precio_costo_usd as any) || 0).toFixed(2)}</span>
                                {isAdded && (
                                  <span className="bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                                    Agregado ✓
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Selección por Factura de Proveedor */
                <div className="bg-amber-50/80 border border-amber-300 p-4 rounded-xl space-y-3 font-sans">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
                    <label className="text-[11px] font-extrabold text-amber-950 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <Layers className="w-4 h-4 text-amber-700" />
                      <span>Seleccionar Factura de Compra Registrada:</span>
                    </label>
                    
                    {/* Filtros Rápidos por Fecha */}
                    <div className="flex items-center gap-1 bg-amber-100/70 p-1 rounded-lg border border-amber-200">
                      <span className="text-[10px] font-mono font-bold text-amber-800 px-1">Fecha:</span>
                      {(['all', 'today', 'week', 'month'] as const).map((filterKey) => {
                        const labels = { all: 'Todas', today: 'Hoy', week: '7 Días', month: 'Este Mes' };
                        return (
                          <button
                            key={filterKey}
                            type="button"
                            onClick={() => setSalidaInvoiceDateFilter(filterKey)}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                              salidaInvoiceDateFilter === filterKey
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'text-amber-900 hover:bg-amber-200/60'
                            }`}
                          >
                            {labels[filterKey]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Buscador + Selector */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div className="md:col-span-4 relative">
                      <Search className="w-3.5 h-3.5 text-amber-600 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Buscar por N° de factura (Ej: FAC-258)..."
                        value={salidaInvoiceSearch}
                        onChange={(e) => setSalidaInvoiceSearch(e.target.value)}
                        className="w-full bg-white border border-amber-300 focus:border-rose-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 outline-none font-mono font-bold shadow-xs"
                      />
                    </div>

                    <div className="md:col-span-8 flex items-center gap-2">
                      <select
                        value={salidaSelectedInvoiceId}
                        onChange={(e) => {
                          const invId = e.target.value;
                          setSalidaSelectedInvoiceId(invId);
                          const comp = combinedInvoices.find(c => String(c.id) === String(invId) || String(c.numero_factura).toUpperCase() === String(invId).toUpperCase());
                          if (comp && Array.isArray(comp.items)) {
                            const itemsFromInv: SalidaItem[] = comp.items.map((it: any) => {
                              const targetProd = products.find(p => p.id === (it.producto_id || it.id) || (p.barcode && String(p.barcode).toLowerCase() === String(it.codigo).toLowerCase()));
                              const realBarcode = targetProd?.barcode || it.codigo || it.product?.barcode || it.barcode || 'S/C';
                              const realDesc = targetProd?.description || it.descripcion || it.product?.description || it.description || 'PRODUCTO';
                              const realStock = typeof targetProd?.stock_actual === 'number' ? targetProd.stock_actual : (parseFloat(it.product?.stock_actual || it.stock_actual || 0));

                              return {
                                producto_id: targetProd?.id || it.producto_id || it.id,
                                codigo: realBarcode,
                                descripcion: realDesc,
                                stock_actual: realStock,
                                cantidad_sacar: parseFloat(it.cantidad || it.qty || 1),
                                costo_unitario_usd: parseFloat(it.costo_unitario_usd || it.precio_costo_usd || targetProd?.precio_costo_usd || 0),
                                motivo_especifico: `Reversión Factura #${comp.numero_factura}`
                              };
                            });
                            setSalidaItems(itemsFromInv);
                          } else {
                            setSalidaItems([]);
                          }
                        }}
                        className="w-full border border-amber-300 focus:border-rose-500 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none bg-white font-mono shadow-xs truncate"
                      >
                        <option value="">-- Seleccionar Factura ({filteredInvoicesForSalida.length} recientes) --</option>
                        {filteredInvoicesForSalida.map(c => (
                          <option key={c.id} value={c.id}>
                            🏢 {c.proveedor_nombre || 'PROVEEDOR'} | Factura #{c.numero_factura} | Fecha: {c.fecha_emision ? String(c.fecha_emision).slice(0, 10) : 'S/F'} | Total: ${parseFloat(c.total_usd || 0).toFixed(2)} ({c.items?.length || 0} ítems)
                          </option>
                        ))}
                      </select>

                      {salidaSelectedInvoiceId && (
                        <button
                          type="button"
                          onClick={() => {
                            const comp = combinedInvoices.find(c => String(c.id) === String(salidaSelectedInvoiceId) || String(c.numero_factura).toUpperCase() === String(salidaSelectedInvoiceId).toUpperCase());
                            if (comp && Array.isArray(comp.items)) {
                              const itemsFromInv: SalidaItem[] = comp.items.map((it: any) => {
                                const targetProd = products.find(p => p.id === (it.producto_id || it.id) || (p.barcode && String(p.barcode).toLowerCase() === String(it.codigo).toLowerCase()));
                                const realBarcode = targetProd?.barcode || it.codigo || it.product?.barcode || it.barcode || 'S/C';
                                const realDesc = targetProd?.description || it.descripcion || it.product?.description || it.description || 'PRODUCTO';
                                const realStock = typeof targetProd?.stock_actual === 'number' ? targetProd.stock_actual : (parseFloat(it.product?.stock_actual || it.stock_actual || 0));

                                return {
                                  producto_id: targetProd?.id || it.producto_id || it.id,
                                  codigo: realBarcode,
                                  descripcion: realDesc,
                                  stock_actual: realStock,
                                  cantidad_sacar: parseFloat(it.cantidad || it.qty || 1),
                                  costo_unitario_usd: parseFloat(it.costo_unitario_usd || it.precio_costo_usd || targetProd?.precio_costo_usd || 0),
                                  motivo_especifico: `Reversión Total Factura #${comp.numero_factura}`
                                };
                              });
                              setSalidaItems(itemsFromInv);
                              showAlert('Factura Completa Cargada', `Se cargaron los ${itemsFromInv.length} productos de la factura #${comp.numero_factura} para reversión total de inventario.`);
                            }
                          }}
                          className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs font-sans flex items-center gap-1.5 shadow transition-all active:scale-95 whitespace-nowrap flex-shrink-0"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Cargar Factura Completa</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Table of selected items to remove */}
            <div className="flex-1 overflow-y-auto p-6 font-sans">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span>Productos a Descontar del Inventario ({salidaItems.length}):</span>
                </h4>
                {salidaItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSalidaItems([])}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Limpiar Lista
                  </button>
                )}
              </div>

              {salidaItems.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-slate-400 space-y-2">
                  <Minus className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-bold">No hay productos agregados para salida</p>
                  <p className="text-xs text-slate-400">
                    {salidaModo === 'manual'
                      ? 'Busque un producto por código o descripción en el campo superior para agregarlo.'
                      : 'Seleccione una factura de compra para importar sus productos.'}
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-slate-800 text-white font-bold text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="p-3 text-center w-12">#</th>
                        <th className="p-3 w-32">Código</th>
                        <th className="p-3">Descripción</th>
                        <th className="p-3 text-right w-28">Stock Actual</th>
                        <th className="p-3 text-center w-36">Cant. a Sacar</th>
                        <th className="p-3 text-right w-28">Costo ($)</th>
                        <th className="p-3 text-right w-28">Subtotal ($)</th>
                        <th className="p-3 text-center w-12">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white font-mono text-xs">
                      {salidaItems.map((item, idx) => {
                        const subtotal = (item.cantidad_sacar || 0) * (item.costo_unitario_usd || 0);
                        const isExceeding = item.cantidad_sacar > item.stock_actual;

                        return (
                          <tr key={idx} className={`hover:bg-slate-50 transition-colors ${isExceeding ? 'bg-amber-50/60' : ''}`}>
                            <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                            <td className="p-3 font-bold text-slate-700 font-mono">
                              <span className="bg-slate-100 border border-slate-200 text-slate-800 px-2 py-0.5 rounded text-[11px]">
                                {item.codigo || 'S/C'}
                              </span>
                            </td>
                            <td className="p-3 font-bold text-slate-900 font-sans">
                              {item.descripcion}
                              {isExceeding && (
                                <span className="ml-2 bg-amber-500 text-slate-950 font-bold px-1.5 py-0.5 rounded text-[10px] font-sans">
                                  ⚠️ Supera el stock actual ({item.stock_actual})
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-700 font-bold">
                              <span className={`px-2 py-0.5 rounded text-[10.5px] font-extrabold ${
                                item.stock_actual > 0 
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {item.stock_actual}
                              </span>
                            </td>
                            <td className="p-3">
                              <input
                                type="number"
                                step="any"
                                min="0.001"
                                value={item.cantidad_sacar || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const updated = [...salidaItems];
                                  updated[idx].cantidad_sacar = val;
                                  setSalidaItems(updated);
                                }}
                                className="w-full border border-rose-300 focus:border-rose-600 focus:ring-1 focus:ring-rose-500 rounded px-2 py-1 text-center font-bold font-mono text-xs text-rose-900 bg-rose-50/50"
                              />
                            </td>
                            <td className="p-3 text-right text-slate-700 font-bold">${(item.costo_unitario_usd || 0).toFixed(2)}</td>
                            <td className="p-3 text-right text-rose-700 font-black">${subtotal.toFixed(2)}</td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => setSalidaItems(salidaItems.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                                title="Quitar de la lista"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer summary bar and action buttons */}
            <div className="bg-slate-900 text-white p-4 flex flex-col md:flex-row items-center justify-between gap-4 font-sans border-t border-slate-800">
              <div className="flex items-center gap-6 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Ítems:</span>
                  <strong className="text-base text-amber-400 font-mono">{salidaItems.length}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Unidades a Sacar:</span>
                  <strong className="text-base text-white font-mono">
                    {salidaItems.reduce((acc, curr) => acc + (parseFloat(curr.cantidad_sacar as any) || 0), 0)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Valor Total Pérdida/Ajuste:</span>
                  <strong className="text-base text-rose-400 font-mono">
                    ${salidaItems.reduce((acc, curr) => acc + ((parseFloat(curr.cantidad_sacar as any) || 0) * (parseFloat(curr.costo_unitario_usd as any) || 0)), 0).toFixed(2)}
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowSalidaModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-xs uppercase tracking-wide transition-all"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handlePauseSalida}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-lg text-xs uppercase tracking-wide flex items-center gap-1.5 shadow transition-all active:scale-95"
                >
                  <PauseCircle className="w-4 h-4" />
                  <span>Pausar Salida</span>
                </button>

                <button
                  type="button"
                  disabled={isProcessingSalida || salidaItems.length === 0}
                  onClick={handleProcessSalida}
                  className="px-6 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-extrabold rounded-lg text-xs uppercase tracking-wide flex items-center gap-1.5 shadow-lg shadow-rose-950/40 transition-all active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isProcessingSalida ? 'Procesando...' : 'Procesar Salida'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SALIDAS EN ESPERA (PAUSADAS) MODAL */}
      {showPausedSalidasModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[55] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200 font-sans">
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <PauseCircle className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-extrabold uppercase tracking-wider font-mono">
                  Salidas de Inventario en Espera ({salidasPausadas.length})
                </h3>
              </div>
              <button
                onClick={() => setShowPausedSalidasModal(false)}
                className="text-slate-400 hover:text-white text-base focus:outline-none"
              >
                ✕
              </button>
            </div>

            {/* Content list */}
            <div className="p-6 overflow-y-auto space-y-3 flex-1 bg-slate-50">
              {salidasPausadas.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <PauseCircle className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-bold">No hay salidas pausadas en espera</p>
                </div>
              ) : (
                salidasPausadas.map(p => {
                  const totalUnits = (p.items || []).reduce((acc, curr) => acc + (parseFloat(curr.cantidad_sacar as any) || 0), 0);
                  const totalCost = (p.items || []).reduce((acc, curr) => acc + ((parseFloat(curr.cantidad_sacar as any) || 0) * (parseFloat(curr.costo_unitario_usd as any) || 0)), 0);

                  return (
                    <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-amber-400 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded uppercase font-mono">
                            {p.motivo}
                          </span>
                          {p.numero_factura && (
                            <span className="bg-slate-100 text-slate-700 text-[10px] font-mono px-2 py-0.5 rounded border border-slate-300">
                              Factura #{p.numero_factura}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-800">
                          {p.items?.length || 0} productos ({totalUnits} unidades) — <span className="text-rose-600 font-mono font-extrabold">${totalCost.toFixed(2)}</span>
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          Pausado el {p.fecha} por {p.usuario_nombre} {p.observaciones ? `(${p.observaciones})` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSalidaMotivo(p.motivo || 'Merma / Daño / Vencimiento');
                            setSalidaModo(p.origen || 'manual');
                            setSalidaObservaciones(p.observaciones || '');
                            setSalidaSelectedInvoiceId(p.factura_id ? String(p.factura_id) : '');
                            setSalidaItems(p.items || []);
                            setSalidaEditingDraftId(p.id);

                            setShowPausedSalidasModal(false);
                            setShowSalidaModal(true);
                            loadComprasHistory();
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow transition-all active:scale-95"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Retomar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const updated = salidasPausadas.filter(s => s.id !== p.id);
                            syncPausedSalidas(updated);
                          }}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all"
                          title="Eliminar borrador"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-100 border-t border-slate-200 px-6 py-3 text-right">
              <button
                type="button"
                onClick={() => setShowPausedSalidasModal(false)}
                className="bg-slate-700 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-lg text-xs uppercase"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CARGA POR FACTURA MODAL */}
      {showInvoiceLoadModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[50] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-6xl w-full h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200 font-sans">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 px-6 py-3.5 flex justify-between items-center text-white shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-600/50 rounded-xl border border-emerald-400/30 shadow-inner">
                  <Layers className="w-5 h-5 text-emerald-200" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider font-mono flex items-center gap-2 text-white">
                    Carga de Mercancía por Factura
                  </h3>
                  <p className="text-[10px] text-emerald-200/80 font-sans font-medium">Recepción e ingreso de stock de mercancía con precios de costo y venta</p>
                </div>
                {pausedInvoices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPausedInvoicesModal(true)}
                    className="ml-3 bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-extrabold px-3 py-1 rounded-full font-mono flex items-center gap-1.5 shadow-md transition-all active:scale-95 border border-amber-300"
                    title="Ver otras cargas en espera"
                  >
                    <PauseCircle className="w-3.5 h-3.5 text-slate-950" />
                    <span>Cargas en Espera: {pausedInvoices.length}</span>
                  </button>
                )}
              </div>
              <button 
                onClick={() => setShowInvoiceLoadModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all focus:outline-none"
              >
                ✕
              </button>
            </div>

            {/* Factura & Proveedor Input Row */}
            <div className="bg-slate-100/80 border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-5 flex-wrap">
                {/* Selector de Proveedor con Buscador Interactivo y Ancho Ampliado */}
                <div className="flex items-center gap-2 relative">
                  <label className="text-[11px] uppercase tracking-wider text-slate-700 font-extrabold font-mono flex items-center gap-1.5 shrink-0">
                    <Building2 className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Proveedor:</span>
                  </label>
                  
                  <div className="relative w-80">
                    <input
                      type="text"
                      value={proveedorSearchTerm}
                      onFocus={() => {
                        setProveedorSearchTerm('');
                        setShowProveedorDropdown(true);
                      }}
                      onClick={() => {
                        setProveedorSearchTerm('');
                        setShowProveedorDropdown(true);
                      }}
                      onChange={(e) => {
                        setProveedorSearchTerm(e.target.value);
                        setShowProveedorDropdown(true);
                      }}
                      placeholder="Escriba para buscar proveedor..."
                      className="w-full bg-white border-2 border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-900 focus:outline-none font-sans font-bold shadow-sm cursor-text"
                    />
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />

                    {showProveedorDropdown && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => {
                            setShowProveedorDropdown(false);
                            const sel = proveedoresList.find(p => String(p.id) === String(invoiceProveedorId));
                            if (sel) {
                              setProveedorSearchTerm(sel.razon_social);
                            }
                          }} 
                        />
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-100">
                          {proveedoresList
                            .filter(p => 
                              (p.razon_social || '').toLowerCase().includes(proveedorSearchTerm.toLowerCase()) ||
                              (p.rif || '').toLowerCase().includes(proveedorSearchTerm.toLowerCase())
                            )
                            .map(p => (
                              <div
                                key={p.id}
                                onClick={() => {
                                  setInvoiceProveedorId(p.id);
                                  setProveedorSearchTerm(p.razon_social);
                                  setShowProveedorDropdown(false);
                                }}
                                className={`px-3 py-2 text-xs font-sans cursor-pointer flex items-center justify-between transition-colors ${
                                  String(invoiceProveedorId) === String(p.id) ? 'bg-emerald-50 text-emerald-900 font-extrabold' : 'hover:bg-slate-50 text-slate-700 font-medium'
                                }`}
                              >
                                <span>🏢 {p.razon_social}</span>
                                {p.rif && <span className="text-[10px] text-slate-400 font-mono font-normal">({p.rif})</span>}
                              </div>
                            ))}
                          {proveedoresList.filter(p => 
                            (p.razon_social || '').toLowerCase().includes(proveedorSearchTerm.toLowerCase()) ||
                            (p.rif || '').toLowerCase().includes(proveedorSearchTerm.toLowerCase())
                          ).length === 0 && (
                            <div className="px-3 py-3 text-xs text-slate-400 italic text-center">
                              No se encontraron proveedores
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Número de Factura */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] uppercase tracking-wider text-slate-700 font-extrabold font-mono flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-700" />
                    <span>N° Factura:</span>
                  </label>
                  
                  {/* Clean N° Container with max 10 chars limit */}
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-mono font-bold text-xs pointer-events-none select-none">
                      N°
                    </span>
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="00012345"
                      value={invoiceNumber}
                      onChange={(e) => {
                        const cleanVal = e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase().slice(0, 10);
                        setInvoiceNumber(cleanVal);
                      }}
                      className="bg-white border-2 border-slate-300 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none font-mono font-black w-36 uppercase tracking-wider shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-mono text-slate-500 font-bold bg-white border border-slate-200 px-3 py-1 rounded-lg">
                Ítems en Factura: <span className="text-emerald-700 font-black">{invoiceProducts.length}</span>
              </div>
            </div>

            {/* Content columns */}
            <div className="flex-1 flex overflow-hidden min-h-0 bg-slate-50">
              {/* Left Column: Product Search (38% width) */}
              <div className="w-[38%] p-4 border-r border-slate-200 flex flex-col overflow-hidden min-h-0 bg-white">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-extrabold font-mono flex items-center gap-1">
                    <Search className="w-3 h-3 text-emerald-600" />
                    Buscador de Productos
                  </label>
                  <span className="text-[9px] text-slate-400 font-mono">Presione Enter ↵ para añadir</span>
                </div>
                
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-grow">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar por código, clave o descripción..."
                      value={invoiceSearchTerm}
                      onChange={(e) => setInvoiceSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && filteredInvoiceSearchProducts.length > 0) {
                          e.preventDefault();
                          const firstProd = filteredInvoiceSearchProducts[0];
                          const isAdded = invoiceProducts.some(item => item.product.id === firstProd.id);
                          if (!isAdded) {
                            setInvoiceProducts(prev => [
                              ...prev,
                              {
                                product: firstProd,
                                qty: 1,
                                precio_costo_usd: firstProd.precio_costo_usd,
                                precio_detalle_usd: firstProd.precio_detalle_usd,
                                precio_mayor_usd: firstProd.precio_mayor_usd
                              }
                            ]);
                            setInvoiceSearchTerm('');
                          } else {
                            showAlert('Producto Ya Agregado', `El producto "${firstProd.description}" ya se encuentra en la lista de carga de esta factura.`);
                            showToast(`⚠️ "${firstProd.description}" ya está en la lista.`);
                            setInvoiceSearchTerm('');
                          }
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-300 focus:border-emerald-600 focus:bg-white rounded-lg px-2.5 py-1.5 pl-8 text-xs text-slate-800 focus:outline-none font-sans font-bold shadow-xs transition-all"
                    />
                    {invoiceSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setInvoiceSearchTerm('')}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewProdModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] font-sans uppercase flex items-center gap-1 shadow flex-shrink-0 active:scale-95 transition-all"
                    title="Registrar un nuevo producto en la base de datos"
                  >
                    <Plus className="w-3.5 h-3.5 bg-emerald-700/50 rounded-full p-0.5" />
                    <span>Nuevo</span>
                  </button>
                </div>

                {/* Filter products list */}
                <div className="flex-grow overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white min-h-0 shadow-xs">
                  {(() => {
                    const filtered = filteredInvoiceSearchProducts;

                    if (filtered.length === 0) {
                      return (
                        <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
                          <p className="text-xs text-slate-450 italic font-sans">No se encontró ningún producto con esa clave o descripción.</p>
                          <button
                            type="button"
                            onClick={() => setShowNewProdModal(true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] font-sans uppercase flex items-center gap-1.5 shadow"
                          >
                            <Plus className="w-3 h-3 bg-emerald-700/50 rounded-full p-0.5" />
                            Registrar Producto
                          </button>
                        </div>
                      );
                    }

                    return filtered.map(p => {
                      const isAdded = invoiceProducts.some(item => item.product.id === p.id);
                      const currentStk = typeof p.stock_actual === 'number' ? p.stock_actual : (parseFloat(p.stock_actual as any) || 0);

                      return (
                        <div key={p.id} className="flex justify-between items-center p-3 hover:bg-slate-50 transition-colors">
                          <div className="min-w-0 pr-2 space-y-0.5">
                            <p className="font-extrabold text-slate-800 text-xs truncate max-w-[210px]" title={p.description}>
                              {p.description}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[9.5px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                {p.barcode || 'S/C'}
                              </span>
                              <span className={`font-mono text-[9.5px] px-1.5 py-0.5 rounded font-bold ${
                                currentStk > 0 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : 'bg-rose-50 text-rose-600 border border-rose-200'
                              }`}>
                                Stk: {formatStockVal(currentStk, p.a_granel)}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (isAdded) {
                                showAlert('Producto Ya Agregado', `El producto "${p.description}" ya se encuentra agregado en la lista de carga de esta factura.`);
                                showToast(`⚠️ "${p.description}" ya fue agregado a la factura.`);
                                return;
                              }
                              setInvoiceProducts(prev => [
                                ...prev,
                                {
                                  product: p,
                                  qty: 1,
                                  precio_costo_usd: p.precio_costo_usd,
                                  precio_detalle_usd: p.precio_detalle_usd,
                                  precio_mayor_usd: p.precio_mayor_usd
                                }
                              ]);
                            }}
                            className={`font-sans font-extrabold text-[10px] px-3 py-1.5 rounded-lg transition-all flex-shrink-0 active:scale-95 ${
                              isAdded
                                ? 'bg-amber-100/90 text-amber-900 border border-amber-300 hover:bg-amber-200 cursor-pointer shadow-xs'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                            }`}
                            title={isAdded ? 'Ver advertencia de producto ya cargado' : 'Añadir este producto a la factura'}
                          >
                            {isAdded ? 'Cargado ✓' : 'Añadir +'}
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Right Column: Invoice Load List (62% width) */}
              <div className="w-[62%] p-4 flex flex-col overflow-hidden min-h-0 bg-slate-50">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-extrabold font-mono flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-700" />
                    Lista de Carga de Factura ({invoiceProducts.length} ítems)
                  </label>
                  {invoiceProducts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setInvoiceProducts([])}
                      className="text-[10px] text-rose-600 hover:text-rose-800 font-bold hover:underline"
                    >
                      Vaciar Lista
                    </button>
                  )}
                </div>
                
                <div className="flex-grow overflow-auto border border-slate-200 rounded-xl bg-white min-h-0 shadow-sm">
                  {invoiceProducts.length === 0 ? (
                    <div className="h-full flex flex-col justify-center items-center p-12 text-center text-slate-400 space-y-2">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                        <Layers className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-sans font-bold text-slate-600">No hay productos en esta factura aún.</p>
                      <p className="text-[11px] text-slate-400 font-sans max-w-xs">Busca y añade productos desde la columna izquierda o presiona Enter para comenzar a armar la carga.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-[10px] uppercase text-slate-600 font-mono sticky top-0 z-10 border-b border-slate-200 select-none">
                        <tr>
                          <th className="px-3 py-2.5 w-[30%]">Producto</th>
                          <th className="px-2 py-2.5 text-center w-[10%]">Exist.</th>
                          <th className="px-2 py-2.5 text-center w-[16%] bg-emerald-600 text-white font-black rounded-t-md shadow-xs">
                            A AGREGAR 📦
                          </th>
                          <th className="px-2 py-2.5 text-right w-[14%]">Costo $</th>
                          <th className="px-2 py-2.5 text-right w-[14%]">Detalle $</th>
                          <th className="px-2 py-2.5 text-right w-[14%]">Mayor $</th>
                          <th className="px-2 py-2.5 text-center w-[6%]"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoiceProducts.map((item, index) => {
                          const hasPriceIssue = item.precio_detalle_usd <= item.precio_costo_usd || item.precio_mayor_usd <= item.precio_costo_usd;

                          return (
                            <tr key={item.product.id} className={`hover:bg-slate-50/80 transition-colors ${hasPriceIssue ? 'bg-amber-50/40' : ''}`}>
                              {/* Producto */}
                              <td className="px-3 py-2.5 font-sans">
                                <div className="flex items-center justify-between gap-1.5">
                                  <div className="min-w-0 pr-1 space-y-0.5">
                                    <p className="font-extrabold text-slate-800 text-xs truncate max-w-[140px]" title={item.product.description}>
                                      {item.product.description}
                                    </p>
                                    <span className="text-[9.5px] text-slate-400 font-mono block truncate">{item.product.barcode || 'S/C'}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setInvoiceAuxItemIndex(index)}
                                    className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 p-1.5 rounded-md transition-all shadow-xs flex-shrink-0 active:scale-95"
                                    title="Abrir Auxiliar de Cálculo de Precios para este producto"
                                  >
                                    <Calculator className="w-3.5 h-3.5 text-amber-700" />
                                  </button>
                                </div>
                              </td>

                              {/* Existencia Actual */}
                              <td className="px-2 py-2.5 text-center font-mono select-none">
                                <span className="bg-slate-100 text-slate-700 font-bold px-2 py-1 rounded-md text-[10.5px] border border-slate-200 inline-block">
                                  {formatStockVal(item.product.stock_actual, item.product.a_granel)}
                                </span>
                              </td>

                              {/* Cantidad A Agregar */}
                              <td className="px-2 py-2.5 text-center bg-emerald-50/40">
                                <input
                                  type="number"
                                  min="0.001"
                                  step="any"
                                  value={item.qty}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setInvoiceProducts(prev => prev.map((it, idx) => idx === index ? { ...it, qty: val } : it));
                                  }}
                                  className="w-16 bg-emerald-100/90 border-2 border-emerald-500 rounded-lg py-1 px-1 text-center text-xs font-mono font-black text-emerald-950 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-400 shadow-sm"
                                />
                              </td>

                              {/* Costo USD */}
                              <td className="px-2 py-2.5 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.precio_costo_usd}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setInvoiceProducts(prev => prev.map((it, idx) => idx === index ? { ...it, precio_costo_usd: val } : it));
                                  }}
                                  className="w-16 bg-white border border-slate-300 rounded-md py-1 px-1 text-right text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-400 shadow-xs"
                                />
                              </td>

                              {/* Precio Detalle USD */}
                              <td className="px-2 py-2.5 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.precio_detalle_usd}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setInvoiceProducts(prev => prev.map((it, idx) => idx === index ? { ...it, precio_detalle_usd: val } : it));
                                  }}
                                  className={`w-16 bg-white border rounded-md py-1 px-1 text-right text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-400 shadow-xs ${
                                    item.precio_detalle_usd <= item.precio_costo_usd ? 'border-rose-400 text-rose-700 bg-rose-50' : 'border-slate-300'
                                  }`}
                                />
                              </td>

                              {/* Precio Mayor USD */}
                              <td className="px-2 py-2.5 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.precio_mayor_usd}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setInvoiceProducts(prev => prev.map((it, idx) => idx === index ? { ...it, precio_mayor_usd: val } : it));
                                  }}
                                  className={`w-16 bg-white border rounded-md py-1 px-1 text-right text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-400 shadow-xs ${
                                    item.precio_mayor_usd <= item.precio_costo_usd ? 'border-rose-400 text-rose-700 bg-rose-50' : 'border-slate-300'
                                  }`}
                                />
                              </td>

                              {/* Botón Eliminar Ítem */}
                              <td className="px-2 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInvoiceProducts(prev => prev.filter((_, idx) => idx !== index));
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all active:scale-95 mx-auto font-bold"
                                  title="Eliminar este producto de la carga"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Summary Footer */}
            <div className="bg-white px-6 py-3.5 border-t border-slate-200 flex flex-wrap justify-between items-center gap-4 shadow-inner">
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-slate-450 font-extrabold font-mono">Total Costo Factura (USD)</span>
                  <span className="text-emerald-700 font-mono font-black text-lg leading-tight">
                    ${invoiceProducts.reduce((acc, it) => acc + (it.qty * it.precio_costo_usd), 0).toFixed(2)}
                  </span>
                </div>
                {tasaDia && (
                  <div className="flex flex-col border-l border-slate-200 pl-4">
                    <span className="text-[10px] uppercase tracking-wider text-slate-450 font-extrabold font-mono">Total en Bolívares (VES)</span>
                    <span className="text-slate-800 font-mono font-bold text-sm leading-tight">
                      Bs. {(invoiceProducts.reduce((acc, it) => acc + (it.qty * it.precio_costo_usd), 0) * tasaDia).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2.5 items-center">
                <button
                  type="button"
                  onClick={() => setShowInvoiceLoadModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-sans font-extrabold transition-all active:scale-95"
                >
                  Cancelar
                </button>

                {/* BOTÓN PAUSAR CARGA */}
                <button
                  type="button"
                  disabled={invoiceProducts.length === 0}
                  onClick={handlePauseInvoiceLoad}
                  className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-transparent text-slate-950 font-extrabold border border-amber-600 px-4 py-2.5 rounded-xl text-xs font-sans flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                  title="Poner esta carga en espera para reanudarla más tarde"
                >
                  <PauseCircle className="w-4 h-4 text-slate-950" />
                  <span>Pausar Carga</span>
                </button>

                <button
                  type="button"
                  disabled={isProcessingInvoiceLoad || invoiceProducts.length === 0 || !invoiceNumber || !invoiceNumber.trim()}
                  onClick={async () => {
                    if (isProcessingInvoiceLoad) return;
                    setIsProcessingInvoiceLoad(true);
                    try {
                      const invalidIndex = invoiceProducts.findIndex(
                        it => it.precio_detalle_usd <= it.precio_costo_usd || it.precio_mayor_usd <= it.precio_costo_usd
                      );

                      if (invalidIndex !== -1) {
                        showAlert(`El producto "${invoiceProducts[invalidIndex].product.description}" tiene precios de venta menores o iguales a su precio de costo.`);
                        return;
                      }

                      const isOcasional = String(invoiceProveedorId) === '1' || invoiceProveedorId === 1;
                      let rawInvoiceNum = invoiceNumber.trim().toUpperCase();
                      if (isOcasional && !rawInvoiceNum.startsWith('OCASIONAL-')) {
                        rawInvoiceNum = `OCASIONAL-${rawInvoiceNum.replace(/^FAC-/, '')}`;
                      }

                      const totalCost = invoiceProducts.reduce((acc, it) => acc + (it.qty * it.precio_costo_usd), 0);
                      const compraPayload = {
                        numero_factura: rawInvoiceNum,
                        proveedor_id: parseInt(String(invoiceProveedorId), 10) || 1,
                        usuario_id: _currentUser?.id || 1,
                        fecha_emision: getLocalDateStr(),
                        condicion_pago: 'Contado',
                        subtotal_usd: totalCost,
                        total_usd: totalCost,
                        total_ves: totalCost * (tasaDia || 1),
                        observaciones: `Carga por Factura #${rawInvoiceNum}`,
                        items: invoiceProducts.map(it => ({
                          producto_id: it.product.id,
                          cantidad: it.qty,
                          costo_unitario_usd: it.precio_costo_usd,
                          precio_detalle_usd: it.precio_detalle_usd,
                          precio_mayor_usd: it.precio_mayor_usd,
                          total_usd: it.qty * it.precio_costo_usd,
                          product: {
                            id: it.product.id,
                            barcode: it.product.barcode,
                            description: it.product.description
                          }
                        }))
                      };

                      const res = await fetch(`${getApiBaseUrl()}/compras`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(compraPayload)
                      });

                      if (res.ok) {
                        // Actualizar el estado local de productos sin peticiones PUT de red adicionales
                        invoiceProducts.forEach(it => {
                          const prod = products.find(p => p.id === it.product.id);
                          if (prod) {
                            const cleanQty = prod.a_granel ? it.qty : Math.round(it.qty);
                            prod.stock_actual = (parseFloat(prod.stock_actual as any) || 0) + cleanQty;
                            prod.precio_costo_usd = it.precio_costo_usd;
                            prod.precio_detalle_usd = it.precio_detalle_usd;
                            prod.precio_mayor_usd = it.precio_mayor_usd;
                          }
                        });

                        loadComprasHistory();
                        await refreshKardexMovements();
                        showToast(`Se han cargado con éxito ${invoiceProducts.length} productos bajo la Factura: ${invoiceNumber}`);
                        setShowInvoiceLoadModal(false);
                        setInvoiceProducts([]);
                        setInvoiceNumber('');
                      } else {
                        const errData = await res.json().catch(() => ({}));
                        showAlert('Error de Carga', errData.error || 'Ocurrió un error al procesar la carga por factura.');
                      }
                    } catch (e: any) {
                      console.error('Error procesando carga por factura:', e);
                      showAlert('Error de Carga', e?.message || 'Ocurrió un error al procesar la carga por factura.');
                    } finally {
                      setIsProcessingInvoiceLoad(false);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-400 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-xs font-sans font-extrabold transition-all flex items-center gap-2 shadow-md active:scale-95"
                >
                  {isProcessingInvoiceLoad ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Procesando Carga...</span>
                    </>
                  ) : (
                    <span>Procesar Carga ({invoiceProducts.length})</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CARGAS EN ESPERA (PAUSADAS) */}
      {showPausedInvoicesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 flex justify-between items-center text-slate-950 font-sans">
              <h3 className="text-sm font-extrabold uppercase tracking-wider font-mono flex items-center gap-2">
                <PauseCircle className="w-5 h-5 text-slate-950" />
                Cargas de Factura en Espera ({pausedInvoices.length})
              </h3>
              <button 
                onClick={() => setShowPausedInvoicesModal(false)}
                className="text-slate-950/80 hover:text-slate-950 text-base font-bold focus:outline-none"
              >
                ✕
              </button>
            </div>

            {/* List Body */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3 bg-slate-50">
              {pausedInvoices.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <PauseCircle className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-sans italic">No hay cargas de factura en espera en este momento.</p>
                </div>
              ) : (
                pausedInvoices.map((p) => {
                  const totalCost = p.items.reduce((acc, it) => acc + (it.qty * it.precio_costo_usd), 0);
                  return (
                    <div key={p.id} className="bg-white border border-slate-250 rounded-xl p-4 shadow-sm hover:border-amber-400 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="space-y-1 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-sm text-slate-800">
                            {p.invoiceNumber}
                          </span>
                          <span className="bg-amber-100 text-amber-900 font-bold text-[10px] px-2 py-0.5 rounded-full font-mono">
                            {p.items.length} {p.items.length === 1 ? 'producto' : 'productos'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          Pausada el: {p.date}
                        </p>
                        <p className="text-xs text-slate-600">
                          Total Costo Est.: <strong className="font-mono text-emerald-700 font-extrabold">${totalCost.toFixed(2)}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <button
                          type="button"
                          onClick={() => handleResumeInvoiceLoad(p)}
                          className="flex-1 md:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-xs font-sans uppercase flex items-center justify-center gap-1.5 shadow transition-all active:scale-95"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Retomar Carga</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePausedInvoice(p.id, p.invoiceNumber)}
                          className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold p-2 rounded-lg text-xs transition-all"
                          title="Eliminar esta carga en espera"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center text-xs font-sans">
              <span className="text-slate-500 font-mono text-[11px]">
                Las cargas pausadas se conservan automáticamente aunque cierre el sistema.
              </span>
              <button
                type="button"
                onClick={() => setShowPausedInvoicesModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUXILIAR DE PRECIOS PARA ÍTEM DE FACTURA */}
      {invoiceAuxItemIndex !== null && invoiceProducts[invoiceAuxItemIndex] && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[85] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-amber-300 max-w-4xl w-full p-5 space-y-4 font-sans animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-xs font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-2 font-mono">
                  <Calculator className="w-4 h-4 text-amber-600" />
                  AUXILIAR DE CÁLCULO DE PRECIOS - {invoiceProducts[invoiceAuxItemIndex].product.description}
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">Código: {invoiceProducts[invoiceAuxItemIndex].product.barcode}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setInvoiceAuxItemIndex(null)} 
                className="text-slate-400 hover:text-slate-700 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <AuxiliarCalculoPrecios
              initialCost={invoiceProducts[invoiceAuxItemIndex].precio_costo_usd.toString()}
              initialDetail={invoiceProducts[invoiceAuxItemIndex].precio_detalle_usd.toString()}
              initialMayor={invoiceProducts[invoiceAuxItemIndex].precio_mayor_usd.toString()}
              tasaBCV={bcvRateUSD || parseFloat(localStorage.getItem('pos_bcv_usd') || '0') || 0}
              tasaFallback={tasaDia || parseFloat(localStorage.getItem('pos_tasa_activa') || '0') || 0}
              taxActive={!invoiceProducts[invoiceAuxItemIndex].product.exento_impuesto}
              taxPct={invoiceProducts[invoiceAuxItemIndex].product.porcentaje_impuesto || 16}
              onApplyPrices={({ cost, detail, mayor }) => {
                const costNum = parseFloat(cost) || 0;
                const detailNum = parseFloat(detail) || 0;
                const mayorNum = parseFloat(mayor) || 0;
                setInvoiceProducts(prev => prev.map((it, idx) => idx === invoiceAuxItemIndex ? {
                  ...it,
                  precio_costo_usd: costNum,
                  precio_detalle_usd: detailNum,
                  precio_mayor_usd: mayorNum
                } : it));
                setInvoiceAuxItemIndex(null);
                showToast('✅ Precios calculados y aplicados correctamente a la factura.');
              }}
            />
          </div>
        </div>
      )}

      {/* MODAL: GESTOR DE IMAGEN INDIVIDUAL (MANUAL / URL / IA) */}
      {showImageManagerModal && imageManagerProduct && (
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm z-[88] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200 font-sans text-slate-800">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 px-6 py-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-400/30">
                  <ImageIcon className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider font-mono">
                    Gestión de Imagen del Producto
                  </h3>
                  <p className="text-[11px] text-slate-300 font-medium truncate max-w-xs">
                    {imageManagerProduct.description}
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowImageManagerModal(false)}
                className="text-white/70 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Product Info Bar */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs font-mono">
                <span className="text-slate-500 font-sans">Código: <strong className="text-slate-800">{imageManagerProduct.barcode}</strong></span>
                <span className="text-slate-500 font-sans">Categoría: <strong className="text-slate-800">{imageManagerProduct.category || 'GENERAL'}</strong></span>
              </div>

              {/* High-Res Image Preview Card */}
              <div className="flex flex-col items-center justify-center bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-4 relative group">
                <div className="w-44 h-44 rounded-xl bg-white border border-slate-200 overflow-hidden shadow-md flex items-center justify-center relative">
                  <div className="text-center p-4">
                    <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-1" />
                    <span className="text-xs text-slate-400 font-bold block">Sin Imagen Asignada</span>
                  </div>
                  {imageManagerUrlInput && (
                    <img 
                      key={`mgr-prod-img-${imageManagerProduct.id}-${imageManagerUrlInput}`}
                      src={formatImageUrl(imageManagerUrlInput)} 
                      alt={imageManagerProduct.description} 
                      className="w-full h-full object-cover absolute inset-0 bg-white" 
                      onLoad={(e) => { (e.currentTarget as HTMLElement).style.display = 'block'; }}
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  )}
                </div>

                {imageManagerUrlInput && (
                  <button
                    type="button"
                    onClick={handleRemoveManagerImage}
                    className="mt-3 text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Quitar / Eliminar Foto</span>
                  </button>
                )}
              </div>

              {/* Option 1: Upload from PC */}
              <div className="space-y-2">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 font-mono block">
                  1. Cargar Foto desde la Computadora (Manual)
                </label>
                <label className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl py-2.5 px-4 text-xs font-bold text-slate-700 flex items-center justify-center gap-2 cursor-pointer shadow-2xs transition-all active:scale-98">
                  <UploadCloud className="w-4 h-4 text-indigo-600" />
                  <span>{isUploadingManualImage ? 'Guardando Imagen...' : 'Seleccionar Archivo de Imagen (JPG, PNG, WEBP)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploadingManualImage}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && imageManagerProduct) {
                        handleUploadImageFile(file, 'manager', imageManagerProduct);
                      }
                    }}
                  />
                </label>
              </div>

              {/* Option 2: Direct URL */}
              <div className="space-y-2">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 font-mono block">
                  2. Pegar Enlace Directo de Internet (URL)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1 flex items-center">
                    <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3" />
                    <input
                      type="text"
                      placeholder="https://ejemplo.com/foto-producto.jpg"
                      value={imageManagerUrlInput}
                      onChange={(e) => setImageManagerUrlInput(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-indigo-600 focus:outline-none font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveManagerUrl}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition-all active:scale-95 flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Guardar</span>
                  </button>
                </div>
              </div>

              {/* Option 3: Generate with AI */}
              <div className="space-y-2 pt-1 border-t border-slate-200">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 font-mono block">
                  3. Generación con Inteligencia Artificial
                </label>
                <button
                  type="button"
                  disabled={isGeneratingAiImage}
                  onClick={() => handleGenerateAiImageForProduct(imageManagerProduct)}
                  className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                  <span>{isGeneratingAiImage ? 'Generando Foto con IA...' : 'Generar Foto Fotográfica con IA'}</span>
                </button>
                <p className="text-[10px] text-slate-400 text-center font-sans">
                  La IA detecta automáticamente la descripción y categoría para generar una fotografía hiperrealista en fondo limpio.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowImageManagerModal(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-5 py-2 rounded-lg transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GENERACIÓN MASIVA DE FOTOS CON IA */}
      {showBulkAiModal && (
        <div className="fixed inset-0 bg-slate-955/85 backdrop-blur-md z-[88] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-indigo-200 max-w-2xl w-full overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200 font-sans text-slate-800 max-h-[90vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-950 px-6 py-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-400/30">
                  <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider font-mono flex items-center gap-2">
                    Generador Masivo de Fotos con IA
                  </h3>
                  <p className="text-[11px] text-indigo-200 font-medium">
                    Asigna fotos fotográficas automáticas a todo tu inventario en un solo clic
                  </p>
                </div>
              </div>
              <button 
                type="button"
                disabled={isBulkAiRunning}
                onClick={() => setShowBulkAiModal(false)}
                className="text-white/70 hover:text-white text-lg font-bold disabled:opacity-30"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              {/* Summary Badges */}
              <div className="grid grid-cols-2 gap-3 font-mono">
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs text-sky-800 font-sans font-bold">Total en Catálogo:</span>
                  <span className="text-base font-black text-sky-900">{products.length}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs text-amber-800 font-sans font-bold">Productos Sin Foto:</span>
                  <span className="text-base font-black text-amber-900">
                    {products.filter(p => !p.imagen_url || p.imagen_url.trim() === '').length}
                  </span>
                </div>
              </div>

              {/* Scope Selection */}
              {!isBulkAiRunning && (
                <div className="space-y-2">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 font-mono block">
                    Alcance del Procesamiento
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`border-2 rounded-xl p-3.5 cursor-pointer flex items-start gap-3 transition-all ${
                      bulkAiScope === 'sin_foto'
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}>
                      <input
                        type="radio"
                        name="bulkScope"
                        checked={bulkAiScope === 'sin_foto'}
                        onChange={() => setBulkAiScope('sin_foto')}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <strong className="text-xs text-slate-900 block font-bold">Solo Productos Sin Foto</strong>
                        <span className="text-[11px] text-slate-500 block mt-0.5 font-normal">
                          Procesa únicamente los {products.filter(p => !p.imagen_url || p.imagen_url.trim() === '').length} productos que aún no tienen imagen (Recomendado).
                        </span>
                      </div>
                    </label>

                    <label className={`border-2 rounded-xl p-3.5 cursor-pointer flex items-start gap-3 transition-all ${
                      bulkAiScope === 'todos'
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}>
                      <input
                        type="radio"
                        name="bulkScope"
                        checked={bulkAiScope === 'todos'}
                        onChange={() => setBulkAiScope('todos')}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <strong className="text-xs text-slate-900 block font-bold">Todos los Productos ({products.length})</strong>
                        <span className="text-[11px] text-slate-500 block mt-0.5 font-normal">
                          Regenera y actualiza las imágenes de todo el catálogo completo.
                        </span>
                      </div>
                    </label>

                    {/* OPTION 3: POR CATEGORÍA ESPECÍFICA */}
                    <label className={`border-2 rounded-xl p-3.5 cursor-pointer flex items-start gap-3 transition-all sm:col-span-2 ${
                      bulkAiScope === 'categoria'
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}>
                      <input
                        type="radio"
                        name="bulkScope"
                        checked={bulkAiScope === 'categoria'}
                        onChange={() => {
                          setBulkAiScope('categoria');
                          if (!selectedBulkCategory && availableCategories.length > 0) {
                            setSelectedBulkCategory(availableCategories[0]);
                          }
                        }}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex-1">
                        <strong className="text-xs text-slate-900 block font-bold">Por Categoría Específica</strong>
                        <span className="text-[11px] text-slate-500 block mt-0.5 font-normal">
                          Genera o actualiza fotos con IA únicamente para los productos de una categoría del inventario.
                        </span>

                        {bulkAiScope === 'categoria' && (
                          <div className="mt-3 space-y-2 bg-white p-3 rounded-xl border border-indigo-200 shadow-xs" onClick={(e) => e.stopPropagation()}>
                            <label className="text-[10px] font-bold uppercase text-slate-700 block">Seleccionar Categoría:</label>
                            <select
                              value={selectedBulkCategory}
                              onChange={(e) => setSelectedBulkCategory(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs px-3 py-2 rounded-lg font-bold outline-none focus:border-indigo-500 shadow-2xs"
                            >
                              {availableCategories.map(cat => {
                                const countTotal = products.filter(p => (p.category || '').toUpperCase() === cat).length;
                                const countNoImg = products.filter(p => (p.category || '').toUpperCase() === cat && (!p.imagen_url || p.imagen_url.trim() === '')).length;
                                return (
                                  <option key={cat} value={cat}>
                                    {cat} — ({countTotal} productos | {countNoImg} sin foto)
                                  </option>
                                );
                              })}
                            </select>

                            <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={bulkCategoryNoPhotoOnly}
                                onChange={(e) => setBulkCategoryNoPhotoOnly(e.target.checked)}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <span className="text-xs text-slate-800 font-bold">
                                Procesar únicamente productos sin foto en esta categoría
                              </span>
                            </label>
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Progress & Live Processing Bar */}
              {isBulkAiRunning && (
                <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3 shadow-lg animate-in fade-in">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-amber-300 font-bold flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Procesando catálogo con IA...
                    </span>
                    <span className="font-extrabold text-white">
                      {bulkAiProgress.current} / {bulkAiProgress.total} ({bulkAiProgress.percent}%)
                    </span>
                  </div>

                  {/* Progress bar container */}
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${bulkAiProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Live Card Gallery of Generated Items with One-Click Discard */}
              {bulkAiLogs.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <h4 className="text-[11px] font-mono font-black uppercase tracking-wider text-slate-700">
                        Resultados de Fotos ({bulkAiLogs.filter(l => l.success && !l.discarded).length} Conservadas / {bulkAiLogs.filter(l => l.discarded).length} Descartadas):
                      </h4>
                      <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded font-bold font-sans">
                        💡 Haga clic en cualquier foto para descartarla o conservarla
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBulkAiLogs(prev => prev.map(i => i.success ? { ...i, discarded: false } : i))}
                        className="text-[10px] font-bold font-sans text-emerald-700 hover:text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shadow-2xs hover:bg-emerald-100 transition-all cursor-pointer"
                      >
                        ✓ Conservar Todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkAiLogs(prev => prev.map(i => ({ ...i, discarded: true })))}
                        className="text-[10px] font-bold font-sans text-red-700 hover:text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded shadow-2xs hover:bg-red-100 transition-all cursor-pointer"
                      >
                        ✕ Descartar Todas
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto p-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                    {bulkAiLogs.map((log) => {
                      const isDiscarded = log.discarded;
                      return (
                        <div 
                          key={log.id} 
                          onClick={() => log.success && handleToggleDiscardBulkAiItem(log.id)}
                          className={`bg-white border rounded-xl p-2.5 flex flex-col items-center text-center shadow-xs transition-all relative select-none cursor-pointer group hover:scale-[1.02] ${
                            isDiscarded 
                              ? 'border-red-400 bg-red-50/40 opacity-55 ring-1 ring-red-400' 
                              : 'border-emerald-500 bg-white ring-2 ring-emerald-500/80 shadow-sm'
                          }`}
                          title={isDiscarded ? "Haga clic para CONSERVAR esta foto" : "Haga clic para DESCARTAR esta foto"}
                        >
                          {/* Badge Corner Status */}
                          <div className="absolute top-1.5 right-1.5 z-10">
                            {isDiscarded ? (
                              <span className="bg-red-600 text-white text-[8px] font-extrabold font-mono px-1.5 py-0.5 rounded-full shadow flex items-center gap-0.5">
                                ❌ Descartada
                              </span>
                            ) : log.success ? (
                              <span className="bg-emerald-600 text-white text-[8px] font-extrabold font-mono px-1.5 py-0.5 rounded-full shadow flex items-center gap-0.5">
                                ✓ Conservar
                              </span>
                            ) : (
                              <span className="bg-amber-500 text-slate-950 text-[8px] font-extrabold font-mono px-1.5 py-0.5 rounded-full shadow">
                                Falló
                              </span>
                            )}
                          </div>

                          <div className="w-20 h-20 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center mb-1.5 flex-shrink-0 relative shadow-inner">
                            <ImageIcon className="w-6 h-6 text-slate-300" />
                            {log.imageUrl && (
                              <img 
                                key={`bulk-ai-img-${log.id}-${log.imageUrl}`}
                                src={formatImageUrl(log.imageUrl)} 
                                alt={log.description} 
                                className={`w-full h-full object-cover absolute inset-0 bg-white transition-all ${isDiscarded ? 'grayscale opacity-75' : ''}`}
                                onLoad={(e) => { (e.currentTarget as HTMLElement).style.display = 'block'; }}
                                onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                              />
                            )}
                          </div>
                          <span className="text-[10px] font-extrabold text-slate-850 uppercase truncate w-full block leading-tight">
                            {log.description}
                          </span>
                          <span className="text-[8.5px] font-mono text-slate-400 block truncate w-full">
                            {log.barcode}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Info Notice */}
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 leading-relaxed font-sans flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Almacenamiento Local Optimizado:</strong> Las fotos generadas se descargan y almacenan localmente en el servidor, garantizando que el punto de venta (POS) y los celulares carguen las imágenes de forma instantánea sin gastar datos ni depender de conexión a internet.
                </span>
              </div>
            </div>

            {/* Footer Controls */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center">
              <button
                type="button"
                disabled={isBulkAiRunning}
                onClick={() => setShowBulkAiModal(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg transition-all disabled:opacity-50"
              >
                Cerrar
              </button>

              <div className="flex gap-2">
                {isBulkAiRunning ? (
                  <button
                    type="button"
                    onClick={() => { isBulkAiCancelledRef.current = true; }}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 shadow"
                  >
                    <PauseCircle className="w-4 h-4" /> Pausar Proceso
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleStartBulkAiGeneration}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs px-5 py-2 rounded-lg transition-all shadow flex items-center gap-1.5"
                    >
                      <Sparkles className="w-4 h-4" /> {bulkAiLogs.length > 0 ? 'Re-Generar Fotos' : 'Iniciar Generación Masiva con IA'}
                    </button>
                    {bulkAiLogs.filter(l => l.success && l.imageUrl && !l.discarded).length > 0 && (
                      <button
                        type="button"
                        onClick={handleApplyBulkAiSelected}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2 rounded-lg transition-all shadow flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Aplicar Fotos Conservadas ({bulkAiLogs.filter(l => l.success && l.imageUrl && !l.discarded).length})
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MENÚ CONTEXTUAL FLOTANTE (CLIC DERECHO EN PRODUCTO) */}
      {contextMenu && (
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-[120] w-64 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-2xl overflow-hidden py-1 text-slate-700 font-sans text-xs animate-scale-in"
        >
          {/* Header con resumen del producto */}
          <div className="px-3 py-2 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-center gap-2.5 border-b border-slate-700">
            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700 flex-shrink-0 relative">
              {contextMenu.product.imagen_url ? (
                <img src={contextMenu.product.imagen_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Package className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] text-blue-300 font-mono font-bold block truncate">{contextMenu.product.barcode}</span>
              <span className="text-[11px] font-black text-white block uppercase truncate leading-tight">{contextMenu.product.description}</span>
              <span className="text-[9px] text-emerald-400 font-mono block mt-0.5">
                Stock: {formatStockVal(contextMenu.product.stock_actual, contextMenu.product.a_granel)} {contextMenu.product.a_granel ? 'kg' : 'uds'}
              </span>
            </div>
          </div>

          <div className="p-1 space-y-0.5">
            {/* 1. Modificar Ficha Técnica */}
            {hasPermission('editar') && (
              <button
                type="button"
                onClick={() => {
                  const prod = contextMenu.product;
                  setContextMenu(null);
                  handleOpenEditProduct(prod);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 hover:text-slate-900 rounded-lg flex items-center gap-2 font-bold transition-colors"
              >
                <Edit className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                <span>Modificar Ficha Técnica</span>
              </button>
            )}

            {/* 2. Ajustar Precios */}
            {hasPermission('editar') && (
              <button
                type="button"
                onClick={() => {
                  const prod = contextMenu.product;
                  setContextMenu(null);
                  handleOpenPrices(prod);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 hover:text-amber-900 rounded-lg flex items-center gap-2 font-bold transition-colors"
              >
                <PenTool className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <span>Ajustar Precios ($ / Bs)</span>
              </button>
            )}

            {/* 3. Ajustar Stock */}
            <button
              type="button"
              onClick={() => {
                const prod = contextMenu.product;
                setContextMenu(null);
                handleOpenAdjust(prod);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-cyan-50 hover:text-cyan-900 rounded-lg flex items-center gap-2 font-bold transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-600 flex-shrink-0" />
              <span>Ajustar Existencia (Stock)</span>
            </button>

            <div className="border-t border-slate-100 my-1"></div>

            {/* 4. Gestionar Foto Manual */}
            <button
              type="button"
              onClick={() => {
                const prod = contextMenu.product;
                setContextMenu(null);
                handleOpenImageManager(prod);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 hover:text-blue-900 rounded-lg flex items-center gap-2 font-bold transition-colors"
            >
              <ImageIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              <span>Gestionar Foto (Subir / URL)</span>
            </button>

            {/* 5. Generar Foto con IA */}
            <button
              type="button"
              onClick={() => {
                const prod = contextMenu.product;
                setContextMenu(null);
                handleGenerateAiImageForProduct(prod);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 hover:text-indigo-900 rounded-lg flex items-center gap-2 font-bold transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span>Generar Foto con IA</span>
            </button>

            {/* 6. Eliminar Producto */}
            {hasPermission('eliminar') && (
              <>
                <div className="border-t border-slate-100 my-1"></div>
                <button
                  type="button"
                  disabled={contextMenu.product.stock_actual > 0}
                  onClick={() => {
                    setSelectedProduct(contextMenu.product);
                    setContextMenu(null);
                    handleDeleteProductClick();
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 font-bold transition-colors ${
                    contextMenu.product.stock_actual > 0 
                      ? 'opacity-40 cursor-not-allowed text-slate-400' 
                      : 'hover:bg-rose-50 text-rose-600 hover:text-rose-700'
                  }`}
                  title={contextMenu.product.stock_actual > 0 ? "Solo se puede eliminar con existencia 0" : "Eliminar producto"}
                >
                  <Minus className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                  <span>Eliminar Producto</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* HIDDEN CAPTURE CONTAINER FOR ATTACHED WHATSAPP REPORT DOCUMENT */}
      {capturingReportMode && (
        <div className="fixed top-0 left-[-9999px] z-[-50] opacity-100 pointer-events-none">
          <div
            id="inventario-report-capture-card"
            className="w-[850px] bg-white p-6 text-slate-900 font-sans shadow-none rounded-none border border-slate-300"
          >
            {/* Header */}
            <div className="border-b-2 border-slate-900 pb-3 mb-4 flex justify-between items-start">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900 tracking-wide uppercase">
                  {companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.'}
                </h1>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  RIF: {companyConfig?.rif || 'J-411332631'} | Teléfono: {companyConfig?.telefono || '0412-5515172'}
                </p>
                <p className="text-xs font-bold text-indigo-700 mt-1 uppercase">
                  {capturingReportMode === 'faltantes' ? '⚠️ REPORTE DE PRODUCTOS FALTANTES (BAJO STOCK / AGOTADOS)' : '📋 REPORTE GENERAL DE INVENTARIO Y AUDITORÍA'}
                </p>
              </div>
              <div className="text-right">
                <span className="bg-slate-900 text-white font-mono font-bold text-xs px-2.5 py-1 rounded">
                  ESTACIÓN: {localStorage.getItem('pos_terminal_name') || 'CAJA_01'}
                </span>
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  Generado: {new Date().toLocaleString('es-VE')}
                </p>
              </div>
            </div>

            {/* KPI Summary Row */}
            <div className="grid grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-500 font-sans font-bold uppercase block">Artículos Reportados:</span>
                <strong className="text-slate-900 text-sm font-extrabold">
                  {capturingReportMode === 'faltantes' 
                    ? sortedProducts.filter(p => (parseFloat(p.stock_actual as any) || 0) <= (parseFloat(p.stock_minimo as any) || 0)).length 
                    : sortedProducts.length} productos
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-sans font-bold uppercase block">Valor Total (Detalle):</span>
                <strong className="text-emerald-700 text-sm font-extrabold">
                  ${(capturingReportMode === 'faltantes'
                    ? sortedProducts.filter(p => (parseFloat(p.stock_actual as any) || 0) <= (parseFloat(p.stock_minimo as any) || 0))
                    : sortedProducts
                  ).reduce((acc, p) => acc + p.precio_detalle_usd * (parseFloat(p.stock_actual as any) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-sans font-bold uppercase block">Valor Total (Costo):</span>
                <strong className="text-slate-900 text-sm font-extrabold">
                  ${(capturingReportMode === 'faltantes'
                    ? sortedProducts.filter(p => (parseFloat(p.stock_actual as any) || 0) <= (parseFloat(p.stock_minimo as any) || 0))
                    : sortedProducts
                  ).reduce((acc, p) => acc + p.precio_costo_usd * (parseFloat(p.stock_actual as any) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-sans font-bold uppercase block">Filtro Aplicado:</span>
                <strong className="text-slate-800 text-[11px] font-sans truncate block">
                  {selectedCategories.length === 0 ? 'TODAS LAS CATEGORÍAS' : selectedCategories.join(', ')}
                </strong>
              </div>
            </div>

            {/* Table of items */}
            <table className="w-full text-left font-mono text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white font-sans uppercase text-[9px] border-b border-slate-900">
                  <th className="p-1.5 w-24">Código</th>
                  <th className="p-1.5">Descripción</th>
                  <th className="p-1.5 w-24">Categoría</th>
                  <th className="p-1.5 w-14 text-right">Mínimo</th>
                  <th className="p-1.5 w-14 text-right">Existencia</th>
                  <th className="p-1.5 w-16 text-right">P. Detalle</th>
                  <th className="p-1.5 w-16 text-right">P. Mayor</th>
                  <th className="p-1.5 w-16 text-right">P. Bulto</th>
                </tr>
              </thead>
              <tbody>
                {(capturingReportMode === 'faltantes'
                  ? sortedProducts.filter(p => (parseFloat(p.stock_actual as any) || 0) <= (parseFloat(p.stock_minimo as any) || 0))
                  : sortedProducts
                ).slice(0, 100).map((p, idx) => (
                  <tr key={p.id || idx} className="border-b border-slate-200">
                    <td className="p-1.5 text-slate-600 font-bold">{p.barcode}</td>
                    <td className="p-1.5 font-bold text-slate-900">{p.description}</td>
                    <td className="p-1.5 text-slate-500 font-sans">{p.category}</td>
                    <td className="p-1.5 text-right text-slate-600">{formatStockVal(p.stock_minimo, p.a_granel)}</td>
                    <td className={`p-1.5 text-right font-extrabold ${p.stock_actual <= p.stock_minimo ? 'text-red-600' : 'text-slate-900'}`}>
                      {formatStockVal(p.stock_actual, p.a_granel)}
                    </td>
                    <td className="p-1.5 text-right text-emerald-700 font-extrabold">${p.precio_detalle_usd.toFixed(2)}</td>
                    <td className="p-1.5 text-right text-slate-700 font-bold">${p.precio_mayor_usd.toFixed(2)}</td>
                    <td className="p-1.5 text-right text-amber-700 font-bold">
                      {(p.precio_bulto_usd && p.precio_bulto_usd > 0) ? `$${p.precio_bulto_usd.toFixed(2)}${p.cant_bulto && p.cant_bulto > 0 ? ` (x${p.cant_bulto})` : ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer */}
            <div className="mt-4 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-400 font-mono flex justify-between items-center">
              <span>*** WinterPOS AL System - Documento Oficial de Auditoría ***</span>
              <span>Página 1 de 1</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
