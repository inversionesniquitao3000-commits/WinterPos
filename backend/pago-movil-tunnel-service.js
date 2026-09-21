// WinterPos - Servicio de Túnel en Segundo Plano para Pago Móvil BDV
// Permite exponer el Webhook a Internet de forma 100% silenciosa y automática sin abrir ventanas CMD ni requerir acción del cajero.

import { spawn, exec } from 'child_process';
import { getPagoMovilConfigDb, savePagoMovilConfigDb } from './db-store.js';

let tunnelProcess = null;
let isIntentionalStop = false;
let restartTimeout = null;

const tunnelState = {
  provider: 'cloudflare', // 'cloudflare' | 'ngrok'
  status: 'stopped', // 'stopped' | 'starting' | 'running' | 'error'
  publicUrl: '',
  webhookUrl: '',
  startedAt: null,
  error: null,
  autoStart: false,
  token: '',
  customDomain: '',
  ngrokAuthtoken: '',
  ngrokDomain: '',
  logs: []
};

function addLog(msg) {
  const line = `[${new Date().toLocaleTimeString('es-VE')}] ${msg.trim()}`;
  tunnelState.logs.push(line);
  if (tunnelState.logs.length > 50) tunnelState.logs.shift();
}

/**
 * Inicia el túnel (Cloudflare o Ngrok) en segundo plano sin ventana visible
 */
export async function startPagoMovilTunnel() {
  if (tunnelProcess && tunnelState.status === 'running') {
    return { success: true, alreadyRunning: true, ...tunnelState };
  }

  isIntentionalStop = false;
  if (restartTimeout) clearTimeout(restartTimeout);

  const config = await getPagoMovilConfigDb();
  const provider = config.tunnelProvider || 'cloudflare';
  tunnelState.provider = provider;
  tunnelState.status = 'starting';
  tunnelState.error = null;
  tunnelState.autoStart = config.autoStartTunnel || false;
  const effectiveToken = (config.tunnelToken || config.cloudflareTunnelToken || config.token || '').trim();
  tunnelState.token = effectiveToken;
  tunnelState.customDomain = config.customDomain || '';
  tunnelState.ngrokAuthtoken = config.ngrokAuthtoken || '';
  tunnelState.ngrokDomain = config.ngrokDomain || '';

  addLog(`Iniciando servicio de túnel silencioso en segundo plano (${provider.toUpperCase()})...`);

  try {
    let args = [];
    if (provider === 'localtunnel') {
      const sub = (config.localtunnelSubdomain || 'winterpos-niquitao-caja').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
      args = ['-y', 'localtunnel', '--port', '5000', '--subdomain', sub];
      addLog(`Modo: Localtunnel Permanente (Subdominio: ${sub})`);
    } else if (provider === 'ngrok') {
      const ngrokToken = (config.ngrokAuthtoken || '').trim();
      const ngrokDom = (config.ngrokDomain || '').trim();
      args = ['-y', 'ngrok', 'http', '5000', '--log', 'stdout', '--log-format', 'term'];
      if (ngrokToken) {
        args.push('--authtoken', ngrokToken);
      }
      if (ngrokDom) {
        const cleanDom = ngrokDom.startsWith('http') ? ngrokDom : `https://${ngrokDom}`;
        args.push('--url', cleanDom);
      }
      addLog(`Modo: Ngrok Túnel Permanente (Dominio: ${ngrokDom || 'Automático'})`);
    } else {
      // Cloudflare
      if (effectiveToken) {
        // Túnel Permanente con Token de Cloudflare Zero Trust
        args = ['-y', 'cloudflared', 'tunnel', 'run', '--token', effectiveToken];
        addLog('Modo: Cloudflare Permanente con Token');
      } else {
        // Túnel Rápido gratuito (--url http://localhost:5000)
        args = ['-y', 'cloudflared', 'tunnel', '--url', 'http://localhost:5000'];
        addLog('Modo: Cloudflare Automático Rápido (Cloudflare Quick Tunnel)');
      }
    }

    tunnelProcess = spawn('npx', args, {
      shell: true,
      windowsHide: true, // Oculta 100% cualquier ventana de consola en Windows
      stdio: ['ignore', 'pipe', 'pipe']
    });

    tunnelState.startedAt = new Date().toISOString();

    const handleData = (chunk) => {
      const text = chunk.toString();
      addLog(text);

      if (provider === 'localtunnel') {
        const match = text.match(/https:\/\/[a-zA-Z0-9.-]+\.loca\.lt/);
        if (match && !tunnelState.publicUrl) {
          tunnelState.publicUrl = match[0];
          tunnelState.webhookUrl = `${match[0]}/api/conciliacion/sms-webhook`;
          tunnelState.status = 'running';
          tunnelState.error = null;
          console.log(`[PagoMovil Tunnel] 🟢 Túnel Localtunnel activo en segundo plano: ${tunnelState.webhookUrl}`);
          savePagoMovilConfigDb({ activeWebhookUrl: tunnelState.webhookUrl }).catch(() => {});
        }
      } else if (provider === 'ngrok') {
        const match = text.match(/https:\/\/[a-zA-Z0-9.-]+\.ngrok[a-zA-Z0-9.-]*/);
        if (match && !tunnelState.publicUrl) {
          tunnelState.publicUrl = match[0];
          tunnelState.webhookUrl = `${match[0]}/api/conciliacion/sms-webhook`;
          tunnelState.status = 'running';
          tunnelState.error = null;
          console.log(`[PagoMovil Tunnel] 🟢 Túnel Ngrok activo en segundo plano: ${tunnelState.webhookUrl}`);
          savePagoMovilConfigDb({ activeWebhookUrl: tunnelState.webhookUrl }).catch(() => {});
        } else if (text.includes('client session established') || text.includes('started tunnel')) {
          tunnelState.status = 'running';
          tunnelState.error = null;
          if (config.ngrokDomain && !tunnelState.publicUrl) {
            const cleanDom = config.ngrokDomain.startsWith('http') ? config.ngrokDomain : `https://${config.ngrokDomain}`;
            tunnelState.publicUrl = cleanDom;
            tunnelState.webhookUrl = `${cleanDom}/api/conciliacion/sms-webhook`;
          }
        }
        if (text.includes('ERR_NGROK')) {
          const errMatch = text.match(/ERR_NGROK_[0-9]+/);
          const errCode = errMatch ? errMatch[0] : 'Error de autenticación Ngrok';
          tunnelState.error = errCode;
          addLog(`Alerta Ngrok: ${errCode}`);
        }
      } else {
        // Cloudflare: Detectar URL generada por Cloudflare Quick Tunnel (https://xxxx.trycloudflare.com)
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !tunnelState.publicUrl) {
          tunnelState.publicUrl = match[0];
          tunnelState.webhookUrl = `${match[0]}/api/conciliacion/sms-webhook`;
          tunnelState.status = 'running';
          tunnelState.error = null;
          console.log(`[PagoMovil Tunnel] 🟢 Túnel Cloudflare activo en segundo plano: ${tunnelState.webhookUrl}`);
          savePagoMovilConfigDb({ activeWebhookUrl: tunnelState.webhookUrl }).catch(() => {});
        }

        // Si es un túnel con Token permanente y ya se conectó
        if (effectiveToken && (text.includes('Registered tunnel connection') || text.includes('INF Starting tunnel'))) {
          const domain = (config.customDomain || '').trim();
          const fullDomain = domain ? (domain.startsWith('http') ? domain : `https://${domain}`) : '';
          tunnelState.publicUrl = fullDomain || 'Túnel Conectado (Cloudflare Zero Trust)';
          tunnelState.webhookUrl = fullDomain ? `${fullDomain}/api/conciliacion/sms-webhook` : '';
          tunnelState.status = 'running';
          tunnelState.error = null;
          console.log(`[PagoMovil Tunnel] 🟢 Túnel con Token registrado en Cloudflare: ${tunnelState.publicUrl}`);
        }
      }
    };

    tunnelProcess.stdout.on('data', handleData);
    tunnelProcess.stderr.on('data', handleData);

    tunnelProcess.on('error', (err) => {
      console.error('[PagoMovil Tunnel] Error al iniciar proceso:', err.message);
      tunnelState.status = 'error';
      tunnelState.error = err.message;
      addLog(`Error de proceso: ${err.message}`);
    });

    tunnelProcess.on('close', (code) => {
      addLog(`Proceso finalizado con código: ${code}`);
      tunnelProcess = null;
      tunnelState.status = 'stopped';
      tunnelState.publicUrl = '';
      tunnelState.webhookUrl = '';

      // Si no fue detenido intencionalmente y el auto-arranque está habilitado, reintentar
      if (!isIntentionalStop && tunnelState.autoStart) {
        addLog('Reintentando conexión automática en 6 segundos...');
        restartTimeout = setTimeout(() => {
          if (!isIntentionalStop) startPagoMovilTunnel();
        }, 6000);
      }
    });

    return { success: true, status: 'starting' };
  } catch (err) {
    tunnelState.status = 'error';
    tunnelState.error = err.message;
    addLog(`Falla al ejecutar: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Detiene el túnel en segundo plano
 */
export async function stopPagoMovilTunnel() {
  isIntentionalStop = true;
  if (restartTimeout) clearTimeout(restartTimeout);

  if (!tunnelProcess) {
    tunnelState.status = 'stopped';
    tunnelState.publicUrl = '';
    tunnelState.webhookUrl = '';
    return { success: true, message: 'Túnel ya estaba detenido' };
  }

  addLog('Deteniendo proceso de túnel en segundo plano...');
  try {
    const pid = tunnelProcess.pid;
    // En Windows matar árbol de procesos para cerrar subprocesos de npx y cloudflared
    if (process.platform === 'win32' && pid) {
      exec(`taskkill /pid ${pid} /f /t`, () => {});
    } else {
      tunnelProcess.kill('SIGTERM');
    }
  } catch (err) {
    console.warn('[PagoMovil Tunnel] Aviso al matar proceso:', err.message);
  }

  tunnelProcess = null;
  tunnelState.status = 'stopped';
  tunnelState.publicUrl = '';
  tunnelState.webhookUrl = '';
  addLog('Túnel detenido exitosamente.');
  return { success: true, message: 'Túnel detenido' };
}

/**
 * Obtiene el estado en tiempo real del túnel
 */
export async function getPagoMovilTunnelStatus() {
  const config = await getPagoMovilConfigDb();
  const provider = config.tunnelProvider || 'cloudflare';
  const effectiveToken = (config.tunnelToken || config.cloudflareTunnelToken || config.token || '').trim();
  const domain = (config.customDomain || '').trim();
  const fullDomain = domain ? (domain.startsWith('http') ? domain : `https://${domain}`) : '';

  // Si el proceso de túnel está activo en memoria y ya registró conexión
  if (tunnelProcess) {
    if (provider === 'ngrok') {
      if (tunnelState.logs && tunnelState.logs.some(l => l.includes('client session established') || l.includes('started tunnel') || l.includes('.ngrok'))) {
        tunnelState.status = 'running';
        if (!tunnelState.webhookUrl && config.ngrokDomain) {
          const cleanDom = config.ngrokDomain.startsWith('http') ? config.ngrokDomain : `https://${config.ngrokDomain}`;
          tunnelState.publicUrl = cleanDom;
          tunnelState.webhookUrl = `${cleanDom}/api/conciliacion/sms-webhook`;
        }
      }
    } else {
      if (tunnelState.logs && tunnelState.logs.some(l => l.includes('Registered tunnel connection') || l.includes('Starting tunnel'))) {
        if (tunnelState.status === 'starting' || tunnelState.status === 'stopped') {
          tunnelState.status = 'running';
          if (!tunnelState.publicUrl) {
            tunnelState.publicUrl = fullDomain || (effectiveToken ? 'Túnel Conectado (Cloudflare Zero Trust)' : '');
            tunnelState.webhookUrl = fullDomain ? `${fullDomain}/api/conciliacion/sms-webhook` : '';
          }
        }
      }
    }
  }

  tunnelState.token = effectiveToken;
  tunnelState.provider = provider;
  tunnelState.customDomain = (config.customDomain || '').trim();
  tunnelState.ngrokAuthtoken = (config.ngrokAuthtoken || '').trim();
  tunnelState.ngrokDomain = (config.ngrokDomain || '').trim();
  tunnelState.localtunnelSubdomain = (config.localtunnelSubdomain || 'winterpos-niquitao-caja').trim();

  return {
    ...tunnelState,
    tunnelProvider: provider,
    autoStart: config.autoStartTunnel || false,
    localtunnelSubdomain: config.localtunnelSubdomain || 'winterpos-niquitao-caja',
    token: effectiveToken,
    tunnelToken: effectiveToken,
    cloudflareTunnelToken: effectiveToken,
    customDomain: config.customDomain || '',
    ngrokAuthtoken: config.ngrokAuthtoken || '',
    ngrokDomain: config.ngrokDomain || '',
    hasActiveProcess: !!tunnelProcess
  };
}

export function syncPagoMovilTunnelConfigInMemory(newConfig) {
  if (newConfig.tunnelToken !== undefined) tunnelState.token = newConfig.tunnelToken;
  if (newConfig.token !== undefined) tunnelState.token = newConfig.token;
  if (newConfig.tunnelProvider !== undefined) tunnelState.provider = newConfig.tunnelProvider;
  if (newConfig.localtunnelSubdomain !== undefined) tunnelState.localtunnelSubdomain = newConfig.localtunnelSubdomain;
  if (newConfig.customDomain !== undefined) tunnelState.customDomain = newConfig.customDomain;
  if (newConfig.ngrokAuthtoken !== undefined) tunnelState.ngrokAuthtoken = newConfig.ngrokAuthtoken;
  if (newConfig.ngrokDomain !== undefined) tunnelState.ngrokDomain = newConfig.ngrokDomain;
}

/**
 * Se ejecuta al arrancar el servidor backend. Si el administrador dejó la opción activada,
 * arranca el túnel automáticamente sin intervención de nadie.
 */
export async function autoStartPagoMovilTunnelIfEnabled() {
  try {
    const config = await getPagoMovilConfigDb();
    if (config.autoStartTunnel) {
      console.log('🚀 [PagoMovil Tunnel] Auto-inicio configurado por el administrador. Levantando túnel en segundo plano...');
      await startPagoMovilTunnel();
    }
  } catch (err) {
    console.warn('[PagoMovil Tunnel] Error al auto-iniciar túnel:', err.message);
  }
}
