import pg from 'pg';

const { Client } = pg;

async function testTargetDatabase() {
  console.log('Probando conexión directa a la base de datos "Winter" con usuario "admin"...');
  const client = new Client({
    user: 'admin',
    password: 'admin',
    host: 'localhost',
    port: 5432,
    database: 'Winter'
  });
  
  try {
    await client.connect();
    console.log('✅ ¡ÉXITO! Conectado con éxito a la base de datos "Winter".');
    await client.end();
  } catch (err) {
    console.log(`❌ Falló la conexión directa: ${err.message}`);
  }
}

testTargetDatabase();
