import pg from 'pg';

const { Client } = pg;

const passwords = [
  'admin', 'postgres', '', 'root', '1234', '123', 'admin123', '123456', '12345678', 
  'niquitao', 'winter', 'winterpos', 'winterposal', 'superadmin', 'password', 'manager'
];
const users = ['admin', 'postgres'];

async function testCombos() {
  for (const user of users) {
    for (const pass of passwords) {
      console.log(`Probando: Usuario=${user}, Contraseña=${pass || '(vacia)'}...`);
      const client = new Client({
        user: user,
        password: pass,
        host: 'localhost',
        port: 5432,
        database: 'postgres'
      });
      
      try {
        await client.connect();
        console.log(`\n\n✅ ¡ÉXITO! Conexión exitosa con Usuario=${user}, Contraseña=${pass || '(vacia)'}\n\n`);
        await client.end();
        return;
      } catch (err) {
        // failed
      }
    }
  }
  console.log('Ninguna combinación funcionó.');
}

testCombos();
