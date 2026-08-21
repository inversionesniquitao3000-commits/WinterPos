import { getWhatsConfigDb, saveWhatsConfigDb, readJsonFile, writeJsonFile } from './db-store.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Session and auth directory in writable AppData (safe across all Windows installations)
const AUTH_DATA_DIR = path.join(
  process.env.LOCALAPPDATA || process.env.APPDATA || (process.platform === 'win32' ? 'C:\\ProgramData' : os.homedir()),
  'WinterPOS',
  'whatsapp_auth'
);

// Ensure writable session folder exists
if (!fs.existsSync(AUTH_DATA_DIR)) {
  try {
    fs.mkdirSync(AUTH_DATA_DIR, { recursive: true });
  } catch (_) {}
}

// Helper to clean orphaned Chrome processes that lock the WhatsApp profile
export function killOrphanedChrome() {
  if (process.platform !== 'win32') return;
  try {
    const psScript = `Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*chrome*' -and ($_.CommandLine -like '*winterpos-session*' -or $_.CommandLine -like '*wwebjs*' -or $_.CommandLine -like '*puppeteer*') } | Stop-Process -Force`;
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`, { stdio: 'ignore', timeout: 5000 });
  } catch (err) {
    try {
      const out = execSync('wmic process where "name=\'chrome.exe\'" get processid,commandline /format:csv', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).toString();
      const lines = out.split('\r\n').filter(l => l.includes('session-winterpos-session') || l.includes('wwebjs_auth') || l.includes('puppeteer') || l.includes('whatsapp_auth'));
      for (const line of lines) {
        const parts = line.trim().split(',');
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(Number(pid))) {
          try {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: 3000 });
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
}

// Helper to clean lock files in session folder
export function cleanSessionLocks() {
  const dirsToClean = [
    AUTH_DATA_DIR,
    path.join(AUTH_DATA_DIR, 'session-winterpos-session'),
    path.resolve(process.cwd(), '.wwebjs_auth', 'session-winterpos-session'),
    path.resolve(process.cwd(), '.wwebjs_auth'),
    path.join(__dirname, '.wwebjs_auth', 'session-winterpos-session'),
    path.join(__dirname, '.wwebjs_auth')
  ];
  const lockFiles = ['DevToolsActivePort', 'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'CrashpadMetrics-active.pma', 'lockfile'];

  for (const sessionDir of dirsToClean) {
    try {
      if (fs.existsSync(sessionDir)) {
        for (const file of lockFiles) {
          const filePath = path.join(sessionDir, file);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              console.log(`[WhatsApp] Archivo de bloqueo limpiado: ${filePath}`);
            } catch (e) {}
          }
        }
      }
    } catch (err) {}
  }
}

// Helper to completely delete session and cache folders
export function deleteFullSessionFolder() {
  const dirsToDelete = [
    AUTH_DATA_DIR,
    path.resolve(process.cwd(), '.wwebjs_auth'),
    path.resolve(process.cwd(), '.wwebjs_cache'),
    path.join(__dirname, '.wwebjs_auth'),
    path.join(__dirname, '.wwebjs_cache')
  ];

  for (const dir of dirsToDelete) {
    try {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
        } catch (rmErr) {
          if (process.platform === 'win32') {
            try {
              execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath '${dir}' -Recurse -Force"`, { stdio: 'ignore', timeout: 4000 });
            } catch (e) {
              try {
                execSync(`rmdir /s /q "${dir}"`, { stdio: 'ignore', timeout: 4000 });
              } catch (e2) {}
            }
          }
        }
        console.log(`[WhatsApp] Carpeta de sesión eliminada por completo: ${dir}`);
      }
    } catch (err) {
      console.warn(`[WhatsApp] Advertencia al eliminar directorio ${dir}:`, err.message);
    }
  }
  try {
    fs.mkdirSync(AUTH_DATA_DIR, { recursive: true });
  } catch (_) {}
}

// Desbloquear sesiones atrapadas sin borrar credenciales válidas
export async function unlockWhatsAppSession() {
  console.log('[WhatsApp] Desbloqueando sesiones atrapadas de WhatsApp...');
  await destroyWhatsAppClient();
  killOrphanedChrome();
  cleanSessionLocks();
  setTimeout(() => {
    initWhatsAppClient().catch(err => console.warn('[WhatsApp] Error en inicio tras desbloqueo:', err?.message || err));
  }, 1000);
  return {
    success: true,
    message: 'Procesos huérfanos cerrados y archivos de bloqueo liberados con éxito.'
  };
}

// Resetear sesión completa (para cuando auth timeout o sesión corrupta)
export async function resetWhatsAppSession() {
  console.log('[WhatsApp] Reseteando sesión de WhatsApp y limpiando datos...');
  await destroyWhatsAppClient();
  killOrphanedChrome();
  cleanSessionLocks();
  deleteFullSessionFolder();
  setTimeout(() => {
    initWhatsAppClient().catch(err => console.warn('[WhatsApp] Error en inicio tras reseteo:', err?.message || err));
  }, 1500);
  return {
    success: true,
    message: 'Sesión eliminada completamente. Generando nuevo código QR de vinculación...'
  };
}

// Cerrar sesión activa (Logout)
export async function logoutWhatsAppSession() {
  console.log('[WhatsApp] Cerrando sesión activa de WhatsApp (Logout)...');
  if (client) {
    try {
      if (typeof client.logout === 'function') {
        await client.logout();
      }
    } catch (e) {
      console.warn('[WhatsApp] Error durante client.logout():', e?.message || e);
    }
  }
  return await resetWhatsAppSession();
}

// Default configuration
const defaultConfig = {
  enabled: false,
  groupId: '',
  groupName: 'Grupo de Cierres POS',
  messageTemplate: `📊 *REPORTE DE ARQUEO Y CIERRE DE CAJA*

📅 *Fecha:* {fecha}
👤 *Cajero:* {usuario}
🖥️ *Terminal:* {terminal}

💵 *EFECTIVO ESPERADO EN GAVETA:*
• Dólares (USD): $ {dineroEnCajaExpected}
• Bolívares (VES): Bs {expectedVes}

📥 *EFECTIVO FÍSICO RECIBIDO:*
• Dólares (USD): $ {realUsd}
• Bolívares (VES): Bs {realVes}

⚖️ *DIFERENCIA (BALANCE):*
• Dólares (USD): {diffUsd}
• Bolívares (VES): {diffVes}

🛍️ *VENTAS TOTALES DEL TURNO:* $ {ventaTotalUsd} USD
📉 *DESCUENTOS APLICADOS:* $ {descuentosUsd} USD

*WinterPosAL Cloud System*`,
  utilidadesMessageTemplate: `💼 *REPORTE DE UTILIDADES Y GASTOS OPERATIVOS*
🏬 *{empresa}*
📅 *Fecha:* {fecha}
💱 *Tasa BCV:* {tasaBcv} Bs/USD

📊 *RESUMEN FINANCIERO:*
📈 *Utilidad Bruta:* ${'{utilidadBrutaUsd}'} USD | Bs {utilidadBrutaVes} VES
🔻 *(-) Gastos Deducibles:* -${'{totalGastosUsd}'} USD | -Bs {totalGastosVes} VES
💰 *(=) Utilidad Neta Distribuable:* *${'{utilidadNetaUsd}'} USD* | *Bs {utilidadNetaVes} VES*

📝 *DESGLOSE DE GASTOS OPERATIVOS ({cantGastos}):*
{desgloseGastos}

👥 *MONTO A COBRAR POR ACCIONISTA:*
{desgloseAccionistas}`,
  cobroClientesMessageTemplate: `👤 *RECORDATORIO DE PAGO DE CUENTA*

🏬 *{empresa}*
📅 *Fecha:* {fecha}
👤 *Cliente:* {cliente}
🆔 *Cédula/RIF:* {cedulaRif}

🚨 *Estimado(a) cliente, le enviamos un cordial saludo para recordarle su estado de cuenta:*

💰 *Monto Adeudado:* *${'{saldoPendienteUsd}'} USD*
🇻🇪 *Monto en Bolívares (Tasa BCV {tasaBcv}):* *Bs {saldoPendienteVes}*

💳 *Límite de Crédito:* ${'{limiteCreditoUsd}'} USD
✅ *Crédito Disponible:* ${'{creditoDisponibleUsd}'} USD

🙏 *Agradecemos realizar su abono a la brevedad posible para mantener activo su margen de crédito. ¡Gracias por su preferencia!*`
};

// Global WhatsApp client state
let client = null;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'QR_READY' | 'AUTHENTICATING' | 'CONNECTED'
let lastQrCode = ''; // Base64 image string or raw text
let isMockMode = false;
let mockTimer = null;
let lastInitError = null;
let detectedChromePath = null;
let heartbeatTimer = null;
let authWatchdogTimer = null;
let isReconnecting = false;

// Load config
export async function getWhatsAppConfig() {
  try {
    return await getWhatsConfigDb();
  } catch (e) {
    return defaultConfig;
  }
}

export async function saveWhatsAppConfig(config) {
  const updated = await saveWhatsConfigDb(config);
  
  // Re-evaluate client status if toggle changed
  if (updated.enabled) {
    initWhatsAppClient().catch(err => console.warn('[WhatsApp] Error en inicio tras guardar configuración:', err?.message || err));
  } else {
    destroyWhatsAppClient().catch(() => {});
  }
  return updated;
}

export async function getWhatsAppStatus() {
  if (!detectedChromePath) {
    detectedChromePath = findChromeExecutable();
  }
  const config = await getWhatsAppConfig();
  return {
    status: connectionStatus,
    qr: connectionStatus === 'QR_READY' ? lastQrCode : '',
    isMock: isMockMode,
    detectedChromePath: detectedChromePath,
    lastError: lastInitError,
    config
  };
}

// Destroy client session
async function destroyWhatsAppClient() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (authWatchdogTimer) {
    clearInterval(authWatchdogTimer);
    authWatchdogTimer = null;
  }
  if (mockTimer) {
    clearTimeout(mockTimer);
    mockTimer = null;
  }
  if (client) {
    try {
      console.log('[WhatsApp] Destruyendo sesión de WhatsApp...');
      if (!isMockMode && typeof client.destroy === 'function') {
        await client.destroy();
      }
    } catch (e) {
      console.error('[WhatsApp] Error al destruir cliente:', e.message);
    }
    client = null;
  }
  connectionStatus = 'DISCONNECTED';
  lastQrCode = '';
}

function findChromeExecutable() {
  if (process.platform === 'win32') {
    const homeDir = os.homedir();
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData\\Local');
    const progFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const progFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

    // High Priority: Google Chrome (preferred engine for whatsapp-web.js)
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(progFiles, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(progFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe')
    ];

    for (const p of chromePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    // Medium Priority: Downloaded Puppeteer Chrome in .cache/puppeteer
    const puppeteerCacheDirs = [
      path.join(homeDir, '.cache', 'puppeteer'),
      path.join(localAppData, 'Puppeteer'),
      'C:\\ProgramData\\puppeteer'
    ];

    for (const cacheDir of puppeteerCacheDirs) {
      if (fs.existsSync(cacheDir)) {
        try {
          const findExeRecursively = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              const fullPath = path.join(dir, file);
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                const found = findExeRecursively(fullPath);
                if (found) return found;
              } else if (file.toLowerCase() === 'chrome.exe') {
                return fullPath;
              }
            }
            return null;
          };
          const foundChrome = findExeRecursively(cacheDir);
          if (foundChrome) {
            return foundChrome;
          }
        } catch (errCache) {}
      }
    }

    // Fallback Priority: Microsoft Edge (present by default on all Windows 10/11) / Brave
    const fallbackPaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(progFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(progFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(progFiles, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
      path.join(localAppData, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')
    ];

    for (const p of fallbackPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }
  return null;
}

// Keep-Alive Heartbeat to prevent background sleep & detect silent drops
function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(async () => {
    const config = await getWhatsAppConfig();
    if (!config.enabled || !client || isMockMode) return;

    try {
      if (client.pupPage && !client.pupPage.isClosed()) {
        const pageState = await client.pupPage.evaluate(() => {
          const hasChatList = !!document.querySelector('#pane-side') || 
                              !!document.querySelector('[data-testid="chat-list"]') ||
                              !!document.querySelector('[aria-label="Lista de chats"]') ||
                              !!document.querySelector('[aria-label="Chat list"]');
          const isConnectedStore = window.Store && window.Store.AppState && window.Store.AppState.state === 'CONNECTED';
          const hasQrCanvas = !!document.querySelector('canvas');
          return { hasChatList, isConnectedStore, hasQrCanvas };
        }).catch(() => null);

        if (pageState) {
          if ((pageState.hasChatList || pageState.isConnectedStore) && connectionStatus !== 'CONNECTED') {
            console.log('[WhatsApp Heartbeat] Sincronización activa verificada. Estableciendo estado CONNECTED.');
            connectionStatus = 'CONNECTED';
            lastQrCode = '';
            ensureWWebJSInjected(client);
          } else if (pageState.hasQrCanvas && connectionStatus === 'CONNECTED') {
            console.warn('[WhatsApp Heartbeat] La sesión fue desvinculada desde el teléfono.');
            connectionStatus = 'QR_READY';
          }
        }
      }
    } catch (err) {
      // Ignorar errores transitorios de evaluación
    }
  }, 25000);
}

// Watchdog to prevent getting stuck in AUTHENTICATING
function startAuthWatchdog() {
  if (authWatchdogTimer) clearInterval(authWatchdogTimer);
  let checksCount = 0;

  authWatchdogTimer = setInterval(async () => {
    checksCount++;
    if (connectionStatus !== 'AUTHENTICATING' || !client) {
      clearInterval(authWatchdogTimer);
      authWatchdogTimer = null;
      return;
    }

    try {
      if (client.pupPage && !client.pupPage.isClosed()) {
        const check = await client.pupPage.evaluate(() => {
          const hasChatList = !!document.querySelector('#pane-side') || 
                              !!document.querySelector('[data-testid="chat-list"]') ||
                              !!document.querySelector('[aria-label="Lista de chats"]') ||
                              !!document.querySelector('[aria-label="Chat list"]') ||
                              !!document.querySelector('div[contenteditable="true"]');
          const isConnectedStore = window.Store && window.Store.AppState && window.Store.AppState.state === 'CONNECTED';
          return { hasChatList, isConnectedStore };
        }).catch(() => null);

        if (check && (check.hasChatList || check.isConnectedStore)) {
          console.log('[WhatsApp Watchdog] ¡Interfaz principal de WhatsApp detectada lista en el navegador! Forzando estado CONNECTED.');
          connectionStatus = 'CONNECTED';
          lastQrCode = '';
          clearInterval(authWatchdogTimer);
          authWatchdogTimer = null;
          ensureWWebJSInjected(client);
          return;
        }

        // Si pasan 60 segundos y sigue colgado, recargar el marco para destrabarlo
        if (checksCount >= 20) {
          console.warn('[WhatsApp Watchdog] Sincronización demorada (>60s). Recargando página para desbloquear...');
          checksCount = 0;
          await client.pupPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        }
      }
    } catch (e) {}
  }, 3000);
}

// Initialize WhatsApp client
export async function initWhatsAppClient() {
  const config = await getWhatsAppConfig();
  if (!config.enabled) {
    await destroyWhatsAppClient();
    return;
  }

  if (client) {
    try {
      await destroyWhatsAppClient();
    } catch (e) {}
  }

  // Pre-cleanup locks and orphaned chrome instances
  killOrphanedChrome();
  cleanSessionLocks();

  console.log('[WhatsApp] Inicializando servicio de WhatsApp con protección anti-bloqueo...');
  connectionStatus = 'AUTHENTICATING';
  startAuthWatchdog();

  try {
    const { default: pkg } = await import('whatsapp-web.js');
    const { Client, LocalAuth, MessageMedia } = pkg;
    const qrcode = await import('qrcode');

    detectedChromePath = findChromeExecutable();
    console.log('[WhatsApp] Motor de navegación detectado en:', detectedChromePath || 'Chromium interno');

    const userAgentStr = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    const puppeteerConfig = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=IsolateOrigins,site-per-process,AudioServiceOutOfProcess,CalculateNativeWinOcclusion',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800',
        '--disable-web-security',
        `--user-agent=${userAgentStr}`
      ]
    };
    if (detectedChromePath) {
      puppeteerConfig.executablePath = detectedChromePath;
    }

    client = new Client({
      authStrategy: new LocalAuth({ 
        clientId: "winterpos-session",
        dataPath: AUTH_DATA_DIR
      }),
      userAgent: userAgentStr,
      authTimeoutMs: 180000,
      qrMaxRetries: 15,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 0,
      bypassCSP: true,
      webVersionCache: {
        type: 'none'
      },
      puppeteer: puppeteerConfig
    });

    client.on('qr', async (qr) => {
      console.log('[WhatsApp] Código QR generado. Listo para escanear en F10 Config.');
      connectionStatus = 'QR_READY';
      try {
        lastQrCode = await qrcode.toDataURL(qr);
      } catch (err) {
        lastQrCode = qr;
      }
    });

    client.on('loading_screen', (percent, message) => {
      console.log(`[WhatsApp] Sincronizando chats del teléfono (${percent}%): ${message}`);
      if (connectionStatus !== 'CONNECTED') {
        connectionStatus = 'AUTHENTICATING';
      }
    });

    client.on('ready', () => {
      console.log('[WhatsApp] ¡Cliente Conectado y Listo!');
      connectionStatus = 'CONNECTED';
      lastQrCode = '';
      ensureWWebJSInjected(client);
    });

    client.on('authenticated', () => {
      console.log('[WhatsApp] Sesión autenticada exitosamente en el servidor.');
      if (connectionStatus !== 'CONNECTED') {
        connectionStatus = 'AUTHENTICATING';
      }
    });

    client.on('auth_failure', (msg) => {
      console.error('[WhatsApp] Falla en la autenticación:', msg);
      connectionStatus = 'DISCONNECTED';
      lastQrCode = '';
    });

    client.on('disconnected', async (reason) => {
      console.log('[WhatsApp] Cliente desconectado:', reason);
      connectionStatus = 'DISCONNECTED';
      lastQrCode = '';

      // Auto-reconectar automáticamente si no fue logout manual
      const conf = await getWhatsAppConfig();
      if (conf.enabled && reason !== 'LOGOUT' && !isReconnecting) {
        isReconnecting = true;
        console.log('[WhatsApp] Programando reconexión automática en 4 segundos...');
        setTimeout(async () => {
          try {
            await unlockWhatsAppSession();
          } finally {
            isReconnecting = false;
          }
        }, 4000);
      }
    });

    try {
      await client.initialize();
    } catch (initErr) {
      const initErrMsg = String(initErr?.message || initErr);
      if (initErrMsg.includes('already running') || initErrMsg.includes('userDataDir')) {
        console.warn('[WhatsApp] Reintentando inicialización tras limpiar bloqueo de proceso...');
        killOrphanedChrome();
        cleanSessionLocks();
        await new Promise(r => setTimeout(r, 1500));
        await client.initialize();
      } else {
        throw initErr;
      }
    }

    isMockMode = false;
    lastInitError = null;
    startHeartbeat();

  } catch (err) {
    const errMsg = err?.message || String(err);
    lastInitError = errMsg;
    console.warn('[WhatsApp] Error al inicializar cliente real. Iniciando en Modo Simulación.');
    console.error('[WhatsApp] Error detallado al inicializar:', err);
    isMockMode = true;
    startMockFlow();
  }
}

// Simulated WhatsApp flow for development/offline modes
function startMockFlow() {
  connectionStatus = 'QR_READY';
  lastQrCode = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23f3f4f6"/><text x="50" y="45" font-size="6" font-family="sans-serif" font-weight="bold" fill="%234f46e5" text-anchor="middle">ESCANEE QR MOCK</text><text x="50" y="55" font-size="4" font-family="sans-serif" fill="%236b7280" text-anchor="middle">Modo Simulación Activo</text><rect x="20" y="20" width="10" height="10" fill="%23000"/><rect x="70" y="20" width="10" height="10" fill="%23000"/><rect x="20" y="70" width="10" height="10" fill="%23000"/></svg>';

  mockTimer = setTimeout(() => {
    if (connectionStatus === 'QR_READY') {
      console.log('[WhatsApp Mock] Vinculando sesión de prueba simulada...');
      connectionStatus = 'CONNECTED';
      lastQrCode = '';
      console.log('[WhatsApp Mock] Conectado en modo simulación.');
    }
  }, 15000);
}

// Helper to ensure WWebJS is injected and ready in pupPage
async function ensureWWebJSInjected(c) {
  if (!c || !c.pupPage) return;
  try {
    const isReady = await c.pupPage.evaluate(() => {
      return typeof window.WWebJS !== 'undefined' && typeof window.WWebJS.getChat === 'function';
    });
    if (!isReady) {
      console.log('[WhatsApp] Reinyectando funciones WWebJS en la página de Chrome...');
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const { LoadUtils } = require('whatsapp-web.js/src/util/Injected/Utils.js');
      await c.pupPage.evaluate(LoadUtils);
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (err) {
    console.warn('[WhatsApp] Advertencia al inyectar WWebJS:', err?.message || err);
  }
}

// Send Report Endpoint handler
export async function sendCierreReport(imageBase64, textSummary) {
  const config = await getWhatsAppConfig();
  if (!config.enabled) {
    throw new Error('El servicio de WhatsApp está deshabilitado en F10 Configuración.');
  }

  if (connectionStatus !== 'CONNECTED' || !client) {
    throw new Error('El cliente de WhatsApp no está conectado o listo en el sistema.');
  }

  let target = (config.groupId || '').trim();

  // Handle group link join or auto-detection if groupId is empty or a link
  if (!target || target.includes('chat.whatsapp.com')) {
    if (target.includes('chat.whatsapp.com')) {
      const urlParts = target.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      const inviteCode = lastPart.split('?')[0];
      try {
        console.log(`[WhatsApp] Intentando unirse al grupo usando código: ${inviteCode}`);
        const groupId = await client.acceptInvite(inviteCode);
        if (groupId) {
          target = groupId;
          config.groupId = target;
          await saveWhatsAppConfig(config);
        }
      } catch (errInvite) {
        console.warn('[WhatsApp] No se pudo unir por código de invitación (posiblemente ya es miembro):', errInvite.message || errInvite);
      }
    }

    if (!target || target.includes('chat.whatsapp.com')) {
      try {
        console.log('[WhatsApp] Auto-detectando grupo desde los chats activos del bot...');
        const chats = await client.getChats();
        const groups = chats.filter(c => c.isGroup);
        if (groups.length > 0) {
          const matched = groups.find(g => config.groupName && g.name.toLowerCase().includes(config.groupName.toLowerCase())) || groups[0];
          target = matched.id._serialized;
          config.groupId = target;
          await saveWhatsAppConfig(config);
          console.log(`[WhatsApp] Grupo auto-detectado asignado: ${target} (${matched.name})`);
        }
      } catch (getChatsErr) {
        console.warn('[WhatsApp] Error obteniendo lista de chats para auto-detección:', getChatsErr.message || getChatsErr);
      }
    }
  }

  if (!target || target.includes('chat.whatsapp.com')) {
    throw new Error('Sin grupo de WhatsApp configurado. Ingrese el ID del grupo en F10 Configuración.');
  }

  if (!target.includes('@')) {
    if (target.includes('-') || target.length > 15) {
      target = `${target}@g.us`;
    } else {
      let cleanNum = target.replace(/[^0-9]/g, '');
      if (cleanNum.startsWith('0')) {
        cleanNum = '58' + cleanNum.substring(1);
      } else if (cleanNum.length === 10 && (cleanNum.startsWith('412') || cleanNum.startsWith('414') || cleanNum.startsWith('424') || cleanNum.startsWith('416') || cleanNum.startsWith('426'))) {
        cleanNum = '58' + cleanNum;
      }
      target = `${cleanNum}@c.us`;
    }
  }

  console.log(`[WhatsApp] Intentando enviar reporte al objetivo: ${target}`);

  if (isMockMode) {
    console.log('[WhatsApp Mock] --- MENSAJE SIMULADO ENVIADO ---');
    console.log(`[WhatsApp Mock] Objetivo: ${target}`);
    console.log(`[WhatsApp Mock] Mensaje:\n${textSummary}`);
    if (imageBase64) console.log('[WhatsApp Mock] Imagen base64 adjuntada con éxito.');
    console.log('[WhatsApp Mock] ---------------------------------');
    return { success: true, simulated: true };
  }

  try {
    const { default: pkg } = await import('whatsapp-web.js');
    const { MessageMedia } = pkg;

    await ensureWWebJSInjected(client);

    try {
      if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.length > 50) {
        const base64Data = imageBase64.split(';base64,').pop().trim();
        const isPdf = imageBase64.startsWith('data:application/pdf');
        const mediaType = isPdf ? 'application/pdf' : 'image/png';
        const fileName = isPdf ? `reporte_${Date.now()}.pdf` : `reporte_${Date.now()}.png`;

        console.log(`[WhatsApp] Enviando documento adjunto (${mediaType}, ${base64Data.length} chars) a ${target}`);
        const media = new MessageMedia(mediaType, base64Data, fileName);
        
        try {
          await client.sendMessage(target, media, { caption: textSummary });
        } catch (captionErr) {
          console.warn('[WhatsApp] Falló envío con caption combinado, enviando media y texto secuencialmente:', captionErr.message || captionErr);
          await client.sendMessage(target, media);
          if (textSummary) {
            await client.sendMessage(target, textSummary);
          }
        }
      } else {
        await client.sendMessage(target, textSummary);
      }
    } catch (sendErr) {
      const sendErrMsg = String(sendErr?.message || sendErr);
      if (sendErrMsg.includes('getChat') || sendErrMsg.includes('WWebJS') || sendErrMsg.includes('undefined')) {
        console.warn('[WhatsApp] Reinyectando scripts tras fallo getChat y reintentando envío...');
        await ensureWWebJSInjected(client);
        await new Promise(r => setTimeout(r, 800));
        if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.length > 50) {
          const base64Data = imageBase64.split(';base64,').pop().trim();
          const isPdf = imageBase64.startsWith('data:application/pdf');
          const mediaType = isPdf ? 'application/pdf' : 'image/png';
          const fileName = isPdf ? `reporte_${Date.now()}.pdf` : `reporte_${Date.now()}.png`;
          const media = new MessageMedia(mediaType, base64Data, fileName);
          await client.sendMessage(target, media, { caption: textSummary });
        } else {
          await client.sendMessage(target, textSummary);
        }
      } else {
        throw sendErr;
      }
    }

    console.log('[WhatsApp] Mensaje y documento adjunto enviados con éxito a WhatsApp.');
    return { success: true };
  } catch (err) {
    console.error('[WhatsApp] Error al enviar mensaje:', err.message);
    const errText = String(err?.message || err);
    if (errText.includes('detached Frame') || errText.includes('Execution context was destroyed') || errText.includes('Session closed')) {
      console.warn('[WhatsApp] Detectado marco desprendido/sesión cerrada en Puppeteer. Intentando recarga y reenvío...');
      try {
        if (client && client.pupPage && typeof client.pupPage.reload === 'function') {
          await client.pupPage.reload({ waitUntil: 'domcontentloaded' });
          await new Promise(r => setTimeout(r, 2000));
          await ensureWWebJSInjected(client);
          if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.length > 50) {
            const { default: pkg } = await import('whatsapp-web.js');
            const { MessageMedia } = pkg;
            const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
            const media = new MessageMedia('image/png', base64Data, `reporte_${Date.now()}.png`);
            await client.sendMessage(target, media, { caption: textSummary });
          } else {
            await client.sendMessage(target, textSummary);
          }
          console.log('[WhatsApp] Mensaje reenviado exitosamente tras recarga de marco.');
          return { success: true };
        }
      } catch (retryErr) {
        console.error('[WhatsApp] Falló el reintento tras recarga:', retryErr.message);
      }
    }
    throw err;
  }
}

// Send Direct WhatsApp Message to a specific Phone Number or Group JID
export async function sendDirectWhatsAppMessage(phone, textMessage, imageBase64 = null) {
  const config = await getWhatsAppConfig();
  if (!config.enabled) {
    throw new Error('El servicio de bot WhatsApp está deshabilitado en F10 Configuración.');
  }

  if (!phone || typeof phone !== 'string' || phone.trim() === '') {
    throw new Error('Número de teléfono o ID de grupo no válido.');
  }

  let target = phone.trim();

  // Si ya viene con sufijo de WhatsApp (@g.us para grupos, @c.us o @s.whatsapp.net para contactos)
  if (target.endsWith('@g.us') || target.endsWith('@c.us') || target.endsWith('@s.whatsapp.net')) {
    // Conservar el JID original intacto
  } else {
    let cleanNum = target.replace(/[^0-9]/g, '');
    if (cleanNum.startsWith('0')) {
      cleanNum = '58' + cleanNum.substring(1);
    } else if (cleanNum.length === 10 && (cleanNum.startsWith('412') || cleanNum.startsWith('414') || cleanNum.startsWith('424') || cleanNum.startsWith('416') || cleanNum.startsWith('426'))) {
      cleanNum = '58' + cleanNum;
    } else if (!cleanNum.startsWith('58') && cleanNum.length === 10) {
      cleanNum = '58' + cleanNum;
    }
    target = `${cleanNum}@c.us`;
  }

  console.log(`[WhatsApp Direct] Intentando enviar mensaje a ${target}...`);

  if (isMockMode) {
    console.log('[WhatsApp Direct Mock] --- MENSAJE DIRECTO SIMULADO ---');
    console.log(`[WhatsApp Direct Mock] Destino: ${target}`);
    console.log(`[WhatsApp Direct Mock] Mensaje:\n${textMessage}`);
    console.log('[WhatsApp Direct Mock] -------------------------------');
    return { success: true, simulated: true, targetPhone: target };
  }

  if (connectionStatus !== 'CONNECTED' || !client) {
    throw new Error('El bot de WhatsApp del servidor no está conectado. Escanee el código QR en F10 Configuración.');
  }

  const { default: pkg } = await import('whatsapp-web.js');
  const { MessageMedia } = pkg;

  await ensureWWebJSInjected(client);

  try {
    if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.length > 50) {
      const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
      const media = new MessageMedia('image/png', base64Data, `recordatorio_${Date.now()}.png`);
      await client.sendMessage(target, media, { caption: textMessage });
    } else {
      await client.sendMessage(target, textMessage);
    }
    console.log(`[WhatsApp Direct] Mensaje enviado con éxito a ${target}`);
    return { success: true, targetPhone: target };
  } catch (sendErr) {
    console.error(`[WhatsApp Direct] Error al enviar a ${target}:`, sendErr.message);
    throw sendErr;
  }
}

export async function sendDocumentVencimientoWhatsAppReport(docs) {
  const config = await getWhatsAppConfig();
  if (!config || !config.enabled || !config.groupId) {
    return { ok: false, error: 'Bot de WhatsApp no configurado o deshabilitado en F10 Configuración.' };
  }

  const hoyStr = new Date().toISOString().substring(0, 10);
  const en30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

  const vencidos = docs.filter(d => !d.es_historico && d.fecha_vencimiento && d.fecha_vencimiento < hoyStr);
  const porVencer = docs.filter(d => !d.es_historico && d.fecha_vencimiento && d.fecha_vencimiento >= hoyStr && d.fecha_vencimiento <= en30dias);

  if (vencidos.length === 0 && porVencer.length === 0) {
    return { ok: true, message: 'No hay documentos vencidos ni por vencer.' };
  }

  let msg = `⚠️ *ALERTA DE CUMPLIMIENTO LEGAL & FISCAL - WINTERPOS*\n`;
  msg += `📅 *Fecha:* ${new Date().toLocaleDateString('es-VE')}\n\n`;

  if (vencidos.length > 0) {
    msg += `❌ *DOCUMENTOS VENCIDOS (${vencidos.length}):*\n`;
    vencidos.forEach(d => {
      msg += `• *${d.titulo}* (${d.categoria}): Venció el ${d.fecha_vencimiento}\n`;
    });
    msg += `\n`;
  }

  if (porVencer.length > 0) {
    msg += `⏳ *DOCUMENTOS POR VENCER (${porVencer.length}):*\n`;
    porVencer.forEach(d => {
      msg += `• *${d.titulo}* (${d.categoria}): Vence el ${d.fecha_vencimiento}\n`;
    });
    msg += `\n`;
  }

  msg += `💡 _Favor iniciar los trámites de renovación para evitar sanciones de ley._`;

  return await sendDirectWhatsAppMessage(config.groupId, msg);
}

