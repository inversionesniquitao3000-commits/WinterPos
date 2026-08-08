import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendDir = path.join(__dirname, 'backend');

const isDebug = process.env.DEBUG_MODE === 'true';

if (isDebug) {
  console.log('====================================================');
  console.log('    INICIANDO WINTERPOS PUNTO DE VENTA (DEBUG CMD)  ');
  console.log('====================================================');
}

// Start backend server and DB initialization silently unless DEBUG_MODE is set
const serverProcess = spawn(process.execPath, ['setup-launcher.js'], {
  cwd: backendDir,
  stdio: isDebug ? 'inherit' : 'ignore',
  windowsHide: !isDebug
});

// Window Launcher - Opens dedicated Native App Window
setTimeout(() => {
  const targetUrl = 'http://localhost:5000';
  if (isDebug) {
    console.log(`[Desktop App] Lanzando ventana nativa de escritorio para: ${targetUrl}`);
  }
  
  if (process.platform === 'win32') {
    const cmd = `start chrome --app=${targetUrl} --window-size=1280,800`;
    exec(cmd, { windowsHide: true }, (err) => {
      if (err) {
        exec(`start ${targetUrl}`, { windowsHide: true });
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

