import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GDRIVE_CONFIG_FILE = path.join(__dirname, 'data', 'gdrive_config.json');

export function getDriveConfig() {
  try {
    if (fs.existsSync(GDRIVE_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(GDRIVE_CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return {
    enabled: false,
    method: 'WEBHOOK', // 'WEBHOOK' | 'ACCESS_TOKEN'
    webhookUrl: '',
    folderId: '',
    folderName: 'WinterPOS_Backups',
    accessToken: '',
    lastSync: null,
    lastStatus: 'PENDING'
  };
}

export function saveDriveConfig(config) {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(GDRIVE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return { ok: true, config };
  } catch (e) {
    console.error('Error guardando configuración de Google Drive:', e.message);
    throw e;
  }
}

/**
 * Uploads backup payload to Google Drive using configured webhook or Google REST API.
 */
export async function uploadBackupToGoogleDrive(backupData, fileName = `winterpos_backup_${Date.now()}.json`) {
  const config = getDriveConfig();
  if (!config.enabled) {
    return { ok: false, message: 'Respaldo en Google Drive no está habilitado.' };
  }

  const payloadString = JSON.stringify({
    fileName,
    timestamp: new Date().toISOString(),
    folderName: config.folderName || 'WinterPOS_Backups',
    folderId: config.folderId || '',
    backup: backupData
  });

  if (config.method === 'WEBHOOK' && config.webhookUrl) {
    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: payloadString,
        redirect: 'follow'
      });

      const responseText = await response.text();
      let responseData = {};
      try {
        responseData = JSON.parse(responseText);
      } catch (_) {}

      if (response.ok && (responseData.ok !== false)) {
        config.lastSync = new Date().toISOString();
        config.lastStatus = 'SUCCESS';
        saveDriveConfig(config);
        return {
          ok: true,
          message: `✅ Respaldo "${fileName}" subido exitosamente a Google Drive.`,
          response: responseData
        };
      } else {
        const errMsg = responseData.error || responseData.message || `HTTP ${response.status}: ${responseText.substring(0, 100)}`;
        config.lastStatus = `ERROR: ${errMsg}`;
        saveDriveConfig(config);
        throw new Error(`Google Drive respondió con error: ${errMsg}`);
      }
    } catch (err) {
      config.lastStatus = `ERROR: ${err.message}`;
      saveDriveConfig(config);
      throw new Error(`Error al conectar con Google Drive: ${err.message}`);
    }
  }

  if (config.method === 'ACCESS_TOKEN' && config.accessToken) {
    // Direct Google Drive API v3 upload
    return new Promise((resolve, reject) => {
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const metadata = {
        name: fileName,
        mimeType: 'application/json',
        parents: config.folderId ? [config.folderId] : undefined
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        payloadString +
        closeDelim;

      const req = https.request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': Buffer.byteLength(multipartRequestBody)
          },
          timeout: 25000
        },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              config.lastSync = new Date().toISOString();
              config.lastStatus = 'SUCCESS';
              saveDriveConfig(config);
              resolve({
                ok: true,
                message: `✅ Respaldo "${fileName}" sincronizado en Google Drive vía API.`,
                response: body
              });
            } else {
              config.lastStatus = `ERROR: HTTP ${res.statusCode}`;
              saveDriveConfig(config);
              reject(new Error(`Google API error (${res.statusCode}): ${body.substring(0, 150)}`));
            }
          });
        }
      );

      req.on('error', (e) => reject(e));
      req.write(multipartRequestBody);
      req.end();
    });
  }

  throw new Error('Configuración de Google Drive incompleta. Ingrese la URL del Webhook o Token de Acceso.');
}
