import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const { Pool, types } = pg;
types.setTypeParser(1114, str => str);
types.setTypeParser(1184, str => str);
types.setTypeParser(1082, str => str);

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE || 'Winter'
});

async function testProducts() {
  try {
    const res = await pool.query(`SELECT * FROM Productos`);
    console.log(`Inspeccionando ${res.rows.length} productos en la BD PostgreSQL...`);
    
    let nullBarcodes = 0;
    let nullDescs = 0;
    let nullCats = 0;
    let nullStocks = 0;
    let nullCosts = 0;
    let nullDetails = 0;
    let nullMayors = 0;
    let invalidTypes = 0;

    res.rows.forEach((p, idx) => {
      if (p.codigo_barras_clave == null) nullBarcodes++;
      if (p.descripcion == null) nullDescs++;
      if (p.categoria == null) nullCats++;
      if (p.stock_actual == null) nullStocks++;
      if (p.precio_costo_usd == null) nullCosts++;
      if (p.precio_detalle_usd == null) nullDetails++;
      if (p.precio_mayor_usd == null) nullMayors++;
      
      if (typeof p.descripcion !== 'string' && p.descripcion != null) invalidTypes++;
    });

    console.log({
      nullBarcodes,
      nullDescs,
      nullCats,
      nullStocks,
      nullCosts,
      nullDetails,
      nullMayors,
      invalidTypes
    });

    await pool.end();
  } catch (e) {
    console.error(e);
    await pool.end();
  }
}

testProducts();
