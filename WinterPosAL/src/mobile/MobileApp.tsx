import { useState } from 'react';
import { 
  TrendingUp, Store, Package, Briefcase, Settings, 
  Monitor
} from 'lucide-react';
import MobileDashboard from './MobileDashboard';
import MobileCajas from './MobileCajas';
import MobileInventario from './MobileInventario';
import MobileFinanzas from './MobileFinanzas';
import MobileSettings from './MobileSettings';

interface Props {
  onSwitchToDesktop: () => void;
}

export default function MobileApp({ onSwitchToDesktop }: Props) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cajas' | 'inventario' | 'finanzas' | 'settings'>('dashboard');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 selection:text-white flex flex-col max-w-md mx-auto relative shadow-2xl">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-blue-900/40">
            WP
          </div>
          <div>
            <h1 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5 leading-none">
              WinterPos
              <span className="text-[9px] bg-blue-500/20 text-blue-400 font-bold px-1.5 py-0.5 rounded-full border border-blue-500/30">
                MÓVIL
              </span>
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Control Gerencial</p>
          </div>
        </div>

        <button
          onClick={onSwitchToDesktop}
          className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2.5 py-1.5 rounded-xl transition active:scale-95"
          title="Ver versión de escritorio completa"
        >
          <Monitor className="w-3.5 h-3.5 text-blue-400" />
          <span>Escritorio</span>
        </button>
      </header>

      {/* Main View Body */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'dashboard' && <MobileDashboard onNavigateTab={setActiveTab} />}
        {activeTab === 'cajas' && <MobileCajas />}
        {activeTab === 'inventario' && <MobileInventario />}
        {activeTab === 'finanzas' && <MobileFinanzas />}
        {activeTab === 'settings' && <MobileSettings onSwitchToDesktop={onSwitchToDesktop} />}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 max-w-md mx-auto px-2 py-1.5 flex justify-around items-center shadow-2xl">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition ${
            activeTab === 'dashboard'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <TrendingUp className={`w-5 h-5 ${activeTab === 'dashboard' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5">KPIs</span>
        </button>

        <button
          onClick={() => setActiveTab('cajas')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition ${
            activeTab === 'cajas'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Store className={`w-5 h-5 ${activeTab === 'cajas' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5">Cajas</span>
        </button>

        <button
          onClick={() => setActiveTab('inventario')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition ${
            activeTab === 'inventario'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Package className={`w-5 h-5 ${activeTab === 'inventario' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5">Stock</span>
        </button>

        <button
          onClick={() => setActiveTab('finanzas')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition ${
            activeTab === 'finanzas'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Briefcase className={`w-5 h-5 ${activeTab === 'finanzas' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5">Finanzas</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition ${
            activeTab === 'settings'
              ? 'text-blue-400 font-bold'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Settings className={`w-5 h-5 ${activeTab === 'settings' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-0.5">Ajustes</span>
        </button>
      </nav>
    </div>
  );
}
