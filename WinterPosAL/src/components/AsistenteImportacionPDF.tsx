import { useState, useRef } from 'react';
import { Upload, Sparkles, CheckCircle2, AlertTriangle, Settings, RefreshCw, Wand2, ArrowRight, Eye, Trash2, Tag, Layers, Calculator, FileSpreadsheet, Search } from 'lucide-react';
// Dynamic loader for XLSX (SheetJS)
const loadXlsx = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).XLSX) {
      return resolve((window as any).XLSX);
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => {
      const lib = (window as any).XLSX;
      if (lib) {
        resolve(lib);
      } else {
        reject(new Error('No se pudo inicializar la librería XLSX'));
      }
    };
    script.onerror = () => reject(new Error('No se pudo cargar la librería XLSX desde CDN'));
    document.head.appendChild(script);
  });
};
import type { Product } from '../types';

// Dynamic loader for PDF.js to ensure Vite compiles even if npm package is missing
const loadPdfJs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      return resolve((window as any).pdfjsLib);
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(lib);
      } else {
        reject(new Error('No se pudo inicializar la librería PDF.js'));
      }
    };
    script.onerror = () => reject(new Error('No se pudo cargar la librería PDF.js desde CDN'));
    document.head.appendChild(script);
  });
};

export interface ParsedImportProduct {
  barcode: string;
  description: string;
  category: string;
  stock_actual: number;
  stock_minimo: number;
  precio_costo_usd: number;
  precio_detalle_usd: number;
  precio_mayor_usd: number;
  cantidad_mayorista: number;
  exento_impuesto: boolean;
  porcentaje_impuesto?: number;
  a_granel: boolean;
  original_row_text?: string;
  hasWarning?: boolean;
  warningMessage?: string;
  isInferredCategory?: boolean;
  isCatalogMatch?: boolean;
}

interface AsistenteImportacionPDFProps {
  onProcessImport: (products: ParsedImportProduct[]) => void;
  onCancel: () => void;
  existingCategories?: string[];
  existingProducts?: Product[];
}

export default function AsistenteImportacionPDF({
  onProcessImport,
  onCancel,
  existingCategories = [],
  existingProducts = []
}: AsistenteImportacionPDFProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // File & Parsing States
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsingStep, setParsingStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Rules Configuration
  const [stockMinMode, setStockMinMode] = useState<'reporte' | 'fijo'>('fijo');
  const [customStockMinVal, setCustomStockMinVal] = useState<number>(5);
  const [applyMayorDiscount, setApplyMayorDiscount] = useState(true);
  const [mayorDiscountPct, setMayorDiscountPct] = useState<number>(10);
  const [defaultCategory, setDefaultCategory] = useState('GENERAL');
  const [categoryMode, setCategoryMode] = useState<'auto' | 'fijo'>('auto');
  const [defaultExento, setDefaultExento] = useState(false);
  const [taxRuleMode, setTaxRuleMode] = useState<'auto_venezuela' | 'todos_gravables' | 'todos_exentos'>('auto_venezuela');

  // Preview filtering states
  const [previewSearchTerm, setPreviewSearchTerm] = useState('');
  const [previewCategoryFilter, setPreviewCategoryFilter] = useState('ALL');
  const [previewTaxFilter, setPreviewTaxFilter] = useState<'all' | 'exempt' | 'taxable'>('all');

  // Column Headers & Mapping state
  const [_rawLines, setRawLines] = useState<string[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [tableRowsData, setTableRowsData] = useState<string[][]>([]);
  
  // Field mappings (Index of column in tableRowsData)
  const [colMapping, setColMapping] = useState<{
    barcode: number;
    description: number;
    category: number;
    stock_actual: number;
    stock_minimo: number;
    precio_costo_usd: number;
    precio_detalle_usd: number;
    precio_mayor_usd: number;
    unit: number;
  }>({
    barcode: -1,
    description: -1,
    category: -1,
    stock_actual: -1,
    stock_minimo: -1,
    precio_costo_usd: -1,
    precio_detalle_usd: -1,
    precio_mayor_usd: -1,
    unit: -1
  });

  // Parsed products list ready for preview & import
  const [parsedProducts, setParsedProducts] = useState<ParsedImportProduct[]>([]);

  // -------------------------------------------------------------
  // HELPER FUNCTIONS FOR CLEANING AND PARSING
  // -------------------------------------------------------------

  const parseNumber = (val: string | undefined): number => {
    if (!val) return 0;
    // Clean spaces, currency symbols, and non-numeric chars except dot/comma
    let clean = val.replace(/[$Bs€\s]/g, '').trim();
    if (!clean) return 0;
    
    // Handle formats like 1.234,56 vs 1,234.56 vs 1234,56
    if (clean.includes(',') && clean.includes('.')) {
      if (clean.indexOf('.') < clean.indexOf(',')) {
        // Thousands separator is dot, decimal is comma: 1.250,50 -> 1250.50
        clean = clean.replace(/\./g, '').replace(',', '.');
      } else {
        // Thousands separator is comma, decimal is dot: 1,250.50 -> 1250.50
        clean = clean.replace(/,/g, '');
      }
    } else if (clean.includes(',')) {
      clean = clean.replace(',', '.');
    }
    
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const normalizeText = (txt: string): string => {
    if (!txt) return '';
    return txt.toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9\s]/g, ' ');
  };

  // Clasificador Inteligente de Categorías por Palabras Clave de la Descripción
  const inferCategoryFromDescription = (desc: string, systemCategories: string[], fallbackCategory: string): string => {
    if (!desc || !desc.trim()) return fallbackCategory.toUpperCase();
    const d = normalizeText(desc);
    const wordsInDesc = d.split(/\s+/).filter(w => w.length > 0);

    const matchesKeyword = (kw: string) => {
      const kwNorm = normalizeText(kw);
      if (kwNorm.includes(' ')) {
        // Multi-word phrase like "PAPEL HIGIENICO" or "CREMA DE LECHE"
        return d.includes(kwNorm);
      }
      // Single word: exact match or prefix match for words >= 4 letters
      return wordsInDesc.some(w => w === kwNorm || (kwNorm.length >= 4 && w.startsWith(kwNorm)));
    };

    // Strict priority list: Most specific consumer categories first
    const categoryRules: { category: string; keywords: string[] }[] = [
      {
        category: 'BEBIDAS',
        keywords: [
          'AGUA', 'JUGO', 'JUGUITO', 'REFRESCO', 'CERVEZA', 'MALTA', 'RON', 'WHISKY', 'VINO', 
          'SANGRIA', 'ENERGIZANTE', 'GATORADE', 'BEBIDA', 'SODA', 'LICOR', 'VODKA', 'GINEBRA', 'TE', 'TEA', 'ANIS',
          'COCA', 'PEPSI', 'SPRITE', 'CHINO', '7UP', 'KOLITA', 'HIT', 'FLAVOR', 'MALTIN', 'POLAR', 'SOLERA'
        ]
      },
      {
        category: 'HELADOS',
        keywords: [
          'HELADO', 'HELADITO', 'BARQUILLA', 'BARQUILLAS', 'BARQUILLON', 'BARQUILLITA', 'PALETA DE HELADO', 'TINA DE HELADO', 'TINITA', 'POPSICLE', 'ICE CREAM', 'CHUPACHUPA'
        ]
      },
      {
        category: 'LIMPIEZA',
        keywords: [
          'DETERGENTE', 'CLORO', 'LAVAPLATOS', 'DESINFECTANTE', 'SUAVIZANTE', 'ESPONJA', 'PAPEL HIGIENICO', 
          'TOALLIN', 'JABON EN POLVO', 'LIMPIADOR', 'CEREX', 'LIMPIA', 'BLANQUEADOR', 'BOLSA', 'DESENGRASANTE', 
          'COLETO', 'HARAGAN', 'ACE', 'ARIEL', 'LAS LLAVES', 'NEVEX', 'MISTOLIN', 'FABULOSO', 'CLOROX', 'AJAX'
        ]
      },
      {
        category: 'CHUCHERIAS / CONFITERIA',
        keywords: [
          'CHUCHERIA', 'DULCE', 'CHOCOLATE', 'CHOCO', 'CHICLE', 'CARAMELO', 'GALLETA', 'SNACK', 'DORITOS', 'CHEETOS', 'CHIP',
          'PRINGLES', 'TORTITA', 'GOMITA', 'PALETA', 'CHUPA', 'BOMBON', 'MARSHMALLOW', 'MANI', 'AREQUIPE', 'BIANCHI', 'PEPITAS', 'COPETES',
          'PIRULIN', 'SAVOY', 'PINGUINITO', 'NUTELLA', 'CHOCAPIC', 'COCOLITO', 'MASAPAN', 'ALFAJOR', 'WAFER', 'SUSY', 'COCOSETTE'
        ]
      },
      {
        category: 'ALIMENTOS / VIVERES',
        keywords: [
          'SOYA', 'ACEITE', 'HARINA', 'ARROZ', 'PASTA', 'SPAGHETTI', 'MACARRON', 'AZUCAR', 'SUGAR', 'LECHE', 'ATUN', 'SARDINA', 
          'SAL', 'SOPA', 'MAYONESA', 'SALSA', 'VINAGRE', 'CAFE', 'TODDY', 'NESCAFE', 'PAN',
          'AVENA', 'CEREAL', 'FORORO', 'CARAOTA', 'FRIJOL', 'LENTEJA', 'GARBANZO', 'GRANO', 'ACEITUNA', 'ALCAPARRA',
          'PANQUECA', 'ALIMENTO', 'MAIZ', 'MEMBRILLO', 'MERMELADA', 'COMPOTA', 'CONSERVA',
          'GELATINA', 'FLAN', 'VAINILLA', 'CANELA', 'CONDIMENTO', 'ADOBO', 'PIMIENTA', 'CUMINO', 'MAIZENA'
        ]
      },
      {
        category: 'CHARCUTERIA / REFRIGERADOS',
        keywords: [
          'YOGUR', 'YOGURT', 'QUESO', 'JAMON', 'TOCINETA', 'SALCHICHA', 'TOCINO',
          'MANTEQUILLA', 'MARGARINA', 'MORTADELA', 'CHORIZO', 'NEVERA', 'CREMA DE LECHE', 'RICOTTA', 'REQUESON',
          'SUERO', 'CHAMPIÑON', 'TEQUEÑO', 'SALAMI', 'PEPERONI', 'PASTRAMI'
        ]
      },
      {
        category: 'CARNICERIA / PESCADERIA',
        keywords: [
          'CARNE', 'POLLO', 'PESCADO', 'BISTEC', 'MILANESA', 'PECHUGA', 'MUSLO', 'CERDO', 'PERNIL', 'COSTILLA',
          'LOMITO', 'SOLOMO', 'LAGARTO', 'MOLIDA', 'CHULETA', 'CAMARON', 'MARISCO'
        ]
      },
      {
        category: 'CUIDADO PERSONAL',
        keywords: [
          'CHAMPU', 'SHAMPOO', 'JABON', 'CREMA', 'ALMENDRA', 'COCO', 'RICINO', 'ARGAN', 'DESODORANTE', 
          'TOALLA', 'PASTA DENTAL', 'CREMA DENTAL', 'ENJUAGUE', 'ACONDICIONADOR', 'TALCO', 'LOCION', 'AFEITAR', 
          'PRESERVATIVO', 'PROTECTOR', 'FACIAL', 'CORPORAL', 'SHOWER', 'BABY', 'BEBE', 'BABE', 'PAÑAL', 'COLGATE', 'GILLETTE'
        ]
      },
      {
        category: 'LIBRERIA / PAPELERIA',
        keywords: [
          'CUADERNO', 'LIBRETA', 'LAPIZ', 'LAPICERO', 'BOLIGRAFO', 'MARCADOR', 'REGLA', 'BORRADOR', 'SACAPUNTA',
          'CARTULINA', 'CORTADOR', 'EXACTO', 'TIJERA', 'CARPETA', 'HOJA', 'RESMA', 'PAPEL BOND', 'FOAMI', 'PINCEL',
          'TEMPERA', 'ACRILICO', 'LIBRO', 'BLOCK', 'COMPAS', 'PIZARRA', 'GRAPADORA', 'GRAPA', 'CLIP', 'ENGRAPADORA', 'CARTUCHERA'
        ]
      },
      {
        category: 'QUINCALLERIA / VARIADOS',
        keywords: [
          'QUINCALLA', 'JUGUETE', 'LLAVERO', 'PILA', 'BATERIA', 'FOCO', 'GANCHO', 'ADORNO', 'ACCESORIO', 'CANDADO',
          'PEINE', 'LIGA', 'MONEDERO', 'BOLSO', 'MORRAL', 'CARTERA', 'ESTUCHE', 'LENTES', 'PARAGUAS',
          'REGALO', 'GLOBO'
        ]
      },
      {
        category: 'FARMACIA / SALUD',
        keywords: [
          'PASTILLA', 'VITAMINA', 'ACETAMINOFEN', 'IBUPROFENO', 'PARACETAMOL', 'ANALGESICO', 'JARABE', 'GASA',
          'ALCOHOL', 'ALGODON', 'BANDITA', 'ISODINE', 'TERMOMETRO', 'CURA', 'CURITA'
        ]
      },
      {
        category: 'FERRETERIA',
        keywords: [
          'ABRAZADERA', 'TORNILLO', 'CABLE', 'BOMBILLO', 'TOMA', 'TUBO', 'PEGA', 'CINTA', 'TEFLON', 
          'HERRAMIENTA', 'CLAVO', 'LIJA', 'BROCA', 'SILICONA', 'ALAMBRE', 'LUBRICANTE', 'ACEITE MOTOR'
        ]
      }
    ];

    for (const rule of categoryRules) {
      if (rule.keywords.some(kw => matchesKeyword(kw))) {
        // If system already has a matching category in systemCategories, prefer system's existing category!
        const existingMatch = systemCategories.find(sc => {
          const scUpper = normalizeText(sc);
          const ruleCatUpper = normalizeText(rule.category);
          const mainKey = ruleCatUpper.split(' ')[0];
          return scUpper === ruleCatUpper || (mainKey.length >= 4 && scUpper.includes(mainKey));
        });
        if (existingMatch) return existingMatch.toUpperCase();

        return rule.category;
      }
    }

    return fallbackCategory.toUpperCase();
  };

  // Clasificador Inteligente de Impuesto IVA (Norma Venezolana: Canasta Básica / Farmacia = Exento 0%, Resto = IVA 16%)
  const inferTaxStatusFromProduct = (barcode: string, desc: string, mode: 'auto_venezuela' | 'todos_gravables' | 'todos_exentos'): { isExempt: boolean; taxPct: number } => {
    if (mode === 'todos_exentos') return { isExempt: true, taxPct: 0 };
    if (mode === 'todos_gravables') return { isExempt: false, taxPct: 16 };

    // Verificación por prefijo de Código de Barras (GTIN nacional Venezuela 759...)
    const cleanCode = (barcode || '').trim();
    if (cleanCode.startsWith('7591001') || cleanCode.startsWith('7591003') || cleanCode.startsWith('7591004')) {
      return { isExempt: true, taxPct: 0 };
    }

    const d = normalizeText(desc || '');
    const wordsInDesc = d.split(/\s+/).filter(w => w.length > 0);

    const matchesKeyword = (kw: string) => {
      const kwNorm = normalizeText(kw);
      if (kwNorm.includes(' ')) {
        return d.includes(kwNorm);
      }
      return wordsInDesc.some(w => w === kwNorm || (kwNorm.length >= 4 && w.startsWith(kwNorm)));
    };

    // Palabras clave de víveres esenciales, alimentos de la canasta básica, medicamentos y artículos de farmacia (Norma Venezolana SENIAT Art 18)
    const exemptKeywords = [
      // Alimentación básica (Canasta Alimentaria)
      'HARINA', 'HARINA PAN', 'ARROZ', 'PASTA', 'SPAGHETTI', 'MACARRON', 'AZUCAR', 'SUGAR',
      'LECHE', 'SAL', 'CARAOTA', 'FRIJOL', 'LENTEJA', 'GARBANZO', 'GRANO', 'AVENA', 'FORORO',
      'CAFE', 'PAN', 'HUEVO', 'QUESO', 'CARNE', 'POLLO', 'PESCADO', 'BISTEC', 'MILANESA',
      'PECHUGA', 'MUSLO', 'CERDO', 'PERNIL', 'COSTILLA', 'LOMITO', 'SOLOMO', 'MOLIDA', 'CHULETA',
      'CAMARON', 'SARDINA', 'ATUN EN AGUA', 'ACEITE', 'ACEITE DE SOYA', 'SOYA', 'ACEITE DE MAIZ', 'ACEITE VEGETAL', 'ACEITE GIRASOL',
      'MANTEQUILLA', 'MARGARINA',

      // Farmacia y Medicamentos (100% Exentos de IVA según Seniat)
      'ACETAMINOFEN', 'IBUPROFENO', 'PARACETAMOL', 'ANALGESICO', 'VITAMINA', 'JARABE', 'ANTIBIOTICO', 'AMOXICILINA',
      'DESLORATADINA', 'LORATADINA', 'ALCOHOL MEDICINAL', 'AGUA OXIGENADA', 'OXIGENADA', 'GASA', 'VENDA', 'ALGODON MEDICINAL',
      'ALGODON', 'CURA', 'CURITA', 'MEDICAMENTO', 'MEDICINA', 'FARMACIA', 'PASTILLA', 'CAPSULA', 'TABLETA', 'GOTAS',
      'SOLUCION', 'SOLUCION FISIOLOGICA', 'SUERO ORAL', 'TERMOMETRO', 'DESINFECTANTE MEDICO',

      // Educativo escolar básico
      'CUADERNO ESCOLAR', 'LIBRO'
    ];

    const isExempt = exemptKeywords.some(kw => matchesKeyword(kw));
    return {
      isExempt,
      taxPct: isExempt ? 0 : 16
    };
  };

  // Extract structured rows from plain text lines
  const processRawLinesToTable = (lines: string[]) => {
    if (lines.length === 0) {
      setErrorMessage('No se encontró contenido de texto legible en el documento.');
      return;
    }

    setRawLines(lines);

    // Heuristic: Find header row
    let headerIdx = -1;
    let headers: string[] = [];

    const headerKeywords = ['CLAVE', 'CODIGO', 'DESCRIPCION', 'ARTICULO', 'DEPARTAMENTO', 'EXISTENCIA', 'STOCK', 'COSTO', 'PRECIO', 'PVP', 'MINIMO'];

    for (let i = 0; i < Math.min(lines.length, 25); i++) {
      const upper = lines[i].toUpperCase();
      const matchCount = headerKeywords.filter(kw => upper.includes(kw)).length;
      if (matchCount >= 2) {
        headerIdx = i;
        break;
      }
    }

    let rows: string[][] = [];

    if (headerIdx !== -1) {
      // Split header line by multiple spaces, tabs or delimiters
      const headerLine = lines[headerIdx];
      headers = headerLine.split(/\t|\s{2,}|\|/).map(h => h.trim()).filter(Boolean);
      
      // If splitting by spaces didn't produce multiple columns, try single space/comma
      if (headers.length < 3) {
        headers = headerLine.split(/;|,|\t/).map(h => h.trim()).filter(Boolean);
      }

      // Process data lines after headerIdx
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Skip obvious page footers / total lines
        const upper = line.toUpperCase();
        if (upper.startsWith('PAGINA') || upper.startsWith('TOTAL') || upper.startsWith('REPORTE DE') || upper.includes('IMPRESO EL')) {
          continue;
        }

        let parts = line.split(/\t|\s{2,}|\|/).map(p => p.trim()).filter(p => p.length > 0);
        if (parts.length < 3) {
          parts = line.split(/;|\t/).map(p => p.trim()).filter(p => p.length > 0);
        }

        if (parts.length >= 2) {
          rows.push(parts);
        }
      }
    } else {
      // Fallback: Create arbitrary columns based on line splitting
      headers = ['Columna 1', 'Columna 2', 'Columna 3', 'Columna 4', 'Columna 5', 'Columna 6', 'Columna 7', 'Columna 8'];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(/\t|\s{2,}|\||;/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          rows.push(parts);
        }
      }
    }

    setDetectedColumns(headers);
    setTableRowsData(rows);

    // Auto-map column indices
    const newMapping = {
      barcode: -1,
      description: -1,
      category: -1,
      stock_actual: -1,
      stock_minimo: -1,
      precio_costo_usd: -1,
      precio_detalle_usd: -1,
      precio_mayor_usd: -1,
      unit: -1
    };

    headers.forEach((h, idx) => {
      const name = h.toUpperCase();
      if (newMapping.barcode === -1 && (name.includes('CLAVE') || name.includes('CODIGO') || name.includes('BARRA') || name.includes('SKU') || name.includes('ID'))) {
        newMapping.barcode = idx;
      } else if (newMapping.description === -1 && (name.includes('DESCRIPCION') || name.includes('ARTICULO') || name.includes('PRODUCTO') || name.includes('NOMBRE'))) {
        newMapping.description = idx;
      } else if (newMapping.category === -1 && (name.includes('DEPARTAMENTO') || name.includes('CATEGORIA') || name.includes('DEPTO') || name.includes('GRUPO') || name.includes('LINEA'))) {
        newMapping.category = idx;
      } else if (newMapping.stock_actual === -1 && (name.includes('EXISTENCIA') || name.includes('STOCK') || name.includes('CANTIDAD') || name.includes('CANT') || name.includes('EXIS'))) {
        newMapping.stock_actual = idx;
      } else if (newMapping.stock_minimo === -1 && (name.includes('MINIMO') || name.includes('MIN') || name.includes('STK MIN'))) {
        newMapping.stock_minimo = idx;
      } else if (newMapping.precio_costo_usd === -1 && (name.includes('COSTO') || name.includes('P.COSTO') || name.includes('COST'))) {
        newMapping.precio_costo_usd = idx;
      } else if (newMapping.precio_detalle_usd === -1 && (name.includes('PRECIO 1') || name.includes('PRECIO DETALLE') || name.includes('PRECIO VENTA') || name.includes('PVP') || name.includes('VENTA') || name.includes('PRECIO'))) {
        newMapping.precio_detalle_usd = idx;
      } else if (newMapping.precio_mayor_usd === -1 && (name.includes('PRECIO 2') || name.includes('PRECIO MAYOR') || name.includes('MAYOR'))) {
        newMapping.precio_mayor_usd = idx;
      } else if (newMapping.unit === -1 && (name.includes('U. M.') || name.includes('UM') || name.includes('UNIDAD') || name.includes('MEDIDA'))) {
        newMapping.unit = idx;
      }
    });

    // Smart fallbacks if header auto-detection didn't pick up everything
    if (newMapping.barcode === -1 && headers.length > 0) newMapping.barcode = 0;
    if (newMapping.description === -1 && headers.length > 1) newMapping.description = 1;
    if (newMapping.category === -1 && headers.length > 2) newMapping.category = 2;

    setColMapping(newMapping);
    setParsingStep('mapping');
  };

  // Extract text from PDF file page by page
  const handleReadPdfFile = async (pdfFile: File) => {
    setIsProcessing(true);
    setStatusMsg('Leyendo documento PDF...');
    setErrorMessage('');

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await pdfFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      const allExtractedLines: string[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        setStatusMsg(`Procesando página ${pageNum} de ${pdf.numPages}...`);
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Group items by line Y coordinate
        interface TextItem {
          str: string;
          x: number;
          y: number;
        }

        const items: TextItem[] = textContent.items.map((item: any) => ({
          str: item.str,
          x: item.transform[4],
          y: Math.round(item.transform[5])
        })).filter((i: TextItem) => i.str.trim().length > 0);

        // Group by Y position with tolerance of 3 units
        const linesMap: { y: number; items: TextItem[] }[] = [];
        
        items.forEach(item => {
          const existingLine = linesMap.find(l => Math.abs(l.y - item.y) <= 3);
          if (existingLine) {
            existingLine.items.push(item);
          } else {
            linesMap.push({ y: item.y, items: [item] });
          }
        });

        // Sort lines top-to-bottom (highest Y first in PDF coordinate space)
        linesMap.sort((a, b) => b.y - a.y);

        // For each line, sort items left-to-right (lowest X first)
        linesMap.forEach(line => {
          line.items.sort((a, b) => a.x - b.x);
          
          // Join items using tab if gap > 12, or space if gap <= 12
          let lineStr = '';
          for (let k = 0; k < line.items.length; k++) {
            const current = line.items[k];
            if (k === 0) {
              lineStr += current.str;
            } else {
              const prev = line.items[k - 1];
              const gap = current.x - (prev.x + prev.str.length * 5); // approximate width
              if (gap > 12) {
                lineStr += '\t' + current.str;
              } else {
                lineStr += ' ' + current.str;
              }
            }
          }
          if (lineStr.trim()) {
            allExtractedLines.push(lineStr.trim());
          }
        });
      }

      setIsProcessing(false);
      processRawLinesToTable(allExtractedLines);
    } catch (err: any) {
      console.error('Error extrayendo texto del PDF:', err);
      setIsProcessing(false);
      setErrorMessage(`No se pudo leer el archivo PDF: ${err.message || 'Formato no soportado o protegido con contraseña.'}`);
    }
  };

  // Extract data from Excel files (.xlsx, .xls, .ods)
  const handleReadExcelFile = async (excelFile: File) => {
    setIsProcessing(true);
    setStatusMsg('Leyendo libro de Excel...');
    setErrorMessage('');

    try {
      const XLSX = await loadXlsx();
      const buffer = await excelFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert worksheet to 2D matrix of strings
      const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
      
      const allLines: string[] = rawMatrix
        .filter(row => row && row.length > 0)
        .map(row => row.map(cell => (cell !== undefined && cell !== null ? String(cell).trim() : '')).join('\t'));

      setIsProcessing(false);
      processRawLinesToTable(allLines);
    } catch (err: any) {
      console.error('Error leyendo archivo Excel:', err);
      setIsProcessing(false);
      setErrorMessage(`No se pudo procesar el libro de Excel: ${err.message || 'Formato no soportado.'}`);
    }
  };

  // Handle plain text paste or CSV upload
  const handleReadTextOrCsv = (textData: string) => {
    const lines = textData.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    processRawLinesToTable(lines);
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    const fileName = selectedFile.name.toLowerCase();

    if (fileName.endsWith('.pdf')) {
      handleReadPdfFile(selectedFile);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.ods')) {
      handleReadExcelFile(selectedFile);
    } else {
      // Read as plain text (CSV / TXT)
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        handleReadTextOrCsv(text || '');
      };
      reader.readAsText(selectedFile);
    }
  };

  // Build finalized ParsedImportProduct objects based on mapping and rules
  const generatePreviewFromMapping = () => {
    if (colMapping.barcode === -1 || colMapping.description === -1) {
      setErrorMessage('Por favor seleccione al menos qué columna corresponde al Código/Clave y cuál a la Descripción.');
      return;
    }

    const products: ParsedImportProduct[] = [];

    tableRowsData.forEach((row, rowIdx) => {
      const getVal = (colIdx: number) => (colIdx >= 0 && colIdx < row.length ? row[colIdx] : '');

      const rawBarcode = getVal(colMapping.barcode).trim();
      const rawDesc = getVal(colMapping.description).trim();

      // Skip row if barcode or description is empty
      if (!rawBarcode && !rawDesc) return;

      const barcode = rawBarcode || `GEN-${Date.now()}-${rowIdx}`;
      const description = (rawDesc || 'PRODUCTO SIN NOMBRE').toUpperCase();

      // 1. Detección Inteligente por Código de Barras Único (Catálogo del Sistema)
      const catalogMatch = barcode ? existingProducts.find(ep => ep.barcode && ep.barcode.trim().toUpperCase() === barcode.trim().toUpperCase()) : undefined;

      // Category (Prioridad por Código de Barras Único registrado > Mapeo directo > Inferencia IA por Descripción)
      let category = '';
      let isInferredCategory = false;
      let isCatalogMatch = false;

      const rawCatColVal = colMapping.category >= 0 ? getVal(colMapping.category).trim().toUpperCase() : '';

      if (catalogMatch && catalogMatch.category && catalogMatch.category.trim()) {
        // Prioridad Absoluta: Si el producto ya está en el catálogo del sistema por su Código de Barras Único, asigna su Categoría registrada
        category = catalogMatch.category.trim().toUpperCase();
        isCatalogMatch = true;
        isInferredCategory = false;
      } else if (colMapping.category === -2) {
        category = defaultCategory.toUpperCase();
        isInferredCategory = false;
      } else if (
        colMapping.category === -1 || 
        categoryMode === 'auto' || 
        !rawCatColVal || 
        rawCatColVal === 'SIN CATEGORIA' || 
        rawCatColVal === 'DEPARTAMENTO' || 
        rawCatColVal === 'S/C' || 
        rawCatColVal === 'NINGUNA' || 
        rawCatColVal === 'GENERAL'
      ) {
        category = inferCategoryFromDescription(description, existingCategories, defaultCategory);
        isInferredCategory = true;
      } else {
        category = rawCatColVal;
        isInferredCategory = false;
      }

      // Existencia / Stock Actual
      const stock_actual = parseNumber(getVal(colMapping.stock_actual));

      // Stock Mínimo
      let stock_minimo = customStockMinVal;
      if (stockMinMode === 'reporte' && colMapping.stock_minimo !== -1) {
        const parsedMin = parseNumber(getVal(colMapping.stock_minimo));
        if (parsedMin > 0) stock_minimo = parsedMin;
      }

      // Costo
      const precio_costo_usd = parseNumber(getVal(colMapping.precio_costo_usd));

      // Precio Detalle (Precio Venta)
      const precio_detalle_usd = parseNumber(getVal(colMapping.precio_detalle_usd));

      // Precio Mayorista
      let precio_mayor_usd = 0;
      if (applyMayorDiscount && precio_detalle_usd > 0) {
        const discountFactor = (100 - mayorDiscountPct) / 100;
        precio_mayor_usd = Math.max(0, parseFloat((precio_detalle_usd * discountFactor).toFixed(2)));
      } else if (colMapping.precio_mayor_usd !== -1) {
        precio_mayor_usd = parseNumber(getVal(colMapping.precio_mayor_usd));
      }
      if (precio_mayor_usd === 0) {
        precio_mayor_usd = precio_detalle_usd;
      }

      // Unit / A Granel
      const unitStr = getVal(colMapping.unit).toUpperCase();
      const a_granel = unitStr.includes('KG') || unitStr.includes('GR') || unitStr.includes('LTS') || unitStr.includes('KILO');

      let hasWarning = false;
      let warningMessage = '';

      if (precio_detalle_usd <= 0) {
        hasWarning = true;
        warningMessage = 'Precio Detalle es $0.00';
      } else if (precio_detalle_usd < precio_costo_usd) {
        hasWarning = true;
        warningMessage = 'Precio Detalle menor que el Costo';
      }

      const taxStatus = inferTaxStatusFromProduct(barcode, description, taxRuleMode);
      let exento_impuesto = taxStatus.isExempt;
      let porcentaje_impuesto = taxStatus.taxPct;

      if (catalogMatch && taxRuleMode === 'auto_venezuela') {
        if (taxStatus.isExempt) {
          // Garantizar Exento 0% IVA a productos esenciales (víveres, aceites, medicinas) según la norma venezolana
          exento_impuesto = true;
          porcentaje_impuesto = 0;
        } else if (catalogMatch.exento_impuesto !== undefined) {
          exento_impuesto = Boolean(catalogMatch.exento_impuesto);
          porcentaje_impuesto = catalogMatch.porcentaje_impuesto !== undefined ? catalogMatch.porcentaje_impuesto : (exento_impuesto ? 0 : 16);
        }
      }

      products.push({
        barcode,
        description,
        category,
        stock_actual,
        stock_minimo,
        precio_costo_usd,
        precio_detalle_usd,
        precio_mayor_usd,
        cantidad_mayorista: 6,
        exento_impuesto,
        porcentaje_impuesto,
        a_granel,
        original_row_text: row.join(' | '),
        hasWarning,
        warningMessage,
        isInferredCategory,
        isCatalogMatch
      });
    });

    setParsedProducts(products);
    setParsingStep('preview');
  };

  const handleRemovePreviewItem = (index: number) => {
    setParsedProducts(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdatePreviewItem = (index: number, field: keyof ParsedImportProduct, val: any) => {
    setParsedProducts(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: val };

      // Re-evaluate discount if detail price changes
      if (field === 'precio_detalle_usd' && applyMayorDiscount) {
        const detailNum = parseFloat(val) || 0;
        item.precio_mayor_usd = Math.max(0, parseFloat((detailNum * ((100 - mayorDiscountPct) / 100)).toFixed(2)));
      }

      // Re-evaluate tax percentage if exento_impuesto changes
      if (field === 'exento_impuesto') {
        const isExempt = Boolean(val);
        item.porcentaje_impuesto = isExempt ? 0 : 16;
      }

      updated[index] = item;
      return updated;
    });
  };

  return (
    <div className="bg-slate-50 border border-indigo-200 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] w-full text-slate-800">
      
      {/* HEADER */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-indigo-900 text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/30 rounded-lg backdrop-blur-sm border border-indigo-400/30">
            <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-black font-sans uppercase tracking-wider flex items-center gap-2">
              Asistente Inteligente de Carga Masiva (PDF / POS)
            </h3>
            <p className="text-[11px] text-indigo-200 font-sans">
              Lee reportes exportados de cualquier sistema de ventas (Saint, Valery, A2, Profit) y adapta la carga automáticamente.
            </p>
          </div>
        </div>

        <button 
          onClick={onCancel}
          className="text-indigo-200 hover:text-white text-lg font-bold transition-all px-2 py-1"
        >
          ✕
        </button>
      </div>

      {/* STEPPER NAV BAR */}
      <div className="bg-indigo-950/90 text-indigo-200 px-6 py-2 flex items-center justify-between border-b border-indigo-800/50 text-xs font-sans font-bold">
        <div className="flex items-center gap-6">
          <span className={`flex items-center gap-1.5 ${parsingStep === 'upload' ? 'text-amber-300 font-black' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-indigo-800 flex items-center justify-center text-[10px]">1</span>
            Subir Reporte PDF
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
          <span className={`flex items-center gap-1.5 ${parsingStep === 'mapping' ? 'text-amber-300 font-black' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-indigo-800 flex items-center justify-center text-[10px]">2</span>
            Ajustar Reglas y Columnas
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
          <span className={`flex items-center gap-1.5 ${parsingStep === 'preview' ? 'text-amber-300 font-black' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-indigo-800 flex items-center justify-center text-[10px]">3</span>
            Vista Previa e Importación ({parsedProducts.length})
          </span>
        </div>

        {parsingStep !== 'upload' && (
          <button
            onClick={() => {
              setParsingStep('upload');
              setFile(null);
              setTableRowsData([]);
            }}
            className="text-[10px] uppercase tracking-wide bg-indigo-800 hover:bg-indigo-700 text-indigo-100 px-2.5 py-1 rounded transition-all flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Reiniciar Carga
          </button>
        )}
      </div>

      {/* CONTENT AREA */}
      <div className="p-6 overflow-y-auto space-y-6 flex-grow">

        {/* ERROR DISPLAY */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg text-xs flex items-start gap-3 shadow-sm font-sans animate-in fade-in">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="font-extrabold uppercase block text-red-900">Atención:</strong>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STEP 1: UPLOAD PDF FILE OR PASTE TEXT                         */}
        {/* ------------------------------------------------------------- */}
        {parsingStep === 'upload' && (
          <div className="space-y-6">
            
            {/* Options bar: File vs Paste */}
            <div className="flex justify-between items-center bg-white p-3 border border-slate-200 rounded-xl shadow-sm">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInputMode('file')}
                  className={`px-4 py-2 text-xs font-bold font-sans rounded-lg transition-all ${
                    inputMode === 'file'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  📁 Seleccionar / Arrastrar Archivo Excel o PDF
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('paste')}
                  className={`px-4 py-2 text-xs font-bold font-sans rounded-lg transition-all ${
                    inputMode === 'paste'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  📋 Copiar y Pegar Texto de Tabla
                </button>
              </div>

              <span className="text-[11px] text-slate-500 font-sans italic">
                Soporta archivos de Excel (.xlsx, .xls) y reportes PDF de Saint, A2, Valery, Profit, etc.
              </span>
            </div>

            {inputMode === 'file' ? (
              <div 
                className="border-2 border-dashed border-indigo-300 hover:border-indigo-500 rounded-2xl p-10 flex flex-col justify-center items-center text-center bg-gradient-to-b from-indigo-50/50 to-white hover:bg-indigo-50 transition-all cursor-pointer group relative shadow-inner"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.ods,.txt,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                  className="hidden"
                />
                
                <div className="w-16 h-16 rounded-2xl bg-indigo-100 group-hover:scale-110 flex items-center justify-center mb-4 transition-transform shadow-md text-indigo-600">
                  <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                </div>

                <h4 className="text-sm font-black font-sans text-indigo-950 uppercase tracking-wide mb-1">
                  {file ? `Archivo Seleccionado: ${file.name}` : 'Arrastra o selecciona tu archivo de Excel (.xlsx, .xls) o PDF aquí'}
                </h4>
                <p className="text-xs text-slate-500 font-sans max-w-md leading-relaxed mb-4">
                  El asistente leerá automáticamente los productos, códigos, departamentos, precios de costo, precio venta y stock del reporte.
                </p>

                <div className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-xs font-sans font-bold shadow-md group-hover:bg-indigo-700 transition-all flex items-center gap-2 uppercase tracking-wider">
                  <Upload className="w-4 h-4" />
                  Buscar Archivo Excel / PDF
                </div>

                {isProcessing && (
                  <div className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-2xl flex flex-col justify-center items-center gap-3">
                    <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                    <span className="text-xs font-extrabold text-indigo-900 font-sans uppercase">{statusMsg}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <label className="text-xs font-bold font-sans text-slate-700 uppercase tracking-wide block">
                  Pega aquí el contenido copiado de la tabla del reporte:
                </label>
                <textarea
                  rows={8}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Pega las filas copiadas desde Excel, PDF o texto tabulado..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono focus:bg-white focus:border-indigo-600 focus:outline-none"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!pasteText.trim()}
                    onClick={() => handleReadTextOrCsv(pasteText)}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-sans font-bold text-xs py-2.5 px-6 rounded-xl shadow transition-all uppercase tracking-wide flex items-center gap-2"
                  >
                    <Wand2 className="w-4 h-4" />
                    Analizar Texto Pegado
                  </button>
                </div>
              </div>
            )}

            {/* Information Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans">
              <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-1">
                <strong className="text-indigo-900 font-bold uppercase block flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-indigo-600" />
                  Mapeo Inteligente
                </strong>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Identifica claves de producto, descripciones, categorías y unidades automáticamente.
                </p>
              </div>

              <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-1">
                <strong className="text-indigo-900 font-bold uppercase block flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-indigo-600" />
                  Descuento Mayorista (-10%)
                </strong>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Toma el Precio Venta (Detalle) del reporte y calcula automáticamente el precio mayorista con 10% menos.
                </p>
              </div>

              <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-1">
                <strong className="text-indigo-900 font-bold uppercase block flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Flexibilidad de Stock Mínimo
                </strong>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Puedes conservar el stock mínimo individual del reporte o asignar 5 unidades por defecto a todos.
                </p>
              </div>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STEP 2: CONFIGURATION OF RULES & COLUMN MAPPING               */}
        {/* ------------------------------------------------------------- */}
        {parsingStep === 'mapping' && (
          <div className="space-y-6">

            {/* RULES PANEL */}
            <div className="bg-white border border-indigo-200 rounded-xl p-5 shadow-sm space-y-4">
              <h4 className="text-xs font-black font-sans text-indigo-950 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
                <Settings className="w-4 h-4 text-indigo-600" />
                Configuración de Reglas de Importación
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-sans">
                
                {/* Rule: Stock Mínimo */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                  <span className="font-bold text-slate-800 uppercase block font-sans">
                    📦 Regla para Stock Mínimo:
                  </span>
                  
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="radio"
                      name="stockMinRule"
                      checked={stockMinMode === 'fijo'}
                      onChange={() => setStockMinMode('fijo')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Asignar stock mínimo fijo a todos los productos:</span>
                    <input
                      type="number"
                      min="0"
                      value={customStockMinVal}
                      onChange={(e) => setCustomStockMinVal(parseInt(e.target.value) || 0)}
                      disabled={stockMinMode !== 'fijo'}
                      className="w-16 bg-white border border-slate-300 rounded px-2 py-1 text-center font-bold text-indigo-900 focus:outline-none"
                    />
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="radio"
                      name="stockMinRule"
                      checked={stockMinMode === 'reporte'}
                      onChange={() => setStockMinMode('reporte')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Usar el valor individual del reporte (columna MINIMO)</span>
                  </label>
                </div>

                {/* Rule: Precio Mayorista */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                  <span className="font-bold text-slate-800 uppercase block font-sans">
                    💲 Regla para Precio Mayorista:
                  </span>

                  <label className="flex items-start gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={applyMayorDiscount}
                      onChange={(e) => setApplyMayorDiscount(e.target.checked)}
                      className="text-indigo-600 focus:ring-indigo-500 mt-0.5 rounded"
                    />
                    <div>
                      <span>Calcular Precio Mayorista aplicando descuento automático sobre el Precio Detalle del reporte:</span>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-slate-500">% Descuento Mayorista:</span>
                        <input
                          type="number"
                          min="0"
                          max="90"
                          value={mayorDiscountPct}
                          onChange={(e) => setMayorDiscountPct(parseFloat(e.target.value) || 0)}
                          disabled={!applyMayorDiscount}
                          className="w-16 bg-white border border-slate-300 rounded px-2 py-1 text-center font-bold text-emerald-700 focus:outline-none"
                        />
                        <span className="text-[10px] text-emerald-600 font-bold">(Detalle - 10%)</span>
                      </div>
                    </div>
                  </label>
                </div>

                {/* Rule: Categoría y Exento */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 md:col-span-2">
                  <span className="font-bold text-slate-800 uppercase block font-sans">
                    🏷️ Modo de Categorización (cuando no venga en el reporte o seleccione Auto-clasificar):
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-sans">
                    <label className="flex items-start gap-2 cursor-pointer font-bold text-indigo-950 bg-indigo-50/70 p-3 rounded-lg border border-indigo-200">
                      <input
                        type="radio"
                        name="categoryMode"
                        checked={categoryMode === 'auto'}
                        onChange={() => setCategoryMode('auto')}
                        className="text-indigo-600 focus:ring-indigo-500 mt-0.5"
                      />
                      <div>
                        <span className="block font-black text-indigo-900">✨ Auto-clasificar Inteligente (Recomendado)</span>
                        <span className="text-[11px] text-slate-600 font-normal block leading-tight mt-0.5">
                          El asistente analiza la descripción del producto (harina, aceite, refresco, champú, jamón, etc.) y le asigna la categoría correspondiente.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer font-medium text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
                      <input
                        type="radio"
                        name="categoryMode"
                        checked={categoryMode === 'fijo'}
                        onChange={() => setCategoryMode('fijo')}
                        className="text-indigo-600 focus:ring-indigo-500 mt-0.5"
                      />
                      <div>
                        <span className="block font-bold text-slate-800">Usar Categoría Fija por Defecto:</span>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="text"
                            value={defaultCategory}
                            onChange={(e) => setDefaultCategory(e.target.value)}
                            disabled={categoryMode !== 'fijo'}
                            placeholder="GENERAL"
                            className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold uppercase text-slate-800 focus:outline-none w-36"
                          />
                        </div>
                      </div>
                    </label>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={defaultExento}
                        onChange={(e) => setDefaultExento(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Marcar como Exento de Impuesto por defecto</span>
                    </label>
                  </div>
                </div>

                {/* Rule: Clasificación de Impuesto / IVA (Venezuela) */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 md:col-span-2">
                  <span className="font-bold text-slate-800 uppercase block font-sans">
                    🏛️ Clasificación de Impuesto / IVA (Normativa Venezolana):
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-sans">
                    <label className="flex items-start gap-2 cursor-pointer font-bold text-emerald-950 bg-emerald-50/70 p-3 rounded-lg border border-emerald-200">
                      <input
                        type="radio"
                        name="taxRuleMode"
                        checked={taxRuleMode === 'auto_venezuela'}
                        onChange={() => setTaxRuleMode('auto_venezuela')}
                        className="text-emerald-600 focus:ring-emerald-500 mt-0.5"
                      />
                      <div>
                        <span className="block font-black text-emerald-900">🇻🇪 Auto-clasificar IVA Venezolano</span>
                        <span className="text-[10.5px] text-slate-600 font-normal block leading-tight mt-0.5">
                          Alimentos básicos y medicina ➔ <strong>Exento (0%)</strong>.<br />
                          Refrescos, snacks y limpieza ➔ <strong>IVA 16%</strong>.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer font-bold text-slate-800 bg-white p-3 rounded-lg border border-slate-200">
                      <input
                        type="radio"
                        name="taxRuleMode"
                        checked={taxRuleMode === 'todos_gravables'}
                        onChange={() => setTaxRuleMode('todos_gravables')}
                        className="text-indigo-600 focus:ring-indigo-500 mt-0.5"
                      />
                      <div>
                        <span className="block font-bold text-slate-900">Marcar Todos como Gravables</span>
                        <span className="text-[10.5px] text-slate-500 font-normal block leading-tight mt-0.5">
                          Asigna IVA 16% a todos los productos importados.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer font-bold text-slate-800 bg-white p-3 rounded-lg border border-slate-200">
                      <input
                        type="radio"
                        name="taxRuleMode"
                        checked={taxRuleMode === 'todos_exentos'}
                        onChange={() => setTaxRuleMode('todos_exentos')}
                        className="text-indigo-600 focus:ring-indigo-500 mt-0.5"
                      />
                      <div>
                        <span className="block font-bold text-slate-900">Marcar Todos como Exentos</span>
                        <span className="text-[10.5px] text-slate-500 font-normal block leading-tight mt-0.5">
                          Asigna Exento (0% IVA) a todos los productos importados.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

              </div>
            </div>

            {/* COLUMN SELECTOR / MAPPER */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h4 className="text-xs font-black font-sans text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-indigo-600" />
                  Mapeo de Columnas Detectadas ({detectedColumns.length} columnas en reporte)
                </h4>
                <span className="text-[10px] text-slate-400 font-sans">Verifica que los datos coincidan correctamente</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-sans">
                
                {/* Barcode / Clave */}
                <div className="space-y-1 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100">
                  <label className="font-extrabold text-indigo-950 uppercase block text-[10.5px]">
                    1. Código / Clave <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={colMapping.barcode}
                    onChange={(e) => setColMapping(prev => ({ ...prev, barcode: parseInt(e.target.value) }))}
                    className="w-full bg-white border border-slate-300 rounded-md p-1.5 font-bold text-slate-800 focus:border-indigo-600 focus:outline-none"
                  >
                    <option value={-1}>-- No Seleccionado --</option>
                    {detectedColumns.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Columna {idx + 1}: {col}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div className="space-y-1 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100">
                  <label className="font-extrabold text-indigo-950 uppercase block text-[10.5px]">
                    2. Descripción / Nombre <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={colMapping.description}
                    onChange={(e) => setColMapping(prev => ({ ...prev, description: parseInt(e.target.value) }))}
                    className="w-full bg-white border border-slate-300 rounded-md p-1.5 font-bold text-slate-800 focus:border-indigo-600 focus:outline-none"
                  >
                    <option value={-1}>-- No Seleccionado --</option>
                    {detectedColumns.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Columna {idx + 1}: {col}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category / Department */}
                <div className="space-y-1 bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-200">
                  <label className="font-extrabold text-indigo-950 uppercase block text-[10.5px] flex items-center justify-between">
                    <span>3. Categoría / Depto.</span>
                    <span className="text-[9.5px] text-indigo-600 font-bold">✨ IA Inteligente</span>
                  </label>
                  <select
                    value={colMapping.category}
                    onChange={(e) => setColMapping(prev => ({ ...prev, category: parseInt(e.target.value) }))}
                    className="w-full bg-white border border-indigo-300 rounded-md p-1.5 font-bold text-indigo-900 focus:border-indigo-600 focus:outline-none"
                  >
                    <option value={-1}>✨ Auto-Clasificar por Descripción (Inteligente IA)</option>
                    <option value={-2}>-- Usar Categoría Fija ({defaultCategory}) --</option>
                    {detectedColumns.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Columna {idx + 1}: {col}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Existencia / Stock Actual */}
                <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="font-bold text-slate-700 uppercase block text-[10.5px]">
                    4. Existencia Actual
                  </label>
                  <select
                    value={colMapping.stock_actual}
                    onChange={(e) => setColMapping(prev => ({ ...prev, stock_actual: parseInt(e.target.value) }))}
                    className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-slate-800 focus:border-indigo-600 focus:outline-none"
                  >
                    <option value={-1}>-- Ninguna (0) --</option>
                    {detectedColumns.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Columna {idx + 1}: {col}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Stock Mínimo */}
                <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="font-bold text-slate-700 uppercase block text-[10.5px]">
                    5. Stock Mínimo (MÍNIMO)
                  </label>
                  <select
                    value={colMapping.stock_minimo}
                    onChange={(e) => setColMapping(prev => ({ ...prev, stock_minimo: parseInt(e.target.value) }))}
                    disabled={stockMinMode !== 'reporte'}
                    className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-slate-800 focus:border-indigo-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value={-1}>-- No leer del reporte --</option>
                    {detectedColumns.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Columna {idx + 1}: {col}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Precio Costo */}
                <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="font-bold text-slate-700 uppercase block text-[10.5px]">
                    6. Precio Costo (COSTO)
                  </label>
                  <select
                    value={colMapping.precio_costo_usd}
                    onChange={(e) => setColMapping(prev => ({ ...prev, precio_costo_usd: parseInt(e.target.value) }))}
                    className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-slate-800 focus:border-indigo-600 focus:outline-none"
                  >
                    <option value={-1}>-- Ninguno ($0.00) --</option>
                    {detectedColumns.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Columna {idx + 1}: {col}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Precio Detalle (PRECIO 1 / VENTA) */}
                <div className="space-y-1 bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-200">
                  <label className="font-extrabold text-emerald-950 uppercase block text-[10.5px]">
                    7. Precio Detalle (PRECIO 1 / VENTA)
                  </label>
                  <select
                    value={colMapping.precio_detalle_usd}
                    onChange={(e) => setColMapping(prev => ({ ...prev, precio_detalle_usd: parseInt(e.target.value) }))}
                    className="w-full bg-white border border-slate-300 rounded-md p-1.5 font-bold text-emerald-700 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value={-1}>-- Ninguno ($0.00) --</option>
                    {detectedColumns.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Columna {idx + 1}: {col}
                      </option>
                    ))}
                  </select>
                </div>

                {/* U.M. */}
                <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="font-bold text-slate-700 uppercase block text-[10.5px]">
                    8. Unidad de Medida (U. M.)
                  </label>
                  <select
                    value={colMapping.unit}
                    onChange={(e) => setColMapping(prev => ({ ...prev, unit: parseInt(e.target.value) }))}
                    className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-slate-800 focus:border-indigo-600 focus:outline-none"
                  >
                    <option value={-1}>-- Ninguna --</option>
                    {detectedColumns.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Columna {idx + 1}: {col}
                      </option>
                    ))}
                  </select>
                </div>

              </div>
            </div>

            {/* RAW DATA PREVIEW SAMPLE */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <span className="text-[11px] font-bold font-sans text-slate-600 uppercase">
                Muestra de las primeras 5 filas detectadas en el reporte ({tableRowsData.length} filas totales):
              </span>
              <div className="overflow-x-auto border border-slate-150 rounded-lg">
                <table className="w-full text-[10.5px] border-collapse text-left font-mono">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase">
                      {detectedColumns.map((col, i) => (
                        <th key={i} className="p-2 border-r border-slate-200 whitespace-nowrap">
                          Col {i + 1}: {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRowsData.slice(0, 5).map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="p-2 border-r border-slate-150 truncate max-w-[150px]">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setParsingStep('upload')}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2.5 rounded-lg text-xs font-sans font-bold transition-all"
              >
                ← Volver a Cargar PDF
              </button>

              <button
                type="button"
                onClick={generatePreviewFromMapping}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-bold text-xs py-2.5 px-6 rounded-lg shadow uppercase tracking-wide transition-all active:scale-95 flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Generar Vista Previa de Productos
              </button>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STEP 3: PREVIEW & CONFIRM IMPORT                              */}
        {/* ------------------------------------------------------------- */}
        {/* ------------------------------------------------------------- */}
        {/* STEP 3: PREVIEW & CONFIRM IMPORT                              */}
        {/* ------------------------------------------------------------- */}
        {parsingStep === 'preview' && (() => {
          const filteredPreviewProducts = parsedProducts.map((p, originalIdx) => ({ p, originalIdx })).filter(({ p }) => {
            if (previewSearchTerm) {
              const term = previewSearchTerm.toLowerCase().trim();
              const matchesCode = p.barcode.toLowerCase().includes(term);
              const matchesDesc = p.description.toLowerCase().includes(term);
              if (!matchesCode && !matchesDesc) return false;
            }
            if (previewCategoryFilter && previewCategoryFilter !== 'ALL') {
              if (p.category.toUpperCase() !== previewCategoryFilter.toUpperCase()) return false;
            }
            if (previewTaxFilter === 'exempt' && !p.exento_impuesto) return false;
            if (previewTaxFilter === 'taxable' && p.exento_impuesto) return false;

            return true;
          });

          return (
            <div className="space-y-4">
              
              {/* Summary metrics header */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-sans">
                <div className="bg-indigo-50 border border-indigo-150 p-3 rounded-xl">
                  <span className="text-[10px] text-indigo-700 font-extrabold uppercase block">Productos Procesados</span>
                  <strong className="text-lg text-indigo-950 font-black">{parsedProducts.length} ítems</strong>
                </div>

                <div className="bg-emerald-50 border border-emerald-150 p-3 rounded-xl">
                  <span className="text-[10px] text-emerald-700 font-extrabold uppercase block">Existencia Total Sumada</span>
                  <strong className="text-lg text-emerald-950 font-black font-mono">
                    {parsedProducts.reduce((acc, p) => acc + p.stock_actual, 0).toLocaleString()} un.
                  </strong>
                </div>

                <div className="bg-sky-50 border border-sky-150 p-3 rounded-xl">
                  <span className="text-[10px] text-sky-700 font-extrabold uppercase block">Regla Stock Mínimo</span>
                  <strong className="text-xs text-sky-950 font-bold block mt-1">
                    {stockMinMode === 'fijo' ? `Fijo: ${customStockMinVal} un. a todos` : 'Individual del Reporte'}
                  </strong>
                </div>

                <div className="bg-amber-50 border border-amber-150 p-3 rounded-xl">
                  <span className="text-[10px] text-amber-800 font-extrabold uppercase block">Regla Precio Mayor</span>
                  <strong className="text-xs text-amber-950 font-bold block mt-1">
                    {applyMayorDiscount ? `Precio Detalle - ${mayorDiscountPct}%` : 'Valor del Reporte'}
                  </strong>
                </div>
              </div>

              {/* SEARCH AND FILTERS BAR */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between font-sans text-xs">
                
                {/* SEARCH FIELD */}
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={previewSearchTerm}
                    onChange={(e) => setPreviewSearchTerm(e.target.value)}
                    placeholder="🔍 Buscar por código de barras o descripción..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 font-sans focus:bg-white focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                {/* CATEGORY FILTER */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <span className="text-[11px] font-bold text-slate-500 uppercase shrink-0">Categoría:</span>
                  <select
                    value={previewCategoryFilter}
                    onChange={(e) => setPreviewCategoryFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 uppercase focus:bg-white focus:border-indigo-600 focus:outline-none w-full md:w-48"
                  >
                    <option value="ALL">Todas ({parsedProducts.length})</option>
                    {Array.from(new Set(parsedProducts.map(p => p.category))).sort().map((cat, i) => (
                      <option key={i} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* TAX FILTER */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-250 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPreviewTaxFilter('all')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                      previewTaxFilter === 'all' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTaxFilter('exempt')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                      previewTaxFilter === 'exempt' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    Exentos (0%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTaxFilter('taxable')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                      previewTaxFilter === 'taxable' ? 'bg-sky-600 text-white shadow-xs' : 'text-sky-700 hover:bg-sky-50'
                    }`}
                  >
                    IVA 16%
                  </button>
                </div>

              </div>

              {/* PREVIEW TABLE */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-left border-collapse text-[11px] font-sans min-w-[1100px]">
                    <thead className="sticky top-0 bg-slate-100 text-slate-700 font-extrabold uppercase border-b border-slate-200 shadow-sm z-10">
                      <tr>
                        <th className="p-2.5 font-mono min-w-[130px]">Código / Clave</th>
                        <th className="p-2.5 min-w-[300px]">Descripción del Producto</th>
                        <th className="p-2.5 min-w-[160px]">Categoría</th>
                        <th className="p-2.5 text-center min-w-[110px]">Impuesto (IVA)</th>
                        <th className="p-2.5 text-right font-mono min-w-[90px]">Existencia</th>
                        <th className="p-2.5 text-right font-mono min-w-[85px]">Min. Stock</th>
                        <th className="p-2.5 text-right font-mono min-w-[90px]">Costo USD</th>
                        <th className="p-2.5 text-right font-mono text-emerald-700 min-w-[95px]">P. Detalle ($)</th>
                        <th className="p-2.5 text-right font-mono text-amber-700 min-w-[95px]">P. Mayor (-10%)</th>
                        <th className="p-2.5 text-center min-w-[90px]">A Granel</th>
                        <th className="p-2.5 text-center min-w-[60px]">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPreviewProducts.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="p-8 text-center text-slate-400 font-sans italic">
                            No se encontraron productos que coincidan con la búsqueda o filtro aplicado.
                          </td>
                        </tr>
                      ) : (
                        filteredPreviewProducts.map(({ p, originalIdx }) => (
                          <tr key={originalIdx} className={`border-b border-slate-100 hover:bg-indigo-50/40 transition-colors ${p.hasWarning ? 'bg-amber-50/40' : ''}`}>
                            
                            {/* Barcode */}
                            <td className="p-2 font-mono font-bold text-slate-700 min-w-[130px]">
                              <input
                                type="text"
                                value={p.barcode}
                                onChange={(e) => handleUpdatePreviewItem(originalIdx, 'barcode', e.target.value)}
                                title={p.barcode}
                                className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-indigo-400 rounded px-1.5 py-1 w-full font-mono text-xs"
                              />
                            </td>

                            {/* Description */}
                            <td className="p-2 font-bold text-slate-800 uppercase min-w-[300px]">
                              <input
                                type="text"
                                value={p.description}
                                onChange={(e) => handleUpdatePreviewItem(originalIdx, 'description', e.target.value)}
                                title={p.description}
                                className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-indigo-400 rounded px-1.5 py-1 w-full uppercase text-xs font-sans font-bold"
                              />
                            </td>

                            {/* Category */}
                            <td className="p-2 min-w-[160px]">
                              <div className="flex flex-col">
                                <input
                                  type="text"
                                  value={p.category}
                                  onChange={(e) => handleUpdatePreviewItem(originalIdx, 'category', e.target.value.toUpperCase())}
                                  className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-indigo-400 rounded px-1 py-0.5 w-full uppercase text-indigo-950 font-extrabold text-xs"
                                />
                                {p.isCatalogMatch ? (
                                  <span className="text-[9px] text-amber-800 font-bold flex items-center gap-0.5 px-1 bg-amber-50 border border-amber-300 rounded w-fit mt-0.5 select-none" title="Categoría identificada desde el catálogo registrado por su código de barras único">
                                    ⭐ Catálogo Registrado
                                  </span>
                                ) : p.isInferredCategory ? (
                                  <span className="text-[9px] text-indigo-600 font-bold flex items-center gap-0.5 px-1 bg-indigo-50 border border-indigo-200 rounded w-fit mt-0.5 select-none">
                                    ✨ IA Auto-Detectada
                                  </span>
                                ) : null}
                              </div>
                            </td>

                            {/* Impuesto / IVA Column */}
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleUpdatePreviewItem(originalIdx, 'exento_impuesto', !p.exento_impuesto)}
                                className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold uppercase transition-all shadow-2xs cursor-pointer ${
                                  p.exento_impuesto
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                    : 'bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-200'
                                }`}
                              >
                                {p.exento_impuesto ? 'EXENTO (0%)' : 'IVA 16%'}
                              </button>
                            </td>

                            {/* Stock actual */}
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                step="any"
                                value={p.stock_actual}
                                onChange={(e) => handleUpdatePreviewItem(originalIdx, 'stock_actual', parseFloat(e.target.value) || 0)}
                                className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-indigo-400 rounded px-1 py-0.5 w-20 text-right font-mono font-bold text-slate-800"
                              />
                            </td>

                            {/* Stock minimo */}
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                value={p.stock_minimo}
                                onChange={(e) => handleUpdatePreviewItem(originalIdx, 'stock_minimo', parseInt(e.target.value) || 0)}
                                className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-indigo-400 rounded px-1 py-0.5 w-16 text-right font-mono text-slate-500"
                              />
                            </td>

                            {/* Costo */}
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={p.precio_costo_usd}
                                onChange={(e) => handleUpdatePreviewItem(originalIdx, 'precio_costo_usd', parseFloat(e.target.value) || 0)}
                                className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-indigo-400 rounded px-1 py-0.5 w-20 text-right font-mono text-slate-600"
                              />
                            </td>

                            {/* Detail Price */}
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={p.precio_detalle_usd}
                                onChange={(e) => handleUpdatePreviewItem(originalIdx, 'precio_detalle_usd', parseFloat(e.target.value) || 0)}
                                className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-emerald-500 rounded px-1 py-0.5 w-20 text-right font-mono font-bold text-emerald-700"
                              />
                            </td>

                            {/* Mayor Price */}
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={p.precio_mayor_usd}
                                onChange={(e) => handleUpdatePreviewItem(originalIdx, 'precio_mayor_usd', parseFloat(e.target.value) || 0)}
                                className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-amber-500 rounded px-1 py-0.5 w-20 text-right font-mono font-bold text-amber-700"
                              />
                            </td>

                            {/* A Granel */}
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleUpdatePreviewItem(originalIdx, 'a_granel', !p.a_granel)}
                                className={`px-2 py-0.5 rounded text-[9.5px] font-bold uppercase transition-all ${
                                  p.a_granel ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {p.a_granel ? 'SI (Granel)' : 'NO'}
                              </button>
                            </td>

                            {/* Delete */}
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemovePreviewItem(originalIdx)}
                                className="text-slate-400 hover:text-red-600 transition-colors p-1"
                                title="Eliminar fila"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>

                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* FOOTER ACTIONS */}
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setParsingStep('mapping')}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2.5 rounded-lg text-xs font-sans font-bold transition-all"
                >
                  ← Volver a Mapeo de Columnas
                </button>

                <button
                  type="button"
                  disabled={parsedProducts.length === 0}
                  onClick={() => onProcessImport(parsedProducts)}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-sans font-bold text-xs py-3 px-8 rounded-xl shadow-lg uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Procesar Importación ({parsedProducts.length} Productos)
                </button>
              </div>

            </div>
          );
        })()}

      </div>
    </div>
  );
}
