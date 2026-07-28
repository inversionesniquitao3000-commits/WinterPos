import { useState, useEffect, useRef, useMemo } from 'react';
import { Product, InventoryMovement, PriceAdjustmentHistory, User, CompanyConfig } from '../types';
import { Package, History, PenTool, Plus, Search, Layers, RefreshCw, Minus, Printer, ArrowUpDown, ArrowUp, ArrowDown, Edit, CheckCircle2, Upload, Download, Tag, FileSpreadsheet, MessageCircle, ChevronDown } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import AuxiliarCalculoPrecios from './AuxiliarCalculoPrecios';

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
  onUpdateProduct
}: InventarioProps) {
  const { showAlert, showConfirm } = useDialog();
  const hasPermission = (action: 'ver' | 'crear' | 'editar' | 'eliminar') => {
    if (_currentUser.rol.toLowerCase() === 'administrador') return true;
    if (!_currentUser.permisos) return true; // default fallback if none specified
    return !!_currentUser.permisos.inventario?.[action];
  };

  const [activeSubTab, setActiveSubTab] = useState<'catalogo' | 'movimientos' | 'precios'>('catalogo');
  const [selectedMovementDetail, setSelectedMovementDetail] = useState<any>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  const [filterStock, setFilterStock] = useState<'todos' | 'con_existencia' | 'sin_existencia' | 'menor_5' | 'menor_10' | 'menor_15'>('todos');
  const [filterMinStock, setFilterMinStock] = useState<'todos' | 'bajo_minimo'>('todos');

  // Sorting states
  const [sortField, setSortField] = useState<'existencia' | 'categoria' | 'descripcion' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: 'existencia' | 'categoria' | 'descripcion') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortHeader = (label: string, field: 'existencia' | 'categoria' | 'descripcion', align: 'left' | 'right' = 'left') => {
    const isSorted = sortField === field;
    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className={`flex items-center gap-1 hover:text-winter-inventarioStart transition-colors font-sans uppercase font-bold focus:outline-none whitespace-nowrap ${align === 'right' ? 'justify-end ml-auto' : ''}`}
      >
        <span>{label}</span>
        {isSorted ? (
          sortDirection === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5 text-winter-inventarioStart" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-winter-inventarioStart" />
          )
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
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddTarget, setQuickAddTarget] = useState<'new' | 'edit'>('new');

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

  // Escape key listener to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAdjustModal(false);
        setShowPriceModal(false);
        setShowNewProdModal(false);
        setShowEditProdModal(false);
        setShowBulkModal(false);
        setShowCategoriesModal(false);
        setShowQuickAddModal(false);
        setShowGeneralAdjustModal(false);
        setGeneralAdjustSearch('');
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Bulk Upload state
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsing' | 'validating' | 'importing' | 'success'>('idle');

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
    link.setAttribute("download", `respaldo_inventario_${new Date().toISOString().split('T')[0]}.csv`);
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

  // Categories management modal states
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) return;
    const cleanName = newCategoryName.trim().toUpperCase();
    if (categories.includes(cleanName)) {
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
    if (categories.includes(cleanName)) {
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
    if (categories.includes(cleanName)) {
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
    let list = [...priceHistory];

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
      const nextCost = generalAdjustCost ? computePriceChange(p.precio_costo_usd) : p.precio_costo_usd;
      const nextDetail = generalAdjustDetail ? computePriceChange(p.precio_detalle_usd) : p.precio_detalle_usd;
      const nextMayor = generalAdjustMayor ? computePriceChange(p.precio_mayor_usd) : p.precio_mayor_usd;

      if (nextDetail <= nextCost || nextMayor <= nextCost) {
        violationsCount++;
      }

      updates.push({
        id: p.id,
        cost: nextCost,
        detail: nextDetail,
        mayor: nextMayor
      });

      if (generalAdjustCost && p.precio_costo_usd !== nextCost) {
        historyLogs.push({
          productCode: p.barcode,
          priceType: 'Costo',
          oldPrice: p.precio_costo_usd,
          newPrice: nextCost,
          motivo: generalAdjustReason.trim()
        });
      }
      if (generalAdjustDetail && p.precio_detalle_usd !== nextDetail) {
        historyLogs.push({
          productCode: p.barcode,
          priceType: 'Detalle',
          oldPrice: p.precio_detalle_usd,
          newPrice: nextDetail,
          motivo: generalAdjustReason.trim()
        });
      }
      if (generalAdjustMayor && p.precio_mayor_usd !== nextMayor) {
        historyLogs.push({
          productCode: p.barcode,
          priceType: 'Mayor',
          oldPrice: p.precio_mayor_usd,
          newPrice: nextMayor,
          motivo: generalAdjustReason.trim()
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
  const [showEditProdModal, setShowEditProdModal] = useState(false);
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
    setEditTaxPct('16');
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
  const [pageSize, setPageSize] = useState(50);

  // Reset page when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategories, filterStock, filterMinStock]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return products.filter(p => {
      const matchesSearch = !term || 
        p.description.toLowerCase().includes(term) ||
        p.barcode.toLowerCase().includes(term);
        
      const matchesCategory = selectedCategories.length === 0 ||
        selectedCategories.includes(p.category.toUpperCase());
      
      const matchesStock = 
        filterStock === 'todos' ? true :
        filterStock === 'con_existencia' ? p.stock_actual > 0 :
        filterStock === 'sin_existencia' ? p.stock_actual === 0 :
        filterStock === 'menor_5' ? p.stock_actual <= 5 :
        filterStock === 'menor_10' ? p.stock_actual <= 10 :
        filterStock === 'menor_15' ? p.stock_actual <= 15 : true;
        
      const matchesMinStock = 
        filterMinStock === 'todos' ? true :
        filterMinStock === 'bajo_minimo' ? p.stock_actual <= p.stock_minimo : true;
        
      return matchesSearch && matchesCategory && matchesStock && matchesMinStock;
    });
  }, [products, searchTerm, selectedCategories, filterStock, filterMinStock]);

  const sortedProducts = useMemo(() => {
    if (!sortField) return filteredProducts;
    
    return [...filteredProducts].sort((a, b) => {
      let aVal: any = '';
      let bVal: any = '';
      
      if (sortField === 'existencia') {
        aVal = a.stock_actual;
        bVal = b.stock_actual;
      } else if (sortField === 'categoria') {
        aVal = a.category.toLowerCase();
        bVal = b.category.toLowerCase();
      } else if (sortField === 'descripcion') {
        aVal = a.description.toLowerCase();
        bVal = b.description.toLowerCase();
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredProducts, sortField, sortDirection]);

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

  // Report menu states
  const [showReportMenu, setShowReportMenu] = useState(false);
  const reportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
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

    const sortInfo = sortField ? ` (Ordenado por ${sortField} ${sortDirection.toUpperCase()})` : '';

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
    const dateStr = new Date().toISOString().split('T')[0];
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
      <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-winter-inventarioStart tracking-wider flex items-center gap-2">
            <Package className="w-5 h-5 text-winter-inventarioStart" />
            CONTROL DE INVENTARIO Y AUDITORÍA
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Gestión centralizada del stock, mermas de almacén, auditorías de Kardex y registro histórico de precios.
          </p>
        </div>

        {/* SUB-TABS NAVIGATION - Light styled */}
        <div className="flex bg-slate-200 border border-slate-350 rounded-lg p-0.5 self-start">
          <button
            onClick={() => setActiveSubTab('catalogo')}
            className={`px-4 py-2 text-xs font-bold rounded-md font-sans transition-all ${
              activeSubTab === 'catalogo'
                ? 'bg-white text-winter-inventarioStart shadow-sm border border-slate-300/40'
                : 'text-slate-550 hover:text-slate-800'
            }`}
          >
            Catálogo
          </button>
          <button
            onClick={() => setActiveSubTab('movimientos')}
            className={`px-4 py-2 text-xs font-bold rounded-md font-sans transition-all ${
              activeSubTab === 'movimientos'
                ? 'bg-white text-winter-inventarioStart shadow-sm border border-slate-300/40'
                : 'text-slate-550 hover:text-slate-800'
            }`}
          >
            Kardex
          </button>
          <button
            onClick={() => setActiveSubTab('precios')}
            className={`px-4 py-2 text-xs font-bold rounded-md font-sans transition-all ${
              activeSubTab === 'precios'
                ? 'bg-white text-winter-inventarioStart shadow-sm border border-slate-300/40'
                : 'text-slate-550 hover:text-slate-800'
            }`}
          >
            Historial Precios
          </button>
        </div>
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
                  ${products.reduce((acc, p) => acc + p.precio_detalle_usd * (parseFloat(p.stock_actual as any) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center border-b md:border-b-0 md:border-r border-slate-105 pb-1.5 md:pb-0 md:px-4">
                <span className="text-slate-500 font-sans font-bold">Costo del Inventario :</span>
                <span className="font-extrabold text-slate-900 text-sm">
                  ${products.reduce((acc, p) => acc + p.precio_costo_usd * (parseFloat(p.stock_actual as any) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center md:pl-4">
                <span className="text-slate-500 font-sans font-bold">Total Productos :</span>
                <span className="font-extrabold text-slate-900 text-sm">
                  {products.length} <span className="text-[10px] text-slate-400 font-normal">({products.reduce((acc, p) => acc + (!p.a_granel ? (parseFloat(p.stock_actual as any) || 0) : 0), 0)} uds + {products.reduce((acc, p) => acc + (p.a_granel ? (parseFloat(p.stock_actual as any) || 0) : 0), 0).toFixed(3)} kg)</span>
                </span>
              </div>
            </div>
            
            {/* Filtered metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-dashed border-slate-200">
              <div className="flex justify-between items-center border-b md:border-b-0 md:border-r border-slate-100 pb-1.5 md:pb-0 md:pr-4">
                <span className="text-sky-700 font-sans font-bold">Precio 1 (Filtrado) :</span>
                <span className="font-extrabold text-sky-850 text-sm">
                  ${filteredProducts.reduce((acc, p) => acc + p.precio_detalle_usd * (parseFloat(p.stock_actual as any) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center border-b md:border-b-0 md:border-r border-slate-105 pb-1.5 md:pb-0 md:px-4">
                <span className="text-sky-700 font-sans font-bold">Costo (Filtrado) :</span>
                <span className="font-extrabold text-sky-850 text-sm">
                  ${filteredProducts.reduce((acc, p) => acc + p.precio_costo_usd * (parseFloat(p.stock_actual as any) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center md:pl-4">
                <span className="text-sky-700 font-sans font-bold">Total (Filtrado) :</span>
                <span className="font-extrabold text-sky-850 text-sm">
                  {filteredProducts.length} <span className="text-[10px] text-sky-500 font-normal">({filteredProducts.reduce((acc, p) => acc + (!p.a_granel ? (parseFloat(p.stock_actual as any) || 0) : 0), 0)} uds + {filteredProducts.reduce((acc, p) => acc + (p.a_granel ? (parseFloat(p.stock_actual as any) || 0) : 0), 0).toFixed(3)} kg)</span>
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
                <>
                  <div
                    className="fixed inset-0 z-40 bg-transparent cursor-default"
                    onClick={() => setShowCategoryMenu(false)}
                  />
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
                  {categories.map(cat => {
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
              </>
            )}
            </div>

            {/* Stock Existence Filter */}
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Existencia (Stock)</label>
              <select
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value as any)}
                className="bg-white border border-slate-300 rounded-lg py-1 px-2 text-xs text-slate-800 font-sans font-bold focus:border-winter-inventarioStart focus:outline-none shadow-sm"
              >
                <option value="todos">TODOS LOS PRODUCTOS</option>
                <option value="con_existencia">CON EXISTENCIA (&gt; 0)</option>
                <option value="sin_existencia">SIN EXISTENCIA (0)</option>
                <option value="menor_5">EXISTENCIA MENOR O IGUAL A 5 (≤ 5)</option>
                <option value="menor_10">EXISTENCIA MENOR O IGUAL A 10 (≤ 10)</option>
                <option value="menor_15">EXISTENCIA MENOR O IGUAL A 15 (≤ 15)</option>
              </select>
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
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-slate-550 border-b border-slate-200">
                      <th className="px-2 py-1.5 font-sans uppercase">Código</th>
                      <th className="px-2 py-1.5 font-sans uppercase">
                        {renderSortHeader('Descripción', 'descripcion')}
                      </th>
                      <th className="px-2 py-1.5 font-sans uppercase">
                        {renderSortHeader('Categoría', 'categoria')}
                      </th>
                      <th className="px-2 py-1.5 text-right font-sans uppercase">Stock Mínimo</th>
                      <th className="px-2 py-1.5 text-right text-slate-800 font-sans uppercase">
                        {renderSortHeader('Existencia', 'existencia', 'right')}
                      </th>
                      <th className="px-2 py-1.5 text-right font-sans uppercase">P. Costo</th>
                      <th className="px-2 py-1.5 text-right text-emerald-600 font-sans uppercase">P. Detalle</th>
                      <th className="px-2 py-1.5 text-right font-sans uppercase">P. Mayor</th>
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
                            <td className="px-2 py-1 font-mono font-bold text-slate-450">{p.barcode}</td>
                            <td className="px-2 py-1 font-sans select-text">
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
                            <td className="px-2 py-1 font-sans">{p.category}</td>
                            <td className="px-2 py-1 text-right font-mono text-slate-500">{formatStockVal(p.stock_minimo, p.a_granel)}</td>
                            <td className={`px-2 py-1 text-right font-black font-mono ${isLowStock ? 'text-red-500 animate-pulse font-bold' : 'text-slate-800'}`}>
                              {formatStockVal(p.stock_actual, p.a_granel)}
                            </td>
                            <td className="px-2 py-1 text-right font-mono text-slate-600">${p.precio_costo_usd.toFixed(2)}</td>
                            <td className="px-2 py-1 text-right font-mono text-emerald-600 font-bold">${p.precio_detalle_usd.toFixed(2)}</td>
                            <td className="px-2 py-1 text-right font-mono text-slate-600">
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

                  {/* BUTTON 2: STOCK */}
                  <button
                    onClick={() => selectedProduct && handleOpenAdjust(selectedProduct)}
                    disabled={!selectedProduct || !hasPermission('editar')}
                    className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-cyan-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                    title={!selectedProduct ? "Seleccione un producto para ajustar stock" : !hasPermission('editar') ? "No posee permisos para ajustar stock" : "Ajustar stock (Entrada/Salida/Merma)"}
                  >
                    <RefreshCw className="w-4 h-4 bg-cyan-750/50 disabled:bg-transparent rounded-full p-0.5" />
                    <span>Ajustar Stock</span>
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
          <div className="bg-slate-55 px-5 py-4 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2 font-sans">
              <History className="w-4 h-4 text-winter-inventarioStart" />
              Kardex de Movimientos de Inventario
            </h2>
            <span className="text-[10px] bg-slate-200 border border-slate-300 px-2.5 py-0.5 rounded text-slate-600 font-sans">
              {movements.length} transacciones
            </span>
          </div>

          <div className="flex-grow overflow-y-auto">
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
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-slate-400 font-sans">
                      No se han registrado movimientos de inventario.
                    </td>
                  </tr>
                ) : (
                  [...movements].reverse().map(m => {
                    let typeColor = 'text-blue-700 bg-blue-50 border-blue-200';
                    if (m.type === 'Entrada') typeColor = 'text-green-700 bg-green-50 border-green-200';
                    if (m.type === 'Salida') typeColor = 'text-orange-700 bg-orange-50 border-orange-200';
                    if (m.type === 'Merma') typeColor = 'text-red-700 bg-red-50 border-red-200 font-bold';
                    if (m.type === 'Devolucion' || m.type === 'Devolución') typeColor = 'text-yellow-700 bg-yellow-50 border-yellow-250 font-bold';

                    // Check if product is a granel (bulk)
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
          className="fixed bottom-4 right-4 bg-winter-inventarioStart hover:bg-winter-inventarioEnd text-white px-4 py-3 rounded-lg shadow-2xl z-50 flex items-center gap-3 cursor-pointer animate-bounce font-mono text-xs border border-white/20 select-none"
        >
          <Plus className="w-4 h-4" />
          <span>[+] RESTAURAR REGISTRO: {newClave.toUpperCase() || 'NUEVO PRODUCTO'}</span>
        </div>
      )}

      {showNewProdModal && !isMinimized && (
        <div className="fixed inset-0 bg-slate-950/20 pointer-events-none flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
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
                      {categories.map(cat => (
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
                      {categories.map(cat => (
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
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-slate-800">
          <div className="bg-white border border-indigo-200 rounded-xl overflow-hidden w-full max-w-4xl shadow-2xl flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="bg-indigo-650 text-white px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                <h3 className="text-sm font-black font-sans uppercase tracking-wider">Carga Masiva de Productos</h3>
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
                  <h4 className="font-bold text-[13px] text-indigo-900 font-sans uppercase mb-1">📋 Instrucciones de Importación</h4>
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
                  {categories.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs italic">
                      No hay categorías registradas en el sistema.
                    </div>
                  ) : (
                    categories.map(cat => {
                      const activeCount = products.filter(p => p.category === cat && p.estado === 'Activo').length;
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
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

      {/* GENERAL ADJUSTMENT MODAL */}
      {showGeneralAdjustModal && (() => {
        const targetProducts = getGeneralAdjustTargetProducts();
        
        // Check violations
        let violationsCount = 0;
        const updatesPreview = targetProducts.map(p => {
          const nextCost = generalAdjustCost ? computePriceChange(p.precio_costo_usd) : p.precio_costo_usd;
          const nextDetail = generalAdjustDetail ? computePriceChange(p.precio_detalle_usd) : p.precio_detalle_usd;
          const nextMayor = generalAdjustMayor ? computePriceChange(p.precio_mayor_usd) : p.precio_mayor_usd;
          
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
                          {categories.map(cat => (
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
                          <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded font-extrabold animate-pulse">
                            ⚠️ {violationsCount} Violaciones de Regla Costo/Venta
                          </span>
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

    </div>
  );
}
