import { readJsonFile, writeJsonFile } from './db-store.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

// Configuration file path
const CONFIG_FILE = 'whatsapp_config.json';

// Helper to clean orphaned Chrome processes that lock the WhatsApp profile
function killOrphanedChrome() {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync('wmic process where "name=\'chrome.exe\'" get processid,commandline /format:csv', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString();
    const lines = out.split('\r\n').filter(l => l.includes('session-winterpos-session') || l.includes('wwebjs_auth'));
    for (const line of lines) {
      const parts = line.trim().split(',');
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(Number(pid))) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: 2000 });
          console.log(`[WhatsApp] Proceso huérfano de Chrome terminado PID: ${pid}`);
        } catch (e) {}
      }
    }
  } catch (err) {}
}

// Helper to clean lock files in session folder
function cleanSessionLocks() {
  try {
    const sessionDir = path.resolve(process.cwd(), '.wwebjs_auth', 'session-winterpos-session');
    if (fs.existsSync(sessionDir)) {
      const lockFiles = ['DevToolsActivePort', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];
      for (const file of lockFiles) {
        const filePath = path.join(sessionDir, file);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`[WhatsApp] Archivo de bloqueo limpiado: ${file}`);
          } catch (e) {}
        }
      }
    }
  } catch (err) {}
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
{desgloseAccionistas}`
};

// Global WhatsApp client state
let client = null;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'QR_READY' | 'AUTHENTICATING' | 'CONNECTED'
let lastQrCode = ''; // Base64 image string or raw text
let isMockMode = false;
let mockTimer = null;
let lastInitError = null;
let detectedChromePath = null;

// Load config
export function getWhatsAppConfig() {
  return readJsonFile(CONFIG_FILE, defaultConfig);
}

export function saveWhatsAppConfig(config) {
  const current = getWhatsAppConfig();
  const updated = { ...current, ...config };
  writeJsonFile(CONFIG_FILE, updated);
  
  // Re-evaluate client status if toggle changed
  if (updated.enabled) {
    initWhatsAppClient();
  } else {
    destroyWhatsAppClient();
  }
  return updated;
}

export function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    qr: connectionStatus === 'QR_READY' ? lastQrCode : '',
    isMock: isMockMode,
    detectedChromePath: detectedChromePath || findChromeExecutable(),
    lastError: lastInitError,
    config: getWhatsAppConfig()
  };
}

// Destroy client session
async function destroyWhatsAppClient() {
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
  if (mockTimer) {
    clearTimeout(mockTimer);
    mockTimer = null;
  }
  connectionStatus = 'DISCONNECTED';
  lastQrCode = '';
}

function findChromeExecutable() {
  const config = getWhatsAppConfig();
  if (config.chromePath && fs.existsSync(config.chromePath)) {
    console.log('[WhatsApp] Usando ejecutable de Chrome configurado manualmente:', config.chromePath);
    return config.chromePath;
  }

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
        console.log('[WhatsApp] Encontrado Google Chrome nativo en:', p);
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
            console.log('[WhatsApp] Encontrado Chromium de Puppeteer en caché:', foundChrome);
            return foundChrome;
          }
        } catch (errCache) {
          // ignore cache read errors
        }
      }
    }

    // Fallback Priority: Brave / Microsoft Edge / Chromium
    const fallbackPaths = [
      path.join(progFiles, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(progFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(progFiles, 'Microsoft\\Edge\\Application\\msedge.exe')
    ];

    for (const p of fallbackPaths) {
      if (fs.existsSync(p)) {
        console.log('[WhatsApp] Encontrado navegador alternativo en:', p);
        return p;
      }
    }
  }
  return null;
}

// Initialize WhatsApp client
export async function initWhatsAppClient() {
  const config = getWhatsAppConfig();
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

  console.log('[WhatsApp] Inicializando servicio de WhatsApp...');
  connectionStatus = 'AUTHENTICATING';

  try {
    // Try to dynamically load libraries to support headless environment
    const { default: pkg } = await import('whatsapp-web.js');
    const { Client, LocalAuth, MessageMedia } = pkg;
    const qrcode = await import('qrcode');

    console.log('[WhatsApp] Librería whatsapp-web.js cargada. Iniciando cliente...');

    const chromePath = findChromeExecutable();
    const puppeteerConfig = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    };
    if (chromePath) {
      puppeteerConfig.executablePath = chromePath;
    }

    client = new Client({
      authStrategy: new LocalAuth({ clientId: "winterpos-session" }),
      webVersionCache: {
        type: 'none'
      },
      puppeteer: puppeteerConfig
    });

    client.on('qr', async (qr) => {
      console.log('[WhatsApp] Código QR generado. Listo para escanear en F10 Config.');
      connectionStatus = 'QR_READY';
      try {
        // Convert raw QR string to base64 image QR
        lastQrCode = await qrcode.toDataURL(qr);
      } catch (err) {
        lastQrCode = qr; // fallback to string
      }
    });

    client.on('ready', () => {
      console.log('[WhatsApp] ¡Cliente Conectado y Listo!');
      connectionStatus = 'CONNECTED';
      lastQrCode = '';
    });

    client.on('authenticated', () => {
      console.log('[WhatsApp] Sesión autenticada.');
      connectionStatus = 'AUTHENTICATING';
    });

    client.on('auth_failure', () => {
      console.error('[WhatsApp] Falla en la autenticación.');
      connectionStatus = 'DISCONNECTED';
      lastQrCode = '';
    });

    client.on('disconnected', (reason) => {
      console.log('[WhatsApp] Cliente desconectado:', reason);
      connectionStatus = 'DISCONNECTED';
      lastQrCode = '';
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
  // Generamos un QR mock de texto
  lastQrCode = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23f3f4f6"/><text x="50" y="45" font-size="6" font-family="sans-serif" font-weight="bold" fill="%234f46e5" text-anchor="middle">ESCANEE QR MOCK</text><text x="50" y="55" font-size="4" font-family="sans-serif" fill="%236b7280" text-anchor="middle">Modo Simulación Activo</text><rect x="20" y="20" width="10" height="10" fill="%23000"/><rect x="70" y="20" width="10" height="10" fill="%23000"/><rect x="20" y="70" width="10" height="10" fill="%23000"/></svg>';

  // Simular escaneo automático tras 15 segundos para testing rápido
  mockTimer = setTimeout(() => {
    if (connectionStatus === 'QR_READY') {
      console.log('[WhatsApp Mock] Vinculando sesión de prueba simulada...');
      connectionStatus = 'CONNECTED';
      lastQrCode = '';
      console.log('[WhatsApp Mock] Conectado en modo simulación.');
    }
  }, 15000);
}

// Send Report Endpoint handler
export async function sendCierreReport(imageBase64, textSummary) {
  const config = getWhatsAppConfig();
  if (!config.enabled || !config.groupId) {
    throw new Error('Servicio de WhatsApp deshabilitado o sin grupo de destino configurado.');
  }

  console.log(`[WhatsApp] Intentando enviar reporte al grupo: ${config.groupId}`);

  if (isMockMode) {
    // Simulate sending log
    console.log('[WhatsApp Mock] --- MENSAJE SIMULADO ENVIADO ---');
    console.log(`[WhatsApp Mock] Grupo ID: ${config.groupId}`);
    console.log(`[WhatsApp Mock] Mensaje:\n${textSummary}`);
    if (imageBase64) console.log('[WhatsApp Mock] Imagen base64 adjuntada con éxito.');
    console.log('[WhatsApp Mock] ---------------------------------');
    return { success: true, simulated: true };
  }

  if (connectionStatus !== 'CONNECTED' || !client) {
    throw new Error('El cliente de WhatsApp no está conectado o listo.');
  }

  try {
    const { default: pkg } = await import('whatsapp-web.js');
    const { MessageMedia } = pkg;

    // Clean group ID format if it is a link
    let target = config.groupId.trim();
    if (target.includes('chat.whatsapp.com')) {
      const urlParts = target.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      const inviteCode = lastPart.split('?')[0];
      try {
        console.log(`[WhatsApp] Intentando unir al grupo usando código: ${inviteCode}`);
        const groupId = await client.acceptInvite(inviteCode);
        target = groupId;
        config.groupId = target;
        saveWhatsAppConfig(config);
      } catch (errInvite) {
        console.warn('[WhatsApp] No se pudo unir automáticamente al grupo:', errInvite.message || errInvite);
      }
    }

    if (!target.endsWith('@g.us') && !target.endsWith('@c.us')) {
      target = `${target}@g.us`;
    }

    if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.length > 50) {
      const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
      const media = new MessageMedia('image/png', base64Data, `reporte_${Date.now()}.png`);
      await client.sendMessage(target, media, { caption: textSummary });
    } else {
      await client.sendMessage(target, textSummary);
    }
    console.log('[WhatsApp] Mensaje enviado con éxito a WhatsApp.');
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
