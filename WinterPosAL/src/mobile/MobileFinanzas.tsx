import { useState, useEffect } from 'react';
import { Briefcase, RefreshCw, Phone } from 'lucide-react';

interface FinancialData {
  totalCxC_USD: number;
  totalCxP_USD: number;
  topDebtors: Array<{
    id: number;
    nombre: string;
    cedula_rif: string;
    telefono: string;
    saldoPendiente: number;
    limiteCredito: number;
  }>;
  topCreditors: Array<{
    id: number;
    razonSocial: string;
    rif: string;
    telefono: string;
    saldoPendienteUSD: number;
    diasCredito: number;
  }>;
  totalGastosUSD: number;
  totalInversionesUSD: number;
  accionistasCount: number;
  gastosRecientes: Array<{
    id: number;
    concepto: string;
    monto_usd: number;
    fecha?: string;
  }>;
}

export default function MobileFinanzas() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cxc' | 'cxp' | 'gastos'>('cxc');

  const fetchFinances = async () => {
    try {
      const res = await fetch('/api/manager/financial-summary');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Error fetching financial summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinances();
  }, []);

  return (
    <div className="space-y-3 pb-20 pt-2 px-3">
      {/* Header Summary */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 rounded-2xl p-4 shadow-lg">
        <h2 className="text-base font-black text-white flex items-center gap-2 mb-3">
          <Briefcase className="w-5 h-5 text-amber-400" />
          Mando Financiero y Créditos
        </h2>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800/80 rounded-xl p-3 border border-amber-900/30">
            <span className="text-[10px] text-amber-300/80 font-bold uppercase block">
              CxC (Por Cobrar)
            </span>
            <span className="text-xl font-black text-amber-400 font-mono">
              ${data?.totalCxC_USD?.toFixed(2) || '0.00'}
            </span>
          </div>

          <div className="bg-slate-800/80 rounded-xl p-3 border border-rose-900/30">
            <span className="text-[10px] text-rose-300/80 font-bold uppercase block">
              CxP (Por Pagar)
            </span>
            <span className="text-xl font-black text-rose-400 font-mono">
              ${data?.totalCxP_USD?.toFixed(2) || '0.00'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-bold">
        <button
          onClick={() => setActiveTab('cxc')}
          className={`py-2 rounded-lg transition ${
            activeTab === 'cxc' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Clientes (CxC)
        </button>

        <button
          onClick={() => setActiveTab('cxp')}
          className={`py-2 rounded-lg transition ${
            activeTab === 'cxp' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Proveedores (CxP)
        </button>

        <button
          onClick={() => setActiveTab('gastos')}
          className={`py-2 rounded-lg transition ${
            activeTab === 'gastos' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Gastos / Socios
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-xs font-semibold">Cargando estado financiero...</p>
        </div>
      ) : activeTab === 'cxc' ? (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
            Top Clientes con Saldo Pendiente
          </h3>

          {!data?.topDebtors || data.topDebtors.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-400 text-xs">
              🎉 No hay saldos pendientes en cuentas por cobrar.
            </div>
          ) : (
            data.topDebtors.map((d) => (
              <div key={d.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">
                      {d.cedula_rif}
                    </span>
                    {d.telefono ? (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Phone className="w-2.5 h-2.5" />
                        {d.telefono}
                      </span>
                    ) : null}
                  </div>
                  <h4 className="font-bold text-xs text-white">{d.nombre}</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Límite: ${d.limiteCredito.toFixed(2)}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-amber-400/80 block">Debe</span>
                  <span className="text-base font-black text-amber-300 font-mono">
                    ${d.saldoPendiente.toFixed(2)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : activeTab === 'cxp' ? (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
            Cuentas por Pagar a Proveedores
          </h3>

          {!data?.topCreditors || data.topCreditors.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-400 text-xs">
              🎉 No hay deudas pendientes con proveedores.
            </div>
          ) : (
            data.topCreditors.map((p) => (
              <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">
                      {p.rif}
                    </span>
                    {p.diasCredito > 0 ? (
                      <span className="text-[10px] text-slate-400">
                        {p.diasCredito} días crédito
                      </span>
                    ) : null}
                  </div>
                  <h4 className="font-bold text-xs text-white">{p.razonSocial}</h4>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-rose-400/80 block">Por Pagar</span>
                  <span className="text-base font-black text-rose-400 font-mono">
                    ${p.saldoPendienteUSD.toFixed(2)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Inversiones overview */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Patrimonio de Accionistas
            </h3>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Accionistas Registrados:</span>
              <strong className="text-white font-mono">{data?.accionistasCount || 0}</strong>
            </div>
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="text-slate-400">Capital Total Invertido:</span>
              <strong className="text-emerald-400 font-mono">${data?.totalInversionesUSD?.toFixed(2) || '0.00'}</strong>
            </div>
          </div>

          {/* Gastos Recientes */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Gastos Operativos Registrados
            </h3>
            <div className="text-lg font-black text-rose-400 font-mono mb-3">
              Total: ${data?.totalGastosUSD?.toFixed(2) || '0.00'}
            </div>

            <div className="space-y-1.5 text-xs">
              {data?.gastosRecientes && data.gastosRecientes.length > 0 ? (
                data.gastosRecientes.map((g, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-800/60 border border-slate-800">
                    <span className="text-slate-200 font-medium truncate pr-2">{g.concepto}</span>
                    <span className="font-bold text-rose-400 font-mono flex-shrink-0">${parseFloat(String(g.monto_usd)).toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-400 text-center py-2">No hay gastos recientes registrados.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
