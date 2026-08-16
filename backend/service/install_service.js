import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear el objeto del servicio
const svc = new Service({
  name: 'WinterPosBackendService',
  description: 'Servicio Backend en segundo plano para el sistema WinterPos Punto de Venta.',
  script: path.join(__dirname, '..', 'server.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ]
});

// Escuchar el evento "install" para iniciar el servicio inmediatamente
svc.on('install', function() {
  console.log('✅ Servicio WinterPos instalado con éxito. Iniciando...');
  svc.start();
});

// Instalar el servicio
svc.install();
