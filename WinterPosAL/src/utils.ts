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
  selectedSeller?: string,
  currency?: 'USD' | 'VES'
) {
  if (!ticketData) return;
  const printWindow = window.open('', '_blank', 'width=400,height=600');
  if (!printWindow) {
    alert('⚠️ El navegador bloqueó la ventana emergente de impresión. Por favor permita las ventanas emergentes (popups) para la aplicación.');
    return;
  }

  const activeCurrency: 'USD' | 'VES' = currency || companyConfig?.moneda_ticket_default || 'USD';
  const isVES = activeCurrency === 'VES';

  const totalUSD = ticketData.totalUSD || 0;
  const totalVES = ticketData.totalVES || 0;
  const tasaVenta = (totalUSD > 0 && totalVES > 0)
    ? (totalVES / totalUSD)
    : (companyConfig?.tasa_oficial_bcv || 1);

  let grossTaxable = 0;
  let grossExempt = 0;

  const itemsHtml = (ticketData.items || []).map((item: any) => {
    const isBulk = item.product?.a_granel || item.a_granel;
    const rawQty = parseFloat(item.qty || '0');
    const qtyDisplay = (isBulk || (rawQty % 1 !== 0))
      ? (rawQty % 1 === 0 ? rawQty.toString() : rawQty.toFixed(3))
      : Math.round(rawQty).toString();
    const desc = item.product?.description || item.description || 'Producto';
    const priceNumUSD = item.priceUSD ? item.priceUSD : (item.precioUSD ? item.precioUSD : 0);
    const totalNumUSD = item.totalUSD ? item.totalUSD : (priceNumUSD * rawQty);

    const isExempt = item.product?.exento_impuesto === true || item.exento_impuesto === true || (item.product?.porcentaje_impuesto !== undefined && item.product?.porcentaje_impuesto === 0);
    if (isExempt) {
      grossExempt += totalNumUSD;
    } else {
      grossTaxable += totalNumUSD;
    }

    const taxLabel = isExempt ? '(E)' : '(G)';

    let priceDisplay = '';
    let totalDisplay = '';

    if (isVES) {
      const priceNumVES = priceNumUSD * tasaVenta;
      const totalNumVES = totalNumUSD * tasaVenta;
      priceDisplay = formatBs(priceNumVES);
      totalDisplay = formatBs(totalNumVES);
    } else {
      priceDisplay = `$${priceNumUSD.toFixed(2)}`;
      totalDisplay = `$${totalNumUSD.toFixed(2)}`;
    }

    return `
      <div style="margin-bottom: 4px; padding-bottom: 2px; border-bottom: 1px dashed #eee;">
        <div style="font-weight: bold; font-size: 10px; text-transform: uppercase; word-break: break-word; line-height: 1.2;">${desc} ${taxLabel}</div>
        <div style="display: flex; justify-content: space-between; font-size: 9.5px; margin-top: 1px; padding-left: 4px;">
          <span>${qtyDisplay} x ${priceDisplay}</span>
          <span style="font-weight: bold;">${totalDisplay}</span>
        </div>
      </div>
    `;
  }).join('');

  const rawSubtotalUSD = ticketData.subtotal ?? ticketData.totalUSD ?? (grossTaxable + grossExempt);
  const discountValUSD = parseFloat(ticketData.descuento || '0');
  const discountFactor = rawSubtotalUSD > 0 ? (1 - (discountValUSD / rawSubtotalUSD)) : 1;

  const netTaxableUSD = grossTaxable * discountFactor;
  const netExemptUSD = grossExempt * discountFactor;

  const baseImponibleUSD = netTaxableUSD > 0 ? netTaxableUSD / 1.16 : 0;
  const ivaCalculadoUSD = netTaxableUSD > 0 ? netTaxableUSD - baseImponibleUSD : 0;

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

  const totalsHtml = isVES ? `
    <div class="text-right">
      <div class="row-flex">
        <span>SUBTOTAL VES:</span>
        <span>${formatBs(rawSubtotalUSD * tasaVenta)}</span>
      </div>
      ${discountValUSD > 0 ? `
        <div class="row-flex">
          <span>DESCUENTO:</span>
          <span>-${formatBs(discountValUSD * tasaVenta)}</span>
        </div>
      ` : ''}
      ${grossTaxable > 0 ? `
        <div class="row-flex">
          <span>BASE IMPONIBLE (G 16%):</span>
          <span>${formatBs(baseImponibleUSD * tasaVenta)}</span>
        </div>
        <div class="row-flex">
          <span>IVA (16%):</span>
          <span>${formatBs(ivaCalculadoUSD * tasaVenta)}</span>
        </div>
      ` : ''}
      ${netExemptUSD > 0 ? `
        <div class="row-flex">
          <span>MONTO EXENTO (E):</span>
          <span>${formatBs(netExemptUSD * tasaVenta)}</span>
        </div>
      ` : ''}
      <div class="bold row-flex" style="font-size: 12px; margin-top: 3px; border-top: 1.5px solid #000; padding-top: 3px;">
        <span>TOTAL VES:</span>
        <span>${formatBs(totalVES || (rawSubtotalUSD * tasaVenta))}</span>
      </div>
      <div class="row-flex" style="margin-top: 2px; font-size: 9px; color: #444; border-top: 1px dashed #ccc; padding-top: 2px;">
        <span>REF TOTAL USD:</span>
        <span>$${totalUSD.toFixed(2)} (Tasa: ${formatBs(tasaVenta)})</span>
      </div>
    </div>
  ` : `
    <div class="text-right">
      <div class="row-flex">
        <span>SUBTOTAL USD:</span>
        <span>$${rawSubtotalUSD.toFixed(2)}</span>
      </div>
      ${discountValUSD > 0 ? `
        <div class="row-flex">
          <span>DESCUENTO:</span>
          <span>-$${discountValUSD.toFixed(2)}</span>
        </div>
      ` : ''}
      ${grossTaxable > 0 ? `
        <div class="row-flex">
          <span>BASE IMPONIBLE (G 16%):</span>
          <span>$${baseImponibleUSD.toFixed(2)}</span>
        </div>
        <div class="row-flex">
          <span>IVA (16%):</span>
          <span>$${ivaCalculadoUSD.toFixed(2)}</span>
        </div>
      ` : ''}
      ${netExemptUSD > 0 ? `
        <div class="row-flex">
          <span>MONTO EXENTO (E):</span>
          <span>$${netExemptUSD.toFixed(2)}</span>
        </div>
      ` : ''}
      <div class="bold row-flex" style="font-size: 12px; margin-top: 3px; border-top: 1.5px solid #000; padding-top: 3px;">
        <span>TOTAL USD:</span>
        <span>$${totalUSD.toFixed(2)}</span>
      </div>
      <div class="bold row-flex" style="margin-top: 2px;">
        <span>TOTAL VES:</span>
        <span>${formatBs(totalVES || 0)}</span>
      </div>
    </div>
  `;

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
            font-size: 10px;
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

        ${ticketData.tipo_documento === 'NOTA_ENTREGA' ? `
          <div class="text-center bold" style="font-size: 11px; background: #eee; padding: 2px 0; margin-bottom: 3px;">
            NOTA DE ENTREGA / CONTROL INTERNO
          </div>
          <div class="text-center" style="font-size: 8px; margin-bottom: 4px;">(DOCUMENTO NO FISCAL - USO ADMINISTRATIVO)</div>
        ` : `
          <div class="text-center bold" style="font-size: 11px; background: #e2fbe8; padding: 2px 0; margin-bottom: 3px;">
            COMPROBANTE DE VENTA FISCAL
          </div>
          ${ticketData.nro_fiscal ? `<div class="bold">FACTURA FISCAL N°: ${ticketData.nro_fiscal}</div>` : ''}
          ${ticketData.serial_fiscal ? `<div>SERIAL FISCAL: ${ticketData.serial_fiscal}</div>` : ''}
        `}

        <div>CORRELATIVO POS: ${ticketData.factura_nro || 'FAC-000000'}</div>
        <div>FECHA: ${fechaStr}</div>
        <div>CAJERO: ${cashierName.toUpperCase()}</div>
        <div>VENDEDOR: ${sellerName.toUpperCase()}</div>
        <div>CLIENTE: ${clientName.toUpperCase()}</div>
        <div>ID/RIF: ${clientRif}</div>

        <div class="divider"></div>

        <div style="font-size: 9px; font-weight: bold; margin-bottom: 3px; color: #555;">
          <span>DESCRIPCIÓN / CANT x PRECIO</span>
          <span style="float: right;">TOTAL</span>
        </div>
        <div class="divider" style="margin: 2px 0 4px 0;"></div>

        <div class="items-list">
          ${itemsHtml}
        </div>

        <div class="divider"></div>

        ${totalsHtml}

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

export function printCierreTicketReport(
  cierreData: any,
  shiftSales: any[] = [],
  companyConfig: any,
  currentUser: any
) {
  if (!cierreData) return;
  const printWindow = window.open('', '_blank', 'width=450,height=700');
  if (!printWindow) {
    alert('⚠️ El navegador bloqueó la ventana de impresión. Por favor permita popups para la aplicación.');
    return;
  }

  let paperWidth = '80mm';
  try {
    const savedPrinter = localStorage.getItem('pos_printer_config');
    if (savedPrinter) {
      const cfg = JSON.parse(savedPrinter);
      if (cfg.anchoPapel) paperWidth = cfg.anchoPapel;
    }
  } catch (_) {}
  if (companyConfig?.printer_ancho_papel) {
    paperWidth = companyConfig.printer_ancho_papel;
  }

  const is58mm = paperWidth === '58mm';
  const bodyWidth = is58mm ? '54mm' : '76mm';
  const fontSize = is58mm ? '8.5px' : '10px';
  const titleSize = is58mm ? '11px' : '13px';
  const companyName = companyConfig?.nombre_empresa || 'INVERSIONES NIQUITAO 3000 C.A.';
  const companyRif = companyConfig?.rif || 'J-41132631';
  const companyPhone = companyConfig?.telefono || '0424-2042877';
  const companyAddress = companyConfig?.direccion || 'CARACAS, VENEZUELA';

  const terminal = cierreData.terminal || localStorage.getItem('pos_terminal_name') || 'CAJA_01';
  const cajero = (cierreData.usuario || currentUser?.nombre || currentUser?.usuario || 'OPERADOR').toUpperCase();
  const fechaCierre = cierreData.fechaCierre || cierreData.fecha || new Date().toLocaleString('es-VE');
  const fechaApertura = cierreData.fechaApertura || localStorage.getItem('pos_apertura_fecha') || '';

  const realUsd = typeof cierreData.realUsd === 'number' ? cierreData.realUsd : (parseFloat(cierreData.realUsd) || 0);
  const realVes = typeof cierreData.realVes === 'number' ? cierreData.realVes : (parseFloat(cierreData.realVes) || 0);
  const expectedUsd = cierreData.dineroEnCajaExpected ?? 0;
  const expectedVes = cierreData.expectedVes ?? 0;
  const diffUsd = realUsd - expectedUsd;
  const diffVes = realVes - expectedVes;

  // Filtrar facturas del turno
  const validSales = (shiftSales || []).filter((s: any) => s && s.factura_nro);

  const salesTableHtml = validSales.length === 0 
    ? '<tr><td colspan="4" style="text-align:center; padding: 4px; color: #666;">Sin transacciones en este turno</td></tr>'
    : validSales.map((s: any) => {
        const isDev = (s.factura_nro || '').startsWith('DEV-');
        const sign = isDev ? '-' : '';
        const timeStr = (s.fecha || '').substring(11, 16) || '';
        const clientShort = (s.client?.nombre || 'P. General').substring(0, 14);
        const pagosDesc = (s.pagos || []).map((p: any) => {
          if (p.metodo === 'Efectivo$') return 'Efec$';
          if (p.metodo === 'EfectivoBs') return 'EfecBs';
          if (p.metodo === 'TarjetaBs') return 'Tarj';
          if (p.metodo === 'PagoMovil') return 'PMov';
          if (p.metodo === 'Biopago') return 'Bio';
          if (p.metodo === 'CreditoCliente') return 'Cred';
          return p.metodo || '';
        }).filter(Boolean).join('+') || 'Cont';

        return `
          <tr style="${isDev ? 'color: #c00; font-weight: bold;' : ''}">
            <td style="padding: 2px 0;">${s.factura_nro} ${timeStr ? `(${timeStr})` : ''}</td>
            <td style="padding: 2px 0; text-align: left;">${clientShort}</td>
            <td style="padding: 2px 0; text-align: right;">${sign}$${Math.abs(s.totalUSD || 0).toFixed(2)}</td>
            <td style="padding: 2px 0; text-align: right; font-size: 8px;">${pagosDesc}</td>
          </tr>
        `;
      }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Cierre de Caja - ${terminal}</title>
        <meta charset="utf-8" />
        <style>
          @page {
            margin: 0;
            size: auto;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: ${fontSize};
            color: #000;
            background: #fff;
            margin: 0;
            padding: 8px 6px;
            width: ${bodyWidth};
            max-width: 100%;
            box-sizing: border-box;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider {
            border-top: 1px dashed #000;
            margin: 4px 0;
          }
          .divider-double {
            border-top: 2px solid #000;
            margin: 5px 0;
          }
          .row-flex {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
          }
          .table-sales {
            width: 100%;
            border-collapse: collapse;
            font-size: ${is58mm ? '7.5px' : '8.5px'};
            margin-top: 2px;
          }
          .table-sales th {
            border-bottom: 1px solid #000;
            padding: 2px 0;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="bold" style="font-size: ${titleSize}; text-transform: uppercase;">${companyName}</div>
          <div>RIF: ${companyRif}</div>
          <div style="font-size: 8px;">${companyAddress}</div>
          <div style="font-size: 8px;">Telf: ${companyPhone}</div>
        </div>

        <div class="divider-double"></div>
        <div class="text-center bold" style="font-size: 11px; text-transform: uppercase;">
          COMPROBANTE DE CIERRE DE CAJA
        </div>
        <div class="text-center" style="font-size: 8.5px;">(CORTE OFICIAL DE TURNO / POS)</div>
        <div class="divider"></div>

        <div class="row-flex"><span>TERMINAL / CAJA:</span><span class="bold">${terminal}</span></div>
        <div class="row-flex"><span>CAJERO / OPERADOR:</span><span class="bold">${cajero}</span></div>
        <div class="row-flex"><span>FECHA CIERRE:</span><span class="bold">${fechaCierre}</span></div>
        ${fechaApertura ? `<div class="row-flex"><span>FECHA APERTURA:</span><span>${fechaApertura}</span></div>` : ''}

        <div class="divider"></div>
        <div class="bold">FONDO DE APERTURA:</div>
        <div class="row-flex"><span>Apertura USD:</span><span class="bold">$${(cierreData.aperturaUsd || 0).toFixed(2)}</span></div>
        <div class="row-flex"><span>Apertura VES:</span><span class="bold">Bs ${formatBs(cierreData.aperturaVes || 0)}</span></div>

        <div class="divider"></div>
        <div class="bold">RESUMEN DE VENTAS:</div>
        <div class="row-flex"><span>Total Facturas:</span><span class="bold">${validSales.length}</span></div>
        <div class="row-flex"><span>Venta Bruta ($):</span><span>$${(cierreData.ventaBrutaUsd || 0).toFixed(2)}</span></div>
        ${(cierreData.descuentosUsd || 0) > 0 ? `<div class="row-flex"><span>Descuentos ($):</span><span>-$${(cierreData.descuentosUsd || 0).toFixed(2)}</span></div>` : ''}
        ${(cierreData.devolucionVentasUsd || 0) > 0 ? `<div class="row-flex"><span>Devoluciones ($):</span><span>-$${(cierreData.devolucionVentasUsd || 0).toFixed(2)}</span></div>` : ''}
        ${(cierreData.devolucionVentasVes || 0) > 0 ? `<div class="row-flex"><span>Devoluciones (Bs):</span><span>-Bs ${formatBs(cierreData.devolucionVentasVes || 0)}</span></div>` : ''}
        <div class="row-flex bold" style="font-size: 11px; margin-top: 2px;">
          <span>VENTA NETA USD:</span>
          <span>$${(cierreData.ventaTotalUsd || 0).toFixed(2)}</span>
        </div>

        <div class="divider"></div>
        <div class="bold">DESGLOSE POR FORMA DE PAGO:</div>
        <div class="row-flex"><span>Efectivo USD:</span><span>$${(cierreData.pagosEfectivoUsd || 0).toFixed(2)}</span></div>
        <div class="row-flex"><span>Efectivo Bs:</span><span>Bs ${formatBs(cierreData.pagosEfectivoBsVes || 0)}</span></div>
        <div class="row-flex"><span>Punto / Débito Bs:</span><span>Bs ${formatBs(cierreData.pagosPuntoVes || 0)}</span></div>
        <div class="row-flex"><span>Pago Móvil Bs:</span><span>Bs ${formatBs(cierreData.pagosPagoMovilVes || 0)}</span></div>
        <div class="row-flex"><span>Biopago Bs:</span><span>Bs ${formatBs(cierreData.pagosBiopagoVes || 0)}</span></div>
        ${(cierreData.pagosTarjetaUsd || 0) > 0 ? `<div class="row-flex"><span>Tarjeta USD:</span><span>$${(cierreData.pagosTarjetaUsd || 0).toFixed(2)}</span></div>` : ''}
        ${(cierreData.pagosCreditoUsd || 0) > 0 ? `<div class="row-flex"><span>A Crédito:</span><span>$${(cierreData.pagosCreditoUsd || 0).toFixed(2)}</span></div>` : ''}

        <div class="divider"></div>
        <div class="bold">MOVIMIENTOS DE EFECTIVO:</div>
        ${(cierreData.entradaEfectivoUsd || 0) > 0 ? `<div class="row-flex"><span>+ Entradas ($):</span><span>+$${(cierreData.entradaEfectivoUsd || 0).toFixed(2)}</span></div>` : ''}
        ${(cierreData.entradaEfectivoVes || 0) > 0 ? `<div class="row-flex"><span>+ Entradas (Bs):</span><span>+Bs ${formatBs(cierreData.entradaEfectivoVes || 0)}</span></div>` : ''}
        ${(cierreData.salidaEfectivoUsd || 0) > 0 ? `<div class="row-flex"><span>- Salidas ($):</span><span>-$${(cierreData.salidaEfectivoUsd || 0).toFixed(2)}</span></div>` : ''}
        ${(cierreData.salidaEfectivoVes || 0) > 0 ? `<div class="row-flex"><span>- Salidas (Bs):</span><span>-Bs ${formatBs(cierreData.salidaEfectivoVes || 0)}</span></div>` : ''}
        ${(cierreData.vueltosEntregadosUsd || 0) > 0 ? `<div class="row-flex"><span>- Vueltos ($):</span><span>-$${(cierreData.vueltosEntregadosUsd || 0).toFixed(2)}</span></div>` : ''}
        ${(cierreData.vueltosEntregadosVes || 0) > 0 ? `<div class="row-flex"><span>- Vueltos (Bs):</span><span>-Bs ${formatBs(cierreData.vueltosEntregadosVes || 0)}</span></div>` : ''}

        <div class="divider"></div>
        <div class="bold">ARQUEO FÍSICO Y AUDITORÍA:</div>
        <div class="row-flex"><span>Gaveta Esperada ($):</span><span>$${expectedUsd.toFixed(2)}</span></div>
        <div class="row-flex"><span>Físico Recibido ($):</span><span class="bold">$${realUsd.toFixed(2)}</span></div>
        <div class="row-flex bold">
          <span>Diferencia USD:</span>
          <span>${diffUsd >= 0 ? '+' : ''}$${diffUsd.toFixed(2)} (${diffUsd === 0 ? 'CUADRADA' : diffUsd > 0 ? 'SOBRANTE' : 'FALTANTE'})</span>
        </div>

        <div class="row-flex" style="margin-top: 3px;"><span>Gaveta Esperada (Bs):</span><span>Bs ${formatBs(expectedVes)}</span></div>
        <div class="row-flex"><span>Físico Recibido (Bs):</span><span class="bold">Bs ${formatBs(realVes)}</span></div>
        <div class="row-flex bold">
          <span>Diferencia Bs:</span>
          <span>${diffVes >= 0 ? '+' : ''}Bs ${formatBs(diffVes)} (${diffVes === 0 ? 'CUADRADA' : diffVes > 0 ? 'SOBRANTE' : 'FALTANTE'})</span>
        </div>

        <div class="divider"></div>
        <div class="bold" style="margin-bottom: 2px;">DETALLE DE TRANSACCIONES (${validSales.length}):</div>
        <table class="table-sales">
          <thead>
            <tr>
              <th style="text-align: left;">DOC</th>
              <th style="text-align: left;">CLIENTE</th>
              <th style="text-align: right;">USD</th>
              <th style="text-align: right;">PAGO</th>
            </tr>
          </thead>
          <tbody>
            ${salesTableHtml}
          </tbody>
        </table>

        ${(cierreData.utilidadUsd || 0) !== 0 ? `
          <div class="divider"></div>
          <div class="row-flex bold" style="font-size: 10px;">
            <span>UTILIDAD NETA TOTAL:</span>
            <span>$${(cierreData.utilidadUsd || 0).toFixed(2)}</span>
          </div>
        ` : ''}

        <div class="divider-double"></div>
        <div style="margin-top: 25px; text-align: center;">
          <div style="border-top: 1px solid #000; width: 75%; margin: 0 auto; padding-top: 2px;">
            Firma Cajero / Operador
          </div>
          <div style="font-size: 8px; margin-top: 1px;">${cajero}</div>
        </div>

        <div style="margin-top: 20px; text-align: center;">
          <div style="border-top: 1px solid #000; width: 75%; margin: 0 auto; padding-top: 2px;">
            Firma Supervisor / Administración
          </div>
        </div>

        <div class="text-center" style="font-size: 7.5px; margin-top: 12px; color: #444;">
          WINTERPOS CLOUD - CONTROL INMUTABLE DE CIERRE
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 800);
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

export function getApiBaseUrl(): string {
  const browserHost = window.location.hostname;
  const isLocalHost = browserHost === 'localhost' || browserHost === '127.0.0.1';
  const savedIp = localStorage.getItem('pos_lan_ip');
  const dbMode = localStorage.getItem('pos_db_mode') || (isLocalHost ? 'local' : 'remote');

  if (dbMode === 'remote' && savedIp) {
    return `http://${savedIp}:5000/api`;
  }
  
  const host = isLocalHost ? 'localhost' : browserHost;
  return `http://${host}:5000/api`;
}

export function formatImageUrl(url: string | undefined | null): string {
  if (!url || !url.trim()) return '';
  const trimmed = url.trim();
  if (
    trimmed.startsWith('http://') || 
    trimmed.startsWith('https://') || 
    trimmed.startsWith('data:') || 
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (cleanPath.startsWith('/api/')) {
    return `${getApiBaseUrl()}${cleanPath.substring(4)}`;
  }
  return `${getApiBaseUrl()}/ai/images${cleanPath}`;
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

export const formatStockVal = (val: any, aGranel?: boolean): string => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0';
  if (!aGranel) return Math.round(num).toString();

  const isNegative = num < 0;
  const abs = Math.abs(num);
  const kg = Math.floor(abs);
  const gr = Math.round((abs - kg) * 1000);

  const parts: string[] = [];
  if (kg > 0) parts.push(`${kg} Kg`);
  if (gr > 0) parts.push(`${gr} Gr`);
  if (parts.length === 0) parts.push('0 Kg');

  const formatted = parts.join(' ');
  return isNegative ? `-${formatted}` : formatted;
};


