import { useState, useEffect } from 'react';
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

  // Escape key listener to close details modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCierre(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

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

      {activeSubTab === 'ventas' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          <div className="bg-slate-55 border-b border-slate-200 px-5 py-3.5 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-sans">
              <ShoppingCart className="w-4 h-4 text-slate-450" />
              Facturas y Ventas Registradas
            </span>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-2.5 py-0.5 rounded border border-slate-300">
              {sales.length} facturas
            </span>
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
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-sans">
                      No se han procesado ventas en la sesión actual.
                    </td>
                  </tr>
                ) : (
                  [...sales].reverse().map(sale => (
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
                        <button
                          onClick={() => onReprintTicket(sale)}
                          className="bg-slate-55 border border-slate-200 text-slate-600 p-1.5 rounded hover:bg-slate-100 hover:text-slate-800 transition-all shadow-sm"
                          title="Reimprimir ticket fiscal"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
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
              {cierres.length} cierres
            </span>
          </div>

          <div className="flex-grow overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-slate-55 border-b border-slate-200">
                <tr className="text-slate-550">
                  <th className="px-4 py-3 font-bold font-sans">FECHA CIERRE</th>
                  <th className="px-4 py-3 font-bold font-sans">CAJERO</th>
                  <th className="px-4 py-3 text-right font-bold font-sans">APERTURA USD</th>
                  <th className="px-4 py-3 text-right font-bold font-sans">EFECTIVO USD</th>
                  <th className="px-4 py-3 text-right font-bold font-sans">VENTAS NETAS</th>
                  <th className="px-4 py-3 text-right font-bold font-sans">FISICO USD</th>
                  <th className="px-4 py-3 text-right font-bold font-sans">DIF USD</th>
                  <th className="px-4 py-3 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                {cierres.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-sans">
                      No se han registrado cierres de caja en el sistema.
                    </td>
                  </tr>
                ) : (
                  [...cierres].reverse().map(c => {
                    const dineroEnCajaExpected = c.dineroEnCajaExpected ?? (c as any).expectedUsd ?? 0;
                    const realUsd = c.realUsd ?? 0;
                    const diffUsd = realUsd - dineroEnCajaExpected;
                    const aperturaUsd = c.aperturaUsd ?? 0;
                    const ventasEfectivoUsd = c.ventasEfectivoUsd ?? 0;
                    const ventaTotalUsd = c.ventaTotalUsd ?? 0;

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono">{c.fecha}</td>
                        <td className="px-4 py-3 font-sans font-medium">{c.usuario}</td>
                        <td className="px-4 py-3 text-right font-mono">${aperturaUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono">${ventasEfectivoUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono">${ventaTotalUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono">${realUsd.toFixed(2)}</td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${diffUsd >= 0 ? 'text-green-600' : 'text-red-655'}`}>
                          ${diffUsd.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedCierre(c)}
                            className="bg-slate-55 border border-slate-200 text-slate-600 p-1.5 rounded hover:bg-slate-100 hover:text-slate-800 transition-all shadow-sm flex items-center gap-1 font-sans text-[10px]"
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
        const ventasEfectivoUsd = selectedCierre.ventasEfectivoUsd ?? 0;
        const abonoClientesUsd = selectedCierre.abonoClientesUsd ?? 0;
        const entradaEfectivoUsd = selectedCierre.entradaEfectivoUsd ?? 0;
        const salidaEfectivoUsd = selectedCierre.salidaEfectivoUsd ?? 0;
        const devolucionEfectivoUsd = selectedCierre.devolucionEfectivoUsd ?? 0;
        
        const ventasTotalesUsd = selectedCierre.ventasTotalesUsd ?? 0;
        const descuentosUsd = selectedCierre.descuentosUsd ?? 0;
        const ventaBrutaUsd = selectedCierre.ventaBrutaUsd ?? 0;
        
        const pagosEfectivoUsd = selectedCierre.pagosEfectivoUsd ?? 0;
        const pagosTarjetaUsd = selectedCierre.pagosTarjetaUsd ?? 0;
        const pagosCreditoUsd = selectedCierre.pagosCreditoUsd ?? 0;
        const pagosPuntosUsd = selectedCierre.pagosPuntosUsd ?? 0;
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
                      <span className="font-bold text-slate-800">$ {aperturaUsd.toFixed(2)}</span>
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

                  <div className="space-y-1.5 pt-1 font-mono">
                    <div className="flex justify-between">
                      <span>En Efectivo :</span>
                      <span className="font-bold text-slate-800">$ {pagosEfectivoUsd.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span>Con Tarjeta :</span>
                      <span className="font-bold text-slate-800">$ {pagosTarjetaUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>A Crédito :</span>
                      <span className="font-bold text-slate-800">$ {pagosCreditoUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Con Puntos :</span>
                      <span className="font-bold text-slate-800">$ {pagosPuntosUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-red-550">
                      <span>Devolución Ventas :</span>
                      <span>- $ {devolucionVentasUsd.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-300 pt-2 font-bold font-sans">
                    <div className="flex justify-between text-sm text-slate-900 font-black">
                      <span className="uppercase text-[10px]">Venta Total :</span>
                      <span className="text-base text-winter-blueBtn font-mono">$ {ventaTotalUsd.toFixed(2)}</span>
                    </div>
                    <div className="text-[7.5px] text-slate-450 italic mt-0.5 leading-tight font-medium uppercase tracking-tighter text-right">
                      {formatNumberToWordsUSD(ventaTotalUsd)}
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

    </div>
  );
}
