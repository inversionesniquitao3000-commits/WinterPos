import { useState, useEffect, useMemo } from 'react';
import { 
  Package, Search, AlertTriangle, Sparkles, RefreshCw, 
  Image as ImageIcon, X, Plus, Edit2, CheckCircle2,
  SlidersHorizontal, ChevronDown, Layers, FileText
} from 'lucide-react';
import { getApiBaseUrl, formatImageUrl } from '../utils';
import MobileStockModal, { MobileProductStockItem } from './MobileStockModal';
import MobileProductModal, { MobileProductFormData } from './MobileProductModal';
import MobileCargaFacturaModal from './MobileCargaFacturaModal';

interface ProductItem {
  id: number;
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

interface MobileInventarioProps {
  currentUser?: any;
}

export default function MobileInventario({ currentUser }: MobileInventarioProps = {}) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'out_of_stock' | 'low_stock'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [generatingAiId, setGeneratingAiId] = useState<number | null>(null);
  const [tasaCobro, setTasaCobro] = useState(36.5);
  const [visibleCount, setVisibleCount] = useState<number>(40);

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<ProductItem | null>(null);

  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [productForStock, setProductForStock] = useState<ProductItem | null>(null);

  const [isCargaFacturaOpen, setIsCargaFacturaOpen] = useState(false);
  const [hasPausedInvoice, setHasPausedInvoice] = useState(false);

  // Check if user has an unfinished / paused invoice draft saved locally
  const checkPausedInvoice = () => {
    try {
      const raw = localStorage.getItem('winterpos_mobile_factura_pausada');
      if (raw) {
        const parsed = JSON.parse(raw);
        const hasData = Boolean(
          (parsed.items && parsed.items.length > 0) ||
          parsed.numero_factura ||
          parsed.proveedor_id
        );
        setHasPausedInvoice(hasData);
      } else {
        setHasPausedInvoice(false);
      }
    } catch {
      setHasPausedInvoice(false);
    }
  };

  useEffect(() => {
    checkPausedInvoice();
  }, [isCargaFacturaOpen]);

  // Toast feedback banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3500);
  };

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const [resProd, resTasas] = await Promise.all([
        fetch(`${getApiBaseUrl()}/productos`),
        fetch(`${getApiBaseUrl()}/tasas`)
      ]);
      if (resProd.ok) {
        const json = await resProd.json();
        setProducts(json);
      }
      if (resTasas.ok) {
        const tasasJson = await resTasas.json();
        if (tasasJson.length > 0) {
          setTasaCobro(parseFloat(tasasJson[tasasJson.length - 1].tasa_cobro) || 36.5);
        }
      }
    } catch (err) {
      console.error('Error fetching inventory:', err);
      showToast('Error al sincronizar inventario');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Unique categories extracted dynamically
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim().toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [products]);

  // AI Image generator for a specific item
  const handleGenerateAiImage = async (prod: ProductItem) => {
    setGeneratingAiId(prod.id);
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
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && data.imageUrl) {
          const updated = { ...prod, imagen_url: data.imageUrl };
          await fetch(`${getApiBaseUrl()}/productos/${prod.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
          });
          setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, imagen_url: data.imageUrl } : p));
          showToast(`Foto IA generada para ${prod.description.substring(0, 20)}...`);
        }
      }
    } catch (err) {
      console.error('Error generating AI image:', err);
      showToast('Error al generar imagen');
    } finally {
      setGeneratingAiId(null);
    }
  };

  // Open Create Product Modal
  const handleOpenCreateModal = () => {
    setProductToEdit(null);
    setIsProductModalOpen(true);
  };

  // Open Edit Ficha Tecnica Modal
  const handleOpenEditModal = (prod: ProductItem) => {
    setProductToEdit(prod);
    setIsProductModalOpen(true);
  };

  // Open Quick Stock Adjust Modal
  const handleOpenStockModal = (prod: ProductItem) => {
    setProductForStock(prod);
    setIsStockModalOpen(true);
  };

  // Callback when product is saved (created or updated)
  const handleProductSaved = (savedProd: any, isNew: boolean) => {
    if (isNew) {
      setProducts(prev => [savedProd, ...prev]);
      showToast(`Producto "${savedProd.description}" creado exitosamente`);
    } else {
      setProducts(prev => prev.map(p => p.id === savedProd.id ? { ...p, ...savedProd } : p));
      showToast(`Ficha técnica de "${savedProd.description}" actualizada`);
    }
  };

  // Callback when product is deleted
  const handleProductDeleted = (deletedId: number) => {
    setProducts(prev => prev.filter(p => p.id !== deletedId));
    showToast('Producto eliminado del inventario');
  };

  // Callback when stock is updated from Stock Modal
  const handleStockUpdated = (prodId: number, newStock: number) => {
    setProducts(prev => prev.map(p => p.id === prodId ? { ...p, stock_actual: newStock } : p));
    showToast(`Stock actualizado a ${newStock} unidades`);
  };

  // Filtered list
  const filtered = useMemo(() => {
    return products.filter(p => {
      const term = searchTerm.toLowerCase().trim();
      const desc = (p.description || '').toLowerCase();
      const code = (p.barcode || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      const matchSearch = !term || desc.includes(term) || code.includes(term) || cat.includes(term);

      if (!matchSearch) return false;

      // Category filter
      if (selectedCategory !== 'ALL') {
        if ((p.category || '').trim().toUpperCase() !== selectedCategory) {
          return false;
        }
      }

      const stock = parseFloat(String(p.stock_actual)) || 0;
      const minStock = parseFloat(String(p.stock_minimo)) || 0;

      if (selectedFilter === 'out_of_stock') return stock <= 0;
      if (selectedFilter === 'low_stock') return stock > 0 && stock <= minStock;
      return true;
    });
  }, [products, searchTerm, selectedFilter, selectedCategory]);

  const outOfStockCount = useMemo(() => {
    return products.filter(p => (parseFloat(String(p.stock_actual)) || 0) <= 0).length;
  }, [products]);

  const lowStockCount = useMemo(() => {
    return products.filter(p => {
      const s = parseFloat(String(p.stock_actual)) || 0;
      const min = parseFloat(String(p.stock_minimo)) || 0;
      return s > 0 && s <= min && min > 0;
    }).length;
  }, [products]);

  const displayedProducts = filtered.slice(0, visibleCount);

  return (
    <div className="space-y-3 pb-28 pt-2 px-3 relative min-h-screen">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-16 left-3 right-3 z-50 max-w-md mx-auto p-3 bg-emerald-600 text-white rounded-2xl shadow-xl shadow-emerald-950/50 flex items-center justify-between animate-fade-in border border-emerald-400/40">
          <div className="flex items-center gap-2 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="p-1 hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header & Control Center */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-400" />
              Gestión de Stock y Catálogo
            </h2>
            <p className="text-xs text-slate-400">
              {products.length} productos registrados · Tasa: {tasaCobro.toFixed(2)} Bs
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={fetchInventory}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition active:scale-95"
              title="Refrescar catálogo"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setIsCargaFacturaOpen(true)}
              className="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-lg shadow-emerald-900/40 transition active:scale-95"
              title="Cargar Factura de Proveedor"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-200" />
              <span>Factura</span>
            </button>

            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-2.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-lg shadow-blue-900/40 transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Nuevo</span>
            </button>
          </div>
        </div>

        {/* Paused Invoice Banner */}
        {hasPausedInvoice && (
          <div className="flex items-center justify-between p-2.5 bg-amber-500/15 border border-amber-500/40 rounded-xl animate-pulse">
            <div className="flex items-center gap-2 text-xs text-amber-300 font-bold min-w-0">
              <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="truncate">Tienes una factura en borrador pausada</span>
            </div>
            <button
              type="button"
              onClick={() => setIsCargaFacturaOpen(true)}
              className="ml-2 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black shadow flex-shrink-0 active:scale-95 transition"
            >
              Reanudar
            </button>
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setVisibleCount(40);
            }}
            placeholder="Buscar por nombre, código o categoría..."
            className="w-full pl-9 pr-8 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition"
          />
          {searchTerm ? (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {/* Filter Pills (Estado de Stock) */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 text-xs no-scrollbar">
          <button
            onClick={() => {
              setSelectedFilter('all');
              setVisibleCount(40);
            }}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
              selectedFilter === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Todos ({products.length})
          </button>

          <button
            onClick={() => {
              setSelectedFilter('out_of_stock');
              setVisibleCount(40);
            }}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap flex items-center gap-1 transition ${
              selectedFilter === 'out_of_stock'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40'
                : 'bg-slate-800 text-rose-400 hover:bg-slate-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Agotados ({outOfStockCount})
          </button>

          <button
            onClick={() => {
              setSelectedFilter('low_stock');
              setVisibleCount(40);
            }}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap flex items-center gap-1 transition ${
              selectedFilter === 'low_stock'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-900/40'
                : 'bg-slate-800 text-amber-400 hover:bg-slate-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Bajo Stock ({lowStockCount})
          </button>
        </div>

        {/* Category Horizontal Filter Bar */}
        {categoriesList.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 flex-shrink-0 mr-1">
                <Layers className="w-3 h-3 text-slate-400" />
                Cat:
              </span>

              <button
                onClick={() => {
                  setSelectedCategory('ALL');
                  setVisibleCount(40);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition ${
                  selectedCategory === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800'
                }`}
              >
                Todas
              </button>

              {categoriesList.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setVisibleCount(40);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Product List */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-xs font-semibold">Cargando catálogo de productos...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 space-y-3">
          <Package className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="font-bold text-slate-200 text-xs">No se encontraron productos coincidentes</p>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white shadow"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar este producto</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedProducts.map((prod) => {
            const stock = parseFloat(String(prod.stock_actual)) || 0;
            const minStock = parseFloat(String(prod.stock_minimo)) || 0;
            const priceUSD = parseFloat(String(prod.precio_detalle_usd)) || 0;
            const priceVES = priceUSD * tasaCobro;
            const costUSD = parseFloat(String(prod.precio_costo_usd)) || 0;
            const isGenerating = generatingAiId === prod.id;
            const isGranel = !!prod.a_granel;

            return (
              <div
                key={prod.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md space-y-3 transition hover:border-slate-700"
              >
                {/* Main Card Content */}
                <div className="flex gap-3 items-start">
                  {/* Product Image Thumbnail & IA Trigger */}
                  <div 
                    className="w-16 h-16 rounded-xl bg-slate-800 flex-shrink-0 relative overflow-hidden border border-slate-700/60 flex items-center justify-center cursor-pointer group"
                    onClick={() => handleOpenEditModal(prod)}
                    title="Ver ficha técnica"
                  >
                    <div className="text-center p-1">
                      <ImageIcon className="w-5 h-5 text-slate-500 mx-auto" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateAiImage(prod);
                        }}
                        disabled={isGenerating}
                        className="mt-0.5 text-[8px] bg-blue-600/80 hover:bg-blue-500 text-white font-bold px-1 rounded block"
                        title="Generar imagen con IA"
                      >
                        {isGenerating ? '...' : '+IA'}
                      </button>
                    </div>
                    {prod.imagen_url && (
                      <img
                        src={formatImageUrl(prod.imagen_url)}
                        alt={prod.description}
                        className="w-full h-full object-cover absolute inset-0 bg-slate-900"
                        loading="lazy"
                        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                      />
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono font-bold">
                        {prod.barcode || 'S/C'}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {prod.category || 'General'}
                      </span>
                      {isGranel && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Granel
                        </span>
                      )}
                      {prod.estado === 'Inactivo' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Inactivo
                        </span>
                      )}
                    </div>

                    <h3 
                      onClick={() => handleOpenEditModal(prod)}
                      className="font-bold text-xs text-white line-clamp-2 leading-tight cursor-pointer hover:text-blue-400 transition"
                    >
                      {prod.description}
                    </h3>

                    {/* Prices */}
                    <div className="flex items-center justify-between mt-1.5">
                      <div>
                        <span className="font-extrabold text-emerald-400 text-sm font-mono">
                          ${priceUSD.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">
                          ({priceVES.toFixed(2)} Bs)
                        </span>
                      </div>

                      {/* Stock Badge - Clickable to quickly adjust stock */}
                      <button
                        type="button"
                        onClick={() => handleOpenStockModal(prod)}
                        className={`text-[10px] font-black px-2.5 py-1 rounded-xl border flex items-center gap-1 transition active:scale-95 ${
                          stock <= 0
                            ? 'bg-rose-950/80 text-rose-300 border-rose-800 hover:bg-rose-900'
                            : stock <= minStock && minStock > 0
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800 hover:bg-amber-900'
                            : 'bg-emerald-950/80 text-emerald-300 border-emerald-800 hover:bg-emerald-900'
                        }`}
                        title="Toca para ajustar stock"
                      >
                        <span>{stock} {isGranel ? 'kg' : (stock === 1 ? 'ud' : 'uds')}</span>
                        <span className="text-[9px] opacity-70">±</span>
                      </button>
                    </div>

                    {/* Cost & Wholesale */}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                      <span>Costo: <strong className="text-slate-300">${costUSD.toFixed(2)}</strong></span>
                      <span>Mayor: <strong className="text-slate-300">${parseFloat(String(prod.precio_mayor_usd || 0)).toFixed(2)}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons Bar */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(prod)}
                    className="flex-1 py-2 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Ficha Técnica</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenStockModal(prod)}
                    className="flex-1 py-2 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ajustar Stock</span>
                  </button>

                  {!prod.imagen_url && (
                    <button
                      type="button"
                      onClick={() => handleGenerateAiImage(prod)}
                      disabled={isGenerating}
                      className="py-2 px-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-bold flex items-center justify-center transition active:scale-95 disabled:opacity-50"
                      title="Generar imagen con IA"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Load More Button if there are more products */}
          {filtered.length > visibleCount && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount(prev => prev + 40)}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-blue-400 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow"
              >
                <ChevronDown className="w-4 h-4" />
                <span>Cargar más productos ({visibleCount} de {filtered.length})</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Action Button (FAB) for "+ Nuevo Producto" */}
      <button
        type="button"
        onClick={handleOpenCreateModal}
        className="fixed bottom-16 right-4 z-40 w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white shadow-2xl shadow-blue-900/60 border border-blue-400/40 flex items-center justify-center transition active:scale-90"
        title="Crear Nuevo Producto"
      >
        <Plus className="w-7 h-7 stroke-[2.5]" />
      </button>

      {/* Mobile Product Modal (Crear / Modificar Ficha Técnica) */}
      <MobileProductModal
        isOpen={isProductModalOpen}
        productToEdit={productToEdit}
        categories={categoriesList}
        tasaCobro={tasaCobro}
        onClose={() => {
          setIsProductModalOpen(false);
          setProductToEdit(null);
        }}
        onSaved={handleProductSaved}
        onDeleted={handleProductDeleted}
      />

      {/* Mobile Stock Modal (Ajuste Rápido de Stock) */}
      <MobileStockModal
        isOpen={isStockModalOpen}
        product={productForStock}
        currentUser={currentUser}
        onClose={() => {
          setIsStockModalOpen(false);
          setProductForStock(null);
        }}
        onStockUpdated={handleStockUpdated}
      />

      {/* Mobile Carga Factura Modal (Cargar Productos por Factura) */}
      <MobileCargaFacturaModal
        isOpen={isCargaFacturaOpen}
        onClose={() => {
          setIsCargaFacturaOpen(false);
          checkPausedInvoice();
        }}
        onInvoiceProcessed={() => {
          setIsCargaFacturaOpen(false);
          checkPausedInvoice();
          fetchInventory();
          showToast('¡Factura procesada con éxito e inventario actualizado!');
        }}
        tasaDia={tasaCobro}
        existingProducts={products}
        categories={categoriesList}
      />
    </div>
  );
}
