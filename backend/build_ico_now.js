import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const icoTargetPath = path.join(projectRoot, 'installer', 'app_icon.ico');
const srcPngPath = path.join(projectRoot, 'WinterPosAL', 'public', 'cashier.png');

console.log('[Icon Build] Generando app_icon.ico compatible con Inno Setup...');

try {
  if (fs.existsSync(srcPngPath)) {
    const psScript = `
      Add-Type -TypeDefinition @"
      using System;
      using System.Drawing;
      using System.Drawing.Imaging;
      using System.IO;

      public class IcoConverter {
          public static void ConvertPngToIco(string pngPath, string icoPath) {
              using (Bitmap src = new Bitmap(pngPath)) {
                  using (FileStream fs = new FileStream(icoPath, FileMode.Create)) {
                      using (BinaryWriter bw = new BinaryWriter(fs)) {
                          int[] sizes = new int[] { 16, 32, 48, 256 };
                          int count = sizes.Length;

                          bw.Write((ushort)0);
                          bw.Write((ushort)1);
                          bw.Write((ushort)count);

                          byte[][] pngBytes = new byte[count][];
                          for (int i = 0; i < count; i++) {
                              int sz = sizes[i];
                              using (Bitmap resized = new Bitmap(src, new Size(sz, sz))) {
                                  using (MemoryStream ms = new MemoryStream()) {
                                      resized.Save(ms, ImageFormat.Png);
                                      pngBytes[i] = ms.ToArray();
                                  }
                              }
                          }

                          int offset = 6 + (16 * count);

                          for (int i = 0; i < count; i++) {
                              int sz = sizes[i];
                              bw.Write((byte)(sz == 256 ? 0 : sz));
                              bw.Write((byte)(sz == 256 ? 0 : sz));
                              bw.Write((byte)0);
                              bw.Write((byte)0);
                              bw.Write((ushort)1);
                              bw.Write((ushort)32);
                              bw.Write((uint)pngBytes[i].Length);
                              bw.Write((uint)offset);
                              offset += pngBytes[i].Length;
                          }

                          for (int i = 0; i < count; i++) {
                              bw.Write(pngBytes[i]);
                          }
                      }
                  }
              }
          }
      }
"@ -ReferencedAssemblies "System.Drawing.dll"

      [IcoConverter]::ConvertPngToIco("${srcPngPath.replace(/\\/g, '\\\\')}", "${icoTargetPath.replace(/\\/g, '\\\\')}")
    `;
    
    const tempPsFile = path.join(__dirname, 'make_icon_inno.ps1');
    fs.writeFileSync(tempPsFile, psScript, 'utf8');
    
    execSync(`powershell -ExecutionPolicy Bypass -File "${tempPsFile}"`);
    if (fs.existsSync(tempPsFile)) fs.unlinkSync(tempPsFile);

    console.log(`[Icon Build] ÉXITO! app_icon.ico creado correctamente en: ${icoTargetPath}`);
  } else {
    console.error('[Icon Build Error] No se encontró el archivo de origen:', srcPngPath);
  }
} catch (errIco) {
  console.error('[Icon Build Error]', errIco.message);
}
