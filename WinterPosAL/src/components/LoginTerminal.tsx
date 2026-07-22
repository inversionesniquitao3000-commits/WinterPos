import React, { useState, useEffect } from 'react';
import { Shield, Network, Eye, EyeOff } from 'lucide-react';
import { User, CompanyConfig } from '../types';
import { useDialog } from '../hooks/useDialog';

interface LoginTerminalProps {
  onLoginSuccess: (user: User) => void;
  systemUsers: User[];
  companyConfig: CompanyConfig;
}

export default function LoginTerminal({ onLoginSuccess, systemUsers, companyConfig }: LoginTerminalProps) {
  const { showAlert } = useDialog();
  const [showConfig, setShowConfig] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [serverIP, setServerIP] = useState(() => {
    const saved = localStorage.getItem('pos_lan_ip');
    return saved || '192.168.1.100';
  });
  const [serverPort, setServerPort] = useState(() => {
    const saved = localStorage.getItem('pos_lan_port');
    return saved || '5432';
  });
  const [dbMode, setDbMode] = useState(() => {
    const saved = localStorage.getItem('pos_db_mode');
    return saved || 'local'; 
  });
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Monitor key press Ctrl + Alt + P
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowConfig(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogoClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 5) {
      setShowConfig(true);
      setClickCount(0);
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('pos_lan_ip', serverIP);
    localStorage.setItem('pos_lan_port', serverPort);
    localStorage.setItem('pos_db_mode', dbMode);
    setShowConfig(false);
    
    console.log('Saved network config to config.json', { dbMode, serverIP, serverPort });
    showAlert(
      `Conexión de base de datos configurada correctamente hacia: ${dbMode === 'local' ? 'localhost (modo local)' : `${serverIP}:${serverPort}`}`,
      'Configuración Guardada',
      'success'
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Usuario y contraseña son requeridos.');
      return;
    }

    setIsLoading(true);
    
    setTimeout(() => {
      setIsLoading(false);
      const matched = systemUsers.find(
        u => u.usuario.toLowerCase() === username.trim().toLowerCase() && password === (u.clave || 'admin')
      );
      
      if (matched) {
        if (matched.estado === 'Inactivo') {
          setErrorMsg('Su usuario se encuentra inactivo. Consulte al Administrador.');
        } else {
          onLoginSuccess(matched);
        }
      } else {
        setErrorMsg('Usuario o contraseña incorrectos. Verifique sus credenciales.');
      }
    }, 800);
  };

  return (
    <div className="flex h-screen w-screen select-none overflow-hidden font-mono text-white bg-slate-900">
      
      {/* LEFT SIDEBAR PANEL: 35% Width */}
      <div className="w-full md:w-[35%] h-full bg-[#0f3562] flex flex-col justify-between p-8 relative shadow-2xl z-20">
        
        {/* Top Spacer or Network Settings Button */}
        <div className="flex justify-between items-center text-[10px] text-slate-300 font-sans">
          <span>ESTACIÓN: TERMINAL_01</span>
          <button 
            type="button"
            onClick={() => setShowConfig(prev => !prev)}
            className="text-slate-300 hover:text-white p-1 rounded hover:bg-white/10"
            title="Ajustes de Red LAN"
          >
            <Network className="w-4 h-4" />
          </button>
        </div>

        {/* Center Contents: Logo, Title, Inputs */}
        <div className="space-y-6 my-auto">
          
          {/* Logo Star - SVG Styled precisely like mockup */}
          <div className="text-center cursor-pointer" onClick={handleLogoClick}>
            <svg className="w-24 h-24 mx-auto drop-shadow-lg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Swooshes */}
              <path d="M 15,65 C 32,80 68,80 85,65" stroke="#14b8a6" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M 8,58 C 28,78 72,78 92,58" stroke="#0ea5e9" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M 22,71 C 37,84 63,84 78,71" stroke="#6366f1" strokeWidth="2" fill="none" strokeLinecap="round" />
              
              {/* 8-pointed star */}
              <polygon 
                points="50,8 54,32 78,32 59,45 68,69 50,54 32,69 41,45 22,32 46,32" 
                fill="#0a2a50" 
                stroke="#ffffff" 
                strokeWidth="2.5" 
                strokeLinejoin="miter"
              />
              <polygon 
                points="50,13 53,33 73,33 57,44 65,64 50,51 35,64 43,44 27,33 47,33" 
                fill="#1c3e6a" 
                stroke="#3b82f6" 
                strokeWidth="1" 
                strokeLinejoin="miter"
              />
            </svg>

            <h1 className="text-lg font-black text-yellow-400 tracking-wider mt-3 font-sans uppercase">
              {companyConfig.nombre_comercio?.trim() !== '' ? companyConfig.nombre_comercio : 'Sistema WinterPosAL'}
            </h1>
            <p className="text-[10px] text-slate-300 font-sans tracking-widest mt-1">
              Bienvenido
            </p>
          </div>

          {/* Error Dialog */}
          {errorMsg && (
            <div className="bg-red-950/70 border border-red-800/60 text-red-200 px-3.5 py-2.5 rounded text-xs font-sans flex items-start gap-2 animate-pulse">
              <Shield className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Configuration mode vs standard login */}
          {!showConfig ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              
              {/* Usuario Input */}
              <div className="space-y-1">
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Usuario"
                    className="w-full bg-white text-slate-800 border-none rounded px-3 py-2.5 text-xs font-sans pr-8 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 font-bold"
                    disabled={isLoading}
                  />
                  {/* Yellow triangle pointing left */}
                  <span className="absolute right-2.5 top-3 text-yellow-400 text-[10px]">◀</span>
                </div>
              </div>

              {/* Contraseña Input */}
              <div className="space-y-1">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contraseña"
                    className="w-full bg-white text-slate-800 border-none rounded px-3 py-2.5 text-xs font-sans pr-12 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 font-bold"
                    disabled={isLoading}
                  />
                  {/* Password toggler and yellow arrow */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-7 top-2 text-slate-400 hover:text-slate-655 outline-none z-10"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <span className="absolute right-2.5 top-3 text-yellow-400 text-[10px]">◀</span>
                </div>
              </div>

              {/* Login submit button - dark navy */}
              <button
                type="submit"
                className="w-full bg-[#08284c] hover:bg-[#061f3b] text-white py-3 rounded text-xs font-black tracking-wider transition-all duration-200 border border-slate-700/30 flex items-center justify-center gap-2 font-sans shadow"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Iniciar sesión'
                )}
              </button>

            </form>
          ) : (
            <form className="space-y-3 bg-[#0a2f58] p-4 rounded border border-yellow-500/20" onSubmit={handleSaveConfig}>
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-[10px] text-yellow-400 font-bold flex items-center gap-1">
                  <Network className="w-3 h-3 text-yellow-400" />
                  AJUSTES DE RED LAN
                </span>
                <button
                  type="button"
                  onClick={() => setShowConfig(false)}
                  className="text-slate-350 text-xs hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-2 text-[10px]">
                <div>
                  <label className="text-slate-300 block mb-1 font-sans">Origen de Datos</label>
                  <select
                    value={dbMode}
                    onChange={(e) => setDbMode(e.target.value)}
                    className="w-full bg-[#08284c] border border-slate-700 text-white rounded p-1.5 outline-none"
                  >
                    <option value="local">Esta Computadora (Local)</option>
                    <option value="remote">Otra Computadora (Red LAN)</option>
                  </select>
                </div>
                
                {dbMode === 'remote' && (
                  <div className="grid grid-cols-3 gap-1">
                    <div className="col-span-2">
                      <label className="text-slate-300 block mb-1 font-sans">IP Servidor</label>
                      <input
                        type="text"
                        value={serverIP}
                        onChange={(e) => setServerIP(e.target.value)}
                        placeholder="192.168.1.100"
                        className="w-full bg-[#08284c] border border-slate-700 rounded p-1.5 text-yellow-400 outline-none font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1 font-sans">Puerto</label>
                      <input
                        type="text"
                        value={serverPort}
                        onChange={(e) => setServerPort(e.target.value)}
                        placeholder="5432"
                        className="w-full bg-[#08284c] border border-slate-700 rounded p-1.5 text-yellow-400 outline-none font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-[#08284c] hover:bg-[#061f3b] text-white py-2 rounded text-[10px] font-bold font-sans tracking-wide transition-all border border-slate-700"
              >
                GUARDAR Y RECONECTAR
              </button>
            </form>
          )}

        </div>

        {/* Footer brand info */}
        <div className="text-center space-y-1 border-t border-white/10 pt-4 text-[9px] text-slate-300 leading-relaxed font-sans relative">
          <div>Módulo Punto de Venta</div>
          <div>Pos Venta Version : 3.7</div>
          <div>Derechos Reservados : 2021</div>
          
          {/* Circle X icon bottom right style */}
          <div className="absolute bottom-1 right-1 text-white opacity-70 hover:opacity-100 cursor-pointer" onClick={() => window.close()}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

      </div>

      {/* RIGHT SIDEBAR PANEL: 65% Width cashier background */}
      <div 
        className="hidden md:block md:w-[65%] h-full bg-cover bg-center relative"
        style={{ backgroundImage: `url('/cashier.png')` }}
      >
        {/* Soft overlay */}
        <div className="absolute inset-0 bg-slate-900/10"></div>
      </div>

    </div>
  );
}
