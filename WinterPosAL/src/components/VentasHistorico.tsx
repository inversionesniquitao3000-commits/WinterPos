import { useState, useEffect, useMemo } from 'react';
import { Sale, CierreCaja } from '../types';
import { History, Printer, ShieldAlert, ShoppingCart, Eye } from 'lucide-react';
import { formatNumberToWordsUSD } from '../utils';

interface VentasHistoricoProps {
  sales: Sale[];
  cierres: CierreCaja[];
  onReprintTicket: (sale: Sale) => void;
}

export default function VentasHistorico({ sales, cierres, onReprintTicket }: VentasHistoricoProps) {
  const [activeSubTab, setActiveSubTab] = useState<'ventas' | 'cierres'>('ventas');
  const [selectedCierre, setSelectedCierre] = useState<CierreCaja | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [filterEnabled, setFilterEnabled] = useState(true);

  // Filter sales list by date range if enabled
  const filteredSales = useMemo(() => {
    if (!filterEnabled) return sales;
    return sales.filter(s => {
      if (!s.fecha) return false;
      const dateStr = s.fecha.substring(0, 10); // "YYYY-MM-DD"
      return dateStr >= startDate && dateStr <= endDate;
    });
  }, [sales, startDate, endDate, filterEnabled]);

  // Calculate totals and utility for the filtered sales
  const filteredSalesTotals = useMemo(() => {
    let totalVentas = 0;
    let totalCosto = 0;
    
    filteredSales.forEach(s => {
      totalVentas += s.totalUSD ?? 0;
      (s.items ?? []).forEach(item => {
        const itemCost = item.product?.precio_costo_usd ?? 0;
        totalCosto += itemCost * (item.qty ?? 0);
      });
    });
    
    const totalUtilidad = totalVentas - totalCosto;
    return {
      totalVentas,
      totalCosto,
      totalUtilidad
    };
  }, [filteredSales]);

  // Filter cierres list by date range if enabled
  const filteredCierres = useMemo(() => {
    if (!filterEnabled) return cierres;
    return cierres.filter(c => {
      const closingDate = c.fechaCierre || c.fecha || "";
      if (!closingDate) return false;
      const dateStr = closingDate.substring(0, 10); // "YYYY-MM-DD"
      return dateStr >= startDate && dateStr <= endDate;
    });
  }, [cierres, startDate, endDate, filterEnabled]);

  // Escape key listener to close details modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCierre(null);
        setSelectedSale(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleDownloadCierresReport = () => {
    const title = "Historial de Cierres de Caja Conciliados";
    const dateStr = new Date().toLocaleString();
    const periodText = filterEnabled ? `Período: Desde ${startDate} Hasta ${endDate}` : "Todos los cierres registrados";

    const tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th>Fecha Cierre</th>
            <th>Cajero</th>
            <th class="text-right">Apertura USD / VES</th>
            <th class="text-right">Ventas Netas</th>
            <th class="text-right">Físico USD / VES</th>
            <th class="text-right">Diferencia USD</th>
            <th class="text-right">Utilidad USD</th>
          </tr>
        </thead>
        <tbody>
          ${filteredCierres.length === 0 ? `
            <tr><td colspan="7" style="text-align: center; color: #777;">Sin cierres conciliados en este rango de fechas.</td></tr>
          ` : filteredCierres.map(c => {
            const dineroEnCajaExpected = c.dineroEnCajaExpected ?? (c as any).expectedUsd ?? 0;
            const realUsd = c.realUsd ?? 0;
            const diffUsd = realUsd - dineroEnCajaExpected;
            const aperturaUsd = c.aperturaUsd ?? 0;
            const aperturaVes = c.aperturaVes ?? 0;
            const ventaTotalUsd = c.ventaTotalUsd ?? 0;
            const realVes = c.realVes ?? 0;
            const utilidadUsd = c.utilidadUsd ?? (ventaTotalUsd - (c.costoTotalUsd ?? 0));

            return `
              <tr>
                <td>${c.fechaCierre || c.fecha || 'N/A'}</td>
                <td style="text-transform: uppercase;">${c.usuario}</td>
                <td class="text-right">$${aperturaUsd.toFixed(2)} / Bs ${aperturaVes.toFixed(2)}</td>
                <td class="text-right">$${ventaTotalUsd.toFixed(2)}</td>
                <td class="text-right">$${realUsd.toFixed(2)} / Bs ${realVes.toFixed(2)}</td>
                <td class="text-right font-bold ${diffUsd >= 0 ? 'text-green' : 'text-red'}">$${diffUsd.toFixed(2)}</td>
                <td class="text-right font-bold text-emerald">$${utilidadUsd.toFixed(2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      <div class="report-summary">
        <p><strong>Cierres en Reporte:</strong> ${filteredCierres.length}</p>
        <p><strong>Total Ventas Netas:</strong> $${filteredCierres.reduce((acc, c) => acc + (c.ventaTotalUsd ?? 0), 0).toFixed(2)} USD</p>
        <p><strong>Total Utilidad Cierres:</strong> $${filteredCierres.reduce((acc, c) => acc + (c.utilidadUsd ?? 0), 0).toFixed(2)} USD</p>
      </div>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("No se pudo abrir la ventana de impresión. Por favor habilite los popups.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte PDF - ${title}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #333;
              margin: 30px;
              font-size: 11px;
            }
            .header {
              border-bottom: 2px solid #333;
              padding-bottom: 8px;
              margin-bottom: 15px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .header-left h1 {
              margin: 0 0 3px 0;
              font-size: 18px;
              color: #0f172a;
              letter-spacing: 0.5px;
            }
            .header-left p {
              margin: 0;
              color: #64748b;
              font-size: 10px;
            }
            .header-right {
              text-align: right;
              font-size: 9px;
              color: #64748b;
              line-height: 1.4;
            }
            h2 {
              font-size: 12px;
              text-transform: uppercase;
              color: #1e293b;
              margin-top: 0;
              margin-bottom: 12px;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 4px;
              letter-spacing: 0.5px;
            }
            .report-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }
            .report-table th, .report-table td {
              border: 1px solid #94a3b8;
              padding: 6px 8px;
              text-align: left;
            }
            .report-table th {
              background-color: #f1f5f9;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9px;
              color: #334155;
            }
            .text-right {
              text-align: right !important;
            }
            .font-bold {
              font-weight: bold;
            }
            .text-green {
              color: #16a34a !important;
            }
            .text-red {
              color: #dc2626 !important;
            }
            .text-emerald {
              color: #059669 !important;
            }
            .report-summary {
              margin-top: 20px;
              padding: 12px;
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 4px;
              width: fit-content;
              min-width: 250px;
            }
            .report-summary p {
              margin: 0 0 5px 0;
              font-size: 11px;
            }
            .report-summary p:last-child {
              margin-bottom: 0;
            }
            @media print {
              body { margin: 15px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-left">
              <h1>INVERSIONES NIQUITAO 3000 C.A.</h1>
              <p>RIF: J-41132631 | Telf: 0424-2042877</p>
              <p style="margin-top: 5px; font-weight: bold;">${periodText}</p>
            </div>
            <div class="header-right">
              <p><strong>Fecha Reporte:</strong> ${dateStr}</p>
              <p><strong>Módulo:</strong> Historial de Cierres</p>
            </div>
          </div>
          
          <h2>${title}</h2>
          ${tableHtml}
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() {
                window.close();
              }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadTransactionsReport = () => {
    const title = "Historial de Facturas y Ventas Registradas";
    const dateStr = new Date().toLocaleString();
    const periodText = filterEnabled ? `Período: Desde ${startDate} Hasta ${endDate}` : "Todas las facturas registradas";

    const tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Factura</th>
            <th>Cliente</th>
            <th>Cajero</th>
            <th class="text-right">Total USD</th>
            <th class="text-right">Total VES</th>
          </tr>
        </thead>
        <tbody>
          ${filteredSales.length === 0 ? `
            <tr><td colspan="6" style="text-align: center; color: #777;">Sin ventas registradas en este rango de fechas.</td></tr>
          ` : filteredSales.map(sale => `
            <tr>
              <td>${sale.fecha}</td>
              <td class="font-bold">${sale.factura_nro}</td>
              <td style="text-transform: uppercase;">${sale.client.nombre}</td>
              <td>${sale.usuario}</td>
              <td class="text-right font-bold text-emerald">$${(sale.totalUSD ?? 0).toFixed(2)}</td>
              <td class="text-right font-bold">Bs ${(sale.totalVES ?? 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="report-summary">
        <p><strong>Total Facturas:</strong> ${filteredSales.length}</p>
        <p><strong>Total Ventas Netas:</strong> $${filteredSales.reduce((acc, s) => acc + (s.totalUSD ?? 0), 0).toFixed(2)} USD</p>
      </div>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("No se pudo abrir la ventana de impresión. Por favor habilite los popups.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte PDF - ${title}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #333;
              margin: 30px;
              font-size: 11px;
            }
            .header {
              border-bottom: 2px solid #333;
              padding-bottom: 8px;
              margin-bottom: 15px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .header-left h1 {
              margin: 0 0 3px 0;
              font-size: 18px;
              color: #0f172a;
              letter-spacing: 0.5px;
            }
            .header-left p {
              margin: 0;
              color: #64748b;
              font-size: 10px;
            }
            .header-right {
              text-align: right;
              font-size: 9px;
              color: #64748b;
              line-height: 1.4;
            }
            h2 {
              font-size: 12px;
              text-transform: uppercase;
              color: #1e293b;
              margin-top: 0;
              margin-bottom: 12px;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 4px;
              letter-spacing: 0.5px;
            }
            .report-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }
            .report-table th, .report-table td {
              border: 1px solid #94a3b8;
              padding: 6px 8px;
              text-align: left;
            }
            .report-table th {
              background-color: #f1f5f9;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9px;
              color: #334155;
            }
            .text-right {
              text-align: right !important;
            }
            .font-bold {
              font-weight: bold;
            }
            .text-emerald {
              color: #059669 !important;
            }
            .report-summary {
              margin-top: 20px;
              padding: 12px;
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 4px;
              width: fit-content;
              min-width: 250px;
            }
            .report-summary p {
              margin: 0 0 5px 0;
              font-size: 11px;
            }
            @media print {
              body { margin: 15px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-left">
              <h1>INVERSIONES NIQUITAO 3000 C.A.</h1>
              <p>RIF: J-41132631 | Telf: 0424-2042877</p>
              <p style="margin-top: 5px; font-weight: bold;">${periodText}</p>
            </div>
            <div class="header-right">
              <p><strong>Fecha Reporte:</strong> ${dateStr}</p>
              <p><strong>Módulo:</strong> Historial de Transacciones</p>
            </div>
          </div>
          
          <h2>${title}</h2>
          ${tableHtml}
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() {
                window.close();
              }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 font-mono text-xs text-slate-800">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-winter-header tracking-wider flex items-center gap-2">
            <History className="w-5 h-5 text-winter-header" />
            HISTORIAL TRANSACCIONAL Y CIERRES
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Consulte las facturas emitidas y el histórico de cierres de caja conciliados.
          </p>
        </div>

        {/* SUB-TABS */}
        <div className="flex bg-slate-200 rounded-lg p-0.5 self-start border border-slate-300">
          <button
            onClick={() => setActiveSubTab('ventas')}
            className={`px-4 py-2 text-xs font-bold rounded-md font-sans transition-all ${
              activeSubTab === 'ventas'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Transacciones
          </button>
          <button
            onClick={() => setActiveSubTab('cierres')}
            className={`px-4 py-2 text-xs font-bold rounded-md font-sans transition-all ${
              activeSubTab === 'cierres'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Cierres de Caja
          </button>
        </div>
      </div>

      {/* SHARED DATE RANGE FILTER & PDF EXPORT BAR */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm font-sans">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enable-date-filter"
              checked={filterEnabled}
              onChange={(e) => setFilterEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-winter-blueBtn focus:ring-winter-blueBtn"
            />
            <label htmlFor="enable-date-filter" className="font-bold text-slate-600 cursor-pointer">Filtrar por Rango:</label>
          </div>

          <div className="flex items-center gap-2 font-sans">
            <span className="text-slate-500">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={!filterEnabled}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-winter-blueBtn text-slate-700 font-mono disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2 font-sans">
            <span className="text-slate-500">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={!filterEnabled}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-winter-blueBtn text-slate-700 font-mono disabled:opacity-50"
            />
          </div>
        </div>

        <button
          onClick={activeSubTab === 'cierres' ? handleDownloadCierresReport : handleDownloadTransactionsReport}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded text-xs transition-all shadow-sm flex items-center gap-1.5 font-sans"
          title="Generar y abrir reporte PDF de lo que ve en la tabla"
        >
          <Printer className="w-4 h-4" />
          <span>Reporte PDF</span>
        </button>
      </div>

      {activeSubTab === 'ventas' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          <div className="bg-slate-55 border-b border-slate-200 px-5 py-3.5 flex flex-wrap justify-between items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-sans">
              <ShoppingCart className="w-4 h-4 text-slate-450" />
              Facturas y Ventas Registradas
            </span>
            <div className="flex flex-wrap items-center gap-2 font-sans text-[10px]">
              <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded border border-slate-250">
                Facturas: <strong className="font-mono">{filteredSales.length}</strong>
              </span>
              <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded border border-slate-250">
                Ventas Filtro: <strong className="font-mono text-winter-blueBtn">${filteredSalesTotals.totalVentas.toFixed(2)}</strong>
              </span>
              <span className="bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded border border-emerald-200">
                Utilidad Filtro: <strong className="font-mono font-bold text-emerald-600">${filteredSalesTotals.totalUtilidad.toFixed(2)}</strong>
              </span>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-slate-55 border-b border-slate-200">
                <tr className="text-slate-550">
                  <th className="px-4 py-3 font-bold font-sans">FECHA</th>
                  <th className="px-4 py-3 font-bold font-sans">FACTURA</th>
                  <th className="px-4 py-3 font-bold font-sans">CLIENTE</th>
                  <th className="px-4 py-3 font-bold font-sans">OPERADOR</th>
                  <th className="px-4 py-3 text-right font-bold font-sans">TOTAL USD</th>
                  <th className="px-4 py-3 text-right font-bold font-sans">TOTAL VES</th>
                  <th className="px-4 py-3 font-bold font-sans">MÉTODO PAGO</th>
                  <th className="px-4 py-3 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-sans">
                      No se han procesado ventas en este rango de fechas.
                    </td>
                  </tr>
                ) : (
                  [...filteredSales].reverse().map(sale => (
                    <tr key={sale.factura_nro} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono">{sale.fecha}</td>
                      <td className="px-4 py-3 font-bold font-mono text-slate-600">{sale.factura_nro}</td>
                      <td className="px-4 py-3 font-sans font-medium">{sale.client.nombre}</td>
                      <td className="px-4 py-3 font-sans">{sale.usuario}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">${(sale.totalUSD ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-505">Bs {(sale.totalVES ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-3 font-sans">
                        <div className="flex flex-wrap gap-1">
                          {(sale.pagos ?? []).map((p, idx) => (
                            <span key={idx} className="bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px]">
                              {p.metodo}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedSale(sale)}
                            className="bg-slate-55 border border-slate-200 text-slate-600 p-1.5 rounded hover:bg-slate-100 hover:text-slate-800 transition-all shadow-sm flex items-center gap-1 text-[10px]"
                            title="Ver Detalle de Venta y Utilidad"
                          >
                            <Eye className="w-3.5 h-3.5 text-winter-blueBtn" />
                          </button>
                          <button
                            onClick={() => onReprintTicket(sale)}
                            className="bg-slate-55 border border-slate-200 text-slate-600 p-1.5 rounded hover:bg-slate-100 hover:text-slate-800 transition-all shadow-sm"
                            title="Reimprimir ticket fiscal"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'cierres' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          <div className="bg-slate-55 border-b border-slate-200 px-5 py-3.5 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-sans">
              <ShieldAlert className="w-4 h-4 text-slate-450" />
              Historial de Cierres de Caja Ejecutados
            </span>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-2.5 py-0.5 rounded border border-slate-300">
              {filteredCierres.length} cierres
            </span>
          </div>

          <div className="flex-grow overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-slate-55 border-b border-slate-200">
                <tr className="text-slate-550">
                  <th className="px-4 py-3 font-bold font-sans">FECHA CIERRE</th>
                  <th className="px-4 py-3 font-bold font-sans">CAJERO</th>
                  <th className="px-4 py-3 text-right font-bold font-sans">APERTURA ($ / Bs)</th>
                  <th className="px-4 py-3 text-right font-bold font-sans">VENTAS NETAS</th>
                  <th className="px-4 py-3 text-right font-bold font-sans">FISICO ($ / Bs)</th>
                  <th className="px-4 py-3 text-right font-bold font-sans">DIF USD</th>
                  <th className="px-4 py-3 text-right font-bold font-sans text-emerald-600">UTILIDAD</th>
                  <th className="px-4 py-3 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                {filteredCierres.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-sans">
                      No se han registrado cierres de caja en este rango de fechas.
                    </td>
                  </tr>
                ) : (
                  [...filteredCierres].reverse().map(c => {
                    const dineroEnCajaExpected = c.dineroEnCajaExpected ?? (c as any).expectedUsd ?? 0;
                    const realUsd = c.realUsd ?? 0;
                    const realVes = c.realVes ?? 0;
                    const diffUsd = realUsd - dineroEnCajaExpected;
                    const aperturaUsd = c.aperturaUsd ?? 0;
                    const aperturaVes = c.aperturaVes ?? 0;
                    const ventaTotalUsd = c.ventaTotalUsd ?? 0;
                    const utilidadUsd = c.utilidadUsd ?? (ventaTotalUsd - (c.costoTotalUsd ?? 0));

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono">{c.fechaCierre || c.fecha || 'N/A'}</td>
                        <td className="px-4 py-3 font-sans font-medium uppercase">{c.usuario}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">
                          <div>${aperturaUsd.toFixed(2)}</div>
                          <div className="text-[9px] text-slate-400">Bs {aperturaVes.toFixed(2)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold">${ventaTotalUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 font-semibold">
                          <div>${realUsd.toFixed(2)}</div>
                          <div className="text-[9px] text-purple-650">Bs {realVes.toFixed(2)}</div>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${diffUsd >= 0 ? 'text-green-600' : 'text-red-655'}`}>
                          ${diffUsd.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600 font-extrabold">
                          ${utilidadUsd.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedCierre(c)}
                            className="bg-slate-55 border border-slate-200 text-slate-600 p-1.5 rounded hover:bg-slate-100 hover:text-slate-800 transition-all shadow-sm flex items-center gap-1 font-sans mx-auto text-[10px]"
                            title="Ver Comprobante de Cierre Completo"
                          >
                            <Eye className="w-3.5 h-3.5 text-winter-blueBtn" />
                            Ver Cierre
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DETAIL MODAL: COMPROBANTE DE CIERRE FISCAL */}
      {selectedCierre && (() => {
        const dineroEnCajaExpected = selectedCierre.dineroEnCajaExpected ?? (selectedCierre as any).expectedUsd ?? 0;
        const realUsd = selectedCierre.realUsd ?? 0;
        const diffUsd = realUsd - dineroEnCajaExpected;
        const aperturaUsd = selectedCierre.aperturaUsd ?? 0;
        const aperturaVes = selectedCierre.aperturaVes ?? 0;
        const ventasEfectivoUsd = selectedCierre.ventasEfectivoUsd ?? 0;
        const abonoClientesUsd = selectedCierre.abonoClientesUsd ?? 0;
        const entradaEfectivoUsd = selectedCierre.entradaEfectivoUsd ?? 0;
        const salidaEfectivoUsd = selectedCierre.salidaEfectivoUsd ?? 0;
        const devolucionEfectivoUsd = selectedCierre.devolucionEfectivoUsd ?? 0;
        
        const ventasTotalesUsd = selectedCierre.ventasTotalesUsd ?? 0;
        const descuentosUsd = selectedCierre.descuentosUsd ?? 0;
        const ventaBrutaUsd = selectedCierre.ventaBrutaUsd ?? 0;
        
        const pagosEfectivoUsd = selectedCierre.pagosEfectivoUsd ?? 0;
        const pagosEfectivoBsUsd = (selectedCierre as any).pagosEfectivoBsUsd ?? 0;
        const pagosEfectivoBsVes = (selectedCierre as any).pagosEfectivoBsVes ?? 0;
        const pagosBiopagoUsd = (selectedCierre as any).pagosBiopagoUsd ?? 0;
        const pagosBiopagoVes = (selectedCierre as any).pagosBiopagoVes ?? 0;
        const pagosPuntoUsd = (selectedCierre as any).pagosPuntoUsd ?? 0;
        const pagosPuntoVes = (selectedCierre as any).pagosPuntoVes ?? 0;
        const pagosCreditoUsd = selectedCierre.pagosCreditoUsd ?? 0;
        const devolucionVentasUsd = selectedCierre.devolucionVentasUsd ?? 0;
        const ventaTotalUsd = selectedCierre.ventaTotalUsd ?? 0;
        
        const expectedVes = selectedCierre.expectedVes ?? 0;
        const realVes = selectedCierre.realVes ?? 0;

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800">
            <div className="bg-white border border-slate-350 rounded-xl overflow-hidden w-full max-w-2xl shadow-2xl flex flex-col">
              
              {/* Blue Header Title Bar */}
              <div className="bg-winter-header text-white px-5 py-3 flex items-center justify-between">
                <h3 className="text-sm font-extrabold flex items-center gap-1.5 font-sans">
                  Cierre de Caja
                </h3>
                <button 
                  onClick={() => setSelectedCierre(null)} 
                  className="text-white opacity-70 hover:opacity-100 text-xs font-sans"
                >
                  ✕ Cerrar [ESC]
                </button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-[10px] text-slate-700 leading-relaxed max-h-[70vh] overflow-y-auto bg-slate-50">
                
                {/* Left Column: Cash Drawer */}
                <div className="bg-white border border-slate-200 p-4 rounded-lg space-y-3 shadow-sm">
                  <div>
                    <span className="text-slate-500 font-sans block text-[9px] uppercase">Usuario Cajero</span>
                    <strong className="text-slate-850 text-xs block uppercase truncate">
                      {selectedCierre.usuario}
                    </strong>
                  </div>

                  <div className="space-y-1.5 border-t border-slate-100 pt-2 font-mono">
                    <div className="flex justify-between">
                      <span>Apertura de Caja :</span>
                      <span className="font-bold text-slate-800">$ {aperturaUsd.toFixed(2)} / Bs {aperturaVes.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span>Ventas en Efectivo :</span>
                      <span className="font-bold text-slate-800">$ {ventasEfectivoUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Abono de Clientes :</span>
                      <span className="font-bold text-slate-800">$ {abonoClientesUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Entrada Efectivo :</span>
                      <span className="font-bold text-slate-800">$ {entradaEfectivoUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-red-500 font-bold">
                      <span>Salida Efectivo :</span>
                      <span>- $ {salidaEfectivoUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-red-550">
                      <span>Devolución Efectivo :</span>
                      <span>- $ {devolucionEfectivoUsd.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-300 pt-2 font-bold font-sans">
                    <div className="flex justify-between text-sm text-slate-900 font-black">
                      <span className="uppercase text-[10px]">Dinero en Caja :</span>
                      <span className="text-base text-winter-blueBtn font-mono">$ {dineroEnCajaExpected.toFixed(2)}</span>
                    </div>
                    <div className="text-[7.5px] text-slate-450 italic mt-0.5 leading-tight font-medium uppercase tracking-tighter text-right">
                      {formatNumberToWordsUSD(dineroEnCajaExpected)}
                    </div>
                  </div>
                </div>

                {/* Right Column: Performance */}
                <div className="bg-white border border-slate-200 p-4 rounded-lg space-y-3 shadow-sm">
                  <div className="space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span>Ventas Totales :</span>
                      <span className="font-bold text-slate-800">$ {ventasTotalesUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Descuentos :</span>
                      <span className="font-bold text-slate-800">$ {descuentosUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 border-b border-dashed border-slate-200 pb-1.5">
                      <span className="font-sans text-[9px] uppercase">Venta Bruta :</span>
                      <span>$ {ventaBrutaUsd.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1 font-mono text-[9px]">
                    <div className="flex justify-between">
                      <span>Efectivo $ :</span>
                      <span className="font-bold text-slate-800">$ {pagosEfectivoUsd.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span>Efectivo Bs :</span>
                      <span className="font-bold text-slate-800">$ {pagosEfectivoBsUsd.toFixed(2)} (Bs {pagosEfectivoBsVes.toFixed(2)})</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Biopago :</span>
                      <span className="font-bold text-slate-800">$ {pagosBiopagoUsd.toFixed(2)} (Bs {pagosBiopagoVes.toFixed(2)})</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Punto / Tarjeta :</span>
                      <span className="font-bold text-slate-800">$ {pagosPuntoUsd.toFixed(2)} (Bs {pagosPuntoVes.toFixed(2)})</span>
                    </div>

                    <div className="flex justify-between">
                      <span>A Crédito :</span>
                      <span className="font-bold text-slate-800">$ {pagosCreditoUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-red-500">
                      <span>Devolución Ventas :</span>
                      <span>- $ {devolucionVentasUsd.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-300 pt-2 font-bold font-sans">
                    <div className="flex justify-between text-sm text-slate-900 font-black border-b border-dashed border-slate-200 pb-1.5">
                      <span className="uppercase text-[10px]">Venta Total :</span>
                      <span className="text-base text-winter-blueBtn font-mono">$ {ventaTotalUsd.toFixed(2)}</span>
                    </div>
                    <div className="text-[7.5px] text-slate-450 italic mt-0.5 leading-tight font-medium uppercase tracking-tighter text-right mb-2">
                      {formatNumberToWordsUSD(ventaTotalUsd)}
                    </div>
                  </div>

                  {/* PROFITABILITY BREAKDOWN */}
                  <div className="pt-2.5 font-sans space-y-1.5 text-[10px] text-slate-700 bg-emerald-50/50 p-2.5 rounded border border-emerald-100 mt-2">
                    <div className="font-bold text-[9px] text-emerald-855 uppercase border-b border-emerald-200/60 pb-1">
                      CÁLCULO DE UTILIDAD DEL CIERRE
                    </div>
                    <div className="flex justify-between font-mono">
                      <span>Ingreso Neto (Ventas):</span>
                      <span className="font-bold text-slate-800">$ {ventaTotalUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-mono">
                      <span>Costo de Mercancía:</span>
                      <span className="font-bold text-red-600">- $ {(selectedCierre.costoTotalUsd ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-mono text-xs border-t border-emerald-300/80 pt-1 mt-1 font-extrabold text-emerald-700">
                      <span>UTILIDAD NETA:</span>
                      <span>$ {(selectedCierre.utilidadUsd ?? (ventaTotalUsd - (selectedCierre.costoTotalUsd ?? 0))).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Reconciliation Comparison Footer */}
              <div className="bg-white border-t border-slate-200 p-5 space-y-3 font-sans text-xs">
                <div className="font-bold text-center text-slate-655 border-b border-slate-100 pb-1.5">
                  DISCREPANCIAS EN ARQUEO FÍSICO
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono">
                    <div className="text-slate-500 font-sans text-[10px] mb-1 font-bold">Dólares USD:</div>
                    <div className="flex justify-between"><span>Gaveta Esperado:</span> <span>${dineroEnCajaExpected.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Recibido Real:</span> <span className="text-emerald-700 font-bold">${realUsd.toFixed(2)}</span></div>
                    <div className="flex justify-between border-t border-dashed border-slate-300 pt-1 font-bold text-slate-800">
                      <span>Diferencia:</span>
                      <span className={diffUsd >= 0 ? 'text-green-600' : 'text-red-655'}>
                        ${diffUsd.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono">
                    <div className="text-slate-500 font-sans text-[10px] mb-1 font-bold">Bolívares Bs:</div>
                    <div className="flex justify-between"><span>Gaveta Esperado:</span> <span>Bs {expectedVes.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Recibido Real:</span> <span className="text-purple-755 font-bold">Bs {realVes.toFixed(2)}</span></div>
                    <div className="flex justify-between border-t border-dashed border-slate-300 pt-1 font-bold text-slate-800">
                      <span>Diferencia:</span>
                      <span className={realVes - expectedVes >= 0 ? 'text-green-600' : 'text-red-655'}>
                        Bs {(realVes - expectedVes).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCierre(null)}
                  className="w-full bg-slate-900 hover:bg-slate-950 text-white font-bold py-2.5 rounded font-mono text-xs uppercase"
                >
                  Cerrar Comprobante
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* SALE DETAIL MODAL */}
      {selectedSale && (() => {
        const subtotal = selectedSale.subtotal ?? 0;
        const descuento = selectedSale.descuento ?? 0;
        const totalUSD = selectedSale.totalUSD ?? 0;
        
        // Calculate items costs and profit
        let totalCost = 0;
        const itemsWithProfit = (selectedSale.items ?? []).map(item => {
          const itemCost = item.product?.precio_costo_usd ?? 0;
          const totalItemCost = itemCost * item.qty;
          const totalItemSale = item.totalUSD ?? (item.priceUSD * item.qty);
          const itemProfit = totalItemSale - totalItemCost;
          totalCost += totalItemCost;
          
          return {
            ...item,
            cost: itemCost,
            totalCost: totalItemCost,
            totalSale: totalItemSale,
            profit: itemProfit
          };
        });
        
        const totalProfit = totalUSD - totalCost;

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800">
            <div className="bg-white border border-slate-355 rounded-xl overflow-hidden w-full max-w-2xl shadow-2xl flex flex-col">
              
              {/* Header Title Bar */}
              <div className="bg-winter-header text-white px-5 py-3 flex items-center justify-between">
                <h3 className="text-sm font-extrabold flex items-center gap-1.5 font-sans">
                  <ShoppingCart className="w-4 h-4 text-winter-blueBtn" />
                  DETALLE DE FACTURA / VENTA
                </h3>
                <button 
                  onClick={() => setSelectedSale(null)} 
                  className="text-white opacity-70 hover:opacity-100 text-xs font-sans"
                >
                  ✕ Cerrar [ESC]
                </button>
              </div>

              <div className="p-6 text-[10px] text-slate-700 leading-relaxed max-h-[70vh] overflow-y-auto bg-slate-50 space-y-4">
                
                {/* Meta details row */}
                <div className="grid grid-cols-2 gap-4 bg-white border border-slate-200 p-4 rounded-lg shadow-sm font-sans">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Factura Nro</span>
                    <strong className="text-slate-800 text-xs block font-mono font-extrabold">{selectedSale.factura_nro}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Fecha y Hora</span>
                    <strong className="text-slate-800 text-xs block font-mono font-medium">{selectedSale.fecha}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Cliente</span>
                    <strong className="text-slate-800 text-xs block uppercase truncate">{selectedSale.client.nombre}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Operador / Cajero</span>
                    <strong className="text-slate-800 text-xs block uppercase truncate">{selectedSale.usuario}</strong>
                  </div>
                </div>

                {/* Items Table */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                  <table className="w-full border-collapse text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-slate-500 font-sans uppercase text-[8px] font-black font-semibold">
                        <th className="px-3 py-2.5">PRODUCTO</th>
                        <th className="px-3 py-2.5 text-center">CANT</th>
                        <th className="px-3 py-2.5 text-right">UNIT VENTA</th>
                        <th className="px-3 py-2.5 text-right">UNIT COSTO</th>
                        <th className="px-3 py-2.5 text-right">TOTAL VENTA</th>
                        <th className="px-3 py-2.5 text-right text-emerald-700">UTILIDAD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[10px] text-slate-700 font-mono">
                      {itemsWithProfit.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-sans font-medium uppercase">{item.product.description}</td>
                          <td className="px-3 py-2 text-center font-bold text-slate-800">{item.qty}</td>
                          <td className="px-3 py-2 text-right text-slate-600">${item.priceUSD.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">${item.cost.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-900 font-bold">${item.totalSale.toFixed(2)}</td>
                          <td className={`px-3 py-2 text-right font-bold ${item.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            ${item.profit.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals & Net Profit Breakdown Card */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Totals & Payments */}
                  <div className="bg-white border border-slate-200 p-4 rounded-lg space-y-2 shadow-sm">
                    <div className="font-bold text-[9px] text-slate-500 uppercase border-b border-slate-100 pb-1 font-sans">
                      Montos y Pagos
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>Subtotal USD:</span>
                        <span>$ {subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-red-500">
                        <span>Descuentos USD:</span>
                        <span>- $ {descuento.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-black text-slate-900 border-t border-dashed border-slate-200 pt-1 font-sans text-xs">
                        <span>TOTAL FACTURADO:</span>
                        <span className="text-winter-blueBtn font-mono font-bold">$ {totalUSD.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-[8px] uppercase text-slate-400 font-bold mb-1 font-sans">Métodos Aplicados</div>
                      <div className="flex flex-wrap gap-1 font-sans">
                        {(selectedSale.pagos ?? []).map((p, idx) => (
                          <span key={idx} className="bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[8px] font-semibold">
                            {p.metodo}: ${p.monto.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Profitability Panel */}
                  <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-lg space-y-3 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-[9px] text-emerald-855 uppercase border-b border-emerald-250/60 pb-1 font-sans">
                        Rentabilidad de la Venta
                      </div>
                      <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between">
                          <span>Ingreso Neto Venta:</span>
                          <span className="font-bold text-slate-800">$ {totalUSD.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Costo Mercancía:</span>
                          <span className="font-bold text-red-600">- $ {totalCost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-emerald-300 pt-2 font-bold font-sans">
                      <div className="flex justify-between text-xs text-emerald-800 font-extrabold items-baseline">
                        <span className="uppercase text-[9px]">UTILIDAD NETA:</span>
                        <span className="text-lg text-emerald-600 font-mono font-black">$ {totalProfit.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
