import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svc = new Service({
  name: 'WinterPosBackendService',
  script: path.join(__dirname, '..', 'server.js')
});

svc.on('uninstall', function() {
  console.log('✅ Servicio WinterPos desinstalado correctamente.');
});

svc.uninstall();
