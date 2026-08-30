import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import net from 'net';
import { fileURLToPath } from 'url';

// 1. Control Anti-Doble Clic Rápido (Lockfile en TEMP con 6s de enfriamiento)
const lockFilePath = path.join(os.tmpdir(), 'winterpos_launch.lock');
try {
  if (fs.existsSync(lockFilePath)) {
    const stats = fs.statSync(lockFilePath);
    const elapsed = Date.now() - stats.mtimeMs;
    if (elapsed < 6000) {
      process.exit(0); // Segunda ejecución descartada instantáneamente
    }
  }
  fs.writeFileSync(lockFilePath, String(process.pid), 'utf8');
} catch (_) {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendDir = path.join(__dirname, 'backend');
const isDebug = process.env.DEBUG_MODE === 'true';

if (isDebug) {
  console.log('====================================================');
  console.log('    INICIANDO WINTERPOS PUNTO DE VENTA (DESKTOP)    ');
  console.log('====================================================');
}

// 2. Verificar si el puerto 5000 ya está ocupado por un backend en ejecución
function checkPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

// 3. Esperar activamente a que el servidor HTTP responda antes de abrir la ventana
function waitForServerReady(targetUrl, timeoutMs = 30000) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const req = http.get(targetUrl, (res) => {
        clearInterval(interval);
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          resolve(false);
        }
      });
      req.setTimeout(500, () => {
        req.destroy();
      });
    }, 250);
  });
}

function findBrowserExe() {
  if (process.platform !== 'win32') return null;
  const progFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const progFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(progFiles, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(progFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(progFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(progFiles, 'Microsoft\\Edge\\Application\\msedge.exe')
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function launchAppWindow(targetUrl) {
  // Anti-duplicación estricta: No abrir más de 1 ventana en un intervalo de 6 segundos
  const windowLockPath = path.join(os.tmpdir(), 'winterpos_window.lock');
  try {
    if (fs.existsSync(windowLockPath)) {
      const stats = fs.statSync(windowLockPath);
      if (Date.now() - stats.mtimeMs < 6000) {
        return; // Ya se ordenó abrir una ventana hace menos de 6s
      }
    }
    fs.writeFileSync(windowLockPath, String(process.pid), 'utf8');
  } catch (_) {}

  if (process.platform === 'win32') {
    const browserExe = findBrowserExe();
    const appDataDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'WinterPos', 'browser-data');
    
    try {
      if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true });
      }
    } catch (_) {}

    // Limpiar caché de ventana maximizada previa para garantizar que siempre abra compacta
    try {
      const prefFile = path.join(appDataDir, 'Default', 'Preferences');
      if (fs.existsSync(prefFile)) {
        const prefContent = JSON.parse(fs.readFileSync(prefFile, 'utf8'));
        if (prefContent?.browser?.window_placement) {
          delete prefContent.browser.window_placement;
          fs.writeFileSync(prefFile, JSON.stringify(prefContent), 'utf8');
        }
      }
    } catch (_) {}

    const flags = [
      `--app=${targetUrl}`,
      `--user-data-dir="${appDataDir}"`,
      '--window-size=1060,650',
      '--window-position=160,60',
      '--disable-features=PasswordLeakDetection,PasswordCheck',
      '--disable-save-password-bubble',
      '--password-store=basic',
      '--no-default-browser-check',
      '--no-first-run'
    ].join(' ');

    const cmd = browserExe
      ? `start "" "${browserExe}" ${flags}`
      : `start "" chrome ${flags}`;

    exec(cmd, { windowsHide: true });
  } else if (process.platform === 'darwin') {
    exec(`open "${targetUrl}"`);
  } else {
    exec(`xdg-open "${targetUrl}"`);
  }
}

async function start() {
  const targetUrl = 'http://localhost:5000?mode=desktop';
  const isAlreadyRunning = await checkPortInUse(5000);

  let serverProcess = null;

  if (!isAlreadyRunning) {
    // Ensure .env exists before starting server
    const envPath = path.join(backendDir, '.env');
    if (!fs.existsSync(envPath)) {
      const defaultEnv = `PORT=5000\nDB_USER=postgres\nDB_PASSWORD=postgres\nDB_HOST=localhost\nDB_PORT=5432\nDB_DATABASE=Winter\n`;
      try { fs.writeFileSync(envPath, defaultEnv, 'utf8'); } catch (_) {}
    }

    serverProcess = spawn(process.execPath, ['server.js'], {
      cwd: backendDir,
      stdio: isDebug ? 'inherit' : 'ignore',
      windowsHide: !isDebug
    });

    serverProcess.on('close', (code) => {
      if (isDebug) {
        console.log(`\n[WinterPos] Servidor detenido con código ${code}`);
      }
      process.exit(code || 0);
    });

    serverProcess.on('error', (err) => {
      console.error('[WinterPos Error en Servidor]', err);
    });

    process.on('SIGINT', () => {
      if (serverProcess) serverProcess.kill();
      process.exit();
    });

    process.on('SIGTERM', () => {
      if (serverProcess) serverProcess.kill();
      process.exit();
    });
  }

  // Esperar a que el backend esté listo y abrir estrictamente 1 sola ventana
  await waitForServerReady('http://localhost:5000');
  launchAppWindow(targetUrl);

  if (isAlreadyRunning) {
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

start();

