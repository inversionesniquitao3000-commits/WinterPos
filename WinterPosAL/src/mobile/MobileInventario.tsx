import { useState, useEffect } from 'react';
import { 
  Package, Search, AlertTriangle, Sparkles, RefreshCw, 
  Image as ImageIcon, X
} from 'lucide-react';

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
  imagen_url?: string;
  exento_impuesto?: boolean;
}

export default function MobileInventario() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'out_of_stock' | 'low_stock'>('all');
  const [generatingAiId, setGeneratingAiId] = useState<number | null>(null);
  const [tasaCobro, setTasaCobro] = useState(36.5);

  const fetchInventory = async () => {
    try {
      const [resProd, resTasas] = await Promise.all([
        fetch('/api/productos'),
        fetch('/api/tasas')
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleGenerateAiImage = async (prod: ProductItem) => {
    setGeneratingAiId(prod.id);
    try {
      const res = await fetch('/api/ai/generate-product-image', {
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
      if (data.success && data.imageUrl) {
        // Update product image in backend and state
        const updated = { ...prod, imagen_url: data.imageUrl };
        await fetch(`/api/productos/${prod.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated)
        });
        setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, imagen_url: data.imageUrl } : p));
      }
    } catch (err) {
      console.error('Error generating AI image:', err);
    } finally {
      setGeneratingAiId(null);
    }
  };

  // Filtered list
  const filtered = products.filter(p => {
    const term = searchTerm.toLowerCase().trim();
    const desc = (p.description || '').toLowerCase();
    const code = (p.barcode || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();
    const matchSearch = !term || desc.includes(term) || code.includes(term) || cat.includes(term);

    const stock = parseFloat(String(p.stock_actual)) || 0;
    const minStock = parseFloat(String(p.stock_minimo)) || 0;

    if (!matchSearch) return false;

    if (selectedFilter === 'out_of_stock') return stock <= 0;
    if (selectedFilter === 'low_stock') return stock > 0 && stock <= minStock;
    return true;
  });

  const outOfStockCount = products.filter(p => (parseFloat(String(p.stock_actual)) || 0) <= 0).length;
  const lowStockCount = products.filter(p => {
    const s = parseFloat(String(p.stock_actual)) || 0;
    const min = parseFloat(String(p.stock_minimo)) || 0;
    return s > 0 && s <= min && min > 0;
  }).length;

  return (
    <div className="space-y-3 pb-20 pt-2 px-3">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <h2 className="text-base font-black text-white flex items-center gap-2 mb-1">
          <Package className="w-5 h-5 text-blue-400" />
          Consulta de Inventario Express
        </h2>
        <p className="text-xs text-slate-400">
          Precios, existencias y fotos de {products.length} productos
        </p>

        {/* Search Input */}
        <div className="relative mt-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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

        {/* Filter Pills */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
              selectedFilter === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Todos ({products.length})
          </button>

          <button
            onClick={() => setSelectedFilter('out_of_stock')}
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
            onClick={() => setSelectedFilter('low_stock')}
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
      </div>

      {/* Product List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-xs font-semibold">Cargando catálogo de productos...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
          <Package className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="font-bold text-slate-200 text-xs">No se encontraron productos coincidentes</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.slice(0, 40).map((prod) => {
            const stock = parseFloat(String(prod.stock_actual)) || 0;
            const minStock = parseFloat(String(prod.stock_minimo)) || 0;
            const priceUSD = parseFloat(String(prod.precio_detalle_usd)) || 0;
            const priceVES = priceUSD * tasaCobro;
            const costUSD = parseFloat(String(prod.precio_costo_usd)) || 0;
            const isGenerating = generatingAiId === prod.id;

            return (
              <div
                key={prod.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md flex gap-3 items-center"
              >
                {/* Product Image Thumbnail */}
                <div className="w-16 h-16 rounded-xl bg-slate-800 flex-shrink-0 relative overflow-hidden border border-slate-700/60 flex items-center justify-center">
                  <div className="text-center p-1">
                    <ImageIcon className="w-5 h-5 text-slate-500 mx-auto" />
                    <button
                      onClick={() => handleGenerateAiImage(prod)}
                      disabled={isGenerating}
                      className="mt-0.5 text-[8px] bg-blue-600/80 hover:bg-blue-500 text-white font-bold px-1 rounded block"
                      title="Generar imagen con IA"
                    >
                      {isGenerating ? '...' : '+IA'}
                    </button>
                  </div>
                  {prod.imagen_url && (
                    <img
                      src={prod.imagen_url}
                      alt={prod.description}
                      className="w-full h-full object-cover absolute inset-0 bg-slate-900"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                    />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono font-bold">
                      {prod.barcode || 'S/C'}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">
                      {prod.category || 'General'}
                    </span>
                  </div>

                  <h3 className="font-bold text-xs text-white truncate leading-tight">
                    {prod.description}
                  </h3>

                  {/* Prices & Stock */}
                  <div className="flex items-center justify-between mt-1.5">
                    <div>
                      <span className="font-extrabold text-emerald-400 text-sm font-mono">
                        ${priceUSD.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-1">
                        ({priceVES.toFixed(2)} Bs)
                      </span>
                    </div>

                    <div>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                          stock <= 0
                            ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                            : stock <= minStock && minStock > 0
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                            : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                        }`}
                      >
                        {stock} {stock === 1 ? 'ud' : 'uds'}
                      </span>
                    </div>
                  </div>

                  {/* Cost & Wholesale */}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 border-t border-slate-800/60 pt-1">
                    <span>Costo: <strong className="text-slate-300">${costUSD.toFixed(2)}</strong></span>
                    <span>Mayor: <strong className="text-slate-300">${parseFloat(String(prod.precio_mayor_usd || 0)).toFixed(2)}</strong></span>
                    {!prod.imagen_url ? (
                      <button
                        onClick={() => handleGenerateAiImage(prod)}
                        disabled={isGenerating}
                        className="ml-auto text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                      >
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        {isGenerating ? 'Generando...' : 'Generar Foto IA'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
