import { readJsonFile, writeJsonFile } from './db-store.js';
import path from 'path';
import fs from 'fs';

// Configuration file path
const CONFIG_FILE = 'whatsapp_config.json';

// Default configuration
const defaultConfig = {
  enabled: false,
  groupId: '',
  groupName: 'Grupo de Cierres POS'
};

// Global WhatsApp client state
let client = null;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'QR_READY' | 'AUTHENTICATING' | 'CONNECTED'
let lastQrCode = ''; // Base64 image string or raw text
let isMockMode = false;
let mockTimer = null;

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

// Initialize WhatsApp client
export async function initWhatsAppClient() {
  const config = getWhatsAppConfig();
  if (!config.enabled) {
    await destroyWhatsAppClient();
    return;
  }

  if (client) return; // Already running

  console.log('[WhatsApp] Inicializando servicio de WhatsApp...');
  connectionStatus = 'AUTHENTICATING';

  try {
    // Try to dynamically load libraries to support headless environment
    const { default: pkg } = await import('whatsapp-web.js');
    const { Client, LocalAuth, MessageMedia } = pkg;
    const qrcode = await import('qrcode');

    console.log('[WhatsApp] Librería whatsapp-web.js cargada. Iniciando cliente...');

    client = new Client({
      authStrategy: new LocalAuth({ clientId: "winterpos-session" }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      }
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

    await client.initialize();
    isMockMode = false;

  } catch (err) {
    console.warn('[WhatsApp] whatsapp-web.js no está instalado o falló la carga. Iniciando en Modo Simulación.');
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

  console.log(`[WhatsApp] Intentando enviar reporte de cierre al grupo: ${config.groupId}`);

  if (isMockMode) {
    // Simulate sending log
    console.log('[WhatsApp Mock] --- MENSAJE SIMULADO ENVIADO ---');
    console.log(`[WhatsApp Mock] Grupo ID: ${config.groupId}`);
    console.log(`[WhatsApp Mock] Caption:\n${textSummary}`);
    console.log('[WhatsApp Mock] Imagen base64 recibida con éxito.');
    console.log('[WhatsApp Mock] ---------------------------------');
    return { success: true, simulated: true };
  }

  if (connectionStatus !== 'CONNECTED' || !client) {
    throw new Error('El cliente de WhatsApp no está conectado o listo.');
  }

  try {
    const { default: pkg } = await import('whatsapp-web.js');
    const { MessageMedia } = pkg;

    // Convert base64 data to MessageMedia format
    const base64Data = imageBase64.replace(/^data:image\/png;base64,/, "");
    const media = new MessageMedia('image/png', base64Data, `cierre_${Date.now()}.png`);

    // Clean group ID format if it is a link
    let target = config.groupId.trim();
    if (target.includes('chat.whatsapp.com')) {
      // It's a group invite link, we can attempt to join first or extract code
      const inviteCode = target.split('/').pop();
      try {
        console.log(`[WhatsApp] Intentando unir al grupo usando código: ${inviteCode}`);
        const groupChat = await client.acceptInvite(inviteCode);
        target = groupChat.id._serialized;
        // Save resolved group ID back
        config.groupId = target;
        saveWhatsAppConfig(config);
      } catch (errInvite) {
        console.warn('[WhatsApp] No se pudo unir automáticamente al grupo:', errInvite.message);
      }
    }

    if (!target.endsWith('@g.us') && !target.endsWith('@c.us')) {
      target = `${target}@g.us`; // default to group
    }

    await client.sendMessage(target, media, { caption: textSummary });
    console.log('[WhatsApp] Mensaje multimedia enviado con éxito.');
    return { success: true };
  } catch (err) {
    console.error('[WhatsApp] Error al enviar mensaje:', err.message);
    throw err;
  }
}
