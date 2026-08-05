import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Briefcase, Plus, Users, Calculator, History, Table, DollarSign, Calendar, FileText, 
  Trash2, Edit, X, RefreshCw, Download, Check, ShieldCheck, ShieldAlert, PieChart, Sparkles, Copy,
  Camera, Send, Share2, Receipt
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { Accionista, InversionAccionista, GastoOperativo } from '../types';
import { fetchApiData, postApiData, deleteApiData, getLocalISODateString } from '../utils';

interface InversionesModuloProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  inline?: boolean;
  subTab?: 'matriz' | 'historial' | 'utilidades' | 'accionistas';
  onSubTabChange?: (tab: 'matriz' | 'historial' | 'utilidades' | 'accionistas') => void;
  tasaDia?: number;
  companyConfig?: any;
}

export const InversionesModulo: React.FC<InversionesModuloProps> = ({
  isOpen,
  onClose,
  currentUser,
  inline = false,
  subTab: controlledSubTab,
  onSubTabChange,
  tasaDia,
  companyConfig
}) => {
  // Internal sub-tab state (used only when not controlled externally)
  const [internalSubTab, setInternalSubTab] = useState<'matriz' | 'historial' | 'utilidades' | 'accionistas'>('matriz');

  // Use controlled sub-tab if provided (persists across navigation), else use internal
  const activeTab = controlledSubTab ?? internalSubTab;
  const setActiveTab = (tab: 'matriz' | 'historial' | 'utilidades' | 'accionistas') => {
    if (onSubTabChange) {
      onSubTabChange(tab);
    } else {
      setInternalSubTab(tab);
    }
  };

  const [accionistas, setAccionistas] = useState<Accionista[]>([]);
  const [inversiones, setInversiones] = useState<InversionAccionista[]>([]);
  const [gastos, setGastos] = useState<GastoOperativo[]>([]);
  const [loading, setLoading] = useState(false);

  // Manual Profit input for utility distribution helper
  const [montoUtilidadInput, setMontoUtilidadInput] = useState<string>('293.84');
  
  // Modals state
  const [showAddInversionModal, setShowAddInversionModal] = useState(false);
  const [showAddAccionistaModal, setShowAddAccionistaModal] = useState(false);
  const [editingInversion, setEditingInversion] = useState<InversionAccionista | null>(null);

  // Form states for Gasto Operativo
  const [showAddGastoModal, setShowAddGastoModal] = useState(false);
  const [editingGasto, setEditingGasto] = useState<GastoOperativo | null>(null);
  const [formGastoConcepto, setFormGastoConcepto] = useState<string>('⚡ Luz / Electricidad');
  const [formGastoMontoUsd, setFormGastoMontoUsd] = useState<string>('');
  const [formGastoFecha, setFormGastoFecha] = useState<string>(() => getLocalISODateString().split(' ')[0]);
  const [formGastoObservacion, setFormGastoObservacion] = useState<string>('');

  // Form states for Aporte
  const [formAccionistaId, setFormAccionistaId] = useState<number | string>('');
  const [formFecha, setFormFecha] = useState<string>(() => getLocalISODateString().split(' ')[0]);
  const [formMontoUsd, setFormMontoUsd] = useState<string>('');
  const [formObservacion, setFormObservacion] = useState<string>('');

  // Form states for Accionista
  const [formNombreAccionista, setFormNombreAccionista] = useState<string>('');
  const [formCedulaAccionista, setFormCedulaAccionista] = useState<string>('');
  const [formTelefonoAccionista, setFormTelefonoAccionista] = useState<string>('');

  // Toast / Copy notification
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Accionista editing & delete state
  const [editingAccionista, setEditingAccionista] = useState<Accionista | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ accionista: Accionista; capital: number } | null>(null);

  // Wipe modal states
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeConfirmWord, setWipeConfirmWord] = useState('');
  const [wipeLoading, setWipeLoading] = useState(false);

  const reportContainerRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accRes, invRes, gastosRes] = await Promise.all([
        fetchApiData('/inversiones/accionistas').catch(() => []),
        fetchApiData('/inversiones').catch(() => []),
        fetchApiData('/gastos').catch(() => [])
      ]);
      setAccionistas(Array.isArray(accRes) ? accRes : []);
      setInversiones(Array.isArray(invRes) ? invRes : []);
      setGastos(Array.isArray(gastosRes) ? gastosRes : []);
    } catch (err) {
      console.error('Error al cargar datos de inversiones y gastos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showWipeModal) {
          setShowWipeModal(false);
          setWipeConfirmWord('');
        } else if (showAddInversionModal) {
          setShowAddInversionModal(false);
          setEditingInversion(null);
        } else if (showAddAccionistaModal) {
          setShowAddAccionistaModal(false);
          setEditingAccionista(null);
        } else if (deleteConfirm) {
          setDeleteConfirm(null);
        } else if (!inline && onClose) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showWipeModal, showAddInversionModal, showAddAccionistaModal, deleteConfirm, inline, onClose]);

  if (!isOpen) return null;

  // Calculate totals per shareholder safely
  const accionistasTotales: { [accionistaId: number]: number } = {};
  (accionistas || []).forEach(a => {
    if (a && a.id) {
      accionistasTotales[a.id] = 0;
    }
  });

  (inversiones || []).forEach(inv => {
    if (inv && accionistasTotales[inv.accionista_id] !== undefined) {
      accionistasTotales[inv.accionista_id] += Number(inv.monto_usd || 0);
    }
  });

  const capitalGlobalTotal = Object.values(accionistasTotales).reduce((acc, curr) => acc + curr, 0);

  // Handle Create / Edit Aporte
  const handleSaveInversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAccionistaId || !formFecha || !formMontoUsd) {
      alert('Por favor complete los campos requeridos (Accionista, Fecha y Monto).');
      return;
    }

    try {
      const payload = {
        id: editingInversion?.id,
        accionista_id: Number(formAccionistaId),
        fecha: formFecha,
        monto_usd: parseFloat(formMontoUsd),
        observacion: formObservacion
      };

      const res = await postApiData('/inversiones', payload);
      if (res) {
        await loadData();
        setShowAddInversionModal(false);
        setEditingInversion(null);
        setFormMontoUsd('');
        setFormObservacion('');
      }
    } catch (err: any) {
      alert('Error al guardar inversión: ' + (err.message || 'Intente nuevamente'));
    }
  };

  const handleEditInversionClick = (inv: InversionAccionista) => {
    setEditingInversion(inv);
    setFormAccionistaId(inv.accionista_id);
    setFormFecha(inv.fecha);
    setFormMontoUsd(inv.monto_usd.toString());
    setFormObservacion(inv.observacion || '');
    setShowAddInversionModal(true);
  };

  const handleDeleteInversionClick = async (id: number) => {
    if (!window.confirm('¿Está seguro de eliminar este registro de inversión?')) return;
    try {
      await deleteApiData(`/inversiones/${id}`);
      await loadData();
    } catch (err: any) {
      alert('Error al eliminar inversión: ' + err.message);
    }
  };

  // Handle Save Accionista (create or edit)
  const handleSaveAccionista = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNombreAccionista.trim()) {
      alert('El nombre del accionista es requerido.');
      return;
    }

    try {
      const payload: any = {
        nombre: formNombreAccionista.trim(),
        cedula_rif: formCedulaAccionista.trim(),
        telefono: formTelefonoAccionista.trim(),
        estado: 'Activo'
      };
      if (editingAccionista) {
        payload.id = editingAccionista.id;
      }

      const res = await postApiData('/inversiones/accionistas', payload);
      if (res) {
        await loadData();
        setShowAddAccionistaModal(false);
        setEditingAccionista(null);
        setFormNombreAccionista('');
        setFormCedulaAccionista('');
        setFormTelefonoAccionista('');
      }
    } catch (err: any) {
      alert((editingAccionista ? 'Error al actualizar accionista: ' : 'Error al crear accionista: ') + err.message);
    }
  };

  const handleEditAccionistaClick = (a: Accionista) => {
    setEditingAccionista(a);
    setFormNombreAccionista(a.nombre);
    setFormCedulaAccionista(a.cedula_rif || '');
    setFormTelefonoAccionista(a.telefono || '');
    setShowAddAccionistaModal(true);
  };

  const handleDeleteAccionistaClick = (a: Accionista) => {
    const capital = accionistasTotales[a.id] || 0;
    setDeleteConfirm({ accionista: a, capital });
  };

  const handleConfirmDeleteAccionista = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteApiData(`/inversiones/accionistas/${deleteConfirm.accionista.id}`);
      await loadData();
      setDeleteConfirm(null);
    } catch (err: any) {
      alert('Error al eliminar accionista: ' + err.message);
      setDeleteConfirm(null);
    }
  };

  // Gastos Operativos Handlers
  const handleSaveGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formGastoConcepto || !formGastoMontoUsd) {
      alert('Por favor complete los campos requeridos (Concepto y Monto).');
      return;
    }

    try {
      const payload = {
        id: editingGasto?.id,
        concepto: formGastoConcepto,
        monto_usd: parseFloat(formGastoMontoUsd),
        fecha: formGastoFecha || getLocalISODateString().split(' ')[0],
        observacion: formGastoObservacion
      };

      const res = await postApiData('/gastos', payload);
      if (res && !res.error) {
        setShowAddGastoModal(false);
        setEditingGasto(null);
        setFormGastoConcepto('⚡ Luz / Electricidad');
        setFormGastoMontoUsd('');
        setFormGastoObservacion('');
        loadData();
      }
    } catch (err) {
      console.error('Error al guardar gasto:', err);
      alert('Error al guardar el gasto operativo.');
    }
  };

  const handleEditGastoClick = (gasto: GastoOperativo) => {
    setEditingGasto(gasto);
    setFormGastoConcepto(gasto.concepto);
    setFormGastoMontoUsd(gasto.monto_usd.toString());
    setFormGastoFecha(gasto.fecha || getLocalISODateString().split(' ')[0]);
    setFormGastoObservacion(gasto.observacion || '');
    setShowAddGastoModal(true);
  };

  const handleDeleteGastoClick = async (gasto: GastoOperativo) => {
    if (!confirm(`¿Desea eliminar el gasto "${gasto.concepto}" por $${gasto.monto_usd.toFixed(2)} USD?`)) return;
    try {
      await deleteApiData(`/gastos/${gasto.id}`);
      loadData();
    } catch (err) {
      console.error('Error al eliminar gasto:', err);
    }
  };

  const totalGastosUSD = useMemo(() => {
    if (!Array.isArray(gastos)) return 0;
    return gastos.reduce((acc, g) => acc + (g?.monto_usd || 0), 0);
  }, [gastos]);

  // Unique dates list for Matrix view
  const fechasUnicas = useMemo(() => {
    return Array.from(new Set((inversiones || []).map(i => i?.fecha))).filter(Boolean).sort();
  }, [inversiones]);

  const effectiveTasa = tasaDia && tasaDia > 0 ? tasaDia : 1;
  const utilidadBrutaNum = parseFloat(montoUtilidadInput) || 0;
  const totalGastosVES = totalGastosUSD * effectiveTasa;
  const utilidadBrutaVES = utilidadBrutaNum * effectiveTasa;
  const utilidadNetaUSD = Math.max(0, utilidadBrutaNum - totalGastosUSD);
  const utilidadNetaVES = utilidadNetaUSD * effectiveTasa;

  const handleDownloadReportImage = async () => {
    if (!reportContainerRef.current) return;
    try {
      const dataUrl = await toPng(reportContainerRef.current, { quality: 0.95, cacheBust: true });
      const link = document.createElement('a');
      link.download = `reporte_utilidades_y_gastos_${getLocalISODateString().split(' ')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error al generar la imagen:', err);
      alert('Error al capturar la imagen del reporte.');
    }
  };

  const handleSendWhatsAppReport = () => {
    const dateStr = getLocalISODateString().split(' ')[0];
    const companyName = companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.';
    
    let text = `💼 *REPORTE DE UTILIDADES Y GASTOS OPERATIVOS*\n`;
    text += `🏬 *${companyName}*\n`;
    text += `📅 *Fecha:* ${dateStr}\n`;
    if (effectiveTasa > 1) {
      text += `💱 *Tasa BCV:* ${effectiveTasa.toFixed(2)} Bs/USD\n`;
    }
    text += `----------------------------------\n`;
    text += `📊 *RESUMEN FINANCIERO:*\n`;
    text += `📈 *Utilidad Bruta:* $${utilidadBrutaNum.toFixed(2)} USD | Bs ${utilidadBrutaVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES\n`;
    text += `🔻 *(-) Gastos Deducibles:* -$${totalGastosUSD.toFixed(2)} USD | -Bs ${totalGastosVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES\n`;
    text += `💰 *(=) Utilidad Neta Distribuable:* *$${utilidadNetaUSD.toFixed(2)} USD* | *Bs ${utilidadNetaVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES*\n`;
    
    if (gastos.length > 0) {
      text += `----------------------------------\n`;
      text += `📝 *DESGLOSE DE GASTOS OPERATIVOS (${gastos.length}):*\n`;
      gastos.forEach(g => {
        const mBs = g.monto_usd * effectiveTasa;
        text += `• *${g.concepto}:* $${g.monto_usd.toFixed(2)} USD (Bs ${mBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
        if (g.observacion) text += ` - _${g.observacion}_`;
        text += `\n`;
      });
    }

    text += `----------------------------------\n`;
    text += `👥 *DISTRIBUCIÓN A ACCIONISTAS:*\n`;
    
    accionistas.forEach((a, idx) => {
      const mtoInv = accionistasTotales[a.id] || 0;
      const pctInv = capitalGlobalTotal > 0 ? (mtoInv / capitalGlobalTotal) * 100 : 0;
      const mtoCobrarUsd = (mtoInv / (capitalGlobalTotal || 1)) * utilidadNetaUSD;
      const mtoCobrarVes = mtoCobrarUsd * effectiveTasa;
      
      text += `${idx + 1}. *${a.nombre}* (${pctInv.toFixed(2)}% Inv)\n`;
      text += `   - Capital: $${mtoInv.toFixed(2)} USD\n`;
      text += `   - *Monto a Cobrar:* *$${mtoCobrarUsd.toFixed(2)} USD* | *Bs ${mtoCobrarVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES*\n\n`;
    });

    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const handleCopyUtilidades = () => {
    const companyName = companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.';
    let text = `REPORTE DE DISTRIBUCIÓN DE UTILIDADES Y GASTOS - ${companyName}\n`;
    text += `Tasa BCV: ${effectiveTasa.toFixed(2)} Bs/USD\n`;
    text += `Utilidad Bruta: $${utilidadBrutaNum.toFixed(2)} USD (Bs ${utilidadBrutaVES.toFixed(2)})\n`;
    text += `Total Gastos Deducibles: -$${totalGastosUSD.toFixed(2)} USD (-Bs ${totalGastosVES.toFixed(2)})\n`;
    text += `Utilidad Neta Distribuable: $${utilidadNetaUSD.toFixed(2)} USD (Bs ${utilidadNetaVES.toFixed(2)})\n\n`;
    text += `ACCIONISTA | MONTO INV. | % INV. | MTO COBRAR ($) | MTO COBRAR (Bs)\n`;
    text += `----------------------------------------------------------------------\n`;

    accionistas.forEach(a => {
      const totalInv = accionistasTotales[a.id] || 0;
      const pct = capitalGlobalTotal > 0 ? (totalInv / capitalGlobalTotal) * 100 : 0;
      const aCobrarUsd = (totalInv / (capitalGlobalTotal || 1)) * utilidadNetaUSD;
      const aCobrarVes = aCobrarUsd * effectiveTasa;
      text += `${a.nombre.padEnd(12)} | $${totalInv.toFixed(2).padStart(10)} | ${pct.toFixed(2).padStart(6)}% | $${aCobrarUsd.toFixed(2).padStart(10)} | Bs ${aCobrarVes.toFixed(2).padStart(10)}\n`;
    });

    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 3000);
  };

  const handleOpenWipeModal = () => {
    setWipeConfirmWord('');
    setShowWipeModal(true);
  };

  const handleExecuteWipeAccionistas = async () => {
    if (!wipeConfirmWord.trim().toUpperCase().includes('CONFIRMAR')) return;
    setWipeLoading(true);
    try {
      await postApiData('/db/wipe', { wipeAccionistas: true });
      setShowWipeModal(false);
      setWipeConfirmWord('');
      await loadData();
    } catch (err: any) {
      alert('Error al vaciar el módulo de accionistas: ' + err.message);
    } finally {
      setWipeLoading(false);
    }
  };

  return (
    <div className={inline
      ? 'flex flex-col bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden text-slate-100 font-sans'
      : 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 animate-fadeIn'
    } style={inline ? { minHeight: 'calc(100vh - 180px)' } : undefined}>
      <div className={inline
        ? 'flex flex-col w-full h-full'
        : 'bg-slate-900 border border-slate-750 rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden text-slate-100 font-sans'
      }>
        
        {/* TOP HEADER BAR */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-400">
              <Briefcase className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-wider font-sans">
                  Módulo de Control de Inversiones y Accionistas
                </h2>
                <span className="bg-emerald-950 border border-emerald-500/50 text-emerald-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> SOLO ADMINISTRADOR
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                Gestión de capitales, historial de aportes y distribución de utilidades
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all"
              title="Recargar Datos"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {!inline && (
              <button
                onClick={onClose}
                className="p-2 bg-red-950/40 border border-red-900/40 text-red-400 hover:bg-red-900/50 hover:text-white rounded-lg transition-all"
                title="Cerrar Módulo"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* METRICS & QUICK ACTIONS HEADER */}
        <div className="bg-slate-950/60 border-b border-slate-800/80 px-6 py-3 flex flex-wrap justify-between items-center gap-4 flex-shrink-0">
          <div className="flex flex-wrap items-center gap-6 text-xs font-sans">
            <div className="flex items-center gap-2.5 bg-slate-900 border border-emerald-500/30 px-3.5 py-1.5 rounded-xl shadow-inner">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block leading-none">Capital Global Total:</span>
                <span className="text-emerald-400 font-mono font-black text-sm">
                  ${capitalGlobalTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-750 px-3.5 py-1.5 rounded-xl">
              <Users className="w-4 h-4 text-cyan-400" />
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block leading-none">Accionistas Registrados:</span>
                <span className="text-white font-mono font-bold text-sm">{accionistas.length}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-750 px-3.5 py-1.5 rounded-xl">
              <History className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block leading-none">Total Aportes:</span>
                <span className="text-amber-300 font-mono font-bold text-sm">{inversiones.length} movimientos</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenWipeModal}
              className="flex items-center gap-1.5 bg-red-950/60 hover:bg-red-900 border border-red-800/60 text-red-300 hover:text-white px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm"
              title="Vaciar módulo de accionistas e inversiones (poner a cero)"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Vaciar Módulo (A Cero)</span>
            </button>

            <button
              onClick={() => {
                setEditingInversion(null);
                setFormAccionistaId(accionistas[0]?.id || '');
                setFormFecha(getLocalISODateString().split(' ')[0]);
                setFormMontoUsd('');
                setFormObservacion('');
                setShowAddInversionModal(true);
              }}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Aporte</span>
            </button>

            <button
              onClick={() => setShowAddAccionistaModal(true)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all"
            >
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>Nuevo Accionista</span>
            </button>
          </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="bg-slate-900 px-6 pt-3 border-b border-slate-800 flex gap-2 flex-shrink-0 select-none">
          <button
            onClick={() => setActiveTab('matriz')}
            className={`px-4 py-2.5 rounded-t-xl font-bold text-xs uppercase font-sans transition-all flex items-center gap-2 border-t border-x ${
              activeTab === 'matriz'
                ? 'bg-slate-950 border-slate-700 text-emerald-400 font-extrabold border-b-2 border-b-emerald-400'
                : 'bg-slate-900/60 border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-4 h-4" />
            Matriz de Inversiones (General)
          </button>

          <button
            onClick={() => setActiveTab('historial')}
            className={`px-4 py-2.5 rounded-t-xl font-bold text-xs uppercase font-sans transition-all flex items-center gap-2 border-t border-x ${
              activeTab === 'historial'
                ? 'bg-slate-950 border-slate-700 text-emerald-400 font-extrabold border-b-2 border-b-emerald-400'
                : 'bg-slate-900/60 border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            Historial de Movimientos
          </button>

          <button
            onClick={() => setActiveTab('utilidades')}
            className={`px-4 py-2.5 rounded-t-xl font-bold text-xs uppercase font-sans transition-all flex items-center gap-2 border-t border-x ${
              activeTab === 'utilidades'
                ? 'bg-slate-950 border-slate-700 text-teal-300 font-extrabold border-b-2 border-b-teal-400'
                : 'bg-slate-900/60 border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calculator className="w-4 h-4 text-teal-400" />
            Calculadora de Utilidad
          </button>

          <button
            onClick={() => setActiveTab('accionistas')}
            className={`px-4 py-2.5 rounded-t-xl font-bold text-xs uppercase font-sans transition-all flex items-center gap-2 border-t border-x ${
              activeTab === 'accionistas'
                ? 'bg-slate-950 border-slate-700 text-cyan-300 font-extrabold border-b-2 border-b-cyan-400'
                : 'bg-slate-900/60 border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4 text-cyan-400" />
            Directorio de Accionistas
          </button>
        </div>

        {/* MAIN BODY AREA */}
        <div className="flex-grow p-6 overflow-y-auto min-h-0 bg-slate-950">
          
          {/* TAB 1: MATRIZ DE INVERSIONES (EXCEL LIKE) */}
          {activeTab === 'matriz' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                    Matriz Global de Aportes de Capital
                  </h3>
                  <p className="text-xs text-slate-400">
                    Vista consolidada por fecha y accionista con porcentaje de participación sobre capital global
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 shadow-xl bg-slate-900">
                <table className="w-full text-left font-sans border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-300 text-xs font-bold uppercase">
                      <th className="py-3 px-4 w-32 border-r border-slate-800">AÑO / FECHA</th>
                      {(accionistas || []).map(a => (
                        <th key={a.id} className="py-3 px-4 border-r border-slate-800 text-center min-w-[140px] text-emerald-400 font-black">
                          # {a.nombre.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                    {fechasUnicas.length === 0 || (accionistas || []).length === 0 ? (
                      <tr>
                        <td colSpan={Math.max(1, (accionistas || []).length + 1)} className="text-center py-8 text-slate-500 font-sans">
                          No hay registros de inversión almacenados o accionistas registrados.
                        </td>
                      </tr>
                    ) : (
                      fechasUnicas.map(f => {
                        const invsEnFecha = (inversiones || []).filter(i => i.fecha === f);
                        return (
                          <tr key={f} className="hover:bg-slate-800/40 transition-all">
                            <td className="py-2.5 px-4 font-bold text-slate-300 border-r border-slate-800 font-sans">
                              {f}
                            </td>
                            {(accionistas || []).map(a => {
                              const invAccion = invsEnFecha.filter(i => i.accionista_id === a.id);
                              const totalF = invAccion.reduce((acc, curr) => acc + curr.monto_usd, 0);
                              return (
                                <td key={a.id} className="py-2.5 px-4 border-r border-slate-800 text-right">
                                  {totalF !== 0 ? (
                                    <span className={totalF < 0 ? 'text-red-400 font-bold' : 'text-slate-100 font-bold'}>
                                      $ {totalF.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  ) : (
                                    <span className="text-slate-750">-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  
                  {/* FOOTER TOTALS */}
                  <tfoot className="bg-slate-950 font-mono border-t-2 border-slate-700">
                    {/* Row Totales */}
                    <tr className="border-b border-slate-800 font-bold text-xs text-white">
                      <td className="py-3 px-4 uppercase font-sans text-slate-300 font-extrabold border-r border-slate-800">
                        Totales
                      </td>
                      {(accionistas || []).map(a => {
                        const totalA = accionistasTotales[a.id] || 0;
                        return (
                          <td key={a.id} className="py-3 px-4 text-right border-r border-slate-800 font-black text-emerald-400">
                            $ {totalA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Row % de Inversion */}
                    <tr className="bg-emerald-950/60 text-sm font-black">
                      <td className="py-3.5 px-4 uppercase font-sans text-emerald-300 font-black border-r border-slate-800">
                        % de Inv.
                      </td>
                      {(accionistas || []).map(a => {
                        const totalA = accionistasTotales[a.id] || 0;
                        const pct = capitalGlobalTotal > 0 ? (totalA / capitalGlobalTotal) * 100 : 0;
                        return (
                          <td key={a.id} className="py-3.5 px-4 text-right border-r border-slate-800 font-black text-teal-300 text-sm font-mono">
                            {pct.toFixed(2)} %
                          </td>
                        );
                      })}
                    </tr>

                    {/* Row Global Total */}
                    <tr className="bg-slate-900 font-black text-sm">
                      <td className="py-3.5 px-4 uppercase font-sans text-red-400 font-black border-r border-slate-800">
                        Total Capital Global
                      </td>
                      <td colSpan={Math.max(1, (accionistas || []).length)} className="py-3.5 px-6 text-right text-red-400 text-base font-black">
                        $ {capitalGlobalTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: HISTORIAL DE MOVIMIENTOS */}
          {activeTab === 'historial' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                    Historial Detallado de Movimientos de Inversión
                  </h3>
                  <p className="text-xs text-slate-400">
                    Listado cronológico individual con opción para modificar o eliminar aportes
                  </p>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <table className="w-full text-left font-sans">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-[11px] font-bold uppercase border-b border-slate-800">
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Accionista</th>
                      <th className="py-3 px-4">Monto ($ USD)</th>
                      <th className="py-3 px-4">Observación / Concepto</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-xs">
                    {inversiones.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-500">
                          No hay movimientos registrados.
                        </td>
                      </tr>
                    ) : (
                      inversiones.map(inv => {
                        const accionistaObj = accionistas.find(a => a.id === inv.accionista_id);
                        return (
                          <tr key={inv.id} className="hover:bg-slate-800/50 transition-all">
                            <td className="py-3 px-4 font-mono text-slate-500">#{inv.id}</td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-300">{inv.fecha}</td>
                            <td className="py-3 px-4 font-bold text-emerald-400">
                              {accionistaObj ? accionistaObj.nombre : `Accionista #${inv.accionista_id}`}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-100">
                              <span className={inv.monto_usd < 0 ? 'text-red-400' : 'text-emerald-400'}>
                                ${inv.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-300 italic">{inv.observacion || '-'}</td>
                            <td className="py-3 px-4 text-right space-x-1">
                              <button
                                onClick={() => handleEditInversionClick(inv)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-md transition-all"
                                title="Editar Aporte"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteInversionClick(inv.id)}
                                className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-md transition-all"
                                title="Eliminar Aporte"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

          {/* TAB 3: CALCULADORA DE UTILIDAD Y GASTOS OPERATIVOS */}
          {activeTab === 'utilidades' && (
            <div className="space-y-6 max-w-5xl mx-auto py-2">
              <div ref={reportContainerRef} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                
                {/* HEADER ACTIONS BAR */}
                <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-4 gap-4">
                  <div>
                    <h3 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-teal-400" />
                      Cálculo de Distribución de Utilidades y Gastos Operativos
                    </h3>
                    <p className="text-xs text-slate-400 font-sans mt-0.5">
                      Deducción automática de gastos (Luz, Agua, Alquiler, etc.) y reparto proporcional a accionistas en <strong className="text-emerald-400 font-mono">$ USD</strong> y <strong className="text-cyan-400 font-mono">Bs VES</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleSendWhatsAppReport}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                      title="Enviar reporte completo con detalle por WhatsApp"
                    >
                      <Send className="w-4 h-4" />
                      <span>📲 WhatsApp</span>
                    </button>

                    <button
                      onClick={handleDownloadReportImage}
                      className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                      title="Descargar imagen visual en alta calidad (PNG) para adjuntar"
                    >
                      <Camera className="w-4 h-4" />
                      <span>📷 Descargar Imagen</span>
                    </button>

                    <button
                      onClick={handleCopyUtilidades}
                      className="bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      {copiedNotification ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedNotification ? '¡Copiado!' : '📋 Copiar'}</span>
                    </button>
                  </div>
                </div>

                {/* RESUMEN FINANCIERO EN KPI CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans">
                  {/* Utilidad Bruta */}
                  <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">📈 Utilidad Bruta (Ingresos)</span>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xl font-black font-mono text-emerald-400">${utilidadBrutaNum.toFixed(2)} USD</span>
                      {effectiveTasa > 1 && (
                        <span className="text-xs font-mono font-bold text-slate-400">Bs {utilidadBrutaVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      )}
                    </div>
                  </div>

                  {/* Total Gastos Operativos */}
                  <div className="bg-slate-950/80 border border-rose-900/40 p-4 rounded-2xl space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-rose-400 tracking-wider block">🔻 (-) Gastos Operativos Deducibles</span>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xl font-black font-mono text-rose-500">-${totalGastosUSD.toFixed(2)} USD</span>
                      {effectiveTasa > 1 && (
                        <span className="text-xs font-mono font-bold text-rose-400/80">-Bs {totalGastosVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      )}
                    </div>
                  </div>

                  {/* Utilidad Neta Distribuable */}
                  <div className="bg-gradient-to-br from-teal-950/90 to-emerald-950/90 border border-teal-500/50 p-4 rounded-2xl space-y-1 shadow-lg">
                    <span className="text-[10px] font-extrabold uppercase text-teal-300 tracking-wider block">💰 (=) Utilidad Neta Distribuable</span>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-2xl font-black font-mono text-teal-200">${utilidadNetaUSD.toFixed(2)} USD</span>
                      {effectiveTasa > 1 && (
                        <span className="text-xs font-mono font-bold text-teal-300">Bs {utilidadNetaVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* CAMPO INGRESO UTILIDAD BRUTA */}
                <div className="bg-slate-950 border border-teal-500/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <label className="text-xs font-black uppercase text-teal-300 tracking-wider block font-sans">
                      Ingresar / Modificar Utilidad Bruta ($):
                    </label>
                    <p className="text-[11px] text-slate-400">Modifique libremente este monto manual antes o después de deducir gastos</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-teal-400 font-black text-2xl">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={montoUtilidadInput}
                      onChange={(e) => setMontoUtilidadInput(e.target.value)}
                      placeholder="0.00"
                      className="bg-slate-900 border-2 border-teal-500/60 focus:border-teal-400 text-teal-300 font-mono font-black text-xl px-4 py-2 rounded-xl text-right w-48 outline-none transition-all shadow-inner"
                    />
                  </div>
                </div>

                {/* MÓDULO DE GASTOS OPERATIVOS DEDUCIBLES */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-3 gap-2">
                    <div>
                      <h4 className="text-xs font-extrabold uppercase text-slate-200 tracking-wider flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-rose-400" />
                        Gastos Operativos Deducibles (Luz, Agua, Internet, Alquiler, Sueldos, etc.)
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Los gastos registrados aquí restan automáticamente a la utilidad bruta antes de la repartición
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setEditingGasto(null);
                        setFormGastoConcepto('⚡ Luz / Electricidad');
                        setFormGastoMontoUsd('');
                        setFormGastoObservacion('');
                        setShowAddGastoModal(true);
                      }}
                      className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Agregar Gasto</span>
                    </button>
                  </div>

                  {gastos.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs font-sans italic border border-dashed border-slate-800 rounded-xl">
                      No hay gastos operativos deducibles registrados. Haga clic en "+ Agregar Gasto" para incluir servicios, alquiler o nómina.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                      <table className="w-full text-left font-sans text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-extrabold">
                            <th className="py-2.5 px-4">Concepto / Servicio</th>
                            <th className="py-2.5 px-4">Fecha</th>
                            <th className="py-2.5 px-4">Observación / Detalle</th>
                            <th className="py-2.5 px-4 text-right">Monto ($ USD)</th>
                            {effectiveTasa > 1 && <th className="py-2.5 px-4 text-right">Monto (Bs VES)</th>}
                            <th className="py-2.5 px-4 text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] text-slate-300">
                          {gastos.map(g => (
                            <tr key={g.id} className="hover:bg-slate-900/60 transition-all">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200">{g.concepto}</td>
                              <td className="py-2.5 px-4 text-slate-400">{g.fecha}</td>
                              <td className="py-2.5 px-4 font-sans italic text-slate-400">{g.observacion || '-'}</td>
                              <td className="py-2.5 px-4 text-right font-black text-rose-400">${g.monto_usd.toFixed(2)}</td>
                              {effectiveTasa > 1 && (
                                <td className="py-2.5 px-4 text-right font-bold text-slate-400">Bs {(g.monto_usd * effectiveTasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              )}
                              <td className="py-2.5 px-4 text-center space-x-1 font-sans">
                                <button
                                  onClick={() => handleEditGastoClick(g)}
                                  className="p-1 text-cyan-400 hover:text-cyan-300"
                                  title="Editar Gasto"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteGastoClick(g)}
                                  className="p-1 text-rose-500 hover:text-rose-400"
                                  title="Eliminar Gasto"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-900 font-mono font-bold text-xs border-t border-slate-800">
                          <tr>
                            <td colSpan={3} className="py-2.5 px-4 uppercase text-slate-400 font-sans font-bold">Total Gastos Deducibles</td>
                            <td className="py-2.5 px-4 text-right font-black text-rose-400">-${totalGastosUSD.toFixed(2)} USD</td>
                            {effectiveTasa > 1 && (
                              <td className="py-2.5 px-4 text-right font-black text-rose-400/80">-Bs {totalGastosVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            )}
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {/* TABLA DETALLADA DE REPARTO DE UTILIDAD NETA A ACCIONISTAS */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-extrabold uppercase text-slate-300 tracking-wider font-sans">
                      👥 Distribución Proporcional por Accionista
                    </h4>
                    <span className="text-[10px] text-teal-300 font-mono font-bold">
                      Calculado sobre Utilidad Neta: ${utilidadNetaUSD.toFixed(2)} USD
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                    <table className="w-full text-left font-sans border-collapse">
                      <thead>
                        <tr className="bg-emerald-950/70 border-b border-emerald-500/40 text-white text-xs font-extrabold uppercase">
                          <th className="py-3 px-4 border-r border-slate-800">Accionistas</th>
                          <th className="py-3 px-4 border-r border-slate-800 text-right">Mto de Inv</th>
                          <th className="py-3 px-4 border-r border-slate-800 text-right">% de Inv</th>
                          <th className="py-3 px-4 text-right text-teal-300 border-r border-slate-800">Mto a cobrar ($)</th>
                          {effectiveTasa > 1 && <th className="py-3 px-4 text-right text-cyan-300">Mto a cobrar (Bs)</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-xs font-mono font-bold">
                        {accionistas.map(a => {
                          const mtoInv = accionistasTotales[a.id] || 0;
                          const pctInv = capitalGlobalTotal > 0 ? (mtoInv / capitalGlobalTotal) * 100 : 0;
                          const mtoCobrarUsd = (mtoInv / (capitalGlobalTotal || 1)) * utilidadNetaUSD;
                          const mtoCobrarVes = mtoCobrarUsd * effectiveTasa;

                          return (
                            <tr key={a.id} className="hover:bg-slate-900 transition-all text-slate-200">
                              <td className="py-3 px-4 font-sans font-bold border-r border-slate-800 text-sm">
                                {a.nombre}
                              </td>
                              <td className="py-3 px-4 text-right border-r border-slate-800 text-slate-100">
                                $ {mtoInv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-4 text-right border-r border-slate-800 text-teal-300 font-black text-sm">
                                {pctInv.toFixed(2).replace('.', ',')} %
                              </td>
                              <td className="py-3 px-4 text-right font-black text-emerald-400 text-sm border-r border-slate-800">
                                $ {mtoCobrarUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              {effectiveTasa > 1 && (
                                <td className="py-3 px-4 text-right font-black text-cyan-300 text-sm">
                                  Bs {mtoCobrarVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-900 font-mono font-black border-t-2 border-slate-700 text-sm">
                        <tr>
                          <td className="py-4 px-4 font-sans uppercase text-white border-r border-slate-800">
                            Total Netos
                          </td>
                          <td className="py-4 px-4 text-right border-r border-slate-800 text-white">
                            $ {capitalGlobalTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-4 text-right border-r border-slate-800 text-teal-300">
                            100,00 %
                          </td>
                          <td className="py-4 px-4 text-right text-emerald-400 font-extrabold text-base border-r border-slate-800">
                            $ {utilidadNetaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          {effectiveTasa > 1 && (
                            <td className="py-4 px-4 text-right text-cyan-300 font-extrabold text-base">
                              Bs {utilidadNetaVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          )}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 4: DIRECTORIO DE ACCIONISTAS */}
          {activeTab === 'accionistas' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                    Directorio de Accionistas Registrados
                  </h3>
                  <p className="text-xs text-slate-400">
                    Administre la información de los socios e integrantes del grupo accionario
                  </p>
                </div>
                <button
                  onClick={() => setShowAddAccionistaModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nuevo Accionista</span>
                </button>
              </div>

              {(accionistas || []).length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3 font-sans">
                  <Users className="w-10 h-10 text-slate-600 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-300 uppercase">No hay accionistas registrados en la base de datos</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Haga clic en <strong className="text-emerald-400">"Nuevo Accionista"</strong> para comenzar a registrar a los integrantes del grupo accionario.
                  </p>
                  <button
                    onClick={() => setShowAddAccionistaModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5 transition-all shadow-md mt-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Registrar Primer Accionista</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(accionistas || []).map(a => {
                    const totalInv = accionistasTotales[a.id] || 0;
                    const pct = capitalGlobalTotal > 0 ? (totalInv / capitalGlobalTotal) * 100 : 0;
                    const canDelete = totalInv === 0;
                    return (
                      <div key={a.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3 relative overflow-hidden group">
                        {/* Glow accent */}
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">ID Accionista #{a.id}</span>
                            <h4 className="text-base font-extrabold text-white truncate">{a.nombre}</h4>
                            <p className="text-xs text-slate-400">{a.cedula_rif || 'Sin Cédula/RIF'}</p>
                            {a.telefono && <p className="text-xs text-slate-500 font-mono">{a.telefono}</p>}
                          </div>
                          <span className="bg-emerald-950/95 text-emerald-300 border-2 border-emerald-500/80 text-sm sm:text-base font-mono font-black px-3.5 py-1 rounded-xl ml-2 flex-shrink-0 shadow-md tracking-wide">
                            {pct.toFixed(2)} % Inv
                          </span>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center">
                          <span className="text-xs text-slate-400 uppercase font-bold">Capital Total:</span>
                          <span className={`text-base font-mono font-black ${ totalInv === 0 ? 'text-slate-500' : 'text-emerald-400' }`}>
                            ${totalInv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        {/* ACTION BUTTONS */}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleEditAccionistaClick(a)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 hover:border-cyan-600 text-cyan-400 rounded-xl text-xs font-bold transition-all"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteAccionistaClick(a)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                              canDelete
                                ? 'bg-red-950/40 hover:bg-red-900/60 border-red-900/40 hover:border-red-600 text-red-400'
                                : 'bg-slate-800/50 border-slate-700/50 text-slate-600 cursor-not-allowed opacity-50'
                            }`}
                            title={canDelete ? 'Eliminar accionista' : 'No se puede eliminar: tiene capital invertido > $0'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* MODAL REGISTRAR / EDITAR APORTE */}
      {showAddInversionModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-100">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-extrabold text-sm uppercase text-emerald-400 font-sans">
                {editingInversion ? 'Editar Aporte de Inversión' : 'Registrar Nuevo Aporte de Inversión'}
              </h3>
              <button onClick={() => setShowAddInversionModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveInversion} className="p-6 space-y-4 font-sans text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Accionista:</label>
                <select
                  value={formAccionistaId}
                  onChange={(e) => setFormAccionistaId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-emerald-500"
                >
                  {accionistas.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} {a.cedula_rif ? `(${a.cedula_rif})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Fecha del Aporte (Actual o Pasada):</label>
                <input
                  type="date"
                  value={formFecha}
                  onChange={(e) => setFormFecha(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Monto ($ USD):</label>
                <input
                  type="number"
                  step="0.01"
                  value={formMontoUsd}
                  onChange={(e) => setFormMontoUsd(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-emerald-500 font-mono font-bold text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Observación / Concepto:</label>
                <textarea
                  rows={3}
                  value={formObservacion}
                  onChange={(e) => setFormObservacion(e.target.value)}
                  placeholder="Ej: Aporte inicial de capital, inyección proyecto..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddInversionModal(false)}
                  className="w-1/2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl uppercase text-xs transition-all"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl uppercase text-xs transition-all"
                >
                  Guardar Aporte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR ACCIONISTA */}
      {showAddAccionistaModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-100">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-extrabold text-sm uppercase text-cyan-400 font-sans">
                {editingAccionista ? '✏️ Editar Accionista' : 'Registrar Nuevo Accionista'}
              </h3>
              <button onClick={() => { setShowAddAccionistaModal(false); setEditingAccionista(null); }} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccionista} className="p-6 space-y-4 font-sans text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Nombre Completo:</label>
                <input
                  type="text"
                  value={formNombreAccionista}
                  onChange={(e) => setFormNombreAccionista(e.target.value)}
                  placeholder="Ej: Carlos Mendoza"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500 font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Cédula o RIF:</label>
                <input
                  type="text"
                  value={formCedulaAccionista}
                  onChange={(e) => setFormCedulaAccionista(e.target.value)}
                  placeholder="V-12345678 / J-123456789"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Teléfono:</label>
                <input
                  type="text"
                  value={formTelefonoAccionista}
                  onChange={(e) => setFormTelefonoAccionista(e.target.value)}
                  placeholder="0424-0000000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowAddAccionistaModal(false); setEditingAccionista(null); setFormNombreAccionista(''); setFormCedulaAccionista(''); setFormTelefonoAccionista(''); }}
                  className="w-1/2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl uppercase text-xs transition-all"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 rounded-xl uppercase text-xs transition-all"
                >
                  {editingAccionista ? 'Guardar Cambios' : 'Guardar Accionista'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR ELIMINACIÓN DE ACCIONISTA */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-red-900/60 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden text-slate-100">
            <div className="bg-gradient-to-r from-red-950 to-slate-900 px-6 py-4 border-b border-red-900/50 flex items-center gap-3">
              <div className="p-2 bg-red-950/80 border border-red-700/50 rounded-xl">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="font-extrabold text-sm uppercase text-red-400 font-sans">
                Confirmar Eliminación
              </h3>
            </div>

            <div className="p-6 space-y-4 font-sans">
              {deleteConfirm.capital > 0 ? (
                // BLOCKED: has capital
                <div className="space-y-3">
                  <div className="bg-red-950/40 border border-red-700/50 rounded-xl p-4 text-center space-y-2">
                    <div className="text-3xl">⛔</div>
                    <p className="text-sm font-bold text-red-300">
                      No se puede eliminar a <span className="text-white">{deleteConfirm.accionista.nombre}</span>
                    </p>
                    <p className="text-xs text-red-400">
                      Este accionista tiene un capital invertido de{' '}
                      <strong className="text-white font-mono">
                        ${deleteConfirm.capital.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </strong>.
                    </p>
                    <p className="text-xs text-slate-400">
                      Para eliminar el accionista, primero debe llevar su capital total a <strong>$0.00</strong> registrando los retiros o ajustes correspondientes en el Historial de Movimientos.
                    </p>
                  </div>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wide transition-all"
                  >
                    Entendido
                  </button>
                </div>
              ) : (
                // ALLOWED: capital is zero
                <div className="space-y-4">
                  <div className="bg-slate-950 border border-slate-700 rounded-xl p-4 text-center space-y-2">
                    <div className="text-3xl">⚠️</div>
                    <p className="text-sm font-bold text-slate-200">
                      ¿Eliminar a <span className="text-red-300">{deleteConfirm.accionista.nombre}</span>?
                    </p>
                    <p className="text-xs text-slate-400">
                      Capital actual: <strong className="text-slate-300 font-mono">$0.00</strong>. Esta acción eliminará al accionista y todos sus registros históricos. Esta acción <strong className="text-red-400">no se puede deshacer</strong>.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs uppercase transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleConfirmDeleteAccionista}
                      className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wide transition-all flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      Sí, Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL VACIAR MÓDULO ACCIONISTAS */}
      {showWipeModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-red-900/60 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-100 font-sans">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-950 via-slate-900 to-slate-950 px-6 py-4 border-b border-red-900/50 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-950 border border-red-700/60 rounded-xl text-red-400">
                  <ShieldAlert className="w-5 h-5 animate-pulse" />
                </div>
                <h3 className="font-extrabold text-sm uppercase text-red-400 tracking-wide">
                  Vaciar Módulo de Accionistas
                </h3>
              </div>
              <button
                onClick={() => { setShowWipeModal(false); setWipeConfirmWord(''); }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-red-950/40 border border-red-900/60 rounded-xl p-4 space-y-2 text-center">
                <div className="text-3xl">⚠️</div>
                <p className="text-xs font-bold text-red-300 uppercase tracking-wide">
                  Advertencia de Acción Destructiva
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Esta acción borrará <strong className="text-red-400">TODOS</strong> los accionistas registrados y sus aportes de capital, dejando el módulo de inversiones en <strong>cero (0)</strong>.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-300 block text-center">
                  Escriba <span className="text-red-400 font-mono font-black">"CONFIRMAR"</span> para autorizar:
                </label>
                <input
                  type="text"
                  placeholder="Escriba CONFIRMAR..."
                  value={wipeConfirmWord}
                  onChange={(e) => setWipeConfirmWord(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-red-500 text-center font-mono font-bold text-sm text-white px-4 py-2.5 rounded-xl outline-none transition-all placeholder-slate-600"
                  autoFocus
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowWipeModal(false); setWipeConfirmWord(''); }}
                  className="w-1/2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl uppercase text-xs transition-all"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="button"
                  disabled={!wipeConfirmWord.trim().toUpperCase().includes('CONFIRMAR') || wipeLoading}
                  onClick={handleExecuteWipeAccionistas}
                  className={`w-1/2 font-bold py-2.5 rounded-xl uppercase text-xs transition-all flex items-center justify-center gap-2 shadow-lg ${
                    wipeConfirmWord.trim().toUpperCase().includes('CONFIRMAR')
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/50 cursor-pointer'
                      : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{wipeLoading ? 'Vaciando...' : 'Vaciar a Cero'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR / EDITAR GASTO OPERATIVO */}
      {showAddGastoModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-100 font-sans">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-extrabold text-sm uppercase text-rose-400 font-sans flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                {editingGasto ? 'Editar Gasto Operativo' : 'Registrar Gasto Deducible'}
              </h3>
              <button onClick={() => { setShowAddGastoModal(false); setEditingGasto(null); }} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGasto} className="p-6 space-y-4 text-xs">
              {/* Preset concept buttons */}
              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Presets Rápidos:</label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    '⚡ Luz / Electricidad',
                    '💧 Agua Potable',
                    '🌐 Internet / Teléfono',
                    '🏢 Alquiler de Local',
                    '👥 Nómina / Sueldos',
                    '🛠️ Mantenimiento',
                    '📦 Transporte / Flete',
                    '📝 Otro Gasto'
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormGastoConcepto(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                        formGastoConcepto === preset
                          ? 'bg-rose-600 text-white border-rose-500 shadow-xs'
                          : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Concepto / Nombre del Servicio:</label>
                <input
                  type="text"
                  value={formGastoConcepto}
                  onChange={(e) => setFormGastoConcepto(e.target.value)}
                  placeholder="Ej: Factura Corpoelec, Cantv, Alquiler..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-rose-500 font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Monto ($ USD):</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-rose-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formGastoMontoUsd}
                    onChange={(e) => setFormGastoMontoUsd(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-7 pr-3 py-2.5 text-rose-400 font-mono font-black text-sm outline-none focus:border-rose-500"
                    required
                  />
                </div>
                {effectiveTasa > 1 && parseFloat(formGastoMontoUsd || '0') > 0 && (
                  <p className="text-[10px] text-slate-400 font-mono text-right">
                    Equivalente en Bs: <strong className="text-slate-200">Bs {(parseFloat(formGastoMontoUsd) * effectiveTasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Fecha:</label>
                <input
                  type="date"
                  value={formGastoFecha}
                  onChange={(e) => setFormGastoFecha(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-rose-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 uppercase">Observación / Detalle (Opcional):</label>
                <textarea
                  rows={2}
                  value={formGastoObservacion}
                  onChange={(e) => setFormGastoObservacion(e.target.value)}
                  placeholder="Ej: Pago de recibo Nro. #12345..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-rose-500 resize-none"
                />
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowAddGastoModal(false); setEditingGasto(null); }}
                  className="w-1/2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl uppercase text-xs transition-all"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl uppercase text-xs transition-all shadow-lg shadow-rose-950/50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingGasto ? 'Guardar Cambios' : 'Guardar Gasto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
