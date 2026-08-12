import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keysDir = path.join(__dirname, 'keys');
const backendKeysDir = path.join(__dirname, '..', 'backend', 'keys');
const privateKeyPath = path.join(keysDir, 'private_key.pem');
const publicKeyPath = path.join(backendKeysDir, 'public_key.pem');

// Ensure directories exist
if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });
if (!fs.existsSync(backendKeysDir)) fs.mkdirSync(backendKeysDir, { recursive: true });

// Step 1: Ensure RSA 2048-bit Keypair exists
if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
  console.log('[License Generator] Generando nuevo par de claves criptográficas RSA-2048...');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  fs.writeFileSync(privateKeyPath, privateKey, 'utf8');
  fs.writeFileSync(publicKeyPath, publicKey, 'utf8');
  console.log('  ✅ Clave Privada guardada en:', privateKeyPath);
  console.log('  ✅ Clave Pública guardada en:', publicKeyPath);
}

// Step 2: Read command line arguments or CLI defaults
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const match = args.find(a => a.startsWith(`--${name}=`));
  return match ? match.split('=')[1] : defaultValue;
}

const hwid = getArg('hwid', '');
const client = getArg('client', 'Inversiones Niquitao JB AL 3000').replace(/_/g, ' ');
const rif = getArg('rif', 'J-000000000');
const terminalsArg = getArg('terminals', '3');
const daysArg = getArg('days', '365');
const outputArg = getArg('output', 'license.lic');

if (!hwid) {
  console.log('\n===============================================================');
  console.log('    HERRAMIENTA GENERADORA DE LICENCIAS WINTERPOS (RSA-2048)   ');
  console.log('===============================================================\n');
  console.log('Uso por Línea de Comandos:');
  console.log('  node tools/generate-license.js --hwid="WPOS-XXXX-YYYY" --client="Inversiones Niquitao" --rif="J-41132631" --terminals=5 --days=365\n');
  console.log('Ejemplo de generación de licencia vitalicia:');
  console.log('  node tools/generate-license.js --hwid="WPOS-XXXX-YYYY" --client="Comercio Demo" --terminals=ILIMITADO --days=0\n');
  console.log('❌ Error: Debe especificar el parámetro --hwid="CODIGO_EQUIPO"\n');
  process.exit(1);
}

const terminals = terminalsArg.toUpperCase() === 'ILIMITADO' || terminalsArg === '0' ? 'ILIMITADO' : parseInt(terminalsArg, 10) || 1;
const days = parseInt(daysArg, 10);

const fechaEmision = new Date().toISOString().substring(0, 10);
let fechaExpiracion = 'VITALICIA';
if (days > 0) {
  const expDate = new Date();
  expDate.setDate(expDate.getDate() + days);
  fechaExpiracion = expDate.toISOString().substring(0, 10);
}

const payload = {
  cliente: client,
  rif: rif,
  hwid: hwid.toUpperCase().trim(),
  terminales: terminals,
  fechaEmision: fechaEmision,
  fechaExpiracion: fechaExpiracion,
  tipo: days === 0 ? 'VITALICIA' : `${days} DÍAS`
};

// Sign payload with Private Key
const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
const signer = crypto.createSign('SHA256');
signer.update(JSON.stringify(payload));
signer.end();
const signature = signer.sign(privateKeyPem, 'hex');

const licenseObject = {
  payload,
  signature
};

const licenseContent = JSON.stringify(licenseObject, null, 2);

// Write output file
const outputPath = path.isAbsolute(outputArg) ? outputArg : path.join(__dirname, '..', outputArg);
fs.writeFileSync(outputPath, licenseContent, 'utf8');

// Also write to backend/license.lic for local dev test
const backendLicensePath = path.join(__dirname, '..', 'backend', 'license.lic');
fs.writeFileSync(backendLicensePath, licenseContent, 'utf8');

// -------------------------------------------------------------
// Step 3: Vault / Repositorio Automático de Licencias Emitidas
// -------------------------------------------------------------
const vaultDir = path.join(__dirname, 'licencias_emitidas');
if (!fs.existsSync(vaultDir)) fs.mkdirSync(vaultDir, { recursive: true });

// Sanitize filename
const cleanClient = payload.cliente.replace(/[^a-zA-Z0-9_-]/g, '_');
const cleanRif = payload.rif.replace(/[^a-zA-Z0-9_-]/g, '_');
const cleanHwid = payload.hwid.replace(/[^a-zA-Z0-9_-]/g, '_');
const vaultFileName = `Licencia_${cleanClient}_${cleanRif}_${cleanHwid}.lic`;
const vaultFilePath = path.join(vaultDir, vaultFileName);

// Save individual client license file in vault
fs.writeFileSync(vaultFilePath, licenseContent, 'utf8');

// Update JSON Registry
const registryJsonPath = path.join(vaultDir, 'registro_licencias.json');
let registry = [];
if (fs.existsSync(registryJsonPath)) {
  try {
    registry = JSON.parse(fs.readFileSync(registryJsonPath, 'utf8'));
    if (!Array.isArray(registry)) registry = [];
  } catch (e) {
    registry = [];
  }
}

// Check if HWID already in registry, update or prepend
const existingIndex = registry.findIndex(r => r.hwid === payload.hwid);
const record = {
  ...payload,
  archivo: vaultFileName,
  fechaRegistro: new Date().toISOString()
};

if (existingIndex >= 0) {
  registry[existingIndex] = record;
} else {
  registry.unshift(record);
}
fs.writeFileSync(registryJsonPath, JSON.stringify(registry, null, 2), 'utf8');

// Update Markdown History Table for easy viewing
const historyMdPath = path.join(vaultDir, 'HISTORIAL_LICENCIAS.md');
let mdContent = `# 🏛️ HISTORIAL Y REPOSITORIO DE LICENCIAS EMITIDAS - WINTERPOS\n\n`;
mdContent += `> Este repositorio almacena el historial seguro de todas las licencias generadas para clientes.\n\n`;
mdContent += `| # | Cliente | RIF / Cédula | HWID Equipo | Terminales | Tipo | Emisión | Expiración | Archivo Backup |\n`;
mdContent += `| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |\n`;

registry.forEach((item, idx) => {
  mdContent += `| ${idx + 1} | **${item.cliente}** | \`${item.rif}\` | \`${item.hwid}\` | ${item.terminales} | \`${item.tipo}\` | ${item.fechaEmision} | ${item.fechaExpiracion} | [\`${item.archivo}\`](./${item.archivo}) |\n`;
});

fs.writeFileSync(historyMdPath, mdContent, 'utf8');

console.log('\n===============================================================');
console.log('  ✨ LICENCIA GENERADA Y FIRMADA CRIPTOGRÁFICAMENTE CON ÉXITO   ');
console.log('===============================================================');
console.log('Cliente:         ', payload.cliente);
console.log('RIF:             ', payload.rif);
console.log('HWID Servidor:   ', payload.hwid);
console.log('Cajas/Terminales:', payload.terminales);
console.log('Emisión:         ', payload.fechaEmision);
console.log('Expiración:      ', payload.fechaExpiracion);
console.log('Firma RSA:       ', signature.substring(0, 32) + '...');
console.log('---------------------------------------------------------------');
console.log('📄 Archivo actual:           ', outputPath);
console.log('📂 Guardado en Repositorio:  ', vaultFilePath);
console.log('📖 Historial actualizado:    ', historyMdPath);
console.log('===============================================================\n');
