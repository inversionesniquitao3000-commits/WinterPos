import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Copy, Check, MessageCircle, FileUp, Key, Lock, CheckCircle2, RefreshCw, X, Building2, Calendar, Monitor } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

interface LicenciaModalProps {
  licenseStatus: {
    status: string;
    isValid: boolean;
    hwid: string;
    payload?: any;
    daysRemaining?: number | null;
    message?: string;
  } | null;
  onLicenseActivated: () => void;
  getApiUrl: (path: string) => string;
  onClose?: () => void;
}

export default function LicenciaModal({ licenseStatus, onLicenseActivated, getApiUrl, onClose }: LicenciaModalProps) {
  const { showAlert } = useDialog();
  const [copied, setCopied] = useState(false);
  const [licenseText, setLicenseText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showUpdater, setShowUpdater] = useState(false);

  const isValid = licenseStatus?.isValid === true;
  const hwid = licenseStatus?.hwid || 'CULTIVATING_HWID...';
  const payload = licenseStatus?.payload;

  const handleCopyHWID = () => {
    try {
      navigator.clipboard.writeText(hwid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('Error copiando HWID:', err);
    }
  };

  const handleWhatsAppSupport = () => {
    const text = encodeURIComponent(
      `👋 *Consulta / Renovación de Licencia WinterPos*\n\n` +
      `🏢 *Cliente:* ${payload?.cliente || 'Nuevo Comercio'}\n` +
      `💻 *Código HWID de mi equipo:* \`${hwid}\`\n\n` +
      `Por favor requiero asistencia / renovar la licencia.`
    );
    window.open(`https://wa.me/584242042877?text=${text}`, '_blank');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setLicenseText(content);
        setShowUpdater(true);
      }
    };
    reader.readAsText(file);
  };

  const handleActivate = async () => {
    if (!licenseText.trim()) {
      setErrorMsg('Por favor pegue el código de licencia o seleccione el archivo license.lic');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(getApiUrl('/license/activate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseContent: licenseText.trim() })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showAlert('¡Excelente! La licencia ha sido verificada y guardada con éxito.', 'Licencia Actualizada', 'success');
        setShowUpdater(false);
        setLicenseText('');
        onLicenseActivated();
        if (onClose && isValid) onClose();
      } else {
        setErrorMsg(data.message || data.status?.message || 'Error: La licencia cargada no es válida para este equipo.');
      }
    } catch (err) {
      console.error('Error al activar licencia:', err);
      setErrorMsg('No se pudo conectar con el servidor central para verificar la licencia.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-9999 flex items-center justify-center p-4 select-none font-sans">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-fade-in flex flex-col relative">
        
        {/* Header */}
        <div className={`p-6 text-center relative overflow-hidden text-white ${
          isValid 
            ? 'bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900' 
            : 'bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900'
        }`}>
          {/* Close button if valid or onClose provided */}
          {(onClose || isValid) && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all cursor-pointer z-10"
              title="Cerrar ventana [ESC]"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Lock className="w-40 h-40" />
          </div>
          
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner ${
            isValid 
              ? 'bg-emerald-500/20 border border-emerald-400/30' 
              : 'bg-rose-500/20 border border-rose-400/30'
          }`}>
            {isValid ? (
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-8 h-8 text-rose-400 animate-pulse" />
            )}
          </div>

          <h2 className="text-xl font-black uppercase tracking-wider text-white flex items-center justify-center gap-2">
            {isValid ? 'Licencia de Uso Activa' : 'Activación de Licencia Requerida'}
          </h2>

          <p className="text-xs mt-1 max-w-md mx-auto font-mono text-slate-200">
            {licenseStatus?.message || 'Información de registro criptográfico y Hardware de WinterPos.'}
          </p>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4 text-slate-800 text-xs">
          
          {/* Active License Details Card if valid */}
          {isValid && payload && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-2 shadow-2xs">
              <div className="flex justify-between items-center text-emerald-900 border-b border-emerald-200/60 pb-2">
                <span className="font-extrabold uppercase text-[11px] flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-700" />
                  {payload.cliente}
                </span>
                <span className="text-[10px] bg-emerald-200 text-emerald-900 font-mono font-extrabold px-2 py-0.5 rounded-full">
                  RIF: {payload.rif || 'J-00000000'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Vigencia: <strong className="text-slate-900 font-mono">{payload.fechaExpiracion === 'VITALICIA' ? 'VITALICIA' : payload.fechaExpiracion}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Monitor className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Cajas Autorizadas: <strong className="text-slate-900 font-mono">{payload.terminales}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* Hardware ID Info */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-extrabold uppercase text-slate-600 tracking-wider flex items-center gap-1.5">
                <Key className="w-4 h-4 text-winter-blueBtn" />
                Código de Hardware de este Equipo (HWID)
              </span>
              <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-mono font-bold">
                Servidor Central
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={hwid}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-black text-slate-900 shadow-2xs text-center tracking-widest selection:bg-rose-100"
              />
              <button
                onClick={handleCopyHWID}
                className={`px-3 py-2 rounded-xl font-bold transition-all shadow-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
                title="Copiar HWID al portapapeles"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleWhatsAppSupport}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 text-xs font-sans cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Contactar Soporte por WhatsApp</span>
              </button>

              {isValid && (
                <button
                  onClick={() => setShowUpdater(!showUpdater)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-3 py-2 rounded-xl transition-all text-xs font-sans cursor-pointer whitespace-nowrap"
                >
                  {showUpdater ? 'Ocultar Carga' : 'Renovar Licencia'}
                </button>
              )}
            </div>
          </div>

          {/* License Upload / Paste Form */}
          {(!isValid || showUpdater) && (
            <div className="space-y-2 animate-fade-in">
              <label className="text-[11px] font-extrabold uppercase text-slate-600 tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileUp className="w-4 h-4 text-winter-blueBtn" />
                  Cargar o Pegar Archivo de Licencia (license.lic)
                </span>
                <label className="text-[11px] text-winter-blueBtn font-bold hover:underline cursor-pointer flex items-center gap-1">
                  <FileUp className="w-3.5 h-3.5" />
                  Examinar Archivo
                  <input
                    type="file"
                    accept=".lic,.json,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </label>

              <textarea
                rows={3}
                value={licenseText}
                onChange={(e) => setLicenseText(e.target.value)}
                placeholder="Pegue aquí el código de su archivo license.lic o seleccione el archivo arriba..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-[11px] font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-winter-blueBtn focus:bg-white shadow-inner resize-none"
              />

              {errorMsg && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-2.5 rounded-xl text-xs font-sans font-medium flex items-center gap-2 animate-shake">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                onClick={handleActivate}
                disabled={loading}
                className="w-full bg-gradient-to-r from-winter-header via-slate-900 to-winter-header hover:from-slate-900 hover:to-slate-950 text-white font-extrabold py-3 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verificando Firma RSA...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{isValid ? 'Guardar y Actualizar Licencia' : 'Activar Sistema WinterPos'}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-2.5 text-center text-[10px] text-slate-500 font-sans flex justify-between items-center">
          <span>WinterPos Cloud POS & Management System</span>
          {onClose && isValid ? (
            <button onClick={onClose} className="text-winter-blueBtn font-bold hover:underline cursor-pointer">
              ✕ Cerrar [ESC]
            </button>
          ) : (
            <span className="font-mono">F9: Información de Licencia</span>
          )}
        </div>
      </div>
    </div>
  );
}
