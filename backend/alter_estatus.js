import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE || 'Winter'
});

async function alterEstatus() {
  try {
    await pool.query("ALTER TABLE Compras ALTER COLUMN estatus TYPE VARCHAR(50)");
    console.log("✅ Columna estatus en Compras ampliada a VARCHAR(50)");
  } catch (err) {
    console.error("Error al alterar la columna:", err.message);
  } finally {
    process.exit(0);
  }
}

alterEstatus();
