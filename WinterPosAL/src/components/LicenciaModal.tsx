import { useState } from 'react';
import { ShieldAlert, Copy, Check, MessageCircle, FileUp, Key, Lock, CheckCircle2, RefreshCw } from 'lucide-react';
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
}

export default function LicenciaModal({ licenseStatus, onLicenseActivated, getApiUrl }: LicenciaModalProps) {
  const { showAlert } = useDialog();
  const [copied, setCopied] = useState(false);
  const [licenseText, setLicenseText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const hwid = licenseStatus?.hwid || 'CULTIVATING_HWID...';

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
      `👋 *Solicitud de Licencia / Activación WinterPos*\n\n` +
      `🏢 *Cliente:* ${licenseStatus?.payload?.cliente || 'Nuevo Comercio'}\n` +
      `💻 *Código HWID de mi equipo:* \`${hwid}\`\n\n` +
      `Por favor requiero activar / renovar la licencia de uso.`
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
        showAlert('¡Excelente! Su licencia ha sido verificada y activada con éxito.', 'Sistema Activado', 'success');
        onLicenseActivated();
      } else {
        setErrorMsg(data.message || data.status?.message || 'Error: La licencia cargada no es válida para este equipo.');
      }
    } catch (err) {
      console.error('Error al activar licencia:', err);
      setErrorMsg('No se pudo conectar con el servidor central para activar la licencia.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-9999 flex items-center justify-center p-4 select-none font-sans">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-fade-in flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white p-6 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Lock className="w-40 h-40" />
          </div>
          
          <div className="w-14 h-14 bg-rose-500/20 border border-rose-400/30 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <ShieldAlert className="w-8 h-8 text-rose-400 animate-pulse" />
          </div>

          <h2 className="text-xl font-black uppercase tracking-wider text-white">
            Activación de Licencia Requerida
          </h2>
          <p className="text-xs text-rose-200/90 mt-1 max-w-md mx-auto font-mono">
            {licenseStatus?.message || 'Su sistema WinterPos requiere una clave de licencia válida vinculada a este equipo para operar.'}
          </p>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5 text-slate-800 text-xs">
          
          {/* Step 1: Hardware ID */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-extrabold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                <Key className="w-4 h-4 text-winter-blueBtn" />
                1. Código de Hardware de este Equipo (HWID)
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
                className={`px-3 py-2 rounded-xl font-bold transition-all shadow-xs flex items-center gap-1.5 whitespace-nowrap ${
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

            <button
              onClick={handleWhatsAppSupport}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-xs font-sans cursor-pointer mt-1"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Solicitar Licencia por WhatsApp Soporte</span>
            </button>
          </div>

          {/* Step 2: Paste or Upload License */}
          <div className="space-y-2">
            <label className="text-[11px] font-extrabold uppercase text-slate-600 tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileUp className="w-4 h-4 text-winter-blueBtn" />
                2. Cargar o Pegar Archivo de Licencia (license.lic)
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
              rows={4}
              value={licenseText}
              onChange={(e) => setLicenseText(e.target.value)}
              placeholder="Pegue aquí el contenido de su archivo de licencia license.lic o seleccione el archivo arriba..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-[11px] font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-winter-blueBtn focus:bg-white shadow-inner resize-none"
            />
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs font-sans font-medium flex items-center gap-2 animate-shake">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Activation Button */}
          <button
            onClick={handleActivate}
            disabled={loading}
            className="w-full bg-gradient-to-r from-winter-header via-slate-900 to-winter-header hover:from-slate-900 hover:to-slate-950 text-white font-extrabold py-3.5 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 text-sm uppercase tracking-wider cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Verificando Firma RSA...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Activar Sistema WinterPos</span>
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-3 text-center text-[10px] text-slate-500 font-sans flex justify-between items-center">
          <span>WinterPos Cloud POS & Management System</span>
          <span className="font-mono">Hardware Security Module v2.0</span>
        </div>
      </div>
    </div>
  );
}
