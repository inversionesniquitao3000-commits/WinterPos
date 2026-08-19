import db from './db.js';

async function run() {
  try {
    await db.query("ALTER TABLE IF EXISTS Configuracion_Empresa ADD COLUMN IF NOT EXISTS moneda_ticket_default VARCHAR(10) DEFAULT 'USD';");
    console.log('Successfully added moneda_ticket_default to Configuracion_Empresa');
    process.exit(0);
  } catch (err) {
    console.error('Error running migration:', err);
    process.exit(1);
  }
}

run();
