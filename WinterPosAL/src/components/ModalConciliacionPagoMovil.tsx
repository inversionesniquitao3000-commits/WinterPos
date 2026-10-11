import React, { useState, useEffect } from 'react';
import {
  X, CheckCircle2, AlertTriangle, Search, Upload, RefreshCw,
  FileText, ShieldCheck, Landmark, Check, HelpCircle, Copy,
  Smartphone, Wifi, WifiOff, Terminal, Globe, Sparkles, Play, Eye, EyeOff
} from 'lucide-react';

interface ModalConciliacionPagoMovilProps {
  isOpen: boolean;
  onClose: () => void;
  cajaId?: any;
  clienteActual?: any;
  defaultMontoVES?: number;
  defaultReferencia?: string;
  onReferenceVerified?: (ref: string, montoVES: number) => void;
}

export const cleanBdvMessage = (msg: string) => {
  if (!msg || typeof msg !== 'string') return '';
  return msg
    .replace(/Transacci(?:[^\w\s]|[\ufffd\?\¿])+n/gi, 'Transacción')
    .replace(/Transacci\s*n/gi, 'Transacción')
    .replace(/operaci(?:[^\w\s]|[\ufffd\?\¿])+n/gi, 'operación')
    .replace(/conciliaci(?:[^\w\s]|[\ufffd\?\¿])+n/gi, 'conciliación')
    .replace(/realizaci(?:[^\w\s]|[\ufffd\?\¿])+n/gi, 'realización')
    .replace(/cr(?:[^\w\s]|[\ufffd\?\¿])+dito/gi, 'crédito')
    .replace(/d(?:[^\w\s]|[\ufffd\?\¿])+bito/gi, 'débito')
    .replace(/éxit[^\w\s]*osa/gi, 'exitosa')
    .replace(/estatus\s*:\s*/gi, 'estatus: ')
    .trim();
};

export const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getYesterdayDateStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateStr(d);
};

export const formatBdvFecha = (fechaStr: any, createdAtStr?: any) => {
  // Si tenemos createdAtStr (timestamp real de cuando se registró el movimiento), lo usamos con prioridad
  const targetStr = createdAtStr || fechaStr;
  if (!targetStr) return '';

  try {
    const cleanStr = String(targetStr).replace(' ', 'T');
    const dt = new Date(cleanStr);
    if (!isNaN(dt.getTime())) {
      const fechaLocal = dt.toLocaleDateString('es-VE');
      const horaLocal = dt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${fechaLocal} (${horaLocal})`;
    }
  } catch (_) {}

  // Fallback si no tiene hora pero tiene fecha en formato YYYY-MM-DD
  const match = String(fechaStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [_, y, m, d] = match;
    return `${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`;
  }

  const dt = new Date(fechaStr);
  return isNaN(dt.getTime()) ? String(fechaStr) : dt.toLocaleDateString('es-VE');
};

export const ModalConciliacionPagoMovil: React.FC<ModalConciliacionPagoMovilProps> = ({
  isOpen,
  onClose,
  cajaId,
  clienteActual,
  defaultMontoVES,
  defaultReferencia,
  onReferenceVerified,
}) => {
  const [activeTab, setActiveTab] = useState<'validador' | 'conciliacion' | 'historial' | 'guia'>('validador');

  // Estados de conectividad y configuración BDV
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [bdvConfig, setBdvConfig] = useState<any>(null);
  const [bancosList, setBancosList] = useState<Array<{ codigo: string; nombre: string }>>([]);

  // Webhook State
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [tunnelMode, setTunnelMode] = useState<'local' | 'remote'>('local');
  const [customTunnelUrl, setCustomTunnelUrl] = useState(() => localStorage.getItem('pos_custom_public_webhook_url') || '');
  const [copiedTunnelCmd, setCopiedTunnelCmd] = useState(false);
  const [copiedRemoteUrl, setCopiedRemoteUrl] = useState(false);

  // Background Tunnel State
  const [tunnelStatus, setTunnelStatus] = useState<any>(null);
  const [isStartingTunnelInModal, setIsStartingTunnelInModal] = useState(false);
  const [showManualCmd, setShowManualCmd] = useState(false);

  // Tab 1: Validador Rápido en Caja
  const [inputRef, setInputRef] = useState('');
  const [inputMonto, setInputMonto] = useState('');
  const [cedulaPagador, setCedulaPagador] = useState('');
  const [telefonoPagador, setTelefonoPagador] = useState('');
  const [bancoOrigen, setBancoOrigen] = useState('0102');
  const [telefonoDestino, setTelefonoDestino] = useState('TODOS');
  const [fechaPago, setFechaPago] = useState(() => getLocalDateStr());
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  // Tab 2: Conciliación de Turno & Importación
  const [pastedText, setPastedText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<any>(null);
  const [reconcileData, setReconcileData] = useState<any>(null);
  const [isLoadingReconcile, setIsLoadingReconcile] = useState(false);

  // Tab 3: Historial BDV
  const [bdvMovements, setBdvMovements] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyDateFilter, setHistoryDateFilter] = useState<'hoy' | 'ayer' | 'todos' | 'custom'>('hoy');
  const [customHistoryDate, setCustomHistoryDate] = useState(() => getLocalDateStr());
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  // Detector de conectividad en vivo
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listener universal para cerrar modal con tecla Escape (ESC) en Web y Desktop (Electron/Navegador)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setInputRef(defaultReferencia || '');
      setInputMonto(defaultMontoVES ? defaultMontoVES.toFixed(2) : '');
      setValidationResult(null);
      setImportSummary(null);
      setFechaPago(getLocalDateStr());

      // Precargar datos del cliente si existe
      if (clienteActual) {
        const doc = (clienteActual.cedula_rif || '').trim();
        const tel = (clienteActual.telefono || '').trim();
        if (doc) {
          const cleanDoc = doc.toUpperCase().replace(/[^A-Z0-9]/g, '');
          setCedulaPagador(/^[VJEGP]/.test(cleanDoc) ? cleanDoc : `V${cleanDoc}`);
        } else {
          setCedulaPagador('');
        }
        setTelefonoPagador(tel);
      }

      fetchReconciliationSummary();
      fetchBdvHistory('hoy');

      // Cargar configuración de BDV y bancos venezolanos
      fetch('/api/conciliacion/bdv/config')
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            setBdvConfig(d);
            if (Array.isArray(d.bancos)) {
              setBancosList(d.bancos);
            }
            if (d.bdvTelefonoDefault) {
              setTelefonoDestino(d.bdvTelefonoDefault);
            } else if (Array.isArray(d.bdvTelefonosDestino) && d.bdvTelefonosDestino.length > 0) {
              const item = d.bdvTelefonosDestino[0];
              const phone = typeof item === 'object' ? item.telefono : item;
              setTelefonoDestino(phone || 'TODOS');
            } else {
              setTelefonoDestino('TODOS');
            }
          }
        })
        .catch(() => {});

      fetch('/api/conciliacion/webhook-info')
        .then(r => r.json())
        .then(d => {
          if (d.success && d.webhookUrl) {
            setWebhookUrl(d.webhookUrl);
          } else {
            setWebhookUrl(`http://${window.location.hostname}:5000/api/conciliacion/sms-webhook`);
          }
        })
        .catch(() => {
          setWebhookUrl(`http://${window.location.hostname}:5000/api/conciliacion/sms-webhook`);
        });

      fetchTunnelStatus();
    }
  }, [isOpen, defaultReferencia, defaultMontoVES, clienteActual]);

  const fetchTunnelStatus = async () => {
    try {
      const r = await fetch('/api/conciliacion/tunnel/status');
      if (r.ok) {
        const d = await r.json();
        setTunnelStatus(d);
        if (d.status === 'running' && d.publicUrl) {
          setCustomTunnelUrl(d.publicUrl);
        }
      }
    } catch (_) {}
  };

  const handleStartTunnelFromModal = async () => {
    setIsStartingTunnelInModal(true);
    try {
      const res = await fetch('/api/conciliacion/tunnel/start', { method: 'POST' });
      const d = await res.json();
      if (d.success) {
        setTimeout(fetchTunnelStatus, 1500);
        setTimeout(fetchTunnelStatus, 3500);
        setTimeout(fetchTunnelStatus, 6000);
      }
    } catch (_) {}
    finally {
      setIsStartingTunnelInModal(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const cloudflareCmd = 'npx cloudflared tunnel --url http://localhost:5000';

  const handleCopyTunnelCmd = () => {
    navigator.clipboard.writeText(cloudflareCmd);
    setCopiedTunnelCmd(true);
    setTimeout(() => setCopiedTunnelCmd(false), 2500);
  };

  const cleanBaseTunnelUrl = customTunnelUrl.trim().replace(/\/+$/, '');
  const fullRemoteWebhookUrl = cleanBaseTunnelUrl
    ? `${cleanBaseTunnelUrl}/api/conciliacion/sms-webhook`
    : '';

  const handleCopyRemoteUrl = () => {
    const target = tunnelStatus?.webhookUrl || fullRemoteWebhookUrl;
    if (!target) return;
    navigator.clipboard.writeText(target);
    setCopiedRemoteUrl(true);
    setTimeout(() => setCopiedRemoteUrl(false), 2500);
  };

  const handleCustomTunnelChange = (val: string) => {
    setCustomTunnelUrl(val);
    localStorage.setItem('pos_custom_public_webhook_url', val);
  };

  if (!isOpen) return null;

  // 1. Validar referencia en tiempo real contra BDV API o BD local
  const handleValidateReference = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputRef.trim() || !inputMonto.trim()) return;

    // Si el navegador reporta sin internet, notificar amigablemente y permitir cobro directo
    if (!navigator.onLine) {
      setValidationResult({
        verified: false,
        isNetworkError: true,
        message: 'Dispositivo sin conexión a internet. Puede omitir la validación y facturar de inmediato.'
      });
      return;
    }

    setIsValidating(true);
    setValidationResult(null);
    try {
      // Si el comercio tiene configurado el API Key de BDV, consultar el Core Bancario oficial
      if (bdvConfig?.bdvApiKey) {
        const res = await fetch('/api/conciliacion/validar-bdv-api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cedulaPagador: cedulaPagador.trim(),
            telefonoPagador: telefonoPagador.trim(),
            telefonoDestino: telefonoDestino || undefined,
            referencia: inputRef.trim(),
            fechaPago: fechaPago || new Date().toISOString().split('T')[0],
            importe: parseFloat(inputMonto.replace(',', '.')),
            bancoOrigen: bancoOrigen || '0102',
            cajaId: cajaId || null
          })
        });
        const data = await res.json();
        setValidationResult(data);
      } else {
        // Fallback a validación interna (SMS / Extractos)
        const res = await fetch('/api/conciliacion/validar-referencia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referencia: inputRef.trim(),
            monto_ves: parseFloat(inputMonto.replace(',', '.'))
          })
        });
        const data = await res.json();
        setValidationResult(data);
      }
    } catch (err: any) {
      setValidationResult({
        verified: false,
        isNetworkError: true,
        message: 'No se pudo conectar con el servicio (' + err.message + '). Puede omitir la validación y facturar manualmente de inmediato.'
      });
    } finally {
      setIsValidating(false);
      fetchBdvHistory();
    }
  };

  // Función de escape offline: permite facturar inmediatamente sin trabas
  const handleBypassOffline = () => {
    if (onReferenceVerified && inputRef.trim()) {
      onReferenceVerified(inputRef.trim(), parseFloat(inputMonto.replace(',', '.') || '0'));
    }
    onClose();
  };


  // 2. Importar extracto BDV (texto copiado o CSV)
  const handleImportBdvText = async () => {
    if (!pastedText.trim()) return;

    setIsImporting(true);
    setImportSummary(null);
    try {
      const res = await fetch('/api/conciliacion/importar-extracto-bdv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: pastedText,
          cajaId: cajaId || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setImportSummary(data);
        setPastedText('');
        fetchReconciliationSummary();
      } else {
        alert(data.message || 'Error importando extracto.');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  // 3. Obtener resumen de conciliación del turno
  const fetchReconciliationSummary = async () => {
    setIsLoadingReconcile(true);
    try {
      const res = await fetch('/api/conciliacion/conciliar-turno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cajaId: cajaId || null })
      });
      const data = await res.json();
      if (data.success) {
        setReconcileData(data);
      }
    } catch (_) {}
    finally {
      setIsLoadingReconcile(false);
    }
  };

  // 4. Cargar historial de movimientos BDV con filtros
  const fetchBdvHistory = async (
    datePreset?: 'hoy' | 'ayer' | 'todos' | 'custom',
    customDate?: string,
    search?: string
  ) => {
    setIsLoadingHistory(true);
    try {
      const preset = datePreset !== undefined ? datePreset : historyDateFilter;
      const customD = customDate !== undefined ? customDate : customHistoryDate;
      const sTerm = search !== undefined ? search : historySearchTerm;

      let dateQuery = '';
      if (preset === 'hoy') {
        dateQuery = `&date=${getLocalDateStr()}`;
      } else if (preset === 'ayer') {
        dateQuery = `&date=${getYesterdayDateStr()}`;
      } else if (preset === 'custom' && customD) {
        dateQuery = `&date=${customD}`;
      }

      const searchQuery = sTerm && sTerm.trim() ? `&search=${encodeURIComponent(sTerm.trim())}` : '';

      const res = await fetch(`/api/conciliacion/movimientos-bdv?limit=100${dateQuery}${searchQuery}`);
      const data = await res.json();
      if (data.success) {
        setBdvMovements(data.movements || []);
      }
    } catch (_) {}
    finally {
      setIsLoadingHistory(false);
    }
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-3 font-sans animate-fade-in cursor-default"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl xl:max-w-6xl overflow-hidden flex flex-col max-h-[94vh]">

        {/* HEADER BDV / SEGURIDAD BANCARIA */}
        <div className="bg-gradient-to-r from-red-700 via-rose-700 to-slate-900 px-6 py-4 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
              <Landmark className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white">Conciliación de Pago Móvil</h2>
                <span className="bg-red-500/80 text-white font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider border border-white/20">
                  Banco de Venezuela (BDV)
                </span>
              </div>
              <p className="text-xs text-rose-100 font-medium">Validación antifraude de pagos recibidos en cuenta</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NAVIGATION TABS */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('validador')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'validador'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Validador Rápido en Caja
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('conciliacion');
              fetchReconciliationSummary();
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'conciliacion'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
            }`}
          >
            <RefreshCw className="w-4 h-4 text-sky-600" />
            Conciliación de Turno
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('historial');
              fetchBdvHistory();
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'historial'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
            }`}
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            Movimientos BDV ({bdvMovements.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guia')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'guia'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
            }`}
          >
            <HelpCircle className="w-4 h-4 text-amber-600" />
            ¿Cómo Funciona?
          </button>
        </div>

        {/* TAB 1: VALIDADOR RÁPIDO EN CAJA */}
        {activeTab === 'validador' && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <form onSubmit={handleValidateReference} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-rose-600" />
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    Validación Antifraude Banco de Venezuela (BDV)
                  </span>
                </div>
                <div>
                  {isOnline ? (
                    <span className="text-[10.5px] text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5 border border-emerald-300">
                      <Wifi className="w-3 h-3 text-emerald-600" />
                      BDV En Línea
                    </span>
                  ) : (
                    <span className="text-[10.5px] text-amber-800 bg-amber-100/90 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5 border border-amber-300">
                      <WifiOff className="w-3 h-3 text-amber-600" />
                      Modo Fuera de Línea (Sin Internet)
                    </span>
                  )}
                </div>
              </div>

              {/* FILA 1: REFERENCIA Y MONTO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Número de Referencia Bancaria *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 3209 (4 dígitos o completa)"
                    value={inputRef}
                    onChange={(e) => setInputRef(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full text-sm font-mono font-black bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                    autoFocus
                  />
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Permite ingresar solo los <strong>últimos 4 dígitos</strong> o la referencia completa
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Monto Exacto en Bolívares (Bs.) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Bs.</span>
                    <input
                      type="text"
                      placeholder="Ej: 1450.00"
                      value={inputMonto}
                      onChange={(e) => setInputMonto(e.target.value)}
                      className="w-full text-sm font-bold bg-white border border-slate-300 rounded-xl p-2.5 pl-9 text-slate-900 outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Monto transferido con decimales</span>
                </div>
              </div>

              {/* FILA 2: BANCO ORIGEN Y FECHA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Banco de Origen (Emisor del Pago) *
                  </label>
                  <select
                    value={bancoOrigen}
                    onChange={(e) => setBancoOrigen(e.target.value)}
                    className="w-full text-xs font-bold bg-white border border-slate-300 rounded-xl p-2.5 text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    {bancosList.length > 0 ? (
                      bancosList.map((b) => (
                        <option key={b.codigo} value={b.codigo}>
                          {b.codigo} - {b.nombre}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="0102">0102 - Banco de Venezuela (BDV)</option>
                        <option value="0134">0134 - Banesco</option>
                        <option value="0105">0105 - Banco Mercantil</option>
                        <option value="0108">0108 - Banco Provincial (BBVA)</option>
                        <option value="0172">0172 - Bancamiga</option>
                        <option value="0114">0114 - Bancaribe</option>
                        <option value="0163">0163 - Banco del Tesoro</option>
                        <option value="0175">0175 - Banco Bicentenario</option>
                        <option value="0191">0191 - BNC</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Fecha del Pago (YYYY-MM-DD) *
                  </label>
                  <input
                    type="date"
                    value={fechaPago}
                    onChange={(e) => setFechaPago(e.target.value)}
                    className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-xl p-2.5 text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* FILA 3: CÉDULA Y TELÉFONO DEL CLIENTE PAGADOR */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Cédula / RIF del Pagador (Cliente)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: V12345678 o J12345678"
                    value={cedulaPagador}
                    onChange={(e) => setCedulaPagador(e.target.value.toUpperCase())}
                    className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-xl p-2.5 text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">Precargado del cliente en caja</span>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Teléfono del Pagador (11 dígitos)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 04121234567"
                    value={telefonoPagador}
                    onChange={(e) => setTelefonoPagador(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-xl p-2.5 text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">Celular desde donde pagó el cliente</span>
                </div>
              </div>

              {/* FILA 4: TELÉFONO DESTINO DE LA EMPRESA (MULTI-NÚMERO) */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Teléfono Destino (Línea de Cobro del Comercio)
                </label>
                {Array.isArray(bdvConfig?.bdvTelefonosDestino) && bdvConfig.bdvTelefonosDestino.length > 1 ? (
                  <div className="space-y-1">
                    <select
                      value={telefonoDestino}
                      onChange={(e) => setTelefonoDestino(e.target.value)}
                      className="w-full text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                    >
                      <option value="TODOS">🔄 Probar automáticamente en todos mis números autorizados</option>
                      {bdvConfig.bdvTelefonosDestino.map((item: any, idx: number) => {
                        const tel = typeof item === 'object' ? item.telefono : item;
                        const alias = typeof item === 'object' && item.alias ? item.alias : `Línea ${idx + 1}`;
                        const isDef = typeof item === 'object' ? item.esDefault : tel === bdvConfig.bdvTelefonoDefault;
                        return (
                          <option key={tel + idx} value={tel}>
                            {isDef ? '⭐ ' : ''}{tel} - {alias} {isDef ? '(Principal)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <span className="text-[10px] text-slate-500 block">
                      Su comercio cuenta con varios números afiliados. Puede elegir la línea específica o probar en todas.
                    </span>
                  </div>
                ) : Array.isArray(bdvConfig?.bdvTelefonosDestino) && bdvConfig.bdvTelefonosDestino.length === 1 ? (
                  <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-600 font-sans">Línea de cobro activa:</span>
                    <strong className="font-mono text-slate-800">
                      {typeof bdvConfig.bdvTelefonosDestino[0] === 'object'
                        ? `${bdvConfig.bdvTelefonosDestino[0].telefono} (${bdvConfig.bdvTelefonosDestino[0].alias || 'Principal'})`
                        : bdvConfig.bdvTelefonosDestino[0]}
                    </strong>
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    ⚠️ No hay teléfonos destino configurados en Configuración de Empresa. Se utilizará el teléfono del cliente o consulta directa.
                  </div>
                )}
              </div>

              {/* BOTONES DE ACCIÓN: VALIDAR EN BANCO O FACTURAR OFFLINE */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleBypassOffline}
                  disabled={!inputRef.trim() || !inputMonto.trim()}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-slate-800 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Permite registrar el pago y continuar facturando inmediatamente aunque no haya internet"
                >
                  <Check className="w-4 h-4 text-slate-600" />
                  <span>Cobrar sin Validar Online (Offline)</span>
                </button>

                <button
                  type="submit"
                  disabled={isValidating || !inputRef.trim() || !inputMonto.trim()}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 disabled:bg-slate-300 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isValidating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Consultando Banco de Venezuela...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Validar en Banco de Venezuela
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* RESULTADO DE LA VALIDACIÓN */}
            {validationResult && (() => {
              const isAlreadyUsedInSale = !!validationResult.alreadyUsedInSale;
              const isVerified = !!validationResult.verified && !isAlreadyUsedInSale;
              const isNetworkErr = !!validationResult.isNetworkError;

              return (
                <div
                  className={`rounded-2xl p-5 border transition-all animate-fade-in ${
                    isAlreadyUsedInSale
                      ? 'bg-amber-50 border-amber-300 text-amber-950 shadow-sm'
                      : isVerified
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-sm'
                      : isNetworkErr
                      ? 'bg-amber-50 border-amber-300 text-amber-950 shadow-sm'
                      : 'bg-red-50 border-red-300 text-red-950 shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {isAlreadyUsedInSale ? (
                      <AlertTriangle className="w-7 h-7 text-amber-600 flex-shrink-0 mt-0.5" />
                    ) : isVerified ? (
                      <CheckCircle2 className="w-7 h-7 text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : isNetworkErr ? (
                      <WifiOff className="w-7 h-7 text-amber-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-7 h-7 text-red-600 flex-shrink-0 mt-0.5" />
                    )}

                    <div className="space-y-2 flex-1">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-black uppercase tracking-tight">
                            {isAlreadyUsedInSale
                              ? `⚠️ PAGO YA VALIDADO Y UTILIZADO EN FACTURA #${validationResult.usedInFactura || ''}`
                              : isVerified
                              ? '¡PAGO 100% VERIFICADO Y ACREDITADO EN BDV!'
                              : isNetworkErr
                              ? 'SIN CONEXIÓN O RESPUESTA DE BANCO DE VENEZUELA'
                              : 'PAGO NO DETECTADO EN BANCO DE VENEZUELA'}
                          </h4>
                          {isAlreadyUsedInSale ? (
                            <span className="bg-amber-200 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Duplicado / Ya Facturado
                            </span>
                          ) : isVerified && validationResult.alreadyReconciled ? (
                            <span className="bg-emerald-200 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Acreditado en Cuenta BDV
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-700 mt-1 font-medium">
                          {cleanBdvMessage(validationResult.message)}
                        </p>
                      </div>

                      {/* DETALLE DEL PAGO (SI FUE VERIFICADO O YA CONCILIADO) */}
                      {(isVerified || isAlreadyUsedInSale) && (
                        <div className={`rounded-xl p-3 text-xs space-y-2 border font-mono shadow-2xs ${
                          isAlreadyUsedInSale ? 'bg-white/95 border-amber-200' : 'bg-white/90 border-emerald-200/80'
                        }`}>
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-sans">Referencia Acreditada:</span>
                            <span className="font-bold text-slate-900">{validationResult.payloadSent?.referencia || inputRef}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-sans">Monto Verificado:</span>
                            <span className={`font-bold text-sm ${isAlreadyUsedInSale ? 'text-amber-800' : 'text-emerald-700'}`}>
                              Bs. {parseFloat(validationResult.data?.amount || inputMonto.replace(',', '.')).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {validationResult.telefonoDestinoUsado && (
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-sans">Línea que recibió el pago:</span>
                              <span className="font-bold text-slate-800">{validationResult.telefonoDestinoUsado}</span>
                            </div>
                          )}
                          {validationResult.latencyMs !== undefined && (
                            <div className="flex justify-between text-[11px] text-slate-400">
                              <span className="font-sans">Latencia de respuesta:</span>
                              <span>{validationResult.latencyMs || 0} ms</span>
                            </div>
                          )}

                          {isAlreadyUsedInSale && (
                            <div className="p-2.5 bg-amber-100 rounded-lg text-amber-950 font-sans text-xs border border-amber-300 font-medium">
                              <strong className="block font-bold">⚠️ Comprobante Ya Facturado:</strong>
                              Este pago móvil ya fue conciliado y aplicado en la <strong>Factura #{validationResult.usedInFactura}</strong>. Para evitar pagos duplicados, no se permite volver a asociar a otra venta.
                            </div>
                          )}
                        </div>
                      )}

                      {/* BOTONES DE ACCIÓN SEGÚN EL CASO */}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {isAlreadyUsedInSale ? (
                          <>
                            <button
                              type="button"
                              disabled
                              className="px-5 py-2.5 bg-amber-200 text-amber-800 text-xs font-black rounded-xl cursor-not-allowed opacity-80 flex items-center gap-1.5"
                            >
                              <AlertTriangle className="w-4 h-4 text-amber-700" />
                              Pago No Reutilizable (Ya Facturado)
                            </button>
                            <button
                              type="button"
                              onClick={() => setValidationResult(null)}
                              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer"
                            >
                              Corregir Referencia
                            </button>
                            <button
                              type="button"
                              onClick={handleBypassOffline}
                              className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                              title="Permite facturar de emergencia"
                            >
                              Cobrar sin Validar (Offline)
                            </button>
                          </>
                        ) : isVerified ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (onReferenceVerified) {
                                  onReferenceVerified(inputRef.trim(), parseFloat(inputMonto.replace(',', '.')));
                                }
                                onClose();
                              }}
                              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                              Aplicar al Cobro y Continuar Facturación
                            </button>
                            <button
                              type="button"
                              onClick={() => setValidationResult(null)}
                              className="px-3 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer"
                            >
                              Corregir Datos
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={handleBypassOffline}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                              Facturar de Todas Formas (Omitir Validación)
                            </button>
                            <button
                              type="button"
                              onClick={() => setValidationResult(null)}
                              className="px-3 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer"
                            >
                              Corregir Datos y Reintentar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}


        {/* TAB 2: CONCILIACIÓN DE TURNO & IMPORTAR EXTRACTO */}
        {activeTab === 'conciliacion' && (
          <div className="p-6 space-y-5 overflow-y-auto flex-1">

            {/* KPIS SUMMARY */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Pago Móvil</span>
                <span className="text-lg font-black text-slate-800">{reconcileData?.totalPagos || 0}</span>
                <span className="text-[11px] font-bold text-slate-500 block">Bs. {(reconcileData?.totalVES || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Conciliados (En Banco)</span>
                <span className="text-lg font-black text-emerald-700">{reconcileData?.conciliadasQty || 0}</span>
                <span className="text-[11px] font-bold text-emerald-600 block">Bs. {(reconcileData?.conciliadasMontoVES || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">Pendientes / En Duda</span>
                <span className="text-lg font-black text-red-700">{reconcileData?.pendientesQty || 0}</span>
                <span className="text-[11px] font-bold text-red-600 block">Bs. {(reconcileData?.pendientesMontoVES || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* IMPORTADOR DE TEXTO / EXTRACTO BDV */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase">Cargar Movimientos de BDV en Línea</span>
                </div>
                <span className="text-[10px] text-slate-500">Copiar y pegar tabla o CSV de BDV</span>
              </div>

              <textarea
                rows={3}
                placeholder="Pegue aquí el texto copiado de la tabla de 'Movimientos de Cuenta' de BDV en Línea o archivo CSV exportado..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-xl p-2.5 text-slate-800 outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              />

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-500">
                  El sistema detecta automáticamente fechas, referencias y montos de Pago Móvil.
                </p>
                <button
                  type="button"
                  disabled={isImporting || !pastedText.trim()}
                  onClick={handleImportBdvText}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                >
                  {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Importar y Conciliar
                </button>
              </div>

              {importSummary && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold p-2.5 rounded-xl">
                  ✓ {importSummary.count} movimientos analizados ({importSummary.inserted} nuevos registrados en banco).
                </div>
              )}
            </div>

            {/* LISTADO DE PAGOS DEL TURNO Y ESTADO */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase">Pagos Móviles del Turno</span>
                <button
                  type="button"
                  onClick={fetchReconciliationSummary}
                  className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReconcile ? 'animate-spin' : ''}`} />
                  Actualizar
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="p-2.5">Factura / Ticket</th>
                      <th className="p-2.5">Referencia</th>
                      <th className="p-2.5">Monto Bs.</th>
                      <th className="p-2.5">Banco</th>
                      <th className="p-2.5 text-center">Estado BDV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reconcileData?.items && reconcileData.items.length > 0 ? (
                      reconcileData.items.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="p-2.5 font-mono font-bold text-slate-800">{item.factura_nro}</td>
                          <td className="p-2.5 font-mono font-bold text-slate-700">{item.numero_referencia}</td>
                          <td className="p-2.5 font-bold text-slate-800">
                            Bs. {parseFloat(item.monto_entregado_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-slate-500">{item.banco_emisor || 'BDV / Otros'}</td>
                          <td className="p-2.5 text-center">
                            {item.status === 'CONCILIADA' ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                                ✓ CONCILIADO
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                                ⚠ NO VERIFICADO
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400 text-xs">
                          No hay pagos móviles registrados en este turno.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: HISTORIAL DE MOVIMIENTOS BDV */}
        {activeTab === 'historial' && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2">
                  Movimientos Bancarios Registrados en BDV
                  <span className="bg-sky-100 text-sky-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {bdvMovements.length}
                  </span>
                </span>
                <p className="text-[10.5px] text-slate-500">
                  Consulte pagos móviles recibidos en cuenta y aplíquelos a la venta con 1 solo clic
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchBdvHistory()}
                className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                Recargar
              </button>
            </div>

            {/* BARRA DE FILTROS POR FECHA Y BÚSQUEDA */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Filtrar:</span>
                
                <button
                  type="button"
                  onClick={() => {
                    setHistoryDateFilter('hoy');
                    fetchBdvHistory('hoy', undefined, historySearchTerm);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    historyDateFilter === 'hoy'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Hoy
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setHistoryDateFilter('ayer');
                    fetchBdvHistory('ayer', undefined, historySearchTerm);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    historyDateFilter === 'ayer'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Ayer
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setHistoryDateFilter('todos');
                    fetchBdvHistory('todos', undefined, historySearchTerm);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    historyDateFilter === 'todos'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Todos
                </button>

                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[10px] text-slate-500 font-medium">Fecha:</span>
                  <input
                    type="date"
                    value={customHistoryDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomHistoryDate(val);
                      setHistoryDateFilter('custom');
                      fetchBdvHistory('custom', val, historySearchTerm);
                    }}
                    className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* BUSCADOR RÁPIDO */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por últimos 4 dígitos de referencia, monto, teléfono o emisor..."
                  value={historySearchTerm}
                  onChange={(e) => {
                    const val = e.target.value;
                    setHistorySearchTerm(val);
                    fetchBdvHistory(historyDateFilter, customHistoryDate, val);
                  }}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-slate-700 outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {/* TABLA DE MOVIMIENTOS */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[520px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-56">Fecha y Hora</th>
                    <th className="p-3 w-36">Referencia</th>
                    <th className="p-3 w-40">Monto Bs.</th>
                    <th className="p-3">Concepto / Emisor</th>
                    <th className="p-3 w-44 text-center">Acción / Uso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bdvMovements.length > 0 ? (
                    bdvMovements.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 text-slate-600 font-mono text-xs whitespace-nowrap">
                          {formatBdvFecha(m.fecha, m.created_at)}
                        </td>
                        <td className="p-3 font-mono font-black text-slate-900 text-sm">{m.referencia}</td>
                        <td className="p-3 font-black text-emerald-700 whitespace-nowrap text-sm">
                          Bs. {parseFloat(m.monto_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-slate-700 max-w-md truncate" title={m.descripcion}>
                          <div className="font-medium text-slate-800">{m.descripcion}</div>
                          {m.telefono_origen && (
                            <span className="text-[11px] text-slate-500 block font-mono mt-0.5">
                              Telf: {m.telefono_origen}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {m.conciliado ? (
                            <span className="bg-emerald-100 text-emerald-800 font-bold text-[11px] px-2.5 py-1 rounded-full inline-block">
                              ✓ Factura: {m.factura_nro || 'Cobrado'}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (onReferenceVerified) {
                                  onReferenceVerified(m.referencia, parseFloat(m.monto_ves));
                                }
                                onClose();
                              }}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                              title="Cargar esta referencia y monto a la venta actual"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Aplicar a Venta
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 text-xs">
                        No se encontraron movimientos registrados para este filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: GUÍA Y FUNCIONAMIENTO */}
        {activeTab === 'guia' && (
          <div className="p-6 space-y-5 overflow-y-auto flex-1 text-slate-700 text-xs leading-relaxed">
            
            {/* INTRO HEADER */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-2">
              <h4 className="font-black text-indigo-900 text-sm flex items-center gap-2">
                <Landmark className="w-4 h-4 text-indigo-700" />
                Guía Integral de Conciliación con Banco de Venezuela (BDV)
              </h4>
              <p className="text-slate-600 text-[11.5px]">
                Proteja su negocio contra comprobantes adulterados o capturas de pago falsas. WinterPos le ofrece dos modalidades operativas: <b>Enlace de SMS en tiempo real</b> y <b>Carga de extractos de cuenta</b> al cierre.
              </p>
            </div>

            {/* SECCIÓN 1: REENVÍO AUTOMÁTICO DE SMS */}
            <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-white shadow-xs">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-black flex items-center justify-center text-xs">1</span>
                <div>
                  <h5 className="font-black text-slate-900 text-xs">Reenvío Automático de SMS de BDV (Tiempo Real en Caja)</h5>
                  <p className="text-[10.5px] text-slate-500">Configuración única en el teléfono Android que recibe los SMS del BDV</p>
                </div>
              </div>

              {/* SELECTOR DE MODO: LOCAL vs REMOTO */}
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setTunnelMode('local')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    tunnelMode === 'local'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Modo 1: Wi-Fi Local (Teléfono en la Tienda)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTunnelMode('remote')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    tunnelMode === 'remote'
                      ? 'bg-white text-blue-900 shadow-xs border border-blue-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 text-blue-600" />
                  <span>Modo 2: Por Internet (Dueño fuera de la Tienda / Otro Estado)</span>
                </button>
              </div>

              {/* PANEL MODO LOCAL */}
              {tunnelMode === 'local' && (
                <div className="space-y-2 animate-fadeIn">
                  <div className="bg-slate-900 text-slate-100 p-3 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block">
                        URL Webhook Local (Mismo Wi-Fi):
                      </span>
                      <span className="text-[9.5px] text-emerald-400 font-medium">✓ Funciona sin internet</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 font-mono text-[11px] text-emerald-400 bg-slate-800/80 px-2.5 py-1.5 rounded-lg select-all overflow-x-auto">
                        {webhookUrl || `http://${window.location.hostname}:5000/api/conciliacion/sms-webhook`}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyWebhookUrl}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer flex-shrink-0"
                      >
                        {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedUrl ? '¡Copiado!' : 'Copiar URL'}
                      </button>
                    </div>
                  </div>
                  <p className="text-[10.5px] text-slate-500">
                    Use esta opción si el teléfono del negocio se encuentra conectado a la misma red Wi-Fi de la computadora de caja.
                  </p>
                </div>
              )}

              {/* PANEL MODO REMOTO (DUEÑO EN OTRO ESTADO) */}
              {tunnelMode === 'remote' && (
                <div className="space-y-3 bg-blue-50/60 border border-blue-200 p-3.5 rounded-2xl animate-fadeIn font-sans">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-blue-900 font-black text-xs">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>Conexión Remota por Internet (Sin abrir puertos ni pagar servidores)</span>
                    </div>

                    <button
                      type="button"
                      onClick={fetchTunnelStatus}
                      className="text-[10px] text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-blue-200"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>Estado</span>
                    </button>
                  </div>

                  {/* CASO A: TÚNEL CORRIENDO EN SEGUNDO PLANO (AUTOMÁTICO) */}
                  {tunnelStatus?.status === 'running' ? (
                    <div className="bg-emerald-950 text-emerald-100 p-4 rounded-xl border border-emerald-700/80 space-y-2.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                          <span className="text-xs font-black text-emerald-300 uppercase tracking-wide">
                            🟢 Túnel Automático Activo en Segundo Plano
                          </span>
                        </div>
                        <span className="text-[10px] bg-emerald-800 text-emerald-100 font-bold px-2 py-0.5 rounded-full">
                          Sin intervención del cajero
                        </span>
                      </div>

                      <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                        El servidor local mantiene el enlace seguro de Cloudflare activo y oculto en segundo plano. <strong>No hay ventanas de CMD en pantalla ni se requiere que el operador haga nada.</strong>
                      </p>

                      <div className="bg-black/50 p-2.5 rounded-lg space-y-1 border border-emerald-900/60">
                        <span className="text-[9.5px] uppercase font-mono font-bold text-emerald-300 block">
                          URL Webhook lista para el teléfono del dueño:
                        </span>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 font-mono text-[11px] text-emerald-300 select-all overflow-x-auto break-all">
                            {tunnelStatus.webhookUrl || fullRemoteWebhookUrl}
                          </code>
                          <button
                            type="button"
                            onClick={handleCopyRemoteUrl}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer flex-shrink-0"
                          >
                            {copiedRemoteUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-white" />}
                            <span>{copiedRemoteUrl ? '¡Copiado!' : 'Copiar URL'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : tunnelStatus?.status === 'starting' ? (
                    <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3.5 rounded-xl space-y-1.5 animate-pulse">
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-700" />
                        <span>Iniciando túnel seguro de Cloudflare en segundo plano...</span>
                      </div>
                      <p className="text-[10.5px] text-amber-800">
                        Obteniendo enlace seguro de internet de forma silenciosa sin abrir ventanas CMD. Por favor espere unos segundos...
                      </p>
                    </div>
                  ) : (
                    /* CASO B: TÚNEL DETENIDO */
                    <div className="bg-slate-50 border border-slate-300 p-3.5 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          El túnel automático está en reposo
                        </span>
                        <button
                          type="button"
                          disabled={isStartingTunnelInModal}
                          onClick={handleStartTunnelFromModal}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{isStartingTunnelInModal ? 'Iniciando...' : 'Iniciar Túnel en Segundo Plano'}</span>
                        </button>
                      </div>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        💡 <strong>Consejo del Administrador:</strong> Puede dejar este túnel siempre activo automáticamente en <strong>F10 Configuración &gt; Integración Pago Móvil</strong> para que nunca tenga que iniciarlo manualmente.
                      </p>
                    </div>
                  )}

                  {/* OPCIONAL: FALLBACK MANUAL CON COMANDO */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowManualCmd(!showManualCmd)}
                      className="text-[10px] text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1"
                    >
                      {showManualCmd ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showManualCmd ? 'Ocultar comando manual CMD' : 'Ver comando manual alternativo (CMD / PowerShell)'}</span>
                    </button>

                    {showManualCmd && (
                      <div className="mt-2 space-y-2 animate-fadeIn">
                        <div className="bg-slate-900 text-slate-100 p-3 rounded-xl space-y-1.5">
                          <span className="text-[10px] uppercase font-mono font-bold text-slate-400 flex items-center gap-1">
                            <Terminal className="w-3 h-3 text-blue-400" />
                            Comando manual de consola:
                          </span>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 font-mono text-[11px] text-blue-300 bg-slate-800/80 px-2.5 py-1.5 rounded-lg select-all overflow-x-auto">
                              {cloudflareCmd}
                            </code>
                            <button
                              type="button"
                              onClick={handleCopyTunnelCmd}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer flex-shrink-0"
                            >
                              {copiedTunnelCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedTunnelCmd ? '¡Copiado!' : 'Copiar'}</span>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600 block">
                            Pegar enlace manual de Cloudflare si lo ejecutó manualmente:
                          </label>
                          <input
                            type="text"
                            value={customTunnelUrl}
                            onChange={(e) => handleCustomTunnelChange(e.target.value)}
                            placeholder="Ejemplo: https://mi-pos-caja.trycloudflare.com"
                            className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* APPS RECOMENDADAS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-sky-600" />
                    <span className="font-bold text-slate-800 text-[11.5px]">Opción A: App "SMS Forwarder" (Recomendada)</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Búsquela en <b>Google Play Store</b> como <i>"SMS Forwarder"</i> (de LanRen o BogateSoft).
                  </p>
                  <ul className="list-disc pl-4 text-[10.5px] text-slate-600 space-y-0.5">
                    <li>Disparador: <b>Recepción de SMS</b>.</li>
                    <li>Filtro remitente: <b>2661</b> o <b>2662</b> (Banco de Venezuela).</li>
                    <li>Destino: <b>Webhook / HTTP POST</b>.</li>
                    <li>Pegue la URL copiada arriba. Enviar formato: <b>JSON</b>.</li>
                  </ul>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-purple-600" />
                    <span className="font-bold text-slate-800 text-[11.5px]">Opción B: App "MacroDroid"</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Potente app gratuita de automatización para cualquier teléfono Android:
                  </p>
                  <ul className="list-disc pl-4 text-[10.5px] text-slate-600 space-y-0.5">
                    <li>Disparador (Trigger): <b>SMS Recibido &gt; De 2661 / 2662</b>.</li>
                    <li>Acción (Action): <b>Conectividad &gt; Solicitud HTTP POST</b>.</li>
                    <li>Contenido del cuerpo: <code>{`{"smsText": "[sms_body]"}`}</code>.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* SECCIÓN 2: PREGUNTA CLAVE SOBRE EL INTERNET Y MODO SIN CONEXIÓN */}
            <div className="border-2 border-amber-200 bg-amber-50/50 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                <Wifi className="w-4 h-4 text-amber-700" />
                <span>¿Es necesario tener Internet? ¿Qué ocurre si se corta la conexión?</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-700">
                <div className="bg-white/80 border border-amber-200 p-3 rounded-xl space-y-1">
                  <div className="flex items-center gap-1 text-emerald-800 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>¡NO se necesita Internet en la máquina para el enlace!</span>
                  </div>
                  <p className="text-slate-600 leading-normal">
                    La computadora de caja y el celular se comunican a través de la <b>Red Wi-Fi Local (LAN)</b>. Aunque CANTV o la fibra del local se caigan por completo, mientras el router del local siga encendido, el teléfono le envía el mensaje al POS al instante sin gastar megas ni requerir internet exterior.
                  </p>
                </div>

                <div className="bg-white/80 border border-amber-200 p-3 rounded-xl space-y-1">
                  <div className="flex items-center gap-1 text-indigo-800 font-bold">
                    <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                    <span>El SMS del Banco llega por red telefónica celular</span>
                  </div>
                  <p className="text-slate-600 leading-normal">
                    Los SMS del 2661 / 2662 entran por la red celular de la línea (Digitel, Movistar, Movilnet), no por internet. Su negocio seguirá recibiendo las confirmaciones aunque no haya internet fijo en el local.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-amber-300/80 rounded-xl p-3 text-[11px] text-slate-600 space-y-1">
                <span className="font-bold text-amber-900 block flex items-center gap-1">
                  <WifiOff className="w-3.5 h-3.5 text-amber-700" />
                  ¿Qué hacer si no hay Wi-Fi o se fue la luz del router?
                </span>
                <ul className="list-disc pl-4 space-y-1 text-[10.5px]">
                  <li><b>Opción 1 (Zona Wi-Fi Móvil):</b> Active en el teléfono "Punto de Acceso Móvil" (Hotspot) y conecte la computadora a esa red.</li>
                  <li><b>Opción 2 (Validador Rápido en Caja):</b> El cajero mira el teléfono del negocio y coloca los 4 dígitos y el monto en la pestaña <b>Validador Rápido</b>.</li>
                  <li><b>Opción 3 (Al finalizar la jornada):</b> El encargado ingresa a BDV en Línea, descarga los movimientos del día y los pega en la pestaña <b>Conciliación de Turno</b> para cuadrar el 100% de los pagos móviles registrados.</li>
                </ul>
              </div>
            </div>

            {/* SECCIÓN 3: EXTRACTO DE BANCO EN LÍNEA */}
            <div className="border border-slate-200 rounded-2xl p-4 space-y-2 bg-white">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-black flex items-center justify-center text-xs">2</span>
                <div>
                  <h5 className="font-black text-slate-900 text-xs">Carga de Extractos de BDV en Línea (Cuadre de Cierre)</h5>
                  <p className="text-[10.5px] text-slate-500">Ideal para auditar y verificar el turno antes de hacer el cierre de caja</p>
                </div>
              </div>
              <p className="text-slate-600 text-[11px] pl-8">
                Ingrese a <b>BDV en Línea</b> en cualquier navegador, vaya a <b>Consultas &gt; Movimientos de Cuenta</b>, seleccione el día de hoy, copie toda la tabla de movimientos (o descargue el archivo CSV) y péguelo en la pestaña <b>Conciliación de Turno</b>. El sistema reconocerá automáticamente los números de referencia, montos y horas, marcando en verde los pagos cobrados legítimamente.
              </p>
            </div>

          </div>
        )}

        {/* FOOTER */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
