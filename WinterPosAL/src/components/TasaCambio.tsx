import React, { useState } from 'react';
import { TasaHistoryItem, User } from '../types';
import { TrendingUp, Clock, Shuffle } from 'lucide-react';

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
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[400px]">
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2 font-sans">
                <Clock className="w-4 h-4 text-winter-clientesStart" />
                Historial de Modificaciones del Tipo de Cambio
              </h2>
              <span className="text-[10px] bg-slate-200 border border-slate-300 px-2.5 py-0.5 rounded text-slate-600 font-sans">
                {tasaHistory.length} registros
              </span>
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
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {[...tasaHistory].reverse().map(item => {
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
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
