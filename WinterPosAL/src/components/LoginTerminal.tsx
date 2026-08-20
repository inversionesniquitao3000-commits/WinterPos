import { useState, useEffect, useRef } from 'react';
import { Shield, Network, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { User, CompanyConfig } from '../types';
import { useDialog } from '../hooks/useDialog';
import { getApiBaseUrl } from '../utils';

interface LoginTerminalProps {
  onLoginSuccess: (user: User) => void;
  systemUsers: User[];
  companyConfig: CompanyConfig;
  sessionNotice?: string;
  onOpenLicenseModal?: () => void;
}

export default function LoginTerminal({ onLoginSuccess, systemUsers, companyConfig, sessionNotice, onOpenLicenseModal }: LoginTerminalProps) {
  const { showAlert } = useDialog();
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [serverIP, setServerIP] = useState(() => {
    const saved = localStorage.getItem('pos_lan_ip');
    if (saved) return saved;
    return window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
      ? window.location.hostname
      : '127.0.0.1';
  });
  const [serverPort, setServerPort] = useState(() => {
    const saved = localStorage.getItem('pos_lan_port');
    return saved || '5000';
  });
  const [dbMode, setDbMode] = useState(() => {
    const saved = localStorage.getItem('pos_db_mode');
    return saved || 'local';
  });
  const [terminalNameState, setTerminalNameState] = useState(() => {
    const saved = localStorage.getItem('pos_terminal_name');
    return saved || 'CAJA_01';
  });
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Auto-focus username input on load, refresh, or window focus
  useEffect(() => {
    const focusInput = () => {
      if (!showConfig) {
        usernameInputRef.current?.focus();
      }
    };

    const timer = setTimeout(focusInput, 100);
    window.addEventListener('focus', focusInput);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', focusInput);
    };
  }, [showConfig]);

  // Monitor key press Ctrl + Alt + P for LAN settings and F9 for License
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowConfig(prev => !prev);
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (onOpenLicenseModal) onOpenLicenseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenLicenseModal]);

  const handleLogoClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 5) {
      setShowConfig(true);
      setClickCount(0);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTerminal = terminalNameState.trim().toUpperCase() || 'CAJA_01';
    const targetIP = serverIP.trim() || 'localhost';
    const targetPort = serverPort.trim() || '5000';

    if (dbMode === 'remote') {
      setIsTestingConnection(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 segundos timeout

        const testUrl = `http://${targetIP}:${targetPort}/api/status`;
        const res = await fetch(testUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`El servidor respondió con código HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log('Servidor verificado con éxito:', data);
      } catch (err: any) {
        setIsTestingConnection(false);
        const isTimeout = err.name === 'AbortError';
        showAlert(
          `No se pudo establecer conexión con el Servidor Central en "${targetIP}:${targetPort}".\n\n- ${isTimeout ? 'La solicitud expiró por tiempo de espera (Timeout 4s).' : (err.message || 'Error de red')}\n\nPor favor verifique:\n1. Que el equipo Servidor (${targetIP}) esté encendido y conectado a la red LAN.\n2. Que el backend de WinterPOS esté ejecutándose en la IP ${targetIP}.\n3. Que el puerto ${targetPort} esté permitido en el Firewall de Windows del Servidor.`,
          'Fallo de Conexión LAN',
          'error'
        );
        return; // No guardar IP inaccesible
      }
      setIsTestingConnection(false);
    }

    localStorage.setItem('pos_lan_ip', targetIP);
    localStorage.setItem('pos_lan_port', targetPort);
    localStorage.setItem('pos_db_mode', dbMode);
    localStorage.setItem('pos_terminal_name', finalTerminal);
    setTerminalNameState(finalTerminal);
    setShowConfig(false);
    
    console.log('Saved network and terminal config', { dbMode, targetIP, targetPort, finalTerminal });
    showAlert(
      `Conexión Verificada. Configuración de la estación "${finalTerminal}" guardada correctamente (${dbMode === 'local' ? 'Modo Local' : `${targetIP}:${targetPort}`}).`,
      'Conexión Exitosa con Servidor',
      'success'
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Usuario y contraseña son requeridos.');
      return;
    }

    setIsLoading(true);

    try {
      const checkUrl = `${getApiBaseUrl()}/users/login-check`;
      const terminalSaved = localStorage.getItem('pos_terminal_name') || 'LOCAL';

      const checkRes = await fetch(checkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          terminal: terminalSaved
        })
      });

      setIsLoading(false);

      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.success && checkData.user) {
          onLoginSuccess(checkData.user);
          return;
        }
      } else {
        const errData = await checkRes.json().catch(() => ({}));
        if (errData.message) {
          setErrorMsg(errData.message);
          return;
        }
      }
    } catch (err) {
      setIsLoading(false);
      console.warn('Backend no disponible para login-check, usando verificación local de respaldo:', err);
    }

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
  };

  // Detect if running in desktop app launcher mode or standard browser
  const isDesktopMode = new URLSearchParams(window.location.search).get('mode') === 'desktop' || 
    window.navigator.userAgent.includes('Electron') || 
    window.matchMedia('(display-mode: standalone)').matches;

  if (!isDesktopMode) {
    // STANDARD BROWSER FULLSCREEN LOGIN LAYOUT (Previous Full Screen Design)
    return (
      <div className="flex h-screen w-screen select-none overflow-hidden font-mono text-white bg-slate-900">
        {/* LEFT SIDEBAR PANEL: 35% Width */}
        <div className="w-full md:w-[35%] h-full bg-[#0f3562] flex flex-col justify-between p-8 relative shadow-2xl z-20 border-r border-slate-700/40">
          <div className="flex justify-between items-center text-[10px] text-slate-300 font-sans">
            <span className="font-mono uppercase font-bold tracking-wider text-slate-300">
              ESTACIÓN: {localStorage.getItem('pos_terminal_name') || 'CAJA_01'}
            </span>
            <div className="flex items-center gap-2">
              {onOpenLicenseModal && (
                <button 
                  type="button"
                  onClick={onOpenLicenseModal}
                  className="text-emerald-300 hover:text-white px-2 py-0.5 rounded bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-500/30 transition-all font-mono text-[9px] flex items-center gap-1 cursor-pointer"
                  title="Consultar o renovar información de licencia (F9)"
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>Licencia (F9)</span>
                </button>
              )}
              <button 
                type="button"
                onClick={() => setShowConfig(prev => !prev)}
                className="text-slate-300 hover:text-white p-1 rounded hover:bg-white/10"
                title="Ajustes de Red LAN"
              >
                <Network className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-6 my-auto">
            <div className="text-center cursor-pointer" onClick={handleLogoClick}>
              {companyConfig?.logo_url ? (
                <div className="w-24 h-24 mx-auto rounded-2xl bg-white/10 p-2 border border-white/20 shadow-xl flex items-center justify-center backdrop-blur-sm">
                  <img src={companyConfig.logo_url} alt="Logo" className="w-full h-full object-contain" />
                </div>
              ) : (
                <svg className="w-24 h-24 mx-auto drop-shadow-lg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M 15,65 C 32,80 68,80 85,65" stroke="#14b8a6" strokeWidth="3" fill="none" strokeLinecap="round" />
                  <path d="M 8,58 C 28,78 72,78 92,58" stroke="#0ea5e9" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M 22,71 C 37,84 63,84 78,71" stroke="#6366f1" strokeWidth="2" fill="none" strokeLinecap="round" />
                  <polygon points="50,8 54,32 78,32 59,45 68,69 50,54 32,69 41,45 22,32 46,32" fill="#0a2a50" stroke="#ffffff" strokeWidth="2.5" strokeLinejoin="miter" />
                  <polygon points="50,13 53,33 73,33 57,44 65,64 50,51 35,64 43,44 27,33 47,33" fill="#1c3e6a" stroke="#3b82f6" strokeWidth="1" strokeLinejoin="miter" />
                </svg>
              )}
              <h1 className="text-lg font-black text-yellow-400 tracking-wider mt-3 font-sans uppercase">
                {companyConfig.nombre_comercio?.trim() !== '' ? companyConfig.nombre_comercio : 'Sistema WinterPosAL'}
              </h1>
              <p className="text-[10px] text-slate-300 font-sans tracking-widest mt-1">
                Bienvenido
              </p>
            </div>

            {sessionNotice && (
              <div className="bg-amber-950/80 border border-amber-500/60 text-amber-200 px-3.5 py-2.5 rounded text-xs font-sans flex items-start gap-2 animate-in fade-in duration-200">
                <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="font-semibold">{sessionNotice}</span>
              </div>
            )}

            {errorMsg && (
              <div className="bg-red-950/70 border border-red-800/60 text-red-200 px-3.5 py-2.5 rounded text-xs font-sans flex items-start gap-2 animate-pulse">
                <Shield className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {!showConfig ? (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1">
                  <div className="relative">
                    <input
                      ref={usernameInputRef}
                      autoFocus
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                      placeholder="Usuario"
                      className="w-full bg-white text-slate-800 border-none rounded px-3 py-2.5 text-xs font-sans pr-8 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 font-bold"
                      disabled={isLoading}
                    />
                    <span className="absolute right-2.5 top-3 text-yellow-400 text-[10px]">◀</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value.toLowerCase())}
                      placeholder="Contraseña"
                      className="w-full bg-white text-slate-800 border-none rounded px-3 py-2.5 text-xs font-sans pr-12 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 font-bold"
                      disabled={isLoading}
                    />
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
                  <button type="button" onClick={() => setShowConfig(false)} className="text-slate-350 text-xs hover:text-white">✕</button>
                </div>
                
                <div className="space-y-2 text-[10px]">
                  <div>
                    <label className="text-slate-300 block mb-1 font-sans font-bold">Identificador de Estación / Caja</label>
                    <input
                      type="text"
                      value={terminalNameState}
                      onChange={(e) => setTerminalNameState(e.target.value.toUpperCase())}
                      placeholder="Ej: CAJA_01, CAJA_02, MOSTRADOR"
                      className="w-full bg-[#08284c] border border-slate-700 rounded p-1.5 text-yellow-400 font-bold uppercase outline-none"
                    />
                  </div>
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
                          placeholder="5000"
                          className="w-full bg-[#08284c] border border-slate-700 rounded p-1.5 text-yellow-400 outline-none font-bold"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isTestingConnection}
                  className="w-full bg-[#08284c] hover:bg-[#061f3b] disabled:bg-slate-700 text-white py-2 rounded text-[10px] font-bold font-sans tracking-wide transition-all border border-slate-700 flex items-center justify-center gap-2"
                >
                  {isTestingConnection ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>PROBANDO CONEXIÓN CON SERVIDAR...</span>
                    </>
                  ) : (
                    <span>GUARDAR Y RECONECTAR</span>
                  )}
                </button>
              </form>
            )}
          </div>

          <div className="text-center space-y-1 border-t border-white/10 pt-4 text-[9px] text-slate-300 leading-relaxed font-sans relative">
            <div>Módulo Punto de Venta</div>
            <div>Pos Venta Version : 3.7</div>
            <div>Derechos Reservados : 2027</div>
          </div>
        </div>

        {/* RIGHT SIDEBAR PANEL: 65% Width cashier background */}
        <div 
          className="hidden md:block md:w-[65%] h-full bg-cover bg-center relative"
          style={{ backgroundImage: `url('/cashier.png')` }}
        >
          <div className="absolute inset-0 bg-slate-900/10"></div>
        </div>
      </div>
    );
  }

  // DESKTOP NATIVE COMPACT LOGIN LAYOUT (100% Window, zero outer margins or dark backdrop)
  return (
    <div className="flex h-screen w-screen select-none overflow-hidden font-mono text-white bg-[#184675] relative">
      
      {/* LEFT PANEL: 42% Width */}
      <div className="w-full md:w-[42%] h-full bg-[#184675] flex flex-col justify-between p-6 relative z-20 shadow-2xl border-r border-slate-700/30">

        {/* Top Bar: Station & Network Button */}
        <div className="flex justify-between items-center text-[10px] text-slate-200 font-sans">
          <span className="font-mono uppercase font-bold tracking-wider text-slate-300">
            ESTACIÓN: {localStorage.getItem('pos_terminal_name') || 'CAJA_01'}
          </span>
          <div className="flex items-center gap-2">
            {onOpenLicenseModal && (
              <button 
                type="button"
                onClick={onOpenLicenseModal}
                className="text-emerald-300 hover:text-white px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/30 transition-all font-mono text-[9px] flex items-center gap-1 cursor-pointer"
                title="Consultar o renovar información de licencia (F9)"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Licencia (F9)</span>
              </button>
            )}
            <button 
              type="button"
              onClick={() => setShowConfig(prev => !prev)}
              className="text-slate-300 hover:text-white p-1 rounded hover:bg-white/10"
              title="Ajustes de Red LAN"
            >
              <Network className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Contents: Logo, Title, Inputs */}
        <div className="space-y-3.5 my-auto">
          
          {/* Logo Star / Custom Image */}
          <div className="text-center cursor-pointer" onClick={handleLogoClick}>
            {companyConfig?.logo_url ? (
              <div className="w-20 h-20 mx-auto rounded-2xl bg-white/10 p-2 border border-white/20 shadow-xl flex items-center justify-center backdrop-blur-sm">
                <img src={companyConfig.logo_url} alt="Logo" className="w-full h-full object-contain" />
              </div>
            ) : (
              <svg className="w-20 h-20 mx-auto drop-shadow-lg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 15,65 C 32,80 68,80 85,65" stroke="#14b8a6" strokeWidth="3" fill="none" strokeLinecap="round" />
                <path d="M 8,58 C 28,78 72,78 92,58" stroke="#0ea5e9" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                <path d="M 22,71 C 37,84 63,84 78,71" stroke="#6366f1" strokeWidth="2" fill="none" strokeLinecap="round" />
                
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
            )}

            <h1 className="text-base font-black text-yellow-400 tracking-wider mt-2 font-sans uppercase">
              {companyConfig.nombre_comercio?.trim() !== '' ? companyConfig.nombre_comercio : 'WinterPOS'}
            </h1>
            <p className="text-[10px] text-slate-200 font-sans tracking-widest mt-0.5">
              Bienvenido
            </p>
          </div>

          {/* Session Notice Dialog */}
          {sessionNotice && (
            <div className="bg-amber-950/80 border border-amber-500/60 text-amber-200 px-3 py-1.5 rounded text-[11px] font-sans flex items-start gap-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <span className="font-semibold">{sessionNotice}</span>
            </div>
          )}

          {/* Error Dialog */}
          {errorMsg && (
            <div className="bg-red-950/80 border border-red-800/60 text-red-200 px-3 py-1.5 rounded text-[11px] font-sans flex items-start gap-1.5 animate-pulse">
              <Shield className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Configuration mode vs standard login */}
          {!showConfig ? (
            <form className="space-y-3" onSubmit={handleSubmit}>
              
              {/* Usuario Input */}
              <div className="space-y-1">
                <div className="relative">
                  <input
                    ref={usernameInputRef}
                    autoFocus
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    placeholder="Usuario"
                    className="w-full bg-white text-slate-900 border-none rounded px-3 py-2 text-xs font-sans pr-8 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 font-bold shadow-inner"
                    disabled={isLoading}
                  />
                  <span className="absolute right-2.5 top-2.5 text-yellow-500 text-[10px]">◀</span>
                </div>
              </div>

              {/* Contraseña Input */}
              <div className="space-y-1">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value.toLowerCase())}
                    placeholder="Contraseña"
                    className="w-full bg-white text-slate-900 border-none rounded px-3 py-2 text-xs font-sans pr-12 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 font-bold shadow-inner"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-7 top-2 text-slate-400 hover:text-slate-650 outline-none z-10"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <span className="absolute right-2.5 top-2.5 text-yellow-500 text-[10px]">◀</span>
                </div>
              </div>

              {/* Login submit button - dark navy */}
              <button
                type="submit"
                className="w-full bg-[#0a325c] hover:bg-[#072444] active:scale-[0.99] text-white py-2.5 rounded text-xs font-black tracking-wider transition-all duration-200 border border-slate-600/40 flex items-center justify-center gap-2 font-sans shadow-md"
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
            <form className="space-y-2 bg-[#0d345e] p-3 rounded border border-yellow-500/30 shadow-inner" onSubmit={handleSaveConfig}>
              <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
                <span className="text-[10px] text-yellow-400 font-bold flex items-center gap-1">
                  <Network className="w-3 h-3 text-yellow-400" />
                  AJUSTES DE RED LAN
                </span>
                <button
                  type="button"
                  onClick={() => setShowConfig(false)}
                  className="text-slate-300 text-xs hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-1.5 text-[10px]">
                <div>
                  <label className="text-slate-200 block mb-0.5 font-sans font-bold">Identificador de Estación / Caja</label>
                  <input
                    type="text"
                    value={terminalNameState}
                    onChange={(e) => setTerminalNameState(e.target.value.toUpperCase())}
                    placeholder="Ej: CAJA_01, CAJA_02, MOSTRADOR"
                    className="w-full bg-[#08284c] border border-slate-600 rounded p-1 text-yellow-400 font-bold uppercase outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-200 block mb-0.5 font-sans">Origen de Datos</label>
                  <select
                    value={dbMode}
                    onChange={(e) => setDbMode(e.target.value)}
                    className="w-full bg-[#08284c] border border-slate-600 text-white rounded p-1 outline-none"
                  >
                    <option value="local">Esta Computadora (Local)</option>
                    <option value="remote">Otra Computadora (Red LAN)</option>
                  </select>
                </div>
                
                {dbMode === 'remote' && (
                  <div className="grid grid-cols-3 gap-1">
                    <div className="col-span-2">
                      <label className="text-slate-200 block mb-0.5 font-sans">IP Servidor</label>
                      <input
                        type="text"
                        value={serverIP}
                        onChange={(e) => setServerIP(e.target.value)}
                        placeholder="192.168.1.100"
                        className="w-full bg-[#08284c] border border-slate-600 rounded p-1 text-yellow-400 outline-none font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-slate-200 block mb-0.5 font-sans">Puerto</label>
                      <input
                        type="text"
                        value={serverPort}
                        onChange={(e) => setServerPort(e.target.value)}
                        placeholder="5000"
                        className="w-full bg-[#08284c] border border-slate-600 rounded p-1 text-yellow-400 outline-none font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-[#08284c] hover:bg-[#061f3b] text-white py-1.5 rounded text-[10px] font-bold font-sans tracking-wide transition-all border border-slate-600"
              >
                GUARDAR Y RECONECTAR
              </button>
            </form>
          )}

        </div>

        {/* Footer brand info */}
        <div className="text-center space-y-0.5 border-t border-white/10 pt-2.5 text-[9px] text-slate-300 leading-relaxed font-sans relative">
          <div>Módulo Punto de Venta</div>
          <div>Pos Venta Version : 3.7</div>
          <div>Derechos Reservados : 2027</div>
          
          {/* Circle X icon bottom right style */}
          <div 
            className="absolute bottom-0 right-0 text-white/80 hover:text-white transition-all cursor-pointer p-1" 
            onClick={() => window.close()}
            title="Cerrar aplicación"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

      </div>

      {/* RIGHT PANEL: 58% Width cashier background */}
      <div 
        className="hidden md:block md:w-[58%] h-full bg-cover bg-center relative"
        style={{ backgroundImage: `url('/cashier.png')` }}
      >
        <div className="absolute inset-0 bg-slate-900/10"></div>
      </div>

    </div>
  );
}

