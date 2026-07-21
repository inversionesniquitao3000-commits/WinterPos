import React, { useState } from 'react';
import { TasaHistoryItem, User } from '../types';
import { TrendingUp, Clock, Shuffle, FileDown, Search, Calendar } from 'lucide-react';

interface TasaCambioProps {
  tasaDia: number;
  tasaVuelto: number;
  tasaHistory: TasaHistoryItem[];
  currentUser: User;
  onUpdateTasa: (newDia: number, newVuelto: number) => void;
}

export default function TasaCambio({ tasaDia, tasaVuelto, tasaHistory, currentUser: _currentUser, onUpdateTasa }: TasaCambioProps) {
  const [inputDia, setInputDia] = useState(tasaDia > 0 ? tasaDia.toString() : '');
  const [inputVuelto, setInputVuelto] = useState(tasaVuelto > 0 ? tasaVuelto.toString() : '');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filtering states
  const [searchOperator, setSearchOperator] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');

  // Filtering logic
  const filteredHistory = tasaHistory.filter(item => {
    // Operator search (case insensitive)
    if (searchOperator) {
      const opName = (item.usuario || '').toLowerCase();
      if (!opName.includes(searchOperator.toLowerCase())) {
        return false;
      }
    }
    
    // Date filters (substring prefix match of date yyyy-mm-dd)
    if (item.fecha_actualizacion) {
      const itemDateOnly = item.fecha_actualizacion.substring(0, 10); // "YYYY-MM-DD"
      if (searchDateFrom && itemDateOnly < searchDateFrom) {
        return false;
      }
      if (searchDateTo && itemDateOnly > searchDateTo) {
        return false;
      }
    }
    
    return true;
  });

  // Reversing to show most recent first
  const sortedFiltered = [...filteredHistory].reverse();
  const displayedHistory = sortedFiltered.slice(0, 20);

  const handleDownloadReport = () => {
    const title = `Reporte de Historial de Tipo de Cambio`;
    const dateStr = new Date().toLocaleString();
    const reportRows = sortedFiltered;

    let tableRowsHtml = "";
    reportRows.forEach(item => {
      const diff = item.tasa_cobro - item.tasa_vuelto;
      tableRowsHtml += `
        <tr>
          <td style="font-family: monospace; font-size: 10px;">${item.fecha_actualizacion}</td>
          <td style="text-align: right; font-weight: bold; font-family: monospace; color: #047857;">${item.tasa_cobro.toFixed(2)} Bs</td>
          <td style="text-align: right; font-weight: bold; font-family: monospace; color: #6d28d9;">${item.tasa_vuelto.toFixed(2)} Bs</td>
          <td style="text-align: center; font-weight: bold; font-family: monospace; color: ${diff > 0 ? '#c2410c' : '#047857'};">
            ${diff.toFixed(2)} Bs
          </td>
          <td>${item.usuario}</td>
        </tr>
      `;
    });

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("No se pudo abrir la ventana del reporte. Habilite las ventanas emergentes (popups) en su navegador.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
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
              margin-top: 10px;
            }
            .report-table th {
              background-color: #f1f5f9;
              border: 1px solid #cbd5e1;
              padding: 6px 8px;
              font-weight: bold;
              text-align: left;
              text-transform: uppercase;
              font-size: 9px;
              color: #475569;
            }
            .report-table td {
              border: 1px solid #e2e8f0;
              padding: 6px 8px;
            }
            .report-table tr:nth-child(even) {
              background-color: #f8fafc;
            }
            .report-summary {
              margin-top: 20px;
              border-top: 1px solid #cbd5e1;
              padding-top: 8px;
              text-align: right;
              font-size: 10px;
            }
            @media print {
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-left">
              <h1>INVERSIONES NIQUITAO 3000 C.A.</h1>
              <p>RIF: J-41132631 | Tel: 0424-2042877</p>
            </div>
            <div class="header-right">
              <p><strong>Fecha Reporte:</strong> ${dateStr}</p>
              <p><strong>Filtros:</strong> ${searchOperator ? `Operador: ${searchOperator}` : 'Todos los operadores'} ${searchDateFrom ? `Desde: ${searchDateFrom}` : ''} ${searchDateTo ? `Hasta: ${searchDateTo}` : ''}</p>
            </div>
          </div>

          <h2>Historial de Modificaciones del Tipo de Cambio</h2>
          
          <table class="report-table">
            <thead>
              <tr>
                <th>Fecha/Hora</th>
                <th style="text-align: right;">Tasa Cobro</th>
                <th style="text-align: right;">Tasa Vuelto</th>
                <th style="text-align: center;">Diferencia</th>
                <th>Operador</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml || '<tr><td colspan="5" style="text-align: center;">No hay registros para mostrar con los filtros aplicados.</td></tr>'}
            </tbody>
          </table>

          <div class="report-summary">
            <p><strong>Total de Registros en Reporte:</strong> ${reportRows.length}</p>
          </div>

          <div class="no-print" style="margin-top: 20px; text-align: center;">
            <button onclick="window.print()" style="background: #0f172a; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; font-family: sans-serif; font-size: 11px;">
              Imprimir / Guardar como PDF
            </button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const valDia = parseFloat(inputDia);
    const valVuelto = inputVuelto ? parseFloat(inputVuelto) : valDia;

    if (isNaN(valDia) || valDia <= 0) {
      setErrorMsg('La Tasa del Día es obligatoria y debe ser mayor que 0.');
      return;
    }
    
    if (isNaN(valVuelto) || valVuelto <= 0) {
      setErrorMsg('La Tasa de Vuelto debe ser mayor que 0.');
      return;
    }

    onUpdateTasa(valDia, valVuelto);
    setSuccessMsg('Tasas de cambio actualizadas exitosamente en el sistema.');
  };

  const handleClear = () => {
    setInputDia('');
    setInputVuelto('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  return (
    <div className="space-y-6 text-slate-800 font-mono text-xs">
      
      {/* HEADER */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-extrabold text-winter-clientesStart tracking-wider flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-winter-clientesStart" />
          TASAS DE CAMBIO (AUDITORÍA DIARIA)
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-sans">
          Establezca las tasas cambiarias de cobro y de vuelto del día en bolívares para las conversiones automáticas del POS.
        </p>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-xs font-sans">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-250 text-emerald-700 px-4 py-3 rounded-lg text-xs font-sans">
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* EDIT RATES COLUMN */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Active Rates Card - Light Styled */}
          <div className="bg-white border border-slate-200 p-5 rounded-xl space-y-4 shadow-sm">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2 font-sans">
              Tasas Activas Hoy (Bs/$)
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block font-sans">Tasa de Cobro (Día)</span>
                <span className="text-2xl font-black text-emerald-700 font-mono">
                  {tasaDia > 0 ? `${tasaDia.toFixed(2)} Bs` : '—'}
                </span>
                <span className="text-[9px] text-slate-400 block mt-1 font-sans">Aplicada al recibir pagos</span>
              </div>
              <div className="bg-slate-55 p-4 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block font-sans">Tasa de Vuelto</span>
                <span className="text-2xl font-black text-purple-750 font-mono">
                  {tasaVuelto > 0 ? `${tasaVuelto.toFixed(2)} Bs` : '—'}
                </span>
                <span className="text-[9px] text-slate-400 block mt-1 font-sans">Aplicada al entregar vuelto</span>
              </div>
            </div>
          </div>

          {/* Rate Update Form - Light Styled */}
          <div className="bg-white border border-slate-200 p-5 rounded-xl space-y-4 shadow-sm">
            <h2 className="text-xs font-bold text-slate-550 uppercase tracking-widest border-b border-slate-100 pb-2 font-sans">
              Registrar Actualización Cambiaria
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1 font-sans">Tasa de Cobro (Bs / $ USD)</label>
                <div className="flex bg-slate-50 rounded border border-slate-300 items-center focus-within:bg-white focus-within:border-winter-clientesStart transition-all">
                  <span className="bg-slate-200 px-3 py-1.5 text-xs text-slate-700 border-r border-slate-300 font-bold">Bs</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Ej: 40.00"
                    value={inputDia}
                    onChange={(e) => setInputDia(e.target.value)}
                    className="bg-transparent border-none text-slate-800 text-xs px-3 py-1.5 w-full font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-1 font-sans">
                  Tasa de Vuelto (Bs / $ USD) <span className="text-slate-400 font-sans font-normal">(Opcional, copia Cobro si está vacía)</span>
                </label>
                <div className="flex bg-slate-55 rounded border border-slate-300 items-center focus-within:bg-white focus-within:border-winter-clientesStart transition-all">
                  <span className="bg-slate-200 px-3 py-1.5 text-xs text-slate-700 border-r border-slate-300 font-bold">Bs</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Ej: 39.50"
                    value={inputVuelto}
                    onChange={(e) => setInputVuelto(e.target.value)}
                    className="bg-transparent border-none text-slate-800 text-xs px-3 py-1.5 w-full font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-600 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Limpiar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-winter-clientesStart hover:bg-winter-clientesEnd text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
                >
                  CONFIRMAR ACTUALIZACIÓN
                </button>
              </div>
            </form>
          </div>

        </div>

        {/* LOG HISTORY COLUMN */}
        <div className="lg:col-span-7">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2 font-sans">
                <Clock className="w-4 h-4 text-winter-clientesStart" />
                Historial de Modificaciones del Tipo de Cambio
              </h2>
              <span className="text-[10px] bg-slate-200 border border-slate-300 px-2.5 py-0.5 rounded text-slate-600 font-sans">
                {displayedHistory.length === filteredHistory.length 
                  ? `${filteredHistory.length} registros` 
                  : `Mostrando ${displayedHistory.length} de ${filteredHistory.length} registros`
                }
              </span>
            </div>

            {/* FILTERS SECTION */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-sans block uppercase font-bold flex items-center gap-1">
                  <Search className="w-3 h-3" /> Operador
                </label>
                <input
                  type="text"
                  placeholder="Buscar operador..."
                  value={searchOperator}
                  onChange={(e) => setSearchOperator(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-[11px] font-sans outline-none focus:border-winter-clientesStart focus:ring-1 focus:ring-winter-clientesStart"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-sans block uppercase font-bold flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Desde
                </label>
                <input
                  type="date"
                  value={searchDateFrom}
                  onChange={(e) => setSearchDateFrom(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-0.5 text-[11px] font-sans outline-none focus:border-winter-clientesStart focus:ring-1 focus:ring-winter-clientesStart"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-sans block uppercase font-bold flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Hasta
                </label>
                <input
                  type="date"
                  value={searchDateTo}
                  onChange={(e) => setSearchDateTo(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-0.5 text-[11px] font-sans outline-none focus:border-winter-clientesStart focus:ring-1 focus:ring-winter-clientesStart"
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white py-1.5 px-3 rounded font-bold font-sans text-[10px] tracking-wider transition-all flex items-center justify-center gap-1 shadow-sm"
                  title="Generar y abrir reporte de auditoría PDF de tipo de cambio"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Reporte
                </button>
              </div>
            </div>

            <div className="flex-grow overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-555">
                  <tr>
                    <th className="px-4 py-3 font-sans uppercase">Fecha/Hora</th>
                    <th className="px-4 py-3 text-right font-sans uppercase">Tasa Cobro</th>
                    <th className="px-4 py-3 text-right font-sans uppercase">Tasa Vuelto</th>
                    <th className="px-4 py-3 text-center font-sans uppercase">Diferencia</th>
                    <th className="px-4 py-3 font-sans uppercase">Operador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 select-text">
                  {displayedHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-400 font-sans">
                        No se encontraron modificaciones con los filtros ingresados.
                      </td>
                    </tr>
                  ) : (
                    displayedHistory.map(item => {
                      const diff = item.tasa_cobro - item.tasa_vuelto;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-mono text-slate-450">{item.fecha_actualizacion}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{item.tasa_cobro.toFixed(2)} Bs</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-purple-750">{item.tasa_vuelto.toFixed(2)} Bs</td>
                          <td className="px-4 py-3 text-center font-mono font-bold">
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border ${
                              diff > 0 
                                ? 'bg-orange-50 border-orange-200 text-orange-700' 
                                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            }`}>
                              <Shuffle className="w-2.5 h-2.5" />
                              {diff.toFixed(2)} Bs
                            </span>
                          </td>
                          <td className="px-4 py-3 font-sans">{item.usuario}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
