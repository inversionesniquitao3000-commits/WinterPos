import React, { useState, useRef, useEffect } from 'react';
import {
  Camera, Upload, CheckCircle2, AlertTriangle, Trash2, Plus, RefreshCw,
  Tag, ShieldCheck, Calculator, X, Image as ImageIcon
} from 'lucide-react';
import type { Product } from '../types';
import { getApiBaseUrl } from '../utils';

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

export default function ModalEscaneoFotoFactura({
  isOpen,
  onClose,
  onApplyToInvoice,
  existingProducts = [],
  tasaBcv = 1.0,
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

  // Invoice Metadata Extracted
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [controlNumber, setControlNumber] = useState('');
  const [detectedCurrency, setDetectedCurrency] = useState<'Bs' | 'USD'>('Bs');
  
  // Rate Selection Mode: $ BCV, Euro BCV, or Manual
  const [tasaTipo, setTasaTipo] = useState<'USD_BCV' | 'EUR_BCV' | 'MANUAL'>('USD_BCV');
  const [customTasa, setCustomTasa] = useState<number>(tasaBcv > 0 ? Number(tasaBcv.toFixed(2)) : 1);
  const [customTasaInput, setCustomTasaInput] = useState<string>(tasaBcv > 0 ? tasaBcv.toFixed(2) : '1.00');
  const [bcvRates, setBcvRates] = useState<{ usd: number; eur: number } | null>(null);
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

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  // Query live BCV rates ($ USD & € EUR) when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const fetchBcv = async () => {
      setLoadingBcv(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/bcv`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          if (data && (data.usd || data.eur)) {
            const usdRate = Number((data.usd || tasaBcv || 1).toFixed(2));
            const eurRate = Number((data.eur || (usdRate * 1.08) || tasaBcv || 1).toFixed(2));
            setBcvRates({ usd: usdRate, eur: eurRate });

            if (tasaTipo === 'USD_BCV') {
              setCustomTasaInput(usdRate.toFixed(2));
              setCustomTasa(usdRate);
            } else if (tasaTipo === 'EUR_BCV') {
              setCustomTasaInput(eurRate.toFixed(2));
              setCustomTasa(eurRate);
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
      setCustomTasa(Number(formatted));
    }
  }, [tasaBcv]);

  // Switch rate mode handler ($ BCV, Euro BCV, Manual)
  const handleSelectTasaTipo = (tipo: 'USD_BCV' | 'EUR_BCV' | 'MANUAL') => {
    setTasaTipo(tipo);
    if (tipo === 'USD_BCV') {
      const valNum = bcvRates?.usd || tasaBcv || 1;
      const valStr = valNum.toFixed(2);
      setCustomTasaInput(valStr);
      handleTasaChange(parseFloat(valStr));
    } else if (tipo === 'EUR_BCV') {
      const valNum = bcvRates?.eur || (tasaBcv * 1.08) || 1;
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

  // Process image with OCR engine & Regex heuristics
  const processImageOCR = async (base64Image: string) => {
    setIsProcessing(true);
    setProcessingProgress(10);
    setStatusMessage('Optimizando contraste y legibilidad del ticket...');
    setErrorMessage('');
    setItems([]);

    try {
      // Preprocess image contrast for thermal ticket readability
      const processedImage = await preprocessImageForOCR(base64Image);

      // 1. Try Tesseract OCR
      const Tesseract = await loadTesseractJs();
      setProcessingProgress(35);
      setStatusMessage('Analizando la factura y leyendo textos...');

      const worker = await Tesseract.createWorker('spa+eng');
      // Set PSM 6 = Assume a single uniform block of text (prevents Tesseract from column-splitting receipts)
      await worker.setParameters({
        tessedit_pageseg_mode: '6' as any,
      });

      setProcessingProgress(55);
      setStatusMessage('Extrayendo renglones de productos y montos...');

      const ret = await worker.recognize(processedImage);
      await worker.terminate();

      const rawText = ret.data.text || '';
      console.log('OCR Output Raw Text:\n', rawText);
      setProcessingProgress(80);
      setStatusMessage('Buscando coincidencias en catálogo de productos...');

      // 2. Parse Invoice Metadata (N° Factura, N° Control, Currency)
      parseMetadataFromText(rawText);

      // 3. Parse Line Items
      const extractedLines = parseLineItemsFromText(rawText);
      setItems(extractedLines);

      setProcessingProgress(100);
      setStatusMessage('Procesamiento completado con éxito.');
    } catch (err: any) {
      console.error('Error durante el OCR:', err);
      setErrorMessage('No se pudo procesar la imagen automáticamente. Puedes agregar o ajustar los ítems manualmente.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Parse N° Factura, N° Control, Currency from raw text
  const parseMetadataFromText = (rawText: string) => {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

    // Currency Detection
    const uppercaseText = rawText.toUpperCase();
    if (uppercaseText.includes('BS ') || uppercaseText.includes('BS.') || uppercaseText.includes('BOLIVARES') || uppercaseText.includes('VES')) {
      setDetectedCurrency('Bs');
    } else if (uppercaseText.includes('USD') || uppercaseText.includes('$')) {
      setDetectedCurrency('USD');
    } else {
      setDetectedCurrency('Bs');
    }

    // Invoice & Control Numbers Regex heuristics
    let foundFac = '';
    let foundCtrl = '';

    for (const line of lines) {
      const uLine = line.toUpperCase();
      if (!foundFac && (uLine.startsWith('NO.') || uLine.includes('FACTURA') || uLine.includes('FAC') || uLine.includes('NRO') || uLine.includes('NUMERO'))) {
        const match = line.match(/(?:FACTURA|FAC|NRO|NO\.|N°|#|\s)[:.\s]*([A-Z0-9-]{3,12})/i);
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

    if (foundFac) setInvoiceNumber(foundFac.slice(0, 10));
    if (foundCtrl) setControlNumber(foundCtrl.slice(0, 10));
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

  // Helper: Recalculate Unit Cost USD from total line price and quantity
  const calculateUnitCostUsd = (totalBsOrUsd: number, qty: number, currency: 'Bs' | 'USD', rate: number): number => {
    const safeQty = qty > 0 ? qty : 1;
    const safeRate = rate > 0 ? rate : 1;
    const totalUsd = currency === 'Bs' ? (totalBsOrUsd / safeRate) : totalBsOrUsd;
    return Number((totalUsd / safeQty).toFixed(2));
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
        footerNoiseKeywords.some(kw => uLine.includes(kw)) ||
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
  const handleOpenQuickCreate = (item: ExtractedInvoiceItem) => {
    setQuickCreateRowId(item.id);
    setNewProdDesc(item.originalText.toUpperCase());
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
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 px-6 py-4 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
              <Camera className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wide font-sans flex items-center gap-2">
                ESCANEO INTELIGENTE DE FACTURA / TICKET (OCR)
                <span className="bg-emerald-500/30 text-emerald-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-400/30">
                  IA VISION 2.0
                </span>
              </h2>
              <p className="text-xs text-emerald-100/90 font-sans">
                Toma o sube una foto de tu factura/ticket (Chinos, proveedores) para extraer productos, cantidades y precios en Bs. o $.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all focus:outline-none disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
          
          {/* Section 1: Image Upload / Capture Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left Box: Photo Upload Controls */}
            <div className="md:col-span-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-xs font-mono font-extrabold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                  1. Cargar Foto o Ticket
                </h3>

                {/* Dropzone / Preview */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[160px] relative overflow-hidden group ${
                    isDragging
                      ? 'border-emerald-600 bg-emerald-100/60 scale-[1.02] shadow-md ring-4 ring-emerald-200'
                      : imageSrc
                      ? 'border-emerald-500 bg-emerald-50/20'
                      : 'border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/10'
                  }`}
                >
                  {isDragging ? (
                    <div className="flex flex-col items-center justify-center text-emerald-900 animate-pulse py-4">
                      <Upload className="w-10 h-10 mb-2 text-emerald-600 animate-bounce" />
                      <p className="text-xs font-black">¡Suelta la factura aquí para escanear!</p>
                    </div>
                  ) : imageSrc ? (
                    <div className="relative w-full h-40 flex items-center justify-center">
                      <img src={imageSrc} alt="Factura escaneada" className="max-h-full max-w-full object-contain rounded-lg shadow-sm" />
                      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center text-white text-xs font-bold gap-2">
                        <RefreshCw className="w-4 h-4" /> Cambiar Imagen
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-slate-700">Arrastra tu factura o haz clic aquí</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">Formatos: JPG, PNG, WEBP</p>
                    </>
                  )}
                </div>

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
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  >
                    <Camera className="w-4 h-4" /> Tomar Foto
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-slate-300 transition-all"
                  >
                    <Upload className="w-4 h-4" /> Subir Archivo
                  </button>
                </div>
              </div>

              {/* Status & Loader */}
              {isProcessing && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-emerald-900">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                      Procesando...
                    </span>
                    <span className="font-mono">{processingProgress}%</span>
                  </div>
                  <div className="w-full bg-emerald-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 h-full transition-all duration-300" style={{ width: `${processingProgress}%` }} />
                  </div>
                  <p className="text-[11px] text-emerald-700 font-sans italic">{statusMessage}</p>
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
                <h3 className="text-xs font-mono font-extrabold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-600" />
                  2. Datos y Moneda de la Factura
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {/* N° Factura */}
                  <div>
                    <label className="text-[10px] uppercase font-mono font-extrabold text-slate-600 block mb-1">
                      N° Factura
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
                      placeholder="Ej: 000123"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-extrabold text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>

                  {/* N° Control */}
                  <div>
                    <label className="text-[10px] uppercase font-mono font-extrabold text-slate-600 block mb-1">
                      N° Control
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      value={controlNumber}
                      onChange={(e) => setControlNumber(e.target.value.toUpperCase())}
                      placeholder="Ej: 00456"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-extrabold text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </div>

                  {/* Moneda de la Factura */}
                  <div>
                    <label className="text-[10px] uppercase font-mono font-extrabold text-slate-600 block mb-1">
                      Moneda Factura
                    </label>
                    <div className="flex rounded-xl overflow-hidden border border-slate-300">
                      <button
                        type="button"
                        onClick={() => handleCurrencyChange('Bs')}
                        className={`flex-1 py-1.5 text-xs font-black transition-all ${
                          detectedCurrency === 'Bs' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Bs. (VES)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCurrencyChange('USD')}
                        className={`flex-1 py-1.5 text-xs font-black transition-all ${
                          detectedCurrency === 'USD' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        $ (USD)
                      </button>
                    </div>
                  </div>

                  {/* Selector Modo de Tasa & Tasa de Cambio (Bs/$) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] uppercase font-mono font-extrabold text-slate-600 block">
                        Tasa de Cambio (Bs/$)
                      </label>
                      {loadingBcv && (
                        <span className="text-[9px] text-emerald-600 font-mono flex items-center gap-1 animate-pulse">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" /> BCV...
                        </span>
                      )}
                    </div>

                    {/* Pastillas de Selección de Tasa */}
                    <div className="flex rounded-lg overflow-hidden border border-slate-300 text-[10px] font-bold mb-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectTasaTipo('USD_BCV')}
                        className={`flex-1 py-1 px-1 transition-all text-center ${
                          tasaTipo === 'USD_BCV' ? 'bg-emerald-600 text-white font-black shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title={bcvRates?.usd ? `Tasa Oficial BCV USD: ${bcvRates.usd.toFixed(2)} Bs` : 'Tasa Dólar Oficial'}
                      >
                        $ BCV
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTasaTipo('EUR_BCV')}
                        className={`flex-1 py-1 px-1 transition-all text-center ${
                          tasaTipo === 'EUR_BCV' ? 'bg-blue-600 text-white font-black shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title={bcvRates?.eur ? `Tasa Oficial BCV Euro: ${bcvRates.eur.toFixed(2)} Bs` : 'Tasa Euro Oficial'}
                      >
                        € Euro
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTasaTipo('MANUAL')}
                        className={`flex-1 py-1 px-1 transition-all text-center ${
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
                      className={`w-full border rounded-xl px-3 py-1 text-xs font-mono font-extrabold transition-all ${
                        tasaTipo !== 'MANUAL'
                          ? 'bg-slate-100 text-slate-700 border-slate-300'
                          : 'bg-white text-slate-900 border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 font-black'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Information Banner */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-emerald-950 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {detectedCurrency === 'Bs'
                      ? `Los precios detectados en Bolívares (Bs) se convertirán a Dólares ($ USD) divididos entre la Tasa de ${Number(customTasa.toFixed(2)).toFixed(2)} Bs/$.`
                      : `Los precios detectados se registrarán directamente en Dólares ($ USD).`}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Section 2: Product Matching & Verification Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-slate-100/90 px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-mono font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-600" />
                3. Matriz de Coincidencia e Ítems Extraídos ({items.length} ítems)
              </h3>
              <div className="flex items-center gap-2">
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllItems}
                    className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-extrabold text-[11px] px-3 py-1 rounded-lg flex items-center gap-1 transition-all shadow-xs"
                    title="Vaciar la lista completa de ítems extraídos"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Limpiar Lista
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddBlankRow}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-[11px] px-3 py-1 rounded-lg flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Ítem Manual
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase font-mono text-slate-500 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 w-[22%]">Texto en Foto (OCR)</th>
                    <th className="px-3 py-2.5 w-[28%]">Producto Coincidente en Catálogo</th>
                    <th className="px-2 py-2.5 text-center w-[10%]">Cant. Unid.</th>
                    <th className="px-2 py-2.5 text-right w-[18%]">Total Línea ({detectedCurrency})</th>
                    <th className="px-2 py-2.5 text-right w-[16%] bg-emerald-50 text-emerald-900 font-black">Costo Unit. USD ($)</th>
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
                      const matchedProd = existingProducts.find(p => p.id === item.matchedProductId);
                      const isHighMatch = item.similarityScore >= 0.5;

                      return (
                        <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors ${!item.matchedProductId ? 'bg-amber-50/30' : ''}`}>
                          {/* Texto Extraído */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={item.originalText}
                              onChange={(e) => handleUpdateItemField(item.id, 'originalText', e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-lg px-2 py-1 text-xs font-bold text-slate-800"
                            />
                          </td>

                          {/* Coincidencia Catálogo */}
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <select
                                value={item.matchedProductId || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '__CREATE_NEW__') {
                                    handleOpenQuickCreate(item);
                                  } else {
                                    handleUpdateItemField(item.id, 'matchedProductId', val ? parseInt(val) : null);
                                    handleUpdateItemField(item.id, 'similarityScore', val ? 1.0 : 0);
                                  }
                                }}
                                className={`w-full border rounded-lg px-2 py-1 text-xs font-bold transition-all ${
                                  matchedProd
                                    ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                    : 'bg-amber-50 border-amber-300 text-amber-900'
                                }`}
                              >
                                <option value="">-- Seleccionar de Catálogo --</option>
                                <option value="__CREATE_NEW__" className="font-bold text-emerald-700">
                                  ➕ [+ CREAR NUEVO PRODUCTO]
                                </option>
                                {existingProducts.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.description} ({p.barcode || 'S/C'}) - Stock: {p.stock_actual}
                                  </option>
                                ))}
                              </select>

                              {item.matchedProductId ? (
                                <span className={`text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                                  isHighMatch ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-blue-100 text-blue-800 border-blue-300'
                                }`}>
                                  {Math.round(item.similarityScore * 100)}%
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenQuickCreate(item)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] px-2 py-1 rounded-lg shrink-0 flex items-center gap-1 shadow-xs"
                                  title="Crear rápidamente este producto en el inventario"
                                >
                                  <Plus className="w-3 h-3" /> Crear
                                </button>
                              )}
                            </div>
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
                              className="w-16 text-center font-mono font-black border border-slate-300 rounded-lg px-1 py-1 text-xs bg-white focus:ring-2 focus:ring-emerald-400 focus:outline-none"
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
                              className="w-36 text-right font-mono font-bold border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                            />
                          </td>

                          {/* Costo Unitario USD ($) */}
                          <td className="px-2 py-2 text-right bg-emerald-50/50">
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
                                className="w-28 text-right font-mono font-black text-emerald-900 border border-emerald-400 rounded-lg px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                              />
                              {item.precioOriginal > 0 && (
                                <span className="text-[9.5px] font-mono font-semibold text-emerald-700 mt-0.5">
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
                              className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded-lg transition-colors"
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
        <div className="fixed inset-0 z-60 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h4 className="text-sm font-black text-slate-900 font-sans flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" /> Registrar Nuevo Producto en Catálogo
              </h4>
              <button onClick={() => setShowQuickCreate(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-mono font-bold text-slate-700 block mb-1">Descripción del Producto</label>
                <input
                  type="text"
                  value={newProdDesc}
                  onChange={(e) => setNewProdDesc(e.target.value.toUpperCase())}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold uppercase focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-mono font-bold text-slate-700 block mb-1">Costo ($)</label>
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
                    className="w-full border border-slate-300 rounded-xl px-2 py-1.5 font-mono font-black text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-mono font-bold text-slate-700 block mb-1">Detalle ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProdDetailUsd}
                    onChange={(e) => setNewProdDetailUsd(parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-300 rounded-xl px-2 py-1.5 font-mono font-black text-emerald-700"
                  />
                </div>

                <div>
                  <label className="font-mono font-bold text-slate-700 block mb-1">Mayor ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProdMayorUsd}
                    onChange={(e) => setNewProdMayorUsd(parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-300 rounded-xl px-2 py-1.5 font-mono font-black text-blue-700"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowQuickCreate(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveQuickProduct}
                className="px-5 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md"
              >
                Guardar y Seleccionar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
