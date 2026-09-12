import { useState, useEffect, useRef } from 'react';
import { 
  X, Check, RefreshCw, AlertTriangle, Sparkles, 
  Trash2, Image as ImageIcon, Camera, DollarSign,
  Package, Tag, Calendar, ShieldAlert,
  History, ChevronDown, ChevronUp, ArrowDownRight, ArrowUpRight
} from 'lucide-react';
import { getApiBaseUrl, formatImageUrl } from '../utils';

export interface MobileProductFormData {
  id?: number;
  barcode: string;
  description: string;
  category: string;
  stock_actual: number;
  stock_minimo: number;
  precio_costo_usd: number;
  precio_detalle_usd: number;
  precio_mayor_usd: number;
  precio_bulto_usd?: number;
  cantidad_mayorista?: number;
  cant_bulto?: number;
  ganancia_detalle?: number;
  ganancia_mayor?: number;
  ganancia_bulto?: number;
  fijar_margen?: boolean;
  exento_impuesto?: boolean;
  imagen_url?: string;
  estado?: 'Activo' | 'Inactivo';
  a_granel?: boolean;
  fecha_vencimiento?: string;
  porcentaje_impuesto?: number;
}

interface MobileProductModalProps {
  isOpen: boolean;
  productToEdit: MobileProductFormData | null;
  categories: string[];
  tasaCobro: number;
  onClose: () => void;
  onSaved: (savedProduct: MobileProductFormData, isNew: boolean) => void;
  onDeleted?: (productId: number) => void;
}

export default function MobileProductModal({
  isOpen,
  productToEdit,
  categories,
  tasaCobro,
  onClose,
  onSaved,
  onDeleted
}: MobileProductModalProps) {
  if (!isOpen) return null;

  const isEditing = !!productToEdit && !!productToEdit.id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active section tab in the modal: 'general' | 'precios' | 'stock_foto'
  const [activeSection, setActiveSection] = useState<'general' | 'precios' | 'stock_foto'>('general');

  // Form states
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [aGranel, setAGranel] = useState(false);
  const [estado, setEstado] = useState<'Activo' | 'Inactivo'>('Activo');

  // Pricing states
  const [costoUsd, setCostoUsd] = useState('0');
  const [detalleUsd, setDetalleUsd] = useState('0');
  const [gananciaDetalle, setGananciaDetalle] = useState('30');
  const [mayorUsd, setMayorUsd] = useState('0');
  const [cantidadMayor, setCantidadMayor] = useState('12');
  const [bultoUsd, setBultoUsd] = useState('0');
  const [cantBulto, setCantBulto] = useState('24');
  const [exentoImpuesto, setExentoImpuesto] = useState(false);

  // Stock & Extra states
  const [stockActual, setStockActual] = useState('0');
  const [stockMinimo, setStockMinimo] = useState('5');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');

  // UI / Status states
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Kardex history states
  const [movements, setMovements] = useState<any[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [showKardex, setShowKardex] = useState(true);

  // Fetch quick kardex movements when modal opens for editing
  useEffect(() => {
    if (isOpen && isEditing && productToEdit) {
      const fetchMovs = async () => {
        setLoadingMovements(true);
        try {
          const res = await fetch(`${getApiBaseUrl()}/movements`);
          if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list)) {
              const prodCode = (productToEdit.barcode || '').trim().toLowerCase();
              const prodDesc = (productToEdit.description || '').trim().toLowerCase();
              const relevant = list
                .filter((m: any) => {
                  const c = (m.productCode || m.codigo || '').trim().toLowerCase();
                  const d = (m.productDescription || m.producto || '').trim().toLowerCase();
                  const pid = m.productId || m.producto_id;
                  return (prodCode && c === prodCode) || (prodDesc && d === prodDesc) || (pid && pid === productToEdit.id);
                })
                .slice(-5)
                .reverse();
              setMovements(relevant);
            }
          }
        } catch (err) {
          console.warn('Error fetching kardex movements:', err);
        } finally {
          setLoadingMovements(false);
        }
      };
      fetchMovs();
    } else {
      setMovements([]);
    }
  }, [isOpen, isEditing, productToEdit]);

  // Initialize form when productToEdit changes
  useEffect(() => {
    if (productToEdit) {
      setBarcode(productToEdit.barcode || '');
      setDescription(productToEdit.description || '');
      setCategory(productToEdit.category || (categories[0] || 'GENERAL'));
      setIsNewCategory(false);
      setNewCategoryInput('');
      setAGranel(!!productToEdit.a_granel);
      setEstado(productToEdit.estado || 'Activo');

      const cost = parseFloat(String(productToEdit.precio_costo_usd || 0));
      const det = parseFloat(String(productToEdit.precio_detalle_usd || 0));
      setCostoUsd(cost.toString());
      setDetalleUsd(det.toString());

      if (cost > 0 && det > 0) {
        setGananciaDetalle((((det - cost) / cost) * 100).toFixed(1));
      } else {
        setGananciaDetalle(productToEdit.ganancia_detalle?.toString() || '30');
      }

      setMayorUsd((productToEdit.precio_mayor_usd || 0).toString());
      setCantidadMayor((productToEdit.cantidad_mayorista || 12).toString());
      setBultoUsd((productToEdit.precio_bulto_usd || 0).toString());
      setCantBulto((productToEdit.cant_bulto || 24).toString());
      setExentoImpuesto(!!productToEdit.exento_impuesto);

      setStockActual(String(productToEdit.stock_actual ?? 0));
      setStockMinimo(String(productToEdit.stock_minimo ?? 5));
      setFechaVencimiento(productToEdit.fecha_vencimiento || '');
      setImagenUrl(productToEdit.imagen_url || '');
    } else {
      // Defaults for new product
      setBarcode('');
      setDescription('');
      setCategory(categories[0] || 'GENERAL');
      setIsNewCategory(false);
      setNewCategoryInput('');
      setAGranel(false);
      setEstado('Activo');

      setCostoUsd('0');
      setDetalleUsd('0');
      setGananciaDetalle('30');
      setMayorUsd('0');
      setCantidadMayor('12');
      setBultoUsd('0');
      setCantBulto('24');
      setExentoImpuesto(false);

      setStockActual('0');
      setStockMinimo('5');
      setFechaVencimiento('');
      setImagenUrl('');
    }
    setActiveSection('general');
    setShowDeleteConfirm(false);
    setErrorMsg('');
  }, [productToEdit, isOpen]);

  // Recalculate detail price when cost or margin changes
  const handleCostChange = (val: string) => {
    setCostoUsd(val);
    const numCost = parseFloat(val) || 0;
    const numMargin = parseFloat(gananciaDetalle) || 0;
    if (numCost > 0) {
      const calculatedDet = numCost * (1 + numMargin / 100);
      setDetalleUsd(calculatedDet.toFixed(2));
      if (parseFloat(mayorUsd) <= 0) {
        setMayorUsd((numCost * 1.15).toFixed(2));
      }
    }
  };

  const handleMarginChange = (val: string) => {
    setGananciaDetalle(val);
    const numCost = parseFloat(costoUsd) || 0;
    const numMargin = parseFloat(val) || 0;
    if (numCost > 0) {
      const calculatedDet = numCost * (1 + numMargin / 100);
      setDetalleUsd(calculatedDet.toFixed(2));
    }
  };

  const handleDetailPriceChange = (val: string) => {
    setDetalleUsd(val);
    const numCost = parseFloat(costoUsd) || 0;
    const numDet = parseFloat(val) || 0;
    if (numCost > 0 && numDet > 0) {
      const calculatedMargin = ((numDet - numCost) / numCost) * 100;
      setGananciaDetalle(calculatedMargin.toFixed(1));
    }
  };

  const generateAutoBarcode = () => {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    setBarcode(`770${randomSuffix}`);
  };

  // AI Image generation
  const handleGenerateAiImage = async () => {
    if (!description.trim()) {
      setErrorMsg('Ingresa primero la descripción del producto para generar la imagen con IA');
      return;
    }
    setErrorMsg('');
    setIsGeneratingAi(true);
    try {
      const activeCat = isNewCategory ? newCategoryInput : category;
      const res = await fetch(`${getApiBaseUrl()}/ai/generate-product-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          category: activeCat.trim(),
          barcode: barcode.trim(),
          saveLocal: true
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.imageUrl) {
          setImagenUrl(data.imageUrl);
        } else {
          setErrorMsg(data.error || 'No se pudo generar la imagen');
        }
      }
    } catch (err: any) {
      console.error('Error generating AI image:', err);
      setErrorMsg(err.message || 'Error con el servicio de IA');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // File upload from device camera / gallery
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setErrorMsg('');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const res = await fetch(`${getApiBaseUrl()}/ai/upload-manual-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64Data,
            filename: `${barcode || 'prod'}_${Date.now()}.png`
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.imageUrl) {
            setImagenUrl(data.imageUrl);
          }
        }
        setIsUploadingImage(false);
      };
      reader.onerror = () => {
        setIsUploadingImage(false);
        setErrorMsg('Error al procesar el archivo seleccionado');
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setIsUploadingImage(false);
      setErrorMsg(err.message || 'Error al subir foto');
    }
  };

  // Submit Save Product
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (!description.trim()) {
      setErrorMsg('La descripción o nombre del producto es obligatoria');
      setActiveSection('general');
      return;
    }

    const finalCategory = isNewCategory 
      ? newCategoryInput.trim().toUpperCase() 
      : category.trim().toUpperCase();

    if (!finalCategory) {
      setErrorMsg('Debes asignar una categoría al producto');
      setActiveSection('general');
      return;
    }

    const parsedCosto = parseFloat(costoUsd) || 0;
    const parsedDetalle = parseFloat(detalleUsd) || 0;
    const parsedMayor = parseFloat(mayorUsd) || 0;
    const parsedBulto = parseFloat(bultoUsd) || 0;
    const parsedStock = aGranel 
      ? (parseFloat(stockActual) || 0) 
      : Math.round(parseFloat(stockActual) || 0);
    const parsedStockMin = aGranel 
      ? (parseFloat(stockMinimo) || 0) 
      : Math.round(parseFloat(stockMinimo) || 0);

    const payload: MobileProductFormData = {
      ...(isEditing ? { id: productToEdit!.id } : {}),
      barcode: barcode.trim() || `GEN-${Date.now()}`,
      description: description.trim().toUpperCase(),
      category: finalCategory,
      stock_actual: parsedStock,
      stock_minimo: parsedStockMin,
      precio_costo_usd: parsedCosto,
      precio_detalle_usd: parsedDetalle,
      precio_mayor_usd: parsedMayor,
      precio_bulto_usd: parsedBulto,
      cantidad_mayorista: parseInt(cantidadMayor, 10) || 12,
      cant_bulto: parseInt(cantBulto, 10) || 24,
      ganancia_detalle: parseFloat(gananciaDetalle) || 0,
      exento_impuesto: exentoImpuesto,
      imagen_url: imagenUrl.trim(),
      estado: estado,
      a_granel: aGranel,
      fecha_vencimiento: fechaVencimiento || undefined
    };

    setIsSaving(true);
    try {
      const url = isEditing 
        ? `${getApiBaseUrl()}/productos/${productToEdit!.id}`
        : `${getApiBaseUrl()}/productos`;
      
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al guardar producto en el servidor');
      }

      const savedResult = await res.json();
      onSaved(savedResult || payload, !isEditing);
      onClose();
    } catch (err: any) {
      console.error('Error guardando producto:', err);
      setErrorMsg(err.message || 'Error al guardar el producto');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete product handler
  const handleDeleteProduct = async () => {
    if (!productToEdit?.id) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/productos/${productToEdit.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo eliminar el producto');
      }
      if (onDeleted) onDeleted(productToEdit.id);
      onClose();
    } catch (err: any) {
      console.error('Error eliminando producto:', err);
      setErrorMsg(err.message || 'No se pudo eliminar');
    } finally {
      setIsSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const currentPriceVes = (parseFloat(detalleUsd) || 0) * tasaCobro;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-3 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden pb-1 sm:pb-0">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white leading-tight">
                {isEditing ? 'Modificar Ficha Técnica' : 'Nuevo Producto'}
              </h2>
              <p className="text-[10px] text-slate-400">
                {isEditing ? (productToEdit?.description || 'Detalles del producto') : 'Registro de inventario móvil'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="grid grid-cols-3 gap-1 p-2 bg-slate-950/90 border-b border-slate-800/80 text-xs">
          <button
            type="button"
            onClick={() => setActiveSection('general')}
            className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
              activeSection === 'general'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Básico</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('precios')}
            className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
              activeSection === 'precios'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Precios</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('stock_foto')}
            className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
              activeSection === 'stock_foto'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Stock y Foto</span>
          </button>
        </div>

        {/* Form Body (Scrollable) */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* SECTION 1: DATOS BÁSICOS */}
          {activeSection === 'general' && (
            <div className="space-y-3.5">
              {/* Description */}
              <div>
                <label className="text-xs font-bold text-slate-200 block mb-1">
                  Descripción / Nombre del Producto *
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej. HARINA PAN 1KG"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white uppercase placeholder-slate-500 focus:outline-none focus:border-blue-500 transition font-medium"
                />
              </div>

              {/* Barcode */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-200">
                    Código de Barras / Clave
                  </label>
                  <button
                    type="button"
                    onClick={generateAutoBarcode}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <span>Generar Código Auto</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Código de barras o clave única"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                  />
                  {barcode && (
                    <button
                      type="button"
                      onClick={() => setBarcode('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-200">
                    Categoría
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsNewCategory(!isNewCategory)}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300"
                  >
                    {isNewCategory ? 'Elegir Existente' : '+ Nueva Categoría'}
                  </button>
                </div>

                {isNewCategory ? (
                  <input
                    type="text"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    placeholder="Escribe el nombre de la nueva categoría"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white uppercase placeholder-slate-500 focus:outline-none focus:border-blue-500 transition font-medium"
                  />
                ) : (
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    {!categories.includes(category) && category && (
                      <option value={category}>{category}</option>
                    )}
                  </select>
                )}
              </div>

              {/* Toggles: Granel & Estado */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div 
                  onClick={() => setAGranel(!aGranel)}
                  className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                    aGranel 
                      ? 'bg-amber-950/30 border-amber-600/60 text-amber-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <div>
                    <span className="text-xs font-bold block">A Granel</span>
                    <span className="text-[10px] opacity-70">Venta en Kg/Gr</span>
                  </div>
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                    aGranel ? 'bg-amber-600 border-amber-500 text-white' : 'border-slate-700 bg-slate-900'
                  }`}>
                    {aGranel && <Check className="w-3.5 h-3.5" />}
                  </div>
                </div>

                <div 
                  onClick={() => setEstado(estado === 'Activo' ? 'Inactivo' : 'Activo')}
                  className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                    estado === 'Activo'
                      ? 'bg-emerald-950/30 border-emerald-600/60 text-emerald-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <div>
                    <span className="text-xs font-bold block">Estado</span>
                    <span className="text-[10px] opacity-70">{estado}</span>
                  </div>
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                    estado === 'Activo' ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-slate-700 bg-slate-900'
                  }`}>
                    {estado === 'Activo' && <Check className="w-3.5 h-3.5" />}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: PRECIOS Y MÁRGENES */}
          {activeSection === 'precios' && (
            <div className="space-y-4">
              {/* Cost & Profit Margin */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Costo USD ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={costoUsd}
                      onChange={(e) => handleCostChange(e.target.value)}
                      className="w-full pl-7 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold font-mono text-white focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    % Ganancia Detalle
                  </label>
                  <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono font-bold">%</span>
                    <input
                      type="number"
                      step="0.5"
                      value={gananciaDetalle}
                      onChange={(e) => handleMarginChange(e.target.value)}
                      className="w-full pl-3 pr-7 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold font-mono text-emerald-400 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Retail Price (Detalle) */}
              <div className="bg-slate-950/80 border border-blue-900/40 rounded-2xl p-3.5">
                <label className="text-xs font-black text-blue-300 block mb-1">
                  Precio Detalle (Venta Principal) *
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400 text-sm font-mono font-black">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={detalleUsd}
                      onChange={(e) => handleDetailPriceChange(e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 bg-slate-900 border border-blue-600/50 rounded-xl text-base font-black font-mono text-emerald-400 focus:outline-none focus:border-blue-400 transition"
                    />
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block font-medium">Equivalente Bs</span>
                    <span className="text-xs font-bold text-white font-mono">
                      {currentPriceVes.toFixed(2)} Bs
                    </span>
                  </div>
                </div>
              </div>

              {/* Wholesale (Mayor) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Precio Mayor ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={mayorUsd}
                      onChange={(e) => setMayorUsd(e.target.value)}
                      className="w-full pl-7 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold font-mono text-white focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Mínimo Mayorista
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={cantidadMayor}
                    onChange={(e) => setCantidadMayor(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold font-mono text-white focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              {/* Bulto (Pack / Caja) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Precio Bulto / Pack ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bultoUsd}
                      onChange={(e) => setBultoUsd(e.target.value)}
                      className="w-full pl-7 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold font-mono text-white focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Unidades por Bulto
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={cantBulto}
                    onChange={(e) => setCantBulto(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold font-mono text-white focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              {/* Exento de Impuesto Checkbox */}
              <div
                onClick={() => setExentoImpuesto(!exentoImpuesto)}
                className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                  exentoImpuesto
                    ? 'bg-blue-950/40 border-blue-600/60 text-blue-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <div>
                  <span className="text-xs font-bold block">Exento de Impuesto (IVA)</span>
                  <span className="text-[10px] opacity-70">
                    {exentoImpuesto ? 'Producto exonerado de IVA (0%)' : 'Aplica IVA general del comercio'}
                  </span>
                </div>
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                  exentoImpuesto ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700 bg-slate-900'
                }`}>
                  {exentoImpuesto && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: INVENTARIO Y FOTO */}
          {activeSection === 'stock_foto' && (
            <div className="space-y-4">
              {/* Stock Inputs */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    {isEditing ? 'Stock Actual' : 'Stock Inicial'}
                  </label>
                  <input
                    type="number"
                    step={aGranel ? '0.01' : '1'}
                    value={stockActual}
                    onChange={(e) => setStockActual(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold font-mono text-white focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Stock Mínimo Alerta
                  </label>
                  <input
                    type="number"
                    step={aGranel ? '0.01' : '1'}
                    value={stockMinimo}
                    onChange={(e) => setStockMinimo(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold font-mono text-white focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              {/* Expiration Date */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Fecha de Vencimiento (opcional)</span>
                </label>
                <input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Quick Kardex / Movement History (Editing mode) */}
              {isEditing && (
                <div className="bg-slate-950/90 border border-slate-800 rounded-2xl overflow-hidden shadow-md">
                  <button
                    type="button"
                    onClick={() => setShowKardex(!showKardex)}
                    className="w-full p-3 flex items-center justify-between hover:bg-slate-900/60 transition text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                        <History className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-black text-white block">Kardex Rápido (Últimos Movimientos)</span>
                        <span className="text-[10px] text-slate-400">
                          {movements.length} registro(s) reciente(s)
                        </span>
                      </div>
                    </div>
                    {showKardex ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {showKardex && (
                    <div className="p-3 pt-0 border-t border-slate-800/60 space-y-2">
                      {loadingMovements ? (
                        <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                          <span>Cargando movimientos...</span>
                        </div>
                      ) : movements.length === 0 ? (
                        <p className="py-3 text-center text-[11px] text-slate-500">
                          No hay movimientos registrados para este producto todavía.
                        </p>
                      ) : (
                        movements.map((m, idx) => {
                          const isEntrada = (m.type || '').toLowerCase().includes('entrada') || (m.type || '').toLowerCase().includes('compra');
                          const isMerma = (m.type || '').toLowerCase().includes('merma');
                          const qty = parseFloat(String(m.qty ?? m.cantidad ?? 0));

                          return (
                            <div
                              key={m.id || idx}
                              className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                      isEntrada
                                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                                        : isMerma
                                        ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                                        : 'bg-blue-950 text-blue-300 border border-blue-800/60'
                                    }`}
                                  >
                                    {m.type || 'Movimiento'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {m.date ? String(m.date).substring(0, 16) : ''}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-300 font-medium truncate max-w-[200px]">
                                  {m.motivo || 'Operación regular de almacén'}
                                </p>
                                {m.usuario && (
                                  <span className="text-[9px] text-slate-400 block">
                                    Por: {m.usuario}
                                  </span>
                                )}
                              </div>

                              <div className="text-right">
                                <span
                                  className={`text-sm font-black font-mono flex items-center justify-end gap-0.5 ${
                                    qty > 0 ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {qty > 0 ? (
                                    <>
                                      <ArrowUpRight className="w-3.5 h-3.5" />
                                      +{qty}
                                    </>
                                  ) : (
                                    <>
                                      <ArrowDownRight className="w-3.5 h-3.5" />
                                      {qty}
                                    </>
                                  )}
                                </span>
                                {m.stock_posterior !== undefined && (
                                  <span className="text-[9px] text-slate-400 font-mono block">
                                    Saldo: {m.stock_posterior}
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
              )}

              {/* Product Photo Management */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                <label className="text-xs font-bold text-slate-200 block mb-2">
                  Fotografía del Producto
                </label>

                <div className="flex gap-4 items-center">
                  {/* Photo Preview Thumbnail */}
                  <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden relative flex-shrink-0">
                    {imagenUrl ? (
                      <img
                        src={formatImageUrl(imagenUrl)}
                        alt="Producto"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                    )}
                    {imagenUrl && (
                      <button
                        type="button"
                        onClick={() => setImagenUrl('')}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow"
                        title="Quitar foto"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Image Actions */}
                  <div className="flex-1 space-y-2">
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />

                    {/* Camera / Upload Button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                      className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                    >
                      <Camera className="w-3.5 h-3.5 text-blue-400" />
                      <span>{isUploadingImage ? 'Subiendo...' : 'Tomar Foto / Subir'}</span>
                    </button>

                    {/* AI Generator Button */}
                    <button
                      type="button"
                      onClick={handleGenerateAiImage}
                      disabled={isGeneratingAi || !description.trim()}
                      className="w-full py-2 px-3 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 rounded-xl text-xs font-bold text-indigo-300 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isGeneratingAi ? 'Generando con IA...' : 'Generar Foto con IA'}</span>
                    </button>
                  </div>
                </div>

                {/* Direct Image URL input */}
                <div className="mt-3">
                  <input
                    type="text"
                    value={imagenUrl}
                    onChange={(e) => setImagenUrl(e.target.value)}
                    placeholder="O pega aquí la URL de la imagen..."
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-[10px] text-slate-300 font-mono focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              {/* Danger Zone: Delete Product (Editing mode only) */}
              {isEditing && (
                <div className="pt-2 border-t border-slate-800/80">
                  {showDeleteConfirm ? (
                    <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl space-y-2">
                      <p className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                        ¿Confirmas eliminar este producto del inventario?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteProduct}
                          disabled={isSaving}
                          className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-black"
                        >
                          Sí, Eliminar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full py-2.5 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/40 rounded-xl text-xs font-bold text-rose-400 flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar Producto del Catálogo</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300 transition active:scale-95 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isSaving}
            className="flex-[2] py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-black text-white shadow-lg shadow-blue-900/50 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{isEditing ? 'Guardar Ficha Técnica' : 'Crear Producto'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
