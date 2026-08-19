import { useState, useEffect } from 'react';
import { 
  X, Smartphone, QrCode, Globe, ShieldCheck, 
  Copy, Check, Sparkles, Terminal
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lanIp: string;
}

export default function ManualAccesoMovilModal({ isOpen, onClose, lanIp }: Props) {
  const [copiedLan, setCopiedLan] = useState(false);
  const [copiedCloudflareCmd, setCopiedCloudflareCmd] = useState(false);
  const [activeTab, setActiveTab] = useState<'wifi' | 'remote' | 'pwa'>('wifi');
  const [localIpAddress, setLocalIpAddress] = useState(lanIp || '192.168.1.100');

  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        if (data.localIp) setLocalIpAddress(data.localIp);
      })
      .catch(() => {});
  }, []);

  // Listen for Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const lanMobileUrl = `http://${localIpAddress}:5000?mode=mobile`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(lanMobileUrl)}&color=0f172a&bgcolor=ffffff&qzone=2`;

  const cloudflareCommand = `npx cloudflared tunnel --url http://localhost:5000`;

  const copyToClipboard = (text: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 3000);
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Manual y Conexión Móvil Gerencial</h3>
              <p className="text-xs text-slate-400">Accede en vivo a WinterPos desde cualquier smartphone sin pagar hosting</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subnav Tabs */}
        <div className="px-6 pt-4 bg-slate-900 flex gap-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('wifi')}
            className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'wifi'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrCode className="w-4 h-4" />
            1. Conexión WiFi Local (Código QR)
          </button>

          <button
            onClick={() => setActiveTab('remote')}
            className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'remote'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            2. Acceso Remoto Global (Sin Hosting)
          </button>

          <button
            onClick={() => setActiveTab('pwa')}
            className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'pwa'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            3. Instalar App en el Celular
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-300">
          {activeTab === 'wifi' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-inner text-center">
                <img
                  src={qrCodeUrl}
                  alt="QR Conexión Móvil"
                  className="w-44 h-44 rounded-lg object-contain"
                />
                <span className="text-[11px] font-extrabold text-slate-900 mt-2 block">
                  Apunta la cámara de tu teléfono al QR
                </span>
                <span className="text-[10px] text-slate-500">
                  (Tu celular debe estar en el mismo WiFi)
                </span>
              </div>

              {/* Instructions */}
              <div className="space-y-3">
                <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60 space-y-2">
                  <h4 className="font-extrabold text-white text-xs flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Pasos para conectar:
                  </h4>
                  <ol className="list-decimal pl-4 space-y-1.5 text-slate-300 text-[11px]">
                    <li>Asegúrate de que tu teléfono esté conectado al mismo <strong>WiFi</strong> que esta computadora.</li>
                    <li>Abre la cámara de tu teléfono o escanea el código QR de la izquierda.</li>
                    <li>O escribe directamente este enlace en el navegador:</li>
                  </ol>
                </div>

                <div className="flex items-center gap-2 bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                  <span className="font-mono text-blue-300 text-[11px] truncate flex-1">{lanMobileUrl}</span>
                  <button
                    onClick={() => copyToClipboard(lanMobileUrl, setCopiedLan)}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-[10px] flex items-center gap-1"
                  >
                    {copiedLan ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedLan ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'remote' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-950/60 to-slate-800 p-4 rounded-2xl border border-blue-800/40">
                <h4 className="font-extrabold text-sm text-white mb-1 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ¿Cómo ver las ventas desde tu casa o viaje sin pagar Hosting?
                </h4>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Puedes utilizar <strong>Cloudflare Tunnel</strong> (un servicio 100% gratuito de la empresa Cloudflare). Esto crea un enlace seguro cifrado <code className="bg-black/40 px-1 py-0.5 rounded text-emerald-300 font-mono">https://...</code> que conecta tu celular directamente con tu PC sin necesidad de abrir puertos en el router ni contratar servidores externos.
                </p>
              </div>

              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700 space-y-3">
                <h5 className="font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-400" />
                  Comando de Túnel Seguro (1 Clic en la PC):
                </h5>
                <p className="text-slate-400 text-[11px]">
                  En una ventana de PowerShell o CMD en la computadora del negocio, ejecuta este comando:
                </p>
                <div className="flex items-center gap-2 bg-black/60 p-2.5 rounded-xl border border-slate-700 font-mono text-[11px] text-emerald-400">
                  <span className="flex-1 truncate">{cloudflareCommand}</span>
                  <button
                    onClick={() => copyToClipboard(cloudflareCommand, setCopiedCloudflareCmd)}
                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold text-[10px] flex items-center gap-1 font-sans"
                  >
                    {copiedCloudflareCmd ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedCloudflareCmd ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <p className="text-slate-400 text-[11px]">
                  El comando te generará un enlace como <strong className="text-white">https://tu-enlace.trycloudflare.com</strong>. Ábrelo en tu teléfono desde cualquier parte del mundo.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'pwa' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/60 space-y-2">
                <h4 className="font-extrabold text-white text-xs flex items-center gap-2">
                  🍎 En iPhone / iPad (Safari)
                </h4>
                <ol className="list-decimal pl-4 space-y-2 text-slate-300 text-[11px]">
                  <li>Abre el enlace en el navegador <strong>Safari</strong>.</li>
                  <li>Toca el botón <strong>Compartir</strong> (ícono de un cuadrado con una flecha hacia arriba en la barra inferior).</li>
                  <li>Baja en las opciones y presiona <strong>"Añadir a la pantalla de inicio"</strong>.</li>
                  <li>¡Listo! Aparecerá el icono de WinterPOS en tu menú de apps.</li>
                </ol>
              </div>

              <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/60 space-y-2">
                <h4 className="font-extrabold text-white text-xs flex items-center gap-2">
                  🤖 En Android (Google Chrome)
                </h4>
                <ol className="list-decimal pl-4 space-y-2 text-slate-300 text-[11px]">
                  <li>Abre el enlace en <strong>Google Chrome</strong>.</li>
                  <li>Toca el menú de <strong>3 puntos</strong> en la esquina superior derecha.</li>
                  <li>Selecciona la opción <strong>"Instalar aplicación"</strong> o <strong>"Agregar a pantalla principal"</strong>.</li>
                  <li>¡Listo! Se instalará como una App nativa ultra rápida.</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-900/40 transition"
          >
            Entendido, Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
