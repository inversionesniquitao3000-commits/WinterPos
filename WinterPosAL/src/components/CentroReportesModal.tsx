import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Sale, CierreCaja, CompanyConfig } from '../types';
import { 
  BarChart3, FileText, DollarSign, PieChart, TrendingUp, ShieldAlert, 
  Calendar, Printer, FileSpreadsheet,
  Receipt, ArrowRightLeft, Building2, UserCheck
} from 'lucide-react';
import { getLocalDateStr } from '../utils';

interface CentroReportesModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: Sale[];
  cierres?: CierreCaja[];
  companyConfig: CompanyConfig | null;
  initialStartDate?: string;
  initialEndDate?: string;
  tasaDia?: number;
}

type ReportType = 
  | 'libro_ventas'
  | 'igtf_divisas'
  | 'resumen_iva_f30'
  | 'retenciones_iva'
  | 'cuadre_multimoneda'
  | 'ventas_categorias'
  | 'top_productos'
  | 'auditoria_anulaciones';

export default function CentroReportesModal({
  isOpen,
  onClose,
  sales,
  companyConfig,
  initialStartDate,
  initialEndDate,
  tasaDia = 0
}: CentroReportesModalProps) {
  const [activeTab, setActiveTab] = useState<'fiscales' | 'gestion'>('fiscales');
  const [selectedReport, setSelectedReport] = useState<ReportType>('libro_ventas');
  
  // Close modal on Escape key (Desktop & Web)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);
  
  // Date Range Filter inside Report Center
  const todayStr = getLocalDateStr();
  const [startDate, setStartDate] = useState(initialStartDate || todayStr);
  const [endDate, setEndDate] = useState(initialEndDate || todayStr);
  const [filterEnabled, setFilterEnabled] = useState(true);

  // Quick Date Selectors
  const setQuickRange = (range: 'hoy' | 'semana' | 'mes' | 'mes_ant' | 'todo') => {
    const today = new Date();
    if (range === 'hoy') {
      const s = getLocalDateStr();
      setStartDate(s);
      setEndDate(s);
      setFilterEnabled(true);
    } else if (range === 'semana') {
      const first = new Date(today.setDate(today.getDate() - today.getDay() + 1));
      const last = new Date();
      setStartDate(first.toISOString().split('T')[0]);
      setEndDate(last.toISOString().split('T')[0]);
      setFilterEnabled(true);
    } else if (range === 'mes') {
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      setStartDate(`${y}-${m}-01`);
      setEndDate(getLocalDateStr());
      setFilterEnabled(true);
    } else if (range === 'mes_ant') {
      const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      const y = prevMonthDate.getFullYear();
      const m = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
      setStartDate(`${y}-${m}-01`);
      setEndDate(lastDayPrevMonth.toISOString().split('T')[0]);
      setFilterEnabled(true);
    } else if (range === 'todo') {
      setFilterEnabled(false);
    }
  };

  // Filtered sales within the selected range
  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      if (!filterEnabled) return true;
      if (!sale.fecha) return false;
      const saleDate = sale.fecha.split(' ')[0] || sale.fecha.substring(0, 10);
      if (startDate && saleDate < startDate) return false;
      if (endDate && saleDate > endDate) return false;
      return true;
    });
  }, [sales, filterEnabled, startDate, endDate]);

  if (!isOpen) return null;

  const companyName = companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.';
  const companyRif = companyConfig?.rif || 'J-41132631-0';
  const companyAddress = companyConfig?.direccion || 'Av. Principal, Caracas, Venezuela';
  const periodText = filterEnabled ? `Período: ${startDate} al ${endDate}` : 'Período: Histórico Completo';

  // -------------------------------------------------------------
  // HELPER: IMPRESIÓN HTML EN PDF CON MEMBRETE
  // -------------------------------------------------------------
  const printReportHtml = (
    title: string, 
    tableHtml: string, 
    summaryHtml?: string, 
    orientation: 'portrait' | 'landscape' = 'portrait'
  ) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert('Por favor habilite las ventanas emergentes (popups) para ver el reporte.');
      return;
    }

    const dateStr = new Date().toLocaleString('es-VE');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>${title} - ${companyName}</title>
          <style>
            @page {
              size: ${orientation === 'landscape' ? 'landscape' : 'portrait'};
              margin: 0mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #0f172a;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              font-size: 10px;
              line-height: 1.4;
            }
            .print-page-wrapper {
              padding: ${orientation === 'landscape' ? '10mm 14mm' : '14mm 16mm'};
              width: 100%;
              box-sizing: border-box;
              margin: 0 auto;
            }
            .header-container {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2.5px solid #0f172a;
              padding-bottom: 10px;
              margin-bottom: 14px;
              width: 100%;
            }
            .header-left h1 {
              margin: 0;
              font-size: 16px;
              font-weight: 900;
              color: #0f172a;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
            .header-left p {
              margin: 3px 0 0 0;
              font-size: 10.5px;
              color: #475569;
            }
            .header-right {
              text-align: right;
              font-size: 10px;
              color: #475569;
            }
            .header-right p {
              margin: 2px 0 0 0;
            }
            .report-title-box {
              background: #f1f5f9 !important;
              border: 1.5px solid #cbd5e1;
              border-radius: 8px;
              padding: 9px 14px;
              margin-bottom: 14px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .report-title-box h2 {
              margin: 0;
              font-size: 13.5px;
              font-weight: 900;
              color: #0f172a;
              text-transform: uppercase;
              letter-spacing: 0.4px;
            }
            .report-title-box span {
              font-size: 11px;
              font-weight: 800;
              color: #1e40af;
            }
            .report-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 6px;
              margin-bottom: 16px;
              font-size: 10px;
            }
            .report-table th {
              background-color: #0f172a !important;
              color: #ffffff !important;
              border: 1px solid #0f172a;
              padding: 7px 8px;
              font-weight: 800;
              text-transform: uppercase;
              font-size: 9px;
              letter-spacing: 0.3px;
            }
            .report-table td {
              border: 1px solid #cbd5e1;
              padding: 6px 8px;
              font-size: 9.5px;
            }
            .report-table tr:nth-child(even) td {
              background-color: #f8fafc;
            }
            .text-center { text-align: center !important; }
            .text-right { text-align: right !important; }
            .font-bold { font-weight: bold; }
            .text-emerald { color: #059669 !important; font-weight: bold; }
            .text-indigo { color: #4338ca !important; font-weight: bold; }
            .text-amber { color: #d97706 !important; font-weight: bold; }
            .text-red { color: #dc2626 !important; font-weight: bold; }
            .report-summary-grid {
              display: flex;
              flex-wrap: wrap;
              gap: 14px;
              margin-top: 16px;
              page-break-inside: avoid;
            }
            .summary-card {
              flex: 1;
              min-width: 250px;
              padding: 12px 16px;
              background: #f8fafc !important;
              border: 1.5px solid #cbd5e1;
              border-radius: 8px;
            }
            .summary-card h4 {
              margin: 0 0 6px 0;
              border-bottom: 1.5px solid #cbd5e1;
              padding-bottom: 5px;
              font-size: 11px;
              font-weight: 900;
              text-transform: uppercase;
              color: #0f172a;
            }
            .summary-card p {
              margin: 0 0 4px 0;
              font-size: 10px;
              color: #1e293b;
            }
            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
              }
              .no-print {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-page-wrapper">
            <div class="header-container">
              <div class="header-left">
                <h1>${companyName}</h1>
                <p><strong>RIF:</strong> ${companyRif} &nbsp;|&nbsp; <strong>Dirección:</strong> ${companyAddress}</p>
                <p><strong>Sistema:</strong> WinterPOS Cloud Fiscal &nbsp;|&nbsp; <strong>Tasa Referencial:</strong> Bs ${tasaDia ? tasaDia.toFixed(2) : 'N/A'}</p>
              </div>
              <div class="header-right">
                <p><strong>Fecha Impresión:</strong> ${dateStr}</p>
                <p><strong>Régimen:</strong> Contribuyente Ordinario IVA</p>
                <p><strong>Estado:</strong> ${periodText}</p>
              </div>
            </div>
            
            <div class="report-title-box">
              <h2>${title}</h2>
              <span>${periodText}</span>
            </div>

            ${tableHtml}

            ${summaryHtml || ''}
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // -------------------------------------------------------------
  // 1. REPORTE: LIBRO DE VENTAS SENIAT
  // -------------------------------------------------------------
  const generateLibroVentas = (exportType: 'pdf' | 'excel') => {
    const fiscalSales = filteredSales.filter(s => s.tipo_documento === 'FACTURA_FISCAL' || !s.tipo_documento);

    let totalVentasIncIva = 0;
    let totalExento = 0;
    let totalBaseImponible = 0;
    let totalIvaDebito = 0;
    let totalIgtf = 0;

    const dataRows = fiscalSales.map((sale, idx) => {
      const isDev = (sale.factura_nro || '').startsWith('DEV-');
      const sign = isDev ? -1 : 1;

      const totalVenta = (sale.totalUSD || 0) * sign;
      const exento = (sale.exento_usd !== undefined ? sale.exento_usd : (sale.iva_usd === 0 ? sale.totalUSD : 0)) * sign;
      const base = (sale.base_imponible_usd !== undefined ? sale.base_imponible_usd : (sale.iva_usd && sale.iva_usd > 0 ? (sale.totalUSD - sale.iva_usd) : 0)) * sign;
      const iva = (sale.iva_usd || 0) * sign;
      const igtf = (sale.igtf_usd || 0) * sign;

      totalVentasIncIva += totalVenta;
      totalExento += exento;
      totalBaseImponible += base;
      totalIvaDebito += iva;
      totalIgtf += igtf;

      return {
        num: idx + 1,
        fecha: (sale.fecha || '').substring(0, 10),
        rif: sale.client?.cedula_rif || 'V-00000000',
        cliente: sale.client?.nombre || 'CLIENTE CONTADO',
        factura: sale.nro_fiscal || sale.factura_nro,
        serial: sale.serial_fiscal || 'Z3C0000000',
        z: sale.nro_z || 'Z-0001',
        totalVenta,
        exento,
        base,
        iva,
        igtf
      };
    });

    if (exportType === 'excel') {
      const wsData = [
        ['LIBRO DE VENTAS FISCAL OFICIAL (SENIAT PROVIDENCIA 0071)'],
        [`EMPRESA: ${companyName}`, `RIF: ${companyRif}`, periodText],
        [],
        ['N°', 'FECHA', 'RIF / CI', 'RAZÓN SOCIAL / NOMBRE', 'N° FACTURA', 'SERIAL FISCAL', 'N° Z', 'TOTAL VENTAS ($)', 'EXENTO ($)', 'BASE IMP. 16% ($)', 'IVA 16% ($)', 'IGTF 3% ($)'],
        ...dataRows.map(r => [
          r.num, r.fecha, r.rif, r.cliente, r.factura, r.serial, r.z,
          r.totalVenta, r.exento, r.base, r.iva, r.igtf
        ]),
        [],
        ['TOTALES:', '', '', '', '', '', '', totalVentasIncIva, totalExento, totalBaseImponible, totalIvaDebito, totalIgtf]
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'LibroVentas');
      XLSX.writeFile(wb, `Libro_Ventas_SENIAT_${startDate}_al_${endDate}.xlsx`);
      return;
    }

    // PDF HTML Print
    const rowsHtml = dataRows.map(r => `
      <tr>
        <td class="text-center">${r.num}</td>
        <td class="text-center" style="font-family: monospace;">${r.fecha}</td>
        <td style="font-family: monospace;">${r.rif}</td>
        <td style="text-transform: uppercase;">${r.cliente}</td>
        <td class="text-center font-bold" style="font-family: monospace;">${r.factura}</td>
        <td class="text-center" style="font-family: monospace;">${r.serial}</td>
        <td class="text-center" style="font-family: monospace;">${r.z}</td>
        <td class="text-right font-bold">$${r.totalVenta.toFixed(2)}</td>
        <td class="text-right">$${r.exento.toFixed(2)}</td>
        <td class="text-right font-bold">$${r.base.toFixed(2)}</td>
        <td class="text-right font-bold text-emerald">$${r.iva.toFixed(2)}</td>
        <td class="text-right">$${r.igtf.toFixed(2)}</td>
      </tr>
    `).join('');

    const tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 3%;">N°</th>
            <th style="width: 8%;">FECHA</th>
            <th style="width: 10%;">RIF / CI</th>
            <th style="width: 22%;">RAZÓN SOCIAL</th>
            <th style="width: 9%;">N° FACTURA</th>
            <th style="width: 10%;">SERIAL</th>
            <th style="width: 6%;">N° Z</th>
            <th class="text-right" style="width: 9%;">TOTAL ($)</th>
            <th class="text-right" style="width: 8%;">EXENTO ($)</th>
            <th class="text-right" style="width: 9%;">BASE 16% ($)</th>
            <th class="text-right" style="width: 8%;">IVA 16% ($)</th>
            <th class="text-right" style="width: 6%;">IGTF 3% ($)</th>
          </tr>
        </thead>
        <tbody>
          ${dataRows.length === 0 ? '<tr><td colspan="12" class="text-center" style="padding: 20px;">Sin registros fiscales en el rango.</td></tr>' : rowsHtml}
        </tbody>
        <tfoot>
          <tr style="background: #0f172a; color: #fff; font-weight: bold; font-family: monospace;">
            <td colspan="7" class="text-right" style="padding: 7px;">TOTALES GENERALES DEL LIBRO FISCAL:</td>
            <td class="text-right" style="padding: 7px;">$${totalVentasIncIva.toFixed(2)}</td>
            <td class="text-right" style="padding: 7px;">$${totalExento.toFixed(2)}</td>
            <td class="text-right" style="padding: 7px;">$${totalBaseImponible.toFixed(2)}</td>
            <td class="text-right text-emerald" style="padding: 7px; color: #4ade80;">$${totalIvaDebito.toFixed(2)}</td>
            <td class="text-right" style="padding: 7px;">$${totalIgtf.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    `;

    const summaryHtml = `
      <div class="report-summary-grid">
        <div class="summary-card">
          <h4>RESUMEN DECLARACIÓN SENIAT</h4>
          <p><strong>Comprobantes Fiscales Emitidos:</strong> ${fiscalSales.length}</p>
          <p><strong>Total Ventas Facturadas (USD):</strong> $${totalVentasIncIva.toFixed(2)} USD</p>
          <p><strong>Total Base Imponible (16%):</strong> $${totalBaseImponible.toFixed(2)} USD</p>
          <p><strong>Total Débito Fiscal IVA a Declarar:</strong> $${totalIvaDebito.toFixed(2)} USD</p>
          <p><strong>Total Ventas Exentas (0%):</strong> $${totalExento.toFixed(2)} USD</p>
        </div>
        <div class="summary-card">
          <h4>VALIDACIÓN LEGAL Y FISCAL</h4>
          <p>Documento emitido conforme a las especificaciones de la Providencia Administrativa SNAT/2011/0071 del SENIAT.</p>
          <p style="margin-top: 20px; border-top: 1px dashed #94a3b8; padding-top: 8px;">
            <strong>Firma Contador / Administrador:</strong> ___________________________
          </p>
        </div>
      </div>
    `;

    printReportHtml('LIBRO DE VENTAS FISCAL OFICIAL (SENIAT)', tableHtml, summaryHtml, 'landscape');
  };

  // -------------------------------------------------------------
  // 2. REPORTE: IGTF 3% DIVISAS
  // -------------------------------------------------------------
  const generateReportIGTF = (exportType: 'pdf' | 'excel') => {
    const igtfSales = filteredSales.filter(s => (s.igtf_usd && s.igtf_usd > 0) || (s.pagos && s.pagos.some(p => String(p.metodo || '').toUpperCase().includes('DIVISA') || String(p.metodo || '').toUpperCase().includes('EFECTIVO$') || String(p.metodo || '').toUpperCase().includes('ZELLE'))));

    let totalBaseIgtfUsd = 0;
    let totalIgtfUsd = 0;
    let totalIgtfVes = 0;

    const dataRows = igtfSales.map((s, idx) => {
      const divisasPagadasUsd = (s.pagos || [])
        .filter(p => {
          const m = String(p.metodo || '').toUpperCase();
          return m.includes('DIVISA') || m.includes('USD') || m.includes('ZELLE') || m.includes('EFECTIVO$') || m.includes('$');
        })
        .reduce((acc, p) => {
          const val = parseFloat((p as any).montoUSD ?? p.monto ?? 0) || 0;
          return acc + val;
        }, 0);

      const baseUsd = divisasPagadasUsd > 0 ? divisasPagadasUsd : (s.totalUSD || 0);
      const igtfUsd = s.igtf_usd || parseFloat((baseUsd * 0.03).toFixed(2));
      const rate = tasaDia || 1;
      const igtfVes = igtfUsd * rate;

      totalBaseIgtfUsd += baseUsd;
      totalIgtfUsd += igtfUsd;
      totalIgtfVes += igtfVes;

      return {
        num: idx + 1,
        fecha: (s.fecha || '').substring(0, 16),
        factura: s.nro_fiscal || s.factura_nro,
        cliente: s.client?.nombre || 'CLIENTE CONTADO',
        rif: s.client?.cedula_rif || 'V-00000000',
        metodo: (s.pagos || []).map(p => p.metodo).join(', ') || 'DIVISAS USD',
        baseUsd,
        tasa: rate,
        igtfUsd,
        igtfVes
      };
    });

    if (exportType === 'excel') {
      const wsData = [
        ['REPORTE DE PERCEPCIÓN DE IGTF (3% EN DIVISAS / MONEDA EXTRANJERA)'],
        [`EMPRESA: ${companyName}`, `RIF: ${companyRif}`, periodText],
        [],
        ['N°', 'FECHA', 'FACTURA', 'CLIENTE', 'RIF / CI', 'MÉTODO DE COBRO', 'BASE EN DIVISAS ($)', 'TASA BCV', 'IGTF PERCIBIDO (USD $)', 'IGTF EQUIVALENTE (BS)'],
        ...dataRows.map(r => [
          r.num, r.fecha, r.factura, r.cliente, r.rif, r.metodo,
          r.baseUsd, r.tasa, r.igtfUsd, r.igtfVes
        ]),
        [],
        ['TOTALES:', '', '', '', '', '', totalBaseIgtfUsd, '', totalIgtfUsd, totalIgtfVes]
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'IGTF_3%');
      XLSX.writeFile(wb, `Reporte_IGTF_3pct_${startDate}_al_${endDate}.xlsx`);
      return;
    }

    // PDF HTML
    const rowsHtml = dataRows.map(r => `
      <tr>
        <td class="text-center">${r.num}</td>
        <td class="text-center" style="font-family: monospace;">${r.fecha}</td>
        <td class="text-center font-bold" style="font-family: monospace;">${r.factura}</td>
        <td>${r.cliente}</td>
        <td style="font-family: monospace;">${r.rif}</td>
        <td>${r.metodo}</td>
        <td class="text-right font-bold">$${r.baseUsd.toFixed(2)}</td>
        <td class="text-center font-mono">Bs ${r.tasa.toFixed(2)}</td>
        <td class="text-right font-bold text-amber">$${r.igtfUsd.toFixed(2)}</td>
        <td class="text-right font-bold">Bs ${r.igtfVes.toFixed(2)}</td>
      </tr>
    `).join('');

    const tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 3%;">N°</th>
            <th style="width: 10%;">FECHA</th>
            <th style="width: 9%;">FACTURA</th>
            <th style="width: 20%;">CLIENTE</th>
            <th style="width: 9%;">RIF / CI</th>
            <th style="width: 15%;">MÉTODO COBRO</th>
            <th class="text-right" style="width: 10%;">BASE DIVISAS ($)</th>
            <th class="text-center" style="width: 8%;">TASA BCV</th>
            <th class="text-right" style="width: 8%;">IGTF 3% ($)</th>
            <th class="text-right" style="width: 8%;">IGTF (BS)</th>
          </tr>
        </thead>
        <tbody>
          ${dataRows.length === 0 ? '<tr><td colspan="10" class="text-center" style="padding: 20px;">No se registraron percepciones de IGTF en divisas en este período.</td></tr>' : rowsHtml}
        </tbody>
        <tfoot>
          <tr style="background: #0f172a; color: #fff; font-weight: bold; font-family: monospace;">
            <td colspan="6" class="text-right" style="padding: 7px;">TOTAL IGTF PERCIBIDO A DECLARAR AL SENIAT:</td>
            <td class="text-right" style="padding: 7px;">$${totalBaseIgtfUsd.toFixed(2)}</td>
            <td class="text-center">--</td>
            <td class="text-right text-amber" style="padding: 7px; color: #fbbf24;">$${totalIgtfUsd.toFixed(2)}</td>
            <td class="text-right" style="padding: 7px; color: #4ade80;">Bs ${totalIgtfVes.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    `;

    const summaryHtml = `
      <div class="report-summary-grid">
        <div class="summary-card">
          <h4>LIQUIDACIÓN QUINCENAL IGTF SENIAT</h4>
          <p><strong>Total Operaciones Gravadas con IGTF:</strong> ${dataRows.length}</p>
          <p><strong>Monto Base Percibido en Divisas:</strong> $${totalBaseIgtfUsd.toFixed(2)} USD</p>
          <p><strong>Total Impuesto IGTF en Dólares:</strong> $${totalIgtfUsd.toFixed(2)} USD</p>
          <p><strong>Total IGTF en Bolívares a Pagar (Tasa BCV):</strong> Bs ${totalIgtfVes.toFixed(2)} VES</p>
        </div>
        <div class="summary-card">
          <h4>DECLARACIÓN TRIBUTARIA</h4>
          <p>Conforme al Decreto Constituyente de Reforma de la Ley de IGTF publicado en G.O. N° 6.687 Extraordinario.</p>
          <p style="margin-top: 20px; border-top: 1px dashed #94a3b8; padding-top: 8px;">
            <strong>Firma Responsable Fiscal:</strong> ___________________________
          </p>
        </div>
      </div>
    `;

    printReportHtml('REPORTE OFICIAL DE PERCEPCIÓN IGTF (3% DIVISAS)', tableHtml, summaryHtml);
  };

  // -------------------------------------------------------------
  // 3. REPORTE: RESUMEN DECLARACIÓN DE IVA (FORMA 30)
  // -------------------------------------------------------------
  const generateResumenIVA = (exportType: 'pdf' | 'excel') => {
    const fiscalSales = filteredSales.filter(s => s.tipo_documento === 'FACTURA_FISCAL' || !s.tipo_documento);

    let totalBruto = 0;
    let totalExento = 0;
    let totalBase16 = 0;
    let totalIva16 = 0;

    fiscalSales.forEach(s => {
      const isDev = (s.factura_nro || '').startsWith('DEV-');
      const sign = isDev ? -1 : 1;
      totalBruto += (s.totalUSD || 0) * sign;
      const ex = (s.exento_usd !== undefined ? s.exento_usd : (s.iva_usd === 0 ? s.totalUSD : 0)) * sign;
      const base = (s.base_imponible_usd !== undefined ? s.base_imponible_usd : (s.iva_usd && s.iva_usd > 0 ? (s.totalUSD - s.iva_usd) : 0)) * sign;
      const iva = (s.iva_usd || 0) * sign;
      totalExento += ex;
      totalBase16 += base;
      totalIva16 += iva;
    });

    if (exportType === 'excel') {
      const wsData = [
        ['HOJA DE TRABAJO - RESUMEN PARA DECLARACIÓN DE IVA (FORMA 30 SENIAT)'],
        [`EMPRESA: ${companyName}`, `RIF: ${companyRif}`, periodText],
        [],
        ['CONCEPTO TRIBUTARIO', 'CANTIDAD COMPROBANTES', 'BASE IMPONIBLE ($)', 'ALÍCUOTA', 'DÉBITO FISCAL ($)', 'EQUIVALENTE EN BS (TASA BCV)'],
        ['Ventas Internas No Gravadas (Exentas 0%)', fiscalSales.filter(s => (s.iva_usd || 0) === 0).length, totalExento, '0%', 0, totalExento * tasaDia],
        ['Ventas Internas Gravadas por Alícuota General (16%)', fiscalSales.filter(s => (s.iva_usd || 0) > 0).length, totalBase16, '16%', totalIva16, totalIva16 * tasaDia],
        [],
        ['TOTAL GENERAL VENTAS Y DÉBITOS FISCALES:', fiscalSales.length, totalBruto, '--', totalIva16, totalIva16 * tasaDia]
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Resumen_IVA_F30');
      XLSX.writeFile(wb, `Resumen_IVA_Forma30_${startDate}_al_${endDate}.xlsx`);
      return;
    }

    const tableHtml = `
      <table class="report-table" style="margin-top: 15px;">
        <thead>
          <tr>
            <th style="text-align: left; width: 35%;">RUBRO / CONCEPTO FISCAL (FORMA 30)</th>
            <th class="text-center" style="width: 15%;">N° COMPROBANTES</th>
            <th class="text-right" style="width: 16%;">BASE IMPONIBLE (USD)</th>
            <th class="text-center" style="width: 10%;">ALÍCUOTA</th>
            <th class="text-right" style="width: 12%;">DÉBITO FISCAL (USD)</th>
            <th class="text-right" style="width: 12%;">DÉBITO FISCAL (BS)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="font-bold">1. Ventas Internas No Gravadas (Exentas 0%)</td>
            <td class="text-center font-mono">${fiscalSales.filter(s => (s.iva_usd || 0) === 0).length}</td>
            <td class="text-right font-mono font-bold">$${totalExento.toFixed(2)}</td>
            <td class="text-center font-bold">0%</td>
            <td class="text-right font-mono">$0.00</td>
            <td class="text-right font-mono">Bs 0,00</td>
          </tr>
          <tr>
            <td class="font-bold">2. Ventas Internas Gravadas por Alícuota General (16%)</td>
            <td class="text-center font-mono">${fiscalSales.filter(s => (s.iva_usd || 0) > 0).length}</td>
            <td class="text-right font-mono font-bold text-indigo">$${totalBase16.toFixed(2)}</td>
            <td class="text-center font-bold">16%</td>
            <td class="text-right font-mono font-bold text-emerald">$${totalIva16.toFixed(2)}</td>
            <td class="text-right font-mono font-bold text-emerald">Bs ${(totalIva16 * tasaDia).toFixed(2)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr style="background: #0f172a; color: #fff; font-weight: bold; font-family: monospace;">
            <td>TOTAL VENTAS Y DÉBITOS FISCALES:</td>
            <td class="text-center">${fiscalSales.length} docs</td>
            <td class="text-right">$${totalBruto.toFixed(2)}</td>
            <td class="text-center">--</td>
            <td class="text-right" style="color: #4ade80;">$${totalIva16.toFixed(2)}</td>
            <td class="text-right" style="color: #4ade80;">Bs ${(totalIva16 * tasaDia).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    `;

    const summaryHtml = `
      <div class="report-summary-grid">
        <div class="summary-card">
          <h4>DATOS PARA LA FORMA 30 DEL SENIAT</h4>
          <p><strong>Casilla [40] (Ventas Internas No Gravadas):</strong> $${totalExento.toFixed(2)} USD (Bs ${(totalExento * tasaDia).toFixed(2)})</p>
          <p><strong>Casilla [41] (Ventas Gravadas por Alícuota General):</strong> $${totalBase16.toFixed(2)} USD (Bs ${(totalBase16 * tasaDia).toFixed(2)})</p>
          <p><strong>Casilla [42] (Débito Fiscal Generado 16%):</strong> $${totalIva16.toFixed(2)} USD (Bs ${(totalIva16 * tasaDia).toFixed(2)})</p>
        </div>
        <div class="summary-card">
          <h4>CONFORMIDAD CONTABLE</h4>
          <p>Resumen automatizado generado para la declaración mensual o quincenal de IVA ante el portal fiscal del SENIAT.</p>
          <p style="margin-top: 20px; border-top: 1px dashed #94a3b8; padding-top: 8px;">
            <strong>Revisado y Aprobado por:</strong> ___________________________
          </p>
        </div>
      </div>
    `;

    printReportHtml('RESUMEN DECLARACIÓN DE IVA (FORMA 30 SENIAT)', tableHtml, summaryHtml);
  };

  // -------------------------------------------------------------
  // 4. REPORTE: CUADRE MULTIMONEDA Y ARQUEO POR MEDIOS DE PAGO
  // -------------------------------------------------------------
  const generateCuadreMultimoneda = (exportType: 'pdf' | 'excel') => {
    const paymentSummary: { [metodo: string]: { count: number; totalUsd: number; totalVes: number } } = {};

    filteredSales.forEach(s => {
      const isDev = (s.factura_nro || '').startsWith('DEV-');
      const sign = isDev ? -1 : 1;
      const rate = (s as any).tasa_cambio || tasaDia || 1;

      (s.pagos || []).forEach(p => {
        let metodoRaw = String(p.metodo || 'Efectivo$').trim();
        let metodoName = metodoRaw;
        const low = metodoRaw.toLowerCase();
        if (low === 'efectivo$' || low === 'efectivo usd' || low === 'dolares') metodoName = 'Efectivo Dólares ($)';
        else if (low === 'efectivobs' || low === 'efectivo bs' || low === 'bolivares') metodoName = 'Efectivo Bolívares (Bs)';
        else if (low === 'tarjetabs' || low === 'tarjeta debito' || low === 'punto de venta') metodoName = 'Punto de Venta (Bs)';
        else if (low === 'tarjeta$' || low === 'tarjeta usd') metodoName = 'Tarjeta Internacional ($)';
        else if (low === 'pagomovil' || low === 'pago movil') metodoName = 'Pago Móvil (Bs)';
        else if (low === 'biopago') metodoName = 'Biopago BDV (Bs)';
        else if (low === 'creditocliente' || low === 'credito') metodoName = 'Crédito en Cuenta';
        else if (low === 'binance') metodoName = 'Binance Pay ($)';
        else if (low === 'paypal') metodoName = 'PayPal ($)';
        else metodoName = metodoRaw.toUpperCase();

        if (!paymentSummary[metodoName]) {
          paymentSummary[metodoName] = { count: 0, totalUsd: 0, totalVes: 0 };
        }

        const isBolivaresMethod = metodoName.includes('(Bs)') || metodoName.includes('Bolívares') || metodoName.includes('Punto') || metodoName.includes('Móvil') || metodoName.includes('Biopago');
        let pUsd = parseFloat((p as any).montoUSD ?? 0);
        let pVes = parseFloat((p as any).montoVES ?? 0);

        if (pVes > 0 && (!pUsd || Math.abs(pUsd - pVes) < 0.001)) {
          pUsd = pVes / rate;
        } else if (pUsd > 0 && !pVes) {
          if (isBolivaresMethod && s.totalUSD > 0 && pUsd > s.totalUSD * 2) {
            // Detección automática: El valor numérico guardado en legacy corresponde a Bolívares
            pVes = pUsd;
            pUsd = pVes / rate;
          } else {
            pVes = pUsd * rate;
          }
        } else if (!pUsd && !pVes) {
          const rawM = parseFloat((p as any).monto || 0);
          if (isBolivaresMethod) {
            if (s.totalUSD > 0 && rawM <= s.totalUSD * 1.5) {
              pUsd = rawM;
              pVes = rawM * rate;
            } else {
              pVes = rawM;
              pUsd = rawM / rate;
            }
          } else {
            pUsd = rawM;
            pVes = rawM * rate;
          }
        }

        paymentSummary[metodoName].count += 1;
        paymentSummary[metodoName].totalUsd += pUsd * sign;
        paymentSummary[metodoName].totalVes += pVes * sign;
      });
    });

    const rows = Object.entries(paymentSummary).map(([metodo, data]) => ({
      metodo,
      count: data.count,
      totalUsd: data.totalUsd,
      totalVes: data.totalVes,
      porcentaje: 0
    }));

    const granTotalUsd = rows.reduce((acc, r) => acc + r.totalUsd, 0);
    rows.forEach(r => {
      r.porcentaje = granTotalUsd > 0 ? (r.totalUsd / granTotalUsd) * 100 : 0;
    });

    if (exportType === 'excel') {
      const wsData = [
        ['CUADRE DE CAJA Y ARQUEO MULTIMONEDA POR MEDIOS DE PAGO'],
        [`EMPRESA: ${companyName}`, `RIF: ${companyRif}`, periodText],
        [],
        ['INSTRUMENTO / MÉTODO DE PAGO', 'TRANSACCIONES', 'TOTAL USD ($)', 'TOTAL VES (BS)', 'PARTICIPACIÓN (%)'],
        ...rows.map(r => [r.metodo, r.count, r.totalUsd, r.totalVes, `${r.porcentaje.toFixed(2)}%`]),
        [],
        ['TOTAL GENERAL RECAUDADO:', filteredSales.length, granTotalUsd, rows.reduce((acc, r) => acc + r.totalVes, 0), '100.00%']
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cuadre_Medios_Pago');
      XLSX.writeFile(wb, `Cuadre_Multimoneda_${startDate}_al_${endDate}.xlsx`);
      return;
    }

    const rowsHtml = rows.map(r => `
      <tr>
        <td class="font-bold" style="text-transform: uppercase;">💳 ${r.metodo}</td>
        <td class="text-center font-mono">${r.count} cobros</td>
        <td class="text-right font-bold text-emerald font-mono">$${r.totalUsd.toFixed(2)}</td>
        <td class="text-right font-mono">Bs ${r.totalVes.toFixed(2)}</td>
        <td class="text-center font-mono font-bold">${r.porcentaje.toFixed(1)}%</td>
      </tr>
    `).join('');

    const tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="text-align: left; width: 35%;">MÉTODO DE PAGO / INSTRUMENTO</th>
            <th class="text-center" style="width: 15%;">OPERACIONES</th>
            <th class="text-right" style="width: 18%;">TOTAL EN DÓLARES ($)</th>
            <th class="text-right" style="width: 18%;">TOTAL EN BOLÍVARES (BS)</th>
            <th class="text-center" style="width: 14%;">% PARTICIPACIÓN</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 ? '<tr><td colspan="5" class="text-center" style="padding: 20px;">Sin cobros registrados en este período.</td></tr>' : rowsHtml}
        </tbody>
        <tfoot>
          <tr style="background: #0f172a; color: #fff; font-weight: bold; font-family: monospace;">
            <td>TOTAL GENERAL RECAUDADO:</td>
            <td class="text-center">${filteredSales.length} ventas</td>
            <td class="text-right" style="color: #4ade80;">$${granTotalUsd.toFixed(2)}</td>
            <td class="text-right" style="color: #4ade80;">Bs ${rows.reduce((acc, r) => acc + r.totalVes, 0).toFixed(2)}</td>
            <td class="text-center">100.0%</td>
          </tr>
        </tfoot>
      </table>
    `;

    const summaryHtml = `
      <div class="report-summary-grid">
        <div class="summary-card">
          <h4>RESUMEN DE ARQUEO DE CAJA</h4>
          <p><strong>Total Facturas Cobradas:</strong> ${filteredSales.length}</p>
          <p><strong>Total Moneda Extranjera (USD):</strong> $${(rows.filter(r => r.metodo.includes('$') || r.metodo.includes('USD') || r.metodo.includes('Dólares') || r.metodo.includes('Binance') || r.metodo.includes('PayPal')).reduce((acc, r) => acc + r.totalUsd, 0)).toFixed(2)} USD</p>
          <p><strong>Total Moneda Nacional (Bs):</strong> Bs ${(rows.filter(r => r.metodo.includes('Bs') || r.metodo.includes('Bolívares') || r.metodo.includes('Pago Móvil') || r.metodo.includes('Biopago') || r.metodo.includes('Punto de Venta')).reduce((acc, r) => acc + r.totalVes, 0)).toFixed(2)} VES</p>
        </div>
        <div class="summary-card">
          <h4>CUADRE DE CAJEROS / AUDITORÍA</h4>
          <p>Cuadre de valores verificado por tesorería y administración para entrega de remesa y depósito bancario.</p>
          <p style="margin-top: 20px; border-top: 1px dashed #94a3b8; padding-top: 8px;">
            <strong>Firma Cajero / Administrador:</strong> ___________________________
          </p>
        </div>
      </div>
    `;

    printReportHtml('CUADRE DE CAJA Y ARQUEO MULTIMONEDA POR MEDIOS DE PAGO', tableHtml, summaryHtml);
  };

  // -------------------------------------------------------------
  // 5. REPORTE: VENTAS Y RENTABILIDAD POR CATEGORÍA
  // -------------------------------------------------------------
  const generateVentasCategorias = (exportType: 'pdf' | 'excel') => {
    const catMap: { [cat: string]: { units: number; totalVentaUsd: number; totalCostoUsd: number } } = {};

    filteredSales.forEach(s => {
      const isDev = (s.factura_nro || '').startsWith('DEV-');
      const sign = isDev ? -1 : 1;

      (s.items || []).forEach(item => {
        const cat = (item.product?.category || 'GENERAL').toUpperCase().trim();
        if (!catMap[cat]) {
          catMap[cat] = { units: 0, totalVentaUsd: 0, totalCostoUsd: 0 };
        }
        const qty = (item.qty || 1) * sign;
        const price = (item.priceUSD || 0);
        const cost = (item.product?.precio_costo_usd || (price * 0.75));

        catMap[cat].units += qty;
        catMap[cat].totalVentaUsd += qty * price;
        catMap[cat].totalCostoUsd += qty * cost;
      });
    });

    const rows = Object.entries(catMap).map(([cat, data]) => {
      const utilidad = data.totalVentaUsd - data.totalCostoUsd;
      const margen = data.totalVentaUsd > 0 ? (utilidad / data.totalVentaUsd) * 100 : 0;
      return {
        cat,
        units: data.units,
        venta: data.totalVentaUsd,
        costo: data.totalCostoUsd,
        utilidad,
        margen
      };
    }).sort((a, b) => b.venta - a.venta);

    const totalVenta = rows.reduce((acc, r) => acc + r.venta, 0);
    const totalCosto = rows.reduce((acc, r) => acc + r.costo, 0);
    const totalUtilidad = totalVenta - totalCosto;
    const margenGlobal = totalVenta > 0 ? (totalUtilidad / totalVenta) * 100 : 0;

    if (exportType === 'excel') {
      const wsData = [
        ['REPORTE DE VENTAS Y RENTABILIDAD POR CATEGORÍA / DEPARTAMENTO'],
        [`EMPRESA: ${companyName}`, `RIF: ${companyRif}`, periodText],
        [],
        ['DEPARTAMENTO / CATEGORÍA', 'UNIDADES VENDIDAS', 'TOTAL VENTAS ($)', 'COSTO MERCANCÍA ($)', 'UTILIDAD BRUTA ($)', 'MARGEN (%)'],
        ...rows.map(r => [r.cat, r.units, r.venta, r.costo, r.utilidad, `${r.margen.toFixed(2)}%`]),
        [],
        ['TOTALES:', rows.reduce((acc, r) => acc + r.units, 0), totalVenta, totalCosto, totalUtilidad, `${margenGlobal.toFixed(2)}%`]
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rentabilidad_Categorias');
      XLSX.writeFile(wb, `Rentabilidad_Categorias_${startDate}_al_${endDate}.xlsx`);
      return;
    }

    const rowsHtml = rows.map(r => `
      <tr>
        <td class="font-bold" style="text-transform: uppercase;">🏷️ ${r.cat}</td>
        <td class="text-center font-mono">${r.units.toLocaleString()} un.</td>
        <td class="text-right font-bold text-indigo font-mono">$${r.venta.toFixed(2)}</td>
        <td class="text-right font-mono">$${r.costo.toFixed(2)}</td>
        <td class="text-right font-bold text-emerald font-mono">$${r.utilidad.toFixed(2)}</td>
        <td class="text-center font-mono font-bold">${r.margen.toFixed(1)}%</td>
      </tr>
    `).join('');

    const tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="text-align: left; width: 30%;">CATEGORÍA / DEPARTAMENTO</th>
            <th class="text-center" style="width: 14%;">UNID. VENDIDAS</th>
            <th class="text-right" style="width: 16%;">VENTAS TOTALES ($)</th>
            <th class="text-right" style="width: 14%;">COSTO ESTIMADO ($)</th>
            <th class="text-right" style="width: 14%;">UTILIDAD BRUTA ($)</th>
            <th class="text-center" style="width: 12%;">MARGEN %</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 ? '<tr><td colspan="6" class="text-center" style="padding: 20px;">Sin ventas por categoría registradas en este período.</td></tr>' : rowsHtml}
        </tbody>
        <tfoot>
          <tr style="background: #0f172a; color: #fff; font-weight: bold; font-family: monospace;">
            <td>TOTAL GENERAL POR DEPARTAMENTOS:</td>
            <td class="text-center">${rows.reduce((acc, r) => acc + r.units, 0).toLocaleString()} un.</td>
            <td class="text-right">$${totalVenta.toFixed(2)}</td>
            <td class="text-right">$${totalCosto.toFixed(2)}</td>
            <td class="text-right" style="color: #4ade80;">$${totalUtilidad.toFixed(2)}</td>
            <td class="text-center" style="color: #4ade80;">${margenGlobal.toFixed(1)}%</td>
          </tr>
        </tfoot>
      </table>
    `;

    const summaryHtml = `
      <div class="report-summary-grid">
        <div class="summary-card">
          <h4>DESEMPEÑO Y RENTABILIDAD</h4>
          <p><strong>Categoría con Mayor Facturación:</strong> ${rows[0]?.cat || 'N/A'} ($${(rows[0]?.venta || 0).toFixed(2)})</p>
          <p><strong>Categoría con Mayor Margen %:</strong> ${[...rows].sort((a,b) => b.margen - a.margen)[0]?.cat || 'N/A'}</p>
          <p><strong>Utilidad Bruta Total Generada:</strong> $${totalUtilidad.toFixed(2)} USD</p>
        </div>
        <div class="summary-card">
          <h4>ANÁLISIS ESTRATÉGICO</h4>
          <p>Reporte interno para evaluación de inventarios, rentabilidad de líneas de producto y ajuste de precios.</p>
        </div>
      </div>
    `;

    printReportHtml('REPORTE DE VENTAS Y RENTABILIDAD POR CATEGORÍA', tableHtml, summaryHtml);
  };

  // -------------------------------------------------------------
  // 6. REPORTE: TOP PRODUCTOS MÁS VENDIDOS
  // -------------------------------------------------------------
  const generateTopProductos = (exportType: 'pdf' | 'excel') => {
    const prodMap: { [barcode: string]: { desc: string; cat: string; units: number; totalVenta: number } } = {};

    filteredSales.forEach(s => {
      const isDev = (s.factura_nro || '').startsWith('DEV-');
      const sign = isDev ? -1 : 1;

      (s.items || []).forEach(item => {
        const code = item.product?.barcode || `ITEM-${item.product?.id || '0'}`;
        if (!prodMap[code]) {
          prodMap[code] = {
            desc: item.product?.description || 'PRODUCTO',
            cat: item.product?.category || 'GENERAL',
            units: 0,
            totalVenta: 0
          };
        }
        const qty = (item.qty || 1) * sign;
        prodMap[code].units += qty;
        prodMap[code].totalVenta += qty * (item.priceUSD || 0);
      });
    });

    const rows = Object.entries(prodMap).map(([code, d]) => ({
      code,
      desc: d.desc,
      cat: d.cat,
      units: d.units,
      totalVenta: d.totalVenta
    })).sort((a, b) => b.units - a.units).slice(0, 50);

    if (exportType === 'excel') {
      const wsData = [
        ['TOP 50 PRODUCTOS MÁS VENDIDOS (ROTACIÓN DE INVENTARIO)'],
        [`EMPRESA: ${companyName}`, `RIF: ${companyRif}`, periodText],
        [],
        ['RANK', 'CÓDIGO / CLAVE', 'DESCRIPCIÓN DEL ARTÍCULO', 'CATEGORÍA', 'UNIDADES VENDIDAS', 'TOTAL GENERADO ($)'],
        ...rows.map((r, i) => [i + 1, r.code, r.desc, r.cat, r.units, r.totalVenta])
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Top_Productos');
      XLSX.writeFile(wb, `Top_Productos_${startDate}_al_${endDate}.xlsx`);
      return;
    }

    const rowsHtml = rows.map((r, i) => `
      <tr>
        <td class="text-center font-bold">${i + 1}</td>
        <td class="text-center font-mono">${r.code}</td>
        <td class="font-bold uppercase">${r.desc}</td>
        <td class="text-center" style="font-size: 8.5px;">${r.cat}</td>
        <td class="text-center font-mono font-bold text-indigo">${r.units.toLocaleString()} un.</td>
        <td class="text-right font-mono font-bold text-emerald">$${r.totalVenta.toFixed(2)}</td>
      </tr>
    `).join('');

    const tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 5%;">#</th>
            <th style="width: 14%;">CÓDIGO / CLAVE</th>
            <th style="width: 38%;">DESCRIPCIÓN DEL ARTÍCULO</th>
            <th style="width: 15%;">CATEGORÍA</th>
            <th class="text-center" style="width: 14%;">UNID. VENDIDAS</th>
            <th class="text-right" style="width: 14%;">FACTURACIÓN ($)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 ? '<tr><td colspan="6" class="text-center" style="padding: 20px;">Sin productos vendidos en este período.</td></tr>' : rowsHtml}
        </tbody>
      </table>
    `;

    printReportHtml('TOP PRODUCTOS MÁS VENDIDOS (ROTACIÓN)', tableHtml);
  };

  // -------------------------------------------------------------
  // 7. REPORTE: AUDITORÍA DE ANULACIONES Y DEVOLUCIONES
  // -------------------------------------------------------------
  const generateAuditoriaAnulaciones = (exportType: 'pdf' | 'excel') => {
    const devSales = filteredSales.filter(s => (s.factura_nro || '').startsWith('DEV-') || (s.descuento && s.descuento > 0));

    const dataRows = devSales.map((s, i) => ({
      num: i + 1,
      fecha: (s.fecha || '').substring(0, 16),
      factura: s.factura_nro,
      tipo: s.factura_nro.startsWith('DEV-') ? 'DEVOLUCIÓN / ANULACIÓN' : 'DESCUENTO ESPECIAL',
      cliente: s.client?.nombre || 'CLIENTE',
      usuario: s.usuario || 'CAJERO',
      totalUsd: s.totalUSD || 0,
      descuento: s.descuento || 0
    }));

    if (exportType === 'excel') {
      const wsData = [
        ['AUDITORÍA DE DESCUENTOS, DEVOLUCIONES Y ANULACIONES'],
        [`EMPRESA: ${companyName}`, `RIF: ${companyRif}`, periodText],
        [],
        ['N°', 'FECHA / HORA', 'COMPROBANTE', 'TIPO OPERACIÓN', 'CLIENTE', 'CAJERO / USUARIO', 'MONTO ($)', 'DESCUENTO ($)'],
        ...dataRows.map(r => [r.num, r.fecha, r.factura, r.tipo, r.cliente, r.usuario, r.totalUsd, r.descuento])
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Auditoria_Devoluciones');
      XLSX.writeFile(wb, `Auditoria_Anulaciones_${startDate}_al_${endDate}.xlsx`);
      return;
    }

    const rowsHtml = dataRows.map(r => `
      <tr style="background-color: ${r.tipo.includes('DEVOLUCIÓN') ? '#fff1f2' : '#fefce8'};">
        <td class="text-center">${r.num}</td>
        <td class="text-center" style="font-family: monospace;">${r.fecha}</td>
        <td class="text-center font-bold" style="font-family: monospace;">${r.factura}</td>
        <td class="font-bold ${r.tipo.includes('DEVOLUCIÓN') ? 'text-red' : 'text-amber'}">${r.tipo}</td>
        <td>${r.cliente}</td>
        <td class="font-bold">${r.usuario}</td>
        <td class="text-right font-mono font-bold">$${r.totalUsd.toFixed(2)}</td>
        <td class="text-right font-mono text-red">$${r.descuento.toFixed(2)}</td>
      </tr>
    `).join('');

    const tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 4%;">#</th>
            <th style="width: 14%;">FECHA / HORA</th>
            <th style="width: 12%;">COMPROBANTE</th>
            <th style="width: 20%;">TIPO DE OPERACIÓN</th>
            <th style="width: 20%;">CLIENTE</th>
            <th style="width: 12%;">CAJERO</th>
            <th class="text-right" style="width: 10%;">MONTO ($)</th>
            <th class="text-right" style="width: 8%;">DESCUENTO ($)</th>
          </tr>
        </thead>
        <tbody>
          ${dataRows.length === 0 ? '<tr><td colspan="8" class="text-center" style="padding: 20px;">No se registraron anulaciones, devoluciones ni descuentos manuales en el período.</td></tr>' : rowsHtml}
        </tbody>
      </table>
    `;

    printReportHtml('AUDITORÍA DE DESCUENTOS, ANULACIONES Y DEVOLUCIONES', tableHtml);
  };

  return (
    <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 text-slate-800 animate-in fade-in duration-200 font-sans">
      <div className="bg-white border border-indigo-200 rounded-2xl overflow-hidden w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* HEADER */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-md shrink-0 border-b border-indigo-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/30 rounded-xl backdrop-blur-sm border border-indigo-400/30">
              <BarChart3 className="w-6 h-6 text-amber-300 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black font-sans uppercase tracking-wider flex items-center gap-2">
                Centro de Reportes Fiscales y Gestión de Ventas
              </h3>
              <p className="text-xs text-indigo-200 font-sans">
                Generador oficial de libros SENIAT, liquidación IGTF, cuadres de caja multimoneda y rentabilidad.
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl font-bold transition-all px-2 py-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* DATE RANGE FILTER TOOLBAR */}
        <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span className="font-bold text-slate-700 uppercase tracking-wide">Rango de Consulta:</span>
            
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setFilterEnabled(true);
              }}
              className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
            />
            <span className="text-slate-400 font-bold">hasta</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setFilterEnabled(true);
              }}
              className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
            />
          </div>

          {/* Quick ranges */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-250">
            <button
              type="button"
              onClick={() => setQuickRange('hoy')}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded transition-all"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setQuickRange('semana')}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded transition-all"
            >
              Esta Semana
            </button>
            <button
              type="button"
              onClick={() => setQuickRange('mes')}
              className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 rounded transition-all"
            >
              Este Mes
            </button>
            <button
              type="button"
              onClick={() => setQuickRange('mes_ant')}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded transition-all"
            >
              Mes Anterior
            </button>
            <button
              type="button"
              onClick={() => setQuickRange('todo')}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded transition-all"
            >
              Todo
            </button>
          </div>
        </div>

        {/* CONTENT TABS & BODY */}
        <div className="p-6 overflow-y-auto flex-grow space-y-6">
          
          {/* Main Category Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <button
              type="button"
              onClick={() => {
                setActiveTab('fiscales');
                setSelectedReport('libro_ventas');
              }}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs font-sans uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'fiscales'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-4 h-4 text-amber-300" />
              🏛️ Reportes Fiscales y Tributarios (SENIAT)
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('gestion');
                setSelectedReport('cuadre_multimoneda');
              }}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs font-sans uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'gestion'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <DollarSign className="w-4 h-4 text-emerald-300" />
              💼 Auditoría, Cuadre de Caja y Rentabilidad
            </button>
          </div>

          {/* REPORT LIST GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {activeTab === 'fiscales' ? (
              <>
                {/* 1. Libro de Ventas */}
                <div 
                  onClick={() => setSelectedReport('libro_ventas')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    selectedReport === 'libro_ventas'
                      ? 'bg-indigo-50/70 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                        📑 Libro de Ventas Fiscal Oficial (SENIAT)
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Formato legal reglamentario bajo la Providencia 0071 con desglose de Base Imponible, Exento, IVA 16% y seriales de control.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-150">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateLibroVentas('pdf'); }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Imprimir / PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateLibroVentas('excel'); }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Excel (.xlsx)
                    </button>
                  </div>
                </div>

                {/* 2. IGTF 3% Divisas */}
                <div 
                  onClick={() => setSelectedReport('igtf_divisas')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    selectedReport === 'igtf_divisas'
                      ? 'bg-indigo-50/70 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                        💵 Reporte de Percepción IGTF (3% Divisas)
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Desglose de cobros en efectivo USD, Zelle y moneda extranjera con cálculo de base imponible y el 3% de IGTF recaudado.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-150">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateReportIGTF('pdf'); }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Imprimir / PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateReportIGTF('excel'); }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Excel (.xlsx)
                    </button>
                  </div>
                </div>

                {/* 3. Resumen IVA Forma 30 */}
                <div 
                  onClick={() => setSelectedReport('resumen_iva_f30')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    selectedReport === 'resumen_iva_f30'
                      ? 'bg-indigo-50/70 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 shrink-0">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                        📊 Resumen para Declaración de IVA (Forma 30)
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Hoja ejecutiva de casillas para vaciar en el portal del SENIAT: Ventas Exentas (0%), Base Gravable (16%) y Débito Fiscal.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-150">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateResumenIVA('pdf'); }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Imprimir / PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateResumenIVA('excel'); }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Excel (.xlsx)
                    </button>
                  </div>
                </div>

                {/* 4. Retenciones de IVA Clientes Especiales */}
                <div 
                  onClick={() => setSelectedReport('retenciones_iva')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    selectedReport === 'retenciones_iva'
                      ? 'bg-indigo-50/70 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-700 shrink-0">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                        🧾 Resumen de Facturas Fiscales Emitidas
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Control cronológico de documentos fiscales emitidos con RIF, razón social y estado de pago para contabilidad.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-150">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateLibroVentas('pdf'); }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Imprimir / PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateLibroVentas('excel'); }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Excel (.xlsx)
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* 5. Cuadre de Caja Multimoneda */}
                <div 
                  onClick={() => setSelectedReport('cuadre_multimoneda')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    selectedReport === 'cuadre_multimoneda'
                      ? 'bg-indigo-50/70 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                      <ArrowRightLeft className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                        💰 Cuadre de Caja y Arqueo Multimoneda
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Totalización por instrumento financiero: Efectivo USD, Efectivo Bs, Punto de Venta, Pago Móvil, Zelle y Biopago.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-150">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateCuadreMultimoneda('pdf'); }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Imprimir / PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateCuadreMultimoneda('excel'); }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Excel (.xlsx)
                    </button>
                  </div>
                </div>

                {/* 6. Ventas por Categoría */}
                <div 
                  onClick={() => setSelectedReport('ventas_categorias')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    selectedReport === 'ventas_categorias'
                      ? 'bg-indigo-50/70 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                      <PieChart className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                        📦 Ventas y Rentabilidad por Categoría
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Desglose de ingresos, costo estimado y margen de ganancia bruta por departamento (Víveres, Bebidas, Charcutería, etc.).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-150">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateVentasCategorias('pdf'); }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Imprimir / PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateVentasCategorias('excel'); }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Excel (.xlsx)
                    </button>
                  </div>
                </div>

                {/* 7. Top Productos */}
                <div 
                  onClick={() => setSelectedReport('top_productos')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    selectedReport === 'top_productos'
                      ? 'bg-indigo-50/70 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                        🏆 Ranking Top 50 Productos Más Vendidos
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Análisis de rotación ABC con los artículos de mayor volumen y mayor contribución a la facturación del negocio.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-150">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateTopProductos('pdf'); }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Imprimir / PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateTopProductos('excel'); }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Excel (.xlsx)
                    </button>
                  </div>
                </div>

                {/* 8. Auditoría de Anulaciones y Descuentos */}
                <div 
                  onClick={() => setSelectedReport('auditoria_anulaciones')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    selectedReport === 'auditoria_anulaciones'
                      ? 'bg-indigo-50/70 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                        🔍 Auditoría de Devoluciones y Descuentos
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Control antifraude de notas de crédito (`DEV-`), descuentos manuales, cajero responsable y fecha/hora de emisión.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-150">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateAuditoriaAnulaciones('pdf'); }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Imprimir / PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateAuditoriaAnulaciones('excel'); }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Excel (.xlsx)
                    </button>
                  </div>
                </div>
              </>
            )}

          </div>

        </div>

        {/* FOOTER */}
        <div className="bg-slate-100 px-6 py-3.5 border-t border-slate-200 flex justify-between items-center shrink-0 text-xs">
          <span className="text-slate-500">
            {filteredSales.length} facturas encontradas en el rango seleccionado
          </span>

          <button
            type="button"
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-5 py-2 rounded-lg transition-all cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
