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

async function reorderProveedores() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure PROVEEDOR OCASIONAL / VARIOS exists
    const checkOcasional = await client.query("SELECT * FROM Proveedores WHERE UPPER(razon_social) LIKE '%OCASIONAL%'");
    let ocasionalDbRow;
    if (checkOcasional.rowCount === 0) {
      const ins = await client.query(
        "INSERT INTO Proveedores (rif, razon_social, contacto_nombre, telefono, correo, direccion, estado) VALUES ('J-000000000', 'PROVEEDOR OCASIONAL / VARIOS', 'VENTAS OCASIONALES', '0000000000', 'ocasional@pos.com', 'LOCAL', 'Activo') RETURNING *"
      );
      ocasionalDbRow = ins.rows[0];
    } else {
      ocasionalDbRow = checkOcasional.rows[0];
    }

    const allProviders = await client.query("SELECT * FROM Proveedores ORDER BY id ASC");
    const oldOcasId = parseInt(ocasionalDbRow.id);
    const polarRow = allProviders.rows.find(p => (p.razon_social || '').toUpperCase().includes('POLAR'));
    const oldPolarId = polarRow ? parseInt(polarRow.id) : null;

    // Build unique list of target providers
    // Target ID 1: PROVEEDOR OCASIONAL / VARIOS
    // Target ID 2: ALIMENTOS POLAR
    // Target ID 3+: All other providers
    const targetMap = []; // { targetId, oldId, rif, razon_social, contacto_nombre, telefono, correo, direccion, estado }

    targetMap.push({
      targetId: 1,
      oldId: oldOcasId,
      rif: 'J-000000000',
      razon_social: 'PROVEEDOR OCASIONAL / VARIOS',
      contacto_nombre: 'VENTAS OCASIONALES',
      telefono: '0000000000',
      correo: 'ocasional@pos.com',
      direccion: 'LOCAL',
      estado: 'Activo'
    });

    targetMap.push({
      targetId: 2,
      oldId: oldPolarId,
      rif: polarRow?.rif || 'J-411332631',
      razon_social: 'ALIMENTOS POLAR',
      contacto_nombre: polarRow?.contacto_nombre || 'DARWIN',
      telefono: polarRow?.telefono || '04242587485',
      correo: polarRow?.correo || 'polar@pos.com',
      direccion: polarRow?.direccion || 'Caracas, Venezuela',
      estado: 'Activo'
    });

    let currentId = 3;
    for (const p of allProviders.rows) {
      const pId = parseInt(p.id);
      if (pId !== oldOcasId && pId !== oldPolarId) {
        targetMap.push({
          targetId: currentId++,
          oldId: pId,
          rif: p.rif || `J-${Date.now()}`,
          razon_social: p.razon_social,
          contacto_nombre: p.contacto_nombre || '',
          telefono: p.telefono || '',
          correo: p.correo || '',
          direccion: p.direccion || '',
          estado: p.estado || 'Activo'
        });
      }
    }

    // Step A: Temporary table for FK mapping
    await client.query("CREATE TEMP TABLE prov_id_map (old_id BIGINT PRIMARY KEY, new_id BIGINT)");
    for (const item of targetMap) {
      if (item.oldId) {
        await client.query("INSERT INTO prov_id_map (old_id, new_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [item.oldId, item.targetId]);
      }
    }

    // Step B: Drop FK constraints temporarily
    await client.query("ALTER TABLE Compras DROP CONSTRAINT IF EXISTS compras_proveedor_id_fkey");
    await client.query("ALTER TABLE Pagos_Proveedores DROP CONSTRAINT IF EXISTS pagos_proveedores_proveedor_id_fkey");
    await client.query("ALTER TABLE Cotizaciones_Proveedores DROP CONSTRAINT IF EXISTS cotizaciones_proveedores_proveedor_id_fkey");

    // Step C: Update FK columns in Compras, Pagos_Proveedores, Cotizaciones_Proveedores
    await client.query("UPDATE Compras c SET proveedor_id = m.new_id FROM prov_id_map m WHERE c.proveedor_id = m.old_id");
    await client.query("UPDATE Pagos_Proveedores p SET proveedor_id = m.new_id FROM prov_id_map m WHERE p.proveedor_id = m.old_id");
    await client.query("UPDATE Cotizaciones_Proveedores c SET proveedor_id = m.new_id FROM prov_id_map m WHERE c.proveedor_id = m.old_id");

    // Default any orphaned purchases to ID 1 (Proveedor Ocasional)
    await client.query("UPDATE Compras SET proveedor_id = 1 WHERE proveedor_id IS NULL OR proveedor_id NOT IN (SELECT new_id FROM prov_id_map)");

    // Step D: Re-populate Proveedores table
    await client.query("DELETE FROM Proveedores");
    for (const r of targetMap) {
      await client.query(
        `INSERT INTO Proveedores (id, rif, razon_social, contacto_nombre, telefono, correo, direccion, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [r.targetId, r.rif, r.razon_social, r.contacto_nombre, r.telefono, r.correo, r.direccion, r.estado]
      );
    }

    // Step E: Re-add FK constraints
    await client.query("ALTER TABLE Compras ADD CONSTRAINT compras_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES Proveedores(id) ON DELETE RESTRICT");
    await client.query("ALTER TABLE Pagos_Proveedores ADD CONSTRAINT pagos_proveedores_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES Proveedores(id) ON DELETE CASCADE");
    await client.query("ALTER TABLE Cotizaciones_Proveedores ADD CONSTRAINT cotizaciones_proveedores_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES Proveedores(id) ON DELETE CASCADE");

    // Step F: Reset sequence
    await client.query("SELECT setval(pg_get_serial_sequence('Proveedores', 'id'), (SELECT MAX(id) FROM Proveedores))");

    await client.query('COMMIT');
    console.log('✅ PROVEEDORES REORDENADOS EXITOSAMENTE EN BASE DE DATOS:');
    const finalProveedores = await client.query("SELECT id, razon_social, rif FROM Proveedores ORDER BY id ASC");
    console.log(JSON.stringify(finalProveedores.rows, null, 2));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error reordenando proveedores:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

reorderProveedores();
