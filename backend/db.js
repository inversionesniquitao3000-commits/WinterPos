import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE,
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error al conectar con la base de datos PostgreSQL:', err.message);
  } else {
    console.log('Conexión exitosa a la base de datos PostgreSQL:', process.env.DB_DATABASE);
    release();
  }
});

export default {
  query: (text, params) => pool.query(text, params),
  pool
};
