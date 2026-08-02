import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicKeyPath = path.join(__dirname, 'keys', 'public_key.pem');
const licensePathPrimary = path.join(__dirname, 'license.lic');
const licensePathRoot = path.join(__dirname, '..', 'license.lic');
const trialMetaPath = path.join(__dirname, '.trial_meta.json');

// -------------------------------------------------------------
// 1. HARDWARE FINGERPRINT GENERATOR (HWID)
// -------------------------------------------------------------
export function generateMachineHWID() {
  try {
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'GENERIC_CPU';
    const cpuCount = cpus.length;
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    
    // Get primary non-internal MAC address
    const nets = os.networkInterfaces();
    let macAddress = '00:00:00:00:00:00';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
          macAddress = net.mac;
          break;
        }
      }
      if (macAddress !== '00:00:00:00:00:00') break;
    }

    const rawString = `WINTERPOS_HWID_V1:${cpuModel}:${cpuCount}:${hostname}:${platform}:${arch}:${macAddress}`;
    const hash = crypto.createHash('sha256').update(rawString).digest('hex').toUpperCase();

    // Format hash into clean 16-char key: WPOS-XXXX-YYYY-ZZZZ
    const part1 = hash.substring(0, 4);
    const part2 = hash.substring(4, 8);
    const part3 = hash.substring(8, 12);

    return `WPOS-${part1}-${part2}-${part3}`;
  } catch (err) {
    console.error('Error generando HWID:', err);
    return 'WPOS-UNKNOWN-HWID';
  }
}

// Active terminals tracking set
const activeTerminalsMap = new Map(); // terminalName -> lastSeenTimestamp

export function registerTerminalActivity(terminalName) {
  if (!terminalName) return;
  activeTerminalsMap.set(terminalName, Date.now());
  
  // Cleanup stale terminals (inactive > 10 mins)
  const now = Date.now();
  for (const [term, lastSeen] of activeTerminalsMap.entries()) {
    if (now - lastSeen > 10 * 60 * 1000) {
      activeTerminalsMap.delete(term);
    }
  }
}

export function getActiveTerminalsCount() {
  return Math.max(1, activeTerminalsMap.size);
}

// -------------------------------------------------------------
// 2. 3-DAY SECURE AUTO-TRIAL MANAGER (PERÍODO DE PRUEBA HARWARE)
// -------------------------------------------------------------
function getOrCreateTrialInfo(hwid, db = null) {
  let trialStore = {};
  try {
    if (fs.existsSync(trialMetaPath)) {
      trialStore = JSON.parse(fs.readFileSync(trialMetaPath, 'utf8'));
    }
  } catch (e) {}

  const key = `trial_start_${hwid}`;
  let trialStartTimestamp = trialStore[key];

  // Also check DB if available
  if (!trialStartTimestamp && db && typeof db.prepare === 'function') {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS system_meta (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `).run();
      const row = db.prepare(`SELECT value FROM system_meta WHERE key = ?`).get(key);
      if (row && row.value) {
        trialStartTimestamp = parseInt(row.value, 10);
      }
    } catch (e) {}
  }

  const now = Date.now();
  if (!trialStartTimestamp || isNaN(trialStartTimestamp)) {
    trialStartTimestamp = now;
    trialStore[key] = trialStartTimestamp;
    try {
      fs.writeFileSync(trialMetaPath, JSON.stringify(trialStore, null, 2), 'utf8');
    } catch (e) {}

    if (db && typeof db.prepare === 'function') {
      try {
        db.prepare(`INSERT INTO system_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, trialStartTimestamp.toString());
      } catch (e) {}
    }
  }

  const trialDurationMs = 3 * 24 * 60 * 60 * 1000; // 3 Days (72 Hours)
  const trialEndTimestamp = trialStartTimestamp + trialDurationMs;
  const msRemaining = trialEndTimestamp - now;

  // Time tampering check during trial: if current time is significantly before trialStartTimestamp
  if (now < trialStartTimestamp - (5 * 60 * 1000)) {
    return {
      status: 'TIME_TAMPER',
      isValid: false,
      isTrial: true,
      hwid,
      message: 'Desincronización de fecha detectada. La fecha de Windows es anterior a la fecha de la primera instalación.'
    };
  }

  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60)));

  const firstInstallStr = new Date(trialStartTimestamp).toISOString().substring(0, 10);
  const trialExpireStr = new Date(trialEndTimestamp).toISOString().substring(0, 10);

  if (msRemaining > 0) {
    return {
      status: 'TRIAL_ACTIVE',
      isValid: true,
      isTrial: true,
      hwid,
      daysRemaining: Math.max(1, daysRemaining),
      hoursRemaining,
      trialEndTimestamp,
      payload: {
        cliente: 'DEMO PRUEBA GRATUITA (3 DÍAS)',
        rif: 'V-00000000',
        hwid,
        terminales: 3,
        fechaEmision: firstInstallStr,
        fechaExpiracion: trialExpireStr,
        tipo: 'PRUEBA 3 DÍAS'
      },
      activeTerminals: getActiveTerminalsCount(),
      maxTerminals: 3,
      message: `Modo Prueba Gratuita Activo (${hoursRemaining}h restantes / ${daysRemaining}d)`
    };
  }

  return {
    status: 'TRIAL_EXPIRED',
    isValid: false,
    isTrial: true,
    hwid,
    daysRemaining: 0,
    hoursRemaining: 0,
    payload: {
      cliente: 'DEMO PRUEBA EXPIRADA',
      rif: 'V-00000000',
      hwid,
      terminales: 3,
      fechaEmision: firstInstallStr,
      fechaExpiracion: trialExpireStr,
      tipo: 'PRUEBA 3 DÍAS'
    },
    message: 'Su período de prueba gratuita de 3 días ha expirado. Por favor active su licencia oficial para continuar.'
  };
}

// -------------------------------------------------------------
// 3. LICENSE VERIFIER & STATUS CHECKER
// -------------------------------------------------------------
export function verifyLicense(db = null) {
  const currentHWID = generateMachineHWID();

  // Find license file
  let licenseFile = null;
  let licenseFilePath = null;

  if (fs.existsSync(licensePathPrimary)) {
    licenseFilePath = licensePathPrimary;
    licenseFile = fs.readFileSync(licensePathPrimary, 'utf8');
  } else if (fs.existsSync(licensePathRoot)) {
    licenseFilePath = licensePathRoot;
    licenseFile = fs.readFileSync(licensePathRoot, 'utf8');
  }

  if (!licenseFile) {
    // No license file => Enter 3-Day Secure Auto-Trial Mode
    return getOrCreateTrialInfo(currentHWID, db);
  }

  // Parse JSON structure
  let licenseObj;
  try {
    licenseObj = JSON.parse(licenseFile);
  } catch (e) {
    return getOrCreateTrialInfo(currentHWID, db);
  }

  const { payload, signature } = licenseObj || {};
  if (!payload || !signature) {
    return getOrCreateTrialInfo(currentHWID, db);
  }

  // Verify RSA Digital Signature
  if (!fs.existsSync(publicKeyPath)) {
    return {
      status: 'NO_PUBLIC_KEY',
      isValid: false,
      hwid: currentHWID,
      payload: null,
      message: 'Error crítico: La clave pública de validación RSA no existe en el servidor.'
    };
  }

  try {
    const publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8');
    const verifier = crypto.createVerify('SHA256');
    verifier.update(JSON.stringify(payload));
    verifier.end();

    const isSignatureValid = verifier.verify(publicKeyPem, signature, 'hex');
    if (!isSignatureValid) {
      return getOrCreateTrialInfo(currentHWID, db);
    }
  } catch (err) {
    console.error('Error verificando firma RSA:', err);
    return getOrCreateTrialInfo(currentHWID, db);
  }

  // Check HWID Binding (Allows wildcard '*' or exact match)
  const licenseHWID = (payload.hwid || '').toUpperCase().trim();
  if (licenseHWID !== '*' && licenseHWID !== currentHWID) {
    return {
      status: 'HWID_MISMATCH',
      isValid: false,
      hwid: currentHWID,
      payload,
      message: `Esta licencia pertenece a otro equipo (HWID Registrado: ${licenseHWID}, HWID Actual: ${currentHWID}).`
    };
  }

  // Check Expiration Date
  const nowStr = new Date().toISOString().substring(0, 10);
  const expStr = payload.fechaExpiracion;

  let daysRemaining = null;
  if (expStr && expStr !== 'VITALICIA') {
    const nowTime = new Date(nowStr).getTime();
    const expTime = new Date(expStr).getTime();
    daysRemaining = Math.ceil((expTime - nowTime) / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      return {
        status: 'EXPIRED',
        isValid: false,
        hwid: currentHWID,
        payload,
        daysRemaining,
        message: `Su período de licencia ha vencido el ${expStr}. Por favor contacte a soporte para renovar.`
      };
    }
  }

  // Check Anti-Time Tampering if DB is available
  if (db && typeof db.prepare === 'function') {
    try {
      // Ensure system_meta table exists
      db.prepare(`
        CREATE TABLE IF NOT EXISTS system_meta (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `).run();

      const row = db.prepare(`SELECT value FROM system_meta WHERE key = 'last_op_date'`).get();
      const lastOpDate = row ? row.value : null;

      if (lastOpDate) {
        // If current date is more than 1 day in the past relative to last operation => tampering
        if (nowStr < lastOpDate) {
          return {
            status: 'TIME_TAMPER',
            isValid: false,
            hwid: currentHWID,
            payload,
            daysRemaining,
            message: `Desincronización de fecha del sistema detectada. La fecha actual (${nowStr}) es anterior a la última operación registrada (${lastOpDate}).`
          };
        }
      }

      // Update last_op_date if nowStr is newer
      if (!lastOpDate || nowStr > lastOpDate) {
        db.prepare(`INSERT INTO system_meta (key, value) VALUES ('last_op_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(nowStr);
      }
    } catch (err) {
      console.warn('Advertencia comprobando anti-time tampering:', err);
    }
  }

  // Check Max Terminals Allowed
  const activeCount = getActiveTerminalsCount();
  const maxTerminals = payload.terminales;
  if (typeof maxTerminals === 'number' && activeCount > maxTerminals) {
    return {
      status: 'TERMINALS_EXCEEDED',
      isValid: false,
      hwid: currentHWID,
      payload,
      daysRemaining,
      activeTerminals: activeCount,
      maxTerminals,
      message: `Ha alcanzado el límite máximo de cajas autorizadas (${activeCount}/${maxTerminals}). Actualice su plan.`
    };
  }

  return {
    status: 'VALID',
    isValid: true,
    isTrial: false,
    hwid: currentHWID,
    payload,
    daysRemaining,
    activeTerminals: activeCount,
    maxTerminals,
    message: expStr === 'VITALICIA' ? 'Licencia Vitalicia Activa y Válida' : `Licencia Activa (${daysRemaining} días restantes)`
  };
}

// Save & Activate new license
export function activateLicense(licenseInput, db = null) {
  let content = '';
  if (typeof licenseInput === 'string') {
    content = licenseInput.trim();
  } else if (typeof licenseInput === 'object') {
    content = JSON.stringify(licenseInput, null, 2);
  }

  if (!content) {
    return { success: false, message: 'La licencia proporcionada está vacía.' };
  }

  try {
    // Validate before saving
    JSON.parse(content);
  } catch (e) {
    return { success: false, message: 'Formato de licencia no válido. Debe ser un código JSON o archivo .lic oficial.' };
  }

  // Write to primary license file
  try {
    fs.writeFileSync(licensePathPrimary, content, 'utf8');
    if (fs.existsSync(path.dirname(licensePathRoot))) {
      fs.writeFileSync(licensePathRoot, content, 'utf8');
    }
  } catch (err) {
    return { success: false, message: 'Error escribiendo el archivo de licencia en el disco del servidor.' };
  }

  const result = verifyLicense(db);
  if (result.isValid) {
    return { success: true, status: result, message: '¡Licencia activada con éxito!' };
  } else {
    return { success: false, status: result, message: result.message || 'La licencia cargada no es válida para este equipo.' };
  }
}
