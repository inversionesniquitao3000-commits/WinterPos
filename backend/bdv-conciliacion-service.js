// WinterPos - Banco de Venezuela (BDV) Conciliación de Pago Móvil Service
// Parses BDV bank statements, SMS notifications, and validates transactions

/**
 * Safely parses dates including DD/MM/YYYY into a valid Date object
 */
export function parseDateSafe(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? new Date() : dateStr;
  const s = String(dateStr).trim();
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return new Date(`${y}-${mo}-${d}T12:00:00`);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Normalizes a Venezuelan reference number (extracts digits or clean identifier)
 */
export function normalizeReference(ref) {
  if (!ref) return '';
  const clean = String(ref).trim().replace(/[^a-zA-Z0-9]/g, '');
  return clean;
}

/**
 * Parses raw text copied or exported from BDV en Línea, CSV, or tab-delimited
 * Typical BDV columns: Fecha | Referencia | Descripción / Concepto | Monto / Importe | Saldo
 */
export function parseBdvStatementText(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const movements = [];

  for (const line of lines) {
    // Ignore header rows
    if (/fecha.*referencia|concepto.*importe|movimientos.*cuenta/i.test(line)) continue;

    let parts = [];
    if (line.includes('\t')) {
      parts = line.split('\t');
    } else if (line.includes(';')) {
      parts = line.split(';');
    } else if (/\s{2,}/.test(line)) {
      parts = line.split(/\s{2,}/);
    } else {
      parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    }
    parts = parts.map(p => p.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
    if (parts.length < 2) continue;

    let detectedRef = '';
    let detectedAmount = 0;
    let detectedDate = '';
    let detectedDesc = '';

    for (const part of parts) {
      // 1. Check for date (DD/MM/YYYY or YYYY-MM-DD)
      const dateMatch = part.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/);
      if (dateMatch && !detectedDate) {
        detectedDate = dateMatch[1];
        continue;
      }

      // 2. Check for amount:
      // Must contain decimals (e.g. 1.250,50 or 1250,50 or 1250.50)
      const cleanNumStr = part.replace(/\+/g, '').trim();
      if (/^[\-]?\d{1,3}(\.\d{3})*,\d{2}$/.test(cleanNumStr)) {
        // Format: 1.250,50
        const num = parseFloat(cleanNumStr.replace(/\./g, '').replace(',', '.'));
        if (!isNaN(num) && num > 0 && !detectedAmount) {
          detectedAmount = num;
          continue;
        }
      } else if (/^[\-]?\d+,\d{2}$/.test(cleanNumStr)) {
        // Format: 1250,50
        const num = parseFloat(cleanNumStr.replace(',', '.'));
        if (!isNaN(num) && num > 0 && !detectedAmount) {
          detectedAmount = num;
          continue;
        }
      } else if (/^[\-]?\d+\.\d{2}$/.test(cleanNumStr)) {
        // Format: 1250.50
        const num = parseFloat(cleanNumStr);
        if (!isNaN(num) && num > 0 && !detectedAmount) {
          detectedAmount = num;
          continue;
        }
      }

      // 3. Check for reference number (pure digits 4 to 14 without decimal separators)
      if (/^\d{4,14}$/.test(part) && !detectedRef) {
        detectedRef = part;
        continue;
      }

      // 4. Accumulate description
      if (part.length > 2 && !detectedDesc) {
        detectedDesc = part;
      }
    }

    // Secondary pass: Extract reference from description if needed
    if (!detectedRef && detectedDesc) {
      const refInDesc = detectedDesc.match(/(?:ref|referencia|operaci[oó]n|op)[\s\:\#]*([0-9]{4,12})/i);
      if (refInDesc) {
        detectedRef = refInDesc[1];
      }
    }

    if (detectedAmount > 0) {
      // Extract phone if present
      const phoneMatch = (detectedDesc || line).match(/\b(0412|0414|0424|0416|0426)\d{7}\b/);
      const telefono = phoneMatch ? phoneMatch[0] : '';

      movements.push({
        fecha: detectedDate || new Date().toISOString().split('T')[0],
        referencia: detectedRef || (parts[1] ? normalizeReference(parts[1]) : ''),
        monto_ves: detectedAmount,
        descripcion: detectedDesc || line.substring(0, 100),
        telefono_origen: telefono
      });
    }
  }

  return movements;
}

/**
 * Parses an incoming SMS notification from BDV (2661 / 2662)
 * Examples:
 * "BDV informa: Pago Movil recibido de 04123456789 por Bs. 1.450,00 Ref: 894512 el 20/09/2026 14:30"
 * "BDV enlinea: Credito inmediato por Pago Movil P2P Bs 500,00 Ref 123456"
 */
export function parseBdvSmsNotification(smsText) {
  if (!smsText || typeof smsText !== 'string') return null;

  const cleanText = smsText.trim();
  const isBdv = /bdv|banco de venezuela|2661|2662/i.test(cleanText);
  const isPagoMovil = /pago m[oó]vil|c2p|p2p|p2c|cr[eé]dito inmediato/i.test(cleanText);

  // Amount extraction (e.g. Bs. 1.250,50 or Bs 500,00 or Bs. 450.00)
  const amountMatch = cleanText.match(/bs[\.\s]*([\d\.\,]+)/i);
  let amount = 0;
  if (amountMatch) {
    const rawAmt = amountMatch[1].trim();
    if (rawAmt.includes(',')) {
      amount = parseFloat(rawAmt.replace(/\./g, '').replace(',', '.'));
    } else {
      amount = parseFloat(rawAmt);
    }
  }

  // Reference extraction (e.g. Ref: 123456, Ref. 1234, Referencia 987654)
  const refMatch = cleanText.match(/(?:ref|referencia|operaci[oó]n|op)[\s\:\.\#]*([0-9]{4,14})/i);
  const referencia = refMatch ? refMatch[1] : '';

  // Phone extraction (0412, 0414, 0424, 0416, 0426)
  const phoneMatch = cleanText.match(/\b(0412|0414|0424|0416|0426)\d{7}\b/);
  const telefono = phoneMatch ? phoneMatch[0] : '';

  if (amount > 0 && referencia) {
    return {
      success: true,
      banco: 'Banco de Venezuela',
      referencia,
      monto_ves: amount,
      telefono_origen: telefono,
      descripcion: cleanText.substring(0, 200),
      fecha: new Date().toISOString()
    };
  }

  return null;
}

/**
 * Matches a single sale reference and amount against registered bank movements
 */
export function matchPaymentWithMovements(saleRef, saleAmountVES, bankMovements = []) {
  if (!saleRef || !saleAmountVES) return { found: false, movement: null };

  const cleanSaleRef = normalizeReference(saleRef);
  const targetAmt = parseFloat(saleAmountVES);

  for (const mov of bankMovements) {
    const cleanBankRef = normalizeReference(mov.referencia);
    const movAmt = parseFloat(mov.monto_ves);

    // Amount match within 0.05 tolerance
    const amtMatches = Math.abs(targetAmt - movAmt) <= 0.05;

    // Reference match: exact, or bank reference ends with sale reference (e.g. 894512 ends with 4512)
    const refMatches = cleanBankRef === cleanSaleRef ||
      (cleanSaleRef.length >= 4 && cleanBankRef.endsWith(cleanSaleRef)) ||
      (cleanBankRef.length >= 4 && cleanSaleRef.endsWith(cleanBankRef));

    if (amtMatches && refMatches) {
      return { found: true, movement: mov };
    }
  }

  return { found: false, movement: null };
}

// -------------------------------------------------------------
// SERVICIO OFICIAL API BANCO DE VENEZUELA (BDV) - CONCILIACIÓN
// -------------------------------------------------------------

export const BANCOS_VENEZUELA = [
  { codigo: '0102', nombre: 'Banco de Venezuela (BDV)' },
  { codigo: '0134', nombre: 'Banesco Banco Universal' },
  { codigo: '0105', nombre: 'Banco Mercantil' },
  { codigo: '0108', nombre: 'Banco Provincial (BBVA)' },
  { codigo: '0172', nombre: 'Bancamiga Banco Universal' },
  { codigo: '0114', nombre: 'Bancaribe' },
  { codigo: '0115', nombre: 'Banco Exterior' },
  { codigo: '0163', nombre: 'Banco del Tesoro' },
  { codigo: '0175', nombre: 'Banco Bicentenario' },
  { codigo: '0191', nombre: 'Banco Nacional de Crédito (BNC)' },
  { codigo: '0128', nombre: 'Banco Caroní' },
  { codigo: '0137', nombre: 'Banco Sofitasa' },
  { codigo: '0138', nombre: 'Banco Plaza' },
  { codigo: '0151', nombre: 'BFC Banco Fondo Común' },
  { codigo: '0156', nombre: '100% Banco' },
  { codigo: '0157', nombre: 'DelSur Banco Universal' },
  { codigo: '0166', nombre: 'Banco Agrícola de Venezuela' },
  { codigo: '0168', nombre: 'Bancrecer' },
  { codigo: '0169', nombre: 'Mi Banco' },
  { codigo: '0171', nombre: 'Banco Activo' },
  { codigo: '0174', nombre: 'Banplus' },
  { codigo: '0177', nombre: 'BANFANB' }
];

export const BDV_ENDPOINTS = {
  produccion: 'https://bdvconciliacion.banvenez.com:443/getMovement',
  calidad: 'http://200.11.243.176:444/getMovement'
};

/**
 * Normaliza la cédula del pagador según las reglas de BDV (Ej: V12345678, J123456789, E81234567)
 */
export function cleanBdvCedula(cedula) {
  if (!cedula) return '';
  let clean = String(cedula).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return '';
  // Si no tiene prefijo de nacionalidad, asumir 'V'
  if (!/^[VJEGP]/.test(clean)) {
    clean = 'V' + clean;
  }
  return clean;
}

/**
 * Normaliza número telefónico venezolano a formato estándar de 11 dígitos (Ej: 04121234567)
 */
export function cleanBdvPhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  // Si viene con prefijo internacional 58
  if (digits.startsWith('58') && digits.length >= 12) {
    digits = '0' + digits.substring(2);
  }
  // Si no empieza por 0 y tiene 10 dígitos (ej: 4121234567)
  if (!digits.startsWith('0') && digits.length === 10) {
    digits = '0' + digits;
  }
  return digits;
}

/**
 * Formatea fecha a estándar BDV estricto YYYY-MM-DD
 */
export function formatBdvDate(dateInput) {
  if (!dateInput) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof dateInput === 'string') {
    // Si ya viene YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
      return dateInput.trim();
    }
    // Si viene DD/MM/YYYY o DD-MM-YYYY
    const dmy = dateInput.trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
  }
  try {
    const dObj = new Date(dateInput);
    if (!isNaN(dObj.getTime())) {
      const y = dObj.getFullYear();
      const m = String(dObj.getMonth() + 1).padStart(2, '0');
      const d = String(dObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch (_) {}
  return new Date().toISOString().split('T')[0];
}

/**
 * Formatea monto a string estricto con dos decimales y punto (Ej: "120.00")
 */
export function formatBdvAmount(amount) {
  let num = typeof amount === 'number' ? amount : parseFloat(String(amount || 0).replace(',', '.'));
  if (isNaN(num) || num < 0) num = 0;
  return num.toFixed(2);
}

/**
 * Normaliza y limpia textos provenientes de BDV eliminando fallas de codificación (mojibake).
 * Corrige "Transacci¿¿n", "Transacciï¿½n" -> "Transacción" y otros términos bancarios.
 */
export function cleanBdvMessage(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = String(raw);
  str = str.replace(/Transacci(?:[^\w\s]|[\ufffd\?\¿])+n/gi, 'Transacción');
  str = str.replace(/Transacci\s*n/gi, 'Transacción');
  str = str.replace(/operaci(?:[^\w\s]|[\ufffd\?\¿])+n/gi, 'operación');
  str = str.replace(/conciliaci(?:[^\w\s]|[\ufffd\?\¿])+n/gi, 'conciliación');
  str = str.replace(/realizaci(?:[^\w\s]|[\ufffd\?\¿])+n/gi, 'realización');
  str = str.replace(/cr(?:[^\w\s]|[\ufffd\?\¿])+dito/gi, 'crédito');
  str = str.replace(/d(?:[^\w\s]|[\ufffd\?\¿])+bito/gi, 'débito');
  str = str.replace(/éxit[^\w\s]*osa/gi, 'exitosa');
  str = str.replace(/estatus\s*:\s*/gi, 'estatus: ');
  return str.trim();
}

/**
 * Consulta directa al API de Banco de Venezuela (getMovement)
 */
export async function consultarBdvApi({
  apiKey,
  ambiente = 'produccion',
  cedulaPagador,
  telefonoPagador,
  telefonoDestino,
  referencia,
  fechaPago,
  importe,
  bancoOrigen = '0102',
  timeoutMs = 6000
}) {
  const url = BDV_ENDPOINTS[ambiente] || BDV_ENDPOINTS.produccion;
  const cleanKey = String(apiKey || '').trim();

  if (!cleanKey) {
    return {
      success: false,
      code: 400,
      message: 'Falta configurar la API Key de Banco de Venezuela (BDV)',
      data: null
    };
  }

  const payload = {
    cedulaPagador: cleanBdvCedula(cedulaPagador),
    telefonoPagador: cleanBdvPhone(telefonoPagador),
    telefonoDestino: cleanBdvPhone(telefonoDestino),
    referencia: String(referencia || '').trim().replace(/[^0-9]/g, ''),
    fechaPago: formatBdvDate(fechaPago),
    importe: formatBdvAmount(importe),
    bancoOrigen: String(bancoOrigen || '0102').trim().padStart(4, '0')
  };

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cleanKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!response.ok && response.status !== 200) {
      const errText = await response.text().catch(() => '');
      let jsonErr = null;
      try {
        jsonErr = JSON.parse(errText);
      } catch (_) {}

      const bdvCode = jsonErr && jsonErr.code ? jsonErr.code : response.status;
      const bdvMsg = jsonErr && jsonErr.message ? jsonErr.message : `El servidor BDV respondió con código HTTP ${response.status}: ${errText.substring(0, 100)}`;

      return {
        success: false,
        code: bdvCode,
        httpStatus: response.status,
        latencyMs,
        message: cleanBdvMessage(bdvMsg),
        data: jsonErr?.data || null,
        payloadSent: payload
      };
    }

    const json = await response.json();
    const cleanMsg = cleanBdvMessage(json.message);
    const hasErrorPhrase = /no coincide|no existe|no se pudo|rechazad|error|fallid|inv[aá]lid/i.test(cleanMsg);
    const isAlreadyReconciled = !hasErrorPhrase && /conciliado anteriormente|ya fue conciliado|consulta realizada es exitosa/i.test(cleanMsg);
    const isApproved = (json.code === 1000 && !hasErrorPhrase) || isAlreadyReconciled;

    return {
      success: true,
      verified: isApproved,
      alreadyReconciled: isAlreadyReconciled,
      code: json.code,
      message: cleanMsg || (isApproved ? 'Transacción acreditada con éxito' : 'No encontrado'),
      data: json.data || null,
      latencyMs,
      payloadSent: payload,
      ambiente
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError' || /abort|timeout/i.test(err.message);
    return {
      success: false,
      isNetworkError: true,
      isTimeout,
      code: isTimeout ? 408 : 503,
      message: isTimeout
        ? 'Tiempo de espera agotado con BDV (Timeout). El servidor del banco tardó más de lo esperado.'
        : `Error de conexión con Banco de Venezuela: ${err.message || 'Sin conexión a internet'}`,
      latencyMs,
      data: null,
      payloadSent: payload
    };
  }
}

/**
 * Consulta inteligente multi-destino:
 * Si el comercio tiene múltiples teléfonos autorizados, prueba en cada uno hasta encontrar la transacción aprobada.
 */
export async function consultarBdvApiMultiDestino({
  apiKey,
  ambiente = 'produccion',
  cedulaPagador,
  telefonoPagador,
  telefonosDestino = [],
  referencia,
  fechaPago,
  importe,
  bancoOrigen = '0102',
  timeoutMs = 6000
}) {
  const phoneList = Array.isArray(telefonosDestino) ? telefonosDestino.filter(Boolean) : [telefonosDestino].filter(Boolean);

  if (phoneList.length === 0) {
    return {
      success: false,
      code: 400,
      message: 'No hay teléfonos destino del comercio configurados para recibir pagos móviles',
      data: null
    };
  }

  // Si solo hay un número, consulta directa
  if (phoneList.length === 1) {
    const singleResult = await consultarBdvApi({
      apiKey,
      ambiente,
      cedulaPagador,
      telefonoPagador,
      telefonoDestino: phoneList[0],
      referencia,
      fechaPago,
      importe,
      bancoOrigen,
      timeoutMs
    });
    return {
      ...singleResult,
      telefonoDestinoUsado: phoneList[0]
    };
  }

  // Si hay múltiples números, probar ordenadamente
  let lastResult = null;
  for (const tel of phoneList) {
    const res = await consultarBdvApi({
      apiKey,
      ambiente,
      cedulaPagador,
      telefonoPagador,
      telefonoDestino: tel,
      referencia,
      fechaPago,
      importe,
      bancoOrigen,
      timeoutMs
    });

    if (res.verified) {
      return {
        ...res,
        telefonoDestinoUsado: tel,
        matchedMultiNumber: true
      };
    }

    lastResult = { ...res, telefonoDestinoUsado: tel };

    // Si es error de red o timeout, no insistir en los demás para no demorar la caja
    if (res.isNetworkError) {
      break;
    }
  }

  return lastResult;
}
