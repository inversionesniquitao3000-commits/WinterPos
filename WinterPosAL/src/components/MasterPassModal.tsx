import React, { useState, useEffect, useRef } from 'react';
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
  const [isBioIdle, setIsBioIdle] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(false);
  const isAutoWatchingRef = useRef(false);
  const authCompletedRef = useRef(false);
  const lastBioActivityRef = useRef<number>(Date.now());

  // Live Touch Biometric Watcher: Listens automatically without needing manual button click
  const startLiveBiometricWatcher = async (bioCfg?: any) => {
    if (isAutoWatchingRef.current) return;
    isAutoWatchingRef.current = true;
    setIsBioIdle(false);
    lastBioActivityRef.current = Date.now();

    // Small initial delay so inputs can focus smoothly first
    await new Promise(r => setTimeout(r, 350));

    while (isMountedRef.current && !authCompletedRef.current) {
      // Regla de inactividad de 2 minutos (120 seg): apagar LED y pasar a reposo
      if (Date.now() - lastBioActivityRef.current >= 120000) {
        setIsBioIdle(true);
        setBioFeedback('💤 Lector en reposo por inactividad (2 min). Haga clic aquí para reactivar.');
        break;
      }

      try {
        setBioLoading(true);
        setBioFeedback('🟢 LED encendido: Coloque su huella en el sensor...');

        const scanRes = await captureBiometricFingerprint(bioCfg, 15000);

        if (!isMountedRef.current || authCompletedRef.current) break;

        if (scanRes.success && scanRes.template) {
          lastBioActivityRef.current = Date.now();
          setBioFeedback('🔍 Validando privilegios de Administrador...');

          const res = await fetch(`${getApiBaseUrl()}/config/verify-master-biometric`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: scanRes.template })
          });

          const data = await res.json().catch(() => ({ success: false, message: 'Error del servidor.' }));
          if (res.ok && data.success) {
            authCompletedRef.current = true;
            setBioFeedback(`✅ ${data.message || 'Autorización concedida'}`);
            setTimeout(() => {
              if (isMountedRef.current) onSuccess();
            }, 250);
            break;
          } else {
            setErrorMsg(data.message || 'Huella no autorizada para funciones de Administrador.');
            setBioFeedback('');
          }
        }
      } catch (_) {
        // Sensor timeout pass, continue silently
      }

      const restMs = 800;
      if (isMountedRef.current && !authCompletedRef.current) {
        await new Promise(r => setTimeout(r, restMs));
      }
    }

    isAutoWatchingRef.current = false;
    if (isMountedRef.current) setBioLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      isMountedRef.current = true;
      authCompletedRef.current = false;
      setPass('');
      setErrorMsg('');
      setBioFeedback('');

      // Auto-focus the Master Pass password input so the user can immediately type
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);

      // Probe biometric status and auto-start live scanner
      try {
        const savedConfig = localStorage.getItem('pos_biometric_config');
        const bioCfg = savedConfig ? JSON.parse(savedConfig) : undefined;
        checkBiometricReaderStatus(bioCfg).then(res => {
          if (isMountedRef.current) {
            setBioOnline(res.online);
            if (res.online && bioCfg?.autorizarMasterPass !== false) {
              startLiveBiometricWatcher(bioCfg);
            }
          }
        }).catch(() => {
          if (isMountedRef.current) setBioOnline(false);
        });
      } catch (_) {
        setBioOnline(false);
      }

      return () => {
        clearTimeout(timer);
        isMountedRef.current = false;
        authCompletedRef.current = true;
      };
    } else {
      isMountedRef.current = false;
      authCompletedRef.current = true;
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
        authCompletedRef.current = true;
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

  const handleManualBiometricTrigger = () => {
    lastBioActivityRef.current = Date.now();
    setIsBioIdle(false);
    setBioFeedback('');
    if (!isAutoWatchingRef.current) {
      try {
        const savedConfig = localStorage.getItem('pos_biometric_config');
        const bioCfg = savedConfig ? JSON.parse(savedConfig) : undefined;
        startLiveBiometricWatcher(bioCfg);
      } catch (_) {}
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
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
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
              Coloque su huella en el lector o escriba su clave maestra para ingresar.
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
                ref={inputRef}
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
              >
                {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wide font-sans transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-1/2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wide font-sans transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-1.5 cursor-pointer"
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

          {/* Tarjeta de Lector de Huella en Vivo (Auto-Escaneo Manos Libres) */}
          {bioOnline && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div
                onClick={handleManualBiometricTrigger}
                className={`w-full bg-gradient-to-r from-emerald-950/80 via-teal-950/60 to-emerald-950/80 border ${isBioIdle ? 'border-amber-500/40 hover:border-amber-400' : 'border-emerald-500/40 hover:border-emerald-400'} rounded-xl p-3 flex items-center justify-between gap-3 shadow-lg group transition-all cursor-pointer`}
                title={isBioIdle ? 'Haga clic para reactivar el sensor y encender el LED' : ''}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${isBioIdle ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'} border flex items-center justify-center flex-shrink-0`}>
                    <Fingerprint className={`w-5 h-5 ${isBioIdle ? 'text-amber-300' : 'text-emerald-300'} ${bioLoading && !isBioIdle ? 'animate-pulse' : ''}`} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5 font-sans">
                      <span className={`w-2 h-2 rounded-full ${bioLoading && !isBioIdle ? 'bg-emerald-400 animate-pulse' : isBioIdle ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                      <span>{bioLoading && !isBioIdle ? 'Sensor Activo: Escaneando...' : isBioIdle ? 'Sensor en Modo Reposo (LED apagado)' : 'Lector de Huella en Línea'}</span>
                    </div>
                    <p className={`text-[11px] font-sans ${isBioIdle ? 'text-amber-300/90 font-medium' : 'text-emerald-300/90'}`}>
                      {bioFeedback || (isBioIdle ? 'Haga clic aquí para reactivar la lectura biométrica' : 'Toque el sensor con su huella para autorizar al instante')}
                    </p>
                  </div>
                </div>
                <span className={`text-[9.5px] font-mono font-bold ${isBioIdle ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'} px-2 py-0.5 rounded border`}>
                  {isBioIdle ? 'REPOSO' : 'AUTO'}
                </span>
              </div>
            </div>
          )}
        </form>

        {/* Footer ESC hint */}
        <div className="px-6 py-2.5 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-300 font-sans transition-colors flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3 h-3" />
            Cerrar [ESC]
          </button>
        </div>
      </div>
    </div>
  );
};

