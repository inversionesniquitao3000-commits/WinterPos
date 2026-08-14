import { useState, useEffect } from 'react';
import { CompanyConfig, User, Role, PrinterConfig, ScaleConfig } from '../types';
import { 
  Save, CheckCircle2, Users, HardDrive, Cpu, 
  Trash2, Edit, Plus, Download, Upload, ShieldAlert,
  Settings, CheckSquare, Square, Globe, ShieldCheck, Printer, FileText,
  LogOut, Unplug, KeyRound, Lock, Eye, EyeOff, DollarSign,
  RefreshCw, Unlock, RotateCcw, AlertTriangle
} from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { getLocalDateStr } from '../utils';
import { MasterPassModal } from './MasterPassModal';

interface ConfiguracionEmpresaProps {
  config: CompanyConfig;
  onSaveConfig: (newConfig: CompanyConfig) => void;
  currentUser: User;
  getApiUrl: (path: string) => string;
  onReloadUsers?: () => void;
  onWipeData?: (mode: 'inventory' | 'sales' | 'clients' | 'all' | 'stock' | 'client_balances' | 'accionistas') => void;
}

const MODULOS_PERMISOS = [
  { id: 'caja', label: 'F1 Caja / POS' },
  { id: 'inventario', label: 'F2 Inventario' },
  { id: 'ventas', label: 'F3 Historial Ventas' },
  { id: 'clientes', label: 'F4 Clientes' },
  { id: 'proveedores', label: 'F5 Proveedores & Compras' },
  { id: 'tasa', label: 'F9 Tasa de Cambio' },
  { id: 'config', label: 'F10 Configuración' }
];

const ACCIONES_PERMISOS = [
  { id: 'ver', label: 'Ver' },
  { id: 'crear', label: 'Crear' },
  { id: 'editar', label: 'Editar' },
  { id: 'eliminar', label: 'Eliminar' }
];

const MODULE_GUIDES_MAP: Record<string, { title: string; ver: string; crear: string; editar: string; eliminar: string }> = {
  caja: {
    title: 'F1 CAJA / POS',
    ver: 'Consulta de precios y búsqueda de productos',
    crear: 'Procesar ventas, aperturar turno y cobros (Efectivo, PM, Zelle, Tarjeta)',
    editar: 'Descuentos especiales, Entradas/Salidas de dinero y Pausar compras',
    eliminar: 'Devolución de productos, anulación de ítems y Cierre de Caja'
  },
  inventario: {
    title: 'F2 INVENTARIO',
    ver: 'Ver catálogo de productos y existencias',
    crear: 'Agregar producto, Carga por Factura y Carga Masiva (PDF/CSV)',
    editar: 'Editar Precios, Modificar Producto, Ajuste General, Ajuste Masivo Stock',
    eliminar: 'Eliminar productos del catálogo (requiere existencia 0)'
  },
  ventas: {
    title: 'F3 HISTORIAL VENTAS',
    ver: 'Ver histórico de facturas, ventas pasadas y cierres',
    crear: 'Exportar reportes de ventas a PDF / Excel',
    editar: 'Reimprimir comprobantes y ver detalle de costos/utilidades',
    eliminar: 'Anular facturas o ventas procesadas'
  },
  clientes: {
    title: 'F4 CLIENTES',
    ver: 'Ver catálogo y directorio de clientes',
    crear: 'Registrar nuevo cliente',
    editar: 'Modificar datos del cliente, límite de crédito y registrar Abonos',
    eliminar: 'Eliminar cliente de la base de datos (requiere saldo 0)'
  },
  proveedores: {
    title: 'F5 PROVEEDORES & COMPRAS',
    ver: 'Ver catálogo de proveedores, compras, Cuentas por Pagar y cotizaciones',
    crear: 'Registrar proveedor, recibir compras y solicitar cotizaciones',
    editar: 'Modificar datos, abonar/pagar a cuentas por pagar y convertir cotizaciones a compra',
    eliminar: 'Eliminar proveedores (sin saldo deudor), cancelar cotizaciones'
  },
  tasa: {
    title: 'F9 TASA DE CAMBIO',
    ver: 'Ver tasa activa y tabla de historial',
    crear: 'Registrar actualización de tasa',
    editar: 'Cambiar tasa activa o alternar modo (Manual / Auto BCV)',
    eliminar: 'Eliminar registros del historial de tasas'
  },
  config: {
    title: 'F10 CONFIGURACIÓN',
    ver: 'Consultar información de la empresa',
    crear: 'Crear nuevos Usuarios y Perfiles de Rol',
    editar: 'Modificar RIF, Nombre, Impresoras, Básculas e Integración WhatsApp',
    eliminar: 'Desconectar sesiones activas en red y borrar perfiles/usuarios'
  }
};

const DEFAULT_WA_TEMPLATE = `📊 *REPORTE DE ARQUEO Y CIERRE DE CAJA*

📅 *Fecha:* {fecha}
👤 *Cajero:* {usuario}
🖥️ *Terminal:* {terminal}

💵 *EFECTIVO ESPERADO EN GAVETA:*
• Dólares (USD): $ {dineroEnCajaExpected}
• Bolívares (VES): Bs {expectedVes}

📥 *EFECTIVO FÍSICO RECIBIDO:*
• Dólares (USD): $ {realUsd}
• Bolívares (VES): Bs {realVes}

⚖️ *DIFERENCIA (BALANCE):*
• Dólares (USD): {diffUsd}
• Bolívares (VES): {diffVes}

🛍️ *VENTAS TOTALES DEL TURNO:* $ {ventaTotalUsd} USD
📉 *DESCUENTOS APLICADOS:* $ {descuentosUsd} USD

*WinterPosAL Cloud System*`;

const DEFAULT_UTILIDADES_WA_TEMPLATE = `💼 *REPORTE DE UTILIDADES Y GASTOS OPERATIVOS*
🏬 *{empresa}*
📅 *Fecha:* {fecha}
💱 *Tasa BCV:* {tasaBcv} Bs/USD

📊 *RESUMEN FINANCIERO:*
📈 *Utilidad Bruta:* ${'{utilidadBrutaUsd}'} USD | Bs {utilidadBrutaVes} VES
🔻 *(-) Gastos Deducibles:* -${'{totalGastosUsd}'} USD | -Bs {totalGastosVes} VES
💰 *(=) Utilidad Neta Distribuable:* *${'{utilidadNetaUsd}'} USD* | *Bs {utilidadNetaVes} VES*

📝 *DESGLOSE DE GASTOS OPERATIVOS ({cantGastos}):*
{desgloseGastos}

👥 *MONTO A COBRAR POR ACCIONISTA:*
{desgloseAccionistas}`;

export default function ConfiguracionEmpresa({ 
  config, 
  onSaveConfig, 
  currentUser, 
  getApiUrl, 
  onReloadUsers,
  onWipeData
}: ConfiguracionEmpresaProps) {
  const { showAlert, showConfirm } = useDialog();
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'empresa' | 'usuarios' | 'perifericos' | 'db' | 'whatsapp'>('empresa');
  const [subTabUsers, setSubTabUsers] = useState<'users' | 'roles' | 'sesiones' | 'politicas' | 'masterpass'>('users');
  const [showMasterPassModal, setShowMasterPassModal] = useState(false);
  const [dbUnlocked, setDbUnlocked] = useState(false);
  // Master Pass state
  const [mpCurrentPass, setMpCurrentPass] = useState('');
  const [mpNewPass, setMpNewPass] = useState('');
  const [mpConfirmPass, setMpConfirmPass] = useState('');
  const [mpShowCurrent, setMpShowCurrent] = useState(false);
  const [mpShowNew, setMpShowNew] = useState(false);
  const [mpMessage, setMpMessage] = useState<{type: 'success' | 'error'; text: string} | null>(null);
  const [mpLoading, setMpLoading] = useState(false);
  const [activeSessionsList, setActiveSessionsList] = useState<any[]>([]);
  const [activeGuideModule, setActiveGuideModule] = useState<string>('inventario');
  const [onlyClientBalances, setOnlyClientBalances] = useState(false);

  const fetchActiveSessions = async () => {
    try {
      const res = await fetch(getApiUrl('/users/active-sessions'));
      if (res.ok) {
        const data = await res.json();
        setActiveSessionsList(data);
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (subTabUsers === 'sesiones') {
      fetchActiveSessions();
      const interval = setInterval(fetchActiveSessions, 5000);
      return () => clearInterval(interval);
    }
  }, [subTabUsers]);

  const handleForceDisconnectSession = async (userId: number | string, username: string) => {
    const ok = await showConfirm(
      `¿Desea desconectar la reserva de sesión en red de "${username}"? (Se liberará el registro de la terminal para permitir reconexión sin cerrar la aplicación del usuario).`,
      'Desconectar Terminal de Red',
      { confirmLabel: 'Desconectar Terminal', isDanger: false }
    );
    if (ok) {
      try {
        await fetch(getApiUrl(`/users/active-sessions/${userId}`), { method: 'DELETE' });
        setSuccessMsg(`Registro de red de ${username} liberado correctamente.`);
        setTimeout(() => setSuccessMsg(''), 4000);
        fetchActiveSessions();
      } catch (_) {
        setErrorMsg('Error al intentar liberar la sesión.');
        setTimeout(() => setErrorMsg(''), 4000);
      }
    }
  };

  const handleForceLogoutSession = async (userId: number | string, username: string) => {
    const ok = await showConfirm(
      `¿Desea expulsar a "${username}" del sistema? Su sesión será cerrada de inmediato y será enviado a la pantalla de login.`,
      'Expulsar y Cerrar Sesión',
      { confirmLabel: 'Expulsar Usuario (Logout)', isDanger: true }
    );
    if (ok) {
      try {
        await fetch(getApiUrl(`/users/force-logout/${userId}`), { method: 'POST' });
        setSuccessMsg(`Usuario ${username} expulsado del sistema correctamente.`);
        setTimeout(() => setSuccessMsg(''), 4000);
        fetchActiveSessions();
      } catch (_) {
        setErrorMsg('Error al intentar expulsar al usuario.');
        setTimeout(() => setErrorMsg(''), 4000);
      }
    }
  };
  
  // WhatsApp bot states
  const [waConfig, setWaConfig] = useState({
    enabled: false,
    groupId: '',
    groupName: 'Grupo de Cierres POS',
    messageTemplate: '',
    utilidadesMessageTemplate: ''
  });
  const [waTemplateTab, setWaTemplateTab] = useState<'cierre' | 'utilidades'>('cierre');
  const [waStatus, setWaStatus] = useState<any>({
    status: 'DISCONNECTED',
    qr: '',
    isMock: false,
    detectedChromePath: '',
    lastError: null
  });
  const [isWaLoading, setIsWaLoading] = useState(false);
  const [isInstallingChrome, setIsInstallingChrome] = useState(false);
  const [isUnlockingSession, setIsUnlockingSession] = useState(false);
  const [isResettingSession, setIsResettingSession] = useState(false);
  const [isRestartingWa, setIsRestartingWa] = useState(false);
  const [isLoggingOutWa, setIsLoggingOutWa] = useState(false);
  
  // Success states
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Tab Empresa - States
  const [formData, setFormData] = useState<CompanyConfig>(() => ({
    ...config,
    permitir_multisesion: config.permitir_multisesion !== false,
    compartir_apertura_caja: config.compartir_apertura_caja !== false
  }));

  useEffect(() => {
    setFormData({
      ...config,
      permitir_multisesion: config.permitir_multisesion !== false,
      compartir_apertura_caja: config.compartir_apertura_caja !== false
    });
  }, [config]);

  // 2. Tab Usuarios & Roles - States
  const [userList, setUserList] = useState<User[]>([]);
  const [roleList, setRoleList] = useState<Role[]>([]);
  
  // User Modal / Form States
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    usuario: '',
    nombre: '',
    rol: 'vendedor',
    clave: 'admin',
    estado: 'Activo' as 'Activo' | 'Inactivo',
    permisos: {} as any
  });

  // Role Modal / Form States
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({
    nombre: '',
    permisos: {} as any
  });

  // 3. Tab Perifericos - States
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(() => {
    const saved = localStorage.getItem('pos_printer_config');
    return saved ? JSON.parse(saved) : {
      puerto: 'SISTEMA',
      ipAddress: '',
      anchoPapel: '80mm',
      cortarAutomatico: true,
      copiaTicket: false
    };
  });
  const [scaleConfig, setScaleConfig] = useState<ScaleConfig>(() => {
    const saved = localStorage.getItem('pos_scale_config');
    return saved ? JSON.parse(saved) : {
      puerto: 'MANUAL',
      baudRate: 9600,
      protocolo: 'CAS',
      taraPrevia: 0
    };
  });
  const [fiscalPrinterConfig, setFiscalPrinterConfig] = useState<{
    modelo: string;
    puerto: string;
    baudRate: number;
    serialMaquina: string;
    ipSpooler: string;
    reporteZAutomatico: boolean;
    imprimirIgtf: boolean;
    exigirRifCliente: boolean;
    imprimirCopiaFiscal: boolean;
    estadoFiscal: string;
  }>(() => {
    const saved = localStorage.getItem('pos_fiscal_printer_config');
    return saved ? JSON.parse(saved) : {
      modelo: 'HKA_FACTORY',
      puerto: 'COM1',
      baudRate: 9600,
      serialMaquina: '',
      ipSpooler: '127.0.0.1:8080',
      reporteZAutomatico: true,
      imprimirIgtf: true,
      exigirRifCliente: true,
      imprimirCopiaFiscal: false,
      estadoFiscal: 'ACTIVA'
    };
  });

  // 4. Tab Base de Datos - States
  const [dbConfirmWord, setDbConfirmWord] = useState('');
  const [dbBackupSchedule, setDbBackupSchedule] = useState(() => {
    return localStorage.getItem('pos_backup_schedule') || 'Diario';
  });
  const [backupHour, setBackupHour] = useState(() => {
    return localStorage.getItem('pos_backup_hour') || '02:00';
  });
  const [backupSpecificDate, setBackupSpecificDate] = useState(() => {
    return localStorage.getItem('pos_backup_specific_date') || '';
  });
  const [backupDir, setBackupDir] = useState(() => {
    return localStorage.getItem('pos_backup_dir') || '';
  });

  useEffect(() => {
    if (activeTab === 'db') {
      fetch(getApiUrl('/db/backup/schedule'))
        .then(res => res.json())
        .then(data => {
          if (data) {
            if (data.schedule) setDbBackupSchedule(data.schedule);
            if (data.hour) setBackupHour(data.hour);
            if (data.specificDate) setBackupSpecificDate(data.specificDate);
            if (data.backupDir) {
              setBackupDir(data.backupDir);
              localStorage.setItem('pos_backup_dir', data.backupDir);
            } else if (data.defaultBackupDir) {
              setBackupDir(data.defaultBackupDir);
            }
          }
        })
        .catch(_ => {});
    }
  }, [activeTab]);

  // Fetch users & roles list
  const fetchUsersAndRoles = async () => {
    try {
      const resUsers = await fetch(getApiUrl('/users'));
      if (resUsers.ok) {
        const uData = await resUsers.json();
        setUserList(uData);
      }
      const resRoles = await fetch(getApiUrl('/roles'));
      if (resRoles.ok) {
        const rData = await resRoles.json();
        setRoleList(rData);
      }
    } catch (err) {
      console.error('Error fetching users and roles:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'usuarios') {
      fetchUsersAndRoles();
    }
  }, [activeTab]);

  const fetchWaStatus = async () => {
    try {
      const res = await fetch(getApiUrl('/whatsapp/status'));
      if (res.ok) {
        const data = await res.json();
        setWaStatus(data);
        if (data.config) {
          setWaConfig({
            ...data.config,
            messageTemplate: data.config.messageTemplate || DEFAULT_WA_TEMPLATE,
            utilidadesMessageTemplate: data.config.utilidadesMessageTemplate || DEFAULT_UTILIDADES_WA_TEMPLATE
          });
        }
      }
    } catch (err) {
      console.error('Error fetching WhatsApp status:', err);
    }
  };

  const fetchWaStatusOnly = async () => {
    try {
      const res = await fetch(getApiUrl('/whatsapp/status'));
      if (res.ok) {
        const data = await res.json();
        setWaStatus(data);
      }
    } catch (err) {
      console.error('Error fetching WhatsApp status:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'whatsapp') {
      fetchWaStatus();
      const interval = setInterval(fetchWaStatusOnly, 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const handleSaveWaConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsWaLoading(true);
    try {
      const res = await fetch(getApiUrl('/whatsapp/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(waConfig)
      });
      if (res.ok) {
        showToast('Configuración de WhatsApp guardada con éxito.');
        fetchWaStatus();
      } else {
        showAlert('Error al guardar configuración de WhatsApp en el servidor.', 'Error', 'error');
      }
    } catch (err) {
      console.error(err);
      showAlert('Error de conexión con el servidor.', 'Error de Conexión', 'error');
    } finally {
      setIsWaLoading(false);
    }
  };

  const handleSendTestMessage = async () => {
    try {
      const testMsg = `🧪 *WinterPosAL - Mensaje de Prueba*\n\nConexión de WhatsApp activa.\n\n*Fecha:* ${new Date().toLocaleDateString()}\n*Hora:* ${new Date().toLocaleTimeString()}\n*Usuario:* ${currentUser.nombre}`;
      const res = await fetch(getApiUrl('/whatsapp/send-cierre'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', // 1px transparent png
          textSummary: testMsg
        })
      });
      if (res.ok) {
        showAlert('Mensaje de prueba enviado con éxito al grupo.', 'Mensaje Enviado', 'success');
      } else {
        const data = await res.json();
        showAlert(`Error al enviar mensaje de prueba: ${data.error || 'Falla desconocida'}`, 'Error al Enviar', 'error');
      }
    } catch (err: any) {
      showAlert(`Error de red: ${err.message}`, 'Error de Conexión', 'error');
    }
  };

  const handleUnlockSession = async () => {
    try {
      setIsUnlockingSession(true);
      showToast('Desbloqueando procesos y liberando bloqueos de WhatsApp...');
      const res = await fetch(getApiUrl('/whatsapp/unlock-session'), { method: 'POST' });
      if (res.ok) {
        showAlert('Se cerraron los procesos huérfanos de Chrome en segundo plano y se liberaron los archivos de bloqueo. El servicio de WhatsApp se reinició limpiamente.', 'Sesión Desbloqueada', 'success');
        fetchWaStatus();
      } else {
        let errMsg = 'Desconocido';
        try {
          const text = await res.text();
          try {
            const json = JSON.parse(text);
            errMsg = json.error || json.message || text;
          } catch {
            errMsg = text || `Error HTTP ${res.status}`;
          }
        } catch {
          errMsg = `Error HTTP ${res.status}`;
        }
        showAlert(`Error al desbloquear: ${errMsg}`, 'Error de Desbloqueo', 'error');
      }
    } catch (err: any) {
      showAlert(`Error de red: ${err.message}`, 'Error de Conexión', 'error');
    } finally {
      setIsUnlockingSession(false);
    }
  };

  const handleResetSession = async () => {
    const ok = await showConfirm(
      '¿Está seguro de restablecer por completo la sesión de WhatsApp?\n\nEsta acción cerrará todos los procesos de fondo, eliminará archivos de sesión temporales y generará un nuevo código QR limpio en pantalla para vincular con su teléfono.',
      'Restablecer Sesión y Nuevo QR',
      { confirmLabel: 'Sí, Restablecer y Generar QR', isDanger: true }
    );
    if (!ok) return;

    try {
      setIsResettingSession(true);
      showToast('Limpiando sesión anterior y generando código QR fresco...');
      const res = await fetch(getApiUrl('/whatsapp/reset-session'), { method: 'POST' });
      if (res.ok) {
        showAlert('Sesión eliminada completamente. El sistema está generando un nuevo código QR limpio para vincular con su teléfono.', 'Sesión Restablecida', 'success');
        fetchWaStatus();
      } else {
        let errMsg = 'Desconocido';
        try {
          const text = await res.text();
          try {
            const json = JSON.parse(text);
            errMsg = json.error || json.message || text;
          } catch {
            errMsg = text || `Error HTTP ${res.status}`;
          }
        } catch {
          errMsg = `Error HTTP ${res.status}`;
        }
        showAlert(`Error al restablecer: ${errMsg}`, 'Error', 'error');
      }
    } catch (err: any) {
      showAlert(`Error de red: ${err.message}`, 'Error de Conexión', 'error');
    } finally {
      setIsResettingSession(false);
    }
  };

  const handleLogoutWa = async () => {
    const ok = await showConfirm(
      '¿Desea cerrar la sesión de WhatsApp vinculada en este sistema?\n\nEl bot se desconectará y dejará de enviar reportes hasta que vuelva a escanear el código QR.',
      'Cerrar Sesión de WhatsApp',
      { confirmLabel: 'Cerrar Sesión (Logout)', isDanger: true }
    );
    if (!ok) return;

    try {
      setIsLoggingOutWa(true);
      showToast('Cerrando sesión de WhatsApp...');
      const res = await fetch(getApiUrl('/whatsapp/logout'), { method: 'POST' });
      if (res.ok) {
        showAlert('Sesión de WhatsApp cerrada exitosamente. Ahora puede volver a vincular un teléfono escaneando el código QR.', 'Desvinculado', 'success');
        fetchWaStatus();
      } else {
        let errMsg = 'Desconocido';
        try {
          const text = await res.text();
          try {
            const json = JSON.parse(text);
            errMsg = json.error || json.message || text;
          } catch {
            errMsg = text || `Error HTTP ${res.status}`;
          }
        } catch {
          errMsg = `Error HTTP ${res.status}`;
        }
        showAlert(`Error al cerrar sesión: ${errMsg}`, 'Error', 'error');
      }
    } catch (err: any) {
      showAlert(`Error de red: ${err.message}`, 'Error de Conexión', 'error');
    } finally {
      setIsLoggingOutWa(false);
    }
  };

  const handleRestartWa = async () => {
    try {
      setIsRestartingWa(true);
      showToast('Reiniciando servicio de WhatsApp...');
      const res = await fetch(getApiUrl('/whatsapp/restart'), { method: 'POST' });
      if (res.ok) {
        showToast('Motor de WhatsApp reiniciado con éxito.');
        fetchWaStatus();
      } else {
        let errMsg = 'Desconocido';
        try {
          const text = await res.text();
          try {
            const json = JSON.parse(text);
            errMsg = json.error || json.message || text;
          } catch {
            errMsg = text || `Error HTTP ${res.status}`;
          }
        } catch {
          errMsg = `Error HTTP ${res.status}`;
        }
        showAlert(`Error al reiniciar: ${errMsg}`, 'Error', 'error');
      }
    } catch (err: any) {
      showAlert(`Error de red: ${err.message}`, 'Error de Conexión', 'error');
    } finally {
      setIsRestartingWa(false);
    }
  };

  // Listener for Escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowUserModal(false);
        setShowRoleModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initial clean permissions matrix
  const getEmptyPerms = () => {
    const p: any = {};
    MODULOS_PERMISOS.forEach(m => {
      p[m.id] = { ver: false, crear: false, editar: false, eliminar: false };
    });
    return p;
  };

  // Empresa Handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePaymentToggle = (method: string) => {
    setFormData(prev => {
      const active = prev.metodos_pago_activos.includes(method)
        ? prev.metodos_pago_activos.filter(m => m !== method)
        : [...prev.metodos_pago_activos, method];
      return { ...prev, metodos_pago_activos: active };
    });
  };

  const handleSaveEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(getApiUrl('/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        const saved = await res.json();
        onSaveConfig(saved);
      } else {
        onSaveConfig(formData);
      }
    } catch {
      // Sin conexión al backend: guardar localmente igual
      onSaveConfig(formData);
    }
    showToast('Configuración comercial actualizada correctamente.');
  };

  const handleSavePoliticasDirect = async (updatedConfig: CompanyConfig) => {
    try {
      const res = await fetch(getApiUrl('/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
      });
      if (res.ok) {
        const saved = await res.json();
        onSaveConfig(saved);
      } else {
        onSaveConfig(updatedConfig);
      }
    } catch {
      onSaveConfig(updatedConfig);
    }
    showToast('Políticas de multisesión actualizadas correctamente.');
  };

  // User Handlers
  const handleOpenNewUser = () => {
    setEditingUser(null);
    setUserForm({
      usuario: '',
      nombre: '',
      rol: 'ADMINISTRADOR',
      clave: '',
      estado: 'Activo',
      permisos: getEmptyPerms()
    });
    // Default to admin permissions when starting new user form with ADMINISTRADOR role
    handleApplyRolePermissions('ADMINISTRADOR');
    setShowUserModal(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setUserForm({
      usuario: u.usuario,
      nombre: u.nombre,
      rol: u.rol?.toUpperCase() || 'ADMINISTRADOR',
      clave: u.clave || '',
      estado: u.estado,
      permisos: u.permisos || getEmptyPerms()
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.usuario.trim() || !userForm.nombre.trim()) {
      setErrorMsg('Usuario y nombre completo son requeridos.');
      return;
    }

    try {
      const body = {
        usuario: userForm.usuario.toLowerCase().trim(),
        nombre: userForm.nombre.trim(),
        rol: userForm.rol?.toUpperCase(),
        clave: userForm.clave,
        estado: userForm.estado,
        permisos: userForm.permisos
      };

      const url = editingUser ? getApiUrl(`/users/${editingUser.id}`) : getApiUrl('/users');
      const method = editingUser ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        showToast(editingUser ? 'Usuario actualizado con éxito.' : 'Usuario registrado con éxito.');
        setShowUserModal(false);
        fetchUsersAndRoles();
        if (onReloadUsers) onReloadUsers();
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Error al guardar el usuario.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Error de conexión al servidor.');
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (id === currentUser.id) {
      showAlert('No puedes eliminar tu propio usuario activo en sesión.', 'Operación No Permitida', 'warning');
      return;
    }
    const ok = await showConfirm(
      '¿Está seguro de eliminar de forma definitiva este usuario del sistema?',
      'Eliminar Usuario',
      { confirmLabel: 'Eliminar', isDanger: true }
    );
    if (!ok) return;

    try {
      const res = await fetch(getApiUrl(`/users/${id}`), { method: 'DELETE' });
      if (res.ok) {
        showToast('Usuario eliminado del sistema.');
        fetchUsersAndRoles();
        if (onReloadUsers) onReloadUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Role Handlers
  const handleOpenNewRole = () => {
    setEditingRole(null);
    setRoleForm({
      nombre: '',
      permisos: getEmptyPerms()
    });
    setShowRoleModal(true);
  };

  const handleOpenEditRole = (r: Role) => {
    setEditingRole({
      ...r,
      nombre: r.nombre?.toUpperCase()
    });
    setRoleForm({
      nombre: r.nombre?.toUpperCase(),
      permisos: r.permisos || getEmptyPerms()
    });
    setShowRoleModal(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.nombre.trim()) {
      setErrorMsg('El nombre del perfil es requerido.');
      return;
    }

    try {
      const body = {
        nombre: roleForm.nombre.trim().toUpperCase(),
        permisos: roleForm.permisos
      };

      const isVirtualAdmin = editingRole && editingRole.id === -1;
      const url = (editingRole && !isVirtualAdmin) ? getApiUrl(`/roles/${editingRole.id}`) : getApiUrl('/roles');
      const method = (editingRole && !isVirtualAdmin) ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        showToast(editingRole ? 'Perfil de rol actualizado con éxito.' : 'Perfil de rol registrado con éxito.');
        setShowRoleModal(false);
        fetchUsersAndRoles();
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Error al guardar el perfil.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Error de conexión al servidor.');
    }
  };

  const handleDeleteRole = async (id: number, roleName?: string) => {
    if (roleName?.trim().toUpperCase() === 'ADMINISTRADOR' || id === -1) {
      showAlert('El perfil Administrador es el rol base del sistema y no se puede eliminar.', 'Operación No Permitida', 'warning');
      return;
    }
    const ok = await showConfirm(
      '¿Está seguro de eliminar este perfil de rol? Los usuarios asignados a este rol perderán sus permisos.',
      'Eliminar Perfil de Rol',
      { confirmLabel: 'Eliminar', isDanger: true }
    );
    if (!ok) return;
    try {
      const res = await fetch(getApiUrl(`/roles/${id}`), { method: 'DELETE' });
      if (res.ok) {
        showToast('Perfil de rol eliminado.');
        fetchUsersAndRoles();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApplyRolePermissions = (roleName: string) => {
    if (roleName.trim().toUpperCase() === 'ADMINISTRADOR') {
      const adminRole = roleList.find(r => r.nombre.trim().toUpperCase() === 'ADMINISTRADOR');
      if (adminRole) {
        setUserForm(prev => ({
          ...prev,
          rol: 'ADMINISTRADOR',
          permisos: { ...adminRole.permisos }
        }));
      } else {
        const fullPerms: any = {};
        MODULOS_PERMISOS.forEach(m => {
          fullPerms[m.id] = { ver: true, crear: true, editar: true, eliminar: true, admin: true };
        });
        setUserForm(prev => ({
          ...prev,
          rol: 'ADMINISTRADOR',
          permisos: fullPerms
        }));
      }
      return;
    }

    const role = roleList.find(r => r.nombre.trim().toUpperCase() === roleName.trim().toUpperCase());
    if (role) {
      setUserForm(prev => ({
        ...prev,
        rol: role.nombre.toUpperCase(),
        permisos: { ...role.permisos }
      }));
    }
  };

  // Peripheral Handlers
  const handleSavePerifericos = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('pos_printer_config', JSON.stringify(printerConfig));
    localStorage.setItem('pos_scale_config', JSON.stringify(scaleConfig));
    showToast('Configuraciones de periféricos (básculas/impresoras) guardadas con éxito.');
  };

  const handleSaveFiscalPrinter = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('pos_fiscal_printer_config', JSON.stringify(fiscalPrinterConfig));
    showToast('✅ Configuración de Máquina Fiscal SENIAT guardada con éxito.');
  };

  const handleTestFiscalPrinter = () => {
    showToast('🧾 Conectando con Máquina Fiscal SENIAT... (Lectura X Solicitada)');
  };

  // DB Admin Handlers
  const handleWipeDb = async (mode: 'inventory' | 'sales' | 'clients' | 'all' | 'stock' | 'client_balances' | 'accionistas') => {
    if (!dbConfirmWord.trim().toUpperCase().includes('CONFIRMAR')) {
      showAlert('Debe escribir la palabra de seguridad "CONFIRMAR" para poder procesar la limpieza.', 'Palabra de Seguridad Incorrecta', 'error');
      return;
    }
    
    let confirmMsg = '';
    if (mode === 'inventory') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de vaciar TODO el inventario y catálogo de productos? Esta acción no se puede deshacer.';
    else if (mode === 'stock') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de poner a cero las existencias (stock) de todos los productos? El catálogo de productos y precios se conservará.';
    else if (mode === 'sales') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de vaciar el historial de ventas, correlativos de facturas y cierres de caja?';
    else if (mode === 'clients') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de vaciar la lista de clientes registrados?';
    else if (mode === 'client_balances') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de reiniciar a cero los saldos pendientes de los clientes y vaciar el historial de abonos? Se conservará la lista de clientes.';
    else if (mode === 'accionistas') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de vaciar el módulo de accionistas e inversiones? Todos los accionistas y montos ingresados quedarán en cero (0).';
    else if (mode === 'all') confirmMsg = '⚠️ ADVERTENCIA CRÍTICA: Se formateará e inicializará el sistema por completo. Todo quedará en blanco. ¿Continuar?';

    const ok = await showConfirm(confirmMsg, 'Confirmar Limpieza del Sistema', { confirmLabel: 'Sí, Limpiar', isDanger: true });
    if (!ok) return;

    const performLocalWipe = () => {
      onWipeData?.(mode);
      if (mode === 'inventory' || mode === 'all' || mode === 'stock') {
        localStorage.removeItem('pos_products');
        localStorage.removeItem('pos_price_history');
        localStorage.removeItem('pos_movements');
      }
      if (mode === 'sales' || mode === 'all') {
        localStorage.removeItem('pos_sales_log');
        localStorage.removeItem('pos_abonos');
        localStorage.removeItem('pos_shift_sales');
        localStorage.removeItem('pos_shift_abonos');
        localStorage.removeItem('pos_shift_entradas');
        localStorage.removeItem('pos_shift_entradas_ves');
        localStorage.removeItem('pos_shift_salidas');
        localStorage.removeItem('pos_shift_salidas_ves');
        localStorage.removeItem('pos_shift_devoluciones');
        localStorage.removeItem('pos_caja_abierta');
        localStorage.removeItem('pos_apertura_usd');
        localStorage.removeItem('pos_apertura_ves');
        localStorage.removeItem('pos_ventas_usd');
        localStorage.removeItem('pos_ventas_ves');
        localStorage.removeItem('pos_movimientos_usd');
        localStorage.removeItem('pos_movimientos_ves');
        localStorage.removeItem('pos_apertura_fecha');
        localStorage.removeItem('pos_movements');
        localStorage.removeItem('pos_price_history');
        localStorage.removeItem('pos_cierres_log');
      }
      if (mode === 'clients' || mode === 'all' || mode === 'client_balances') {
        localStorage.removeItem('pos_clients');
        localStorage.removeItem('pos_abonos');
        localStorage.removeItem('pos_shift_abonos');
      }
      if (mode === 'all') {
        localStorage.removeItem('pos_company_config');
        localStorage.removeItem('pos_users');
        localStorage.removeItem('pos_roles');
        localStorage.removeItem('pos_tasa_history');
        localStorage.removeItem('pos_accionistas');
        localStorage.removeItem('pos_inversiones');
      }

      showToast('Limpieza de base de datos ejecutada exitosamente.');
      setDbConfirmWord('');
      setTimeout(() => window.location.reload(), 500);
    };

    try {
      const res = await fetch(getApiUrl('/db/wipe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: mode,
          wipeInventory: mode === 'inventory' || mode === 'all',
          wipeSales: mode === 'sales' || mode === 'all',
          wipeClients: mode === 'clients' || mode === 'all',
          wipeClientBalancesOnly: mode === 'client_balances',
          wipeStock: mode === 'stock',
          wipeAccionistas: mode === 'accionistas' || mode === 'all',
          wipeRatesHistory: mode === 'all',
          wipeConfig: mode === 'all'
        })
      });

      if (res.ok) {
        performLocalWipe();
      } else {
        performLocalWipe();
      }
    } catch (err) {
      console.warn('Network error while connecting to server, executing local wipe fallback:', err);
      performLocalWipe();
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const res = await fetch(getApiUrl('/db/backup'));
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `winterpos_backup_${getLocalDateStr()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Respaldo de base de datos descargado con éxito.');
      }
    } catch (err) {
      console.error(err);
      showAlert('Error al generar copia de seguridad.', 'Error de Backup', 'error');
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ok = await showConfirm(
      '¿Está seguro de restaurar este respaldo? Se sobrescribirán todos los datos del sistema actual con los del archivo.',
      'Restaurar Backup',
      { confirmLabel: 'Sí, Restaurar', isDanger: true }
    );
    if (!ok) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      let parsed: any;
      try {
        parsed = JSON.parse(evt.target?.result as string);
      } catch (err) {
        showAlert('El archivo seleccionado no tiene un formato de respaldo JSON válido.', 'Archivo Inválido', 'error');
        return;
      }

      try {
        const res = await fetch(getApiUrl('/db/restore'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        });

        if (res.ok) {
          showToast('Base de datos restaurada correctamente. Recargando sistema...');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          const errData = await res.json().catch(() => ({}));
          showAlert(`Error del servidor al restaurar: ${errData.error || 'No se pudo procesar la restauración.'}`, 'Error de Importación', 'error');
        }
      } catch (err) {
        showAlert('No se pudo conectar con el servidor backend (Puerto 5000). Verifique que el servidor backend esté corriendo.', 'Error de Conexión', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleSaveBackupSchedule = async () => {
    if (dbBackupSchedule === 'Especifico' && !backupSpecificDate) {
      showAlert('Debe seleccionar una fecha específica para el respaldo.', 'Fecha Requerida', 'warning');
      return;
    }
    localStorage.setItem('pos_backup_schedule', dbBackupSchedule);
    localStorage.setItem('pos_backup_hour', backupHour);
    localStorage.setItem('pos_backup_specific_date', backupSpecificDate);
    if (backupDir) localStorage.setItem('pos_backup_dir', backupDir);

    try {
      const res = await fetch(getApiUrl('/db/backup/schedule'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          schedule: dbBackupSchedule, 
          hour: backupHour, 
          specificDate: backupSpecificDate,
          backupDir: backupDir 
        })
      });
      if (res.ok) {
        const scheduleLabel = dbBackupSchedule === 'Especifico'
          ? `fecha ${backupSpecificDate} a las ${backupHour}`
          : `${dbBackupSchedule} a las ${backupHour}`;
        showToast(`✅ Respaldo automático programado: ${scheduleLabel}`);
      } else {
        showAlert('Error al programar frecuencia en el servidor.', 'Error de Programación', 'error');
      }
    } catch (e) {
      console.error(e);
      showAlert('Error de conexión con el servidor.', 'Error de Conexión', 'error');
    }
  };

  // Helper Toast
  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Payment method dictionary helper
  const paymentMethods = [
    { id: 'efectivo_usd', label: 'Efectivo $' },
    { id: 'efectivo_ves', label: 'Efectivo Bs' },
    { id: 'tarjeta_ves', label: 'Tarjeta de Débito Bs' },
    { id: 'tarjeta_usd', label: 'Tarjeta $ (USD)' },
    { id: 'pago_movil', label: 'Pago Móvil Bs' },
    { id: 'biopago', label: 'Biopago Bs' },
    { id: 'binance', label: 'Binance $' },
    { id: 'paypal', label: 'PayPal $' },
    { id: 'credito', label: 'Crédito Cliente $' }
  ];

  const getTemplatePreview = (template: string) => {
    if (!template) return '';
    return template
      .replace(/{empresa}/g, config?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.')
      .replace(/{fecha}/g, new Date().toLocaleDateString())
      .replace(/{tasaBcv}/g, '87.00')
      .replace(/{utilidadBrutaUsd}/g, '293.84')
      .replace(/{utilidadBrutaVes}/g, '25.564,08')
      .replace(/{totalGastosUsd}/g, '82.00')
      .replace(/{totalGastosVes}/g, '7.134,00')
      .replace(/{utilidadNetaUsd}/g, '211.84')
      .replace(/{utilidadNetaVes}/g, '18.430,08')
      .replace(/{cantGastos}/g, '2')
      .replace(/{desgloseGastos}/g, '• *⚡ Luz / Electricidad:* $50.00 USD (Bs 4.350,00)\n• *💧 Agua:* $32.00 USD (Bs 2.784,00)')
      .replace(/{desgloseAccionistas}/g, '1. *JUAN PÉREZ* (50.00% Inv)\n   - Capital Invertido: $10,000.00 USD\n   - 💵 *Monto a Cobrar:* *$105.92 USD* | *Bs 9.215,04 VES*\n\n2. *MARÍA GÓMEZ* (50.00% Inv)\n   - Capital Invertido: $10,000.00 USD\n   - 💵 *Monto a Cobrar:* *$105.92 USD* | *Bs 9.215,04 VES*')
      .replace(/{usuario}/g, (currentUser?.nombre || 'ANDERSON LAGUNA').toUpperCase())
      .replace(/{terminal}/g, localStorage.getItem('pos_terminal_name') || 'CAJA_PRINCIPAL')
      .replace(/{dineroEnCajaExpected}/g, '150.00')
      .replace(/{expectedVes}/g, '129000.00')
      .replace(/{realUsd}/g, '150.00')
      .replace(/{realVes}/g, '129000.00')
      .replace(/{diffUsd}/g, '+$0.00 (Sobrante)')
      .replace(/{diffVes}/g, '+Bs 0.00 (Sobrante)')
      .replace(/{ventaTotalUsd}/g, '350.50')
      .replace(/{descuentosUsd}/g, '10.00');
  };

  const formatWhatsAppMessage = (text: string) => {
    if (!text) return '';
    let html = text.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    html = html.replace(/~(.*?)~/g, '<del>$1</del>');
    html = html.replace(/\n/g, '<br/>');
    return html;
  };

  const isAdmin = currentUser.rol.toLowerCase() === 'administrador';

  return (
    <div className="space-y-6 text-slate-800 font-mono text-xs">
      
      {/* HEADER */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-extrabold text-winter-configStart tracking-wider uppercase flex items-center gap-2">
          <Settings className="w-5 h-5 text-winter-configStart" />
          CONFIGURACIÓN GLOBAL Y ADMINISTRACIÓN
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-sans">
          Administre la empresa, controle la seguridad, perfiles, básculas e impresoras y realice mantenimiento a la base de datos.
        </p>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-250 text-emerald-700 px-4 py-3 rounded-lg text-xs flex items-center gap-2 font-sans transition-all">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* TOP TABS NAVIGATION */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveTab('empresa')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all ${
            activeTab === 'empresa'
              ? 'bg-white border-slate-200 text-winter-configStart font-sans'
              : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          Datos de la Empresa
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('usuarios')}
            className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all ${
              activeTab === 'usuarios'
                ? 'bg-white border-slate-200 text-winter-configStart font-sans'
                : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
            }`}
          >
            Usuarios y Roles
          </button>
        )}
        <button
          onClick={() => setActiveTab('perifericos')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all ${
            activeTab === 'perifericos'
              ? 'bg-white border-slate-200 text-winter-configStart font-sans'
              : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          Básculas e Impresoras
        </button>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (dbUnlocked) {
                  setActiveTab('db');
                } else {
                  setShowMasterPassModal(true);
                }
              }}
              className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all ${
                activeTab === 'db'
                  ? 'bg-white border-slate-200 text-winter-configStart font-sans'
                  : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
              }`}
            >
              Base de Datos
            </button>
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all ${
                activeTab === 'whatsapp'
                  ? 'bg-white border-slate-200 text-winter-configStart font-sans'
                  : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
              }`}
            >
              Integración WhatsApp
            </button>
          </div>
        )}
      </div>

      {/* TABS CONTAINER */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
        
        {/* TAB 1: EMPRESA */}
        {activeTab === 'empresa' && (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
            <form onSubmit={handleSaveEmpresa} className="xl:col-span-3 bg-white border border-slate-200 p-6 rounded-xl space-y-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-2 mb-2 flex items-center gap-2 font-sans">
                <Save className="w-4 h-4 text-winter-configStart" />
                Datos Básicos & Fiscales
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Nombre del Comercio</label>
                  <input
                    type="text"
                    name="nombre_comercio"
                    value={formData.nombre_comercio}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">RIF Comercial</label>
                  <input
                    type="text"
                    name="rif"
                    value={formData.rif}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-emerald-700 focus:bg-white focus:border-winter-configStart focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Teléfono</label>
                  <input
                    type="text"
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleInputChange}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Correo de Contacto</label>
                  <input
                    type="email"
                    name="correo"
                    value={formData.correo}
                    onChange={handleInputChange}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Dirección Comercial</label>
                <input
                  type="text"
                  name="direccion"
                  value={formData.direccion}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
                />
              </div>

              {/* LOGO DE LA EMPRESA */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 font-sans flex items-center gap-1.5">
                    🖼️ Logo Oficial de la Empresa
                  </label>
                  <span className="text-[10px] text-slate-400 font-sans">Afecta Login, Encabezados, Favicon y Tickets</span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm relative group">
                    {formData.logo_url ? (
                      <img src={formData.logo_url} alt="Logo Empresa" className="w-full h-full object-contain p-1" />
                    ) : (
                      <span className="text-2xl">🏢</span>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      name="logo_url"
                      value={formData.logo_url || ''}
                      onChange={handleInputChange}
                      placeholder="Pegue URL de la imagen o use el botón para subir archivo..."
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs text-slate-800 focus:border-winter-configStart focus:outline-none font-sans"
                    />

                    <div className="flex items-center gap-2">
                      <label className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-all shadow-xs">
                        <span>📁 Cargar Imagen Local</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 2 * 1024 * 1024) {
                                alert('La imagen es demasiado grande. Por favor seleccione una de máximo 2 MB.');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = (uploadEvent) => {
                                const base64 = uploadEvent.target?.result as string;
                                setFormData(prev => ({ ...prev, logo_url: base64 }));
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>

                      {formData.logo_url && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, logo_url: '' }))}
                          className="text-[11px] text-red-600 hover:text-red-800 font-bold px-2 py-1 rounded bg-red-50 hover:bg-red-100 transition-all"
                        >
                          Quitar Logo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <label className="text-xs font-bold text-slate-655 block font-sans">Métodos de Cobro Habilitados</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 font-sans">
                  {paymentMethods.map(method => {
                    const isActive = formData.metodos_pago_activos.includes(method.id);
                    return (
                      <button
                        type="button"
                        key={method.id}
                        onClick={() => handlePaymentToggle(method.id)}
                        className={`p-2.5 rounded border text-xs font-bold text-center transition-all ${
                          isActive
                            ? 'bg-emerald-50 border-emerald-250 text-emerald-700 shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-350'
                        }`}
                      >
                        {method.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <label className="text-xs text-slate-500 block mb-1 font-sans">Mensaje de Pie de Factura / Ticket</label>
                <textarea
                  name="mensaje_pie_ticket"
                  value={formData.mensaje_pie_ticket}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-winter-configStart hover:bg-winter-configEnd text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all shadow-sm"
              >
                GUARDAR PARAMETRIZACIÓN GLOBAL
              </button>
            </form>

            <div className="xl:col-span-2 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest block font-sans">
                Vista Previa de Ticket Fiscal Digital
              </h3>
              <div className="bg-white border border-slate-250 rounded-xl p-5 shadow-sm max-w-sm mx-auto space-y-3 font-mono text-[9px] text-slate-900 select-none">
                <div className="text-center">
                  <h4 className="font-extrabold text-sm uppercase tracking-wide">{formData.nombre_comercio || 'NOMBRE COMERCIO'}</h4>
                  <p className="font-bold">RIF: {formData.rif || 'G-00000000-0'}</p>
                  <p className="text-[8px] mt-0.5">{formData.direccion || 'DIRECCIÓN COMERCIAL'}</p>
                  <p>Telf: {formData.telefono || '0000-0000000'}</p>
                </div>
                <p className="text-center text-slate-300">----------------------------------------</p>
                <div className="space-y-0.5 text-slate-655 text-left">
                  <div>FACTURA: FAC-000458</div>
                  <div>FECHA: {new Date().toLocaleDateString()}</div>
                  <div>HORA: {new Date().toLocaleTimeString()}</div>
                  <div>CAJERO: OPERADOR DEMO</div>
                  <div>VENDEDOR: VENDEDOR AUXILIAR</div>
                  <div>CLIENTE: CONSUMIDOR FINAL</div>
                  <div>ID/RIF: V-00000000</div>
                </div>
                <p className="text-center text-slate-300">----------------------------------------</p>
                <div className="space-y-1">
                  <div className="flex font-bold justify-between text-slate-700">
                    <span className="w-1/2">CONCEPTO</span>
                    <span className="w-1/12 text-center">CT</span>
                    <span className="w-1/4 text-right">P.UN</span>
                    <span className="w-1/6 text-right">TOTAL</span>
                  </div>
                  <div className="flex justify-between text-slate-655">
                    <span className="w-1/2 truncate">HARINA DE MAÍZ PAN 1KG</span>
                    <span className="w-1/12 text-center">2</span>
                    <span className="w-1/4 text-right">$1.20</span>
                    <span className="w-1/6 text-right">$2.40</span>
                  </div>
                </div>
                <p className="text-center text-slate-300">----------------------------------------</p>
                <div className="text-right space-y-0.5 text-[10px] text-slate-800">
                  <div className="flex justify-between font-extrabold text-sm border-t border-slate-200 pt-1 text-slate-900">
                    <span>TOTAL USD:</span>
                    <span>$2.40</span>
                  </div>
                </div>
                <p className="text-center text-slate-300">----------------------------------------</p>
                <div className="text-center text-[8px] italic leading-relaxed text-slate-500">
                  {formData.mensaje_pie_ticket || 'Gracias por su compra.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: USUARIOS Y ROLES */}
        {activeTab === 'usuarios' && isAdmin && (
          <div className="space-y-6">
            
            {/* SUB TABS */}
            <div className="flex gap-4 border-b border-slate-200 pb-2">
              <button
                onClick={() => setSubTabUsers('users')}
                className={`pb-1 text-xs font-bold font-sans transition-all flex items-center gap-1.5 ${
                  subTabUsers === 'users'
                    ? 'border-b-2 border-winter-configStart text-winter-configStart'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Users className="w-4 h-4" />
                Gestión de Usuarios
              </button>
              <button
                onClick={() => setSubTabUsers('roles')}
                className={`pb-1 text-xs font-bold font-sans transition-all flex items-center gap-1.5 ${
                  subTabUsers === 'roles'
                    ? 'border-b-2 border-winter-configStart text-winter-configStart'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
                Perfiles y Roles
              </button>
              <button
                onClick={() => setSubTabUsers('sesiones')}
                className={`pb-1 text-xs font-bold font-sans transition-all flex items-center gap-1.5 ${
                  subTabUsers === 'sesiones'
                    ? 'border-b-2 border-emerald-600 text-emerald-700 font-extrabold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Globe className="w-4 h-4 text-emerald-600" />
                Sesiones Activas en Red
                {activeSessionsList.length > 0 && (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                    {activeSessionsList.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setSubTabUsers('politicas')}
                className={`pb-1 text-xs font-bold font-sans transition-all flex items-center gap-1.5 ${
                  subTabUsers === 'politicas'
                    ? 'border-b-2 border-winter-configStart text-winter-configStart font-extrabold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Settings className="w-4 h-4 text-winter-configStart" />
                Políticas de Multisesión
              </button>
              <button
                onClick={() => setSubTabUsers('masterpass')}
                className={`pb-1 text-xs font-bold font-sans transition-all flex items-center gap-1.5 ${
                  subTabUsers === 'masterpass'
                    ? 'border-b-2 border-amber-500 text-amber-700 font-extrabold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <KeyRound className="w-4 h-4 text-amber-500" />
                Master Pass
              </button>
            </div>

            {/* SUBTAB: USERS LIST */}
            {subTabUsers === 'users' && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-700 uppercase font-sans">Listado de Usuarios del Sistema</h3>
                  <button
                    onClick={handleOpenNewUser}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold font-sans text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nuevo Usuario
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 text-[10px] uppercase font-bold">
                        <th className="py-2.5 px-3">Usuario (Login)</th>
                        <th className="py-2.5 px-3">Nombre Completo</th>
                        <th className="py-2.5 px-3">Rol / Perfil</th>
                        <th className="py-2.5 px-3">Estado</th>
                        <th className="py-2.5 px-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userList.map(u => (
                        <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-xs">
                          <td className="py-3 px-3 font-mono font-bold text-slate-700">{u.usuario}</td>
                          <td className="py-3 px-3 text-slate-655 font-bold">{u.nombre}</td>
                          <td className="py-3 px-3 text-sky-700 font-bold uppercase">{u.rol}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              u.estado === 'Activo' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {u.estado}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right flex justify-end gap-2">
                            <button
                              onClick={() => handleOpenEditUser(u)}
                              className="text-slate-400 hover:text-sky-600 p-1 transition-all"
                              title="Editar Usuario"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 transition-all"
                              title="Eliminar Usuario"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUBTAB: ROLES LIST */}
            {subTabUsers === 'roles' && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-700 uppercase font-sans">Perfiles de Rol y Plantillas de Acceso</h3>
                  <button
                    onClick={handleOpenNewRole}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold font-sans text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nuevo Perfil
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 text-[10px] uppercase font-bold">
                        <th className="py-2.5 px-3">Perfil / Rol</th>
                        <th className="py-2.5 px-3">Módulos Permitidos</th>
                        <th className="py-2.5 px-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const hasAdminRole = roleList.some(r => r.nombre?.trim().toLowerCase() === 'administrador');
                        const displayRoles = hasAdminRole ? roleList : [
                          {
                            id: -1,
                            nombre: 'Administrador',
                            permisos: MODULOS_PERMISOS.reduce((acc, m) => {
                              acc[m.id] = { ver: true, crear: true, editar: true, eliminar: true, admin: true };
                              return acc;
                            }, {} as any)
                          },
                          ...roleList
                        ];

                        return displayRoles.map(r => {
                          const isSystemAdmin = r.nombre?.trim().toLowerCase() === 'administrador';
                          const activeModules = Object.keys(r.permisos || {}).filter(m => r.permisos[m]?.ver);
                          return (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-xs">
                              <td className="py-3 px-3 font-bold text-slate-700 uppercase flex items-center gap-2">
                                <span>{r.nombre}</span>
                                {isSystemAdmin && (
                                  <span className="bg-sky-100 text-sky-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded">SISTEMA</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-slate-500 font-sans">
                                {activeModules.length === 0 ? 'Sin permisos' : activeModules.map(m => {
                                  const modName = MODULOS_PERMISOS.find(x => x.id === m)?.label || m;
                                  return (
                                    <span key={m} className="inline-block bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded mr-1 mb-1 font-bold font-mono">
                                      {modName.split(' ')[1] || modName}
                                    </span>
                                  );
                                })}
                              </td>
                              <td className="py-3 px-3 text-right flex justify-end gap-2">
                                <button
                                  onClick={() => handleOpenEditRole(r)}
                                  className="text-slate-400 hover:text-sky-600 p-1 transition-all"
                                  title="Editar Perfil"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                {!isSystemAdmin && (
                                  <button
                                    onClick={() => handleDeleteRole(r.id, r.nombre)}
                                    className="text-slate-400 hover:text-rose-600 p-1 transition-all"
                                    title="Eliminar Perfil"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUBTAB: ACTIVE SESSIONS LIST */}
            {subTabUsers === 'sesiones' && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase font-sans flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Sesiones Activas en Red ({activeSessionsList.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                      Muestra los usuarios conectados actualmente en las terminales del sistema.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchActiveSessions}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold font-sans text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all"
                  >
                    🔄 Actualizar
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 text-[10px] uppercase font-bold">
                        <th className="py-2.5 px-3">Usuario (Login)</th>
                        <th className="py-2.5 px-3">Nombre</th>
                        <th className="py-2.5 px-3">Rol</th>
                        <th className="py-2.5 px-3">Estación / Equipo</th>
                        <th className="py-2.5 px-3">Hora Ingreso</th>
                        <th className="py-2.5 px-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSessionsList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 font-sans italic">
                            No hay sesiones activas en la red en este momento.
                          </td>
                        </tr>
                      ) : (
                        activeSessionsList.map(s => (
                          <tr key={s.userId} className="border-b border-slate-100 hover:bg-slate-50/50 text-xs">
                            <td className="py-3 px-3 font-mono font-bold text-slate-800 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              {s.username}
                            </td>
                            <td className="py-3 px-3 text-slate-700 font-medium">{s.nombre}</td>
                            <td className="py-3 px-3 text-sky-700 font-bold uppercase">{s.rol}</td>
                            <td className="py-3 px-3 font-mono text-emerald-800 font-bold">{s.terminal}</td>
                            <td className="py-3 px-3 font-mono text-slate-500">{new Date(s.loginTime).toLocaleTimeString()}</td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleForceDisconnectSession(s.userId, s.username)}
                                  className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1"
                                  title="Liberar registro de terminal en red (permite reconexión sin cerrar aplicación)"
                                >
                                  <Unplug className="w-3 h-3" />
                                  Desconectar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleForceLogoutSession(s.userId, s.username)}
                                  className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded text-[11px] font-bold transition-all shadow-sm flex items-center gap-1"
                                  title="Expulsar usuario del sistema de inmediato (Cerrar Sesión / Logout)"
                                >
                                  <LogOut className="w-3 h-3" />
                                  Logout
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {/* SUBTAB: POLITICAS DE MULTISESION */}
            {subTabUsers === 'politicas' && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase font-sans flex items-center gap-2">
                    <Globe className="w-4 h-4 text-winter-configStart" />
                    Políticas de Multisesión y Acceso Multi-Terminal
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 font-sans">
                    Configure las reglas de concurrencia y comportamiento de turnos de caja para los usuarios en la red local. Solo administradores pueden guardar estos cambios.
                  </p>
                </div>

                {!isAdmin && (
                  <div className="bg-amber-50 border border-amber-250 text-amber-800 p-3 rounded-lg text-xs font-sans flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Solo los usuarios con rol de <strong>Administrador</strong> tienen permisos para modificar estas políticas.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
                  {/* 1. Permitir Multisesión */}
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between space-y-3 shadow-xs">
                    <div>
                      <span className="font-bold text-slate-800 text-xs block">
                        Permitir Multisesión en Diferentes Equipos
                      </span>
                      <p className="text-xs text-slate-500 mt-1">
                        Permite que un mismo usuario (ej. vendedor o cajero) mantenga sesiones abiertas simultáneamente en diferentes computadoras de la red local.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => {
                        const updated = { ...formData, permitir_multisesion: formData.permitir_multisesion === false };
                        setFormData(updated);
                        handleSavePoliticasDirect(updated);
                      }}
                      className={`w-full py-2.5 rounded-lg font-bold text-xs transition-all shadow-sm ${
                        !isAdmin ? 'opacity-60 cursor-not-allowed bg-slate-300 text-slate-600' :
                        formData.permitir_multisesion !== false
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                      }`}
                    >
                      {formData.permitir_multisesion !== false ? '✅ Multisesión Permitida (Habilitado)' : '⛔ Solo 1 Equipo por Usuario (Deshabilitado)'}
                    </button>
                  </div>

                  {/* 2. Compartir Apertura de Caja */}
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between space-y-3 shadow-xs">
                    <div>
                      <span className="font-bold text-slate-800 text-xs block">
                        Compartir Apertura de Caja entre Estaciones
                      </span>
                      <p className="text-xs text-slate-500 mt-1">
                        Permite que si el mismo usuario ingresa desde otra computadora o tablet, pueda facturar compartiendo la misma apertura de caja activa de su turno.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => {
                        const updated = { ...formData, compartir_apertura_caja: formData.compartir_apertura_caja === false };
                        setFormData(updated);
                        handleSavePoliticasDirect(updated);
                      }}
                      className={`w-full py-2.5 rounded-lg font-bold text-xs transition-all shadow-sm ${
                        !isAdmin ? 'opacity-60 cursor-not-allowed bg-slate-300 text-slate-600' :
                        formData.compartir_apertura_caja !== false
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                      }`}
                    >
                      {formData.compartir_apertura_caja !== false ? '🔗 Compartir Misma Caja (Habilitado)' : '🔒 Apertura Independiente por Estación'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB: MASTER PASS */}
            {subTabUsers === 'masterpass' && (
              <div className="bg-white border border-amber-200 rounded-xl p-6 shadow-sm space-y-5 font-sans">
                <div className="border-b border-amber-100 pb-4 flex items-center gap-3">
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl">
                    <KeyRound className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase">
                      Configuración de Clave Master Pass — Módulo Inversiones y Accionistas
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Esta clave protege el acceso al módulo privado de Control de Inversiones. Solo administradores pueden modificarla. La clave por defecto inicial es <strong className="font-mono">1234</strong>.
                    </p>
                  </div>
                </div>

                {mpMessage && (
                  <div className={`px-4 py-3 rounded-lg text-xs flex items-center gap-2 font-medium ${
                    mpMessage.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border border-red-200 text-red-800'
                  }`}>
                    {mpMessage.type === 'success' ? '✅' : '⚠️'} {mpMessage.text}
                  </div>
                )}

                <div className="max-w-md space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> Clave Actual (verificación):
                    </label>
                    <div className="relative">
                      <input
                        type={mpShowCurrent ? 'text' : 'password'}
                        value={mpCurrentPass}
                        onChange={(e) => setMpCurrentPass(e.target.value)}
                        placeholder="Ingrese la clave actual"
                        className="w-full border border-slate-300 focus:border-amber-400 focus:ring-1 focus:ring-amber-300 rounded-lg px-3 py-2.5 text-sm font-mono outline-none transition-all pr-10"
                      />
                      <button type="button" onClick={() => setMpShowCurrent(!mpShowCurrent)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {mpShowCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5 text-amber-500" /> Nueva Clave Master Pass:
                    </label>
                    <div className="relative">
                      <input
                        type={mpShowNew ? 'text' : 'password'}
                        value={mpNewPass}
                        onChange={(e) => setMpNewPass(e.target.value)}
                        placeholder="Nueva clave de acceso"
                        className="w-full border border-slate-300 focus:border-amber-400 focus:ring-1 focus:ring-amber-300 rounded-lg px-3 py-2.5 text-sm font-mono outline-none transition-all pr-10"
                      />
                      <button type="button" onClick={() => setMpShowNew(!mpShowNew)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {mpShowNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                      Confirmar Nueva Clave:
                    </label>
                    <input
                      type="password"
                      value={mpConfirmPass}
                      onChange={(e) => setMpConfirmPass(e.target.value)}
                      placeholder="Repita la nueva clave"
                      className="w-full border border-slate-300 focus:border-amber-400 focus:ring-1 focus:ring-amber-300 rounded-lg px-3 py-2.5 text-sm font-mono outline-none transition-all"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={mpLoading || !isAdmin}
                    onClick={async () => {
                      setMpMessage(null);
                      if (!mpCurrentPass.trim()) {
                        setMpMessage({ type: 'error', text: 'Debe ingresar la clave actual para verificación.' });
                        return;
                      }
                      if (!mpNewPass.trim()) {
                        setMpMessage({ type: 'error', text: 'La nueva clave no puede estar vacía.' });
                        return;
                      }
                      if (mpNewPass !== mpConfirmPass) {
                        setMpMessage({ type: 'error', text: 'La nueva clave y la confirmación no coinciden.' });
                        return;
                      }
                      setMpLoading(true);
                      try {
                        const res = await fetch(getApiUrl('/config/master-pass'), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ currentPass: mpCurrentPass, newPass: mpNewPass })
                        });
                        const data = await res.json();
                        if (res.ok && data.success) {
                          setMpMessage({ type: 'success', text: 'Clave Master Pass actualizada exitosamente.' });
                          setMpCurrentPass(''); setMpNewPass(''); setMpConfirmPass('');
                        } else {
                          setMpMessage({ type: 'error', text: data.message || 'No se pudo actualizar la clave.' });
                        }
                      } catch {
                        setMpMessage({ type: 'error', text: 'Error de conexión con el servidor.' });
                      } finally {
                        setMpLoading(false);
                      }
                    }}
                    className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide transition-all flex items-center justify-center gap-2 shadow-sm ${
                      !isAdmin ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    <KeyRound className="w-4 h-4" />
                    {mpLoading ? 'Actualizando...' : 'Actualizar Clave Master Pass'}
                  </button>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                    <div className="font-bold">⚠️ Información de Seguridad:</div>
                    <ul className="list-disc pl-4 space-y-0.5 text-amber-700">
                      <li>La clave por defecto inicial es: <strong className="font-mono">1234</strong></li>
                      <li>Esta clave se solicita cada vez que el Administrador abre el Módulo de Inversiones y Accionistas.</li>
                      <li>Comparta esta clave solo con personas de máxima confianza.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 3: BASCULAS, IMPRESORAS Y MAQUINAS FISCALES SENIAT */}
        {activeTab === 'perifericos' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start animate-fade-in font-sans">
            
            {/* LEFT COLUMN: Thermal Printer & Scale Config */}
            <form onSubmit={handleSavePerifericos} className="bg-white border border-slate-200 p-5 rounded-xl space-y-5 shadow-sm">
              {/* PRINTER SETTINGS */}
              <div>
                <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2.5 mb-4 flex items-center gap-2">
                  <Printer className="w-4 h-4 text-winter-configStart" />
                  Configuración de Impresora térmica de Tickets
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs text-slate-600 block mb-1 font-medium">Método de Conexión / Puerto</label>
                    <select
                      value={printerConfig.puerto}
                      onChange={(e) => setPrinterConfig(prev => ({ ...prev, puerto: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none"
                    >
                      <option value="SISTEMA">Impresora del Sistema Operativo</option>
                      <option value="USB">Conexión Directa USB (Raw)</option>
                      <option value="IP">Conexión por Red IP (Ethernet/Wi-Fi)</option>
                      <option value="NINGUNA">No Utilizar Impresora (Guardado Digital)</option>
                    </select>
                  </div>
                  {printerConfig.puerto === 'IP' && (
                    <div>
                      <label className="text-xs text-slate-600 block mb-1 font-medium">Dirección IP de la Impresora</label>
                      <input
                        type="text"
                        placeholder="192.168.1.200"
                        value={printerConfig.ipAddress || ''}
                        onChange={(e) => setPrinterConfig(prev => ({ ...prev, ipAddress: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-mono"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3.5 text-xs">
                  <div>
                    <label className="text-xs text-slate-600 block mb-1 font-medium">Ancho de Papel Térmico</label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPrinterConfig(prev => ({ ...prev, anchoPapel: '58mm' }))}
                        className={`flex-1 p-2 rounded-lg border text-center transition-all ${
                          printerConfig.anchoPapel === '58mm'
                            ? 'bg-sky-50 border-sky-300 text-sky-800 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        58 mm
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrinterConfig(prev => ({ ...prev, anchoPapel: '80mm' }))}
                        className={`flex-1 p-2 rounded-lg border text-center transition-all ${
                          printerConfig.anchoPapel === '80mm'
                            ? 'bg-sky-50 border-sky-300 text-sky-800 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        80 mm
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col justify-end">
                    <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center justify-between shadow-xs">
                      <span className="text-xs text-slate-700 font-bold">Corte Automático</span>
                      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-0.5">
                        <button
                          type="button"
                          onClick={() => setPrinterConfig(prev => ({ ...prev, cortarAutomatico: true }))}
                          className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                            printerConfig.cortarAutomatico
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          SÍ
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrinterConfig(prev => ({ ...prev, cortarAutomatico: false }))}
                          className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                            !printerConfig.cortarAutomatico
                              ? 'bg-rose-500 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          NO
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-end">
                    <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center justify-between shadow-xs">
                      <span className="text-xs text-slate-700 font-bold">Copia de Ticket</span>
                      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-0.5">
                        <button
                          type="button"
                          onClick={() => setPrinterConfig(prev => ({ ...prev, copiaTicket: true }))}
                          className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                            printerConfig.copiaTicket
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          SÍ
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrinterConfig(prev => ({ ...prev, copiaTicket: false }))}
                          className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                            !printerConfig.copiaTicket
                              ? 'bg-rose-500 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          NO
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SCALE SETTINGS */}
              <div className="border-t border-slate-100 pt-5">
                <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2.5 mb-4 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-winter-configStart" />
                  Configuración de Báscula / Balanza de Peso
                </h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-600 block mb-1 font-medium">Método de Peso</label>
                    <select
                      value={scaleConfig.puerto}
                      onChange={(e) => setScaleConfig(prev => ({ ...prev, puerto: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none"
                    >
                      <option value="MANUAL">Entrada Manual</option>
                      <option value="COM1">Puerto COM1</option>
                      <option value="COM2">Puerto COM2</option>
                      <option value="USB">USB Emulado</option>
                      <option value="RED">Red IP</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 block mb-1 font-medium">Protocolo</label>
                    <select
                      value={scaleConfig.protocolo}
                      onChange={(e) => setScaleConfig(prev => ({ ...prev, protocolo: e.target.value }))}
                      disabled={scaleConfig.puerto === 'MANUAL'}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none disabled:opacity-50"
                    >
                      <option value="CAS">CAS Estándar</option>
                      <option value="Toledo">Toledo (P03)</option>
                      <option value="Custom">Custom ASCII</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 block mb-1 font-medium">Baud Rate</label>
                    <select
                      value={scaleConfig.baudRate}
                      onChange={(e) => setScaleConfig(prev => ({ ...prev, baudRate: parseInt(e.target.value) }))}
                      disabled={scaleConfig.puerto === 'MANUAL'}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-mono disabled:opacity-50"
                    >
                      <option value="2400">2400 bps</option>
                      <option value="4800">4800 bps</option>
                      <option value="9600">9600 bps</option>
                      <option value="19200">19200 bps</option>
                    </select>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-winter-configStart hover:bg-emerald-800 text-white font-bold py-2.5 px-4 rounded-lg text-xs transition-all shadow-sm"
              >
                GUARDAR CONFIGURACIÓN DE PERIFÉRICOS
              </button>
            </form>

            {/* RIGHT COLUMN: SENIAT Homologated Fiscal Printer Config */}
            <form onSubmit={handleSaveFiscalPrinter} className="bg-white border border-slate-200 p-5 rounded-xl space-y-5 shadow-sm">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3.5">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <ShieldCheck className="w-4.5 h-4.5 text-emerald-600" />
                    Máquinas Fiscales Homologadas (SENIAT)
                  </h2>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded font-mono">
                    SENIAT VE
                  </span>
                </div>

                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Configuración de conexión y Spooler Fiscal para impresoras homologadas bajo normativas tributarias del SENIAT (Providencia SNAT/2011/0071).
                </p>

                <div className="space-y-3.5 text-xs">
                  {/* Marca y Modelo de Impresora Fiscal */}
                  <div>
                    <label className="text-xs text-slate-700 block mb-1 font-bold">
                      Marca / Modelo Fiscal Homologado
                    </label>
                    <select
                      value={fiscalPrinterConfig.modelo}
                      onChange={(e) => setFiscalPrinterConfig(prev => ({ ...prev, modelo: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none font-bold"
                    >
                      <option value="HKA_FACTORY">The Factory HKA / PNP (Tally / Custom / Bematech)</option>
                      <option value="BIXOLON">Bixolon Fiscal (SRP-350 / SRP-270 / SRP-812)</option>
                      <option value="DASCOM">Dascom Tally / Elepon / Aclas Fiscal</option>
                      <option value="BEMATECH">Bematech Fiscal (MP-4000 TH FI)</option>
                      <option value="CUSTOM">Custom / Spooler Fiscal SENIAT (TFHKA)</option>
                      <option value="DLL_GENERICA">Driver DLL / Servidor Spooler Fiscal Local</option>
                    </select>
                  </div>

                  {/* Puerto de Comunicación y BaudRate */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-700 block mb-1 font-bold">Puerto / Interface</label>
                      <select
                        value={fiscalPrinterConfig.puerto}
                        onChange={(e) => setFiscalPrinterConfig(prev => ({ ...prev, puerto: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none font-mono font-bold"
                      >
                        <option value="COM1">Puerto Serial COM1</option>
                        <option value="COM2">Puerto Serial COM2</option>
                        <option value="COM3">Puerto Serial COM3</option>
                        <option value="COM4">Puerto Serial COM4</option>
                        <option value="USB">Conexión USB (Driver SENIAT)</option>
                        <option value="SPOOLER_IP">Spooler de Red / IP Local</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-slate-700 block mb-1 font-bold">Velocidad (Baud Rate)</label>
                      <select
                        value={fiscalPrinterConfig.baudRate}
                        onChange={(e) => setFiscalPrinterConfig(prev => ({ ...prev, baudRate: parseInt(e.target.value) }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none font-mono"
                      >
                        <option value="9600">9600 bps (Estándar HKA)</option>
                        <option value="19200">19200 bps</option>
                        <option value="38400">38400 bps</option>
                        <option value="115200">115200 bps (USB Alta Velocidad)</option>
                      </select>
                    </div>
                  </div>

                  {/* Serial Asignado por SENIAT & IP Spooler */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-700 block mb-1 font-bold">Serial Máquina Fiscal (SENIAT)</label>
                      <input
                        type="text"
                        placeholder="Ej. Z3C1234567"
                        value={fiscalPrinterConfig.serialMaquina}
                        onChange={(e) => setFiscalPrinterConfig(prev => ({ ...prev, serialMaquina: e.target.value.toUpperCase() }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none font-mono uppercase font-bold"
                      />
                    </div>

                    {fiscalPrinterConfig.puerto === 'SPOOLER_IP' ? (
                      <div>
                        <label className="text-xs text-slate-700 block mb-1 font-bold">IP / Puerto Spooler Fiscal</label>
                        <input
                          type="text"
                          placeholder="127.0.0.1:8080"
                          value={fiscalPrinterConfig.ipSpooler}
                          onChange={(e) => setFiscalPrinterConfig(prev => ({ ...prev, ipSpooler: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none font-mono"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs text-slate-700 block mb-1 font-bold">Estado del Servicio Fiscal</label>
                        <select
                          value={fiscalPrinterConfig.estadoFiscal}
                          onChange={(e) => setFiscalPrinterConfig(prev => ({ ...prev, estadoFiscal: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-emerald-600 focus:outline-none font-medium"
                        >
                          <option value="ACTIVA">🟢 Impresora Fiscal Activa (Producción)</option>
                          <option value="MODO_PRUEBA">🟡 Modo Prueba / Demo (Sin emisión SENIAT)</option>
                          <option value="DESACTIVADA">🔴 Desactivada</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Switches de Opciones Fiscales */}
                  <div className="border-t border-slate-100 pt-3.5 space-y-2.5">
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Parámetros Tributarios SENIAT</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center justify-between shadow-xs">
                        <span className="text-xs text-slate-700 font-bold">Reporte Z al Cerrar Caja</span>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-0.5">
                          <button
                            type="button"
                            onClick={() => setFiscalPrinterConfig(prev => ({ ...prev, reporteZAutomatico: true }))}
                            className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                              fiscalPrinterConfig.reporteZAutomatico
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            SÍ
                          </button>
                          <button
                            type="button"
                            onClick={() => setFiscalPrinterConfig(prev => ({ ...prev, reporteZAutomatico: false }))}
                            className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                              !fiscalPrinterConfig.reporteZAutomatico
                                ? 'bg-rose-500 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            NO
                          </button>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center justify-between shadow-xs">
                        <span className="text-xs text-slate-700 font-bold">Desglose IGTF (3%)</span>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-0.5">
                          <button
                            type="button"
                            onClick={() => setFiscalPrinterConfig(prev => ({ ...prev, imprimirIgtf: true }))}
                            className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                              fiscalPrinterConfig.imprimirIgtf
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            SÍ
                          </button>
                          <button
                            type="button"
                            onClick={() => setFiscalPrinterConfig(prev => ({ ...prev, imprimirIgtf: false }))}
                            className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                              !fiscalPrinterConfig.imprimirIgtf
                                ? 'bg-rose-500 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            NO
                          </button>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center justify-between shadow-xs">
                        <span className="text-xs text-slate-700 font-bold">Exigir RIF/Cédula en Factura</span>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-0.5">
                          <button
                            type="button"
                            onClick={() => setFiscalPrinterConfig(prev => ({ ...prev, exigirRifCliente: true }))}
                            className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                              fiscalPrinterConfig.exigirRifCliente
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            SÍ
                          </button>
                          <button
                            type="button"
                            onClick={() => setFiscalPrinterConfig(prev => ({ ...prev, exigirRifCliente: false }))}
                            className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                              !fiscalPrinterConfig.exigirRifCliente
                                ? 'bg-rose-500 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            NO
                          </button>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center justify-between shadow-xs">
                        <span className="text-xs text-slate-700 font-bold">Duplicado de Factura Fiscal</span>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-0.5">
                          <button
                            type="button"
                            onClick={() => setFiscalPrinterConfig(prev => ({ ...prev, imprimirCopiaFiscal: true }))}
                            className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                              fiscalPrinterConfig.imprimirCopiaFiscal
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            SÍ
                          </button>
                          <button
                            type="button"
                            onClick={() => setFiscalPrinterConfig(prev => ({ ...prev, imprimirCopiaFiscal: false }))}
                            className={`px-3 py-1 text-[11px] rounded-md font-extrabold transition-all ${
                              !fiscalPrinterConfig.imprimirCopiaFiscal
                                ? 'bg-rose-500 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            NO
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleTestFiscalPrinter}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-3 rounded-lg text-xs transition-all border border-slate-300 flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  PROBAR LECTURA X
                </button>

                <button
                  type="submit"
                  className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-sm"
                >
                  GUARDAR CONFIGURACIÓN FISCAL
                </button>
              </div>
            </form>

          </div>
        )}

        {/* TAB 4: DATABASE ADMIN */}
        {activeTab === 'db' && isAdmin && (
          <div className="space-y-6 w-full px-2 lg:px-4 mx-auto animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* LEFT COLUMN: DANGER ZONE */}
              <div className="lg:col-span-6 space-y-6">
          
            
            {/* WIPE SYSTEM */}
            <div className="bg-white border border-red-200 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-red-800 uppercase flex items-center gap-1.5 font-sans">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                Limpieza y Puesta a Cero de Base de Datos (Danger Zone)
              </h3>
              <p className="text-slate-500 font-sans text-xs">
                Estas opciones permiten borrar de forma definitiva la información registrada en el sistema. Es ideal para limpiar datos de prueba antes de la salida a producción.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-slate-700 block">Vaciar Inventario / Catálogo</span>
                    <p className="text-[10px] text-slate-500 font-sans">Elimina todos los productos registrados, así como sus movimientos e historial de cambios de precio.</p>
                  </div>
                  <button
                    onClick={() => handleWipeDb('inventory')}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 py-2 rounded font-bold font-sans text-xs transition-all"
                  >
                    Borrar Catálogo de Productos
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-slate-700 block">Vaciar Existencias (Poner a Cero Stock)</span>
                    <p className="text-[10px] text-slate-500 font-sans">Establece el stock/existencia de todos los productos en cero (0), conservando sus nombres, códigos y precios.</p>
                  </div>
                  <button
                    onClick={() => handleWipeDb('stock')}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 py-2 rounded font-bold font-sans text-xs transition-all"
                  >
                    Poner Existencias a Cero
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-slate-700 block">Vaciar Registro de Ventas y Facturas</span>
                    <p className="text-[10px] text-slate-500 font-sans">Elimina todas las transacciones históricas, reinicia folios de factura, limpia cierres de caja y kardex (mantiene intactas las tasas de cambio BCV).</p>
                  </div>
                  <button
                    onClick={() => handleWipeDb('sales')}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 py-2 rounded font-bold font-sans text-xs transition-all"
                  >
                    Borrar Historial de Ventas
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-slate-700 block">Vaciar Directorio o Saldos de Clientes</span>
                    <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                      {onlyClientBalances 
                        ? 'Reinicia a cero el saldo pendiente de todos los clientes y vacía el historial de abonos en la BD, manteniendo los clientes.'
                        : 'Elimina todos los clientes registrados, a excepción del cliente genérico (Consumidor Final).'}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-sans text-slate-700 font-bold bg-slate-50 p-2 rounded border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyClientBalances}
                      onChange={(e) => setOnlyClientBalances(e.target.checked)}
                      className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500 cursor-pointer"
                    />
                    <span>Eliminar solo saldos pendientes y abonos (Mantener clientes)</span>
                  </label>
                  <button
                    onClick={() => handleWipeDb(onlyClientBalances ? 'client_balances' : 'clients')}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 py-2 rounded font-bold font-sans text-xs transition-all"
                  >
                    {onlyClientBalances ? 'Reiniciar Saldos y Abonos de Clientes' : 'Borrar Directorio de Clientes'}
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-slate-700 block">Vaciar Módulo de Accionistas e Inversiones</span>
                    <p className="text-[10px] text-slate-500 font-sans">Elimina todos los accionistas registrados y sus aportes de capital, dejando el módulo de inversiones en cero (0).</p>
                  </div>
                  <button
                    onClick={() => handleWipeDb('accionistas')}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 py-2 rounded font-bold font-sans text-xs transition-all"
                  >
                    Borrar Módulo de Accionistas
                  </button>
                </div>

                <div className="border border-red-200 bg-red-50/20 rounded-lg p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-red-700 block">⚠️ Limpieza General (Dejar en Blanco)</span>
                    <p className="text-[10px] text-slate-500 font-sans">Elimina toda la información general: productos, clientes, ventas, abonos, accionistas y cierres, listos para empezar una nueva instalación.</p>
                  </div>
                  <button
                    onClick={() => handleWipeDb('all')}
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded font-bold font-sans text-xs transition-all shadow-sm"
                  >
                    Limpiar Sistema Completo
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 flex flex-col md:flex-row items-center gap-3">
                <span className="text-[10px] text-slate-655 font-bold uppercase font-sans">Escriba "CONFIRMAR" para autorizar:</span>
                <input
                  type="text"
                  placeholder="Escriba aquí..."
                  value={dbConfirmWord}
                  onChange={(e) => setDbConfirmWord(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs font-bold text-center text-slate-800 focus:bg-white focus:outline-none placeholder-slate-350 focus:border-red-400 w-full md:w-44 font-mono"
                />
              </div>
            </div>
          </div>

              {/* RIGHT COLUMN: BACKUPS & AUTOMATIC BACKUP */}
              <div className="lg:col-span-6 space-y-6">
                {/* BACKUPS & EXPORT/IMPORT */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5 font-sans">
                  <Download className="w-4 h-4 text-sky-600" />
                  Copias de Seguridad (Backups)
                </h3>
                <p className="text-slate-500 font-sans text-xs">
                  Descargue un respaldo consolidado con toda la información y base de datos local para resguardar su negocio.
                </p>
                <button
                  onClick={handleDownloadBackup}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white py-3 rounded-lg font-bold font-sans text-xs transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Generar y Descargar Respaldo (.json)
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5 font-sans">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  Restaurar e Importar Datos
                </h3>
                <p className="text-slate-500 font-sans text-xs">
                  Cargue un archivo de respaldo generado anteriormente por WinterPos para restaurar todo el sistema.
                </p>
                <label className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-bold font-sans text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer text-center text-left">
                  <Upload className="w-4 h-4" />
                  Seleccionar y Cargar Archivo
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>

            </div>

            {/* AUTOMATIC BACKUP SCHEDULER */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
              <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5 font-sans">
                <HardDrive className="w-4 h-4 text-amber-600" />
                Programación de Respaldo Automático
              </h3>
              <p className="text-slate-500 font-sans text-xs">
                Defina la frecuencia con la que el servidor local de la sucursal guardará de forma automática copias de seguridad de la base de datos en su carpeta de backups del disco duro.
              </p>

              {/* Row 1: Frecuencia + Hora */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Frecuencia */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold font-sans uppercase text-slate-500 tracking-wide">Frecuencia</label>
                  <select
                    value={dbBackupSchedule}
                    onChange={(e) => setDbBackupSchedule(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:bg-white focus:border-amber-500 focus:outline-none font-sans w-full"
                  >
                    <option value="Diario">🔁 Cada 24 horas (Recomendado)</option>
                    <option value="Semanal">📅 Semanalmente (Cada Domingo)</option>
                    <option value="Mensual">🗓️ Mensualmente (Fin de Mes)</option>
                    <option value="Especifico">📌 Fecha específica (único respaldo)</option>
                    <option value="Desactivado">⛔ Desactivar respaldos automáticos</option>
                  </select>
                </div>

                {/* Hora del respaldo */}
                {dbBackupSchedule !== 'Desactivado' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold font-sans uppercase text-slate-500 tracking-wide">Hora del Respaldo</label>
                    <div className="relative">
                      <input
                        type="time"
                        value={backupHour}
                        onChange={(e) => setBackupHour(e.target.value)}
                        className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:bg-white focus:border-amber-500 focus:outline-none font-mono w-full"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-sans pointer-events-none">24h</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans">El servidor ejecutará el respaldo a esta hora local.</p>
                  </div>
                )}
              </div>

              {/* Ruta / Carpeta de guardado */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
                <label className="text-[10px] font-bold font-sans uppercase text-slate-500 tracking-wide flex items-center gap-1">
                  <span>📁</span> Carpeta / Ruta de Guardado de la Copia de Seguridad
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={backupDir}
                    onChange={(e) => setBackupDir(e.target.value)}
                    placeholder="Ej: C:\Backups_WinterPos o ./data/backups"
                    className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 pl-3 pr-24 text-xs font-mono text-slate-800 focus:bg-white focus:border-amber-500 focus:outline-none w-full"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      fetch(getApiUrl('/db/backup/schedule'))
                        .then(r => r.json())
                        .then(d => { if (d.defaultBackupDir) setBackupDir(d.defaultBackupDir); });
                    }}
                    className="absolute right-2 text-[10px] font-sans font-bold text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded transition-colors"
                  >
                    Por Defecto
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-sans">
                  Las copias de seguridad automáticas se guardarán en esta carpeta del servidor local.
                </p>
              </div>

              {/* Fecha específica (calendario) — solo cuando se elige "Especifico" */}
              {dbBackupSchedule === 'Especifico' && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-600 text-sm">📌</span>
                    <span className="text-[11px] font-bold font-sans text-amber-800 uppercase tracking-wide">Seleccione la Fecha del Respaldo Único</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <div className="flex flex-col gap-1.5 flex-1">
                      <label className="text-[10px] font-bold font-sans uppercase text-amber-700 tracking-wide">Fecha</label>
                      <input
                        type="date"
                        value={backupSpecificDate}
                        min={getLocalDateStr()}
                        onChange={(e) => setBackupSpecificDate(e.target.value)}
                        className="bg-white border border-amber-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500 font-sans w-full shadow-sm"
                      />
                    </div>
                    {backupSpecificDate && (
                      <div className="flex flex-col gap-1 justify-end pt-5">
                        <div className="bg-amber-100 border border-amber-300 rounded-lg px-4 py-2.5 text-center">
                          <p className="text-[10px] font-sans text-amber-700 uppercase font-bold">Respaldo programado para:</p>
                          <p className="text-sm font-black font-sans text-amber-900 mt-0.5">
                            {new Date(backupSpecificDate + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                          </p>
                          <p className="text-xs font-bold font-mono text-amber-800 mt-0.5">a las {backupHour} hrs</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-amber-700 font-sans">
                    ⚠️ Un respaldo de "Fecha Específica" se ejecuta una sola vez en la fecha y hora indicadas, luego queda desactivado automáticamente.
                  </p>
                </div>
              )}

              {/* Resumen de configuración actual */}
              {dbBackupSchedule !== 'Desactivado' && dbBackupSchedule !== 'Especifico' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
                  <span className="text-slate-400 text-xs">🕐</span>
                  <span className="text-[11px] font-sans text-slate-600">
                    Configuración activa:
                    <span className="font-bold text-slate-800 ml-1">
                      {dbBackupSchedule === 'Diario' ? 'Cada día' : dbBackupSchedule === 'Semanal' ? 'Cada domingo' : 'Fin de cada mes'}
                    </span>
                    <span className="text-slate-500 ml-1">a las</span>
                    <span className="font-black font-mono text-amber-600 ml-1">{backupHour} hrs</span>
                  </span>
                </div>
              )}

              {/* Action button */}
              <div className="flex justify-end">
                <button
                  onClick={handleSaveBackupSchedule}
                  className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold font-sans text-xs px-6 py-2.5 rounded-lg transition-all shadow-sm flex items-center gap-2"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  Guardar Programaci�n
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
        {/* TAB 5: WHATSAPP INTEGRATION */}
        {activeTab === 'whatsapp' && isAdmin && (
          <div className="space-y-6 w-full px-2 lg:px-4 mx-auto animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* LEFT COLUMN: STATUS & TROUBLESHOOTING */}
              <div className="lg:col-span-6 space-y-6">
                
                {/* Side-by-side Grid: Status & QR/Connection Card */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                  {/* WhatsApp Connection status & Self-Management */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 flex flex-col justify-between h-full">
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5 font-sans">
                          <Globe className="w-4 h-4 text-indigo-650" />
                          Estado del Servicio
                        </h3>
                        <button
                          type="button"
                          onClick={() => fetchWaStatus()}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 p-1 rounded hover:bg-indigo-50 transition-all"
                          title="Actualizar estado ahora"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Actualizar</span>
                        </button>
                      </div>
                      
                      <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full animate-pulse ${
                              waStatus.status === 'CONNECTED' ? 'bg-emerald-500' :
                              waStatus.status === 'QR_READY' ? 'bg-amber-500' :
                              waStatus.status === 'AUTHENTICATING' ? 'bg-sky-500' : 'bg-rose-500'
                            }`} />
                            <span className="text-xs font-black uppercase font-sans text-slate-800">
                              {waStatus.status === 'CONNECTED' ? '🟢 Conectado' :
                               waStatus.status === 'QR_READY' ? '🟡 Esperando Escaneo' :
                               waStatus.status === 'AUTHENTICATING' ? '🔵 Conectando / Iniciando...' : '🔴 Desconectado'}
                            </span>
                          </div>

                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
                            waStatus.isMock ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}>
                            {waStatus.isMock ? 'Simulación' : 'Motor Real Chrome'}
                          </span>
                        </div>
                        
                        <p className="text-[10.5px] text-slate-600 leading-normal font-sans">
                          {waStatus.status === 'CONNECTED' ? 'El servidor central tiene una sesión activa vinculada. Los reportes y cierres se enviarán de forma automática.' :
                           waStatus.status === 'QR_READY' ? 'Requiere vincular una cuenta. Escanee el código QR de la derecha con la cámara de su WhatsApp.' :
                           waStatus.status === 'AUTHENTICATING' ? 'Iniciando navegador y sincronizando con WhatsApp. Por favor espere unos segundos...' : 
                           'La integración está inactiva o requiere habilitarse en el panel.'}
                        </p>

                        {/* DETECTED CHROME PATH */}
                        {waStatus.detectedChromePath && (
                          <div className="pt-2 border-t border-slate-200/70 text-[9.5px] font-sans text-slate-500 flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap">
                            <span className="font-bold text-slate-700">Ruta Navegador:</span>
                            <span className="font-mono text-slate-600 truncate" title={waStatus.detectedChromePath}>
                              {waStatus.detectedChromePath}
                            </span>
                          </div>
                        )}

                        {/* LAST ERROR BANNER */}
                        {waStatus.lastError && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[10px] space-y-1 font-sans">
                            <div className="font-bold flex items-center gap-1 text-rose-900">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Última advertencia registrada:</span>
                            </div>
                            <p className="font-mono text-[9px] bg-white/80 p-1.5 rounded border border-rose-200 break-all">
                              {waStatus.lastError}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* BOTONES DE ACCION DIRECTA */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      {waStatus.status === 'CONNECTED' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handleSendTestMessage}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 py-2 px-3 rounded-lg text-xs font-bold font-sans transition-all active:scale-95 flex items-center justify-center gap-1.5"
                          >
                            <span>🧪 Mensaje Prueba</span>
                          </button>
                          <button
                            type="button"
                            disabled={isLoggingOutWa}
                            onClick={handleLogoutWa}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 py-2 px-3 rounded-lg text-xs font-bold font-sans transition-all active:scale-95 flex items-center justify-center gap-1.5"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>{isLoggingOutWa ? 'Cerrando...' : 'Cerrar Sesión'}</span>
                          </button>
                        </div>
                      )}

                      {waStatus.isMock && (
                        <button
                          type="button"
                          disabled={isInstallingChrome}
                          onClick={async () => {
                            try {
                              setIsInstallingChrome(true);
                              showToast('Iniciando instalación de Chrome/Puppeteer en el servidor. Esto puede tomar unos minutos...');
                              const res = await fetch(getApiUrl('/whatsapp/install-chromium'), { method: 'POST' });
                              if (res.ok) {
                                showAlert('Chrome/Puppeteer se instaló correctamente en el servidor. El servicio de WhatsApp se reiniciará.', 'Instalación Exitosa', 'success');
                                fetchWaStatus();
                              } else {
                                const errData = await res.json().catch(() => ({}));
                                showAlert(`Error al instalar: ${errData.error || 'Desconocido'}`, 'Fallo de Instalación', 'error');
                              }
                            } catch (err: any) {
                              showAlert(`Error de red: ${err.message}`, 'Error', 'error');
                            } finally {
                              setIsInstallingChrome(false);
                            }
                          }}
                          className={`w-full text-xs font-bold py-2 px-3 rounded-lg font-sans transition-all text-white flex items-center justify-center gap-1.5 shadow-sm ${
                            isInstallingChrome ? 'bg-amber-400 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700 active:scale-95'
                          }`}
                        >
                          <Settings className="w-3.5 h-3.5" />
                          <span>{isInstallingChrome ? '⏳ Instalando Chrome...' : '🔧 Instalar / Reparar Chrome'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* QR Code display or Connected state info */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
                    {waStatus.status === 'QR_READY' && waStatus.qr ? (
                      <div className="space-y-4 flex flex-col items-center">
                        <div className="flex items-center justify-between w-full border-b border-slate-100 pb-1">
                          <span className="text-[11px] font-bold font-sans text-slate-700 uppercase tracking-wide">Código QR de Vinculación</span>
                          <button
                            type="button"
                            onClick={handleResetSession}
                            disabled={isResettingSession}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                            title="Generar otro código QR"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Regenerar</span>
                          </button>
                        </div>
                        <div className="p-3 bg-white border-2 border-slate-200 rounded-xl shadow-md">
                          <img src={waStatus.qr} alt="Código QR de WhatsApp" className="w-48 h-48 rounded" />
                        </div>
                        <div className="max-w-xs space-y-1 text-slate-600">
                          <p className="text-[11px] font-sans font-bold text-indigo-900 uppercase">¿Cómo escanear?</p>
                          <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                            Abra WhatsApp en su teléfono &gt; <strong>Dispositivos vinculados</strong> &gt; <strong>Vincular un dispositivo</strong> &gt; Escanee el código QR.
                          </p>
                        </div>
                      </div>
                    ) : waStatus.status === 'CONNECTED' ? (
                      <div className="space-y-3 p-4">
                        <div className="w-16 h-16 bg-emerald-50 border-2 border-emerald-300 rounded-full flex items-center justify-center mx-auto text-emerald-600 text-2xl shadow-sm">
                          ✓
                        </div>
                        <h4 className="text-sm font-black text-slate-800 uppercase font-sans tracking-wide">¡Sesión Activa y Vinculada!</h4>
                        <p className="text-xs text-slate-500 max-w-xs mx-auto font-sans leading-relaxed">
                          El bot de WhatsApp está conectado y listo para despachar reportes y comprobantes automáticamente.
                        </p>
                      </div>
                    ) : waStatus.status === 'AUTHENTICATING' ? (
                      <div className="space-y-3 p-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-200 border-t-indigo-600 mx-auto" />
                        <h4 className="text-xs font-bold text-slate-700 font-sans">Iniciando motor de WhatsApp...</h4>
                        <p className="text-[10.5px] text-slate-500 font-sans max-w-xs">
                          Cargando entorno seguro de Chrome y sincronizando con WhatsApp. Si tarda mucho, use el botón de <strong>Desbloquear Sesión</strong>.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 text-slate-400 p-4">
                        <span className="text-4xl block">🔌</span>
                        <p className="text-xs font-sans font-bold text-slate-600">Servicio deshabilitado o inactivo</p>
                        <p className="text-[10.5px] max-w-xs font-sans text-slate-400">
                          Active la casilla "Habilitar Integración de WhatsApp" en el panel derecho para activar el motor.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* NUEVO PANEL DE AUTOGESTION Y DESBLOQUEO DE SESIONES */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/60 rounded-xl p-5 shadow-lg text-white space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-800/60 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600/40 border border-indigo-500/50 flex items-center justify-center text-indigo-300">
                        <Unlock className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-white font-sans">
                          Centro de Autogestión y Desbloqueo de Sesiones
                        </h3>
                        <p className="text-[10px] text-indigo-200/80 font-sans">
                          Resuelva fallos de sesión, procesos atrapados de Chrome o errores de timeout con un solo clic.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* BOTÓN 1: DESBLOQUEAR SESIONES ATRAPADAS */}
                    <button
                      type="button"
                      disabled={isUnlockingSession}
                      onClick={handleUnlockSession}
                      className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 p-3 rounded-xl text-left transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group flex flex-col justify-between"
                      title="Cierra procesos colgados de Chrome y elimina archivos de bloqueo sin borrar credenciales"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-md bg-amber-500/30 flex items-center justify-center text-amber-300 group-hover:scale-110 transition-transform">
                          <Unlock className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-amber-200 font-sans">
                          {isUnlockingSession ? 'Desbloqueando...' : 'Desbloquear Sesión'}
                        </span>
                      </div>
                      <p className="text-[9.5px] text-slate-300/90 font-sans leading-tight">
                        Cierra procesos huérfanos de Chrome en segundo plano y libera bloqueos de archivo.
                      </p>
                    </button>

                    {/* BOTÓN 2: RESTABLECER Y FORZAR NUEVO QR */}
                    <button
                      type="button"
                      disabled={isResettingSession}
                      onClick={handleResetSession}
                      className="bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 p-3 rounded-xl text-left transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group flex flex-col justify-between"
                      title="Limpia por completo sesiones corruptas y genera un nuevo código QR limpio"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-md bg-rose-500/30 flex items-center justify-center text-rose-300 group-hover:scale-110 transition-transform">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-rose-200 font-sans">
                          {isResettingSession ? 'Restableciendo...' : 'Restablecer y Nuevo QR'}
                        </span>
                      </div>
                      <p className="text-[9.5px] text-slate-300/90 font-sans leading-tight">
                        Elimina datos temporales corruptos y genera un código QR fresco para vincular.
                      </p>
                    </button>

                    {/* BOTÓN 3: REINICIAR MOTOR */}
                    <button
                      type="button"
                      disabled={isRestartingWa}
                      onClick={handleRestartWa}
                      className="bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 p-3 rounded-xl text-left transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group flex flex-col justify-between"
                      title="Reinicia el servicio de WhatsApp en el backend"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-md bg-sky-500/30 flex items-center justify-center text-sky-300 group-hover:scale-110 transition-transform">
                          <RefreshCw className={`w-3.5 h-3.5 ${isRestartingWa ? 'animate-spin' : ''}`} />
                        </div>
                        <span className="text-xs font-bold text-sky-200 font-sans">
                          {isRestartingWa ? 'Reiniciando...' : 'Reiniciar Motor'}
                        </span>
                      </div>
                      <p className="text-[9.5px] text-slate-300/90 font-sans leading-tight">
                        Reinicia el cliente en segundo plano y comprueba el estado de conexión.
                      </p>
                    </button>
                  </div>
                </div>

                {/* GUIA DE RESOLUCION DE PROBLEMAS (TROUBLESHOOTING) */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 font-sans text-xs">
                  <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5 font-sans border-b border-slate-100 pb-2 text-indigo-700">
                    <ShieldAlert className="w-4 h-4 text-indigo-650" />
                    Guía de Resolución de Problemas y Diagnóstico
                  </h3>
                  
                  <div className="space-y-4 text-[11px] leading-relaxed text-slate-600">
                    <div className="space-y-1.5">
                      <h4 className="font-extrabold text-slate-800 uppercase tracking-wide text-[10.5px]">⚠️ El Bot no genera el código QR o dice "auth timeout"</h4>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Haga clic en el botón <strong>"🔓 Desbloquear Sesión"</strong> para cerrar cualquier proceso oculto de Chrome y liberar los archivos de perfil.</li>
                        <li>Si el problema persiste, presione <strong>"🔄 Restablecer y Nuevo QR"</strong> para crear una sesión totalmente limpia.</li>
                      </ul>
                    </div>

                    <div className="space-y-1.5">
                      <h4 className="font-extrabold text-slate-800 uppercase tracking-wide text-[10.5px]">🔌 Desconexiones o Falla de Envío</h4>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Conexión a Internet:</strong> El servidor local requiere acceso a internet para comunicarse con los servidores de WhatsApp.</li>
                        <li><strong>Enlace de Grupo:</strong> Asegúrese de escribir el enlace de invitación de grupo de WhatsApp completo (<code className="bg-slate-100 text-indigo-700 px-1 rounded font-mono">https://chat.whatsapp.com/...</code>) o el ID correspondiente.</li>
                      </ul>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[10px] text-slate-500 font-sans">
                      <strong>💡 Autogestión 100% desde la Interfaz:</strong> Ya no necesita abrir terminales de Node.js ni la consola de comandos CMD. Todas las operaciones de mantenimiento se realizan pulsando los botones del panel superior.
                    </div>
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN: CONFIG FORM CARD */}
              <form onSubmit={handleSaveWaConfig} className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
                <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5 font-sans border-b border-slate-100 pb-2">
                  <Settings className="w-4 h-4 text-indigo-650" />
                  Configuración del Grupo & Notificaciones
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Enable checkbox */}
                  <div className="flex flex-col gap-1.5 justify-center">
                    <label className="text-[10px] font-bold font-sans uppercase text-slate-500 tracking-wide">Estado de la Integración</label>
                    <label className="flex items-center gap-2.5 bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs select-none cursor-pointer hover:bg-slate-100/50 transition-all">
                      <input
                        type="checkbox"
                        checked={waConfig.enabled}
                        onChange={(e) => setWaConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-350 focus:ring-indigo-500"
                      />
                      <span className="font-sans font-bold text-slate-750">Habilitar Integración de WhatsApp</span>
                    </label>
                    <p className="text-[9px] text-slate-400 font-sans">Activa el bot en segundo plano del servidor local.</p>
                  </div>

                  {/* Group ID / Invite Link */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold font-sans uppercase text-slate-500 tracking-wide">Grupo de Destino (Link de Invitación / ID)</label>
                    <input
                      type="text"
                      value={waConfig.groupId}
                      onChange={(e) => setWaConfig(prev => ({ ...prev, groupId: e.target.value }))}
                      placeholder="https://chat.whatsapp.com/..."
                      required={waConfig.enabled}
                      disabled={!waConfig.enabled}
                      className="bg-slate-5- border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none font-sans w-full disabled:opacity-50"
                    />
                    <p className="text-[9px] text-slate-400 font-sans leading-relaxed">
                      Copie y pegue el enlace de invitación de su grupo de WhatsApp. El bot se unirá automáticamente para mandar los arqueos.
                    </p>
                  </div>
                </div>

                {/* MESSAGE TEMPLATE & PREVIEW AREA */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 border-t border-slate-100 pt-5">
                  {/* Template Editor */}
                  <div className="lg:col-span-3 space-y-4">
                    {/* Selector de Pestaña de Plantilla */}
                    <div className="flex gap-2 border-b border-slate-200 pb-2">
                      <button
                        type="button"
                        onClick={() => setWaTemplateTab('cierre')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 ${
                          waTemplateTab === 'cierre'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        📦 Plantilla Cierre de Caja
                      </button>
                      <button
                        type="button"
                        onClick={() => setWaTemplateTab('utilidades')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 ${
                          waTemplateTab === 'utilidades'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        💼 Plantilla Distribución Utilidades
                      </button>
                    </div>

                    {waTemplateTab === 'cierre' ? (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold font-sans uppercase text-slate-500 tracking-wide">Plantilla del Mensaje de Arqueo y Cierre</label>
                          <textarea
                            value={waConfig.messageTemplate}
                            onChange={(e) => setWaConfig(prev => ({ ...prev, messageTemplate: e.target.value }))}
                            disabled={!waConfig.enabled}
                            rows={14}
                            className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none font-mono w-full disabled:opacity-50"
                            placeholder="Escriba la plantilla del mensaje de WhatsApp..."
                          />
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                          <span className="text-[9px] font-bold text-slate-600 uppercase font-sans tracking-wide block">Variables Disponibles (Arqueo y Cierre)</span>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9.5px] font-sans text-slate-500">
                            <div><code className="bg-white border px-1 py-0.5 rounded text-indigo-700 font-mono font-bold">{'{fecha}'}</code>: Fecha y hora</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-indigo-700 font-mono font-bold">{'{usuario}'}</code>: Nombre del cajero</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-indigo-700 font-mono font-bold">{'{terminal}'}</code>: Nombre de la terminal</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-indigo-700 font-mono font-bold">{'{dineroEnCajaExpected}'}</code>: USD esperado</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-indigo-700 font-mono font-bold">{'{expectedVes}'}</code>: VES esperado</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-indigo-700 font-mono font-bold">{'{realUsd}'}</code>: USD real contado</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-indigo-700 font-mono font-bold">{'{realVes}'}</code>: VES real contado</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-indigo-700 font-mono font-bold">{'{diffUsd}'}</code>: Diferencia USD</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-indigo-700 font-mono font-bold">{'{diffVes}'}</code>: Diferencia VES</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-indigo-700 font-mono font-bold">{'{ventaTotalUsd}'}</code>: Venta neta total</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-indigo-700 font-mono font-bold">{'{descuentosUsd}'}</code>: Descuentos total</div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold font-sans uppercase text-slate-500 tracking-wide">Plantilla del Reporte de Utilidades y Gastos</label>
                          <textarea
                            value={waConfig.utilidadesMessageTemplate || ''}
                            onChange={(e) => setWaConfig(prev => ({ ...prev, utilidadesMessageTemplate: e.target.value }))}
                            disabled={!waConfig.enabled}
                            rows={14}
                            className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none font-mono w-full disabled:opacity-50"
                            placeholder="Escriba la plantilla del reporte de utilidades..."
                          />
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                          <span className="text-[9px] font-bold text-slate-600 uppercase font-sans tracking-wide block">Variables Disponibles (Distribución de Utilidades)</span>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9.5px] font-sans text-slate-500">
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{empresa}'}</code>: Nombre del comercio</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{fecha}'}</code>: Fecha del reporte</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{tasaBcv}'}</code>: Tasa oficial de cambio</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{utilidadBrutaUsd}'}</code>: Utilidad Bruta $</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{utilidadBrutaVes}'}</code>: Utilidad Bruta Bs</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{totalGastosUsd}'}</code>: Total Gastos $</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{totalGastosVes}'}</code>: Total Gastos Bs</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{utilidadNetaUsd}'}</code>: Utilidad Neta $</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{utilidadNetaVes}'}</code>: Utilidad Neta Bs</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{cantGastos}'}</code>: Cantidad de gastos</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{desgloseGastos}'}</code>: Lista de gastos</div>
                            <div><code className="bg-white border px-1 py-0.5 rounded text-emerald-700 font-mono font-bold">{'{desgloseAccionistas}'}</code>: Cobro accionistas</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Live Preview */}
                  <div className="lg:col-span-2 flex flex-col">
                    <span className="text-[10px] font-bold font-sans uppercase text-slate-500 tracking-wide mb-1.5">
                      Vista Previa ({waTemplateTab === 'cierre' ? 'Cierre de Caja' : 'Distribución Utilidades'})
                    </span>
                    <div className="flex-grow border border-slate-200 rounded-xl overflow-hidden shadow-md flex flex-col min-h-[450px]" style={{ backgroundColor: '#efeae2' }}>
                      {/* Header preview bubble */}
                      <div className="bg-[#075e54] px-4 py-2.5 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-700/60 flex items-center justify-center text-white text-xs font-bold font-sans">
                          🤖
                        </div>
                        <div className="flex flex-col text-left">
                          <span className="text-white font-sans font-bold text-[11px] leading-tight">WinterPos Bot</span>
                          <span className="text-emerald-100 font-sans text-[8.5px] leading-tight">en línea</span>
                        </div>
                      </div>

                      {/* Chat Messages */}
                      <div className="p-3 flex-grow flex flex-col justify-start space-y-3 overflow-y-auto max-h-[400px]">
                        {/* Image preview mock */}
                        <div className="bg-[#d9fdd3] p-1.5 rounded-lg shadow-sm border border-emerald-100/50 self-start max-w-[90%] flex flex-col">
                          <div className="bg-slate-100/80 rounded flex items-center justify-center h-28 w-full text-slate-400 font-sans text-[10px] gap-1.5 flex-shrink-0">
                            🖼️ <span>[{waTemplateTab === 'cierre' ? 'Imagen del Cierre y Arqueo' : 'Imagen del Reporte de Utilidades'}]</span>
                          </div>
                          { (waTemplateTab === 'cierre' ? waConfig.messageTemplate : waConfig.utilidadesMessageTemplate) ? (
                            <div 
                              className="p-2 text-slate-800 text-[10px] font-sans text-left leading-relaxed break-all select-text whitespace-pre-wrap"
                              dangerouslySetInnerHTML={{ __html: formatWhatsAppMessage(getTemplatePreview(waTemplateTab === 'cierre' ? waConfig.messageTemplate : (waConfig.utilidadesMessageTemplate || ''))) }}
                            />
                          ) : (
                            <span className="p-2 text-slate-400 italic text-[10px] font-sans text-left">
                              Sin plantilla definida. Se enviará el formato por defecto.
                            </span>
                          )}
                          <span className="text-[8px] text-slate-400 text-right pr-1 pb-1 font-sans">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="submit"
                    disabled={isWaLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold font-sans text-xs px-6 py-2.5 rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                  >
                    {isWaLoading ? 'Guardando...' : 'Guardar Configuración'}
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}

      </div>

      {/* USER MODAL FORM */}
      {showUserModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-left">
          <form onSubmit={handleSaveUser} className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl p-6 space-y-4 text-slate-800">
            <h3 className="text-sm font-extrabold text-slate-700 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Users className="w-4 h-4 text-winter-configStart" />
              {editingUser ? `Modificar Usuario: ${editingUser.usuario.toUpperCase()}` : 'Registrar Nuevo Usuario'}
            </h3>

            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded text-[10px] font-sans">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1 font-sans">Usuario (Login)</label>
                <input
                  type="text"
                  required
                  disabled={!!editingUser}
                  placeholder=""
                  autoComplete="off"
                  value={userForm.usuario}
                  onChange={(e) => {
                    const cleanVal = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
                    setUserForm(prev => ({ ...prev, usuario: cleanVal }));
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs focus:bg-white focus:border-winter-configStart focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1 font-sans">Nombre Completo</label>
                <input
                  type="text"
                  required
                  placeholder=""
                  autoComplete="off"
                  value={userForm.nombre}
                  onChange={(e) => setUserForm(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1 font-sans">Contraseña / PIN</label>
                <input
                  type="password"
                  required={!editingUser}
                  placeholder=""
                  autoComplete="new-password"
                  value={userForm.clave}
                  onChange={(e) => setUserForm(prev => ({ ...prev, clave: e.target.value.toLowerCase() }))}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs focus:bg-white focus:border-winter-configStart focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1 font-sans">Perfil / Rol Base</label>
                <select
                  value={userForm.rol?.toUpperCase()}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setUserForm(prev => ({ ...prev, rol: val }));
                    handleApplyRolePermissions(val);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs focus:bg-white focus:border-winter-configStart focus:outline-none font-sans font-bold"
                >
                  <option value="">Seleccione...</option>
                  <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                  {roleList
                    .filter(r => r.nombre?.trim().toUpperCase() !== 'ADMINISTRADOR')
                    .map(r => (
                      <option key={r.id} value={r.nombre.toUpperCase()}>{r.nombre.toUpperCase()}</option>
                    ))
                  }
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1 font-sans">Estado</label>
                <select
                  value={userForm.estado}
                  onChange={(e) => setUserForm(prev => ({ ...prev, estado: e.target.value as any }))}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
            </div>

            {/* PERMISSIONS MATRIX */}
            <div className="border-t border-slate-100 pt-3 text-left">
              <label className="text-xs font-bold text-slate-700 block mb-2 font-sans">Matriz de Permisos Personalizados</label>
              
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                <table className="w-full text-left font-sans text-[10px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-250 text-slate-650 uppercase font-bold">
                      <th className="py-2 px-3 text-left">Módulo</th>
                      {ACCIONES_PERMISOS.map(act => (
                        <th key={act.id} className="py-2 px-2 text-center">{act.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULOS_PERMISOS.map(mod => (
                      <tr key={mod.id} className="border-b border-slate-200/55 hover:bg-slate-100/50">
                        <td className="py-2 px-3 font-bold text-slate-700 text-left">{mod.label}</td>
                        {ACCIONES_PERMISOS.map(act => {
                          const isChecked = !!userForm.permisos[mod.id]?.[act.id];
                          return (
                            <td key={act.id} className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setUserForm(prev => {
                                    const nextPerms = { ...prev.permisos };
                                    const currentModPerms = nextPerms[mod.id] || { ver: false, crear: false, editar: false, eliminar: false };
                                    nextPerms[mod.id] = {
                                      ...currentModPerms,
                                      [act.id]: !currentModPerms[act.id]
                                    };
                                    return { ...prev, permisos: nextPerms };
                                  });
                                }}
                                className="inline-flex items-center justify-center p-1 text-slate-400 hover:text-sky-600 transition-all"
                              >
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-sky-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-350" />
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PRECIO COSTO VISIBILITY PERMISSION TOGGLE FOR USER */}
              <div className="mt-3 p-2.5 bg-amber-50/80 border border-amber-250 rounded-lg flex items-center justify-between gap-3 shadow-2xs font-sans">
                <div className="flex items-start gap-2">
                  <DollarSign className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800 text-[11px] block">
                      Visualizar Precios de Costo y Valoración Financiera (F2 Inventario)
                    </span>
                    <span className="text-[10px] text-slate-600 block leading-tight mt-0.5">
                      Permite ver la columna <strong className="text-amber-900">"P. Costo"</strong> en catálogo y totales de costos en barra superior.
                    </span>
                  </div>
                </div>

                {userForm.rol?.toUpperCase() === 'ADMINISTRADOR' ? (
                  <span className="px-2 py-1 bg-amber-100 border border-amber-300 text-amber-800 rounded font-bold text-[9px] uppercase whitespace-nowrap">
                    Siempre Visible (Admin)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setUserForm(prev => {
                        const nextPerms = { ...prev.permisos };
                        const currInv = nextPerms.inventario || { ver: false, crear: false, editar: false, eliminar: false };
                        nextPerms.inventario = {
                          ...currInv,
                          ver_costos: !currInv.ver_costos
                        };
                        return { ...prev, permisos: nextPerms };
                      });
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded border transition-all cursor-pointer bg-white border-slate-300 hover:border-amber-500 text-slate-700"
                  >
                    {userForm.permisos?.inventario?.ver_costos ? (
                      <span className="flex items-center gap-1 text-emerald-700 font-bold text-[10.5px]">
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> Visible
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400 font-medium text-[10.5px]">
                        <Square className="w-3.5 h-3.5 text-slate-350" /> Oculto
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2.5 pt-3">
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                className="w-1/3 bg-slate-100 hover:bg-slate-200 border border-slate-250 text-slate-600 py-2.5 rounded font-sans text-xs transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-2/3 bg-winter-configStart hover:bg-winter-configEnd text-white py-2.5 rounded font-bold font-sans text-xs transition-all shadow-sm"
              >
                Guardar Usuario
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ROLE MODAL FORM */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-left">
          <form onSubmit={handleSaveRole} className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl p-6 space-y-4 text-slate-800">
            <h3 className="text-sm font-extrabold text-slate-700 border-b border-slate-100 pb-2 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-winter-configStart" />
              {editingRole ? `Modificar Perfil: ${editingRole.nombre.toUpperCase()}` : 'Registrar Nuevo Perfil de Rol'}
            </h3>

            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded text-[10px] font-sans">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="text-[10px] text-slate-500 block mb-1 font-sans">Nombre del Rol / Perfil</label>
              <input
                type="text"
                required
                disabled={editingRole?.nombre?.trim().toUpperCase() === 'ADMINISTRADOR'}
                placeholder=""
                autoComplete="off"
                value={roleForm.nombre}
                onChange={(e) => setRoleForm(prev => ({ ...prev, nombre: e.target.value.toUpperCase() }))}
                className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs focus:bg-white focus:border-winter-configStart focus:outline-none font-sans font-bold disabled:bg-slate-100 disabled:text-slate-500 uppercase"
              />
            </div>

            {/* PERMISSIONS MATRIX */}
            <div className="border-t border-slate-100 pt-3 text-left">
              <label className="text-xs font-bold text-slate-700 block mb-2 font-sans">Matriz de Permisos del Perfil</label>
              
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                <table className="w-full text-left font-sans text-[10px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-255 text-slate-655 uppercase font-bold">
                      <th className="py-2 px-3 text-left">Módulo</th>
                      {ACCIONES_PERMISOS.map(act => (
                        <th key={act.id} className="py-2 px-2 text-center">{act.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULOS_PERMISOS.map(mod => (
                      <tr key={mod.id} className="border-b border-slate-200/55 hover:bg-slate-100/50">
                        <td className="py-2 px-3 font-bold text-slate-700 text-left">{mod.label}</td>
                        {ACCIONES_PERMISOS.map(act => {
                          const isChecked = !!roleForm.permisos[mod.id]?.[act.id];
                          return (
                            <td key={act.id} className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setRoleForm(prev => {
                                    const nextPerms = { ...prev.permisos };
                                    const currentModPerms = nextPerms[mod.id] || { ver: false, crear: false, editar: false, eliminar: false };
                                    nextPerms[mod.id] = {
                                      ...currentModPerms,
                                      [act.id]: !currentModPerms[act.id]
                                    };
                                    return { ...prev, permisos: nextPerms };
                                  });
                                }}
                                className="inline-flex items-center justify-center p-1 text-slate-400 hover:text-sky-600 transition-all"
                              >
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-sky-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-350" />
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PRECIO COSTO VISIBILITY PERMISSION TOGGLE FOR ROLE */}
              <div className="mt-3 p-2.5 bg-amber-50/80 border border-amber-250 rounded-lg flex items-center justify-between gap-3 shadow-2xs font-sans">
                <div className="flex items-start gap-2">
                  <DollarSign className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800 text-[11px] block">
                      Visualizar Precios de Costo y Valoración Financiera (F2 Inventario)
                    </span>
                    <span className="text-[10px] text-slate-600 block leading-tight mt-0.5">
                      Permite ver la columna <strong className="text-amber-900">"P. Costo"</strong> en catálogo y totales de costos en barra superior.
                    </span>
                  </div>
                </div>

                {roleForm.nombre?.trim().toUpperCase() === 'ADMINISTRADOR' ? (
                  <span className="px-2 py-1 bg-amber-100 border border-amber-300 text-amber-800 rounded font-bold text-[9px] uppercase whitespace-nowrap">
                    Siempre Visible (Admin)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRoleForm(prev => {
                        const nextPerms = { ...prev.permisos };
                        const currInv = nextPerms.inventario || { ver: false, crear: false, editar: false, eliminar: false };
                        nextPerms.inventario = {
                          ...currInv,
                          ver_costos: !currInv.ver_costos
                        };
                        return { ...prev, permisos: nextPerms };
                      });
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded border transition-all cursor-pointer bg-white border-slate-300 hover:border-amber-500 text-slate-700"
                  >
                    {roleForm.permisos?.inventario?.ver_costos ? (
                      <span className="flex items-center gap-1 text-emerald-700 font-bold text-[10.5px]">
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> Visible
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400 font-medium text-[10.5px]">
                        <Square className="w-3.5 h-3.5 text-slate-350" /> Oculto
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* Guía interactiva de permisos por Módulo */}
              <div className="mt-2 bg-[#08284c]/5 border border-indigo-200 rounded p-2.5 text-[9.5px] leading-relaxed text-slate-700 space-y-2">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-1.5 gap-2">
                  <span className="font-extrabold text-indigo-950 uppercase font-sans text-[10px] flex items-center gap-1">
                    💡 Guía de Operaciones por Módulo:
                  </span>
                  <div className="flex gap-1 overflow-x-auto">
                    {MODULOS_PERMISOS.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setActiveGuideModule(m.id)}
                        className={`px-1.5 py-0.5 rounded font-mono font-bold text-[8.5px] transition-all cursor-pointer ${
                          activeGuideModule === m.id
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 hover:bg-indigo-50 border border-slate-200'
                        }`}
                      >
                        {m.id.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const guide = MODULE_GUIDES_MAP[activeGuideModule] || MODULE_GUIDES_MAP.inventario;
                  return (
                    <div className="space-y-1 font-sans">
                      <span className="font-extrabold text-indigo-900 block text-[9.5px] uppercase font-mono">
                        📌 {guide.title}
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 bg-white p-2 rounded border border-slate-200 text-slate-700">
                        <div><strong className="text-sky-700">Ver:</strong> {guide.ver}</div>
                        <div><strong className="text-emerald-700">Crear:</strong> {guide.crear}</div>
                        <div><strong className="text-amber-700">Editar:</strong> {guide.editar}</div>
                        <div><strong className="text-rose-700">Eliminar:</strong> {guide.eliminar}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex gap-2.5 pt-3">
              <button
                type="button"
                onClick={() => setShowRoleModal(false)}
                className="w-1/3 bg-slate-100 hover:bg-slate-200 border border-slate-250 text-slate-600 py-2.5 rounded font-sans text-xs transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-2/3 bg-winter-configStart hover:bg-winter-configEnd text-white py-2.5 rounded font-bold font-sans text-xs transition-all shadow-sm"
              >
                Guardar Perfil
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MASTER PASS MODAL FOR DATABASE ACCESS */}
      <MasterPassModal
        isOpen={showMasterPassModal}
        onClose={() => setShowMasterPassModal(false)}
        onSuccess={() => {
          setShowMasterPassModal(false);
          setDbUnlocked(true);
          setActiveTab('db');
        }}
      />

    </div>
  );
}
