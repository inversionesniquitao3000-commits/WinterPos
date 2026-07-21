import React, { useState, useEffect } from 'react';
import { CompanyConfig, User, Role, PrinterConfig, ScaleConfig } from '../types';
import { 
  Save, CheckCircle2, Users, HardDrive, Cpu, 
  Trash2, Edit, Plus, Download, Upload, ShieldAlert,
  Settings, CheckSquare, Square
} from 'lucide-react';

interface ConfiguracionEmpresaProps {
  config: CompanyConfig;
  onSaveConfig: (newConfig: CompanyConfig) => void;
  currentUser: User;
  getApiUrl: (path: string) => string;
  onReloadUsers?: () => void;
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

export default function ConfiguracionEmpresa({ 
  config, 
  onSaveConfig, 
  currentUser, 
  getApiUrl, 
  onReloadUsers 
}: ConfiguracionEmpresaProps) {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'empresa' | 'usuarios' | 'perifericos' | 'db'>('empresa');
  const [subTabUsers, setSubTabUsers] = useState<'users' | 'roles'>('users');
  
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

  // 4. Tab Base de Datos - States
  const [dbConfirmWord, setDbConfirmWord] = useState('');
  const [dbBackupSchedule, setDbBackupSchedule] = useState(() => {
    return localStorage.getItem('pos_backup_schedule') || 'Diario';
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
      rol: 'Vendedor',
      clave: 'admin',
      estado: 'Activo',
      permisos: getEmptyPerms()
    });
    setShowUserModal(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    let rolVal = u.rol;
    if (u.rol.toLowerCase() === 'administrador') rolVal = 'Administrador';
    if (u.rol.toLowerCase() === 'vendedor' || u.rol.toLowerCase() === 'cajero / vendedor') rolVal = 'Cajero / Vendedor';

    setUserForm({
      usuario: u.usuario,
      nombre: u.nombre,
      rol: rolVal,
      clave: u.clave || 'admin',
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
        rol: userForm.rol,
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
      alert('No puedes eliminar tu propio usuario activo en sesión.');
      return;
    }
    if (!window.confirm('¿Está seguro de eliminar de forma definitiva este usuario del sistema?')) return;

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
    setEditingRole(r);
    setRoleForm({
      nombre: r.nombre,
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
        nombre: roleForm.nombre.trim(),
        permisos: roleForm.permisos
      };

      const url = editingRole ? getApiUrl(`/roles/${editingRole.id}`) : getApiUrl('/roles');
      const method = editingRole ? 'PUT' : 'POST';

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

  const handleDeleteRole = async (id: number) => {
    if (!window.confirm('¿Está seguro de eliminar este perfil de rol?')) return;
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
    const role = roleList.find(r => 
      r.nombre.toLowerCase() === roleName.toLowerCase() ||
      (roleName.toLowerCase() === 'cajero / vendedor' && r.nombre.toLowerCase() === 'vendedor') ||
      (roleName.toLowerCase() === 'vendedor' && r.nombre.toLowerCase() === 'cajero / vendedor')
    );
    if (role) {
      setUserForm(prev => ({
        ...prev,
        rol: role.nombre,
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

  // DB Admin Handlers
  const handleWipeDb = async (mode: 'inventory' | 'sales' | 'clients' | 'all') => {
    if (dbConfirmWord !== 'CONFIRMAR') {
      alert('Debe escribir la palabra de seguridad "CONFIRMAR" para poder procesar la limpieza.');
      return;
    }

    let confirmMsg = '';
    if (mode === 'inventory') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de vaciar TODO el inventario y catálogo de productos? Esta acción no se puede deshacer.';
    else if (mode === 'sales') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de vaciar el historial de ventas, correlativos de facturas y cierres de caja?';
    else if (mode === 'clients') confirmMsg = '¿ESTÁ TOTALMENTE SEGURO de vaciar la lista de clientes registrados?';
    else if (mode === 'all') confirmMsg = '⚠️ ADVERTENCIA CRÍTICA: Se formateará e inicializará el sistema por completo. Todo quedará en blanco. ¿Continuar?';

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(getApiUrl('/db/wipe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wipeInventory: mode === 'inventory' || mode === 'all',
          wipeSales: mode === 'sales' || mode === 'all',
          wipeClients: mode === 'clients' || mode === 'all'
        })
      });

      if (res.ok) {
        if (mode === 'inventory' || mode === 'all') {
          localStorage.removeItem('pos_products');
          localStorage.removeItem('pos_price_history');
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
        }
        if (mode === 'clients' || mode === 'all') {
          localStorage.removeItem('pos_clients');
        }

        showToast('Limpieza de base de datos ejecutada exitosamente. Se aplicaron los cambios.');
        setDbConfirmWord('');
        // Force reload page to sync clean database arrays
        setTimeout(() => window.location.reload(), 1500);
      } else {
        alert('Error al realizar el formateo de base de datos.');
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al intentar conectar con el servidor central.');
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
      alert('Error al generar copia de seguridad.');
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('¿Está seguro de restaurar este respaldo? Se sobrescribirán todos los datos del sistema actual con los del archivo.')) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        const res = await fetch(getApiUrl('/db/restore'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        });

        if (res.ok) {
          showToast('Base de datos restaurada correctamente. Recargando sistema...');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          alert('El archivo no pudo ser importado de forma correcta por el servidor.');
        }
      } catch (err) {
        alert('Formato de archivo inválido.');
      }
    };
    reader.readAsText(file);
  };

  const handleSaveBackupSchedule = async () => {
    localStorage.setItem('pos_backup_schedule', dbBackupSchedule);
    try {
      const res = await fetch(getApiUrl('/db/backup/schedule'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: dbBackupSchedule })
      });
      if (res.ok) {
        showToast(`Frecuencia de backup automático programada a: ${dbBackupSchedule}`);
      } else {
        alert('Error al programar frecuencia en el servidor.');
      }
    } catch (e) {
      console.error(e);
      alert('Error de conexión con el servidor.');
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
    { id: 'pago_movil', label: 'Pago Móvil Bs' },
    { id: 'biopago', label: 'Biopago Bs' },
    { id: 'credito', label: 'Crédito Cliente $' }
  ];

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
                      {roleList.map(r => {
                        const activeModules = Object.keys(r.permisos || {}).filter(m => r.permisos[m].ver);
                        return (
                          <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-xs">
                            <td className="py-3 px-3 font-bold text-slate-700 uppercase">{r.nombre}</td>
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
                              <button
                                onClick={() => handleDeleteRole(r.id)}
                                className="text-slate-400 hover:text-rose-600 p-1 transition-all"
                                title="Eliminar Perfil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 3: BASCULAS Y IMPRESORAS */}
        {activeTab === 'perifericos' && (
          <form onSubmit={handleSavePerifericos} className="bg-white border border-slate-200 p-6 rounded-xl space-y-6 shadow-sm max-w-3xl mx-auto">
            
            {/* PRINTER SETTINGS */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-2 mb-4 flex items-center gap-2 font-sans">
                <HardDrive className="w-4 h-4 text-winter-configStart" />
                Configuración de Impresora térmica de Tickets
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Método de Conexión / Puerto</label>
                  <select
                    value={printerConfig.puerto}
                    onChange={(e) => setPrinterConfig(prev => ({ ...prev, puerto: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
                  >
                    <option value="SISTEMA">Impresora del Sistema Operativo</option>
                    <option value="USB">Conexión Directa USB (Raw)</option>
                    <option value="IP">Conexión por Red IP (Ethernet/Wi-Fi)</option>
                    <option value="NINGUNA">No Utilizar Impresora (Guardado Digital)</option>
                  </select>
                </div>
                {printerConfig.puerto === 'IP' && (
                  <div>
                    <label className="text-xs text-slate-500 block mb-1 font-sans">Dirección IP de la Impresora</label>
                    <input
                      type="text"
                      placeholder="192.168.1.200"
                      value={printerConfig.ipAddress || ''}
                      onChange={(e) => setPrinterConfig(prev => ({ ...prev, ipAddress: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 font-sans text-xs">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Ancho de Papel Térmico</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPrinterConfig(prev => ({ ...prev, anchoPapel: '58mm' }))}
                      className={`flex-1 p-2 rounded border text-center transition-all ${
                        printerConfig.anchoPapel === '58mm'
                          ? 'bg-sky-50 border-sky-300 text-sky-800 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      58 mm (Angosto)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrinterConfig(prev => ({ ...prev, anchoPapel: '80mm' }))}
                      className={`flex-1 p-2 rounded border text-center transition-all ${
                        printerConfig.anchoPapel === '80mm'
                          ? 'bg-sky-50 border-sky-300 text-sky-800 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      80 mm (Estándar)
                    </button>
                  </div>
                </div>
                
                <div className="flex flex-col justify-end">
                  <label className="relative inline-flex items-center cursor-pointer mt-4">
                    <input
                      type="checkbox"
                      checked={printerConfig.cortarAutomatico}
                      onChange={(e) => setPrinterConfig(prev => ({ ...prev, cortarAutomatico: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                    <span className="ml-3 text-xs text-slate-700 font-bold">Corte de Papel Automático</span>
                  </label>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="relative inline-flex items-center cursor-pointer mt-4">
                    <input
                      type="checkbox"
                      checked={printerConfig.copiaTicket}
                      onChange={(e) => setPrinterConfig(prev => ({ ...prev, copiaTicket: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                    <span className="ml-3 text-xs text-slate-700 font-bold">Imprimir Copia del Ticket</span>
                  </label>
                </div>
              </div>
            </div>

            {/* SCALE SETTINGS */}
            <div className="border-t border-slate-100 pt-6">
              <h2 className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-2 mb-4 flex items-center gap-2 font-sans">
                <Cpu className="w-4 h-4 text-winter-configStart" />
                Configuración de Báscula / Balanza de Peso
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Método de Captura de Peso</label>
                  <select
                    value={scaleConfig.puerto}
                    onChange={(e) => setScaleConfig(prev => ({ ...prev, puerto: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
                  >
                    <option value="MANUAL">Entrada Manual (Solicitar en pantalla)</option>
                    <option value="COM1">Puerto Serial COM1</option>
                    <option value="COM2">Puerto Serial COM2</option>
                    <option value="USB">Conexión USB Emulada</option>
                    <option value="RED">Captura por Red IP</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Protocolo de Comunicación</label>
                  <select
                    value={scaleConfig.protocolo}
                    onChange={(e) => setScaleConfig(prev => ({ ...prev, protocolo: e.target.value }))}
                    disabled={scaleConfig.puerto === 'MANUAL'}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans disabled:opacity-50"
                  >
                    <option value="CAS">CAS (Protocolo Estándar)</option>
                    <option value="Toledo">Toledo (P03)</option>
                    <option value="Custom">Custom / Genérico (ASCII Raw)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Baud Rate (Velocidad)</label>
                  <select
                    value={scaleConfig.baudRate}
                    onChange={(e) => setScaleConfig(prev => ({ ...prev, baudRate: parseInt(e.target.value) }))}
                    disabled={scaleConfig.puerto === 'MANUAL'}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-mono disabled:opacity-50"
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
              className="w-full bg-winter-configStart hover:bg-winter-configEnd text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all shadow-sm mt-4"
            >
              GUARDAR CONFIGURACIÓN DE PERIFÉRICOS
            </button>
          </form>
        )}

        {/* TAB 4: DATABASE ADMIN */}
        {activeTab === 'db' && isAdmin && (
          <div className="space-y-6 max-w-4xl mx-auto">
            
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
                    <span className="font-bold text-slate-700 block">Vaciar Registro de Ventas y Facturas</span>
                    <p className="text-[10px] text-slate-500 font-sans">Elimina todas las transacciones históricas, reinicia los folios de factura a cero y limpia los cierres de caja.</p>
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
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5 font-sans">
                <HardDrive className="w-4 h-4 text-amber-600" />
                Programación de Respaldo Automático
              </h3>
              <p className="text-slate-500 font-sans text-xs">
                Defina la frecuencia con la que el servidor local de la sucursal guardará de forma automática copias de seguridad de la base de datos en su carpeta de backups del disco duro.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <select
                  value={dbBackupSchedule}
                  onChange={(e) => setDbBackupSchedule(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans flex-1"
                >
                  <option value="Diario">Cada 24 horas (Recomendado)</option>
                  <option value="Semanal">Semanalmente (Cada Domingo)</option>
                  <option value="Mensual">Mensualmente (Fin de Mes)</option>
                  <option value="Desactivado">Desactivar respaldos automáticos</option>
                </select>
                <button
                  onClick={handleSaveBackupSchedule}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-bold font-sans text-xs px-5 py-2.5 rounded-lg transition-all shadow-sm"
                >
                  Programar Frecuencia
                </button>
              </div>
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
                  placeholder="ej. ale"
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
                  placeholder="ej. Alejandra Olivar"
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
                  required
                  placeholder="admin"
                  value={userForm.clave}
                  onChange={(e) => setUserForm(prev => ({ ...prev, clave: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs focus:bg-white focus:border-winter-configStart focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1 font-sans">Perfil / Rol Base</label>
                <select
                  value={userForm.rol}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUserForm(prev => ({ ...prev, rol: val }));
                    handleApplyRolePermissions(val);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
                >
                  <option value="">Seleccione...</option>
                  <option value="Administrador">Administrador</option>
                  <option value="Cajero / Vendedor">Cajero / Vendedor</option>
                  {roleList.filter(r => r.nombre?.toLowerCase() !== 'administrador' && r.nombre?.toLowerCase() !== 'cajero / vendedor' && r.nombre?.toLowerCase() !== 'vendedor').map(r => (
                    <option key={r.id} value={r.nombre}>{r.nombre}</option>
                  ))}
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
                placeholder="ej. Supervisor, Auditor"
                value={roleForm.nombre}
                onChange={(e) => setRoleForm(prev => ({ ...prev, nombre: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs focus:bg-white focus:border-winter-configStart focus:outline-none font-sans font-bold"
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
