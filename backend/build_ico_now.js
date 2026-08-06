import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const icoTargetPath = path.resolve(__dirname, '../installer/app_icon.ico');
const srcPngPath = 'C:\\Users\\NM29402.SC1_MZ1_JBTES\\.gemini\\antigravity-ide\\brain\\2dee14b5-c638-4898-be82-4522901e1212\\winterpos_al_icon_1786021999064.png';

try {
  if (fs.existsSync(srcPngPath)) {
    const pngBuffer = fs.readFileSync(srcPngPath);
    const header = Buffer.alloc(22);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header.writeUInt8(0, 6);
    header.writeUInt8(0, 7);
    header.writeUInt8(0, 8);
    header.writeUInt8(0, 9);
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(pngBuffer.length, 14);
    header.writeUInt32LE(22, 18);
    const icoBuffer = Buffer.concat([header, pngBuffer]);
    fs.writeFileSync(icoTargetPath, icoBuffer);
    console.log(`[Icon Build] SUCCESS! Created app_icon.ico at ${icoTargetPath}`);
  }
} catch (errIco) {
  console.error('[Icon Build Error]', errIco.message);
}

try {
  const doubleExe = path.resolve(__dirname, '../installer/postgresql-installer.exe.exe');
  const singleExe = path.resolve(__dirname, '../installer/postgresql-installer.exe');
  if (fs.existsSync(doubleExe)) {
    fs.renameSync(doubleExe, singleExe);
    console.log(`[PG Rename] Renamed ${doubleExe} -> ${singleExe}`);
  }
} catch (errPg) {
  console.error('[PG Rename Error]', errPg.message);
}
