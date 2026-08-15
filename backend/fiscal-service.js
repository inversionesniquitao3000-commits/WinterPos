import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fiscal memory and simulator persistence file
const FISCAL_SIMULATOR_FILE = path.join(__dirname, 'data', 'fiscal_simulator_state.json');

function getSimulatorState() {
  try {
    if (fs.existsSync(FISCAL_SIMULATOR_FILE)) {
      return JSON.parse(fs.readFileSync(FISCAL_SIMULATOR_FILE, 'utf8'));
    }
  } catch (e) {}
  return {
    ultimoNroFiscal: 1000,
    ultimoNroZ: 45,
    serialMaquina: 'Z3C987654321',
    rifEmisor: 'J-12345678-9'
  };
}

function saveSimulatorState(state) {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(FISCAL_SIMULATOR_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('Error guardando estado del simulador fiscal:', e.message);
  }
}

/**
 * Sends a raw command or JSON payload to a local The Factory HKA / PNP Fiscal Spooler
 * running on http://127.0.0.1:8080 or the configured Spooler IP.
 */
export async function sendCommandToSpooler(payload, spoolerIp = '127.0.0.1:8080') {
  return new Promise((resolve, reject) => {
    let [host, port] = spoolerIp.split(':');
    port = parseInt(port || '8080', 10);
    host = host.trim() || '127.0.0.1';

    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: host,
        port: port,
        path: '/print',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 6000 // 6 seconds timeout
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve({ ok: true, statusCode: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ ok: res.statusCode === 200, raw: body });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout de comunicación con Spooler Fiscal en ' + spoolerIp));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Builds The Factory HKA / PNP standard fiscal invoice command sequence.
 */
export function buildTFHKACommands(saleData, companyConfig = {}) {
  const commands = [];
  const clientName = (saleData.client?.nombre || 'PUBLICO GENERAL').substring(0, 40);
  const clientRif = (saleData.client?.cedula_rif || 'V-00000000').substring(0, 20);
  const clientAddress = (saleData.client?.direccion || 'CIUDAD').substring(0, 40);
  const clientPhone = (saleData.client?.telefono || '').substring(0, 20);

  // 1. Encabezado de Cliente (Comandos i01..i04 TFHKA)
  commands.push(`i01Nombre: ${clientName}`);
  commands.push(`i02RIF/CI: ${clientRif}`);
  commands.push(`i03Direccion: ${clientAddress}`);
  if (clientPhone) commands.push(`i04Telf: ${clientPhone}`);

  // 2. Renglones de Productos / Ítems (Comando TFHKA: 101 o 100)
  // Formato: 101{precio 10 digitos}{cantidad 8 digitos}{descrip 40}{tasa 1 digito}
  for (const item of saleData.items || []) {
    const isExempt = item.product?.exento_impuesto === true || (item.product?.porcentaje_impuesto !== undefined && item.product?.porcentaje_impuesto === 0);
    const taxRateCode = isExempt ? '0' : '1'; // 0 = Exento, 1 = General 16% (IVA)
    const priceNum = item.priceUSD ? item.priceUSD : (item.precio_unitario_usd || 0);
    const qtyNum = item.qty || item.cantidad || 1;
    const desc = (item.product?.description || item.descripcion || 'PRODUCTO').substring(0, 38);

    commands.push({
      cmd: 'ITEM',
      code: item.product?.barcode || '',
      description: desc,
      price: priceNum,
      quantity: qtyNum,
      tax: isExempt ? 'EXENTO' : 'IVA_16',
      taxCode: taxRateCode
    });
  }

  // 3. Pagos e IGTF
  for (const pago of saleData.pagos || []) {
    commands.push({
      cmd: 'PAYMENT',
      type: pago.metodo,
      amount: pago.monto || pago.montoUSD || 0
    });
  }

  // 4. Cierre de Documento Fiscal (Comando '3' o '199' en TFHKA)
  commands.push('3');

  return commands;
}

/**
 * High-level service: Processes a sale on the configured fiscal printer.
 */
export async function processFiscalSale(saleData, fiscalConfig = {}) {
  const estado = fiscalConfig.estadoFiscal || 'MODO_PRUEBA';
  const modelo = fiscalConfig.modelo || 'HKA_FACTORY';
  const spoolerIp = fiscalConfig.ipSpooler || '127.0.0.1:8080';

  // If fiscal mode is deactivated
  if (estado === 'DESACTIVADA') {
    return {
      ok: true,
      isFiscal: false,
      nroFiscal: null,
      serialFiscal: null,
      nroZ: null,
      estatusFiscal: 'NO_APLICA',
      message: 'Impresora fiscal desactivada. Venta no fiscal.'
    };
  }

  // Try physical Spooler if in ACTIVA mode
  if (estado === 'ACTIVA') {
    try {
      const payload = {
        action: 'PRINT_INVOICE',
        modelo: modelo,
        puerto: fiscalConfig.puerto || 'COM1',
        baudRate: fiscalConfig.baudRate || 9600,
        commands: buildTFHKACommands(saleData, fiscalConfig),
        sale: {
          subtotal: saleData.subtotal,
          iva: saleData.iva,
          totalUSD: saleData.totalUSD,
          totalVES: saleData.totalVES
        }
      };

      const spoolerRes = await sendCommandToSpooler(payload, spoolerIp);
      if (spoolerRes.ok) {
        const nroFiscal = spoolerRes.data?.nroFiscal || spoolerRes.data?.invoiceNumber || `F-${Date.now().toString().slice(-6)}`;
        const serialFiscal = spoolerRes.data?.serialFiscal || fiscalConfig.serialMaquina || 'HKA-PROD-01';
        const nroZ = spoolerRes.data?.nroZ || '0001';

        return {
          ok: true,
          isFiscal: true,
          nroFiscal,
          serialFiscal,
          nroZ,
          estatusFiscal: 'EMITIDA',
          message: `✅ Factura Fiscal N° ${nroFiscal} emitida con éxito por ${serialFiscal}.`
        };
      }
    } catch (err) {
      console.warn(`[Fiscal Spooler] Error conectando a ${spoolerIp}:`, err.message);
      // If hardware fails, fallback to simulation or throw
      throw new Error(`Error de comunicación con la máquina fiscal: ${err.message}. Verifique el cable o Spooler.`);
    }
  }

  // Fallback to MODO_PRUEBA / SIMULATOR
  const simState = getSimulatorState();
  simState.ultimoNroFiscal += 1;
  saveSimulatorState(simState);

  const paddedFiscalNo = String(simState.ultimoNroFiscal).padStart(8, '0');
  const serialSim = fiscalConfig.serialMaquina?.trim() || simState.serialMaquina;
  const paddedZ = String(simState.ultimoNroZ).padStart(4, '0');

  return {
    ok: true,
    isFiscal: true,
    nroFiscal: paddedFiscalNo,
    serialFiscal: serialSim,
    nroZ: paddedZ,
    estatusFiscal: 'EMITIDA',
    isSimulation: true,
    message: `✅ [SIMULADOR FISCAL] Factura Fiscal #${paddedFiscalNo} registrada (Serial: ${serialSim}).`
  };
}

/**
 * Issues an informative Reporte X (Lectura Parcial)
 */
export async function emitReporteX(fiscalConfig = {}) {
  const estado = fiscalConfig.estadoFiscal || 'MODO_PRUEBA';
  const spoolerIp = fiscalConfig.ipSpooler || '127.0.0.1:8080';

  if (estado === 'ACTIVA') {
    try {
      const payload = {
        action: 'REPORTE_X',
        puerto: fiscalConfig.puerto || 'COM1',
        baudRate: fiscalConfig.baudRate || 9600
      };
      const spoolerRes = await sendCommandToSpooler(payload, spoolerIp);
      return { ok: true, message: '✅ Reporte X emitido en la máquina fiscal.', data: spoolerRes.data };
    } catch (err) {
      throw new Error(`Error emitiendo Reporte X: ${err.message}`);
    }
  }

  const sim = getSimulatorState();
  return {
    ok: true,
    isSimulation: true,
    message: `✅ Reporte X (Lectura Parcial Informativa) generado correctamente. Serial: ${fiscalConfig.serialMaquina || sim.serialMaquina}.`
  };
}

/**
 * Issues an official Reporte Z (Cierre Fiscal Diario)
 */
export async function emitReporteZ(fiscalConfig = {}) {
  const estado = fiscalConfig.estadoFiscal || 'MODO_PRUEBA';
  const spoolerIp = fiscalConfig.ipSpooler || '127.0.0.1:8080';

  if (estado === 'ACTIVA') {
    try {
      const payload = {
        action: 'REPORTE_Z',
        puerto: fiscalConfig.puerto || 'COM1',
        baudRate: fiscalConfig.baudRate || 9600
      };
      const spoolerRes = await sendCommandToSpooler(payload, spoolerIp);
      return { ok: true, message: '✅ Reporte Z emitido en la máquina fiscal.', data: spoolerRes.data };
    } catch (err) {
      throw new Error(`Error emitiendo Reporte Z: ${err.message}`);
    }
  }

  const sim = getSimulatorState();
  sim.ultimoNroZ += 1;
  saveSimulatorState(sim);

  return {
    ok: true,
    isSimulation: true,
    nroZ: String(sim.ultimoNroZ).padStart(4, '0'),
    message: `✅ Reporte Z N° ${String(sim.ultimoNroZ).padStart(4, '0')} (Cierre Fiscal Diario) emitido con éxito.`
  };
}

/**
 * Checks connectivity and status of the fiscal printer
 */
export async function checkFiscalStatus(fiscalConfig = {}) {
  const estado = fiscalConfig.estadoFiscal || 'MODO_PRUEBA';
  const spoolerIp = fiscalConfig.ipSpooler || '127.0.0.1:8080';

  if (estado === 'DESACTIVADA') {
    return { status: 'DESACTIVADA', ready: false, message: 'Servicio fiscal desactivado en configuración.' };
  }

  if (estado === 'ACTIVA') {
    try {
      const res = await sendCommandToSpooler({ action: 'STATUS' }, spoolerIp);
      return { status: 'ONLINE', ready: true, details: res.data, message: '🟢 Máquina Fiscal en línea y lista.' };
    } catch (err) {
      return { status: 'OFFLINE', ready: false, error: err.message, message: '🔴 No se pudo conectar con la máquina fiscal en ' + spoolerIp };
    }
  }

  return {
    status: 'MODO_PRUEBA',
    ready: true,
    message: '🟡 Modo Simulación/Prueba activo. Se generarán correlativos de prueba.'
  };
}
