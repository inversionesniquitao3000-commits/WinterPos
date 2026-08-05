import { useState, useEffect, useRef, useMemo } from 'react';
import { Product, InventoryMovement, PriceAdjustmentHistory, User, CompanyConfig } from '../types';
import { Package, History, PenTool, Plus, Search, Layers, RefreshCw, Minus, Printer, ArrowUpDown, ArrowUp, ArrowDown, Edit, CheckCircle2, Upload, Download, Tag, FileSpreadsheet, MessageCircle, ChevronDown, Calculator, PauseCircle, Play, Trash2, Wand2, Sparkles, ShieldAlert, RotateCcw, BarChart3, TrendingUp, Award, DollarSign, Calendar, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { getLocalDateStr } from '../utils';
import AuxiliarCalculoPrecios from './AuxiliarCalculoPrecios';
import AsistenteImportacionPDF from './AsistenteImportacionPDF';

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
  onUpdateProductStockBulk
}: InventarioProps) {
  const { showAlert, showConfirm } = useDialog();
  const hasPermission = (action: 'ver' | 'crear' | 'editar' | 'eliminar') => {
    if (!_currentUser || !_currentUser.rol) return true;
    if ((_currentUser.rol || '').toLowerCase() === 'administrador') return true;
    if (!_currentUser.permisos) return true; // default fallback if none specified
    return !!_currentUser.permisos.inventario?.[action];
  };

  const [activeSubTab, setActiveSubTab] = useState<'catalogo' | 'movimientos' | 'precios' | 'estadisticas'>('catalogo');
  const [selectedMovementDetail, setSelectedMovementDetail] = useState<any>(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Estados para Carga por Factura
  const [showInvoiceLoadModal, setShowInvoiceLoadModal] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceProducts, setInvoiceProducts] = useState<{
    product: Product;
    qty: number;
    precio_costo_usd: number;
    precio_detalle_usd: number;
    precio_mayor_usd: number;
  }[]>([]);
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState('');
  const [invoiceAuxItemIndex, setInvoiceAuxItemIndex] = useState<number | null>(null);

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
  const [auditFilterTab, setAuditFilterTab] = useState<'todos' | 'sin_categoria' | 'sin_codigo' | 'sin_descripcion' | 'sin_stock_min'>('todos');
  const [auditDefaultCategory, setAuditDefaultCategory] = useState('ALIMENTOS');
  const [auditDefaultStockMin, setAuditDefaultStockMin] = useState('5');
  const [editedAuditProducts, setEditedAuditProducts] = useState<{
    [id: number]: { barcode?: string; description?: string; category?: string; stock_minimo?: number }
  }>({});
  const [isSavingAuditCorrections, setIsSavingAuditCorrections] = useState(false);
  const [auditSaveProgress, setAuditSaveProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  const catalogAuditIssues = useMemo(() => {
    return products.map(p => {
      const edit = editedAuditProducts[p.id] || {};
      const cat = edit.category !== undefined ? edit.category : p.category;
      const code = edit.barcode !== undefined ? edit.barcode : p.barcode;
      const desc = edit.description !== undefined ? edit.description : p.description;
      const minStk = edit.stock_minimo !== undefined ? edit.stock_minimo : p.stock_minimo;

      const missingCategory = !cat || !cat.trim() || cat.trim().toUpperCase() === 'SIN CATEGORIA';
      const missingBarcode = !code || !code.trim();
      const missingDescription = !desc || !desc.trim();
      const missingStockMin = minStk === undefined || minStk === null || minStk <= 0;

      const origCat = !p.category || !p.category.trim() || p.category.trim().toUpperCase() === 'SIN CATEGORIA';
      const origCode = !p.barcode || !p.barcode.trim();
      const origDesc = !p.description || !p.description.trim();
      const origMin = !p.stock_minimo || p.stock_minimo <= 0;

      const hasOriginalIssue = origCat || origCode || origDesc || origMin;
      const isEdited = editedAuditProducts[p.id] !== undefined;

      const hasIssue = hasOriginalIssue || isEdited;

      return {
        product: p,
        currentCategory: cat || '',
        currentBarcode: code || '',
        currentDescription: desc || '',
        currentStockMin: minStk || 0,
        missingCategory,
        missingBarcode,
        missingDescription,
        missingStockMin,
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
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  const [filterStock, setFilterStock] = useState<'todos' | 'con_existencia' | 'sin_existencia' | 'menor_igual' | 'mayor_igual'>('todos');
  const [customStockValue, setCustomStockValue] = useState<string>('5');
  const [filterMinStock, setFilterMinStock] = useState<'todos' | 'bajo_minimo'>('todos');



  // Sorting states
  interface SortRule {
    field: 'descripcion' | 'categoria' | 'stock_minimo' | 'existencia' | 'precio_costo' | 'precio_detalle' | 'precio_mayor';
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
  const [isAuxExpandedNew, setIsAuxExpandedNew] = useState(false);
  const [isAuxExpandedEdit, setIsAuxExpandedEdit] = useState(false);
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
    showAdjustModal,
    showPriceModal,
    showCategoryMenu,
    showReportMenu,
    isSavingAuditCorrections
  ]);

  const safeProducts = useMemo(() => Array.isArray(products) ? products : [], [products]);
  const safeMovements = useMemo(() => Array.isArray(movements) ? movements : [], [movements]);
  const safePriceHistory = useMemo(() => Array.isArray(priceHistory) ? priceHistory : [], [priceHistory]);

  const effectiveBcvRate = useMemo(() => {
    if (bcvRateUSD && bcvRateUSD > 0) return bcvRateUSD;
    if (tasaDia && tasaDia > 0) return tasaDia;
    if (companyConfig?.tasa_oficial_bcv && companyConfig.tasa_oficial_bcv > 0) return companyConfig.tasa_oficial_bcv;
    const cachedRate = parseFloat(localStorage.getItem('winterpos_bcv_rate') || '0');
    if (cachedRate > 0) return cachedRate;
    return 1;
  }, [bcvRateUSD, tasaDia, companyConfig]);

  const isBcvRateOnline = !!(bcvRateUSD && bcvRateUSD > 0);

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
      const dateMin = m.date ? m.date.substring(0, 16) : '';
      const groupKey = `${dateMin}_${m.motivo}_${m.usuario}_${m.type}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          date: m.date,
          motivo: m.motivo,
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
    const headers = [
      'codigo_barras_clave',
      'descripcion',
      'categoria',
      'stock_actual',
      'stock_minimo',
      'precio_costo_usd',
      'precio_detalle_usd',
      'precio_mayor_usd',
      'cantidad_mayorista',
      'exento_impuesto',
      'a_granel'
    ];
    const sampleRow1 = [
      '75010001',
      'Coca Cola 1.5L',
      'BEBIDAS',
      '100',
      '10',
      '1.20',
      '1.80',
      '1.50',
      '6',
      'NO',
      'NO'
    ];
    const sampleRow2 = [
      '1000200',
      'Jamon Ahumado Especial',
      'CHARCUTERIA',
      '25.5',
      '5',
      '4.50',
      '6.80',
      '5.90',
      '3',
      'NO',
      'SI'
    ];
    const csvContent = "\uFEFF" + [headers.join(';'), sampleRow1.join(';'), sampleRow2.join(';')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_carga_masiva_productos.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportInventoryToCsv = () => {
    const headers = [
      'codigo_barras_clave',
      'descripcion',
      'categoria',
      'stock_actual',
      'stock_minimo',
      'precio_costo_usd',
      'precio_detalle_usd',
      'precio_mayor_usd',
      'cantidad_mayorista',
      'exento_impuesto',
      'a_granel'
    ];
    
    const rows = products.map(p => [
      p.barcode,
      p.description,
      p.category,
      p.stock_actual.toString(),
      p.stock_minimo.toString(),
      p.precio_costo_usd.toString(),
      p.precio_detalle_usd.toString(),
      p.precio_mayor_usd.toString(),
      p.cantidad_mayorista.toString(),
      p.exento_impuesto ? 'SI' : 'NO',
      p.a_granel ? 'SI' : 'NO'
    ]);

    const csvContent = "\uFEFF" + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `respaldo_inventario_${getLocalDateStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        const text = event.target?.result as string;
        if (!text) {
          setBulkErrors(['El archivo está vacío.']);
          setImportStatus('idle');
          return;
        }

        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length < 2) {
          setBulkErrors(['El archivo debe contener al menos la cabecera y una fila de datos.']);
          setImportStatus('idle');
          return;
        }

        const firstLine = lines[0];
        let separator = ',';
        if (firstLine.includes(';')) {
          separator = ';';
        }

        const parseRow = (rowText: string) => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < rowText.length; i++) {
            const char = rowText[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === separator && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result.map(val => val.replace(/^"|"$/g, '').trim());
        };

        const headers = parseRow(lines[0]);
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
          'exento_impuesto',
          'a_granel'
        ];

        const headerIndices: { [key: string]: number } = {};
        expectedHeaders.forEach(expected => {
          const index = headers.findIndex(h => h.toLowerCase() === expected.toLowerCase() || h.toLowerCase().replace(/[\s_]+/g, '') === expected.toLowerCase().replace(/[\s_]+/g, ''));
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

        for (let i = 1; i < lines.length; i++) {
          const row = parseRow(lines[i]);
          if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;

          const getValue = (headerKey: string, defaultValue: string = '') => {
            const idx = headerIndices[headerKey];
            return idx !== -1 && idx < row.length ? row[idx] : defaultValue;
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
          
          const exentoStr = getValue('exento_impuesto', 'NO').toUpperCase();
          const exento_impuesto = exentoStr === 'SI' || exentoStr === 'YES' || exentoStr === 'TRUE' || exentoStr === '1';

          if (!barcode) {
            errors.push(`Fila ${i + 1}: El código de barras o clave es obligatorio.`);
          }
          if (!description) {
            errors.push(`Fila ${i + 1}: La descripción es obligatoria.`);
          }
          if (precio_costo_usd < 0 || precio_detalle_usd < 0 || precio_mayor_usd < 0) {
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
        setBulkErrors([`Error al procesar el archivo: ${err.message}`]);
        setImportStatus('idle');
      }
    };
    reader.onerror = () => {
      setBulkErrors(['Error al leer el archivo.']);
      setImportStatus('idle');
    };
    reader.readAsText(file);
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
  const [newMinStock, setNewMinStock] = useState('5');
  const [newWholesaleQty, setNewWholesaleQty] = useState('12');
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
  const [editMinStock, setEditMinStock] = useState('5');
  const [editWholesaleQty, setEditWholesaleQty] = useState('12');
  const [editTaxActive, setEditTaxActive] = useState(true);
  const [editTaxName, setEditTaxName] = useState('IVA');
  const [editTaxPct, setEditTaxPct] = useState('16');
  const [editAGranel, setEditAGranel] = useState(false);
  const [editVencimiento, setEditVencimiento] = useState('');

  const handleOpenEditProduct = (p: Product) => {
    setEditClave(p.barcode);
    setEditBarcode(p.barcode);
    setEditDesc(p.description);
    setEditCat(p.category);
    setEditCost(p.precio_costo_usd.toString());
    setEditDetail(p.precio_detalle_usd.toString());
    setEditMayor(p.precio_mayor_usd.toString());
    setEditMinStock(p.stock_minimo.toString());
    setEditWholesaleQty(p.cantidad_mayorista.toString());
    setEditTaxActive(!p.exento_impuesto);
    setEditTaxName('IVA');
    setEditTaxPct((p.porcentaje_impuesto && p.porcentaje_impuesto > 0 ? p.porcentaje_impuesto : 16).toString());
    setEditAGranel(p.a_granel || false);
    setEditVencimiento(p.fecha_vencimiento || '');
    setShowEditProdModal(true);
  };

  const handleUpdateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

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

    const updatedProd: Product = {
      ...selectedProduct,
      barcode: editBarcode.trim() || editClave.trim(),
      description: editDesc.trim().toUpperCase(),
      category: editCat,
      stock_actual: editAGranel ? selectedProduct.stock_actual : Math.round(selectedProduct.stock_actual),
      stock_minimo: editAGranel ? (parseFloat(editMinStock) || 0) : (parseInt(editMinStock) || 0),
      cantidad_mayorista: parseInt(editWholesaleQty) || 12,
      exento_impuesto: !editTaxActive,
      porcentaje_impuesto: editTaxActive ? (parseFloat(editTaxPct) || 0) : 0,
      a_granel: editAGranel,
      fecha_vencimiento: editVencimiento || undefined,
      precio_costo_usd: cost,
      precio_detalle_usd: detail,
      precio_mayor_usd: mayor,
    };

    const success = await onUpdateProduct(updatedProd);
    if (success) {
      setShowEditProdModal(false);
      setSelectedProduct(null);
      showToast('Producto actualizado con éxito.');
    }
  };

  // Modal position and minimize state
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Reset positions when modal toggles
  useEffect(() => {
    if (!showNewProdModal) {
      setDragPos({ x: 0, y: 0 });
      setIsMinimized(false);
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
  }, [searchTerm, selectedCategories, filterStock, customStockValue, filterMinStock]);

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
        
      return matchesSearch && matchesCategory && matchesStock && matchesMinStock;
    });
  }, [safeProducts, searchTerm, selectedCategories, filterStock, customStockValue, filterMinStock]);

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

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClave.trim() || !newDesc.trim()) {
      showAlert('Clave del producto y descripción son obligatorios.', 'Campos Requeridos', 'warning');
      return;
    }

    // Generate barcode if not provided
    const barcodeVal = newBarcode.trim() !== '' ? newBarcode.trim() : newClave.trim();

    if (products.some(p => p.barcode === barcodeVal.toUpperCase())) {
      showAlert('Ya existe un producto registrado con ese código de barras o clave.', 'Código Duplicado', 'error');
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
      cantidad_mayorista: wholesale,
      exento_impuesto: !newTaxActive,
      porcentaje_impuesto: newTaxActive ? (parseFloat(newTaxPct) || 0) : 0,
      imagen_url: '',
      estado: 'Activo',
      a_granel: newAGranel,
      fecha_vencimiento: newVencimiento.trim() !== '' ? newVencimiento.trim() : undefined
    };

    onAddProduct(newProd);
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

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showAlert('Por favor permita las ventanas emergentes para poder imprimir el reporte.', 'Popups Bloqueados', 'warning');
      return;
    }

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
      filterStock === 'todos' ? 'TODOS' :
      filterStock === 'con_existencia' ? 'CON EXISTENCIA (>0)' :
      filterStock === 'sin_existencia' ? 'SIN EXISTENCIA (0)' :
      filterStock === 'menor_5' ? 'EXISTENCIA ≤ 5' :
      filterStock === 'menor_10' ? 'EXISTENCIA ≤ 10' :
      filterStock === 'menor_15' ? 'EXISTENCIA ≤ 15' : 'TODOS';
    const minStockFilterLabel = 
      filterMinStock === 'todos' ? 'TODOS' : 'BAJO STOCK MÍNIMO';

    const fieldNames: Record<string, string> = {
      descripcion: 'Descripción',
      categoria: 'Categoría',
      stock_minimo: 'Stock Mínimo',
      existencia: 'Existencia',
      precio_costo: 'P. Costo',
      precio_detalle: 'P. Detalle',
      precio_mayor: 'P. Mayor',
    };
    const sortInfo = sortRules.length > 0 
      ? ` (Ordenado por: ${sortRules.map(r => `${fieldNames[r.field] || r.field} ${r.direction === 'asc' ? '↑' : '↓'}`).join(', ')})`
      : '';

    const totalQtyFormatted = totalFilteredQty.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

    const rowsHtml = sortedProducts.map(p => `
      <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid;">
        <td style="padding: 1.5px 3px; font-family: monospace; font-size: 8px; font-weight: bold; color: #334155;">${p.barcode}</td>
        <td style="padding: 1.5px 3px; font-size: 8.5px; font-weight: bold; color: #0f172a;">${p.description}</td>
        <td style="padding: 1.5px 3px; font-size: 8px; color: #475569;">${p.category}</td>
        <td style="padding: 1.5px 3px; text-align: right; font-family: monospace; font-size: 8px; color: #64748b;">${formatStockVal(p.stock_minimo, p.a_granel)}</td>
        <td style="padding: 1.5px 3px; text-align: right; font-family: monospace; font-size: 8px; font-weight: bold; ${p.stock_actual <= p.stock_minimo ? 'color: #dc2626;' : 'color: #0f172a;'}">${formatStockVal(p.stock_actual, p.a_granel)}</td>
        <td style="padding: 1.5px 3px; text-align: right; font-family: monospace; font-size: 8px; color: #475569;">$${p.precio_costo_usd.toFixed(2)}</td>
        <td style="padding: 1.5px 3px; text-align: right; font-family: monospace; font-size: 8.5px; font-weight: bold; color: #059669;">$${p.precio_detalle_usd.toFixed(2)}</td>
        <td style="padding: 1.5px 3px; text-align: right; font-family: monospace; font-size: 8px; color: #475569;">$${p.precio_mayor_usd.toFixed(2)} <span style="font-size: 7.5px; color: #94a3b8;">x${p.cantidad_mayorista}</span></td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte de Inventario - ${companyName}</title>
          <style>
            @page { size: portrait; margin: 0.5cm; }
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; padding: 5px; font-size: 8.5px; line-height: 1.15; }
            .header { border-bottom: 1.5px solid #0f172a; padding-bottom: 4px; margin-bottom: 6px; }
            .title { font-size: 13px; font-weight: bold; text-transform: uppercase; margin: 0; color: #0f172a; }
            .subtitle { font-size: 8.5px; color: #475569; margin: 1px 0 0 0; }
            .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 6px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 4px 6px; border-radius: 4px; }
            .info-item { display: flex; flex-direction: column; }
            .info-label { font-size: 7.5px; text-transform: uppercase; color: #64748b; font-weight: bold; }
            .info-value { font-size: 9.5px; font-weight: bold; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 4px; }
            th { background-color: #f1f5f9; padding: 3px 4px; font-weight: bold; text-align: left; text-transform: uppercase; font-size: 8px; border-bottom: 1.5px solid #94a3b8; color: #334155; }
            @media print {
              body { margin: 0; }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <h1 class="title">${companyName}</h1>
                <p class="subtitle">RIF: ${companyRif} | Tel: ${companyTel} | Reporte General de Inventario</p>
              </div>
              <div style="text-align: right;">
                <p style="margin: 0; font-weight: bold; font-size: 9.5px;">Estación: ${localStorage.getItem('pos_terminal_name') || 'CAJA_01'}</p>
                <p style="margin: 1px 0 0 0; font-size: 8px; color: #64748b;">Generado: ${now}</p>
              </div>
            </div>
          </div>

          <div style="margin-bottom: 4px; font-weight: bold; text-transform: uppercase; font-size: 8px; color: #475569;">
            Filtros Aplicados: 
            <span style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 3px; margin-right: 4px; color: #1e293b;">Categoría: ${categoryFilterLabel}</span>
            <span style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 3px; margin-right: 4px; color: #1e293b;">Stock: ${stockFilterLabel}</span>
            <span style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 3px; color: #1e293b;">Alerta: ${minStockFilterLabel}</span>
            <span style="color: #64748b; font-style: italic; font-weight: normal; margin-left: 4px;">${sortInfo}</span>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Productos Listados</span>
              <span class="info-value">${totalFilteredProducts} artículos</span>
            </div>
            <div class="info-item">
              <span class="info-label">Total Unidades</span>
              <span class="info-value">${totalQtyFormatted}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Valor Inv. (Detalle)</span>
              <span class="info-value" style="color: #059669;">$${totalFilteredValueVenta.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Valor Inv. (Costo)</span>
              <span class="info-value">$${totalFilteredValueCosto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 14%; text-align: left;">Código</th>
                <th style="width: 36%; text-align: left;">Descripción</th>
                <th style="width: 14%; text-align: left;">Categoría</th>
                <th style="width: 7%; text-align: right;">Mínimo</th>
                <th style="width: 7%; text-align: right;">Existencia</th>
                <th style="width: 7%; text-align: right;">P. Costo</th>
                <th style="width: 7.5%; text-align: right; color: #059669;">P. Detalle</th>
                <th style="width: 7.5%; text-align: right;">P. Mayor</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 15px; color: #64748b;">No hay productos con los filtros seleccionados.</td></tr>'}
            </tbody>
          </table>

          <div style="margin-top: 15px; text-align: center; font-size: 8px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 6px;" class="no-print">
            <button onclick="window.print()" style="background: #0f172a; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-weight: bold; cursor: pointer; font-family: inherit; font-size: 9px;">Imprimir Reporte</button>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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

  // Opción 1: Enviar Reporte General por WhatsApp (Abre PDF + Copia Resumen)
  const handleSendWhatsAppReport = () => {
    if (sortedProducts.length === 0) {
      showAlert('No hay productos en el listado para compartir por WhatsApp.', 'Sin Datos', 'warning');
      return;
    }

    // 1. Trigger dense PDF print window so user can save PDF
    handlePrintReport();

    const companyName = companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.';
    const totalItems = sortedProducts.length;
    const totalValueVenta = sortedProducts.reduce((acc, p) => acc + p.precio_detalle_usd * (parseFloat(p.stock_actual as any) || 0), 0);
    const totalValueCosto = sortedProducts.reduce((acc, p) => acc + p.precio_costo_usd * (parseFloat(p.stock_actual as any) || 0), 0);
    const dateStr = new Date().toLocaleDateString('es-VE');

    let text = `📦 *REPORTE GENERAL DE INVENTARIO (PDF)*\n`;
    text += `🏢 *${companyName}*\n`;
    text += `📅 Fecha: ${dateStr}\n`;
    text += `───────────────\n`;
    text += `📊 *Resumen Ejecutivo:*\n`;
    text += `• Total Artículos: ${totalItems}\n`;
    text += `• Valor Inv. (Detalle): *$${totalValueVenta.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n`;
    text += `• Valor Inv. (Costo): *$${totalValueCosto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n`;
    const categoryLabel = selectedCategories.length === 0 ? 'TODAS' : selectedCategories.join(', ');
    text += `• Filtro Categoría: ${categoryLabel}\n`;
    text += `───────────────\n`;
    text += `📎 *Se adjunta documento PDF con la totalidad de los ${totalItems} productos.*`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    setTimeout(() => {
      showAlert(
        `📄 Se ha generado la vista preliminar del Reporte PDF para guardarlo en tu equipo.\n\nTambién se copió el resumen al portapapeles. Puedes adjuntar el archivo PDF en WhatsApp Web o presionar Ctrl + V para pegar el resumen.`,
        'Reporte PDF Generado',
        'info'
      );
    }, 400);
  };

  // Opción 2: Envío de Lista de Mercancía / Proveedores (soluciona la pantalla blanca de WhatsApp copiando al portapapeles)
  const handleSendWhatsAppSupplierList = (onlyLowStock = false) => {
    let listToExport = sortedProducts;
    if (onlyLowStock) {
      listToExport = sortedProducts.filter(p => p.stock_actual <= p.stock_minimo);
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

    // Group products by category
    const grouped: { [category: string]: typeof listToExport } = {};
    listToExport.forEach(p => {
      const cat = (p.category || 'GENERAL / SIN CATEGORÍA').toUpperCase();
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });

    let text = `📝 *LISTA DE MERCANCÍA / PEDIDO A PROVEEDORES ${onlyLowStock ? '(SOLO FALTANTES)' : ''}*\n`;
    text += `🏢 *${companyName}*\n`;
    text += `📅 Fecha: ${dateStr}\n`;
    text += `───────────────\n`;

    const categoriesList = Object.keys(grouped).sort();

    categoriesList.forEach(cat => {
      text += `\n📌 *CATEGORÍA: ${cat}*\n`;
      grouped[cat].forEach(p => {
        text += `• ${p.description}\n`;
      });
    });

    text += `\n───────────────\n`;
    text += `_Total de productos en lista: ${listToExport.length}_`;

    // Copy to clipboard to handle large data without crashing WhatsApp URL limit
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Lista de mercancía copiada al portapapeles.');
      }).catch(() => {});
    }

    // Protection against URL length limits (> 1500 chars causes WhatsApp Web blank screen)
    if (text.length < 1500) {
      const encodedText = encodeURIComponent(text);
      window.open(`https://web.whatsapp.com/send?text=${encodedText}`, '_blank');
    } else {
      window.open('https://web.whatsapp.com/', '_blank');
      showAlert(
        `La lista contiene ${listToExport.length} productos (${text.length} caracteres).\n\nPara evitar que WhatsApp se quede en pantalla blanca por exceso de datos en la URL, se ha copiado la lista completa automáticamente a tu portapapeles.\n\nEn WhatsApp Web, solo abre el chat de tu proveedor y presiona Ctrl + V para pegar la lista entera.`,
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

      {/* HEADER SECTION */}
      <div>
        <h1 className="text-xl font-extrabold text-winter-inventarioStart tracking-wider flex items-center gap-2">
          <Package className="w-5 h-5 text-winter-inventarioStart" />
          CONTROL DE INVENTARIO Y AUDITORÍA
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-sans">
          Gestión centralizada del stock, mermas de almacén, auditorías de Kardex y registro histórico de precios.
        </p>
      </div>

      {/* TOP TABS NAVIGATION - Aligned Left (Config Module Style) */}
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
          
          {/* INVENTORY METRICS PANEL */}
          <div className="bg-white border border-slate-200 rounded-xl py-3 px-4 shadow-sm text-slate-800 font-mono text-xs space-y-2.5">
            {/* General metrics (All products) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex justify-between items-center border-b md:border-b-0 md:border-r border-slate-100 pb-1.5 md:pb-0 md:pr-4">
                <span className="text-slate-500 font-sans font-bold">Precio 1 del Inventario :</span>
                <span className="font-extrabold text-slate-900 text-sm">
                  ${safeProducts.reduce((acc, p) => acc + (p?.precio_detalle_usd || 0) * (parseFloat(p?.stock_actual as any) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center border-b md:border-b-0 md:border-r border-slate-105 pb-1.5 md:pb-0 md:px-4">
                <span className="text-slate-500 font-sans font-bold">Costo del Inventario :</span>
                <span className="font-extrabold text-slate-900 text-sm">
                  ${safeProducts.reduce((acc, p) => acc + (p?.precio_costo_usd || 0) * (parseFloat(p?.stock_actual as any) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center md:pl-4">
                <span className="text-slate-500 font-sans font-bold">Total Productos :</span>
                <span className="font-extrabold text-slate-900 text-sm">
                  {safeProducts.length} <span className="text-[10px] text-slate-400 font-normal">({safeProducts.reduce((acc, p) => acc + (!p?.a_granel ? (parseFloat(p?.stock_actual as any) || 0) : 0), 0)} uds + {safeProducts.reduce((acc, p) => acc + (p?.a_granel ? (parseFloat(p?.stock_actual as any) || 0) : 0), 0).toFixed(3)} kg)</span>
                </span>
              </div>
            </div>
            
            {/* Filtered metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-dashed border-slate-200">
              <div className="flex justify-between items-center border-b md:border-b-0 md:border-r border-slate-100 pb-1.5 md:pb-0 md:pr-4">
                <span className="text-sky-700 font-sans font-bold">Precio 1 (Filtrado) :</span>
                <span className="font-extrabold text-sky-850 text-sm">
                  ${filteredProducts.reduce((acc, p) => acc + (p?.precio_detalle_usd || 0) * (parseFloat(p?.stock_actual as any) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center border-b md:border-b-0 md:border-r border-slate-105 pb-1.5 md:pb-0 md:px-4">
                <span className="text-sky-700 font-sans font-bold">Costo (Filtrado) :</span>
                <span className="font-extrabold text-sky-850 text-sm">
                  ${filteredProducts.reduce((acc, p) => acc + (p?.precio_costo_usd || 0) * (parseFloat(p?.stock_actual as any) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center md:pl-4">
                <span className="text-sky-700 font-sans font-bold">Total (Filtrado) :</span>
                <span className="font-extrabold text-sky-850 text-sm">
                  {filteredProducts.length} <span className="text-[10px] text-sky-500 font-normal">({filteredProducts.reduce((acc, p) => acc + (!p?.a_granel ? (parseFloat(p?.stock_actual as any) || 0) : 0), 0)} uds + {filteredProducts.reduce((acc, p) => acc + (p?.a_granel ? (parseFloat(p?.stock_actual as any) || 0) : 0), 0).toFixed(3)} kg)</span>
                </span>
              </div>
            </div>
          </div>
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
                    <Printer className="w-4 h-4 text-slate-600" />
                    <div>
                      <div className="font-bold text-slate-800">Imprimir / PDF</div>
                      <div className="text-[10px] text-slate-400">Filas delgadas, diseño ultra-denso</div>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50/50 border border-slate-200/60 rounded-xl py-1.5 px-3 shadow-sm">
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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Catalog Table */}
            <div className="lg:col-span-10 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm h-fit">
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

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs text-left table-fixed min-w-[850px]">
                  <colgroup>
                    <col className="w-[12%]" /> {/* Código */}
                    <col className="w-[30%]" /> {/* Descripción */}
                    <col className="w-[14%]" /> {/* Categoría */}
                    <col className="w-[8%]" />  {/* Stock Mínimo */}
                    <col className="w-[10%]" /> {/* Existencia */}
                    <col className="w-[8%]" />  {/* P. Costo */}
                    <col className="w-[9%]" />  {/* P. Detalle */}
                    <col className="w-[9%]" />  {/* P. Mayor */}
                  </colgroup>
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-slate-550 border-b border-slate-200">
                      <th className="px-2 py-1.5 font-sans uppercase truncate">Código</th>
                      <th className="px-2 py-1.5 font-sans uppercase">
                        {renderSortHeader('Descripción', 'descripcion')}
                      </th>
                      <th className="px-2 py-1.5 font-sans uppercase">
                        {renderSortHeader('Categoría', 'categoria')}
                      </th>
                      <th className="px-2 py-1.5 text-center font-sans uppercase">
                        {renderSortHeader('Stock Mínimo', 'stock_minimo', 'center')}
                      </th>
                      <th className="px-2 py-1.5 text-center text-slate-800 font-sans uppercase">
                        {renderSortHeader('Existencia', 'existencia', 'center')}
                      </th>
                      <th className="px-2 py-1.5 text-center font-sans uppercase">
                        {renderSortHeader('P. Costo', 'precio_costo', 'center')}
                      </th>
                      <th className="px-2 py-1.5 text-center text-emerald-600 font-sans uppercase">
                        {renderSortHeader('P. Detalle', 'precio_detalle', 'center')}
                      </th>
                      <th className="px-2 py-1.5 text-center font-sans uppercase">
                        {renderSortHeader('P. Mayor', 'precio_mayor', 'center')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 text-[11px]">
                    {sortedProducts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-slate-400 font-sans">
                          No se encontraron productos registrados.
                        </td>
                      </tr>
                    ) : (
                      paginatedProducts.map(p => {
                        const isLowStock = p.stock_actual <= p.stock_minimo;
                        return (
                          <tr 
                            key={p.id} 
                            onClick={() => setSelectedProduct(selectedProduct?.id === p.id ? null : p)}
                            className={`hover:bg-slate-50/50 cursor-pointer transition-all border-b border-slate-100 ${
                              selectedProduct?.id === p.id 
                                ? 'bg-sky-50 hover:bg-sky-100/70 border-l-4 border-l-winter-inventarioStart' 
                                : ''
                            }`}
                          >
                            <td className="px-2 py-1 font-mono font-bold text-slate-450 truncate" title={p.barcode}>{p.barcode}</td>
                            <td className="px-2 py-1 font-sans select-text break-words">
                              <div className="font-bold text-slate-850 text-[11px] leading-tight">{p.description}</div>
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
                            <td className="px-2 py-1 font-sans truncate" title={p.category}>{p.category}</td>
                            <td className="px-2 py-1 text-center font-mono text-slate-500">{formatStockVal(p.stock_minimo, p.a_granel)}</td>
                            <td className={`px-2 py-1 text-center font-black font-mono ${isLowStock ? 'text-red-500 animate-pulse font-bold' : 'text-slate-800'}`}>
                              {formatStockVal(p.stock_actual, p.a_granel)}
                            </td>
                            <td className="px-2 py-1 text-center font-mono text-slate-600">${p.precio_costo_usd.toFixed(2)}</td>
                            <td className="px-2 py-1 text-center font-mono text-emerald-600 font-bold">${p.precio_detalle_usd.toFixed(2)}</td>
                            <td className="px-2 py-1 text-center font-mono text-slate-600">
                              ${p.precio_mayor_usd.toFixed(2)}
                              <span className="text-[8px] text-slate-400 block font-sans">x{p.cantidad_mayorista}</span>
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

            {/* Sidebar Operations Column */}
            <div className="lg:col-span-2 space-y-3 font-sans text-slate-800">
              <div className="bg-slate-150 border border-slate-200 rounded-lg p-3 shadow-inner flex flex-col justify-start h-fit">
                <h4 className="text-[10px] font-sans font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5 text-slate-450" />
                  Operaciones
                </h4>

                {/* Selected Product Preview */}
                {selectedProduct && (
                  <div className="bg-sky-50 border border-sky-200 text-sky-900 text-[10px] p-2 rounded mb-3 font-sans shadow-sm leading-tight flex flex-col gap-0.5">
                    <span className="font-extrabold uppercase truncate">{selectedProduct.description}</span>
                    <span className="font-mono text-slate-500 font-bold">{selectedProduct.barcode}</span>
                    <span className={`font-mono font-black mt-1 ${selectedProduct.stock_actual <= selectedProduct.stock_minimo ? 'text-red-700 animate-pulse' : 'text-slate-700'}`}>
                      Stock: {formatStockVal(selectedProduct.stock_actual, selectedProduct.a_granel)} {selectedProduct.a_granel ? 'kg' : 'uds'}
                    </span>
                  </div>
                )}

                {/* Operations buttons */}
                <div className="flex flex-col gap-2.5">
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

                  {/* BUTTON: AUDITORÍA DE CATÁLOGO (SI EXISTEN INCONSISTENCIAS) */}
                  {hasPermission('editar') && catalogAuditIssuesCount > 0 && (
                    <button
                      onClick={() => setShowCatalogAuditModal(true)}
                      className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 border border-amber-600 py-2 px-3 rounded shadow flex items-center justify-between font-sans font-black text-[11px] uppercase tracking-wider text-left transition-all active:scale-95 animate-pulse"
                      title="Existen productos con inconsistencias de datos en el catálogo (categoría, código, descripción o stock mínimo)"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-slate-950 fill-current" />
                        <span>Auditoría Catálogo</span>
                      </div>
                      <span className="bg-slate-950 text-amber-400 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black">
                        {catalogAuditIssuesCount}
                      </span>
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
                          <td className={`px-4 py-2.5 text-right font-black font-mono ${m.qty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatKardexVal(m.qty, true)}
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
                          <td className={`px-4 py-2.5 text-right font-black font-mono ${g.totalQty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {g.totalQty > 0 ? `+${g.totalQty}` : g.totalQty}
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

              {/* Indicador de Tasa BCV (Detecta conexión en línea o usa resguardo offline) */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono text-xs ${
                isBcvRateOnline 
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' 
                  : 'bg-amber-950/50 border-amber-500/40 text-amber-300'
              }`}>
                <span className="text-[10px] font-sans uppercase font-bold text-slate-300">
                  {isBcvRateOnline ? 'Tasa BCV:' : 'Tasa (Offline):'}
                </span>
                <span className="font-extrabold text-sm">Bs {effectiveBcvRate.toFixed(2)} / $</span>
              </div>

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
              <div className="text-[10px] text-slate-500 font-mono mt-1 font-bold">
                Bs {(statisticsData.totalValueDetailUsd * effectiveBcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              <div className="text-[10px] text-slate-500 font-mono mt-1 font-bold">
                Bs {(statisticsData.totalValueCostUsd * effectiveBcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <span className="font-mono text-emerald-900 font-extrabold">Bs {(statisticsData.totalEstimatedProfitUsd * effectiveBcvRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}</span>
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
                        <span className="font-extrabold font-mono text-emerald-600 text-xs">${c.detailUsd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 font-sans">
                        <span>Valor Costo:</span>
                        <span className="font-extrabold font-mono text-purple-600 text-xs">${c.costUsd.toFixed(2)}</span>
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

      {/* MODAL: CREATE PRODUCT - Light theme translucent, draggable & minimizable */}
      {showNewProdModal && isMinimized && (
        <div 
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-4 right-4 bg-winter-inventarioStart hover:bg-winter-inventarioEnd text-white px-4 py-3 rounded-lg shadow-2xl z-[70] flex items-center gap-3 cursor-pointer animate-bounce font-mono text-xs border border-white/20 select-none"
        >
          <Plus className="w-4 h-4" />
          <span>[+] RESTAURAR REGISTRO: {newClave.toUpperCase() || 'NUEVO PRODUCTO'}</span>
        </div>
      )}

      {showNewProdModal && !isMinimized && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[70] animate-fade-in font-mono text-slate-800">
          <div 
            style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)` }}
            className={`bg-white border border-slate-200 rounded-xl overflow-hidden w-full ${isAuxExpandedNew ? 'max-w-2xl sm:max-w-3xl' : 'max-w-xl'} shadow-2xl p-6 space-y-4 pointer-events-auto select-none transition-all duration-300 max-h-[92vh] overflow-y-auto`}
          >
            <div 
              onMouseDown={handleMouseDown}
              className="flex justify-between items-center border-b border-slate-200 pb-3 cursor-grab active:cursor-grabbing select-none"
            >
              <h3 className="text-sm font-extrabold text-slate-850 flex items-center gap-2 pointer-events-none">
                <Plus className="w-4 h-4 text-winter-inventarioStart" />
                REGISTRAR PRODUCTO EN EL MAESTRO
              </h3>
              <div className="flex items-center gap-1">
                <button 
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="text-slate-405 hover:text-slate-700 p-1 hover:bg-slate-100/50 rounded transition-all"
                  title="Minimizar ventana"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button 
                  type="button"
                  onClick={() => setShowNewProdModal(false)} 
                  className="text-slate-405 hover:text-slate-700 p-1 hover:bg-slate-100/50 rounded transition-all"
                  title="Cerrar ventana"
                >
                  ✕
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Clave del Producto <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. HARINA-PAN-1K"
                    value={newClave.toUpperCase()}
                    onChange={(e) => setNewClave(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-850 focus:bg-white focus:border-winter-inventarioStart focus:outline-none uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Código de Barras</label>
                  <input
                    type="text"
                    placeholder="Vacío = usar Clave"
                    value={newBarcode}
                    onChange={(e) => setNewBarcode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Categoría</label>
                  <div className="flex gap-2">
                    <select
                      value={newCat}
                      onChange={(e) => setNewCat(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none"
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
                      className="bg-winter-inventarioStart hover:bg-winter-inventarioEnd text-white px-3 py-2.5 rounded text-xs font-bold font-mono transition-all flex items-center justify-center shadow-sm"
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
                        checked={newTaxActive}
                        onChange={(e) => setNewTaxActive(e.target.checked)}
                        className="rounded border-slate-300 text-winter-inventarioStart focus:ring-winter-inventarioStart w-4 h-4"
                      />
                      <span>Si</span>
                    </label>
                    <input
                      type="text"
                      placeholder="IVA"
                      disabled={!newTaxActive}
                      value={newTaxName}
                      onChange={(e) => setNewTaxName(e.target.value.toUpperCase())}
                      className="w-full bg-white border border-slate-300 rounded p-1 text-[11px] font-sans font-bold text-slate-800 uppercase disabled:opacity-40 disabled:bg-slate-100"
                    />
                    <span className="font-bold text-slate-500 font-sans">%</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      disabled={!newTaxActive}
                      value={newTaxPct}
                      onChange={(e) => setNewTaxPct(e.target.value)}
                      className="w-12 text-center bg-white border border-slate-300 rounded p-1 font-bold font-mono text-[11px] text-slate-850 disabled:opacity-40 disabled:bg-slate-100"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-450" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">DESCRIPCIÓN DEL ARTÍCULO <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Descripción del artículo..."
                  value={newDesc.toUpperCase()}
                  onChange={(e) => setNewDesc(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-850 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-sans font-bold uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Forma de Venta</label>
                  <select
                    value={newAGranel ? 'granel' : 'unidad'}
                    onChange={(e) => setNewAGranel(e.target.value === 'granel')}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-sans font-semibold"
                  >
                    <option value="unidad">Venta por Unidad / Entero</option>
                    <option value="granel">Venta a Granel (Peso / Kg / Fraccional)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Fecha de Vencimiento (Opcional)</label>
                  <input
                    type="date"
                    value={newVencimiento}
                    onChange={(e) => setNewVencimiento(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* AUXILIAR DE CÁLCULO DE PRECIOS */}
              <AuxiliarCalculoPrecios
                initialCost={newCost}
                initialDetail={newDetail}
                initialMayor={newMayor}
                tasaBCV={bcvRateUSD || parseFloat(localStorage.getItem('pos_bcv_usd') || '0') || 0}
                tasaFallback={tasaDia || parseFloat(localStorage.getItem('pos_tasa_activa') || '0') || 0}
                taxActive={newTaxActive}
                taxPct={parseFloat(newTaxPct) || 16}
                onToggleExpand={(expanded) => setIsAuxExpandedNew(expanded)}
                onApplyPrices={({ cost, detail, mayor }) => {
                  setNewCost(cost);
                  setNewDetail(detail);
                  setNewMayor(mayor);
                }}
              />

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Precio Costo ($)</label>
                  <input
                     type="number"
                     step="0.01"
                     min="0"
                     placeholder="0.00"
                     value={newCost}
                     onChange={(e) => setNewCost(e.target.value)}
                     className="w-full bg-slate-50 border border-slate-350 rounded p-2 text-xs text-yellow-600 font-mono focus:bg-white focus:border-winter-inventarioStart focus:outline-none"
                   />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Precio Venta ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newDetail}
                    onChange={(e) => setNewDetail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2 text-xs text-emerald-700 font-mono focus:bg-white focus:border-winter-inventarioStart focus:outline-none"
                  />
                  <span className="text-[9px] text-slate-400 block font-sans mt-0.5">
                    {newTaxActive 
                      ? `+${newTaxPct}% ${newTaxName || 'IVA'}: $${((parseFloat(newDetail) || 0) * (1 + (parseFloat(newTaxPct) || 0) / 100)).toFixed(2)}` 
                      : 'Exento (0% IVA)'}
                  </span>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Precio Mayor ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newMayor}
                    onChange={(e) => setNewMayor(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2 text-xs text-purple-750 font-mono focus:bg-white focus:border-winter-inventarioStart focus:outline-none"
                  />
                  <span className="text-[9px] text-slate-400 block font-sans mt-0.5">
                    {newTaxActive 
                      ? `+${newTaxPct}% ${newTaxName || 'IVA'}: $${((parseFloat(newMayor) || 0) * (1 + (parseFloat(newTaxPct) || 0) / 100)).toFixed(2)}` 
                      : 'Exento (0% IVA)'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Stock Mínimo (Alerta)</label>
                  <input
                    type="number"
                    min="0"
                    value={newMinStock}
                    onChange={(e) => setNewMinStock(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-mono text-center"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Cant. Mayorista</label>
                  <input
                    type="number"
                    min="1"
                    value={newWholesaleQty}
                    onChange={(e) => setNewWholesaleQty(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-mono text-center"
                  />
                </div>
              </div>

              <div className="text-[10px] text-slate-500 font-sans border-t border-slate-200 pt-2">
                * Nota: El producto recién creado iniciará con stock actual de 0. Para agregar stock físico inicial, use el botón "Stock" del catálogo y justifíquelo en auditoría.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewProdModal(false)}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-600 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-winter-inventarioStart hover:bg-winter-inventarioEnd text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
                >
                  CREAR PRODUCTO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MODIFICAR FICHA DE PRODUCTO */}
      {showEditProdModal && (
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-sans text-slate-800">
          <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden w-full ${isAuxExpandedEdit ? 'max-w-2xl sm:max-w-3xl' : 'max-w-xl'} shadow-2xl p-6 space-y-4 transition-all duration-300 max-h-[92vh] overflow-y-auto`}>
            
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Edit className="w-4 h-4 text-slate-600 bg-slate-100 rounded-full p-0.5" />
                MODIFICAR FICHA DE PRODUCTO
              </h3>
              <button type="button" onClick={() => setShowEditProdModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
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
                    onChange={(e) => setEditClave(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-855 focus:bg-white focus:border-winter-inventarioStart focus:outline-none uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Código de Barras</label>
                  <input
                    type="text"
                    placeholder="Vacío = usar Clave"
                    value={editBarcode}
                    onChange={(e) => setEditBarcode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-mono"
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
                      className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none"
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
                      className="bg-winter-inventarioStart hover:bg-winter-inventarioEnd text-white px-3 py-2.5 rounded text-xs font-bold font-mono transition-all flex items-center justify-center shadow-sm"
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
                        className="rounded border-slate-300 text-winter-inventarioStart focus:ring-winter-inventarioStart w-4 h-4"
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
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-855 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-sans font-bold uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Forma de Venta</label>
                  <select
                    value={editAGranel ? 'granel' : 'unidad'}
                    onChange={(e) => setEditAGranel(e.target.value === 'granel')}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-sans font-semibold"
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
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-sans font-medium"
                  />
                </div>
              </div>

              {/* AUXILIAR DE CÁLCULO DE PRECIOS */}
              <AuxiliarCalculoPrecios
                initialCost={editCost}
                initialDetail={editDetail}
                initialMayor={editMayor}
                tasaBCV={bcvRateUSD || parseFloat(localStorage.getItem('pos_bcv_usd') || '0') || 0}
                tasaFallback={tasaDia || parseFloat(localStorage.getItem('pos_tasa_activa') || '0') || 0}
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
                    className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs font-mono font-bold focus:ring-1 focus:ring-winter-inventarioStart focus:outline-none"
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
                    className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs font-mono font-bold focus:ring-1 focus:ring-winter-inventarioStart focus:outline-none"
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
                    className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs font-mono font-bold focus:ring-1 focus:ring-winter-inventarioStart focus:outline-none"
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
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-mono text-center"
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
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-mono text-center"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditProdModal(false)}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-600 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-slate-700 hover:bg-slate-800 text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
                >
                  GUARDAR CAMBIOS
                </button>
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
          if (auditFilterTab === 'sin_categoria') return item.missingCategory;
          if (auditFilterTab === 'sin_codigo') return item.missingBarcode;
          if (auditFilterTab === 'sin_descripcion') return item.missingDescription;
          if (auditFilterTab === 'sin_stock_min') return item.missingStockMin;
          return true;
        });

        const countSinCat = catalogAuditIssues.filter(i => i.missingCategory).length;
        const countSinCod = catalogAuditIssues.filter(i => i.missingBarcode).length;
        const countSinDesc = catalogAuditIssues.filter(i => i.missingDescription).length;
        const countSinMin = catalogAuditIssues.filter(i => i.missingStockMin).length;

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
                  description: edit.description !== undefined ? edit.description.trim() : product.description,
                  category: edit.category !== undefined ? edit.category.trim().toUpperCase() : product.category,
                  stock_minimo: edit.stock_minimo !== undefined ? edit.stock_minimo : product.stock_minimo
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
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full h-[88vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200 font-sans relative">
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
                    <h3 className="text-sm font-black uppercase tracking-wider font-mono text-slate-950">
                      Asistente de Auditoría e Integridad de Catálogo
                    </h3>
                    <p className="text-[11px] text-slate-900 font-medium">
                      Ayudante interactivo para corregir productos sin categoría, sin código, sin descripción o sin stock mínimo.
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
                        className="flex-1 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none"
                      >
                        {allCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={countSinCat === 0}
                      onClick={handleApplyBulkDefaultCategory}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2 rounded-lg text-xs font-sans transition-all shadow-xs"
                    >
                      ⚡ Asignar a Sin Categoría ({countSinCat})
                    </button>
                  </div>

                  {/* Bulk 2: Asignar Stock Mínimo */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs hover:border-amber-400 transition-all">
                    <span className="font-extrabold text-xs text-slate-800 block flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-amber-600" />
                      Asignar Stock Mínimo Estándar
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Establece una cantidad mínima de inventario para alertas a los productos con stock mínimo en 0 ({countSinMin}).
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-600 font-bold whitespace-nowrap">Mínimo Uds:</label>
                      <input
                        type="number"
                        min="1"
                        value={auditDefaultStockMin}
                        onChange={(e) => setAuditDefaultStockMin(e.target.value)}
                        className="w-20 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={countSinMin === 0}
                      onClick={handleApplyBulkDefaultStockMin}
                      className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-extrabold py-2 rounded-lg text-xs font-sans transition-all shadow-xs"
                    >
                      ⚡ Establecer Mínimo ({countSinMin})
                    </button>
                  </div>

                  {/* Bulk 3: Auto-Generar Códigos */}
                  {countSinCod > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs hover:border-amber-400 transition-all">
                      <span className="font-extrabold text-xs text-slate-800 block flex items-center gap-1.5">
                        <Tag className="w-4 h-4 text-amber-600" />
                        Auto-Generar Códigos
                      </span>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Crea un código de barras único para los productos sin código ({countSinCod}).
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
                            <th className="px-3 py-2 w-[22%]">Código</th>
                            <th className="px-3 py-2 w-[32%]">Descripción</th>
                            <th className="px-2 py-2 w-[26%]">Categoría</th>
                            <th className="px-2 py-2 w-[20%] text-center">Stk Mínimo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {filteredIssues.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-12 text-center text-slate-400 italic">
                                🎉 No se encontraron inconsistencias en este filtro.
                              </td>
                            </tr>
                          ) : (
                            filteredIssues.map(({ product: p, currentBarcode, currentDescription, currentCategory, currentStockMin, missingCategory, missingBarcode, missingDescription, missingStockMin }) => {
                              const edit = editedAuditProducts[p.id];
                              const isEdited = edit !== undefined;

                              return (
                                <tr key={p.id} className={`hover:bg-slate-50 ${isEdited ? 'bg-emerald-50/40' : 'bg-white'}`}>
                                  {/* Code */}
                                  <td className="px-2 py-2">
                                    <div className="space-y-1">
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
                                        placeholder="Ingrese código..."
                                        className={`w-full text-xs font-mono font-bold border rounded px-1.5 py-1 focus:bg-white focus:outline-none ${
                                          missingBarcode ? 'border-red-400 bg-red-50 text-red-800' : 'border-slate-300 text-slate-800'
                                        }`}
                                      />
                                      {missingBarcode && (
                                        <span className="text-[9px] text-red-600 font-extrabold block">⚠️ Sin Código</span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Description */}
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
                                        placeholder="Descripción del producto..."
                                        className={`w-full text-xs font-bold border rounded px-1.5 py-1 focus:bg-white focus:outline-none ${
                                          missingDescription ? 'border-red-400 bg-red-50 text-red-800' : 'border-slate-300 text-slate-800'
                                        }`}
                                      />
                                      {missingDescription && (
                                        <span className="text-[9px] text-red-600 font-extrabold block">⚠️ Sin Descripción</span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Category */}
                                  <td className="px-2 py-2">
                                    <div className="space-y-1">
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
                                        className={`w-full text-xs font-bold border rounded px-1.5 py-1 focus:bg-white focus:outline-none ${
                                          missingCategory ? 'border-red-400 bg-red-50 text-red-800' : 'border-slate-300 text-slate-800'
                                        }`}
                                      >
                                        <option value="">-- Sin Categoría --</option>
                                        {allCategories.map(cat => (
                                          <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                      </select>
                                      {missingCategory && (
                                        <span className="text-[9px] text-red-600 font-extrabold block">⚠️ Sin Categoría</span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Stock Minimum */}
                                  <td className="px-2 py-2 text-center">
                                    <div className="space-y-1 flex flex-col items-center">
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
                                        className={`w-16 text-center text-xs font-mono font-bold border rounded px-1.5 py-1 focus:bg-white focus:outline-none ${
                                          missingStockMin ? 'border-red-400 bg-red-50 text-red-800' : 'border-slate-300 text-slate-800'
                                        }`}
                                      />
                                      {missingStockMin && (
                                        <span className="text-[9px] text-red-600 font-extrabold block">⚠️ Stk Mín = 0</span>
                                      )}
                                    </div>
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

      {/* CARGA POR FACTURA MODAL */}
      {showInvoiceLoadModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[50] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-5xl w-full h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-extrabold uppercase tracking-wider font-mono flex items-center gap-2">
                  <Layers className="w-4 h-4 bg-emerald-700/50 rounded-full p-0.5" />
                  Carga de Mercancía por Factura
                </h3>
                {pausedInvoices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPausedInvoicesModal(true)}
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-extrabold px-2.5 py-1 rounded-full font-mono flex items-center gap-1 shadow transition-all active:scale-95"
                    title="Ver otras cargas en espera"
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>Cargas en Espera: {pausedInvoices.length}</span>
                  </button>
                )}
              </div>
              <button 
                onClick={() => setShowInvoiceLoadModal(false)}
                className="text-white/80 hover:text-white text-base focus:outline-none"
              >
                ✕
              </button>
            </div>

            {/* Factura Input Row */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wider text-slate-550 font-extrabold font-mono whitespace-nowrap">Número de Factura:</label>
                <input
                  type="text"
                  placeholder="Ej: FAC-12345..."
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-sans font-bold w-64 shadow-sm"
                />
              </div>
            </div>

            {/* Content columns */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Left Column: Product Search */}
              <div className="w-2/5 p-4 border-r border-slate-200 flex flex-col overflow-hidden min-h-0">
                <label className="text-[10px] uppercase tracking-wider text-slate-450 font-extrabold font-mono block mb-2">Buscador de Productos</label>
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-grow">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-455">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar por código o descripción..."
                      value={invoiceSearchTerm}
                      onChange={(e) => setInvoiceSearchTerm(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 pl-8 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white font-sans"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewProdModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded text-[10px] font-sans uppercase flex items-center gap-1 shadow flex-shrink-0 active:scale-95 transition-all"
                    title="Registrar un nuevo producto en la base de datos"
                  >
                    <Plus className="w-3.5 h-3.5 bg-emerald-750/50 rounded-full p-0.5" />
                    <span>Nuevo</span>
                  </button>
                </div>

                {/* Filter products */}
                <div className="flex-grow overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white min-h-0">
                  {(() => {
                    const filtered = products.filter(p =>
                      p.description.toLowerCase().includes(invoiceSearchTerm.toLowerCase()) ||
                      p.barcode.toLowerCase().includes(invoiceSearchTerm.toLowerCase())
                    );

                    if (filtered.length === 0) {
                      return (
                        <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
                          <p className="text-xs text-slate-450 italic font-sans">No se encontró ningún producto.</p>
                          <button
                            type="button"
                            onClick={() => setShowNewProdModal(true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded text-[10px] font-sans uppercase flex items-center gap-1.5 shadow"
                          >
                            <Plus className="w-3 h-3 bg-emerald-700/50 rounded-full p-0.5" />
                            Registrar Producto
                          </button>
                        </div>
                      );
                    }

                    return filtered.map(p => {
                      const isAdded = invoiceProducts.some(item => item.product.id === p.id);
                      return (
                        <div key={p.id} className="flex justify-between items-center p-2.5 hover:bg-slate-50/50">
                          <div className="min-w-0 pr-2">
                            <p className="font-bold text-slate-700 text-xs truncate max-w-[200px]" title={p.description}>{p.description}</p>
                            <p className="text-[10px] text-slate-400 font-mono truncate">{p.barcode}</p>
                          </div>
                          <button
                            type="button"
                            disabled={isAdded}
                            onClick={() => {
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
                            className={`font-sans font-bold text-[10px] px-2.5 py-1 rounded transition-all flex-shrink-0 ${
                              isAdded
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {isAdded ? 'Cargado ✓' : 'Añadir'}
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Right Column: Invoice Load List */}
              <div className="w-3/5 p-4 flex flex-col overflow-hidden min-h-0 bg-slate-50">
                <label className="text-[10px] uppercase tracking-wider text-slate-455 font-extrabold font-mono block mb-2">Lista de Carga de Factura ({invoiceProducts.length} ítems)</label>
                
                <div className="flex-grow overflow-auto border border-slate-200 rounded-lg bg-white min-h-0 shadow-inner">
                  {invoiceProducts.length === 0 ? (
                    <div className="h-full flex flex-col justify-center items-center p-8 text-center text-slate-400">
                      <Layers className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-xs font-sans">Añada productos desde el buscador izquierdo para comenzar la carga.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-[10px] uppercase text-slate-500 font-mono sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 w-[34%]">Producto</th>
                          <th className="px-2 py-2 text-center w-[12%]">Exist.</th>
                          <th className="px-2 py-2 text-center w-[14%] bg-emerald-100/90 text-emerald-900 font-black border-b-2 border-emerald-500 tracking-wider">A AGREGAR 📦</th>
                          <th className="px-2 py-2 text-right w-[13%]">Costo $</th>
                          <th className="px-2 py-2 text-right w-[13%]">Detalle $</th>
                          <th className="px-2 py-2 text-right w-[12%]">Mayor $</th>
                          <th className="px-2 py-2 text-center w-[4%]"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoiceProducts.map((item, index) => (
                          <tr key={item.product.id} className="hover:bg-slate-55/40">
                            <td className="px-3 py-2 font-sans">
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="min-w-0 pr-1">
                                  <p className="font-bold text-slate-800 text-xs truncate max-w-[130px]" title={item.product.description}>
                                    {item.product.description}
                                  </p>
                                  <span className="text-[9px] text-slate-400 font-mono block">{item.product.barcode}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setInvoiceAuxItemIndex(index)}
                                  className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 p-1.5 rounded transition-all shadow-xs flex-shrink-0 active:scale-95"
                                  title="Abrir Auxiliar de Cálculo de Precios para este producto"
                                >
                                  <Calculator className="w-3.5 h-3.5 text-amber-700" />
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center font-mono text-slate-700 font-bold select-none">
                              {formatStockVal(item.product.stock_actual, item.product.a_granel)}
                            </td>
                            <td className="px-2 py-2 text-center bg-emerald-50/50">
                              <input
                                type="number"
                                min="0.001"
                                step="any"
                                value={item.qty}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setInvoiceProducts(prev => prev.map((it, idx) => idx === index ? { ...it, qty: val } : it));
                                }}
                                className="w-16 bg-emerald-100/70 border-2 border-emerald-500 rounded px-1.5 py-1 text-center text-xs font-mono font-black text-emerald-950 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-400 shadow-sm"
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.precio_costo_usd}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setInvoiceProducts(prev => prev.map((it, idx) => idx === index ? { ...it, precio_costo_usd: val } : it));
                                }}
                                className="w-16 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-right text-xs font-mono font-bold focus:bg-white focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.precio_detalle_usd}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setInvoiceProducts(prev => prev.map((it, idx) => idx === index ? { ...it, precio_detalle_usd: val } : it));
                                }}
                                className="w-16 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-right text-xs font-mono font-bold focus:bg-white focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.precio_mayor_usd}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setInvoiceProducts(prev => prev.map((it, idx) => idx === index ? { ...it, precio_mayor_usd: val } : it));
                                }}
                                className="w-16 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-right text-xs font-mono font-bold focus:bg-white focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setInvoiceProducts(prev => prev.filter((_, idx) => idx !== index));
                                }}
                                className="text-red-500 hover:text-red-750 text-sm font-bold focus:outline-none"
                                title="Eliminar ítem"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-450 font-extrabold font-mono">Total Costo de Factura</span>
                <span className="text-slate-800 font-mono font-black text-sm">
                  ${invoiceProducts.reduce((acc, it) => acc + (it.qty * it.precio_costo_usd), 0).toFixed(2)}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowInvoiceLoadModal(false)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-lg text-xs font-sans font-bold transition-all"
                >
                  Cancelar
                </button>

                {/* BOTÓN PAUSAR CARGA */}
                <button
                  type="button"
                  disabled={invoiceProducts.length === 0}
                  onClick={handlePauseInvoiceLoad}
                  className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-transparent text-slate-950 font-extrabold border border-amber-600 px-4 py-2.5 rounded-lg text-xs font-sans flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
                  title="Poner esta carga en espera para reanudarla más tarde"
                >
                  <PauseCircle className="w-4 h-4 text-slate-950" />
                  <span>Pausar Carga</span>
                </button>
                <button
                  type="button"
                  disabled={invoiceProducts.length === 0 || !invoiceNumber.trim()}
                  onClick={async () => {
                    const invalidIndex = invoiceProducts.findIndex(
                      it => it.precio_detalle_usd <= it.precio_costo_usd || it.precio_mayor_usd <= it.precio_costo_usd
                    );

                    if (invalidIndex !== -1) {
                      showAlert(`El producto "${invoiceProducts[invalidIndex].product.description}" tiene precios de venta menores o iguales a su precio de costo.`);
                      return;
                    }

                    const updates = invoiceProducts.map(it => ({
                      prodId: it.product.id,
                      qty: it.qty,
                      precio_costo_usd: it.precio_costo_usd,
                      precio_detalle_usd: it.precio_detalle_usd,
                      precio_mayor_usd: it.precio_mayor_usd
                    }));

                    const reason = `Carga por Factura: ${invoiceNumber.trim()}`;
                    const success = await onUpdateProductStockBulk(updates, reason);
                    if (success) {
                      showToast(`Se han cargado con éxito ${invoiceProducts.length} productos bajo la Factura: ${invoiceNumber}`);
                      setShowInvoiceLoadModal(false);
                      setInvoiceProducts([]);
                      setInvoiceNumber('');
                    } else {
                      showAlert('Ocurrió un error al intentar procesar la carga de la factura.');
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-400 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-xs font-sans font-bold transition-all"
                >
                  Procesar Carga ({invoiceProducts.length})
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

    </div>
  );
}
