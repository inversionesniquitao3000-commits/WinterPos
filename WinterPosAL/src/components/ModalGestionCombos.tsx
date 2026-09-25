import { useState, useEffect, useMemo } from 'react';
import { 
  Gift, 
  Search, 
  Plus, 
  Trash2, 
  X, 
  Save, 
  AlertTriangle, 
  Boxes, 
  RefreshCw 
} from 'lucide-react';
import { Product } from '../types';
import { getApiBaseUrl } from '../utils';

interface ComboRecipeItem {
  id?: number;
  producto_hijo_id: number;
  cantidad: number;
  barcode?: string;
  descripcion?: string;
  precio_costo_usd?: number;
  precio_detalle_usd?: number;
  stock_actual?: number;
  es_combo?: boolean;
}

interface ModalGestionCombosProps {
  isOpen: boolean;
  onClose: () => void;
  padreProduct: Product | null;
  allProducts: Product[];
  tasaDia: number;
  onSavedSuccess?: () => void;
  showAlert: (msg: string, title?: string, type?: 'info' | 'warning' | 'error' | 'success') => void;
}

export default function ModalGestionCombos({
  isOpen,
  onClose,
  padreProduct,
  allProducts,
  tasaDia,
  onSavedSuccess,
  showAlert
}: ModalGestionCombosProps) {
  const [recipeItems, setRecipeItems] = useState<ComboRecipeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (isOpen && padreProduct) {
      fetchComboRecipe();
    } else {
      setRecipeItems([]);
    }
  }, [isOpen, padreProduct]);

  const fetchComboRecipe = async () => {
    if (!padreProduct) return;
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/combos?padreId=${padreProduct.id}`);
      if (!res.ok) {
        console.error(`HTTP error loading combo: ${res.status}`);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecipeItems(data.map(item => ({
          id: item.id,
          producto_hijo_id: item.producto_hijo_id,
          cantidad: parseFloat(item.cantidad || 1),
          barcode: item.barcode,
          descripcion: item.descripcion,
          precio_costo_usd: item.precio_costo_usd,
          precio_detalle_usd: item.precio_detalle_usd,
          stock_actual: item.stock_actual,
          es_combo: item.es_combo
        })));
      }
    } catch (err: any) {
      console.error('Error cargando receta del combo:', err);
    } finally {
      setLoading(false);
    }
  };

  const candidateProducts = useMemo(() => {
    if (!padreProduct) return [];
    return allProducts.filter(p => {
      // Exclude self and products that are already combos (Pilar #3: No nested combos)
      if (p.id === padreProduct.id) return false;
      if (p.es_combo) return false;
      const matchSearch = 
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [allProducts, padreProduct, searchQuery]);

  const handleAddChildItem = (childProd: Product) => {
    // Check if already in recipe
    if (recipeItems.some(i => i.producto_hijo_id === childProd.id)) {
      showAlert(`El producto "${childProd.description}" ya está en la receta del combo.`, 'Producto Repetido', 'warning');
      return;
    }
    // Check if child is a combo
    if (childProd.es_combo) {
      showAlert(`Pilar de Seguridad #3: No se permite anidar combos. "${childProd.description}" ya es un Combo.`, 'Anidación Prohibida', 'warning');
      return;
    }

    setRecipeItems(prev => [
      ...prev,
      {
        producto_hijo_id: childProd.id,
        cantidad: 1,
        barcode: childProd.barcode,
        descripcion: childProd.description,
        precio_costo_usd: childProd.precio_costo_usd,
        precio_detalle_usd: childProd.precio_detalle_usd,
        stock_actual: childProd.stock_actual,
        es_combo: false
      }
    ]);
  };

  const handleUpdateQty = (hijoId: number, qtyStr: string) => {
    const qty = Math.max(0.001, parseFloat(qtyStr) || 1);
    setRecipeItems(prev => prev.map(i => i.producto_hijo_id === hijoId ? { ...i, cantidad: qty } : i));
  };

  const handleRemoveChildItem = (hijoId: number) => {
    setRecipeItems(prev => prev.filter(i => i.producto_hijo_id !== hijoId));
  };

  const totalComponentCostUSD = useMemo(() => {
    return recipeItems.reduce((acc, item) => acc + ((item.precio_costo_usd || 0) * item.cantidad), 0);
  }, [recipeItems]);

  const totalComponentDetailUSD = useMemo(() => {
    return recipeItems.reduce((acc, item) => acc + ((item.precio_detalle_usd || 0) * item.cantidad), 0);
  }, [recipeItems]);

  const handleSaveCombo = async () => {
    if (!padreProduct) return;
    if (recipeItems.length === 0) {
      showAlert('Debes agregar al menos 1 producto hijo a la receta del combo.', 'Combo Vacío', 'warning');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/combos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          padreId: padreProduct.id,
          items: recipeItems.map(i => ({
            producto_hijo_id: i.producto_hijo_id,
            cantidad: i.cantidad
          }))
        })
      });

      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch (_) {
        throw new Error(`Respuesta inválida del servidor (${res.status}): ${resText || 'Sin respuesta'}`);
      }

      if (res.ok && data.success) {
        showAlert(`Combo "${padreProduct.description}" guardado exitosamente con ${recipeItems.length} componentes.`, 'Combo Guardado', 'success');
        if (onSavedSuccess) onSavedSuccess();
        onClose();
      } else {
        throw new Error(data.error || `Error ${res.status} al guardar la receta del combo`);
      }
    } catch (err: any) {
      console.error('Error al guardar combo:', err);
      showAlert(`Error: ${err.message}`, 'Falló Guardar Combo', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCombo = async () => {
    if (!padreProduct) return;
    if (!window.confirm(`¿Estás seguro de disolver el combo "${padreProduct.description}"?\n\nEl producto volverá a ser un ítem normal y ya no descontará componentes de la receta.`)) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/combos/${padreProduct.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showAlert(`El combo "${padreProduct.description}" ha sido disuelto correctamente. El producto volvió a ser un ítem normal.`, 'Combo Disuelto', 'success');
        if (onSavedSuccess) onSavedSuccess();
        onClose();
      } else {
        throw new Error(data.error || 'No se pudo disolver el combo');
      }
    } catch (err: any) {
      console.error('Error al eliminar combo:', err);
      showAlert(`Error: ${err.message}`, 'Falló Disolver Combo', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !padreProduct) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* HEADER */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/20 border border-purple-400/30 rounded-2xl backdrop-blur-md">
              <Gift className="w-7 h-7 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight text-white font-mono">
                  Armar Combo / Receta Promocional
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-purple-500/30 text-purple-200 rounded-full border border-purple-400/30">
                  Pilar #3 Validado
                </span>
              </div>
              <p className="text-xs text-purple-200 mt-0.5">
                Producto Combo: <strong className="text-white font-bold">{padreProduct.description}</strong> (Código: {padreProduct.barcode})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* FINANCIAL SUMMARY OF RECIPE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PVP Actual Combo ($):</span>
              <div className="text-xl font-black text-slate-900 font-mono mt-0.5">
                ${padreProduct.precio_detalle_usd.toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500">{(padreProduct.precio_detalle_usd * tasaDia).toFixed(2)} Bs</span>
            </div>

            <div className="bg-purple-50/70 border border-purple-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Suma PVP Componentes ($):</span>
              <div className="text-xl font-black text-purple-900 font-mono mt-0.5">
                ${totalComponentDetailUSD.toFixed(2)}
              </div>
              <span className="text-[10px] text-purple-600 font-medium">
                {padreProduct.precio_detalle_usd < totalComponentDetailUSD 
                  ? `🔥 Ahorro al cliente: $${(totalComponentDetailUSD - padreProduct.precio_detalle_usd).toFixed(2)}` 
                  : 'Precio individual de partes'}
              </span>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Costo Total Receta ($):</span>
              <div className="text-xl font-black text-emerald-900 font-mono mt-0.5">
                ${totalComponentCostUSD.toFixed(2)}
              </div>
              <span className="text-[10px] text-emerald-700 font-medium">
                Margen estimado: ${ (padreProduct.precio_detalle_usd - totalComponentCostUSD).toFixed(2) }
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

            {/* LEFT COLUMN: SELECTED COMPONENT ITEMS */}
            <div className="md:col-span-7 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-black uppercase text-slate-700 flex items-center gap-1.5 font-mono">
                  <Boxes className="w-4 h-4 text-purple-600" />
                  Componentes del Combo ({recipeItems.length})
                </h4>
                <span className="text-[10px] text-slate-400 font-medium">Sin combos anidados</span>
              </div>

              {loading ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-600 mx-auto" />
                  <p className="text-xs font-medium">Cargando componentes de la receta...</p>
                </div>
              ) : recipeItems.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 space-y-2 bg-slate-50/50">
                  <Gift className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-600">Aún no has agregado componentes a este combo.</p>
                  <p className="text-[11px] text-slate-400">Selecciona productos del catálogo a la derecha para incluirlos.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                  {recipeItems.map((item) => (
                    <div
                      key={item.producto_hijo_id}
                      className="p-3 bg-white border border-slate-200 hover:border-purple-300 rounded-2xl flex items-center justify-between gap-3 shadow-2xs transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-slate-900 truncate">{item.descripcion}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Cod: {item.barcode} | Stock: <strong className="text-slate-700">{item.stock_actual}</strong> | Costo: ${item.precio_costo_usd?.toFixed(2)} | PVP: ${item.precio_detalle_usd?.toFixed(2)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 rounded-xl px-2 py-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Cant:</span>
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={item.cantidad}
                            onChange={(e) => handleUpdateQty(item.producto_hijo_id, e.target.value)}
                            className="w-16 bg-white border border-slate-300 rounded-md text-center text-xs font-mono font-black focus:ring-1 focus:ring-purple-500 focus:outline-none"
                          />
                        </div>

                        <button
                          onClick={() => handleRemoveChildItem(item.producto_hijo_id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                          title="Eliminar de la receta"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: CATALOG SEARCH TO ADD SUB-PRODUCTS */}
            <div className="md:col-span-5 space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <h4 className="text-xs font-black uppercase text-slate-700 flex items-center gap-1.5 font-mono">
                <Plus className="w-4 h-4 text-indigo-600" />
                Agregar Componente
              </h4>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar producto para combo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {candidateProducts.slice(0, 20).map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => handleAddChildItem(prod)}
                    className="p-2.5 bg-white border border-slate-200 hover:border-purple-400 rounded-xl flex items-center justify-between cursor-pointer hover:shadow-2xs transition-all group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold text-slate-800 group-hover:text-purple-700 truncate">
                        {prod.description}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Cod: {prod.barcode} | PVP: ${prod.precio_detalle_usd.toFixed(2)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="p-1 text-purple-600 bg-purple-50 group-hover:bg-purple-600 group-hover:text-white rounded-lg transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* FOOTER */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>La venta de este combo descontará automáticamente el stock de sus componentes.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {(padreProduct.es_combo || recipeItems.length > 0) && (
              <button
                type="button"
                onClick={handleDeleteCombo}
                disabled={saving}
                className="px-3 py-2 text-xs font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-2xs mr-auto sm:mr-0"
                title="Eliminar la receta y disolver este combo"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Disolver Combo
              </button>
            )}
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-200 hover:bg-slate-300 rounded-xl transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveCombo}
              disabled={saving}
              className="px-5 py-2 text-xs font-black uppercase tracking-wider text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar Receta Combo
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
