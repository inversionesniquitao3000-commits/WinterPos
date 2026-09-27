import { useState, useEffect, useMemo } from 'react';
import { 
  Gift, 
  Search, 
  Plus, 
  Trash2, 
  X, 
  Save, 
  Boxes, 
  RefreshCw,
  HelpCircle,
  ChevronDown,
  Info,
  Package,
  ShoppingCart,
  CheckCircle2
} from 'lucide-react';
import { Product } from '../types';
import { getApiBaseUrl, formatImageUrl } from '../utils';

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
  onSavedSuccess?: (updatedProduct?: any) => void;
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
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [comboPvp, setComboPvp] = useState<string>('');
  const [updateCostWithRecipe, setUpdateCostWithRecipe] = useState<boolean>(true);

  // Cerrar modal con la tecla Escape (compatible con Web y Desktop Electron)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && padreProduct) {
      fetchComboRecipe();
      setComboPvp(padreProduct.precio_detalle_usd ? padreProduct.precio_detalle_usd.toString() : '');
      setUpdateCostWithRecipe(true);
      setShowHelp(false);
    } else {
      setRecipeItems([]);
      setComboPvp('');
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
      // Excluir a sí mismo y productos que ya sean combos (no se permite anidar combos)
      if (p.id === padreProduct.id) return false;
      if (p.es_combo) return false;
      const matchSearch = 
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [allProducts, padreProduct, searchQuery]);

  const handleAddChildItem = (childProd: Product) => {
    // Verificar si ya está en la receta
    if (recipeItems.some(i => i.producto_hijo_id === childProd.id)) {
      showAlert(`El producto "${childProd.description}" ya está agregado a la receta del combo.`, 'Producto Repetido', 'warning');
      return;
    }
    // Verificar si el hijo es un combo
    if (childProd.es_combo) {
      showAlert(`No se permite anidar combos. "${childProd.description}" ya es un Combo.`, 'Anidación No Permitida', 'warning');
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
      showAlert('Debes agregar al menos 1 producto componente a la receta del combo.', 'Combo Vacío', 'warning');
      return;
    }

    const parsedPvpNum = parseFloat(comboPvp);
    const validPvp = (!isNaN(parsedPvpNum) && parsedPvpNum > 0) ? parsedPvpNum : padreProduct.precio_detalle_usd;

    setSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/combos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          padreId: padreProduct.id,
          barcode: padreProduct.barcode,
          parentProduct: padreProduct,
          items: recipeItems.map(i => ({
            producto_hijo_id: i.producto_hijo_id,
            cantidad: i.cantidad
          })),
          pvpUSD: validPvp,
          updateCost: updateCostWithRecipe
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
        const finalCost = data.totalCostoReceta !== undefined ? data.totalCostoReceta : totalComponentCostUSD;
        showAlert(
          `Combo "${padreProduct.description}" guardado exitosamente con ${recipeItems.length} componente(s).\n\n• Costo Receta: $${finalCost.toFixed(2)}\n• PVP Combo: $${validPvp.toFixed(2)} (${(validPvp * tasaDia).toFixed(2)} Bs)`,
          'Combo Guardado con Éxito',
          'success'
        );
        if (onSavedSuccess) {
          onSavedSuccess(data.updatedProduct || {
            ...padreProduct,
            es_combo: true,
            precio_costo_usd: updateCostWithRecipe ? finalCost : padreProduct.precio_costo_usd,
            precio_detalle_usd: validPvp
          });
        }
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
    if (!window.confirm(`¿Estás seguro de disolver el combo "${padreProduct.description}"?\n\nEl producto volverá a ser un ítem normal y ya no descontará componentes de la receta al venderse.`)) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/combos/${padreProduct.id}?barcode=${encodeURIComponent(padreProduct.barcode)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showAlert(`El combo "${padreProduct.description}" ha sido disuelto correctamente. El producto volvió a ser un ítem individual normal.`, 'Combo Disuelto', 'success');
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
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden font-sans">
        
        {/* HEADER */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-purple-800/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 sm:p-3 bg-purple-500/20 border border-purple-400/30 rounded-2xl flex-shrink-0">
              <Gift className="w-6 h-6 sm:w-7 sm:h-7 text-purple-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-white font-sans">
                  Armar Combo / Receta Promocional
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-purple-500/30 text-purple-200 rounded-full border border-purple-400/30 font-sans">
                  Receta de Componentes
                </span>
              </div>
              <p className="text-xs text-purple-200 mt-0.5 font-sans truncate">
                Producto Combo: <strong className="text-white font-bold">{padreProduct.description}</strong>
                <span className="ml-2 font-mono text-purple-300">(Cód: {padreProduct.barcode})</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Cerrar modal (ESC)"
            className="p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-all cursor-pointer flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 font-sans">

          {/* BOTÓN TOGGLE GUÍA DE AYUDA DIDÁCTICA */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowHelp(prev => !prev)}
              className="flex items-center gap-2 text-xs font-bold text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100/80 px-3.5 py-1.5 rounded-xl border border-purple-200/80 transition-all cursor-pointer shadow-2xs"
            >
              <HelpCircle className="w-4 h-4 text-purple-600" />
              <span>{showHelp ? 'Ocultar Guía de Ayuda' : '¿Cómo crear un Combo y qué pasa cuando se vende?'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showHelp ? 'rotate-180' : ''}`} />
            </button>

            {recipeItems.length > 0 && (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 font-sans">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {recipeItems.length} componente(s) en receta
              </span>
            )}
          </div>

          {/* PANEL DE GUÍA DIDÁCTICA */}
          {showHelp && (
            <div className="bg-gradient-to-br from-purple-50/80 via-indigo-50/40 to-slate-50 border border-purple-200/80 rounded-2xl p-4 sm:p-5 text-slate-800 space-y-4 animate-in fade-in duration-200 shadow-sm font-sans">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-100 rounded-xl flex-shrink-0 mt-0.5">
                  <Info className="w-5 h-5 text-purple-700" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-extrabold text-purple-950 text-sm font-sans">
                    ¿Qué es un Combo y cómo funciona el Costo, Precio e Inventario?
                  </h4>
                  <p className="text-xs text-slate-700 leading-relaxed font-sans">
                    Un Combo o Receta Promocional agrupa varios productos individuales de tu catálogo en una sola oferta comercial (ej: <em>«1 Botella de Anís + 1 Gatorade»</em>, <em>«Cesta de Víveres»</em> o <em>«Combo Desayuno»</em>).
                  </p>
                </div>
              </div>

              {/* 3 PASOS PARA CREARLO */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white border border-purple-100 rounded-xl p-3 shadow-2xs">
                  <span className="font-bold text-xs text-purple-950 flex items-center gap-1.5 mb-1 font-sans">
                    <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                    Crea el Producto Combo
                  </span>
                  <p className="text-[11px] text-slate-600 leading-normal font-sans">
                    Crea un producto normal en tu catálogo (ej: <strong>«{padreProduct.description}»</strong>). Este es el producto que el cajero buscará o escaneará en caja.
                  </p>
                </div>

                <div className="bg-white border border-purple-100 rounded-xl p-3 shadow-2xs">
                  <span className="font-bold text-xs text-purple-950 flex items-center gap-1.5 mb-1 font-sans">
                    <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-black">2</span>
                    Agrega los Componentes
                  </span>
                  <p className="text-[11px] text-slate-600 leading-normal font-sans">
                    En la columna derecha («Agregar Componente»), busca los productos que incluye el combo y presiona el botón <span className="font-bold text-purple-700">+</span>.
                  </p>
                </div>

                <div className="bg-white border border-purple-100 rounded-xl p-3 shadow-2xs">
                  <span className="font-bold text-xs text-purple-950 flex items-center gap-1.5 mb-1 font-sans">
                    <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-black">3</span>
                    Define Costo y PVP
                  </span>
                  <p className="text-[11px] text-slate-600 leading-normal font-sans">
                    El sistema suma automáticamente el costo de las partes. Tú fijas el PVP de venta (puedes usar la suma o dar un precio de oferta promocional).
                  </p>
                </div>
              </div>

              {/* ¿DE DÓNDE SALE EL COSTO Y EL PRECIO? */}
              <div className="bg-purple-100/60 border border-purple-200/80 rounded-xl p-3.5 space-y-2">
                <span className="font-bold text-xs text-purple-950 flex items-center gap-1.5 uppercase tracking-wide">
                  💰 ¿De dónde sale el Costo y el Precio de Venta (PVP)?
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                  <div className="bg-white p-2.5 rounded-lg border border-purple-100 space-y-1">
                    <span className="font-bold text-emerald-800 block text-[11.5px]">Costo del Combo:</span>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      El sistema <strong>suma automáticamente el costo de compra</strong> de cada componente (ej: Costo Anís $5.00 + Costo Gatorade $1.00 = <strong>Costo Total $6.00</strong>). Al guardar, este valor se asigna como costo oficial del combo para reportes de rentabilidad.
                    </p>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-purple-100 space-y-1">
                    <span className="font-bold text-purple-900 block text-[11.5px]">Precio de Venta (PVP):</span>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Tú decides el precio final: puedes venderlo a la suma de las partes ($9.00) usando el botón <em>«Copiar Suma»</em>, o fijar un precio de oferta más atractivo (ej: <strong>$8.00</strong>). El sistema te muestra el ahorro del cliente y tu margen.
                    </p>
                  </div>
                </div>
              </div>

              {/* EXPLICACIÓN DEL PROCESO DE VENTA EN CAJA */}
              <div className="bg-white border border-indigo-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-950 uppercase tracking-wide font-sans">
                  <ShoppingCart className="w-4 h-4 text-indigo-600" />
                  <span>¿Cómo ocurre el proceso de venta de este Combo en Caja POS?</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700 pt-1 font-sans">
                  <div className="space-y-1">
                    <span className="font-bold text-slate-900 flex items-center gap-1 text-[11.5px]">
                      ⚡ Descuento automático en cascada:
                    </span>
                    <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                      El producto Combo <strong>no necesita tener stock físico propio</strong> en anaquel. Cuando el cajero lo cobra en caja, el sistema descuenta automáticamente las unidades de <strong>cada uno de sus componentes</strong> individuales del inventario.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-900 flex items-center gap-1 text-[11.5px]">
                      📊 Control de existencias y Kardex:
                    </span>
                    <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                      El stock máximo que se puede vender del combo dependerá de las partes que tengas disponibles. En el Kardex de cada componente quedará registrado el movimiento por venta de combo.
                    </p>
                  </div>
                </div>
              </div>

              {/* EJEMPLO PRÁCTICO */}
              <div className="bg-white/90 border border-purple-200 rounded-xl p-3 text-xs text-slate-700 flex items-center gap-2.5 font-sans">
                <span className="text-base">💡</span>
                <span className="font-sans">
                  <strong>Ejemplo:</strong> Creas el combo <em>«Anís + Gatorade»</em> compuesto por <strong>1 Botella Anís + 1 Gatorade</strong>. Al vender 1 combo por $8.00, tu inventario descuenta en tiempo real <strong>1 Anís</strong> y <strong>1 Gatorade</strong> sin descuadrar nada.
                </span>
              </div>
            </div>
          )}

          {/* RESUMEN FINANCIERO Y CONFIGURACIÓN DE PRECIOS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 font-sans">
            
            {/* CARD 1: PVP DEL COMBO (EDITABLE) */}
            <div className="bg-slate-50 border-2 border-purple-300/80 p-3.5 rounded-2xl shadow-2xs relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-900 font-sans">PVP de Venta Combo ($):</span>
                {totalComponentDetailUSD > 0 && (
                  <button
                    type="button"
                    onClick={() => setComboPvp(totalComponentDetailUSD.toFixed(2))}
                    className="text-[10px] font-bold text-purple-700 hover:text-purple-900 hover:underline cursor-pointer flex items-center gap-0.5"
                    title="Asignar automáticamente la suma de PVP de los componentes"
                  >
                    ⚡ Copiar Suma
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black text-slate-700 font-mono">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={comboPvp}
                  onChange={(e) => setComboPvp(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-xl font-black text-slate-900 font-mono bg-white border border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200 rounded-xl px-2.5 py-1 outline-hidden"
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1.5">
                <span>{((parseFloat(comboPvp) || 0) * tasaDia).toFixed(2)} Bs</span>
                {parseFloat(comboPvp) > 0 && totalComponentDetailUSD > 0 && parseFloat(comboPvp) < totalComponentDetailUSD && (
                  <span className="text-emerald-700 font-bold font-sans">
                    Promo: -${(totalComponentDetailUSD - parseFloat(comboPvp)).toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            {/* CARD 2: SUMA PVP COMPONENTES */}
            <div className="bg-purple-50/70 border border-purple-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 font-sans">Suma PVP Componentes ($):</span>
              <div className="text-xl font-black text-purple-900 font-mono mt-0.5">
                ${totalComponentDetailUSD.toFixed(2)}
              </div>
              <span className="text-[10px] text-purple-700 font-medium font-sans">
                {parseFloat(comboPvp) > 0 && parseFloat(comboPvp) < totalComponentDetailUSD 
                  ? `🔥 Ahorro al cliente: $${(totalComponentDetailUSD - parseFloat(comboPvp)).toFixed(2)}` 
                  : 'Suma de partes por separado'}
              </span>
            </div>

            {/* CARD 3: COSTO TOTAL RECETA */}
            <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 font-sans">Costo Total Receta ($):</span>
              <div className="text-xl font-black text-emerald-900 font-mono mt-0.5">
                ${totalComponentCostUSD.toFixed(2)}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-emerald-700 font-medium font-sans">
                  Margen: ${ ((parseFloat(comboPvp) || 0) - totalComponentCostUSD).toFixed(2) }
                </span>
                <label className="flex items-center gap-1 text-[10px] text-emerald-900 font-bold cursor-pointer select-none" title="Al guardar, actualizar el costo del producto con la suma de la receta">
                  <input
                    type="checkbox"
                    checked={updateCostWithRecipe}
                    onChange={(e) => setUpdateCostWithRecipe(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-3 h-3 cursor-pointer"
                  />
                  <span>Actualizar costo</span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6 font-sans">

            {/* COLUMNA IZQUIERDA: COMPONENTES AGREGADOS */}
            <div className="md:col-span-7 space-y-3 font-sans">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-bold uppercase text-slate-800 flex items-center gap-1.5 font-sans">
                  <Boxes className="w-4 h-4 text-purple-600" />
                  Componentes del Combo ({recipeItems.length})
                </h4>
                <span className="text-[10px] text-slate-400 font-medium font-sans">Sin combos anidados</span>
              </div>

              {loading ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-600 mx-auto" />
                  <p className="text-xs font-medium font-sans">Cargando componentes de la receta...</p>
                </div>
              ) : recipeItems.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 space-y-2 bg-slate-50/50 font-sans">
                  <Gift className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-600 font-sans">Aún no has agregado componentes a este combo.</p>
                  <p className="text-[11px] text-slate-400 font-sans">Selecciona productos del catálogo a la derecha para incluirlos.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1 font-sans">
                  {recipeItems.map((item) => (
                    <div
                      key={item.producto_hijo_id}
                      className="p-3 bg-white border border-slate-200 hover:border-purple-300 rounded-2xl flex items-center justify-between gap-3 shadow-2xs transition-all font-sans"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-100 flex-shrink-0 flex items-center justify-center">
                          <Package className="w-4 h-4 text-purple-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-slate-900 truncate font-sans">{item.descripcion}</div>
                          <div className="text-[10.5px] text-slate-500 font-mono mt-0.5">
                            Cód: {item.barcode} | Stock: <strong className="text-slate-800">{item.stock_actual}</strong> | PVP: ${item.precio_detalle_usd?.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 rounded-xl px-2 py-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase font-sans">Cant:</span>
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={item.cantidad}
                            onChange={(e) => handleUpdateQty(item.producto_hijo_id, e.target.value)}
                            className="w-14 bg-white border border-slate-300 rounded-md text-center text-xs font-mono font-bold focus:ring-1 focus:ring-purple-500 focus:outline-none"
                          />
                        </div>

                        <button
                          type="button"
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

            {/* COLUMNA DERECHA: BUSCADOR DE PRODUCTOS DEL CATÁLOGO */}
            <div className="md:col-span-5 space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 font-sans">
              <h4 className="text-xs font-bold uppercase text-slate-800 flex items-center gap-1.5 font-sans">
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
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none font-sans"
                />
              </div>

              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 font-sans">
                {candidateProducts.slice(0, 25).map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => handleAddChildItem(prod)}
                    className="p-2.5 bg-white border border-slate-200 hover:border-purple-400 rounded-xl flex items-center justify-between cursor-pointer hover:shadow-2xs transition-all group font-sans"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex-shrink-0 overflow-hidden flex items-center justify-center p-0.5">
                        {prod.imagen_url ? (
                          <img src={formatImageUrl(prod.imagen_url)} alt={prod.description} className="w-full h-full object-contain" />
                        ) : (
                          <Package className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 group-hover:text-purple-700 truncate font-sans">
                          {prod.description}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Cód: {prod.barcode} | <span className="font-bold text-slate-700 font-sans">Stock: {prod.stock_actual}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="p-1 text-purple-600 bg-purple-50 group-hover:bg-purple-600 group-hover:text-white rounded-lg transition-all flex-shrink-0"
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
        <div className="bg-slate-50 border-t border-slate-200 p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 font-sans">
          <div className="text-xs text-slate-600 flex items-center gap-1.5 text-center sm:text-left">
            <span className="text-base">💡</span>
            <span>Al vender este combo en caja, se descontará automáticamente el stock de cada componente.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {(padreProduct.es_combo || recipeItems.length > 0) && (
              <button
                type="button"
                onClick={handleDeleteCombo}
                disabled={saving}
                className="px-3 py-2 text-xs font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-2xs mr-auto sm:mr-0 font-sans"
                title="Eliminar la receta y disolver este combo"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Disolver Combo
              </button>
            )}
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-200 hover:bg-slate-300 rounded-xl transition-all cursor-pointer font-sans"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveCombo}
              disabled={saving}
              className="px-5 py-2 text-xs font-extrabold uppercase tracking-wider text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer font-sans active:scale-98"
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
