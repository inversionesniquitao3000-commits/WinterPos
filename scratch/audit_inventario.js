import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../WinterPosAL/src/components/Inventario.tsx');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');

console.log('--- Unsafe products / movements / priceHistory / localStorage usages ---');
lines.forEach((line, idx) => {
  const lineNum = idx + 1;
  if (line.includes('localStorage.getItem(') && !line.includes('try')) {
    console.log(`Line ${lineNum}: Unsafe localStorage.getItem without try/catch: ${line.trim()}`);
  }
  if (line.includes('products.') && !line.includes('safeProducts') && !line.includes('Array.isArray(products)')) {
    console.log(`Line ${lineNum}: Direct products property access: ${line.trim()}`);
  }
  if (line.includes('movements.') && !line.includes('safeMovements') && !line.includes('Array.isArray(movements)')) {
    console.log(`Line ${lineNum}: Direct movements property access: ${line.trim()}`);
  }
  if (line.includes('priceHistory.') && !line.includes('safePriceHistory') && !line.includes('Array.isArray(priceHistory)')) {
    console.log(`Line ${lineNum}: Direct priceHistory property access: ${line.trim()}`);
  }
});
