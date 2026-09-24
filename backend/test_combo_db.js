import { pool } from './db-store.js';

async function run() {
  try {
    console.log('Ensuring Combos_Recetas table and columns exist...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Combos_Recetas (
        id BIGSERIAL PRIMARY KEY,
        producto_padre_id BIGINT NOT NULL REFERENCES Productos(id) ON DELETE CASCADE,
        producto_hijo_id BIGINT NOT NULL REFERENCES Productos(id) ON DELETE CASCADE,
        cantidad NUMERIC(15, 3) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_combo_padre_hijo UNIQUE (producto_padre_id, producto_hijo_id)
      );
      CREATE INDEX IF NOT EXISTS idx_combos_padre ON Combos_Recetas(producto_padre_id);
      CREATE INDEX IF NOT EXISTS idx_combos_hijo ON Combos_Recetas(producto_hijo_id);
      ALTER TABLE Productos ADD COLUMN IF NOT EXISTS es_combo BOOLEAN DEFAULT FALSE;
      ALTER TABLE Productos ADD COLUMN IF NOT EXISTS producto_bulto_padre_id BIGINT;
      ALTER TABLE Productos ADD COLUMN IF NOT EXISTS factor_conversion_bulto NUMERIC DEFAULT 1;
    `);
    console.log('✅ Combos_Recetas table and columns created/verified successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error initializing Combos_Recetas table:', err);
    process.exit(1);
  }
}

run();
