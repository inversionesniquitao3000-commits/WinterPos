import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera, Upload, CheckCircle2, AlertTriangle, Trash2, Plus, RefreshCw,
  Tag, ShieldCheck, Calculator, X, Image as ImageIcon,
  ZoomIn, ZoomOut, RotateCw, Eye, Package, Search
} from 'lucide-react';
import type { Product } from '../types';
import { getApiBaseUrl, formatImageUrl } from '../utils';

export interface ExtractedInvoiceItem {
  id: string;
  originalText: string;
  matchedProductId: number | null; // ID of matched catalog product, or null
  cantidad: number;
  precioOriginal: number; // Price as detected in receipt currency (Total line amount)
  precioUsd: number; // Converted UNIT cost in USD ($)
  similarityScore: number; // 0 to 1
  isNewProduct?: boolean;
  // Raw input buffers for fluid typing without stuck zeros
  rawCantidad?: string;
  rawPrecioOriginal?: string;
  rawPrecioUsd?: string;
}

interface ModalEscaneoFotoFacturaProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyToInvoice: (data: {
    invoiceNumber: string;
    controlNumber: string;
    currency: 'Bs' | 'USD';
    tasaCambio: number;
    items: {
      product: Product;
      qty: number;
      precio_costo_usd: number;
      precio_detalle_usd: number;
      precio_mayor_usd: number;
    }[];
  }) => void;
  existingProducts: Product[];
  tasaBcv: number;
  tasaEuroBcv?: number;
  onAddNewProductFast?: (productData: Partial<Product>) => Promise<Product | null>;
}

// Helper: Calculate text similarity (0 to 1) for fuzzy matching with unit normalization
function calculateTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;

  const normalizeText = (t: string) => {
    return t.toLowerCase()
      .replace(/\((?:MILLAR|BULTO|MAYOR|BCV|E|UN|UNID|\/)+\)/gi, '') // Strip metadata tags
      .replace(/(\d+)\s*g(?:r)?\b/gi, '$1 g')     // 250g / 250gr -> 250 g
      .replace(/(\d+)\s*k(?:g)?\b/gi, '$1 kg')    // 2k / 2kg -> 2 kg
      .replace(/(\d+)\s*ml\b/gi, '$1 ml')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const clean1 = normalizeText(text1);
  const clean2 = normalizeText(text2);

  if (clean1 === clean2) return 1.0;
  if (clean1.length >= 5 && clean2.length >= 5 && (clean1.includes(clean2) || clean2.includes(clean1))) return 0.88;

  const words1 = clean1.split(' ').filter(w => w.length > 1);
  const words2 = clean2.split(' ').filter(w => w.length > 1);

  if (words1.length === 0 || words2.length === 0) return 0;

  let matchCount = 0;
  for (const w1 of words1) {
    if (words2.some(w2 => w2 === w1 || (w1.length >= 3 && w2.includes(w1)) || (w2.length >= 3 && w1.includes(w2)))) {
      matchCount++;
    }
  }

  const score1 = matchCount / words1.length;
  const score2 = matchCount / words2.length;
  return (score1 + score2) / 2;
}

// Dynamic Loader for Tesseract.js via CDN
const loadTesseractJs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).Tesseract) {
      return resolve((window as any).Tesseract);
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => {
      const lib = (window as any).Tesseract;
      if (lib) resolve(lib);
      else reject(new Error('No se pudo inicializar la librería Tesseract OCR'));
    };
    script.onerror = () => reject(new Error('Error al cargar Tesseract OCR desde CDN'));
    document.head.appendChild(script);
  });
};

// Helper to safely parse any rate (number, or string with commas/dots)
const parseRateVal = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'string') {
    const cleaned = val.replace(',', '.').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

// Helper: Recalculate Unit Cost USD from total line price and quantity
const calculateUnitCostUsd = (totalBsOrUsd: number, qty: number, currency: 'Bs' | 'USD', rate: number): number => {
  const safeQty = qty > 0 ? qty : 1;
  const safeRate = rate > 0 ? rate : 1;
  const totalUsd = currency === 'Bs' ? (totalBsOrUsd / safeRate) : totalBsOrUsd;
  return Number((totalUsd / safeQty).toFixed(2));
};

// Search Cell Component with Rich Autocomplete Dropdown (Matches Caja POS Style)
interface ProductCatalogSearchCellProps {
  item: ExtractedInvoiceItem;
  existingProducts: Product[];
  tasaCambio: number;
  onSelectProduct: (productId: number | null, similarityScore: number) => void;
  onOpenQuickCreate: (customName?: string) => void;
}

function ProductCatalogSearchCell({
  item,
  existingProducts,
  tasaCambio,
  onSelectProduct,
  onOpenQuickCreate
}: ProductCatalogSearchCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 480
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const matchedProd = useMemo(() => {
    return existingProducts.find(p => p.id === item.matchedProductId);
  }, [existingProducts, item.matchedProductId]);

  const isHighMatch = item.similarityScore >= 0.5;

  // Sync displayed search term when not editing
  useEffect(() => {
    if (!isEditing) {
      setSearchTerm(matchedProd ? matchedProd.description : '');
    }
  }, [matchedProd, isEditing]);

  // Update dropdown coordinates relative to window viewport
  const updatePosition = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const dropdownHeight = 290;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    const width = Math.max(rect.width, 480);
    let left = rect.left;
    if (left + width > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - width - 16);
    }

    setCoords({
      top: placeAbove ? (rect.top - dropdownHeight - 4) : (rect.bottom + 4),
      left,
      width
    });
  };

  // Filter products by description or barcode (with smart fallback to extracted OCR text)
  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      // Suggest products matching keywords from OCR originalText
      if (item.originalText) {
        const clean = item.originalText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
        const words = clean.split(/\s+/).filter(w => w.length >= 3);
        if (words.length > 0) {
          const suggestions = existingProducts.filter(p => {
            const d = (p.description || '').toLowerCase();
            const b = (p.barcode || '').toLowerCase();
            return words.some(w => d.includes(w) || b.includes(w));
          });
          if (suggestions.length > 0) return suggestions.slice(0, 10);
        }
      }
      return existingProducts.slice(0, 10);
    }

    return existingProducts.filter(p => {
      const descMatch = (p.description || '').toLowerCase().includes(term);
      const barcodeMatch = (p.barcode || '').toLowerCase().includes(term);
      return descMatch || barcodeMatch;
    }).slice(0, 10);
  }, [searchTerm, existingProducts, item.originalText]);

  // Handle click outside and window repositioning
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setIsEditing(false);
        setSearchTerm(matchedProd ? matchedProd.description : '');
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, matchedProd]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredProducts]);

  // Scroll active item into view during keyboard navigation
  useEffect(() => {
    if (isOpen && dropdownRef.current && selectedIndex >= 0) {
      const items = dropdownRef.current.querySelectorAll<HTMLElement>('.dropdown-prod-item');
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, isOpen]);

  const handleSelectProduct = (p: Product) => {
    onSelectProduct(p.id, 1.0);
    setSearchTerm(p.description);
    setIsEditing(false);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (!isOpen) {
        updatePosition();
        setIsOpen(true);
        return;
      }
      e.preventDefault();
      if (filteredProducts.length > 0) {
        setSelectedIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      if (!isOpen) {
        updatePosition();
        setIsOpen(true);
        return;
      }
      e.preventDefault();
      if (filteredProducts.length > 0) {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setIsEditing(false);
      setSearchTerm(matchedProd ? matchedProd.description : '');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const termUpper = searchTerm.trim().toUpperCase();

      // Check for exact barcode match first
      const exactBarcodeProd = existingProducts.find(p => p.barcode && p.barcode.toUpperCase() === termUpper);
      if (exactBarcodeProd) {
        handleSelectProduct(exactBarcodeProd);
        return;
      }

      if (selectedIndex >= 0 && selectedIndex < filteredProducts.length) {
        handleSelectProduct(filteredProducts[selectedIndex]);
      } else if (filteredProducts.length > 0) {
        handleSelectProduct(filteredProducts[0]);
      } else if (searchTerm.trim()) {
        setIsOpen(false);
        setIsEditing(false);
        onOpenQuickCreate(searchTerm.trim());
      }
    }
  };

  const handleClear = () => {
    onSelectProduct(null, 0);
    setSearchTerm('');
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      updatePosition();
      setIsOpen(true);
    }, 50);
  };

  return (
    <div className="flex items-center gap-1.5 w-full relative font-sans">
      <div className="relative flex-1 min-w-0">
        <Search className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${
          matchedProd ? 'text-indigo-600' : 'text-amber-500'
        }`} />

        <input
          ref={inputRef}
          type="text"
          value={isEditing ? searchTerm : (matchedProd ? matchedProd.description : searchTerm)}
          placeholder="Buscar código o descripción..."
          onFocus={(e) => {
            setIsEditing(true);
            setSearchTerm(matchedProd ? matchedProd.description : '');
            e.target.select();
            updatePosition();
            setIsOpen(true);
          }}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) {
              updatePosition();
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          className={`w-full rounded-lg pl-8 pr-7 py-1.5 text-xs font-bold font-sans transition-all outline-none truncate ${
            matchedProd
              ? 'bg-indigo-50/50 border border-indigo-200 text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100'
              : 'bg-amber-50/60 border border-amber-300 text-amber-950 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 placeholder:text-amber-700/60 placeholder:font-normal'
          }`}
          title={matchedProd ? `${matchedProd.description} (${matchedProd.barcode || 'S/C'})` : 'Haz clic para buscar producto en catálogo por nombre o código de barra'}
        />

        {matchedProd ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
            title="Quitar selección y buscar otro producto"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : searchTerm ? (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            title="Limpiar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Match Score Badge or Quick Create Button */}
      {matchedProd ? (
        <span
          className={`text-[9.5px] font-mono font-bold px-1.5 py-1 rounded border shrink-0 shadow-2xs ${
            isHighMatch
              ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
              : 'bg-slate-100 text-slate-700 border-slate-200'
          }`}
          title={`Coincidencia: ${Math.round(item.similarityScore * 100)}%`}
        >
          {Math.round(item.similarityScore * 100)}%
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onOpenQuickCreate(searchTerm || item.originalText)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1 shadow-xs cursor-pointer transition-transform hover:scale-102"
          title="Crear rápidamente este producto en el catálogo"
        >
          <Plus className="w-3 h-3" /> Crear
        </button>
      )}

      {/* Floating Portal Dropdown (Never clipped by table scrolling) */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: '290px',
            zIndex: 999999
          }}
          className="bg-white border border-slate-250 rounded-xl shadow-2xl overflow-y-auto divide-y divide-slate-100 font-sans"
        >
          {/* Header Action: Quick Create Product */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setIsOpen(false);
              setIsEditing(false);
              onOpenQuickCreate(searchTerm || item.originalText);
            }}
            className="w-full text-left p-2.5 bg-gradient-to-r from-indigo-50 to-blue-50/60 hover:from-indigo-100 hover:to-blue-100 text-indigo-950 flex items-center justify-between border-b border-indigo-100 transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                <Plus className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-extrabold text-xs text-indigo-950 flex items-center gap-1">
                  ➕ [+ CREAR NUEVO PRODUCTO]
                </div>
                <div className="text-[10px] text-indigo-600 truncate font-medium">
                  {searchTerm.trim()
                    ? `Registrar "${searchTerm.trim()}" en el inventario`
                    : `Registrar "${item.originalText}" como nuevo producto`}
                </div>
              </div>
            </div>
            <span className="text-[9.5px] bg-white border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full font-bold shadow-2xs shrink-0">
              Crear Rápido
            </span>
          </button>

          {/* List of Catalog Suggestions Matching Caja POS Style */}
          {filteredProducts.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 font-sans">
              No se encontraron productos coincidentes con "{searchTerm}".
              <div className="mt-1 text-[11px] text-indigo-600 font-bold">
                Haz clic arriba para crearlo rápidamente.
              </div>
            </div>
          ) : (
            filteredProducts.map((p, idx) => {
              const isSelected = idx === selectedIndex;
              const priceBs = (p.precio_detalle_usd || 0) * (tasaCambio || 1);

              return (
                <button
                  key={p.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectProduct(p);
                  }}
                  className={`dropdown-prod-item w-full text-left p-2 gap-3 flex items-center transition-all cursor-pointer font-sans ${
                    isSelected
                      ? 'bg-blue-50/90 text-slate-900 border-l-4 border-indigo-600 font-semibold shadow-inner'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  {/* Thumbnail / Package Icon */}
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex-shrink-0 overflow-hidden flex items-center justify-center relative shadow-xs">
                    {p.imagen_url ? (
                      <img
                        src={formatImageUrl(p.imagen_url)}
                        alt={p.description}
                        className="w-full h-full object-contain p-0.5"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                          const fb = (e.currentTarget.parentElement as HTMLElement)?.querySelector('.img-fallback');
                          if (fb) {
                            fb.classList.remove('hidden');
                            fb.classList.add('flex');
                          }
                        }}
                      />
                    ) : null}
                    <div className={`img-fallback w-full h-full items-center justify-center text-slate-400 bg-slate-50 ${p.imagen_url ? 'hidden' : 'flex'}`}>
                      <Package className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>

                  {/* Product Code & Description */}
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-mono text-[10px] text-slate-500 font-bold tracking-tight">
                        {p.barcode || 'SIN CÓDIGO'}
                      </span>
                      {p.exento_impuesto === true ? (
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[8px] px-1 py-0.2 rounded font-mono inline-block shadow-2xs" title="Exento de IVA (0%)">
                          (E)
                        </span>
                      ) : (
                        <span className="bg-sky-50 text-sky-800 border border-sky-200 font-bold text-[7.5px] px-1 py-0.2 rounded font-mono inline-block" title="Gravable IVA">
                          (G)
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-slate-900 text-xs leading-snug truncate" title={p.description}>
                      {p.description}
                    </div>
                  </div>

                  {/* Price & Current Stock */}
                  <div className="text-right flex-shrink-0 flex flex-col items-end justify-center">
                    <div className="text-emerald-700 font-bold font-mono text-xs leading-tight">
                      ${Number(p.precio_detalle_usd || 0).toFixed(2)}{' '}
                      <span className="text-slate-500 font-normal font-mono text-[10px]">
                        / Bs {priceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-sans font-semibold mt-0.5">
                      Stock: {p.stock_actual ?? 0} uds
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function ModalEscaneoFotoFactura({
  isOpen,
  onClose,
  onApplyToInvoice,
  existingProducts = [],
  tasaBcv = 1.0,
  tasaEuroBcv,
  onAddNewProductFast
}: ModalEscaneoFotoFacturaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // General States
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Scanning Mode: 'AUTO' (intelligent auto-detect), 'TICKET' (thermal paper ticket), 'POS_SCREEN' (computer screen photo)
  const [scanMode, setScanMode] = useState<'AUTO' | 'TICKET' | 'POS_SCREEN'>('AUTO');
  const [detectedMode, setDetectedMode] = useState<'TICKET' | 'POS_SCREEN' | null>(null);

  // Invoice Metadata Extracted
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [controlNumber, setControlNumber] = useState('');
  const [detectedCurrency, setDetectedCurrency] = useState<'Bs' | 'USD'>('Bs');
  
  // Rate Selection Mode: $ BCV, Euro BCV, or Manual
  const [tasaTipo, setTasaTipo] = useState<'USD_BCV' | 'EUR_BCV' | 'MANUAL'>('USD_BCV');
  const [customTasa, setCustomTasa] = useState<number>(() => {
    const parsed = parseRateVal(tasaBcv);
    return parsed > 0 ? Number(parsed.toFixed(2)) : 1;
  });
  const [customTasaInput, setCustomTasaInput] = useState<string>(() => {
    const parsed = parseRateVal(tasaBcv);
    return parsed > 0 ? parsed.toFixed(2) : '1.00';
  });
  const [bcvRates, setBcvRates] = useState<{ usd: number; eur: number } | null>(() => {
    const usd = parseRateVal(tasaBcv) || parseRateVal(localStorage.getItem('winterpos_bcv_rate')) || parseRateVal(localStorage.getItem('pos_bcv_usd'));
    const eur = parseRateVal(tasaEuroBcv) || parseRateVal(localStorage.getItem('pos_bcv_eur'));
    if (usd > 0 || eur > 0) {
      return {
        usd: usd > 0 ? Number(usd.toFixed(2)) : 1,
        eur: eur > 0 ? Number(eur.toFixed(2)) : Number((usd * 1.14).toFixed(2))
      };
    }
    return null;
  });
  const [loadingBcv, setLoadingBcv] = useState(false);

  // Extracted Line Items
  const [items, setItems] = useState<ExtractedInvoiceItem[]>([]);

  // Quick Create New Product State
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateRowId, setQuickCreateRowId] = useState<string | null>(null);
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdCostUsd, setNewProdCostUsd] = useState(0);
  const [newProdDetailUsd, setNewProdDetailUsd] = useState(0);
  const [newProdMayorUsd, setNewProdMayorUsd] = useState(0);

  // Enlarged Photo Viewer Modal State (LightBox for comparing invoice details)
  const [showEnlargedImage, setShowEnlargedImage] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageRotation, setImageRotation] = useState(0);

  // Handle Tasa change
  const handleTasaChange = (newRate: number) => {
    const rounded = Number((newRate || 1).toFixed(2));
    setCustomTasa(rounded);
    if (detectedCurrency === 'Bs' && rounded > 0) {
      setItems(prev => prev.map(item => {
        const qty = item.cantidad > 0 ? item.cantidad : 1;
        const unitUsd = calculateUnitCostUsd(item.precioOriginal, qty, 'Bs', rounded);
        return {
          ...item,
          precioUsd: unitUsd,
          rawPrecioUsd: unitUsd > 0 ? unitUsd.toFixed(2) : ''
        };
      }));
    }
  };

  // Close modal or enlarged photo on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showEnlargedImage) {
          setShowEnlargedImage(false);
          return;
        }
        if (isOpen && !isProcessing) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, showEnlargedImage, onClose]);

  // Query live BCV rates ($ USD & € EUR) when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const fetchBcv = async () => {
      setLoadingBcv(true);
      try {
        const baseUrl = getApiBaseUrl().replace(/\/api\/?$/, '');
        const res = await fetch(`${baseUrl}/api/bcv`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          if (data) {
            const parsedUsd = parseRateVal(data.usd) || parseRateVal(tasaBcv) || 1;
            const parsedEur = parseRateVal(data.eur) || parseRateVal(tasaEuroBcv) || (parsedUsd * 1.14);

            const usdRate = Number(parsedUsd.toFixed(2));
            const eurRate = Number(parsedEur.toFixed(2));
            setBcvRates({ usd: usdRate, eur: eurRate });

            if (usdRate > 0) localStorage.setItem('pos_bcv_usd', usdRate.toString());
            if (eurRate > 0) localStorage.setItem('pos_bcv_eur', eurRate.toString());

            if (tasaTipo === 'USD_BCV') {
              setCustomTasaInput(usdRate.toFixed(2));
              handleTasaChange(usdRate);
            } else if (tasaTipo === 'EUR_BCV') {
              setCustomTasaInput(eurRate.toFixed(2));
              handleTasaChange(eurRate);
            }
          }
        }
      } catch (err) {
        console.error('Error al consultar tasas BCV:', err);
      } finally {
        setLoadingBcv(false);
      }
    };
    fetchBcv();
  }, [isOpen]);

  // Keep initial prop rate in sync if custom input is empty
  useEffect(() => {
    if (tasaBcv > 0 && tasaTipo === 'USD_BCV' && !bcvRates) {
      const formatted = tasaBcv.toFixed(2);
      setCustomTasaInput(formatted);
      handleTasaChange(Number(formatted));
    }
  }, [tasaBcv]);

  // Keep live Euro rate in sync if prop changes
  useEffect(() => {
    if (tasaEuroBcv && tasaEuroBcv > 0) {
      setBcvRates(prev => ({
        usd: prev?.usd || (tasaBcv > 0 ? Number(tasaBcv.toFixed(2)) : 1),
        eur: Number(tasaEuroBcv.toFixed(2))
      }));
      if (tasaTipo === 'EUR_BCV') {
        const valStr = Number(tasaEuroBcv.toFixed(2)).toFixed(2);
        setCustomTasaInput(valStr);
        handleTasaChange(parseFloat(valStr));
      }
    }
  }, [tasaEuroBcv]);

  // Switch rate mode handler ($ BCV, Euro BCV, Manual)
  const handleSelectTasaTipo = (tipo: 'USD_BCV' | 'EUR_BCV' | 'MANUAL') => {
    setTasaTipo(tipo);
    if (tipo === 'USD_BCV') {
      const valNum = bcvRates?.usd || parseRateVal(tasaBcv) || 1;
      const valStr = valNum.toFixed(2);
      setCustomTasaInput(valStr);
      handleTasaChange(parseFloat(valStr));
    } else if (tipo === 'EUR_BCV') {
      const valNum = bcvRates?.eur || parseRateVal(tasaEuroBcv) || (bcvRates?.usd ? Number((bcvRates.usd * 1.14).toFixed(2)) : Number((tasaBcv * 1.14).toFixed(2))) || 1;
      const valStr = valNum.toFixed(2);
      setCustomTasaInput(valStr);
      handleTasaChange(parseFloat(valStr));
    }
  };

  // Manual Input Change Handler
  const handleInputChangeTasa = (rawVal: string) => {
    setCustomTasaInput(rawVal);
    const num = parseFloat(rawVal) || 0;
    if (num > 0) {
      handleTasaChange(num);
    }
  };

  // Switch Scan Mode ('AUTO', 'TICKET', 'POS_SCREEN') and re-evaluate if image loaded
  const handleModeChange = (newMode: 'AUTO' | 'TICKET' | 'POS_SCREEN') => {
    setScanMode(newMode);
    if (imageSrc && !isProcessing) {
      processImageOCR(imageSrc, newMode);
    }
  };

  if (!isOpen) return null;

  // Drag and Drop Event Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Por favor arrastre un archivo de imagen válido (JPG, PNG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageSrc(result);
      processImageOCR(result);
    };
    reader.readAsDataURL(file);
  };

  // Handle Image File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Por favor seleccione un archivo de imagen válido (JPG, PNG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageSrc(result);
      processImageOCR(result);
    };
    reader.readAsDataURL(file);
  };

  // Helper: Venezuelan number parser (e.g. "30.878,80" -> 30878.80)
  const parseVeNumber = (numStr: string): number => {
    if (!numStr) return 0;
    let clean = numStr.trim().replace(/[^0-9.,]/g, '');
    if (clean.includes('.') && clean.includes(',')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
      clean = clean.replace(',', '.');
    }
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  };

  // Helper: Preprocess image on canvas (Safe Memory Bounds + High Contrast)
  const preprocessImageForOCR = (base64Img: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');

        // Safe maximum bounds to prevent browser canvas memory allocation crashes on mobile photos
        const MAX_WIDTH = 2000;
        const MAX_HEIGHT = 3000;

        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        } else if (width < 800) {
          const scale = 1200 / width;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Img);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // High contrast binarization for thermal/dot-matrix receipts
        for (let i = 0; i < data.length; i += 4) {
          const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const val = avg > 145 ? 255 : (avg < 85 ? 0 : avg);
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(base64Img);
      img.src = base64Img;
    });
  };

  // Helper: Extract package box multipliers (e.g. "3x24", "#[1x24]", "24 UN", "BULT 24")
  const extractPackageMultiplier = (text: string): number => {
    if (!text) return 1;
    const u = text.toUpperCase();

    // Pattern 1: #[1x24] or #[3x24] or [1x24] or (1x24) or 1x24
    const matchCode = u.match(/(?:#\[|\[|\()\s*(\d+)\s*[xX*]\s*(\d+)\s*(?:\]|\)|#|\s|$)/);
    if (matchCode) {
      const mult = parseInt(matchCode[2]);
      if (mult > 0) return mult;
    }

    // Pattern 2: (24 UN) or 24 UNID or 24 U
    const matchUn = u.match(/(\d+)\s*(?:UN|UNID|UNIDADES)\b/);
    if (matchUn) {
      const mult = parseInt(matchUn[1]);
      if (mult > 1 && mult <= 500) return mult;
    }

    // Pattern 3: BULT 24 or CAJA 24 or CJ 24
    const matchBox = u.match(/(?:BULT|BULTO|CAJA|CJ)\s*(?:C|DE)?\s*(\d+)/);
    if (matchBox) {
      const mult = parseInt(matchBox[1]);
      if (mult > 1 && mult <= 500) return mult;
    }

    return 1;
  };

  // Helper: Crop and Preprocess a region (Table zone or Header zone) for POS Screens
  const cropAndPreprocessRegion = (
    base64Img: string,
    region: { leftPct: number; topPct: number; widthPct: number; heightPct: number; upscale?: number }
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const sx = Math.round(img.width * region.leftPct);
        const sy = Math.round(img.height * region.topPct);
        const sw = Math.round(img.width * region.widthPct);
        const sh = Math.round(img.height * region.heightPct);

        const upscale = region.upscale || 2;
        canvas.width = Math.round(sw * upscale);
        canvas.height = Math.round(sh * upscale);

        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Img);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

        // Grayscale conversion for maximum OCR clarity
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }
        ctx.putImageData(imgData, 0, 0);

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(base64Img);
      img.src = base64Img;
    });
  };

  // Helper for POS screen quantity token parsing
  const parsePosQtyToken = (token: string): number => {
    if (!token) return 1;
    let clean = token.toLowerCase().replace(/ss/g, '5').replace(/s/g, '5').replace(/o/g, '0').replace(/l/g, '1');
    clean = clean.replace(/[^0-9]/g, '');
    const n = parseInt(clean);
    return (!isNaN(n) && n > 0) ? n : 1;
  };

  // Helper: Parse tabular product rows from POS monitor screens (1SISTEMA, Valery, etc.)
  const parsePosTableRows = (
    text: string,
    currency: 'Bs' | 'USD',
    rate: number
  ): ExtractedInvoiceItem[] => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const parsedItems: ExtractedInvoiceItem[] = [];

    for (const line of lines) {
      const u = line.toUpperCase();
      if (
        u.includes('DESCRIP') || u.includes('PRECIO') || u.includes('CANT') ||
        u.includes('TOTAL') || u.includes('1SISTEMA') || u.includes('VENDEDOR') ||
        u.includes('CLIENTE') || u.includes('ITEMS') || line.length < 5
      ) {
        continue;
      }

      let cleanLine = line.replace(/[\|\[\]\(\)\.\.]{2,}/g, ' ').replace(/[\|\\\/]+$/, '').trim();

      // Look for line ending pattern: [IVA: E / 16%] [PRECIO] [CANT] [DEC: 0] [TOTAL]
      const regexTableEnd = /\s+(E|EX|\d+%)?\s*([\d.,osS]+)\s+([\d.,osS]+)\s+([\d.,osS]+)(?:\s+([\d.,]+))?$/i;
      const match = cleanLine.match(regexTableEnd);

      let desc = '';
      let totalAmount = 0;
      let unitPrice = 0;
      let cant = 1;

      if (match) {
        const tokens = [match[2], match[3], match[4], match[5]].filter(Boolean);
        const rawTotal = tokens[tokens.length - 1];
        totalAmount = parseVeNumber(rawTotal);

        if (tokens.length >= 3) {
          if (tokens.length === 4) {
            cant = parsePosQtyToken(tokens[1]);
            unitPrice = parseVeNumber(tokens[0]);
          } else if (tokens.length === 3) {
            const t1 = parsePosQtyToken(tokens[1]);
            const t0 = parsePosQtyToken(tokens[0]);
            if (t1 > 0 && t1 <= 50) {
              cant = t1;
              unitPrice = parseVeNumber(tokens[0]);
            } else if (t0 > 0 && t0 <= 50) {
              cant = t0;
            }
          }
        } else if (tokens.length === 2) {
          cant = parsePosQtyToken(tokens[0]);
        }

        // Self-verifying price checksum: total = price * cant
        if (totalAmount > 0 && cant > 0) {
          const calculatedUnit = Number((totalAmount / cant).toFixed(2));
          if (!unitPrice || Math.abs(unitPrice * cant - totalAmount) > 1.0) {
            unitPrice = calculatedUnit;
          }
        }

        desc = cleanLine.slice(0, cleanLine.length - match[0].length).trim();
        desc = desc.replace(/^[\d\-\.\s\—\–]+\s+/, '').trim();
      } else {
        // Fallback token extraction from line end
        const parts = cleanLine.split(/\s+/);
        if (parts.length >= 4) {
          const numIdxs: number[] = [];
          for (let k = parts.length - 1; k >= 0; k--) {
            if (/^[\d.,osS]+$/.test(parts[k]) || parts[k] === 'E' || /^\d+%$/.test(parts[k])) {
              numIdxs.unshift(k);
            } else {
              break;
            }
          }
          if (numIdxs.length >= 2) {
            desc = parts.slice(0, numIdxs[0]).join(' ').replace(/^[\d\-\.\s\—\–]+\s+/, '').trim();
            const numTokens = numIdxs.map(i => parts[i]);
            totalAmount = parseVeNumber(numTokens[numTokens.length - 1]);
            cant = numTokens.length >= 3 ? parsePosQtyToken(numTokens[numTokens.length - 2]) : 1;
            unitPrice = totalAmount > 0 ? Number((totalAmount / (cant || 1)).toFixed(2)) : 0;
          }
        }
      }

      if (desc.length >= 3 && totalAmount > 0) {
        // Check package multiplier (BULTO, 1x24, etc.)
        const pkgMult = extractPackageMultiplier(desc);
        const totalUnits = (cant > 0 ? cant : 1) * pkgMult;

        const effectiveRate = rate > 0 ? rate : 1;
        const unitCostUsd = currency === 'Bs'
          ? Number(((totalAmount / effectiveRate) / totalUnits).toFixed(2))
          : (pkgMult > 1 ? Number((unitPrice / pkgMult).toFixed(2)) : unitPrice);

        // Fuzzy catalog match
        let bestMatch: Product | null = null;
        let highestScore = 0;

        existingProducts.forEach(prod => {
          const scoreDesc = calculateTextSimilarity(desc, prod.description || prod.descripcion || '');
          const scoreKey = prod.codigo_barras_clave ? calculateTextSimilarity(desc, prod.codigo_barras_clave) : 0;
          const score = Math.max(scoreDesc, scoreKey);
          if (score > highestScore) {
            highestScore = score;
            bestMatch = prod;
          }
        });

        parsedItems.push({
          id: `pos-extracted-${parsedItems.length}-${Date.now()}`,
          originalText: desc.toUpperCase(),
          matchedProductId: highestScore >= 0.20 && bestMatch ? (bestMatch as Product).id : null,
          cantidad: totalUnits,
          precioOriginal: Number(totalAmount.toFixed(2)),
          precioUsd: unitCostUsd,
          similarityScore: Number(highestScore.toFixed(2)),
          rawCantidad: totalUnits.toString(),
          rawPrecioOriginal: totalAmount.toFixed(2),
          rawPrecioUsd: unitCostUsd.toFixed(2)
        });
      }
    }

    return parsedItems;
  };

  // Parse N° Factura, N° Control, Currency from raw text
  const parseMetadataFromText = (rawText: string) => {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

    // Currency Detection
    const uppercaseText = rawText.toUpperCase();
    if (uppercaseText.includes('REF') || uppercaseText.includes('USD') || uppercaseText.includes('$')) {
      setDetectedCurrency('USD');
    } else if (uppercaseText.includes('BS ') || uppercaseText.includes('BS.') || uppercaseText.includes('BOLIVARES') || uppercaseText.includes('VES')) {
      setDetectedCurrency('Bs');
    } else {
      setDetectedCurrency('Bs');
    }

    // Invoice & Control Numbers Regex heuristics
    let foundFac = '';
    let foundCtrl = '';

    for (const line of lines) {
      const uLine = line.toUpperCase();
      if (!foundFac && (uLine.startsWith('NO.') || uLine.includes('FACTURA') || uLine.includes('FAC') || uLine.includes('NRO') || uLine.includes('NUMERO'))) {
        const match = line.match(/(?:FACTURA|FAC|NRO|NO\.|N°|#|\s)[:.\s]*([A-Z0-9-]{3,14})/i);
        if (match && match[1] && !match[1].toUpperCase().includes('FACTURA') && !match[1].toUpperCase().includes('HORA')) {
          foundFac = match[1].replace(/[^A-Z0-9-]/gi, '');
        }
      }
      if (!foundCtrl && (uLine.includes('CONTROL') || uLine.includes('N/C') || uLine.includes('CTRL'))) {
        const match = line.match(/(?:CONTROL|CTRL|NC)[:.\s]*([A-Z0-9-]{3,12})/i);
        if (match && match[1]) {
          foundCtrl = match[1].replace(/[^A-Z0-9-]/gi, '');
        }
      }
    }

    if (foundFac) {
      const cleanFac = foundFac.replace(/^FAC/i, '');
      setInvoiceNumber(cleanFac.slice(0, 10));
    }
    if (foundCtrl) setControlNumber(foundCtrl.slice(0, 10));
  };

  // Specialized POS Screen OCR runner
  const runPosScreenOCR = async (
    base64Image: string,
    Tesseract: any,
    activeRate: number,
    isProbe = false
  ): Promise<ExtractedInvoiceItem[]> => {
    // 1. Crop table zone (table on POS screen is usually in the center-right 68% width, 12% to 85% height)
    const tableCropped = await cropAndPreprocessRegion(base64Image, {
      leftPct: 0.28,
      topPct: 0.12,
      widthPct: 0.68,
      heightPct: 0.73,
      upscale: 2
    });

    // 2. Crop header zone (top bar with invoice #, ref total, client: full width, 0% to 26% height)
    const headerCropped = await cropAndPreprocessRegion(base64Image, {
      leftPct: 0.0,
      topPct: 0.0,
      widthPct: 1.0,
      heightPct: 0.26,
      upscale: 2
    });

    const worker = await Tesseract.createWorker('spa+eng');

    try {
      // Step A: Header OCR
      setProcessingProgress(35);
      setStatusMessage('Extrayendo número de factura, cliente y totales de la pantalla...');
      await worker.setParameters({ tessedit_pageseg_mode: '3' as any });
      const retHeader = await worker.recognize(headerCropped);
      const headerText = retHeader.data.text || '';
      parseMetadataFromText(headerText);

      // Determine currency: if REF or $ is detected in header, set currency to USD
      let curr: 'Bs' | 'USD' = detectedCurrency;
      if (headerText.toUpperCase().includes('REF') || headerText.includes('$')) {
        curr = 'USD';
        setDetectedCurrency('USD');
      } else if (headerText.toUpperCase().includes('BS') || headerText.toUpperCase().includes('VES')) {
        curr = 'Bs';
        setDetectedCurrency('Bs');
      }

      // Step B: Table OCR
      setProcessingProgress(65);
      setStatusMessage('Leyendo renglones de la tabla de productos, cantidades y precios...');
      await worker.setParameters({ tessedit_pageseg_mode: '6' as any });
      const retTable = await worker.recognize(tableCropped);
      const tableText = retTable.data.text || '';

      const extracted = parsePosTableRows(tableText, curr, activeRate);

      if (!isProbe) {
        setItems(extracted);
      }
      return extracted;
    } finally {
      await worker.terminate();
    }
  };

  // Standard thermal receipt / paper ticket OCR runner
  const runTicketOCR = async (
    base64Image: string,
    Tesseract: any
  ): Promise<ExtractedInvoiceItem[]> => {
    const processedImage = await preprocessImageForOCR(base64Image);
    const worker = await Tesseract.createWorker('spa+eng');

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: '6' as any,
      });

      setProcessingProgress(50);
      setStatusMessage('Extrayendo renglones de productos y montos del ticket...');
      const ret = await worker.recognize(processedImage);

      const rawText = ret.data.text || '';
      console.log('Ticket OCR Output Raw Text:\n', rawText);
      parseMetadataFromText(rawText);

      setProcessingProgress(80);
      setStatusMessage('Buscando coincidencias en catálogo de productos...');
      const extractedLines = parseLineItemsFromText(rawText);
      setItems(extractedLines);
      return extractedLines;
    } finally {
      await worker.terminate();
    }
  };

  // Process image with OCR engine & Regex heuristics (supports AUTO, TICKET, POS_SCREEN)
  const processImageOCR = async (base64Image: string, forcedMode?: 'AUTO' | 'TICKET' | 'POS_SCREEN') => {
    setIsProcessing(true);
    setProcessingProgress(10);
    setErrorMessage('');
    setItems([]);

    const activeMode = forcedMode || scanMode;

    try {
      const Tesseract = await loadTesseractJs();
      const activeRate = customTasa > 0 ? customTasa : tasaBcv || 1;

      if (activeMode === 'POS_SCREEN') {
        setStatusMessage('Optimizando imagen de pantalla POS / Chinos...');
        const itemsRes = await runPosScreenOCR(base64Image, Tesseract, activeRate);
        setDetectedMode('POS_SCREEN');
        if (itemsRes.length === 0) {
          setErrorMessage('No se pudieron extraer productos en modo Pantalla POS. Puedes probar el modo Ticket o agregar los ítems manualmente.');
        }
      } else if (activeMode === 'TICKET') {
        setStatusMessage('Optimizando contraste para ticket de papel térmico...');
        const itemsRes = await runTicketOCR(base64Image, Tesseract);
        setDetectedMode('TICKET');
        if (itemsRes.length === 0) {
          setErrorMessage('No se detectaron ítems en el ticket. Puedes probar el modo Pantalla POS o agregar los ítems manualmente.');
        }
      } else {
        // 'AUTO' mode: probe POS screen first
        setStatusMessage('Analizando tipo de factura (Ticket o Pantalla POS)...');
        setProcessingProgress(20);

        const posItems = await runPosScreenOCR(base64Image, Tesseract, activeRate, true);
        if (posItems && posItems.length > 0) {
          setDetectedMode('POS_SCREEN');
          setItems(posItems);
        } else {
          // Fall back seamlessly to thermal ticket OCR
          setStatusMessage('Detectado formato Ticket de papel. Extrayendo ítems...');
          const ticketItems = await runTicketOCR(base64Image, Tesseract);
          setDetectedMode('TICKET');
          if (ticketItems.length === 0) {
            setErrorMessage('No se pudieron detectar productos automáticamente. Puedes ajustar los ítems manualmente con el botón "+ Agregar Ítem Manual".');
          }
        }
      }

      setProcessingProgress(100);
      setStatusMessage('Procesamiento completado con éxito.');
    } catch (err: any) {
      console.error('Error durante el OCR:', err);
      setErrorMessage('Ocurrió un inconveniente durante el escaneo automático. Puedes agregar o ajustar los ítems manualmente.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Parse items from OCR lines with Zone Boundaries (Header / Body Items / Footer)
  const parseLineItemsFromText = (rawText: string): ExtractedInvoiceItem[] => {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const parsedItems: ExtractedInvoiceItem[] = [];

    // Complete Noise Keywords
    const headerNoiseKeywords = [
      'RIF', 'J-', 'V-', 'TEL', 'TELEFONO', 'DIRECCION', 'SENIAT', 'GRACIAS',
      'HERMANOS', 'CALLE', 'AVENIDA', 'AV ', 'AV.', 'EDIF', 'PISO', 'LOCAL',
      'URB', 'CARACAS', 'DISTRITO', 'ESTADO', 'RAZON SOCIAL', 'CI/RIF',
      'CAJA', 'CAJERO', 'VENDEDOR', 'CLIENTE', 'SUCURSAL', 'MAKSOUD', 'ARGENTINA',
      'BONALDE', 'PEREZ', 'NO.'
    ];

    const footerNoiseKeywords = [
      'TOTAL', 'SUBTOTAL', 'IVA', 'EXENTO', 'BASE', 'CAMBIO', 'TASA', 'REF',
      'PAGO', 'MOVIL', 'TRANS', 'EFECTIVO', 'TARJETA', 'PAGO MOVIL', 'TIENDA',
      'CREDITO', 'DEBITO', 'BANCO', 'PUNTOS', 'FIRMA', 'SERIAL'
    ];

    // Determine Ticket Zone Boundaries strictly starting at first item line (e.g. "1 x Bs")
    let startItemIndex = 0;
    const firstMatchIdx = lines.findIndex(l => !!l.match(/(?:^|\s)(\d+)\s*[xX*]\s*(?:Bs\.?|\$)?/i));
    if (firstMatchIdx !== -1) {
      startItemIndex = firstMatchIdx;
    } else {
      for (let k = 0; k < lines.length; k++) {
        const u = lines[k].toUpperCase();
        if (u.includes('FECHA') || u.includes('HORA:') || u.includes('CAJERO') || u.includes('VENDEDOR') || u.startsWith('NO.')) {
          startItemIndex = k + 1;
        }
      }
    }

    // Find start of Footer Zone (at EXENTO, TOTAL, BI G, IVA, PAGO MOVIL, CAMBIO)
    let endItemIndex = lines.length;
    for (let k = startItemIndex + 1; k < lines.length; k++) {
      const u = lines[k].toUpperCase();
      if (
        u.startsWith('EXENTO') ||
        u.startsWith('TOTAL') ||
        u.startsWith('BI G') ||
        u.startsWith('IVA G') ||
        u.startsWith('SUBTOTAL') ||
        u.startsWith('TRANS') ||
        u.startsWith('PAGO') ||
        u.startsWith('CAMBIO')
      ) {
        endItemIndex = k;
        break;
      }
    }

    // Safety fallback: Ensure endItemIndex is strictly greater than startItemIndex
    if (endItemIndex <= startItemIndex) {
      endItemIndex = lines.length;
    }

    // Isolate lines inside the Body Items Zone
    const itemZoneLines = lines.slice(startItemIndex, endItemIndex);

    let i = 0;
    while (i < itemZoneLines.length) {
      const line = itemZoneLines[i];
      const uLine = line.toUpperCase();

      // Skip noise lines inside item zone
      if (
        headerNoiseKeywords.some(kw => uLine.includes(kw)) ||
        footerNoiseKeywords.some(kw => (kw === 'REF' ? /\bREF\b/i.test(uLine) : uLine.includes(kw))) ||
        line.startsWith('=') || line.startsWith('-') ||
        uLine.startsWith('NO.') || uLine.startsWith('FECHA')
      ) {
        i++;
        continue;
      }

      // Check Multiline Ticket Pattern (e.g. "4 x Bs 5.596,37   Bs 22.385,48")
      const multilineQtyMatch = line.match(/^(\d+)\s*[xX]\s*(?:Bs\.?|\$)?\s*([\d.,]+)(?:.*?\s*(?:Bs\.?|\$)?\s*([\d.,]+))?/i);

      if (multilineQtyMatch) {
        const boxCount = parseInt(multilineQtyMatch[1]) || 1;
        const p1 = parseVeNumber(multilineQtyMatch[2]);
        const p2 = multilineQtyMatch[3] ? parseVeNumber(multilineQtyMatch[3]) : 0;

        // If p2 exists and is larger than p1, p2 is total line price, otherwise p1 * boxCount
        const linePriceBs = (p2 > p1) ? p2 : (p1 * boxCount);

        // Look ahead for description and package codes in next lines
        let descLine = '';
        let packageCodeText = '';
        let j = i + 1;
        while (j < itemZoneLines.length && j <= i + 3) {
          const nextL = itemZoneLines[j];
          const uNext = nextL.toUpperCase();
          if (
            !headerNoiseKeywords.some(kw => uNext.includes(kw)) &&
            !footerNoiseKeywords.some(kw => uNext.includes(kw)) &&
            !nextL.match(/^(\d+)\s*[xX]/i) &&
            !nextL.match(/^Bs\s*[\d.,]+/i)
          ) {
            if (nextL.startsWith('#[') || nextL.startsWith('[')) {
              packageCodeText += ' ' + nextL;
            } else if (!descLine) {
              descLine = nextL.replace(/[\$\*\#\%\@\=\-\+]/g, ' ').trim();
            }
            i = j; // Advance loop
          } else {
            break;
          }
          j++;
        }

        if (descLine.length >= 3) {
          const pkgMult = extractPackageMultiplier(descLine + ' ' + packageCodeText + ' ' + line);
          const totalUnits = boxCount * pkgMult;

          const activeRate = customTasa > 0 ? customTasa : tasaBcv || 1;
          const unitCostUsd = calculateUnitCostUsd(linePriceBs, totalUnits, detectedCurrency, activeRate);

          // Fuzzy match with catalog
          let bestMatch: Product | null = null;
          let highestScore = 0;

          existingProducts.forEach(prod => {
            const scoreDesc = calculateTextSimilarity(descLine, prod.description || prod.descripcion || '');
            const scoreKey = prod.codigo_barras_clave ? calculateTextSimilarity(descLine, prod.codigo_barras_clave) : 0;
            const score = Math.max(scoreDesc, scoreKey);
            if (score > highestScore) {
              highestScore = score;
              bestMatch = prod;
            }
          });

          parsedItems.push({
            id: `extracted-${parsedItems.length}-${Date.now()}`,
            originalText: descLine.toUpperCase(),
            matchedProductId: highestScore >= 0.20 && bestMatch ? (bestMatch as Product).id : null,
            cantidad: totalUnits,
            precioOriginal: Number(linePriceBs.toFixed(2)),
            precioUsd: unitCostUsd,
            similarityScore: Number(highestScore.toFixed(2)),
            rawCantidad: totalUnits.toString(),
            rawPrecioOriginal: linePriceBs.toFixed(2),
            rawPrecioUsd: unitCostUsd.toFixed(2)
          });
          i++;
          continue;
        }
      }

      // Single-line item pattern inside Item Zone
      const numberMatches = line.match(/(\d+(?:[.,]\d+)?)/g);
      if (numberMatches && numberMatches.length > 0) {
        let descriptionPart = line.replace(/(\d+(?:[.,]\d+)?)/g, '').replace(/[\$\*\#\%\@\=\-\+]/g, ' ').trim();
        const uDesc = descriptionPart.toUpperCase();

        if (
          descriptionPart.length >= 4 &&
          !headerNoiseKeywords.some(kw => uDesc.includes(kw)) &&
          !footerNoiseKeywords.some(kw => uDesc.includes(kw)) &&
          !uDesc.startsWith('NO.')
        ) {
          let boxQty = 1;
          let priceOrig = 0;

          const numValues = numberMatches.map(n => parseVeNumber(n)).filter(n => n > 0);

          if (numValues.length === 1) {
            priceOrig = numValues[0];
          } else if (numValues.length >= 2) {
            if (numValues[0] <= 50 && Number.isInteger(numValues[0])) {
              boxQty = numValues[0];
              priceOrig = numValues[numValues.length - 1];
            } else {
              priceOrig = numValues[numValues.length - 1];
            }
          }

          if (priceOrig > 0) {
            const pkgMult = extractPackageMultiplier(line + ' ' + (itemZoneLines[i + 1] || ''));
            const totalUnits = boxQty * pkgMult;

            const activeRate = customTasa > 0 ? customTasa : tasaBcv || 1;
            const unitCostUsd = calculateUnitCostUsd(priceOrig, totalUnits, detectedCurrency, activeRate);

            let bestMatch: Product | null = null;
            let highestScore = 0;

            existingProducts.forEach(prod => {
              const scoreDesc = calculateTextSimilarity(descriptionPart, prod.description || prod.descripcion || '');
              const scoreKey = prod.codigo_barras_clave ? calculateTextSimilarity(descriptionPart, prod.codigo_barras_clave) : 0;
              const score = Math.max(scoreDesc, scoreKey);
              if (score > highestScore) {
                highestScore = score;
                bestMatch = prod;
              }
            });

            parsedItems.push({
              id: `extracted-${parsedItems.length}-${Date.now()}`,
              originalText: descriptionPart.toUpperCase(),
              matchedProductId: highestScore >= 0.20 && bestMatch ? (bestMatch as Product).id : null,
              cantidad: totalUnits,
              precioOriginal: Number(priceOrig.toFixed(2)),
              precioUsd: unitCostUsd,
              similarityScore: Number(highestScore.toFixed(2)),
              rawCantidad: totalUnits.toString(),
              rawPrecioOriginal: priceOrig.toFixed(2),
              rawPrecioUsd: unitCostUsd.toFixed(2)
            });
          }
        }
      }

      i++;
    }

    return parsedItems;
  };

  // Handler: Update Item Cantidad (Raw string + fluid typing)
  const handleUpdateItemCantidad = (id: string, rawVal: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const cleanedVal = rawVal.replace(/[^0-9]/g, '');
      const parsedNum = parseInt(cleanedVal);
      const newQty = (isNaN(parsedNum) || parsedNum <= 0) ? 0 : parsedNum;
      const effectiveQty = newQty > 0 ? newQty : 1;

      const activeRate = customTasa > 0 ? customTasa : tasaBcv || 1;
      const newUnitUsd = calculateUnitCostUsd(item.precioOriginal, effectiveQty, detectedCurrency, activeRate);

      return {
        ...item,
        cantidad: newQty,
        rawCantidad: rawVal,
        precioUsd: newUnitUsd,
        rawPrecioUsd: newUnitUsd > 0 ? newUnitUsd.toFixed(2) : ''
      };
    }));
  };

  // Handler: Update Item Precio Original (Total Line Price in Bs / USD)
  const handleUpdateItemPrecioOriginal = (id: string, rawVal: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const cleanedVal = rawVal.replace(/[^0-9.,]/g, '');
      const parsedNum = parseVeNumber(cleanedVal);
      const newTotal = isNaN(parsedNum) ? 0 : parsedNum;
      const effectiveQty = item.cantidad > 0 ? item.cantidad : 1;

      const activeRate = customTasa > 0 ? customTasa : tasaBcv || 1;
      const newUnitUsd = calculateUnitCostUsd(newTotal, effectiveQty, detectedCurrency, activeRate);

      return {
        ...item,
        precioOriginal: newTotal,
        rawPrecioOriginal: rawVal,
        precioUsd: newUnitUsd,
        rawPrecioUsd: newUnitUsd > 0 ? newUnitUsd.toFixed(2) : ''
      };
    }));
  };

  // Handler: Update Item Costo Unitario USD ($) directly
  const handleUpdateItemPrecioUsd = (id: string, rawVal: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const cleanedVal = rawVal.replace(/[^0-9.,]/g, '');
      const parsedNum = parseVeNumber(cleanedVal);
      const newUnitUsd = isNaN(parsedNum) ? 0 : parsedNum;
      const effectiveQty = item.cantidad > 0 ? item.cantidad : 1;
      const activeRate = customTasa > 0 ? customTasa : tasaBcv || 1;

      const newTotalBsOrUsd = detectedCurrency === 'Bs'
        ? Number((newUnitUsd * effectiveQty * activeRate).toFixed(2))
        : Number((newUnitUsd * effectiveQty).toFixed(2));

      return {
        ...item,
        precioUsd: newUnitUsd,
        rawPrecioUsd: rawVal,
        precioOriginal: newTotalBsOrUsd,
        rawPrecioOriginal: newTotalBsOrUsd > 0 ? newTotalBsOrUsd.toFixed(2) : ''
      };
    }));
  };

  // Handler: Update Generic Field
  const handleUpdateItemField = (id: string, field: keyof ExtractedInvoiceItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      return { ...item, [field]: value };
    }));
  };

  // Handle Currency change
  const handleCurrencyChange = (newCurr: 'Bs' | 'USD') => {
    setDetectedCurrency(newCurr);
    const activeRate = customTasa > 0 ? customTasa : tasaBcv || 1;

    setItems(prev => prev.map(item => {
      const qty = item.cantidad > 0 ? item.cantidad : 1;
      const unitUsd = calculateUnitCostUsd(item.precioOriginal, qty, newCurr, activeRate);
      return {
        ...item,
        precioUsd: unitUsd,
        rawPrecioUsd: unitUsd > 0 ? unitUsd.toFixed(2) : ''
      };
    }));
  };

  // Remove item row
  const handleRemoveRow = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // Add Manual Blank Row
  const handleAddBlankRow = () => {
    setItems(prev => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        originalText: 'NUEVO ÍTEM',
        matchedProductId: null,
        cantidad: 1,
        precioOriginal: 0,
        precioUsd: 0,
        similarityScore: 0,
        rawCantidad: '1',
        rawPrecioOriginal: '',
        rawPrecioUsd: ''
      }
    ]);
  };

  // Clear all items and reset list
  const handleClearAllItems = () => {
    if (items.length > 0 && !window.confirm('¿Deseas vaciar todos los ítems de la lista extraída?')) {
      return;
    }
    setItems([]);
    setInvoiceNumber('');
    setControlNumber('');
    setImageSrc(null);
  };

  // Open Quick Create Modal for a row
  const handleOpenQuickCreate = (item: ExtractedInvoiceItem, customName?: string) => {
    setQuickCreateRowId(item.id);
    setNewProdDesc((customName && customName.trim() ? customName.trim() : item.originalText).toUpperCase());
    setNewProdCostUsd(item.precioUsd > 0 ? item.precioUsd : 1.0);
    setNewProdDetailUsd(Number(((item.precioUsd > 0 ? item.precioUsd : 1.0) * 1.30).toFixed(2)));
    setNewProdMayorUsd(Number(((item.precioUsd > 0 ? item.precioUsd : 1.0) * 1.15).toFixed(2)));
    setShowQuickCreate(true);
  };

  // Save Quick New Product
  const handleSaveQuickProduct = async () => {
    if (!newProdDesc.trim()) {
      alert('Debe escribir una descripción para el producto.');
      return;
    }

    const newProdData: Partial<Product> = {
      description: newProdDesc.trim().toUpperCase(),
      barcode: `FAST-${Date.now().toString().slice(-6)}`,
      category: 'GENERAL',
      stock_actual: 0,
      stock_minimo: 5,
      precio_costo_usd: newProdCostUsd,
      precio_detalle_usd: newProdDetailUsd,
      precio_mayor_usd: newProdMayorUsd,
      cantidad_mayorista: 6,
      exento_impuesto: true,
      estado: 'Activo',
      imagen_url: ''
    };

    if (onAddNewProductFast) {
      const created = await onAddNewProductFast(newProdData);
      if (created && quickCreateRowId) {
        handleUpdateItemField(quickCreateRowId, 'matchedProductId', created.id);
        handleUpdateItemField(quickCreateRowId, 'similarityScore', 1.0);
      }
    } else {
      const mockId = Date.now();
      const mockProd: Product = { ...(newProdData as Product), id: mockId };
      existingProducts.push(mockProd);
      if (quickCreateRowId) {
        handleUpdateItemField(quickCreateRowId, 'matchedProductId', mockId);
        handleUpdateItemField(quickCreateRowId, 'similarityScore', 1.0);
      }
    }

    setShowQuickCreate(false);
    setQuickCreateRowId(null);
  };

  // Consolidate & Apply to parent Invoice modal
  const handleApply = () => {
    const validItems: {
      product: Product;
      qty: number;
      precio_costo_usd: number;
      precio_detalle_usd: number;
      precio_mayor_usd: number;
    }[] = [];

    items.forEach(item => {
      if (!item.matchedProductId) return;
      const catalogProd = existingProducts.find(p => p.id === item.matchedProductId);
      if (catalogProd) {
        validItems.push({
          product: catalogProd,
          qty: item.cantidad > 0 ? item.cantidad : 1,
          precio_costo_usd: item.precioUsd > 0 ? item.precioUsd : catalogProd.precio_costo_usd,
          precio_detalle_usd: catalogProd.precio_detalle_usd,
          precio_mayor_usd: catalogProd.precio_mayor_usd
        });
      }
    });

    if (validItems.length === 0) {
      alert('No has seleccionado ningún producto coincidente para cargar a la factura.');
      return;
    }

    onApplyToInvoice({
      invoiceNumber: invoiceNumber.trim(),
      controlNumber: controlNumber.trim(),
      currency: detectedCurrency,
      tasaCambio: customTasa,
      items: validItems
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Estilo Ejecutivo WinterPos */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-6 py-4 text-white flex items-center justify-between border-b border-slate-800 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 backdrop-blur-md rounded-xl border border-indigo-400/30">
              <Camera className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-wide font-sans text-white flex items-center gap-2">
                Escaneo Inteligente de Factura / Ticket (OCR)
              </h2>
              <p className="text-xs text-slate-300 font-sans mt-0.5">
                Toma o sube una foto de tu factura/ticket (Chinos, proveedores) para extraer productos, cantidades y precios en Bs. o $.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 p-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 font-sans">
          
          {/* Section 1: Image Upload / Capture Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left Box: Photo Upload Controls */}
            <div className="md:col-span-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2 font-sans">
                  <ImageIcon className="w-4 h-4 text-indigo-600" />
                  1. Cargar Foto o Ticket
                </h3>

                {/* Mode Selector Tabs */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 font-sans">
                      Modo de Escaneo
                    </span>
                    {detectedMode && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        detectedMode === 'POS_SCREEN'
                          ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      }`}>
                        {detectedMode === 'POS_SCREEN' ? '🖥️ Pantalla POS' : '🧾 Ticket Impreso'}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleModeChange('AUTO')}
                      disabled={isProcessing}
                      className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer ${
                        scanMode === 'AUTO'
                          ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Detecta automáticamente si es ticket de papel o pantalla POS"
                    >
                      <span>✨</span> Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange('TICKET')}
                      disabled={isProcessing}
                      className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer ${
                        scanMode === 'TICKET'
                          ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Optimizado para tickets de papel térmico y facturas impresas"
                    >
                      <span>🧾</span> Ticket
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange('POS_SCREEN')}
                      disabled={isProcessing}
                      className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer ${
                        scanMode === 'POS_SCREEN'
                          ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Optimizado para fotos de monitores o sistemas POS de proveedores chinos"
                    >
                      <span>🖥️</span> Pantalla
                    </button>
                  </div>
                </div>

                {/* Dropzone / Preview */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-3 text-center transition-all flex flex-col items-center justify-center min-h-[170px] relative overflow-hidden group ${
                    isDragging
                      ? 'border-indigo-600 bg-indigo-50/70 scale-[1.02] shadow-md ring-4 ring-indigo-200'
                      : imageSrc
                      ? 'border-slate-300 bg-slate-900/5'
                      : 'border-slate-300 hover:border-indigo-500 bg-slate-50 hover:bg-indigo-50/20 cursor-pointer'
                  }`}
                  onClick={() => {
                    if (!imageSrc) fileInputRef.current?.click();
                  }}
                >
                  {isDragging ? (
                    <div className="flex flex-col items-center justify-center text-indigo-900 animate-pulse py-4">
                      <Upload className="w-10 h-10 mb-2 text-indigo-600 animate-bounce" />
                      <p className="text-xs font-black">¡Suelta la factura aquí para escanear!</p>
                    </div>
                  ) : imageSrc ? (
                    <div className="relative w-full h-44 flex items-center justify-center rounded-xl overflow-hidden bg-slate-900 shadow-inner group">
                      <img
                        src={imageSrc}
                        alt="Factura escaneada"
                        className="max-h-full max-w-full object-contain cursor-pointer transition-transform duration-200 group-hover:scale-105"
                        onClick={() => {
                          setImageZoom(1);
                          setImageRotation(0);
                          setShowEnlargedImage(true);
                        }}
                        title="Haz clic para ver foto ampliada y comparar con la lista"
                      />

                      {/* Hover Overlay with options */}
                      <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex flex-col items-center justify-center gap-2 text-white p-2 pointer-events-none">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setImageZoom(1);
                            setImageRotation(0);
                            setShowEnlargedImage(true);
                          }}
                          className="pointer-events-auto bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-md flex items-center gap-1.5 transition-all transform hover:scale-105 cursor-pointer"
                        >
                          <ZoomIn className="w-4 h-4" />
                          <span>Ampliar y Comparar</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          className="pointer-events-auto bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold py-1 px-2.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Cambiar Foto</span>
                        </button>
                      </div>

                      {/* Small badge button on bottom right */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageZoom(1);
                          setImageRotation(0);
                          setShowEnlargedImage(true);
                        }}
                        className="absolute bottom-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 backdrop-blur-xs border border-white/20 shadow-sm cursor-pointer"
                        title="Ver foto ampliada"
                      >
                        <Eye className="w-3.5 h-3.5 text-indigo-300" />
                        <span>Ver Ampliada</span>
                      </button>
                    </div>
                  ) : (
                    <div className="py-4">
                      <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-slate-700">Arrastra tu factura o haz clic aquí</p>
                      <p className="text-[10px] text-slate-400 font-sans mt-1">Formatos: JPG, PNG, WEBP</p>
                    </div>
                  )}
                </div>

                {/* Botón rápido debajo de la imagen para abrir la vista ampliada */}
                {imageSrc && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageZoom(1);
                      setImageRotation(0);
                      setShowEnlargedImage(true);
                    }}
                    className="w-full mt-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold py-1.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <ZoomIn className="w-4 h-4 text-indigo-600" />
                    <span>Ver Foto Ampliada para Comparar</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isProcessing}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" /> Tomar Foto
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-slate-300 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" /> Subir Archivo
                  </button>
                </div>
              </div>

              {/* Status & Loader */}
              {isProcessing && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2 mt-3">
                  <div className="flex justify-between items-center text-xs font-bold text-indigo-900 font-sans">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      Procesando OCR...
                    </span>
                    <span className="font-mono text-indigo-800">{processingProgress}%</span>
                  </div>
                  <div className="w-full bg-indigo-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${processingProgress}%` }} />
                  </div>
                  <p className="text-[11px] text-indigo-700 font-sans italic">{statusMessage}</p>
                </div>
              )}

              {errorMessage && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2 text-rose-800 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {/* Right Box: Invoice Metadata & Currency Settings */}
            <div className="md:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2 font-sans">
                  <Tag className="w-4 h-4 text-indigo-600" />
                  2. Datos y Moneda de la Factura
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {/* N° Factura */}
                  <div>
                    <label className="text-[11px] uppercase font-bold text-slate-600 block mb-1 font-sans">
                      N° Factura
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
                      placeholder="Ej: 000123"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200 focus:bg-white"
                    />
                  </div>

                  {/* N° Control */}
                  <div>
                    <label className="text-[11px] uppercase font-bold text-slate-600 block mb-1 font-sans">
                      N° Control
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      value={controlNumber}
                      onChange={(e) => setControlNumber(e.target.value.toUpperCase())}
                      placeholder="Ej: 00456"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200 focus:bg-white"
                    />
                  </div>

                  {/* Moneda de la Factura */}
                  <div>
                    <label className="text-[11px] uppercase font-bold text-slate-600 block mb-1 font-sans">
                      Moneda Factura
                    </label>
                    <div className="flex rounded-xl overflow-hidden border border-slate-300">
                      <button
                        type="button"
                        onClick={() => handleCurrencyChange('Bs')}
                        className={`flex-1 py-1.5 text-xs font-black transition-all cursor-pointer ${
                          detectedCurrency === 'Bs' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold'
                        }`}
                      >
                        Bs. (VES)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCurrencyChange('USD')}
                        className={`flex-1 py-1.5 text-xs font-black transition-all cursor-pointer ${
                          detectedCurrency === 'USD' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold'
                        }`}
                      >
                        $ (USD)
                      </button>
                    </div>
                  </div>

                  {/* Selector Modo de Tasa & Tasa de Cambio (Bs/$) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] uppercase font-bold text-slate-600 block font-sans">
                        Tasa de Cambio (Bs/$)
                      </label>
                      {loadingBcv && (
                        <span className="text-[10px] text-indigo-600 font-sans font-medium flex items-center gap-1 animate-pulse">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" /> BCV...
                        </span>
                      )}
                    </div>

                    {/* Pastillas de Selección de Tasa */}
                    <div className="flex rounded-lg overflow-hidden border border-slate-300 text-[10px] font-bold mb-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectTasaTipo('USD_BCV')}
                        className={`flex-1 py-1 px-1 transition-all text-center cursor-pointer ${
                          tasaTipo === 'USD_BCV' ? 'bg-indigo-600 text-white font-black shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title={bcvRates?.usd ? `Tasa Oficial BCV USD: ${bcvRates.usd.toFixed(2)} Bs` : 'Tasa Dólar Oficial'}
                      >
                        $ BCV
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTasaTipo('EUR_BCV')}
                        className={`flex-1 py-1 px-1 transition-all text-center cursor-pointer ${
                          tasaTipo === 'EUR_BCV' ? 'bg-blue-600 text-white font-black shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title={bcvRates?.eur ? `Tasa Oficial BCV Euro: ${bcvRates.eur.toFixed(2)} Bs` : 'Tasa Euro Oficial'}
                      >
                        € Euro
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTasaTipo('MANUAL')}
                        className={`flex-1 py-1 px-1 transition-all text-center cursor-pointer ${
                          tasaTipo === 'MANUAL' ? 'bg-amber-600 text-white font-black shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title="Ingresar tasa personalizada manualmente"
                      >
                        Manual
                      </button>
                    </div>

                    <input
                      type="number"
                      step="0.01"
                      value={customTasaInput}
                      onChange={(e) => handleInputChangeTasa(e.target.value)}
                      readOnly={tasaTipo !== 'MANUAL'}
                      className={`w-full border rounded-xl px-3 py-1 text-xs font-mono font-bold transition-all ${
                        tasaTipo !== 'MANUAL'
                          ? 'bg-slate-100 text-slate-700 border-slate-300'
                          : 'bg-white text-slate-900 border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 font-black'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Information Banner */}
              <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-indigo-950 font-sans font-medium">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>
                    {detectedCurrency === 'Bs'
                      ? `Los precios detectados en Bolívares (Bs) se convertirán a Dólares ($ USD) divididos entre la Tasa de ${Number(customTasa.toFixed(2)).toFixed(2)} Bs/$.`
                      : `Los precios detectados se registrarán directamente en Dólares ($ USD).`}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Section 3: Product Matching & Verification Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-slate-100/90 px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 font-sans">
                <Calculator className="w-4 h-4 text-indigo-600" />
                3. Matriz de Coincidencia e Ítems Extraídos ({items.length} ítems)
              </h3>
              <div className="flex items-center gap-2">
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllItems}
                    className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[11px] px-3 py-1 rounded-lg flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                    title="Vaciar la lista completa de ítems extraídos"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Limpiar Lista
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddBlankRow}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[11px] px-3 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Ítem Manual
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs font-sans">
                <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-600 sticky top-0 z-10 border-b border-slate-200 font-sans">
                  <tr>
                    <th className="px-3 py-2.5 w-[20%]">Texto en Foto (OCR)</th>
                    <th className="px-3 py-2.5 w-[32%]">Producto Coincidente en Catálogo</th>
                    <th className="px-2 py-2.5 text-center w-[9%]">Cant. Unid.</th>
                    <th className="px-2 py-2.5 text-right w-[17%]">Total Línea ({detectedCurrency})</th>
                    <th className="px-2 py-2.5 text-right w-[16%] bg-indigo-50/70 text-indigo-950 font-black">Costo Unit. USD ($)</th>
                    <th className="px-2 py-2.5 text-center w-[6%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic font-sans">
                        No hay ítems aún. Toma una foto o presiona "Agregar Ítem Manual" para armar la lista.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      return (
                        <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${!item.matchedProductId ? 'bg-amber-50/30' : ''}`}>
                          {/* Texto Extraído */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={item.originalText}
                              onChange={(e) => handleUpdateItemField(item.id, 'originalText', e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200 focus:bg-white rounded-lg px-2 py-1 text-xs font-bold text-slate-800 font-sans"
                            />
                          </td>

                          {/* Coincidencia Catálogo (Buscador amigable estilo Caja POS) */}
                          <td className="px-3 py-2">
                            <ProductCatalogSearchCell
                              item={item}
                              existingProducts={existingProducts}
                              tasaCambio={customTasa}
                              onSelectProduct={(productId, score) => {
                                handleUpdateItemField(item.id, 'matchedProductId', productId);
                                handleUpdateItemField(item.id, 'similarityScore', score);
                              }}
                              onOpenQuickCreate={(customName) => handleOpenQuickCreate(item, customName)}
                            />
                          </td>

                          {/* Cantidad (Unidades) */}
                          <td className="px-2 py-2 text-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={item.rawCantidad !== undefined ? item.rawCantidad : (item.cantidad || '')}
                              onChange={(e) => handleUpdateItemCantidad(item.id, e.target.value)}
                              onBlur={() => {
                                if (!item.cantidad || item.cantidad <= 0) {
                                  handleUpdateItemCantidad(item.id, '1');
                                } else {
                                  handleUpdateItemCantidad(item.id, item.cantidad.toString());
                                }
                              }}
                              placeholder="1"
                              className="w-16 text-center font-mono font-bold border border-slate-300 rounded-lg px-1 py-1 text-xs bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200 focus:outline-none"
                            />
                          </td>

                          {/* Precio Total (Bs / USD) - Ampliado a w-36 para montos completos */}
                          <td className="px-2 py-2 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.rawPrecioOriginal !== undefined ? item.rawPrecioOriginal : (item.precioOriginal ? item.precioOriginal.toString() : '')}
                              onChange={(e) => handleUpdateItemPrecioOriginal(item.id, e.target.value)}
                              onBlur={() => {
                                handleUpdateItemPrecioOriginal(item.id, item.precioOriginal ? item.precioOriginal.toString() : '0.00');
                              }}
                              placeholder="0.00"
                              className="w-36 text-right font-mono font-bold border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200 focus:outline-none"
                            />
                          </td>

                          {/* Costo Unitario USD ($) */}
                          <td className="px-2 py-2 text-right bg-indigo-50/30">
                            <div className="flex flex-col items-end">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={item.rawPrecioUsd !== undefined ? item.rawPrecioUsd : (item.precioUsd ? item.precioUsd.toFixed(2) : '')}
                                onChange={(e) => handleUpdateItemPrecioUsd(item.id, e.target.value)}
                                onBlur={() => {
                                  handleUpdateItemPrecioUsd(item.id, item.precioUsd ? item.precioUsd.toFixed(2) : '0.00');
                                }}
                                placeholder="0.00"
                                className="w-28 text-right font-mono font-black text-indigo-950 border border-indigo-300 rounded-lg px-2 py-1 text-xs bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200 focus:outline-none"
                              />
                              {item.precioOriginal > 0 && (
                                <span className="text-[10px] font-mono font-bold text-indigo-700 mt-0.5">
                                  Línea: ${(detectedCurrency === 'Bs' ? (item.precioOriginal / (customTasa || 1)) : item.precioOriginal).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Action */}
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(item.id)}
                              className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Eliminar fila"
                            >
                              <Trash2 className="w-4 h-4" />
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

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-slate-700 font-extrabold text-xs hover:bg-slate-200 transition-all border border-slate-300"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={items.filter(i => !!i.matchedProductId).length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Transferir {items.filter(i => !!i.matchedProductId).length} Ítems a Factura</span>
          </button>
        </div>

      </div>

      {/* Mini Modal: Quick Create Product */}
      {showQuickCreate && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 font-sans">
            <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-5 py-3.5 text-white flex justify-between items-center border-b border-slate-800">
              <h4 className="text-sm font-extrabold text-white font-sans flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" /> Registrar Nuevo Producto en Catálogo
              </h4>
              <button
                type="button"
                onClick={() => setShowQuickCreate(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-sans font-bold text-slate-700 block mb-1">Descripción del Producto</label>
                <input
                  type="text"
                  value={newProdDesc}
                  onChange={(e) => setNewProdDesc(e.target.value.toUpperCase())}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold uppercase focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-sans font-bold text-slate-700 block mb-1">Costo ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProdCostUsd}
                    onChange={(e) => {
                      const cost = parseFloat(e.target.value) || 0;
                      setNewProdCostUsd(cost);
                      setNewProdDetailUsd(Number((cost * 1.30).toFixed(2)));
                      setNewProdMayorUsd(Number((cost * 1.15).toFixed(2)));
                    }}
                    className="w-full border border-slate-300 rounded-xl px-2 py-1.5 font-mono font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-sans font-bold text-slate-700 block mb-1">Detalle ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProdDetailUsd}
                    onChange={(e) => setNewProdDetailUsd(parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-300 rounded-xl px-2 py-1.5 font-mono font-bold text-emerald-700 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-sans font-bold text-slate-700 block mb-1">Mayor ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProdMayorUsd}
                    onChange={(e) => setNewProdMayorUsd(parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-300 rounded-xl px-2 py-1.5 font-mono font-bold text-blue-700 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowQuickCreate(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveQuickProduct}
                className="px-5 py-2 text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Guardar y Seleccionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VISTA AMPLIADA / COMPARADOR DE FACTURA */}
      {showEnlargedImage && imageSrc && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col animate-in fade-in duration-200 font-sans">
          {/* Top Bar with Controls */}
          <div className="bg-slate-900/95 border-b border-slate-800 px-6 py-3 flex items-center justify-between text-white flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-400">
                <ZoomIn className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold tracking-wide font-sans text-white flex items-center gap-2">
                  Vista Ampliada de Factura / Ticket
                  <span className="bg-indigo-500/30 text-indigo-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-indigo-400/30">
                    {Math.round(imageZoom * 100)}%
                  </span>
                </h3>
                <p className="text-[11px] text-slate-300 font-sans">
                  Compara visualmente los ítems, descripciones y montos con la lista de la factura
                </p>
              </div>
            </div>

            {/* Zoom / Rotate Actions */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
                <button
                  type="button"
                  onClick={() => setImageZoom(prev => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}
                  className="p-1.5 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg transition-colors cursor-pointer"
                  title="Alejar (-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImageZoom(1);
                    setImageRotation(0);
                  }}
                  className="px-2.5 py-1 text-xs font-mono font-bold hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                  title="Restablecer zoom al 100%"
                >
                  {Math.round(imageZoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setImageZoom(prev => Math.min(4, Number((prev + 0.25).toFixed(2))))}
                  className="p-1.5 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg transition-colors cursor-pointer"
                  title="Acercar (+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setImageRotation(prev => (prev + 90) % 360)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                title="Girar 90 grados"
              >
                <RotateCw className="w-4 h-4" />
                <span className="hidden sm:inline">Girar 90°</span>
              </button>

              <button
                type="button"
                onClick={() => setShowEnlargedImage(false)}
                className="p-2 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl transition-colors ml-2 cursor-pointer shadow-sm"
                title="Cerrar vista ampliada (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Interactive Zoomable Viewport */}
          <div
            className="flex-1 overflow-auto p-4 flex items-center justify-center select-none"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowEnlargedImage(false);
              }
            }}
          >
            <div
              className="relative max-w-full max-h-full transition-transform duration-150 ease-out flex items-center justify-center"
              style={{
                transform: `scale(${imageZoom}) rotate(${imageRotation}deg)`,
                transformOrigin: 'center center'
              }}
            >
              <img
                src={imageSrc}
                alt="Factura completa ampliada"
                className="max-h-[82vh] max-w-[90vw] object-contain rounded-xl shadow-2xl border border-slate-700"
              />
            </div>
          </div>

          {/* Bottom helper tip */}
          <div className="bg-slate-900/90 border-t border-slate-800 py-2 px-6 text-center text-xs text-slate-400 font-sans flex items-center justify-center gap-3">
            <span>💡 <strong>Tip:</strong> Puedes alejar o acercar con los botones superiores o presionar <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 font-mono text-[10px]">ESC</kbd> para volver.</span>
            <button
              type="button"
              onClick={() => setShowEnlargedImage(false)}
              className="text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
            >
              Volver a la edición
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
