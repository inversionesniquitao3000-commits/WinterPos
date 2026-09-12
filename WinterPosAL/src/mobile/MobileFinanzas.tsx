import { useState, useEffect } from 'react';
import { Briefcase, RefreshCw, Phone, MessageSquare, DollarSign, PlusCircle } from 'lucide-react';
import { getApiBaseUrl } from '../utils';
import MobileAbonoModal from './MobileAbonoModal';
import MobileGastoModal from './MobileGastoModal';

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

interface MobileFinanzasProps {
  tasaDia?: number;
  companyConfig?: any;
}

export default function MobileFinanzas({ tasaDia = 1, companyConfig }: MobileFinanzasProps) {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cxc' | 'cxp' | 'gastos'>('cxc');

  // Modal states
  const [selectedClientForAbono, setSelectedClientForAbono] = useState<any | null>(null);
  const [isGastoModalOpen, setIsGastoModalOpen] = useState(false);

  const activeTasa = tasaDia > 0 ? tasaDia : 1;
  const companyName = companyConfig?.nombre || 'WinterPOS';

  const fetchFinances = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/manager/financial-summary`);
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

  const handleSendWhatsAppCobranza = (debtor: any) => {
    let rawPhone = (debtor.telefono || '').replace(/\D/g, '');
    if (!rawPhone) {
      alert('Este cliente no tiene número telefónico registrado.');
      return;
    }

    // Format for Venezuelan numbers if needed (e.g. 0414 -> 58414)
    if (rawPhone.startsWith('0')) {
      rawPhone = '58' + rawPhone.slice(1);
    } else if (!rawPhone.startsWith('58') && rawPhone.length === 10) {
      rawPhone = '58' + rawPhone;
    }

    const deudaUSD = debtor.saldoPendiente || 0;
    const deudaVES = deudaUSD * activeTasa;

    const message = `Estimado(a) *${debtor.nombre}*, un saludo cordial de parte de *${companyName}*.\n\nLe recordamos amablemente que mantiene un saldo pendiente en cuenta de *$${deudaUSD.toFixed(2)}* (${deudaVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs).\n\nQuedamos a su entera disposición para coordinar o verificar su pago. ¡Agradecemos su preferencia!`;

    const waUrl = `https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  return (
    <div className="space-y-3 pb-20 pt-2 px-3">
      {/* Header Summary */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-amber-400" />
            Mando Financiero & Créditos
          </h2>
          <button
            onClick={() => {
              setLoading(true);
              fetchFinances();
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>

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
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Clientes con Saldo Pendiente
            </h3>
            <span className="text-[11px] text-amber-400 font-bold">
              {data?.topDebtors?.length || 0} deudor(es)
            </span>
          </div>

          {!data?.topDebtors || data.topDebtors.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-400 text-xs">
              🎉 No hay saldos pendientes en cuentas por cobrar.
            </div>
          ) : (
            data.topDebtors.map((d) => (
              <div key={d.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md space-y-2.5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                        {d.cedula_rif}
                      </span>
                      {d.telefono && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          <Phone className="w-2.5 h-2.5" />
                          {d.telefono}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-xs text-white leading-tight">{d.nombre}</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Límite de crédito: ${d.limiteCredito?.toFixed(2) || '0.00'}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-amber-400/80 block">Debe</span>
                    <span className="text-base font-black text-amber-300 font-mono">
                      ${d.saldoPendiente?.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono block">
                      {(d.saldoPendiente * activeTasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                    </span>
                  </div>
                </div>

                {/* Actions: Abonar & WhatsApp Cobranza */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                  <button
                    onClick={() => handleSendWhatsAppCobranza(d)}
                    className="py-1.5 px-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 hover:bg-emerald-900/60 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Recordar WhatsApp</span>
                  </button>

                  <button
                    onClick={() => setSelectedClientForAbono(d)}
                    className="py-1.5 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black flex items-center justify-center gap-1.5 transition shadow-sm active:scale-95"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Abonar Cuenta</span>
                  </button>
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
                    <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                      {p.rif}
                    </span>
                    {p.diasCredito > 0 && (
                      <span className="text-[10px] text-slate-400">
                        {p.diasCredito} días crédito
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-xs text-white">{p.razonSocial}</h4>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-rose-400/80 block">Por Pagar</span>
                  <span className="text-base font-black text-rose-400 font-mono">
                    ${p.saldoPendienteUSD?.toFixed(2)}
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
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Gastos Operativos
              </h3>
              <button
                onClick={() => setIsGastoModalOpen(true)}
                className="py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Registrar Gasto</span>
              </button>
            </div>

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

      {/* Modal Abono a Clientes CxC */}
      <MobileAbonoModal
        isOpen={Boolean(selectedClientForAbono)}
        onClose={() => setSelectedClientForAbono(null)}
        client={selectedClientForAbono}
        tasaDia={activeTasa}
        onSuccess={() => {
          fetchFinances();
        }}
      />

      {/* Modal Registrar Gasto Operativo */}
      <MobileGastoModal
        isOpen={isGastoModalOpen}
        onClose={() => setIsGastoModalOpen(false)}
        tasaDia={activeTasa}
        onSuccess={() => {
          fetchFinances();
        }}
      />
    </div>
  );
}

