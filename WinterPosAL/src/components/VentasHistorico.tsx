import { useState, useEffect, useMemo } from 'react';
import { Sale, CierreCaja, User } from '../types';
import { History, Printer, ShieldAlert, ShoppingCart, Eye, Edit, Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { formatNumberToWordsUSD } from '../utils';
import { useDialog } from '../hooks/useDialog';

interface VentasHistoricoProps {
  sales: Sale[];
  cierres: CierreCaja[];
  onReprintTicket: (sale: Sale) => void;
  currentUser: User;
  onUpdateCierre: (cierreId: number, updatedData: any) => Promise<boolean>;
}

export default function VentasHistorico({ sales, cierres, onReprintTicket, currentUser, onUpdateCierre }: VentasHistoricoProps) {
  const { showAlert } = useDialog();
  const [activeSubTab, setActiveSubTab] = useState<'ventas' | 'cierres'>('ventas');
  const [selectedCierre, setSelectedCierre] = useState<CierreCaja | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const isAdmin = currentUser?.rol?.toLowerCase() === 'administrador';

  // Edit Cierre Modal State
  const [editingCierre, setEditingCierre] = useState<CierreCaja | null>(null);
  const [editAperturaUsd, setEditAperturaUsd] = useState('');
  const [editAperturaVes, setEditAperturaVes] = useState('');
  const [editRealUsd, setEditRealUsd] = useState('');
  const [editRealVes, setEditRealVes] = useState('');
  const [editEntradaUsd, setEditEntradaUsd] = useState('');
  const [editEntradaVes, setEditEntradaVes] = useState('');
  const [editSalidaUsd, setEditSalidaUsd] = useState('');
  const [editSalidaVes, setEditSalidaVes] = useState('');

  const handleStartEditCierre = (c: CierreCaja) => {
    setEditingCierre(c);
    setEditAperturaUsd(String(c.aperturaUsd ?? 0));
    setEditAperturaVes(String(c.aperturaVes ?? 0));
    setEditRealUsd(String(c.realUsd ?? 0));
    setEditRealVes(String(c.realVes ?? 0));
    setEditEntradaUsd(String(c.entradaEfectivoUsd ?? 0));
    setEditEntradaVes(String(c.entradaEfectivoVes ?? 0));
    setEditSalidaUsd(String(c.salidaEfectivoUsd ?? 0));
    setEditSalidaVes(String(c.salidaEfectivoVes ?? 0));
  };

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [filterEnabled, setFilterEnabled] = useState(true);

  // Search inputs
  const [salesSearchTerm, setSalesSearchTerm] = useState('');
  const [cierresSearchTerm, setCierresSearchTerm] = useState('');

  // Sales sorting states
  type SalesSortField = 'fecha' | 'factura_nro' | 'cliente' | 'usuario' | 'totalUSD' | 'totalVES';
  const [salesSortField, setSalesSortField] = useState<SalesSortField>('fecha');
  const [salesSortDir, setSalesSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSalesSort = (field: SalesSortField) => {
    if (salesSortField === field) {
      setSalesSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSalesSortField(field);
      setSalesSortDir(field === 'fecha' ? 'desc' : 'asc');
    }
  };

  // Cierres sorting states
  type CierresSortField = 'fechaCierre' | 'usuario' | 'aperturaUsd' | 'ventaTotalUsd' | 'realUsd' | 'diffUsd' | 'utilidadUsd';
  const [cierresSortField, setCierresSortField] = useState<CierresSortField>('fechaCierre');
  const [cierresSortDir, setCierresSortDir] = useState<'asc' | 'desc'>('desc');

  const handleCierresSort = (field: CierresSortField) => {
    if (cierresSortField === field) {
      setCierresSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setCierresSortField(field);
      setCierresSortDir(field === 'fechaCierre' ? 'desc' : 'asc');
    }
  };

  const SalesSortIcon = ({ field }: { field: SalesSortField }) => {
    if (salesSortField !== field) return <ChevronsUpDown className="inline w-3 h-3 ml-0.5 opacity-30" />;
    return salesSortDir === 'asc'
      ? <ChevronUp className="inline w-3 h-3 ml-0.5 text-blue-500" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5 text-blue-500" />;
  };

  const CierresSortIcon = ({ field }: { field: CierresSortField }) => {
    if (cierresSortField !== field) return <ChevronsUpDown className="inline w-3 h-3 ml-0.5 opacity-30" />;
    return cierresSortDir === 'asc'
      ? <ChevronUp className="inline w-3 h-3 ml-0.5 text-blue-500" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5 text-blue-500" />;
  };

  // Filter sales list by date range if enabled
  const filteredSales = useMemo(() => {
    if (!filterEnabled) return sales;
    return sales.filter(s => {
      if (!s.fecha) return false;
      const dateStr = s.fecha.substring(0, 10); // "YYYY-MM-DD"
      return dateStr >= startDate && dateStr <= endDate;
    });
  }, [sales, startDate, endDate, filterEnabled]);

  // Apply search term and sorting to sales
  const finalFilteredSales = useMemo(() => {
    let list = filteredSales;
    if (salesSearchTerm.trim() !== '') {
      const term = salesSearchTerm.toLowerCase();
      list = list.filter(s => 
        (s.factura_nro || '').toLowerCase().includes(term) ||
        (s.fecha || '').toLowerCase().includes(term) ||
        (s.client?.nombre || '').toLowerCase().includes(term) ||
        (s.client?.cedula_rif || '').toLowerCase().includes(term) ||
        (s.usuario || '').toLowerCase().includes(term) ||
        (s.terminal || '').toLowerCase().includes(term) ||
        (s.pagos || []).some(p => (p.metodo || '').toLowerCase().includes(term))
      );
    }
    return [...list].sort((a, b) => {
      let va: any = a[salesSortField];
      let vb: any = b[salesSortField];

      if (salesSortField === 'cliente') {
        va = a.client?.nombre || '';
        vb = b.client?.nombre || '';
      }
      if (salesSortField === 'totalUSD') {
        va = a.totalUSD ?? 0;
        vb = b.totalUSD ?? 0;
      }
      if (salesSortField === 'totalVES') {
        va = a.totalVES ?? 0;
        vb = b.totalVES ?? 0;
      }

      if (typeof va === 'number' && typeof vb === 'number') {
        return salesSortDir === 'asc' ? va - vb : vb - va;
      }
      return salesSortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [filteredSales, salesSearchTerm, salesSortField, salesSortDir]);

  // Calculate totals and utility for the filtered sales
  const filteredSalesTotals = useMemo(() => {
    let totalVentas = 0;
    let totalCosto = 0;
    
    finalFilteredSales.forEach(s => {
      const isDev = s.factura_nro.startsWith('DEV-');
      const mult = isDev ? -1 : 1;
      
      totalVentas += (s.totalUSD ?? 0) * mult;
      (s.items ?? []).forEach(item => {
        const itemCost = item.product?.precio_costo_usd ?? 0;
        totalCosto += itemCost * (item.qty ?? 0) * mult;
      });
    });
    
    const totalUtilidad = totalVentas - totalCosto;
    return {
      totalVentas,
      totalCosto,
      totalUtilidad
    };
  }, [finalFilteredSales]);

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

  // Apply search term and sorting to cierres
  const finalFilteredCierres = useMemo(() => {
    let list = filteredCierres;
    if (cierresSearchTerm.trim() !== '') {
      const term = cierresSearchTerm.toLowerCase();
      list = list.filter(c => 
        (c.fechaCierre || c.fecha || '').toLowerCase().includes(term) ||
        (c.usuario || '').toLowerCase().includes(term) ||
        (c.terminal || '').toLowerCase().includes(term) ||
        (c.status || '').toLowerCase().includes(term)
      );
    }
    return [...list].sort((a, b) => {
      let va: any = a[cierresSortField];
      let vb: any = b[cierresSortField];

      if (cierresSortField === 'diffUsd') {
        const d1_expected = a.dineroEnCajaExpected ?? (a as any).expectedUsd ?? 0;
        const d1_real = a.realUsd ?? 0;
        va = d1_real - d1_expected;

        const d2_expected = b.dineroEnCajaExpected ?? (b as any).expectedUsd ?? 0;
        const d2_real = b.realUsd ?? 0;
        vb = d2_real - d2_expected;
      }
      
      if (cierresSortField === 'utilidadUsd') {
        const v1 = a.ventaTotalUsd ?? 0;
        va = a.utilidadUsd ?? (v1 - (a.costoTotalUsd ?? 0));

        const v2 = b.ventaTotalUsd ?? 0;
        vb = b.utilidadUsd ?? (v2 - (b.costoTotalUsd ?? 0));
      }

      if (typeof va === 'number' && typeof vb === 'number') {
        return cierresSortDir === 'asc' ? va - vb : vb - va;
      }
      return cierresSortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [filteredCierres, cierresSearchTerm, cierresSortField, cierresSortDir]);

  const totalUtilidadFiltered = useMemo(() => {
    return finalFilteredCierres.reduce((sum, c) => {
      const ventaTotalUsd = c.ventaTotalUsd ?? 0;
      const val = c.utilidadUsd ?? (ventaTotalUsd - (c.costoTotalUsd ?? 0));
      return sum + val;
    }, 0);
  }, [finalFilteredCierres]);

  // Escape key listener to close details modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCierre(null);
        setSelectedSale(null);
        setEditingCierre(null);
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
      showAlert('No se pudo abrir la ventana de impresión. Por favor habilite los popups en su navegador.', 'Popups Bloqueados', 'warning');
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
      showAlert('No se pudo abrir la ventana de impresión. Por favor habilite los popups en su navegador.', 'Popups Bloqueados', 'warning');
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
      <div className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-4 flex flex-wrap items-center justify-between gap-2 shadow-sm font-sans">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <input
              type="checkbox"
              id="enable-date-filter"
              checked={filterEnabled}
              onChange={(e) => setFilterEnabled(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-winter-blueBtn focus:ring-winter-blueBtn"
            />
            <label htmlFor="enable-date-filter" className="font-bold text-slate-600 cursor-pointer">Filtrar por Rango:</label>
          </div>

          <div className="flex items-center gap-1.5 font-sans">
            <span className="text-slate-500">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={!filterEnabled}
              className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs outline-none focus:border-winter-blueBtn text-slate-700 font-mono disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-1.5 font-sans">
            <span className="text-slate-500">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={!filterEnabled}
              className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs outline-none focus:border-winter-blueBtn text-slate-700 font-mono disabled:opacity-50"
            />
          </div>
        </div>

        <button
          onClick={activeSubTab === 'cierres' ? handleDownloadCierresReport : handleDownloadTransactionsReport}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded text-[11px] transition-all shadow-sm flex items-center gap-1 font-sans"
          title="Generar y abrir reporte PDF de lo que ve en la tabla"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Reporte PDF</span>
        </button>
      </div>

      {activeSubTab === 'ventas' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-4 flex-grow">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-sans whitespace-nowrap">
                <ShoppingCart className="w-4 h-4 text-slate-450" />
                Facturas y Ventas Registradas
              </span>
              <div className="relative w-full max-w-xs">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar factura, cliente, operador..."
                  value={salesSearchTerm}
                  onChange={(e) => setSalesSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded pl-8 pr-2.5 py-1 text-[11px] text-slate-800 focus:outline-none focus:border-slate-500 font-sans shadow-sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-sans text-[10px]">
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-250">
                Facturas: <strong className="font-mono">{finalFilteredSales.length}</strong>
              </span>
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-250">
                Ventas Filtro: <strong className="font-mono text-winter-blueBtn">${filteredSalesTotals.totalVentas.toFixed(2)}</strong>
              </span>
              <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                Utilidad Filtro: <strong className="font-mono font-bold text-emerald-600">${filteredSalesTotals.totalUtilidad.toFixed(2)}</strong>
              </span>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 border-b border-slate-200">
                <tr className="text-slate-500">
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('fecha')}>
                    <div className="flex items-center gap-1">
                      <span>FECHA</span>
                      <SalesSortIcon field="fecha" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('factura_nro')}>
                    <div className="flex items-center gap-1">
                      <span>FACTURA</span>
                      <SalesSortIcon field="factura_nro" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('cliente')}>
                    <div className="flex items-center gap-1">
                      <span>CLIENTE</span>
                      <SalesSortIcon field="cliente" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('usuario')}>
                    <div className="flex items-center gap-1">
                      <span>OPERADOR</span>
                      <SalesSortIcon field="usuario" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('totalUSD')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>TOTAL USD</span>
                      <SalesSortIcon field="totalUSD" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('totalVES')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>TOTAL VES</span>
                      <SalesSortIcon field="totalVES" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans">MÉTODO PAGO</th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700 select-text">
                {finalFilteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-sans">
                      No se han procesado ventas que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  finalFilteredSales.map(sale => {
                    const isDev = sale.factura_nro.startsWith('DEV-');
                    return (
                      <tr key={sale.factura_nro} className={`hover:bg-slate-50/50 ${isDev ? 'bg-rose-50/20' : ''}`}>
                        <td className="px-4 py-1 font-mono">{sale.fecha}</td>
                        <td className={`px-4 py-1 font-bold font-mono ${isDev ? 'text-rose-700' : 'text-slate-600'}`}>
                          {sale.factura_nro}
                        </td>
                        <td className="px-4 py-1 font-sans font-medium">{sale.client.nombre}</td>
                        <td className="px-4 py-1 font-sans">
                          {sale.usuario}
                          {sale.terminal && (
                            <span className="ml-1.5 text-[8px] bg-slate-100 text-slate-500 border border-slate-200 px-1 py-0.2 rounded font-mono uppercase">
                              {sale.terminal.replace('CAJA_', 'C')}
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-1 text-right font-mono font-bold ${isDev ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {isDev ? '-' : ''}${Math.abs(sale.totalUSD ?? 0).toFixed(2)}
                        </td>
                        <td className={`px-4 py-1 text-right font-mono font-bold ${isDev ? 'text-rose-500' : 'text-slate-500'}`}>
                          {isDev ? '-' : ''}Bs {Math.abs(sale.totalVES ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-1 font-sans">
                          <div className="flex flex-wrap gap-1">
                            {(sale.pagos ?? []).map((p, idx) => (
                              <span key={idx} className={`border px-1.5 py-0.5 rounded text-[9px] ${
                                isDev 
                                  ? 'bg-rose-50 border-rose-200 text-rose-700' 
                                  : 'bg-slate-100 border-slate-200 text-slate-600'
                              }`}>
                                {p.metodo === 'Efectivo$' && isDev ? 'Reembolso $' : p.metodo}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-1 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedSale(sale)}
                              className={`border p-1.5 rounded transition-all shadow-sm flex items-center gap-1 text-[10px] ${
                                isDev 
                                  ? 'bg-rose-50 border-rose-200 text-rose-750 hover:bg-rose-100 hover:text-rose-800' 
                                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                              }`}
                              title={isDev ? 'Ver Detalle de Devolución' : 'Ver Detalle de Venta y Utilidad'}
                            >
                              <Eye className={`w-3.5 h-3.5 ${isDev ? 'text-rose-600' : 'text-winter-blueBtn'}`} />
                            </button>
                            {!isDev && (
                              <button
                                onClick={() => onReprintTicket(sale)}
                                className="bg-slate-100 border border-slate-200 text-slate-600 p-1.5 rounded hover:bg-slate-100 hover:text-slate-800 transition-all shadow-sm"
                                title="Reimprimir ticket fiscal"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
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

      {activeSubTab === 'cierres' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-4 flex-grow">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-sans whitespace-nowrap">
                <ShieldAlert className="w-4 h-4 text-slate-450" />
                Historial de Cierres de Caja Ejecutados
              </span>
              <div className="relative w-full max-w-xs">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar cierre, cajero, terminal..."
                  value={cierresSearchTerm}
                  onChange={(e) => setCierresSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded pl-8 pr-2.5 py-1 text-[11px] text-slate-800 focus:outline-none focus:border-slate-500 font-sans shadow-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-extrabold px-2 py-0.5 rounded border border-emerald-200/60 font-sans">
                Utilidad Total: <span className="font-mono text-emerald-800 text-xs">${totalUtilidadFiltered.toFixed(2)}</span>
              </span>
              <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded border border-slate-300">
                {finalFilteredCierres.length} cierres
              </span>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 border-b border-slate-200">
                <tr className="text-slate-500">
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('fechaCierre')}>
                    <div className="flex items-center gap-1">
                      <span>FECHA CIERRE</span>
                      <CierresSortIcon field="fechaCierre" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('usuario')}>
                    <div className="flex items-center gap-1">
                      <span>CAJERO</span>
                      <CierresSortIcon field="usuario" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('aperturaUsd')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>APERTURA ($ / Bs)</span>
                      <CierresSortIcon field="aperturaUsd" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('ventaTotalUsd')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>VENTAS NETAS</span>
                      <CierresSortIcon field="ventaTotalUsd" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('realUsd')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>FISICO ($ / Bs)</span>
                      <CierresSortIcon field="realUsd" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('diffUsd')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>DIF USD</span>
                      <CierresSortIcon field="diffUsd" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-right font-bold font-sans text-emerald-600 cursor-pointer select-none" onClick={() => handleCierresSort('utilidadUsd')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>UTILIDAD</span>
                      <CierresSortIcon field="utilidadUsd" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700 select-text">
                {finalFilteredCierres.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-sans">
                      No se han registrado cierres de caja que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  finalFilteredCierres.map(c => {
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
                        <td className="px-4 py-1 font-mono">{c.fechaCierre || c.fecha || 'N/A'}</td>
                        <td className="px-4 py-1 font-sans font-medium uppercase text-slate-800">
                          {c.usuario}
                          {c.terminal && (
                            <span className="ml-1.5 text-[8px] bg-slate-100 text-slate-500 border border-slate-200 px-1 py-0.2 rounded font-mono normal-case">
                              {c.terminal.replace('CAJA_', 'C')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-1 text-right font-mono text-slate-600">
                          <div>${aperturaUsd.toFixed(2)}</div>
                          <div className="text-[9px] text-slate-400">Bs {aperturaVes.toFixed(2)}</div>
                        </td>
                        <td className="px-4 py-1 text-right font-mono font-bold">${ventaTotalUsd.toFixed(2)}</td>
                        <td className="px-4 py-1 text-right font-mono text-slate-700 font-semibold">
                          <div>${realUsd.toFixed(2)}</div>
                          <div className="text-[9px] text-purple-650">Bs {realVes.toFixed(2)}</div>
                        </td>
                        <td className={`px-4 py-1 text-right font-mono font-bold ${diffUsd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${diffUsd.toFixed(2)}
                        </td>
                        <td className="px-4 py-1 text-right font-mono text-emerald-600 font-extrabold">
                          ${utilidadUsd.toFixed(2)}
                        </td>
                        <td className="px-4 py-1 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedCierre(c)}
                              className="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1 rounded hover:bg-slate-100 hover:text-slate-800 transition-all shadow-sm flex items-center gap-1 font-sans text-[10px]"
                              title="Ver Comprobante de Cierre Completo"
                            >
                              <Eye className="w-3.5 h-3.5 text-winter-blueBtn" />
                              Ver
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleStartEditCierre(c)}
                                className="bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded hover:bg-amber-100 hover:text-amber-800 transition-all shadow-sm flex items-center gap-1 font-sans text-[10px]"
                                title="Corregir Apertura, Recibidos y Movimientos"
                              >
                                <Edit className="w-3.5 h-3.5 text-amber-600" />
                                Editar
                              </button>
                            )}
                          </div>
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
        const entradaEfectivoVes = selectedCierre.entradaEfectivoVes ?? 0;
        const salidaEfectivoUsd = selectedCierre.salidaEfectivoUsd ?? 0;
        const salidaEfectivoVes = selectedCierre.salidaEfectivoVes ?? 0;
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

        const tasa = (() => {
          if (pagosEfectivoBsUsd > 0) return Math.round((pagosEfectivoBsVes / pagosEfectivoBsUsd) * 100) / 100;
          if (pagosBiopagoUsd > 0) return Math.round((pagosBiopagoVes / pagosBiopagoUsd) * 100) / 100;
          if (pagosPuntoUsd > 0) return Math.round((pagosPuntoVes / pagosPuntoUsd) * 100) / 100;
          if (aperturaUsd > 0 && aperturaVes > 0) return Math.round((aperturaVes / aperturaUsd) * 100) / 100;
          return 0;
        })();

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800">
            <div className="bg-white border border-slate-350 rounded-xl overflow-hidden w-full max-w-4xl shadow-2xl flex flex-col animate-fade-in">
              
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

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-[13px] text-slate-700 leading-relaxed max-h-[75vh] overflow-y-auto bg-slate-50">
                
                {/* Left Column: Cash Drawer */}
                <div className="bg-white border border-slate-200 p-5 rounded-lg space-y-3 shadow-sm select-text">
                  <div>
                    <span className="text-slate-500 font-sans block text-[11px] font-bold uppercase">Usuario Cajero</span>
                    <strong className="text-slate-850 text-sm block uppercase truncate">
                      {selectedCierre.usuario}
                    </strong>
                  </div>

                  <div className="space-y-2 border-t border-slate-100 pt-2 font-mono">
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
                      <span>Entrada Efectivo ($) :</span>
                      <span className="font-bold text-slate-800">$ {entradaEfectivoUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Entrada Efectivo (Bs) :</span>
                      <span className="font-bold text-slate-800">Bs {entradaEfectivoVes.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-red-555 font-bold">
                      <span>Salida Efectivo ($) :</span>
                      <span>- $ {salidaEfectivoUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-red-555 font-bold">
                      <span>Salida Efectivo (Bs) :</span>
                      <span>- Bs {salidaEfectivoVes.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-red-555">
                      <span>Devolución Efectivo :</span>
                      <span>
                        - $ {devolucionEfectivoUsd.toFixed(2)} {tasa > 0 ? `(Bs ${(devolucionEfectivoUsd * tasa).toFixed(2)})` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-slate-300 pt-2 font-bold font-sans">
                    <div className="flex justify-between text-sm text-slate-900 font-black items-baseline">
                      <span className="uppercase text-[11px] font-extrabold text-slate-600">Dinero en Caja :</span>
                      <span className="text-xl text-winter-blueBtn font-mono font-black">$ {dineroEnCajaExpected.toFixed(2)}</span>
                    </div>
                    <div className="text-[8.5px] text-slate-450 italic mt-0.5 leading-tight font-medium uppercase tracking-tighter text-right font-mono">
                      {formatNumberToWordsUSD(dineroEnCajaExpected)}
                    </div>
                  </div>
                </div>

                {/* Right Column: Performance */}
                <div className="bg-white border border-slate-200 p-5 rounded-lg space-y-3 shadow-sm select-text">
                  <div className="space-y-2 font-mono">
                    <div className="flex justify-between">
                      <span>Ventas Totales :</span>
                      <span className="font-bold text-slate-800">$ {ventasTotalesUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Descuentos :</span>
                      <span className="font-bold text-slate-800">$ {descuentosUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 border-b border-dashed border-slate-200 pb-1.5">
                      <span className="font-sans text-[11px] font-bold text-slate-500 uppercase">Venta Bruta :</span>
                      <span>$ {ventaBrutaUsd.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1 font-mono text-[13px]">
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

                    <div className="flex justify-between text-red-550 font-bold">
                      <span>Devolución Ventas :</span>
                      <span>- $ {devolucionVentasUsd.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-300 pt-2 font-bold font-sans">
                    <div className="flex justify-between text-sm text-slate-900 font-black border-b border-dashed border-slate-200 pb-1.5 items-baseline">
                      <span className="uppercase text-[11px] font-extrabold text-slate-600">Venta Total :</span>
                      <span className="text-xl text-winter-blueBtn font-mono font-black">$ {ventaTotalUsd.toFixed(2)}</span>
                    </div>
                    <div className="text-[8.5px] text-slate-450 italic mt-0.5 leading-tight font-medium uppercase tracking-tighter text-right mb-2 font-mono">
                      {formatNumberToWordsUSD(ventaTotalUsd)}
                    </div>
                  </div>

                  {/* PROFITABILITY BREAKDOWN */}
                  <div className="pt-2.5 font-sans space-y-2 text-[11.5px] text-slate-700 bg-emerald-50/50 p-3 rounded border border-emerald-100 mt-2 select-text">
                    <div className="font-bold text-[10px] text-emerald-855 uppercase border-b border-emerald-200/60 pb-1">
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
                    <div className="flex justify-between font-mono text-[12.5px] border-t border-emerald-300/80 pt-1 mt-1 font-extrabold text-emerald-700">
                      <span>UTILIDAD NETA:</span>
                      <span className="text-base font-black">$ {(selectedCierre.utilidadUsd ?? (ventaTotalUsd - (selectedCierre.costoTotalUsd ?? 0))).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Reconciliation Comparison Footer */}
              <div className="bg-white border-t border-slate-200 p-5 space-y-4 font-sans text-sm">
                <div className="font-extrabold text-center text-slate-800 border-b border-slate-100 pb-2 uppercase text-sm tracking-wider">
                  DISCREPANCIAS EN ARQUEO FÍSICO
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono select-text space-y-1">
                    <div className="text-slate-600 font-sans text-[12px] mb-1.5 font-bold uppercase tracking-wide">Dólares USD:</div>
                    <div className="flex justify-between"><span>Gaveta Esperado:</span> <span>${dineroEnCajaExpected.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Recibido Real:</span> <span className="text-emerald-700 font-bold">${realUsd.toFixed(2)}</span></div>
                    <div className="flex justify-between border-t border-dashed border-slate-300 pt-1.5 font-bold text-slate-800">
                      <span>Diferencia:</span>
                      <span className={diffUsd >= 0 ? 'text-green-600' : 'text-red-650'}>
                        ${diffUsd.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono select-text space-y-1">
                    <div className="text-slate-600 font-sans text-[12px] mb-1.5 font-bold uppercase tracking-wide">Bolívares Bs:</div>
                    <div className="flex justify-between"><span>Gaveta Esperado:</span> <span>Bs {expectedVes.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Recibido Real:</span> <span className="text-purple-755 font-bold">Bs {realVes.toFixed(2)}</span></div>
                    <div className="flex justify-between border-t border-dashed border-slate-300 pt-1.5 font-bold text-slate-800">
                      <span>Diferencia:</span>
                      <span className={realVes - expectedVes >= 0 ? 'text-green-600' : 'text-red-650'}>
                        Bs {(realVes - expectedVes).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCierre(null)}
                  className="w-full bg-slate-900 hover:bg-slate-950 text-white font-extrabold py-3 rounded-lg font-sans text-xs uppercase tracking-wider transition-all"
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
        const iva = selectedSale.iva ?? 0;
        
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
        const isDev = selectedSale.factura_nro.startsWith('DEV-');

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800 animate-fade-in">
            <div className="bg-white border border-slate-355 rounded-xl overflow-hidden w-full max-w-4xl shadow-2xl flex flex-col">
              
              {/* Header Title Bar */}
              <div className={`${isDev ? 'bg-rose-900' : 'bg-winter-header'} text-white px-5 py-3 flex items-center justify-between`}>
                <h3 className="text-sm font-extrabold flex items-center gap-1.5 font-sans">
                  <ShoppingCart className="w-4 h-4 text-winter-blueBtn" />
                  {isDev ? 'DETALLE DE DEVOLUCIÓN' : 'DETALLE DE FACTURA / VENTA'}
                </h3>
                <button 
                  onClick={() => setSelectedSale(null)} 
                  className="text-white opacity-70 hover:opacity-100 text-xs font-sans"
                >
                  ✕ Cerrar [ESC]
                </button>
              </div>

              <div className="p-6 text-[10px] text-slate-700 leading-relaxed max-h-[75vh] overflow-y-auto bg-slate-50 space-y-4">
                
                {/* Meta details row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white border border-slate-200 p-4 rounded-lg shadow-sm font-sans">
                  <div>
                    <span className="text-slate-450 block text-[9px] uppercase">{isDev ? 'Devolución Nro' : 'Factura Nro'}</span>
                    <strong className="text-slate-800 text-xs block font-mono font-extrabold">{selectedSale.factura_nro}</strong>
                  </div>
                  <div>
                    <span className="text-slate-450 block text-[9px] uppercase">Fecha y Hora</span>
                    <strong className="text-slate-800 text-xs block font-mono font-medium">{selectedSale.fecha}</strong>
                  </div>
                  <div>
                    <span className="text-slate-455 block text-[9px] uppercase">Cliente</span>
                    <strong className="text-slate-800 text-xs block uppercase truncate">{selectedSale.client.nombre}</strong>
                  </div>
                  <div>
                    <span className="text-slate-455 block text-[9px] uppercase">Operador / Cajero</span>
                    <strong className="text-slate-800 text-xs block uppercase truncate">{selectedSale.usuario}</strong>
                  </div>
                </div>

                {/* Items Table */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                  <table className="w-full border-collapse text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-slate-555 font-sans uppercase text-[10px] font-bold">
                        <th className="px-4 py-3">{isDev ? 'PRODUCTO DEVUELTO' : 'PRODUCTO'}</th>
                        <th className="px-4 py-3 text-center">CANT</th>
                        <th className="px-4 py-3 text-right">{isDev ? 'PRECIO REF' : 'UNIT VENTA'}</th>
                        <th className="px-4 py-3 text-right">UNIT COSTO</th>
                        <th className="px-4 py-3 text-right">TOTAL {isDev ? 'DEVUELTO' : 'VENTA'}</th>
                        {!isDev && <th className="px-4 py-3 text-right text-emerald-700">UTILIDAD</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px] text-slate-750 font-mono select-text">
                      {itemsWithProfit.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 font-sans font-bold uppercase">{item.product.description}</td>
                          <td className={`px-4 py-2.5 text-center font-black ${isDev ? 'text-rose-700' : 'text-slate-850'}`}>{isDev ? '-' : ''}{item.qty}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">${item.priceUSD.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">${item.cost.toFixed(2)}</td>
                          <td className={`px-4 py-2.5 text-right font-bold ${isDev ? 'text-rose-600' : 'text-slate-900'}`}>
                            {isDev ? '-' : ''}${Math.abs(item.totalSale).toFixed(2)}
                          </td>
                          {!isDev && (
                            <td className={`px-4 py-2.5 text-right font-bold ${item.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              ${item.profit.toFixed(2)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals & Net Profit Breakdown Card */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Totals & Payments */}
                  <div className={`bg-white border border-slate-200 p-4 rounded-lg space-y-2 shadow-sm ${isDev ? 'md:col-span-2' : ''}`}>
                    <div className="font-bold text-[9px] text-slate-500 uppercase border-b border-slate-100 pb-1 font-sans">
                      {isDev ? 'Montos y Reembolso' : 'Montos y Pagos'}
                    </div>
                    <div className="space-y-1.5 text-[11px] text-slate-700">
                      <div className="flex justify-between">
                        <span>{isDev ? 'Subtotal Devuelto:' : 'Subtotal USD:'}</span>
                        <span>{isDev ? '-' : ''}$ {Math.abs(subtotal).toFixed(2)}</span>
                      </div>
                      {iva > 0 && (
                        <div className="flex justify-between text-slate-700">
                          <span>IVA (16%) USD:</span>
                          <span>$ {iva.toFixed(2)}</span>
                        </div>
                      )}
                      {descuento > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>Descuentos USD:</span>
                          <span>- $ {descuento.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-black text-slate-900 border-t border-dashed border-slate-200 pt-2 font-sans text-[13px] items-baseline">
                        <span>{isDev ? 'TOTAL REEMBOLSADO (USD):' : 'TOTAL FACTURADO:'}</span>
                        <span className={`${isDev ? 'text-rose-600' : 'text-winter-blueBtn'} font-mono font-black text-[15px]`}>
                          {isDev ? '-' : ''}$ {Math.abs(totalUSD).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-[8.5px] uppercase text-slate-450 font-bold mb-1 font-sans">
                        {isDev ? 'Método de Reembolso' : 'Métodos Aplicados'}
                      </div>
                      <div className="flex flex-wrap gap-1 font-sans">
                        {(selectedSale.pagos ?? []).map((p, idx) => (
                          <span key={idx} className="bg-slate-100 border border-slate-200 text-slate-700 px-2 py-1 rounded text-[10px] font-bold">
                            {p.metodo === 'Efectivo$' && isDev ? 'Reembolso $' : p.metodo}: ${Math.abs(p.monto).toFixed(2)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Profitability Panel */}
                  {!isDev && (
                    <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-lg space-y-3 shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="font-bold text-[9px] text-emerald-855 uppercase border-b border-emerald-250/60 pb-1 font-sans">
                          Rentabilidad de la Venta
                        </div>
                        <div className="space-y-2 pt-2 text-[11px] text-slate-700">
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
                        <div className="flex justify-between text-emerald-800 font-extrabold items-baseline">
                          <span className="uppercase text-[11px] font-black">UTILIDAD NETA:</span>
                          <span className="text-xl text-emerald-600 font-mono font-black">$ {totalProfit.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* EDIT CIERRE MODAL (ADMIN ONLY) */}
      {editingCierre && isAdmin && (() => {
        const handleSaveEditCierre = async (e: React.FormEvent) => {
          e.preventDefault();
          const newAperturaUsd = parseFloat(editAperturaUsd) || 0;
          const newAperturaVes = parseFloat(editAperturaVes) || 0;
          const newRealUsd = parseFloat(editRealUsd) || 0;
          const newRealVes = parseFloat(editRealVes) || 0;
          const newEntradaUsd = parseFloat(editEntradaUsd) || 0;
          const newEntradaVes = parseFloat(editEntradaVes) || 0;
          const newSalidaUsd = parseFloat(editSalidaUsd) || 0;
          const newSalidaVes = parseFloat(editSalidaVes) || 0;

          const oldAperturaUsd = editingCierre.aperturaUsd ?? 0;
          const oldEntradaUsd = editingCierre.entradaEfectivoUsd ?? 0;
          const oldSalidaUsd = editingCierre.salidaEfectivoUsd ?? 0;
          
          const oldExpectedUsd = editingCierre.dineroEnCajaExpected ?? (editingCierre as any).expectedUsd ?? 0;
          const newExpectedUsd = oldExpectedUsd - oldAperturaUsd - oldEntradaUsd + oldSalidaUsd + newAperturaUsd + newEntradaUsd - newSalidaUsd;
          
          const oldAperturaVes = editingCierre.aperturaVes ?? 0;
          const oldEntradaVes = editingCierre.entradaEfectivoVes ?? 0;
          const oldSalidaVes = editingCierre.salidaEfectivoVes ?? 0;
          const oldExpectedVes = editingCierre.expectedVes ?? 0;
          const newExpectedVes = oldExpectedVes - oldAperturaVes - oldEntradaVes + oldSalidaVes + newAperturaVes + newEntradaVes - newSalidaVes;

          const updatedCierre = {
            ...editingCierre,
            aperturaUsd: newAperturaUsd,
            aperturaVes: newAperturaVes,
            realUsd: newRealUsd,
            realVes: newRealVes,
            entradaEfectivoUsd: newEntradaUsd,
            entradaEfectivoVes: newEntradaVes,
            salidaEfectivoUsd: newSalidaUsd,
            salidaEfectivoVes: newSalidaVes,
            dineroEnCajaExpected: newExpectedUsd,
            expectedUsd: newExpectedUsd,
            expectedVes: newExpectedVes
          };

          const success = await onUpdateCierre(editingCierre.id, updatedCierre);
          if (success) {
            showAlert('Cierre de caja corregido y guardado exitosamente por el administrador.', 'Cierre Actualizado', 'success');
            setEditingCierre(null);
          } else {
            showAlert('Ocurrió un error al guardar la actualización del cierre en el servidor.', 'Error al Guardar', 'error');
          }
        };

        return (
          <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800">
            <div className="bg-white border border-amber-300 rounded-xl overflow-hidden w-full max-w-md shadow-2xl flex flex-col">
              
              {/* Header Title Bar */}
              <div className="bg-amber-600 text-white px-5 py-3.5 flex items-center justify-between">
                <h3 className="text-sm font-extrabold flex items-center gap-1.5 font-sans uppercase">
                  <ShieldAlert className="w-4 h-4 text-white" />
                  CORREGIR REGISTRO DE CIERRE (ADMIN)
                </h3>
                <button 
                  onClick={() => setEditingCierre(null)} 
                  className="text-white opacity-70 hover:opacity-100 text-xs font-sans"
                >
                  ✕ Cancelar
                </button>
              </div>

              <form onSubmit={handleSaveEditCierre} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto bg-slate-50 text-xs">
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded text-[10px] leading-relaxed font-sans font-medium">
                  ⚠️ ADVERTENCIA: Esta herramienta administrativa permite sobrescribir los valores inmutables reportados originalmente para auditar discrepancias. Úsela con responsabilidad.
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">APERTURA USD ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editAperturaUsd}
                      onChange={(e) => setEditAperturaUsd(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">APERTURA VES (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editAperturaVes}
                      onChange={(e) => setEditAperturaVes(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">EFECTIVO USD FISICO ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editRealUsd}
                      onChange={(e) => setEditRealUsd(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-emerald-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">EFECTIVO VES FISICO (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editRealVes}
                      onChange={(e) => setEditRealVes(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-purple-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">ENTRADAS EFECTIVO ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editEntradaUsd}
                      onChange={(e) => setEditEntradaUsd(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">SALIDAS EFECTIVO ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editSalidaUsd}
                      onChange={(e) => setEditSalidaUsd(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-red-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">ENTRADAS EFECTIVO (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editEntradaVes}
                      onChange={(e) => setEditEntradaVes(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">SALIDAS EFECTIVO (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editSalidaVes}
                      onChange={(e) => setEditSalidaVes(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-red-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCierre(null)}
                    className="w-1/2 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-lg font-bold font-sans text-xs transition-all"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all shadow"
                  >
                    GUARDAR CAMBIOS
                  </button>
                </div>
              </form>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
