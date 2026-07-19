import React, { useState, useEffect, useRef } from 'react';
import { Product, InventoryMovement, PriceAdjustmentHistory, User } from '../types';
import { Package, History, PenTool, Plus, Search, Layers, RefreshCw, Minus, Printer, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface InventarioProps {
  products: Product[];
  movements: InventoryMovement[];
  priceHistory: PriceAdjustmentHistory[];
  currentUser: User;
  onAddProduct: (prod: Product) => void;
  onUpdateProductStock: (prodId: number, type: 'Entrada' | 'Salida' | 'Merma' | 'Devolucion', qty: number, reason: string) => void;
  onUpdateProductPrices: (prodId: number, prices: { cost: number; detail: number; mayor: number }, reason: string) => void;
  onDeleteProduct: (prodId: number) => Promise<boolean>;
}

export default function Inventario({
  products,
  movements,
  priceHistory,
  currentUser: _currentUser,
  onAddProduct,
  onUpdateProductStock,
  onUpdateProductPrices,
  onDeleteProduct
}: InventarioProps) {
  const [activeSubTab, setActiveSubTab] = useState<'catalogo' | 'movimientos' | 'precios'>('catalogo');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter states
  const [filterCategory, setFilterCategory] = useState('TODAS');
  const [filterStock, setFilterStock] = useState<'todos' | 'con_existencia' | 'sin_existencia'>('todos');
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
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showNewProdModal, setShowNewProdModal] = useState(false);

  // Escape key listener to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAdjustModal(false);
        setShowPriceModal(false);
        setShowNewProdModal(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);
  
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
      alert("No se puede eliminar un producto con existencia mayor a 0");
      return;
    }
    
    if (window.confirm(`¿Está seguro de que desea eliminar el producto "${selectedProduct.description}" permanentemente del sistema? Esta acción no se puede deshacer.`)) {
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

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesCategory = filterCategory === 'TODAS' || p.category.toUpperCase() === filterCategory.toUpperCase();
    
    const matchesStock = 
      filterStock === 'todos' ? true :
      filterStock === 'con_existencia' ? p.stock_actual > 0 :
      filterStock === 'sin_existencia' ? p.stock_actual === 0 : true;
      
    const matchesMinStock = 
      filterMinStock === 'todos' ? true :
      filterMinStock === 'bajo_minimo' ? p.stock_actual <= p.stock_minimo : true;
      
    return matchesSearch && matchesCategory && matchesStock && matchesMinStock;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!sortField) return 0;
    
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
    
    const qty = parseInt(adjustQty);
    if (isNaN(qty) || qty <= 0) {
      alert('Por favor ingrese una cantidad válida mayor a cero.');
      return;
    }

    if (!adjustReason.trim()) {
      alert('Debe especificar un motivo/justificación de manera obligatoria.');
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
      alert('Los precios ingresados deben ser valores numéricos no negativos.');
      return;
    }

    if (!priceReason.trim()) {
      alert('Debe especificar una justificación obligatoria para la actualización de precios.');
      return;
    }

    onUpdateProductPrices(selectedProduct.id, { cost, detail, mayor }, priceReason.trim());
    setShowPriceModal(false);
    setSelectedProduct(null);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClave.trim() || !newDesc.trim()) {
      alert('Clave del producto y descripción son obligatorios.');
      return;
    }

    // Generate barcode if not provided
    const barcodeVal = newBarcode.trim() !== '' ? newBarcode.trim() : newClave.trim();

    if (products.some(p => p.barcode === barcodeVal.toUpperCase())) {
      alert('Ya existe un producto registrado con ese código de barras o clave.');
      return;
    }

    const cost = parseFloat(newCost) || 0;
    const detail = parseFloat(newDetail) || 0;
    const mayor = parseFloat(newMayor) || 0;
    const min = parseInt(newMinStock) || 0;
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

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor permita las ventanas emergentes para poder imprimir el reporte.');
      return;
    }

    const totalFilteredProducts = filteredProducts.length;
    const totalFilteredQty = filteredProducts.reduce((acc, p) => acc + p.stock_actual, 0);
    const totalFilteredValueVenta = filteredProducts.reduce((acc, p) => acc + p.precio_detalle_usd * p.stock_actual, 0);
    const totalFilteredValueCosto = filteredProducts.reduce((acc, p) => acc + p.precio_costo_usd * p.stock_actual, 0);

    const now = new Date().toLocaleString();

    const categoryFilterLabel = filterCategory === 'TODAS' ? 'TODAS' : filterCategory;
    const stockFilterLabel = 
      filterStock === 'todos' ? 'TODOS' :
      filterStock === 'con_existencia' ? 'CON EXISTENCIA' : 'SIN EXISTENCIA';
    const minStockFilterLabel = 
      filterMinStock === 'todos' ? 'TODOS' : 'BAJO STOCK MÍNIMO';

    const rowsHtml = filteredProducts.map(p => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px 8px; font-family: monospace; font-size: 10px; font-weight: bold; color: #475569;">${p.barcode}</td>
        <td style="padding: 6px 8px; font-size: 10px; font-weight: bold;">${p.description}</td>
        <td style="padding: 6px 8px; font-size: 10px;">${p.category}</td>
        <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-size: 10px; color: #64748b;">${p.stock_minimo}</td>
        <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-size: 10px; font-weight: bold; ${p.stock_actual <= p.stock_minimo ? 'color: #ef4444;' : 'color: #1e293b;'}">${p.stock_actual}</td>
        <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-size: 10px; color: #475569;">$${p.precio_costo_usd.toFixed(2)}</td>
        <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-size: 10px; font-weight: bold; color: #059669;">$${p.precio_detalle_usd.toFixed(2)}</td>
        <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-size: 10px; color: #475569;">$${p.precio_mayor_usd.toFixed(2)} <span style="font-size: 8px; color: #94a3b8;">x${p.cantidad_mayorista}</span></td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte de Inventario - Inversiones Niquitao</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #1e293b; margin: 20px; font-size: 11px; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 15px; }
            .title { font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 0; color: #0f172a; }
            .subtitle { font-size: 10px; color: #64748b; margin: 2px 0 0 0; }
            .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; }
            .info-item { display: flex; flex-direction: column; }
            .info-label { font-size: 8px; text-transform: uppercase; color: #64748b; font-weight: bold; }
            .info-value { font-size: 11px; font-weight: bold; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #f1f5f9; padding: 8px; font-weight: bold; text-align: left; text-transform: uppercase; font-size: 9px; border-bottom: 2px solid #cbd5e1; color: #475569; }
            @media print {
              body { margin: 10px; }
              .no-print { display: none; }
              @page { size: portrait; margin: 1cm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h1 class="title">INVERSIONES NIQUITAO 3000 C.A.</h1>
                <p class="subtitle">RIF: J-41132631 | Tel: 0424-2042877 | Reporte de Inventario</p>
              </div>
              <div style="text-align: right;">
                <p style="margin: 0; font-weight: bold; font-size: 11px;">Estación: CAJA_01</p>
                <p style="margin: 2px 0 0 0; font-size: 9px; color: #64748b;">Generado: ${now}</p>
              </div>
            </div>
          </div>

          <div style="margin-bottom: 8px; font-weight: bold; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; color: #64748b;">
            Filtros Aplicados: 
            <span style="background: #f1f5f9; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 4px; margin-right: 5px; color: #334155;">Categoría: ${categoryFilterLabel}</span>
            <span style="background: #f1f5f9; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 4px; margin-right: 5px; color: #334155;">Existencia: ${stockFilterLabel}</span>
            <span style="background: #f1f5f9; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 4px; color: #334155;">Stock Mínimo: ${minStockFilterLabel}</span>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Productos Listados</span>
              <span class="info-value">${totalFilteredProducts} artículos</span>
            </div>
            <div class="info-item">
              <span class="info-label">Total Unidades</span>
              <span class="info-value">${totalFilteredQty} uds</span>
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
                <th style="width: 15%; text-align: left;">Código</th>
                <th style="width: 35%; text-align: left;">Descripción</th>
                <th style="width: 15%; text-align: left;">Categoría</th>
                <th style="width: 8%; text-align: right;">Mínimo</th>
                <th style="width: 8%; text-align: right;">Existencia</th>
                <th style="width: 8%; text-align: right;">P. Costo</th>
                <th style="width: 8%; text-align: right; color: #059669;">P. Detalle</th>
                <th style="width: 10%; text-align: right;">P. Mayor</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">No hay productos con los filtros seleccionados.</td></tr>'}
            </tbody>
          </table>

          <div style="margin-top: 30px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px dashed #e2e8f0; padding-top: 10px;" class="no-print">
            <button onclick="window.print()" style="background: #0f172a; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; cursor: pointer; font-family: inherit;">Imprimir Reporte</button>
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

  return (
    <div className="space-y-6 text-slate-800 font-mono text-xs">
      
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
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-800 font-mono text-xs">
            <div className="flex justify-between items-center border-b md:border-b-0 md:border-r border-slate-100 pb-2 md:pb-0 md:pr-4">
              <span className="text-slate-500 font-sans">Precio 1 del Inventario :</span>
              <span className="font-extrabold text-slate-900 text-sm">
                {products.reduce((acc, p) => acc + p.precio_detalle_usd * p.stock_actual, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center border-b md:border-b-0 md:border-r border-slate-105 pb-2 md:pb-0 md:px-4">
              <span className="text-slate-500 font-sans">Costo del Inventario :</span>
              <span className="font-extrabold text-slate-900 text-sm">
                {products.reduce((acc, p) => acc + p.precio_costo_usd * p.stock_actual, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center md:pl-4">
              <span className="text-slate-500 font-sans">Total Productos :</span>
              <span className="font-extrabold text-slate-900 text-sm">
                {products.length} <span className="text-[10px] text-slate-400 font-normal">({products.reduce((acc, p) => acc + p.stock_actual, 0)} uds)</span>
              </span>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
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
                className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 focus:border-winter-inventarioStart font-sans focus:outline-none"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handlePrintReport}
                className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Imprimir Reporte
              </button>
            </div>
          </div>

          {/* FILTER CONTROLS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/50 border border-slate-200/60 rounded-xl p-3 shadow-sm">
            {/* Category Filter */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Categoría</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 font-sans focus:border-winter-inventarioStart focus:outline-none"
              >
                <option value="TODAS">TODAS LAS CATEGORÍAS</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Stock Existence Filter */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Existencia (Stock)</label>
              <select
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value as any)}
                className="bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 font-sans focus:border-winter-inventarioStart focus:outline-none"
              >
                <option value="todos">TODOS LOS PRODUCTOS</option>
                <option value="con_existencia">CON EXISTENCIA (&gt; 0)</option>
                <option value="sin_existencia">SIN EXISTENCIA (0)</option>
              </select>
            </div>

            {/* Min Stock Warning Filter */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Alertas de Stock</label>
              <select
                value={filterMinStock}
                onChange={(e) => setFilterMinStock(e.target.value as any)}
                className="bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 font-sans focus:border-winter-inventarioStart focus:outline-none"
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
                      <th className="px-2.5 py-2 font-sans uppercase">Código</th>
                      <th className="px-2.5 py-2 font-sans uppercase">
                        {renderSortHeader('Descripción', 'descripcion')}
                      </th>
                      <th className="px-2.5 py-2 font-sans uppercase">
                        {renderSortHeader('Categoría', 'categoria')}
                      </th>
                      <th className="px-2.5 py-2 text-right font-sans uppercase">Stock Mínimo</th>
                      <th className="px-2.5 py-2 text-right text-slate-800 font-sans uppercase">
                        {renderSortHeader('Existencia', 'existencia', 'right')}
                      </th>
                      <th className="px-2.5 py-2 text-right font-sans uppercase">P. Costo</th>
                      <th className="px-2.5 py-2 text-right text-emerald-600 font-sans uppercase">P. Detalle</th>
                      <th className="px-2.5 py-2 text-right font-sans uppercase">P. Mayor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {sortedProducts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-slate-400 font-sans">
                          No se encontraron productos registrados.
                        </td>
                      </tr>
                    ) : (
                      sortedProducts.map(p => {
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
                            <td className="px-2.5 py-2 font-mono font-bold text-slate-450">{p.barcode}</td>
                            <td className="px-2.5 py-2 font-sans select-text">
                              <div className="font-bold text-slate-850">{p.description}</div>
                              <div className="flex gap-1.5 mt-0.5 text-[9px]">
                                {p.a_granel && (
                                  <span className="bg-amber-50 border border-amber-250 text-amber-700 px-1 py-0.2 rounded font-bold uppercase font-sans">A Granel</span>
                                )}
                                {p.fecha_vencimiento && (
                                  <span className="bg-red-50 border border-red-250 text-red-700 px-1 py-0.2 rounded font-bold font-sans">
                                    Vence: {p.fecha_vencimiento}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2.5 py-2 font-sans">{p.category}</td>
                            <td className="px-2.5 py-2 text-right font-mono text-slate-500">{p.stock_minimo}</td>
                            <td className={`px-2.5 py-2 text-right font-black font-mono ${isLowStock ? 'text-red-500 animate-pulse font-bold' : 'text-slate-800'}`}>
                              {p.stock_actual}
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono text-slate-600">${p.precio_costo_usd.toFixed(2)}</td>
                            <td className="px-2.5 py-2 text-right font-mono text-emerald-600 font-bold">${p.precio_detalle_usd.toFixed(2)}</td>
                            <td className="px-2.5 py-2 text-right font-mono text-slate-600">
                              ${p.precio_mayor_usd.toFixed(2)}
                              <span className="text-[9px] text-slate-400 block font-sans">x{p.cantidad_mayorista}</span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
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
                      Stock: {selectedProduct.stock_actual}
                    </span>
                  </div>
                )}

                {/* Operations buttons */}
                <div className="flex flex-col gap-2.5">
                  {/* BUTTON 1: AGREGAR */}
                  <button
                    onClick={() => setShowNewProdModal(true)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4 bg-emerald-700/50 rounded-full p-0.5" />
                    <span>Agregar</span>
                  </button>

                  {/* BUTTON 2: STOCK */}
                  <button
                    onClick={() => selectedProduct && handleOpenAdjust(selectedProduct)}
                    disabled={!selectedProduct}
                    className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-cyan-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                    title={!selectedProduct ? "Seleccione un producto para ajustar stock" : "Ajustar stock (Entrada/Salida/Merma)"}
                  >
                    <RefreshCw className="w-4 h-4 bg-cyan-750/50 disabled:bg-transparent rounded-full p-0.5" />
                    <span>Ajustar Stock</span>
                  </button>

                  {/* BUTTON 3: PRECIOS */}
                  <button
                    onClick={() => selectedProduct && handleOpenPrices(selectedProduct)}
                    disabled={!selectedProduct}
                    className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-amber-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                    title={!selectedProduct ? "Seleccione un producto para editar precios" : "Editar precios del producto"}
                  >
                    <PenTool className="w-4 h-4 bg-amber-750/50 disabled:bg-transparent rounded-full p-0.5" />
                    <span>Editar Precios</span>
                  </button>

                  {/* BUTTON 4: ELIMINAR */}
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
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-550">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-400 font-sans">
                      No se han registrado movimientos de inventario.
                    </td>
                  </tr>
                ) : (
                  [...movements].reverse().map(m => {
                    let typeColor = 'text-blue-700 bg-blue-50 border-blue-200';
                    if (m.type === 'Entrada') typeColor = 'text-green-700 bg-green-50 border-green-200';
                    if (m.type === 'Salida') typeColor = 'text-orange-700 bg-orange-50 border-orange-200';
                    if (m.type === 'Merma') typeColor = 'text-red-700 bg-red-50 border-red-200 font-bold';
                    if (m.type === 'Devolucion') typeColor = 'text-purple-750 bg-purple-50 border-purple-200';

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 font-mono text-slate-450">{m.date}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-500">{m.productCode}</td>
                        <td className="px-4 py-2.5 font-sans">{m.productDescription}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded border text-[9px] ${typeColor}`}>
                            {m.type}
                          </span>
                        </td>
                        <td className={`px-4 py-2.5 text-right font-black font-mono ${m.qty > 0 ? 'text-green-600' : 'text-red-650'}`}>
                          {m.qty > 0 ? `+${m.qty}` : m.qty}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-450">{m.stock_anterior}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-600">{m.stock_posterior}</td>
                        <td className="px-4 py-2.5 text-slate-655 italic font-sans">{m.motivo}</td>
                        <td className="px-4 py-2.5 font-sans">{m.usuario}</td>
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
      {activeSubTab === 'precios' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          <div className="bg-slate-55 px-5 py-4 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2 font-sans">
              <Layers className="w-4 h-4 text-winter-inventarioStart" />
              Auditoría de Ajustes de Precios
            </h2>
            <span className="text-[10px] bg-slate-200 border border-slate-300 px-2.5 py-0.5 rounded text-slate-600 font-sans">
              {priceHistory.length} ajustes
            </span>
          </div>

          <div className="flex-grow overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-555">
                <tr>
                  <th className="px-4 py-3 font-sans uppercase">Fecha/Hora</th>
                  <th className="px-4 py-3 font-sans uppercase">Código</th>
                  <th className="px-4 py-3 font-sans uppercase">Producto</th>
                  <th className="px-4 py-3 text-center font-sans uppercase">Tipo Precio</th>
                  <th className="px-4 py-3 text-right text-red-500 font-sans uppercase">P. Anterior</th>
                  <th className="px-4 py-3 text-right text-green-600 font-sans uppercase">P. Nuevo</th>
                  <th className="px-4 py-3 font-sans uppercase">Motivo del Cambio</th>
                  <th className="px-4 py-3 font-sans uppercase">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                {priceHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400 font-sans">
                      No se han registrado modificaciones de precios de venta o costo.
                    </td>
                  </tr>
                ) : (
                  [...priceHistory].reverse().map(h => (
                    <tr key={h.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-mono text-slate-450">{h.date}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-500">{h.productCode}</td>
                      <td className="px-4 py-2.5 font-sans">{h.productDescription}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded border border-purple-200 text-purple-750 bg-purple-50 text-[9px] uppercase">
                          {h.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-red-550 font-bold">${h.precio_anterior.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-green-600 font-bold">${h.precio_nuevo.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-slate-655 font-sans italic">{h.motivo}</td>
                      <td className="px-4 py-2.5 font-sans">{h.usuario}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
                  min="1"
                  required
                  placeholder="Ej: 15"
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
            className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-lg shadow-2xl p-6 space-y-4 pointer-events-auto select-none"
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
                    value={newClave}
                    onChange={(e) => setNewClave(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none"
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
                        const newCatName = prompt("Ingrese el nombre de la nueva categoría:");
                        if (newCatName && newCatName.trim() !== "") {
                          const cleanName = newCatName.trim().toUpperCase();
                          if (categories.includes(cleanName)) {
                            alert("La categoría ya existe.");
                          } else {
                            setCategories(prev => [...prev, cleanName]);
                            setNewCat(cleanName);
                          }
                        }
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
                  placeholder="DESCRIPCIÓN COMERCIAL EN MAYÚSCULAS..."
                  value={newDesc.toUpperCase()}
                  onChange={(e) => setNewDesc(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-inventarioStart focus:outline-none font-sans font-bold"
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

    </div>
  );
}
