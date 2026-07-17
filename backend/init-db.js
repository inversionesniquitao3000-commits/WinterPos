import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function initDatabase() {
  const dbName = process.env.DB_DATABASE || 'Winter';
  
  // 1. Connect to default 'postgres' database first to check/create target database
  const configPostgres = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres',
  };
  
  const clientPostgres = new Client(configPostgres);
  try {
    await clientPostgres.connect();
    const res = await clientPostgres.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (res.rowCount === 0) {
      console.log(`Base de datos '${dbName}' no existe. Creándola...`);
      await clientPostgres.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Base de datos '${dbName}' creada con éxito.`);
    } else {
      console.log(`Base de datos '${dbName}' ya existe.`);
    }
  } catch (err) {
    console.error('Error al verificar/crear la base de datos:', err.message);
  } finally {
    await clientPostgres.end();
  }

  // 2. Connect to target database and execute schema.sql
  const configTarget = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
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
      console.log('Las tablas no existen en la base de datos. Ejecutando schema.sql...');
      const schemaPath = path.resolve('../WinterPosAL/schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      
      // Execute schema
      await clientTarget.query(schemaSql);
      console.log('Esquema de tablas creado con éxito.');
    } else {
      console.log('Las tablas de la base de datos ya existen. Saltando creación de tablas.');
    }
  } catch (err) {
    console.error('Error al inicializar las tablas:', err.message);
  } finally {
    await clientTarget.end();
  }
}

initDatabase();
