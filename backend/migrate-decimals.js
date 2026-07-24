import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Iniciando migración de columnas a decimales...');
    await client.query('BEGIN');

    // 1. Alter Productos columns
    console.log('Alterando tabla Productos...');
    await client.query('ALTER TABLE Productos ALTER COLUMN stock_actual TYPE NUMERIC(12, 3);');
    await client.query('ALTER TABLE Productos ALTER COLUMN stock_minimo TYPE NUMERIC(12, 3);');

    // 2. Alter Movimientos_Inventario columns
    console.log('Alterando tabla Movimientos_Inventario...');
    await client.query('ALTER TABLE Movimientos_Inventario ALTER COLUMN cantidad TYPE NUMERIC(12, 3);');
    await client.query('ALTER TABLE Movimientos_Inventario ALTER COLUMN stock_anterior TYPE NUMERIC(12, 3);');
    await client.query('ALTER TABLE Movimientos_Inventario ALTER COLUMN stock_posterior TYPE NUMERIC(12, 3);');

    // 3. Alter Ventas_Detalle columns
    console.log('Alterando tabla Ventas_Detalle...');
    await client.query('ALTER TABLE Ventas_Detalle ALTER COLUMN cantidad TYPE NUMERIC(12, 3);');

    await client.query('COMMIT');
    console.log('✅ Migración completada con éxito.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la migración:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
