const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'WinterPosBackendService',
  script: path.join(__dirname, 'backend', 'server.js')
});

svc.on('uninstall', function() {
  console.log('✅ Servicio WinterPos desinstalado correctamente.');
});

svc.uninstall();
