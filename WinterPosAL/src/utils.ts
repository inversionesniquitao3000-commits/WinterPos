function numberToWordsEs(n: number): string {
  const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const tens = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  
  if (n === 0) return 'CERO';
  if (n < 10) return units[n];
  if (n >= 10 && n < 20) return teens[n - 10];
  
  const unitDigit = n % 10;
  const tenDigit = Math.floor(n / 10) % 10;
  const hundredDigit = Math.floor(n / 100) % 10;
  const thousandDigit = Math.floor(n / 1000);
  
  let words = '';
  
  if (thousandDigit > 0) {
    if (thousandDigit === 1) {
      words += 'MIL ';
    } else {
      words += numberToWordsEs(thousandDigit) + ' MIL ';
    }
  }
  
  if (hundredDigit > 0) {
    if (hundredDigit === 1) {
      words += (tenDigit === 0 && unitDigit === 0) ? 'CIEN ' : 'CIENTO ';
    } else if (hundredDigit === 5) {
      words += 'QUINIENTOS ';
    } else if (hundredDigit === 7) {
      words += 'SETECIENTOS ';
    } else if (hundredDigit === 9) {
      words += 'NOVECIENTOS ';
    } else {
      words += units[hundredDigit] + 'CIENTOS ';
    }
  }
  
  if (tenDigit > 0) {
    if (tenDigit === 2) {
      words += unitDigit === 0 ? 'VEINTE ' : 'VEINTI' + units[unitDigit] + ' ';
    } else {
      words += tens[tenDigit] + (unitDigit > 0 ? ' Y ' + units[unitDigit] : '') + ' ';
    }
  } else if (unitDigit > 0) {
    words += units[unitDigit] + ' ';
  }
  
  return words.trim();
}

export function formatNumberToWordsUSD(amount: number): string {
  const integerPart = Math.floor(amount);
  const centsPart = Math.round((amount - integerPart) * 100);
  
  const integerWords = numberToWordsEs(integerPart) || 'CERO';
  const centsFormatted = centsPart.toString().padStart(2, '0') + '/100';
  
  return `${integerWords} CON ${centsFormatted} DOLARES`;
}

/**
 * Formatea un monto numérico a formato estándar de Bolívares (VES / Bs):
 * - Separador de miles: punto (.)
 * - Separador de decimales: coma (,)
 * Ejemplo: 2236.22 -> "Bs 2.236,22" o "2.236,22"
 */
export function formatBs(amount: number | string | null | undefined, includeSymbol: boolean = true): string {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  if (isNaN(num)) return includeSymbol ? 'Bs 0,00' : '0,00';
  
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const fixed = absNum.toFixed(2);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatted = parts.join(',');
  const sign = isNegative ? '-' : '';
  
  return includeSymbol ? `${sign}Bs ${formatted}` : `${sign}${formatted}`;
}

/**
 * Formatea un monto numérico a formato estándar de Dólares (USD):
 * - Separador de miles: coma (,)
 * - Separador de decimales: punto (.)
 * Ejemplo: 2236.22 -> "$2,236.22" o "2,236.22"
 */
export function formatUSD(amount: number | string | null | undefined, includeSymbol: boolean = true): string {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  if (isNaN(num)) return includeSymbol ? '$0.00' : '0.00';
  
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const fixed = absNum.toFixed(2);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = parts.join('.');
  const sign = isNegative ? '-' : '';
  
  return includeSymbol ? `${sign}$${formatted}` : `${sign}${formatted}`;
}

export function getLocalDateStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function printTicketReceipt(
  ticketData: any,
  companyConfig: any,
  currentUser: any,
  selectedSeller?: string
) {
  if (!ticketData) return;
  const printWindow = window.open('', '_blank', 'width=400,height=600');
  if (!printWindow) {
    alert('⚠️ El navegador bloqueó la ventana emergente de impresión. Por favor permita las ventanas emergentes (popups) para la aplicación.');
    return;
  }

  let grossTaxable = 0;
  let grossExempt = 0;

  const itemsHtml = (ticketData.items || []).map((item: any) => {
    const isBulk = item.product?.a_granel || item.a_granel;
    const rawQty = parseFloat(item.qty || '0');
    const qtyDisplay = (isBulk || (rawQty % 1 !== 0))
      ? (rawQty % 1 === 0 ? rawQty.toString() : rawQty.toFixed(3))
      : Math.round(rawQty).toString();
    const desc = item.product?.description || item.description || 'Producto';
    const priceNum = item.priceUSD ? item.priceUSD : (item.precioUSD ? item.precioUSD : 0);
    const totalNum = item.totalUSD ? item.totalUSD : (priceNum * rawQty);
    const price = priceNum.toFixed(2);
    const total = totalNum.toFixed(2);

    const isExempt = item.product?.exento_impuesto === true || item.exento_impuesto === true || (item.product?.porcentaje_impuesto !== undefined && item.product?.porcentaje_impuesto === 0);
    if (isExempt) {
      grossExempt += totalNum;
    } else {
      grossTaxable += totalNum;
    }

    const taxLabel = isExempt ? '(E)' : '(G)';

    return `
      <tr>
        <td style="text-align: left; padding: 2px 0; word-break: break-word; font-size: 10px;">${desc} ${taxLabel}</td>
        <td style="text-align: center; padding: 2px 0; font-size: 10px;">${qtyDisplay}</td>
        <td style="text-align: right; padding: 2px 0; font-size: 10px;">$${price}</td>
        <td style="text-align: right; padding: 2px 0; font-size: 10px;">$${total}</td>
      </tr>
    `;
  }).join('');

  const rawSubtotal = ticketData.subtotal ?? ticketData.totalUSD ?? (grossTaxable + grossExempt);
  const discountVal = parseFloat(ticketData.descuento || '0');
  const discountFactor = rawSubtotal > 0 ? (1 - (discountVal / rawSubtotal)) : 1;

  const netTaxable = grossTaxable * discountFactor;
  const netExempt = grossExempt * discountFactor;

  const baseImponible = netTaxable > 0 ? netTaxable / 1.16 : 0;
  const ivaCalculado = netTaxable > 0 ? netTaxable - baseImponible : 0;

  const pagosHtml = (ticketData.pagos || []).map((p: any) => {
    const bankStr = p.bancoEmisor || p.banco ? ` (${p.bancoEmisor || p.banco})` : '';
    const refStr = p.reference || p.referencia ? ` Ref:${p.reference || p.referencia}` : '';
    const amountStr = (p.metodo.endsWith('$') || p.metodo.includes('Credito'))
      ? `$${p.monto.toFixed(2)}`
      : formatBs(p.montoVES || p.monto);
    return `
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <span>${p.metodo}${bankStr}${refStr}:</span>
        <span>${amountStr}</span>
      </div>
    `;
  }).join('');

  const clientName = ticketData.client?.nombre || ticketData.cliente_nombre || 'PUBLICO GENERAL';
  const clientRif = ticketData.client?.cedula_rif || ticketData.cliente_cedula || 'V-00000000';
  const cashierName = typeof currentUser === 'string' ? currentUser : (currentUser?.nombre || 'CAJERO');
  const sellerName = selectedSeller || ticketData.vendedor || cashierName;
  const fechaStr = ticketData.fecha || `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Ticket ${ticketData.factura_nro || ''}</title>
        <meta charset="utf-8" />
        <style>
          @page {
            margin: 0;
            size: auto;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 10.5px;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 8px 10px;
            width: 78mm;
            box-sizing: border-box;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider {
            border-top: 1px dashed #000;
            margin: 5px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
          }
          th {
            border-bottom: 1px solid #000;
            padding: 2px 0;
          }
          .row-flex {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
          }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="bold" style="font-size: 12px; text-transform: uppercase;">${companyConfig?.nombre_comercio || 'COMERCIO'}</div>
          <div>RIF: ${companyConfig?.rif || ''}</div>
          <div>${companyConfig?.direccion || ''}</div>
          <div>Telf: ${companyConfig?.telefono || ''}</div>
        </div>

        <div class="divider"></div>

        <div>FACTURA: ${ticketData.factura_nro || 'FAC-000000'}</div>
        <div>FECHA: ${fechaStr}</div>
        <div>CAJERO: ${cashierName.toUpperCase()}</div>
        <div>VENDEDOR: ${sellerName.toUpperCase()}</div>
        <div>CLIENTE: ${clientName.toUpperCase()}</div>
        <div>ID/RIF: ${clientRif}</div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr>
              <th style="text-align: left; width: 45%;">CONCEPTO</th>
              <th style="text-align: center; width: 15%;">CT</th>
              <th style="text-align: right; width: 20%;">P.UN</th>
              <th style="text-align: right; width: 20%;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="divider"></div>

        <div class="text-right">
          <div class="row-flex">
            <span>SUBTOTAL USD:</span>
            <span>$${rawSubtotal.toFixed(2)}</span>
          </div>
          ${discountVal > 0 ? `
            <div class="row-flex">
              <span>DESCUENTO:</span>
              <span>-$${discountVal.toFixed(2)}</span>
            </div>
          ` : ''}
          ${grossTaxable > 0 ? `
            <div class="row-flex">
              <span>BASE IMPONIBLE (G 16%):</span>
              <span>$${baseImponible.toFixed(2)}</span>
            </div>
            <div class="row-flex">
              <span>IVA (16%):</span>
              <span>$${ivaCalculado.toFixed(2)}</span>
            </div>
          ` : ''}
          ${netExempt > 0 ? `
            <div class="row-flex">
              <span>MONTO EXENTO (E):</span>
              <span>$${netExempt.toFixed(2)}</span>
            </div>
          ` : ''}
          <div class="bold row-flex" style="font-size: 11.5px; margin-top: 3px; border-top: 1px solid #000; padding-top: 2px;">
            <span>TOTAL USD:</span>
            <span>$${(ticketData.totalUSD || 0).toFixed(2)}</span>
          </div>
          <div class="bold row-flex" style="margin-top: 2px;">
            <span>TOTAL VES:</span>
            <span>${formatBs(ticketData.totalVES || 0)}</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="bold" style="margin-bottom: 3px;">MEDIOS DE PAGO LIQUIDADOS:</div>
        ${pagosHtml}

        ${ticketData.vueltoVES > 0 ? `
          <div class="bold row-flex" style="margin-top: 3px; border-top: 1px dashed #000; padding-top: 2px;">
            <span>CAMBIO ENTREGADO VES:</span>
            <span>${formatBs(ticketData.vueltoVES)}</span>
          </div>
        ` : ''}

        <div class="divider"></div>

        <div class="text-center" style="font-size: 8.5px; font-style: italic; margin-top: 4px;">
          ${companyConfig?.mensaje_pie_ticket || '¡Gracias por su compra!'}
        </div>

        <div class="text-center" style="font-size: 7px; margin-top: 3px; color: #555;">
          WINTERPOS - COMPROBANTE DIGITAL DE CAJA
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 600);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

// ==========================================
// SHARED API HELPER FUNCTIONS
// ==========================================

function getApiBaseUrl(): string {
  const browserHost = window.location.hostname;
  const isRemoteAccess = browserHost !== 'localhost' && browserHost !== '127.0.0.1';
  const lanIP = localStorage.getItem('pos_lan_ip') || '192.168.1.100';
  const dbMode = localStorage.getItem('pos_db_mode') || 'local';
  const host = isRemoteAccess ? browserHost : (dbMode === 'local' ? 'localhost' : lanIP);
  return `http://${host}:5000/api`;
}

export function getLocalISODateString(d: any = new Date()): string {
  if (!d) return '';
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (!trimmed) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{4}-\d{2}-\d{2}[\sT]+\d{2}:\d{2}/.test(trimmed) && !trimmed.includes('Z') && !trimmed.includes('+')) {
      return trimmed.replace('T', ' ').substring(0, 16);
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) d = parsed;
    else return trimmed.replace('T', ' ').substring(0, 16);
  }
  const dateObj = d as Date;
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
}

export async function fetchApiData(path: string): Promise<any> {
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`);
    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errData.message || errData.error || `HTTP ${res.status}`);
  } catch (err: any) {
    console.error(`[API GET] Error en ${path}:`, err.message);
    throw err;
  }
}

export async function postApiData(path: string, body: any): Promise<any> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function deleteApiData(path: string): Promise<any> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, { method: 'DELETE' });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errData.message || errData.error || `HTTP ${res.status}`);
  }
  return await res.json().catch(() => ({ success: true }));
}

