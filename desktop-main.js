import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendDir = path.join(__dirname, 'backend');

console.log('====================================================');
console.log('    INICIANDO WINTERPOS PUNTO DE VENTA DESK-APP     ');
console.log('====================================================');

// Start backend server and DB initialization without shell warning
const serverProcess = spawn(process.execPath, ['setup-launcher.js'], {
  cwd: backendDir,
  stdio: 'inherit'
});

// Window Launcher - Opens dedicated Native App Window
setTimeout(() => {
  const targetUrl = 'http://localhost:5000';
  console.log(`[Desktop App] Lanzando ventana nativa de escritorio para: ${targetUrl}`);
  
  if (process.platform === 'win32') {
    // Launch in app mode using Edge Chromium engine for dedicated app window experience
    const cmd = `start msedge --app=${targetUrl} --window-size=1280,800 --name="WinterPos Punto de Venta"`;
    exec(cmd, (err) => {
      if (err) {
        console.log('[Desktop App] Fallback: Abriendo en navegador predeterminado...');
        exec(`start ${targetUrl}`);
      }
    });
  } else if (process.platform === 'darwin') {
    exec(`open ${targetUrl}`);
  } else {
    exec(`xdg-open ${targetUrl}`);
  }
}, 4000);

process.on('SIGINT', () => {
  if (serverProcess) serverProcess.kill();
  process.exit();
});
