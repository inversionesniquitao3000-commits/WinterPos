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
