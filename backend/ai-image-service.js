import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getWritableImagesDirectory() {
  const candidateDirs = [
    path.join(__dirname, 'data', 'product_images'),
    path.resolve(process.cwd(), 'backend', 'data', 'product_images'),
    path.resolve(process.cwd(), 'data', 'product_images'),
    path.resolve(__dirname, '..', 'data', 'product_images')
  ];

  if (process.env.APPDATA) {
    candidateDirs.push(path.join(process.env.APPDATA, 'WinterPos', 'data', 'product_images'));
  }
  if (process.env.LOCALAPPDATA) {
    candidateDirs.push(path.join(process.env.LOCALAPPDATA, 'WinterPos', 'data', 'product_images'));
  }
  try {
    if (os.homedir()) {
      candidateDirs.push(path.join(os.homedir(), '.winterpos', 'data', 'product_images'));
    }
  } catch (_) {}

  for (const dirPath of candidateDirs) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      const testFile = path.join(dirPath, `.write_test_${Date.now()}.tmp`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`[AI Image Service] Directorio de imágenes verificado y listo: ${dirPath}`);
      return dirPath;
    } catch (err) {
      console.warn(`[AI Image Service] Ruta no escribible (${dirPath}): ${err.message}`);
    }
  }

  const fallback = path.resolve('./data/product_images');
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch (_) {}
  return fallback;
}

const IMAGES_DIR = getWritableImagesDirectory();

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
 * Generates a clean vector SVG graphic file saved on local disk with pure white background
 */
function createLocalSvgFallback(description = 'Producto', category = 'General', filename = 'fallback.svg') {
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

  const filePath = path.join(IMAGES_DIR, filename);
  fs.writeFileSync(filePath, svg, 'utf-8');
  return `/api/ai/images/${filename}`;
}

/**
 * Downloads a remote image and saves directly to local disk
 */
async function downloadRemoteImage(remoteUrl, localFilePath) {
  try {
    const res = await fetch(remoteUrl, {
      signal: AbortSignal.timeout(4500),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return false;
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length < 1500) return false;
    fs.writeFileSync(localFilePath, buffer);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Looks up official product photos by Barcode across global open product databases (EAN/UPC)
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
    const filePath = path.join(IMAGES_DIR, filename);

    fs.writeFileSync(filePath, buffer);
    return {
      success: true,
      imageUrl: `/api/ai/images/${filename}`,
      filename
    };
  } catch (err) {
    console.error('Error guardando imagen subida:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Intelligent Multi-Source Product Image Engine (White Studio Background Priority):
 * 1. Exact Barcode Match (OpenFoodFacts / OpenBeautyFacts / OpenProductsFacts) -> Official commercial photo!
 * 2. Exact Brand/Product Text Search (OpenFoodFacts text query)
 * 3. Wikimedia Commons Commercial Product Catalog (White Background Isolated Photos)
 * 4. Pollinations AI Commercial Diffusion Engine (Isolated Product on Pure White Background)
 * 5. LoremFlickr Retail Category Photography
 * 6. Local Vector SVG Generator (Guaranteed 100% offline fallback with white studio background)
 */
export async function generateProductImage(description, category = '', barcode = '', saveLocal = true) {
  if (!description || !description.trim()) {
    const fallbackFilename = `fallback_${Date.now()}.svg`;
    const fallbackUrl = createLocalSvgFallback('Producto', category, fallbackFilename);
    return {
      success: true,
      imageUrl: fallbackUrl,
      source: 'fallback'
    };
  }

  const cleanDesc = description.trim();
  const cleanCat = (category || '').trim();
  const cleanCode = (barcode || '').trim();
  const map = getMapping(cleanDesc, cleanCat);
  const safeFilename = `prod_${cleanDesc.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 24)}_${Date.now()}.jpg`;
  const localFilePath = path.join(IMAGES_DIR, safeFilename);

  // --- TIER 1: Exact Barcode Lookup ---
  if (cleanCode) {
    try {
      const barcodeImgUrl = await searchByBarcode(cleanCode);
      if (barcodeImgUrl) {
        const saved = await downloadRemoteImage(barcodeImgUrl, localFilePath);
        if (saved) {
          return {
            success: true,
            imageUrl: `/api/ai/images/${safeFilename}`,
            source: 'barcode_official',
            barcode: cleanCode
          };
        }
      }
    } catch (_) {}
  }

  // --- TIER 2: Open Food Facts Search by Description / Brand ---
  try {
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(cleanDesc)}&search_simple=1&action=process&json=1&page_size=3`;
    const res = await fetch(offUrl, {
      signal: AbortSignal.timeout(3500),
      headers: { 'User-Agent': 'WinterPOS-SmartPOS - contact@inversionesniquitao.com' }
    });
    if (res.ok) {
      const data = await res.json();
      const match = data.products?.find(p => p.image_front_url || p.image_url);
      if (match) {
        const imgUrl = match.image_front_url || match.image_url;
        const saved = await downloadRemoteImage(imgUrl, localFilePath);
        if (saved) {
          return {
            success: true,
            imageUrl: `/api/ai/images/${safeFilename}`,
            source: 'openfoodfacts_text_search',
            keyword: cleanDesc
          };
        }
      }
    }
  } catch (_) {}

  // --- TIER 3: Wikimedia Commons White Background Studio Product Photo Search ---
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(map.wiki + ' isolated white background product packaging filetype:bitmap')}&gsrlimit=3&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json`;
    const res = await fetch(wikiUrl, {
      signal: AbortSignal.timeout(3500),
      headers: { 'User-Agent': 'WinterPOS-SmartEngine/1.0 (pos@inversionesniquitao.com)' }
    });
    if (res.ok) {
      const data = await res.json();
      const pages = data.query?.pages;
      if (pages) {
        for (const page of Object.values(pages)) {
          const thumb = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url;
          if (thumb && !thumb.endsWith('.svg.png') && !thumb.includes('icon') && !thumb.includes('logo')) {
            const saved = await downloadRemoteImage(thumb, localFilePath);
            if (saved) {
              return {
                success: true,
                imageUrl: `/api/ai/images/${safeFilename}`,
                source: 'wikimedia_photo',
                keyword: map.wiki
              };
            }
          }
        }
      }
    }
  } catch (_) {}

  // --- TIER 4: Pollinations AI Commercial Product Photography (Pure White Background) ---
  try {
    const prompt = `high resolution studio commercial product photograph of ${cleanDesc} ${map.wiki}, isolated centered on solid pure white background, studio 4k lighting, crisp product packaging, commercial photography`;
    const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=400&height=400&nologo=true`;
    const saved = await downloadRemoteImage(pollUrl, localFilePath);
    if (saved) {
      return {
        success: true,
        imageUrl: `/api/ai/images/${safeFilename}`,
        source: 'pollinations_ai_white_bg',
        keyword: map.wiki
      };
    }
  } catch (_) {}

  // --- TIER 5: LoremFlickr Retail Category Photography ---
  try {
    const flickrUrl = `https://loremflickr.com/400/400/${encodeURIComponent(map.tag)}/all`;
    const saved = await downloadRemoteImage(flickrUrl, localFilePath);
    if (saved) {
      return {
        success: true,
        imageUrl: `/api/ai/images/${safeFilename}`,
        source: 'loremflickr_photo',
        keyword: map.tag
      };
    }
  } catch (_) {}

  // --- TIER 6: Guaranteed Local Vector SVG Fallback with Studio White Card ---
  const svgFilename = `prod_${cleanDesc.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 24)}_${Date.now()}.svg`;
  const localSvgUrl = createLocalSvgFallback(cleanDesc, cleanCat, svgFilename);

  return {
    success: true,
    imageUrl: localSvgUrl,
    source: 'vector_svg',
    keyword: map.wiki
  };
}

export { IMAGES_DIR };
