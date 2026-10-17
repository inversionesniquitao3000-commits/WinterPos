import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, X, KeyRound, Fingerprint } from 'lucide-react';
import { getApiBaseUrl } from '../utils';
import { checkBiometricReaderStatus, captureBiometricFingerprint } from '../biometricHelper';

interface MasterPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const MasterPassModal: React.FC<MasterPassModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [bioOnline, setBioOnline] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [bioFeedback, setBioFeedback] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPass('');
      setErrorMsg('');
      setBioFeedback('');
      // Check if biometric reader is active on this terminal
      try {
        const savedConfig = localStorage.getItem('pos_biometric_config');
        const bioCfg = savedConfig ? JSON.parse(savedConfig) : undefined;
        checkBiometricReaderStatus(bioCfg).then(res => {
          setBioOnline(res.online);
        }).catch(() => setBioOnline(false));
      } catch (_) {
        setBioOnline(false);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass.trim()) {
      setErrorMsg('Por favor ingrese la clave Master Pass.');
      return;
    }
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`${getApiBaseUrl()}/config/verify-master-pass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPass: pass })
      });
      const data = await res.json().catch(() => ({ success: false, message: 'Error del servidor.' }));
      if (res.ok && data.success) {
        setPass('');
        onSuccess();
      } else {
        setErrorMsg(data.message || data.error || 'Clave Master Pass incorrecta.');
      }
    } catch (err: any) {
      setErrorMsg('Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricAuth = async () => {
    setBioLoading(true);
    setBioFeedback('☝️ Coloque su huella de Administrador en el sensor...');
    setErrorMsg('');

    try {
      const savedConfig = localStorage.getItem('pos_biometric_config');
      const bioCfg = savedConfig ? JSON.parse(savedConfig) : undefined;
      const scanRes = await captureBiometricFingerprint(bioCfg, 6500);

      if (!scanRes.success || !scanRes.template) {
        setBioFeedback('');
        setErrorMsg(scanRes.error || 'No se detectó huella en el sensor.');
        return;
      }

      setBioFeedback('🔍 Validando privilegios de Administrador...');
      const res = await fetch(`${getApiBaseUrl()}/config/verify-master-biometric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: scanRes.template })
      });

      const data = await res.json().catch(() => ({ success: false, message: 'Error del servidor.' }));
      if (res.ok && data.success) {
        setBioFeedback('✅ Autorización concedida');
        onSuccess();
      } else {
        setBioFeedback('');
        setErrorMsg(data.message || 'Huella no autorizada para funciones de Administrador.');
      }
    } catch (err: any) {
      setBioFeedback('');
      setErrorMsg('Error de comunicación con el lector o servidor.');
    } finally {
      setBioLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 transition-all animate-fadeIn">
      <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-100 transform transition-all">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 px-6 py-4 border-b border-emerald-500/30 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wide text-emerald-300 font-sans">
                Autenticación Master Pass
              </h3>
              <p className="text-[11px] text-slate-400 font-sans">Acceso restringido para Administradores</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-center py-2 space-y-1">
            <div className="w-12 h-12 bg-emerald-950/80 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400 mb-2">
              <KeyRound className="w-6 h-6 animate-pulse" />
            </div>
            <h4 className="text-sm font-bold text-slate-200 font-sans">Ingrese la Clave Master Pass</h4>
            <p className="text-xs text-slate-400 font-sans max-w-xs mx-auto">
              Para ingresar al Módulo de Inversiones y Utilidades debe autenticarse con la clave maestra previamente configurada.
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-950/60 border border-red-500/50 text-red-300 text-xs px-3.5 py-2.5 rounded-lg font-sans flex items-center gap-2 animate-shake">
              <span className="font-bold">⚠️ Error:</span> {errorMsg}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-sans flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              Clave de Acceso Master Pass:
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Ingrese clave..."
                autoComplete="new-password"
                autoFocus
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-3 text-white text-base tracking-widest outline-none font-mono transition-all pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
              >
                {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wide font-sans transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-1/2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wide font-sans transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <span>Verificando...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Ingresar</span>
                </>
              )}
            </button>
          </div>

          {/* Alternativa de Autorización con Huella Dactilar */}
          {bioOnline && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <button
                type="button"
                onClick={handleBiometricAuth}
                disabled={loading || bioLoading}
                className="w-full bg-gradient-to-r from-teal-700 via-emerald-600 to-teal-800 hover:from-teal-600 hover:to-emerald-500 active:scale-[0.99] text-white py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider font-sans transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Fingerprint className={`w-4 h-4 text-teal-200 ${bioLoading ? 'animate-pulse' : ''}`} />
                <span>{bioLoading ? 'Leyendo Huella...' : 'Autorizar con Huella de Admin'}</span>
              </button>
              {bioFeedback && (
                <p className="text-[10.5px] text-teal-300 font-sans text-center animate-pulse">
                  {bioFeedback}
                </p>
              )}
            </div>
          )}
        </form>

        {/* Footer ESC hint */}
        <div className="px-6 py-2.5 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-300 font-sans transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Cerrar [ESC]
          </button>
        </div>
      </div>
    </div>
  );
};
