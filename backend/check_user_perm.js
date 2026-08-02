import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const pool = new pg.Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE || 'Winter'
});

async function checkUsers() {
  try {
    const res = await pool.query('SELECT id, usuario, nombre, rol, estado, permisos FROM Usuarios');
    console.log('=== USUARIOS EN LA BASE DE DATOS ===');
    res.rows.forEach(u => {
      console.log(`ID: ${u.id} | Usuario: ${u.usuario} | Nombre: ${u.nombre} | Rol: ${u.rol}`);
      console.log('Permisos:', u.permisos);
      console.log('-----------------------------------');
    });
    await pool.end();
  } catch (e) {
    console.error(e);
    await pool.end();
  }
}

checkUsers();
