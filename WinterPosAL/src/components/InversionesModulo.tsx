import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Briefcase, Plus, Users, Calculator, History, Table, DollarSign, 
  Trash2, Edit, X, RefreshCw, Check, ShieldCheck, ShieldAlert, Copy,
  Camera, Send, Receipt, Filter, ChevronDown
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
  currentUser: _currentUser,
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
        } else if (showAddGastoModal) {
          setShowAddGastoModal(false);
          setEditingGasto(null);
        } else if (deleteConfirm) {
          setDeleteConfirm(null);
        } else if (!inline && onClose) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showWipeModal, showAddInversionModal, showAddAccionistaModal, showAddGastoModal, deleteConfirm, inline, onClose]);

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
      accionistasTotales[inv.accionista_id] += Number(inv.monto_usd) || 0;
    }
  });

  // Calculate global total capital
  const capitalGlobalTotal = Object.values(accionistasTotales).reduce((acc, curr) => acc + curr, 0);

  // Total Gastos Operativos Deducibles
  const totalGastosUSD = (gastos || []).reduce((acc, curr) => acc + (Number(curr.monto_usd) || 0), 0);

  // Effective Exchange Rate
  const effectiveTasa = tasaDia && tasaDia > 0 ? tasaDia : 1;
  const totalGastosVES = totalGastosUSD * effectiveTasa;

  // Calculations for Net Profit Distribution
  const utilidadBrutaNum = parseFloat(montoUtilidadInput) || 0;
  const utilidadBrutaVES = utilidadBrutaNum * effectiveTasa;
  const utilidadNetaUSD = Math.max(0, utilidadBrutaNum - totalGastosUSD);
  const utilidadNetaVES = utilidadNetaUSD * effectiveTasa;

  // Unique sorted dates for matrix table
  const fechasUnicas = useMemo(() => {
    const rawFechas = (inversiones || []).map(i => i.fecha).filter(Boolean);
    const setF = new Set(rawFechas);
    return Array.from(setF).sort();
  }, [inversiones]);

  // Filters for Historial de Movimientos (Año, Múltiples Meses, Accionista, Búsqueda)
  const [filtroAccionista, setFiltroAccionista] = useState<string>('');
  const [filtroAnio, setFiltroAnio] = useState<string>('');
  const [filtrosMeses, setFiltrosMeses] = useState<string[]>([]);
  const [isMesDropdownOpen, setIsMesDropdownOpen] = useState<boolean>(false);
  const [filtroBusqueda, setFiltroBusqueda] = useState<string>('');
  const mesDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close month multi-select dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mesDropdownRef.current && !mesDropdownRef.current.contains(event.target as Node)) {
        setIsMesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMes = (mesVal: string) => {
    setFiltrosMeses(prev => 
      prev.includes(mesVal) ? prev.filter(m => m !== mesVal) : [...prev, mesVal]
    );
  };

  // Extract unique available years from inversiones
  const aniosDisponibles = useMemo(() => {
    const years = new Set<string>();
    const currentYear = String(new Date().getFullYear());
    years.add(currentYear);
    (inversiones || []).forEach(inv => {
      if (inv.fecha) {
        const y = inv.fecha.split('-')[0];
        if (y && y.length === 4) years.add(y);
      }
    });
    return Array.from(years).sort().reverse();
  }, [inversiones]);

  const meses = [
    { value: '01', label: 'Enero' },
    { value: '02', label: 'Febrero' },
    { value: '03', label: 'Marzo' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Mayo' },
    { value: '06', label: 'Junio' },
    { value: '07', label: 'Julio' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' }
  ];

  const filteredInversiones = useMemo(() => {
    return (inversiones || []).filter(inv => {
      // Filter by Accionista
      if (filtroAccionista && String(inv.accionista_id) !== String(filtroAccionista)) {
        return false;
      }
      // Filter by Año
      if (filtroAnio) {
        const y = inv.fecha ? inv.fecha.split('-')[0] : '';
        if (y !== filtroAnio) return false;
      }
      // Filter by Multiple Meses
      if (filtrosMeses.length > 0) {
        const m = inv.fecha ? inv.fecha.split('-')[1] : '';
        if (!filtrosMeses.includes(m)) return false;
      }
      // Filter by Text Search
      if (filtroBusqueda.trim()) {
        const q = filtroBusqueda.trim().toLowerCase();
        const obs = (inv.observacion || '').toLowerCase();
        const acc = (accionistas.find(a => a.id === inv.accionista_id)?.nombre || '').toLowerCase();
        const idStr = String(inv.id);
        if (!obs.includes(q) && !acc.includes(q) && !idStr.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [inversiones, filtroAccionista, filtroAnio, filtrosMeses, filtroBusqueda, accionistas]);

  const totalFilteredUsd = useMemo(() => {
    return filteredInversiones.reduce((acc, curr) => acc + (Number(curr.monto_usd) || 0), 0);
  }, [filteredInversiones]);

  const hasActiveFilters = Boolean(filtroAccionista || filtroAnio || filtrosMeses.length > 0 || filtroBusqueda.trim());

  const handleClearFilters = () => {
    setFiltroAccionista('');
    setFiltroAnio('');
    setFiltrosMeses([]);
    setFiltroBusqueda('');
  };

  // Handlers for Inversiones
  const handleSaveInversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAccionistaId) {
      alert('Seleccione un accionista');
      return;
    }
    const monto = parseFloat(formMontoUsd);
    if (isNaN(monto) || monto === 0) {
      alert('Ingrese un monto válido diferente de 0');
      return;
    }

    try {
      const payload = {
        accionista_id: Number(formAccionistaId),
        fecha: formFecha,
        monto_usd: monto,
        observacion: formObservacion.trim()
      };

      if (editingInversion) {
        await postApiData(`/inversiones/${editingInversion.id}`, payload);
      } else {
        await postApiData('/inversiones', payload);
      }

      setShowAddInversionModal(false);
      setEditingInversion(null);
      setFormMontoUsd('');
      setFormObservacion('');
      loadData();
    } catch (err: any) {
      alert('Error al guardar aporte: ' + err.message);
    }
  };

  const handleEditInversionClick = (inv: InversionAccionista) => {
    setEditingInversion(inv);
    setFormAccionistaId(inv.accionista_id);
    setFormFecha(inv.fecha);
    setFormMontoUsd(String(inv.monto_usd));
    setFormObservacion(inv.observacion || '');
    setShowAddInversionModal(true);
  };

  const handleDeleteInversionClick = async (id: number) => {
    if (confirm('¿Está seguro de eliminar este movimiento de inversión?')) {
      try {
        await deleteApiData(`/inversiones/${id}`);
        loadData();
      } catch (err: any) {
        alert('Error al eliminar movimiento: ' + err.message);
      }
    }
  };

  // Handlers for Accionistas
  const handleSaveAccionista = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNombreAccionista.trim()) {
      alert('Ingrese el nombre del accionista');
      return;
    }

    try {
      const payload = {
        nombre: formNombreAccionista.trim(),
        cedula_rif: formCedulaAccionista.trim(),
        telefono: formTelefonoAccionista.trim()
      };

      if (editingAccionista) {
        await postApiData(`/inversiones/accionistas/${editingAccionista.id}`, payload);
      } else {
        await postApiData('/inversiones/accionistas', payload);
      }

      setShowAddAccionistaModal(false);
      setEditingAccionista(null);
      setFormNombreAccionista('');
      setFormCedulaAccionista('');
      setFormTelefonoAccionista('');
      loadData();
    } catch (err: any) {
      alert('Error al guardar accionista: ' + err.message);
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
      setDeleteConfirm(null);
      loadData();
    } catch (err: any) {
      alert('Error al eliminar accionista: ' + err.message);
    }
  };

  // Handlers for Gastos Operativos
  const handleSaveGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formGastoConcepto.trim()) {
      alert('Ingrese el concepto del gasto');
      return;
    }
    const monto = parseFloat(formGastoMontoUsd);
    if (isNaN(monto) || monto <= 0) {
      alert('Ingrese un monto válido mayor a 0');
      return;
    }

    try {
      const payload = {
        concepto: formGastoConcepto.trim(),
        monto_usd: monto,
        fecha: formGastoFecha,
        observacion: formGastoObservacion.trim()
      };

      if (editingGasto) {
        await postApiData(`/gastos/${editingGasto.id}`, payload);
      } else {
        await postApiData('/gastos', payload);
      }

      setShowAddGastoModal(false);
      setEditingGasto(null);
      setFormGastoMontoUsd('');
      setFormGastoObservacion('');
      loadData();
    } catch (err: any) {
      alert('Error al guardar gasto: ' + err.message);
    }
  };

  const handleEditGastoClick = (g: GastoOperativo) => {
    setEditingGasto(g);
    setFormGastoConcepto(g.concepto);
    setFormGastoMontoUsd(String(g.monto_usd));
    setFormGastoFecha(g.fecha);
    setFormGastoObservacion(g.observacion || '');
    setShowAddGastoModal(true);
  };

  const handleDeleteGastoClick = async (g: GastoOperativo) => {
    if (confirm(`¿Está seguro de eliminar el gasto "${g.concepto}" de $${g.monto_usd.toFixed(2)}?`)) {
      try {
        await deleteApiData(`/gastos/${g.id}`);
        loadData();
      } catch (err: any) {
        alert('Error al eliminar gasto: ' + err.message);
      }
    }
  };

  const handleDownloadReportImage = async () => {
    if (!reportContainerRef.current) return;
    try {
      const dataUrl = await toPng(reportContainerRef.current, { backgroundColor: '#ffffff', quality: 0.98 });
      const link = document.createElement('a');
      link.download = `Reporte_Utilidades_Gastos_${getLocalISODateString().split(' ')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error al generar imagen PNG del reporte:', err);
      alert('No se pudo generar la imagen del reporte.');
    }
  };

  const handleSendWhatsAppReport = async () => {
    const companyName = companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.';
    const dateStr = getLocalISODateString();

    let desgloseGastosStr = '';
    if (gastos.length > 0) {
      desgloseGastosStr = gastos.map(g => {
        const montoVES = g.monto_usd * effectiveTasa;
        return `  • ${g.concepto}: $${g.monto_usd.toFixed(2)} USD (Bs ${montoVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
      }).join('\n');
    }

    const desgloseAccionistasStr = accionistas.map(a => {
      const totalInv = accionistasTotales[a.id] || 0;
      const pct = capitalGlobalTotal > 0 ? (totalInv / capitalGlobalTotal) * 100 : 0;
      const aCobrarUsd = (totalInv / (capitalGlobalTotal || 1)) * utilidadNetaUSD;
      const aCobrarVes = aCobrarUsd * effectiveTasa;
      return `🔹 *${a.nombre}* (${pct.toFixed(2)}% de inv.)\n   👉 *A Cobrar:* $${aCobrarUsd.toFixed(2)} USD | Bs ${aCobrarVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }).join('\n\n');

    let text = `💼 *REPORTE DE DISTRIBUCIÓN DE UTILIDADES Y GASTOS*\n`;
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
      text += desgloseGastosStr + `\n`;
    }

    text += `----------------------------------\n`;
    text += `👥 *MONTO A COBRAR POR ACCIONISTA:*\n`;
    text += desgloseAccionistasStr + `\n`;

    let waSuccess = false;
    let imageBase64 = '';

    try {
      if (reportContainerRef.current) {
        imageBase64 = await toPng(reportContainerRef.current, { backgroundColor: '#ffffff', quality: 0.95 });
      }

      const res = await postApiData('/whatsapp/send-cierre', {
        imageBase64: imageBase64 || '',
        textSummary: text
      });

      if (res && !res.error) {
        waSuccess = true;
        alert('¡Reporte de utilidades y gastos enviado exitosamente por WhatsApp al grupo registrado!');
      }
    } catch (err: any) {
      console.warn('WhatsApp bot send error, using fallback:', err);
    }

    if (!waSuccess) {
      try {
        if (imageBase64) {
          const resBlob = await fetch(imageBase64);
          const blob = await resBlob.blob();
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
          ]);
          alert('⚠️ El bot de WhatsApp no envió el mensaje directamente (o no está activo).\n\nSe ha copiado la FOTO DEL REPORTE a tu portapapeles. Solo abre WhatsApp Web/App y presiona Ctrl + V para pegarla y enviarla junto con el reporte.');
        } else {
          await navigator.clipboard.writeText(text);
          alert('⚠️ Se ha copiado el resumen detallado del reporte a tu portapapeles.\n\nPuedes pegarlo directamente en WhatsApp (Ctrl + V).');
        }
      } catch (clipErr) {
        const encoded = encodeURIComponent(text);
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
      }
    }
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
      ? 'flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden text-slate-800 font-sans'
      : 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-6 animate-fade-in'
    } style={inline ? { minHeight: 'calc(100vh - 180px)' } : undefined}>
      <div className={inline
        ? 'flex flex-col w-full h-full'
        : 'bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden text-slate-800 font-sans'
      }>
        
        {/* TOP HEADER BAR */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-700">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-wide font-sans">
                  Módulo de Control de Inversiones y Accionistas
                </h2>
                <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> SOLO ADMINISTRADOR
                </span>
              </div>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Gestión de capitales, historial de aportes y distribución de utilidades
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all shadow-2xs"
              title="Recargar Datos"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {!inline && (
              <button
                onClick={onClose}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-lg transition-all"
                title="Cerrar Módulo"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* METRICS & QUICK ACTIONS HEADER */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap justify-between items-center gap-4 flex-shrink-0">
          <div className="flex flex-wrap items-center gap-4 text-xs font-sans">
            
            {/* Metric 1: Capital Global */}
            <div className="flex items-center gap-3 bg-emerald-50/60 border border-emerald-200 px-3.5 py-2 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold block leading-none">Capital Global Total:</span>
                <span className="text-emerald-700 font-mono font-black text-sm">
                  ${capitalGlobalTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Metric 2: Accionistas */}
            <div className="flex items-center gap-3 bg-sky-50/60 border border-sky-200 px-3.5 py-2 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-sky-100 border border-sky-300 flex items-center justify-center text-sky-700">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold block leading-none">Accionistas Registrados:</span>
                <span className="text-slate-900 font-mono font-bold text-sm">{accionistas.length}</span>
              </div>
            </div>

            {/* Metric 3: Total Aportes */}
            <div className="flex items-center gap-3 bg-amber-50/60 border border-amber-200 px-3.5 py-2 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
                <History className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold block leading-none">Total Aportes:</span>
                <span className="text-amber-800 font-mono font-bold text-sm">{inversiones.length} movimientos</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenWipeModal}
              className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs"
              title="Vaciar módulo de accionistas e inversiones (poner a cero)"
            >
              <Trash2 className="w-3.5 h-3.5" />
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Aporte</span>
            </button>

            <button
              onClick={() => setShowAddAccionistaModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Nuevo Accionista</span>
            </button>
          </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="bg-slate-100 px-6 pt-2.5 border-b border-slate-200 flex gap-2 flex-shrink-0 select-none overflow-x-auto">
          <button
            onClick={() => setActiveTab('matriz')}
            className={`px-4 py-2 rounded-t-xl font-bold text-xs uppercase font-sans transition-all flex items-center gap-2 border-t border-x ${
              activeTab === 'matriz'
                ? 'bg-white border-slate-300 text-indigo-700 font-extrabold shadow-2xs border-b-2 border-b-indigo-600'
                : 'bg-slate-200/60 border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Table className="w-4 h-4 text-indigo-600" />
            Matriz de Inversiones (General)
          </button>

          <button
            onClick={() => setActiveTab('historial')}
            className={`px-4 py-2 rounded-t-xl font-bold text-xs uppercase font-sans transition-all flex items-center gap-2 border-t border-x ${
              activeTab === 'historial'
                ? 'bg-white border-slate-300 text-indigo-700 font-extrabold shadow-2xs border-b-2 border-b-indigo-600'
                : 'bg-slate-200/60 border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <History className="w-4 h-4 text-sky-600" />
            Historial de Movimientos
          </button>

          <button
            onClick={() => setActiveTab('utilidades')}
            className={`px-4 py-2 rounded-t-xl font-bold text-xs uppercase font-sans transition-all flex items-center gap-2 border-t border-x ${
              activeTab === 'utilidades'
                ? 'bg-white border-slate-300 text-indigo-700 font-extrabold shadow-2xs border-b-2 border-b-indigo-600'
                : 'bg-slate-200/60 border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Calculator className="w-4 h-4 text-emerald-600" />
            Calculadora de Utilidad
          </button>

          <button
            onClick={() => setActiveTab('accionistas')}
            className={`px-4 py-2 rounded-t-xl font-bold text-xs uppercase font-sans transition-all flex items-center gap-2 border-t border-x ${
              activeTab === 'accionistas'
                ? 'bg-white border-slate-300 text-indigo-700 font-extrabold shadow-2xs border-b-2 border-b-indigo-600'
                : 'bg-slate-200/60 border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4 text-amber-600" />
            Directorio de Accionistas
          </button>
        </div>

        {/* MAIN BODY AREA */}
        <div className="flex-grow p-6 overflow-y-auto min-h-0 bg-slate-50/50">
          
          {/* TAB 1: MATRIZ DE INVERSIONES (EXCEL LIKE) */}
          {activeTab === 'matriz' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Matriz Global de Aportes de Capital
                  </h3>
                  <p className="text-xs text-slate-500 font-sans mt-0.5">
                    Vista consolidada por fecha y accionista con porcentaje de participación sobre capital global
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs bg-white">
                <table className="w-full text-left font-sans border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-250 text-slate-700 text-[11px] font-extrabold uppercase tracking-wider">
                      <th className="py-3 px-4 w-36 border-r border-slate-200 text-center">AÑO / FECHA</th>
                      {(accionistas || []).map(a => (
                        <th key={a.id} className="py-3 px-4 border-r border-slate-200 text-center min-w-[140px] text-emerald-800 font-black">
                          # {a.nombre.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono text-xs">
                    {fechasUnicas.length === 0 || (accionistas || []).length === 0 ? (
                      <tr>
                        <td colSpan={Math.max(1, (accionistas || []).length + 1)} className="text-center py-12 text-slate-400 font-sans">
                          No hay registros de inversión almacenados o accionistas registrados.
                        </td>
                      </tr>
                    ) : (
                      fechasUnicas.map(f => {
                        const invsEnFecha = (inversiones || []).filter(i => i.fecha === f);
                        return (
                          <tr key={f} className="hover:bg-slate-50/80 transition-colors bg-white">
                            <td className="py-2.5 px-4 font-bold text-slate-700 border-r border-slate-200 font-sans bg-slate-50/40 text-center">
                              {f}
                            </td>
                            {(accionistas || []).map(a => {
                              const invAccion = invsEnFecha.filter(i => i.accionista_id === a.id);
                              const totalF = invAccion.reduce((acc, curr) => acc + curr.monto_usd, 0);
                              return (
                                <td key={a.id} className="py-2.5 px-4 border-r border-slate-200 text-center">
                                  {totalF !== 0 ? (
                                    <span className={totalF < 0 ? 'text-rose-600 font-bold' : 'text-slate-900 font-bold'}>
                                      $ {totalF.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">-</span>
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
                  <tfoot className="bg-slate-50 font-mono border-t-2 border-slate-300">
                    {/* Row Totales */}
                    <tr className="border-b border-slate-200 font-bold text-xs text-slate-900 bg-slate-100/80">
                      <td className="py-3 px-4 uppercase font-sans text-slate-700 font-extrabold border-r border-slate-200 text-center">
                        TOTALES
                      </td>
                      {(accionistas || []).map(a => {
                        const totalA = accionistasTotales[a.id] || 0;
                        return (
                          <td key={a.id} className="py-3 px-4 text-center border-r border-slate-200 font-black text-emerald-700">
                            $ {totalA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Row % de Inversion */}
                    <tr className="bg-emerald-50 text-xs font-black border-b border-emerald-200">
                      <td className="py-3.5 px-4 uppercase font-sans text-emerald-900 font-black border-r border-emerald-200 text-center">
                        % DE INV.
                      </td>
                      {(accionistas || []).map(a => {
                        const totalA = accionistasTotales[a.id] || 0;
                        const pct = capitalGlobalTotal > 0 ? (totalA / capitalGlobalTotal) * 100 : 0;
                        return (
                          <td key={a.id} className="py-3.5 px-4 text-center border-r border-emerald-200 font-black text-emerald-800 text-xs font-mono">
                            {pct.toFixed(2)} %
                          </td>
                        );
                      })}
                    </tr>

                    {/* Row Global Total */}
                    <tr className="bg-emerald-700 text-white font-black text-sm">
                      <td className="py-3.5 px-4 uppercase font-sans text-white font-black border-r border-emerald-800 text-center">
                        TOTAL CAPITAL GLOBAL
                      </td>
                      <td colSpan={Math.max(1, (accionistas || []).length)} className="py-3.5 px-6 text-center text-white text-base font-black font-mono">
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
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Historial Detallado de Movimientos de Inversión
                  </h3>
                  <p className="text-xs text-slate-500 font-sans mt-0.5">
                    Listado cronológico individual con opción para modificar o eliminar aportes
                  </p>
                </div>
              </div>

              {/* BARRA DE FILTROS (POR ACCIONISTA, AÑO, MES Y OBSERVACIÓN) */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase">
                    <Filter className="w-4 h-4 text-indigo-600" />
                    <span>Filtros de Búsqueda</span>
                  </div>

                  {hasActiveFilters && (
                    <button
                      onClick={handleClearFilters}
                      className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Limpiar Filtros
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                  {/* Filtro por Accionista */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Accionista:</label>
                    <select
                      value={filtroAccionista}
                      onChange={e => setFiltroAccionista(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-xs px-2.5 py-1.5 rounded-lg focus:bg-white focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">-- Todos los Accionistas --</option>
                      {accionistas.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filtro por Año */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Año:</label>
                    <select
                      value={filtroAnio}
                      onChange={e => setFiltroAnio(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-xs px-2.5 py-1.5 rounded-lg focus:bg-white focus:border-indigo-500 focus:outline-none font-mono"
                    >
                      <option value="">-- Todos los Años --</option>
                      {aniosDisponibles.map(y => (
                        <option key={y} value={y}>
                          Año {y}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filtro por Múltiples Meses */}
                  <div className="relative" ref={mesDropdownRef}>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Mes(es) {filtrosMeses.length > 0 && <span className="text-indigo-600 font-bold">({filtrosMeses.length})</span>}:
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsMesDropdownOpen(!isMesDropdownOpen)}
                      className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-xs px-2.5 py-1.5 rounded-lg flex items-center justify-between focus:bg-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                    >
                      <span className="truncate">
                        {filtrosMeses.length === 0 
                          ? '-- Todos los Meses --' 
                          : filtrosMeses.length === 1
                            ? meses.find(m => m.value === filtrosMeses[0])?.label
                            : `${filtrosMeses.length} meses seleccionados`}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </button>

                    {isMesDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2.5 space-y-2 text-xs">
                        <div className="flex justify-between items-center pb-1.5 border-b border-slate-100 text-[11px]">
                          <button
                            type="button"
                            onClick={() => setFiltrosMeses([])}
                            className="text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                          >
                            Todos los Meses
                          </button>
                          {filtrosMeses.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setFiltrosMeses([])}
                              className="text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              Limpiar
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                          {meses.map(m => {
                            const isChecked = filtrosMeses.includes(m.value);
                            return (
                              <label
                                key={m.value}
                                className={`flex items-center gap-1.5 p-1.5 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                                  isChecked ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleMes(m.value)}
                                  className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                />
                                <span>{m.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Buscador de Observación / Concepto */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Buscar Detalle / ID:</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Observación o #ID..."
                        value={filtroBusqueda}
                        onChange={e => setFiltroBusqueda(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-xs pl-2.5 pr-7 py-1.5 rounded-lg focus:bg-white focus:border-indigo-500 focus:outline-none"
                      />
                      {filtroBusqueda && (
                        <button
                          onClick={() => setFiltroBusqueda('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Etiquetas de Meses Seleccionados */}
                {filtrosMeses.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">Meses activos:</span>
                    {filtrosMeses.map(mv => {
                      const mObj = meses.find(m => m.value === mv);
                      return (
                        <span key={mv} className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                          {mObj?.label}
                          <button type="button" onClick={() => toggleMes(mv)} className="hover:text-indigo-900 cursor-pointer">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Resumen de Resultados Filtrados */}
                <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 font-sans">
                    Mostrando <strong className="text-slate-800 font-mono font-bold">{filteredInversiones.length}</strong> de <strong className="text-slate-800 font-mono font-bold">{inversiones.length}</strong> movimientos
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] text-slate-500 uppercase font-bold">Total Filtrado:</span>
                    <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-black px-2.5 py-0.5 rounded-md text-xs">
                      ${totalFilteredUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </span>
                  </div>
                </div>
              </div>

              {/* TABLA DE MOVIMIENTOS */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left font-sans text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-250">
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Accionista</th>
                      <th className="py-3 px-4 text-right">Monto ($ USD)</th>
                      <th className="py-3 px-4">Observación / Concepto</th>
                      <th className="py-3 px-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs bg-white">
                    {filteredInversiones.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-slate-400 font-sans">
                          {hasActiveFilters 
                            ? 'No se encontraron movimientos que coincidan con los filtros seleccionados.' 
                            : 'No hay movimientos registrados.'}
                        </td>
                      </tr>
                    ) : (
                      filteredInversiones.map(inv => {
                        const accionistaObj = accionistas.find(a => a.id === inv.accionista_id);
                        return (
                          <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-mono text-slate-500">#{inv.id}</td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-700">{inv.fecha}</td>
                            <td className="py-3 px-4 font-bold text-indigo-700">
                              {accionistaObj ? accionistaObj.nombre : `Accionista #${inv.accionista_id}`}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-right">
                              <span className={inv.monto_usd < 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-black'}>
                                ${inv.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600 italic">{inv.observacion || '-'}</td>
                            <td className="py-3 px-4 text-center space-x-1.5">
                              <button
                                onClick={() => handleEditInversionClick(inv)}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all shadow-2xs cursor-pointer"
                                title="Editar Aporte"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteInversionClick(inv.id)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-lg transition-all cursor-pointer"
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
                  {filteredInversiones.length > 0 && (
                    <tfoot className="bg-slate-50 font-mono font-bold text-xs border-t-2 border-slate-200">
                      <tr>
                        <td colSpan={3} className="py-3 px-4 uppercase text-slate-700 font-sans font-extrabold">
                          Total Filtrado ({filteredInversiones.length} movimientos)
                        </td>
                        <td className="py-3 px-4 text-right font-black text-emerald-700">
                          ${totalFilteredUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: CALCULADORA DE UTILIDAD Y GASTOS OPERATIVOS */}
          {activeTab === 'utilidades' && (
            <div className="space-y-4 w-full py-1">
              <div ref={reportContainerRef} className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5 text-slate-800">
                
                {/* HEADER ACTIONS BAR */}
                <div className="flex flex-wrap justify-between items-center border-b border-slate-200 pb-3 gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-emerald-600" />
                      Cálculo de Distribución de Utilidades y Gastos Operativos
                    </h3>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      Deducción automática de gastos operativos y distribución proporcional para accionistas
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleSendWhatsAppReport}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Enviar reporte completo con detalle por WhatsApp"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>📲 WhatsApp</span>
                    </button>

                    <button
                      onClick={handleDownloadReportImage}
                      className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Descargar imagen visual en alta calidad (PNG) para adjuntar"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>📷 Descargar Imagen</span>
                    </button>

                    <button
                      onClick={handleCopyUtilidades}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                    >
                      {copiedNotification ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedNotification ? '¡Copiado!' : '📋 Copiar'}</span>
                    </button>
                  </div>
                </div>

                {/* TWO-COLUMN GRID: LEFT (Cálculos & Gastos) | RIGHT (Distribución Accionistas) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  
                  {/* LEFT COLUMN: Cálculos, Utilidad y Gastos */}
                  <div className="lg:col-span-6 space-y-4">
                    
                    {/* RESUMEN FINANCIERO EN KPI CARDS */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-sans">
                      {/* Utilidad Bruta */}
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
                        <span className="text-[9.5px] font-extrabold uppercase text-slate-500 tracking-wider block">📈 Utilidad Bruta</span>
                        <div className="flex flex-col">
                          <span className="text-base font-black font-mono text-emerald-700">${utilidadBrutaNum.toFixed(2)} USD</span>
                          {effectiveTasa > 1 && (
                            <span className="text-[10px] font-mono font-bold text-slate-400">Bs {utilidadBrutaVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          )}
                        </div>
                      </div>

                      {/* Total Gastos Operativos */}
                      <div className="bg-rose-50/50 border border-rose-200 p-3 rounded-xl space-y-1">
                        <span className="text-[9.5px] font-extrabold uppercase text-rose-700 tracking-wider block">🔻 (-) Gastos</span>
                        <div className="flex flex-col">
                          <span className="text-base font-black font-mono text-rose-600">-${totalGastosUSD.toFixed(2)} USD</span>
                          {effectiveTasa > 1 && (
                            <span className="text-[10px] font-mono font-bold text-rose-500/90">-Bs {totalGastosVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          )}
                        </div>
                      </div>

                      {/* Utilidad Neta Distribuable */}
                      <div className="bg-emerald-50 border border-emerald-300 p-3 rounded-xl space-y-1 shadow-xs">
                        <span className="text-[9.5px] font-extrabold uppercase text-emerald-800 tracking-wider block">💰 (=) Neta Distrib.</span>
                        <div className="flex flex-col">
                          <span className="text-base font-black font-mono text-emerald-800">${utilidadNetaUSD.toFixed(2)} USD</span>
                          {effectiveTasa > 1 && (
                            <span className="text-[10px] font-mono font-bold text-emerald-700">Bs {utilidadNetaVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* CAMPO INGRESO UTILIDAD BRUTA */}
                    <div className="bg-slate-50 border border-emerald-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <label className="text-xs font-black uppercase text-emerald-900 tracking-wider block font-sans">
                          Ingresar / Modificar Utilidad Bruta ($):
                        </label>
                        <p className="text-[10.5px] text-slate-500 mt-0.5">Monto base antes de deducir gastos</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-700 font-black text-lg">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={montoUtilidadInput}
                          onChange={(e) => setMontoUtilidadInput(e.target.value)}
                          placeholder="0.00"
                          className="bg-white border-2 border-emerald-500 focus:border-emerald-600 text-emerald-900 font-mono font-black text-lg px-3 py-1.5 rounded-xl text-right w-36 outline-none transition-all shadow-xs"
                        />
                      </div>
                    </div>

                    {/* MÓDULO DE GASTOS OPERATIVOS DEDUCIBLES */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                      <div className="flex flex-wrap justify-between items-center border-b border-slate-200 pb-2.5 gap-2">
                        <div>
                          <h4 className="text-xs font-extrabold uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                            <Receipt className="w-4 h-4 text-rose-500" />
                            Gastos Operativos Deducibles
                          </h4>
                          <p className="text-[10.5px] text-slate-500">
                            Restan a la utilidad antes de la repartición
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
                          className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Agregar Gasto</span>
                        </button>
                      </div>

                      {gastos.length === 0 ? (
                        <div className="text-center py-5 text-slate-400 text-xs font-sans italic border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                          No hay gastos deducibles registrados.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left font-sans text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase text-[10px] font-extrabold">
                                <th className="py-2 px-3">Concepto / Servicio</th>
                                <th className="py-2 px-3">Fecha</th>
                                <th className="py-2 px-3 text-right">Monto ($ USD)</th>
                                <th className="py-2 px-3 text-center">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 font-mono text-xs text-slate-700 bg-white">
                              {gastos.map(g => (
                                <tr key={g.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="py-2 px-3 font-sans font-bold text-slate-900">{g.concepto}</td>
                                  <td className="py-2 px-3 text-slate-500 text-[11px]">{g.fecha}</td>
                                  <td className="py-2 px-3 text-right font-black text-rose-600">${g.monto_usd.toFixed(2)}</td>
                                  <td className="py-2 px-3 text-center space-x-1 font-sans">
                                    <button
                                      onClick={() => handleEditGastoClick(g)}
                                      className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                                      title="Editar Gasto"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteGastoClick(g)}
                                      className="p-1 text-rose-600 hover:text-rose-700 cursor-pointer"
                                      title="Eliminar Gasto"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-100 font-mono font-bold text-xs border-t border-slate-200">
                              <tr>
                                <td colSpan={2} className="py-2 px-3 uppercase text-slate-700 font-sans font-bold">Total Gastos Deducibles</td>
                                <td className="py-2 px-3 text-right font-black text-rose-600">-${totalGastosUSD.toFixed(2)} USD</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Distribución Proporcional por Accionista */}
                  <div className="lg:col-span-6 space-y-3">
                    <div className="flex flex-wrap justify-between items-center border-b border-slate-200 pb-2 gap-2">
                      <h4 className="text-xs font-extrabold uppercase text-slate-800 tracking-wider font-sans flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-700" />
                        Distribución Proporcional por Accionista
                      </h4>
                      <span className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono font-bold px-2 py-0.5 rounded-md">
                        Base Neta: ${utilidadNetaUSD.toFixed(2)} USD
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                      <table className="w-full text-left font-sans border-collapse text-xs">
                        <thead>
                          <tr className="bg-emerald-700 border-b border-emerald-800 text-white text-[10.5px] font-extrabold uppercase tracking-wider">
                            <th className="py-2.5 px-3 border-r border-emerald-800">Accionistas</th>
                            <th className="py-2.5 px-3 border-r border-emerald-800 text-right">Mto Inv ($)</th>
                            <th className="py-2.5 px-3 border-r border-emerald-800 text-right">% Inv</th>
                            <th className="py-2.5 px-3 text-right border-r border-emerald-800">A Cobrar ($)</th>
                            {effectiveTasa > 1 && <th className="py-2.5 px-3 text-right">A Cobrar (Bs)</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-xs font-mono font-bold bg-white">
                          {accionistas.map(a => {
                            const mtoInv = accionistasTotales[a.id] || 0;
                            const pctInv = capitalGlobalTotal > 0 ? (mtoInv / capitalGlobalTotal) * 100 : 0;
                            const mtoCobrarUsd = (mtoInv / (capitalGlobalTotal || 1)) * utilidadNetaUSD;
                            const mtoCobrarVes = mtoCobrarUsd * effectiveTasa;

                            return (
                              <tr key={a.id} className="hover:bg-slate-50 transition-colors text-slate-800">
                                <td className="py-2.5 px-3 font-sans font-bold border-r border-slate-200 text-xs text-slate-900">
                                  {a.nombre}
                                </td>
                                <td className="py-2.5 px-3 text-right border-r border-slate-200 text-slate-700">
                                  ${mtoInv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="py-2.5 px-3 text-right border-r border-slate-200 text-indigo-700 font-black text-xs">
                                  {pctInv.toFixed(2).replace('.', ',')}%
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-emerald-700 text-xs border-r border-slate-200">
                                  ${mtoCobrarUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                {effectiveTasa > 1 && (
                                  <td className="py-2.5 px-3 text-right font-black text-sky-700 text-xs">
                                    Bs {mtoCobrarVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-100 font-mono font-black border-t-2 border-slate-300 text-xs">
                          <tr>
                            <td className="py-3 px-3 font-sans uppercase text-slate-900 border-r border-slate-200 font-extrabold">
                              TOTAL NETOS
                            </td>
                            <td className="py-3 px-3 text-right border-r border-slate-200 text-slate-900">
                              ${capitalGlobalTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-3 text-right border-r border-slate-200 text-indigo-700">
                              100,00%
                            </td>
                            <td className="py-3 px-3 text-right text-emerald-700 font-black text-sm border-r border-slate-200">
                              ${utilidadNetaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            {effectiveTasa > 1 && (
                              <td className="py-3 px-3 text-right text-sky-700 font-black text-sm">
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
            </div>
          )}

          {/* TAB 4: DIRECTORIO DE ACCIONISTAS */}
          {activeTab === 'accionistas' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Directorio de Accionistas Registrados
                  </h3>
                  <p className="text-xs text-slate-500 font-sans mt-0.5">
                    Administre la información de los socios e integrantes del grupo accionario
                  </p>
                </div>
                <button
                  onClick={() => setShowAddAccionistaModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nuevo Accionista</span>
                </button>
              </div>

              {(accionistas || []).length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 font-sans shadow-xs">
                  <Users className="w-10 h-10 text-slate-400 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-700 uppercase">No hay accionistas registrados en la base de datos</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Haga clic en <strong className="text-indigo-600">"Nuevo Accionista"</strong> para comenzar a registrar a los integrantes del grupo accionario.
                  </p>
                  <button
                    onClick={() => setShowAddAccionistaModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5 transition-all shadow-xs mt-2 cursor-pointer"
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
                      <div key={a.id} className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-5 shadow-xs space-y-3 relative overflow-hidden group transition-all">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">ID Accionista #{a.id}</span>
                            <h4 className="text-sm font-extrabold text-slate-900 truncate">{a.nombre}</h4>
                            <p className="text-xs text-slate-500">{a.cedula_rif || 'Sin Cédula/RIF'}</p>
                            {a.telefono && <p className="text-xs text-slate-500 font-mono mt-0.5">{a.telefono}</p>}
                          </div>
                          <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-mono font-black px-2.5 py-1 rounded-xl ml-2 flex-shrink-0 shadow-2xs tracking-wide">
                            {pct.toFixed(2)} % Inv
                          </span>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                          <span className="text-[11px] text-slate-500 uppercase font-bold">Capital Total:</span>
                          <span className={`text-base font-mono font-black ${ totalInv === 0 ? 'text-slate-400' : 'text-emerald-700' }`}>
                            ${totalInv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        {/* ACTION BUTTONS */}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleEditAccionistaClick(a)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteAccionistaClick(a)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                              canDelete
                                ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600'
                                : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-800">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-extrabold text-sm uppercase text-slate-800 font-sans flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                {editingInversion ? 'Editar Aporte de Inversión' : 'Registrar Nuevo Aporte de Inversión'}
              </h3>
              <button onClick={() => setShowAddInversionModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveInversion} className="p-6 space-y-4 font-sans text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Accionista:</label>
                <select
                  value={formAccionistaId}
                  onChange={(e) => setFormAccionistaId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 outline-none focus:bg-white focus:border-indigo-500"
                >
                  {accionistas.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} {a.cedula_rif ? `(${a.cedula_rif})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Fecha del Aporte (Actual o Pasada):</label>
                <input
                  type="date"
                  value={formFecha}
                  onChange={(e) => setFormFecha(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 outline-none focus:bg-white focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Monto ($ USD):</label>
                <input
                  type="number"
                  step="0.01"
                  value={formMontoUsd}
                  onChange={(e) => setFormMontoUsd(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 outline-none focus:bg-white focus:border-emerald-500 font-mono font-bold text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Observación / Concepto:</label>
                <textarea
                  rows={3}
                  value={formObservacion}
                  onChange={(e) => setFormObservacion(e.target.value)}
                  placeholder="Ej: Aporte inicial de capital, inyección proyecto..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 outline-none focus:bg-white focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddInversionModal(false)}
                  className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl uppercase text-xs transition-all"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl uppercase text-xs transition-all shadow-xs"
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-800">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-extrabold text-sm uppercase text-slate-800 font-sans flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                {editingAccionista ? 'Editar Accionista' : 'Registrar Nuevo Accionista'}
              </h3>
              <button onClick={() => { setShowAddAccionistaModal(false); setEditingAccionista(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccionista} className="p-6 space-y-4 font-sans text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Nombre Completo:</label>
                <input
                  type="text"
                  value={formNombreAccionista}
                  onChange={(e) => setFormNombreAccionista(e.target.value)}
                  placeholder="Ej: Carlos Mendoza"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 outline-none focus:bg-white focus:border-indigo-500 font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Cédula o RIF:</label>
                <input
                  type="text"
                  value={formCedulaAccionista}
                  onChange={(e) => setFormCedulaAccionista(e.target.value)}
                  placeholder="V-12345678 / J-123456789"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 outline-none focus:bg-white focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Teléfono:</label>
                <input
                  type="text"
                  value={formTelefonoAccionista}
                  onChange={(e) => setFormTelefonoAccionista(e.target.value)}
                  placeholder="0424-0000000"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 outline-none focus:bg-white focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowAddAccionistaModal(false); setEditingAccionista(null); setFormNombreAccionista(''); setFormCedulaAccionista(''); setFormTelefonoAccionista(''); }}
                  className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl uppercase text-xs transition-all"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl uppercase text-xs transition-all shadow-xs"
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden text-slate-800">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-600">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-sm uppercase text-slate-800 font-sans">
                Confirmar Eliminación
              </h3>
            </div>

            <div className="p-6 space-y-4 font-sans text-xs">
              {deleteConfirm.capital > 0 ? (
                // BLOCKED: has capital
                <div className="space-y-3">
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center space-y-2">
                    <div className="text-3xl">⛔</div>
                    <p className="text-xs font-bold text-rose-900">
                      No se puede eliminar a <span className="underline">{deleteConfirm.accionista.nombre}</span>
                    </p>
                    <p className="text-[11px] text-rose-700">
                      Este accionista tiene un capital invertido de{' '}
                      <strong className="font-mono">
                        ${deleteConfirm.capital.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </strong>.
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Para eliminar el accionista, primero debe llevar su capital total a <strong>$0.00</strong> registrando los retiros o ajustes correspondientes en el Historial de Movimientos.
                    </p>
                  </div>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wide transition-all"
                  >
                    Entendido
                  </button>
                </div>
              ) : (
                // ALLOWED: capital is zero
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-250 rounded-xl p-4 text-center space-y-2">
                    <div className="text-3xl">⚠️</div>
                    <p className="text-sm font-bold text-slate-800">
                      ¿Eliminar a <span className="text-rose-600">{deleteConfirm.accionista.nombre}</span>?
                    </p>
                    <p className="text-xs text-slate-500">
                      Capital actual: <strong className="text-slate-700 font-mono">$0.00</strong>. Esta acción eliminará al accionista y todos sus registros históricos. Esta acción <strong className="text-rose-600">no se puede deshacer</strong>.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs uppercase transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleConfirmDeleteAccionista}
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wide transition-all flex items-center justify-center gap-1.5 shadow-xs"
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-800 font-sans">
            {/* Header */}
            <div className="bg-rose-50 px-6 py-4 border-b border-rose-200 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-100 border border-rose-300 rounded-xl text-rose-700">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <h3 className="font-extrabold text-sm uppercase text-rose-800 tracking-wide">
                  Vaciar Módulo de Accionistas
                </h3>
              </div>
              <button
                onClick={() => { setShowWipeModal(false); setWipeConfirmWord(''); }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4 space-y-2 text-center">
                <div className="text-3xl">⚠️</div>
                <p className="text-xs font-bold text-rose-800 uppercase tracking-wide">
                  Advertencia de Acción Destructiva
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Esta acción borrará <strong className="text-rose-600">TODOS</strong> los accionistas registrados y sus aportes de capital, dejando el módulo de inversiones en <strong>cero (0)</strong>.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-700 block text-center">
                  Escriba <span className="text-rose-600 font-mono font-black">"CONFIRMAR"</span> para autorizar:
                </label>
                <input
                  type="text"
                  placeholder="Escriba CONFIRMAR..."
                  value={wipeConfirmWord}
                  onChange={(e) => setWipeConfirmWord(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-rose-500 text-center font-mono font-bold text-sm text-slate-900 px-4 py-2.5 rounded-xl outline-none transition-all placeholder-slate-400 shadow-2xs"
                  autoFocus
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowWipeModal(false); setWipeConfirmWord(''); }}
                  className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl uppercase text-xs transition-all"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="button"
                  disabled={!wipeConfirmWord.trim().toUpperCase().includes('CONFIRMAR') || wipeLoading}
                  onClick={handleExecuteWipeAccionistas}
                  className={`w-1/2 font-bold py-2.5 rounded-xl uppercase text-xs transition-all flex items-center justify-center gap-2 shadow-xs ${
                    wipeConfirmWord.trim().toUpperCase().includes('CONFIRMAR')
                      ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-800 font-sans">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-extrabold text-sm uppercase text-slate-800 font-sans flex items-center gap-2">
                <Receipt className="w-4 h-4 text-rose-600" />
                {editingGasto ? 'Editar Gasto Operativo' : 'Registrar Gasto Deducible'}
              </h3>
              <button onClick={() => { setShowAddGastoModal(false); setEditingGasto(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGasto} className="p-6 space-y-4 text-xs">
              {/* Preset concept buttons */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Presets Rápidos:</label>
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
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Concepto / Nombre del Servicio:</label>
                <input
                  type="text"
                  value={formGastoConcepto}
                  onChange={(e) => setFormGastoConcepto(e.target.value)}
                  placeholder="Ej: Factura Corpoelec, Cantv, Alquiler..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 outline-none focus:bg-white focus:border-rose-500 font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Monto ($ USD):</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-rose-600 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formGastoMontoUsd}
                    onChange={(e) => setFormGastoMontoUsd(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-7 pr-3 py-2.5 text-rose-600 font-mono font-black text-sm outline-none focus:bg-white focus:border-rose-500"
                    required
                  />
                </div>
                {effectiveTasa > 1 && parseFloat(formGastoMontoUsd || '0') > 0 && (
                  <p className="text-[10px] text-slate-500 font-mono text-right mt-1">
                    Equivalente en Bs: <strong className="text-slate-800">Bs {(parseFloat(formGastoMontoUsd) * effectiveTasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Fecha:</label>
                <input
                  type="date"
                  value={formGastoFecha}
                  onChange={(e) => setFormGastoFecha(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 outline-none focus:bg-white focus:border-rose-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase block">Observación / Detalle (Opcional):</label>
                <textarea
                  rows={2}
                  value={formGastoObservacion}
                  onChange={(e) => setFormGastoObservacion(e.target.value)}
                  placeholder="Ej: Pago de recibo Nro. #12345..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 outline-none focus:bg-white focus:border-rose-500 resize-none"
                />
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowAddGastoModal(false); setEditingGasto(null); }}
                  className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl uppercase text-xs transition-all"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl uppercase text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
