import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { getGDriveConfigDb, saveGDriveConfigDb } from './db-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function getDriveConfig() {
  try {
    return await getGDriveConfigDb();
  } catch (e) {
    console.error('Error al obtener configuración de Google Drive:', e.message);
    return {
      enabled: false,
      method: 'WEBHOOK',
      webhookUrl: '',
      folderId: '',
      folderName: 'WinterPOS_Backups',
      accessToken: '',
      lastSync: null,
      lastStatus: 'PENDING'
    };
  }
}

export async function saveDriveConfig(config) {
  try {
    return await saveGDriveConfigDb(config);
  } catch (e) {
    console.error('Error guardando configuración de Google Drive:', e.message);
    throw e;
  }
}

/**
 * Uploads backup payload to Google Drive using configured webhook or Google REST API.
 */
export async function uploadBackupToGoogleDrive(backupData, fileName = `winterpos_backup_${Date.now()}.json`, overrideConfig = null) {
  const config = overrideConfig || (await getDriveConfig());
  const isTest = fileName.includes('test_ping');

  if (!config.enabled && !isTest) {
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
      const webhookUrl = config.webhookUrl.trim();
      const response = await fetch(webhookUrl, {
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

      if (response.ok || (response.status >= 200 && response.status < 400)) {
        config.lastSync = new Date().toISOString();
        config.lastStatus = 'SUCCESS';
        await saveDriveConfig(config);
        return {
          ok: true,
          message: `✅ Respaldo "${fileName}" subido exitosamente a Google Drive.`,
          response: responseData
        };
      } else {
        const errMsg = responseData.error || responseData.message || `HTTP ${response.status}: ${responseText.substring(0, 100)}`;
        config.lastStatus = `ERROR: ${errMsg}`;
        await saveDriveConfig(config);
        throw new Error(`Google Drive respondió con error: ${errMsg}`);
      }
    } catch (err) {
      config.lastStatus = `ERROR: ${err.message}`;
      await saveDriveConfig(config);
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
          res.on('end', async () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              config.lastSync = new Date().toISOString();
              config.lastStatus = 'SUCCESS';
              await saveDriveConfig(config);
              resolve({
                ok: true,
                message: `✅ Respaldo "${fileName}" sincronizado en Google Drive vía API.`,
                response: body
              });
            } else {
              config.lastStatus = `ERROR: HTTP ${res.statusCode}`;
              await saveDriveConfig(config);
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
