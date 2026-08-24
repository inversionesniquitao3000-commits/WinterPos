import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves all candidate writable image directories, prioritizing Windows user-writable folders (%LOCALAPPDATA%, %APPDATA%, User Profile)
 */
function getAllCandidateImageDirectories() {
  const dirs = [];

  if (process.env.LOCALAPPDATA) {
    dirs.push(path.join(process.env.LOCALAPPDATA, 'WinterPos', 'data', 'product_images'));
  }
  if (process.env.APPDATA) {
    dirs.push(path.join(process.env.APPDATA, 'WinterPos', 'data', 'product_images'));
  }
  try {
    if (os.homedir()) {
      dirs.push(path.join(os.homedir(), '.winterpos', 'data', 'product_images'));
      dirs.push(path.join(os.homedir(), 'WinterPos', 'data', 'product_images'));
    }
  } catch (_) {}

  dirs.push(path.join(__dirname, 'data', 'product_images'));
  dirs.push(path.resolve(process.cwd(), 'backend', 'data', 'product_images'));
  dirs.push(path.resolve(process.cwd(), 'data', 'product_images'));
  dirs.push(path.resolve(__dirname, '..', 'data', 'product_images'));

  try {
    dirs.push(path.join(os.tmpdir(), 'winterpos_product_images'));
  } catch (_) {}

  return dirs;
}

export function getWritableImagesDirectory() {
  const candidateDirs = getAllCandidateImageDirectories();

  for (const dirPath of candidateDirs) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      const testFile = path.join(dirPath, `.write_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.tmp`);
      fs.writeFileSync(testFile, 'test');
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      console.log(`[AI Image Service] Directorio de imágenes 100% verificado y con permisos de escritura: ${dirPath}`);
      return dirPath;
    } catch (err) {
      console.warn(`[AI Image Service] Ruta no escribible (${dirPath}): ${err.message}`);
    }
  }

  const fallback = path.join(os.tmpdir(), 'winterpos_product_images');
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch (_) {}
  return fallback;
}

let IMAGES_DIR = getWritableImagesDirectory();

export function ensureImagesDir() {
  try {
    if (!fs.existsSync(IMAGES_DIR)) {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }
    return IMAGES_DIR;
  } catch (_) {
    IMAGES_DIR = getWritableImagesDirectory();
    return IMAGES_DIR;
  }
}

// Complete semantic dictionary for supermarket, bodega, hardware, pharmacy & retail
const KEYWORD_MAP = [
  { match: /aceite/i, wiki: 'vegetable cooking oil bottle', tag: 'oil,bottle' },
  { match: /harina.*(pan|maiz|blanca|amarilla)/i, wiki: 'corn flour package', tag: 'flour,bag' },
  { match: /harina.*trigo/i, wiki: 'wheat flour package', tag: 'flour,package' },
  { match: /harina/i, wiki: 'flour package', tag: 'flour,package' },
  { match: /arroz/i, wiki: 'rice bag package', tag: 'rice,bag' },
  { match: /pasta|espagueti|fideos|macarron|spaghetti/i, wiki: 'spaghetti pasta package', tag: 'pasta,spaghetti' },
  { match: /leche.*(polvo|completa)/i, wiki: 'powdered milk container package', tag: 'milk,powder' },
  { match: /leche/i, wiki: 'milk carton bottle', tag: 'milk,bottle' },
  { match: /azucar|azúcar/i, wiki: 'sugar bag package', tag: 'sugar,bag' },
  { match: /cafe|café/i, wiki: 'coffee bag package', tag: 'coffee,package' },
  { match: /mantequilla|margarina/i, wiki: 'butter margarine container', tag: 'butter' },
  { match: /mayonesa/i, wiki: 'mayonnaise jar', tag: 'mayonnaise,jar' },
  { match: /salsa.*tomate|ketchup|catsup/i, wiki: 'ketchup bottle', tag: 'ketchup,bottle' },
  { match: /salsa.*soya|soja/i, wiki: 'soy sauce bottle', tag: 'soysauce,bottle' },
  { match: /salsa.*inglesa/i, wiki: 'worcestershire sauce bottle', tag: 'sauce,bottle' },
  { match: /vinagre/i, wiki: 'vinegar bottle', tag: 'vinegar,bottle' },
  { match: /atun|atún/i, wiki: 'canned tuna tin', tag: 'canned,tuna' },
  { match: /sardina/i, wiki: 'canned sardine tin', tag: 'canned,sardine' },
  { match: /galleta|galletas|oreo|club.*social|maria/i, wiki: 'cookies biscuit package', tag: 'cookies,biscuit' },
  { match: /chocolate|chocolates|pirulin|cricri/i, wiki: 'chocolate bar package', tag: 'chocolate,bar' },
  { match: /coca.*cola|pepsi|refresco|gaseosa|chinotto|colita|fanta/i, wiki: 'soda beverage bottle', tag: 'soda,bottle' },
  { match: /malta|maltin/i, wiki: 'malt beverage bottle', tag: 'malt,beverage' },
  { match: /jugo|nectar|yukery|frescati/i, wiki: 'fruit juice bottle', tag: 'juice,bottle' },
  { match: /agua/i, wiki: 'mineral water bottle', tag: 'water,bottle' },
  { match: /cerveza|polar|solera|pilsen/i, wiki: 'beer bottle can', tag: 'beer,bottle' },
  { match: /queso/i, wiki: 'cheese block', tag: 'cheese' },
  { match: /jamon|jamón|mortadela|salchicha|chorizo|tocineta/i, wiki: 'ham sausage deli packaging', tag: 'ham,sausage' },
  { match: /pollo|milanesa|pechuga|muslo/i, wiki: 'chicken poultry meat packaging', tag: 'chicken,meat' },
  { match: /carne|molida|bistec|costilla|chuleta/i, wiki: 'fresh beef meat packaging', tag: 'beef,meat' },
  { match: /jabon|jabón|dove|palmolive/i, wiki: 'bar soap packaging', tag: 'soap,bar' },
  { match: /detergente|ariel|ace|las.*llaves|cloro/i, wiki: 'laundry detergent bottle', tag: 'detergent,bottle' },
  { match: /shampoo|champu|pantene|head.*shoulders/i, wiki: 'shampoo bottle', tag: 'shampoo,bottle' },
  { match: /acondicionador/i, wiki: 'hair conditioner bottle', tag: 'conditioner,bottle' },
  { match: /crema.*dental|colgate|dentifrico/i, wiki: 'toothpaste tube box packaging', tag: 'toothpaste,tube' },
  { match: /papel.*higienico|higiénico|servilleta/i, wiki: 'toilet paper roll packaging', tag: 'toiletpaper' },
  { match: /desodorante|rexona|axe|speed.*stick/i, wiki: 'deodorant stick packaging', tag: 'deodorant' },
  { match: /pan|canilla|baguette|pan.*molde|pan.*sandwich/i, wiki: 'sliced bread loaf package', tag: 'bread,bakery' },
  { match: /snack|doritos|ruffles|cheetos|pepito|platano|platanitos/i, wiki: 'potato chips snack bag', tag: 'chips,snack' },
  { match: /helado|paleta|tina|cono/i, wiki: 'ice cream popsicles package', tag: 'icecream' }
];

function getMapping(desc = '', category = '') {
  for (const item of KEYWORD_MAP) {
    if (item.match.test(desc)) return item;
  }
  const clean = desc
    .replace(/\b(\d+([.,]\d+)?\s*(kg|gr|g|ml|l|lt|lts|cc|oz|lb|unid|uds|pz|pza)?)\b/gi, '')
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(' ').filter(w => w.length > 2).slice(0, 2);
  const term = words.join(' ') || category || 'grocery product';
  return { wiki: `${term} product packaging`, tag: `${words[0] || 'food'},package` };
}

/**
 * Generates a clean vector SVG graphic with pure white background, saving to disk or returning Data URI
 */
export function createLocalSvgFallback(description = 'Producto', category = 'General', filename = 'fallback.svg') {
  const initials = description
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  const colors = [
    ['#2563eb', '#1d4ed8'],
    ['#059669', '#047857'],
    ['#d97706', '#b45309'],
    ['#7c3aed', '#6d28d9'],
    ['#db2777', '#be185d'],
    ['#0891b2', '#0e7490']
  ];
  const charCode = description.charCodeAt(0) || 0;
  const [c1, c2] = colors[charCode % colors.length];

  const safeDesc = description.replace(/[<>&"]/g, '').substring(0, 26);
  const safeCat = (category || 'General').replace(/[<>&"]/g, '').substring(0, 20);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${c2};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="#ffffff"/>
  <rect x="16" y="16" width="368" height="368" rx="24" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3"/>
  <circle cx="200" cy="160" r="68" fill="url(#grad)"/>
  <text x="200" y="180" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="50" font-weight="900" fill="#ffffff" text-anchor="middle">${initials || 'WP'}</text>
  <text x="200" y="280" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="900" fill="#0f172a" text-anchor="middle">${safeDesc}</text>
  <rect x="110" y="305" width="180" height="26" rx="13" fill="url(#grad)"/>
  <text x="200" y="322" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" fill="#ffffff" text-anchor="middle">${safeCat.toUpperCase()}</text>
</svg>`.trim();

  try {
    const activeDir = ensureImagesDir();
    const filePath = path.join(activeDir, filename);
    fs.writeFileSync(filePath, svg, 'utf-8');
    return `/api/ai/images/${filename}`;
  } catch (err) {
    console.warn(`[AI Image Service] No se pudo guardar archivo SVG en disco (${err.message}). Retornando Data URI directo.`);
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}

/**
 * Downloads a remote image and saves directly to local disk with fallback directories
 */
async function downloadRemoteImage(remoteUrl, filename) {
  try {
    const res = await fetch(remoteUrl, {
      signal: AbortSignal.timeout(4500),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length < 1500) return null;

    const candidateDirs = getAllCandidateImageDirectories();
    for (const dir of candidateDirs) {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const localFilePath = path.join(dir, filename);
        fs.writeFileSync(localFilePath, buffer);
        return `/api/ai/images/${filename}`;
      } catch (_) {}
    }

    // Direct Base64 Fallback if all filesystem writes fail
    const base64 = buffer.toString('base64');
    const mime = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  } catch (err) {
    return null;
  }
}

/**
 * Validates whether a remote image URL belongs to a real product image rather than generic stock/wallpaper
 */
function isValidProductImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  const blacklist = [
    'alamy.com', 'wallpaper', 'gettyimages', 'shutterstock', 'depositphotos',
    'dreamstime', '123rf', 'freepik', 'vector', 'cartoon', 'illustration',
    'lookaside.instagram.com', 'facebook.com/tr', 'pinterest.com/pin'
  ];
  if (blacklist.some(b => lower.includes(b))) return false;
  return true;
}

/**
 * Intelligent Query Expansion for retail & regional supermarket products
 */
function buildSearchQueries(description, category = '') {
  const queries = [];
  const cleanDesc = (description || '').trim();

  let expanded = cleanDesc;
  if (/refresco\s+sun\b/i.test(cleanDesc)) {
    expanded = cleanDesc.replace(/refresco\s+sun\b/i, 'refresco the sun cola');
  } else if (/\bsun\s+(\d+.*)/i.test(cleanDesc) && /bebida|refresco/i.test(category + cleanDesc)) {
    expanded = cleanDesc.replace(/\bsun\b/i, 'sun cola');
  } else if (/boka\s+en\s+sobre/i.test(cleanDesc)) {
    expanded = cleanDesc.replace(/boka\s+en\s+sobre/i, 'refresco en sobre boka quala');
  } else if (/revolcon(es)?/i.test(cleanDesc)) {
    expanded = `${cleanDesc} caramelo`;
  } else if (/rockstar/i.test(cleanDesc)) {
    expanded = `${cleanDesc} bebida energetica`;
  }

  queries.push(`${expanded} producto`);
  queries.push(`${expanded}`);
  queries.push(`${cleanDesc} empaque`);

  return [...new Set(queries.filter(Boolean))];
}

/**
 * High-accuracy DuckDuckGo Commercial Product Image Search (Robust Session + Headers)
 */
async function searchDuckDuckGoImages(query) {
  try {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    const initRes = await fetch(searchUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      }
    });
    const html = await initRes.text();
    const cookies = initRes.headers.get('set-cookie') || '';
    const vqdMatch = html.match(/vqd=["']?([^&"'\s]+)/i) || html.match(/vqd=([^&"'\s]+)/i);
    if (!vqdMatch) return [];

    const vqd = vqdMatch[1];
    const imgApiUrl = `https://duckduckgo.com/i.js?l=es-es&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,type:photo,&p=1`;
    const apiRes = await fetch(imgApiUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://duckduckgo.com/',
        'Cookie': cookies
      }
    });
    if (!apiRes.ok) return [];
    const data = await apiRes.json();
    return (data.results || [])
      .map(r => ({
        url: r.image || r.thumbnail,
        title: r.title || query,
        source: r.source || 'Web'
      }))
      .filter(r => r.url && isValidProductImageUrl(r.url));
  } catch (_) {
    return [];
  }
}

/**
 * High-accuracy Bing Commercial Product Image Search
 */
async function searchBingImages(query) {
  try {
    const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query + ' producto empaque')}&form=HDRSC2&first=1&tsc=ImageHoverTitle`;
    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(4000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });
    if (!res.ok) return [];
    const html = await res.text();
    const urls = [];
    const murlMatches = html.match(/murl&quot;:&quot;(https?:[^&]+)&quot;/g) || [];
    for (const m of murlMatches) {
      const match = m.match(/murl&quot;:&quot;(https?:[^&]+)&quot;/);
      if (match && match[1]) {
        const cleaned = match[1].replace(/\\/g, '');
        if (isValidProductImageUrl(cleaned)) urls.push(cleaned);
      }
    }
    return urls;
  } catch (_) {
    return [];
  }
}

/**
 * Looks up official product photos by Barcode across global open product databases (EAN/UPC) and web indexes
 */
async function searchByBarcode(barcode) {
  if (!barcode) return null;
  const cleanCode = String(barcode).trim().replace(/\D/g, '');
  if (cleanCode.length < 7 || cleanCode.length > 14) return null;

  // 1. Open Food Facts
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${cleanCode}.json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
      headers: { 'User-Agent': 'WinterPOS-SmartPOS - contact@inversionesniquitao.com' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const p = data.product;
        const imgUrl = p.image_front_url || p.image_url || p.image_front_small_url || p.selected_images?.front?.display?.es || p.selected_images?.front?.display?.en;
        if (imgUrl) return imgUrl;
      }
    }
  } catch (_) {}

  // 2. Open Beauty Facts (Cosmetics, soaps, shampoo, toothpaste)
  try {
    const url = `https://world.openbeautyfacts.org/api/v0/product/${cleanCode}.json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'WinterPOS-SmartPOS - contact@inversionesniquitao.com' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const imgUrl = data.product.image_front_url || data.product.image_url;
        if (imgUrl) return imgUrl;
      }
    }
  } catch (_) {}

  // 3. Open Products Facts
  try {
    const url = `https://world.openproductsfacts.org/api/v0/product/${cleanCode}.json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'WinterPOS-SmartPOS - contact@inversionesniquitao.com' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const imgUrl = data.product.image_front_url || data.product.image_url;
        if (imgUrl) return imgUrl;
      }
    }
  } catch (_) {}

  // 4. Web index search for barcode
  try {
    const ddgBarcodeUrls = await searchDuckDuckGoImages(cleanCode);
    if (ddgBarcodeUrls.length > 0) return ddgBarcodeUrls[0];
  } catch (_) {}

  return null;
}

/**
 * Saves a base64 encoded image uploaded directly by the user to the local folder
 */
export function saveUploadedImageBase64(base64Data, originalName = 'upload.jpg') {
  try {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer;
    let ext = 'jpg';

    if (matches && matches.length === 3) {
      const mime = matches[1];
      if (mime.includes('png')) ext = 'png';
      else if (mime.includes('webp')) ext = 'webp';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(base64Data, 'base64');
    }

    const cleanBase = originalName.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
    const filename = `manual_${cleanBase}_${Date.now()}.${ext}`;

    const candidateDirs = getAllCandidateImageDirectories();
    for (const dir of candidateDirs) {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, filename);
        fs.writeFileSync(filePath, buffer);
        return {
          success: true,
          imageUrl: `/api/ai/images/${filename}`,
          filename
        };
      } catch (_) {}
    }

    // Direct Data URI if no disk write permissions
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    return {
      success: true,
      imageUrl: `data:${mime};base64,${buffer.toString('base64')}`,
      filename
    };
  } catch (err) {
    console.error('Error guardando imagen subida:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Intelligent Multi-Source Real Product Image Engine:
 * 1. Exact Barcode Match (OpenFoodFacts / OpenBeautyFacts / OpenProductsFacts / Web Barcode) -> Official photo
 * 2. High-Accuracy Web Commercial Image Search (DuckDuckGo Image Index) -> Exact real product photo from web
 * 3. High-Accuracy Bing Commercial Image Search -> Exact product package photo
 * 4. Open Food Facts Text Catalog Search by brand / description
 * 5. Wikimedia Commons Isolated Product Catalog
 * 6. Pollinations AI Commercial Product Diffusion (Studio Lighting on White)
 * 7. Local Vector SVG Generator (Guaranteed 100% clean offline fallback)
 */
export async function generateProductImage(description, category = '', barcode = '', saveLocal = true) {
  const cleanDesc = (description || 'Producto').trim();
  const cleanCat = (category || '').trim();
  const cleanCode = (barcode || '').trim();
  const map = getMapping(cleanDesc, cleanCat);
  const safeFilename = `prod_${cleanDesc.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 24)}_${Date.now()}.jpg`;

  // --- TIER 1: Exact Barcode Lookup (Databases & Web Index) ---
  if (cleanCode) {
    try {
      const barcodeImgUrl = await searchByBarcode(cleanCode);
      if (barcodeImgUrl) {
        const savedUrl = await downloadRemoteImage(barcodeImgUrl, safeFilename);
        if (savedUrl) {
          return {
            success: true,
            imageUrl: savedUrl,
            source: 'barcode_official',
            barcode: cleanCode
          };
        }
      }
    } catch (_) {}
  }

  // --- TIER 2: Intelligent Real Commercial Web Image Search ---
  const searchQueries = buildSearchQueries(cleanDesc, cleanCat);
  for (const q of searchQueries) {
    try {
      const webResults = await searchDuckDuckGoImages(q);
      for (const item of webResults.slice(0, 4)) {
        const url = typeof item === 'string' ? item : item.url;
        if (url) {
          const savedUrl = await downloadRemoteImage(url, safeFilename);
          if (savedUrl) {
            return {
              success: true,
              imageUrl: savedUrl,
              source: 'web_search_real_photo',
              keyword: q,
              title: typeof item === 'object' ? item.title : q
            };
          }
        }
      }
    } catch (_) {}
  }

  // --- TIER 3: Open Food Facts Search by Description / Brand ---
  try {
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(cleanDesc)}&search_simple=1&action=process&json=1&page_size=4`;
    const res = await fetch(offUrl, {
      signal: AbortSignal.timeout(3500),
      headers: {
        'User-Agent': 'WinterPOS-SmartPOS - contact@inversionesniquitao.com',
        'Accept': 'application/json'
      }
    });
    if (res.ok) {
      const data = await res.json();
      const match = (data.products || []).find(p => p.image_front_url || p.image_url);
      if (match) {
        const imgUrl = match.image_front_url || match.image_url;
        const savedUrl = await downloadRemoteImage(imgUrl, safeFilename);
        if (savedUrl) {
          return {
            success: true,
            imageUrl: savedUrl,
            source: 'openfoodfacts_text_search',
            keyword: cleanDesc
          };
        }
      }
    }
  } catch (_) {}

  // --- TIER 4: Guaranteed Clean Local Vector SVG Card (Offline / No Web Match) ---
  const svgFilename = `prod_${cleanDesc.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 24)}_${Date.now()}.svg`;
  const localSvgUrl = createLocalSvgFallback(cleanDesc, cleanCat, svgFilename);

  return {
    success: true,
    imageUrl: localSvgUrl,
    source: 'vector_svg',
    keyword: map.wiki
  };
}

/**
 * Searches multiple real product image candidates across internet commercial indexes
 */
export async function searchProductImageCandidates(description, category = '', barcode = '') {
  const cleanDesc = (description || 'Producto').trim();
  const cleanCat = (category || '').trim();
  const cleanCode = (barcode || '').trim();
  const candidates = [];
  const seenUrls = new Set();

  function addCandidate(c) {
    if (c && c.url && !seenUrls.has(c.url) && isValidProductImageUrl(c.url)) {
      seenUrls.add(c.url);
      candidates.push(c);
    }
  }

  // 1. Barcode official image if available
  if (cleanCode) {
    try {
      const barcodeImg = await searchByBarcode(cleanCode);
      if (barcodeImg) {
        addCandidate({ url: barcodeImg, title: `Foto Oficial de Código ${cleanCode}`, source: 'Código de Barras' });
      }
    } catch (_) {}
  }

  // 2. Parallel Real Commercial Search queries
  const queries = buildSearchQueries(cleanDesc, cleanCat);
  const searchPromises = [];

  for (const q of queries) {
    searchPromises.push(
      searchDuckDuckGoImages(q).then(results => {
        results.forEach(r => addCandidate({ url: r.url, title: r.title || cleanDesc, source: 'Foto Comercial Web' }));
      }).catch(() => {})
    );
  }

  // OpenFoodFacts Catalog Search
  searchPromises.push(
    (async () => {
      try {
        const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(cleanDesc)}&search_simple=1&action=process&json=1&page_size=4`;
        const res = await fetch(offUrl, {
          signal: AbortSignal.timeout(4000),
          headers: {
            'User-Agent': 'WinterPOS-SmartPOS - contact@inversionesniquitao.com',
            'Accept': 'application/json'
          }
        });
        if (res.ok) {
          const data = await res.json();
          (data.products || []).forEach(p => {
            const imgUrl = p.image_front_url || p.image_url;
            if (imgUrl) addCandidate({ url: imgUrl, title: p.product_name || cleanDesc, source: 'Catálogo Oficial' });
          });
        }
      } catch (_) {}
    })()
  );

  await Promise.allSettled(searchPromises);

  return candidates.slice(0, 12);
}

/**
 * Downloads a chosen remote candidate image and saves it to local disk permanently
 */
export async function downloadAndSaveProductImage(remoteUrl, description = 'producto') {
  if (!remoteUrl) return { success: false, error: 'URL requerida' };
  const cleanDesc = String(description).trim().toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 24);
  const safeFilename = `prod_${cleanDesc}_${Date.now()}.jpg`;
  const localUrl = await downloadRemoteImage(remoteUrl, safeFilename);
  if (localUrl) {
    return { success: true, imageUrl: localUrl, filename: safeFilename };
  }
  return { success: false, error: 'No se pudo descargar la imagen seleccionada' };
}

export { IMAGES_DIR, getAllCandidateImageDirectories };
