import React, { useState, useCallback, useRef, createContext, useContext } from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, Trash2, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type DialogType = 'alert' | 'confirm' | 'success' | 'warning' | 'error' | 'info';

interface DialogConfig {
  type: DialogType;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  isDanger?: boolean;
}

interface DialogContextValue {
  showAlert: (message: string, title?: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  showConfirm: (message: string, title?: string, opts?: { confirmLabel?: string; cancelLabel?: string; isDanger?: boolean }) => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const DialogContext = createContext<DialogContextValue | null>(null);

// ─── Icon helper ─────────────────────────────────────────────────────────────

function DialogIcon({ type }: { type: DialogType }) {
  const iconBase = 'w-6 h-6 flex-shrink-0';
  if (type === 'success') return <CheckCircle2 className={`${iconBase} text-emerald-500`} />;
  if (type === 'warning') return <AlertTriangle className={`${iconBase} text-amber-500`} />;
  if (type === 'error')   return <AlertCircle className={`${iconBase} text-red-500`} />;
  if (type === 'confirm') return <AlertTriangle className={`${iconBase} text-amber-500`} />;
  return <Info className={`${iconBase} text-sky-500`} />;
}

function headerColor(type: DialogType): string {
  if (type === 'success') return 'bg-emerald-500';
  if (type === 'warning' || type === 'confirm') return 'bg-amber-500';
  if (type === 'error')   return 'bg-red-500';
  return 'bg-sky-500';
}

// ─── Dialog Modal UI ─────────────────────────────────────────────────────────

function DialogModal({ config, onClose }: { config: DialogConfig; onClose: (result: boolean) => void }) {
  const isConfirm = config.type === 'confirm';
  const hdrColor  = headerColor(config.type);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { onClose(true); }
    if (e.key === 'Escape') { onClose(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)' }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Click backdrop to cancel */}
      <div className="absolute inset-0" onClick={() => onClose(false)} />

      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-[scaleIn_.15s_ease-out]"
        style={{ animation: 'scaleIn .15s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Colored top bar */}
        <div className={`${hdrColor} h-1.5 w-full`} />

        {/* Content */}
        <div className="px-6 pt-5 pb-4 flex gap-4 items-start">
          <div className="pt-0.5">
            <DialogIcon type={config.type} />
          </div>
          <div className="flex-1 min-w-0">
            {config.title && (
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide font-sans mb-1">
                {config.title}
              </h3>
            )}
            <p className="text-[13px] text-slate-600 font-sans leading-relaxed">
              {config.message}
            </p>
          </div>
          {!isConfirm && (
            <button
              autoFocus
              onClick={() => onClose(false)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-6 pb-5 flex justify-end gap-2.5">
          {isConfirm && (
            <button
              onClick={() => onClose(false)}
              className="px-5 py-2 rounded-lg text-xs font-bold font-sans text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-250 transition-all active:scale-95"
            >
              {config.cancelLabel || 'Cancelar'}
            </button>
          )}
          <button
            autoFocus={!isConfirm}
            onClick={() => onClose(true)}
            className={`px-5 py-2 rounded-lg text-xs font-bold font-sans text-white transition-all active:scale-95 shadow-sm flex items-center gap-1.5
              ${config.isDanger
                ? 'bg-red-500 hover:bg-red-600'
                : isConfirm
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : config.type === 'success'
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-sky-500 hover:bg-sky-600'
              }`}
          >
            {config.isDanger && <Trash2 className="w-3.5 h-3.5" />}
            {config.confirmLabel || (isConfirm ? 'Confirmar' : 'Entendido')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const resolveRef = useRef<((val: boolean) => void) | null>(null);

  const handleClose = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setDialog(null);
  }, []);

  const showAlert = useCallback((
    message: string,
    title?: string,
    type: 'success' | 'warning' | 'error' | 'info' = 'info'
  ) => {
    return new Promise<void>(resolve => {
      resolveRef.current = () => resolve();
      setDialog({ type, title, message });
    });
  }, []);

  const showConfirm = useCallback((
    message: string,
    title?: string,
    opts: { confirmLabel?: string; cancelLabel?: string; isDanger?: boolean } = {}
  ): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setDialog({
        type: 'confirm',
        title: title || '¿Confirmar acción?',
        message,
        confirmLabel: opts.confirmLabel,
        cancelLabel:  opts.cancelLabel,
        isDanger:     opts.isDanger,
      });
    });
  }, []);

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog && <DialogModal config={dialog} onClose={handleClose} />}
    </DialogContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    // Fallback to native browser dialogs when used outside provider
    return {
      showAlert: (msg) => { window.alert(msg); },
      showConfirm: (msg) => Promise.resolve(window.confirm(msg)),
    };
  }
  return ctx;
}
