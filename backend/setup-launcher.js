import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get local LAN IP
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

console.log('====================================================');
console.log('      INICIANDO SISTEMA WINTERPOS AUTOMÁTICO       ');
console.log('====================================================');

const localIp = getLocalIpAddress();
console.log(`[Red] IP Local detectada en este equipo: ${localIp}`);

// Ensure .env file exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('[Config] Creando archivo .env con valores por defecto...');
  const defaultEnv = `PORT=5000\nDB_USER=postgres\nDB_PASSWORD=postgres\nDB_HOST=localhost\nDB_PORT=5432\nDB_DATABASE=Winter\n`;
  fs.writeFileSync(envPath, defaultEnv, 'utf8');
}

// Function to initialize DB schema
async function ensureDatabaseInitialized() {
  console.log('[Base de Datos] Verificando e inicializando tablas en PostgreSQL...');
  try {
    const { initDatabase } = await import('./init-db.js');
    const ok = await initDatabase();
    if (ok) {
      console.log('✅ [Base de Datos] Verificación y conexión PostgreSQL completada exitosamente.');
    } else {
      console.warn('⚠️ [Base de Datos] Advertencia: No se pudo verificar la base de datos PostgreSQL.');
    }
  } catch (err) {
    console.error('❌ [Base de Datos] Error durante la inicialización:', err.message);
  }
}

// Execute DB init first, then start server
async function main() {
  await ensureDatabaseInitialized();

  console.log('[Servidor] Arrancando servidor Backend Express y APIs en puerto 5000...');
  const serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  const appUrl = `http://localhost:5000`;
  const lanUrl = `http://${localIp}:5000`;

  console.log(`\n====================================================`);
  console.log(` 🚀 WINTERPOS ESTÁ LISTO Y EN EJECUCIÓN!`);
  console.log(` 💻 Acceso Local: ${appUrl}`);
  console.log(` 🌐 Acceso desde otras Cajas (LAN): ${lanUrl}`);
  console.log(`====================================================\n`);

  process.on('SIGINT', () => {
    if (serverProcess) serverProcess.kill();
    process.exit();
  });
}

main();
