import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

let JavaScriptObfuscator;
try {
  JavaScriptObfuscator = require('javascript-obfuscator');
} catch (e) {
  try {
    JavaScriptObfuscator = require(path.join(__dirname, '..', 'backend', 'node_modules', 'javascript-obfuscator'));
  } catch (e2) {
    console.error('❌ No se encontró el módulo javascript-obfuscator. Ejecute npm install');
    process.exit(1);
  }
}

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const distBackendDir = path.join(rootDir, 'dist_backend');
const distRootDir = path.join(rootDir, 'dist_root');

// Backend files to obfuscate and copy to dist_backend
const explicitFiles = [
  'server.js',
  'db-store.js',
  'license-manager.js',
  'whatsapp-service.js',
  'fiscal-service.js',
  'gdrive-service.js',
  'init-db.js',
  'setup-launcher.js',
  'build_ico_now.js',
  'check_user_perm.js',
  'mockData.js',
  'db.js',
  'migrate-decimals.js'
];

// Dynamically include any other production .js files in backend (ignoring test-*)
const backendFilesToProtect = Array.from(new Set([
  ...explicitFiles,
  ...fs.readdirSync(backendDir).filter(f => f.endsWith('.js') && !f.startsWith('test-') && !f.startsWith('test_'))
]));

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.75,
  stringArrayEncoding: ['base64', 'rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayThreshold: 0.8,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  target: 'node',
  sourceType: 'module'
};

console.log('==================================================================');
console.log('    CONSTRUCCIÓN DE BACKEND PROTEGIDO (DIST_BACKEND)             ');
console.log('==================================================================\n');
console.log('ℹ️  Tu código de desarrollo original en "backend/" permanecerá');
console.log('    100% INTACTO y LIMPIO para seguir programando.\n');

// 1. Prepare target directories
if (fs.existsSync(distBackendDir)) {
  fs.rmSync(distBackendDir, { recursive: true, force: true });
}
fs.mkdirSync(distBackendDir, { recursive: true });

if (fs.existsSync(distRootDir)) {
  fs.rmSync(distRootDir, { recursive: true, force: true });
}
fs.mkdirSync(distRootDir, { recursive: true });

// 2. Copy static and structural assets to dist_backend
console.log('📦 Copiando configuraciones y claves públicas...');
const backendKeysDir = path.join(distBackendDir, 'keys');
fs.mkdirSync(backendKeysDir, { recursive: true });
const pubKeySrc = path.join(backendDir, 'keys', 'public_key.pem');
if (fs.existsSync(pubKeySrc)) {
  fs.copyFileSync(pubKeySrc, path.join(backendKeysDir, 'public_key.pem'));
  console.log('  ✅ Clave Pública copiada a dist_backend/keys/public_key.pem');
}

// Copy service scripts
const serviceDir = path.join(distBackendDir, 'service');
fs.mkdirSync(serviceDir, { recursive: true });
const installServiceSrc = path.join(backendDir, 'service', 'install_service.js');
if (fs.existsSync(installServiceSrc)) {
  fs.copyFileSync(installServiceSrc, path.join(serviceDir, 'install_service.js'));
}
const uninstallServiceSrc = path.join(backendDir, 'service', 'uninstall_service.js');
if (fs.existsSync(uninstallServiceSrc)) {
  fs.copyFileSync(uninstallServiceSrc, path.join(serviceDir, 'uninstall_service.js'));
}
console.log('  ✅ Scripts de servicios copiados a dist_backend/service/');

// Copy package.json to dist_backend
const pkgSrc = path.join(backendDir, 'package.json');
if (fs.existsSync(pkgSrc)) {
  fs.copyFileSync(pkgSrc, path.join(distBackendDir, 'package.json'));
}

// Copy schema.sql if exists
const schemaSrc = path.join(backendDir, 'schema.sql');
if (fs.existsSync(schemaSrc)) {
  fs.copyFileSync(schemaSrc, path.join(distBackendDir, 'schema.sql'));
}

// 3. Obfuscate backend files into dist_backend
console.log('\n🛡️ Ofuscando y Cifrando módulos de backend en dist_backend/:');
for (const file of backendFilesToProtect) {
  const srcFile = path.join(backendDir, file);
  const targetFile = path.join(distBackendDir, file);
  if (fs.existsSync(srcFile)) {
    const code = fs.readFileSync(srcFile, 'utf8');
    try {
      const obfuscated = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);
      fs.writeFileSync(targetFile, obfuscated.getObfuscatedCode(), 'utf8');
      console.log(`  🔒 Cifrado: dist_backend/${file}`);
    } catch (err) {
      console.error(`  ❌ Error ofuscando ${file}:`, err.message);
    }
  }
}

// 4. Obfuscate desktop launcher into dist_root
const launcherSrc = path.join(rootDir, 'desktop-main.js');
if (fs.existsSync(launcherSrc)) {
  const code = fs.readFileSync(launcherSrc, 'utf8');
  try {
    const obfuscated = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);
    fs.writeFileSync(path.join(distRootDir, 'desktop-main.js'), obfuscated.getObfuscatedCode(), 'utf8');
    console.log('  🔒 Cifrado: dist_root/desktop-main.js');
  } catch (err) {
    console.error('  ❌ Error ofuscando desktop-main.js:', err.message);
  }
}

console.log('\n==================================================================');
console.log('  ✅ COMPILACIÓN Y PROTECCIÓN COMPLETADA CON ÉXITO');
console.log('  La carpeta "dist_backend/" está lista para ser empaquetada.');
console.log('  Tu código original en "backend/" sigue 100% limpio y sin tocar.');
console.log('==================================================================\n');
