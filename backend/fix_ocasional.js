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

async function fixOcasional() {
  try {
    const check = await pool.query("SELECT * FROM Proveedores WHERE UPPER(razon_social) LIKE '%OCASIONAL%'");
    let ocasId;
    if (check.rowCount === 0) {
      const ins = await pool.query(
        "INSERT INTO Proveedores (rif, razon_social, contacto_nombre, telefono, correo, direccion, estado) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        ['J-000000000', 'PROVEEDOR OCASIONAL / VARIOS', 'VENTAS OCASIONALES', '0000000000', 'ocasional@pos.com', 'LOCAL', 'Activo']
      );
      ocasId = ins.rows[0].id;
      console.log('✅ Creado Proveedor Ocasional / Varios con ID:', ocasId);
    } else {
      ocasId = check.rows[0].id;
      console.log('ℹ️ Proveedor Ocasional ya existe con ID:', ocasId);
    }

    const upd = await pool.query(
      "UPDATE Compras SET proveedor_id = $1 WHERE UPPER(numero_factura) LIKE 'OCASIONAL-%'",
      [ocasId]
    );
    console.log(`✅ Reasignadas ${upd.rowCount} facturas OCASIONAL- al Proveedor Ocasional (ID: ${ocasId})`);

    const allProv = await pool.query("SELECT id, razon_social, rif FROM Proveedores ORDER BY id ASC");
    console.log('📋 Lista actual de Proveedores:', allProv.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

fixOcasional();
