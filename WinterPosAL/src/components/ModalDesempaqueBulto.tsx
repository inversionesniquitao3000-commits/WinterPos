import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PackageCheck, 
  Boxes, 
  RefreshCw, 
  X, 
  Check,
  Sparkles,
  Search,
  HelpCircle,
  ChevronDown,
  Info,
  Package,
  CheckCircle2
} from 'lucide-react';
import { Product } from '../types';
import { getApiBaseUrl, formatImageUrl } from '../utils';

interface ModalDesempaqueBultoProps {
  isOpen: boolean;
  onClose: () => void;
  detalProduct: Product | null;
  allProducts: Product[];
  tasaDia: number;
  currentUser?: any;
  onSuccessUnpack?: () => void;
  showAlert: (msg: string, title?: string, type?: 'info' | 'warning' | 'error' | 'success') => void;
}

export default function ModalDesempaqueBulto({
  isOpen,
  onClose,
  detalProduct,
  allProducts,
  tasaDia,
  currentUser,
  onSuccessUnpack,
  showAlert
}: ModalDesempaqueBultoProps) {
  const [selectedBultoId, setSelectedBultoId] = useState<string>('');
  const [conversionFactor, setConversionFactor] = useState<string>('24');
  const [bultosToUnpack, setBultosToUnpack] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [savingLink, setSavingLink] = useState<boolean>(false);
  const [searchBultoQuery, setSearchBultoQuery] = useState<string>('');
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState<number>(-1);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [isChangingBulto, setIsChangingBulto] = useState<boolean>(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Cerrar dropdown de búsqueda al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cargar datos iniciales del producto
  useEffect(() => {
    if (isOpen && detalProduct) {
      const hasExistingBulto = Boolean(detalProduct.producto_bulto_padre_id);
      setSelectedBultoId(detalProduct.producto_bulto_padre_id ? String(detalProduct.producto_bulto_padre_id) : '');
      setConversionFactor(detalProduct.factor_conversion_bulto ? String(detalProduct.factor_conversion_bulto) : '24');
      setBultosToUnpack(1);
      setSearchBultoQuery('');
      setShowSearchDropdown(false);
      setIsChangingBulto(!hasExistingBulto);
      // Si el producto aún no tiene bulto configurado, desplegar la ayuda explicativa automáticamente
      setShowHelp(!hasExistingBulto);
    }
  }, [isOpen, detalProduct]);

  // Lista de candidatos a Bulto Padre filtrados por término de búsqueda
  const candidateBultoProducts = useMemo(() => {
    if (!detalProduct) return [];
    const q = searchBultoQuery.trim().toLowerCase();
    return allProducts.filter(p => {
      if (p.id === detalProduct.id) return false;
      if (p.es_combo) return false;
      if (!q) return true;
      const matchDesc = (p.description || '').toLowerCase().includes(q);
      const matchCode = (p.barcode || '').toLowerCase().includes(q);
      return matchDesc || matchCode;
    }).slice(0, 30); // Limitar a los 30 más relevantes para máxima fluidez
  }, [allProducts, detalProduct, searchBultoQuery]);

  const activeBultoProduct = useMemo(() => {
    if (!selectedBultoId) return null;
    return allProducts.find(p => p.id === Number(selectedBultoId)) || null;
  }, [allProducts, selectedBultoId]);

  const factorNum = Math.max(1, parseFloat(conversionFactor) || 24);
  const bultoCost = activeBultoProduct ? activeBultoProduct.precio_costo_usd : 0;
  const unitCostNewProrated = factorNum > 0 ? (bultoCost / factorNum) : 0;

  const handleSelectBulto = (bulto: Product) => {
    setSelectedBultoId(String(bulto.id));
    setSearchBultoQuery('');
    setShowSearchDropdown(false);
    setIsChangingBulto(false);
  };

  const handleSaveLink = async () => {
    if (!detalProduct) return;
    if (!selectedBultoId) {
      showAlert('Debes seleccionar el producto Bulto Padre antes de guardar el vínculo.', 'Selección Requerida', 'warning');
      return;
    }
    setSavingLink(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/inventory/link-bulto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detalId: detalProduct.id,
          bultoId: Number(selectedBultoId),
          factorConversion: factorNum
        })
      });
      const data = await res.json();
      if (data.success) {
        showAlert(`Vínculo guardado con éxito. Ahora 1 Bulto equivale a ${factorNum} unidades al detal.`, 'Vínculo Configurado', 'success');
        if (onSuccessUnpack) onSuccessUnpack();
      } else {
        throw new Error(data.error || 'Error al guardar el vínculo');
      }
    } catch (err: any) {
      showAlert(`Error: ${err.message}`, 'Error Guardando Vínculo', 'error');
    } finally {
      setSavingLink(false);
    }
  };

  const handleExecuteUnpack = async () => {
    if (!detalProduct || !activeBultoProduct) {
      showAlert('Debes vincular un Bulto Padre antes de desempacar.', 'Sin Vínculo', 'warning');
      return;
    }
    if ((activeBultoProduct.stock_actual || 0) < bultosToUnpack) {
      showAlert(`Stock insuficiente en el bulto "${activeBultoProduct.description}". Stock disponible: ${activeBultoProduct.stock_actual || 0} bultos.`, 'Stock Insuficiente', 'warning');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/inventory/unpack-bulto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detalId: detalProduct.id,
          bultoId: activeBultoProduct.id,
          cantidadBultos: bultosToUnpack,
          usuario: currentUser?.nombre || currentUser?.usuario || 'OPERADOR POS'
        })
      });
      const data = await res.json();
      if (data.success) {
        showAlert(`Se desempacaron ${bultosToUnpack} bulto(s) de "${activeBultoProduct.description}". Se sumaron +${data.detalQtyAdded} unidades al detal de "${detalProduct.description}".`, 'Desempaque Exitoso', 'success');
        if (onSuccessUnpack) onSuccessUnpack();
        onClose();
      } else {
        throw new Error(data.error || 'Error al ejecutar el desempaque');
      }
    } catch (err: any) {
      console.error('Error desempacando bulto:', err);
      showAlert(`Error en desempaque: ${err.message}`, 'Falló Desempaque', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !detalProduct) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden font-sans">
        
        {/* HEADER MODAL */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-indigo-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 sm:p-3 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl flex-shrink-0">
              <PackageCheck className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-white font-sans">
                  Jerarquía y Desempaque: Bulto ↔ Detal
                </h3>
                <span className="px-2 py-0.5 text-[10.5px] font-bold uppercase bg-indigo-500/30 text-indigo-200 rounded-full border border-indigo-400/30 font-sans">
                  Control de Inventario
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5 truncate font-sans">
                Producto Detal: <strong className="text-white font-bold">{detalProduct.description}</strong>
                <span className="ml-2 text-indigo-300">
                  (Stock actual: <strong className="text-white font-mono">{detalProduct.stock_actual}</strong> Uds)
                </span>
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 font-sans">

          {/* BOTÓN TOGGLE GUÍA DE AYUDA EXPLICATIVA */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowHelp(prev => !prev)}
              className="flex items-center gap-2 text-xs font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 px-3.5 py-1.5 rounded-xl border border-indigo-200/80 transition-all cursor-pointer shadow-2xs"
            >
              <HelpCircle className="w-4 h-4 text-indigo-600" />
              <span>{showHelp ? 'Ocultar Guía de Ayuda' : '¿Cómo funciona este proceso y para qué sirve?'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showHelp ? 'rotate-180' : ''}`} />
            </button>

            {activeBultoProduct && (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Vínculo configurado
              </span>
            )}
          </div>

          {/* PANEL DE AYUDA DIDÁCTICA Y PASO A PASO */}
          {showHelp && (
            <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-slate-50 border border-indigo-200/70 rounded-2xl p-4 sm:p-5 text-slate-800 space-y-3.5 animate-in fade-in duration-200 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-100 rounded-xl flex-shrink-0 mt-0.5">
                  <Info className="w-5 h-5 text-indigo-700" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-extrabold text-indigo-950 text-sm font-sans">
                    ¿Para qué sirve vincular un Bulto con el Detal?
                  </h4>
                  <p className="text-xs text-slate-700 leading-relaxed font-sans">
                    Te permite conectar los productos que compras por <strong>caja, fardo o empaque mayorista (Bulto)</strong> con los que vendes por <strong>unidad suelta en el mostrador (Detal)</strong>.
                    Cuando en tu tienda se acaben las unidades sueltas, abres 1 bulto aquí y el sistema sumará automáticamente las unidades a la venta al detal y restará la caja del almacén.
                  </p>
                </div>
              </div>

              {/* 3 PASOS SIMPLES */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                <div className="bg-white border border-indigo-100 rounded-xl p-3 shadow-2xs">
                  <span className="font-bold text-xs text-indigo-950 flex items-center gap-1.5 mb-1">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                    Seleccionar Bulto
                  </span>
                  <p className="text-[11px] text-slate-600 font-sans leading-normal">
                    Busca y elige el empaque o caja cerrada que tienes registrada en el inventario.
                  </p>
                </div>

                <div className="bg-white border border-indigo-100 rounded-xl p-3 shadow-2xs">
                  <span className="font-bold text-xs text-indigo-950 flex items-center gap-1.5 mb-1">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">2</span>
                    Factor de Conversión
                  </span>
                  <p className="text-[11px] text-slate-600 font-sans leading-normal">
                    Indica cuántas unidades individuales trae la caja (ej: 24). Presiona «Guardar Vínculo».
                  </p>
                </div>

                <div className="bg-white border border-indigo-100 rounded-xl p-3 shadow-2xs">
                  <span className="font-bold text-xs text-indigo-950 flex items-center gap-1.5 mb-1">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">3</span>
                    Desempacar Stock
                  </span>
                  <p className="text-[11px] text-slate-600 font-sans leading-normal">
                    Elige cuántos bultos vas a abrir hoy. Las unidades se sumarán al detal al instante.
                  </p>
                </div>
              </div>

              {/* EJEMPLO PRÁCTICO */}
              <div className="bg-white/90 border border-indigo-200/60 rounded-xl p-3 text-xs text-slate-700 flex items-center gap-2.5">
                <span className="text-base">💡</span>
                <span className="font-sans">
                  <strong>Ejemplo:</strong> Si tienes <strong>Caja de Helados x24</strong> y se agotaron los helados sueltos en el congelador de la caja registradora, desempacas <strong>1 caja</strong>: tu stock de cajas disminuye en 1 y tu stock de helados al detal aumenta en <strong>+24 unidades</strong> automáticamente.
                </span>
              </div>

              {/* ACLARATORIA DE UNIDADES vs BULTOS */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <span>📌</span>
                  <span>¿Cómo identifica el sistema los Bultos si todo mi inventario está en Unidades?</span>
                </div>
                <p className="text-[11.5px] leading-relaxed text-amber-850">
                  En el sistema, la existencia de cada producto está expresada en <strong>Unidades</strong>. 
                  Esta ventana de «Desempaque» es <strong>opcional</strong> y se utiliza únicamente cuando decides registrar en tu catálogo dos productos separados: uno para la caja cerrada (ej. <em>«Caja Helados x24»</em>) y otro para la paleta suelta (ej. <em>«Helado Paleta»</em>).
                  Si tú no tienes cajas creadas por separado y vendes bultos aplicando el <strong>Precio al Bulto</strong> en la caja registradora, <strong>no necesitas usar este desempaque</strong>: tu inventario ya se descuenta perfectamente por unidades.
                </p>
              </div>
            </div>
          )}

          {/* SECCIÓN 1: VÍNCULO DEL BULTO PADRE Y FACTOR DE CONVERSIÓN */}
          <div className="bg-slate-50 border border-slate-200 p-4 sm:p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-bold uppercase text-slate-800 flex items-center gap-2 font-sans tracking-wide">
                <Boxes className="w-4 h-4 text-indigo-600" />
                1. Configurar Producto Bulto Padre y Factor de Conversión
              </h4>
              {activeBultoProduct && !isChangingBulto && (
                <button
                  type="button"
                  onClick={() => {
                    setIsChangingBulto(true);
                    setTimeout(() => searchInputRef.current?.focus(), 100);
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                >
                  Cambiar bulto padre
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
              {/* BUSCADOR ESTILO CAJA POS */}
              <div className="sm:col-span-8 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase font-sans block">
                  Producto Bulto Padre (Caja o Empaque Mayorista):
                </label>

                {/* Si ya hay un bulto seleccionado y no estamos en modo cambiar: mostrar tarjeta estilizada */}
                {activeBultoProduct && !isChangingBulto ? (
                  <div className="bg-white border-2 border-indigo-200 hover:border-indigo-300 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Miniatura de Imagen */}
                      <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 flex-shrink-0 overflow-hidden flex items-center justify-center">
                        {activeBultoProduct.imagen_url ? (
                          <img 
                            src={formatImageUrl(activeBultoProduct.imagen_url)} 
                            alt={activeBultoProduct.description}
                            className="w-full h-full object-contain p-0.5"
                          />
                        ) : (
                          <Package className="w-5 h-5 text-slate-400" />
                        )}
                      </div>

                      {/* Detalles del Bulto */}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate font-sans">
                          {activeBultoProduct.description}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="font-mono text-[11px] text-slate-500 font-semibold">
                            Cód: {activeBultoProduct.barcode}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                            📦 Stock: {activeBultoProduct.stock_actual} {activeBultoProduct.a_granel ? 'Kg' : 'Uds'}
                          </span>
                          <span className="text-[11px] text-slate-600 font-mono font-bold">
                            ${activeBultoProduct.precio_costo_usd.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChangingBulto(true);
                        setTimeout(() => searchInputRef.current?.focus(), 100);
                      }}
                      className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 border border-slate-200 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  /* Input con Buscador Dinámico idéntico a CajaPOS */
                  <div ref={searchContainerRef} className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      autoFocus={true}
                      value={searchBultoQuery}
                      onChange={(e) => {
                        setSearchBultoQuery(e.target.value);
                        setShowSearchDropdown(true);
                        setSearchSelectedIndex(-1);
                      }}
                      onFocus={() => setShowSearchDropdown(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          if (candidateBultoProducts.length > 0) {
                            e.preventDefault();
                            setSearchSelectedIndex(prev => (prev < candidateBultoProducts.length - 1 ? prev + 1 : 0));
                          }
                        } else if (e.key === 'ArrowUp') {
                          if (candidateBultoProducts.length > 0) {
                            e.preventDefault();
                            setSearchSelectedIndex(prev => (prev > 0 ? prev - 1 : candidateBultoProducts.length - 1));
                          }
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          if (searchSelectedIndex >= 0 && searchSelectedIndex < candidateBultoProducts.length) {
                            handleSelectBulto(candidateBultoProducts[searchSelectedIndex]);
                          } else if (candidateBultoProducts.length > 0) {
                            handleSelectBulto(candidateBultoProducts[0]);
                          }
                        } else if (e.key === 'Escape') {
                          setShowSearchDropdown(false);
                        }
                      }}
                      placeholder="Escriba código de barra o nombre del bulto..."
                      className="w-full h-[40px] bg-white border border-slate-350 rounded-xl p-2 pl-9 pr-8 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-sans shadow-2xs"
                    />

                    {searchBultoQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchBultoQuery('');
                          searchInputRef.current?.focus();
                        }}
                        className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Autocomplete Dropdown - Estilo CajaPOS */}
                    {showSearchDropdown && (
                      <div className="absolute left-0 right-0 top-11 bg-white border border-slate-250 rounded-xl overflow-y-auto max-h-56 z-50 shadow-2xl divide-y divide-slate-100 animate-in fade-in duration-150">
                        {candidateBultoProducts.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-500 font-sans">
                            No se encontraron bultos que coincidan con «<strong>{searchBultoQuery}</strong>»
                          </div>
                        ) : (
                          candidateBultoProducts.map((p, idx) => {
                            const isSelected = idx === searchSelectedIndex;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onMouseEnter={() => setSearchSelectedIndex(idx)}
                                onClick={() => handleSelectBulto(p)}
                                className={`w-full text-left p-2.5 flex items-center gap-3 transition-colors font-sans cursor-pointer ${
                                  isSelected || selectedBultoId === String(p.id)
                                    ? 'bg-indigo-50/90 border-l-4 border-indigo-600 text-slate-900 font-semibold'
                                    : 'hover:bg-slate-50 text-slate-800'
                                }`}
                              >
                                {/* Thumbnail */}
                                <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex-shrink-0 overflow-hidden flex items-center justify-center">
                                  {p.imagen_url ? (
                                    <img 
                                      src={formatImageUrl(p.imagen_url)} 
                                      alt={p.description} 
                                      className="w-full h-full object-contain p-0.5" 
                                    />
                                  ) : (
                                    <Package className="w-4 h-4 text-slate-400" />
                                  )}
                                </div>

                                {/* Text info */}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold text-slate-900 truncate">
                                    {p.description}
                                  </div>
                                  <div className="flex items-center gap-2 text-[10.5px] text-slate-500 font-mono mt-0.5">
                                    <span>Cód: {p.barcode}</span>
                                    {p.category && (
                                      <span className="font-sans text-[9.5px] text-slate-400 uppercase">
                                        • {p.category}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Stock & Cost */}
                                <div className="text-right flex-shrink-0">
                                  <div className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                    Stock: {p.stock_actual} {p.a_granel ? 'Kg' : 'Uds'}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                    Costo: ${p.precio_costo_usd.toFixed(2)}
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* FACTOR DE CONVERSIÓN */}
              <div className="sm:col-span-4 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase font-sans block" title="Cantidad de unidades individuales por cada bulto">
                  Factor (Uds x Bulto):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={conversionFactor}
                    onChange={(e) => setConversionFactor(e.target.value)}
                    className="w-full h-[40px] bg-white border border-slate-350 rounded-xl p-2 text-center text-sm font-bold font-mono text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none shadow-2xs"
                    placeholder="24"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold pointer-events-none">
                    Uds
                  </span>
                </div>
              </div>
            </div>

            {/* RESUMEN Y GUARDAR VÍNCULO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200 text-xs">
              <span className="text-slate-600 font-sans">
                Equivalencia: <strong>1 Bulto cerrado</strong> = <strong className="text-indigo-700">{factorNum} unidades individuales al detal</strong>.
              </span>
              <button
                type="button"
                onClick={handleSaveLink}
                disabled={savingLink || !selectedBultoId}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingLink ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-400" />}
                Guardar Vínculo
              </button>
            </div>
          </div>

          {/* SECCIÓN 2: VALUACIÓN Y COSTOS DEL DESEMPAQUE */}
          {activeBultoProduct && (
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 rounded-2xl border border-indigo-900 shadow-md">
              <div className="flex items-center justify-between border-b border-indigo-800/50 pb-2.5 mb-3.5">
                <span className="text-xs font-bold uppercase text-indigo-300 tracking-wider flex items-center gap-1.5 font-sans">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Valuación y Costos Proporcionales del Desempaque
                </span>
                <span className="text-[10px] text-indigo-300 font-sans font-semibold">
                  Tasa: {tasaDia.toFixed(2)} Bs/USD
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                  <span className="text-[10.5px] text-slate-400 uppercase font-bold font-sans">
                    Costo de 1 Bulto:
                  </span>
                  <div className="text-base sm:text-lg font-black text-white font-mono mt-0.5">
                    ${bultoCost.toFixed(2)}
                  </div>
                  <span className="text-[10.5px] text-slate-400 font-mono">
                    {(bultoCost * tasaDia).toFixed(2)} Bs
                  </span>
                </div>

                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                  <span className="text-[10.5px] text-slate-400 uppercase font-bold font-sans">
                    Factor Conversión:
                  </span>
                  <div className="text-base sm:text-lg font-black text-indigo-300 font-mono mt-0.5">
                    {factorNum} Uds
                  </div>
                  <span className="text-[10.5px] text-slate-400 font-sans">
                    por cada bulto
                  </span>
                </div>

                <div className="p-3 bg-emerald-950/40 rounded-xl border border-emerald-500/40">
                  <span className="text-[10.5px] text-emerald-400 uppercase font-bold font-sans">
                    Nuevo Costo Detal ($/Ud):
                  </span>
                  <div className="text-base sm:text-lg font-black text-emerald-400 font-mono mt-0.5">
                    ${unitCostNewProrated.toFixed(4)}
                  </div>
                  <span className="text-[10.5px] text-emerald-400 font-mono">
                    {(unitCostNewProrated * tasaDia).toFixed(2)} Bs / Ud
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SECCIÓN 3: ACCIÓN DE DESEMPAQUE EN EL INVENTARIO */}
          {activeBultoProduct && (
            <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/60 border border-blue-200 p-4 sm:p-5 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-extrabold uppercase text-blue-950 font-sans tracking-wide">
                    2. Desempacar Bultos a Unidades Sueltas
                  </h4>
                  <p className="text-xs text-blue-800 font-sans">
                    Resta <strong>{bultosToUnpack}</strong> bulto(s) de "{activeBultoProduct.description}" (Disponibles: <span className="font-mono font-bold">{activeBultoProduct.stock_actual}</span>) y suma automáticamente +<strong>{bultosToUnpack * factorNum}</strong> unidades al detal de "{detalProduct.description}".
                  </p>
                </div>

                <div className="flex items-center gap-2 bg-white border border-blue-200 px-3 py-1.5 rounded-xl shadow-2xs flex-shrink-0">
                  <span className="text-xs font-bold text-slate-700 font-sans">Bultos a abrir:</span>
                  <input
                    type="number"
                    min="1"
                    max={activeBultoProduct.stock_actual || 1}
                    value={bultosToUnpack}
                    onChange={(e) => setBultosToUnpack(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 p-1 bg-slate-50 border border-slate-300 rounded-lg text-center font-mono font-bold text-xs text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* PREVISUALIZACIÓN DE MOVIMIENTO DE STOCK */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="bg-white/90 border border-rose-200 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-rose-700 font-bold font-sans">📉 Almacén Mayorista:</span>
                  <span className="font-mono font-bold text-rose-800">
                    -{bultosToUnpack} bulto(s) de "{activeBultoProduct.description}"
                  </span>
                </div>
                <div className="bg-white/90 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between">
                  <span className="text-emerald-700 font-bold font-sans">📈 Mostrador al Detal:</span>
                  <span className="font-mono font-bold text-emerald-800">
                    +{bultosToUnpack * factorNum} unidades de "{detalProduct.description}"
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-blue-200/80 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleExecuteUnpack}
                  disabled={loading || (activeBultoProduct.stock_actual || 0) < bultosToUnpack}
                  className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                  Confirmar y Desempacar {bultosToUnpack} Bulto(s) (+{bultosToUnpack * factorNum} Uds)
                </button>
              </div>
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="bg-slate-50 border-t border-slate-200 p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-slate-600 font-sans">
          <div className="flex items-center gap-1.5 text-center sm:text-left">
            <span className="text-sm">💡</span>
            <span>La actualización de stock y costos se refleja en tiempo real en el Kardex y en todas las cajas. Puedes cerrar con <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono shadow-2xs">ESC</kbd>.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-all cursor-pointer flex-shrink-0"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
