import { useState } from 'react';
import { 
  Smartphone, Globe, Monitor, 
  Check, Copy
} from 'lucide-react';

interface Props {
  onSwitchToDesktop: () => void;
}

export default function MobileSettings({ onSwitchToDesktop }: Props) {
  const [copied, setCopied] = useState(false);

  const currentUrl = window.location.href;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="space-y-4 pb-20 pt-2 px-3">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <h2 className="text-base font-black text-white flex items-center gap-2 mb-1">
          <Smartphone className="w-5 h-5 text-blue-400" />
          Conectividad & Configuración Móvil
        </h2>
        <p className="text-xs text-slate-400">
          Opciones del dispositivo y acceso gerencial
        </p>
      </div>

      {/* PWA / App info card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 rounded-2xl p-4 shadow-md">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-900/50">
            WP
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-white">WinterPos Mobile Executive</h3>
            <p className="text-[11px] text-emerald-400 font-semibold">PWA Instalable • Versión 1.1</p>
          </div>
        </div>

        <p className="text-xs text-slate-300 mb-3">
          Puedes instalar esta aplicación directamente en la pantalla de inicio de tu smartphone para abrirla en 1 segundo como una app nativa.
        </p>

        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 text-xs space-y-1.5 text-slate-300">
          <p className="font-bold text-white flex items-center gap-1.5">
            📲 ¿Cómo instalar en tu teléfono?
          </p>
          <p>• <strong>En iPhone (Safari):</strong> Toca el botón <em>Compartir</em> (ícono de caja con flecha arriba) y selecciona <em>"Añadir a la pantalla de inicio"</em>.</p>
          <p>• <strong>En Android (Chrome):</strong> Toca los 3 puntos arriba a la derecha y selecciona <em>"Instalar aplicación"</em> o <em>"Agregar a pantalla principal"</em>.</p>
        </div>
      </div>

      {/* Direct Link Share */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Globe className="w-4 h-4 text-blue-400" />
          Enlace de Conexión Directa
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Comparte este enlace con los socios o gerentes autorizados:
        </p>

        <div className="flex items-center gap-2 bg-slate-800 p-2 rounded-xl border border-slate-700 text-xs">
          <input
            type="text"
            readOnly
            value={currentUrl}
            className="bg-transparent text-slate-200 font-mono text-[11px] flex-1 outline-none truncate"
          />
          <button
            onClick={handleCopyLink}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Switch to Full Desktop Mode */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md text-center">
        <Monitor className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <h3 className="text-xs font-bold text-white mb-1">
          ¿Deseas ver la interfaz de Escritorio / POS completa?
        </h3>
        <p className="text-[11px] text-slate-400 mb-3">
          Cambia a la vista para computadoras si necesitas emitir tickets, configurar impresoras o editar permisos.
        </p>
        <button
          onClick={onSwitchToDesktop}
          className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-200 border border-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition"
        >
          <Monitor className="w-4 h-4 text-blue-400" />
          Cambiar a Modo Escritorio / Caja POS
        </button>
      </div>
    </div>
  );
}
