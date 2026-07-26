import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const { Client } = pg;

// Auto start PostgreSQL Windows Service if stopped
function startPostgresWindowsService() {
  if (process.platform === 'win32') {
    const services = [
      'postgresql-x64-17',
      'postgresql-x64-16',
      'postgresql-x64-15',
      'postgresql-x64-14',
      'postgresql-x64-13',
      'postgresql'
    ];
    for (const svc of services) {
      try {
        execSync(`net start "${svc}"`, { stdio: 'ignore' });
      } catch (e) {
        // Ignore errors if service is already running or doesn't exist
      }
    }
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function initDatabase() {
  startPostgresWindowsService();

  const dbName = process.env.DB_DATABASE || 'Winter';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPassword = process.env.DB_PASSWORD || 'postgres';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '5432');

  console.log(`[Base de Datos] Conectando a PostgreSQL en ${dbHost}:${dbPort} (Usuario: ${dbUser})...`);

  const configPostgres = {
    user: dbUser,
    password: dbPassword,
    host: dbHost,
    port: dbPort,
    database: 'postgres',
  };

  // Retry connecting to postgres DB up to 5 times (waiting 2 seconds between attempts)
  let clientPostgres = null;
  let connected = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      clientPostgres = new Client(configPostgres);
      await clientPostgres.connect();
      connected = true;
      console.log(`[Base de Datos] Conexión establecida con PostgreSQL (intento ${attempt}).`);
      break;
    } catch (err) {
      console.warn(`[Base de Datos] Intento ${attempt}/5 falló: ${err.message}`);
      if (attempt < 5) await sleep(2000);
    }
  }

  if (!connected || !clientPostgres) {
    console.error(`❌ ERROR CRÍTICO: No se pudo conectar a PostgreSQL en ${dbHost}:${dbPort}. Verifique que el servicio esté iniciado.`);
    return false;
  }

  // 1. Create target database if it doesn't exist
  try {
    const res = await clientPostgres.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (res.rowCount === 0) {
      console.log(`[Base de Datos] Base de datos '${dbName}' no existe. Creándola...`);
      await clientPostgres.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[Base de Datos] Base de datos '${dbName}' creada con éxito.`);
    } else {
      console.log(`[Base de Datos] Base de datos '${dbName}' verificada y lista.`);
    }
  } catch (err) {
    console.error('Error al verificar/crear la base de datos:', err.message);
  } finally {
    await clientPostgres.end();
  }

  // 2. Connect to target database and execute schema.sql if tables don't exist
  const configTarget = {
    user: dbUser,
    password: dbPassword,
    host: dbHost,
    port: dbPort,
    database: dbName,
  };

  const clientTarget = new Client(configTarget);
  try {
    await clientTarget.connect();
    
    // Check if core table "usuarios" exists
    const tableCheck = await clientTarget.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'usuarios'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('[Base de Datos] Creando tablas e índices iniciales en PostgreSQL...');
      
      const candidateSchemaPaths = [
        path.resolve(__dirname, '../WinterPosAL/schema.sql'),
        path.resolve(__dirname, './schema.sql'),
        path.resolve(__dirname, '../schema.sql')
      ];

      let schemaSql = '';
      for (const p of candidateSchemaPaths) {
        if (fs.existsSync(p)) {
          schemaSql = fs.readFileSync(p, 'utf8');
          console.log(`[Base de Datos] Esquema SQL cargado desde: ${p}`);
          break;
        }
      }

      if (!schemaSql) {
        console.error('❌ Error: No se encontró el archivo schema.sql para inicializar la base de datos.');
        return false;
      }

      await clientTarget.query(schemaSql);
      console.log('✅ Esquema de tablas e índices creado exitosamente en PostgreSQL.');
    } else {
      console.log('✅ Base de datos PostgreSQL verificada. Tablas operativas.');
    }
    return true;
  } catch (err) {
    console.error('Error al inicializar las tablas:', err.message);
    return false;
  } finally {
    await clientTarget.end();
  }
}

// Execute if run directly
if (process.argv[1] && process.argv[1].endsWith('init-db.js')) {
  initDatabase();
}
