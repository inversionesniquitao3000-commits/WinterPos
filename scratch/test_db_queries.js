import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

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

async function runTest() {
  try {
    console.log('--- Testing PostgreSQL DB Tables for Inventario ---');
    const productsRes = await pool.query(`SELECT * FROM Productos ORDER BY id ASC`);
    console.log(`✅ Productos: ${productsRes.rows.length} registros`);
    
    // Check for any product with null/undefined required fields
    productsRes.rows.forEach((p, idx) => {
      if (!p.codigo_barras_clave || !p.descripcion) {
        console.log(`⚠️ WARN: Producto ID ${p.id} (Fila ${idx}) tiene campos nulos:`, p);
      }
    });

    const movementsRes = await pool.query(`
      SELECT m.*, p.codigo_barras_clave as barcode, p.descripcion as description, u.nombre as usuario_nombre
      FROM Movimientos_Inventario m
      LEFT JOIN Productos p ON m.producto_id = p.id
      LEFT JOIN Usuarios u ON m.usuario_id = u.id
      ORDER BY m.fecha DESC
    `);
    console.log(`✅ Movimientos_Inventario (Kardex): ${movementsRes.rows.length} registros`);

    const priceHistRes = await pool.query(`
      SELECT h.*, p.codigo_barras_clave as barcode, p.descripcion as description, u.nombre as usuario_nombre
      FROM Historial_Precios h
      LEFT JOIN Productos p ON h.producto_id = p.id
      LEFT JOIN Usuarios u ON h.usuario_id = u.id
      ORDER BY h.fecha DESC
    `);
    console.log(`✅ Historial_Precios: ${priceHistRes.rows.length} registros`);

    console.log('\n--- PRUEBA COMPLETADA SIN ERRORES ---');
    await pool.end();
  } catch (err) {
    console.error('❌ ERROR EN BASE DE DATOS:', err);
    await pool.end();
  }
}

runTest();
