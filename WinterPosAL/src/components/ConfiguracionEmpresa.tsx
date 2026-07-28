import { useState, useEffect } from 'react';
import { CompanyConfig, User, Role, PrinterConfig, ScaleConfig } from '../types';
import { 
  Save, CheckCircle2, Users, HardDrive, Cpu, 
  Trash2, Edit, Plus, Download, Upload, ShieldAlert,
  Settings, CheckSquare, Square, Globe, ShieldCheck, Printer, FileText
} from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

interface ConfiguracionEmpresaProps {
  config: CompanyConfig;
  onSaveConfig: (newConfig: CompanyConfig) => void;
  currentUser: User;
  getApiUrl: (path: string) => string;
  onReloadUsers?: () => void;
  onWipeData?: (mode: 'inventory' | 'sales' | 'clients' | 'all' | 'stock') => void;
}

const MODULOS_PERMISOS = [
  { id: 'caja', label: 'F1 Caja / POS' },
  { id: 'inventario', label: 'F2 Inventario' },
  { id: 'ventas', label: 'F3 Historial Ventas' },
  { id: 'clientes', label: 'F4 Clientes' },
  { id: 'tasa', label: 'F9 Tasa de Cambio' },
  { id: 'config', label: 'F10 Configuración' }
];

const ACCIONES_PERMISOS = [
  { id: 'ver', label: 'Ver' },
  { id: 'crear', label: 'Crear' },
  { id: 'editar', label: 'Editar' },
  { id: 'eliminar', label: 'Eliminar' }
];

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
  const [subTabUsers, setSubTabUsers] = useState<'users' | 'roles'>('users');
  
  // WhatsApp bot states
  const [waConfig, setWaConfig] = useState({
    enabled: false,
    groupId: '',
    groupName: 'Grupo de Cierres POS',
    messageTemplate: ''
  });
  const [waStatus, setWaStatus] = useState<any>({
    status: 'DISCONNECTED',
    qr: '',
    isMock: false
  });
  const [isWaLoading, setIsWaLoading] = useState(false);
  const [isInstallingChrome, setIsInstallingChrome] = useState(false);
  
  // Success states
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Tab Empresa - States
  const [formData, setFormData] = useState<CompanyConfig>({ ...config });

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
            messageTemplate: data.config.messageTemplate || DEFAULT_WA_TEMPLATE
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
  const handleWipeDb = async (mode: 'inventory' | 'sales' | 'clients' | 'all' | 'stock') => {
    if (!dbConfirmWord.trim().toUpperCase().includes('CONFIRMAR')) {
      showAlert('Debe escribir la palabra de seguridad "CONFIRMAR" para poder procesar la limpieza.', 'Palabra de Seguridad Incorrecta', 'error');
      return;
    }
    
    let confirmMsg = '';
    if (mode === 'inventory') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de vaciar TODO el inventario y catálogo de productos? Esta acción no se puede deshacer.';
    else if (mode === 'stock') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de poner a cero las existencias (stock) de todos los productos? El catálogo de productos y precios se conservará.';
    else if (mode === 'sales') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de vaciar el historial de ventas, correlativos de facturas y cierres de caja?';
    else if (mode === 'clients') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de vaciar la lista de clientes registrados?';
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
      if (mode === 'clients' || mode === 'all') {
        localStorage.removeItem('pos_clients');
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
          wipeInventory: mode === 'inventory' || mode === 'all',
          wipeSales: mode === 'sales' || mode === 'all',
          wipeClients: mode === 'clients' || mode === 'all',
          wipeStock: mode === 'stock'
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
        a.download = `winterpos_backup_${new Date().toISOString().split('T')[0]}.json`;
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
    try {
      const res = await fetch(getApiUrl('/db/backup/schedule'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: dbBackupSchedule, hour: backupHour, specificDate: backupSpecificDate })
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
      .replace(/{fecha}/g, new Date().toLocaleString())
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
              onClick={() => setActiveTab('db')}
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
                    <p className="text-[10px] text-slate-500 font-sans">Elimina todas las transacciones históricas, reinicia folios de factura, limpia cierres de caja, vacía el kardex (movimientos) e historial de precios.</p>
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
                    <span className="font-bold text-slate-700 block">Vaciar Directorio de Clientes</span>
                    <p className="text-[10px] text-slate-500 font-sans">Elimina todos los clientes registrados, a excepción del cliente genérico (Consumidor Final).</p>
                  </div>
                  <button
                    onClick={() => handleWipeDb('clients')}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 py-2 rounded font-bold font-sans text-xs transition-all"
                  >
                    Borrar Directorio de Clientes
                  </button>
                </div>

                <div className="border border-red-200 bg-red-50/20 rounded-lg p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-red-700 block">⚠️ Limpieza General (Dejar en Blanco)</span>
                    <p className="text-[10px] text-slate-500 font-sans">Elimina toda la información general: productos, clientes, ventas, abonos y cierres, listos para empezar una nueva instalación.</p>
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
                        min={new Date().toISOString().split('T')[0]}
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
                  {/* WhatsApp Connection status */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 flex flex-col justify-between h-full">
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5 font-sans">
                        <Globe className="w-4 h-4 text-indigo-650" />
                        Estado del Servicio
                      </h3>
                      
                      <div className="p-4 rounded-lg bg-slate-50 border border-slate-150 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full animate-pulse ${
                            waStatus.status === 'CONNECTED' ? 'bg-emerald-500' :
                            waStatus.status === 'QR_READY' ? 'bg-amber-500' :
                            waStatus.status === 'AUTHENTICATING' ? 'bg-sky-500' : 'bg-red-500'
                          }`} />
                          <span className="text-xs font-extrabold uppercase font-sans text-slate-700">
                            {waStatus.status === 'CONNECTED' ? '🟢 Conectado' :
                             waStatus.status === 'QR_READY' ? '🟡 Esperando Escaneo' :
                             waStatus.status === 'AUTHENTICATING' ? '🔵 Autenticando...' : '🔴 Desconectado'}
                          </span>
                        </div>
                        
                        <p className="text-[10px] text-slate-500 leading-normal font-sans">
                          {waStatus.status === 'CONNECTED' ? 'El servidor central tiene una sesión activa vinculada. Los reportes se enviarán de forma automática.' :
                           waStatus.status === 'QR_READY' ? 'Requiere vincular una cuenta. Escanee el código QR de la derecha con la cámara de su WhatsApp.' :
                           waStatus.status === 'AUTHENTICATING' ? 'Conectando con los servidores de WhatsApp. Por favor espere...' : 
                           'La integración está inactiva o requiere habilitarse en el panel.'}
                        </p>

                        {waStatus.isMock && (
                          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                            <p className="text-[10px] text-amber-800 leading-normal font-sans">
                              ⚠️ <strong>Modo Simulación Activo:</strong> El motor de WhatsApp real (Chrome/Puppeteer) no está listo o falta instalarlo en el servidor.
                            </p>
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
                                    const errData = await res.json();
                                    showAlert(`Error al instalar: ${errData.error || 'Desconocido'}`, 'Fallo de Instalación', 'error');
                                  }
                                } catch (err: any) {
                                  showAlert(`Error de red: ${err.message}`, 'Error', 'error');
                                } finally {
                                  setIsInstallingChrome(false);
                                }
                              }}
                              className={`w-full text-[10px] font-bold py-1.5 px-3 rounded font-sans transition-all text-white ${
                                isInstallingChrome ? 'bg-amber-400 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700'
                              }`}
                            >
                              {isInstallingChrome ? '⏳ Instalando Chrome...' : '🔧 Instalar/Reparar Chrome (Puppeteer)'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {waStatus.status === 'CONNECTED' && (
                      <button
                        type="button"
                        onClick={handleSendTestMessage}
                        className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 py-2.5 rounded-lg text-xs font-bold font-sans transition-all active:scale-95 flex items-center justify-center gap-1.5 mt-4"
                      >
                        <span>🧪 Enviar Mensaje de Prueba</span>
                      </button>
                    )}
                  </div>

                  {/* QR Code display or Connected state info */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
                    {waStatus.status === 'QR_READY' && waStatus.qr ? (
                      <div className="space-y-4 flex flex-col items-center">
                        <span className="text-[11px] font-bold font-sans text-slate-600 uppercase tracking-wide">Código QR de Vinculación</span>
                        <div className="p-3 bg-white border-2 border-slate-100 rounded-xl shadow-inner">
                          <img src={waStatus.qr} alt="Código QR de WhatsApp" className="w-48 h-48" />
                        </div>
                        <div className="max-w-md space-y-1">
                          <p className="text-[11px] font-sans font-bold text-indigo-900 uppercase">¿Cómo escanear?</p>
                          <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                            Abra WhatsApp en su teléfono &gt; Dispositivos vinculados &gt; Vincular un dispositivo &gt; Escanee el código QR.
                          </p>
                        </div>
                      </div>
                    ) : waStatus.status === 'CONNECTED' ? (
                      <div className="space-y-3">
                        <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-emerald-500 text-2xl">
                          ✓
                        </div>
                        <h4 className="text-sm font-black text-slate-800 uppercase font-sans tracking-wide">¡Sesión Activa y Vinculada!</h4>
                        <p className="text-xs text-slate-500 max-w-md mx-auto font-sans leading-relaxed">
                          El bot de WhatsApp está conectado. Los arqueos de caja se notificarán de forma automatizada al grupo especificado en la configuración.
                        </p>
                      </div>
                    ) : waStatus.status === 'AUTHENTICATING' ? (
                      <div className="space-y-3">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-650 mx-auto" />
                        <p className="text-xs text-slate-500 font-sans">Estableciendo conexión y generando código QR. Un momento...</p>
                      </div>
                    ) : (
                      <div className="space-y-2 text-slate-400">
                        <span className="text-4xl block">🔌</span>
                        <p className="text-xs font-sans font-bold">Servicio deshabilitado</p>
                        <p className="text-[10px] max-w-xs font-sans">Active la casilla "Habilitar Integración de WhatsApp" en la sección de la derecha para iniciar el servicio.</p>
                      </div>
                    )}
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
                      <h4 className="font-extrabold text-slate-800 uppercase tracking-wide text-[10.5px]">⚠️ El Bot no genera el código QR</h4>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Primer inicio lento:</strong> La primera inicialización puede tardar hasta 1-2 minutos mientras carga.</li>
                        <li><strong>Bloqueo de Sesiones:</strong> Si la vinculación está colgada, intenta limpiar las credenciales eliminando la carpeta <code className="bg-slate-100 text-indigo-700 px-1 rounded font-mono">.wwebjs_auth</code> en el servidor.</li>
                      </ul>
                    </div>

                    <div className="space-y-1.5">
                      <h4 className="font-extrabold text-slate-800 uppercase tracking-wide text-[10.5px]">🔌 Desconexiones o Falla de Envío</h4>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Sin Conexión:</strong> Si el servidor pierde acceso a internet, la vinculación fallará.</li>
                        <li><strong>Enlace de Grupo:</strong> Asegúrese de escribir el enlace de invitación de grupo de WhatsApp completo (<code className="bg-slate-100 text-indigo-700 px-1 rounded font-mono">https://chat.whatsapp.com/...</code>).</li>
                      </ul>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[10px] text-slate-500 font-sans">
                      <strong>💡 Tip:</strong> Si el estado sigue en desconectado, desmarca la casilla, guarda, espera 5 segundos y vuelve a marcarla para reiniciar el servicio.
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
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold font-sans uppercase text-slate-500 tracking-wide">Plantilla del Mensaje de Arqueo</label>
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
                      <span className="text-[9px] font-bold text-slate-600 uppercase font-sans tracking-wide block">Variables Disponibles (Reemplazo Dinámico)</span>
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
                  </div>

                  {/* Live Preview */}
                  <div className="lg:col-span-2 flex flex-col">
                    <span className="text-[10px] font-bold font-sans uppercase text-slate-500 tracking-wide mb-1.5">Vista Previa (Diseño WhatsApp)</span>
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
                            🖼️ <span>[Imagen del Cierre y Arqueo]</span>
                          </div>
                          {waConfig.messageTemplate ? (
                            <div 
                              className="p-2 text-slate-800 text-[10px] font-sans text-left leading-relaxed break-all select-text"
                              dangerouslySetInnerHTML={{ __html: formatWhatsAppMessage(getTemplatePreview(waConfig.messageTemplate)) }}
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
                  onChange={(e) => setUserForm(prev => ({ ...prev, usuario: e.target.value }))}
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
                  onChange={(e) => setUserForm(prev => ({ ...prev, clave: e.target.value }))}
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

    </div>
  );
}
