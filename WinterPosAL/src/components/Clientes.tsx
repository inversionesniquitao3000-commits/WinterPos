import React, { useState, useEffect, useMemo } from 'react';
import { Client, User, Sale, Abono, CompanyConfig } from '../types';
import { 
  Users, Plus, DollarSign, Search, ChevronUp, ChevronDown, 
  ChevronsUpDown, Edit, Download, FileText, TrendingUp, 
  Info, AlertCircle, RefreshCw, MinusCircle, Settings, FileSpreadsheet, Upload, CheckCircle2,
  MessageCircle, X
} from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

// Dynamic loader for XLSX (SheetJS)
const loadXlsx = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).XLSX) return resolve((window as any).XLSX);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => {
      const lib = (window as any).XLSX;
      lib ? resolve(lib) : reject(new Error('No se pudo inicializar XLSX'));
    };
    script.onerror = () => reject(new Error('Error al cargar librería XLSX desde CDN'));
    document.head.appendChild(script);
  });
};

// Dynamic loader for PDF.js to parse PDF files
const loadPdfJs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) return resolve((window as any).pdfjsLib);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(lib);
      } else {
        reject(new Error('No se pudo inicializar PDF.js'));
      }
    };
    script.onerror = () => reject(new Error('Error al cargar librería PDF.js desde CDN'));
    document.head.appendChild(script);
  });
};

const safeNum = (val: any): number => {
  if (val === null || val === undefined) return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? 0 : n;
};

const fmtUSD = (val: any): string => {
  return safeNum(val).toFixed(2);
};

const DEFAULT_COBRO_CLIENTES_WA_TEMPLATE = `👤 *RECORDATORIO DE PAGO DE CUENTA*

🏬 *{empresa}*
📅 *Fecha:* {fecha}
👤 *Cliente:* {cliente}
🆔 *Cédula/RIF:* {cedulaRif}

🚨 *Estimado(a) cliente, le enviamos un cordial saludo para recordarle su estado de cuenta:*

💰 *Monto Adeudado:* *${'{saldoPendienteUsd}'} USD*
🇻🇪 *Monto en Bolívares (Tasa BCV {tasaBcv}):* *Bs {saldoPendienteVes}*

💳 *Límite de Crédito:* ${'{limiteCreditoUsd}'} USD
✅ *Crédito Disponible:* ${'{creditoDisponibleUsd}'} USD

🙏 *Agradecemos realizar su abono a la brevedad posible para mantener activo su margen de crédito. ¡Gracias por su preferencia!*`;

interface ClientesProps {
  clients: Client[];
  currentUser: User;
  cajaAbierta?: boolean;
  companyConfig?: CompanyConfig;
  getApiUrl?: (path: string) => string;
  onAddClient: (newClient: Client) => void;
  onAddClientsBulk?: (clientsArray: any[], mode: 'update' | 'skip') => Promise<number | null>;
  onRegisterAbono: (
    clientId: number, 
    amountUSD: number, 
    payments: import('../types').AbonoPayment[],
    observacion?: string
  ) => void;
  onUpdateClient?: (updatedClient: Client) => Promise<boolean>;
  onDeleteClient?: (clientId: number) => Promise<boolean>;
  sales: Sale[];
  abonos: Abono[];
  tasaDia?: number;
}

export default function Clientes({ 
  clients = [], 
  currentUser: _currentUser, 
  cajaAbierta: _cajaAbierta = true,
  companyConfig,
  getApiUrl,
  onAddClient, 
  onAddClientsBulk,
  onRegisterAbono, 
  onUpdateClient, 
  onDeleteClient,
  sales = [],
  abonos = [],
  tasaDia = 1
}: ClientesProps) {
  const { showAlert, showConfirm } = useDialog();
  const hasPermission = (action: 'ver' | 'crear' | 'editar' | 'eliminar') => {
    if (!_currentUser || !_currentUser.rol) return true;
    if ((_currentUser.rol || '').toLowerCase() === 'administrador') return true;
    if (!_currentUser.permisos) return true; // fallback to true
    return !!_currentUser.permisos.clientes?.[action];
  };

  // Navigation / Tabs
  const [activeSubTab, setActiveSubTab] = useState<'catalogo' | 'historial' | 'ranking' | 'creditos'>('catalogo');
  
  // Selection
  const [selectedRowClient, setSelectedRowClient] = useState<Client | null>(null);
  
  // Search / Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  // Debt & Rate Filters state
  type DebtFilterMode = 'all' | 'with_debt' | 'no_debt' | 'debt_gt' | 'debt_lte' | 'debt_eq';
  const [debtFilterMode, setDebtFilterMode] = useState<DebtFilterMode>('all');
  const [debtThreshold, setDebtThreshold] = useState<string>('50');
  const [costoFilterMode, setCostoFilterMode] = useState<'all' | 'costo' | 'detalle'>('all');
  const [isSendingWhatsAppReport, setIsSendingWhatsAppReport] = useState(false);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Bulk Import state
  const [bulkFileLoading, setBulkFileLoading] = useState(false);
  const [bulkImportProgress, setBulkImportProgress] = useState('');
  const [bulkDuplicateMode, setBulkDuplicateMode] = useState<'update' | 'skip'>('update');
  const [parsedBulkClients, setParsedBulkClients] = useState<{
    cedula_rif: string;
    nombre: string;
    telefono: string;
    direccion: string;
    limite_credito: number;
    saldo_pendiente: number;
    porcentaje_descuento: number;
    aplica_precio_costo: boolean;
    isDuplicate: boolean;
  }[]>([]);

  // Form states
  const [newName, setNewName] = useState('');
  const [newDoc, setNewDoc] = useState('V-');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCreditLimit, setNewCreditLimit] = useState('0');
  const [newDiscount, setNewDiscount] = useState('0');

  // Context Menu state for right-click on client rows or movements
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'client' | 'credit_movement' | 'invoice';
    data: any;
  } | null>(null);

  // Clear all filters and selection
  const handleClearFilters = () => {
    setSearchTerm('');
    setDebtFilterMode('all');
    setCostoFilterMode('all');
    setSelectedRowClient(null);
  };

  useEffect(() => {
    const handleCloseContextMenu = () => setContextMenu(null);
    window.addEventListener('click', handleCloseContextMenu);
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isTyping = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT';

      if (e.key === 'Escape') {
        setContextMenu(null);
        setShowAddModal(false);
        setShowEditModal(false);
        setShowAbonoModal(false);
        setShowBulkModal(false);
        if (isTyping && targetTag === 'INPUT') {
          (e.target as HTMLInputElement).blur();
        }
      } else if ((e.key === 'l' || e.key === 'L') && !isTyping && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        handleClearFilters();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleCloseContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Send WhatsApp Payment Reminder / Account Balance to Single Client
  const handleSendWhatsAppSingleClient = async (c: Client) => {
    const dateStr = new Date().toLocaleString('es-VE');
    const companyName = companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.';
    
    // Fetch custom WhatsApp template from backend config
    let template = '';
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        if (data.config && data.config.cobroClientesMessageTemplate) {
          template = data.config.cobroClientesMessageTemplate;
        }
      }
    } catch (_) {}

    if (!template.trim()) {
      template = DEFAULT_COBRO_CLIENTES_WA_TEMPLATE;
    }

    const saldoVes = tasaDia > 1 
      ? (c.saldo_pendiente * tasaDia).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '0.00';

    const text = template
      .replace(/{empresa}/g, companyName)
      .replace(/{fecha}/g, dateStr)
      .replace(/{cliente}/g, (c.nombre || '').toUpperCase())
      .replace(/{cedulaRif}/g, c.cedula_rif || 'N/A')
      .replace(/{saldoPendienteUsd}/g, fmtUSD(c.saldo_pendiente))
      .replace(/{saldoPendienteVes}/g, saldoVes)
      .replace(/{tasaBcv}/g, fmtUSD(tasaDia))
      .replace(/{limiteCreditoUsd}/g, fmtUSD(c.limite_credito))
      .replace(/{creditoDisponibleUsd}/g, fmtUSD(c.credito_disponible));

    const cleanPhone = (c.telefono || '').replace(/[^0-9]/g, '');
    const isPhoneRegistered = cleanPhone.length >= 7 && cleanPhone !== '0';

    if (!isPhoneRegistered) {
      const editNow = await showConfirm(
        `El cliente "${c.nombre}" no tiene un número de teléfono válido registrado en el sistema.\n\n¿Desea modificar la ficha del cliente para registrar su número telefónico ahora?`,
        'Número No Registrado'
      );
      if (editNow) {
        setSelectedRowClient(c);
        handleOpenEdit();
      }
      return;
    }

    try {
      const res = await fetch('/api/whatsapp/send-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: c.telefono,
          textMessage: text
        })
      });
      const data = await res.json();
      if (res.ok && (data.success || data.simulated)) {
        showAlert(
          `✅ Recordatorio de pago enviado DIRECTAMENTE por WhatsApp a ${c.nombre} (${c.telefono}).${data.simulated ? ' (Modo simulación activo)' : ''}`,
          'WhatsApp Enviado Con Éxito',
          'success'
        );
      } else {
        throw new Error(data.error || 'Servicio bot de WhatsApp desconectado');
      }
    } catch (err: any) {
      console.warn('Fallback a WhatsApp Web:', err?.message);
      const fallbackWeb = await showConfirm(
        `El envío directo vía Bot reportó: ${err?.message || 'Bot no conectado'}.\n\n¿Desea abrir WhatsApp Web en el navegador para enviarlo directamente a ${c.telefono}?`,
        'Servidor Bot WhatsApp'
      );
      if (fallbackWeb) {
        const fullPhone = cleanPhone.startsWith('58') ? cleanPhone : (cleanPhone.startsWith('0') ? `58${cleanPhone.slice(1)}` : `58${cleanPhone}`);
        window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`, '_blank');
      }
    }
  };

  const [editName, setEditName] = useState('');
  const [editDoc, setEditDoc] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCreditLimit, setEditCreditLimit] = useState('0');
  const [editDiscount, setEditDiscount] = useState('0');
  const [editEstado, setEditEstado] = useState<'Activo' | 'Inactivo'>('Activo');

  // Precio Costo toggles
  const [newPrecioCosto, setNewPrecioCosto] = useState(false);
  const [editPrecioCosto, setEditPrecioCosto] = useState(false);

  const [abonoVal, setAbonoVal] = useState('');
  const [abonoMethod, setAbonoMethod] = useState<'Efectivo$' | 'EfectivoBs' | 'TarjetaBs' | 'PagoMovil' | 'Biopago'>('Efectivo$');
  const [abonoRef, setAbonoRef] = useState('');

  // Sorting state (Catálogo)
  type SortField = 'cedula_rif' | 'nombre' | 'telefono' | 'porcentaje_descuento' | 'aplica_precio_costo' | 'limite_credito' | 'credito_disponible' | 'saldo_pendiente';
  const [sortField, setSortField] = useState<SortField>('nombre');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Sorting state (Créditos / Abonos)
  type CreditSortField = 'tipo' | 'fecha' | 'ref' | 'nombre' | 'cedula_rif' | 'monto';
  const [creditSortField, setCreditSortField] = useState<CreditSortField>('fecha');
  const [creditSortDir, setCreditSortDir] = useState<'asc' | 'desc'>('desc');

  const handleCreditSort = (field: CreditSortField) => {
    if (creditSortField === field) {
      setCreditSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setCreditSortField(field);
      setCreditSortDir(field === 'fecha' ? 'desc' : 'asc');
    }
  };

  // Escape key to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setShowAbonoModal(false);
        setShowEditModal(false);
        setShowBulkModal(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Sync selection if clients change
  useEffect(() => {
    if (selectedRowClient) {
      const match = clients.find(c => c.id === selectedRowClient.id);
      setSelectedRowClient(match || null);
    }
  }, [clients]);

  // Enhanced Filters for Catálogo
  const baseFiltered = useMemo(() => {
    const safeClients = Array.isArray(clients) ? clients : [];
    return safeClients.filter(c => {
      if (!c) return false;
      // 1. Text Search (name, doc, phone)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = c.nombre?.toLowerCase().includes(term);
        const matchDoc = c.cedula_rif?.toLowerCase().includes(term);
        const matchPhone = c.telefono?.toLowerCase().includes(term);
        if (!matchName && !matchDoc && !matchPhone) return false;
      }

      // 2. Debt Filter
      const debt = parseFloat(c.saldo_pendiente as any) || 0;
      const threshold = parseFloat(debtThreshold) || 0;

      if (debtFilterMode === 'with_debt') {
        if (debt <= 0.001) return false;
      } else if (debtFilterMode === 'no_debt') {
        if (debt > 0.001) return false;
      } else if (debtFilterMode === 'debt_gt') {
        if (debt <= threshold) return false;
      } else if (debtFilterMode === 'debt_lte') {
        if (debt > threshold) return false;
      } else if (debtFilterMode === 'debt_eq') {
        if (Math.abs(debt - threshold) > 0.01) return false;
      }

      // 3. Price Cost filter
      if (costoFilterMode === 'costo' && !c.aplica_precio_costo) return false;
      if (costoFilterMode === 'detalle' && c.aplica_precio_costo) return false;

      return true;
    });
  }, [clients, searchTerm, debtFilterMode, debtThreshold, costoFilterMode]);

  const filteredClients = useMemo(() => {
    return [...baseFiltered].sort((a, b) => {
      let va: any = a[sortField];
      let vb: any = b[sortField];

      if (sortField === 'porcentaje_descuento') {
        va = parseFloat(a.porcentaje_descuento as any) || 0;
        vb = parseFloat(b.porcentaje_descuento as any) || 0;
        return sortDir === 'asc' ? va - vb : vb - va;
      }

      if (sortField === 'aplica_precio_costo') {
        va = a.aplica_precio_costo === true ? 1 : 0;
        vb = b.aplica_precio_costo === true ? 1 : 0;
        return sortDir === 'asc' ? va - vb : vb - va;
      }

      if (sortField === 'limite_credito' || sortField === 'credito_disponible' || sortField === 'saldo_pendiente') {
        va = parseFloat(va) || 0;
        vb = parseFloat(vb) || 0;
        return sortDir === 'asc' ? va - vb : vb - va;
      }

      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc'
        ? String(va || '').localeCompare(String(vb || ''))
        : String(vb || '').localeCompare(String(va || ''));
    });
  }, [baseFiltered, sortField, sortDir]);

  // Summary Metrics
  const totalClients = (Array.isArray(clients) ? clients : []).length;
  const totalDeuda = (Array.isArray(clients) ? clients : []).reduce((acc, c) => acc + (parseFloat(c?.saldo_pendiente as any) || 0), 0);
  const filteredDeuda = (filteredClients || []).reduce((acc, c) => acc + (parseFloat(c?.saldo_pendiente as any) || 0), 0);

  // Sorting Icon helper
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="inline w-3 h-3 ml-0.5 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="inline w-3 h-3 ml-0.5 text-blue-500" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5 text-blue-500" />;
  };

  // Credit Sorting Icon helper
  const CreditSortIcon = ({ field }: { field: CreditSortField }) => {
    if (creditSortField !== field) return <ChevronsUpDown className="inline w-3 h-3 ml-0.5 opacity-30" />;
    return creditSortDir === 'asc'
      ? <ChevronUp className="inline w-3 h-3 ml-0.5 text-blue-500" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5 text-blue-500" />;
  };

  // 1. Ranking Calculation
  const rankingData = useMemo(() => {
    const clientsMap: { [rif: string]: { nombre: string; cedula_rif: string; totalSpent: number; salesCount: number } } = {};
    const safeClients = Array.isArray(clients) ? clients : [];
    const safeSales = Array.isArray(sales) ? sales : [];

    // Initialize map with catalog clients
    safeClients.forEach(c => {
      if (c && c.cedula_rif) {
        clientsMap[c.cedula_rif] = {
          nombre: c.nombre || 'Cliente',
          cedula_rif: c.cedula_rif,
          totalSpent: 0,
          salesCount: 0
        };
      }
    });

    // Populate from sales
    safeSales.forEach(s => {
      const doc = s?.client?.cedula_rif;
      if (doc) {
        if (!clientsMap[doc]) {
          clientsMap[doc] = {
            nombre: s.client?.nombre || 'Desconocido',
            cedula_rif: doc,
            totalSpent: 0,
            salesCount: 0
          };
        }
        clientsMap[doc].totalSpent += (s.totalUSD || 0);
        clientsMap[doc].salesCount += 1;
      }
    });

    return Object.values(clientsMap)
      .map(item => ({
        ...item,
        avgSale: item.salesCount > 0 ? item.totalSpent / item.salesCount : 0
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [clients, sales]);

  // 2. Credits and Abonos chronological list
  const creditAbonoList = useMemo(() => {
    const list: { 
      tipo: 'Crédito' | 'Abono' | 'Devolución'; 
      fecha: string; 
      ref: string; 
      nombre: string; 
      cedula_rif: string; 
      monto: number;
      metodo: string;
      metodoRaw: string;
      referencia?: string;
    }[] = [];
    
    const safeSales = Array.isArray(sales) ? sales : [];
    const safeAbonos = Array.isArray(abonos) ? abonos : [];

    // Extract credit payments from sales (both positive purchases and negative credit returns)
    safeSales.forEach(s => {
      if (!s) return;
      const creditPayment = s.pagos?.find(p => p.metodo === 'CreditoCliente');
      if (creditPayment && (creditPayment.monto !== 0 || (creditPayment as any).montoUSD !== 0)) {
        const rawMonto = (creditPayment as any).montoUSD !== undefined && (creditPayment as any).montoUSD !== 0 
          ? (creditPayment as any).montoUSD 
          : creditPayment.monto;
        const isDev = (s.factura_nro || '').startsWith('DEV-') || rawMonto < 0;
        list.push({
          tipo: isDev ? 'Devolución' : 'Crédito',
          fecha: s.fecha || '',
          ref: s.factura_nro || 'FACT',
          nombre: s.client?.nombre || 'CLIENTE',
          cedula_rif: s.client?.cedula_rif || 'V-00000000',
          monto: Math.abs(rawMonto || 0),
          metodo: isDev ? 'Devolución / Nota Crédito' : 'Crédito',
          metodoRaw: isDev ? 'Devolucion' : 'Credito'
        });
      }
    });

    // Extract Abonos history
    safeAbonos.forEach(a => {
      if (!a) return;
      let metodoLabel = 'Efectivo $';
      if (a.metodo_pago === 'EfectivoBs') metodoLabel = 'Efectivo Bs';
      else if (a.metodo_pago === 'TarjetaBs') metodoLabel = 'Tarjeta / Punto Bs';
      else if (a.metodo_pago === 'PagoMovil') metodoLabel = 'Pago Móvil Bs';
      else if (a.metodo_pago === 'Biopago') metodoLabel = 'Biopago Bs';

      list.push({
        tipo: 'Abono',
        fecha: a.fecha || '',
        ref: `ABO-${(a.id || '').toString().substring(7)}`,
        nombre: a.nombre || 'CLIENTE',
        cedula_rif: a.cedula_rif || 'V-00000000',
        monto: a.monto || 0,
        metodo: metodoLabel,
        metodoRaw: a.metodo_pago || 'Efectivo$',
        referencia: a.referencia
      });
    });

    return list.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [sales, abonos]);

  // Filter credit & abonos by selected client, search term, and apply interactive sorting
  const filteredCreditAbonoList = useMemo(() => {
    let list = creditAbonoList;
    if (selectedRowClient) {
      list = list.filter(item => item.cedula_rif === selectedRowClient.cedula_rif);
    }
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      list = list.filter(item => 
        (item.tipo || '').toLowerCase().includes(term) ||
        (item.fecha || '').toLowerCase().includes(term) ||
        (item.ref || '').toLowerCase().includes(term) ||
        (item.nombre || '').toLowerCase().includes(term) ||
        (item.cedula_rif || '').toLowerCase().includes(term) ||
        (item.metodo || '').toLowerCase().includes(term) ||
        (item.referencia || '').toLowerCase().includes(term)
      );
    }
    return [...list].sort((a, b) => {
      const va: any = (a as any)[creditSortField];
      const vb: any = (b as any)[creditSortField];
      if (creditSortField === 'monto') {
        const nA = typeof va === 'number' ? va : parseFloat(String(va)) || 0;
        const nB = typeof vb === 'number' ? vb : parseFloat(String(vb)) || 0;
        return creditSortDir === 'asc' ? nA - nB : nB - nA;
      }
      return creditSortDir === 'asc'
        ? String(va || '').localeCompare(String(vb || ''))
        : String(vb || '').localeCompare(String(va || ''));
    });
  }, [creditAbonoList, selectedRowClient, searchTerm, creditSortField, creditSortDir]);

  // 3. Client sales history list
  const clientSalesHistory = useMemo(() => {
    if (!selectedRowClient) return [];
    const safeSales = Array.isArray(sales) ? sales : [];
    return safeSales.filter(s => s?.client?.cedula_rif === selectedRowClient.cedula_rif);
  }, [sales, selectedRowClient]);

  // Handlers
  const handleOpenAbono = () => {
    if (!selectedRowClient) return;
    setAbonoVal('');
    setAbonoMethod('Efectivo$');
    setAbonoRef('');
    setShowAbonoModal(true);
  };

  const handleSaveAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRowClient) return;

    const val = parseFloat(abonoVal);
    if (isNaN(val) || val <= 0) {
      showAlert('Por favor ingrese un monto válido para el abono.', 'Monto Inválido', 'warning');
      return;
    }

    if (val > selectedRowClient.saldo_pendiente) {
      showAlert(`El abono ($${val.toFixed(2)}) no puede ser mayor que el saldo pendiente ($${selectedRowClient.saldo_pendiente.toFixed(2)}).`, 'Abono Excedido', 'warning');
      return;
    }

    const USD_METHODS = ['Efectivo$', 'Tarjeta$', 'Binance', 'PayPal', 'Zelle'];
    const isUsd = USD_METHODS.includes(abonoMethod);
    const usd = isUsd ? val : 0;
    const ves = !isUsd ? parseFloat((val * tasaDia).toFixed(2)) : 0;

    const paymentsArr: import('../types').AbonoPayment[] = [
      { metodo_pago: abonoMethod as any, monto_usd: usd, monto_ves: ves, referencia: abonoRef || '' }
    ];

    onRegisterAbono(selectedRowClient.id, val, paymentsArr, `Abono desde Catálogo de Clientes`);
    setShowAbonoModal(false);
    setAbonoVal('');
    setAbonoMethod('Efectivo$');
    setAbonoRef('');
    showAlert('Abono registrado con éxito. El crédito disponible del cliente ha sido restablecido.', 'Abono Registrado', 'success');
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDoc.trim()) {
      showAlert('Cédula/RIF y Nombre son requeridos.', 'Campos Requeridos', 'warning');
      return;
    }

    if (clients.some(c => c.cedula_rif.toUpperCase() === newDoc.trim().toUpperCase())) {
      showAlert('Ya existe un cliente registrado con esa Cédula o RIF.', 'Documento Duplicado', 'error');
      return;
    }

    const limit = parseFloat(newCreditLimit) || 0;
    const discount = parseFloat(newDiscount) || 0;

    const newClient: Client = {
      id: Date.now(),
      cedula_rif: newDoc.trim().toUpperCase(),
      nombre: newName.trim().toUpperCase(),
      telefono: newPhone.trim(),
      direccion: newAddress.trim(),
      limite_credito: limit,
      credito_disponible: limit,
      porcentaje_descuento: discount,
      estado: 'Activo',
      saldo_pendiente: 0.00,
      aplica_precio_costo: newPrecioCosto
    };

    onAddClient(newClient);
    setShowAddModal(false);
    
    // Reset form
    setNewName('');
    setNewDoc('');
    setNewPhone('');
    setNewAddress('');
    setNewCreditLimit('0');
    setNewDiscount('0');
    setNewPrecioCosto(false);
  };

  const handleOpenEdit = () => {
    if (!selectedRowClient) return;
    setEditName(selectedRowClient.nombre);
    setEditDoc(selectedRowClient.cedula_rif);
    setEditPhone(selectedRowClient.telefono || '');
    setEditAddress(selectedRowClient.direccion || '');
    setEditCreditLimit(String(selectedRowClient.limite_credito));
    setEditDiscount(String(selectedRowClient.porcentaje_descuento));
    setEditEstado(selectedRowClient.estado || 'Activo');
    setEditPrecioCosto(!!selectedRowClient.aplica_precio_costo);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRowClient) return;

    if (!editName.trim() || !editDoc.trim()) {
      showAlert('Cédula/RIF y Nombre son requeridos.', 'Campos Requeridos', 'warning');
      return;
    }

    if (clients.some(c => c.cedula_rif.toUpperCase() === editDoc.trim().toUpperCase() && c.id !== selectedRowClient.id)) {
      showAlert('Ya existe otro cliente registrado con esa Cédula o RIF.', 'Documento Duplicado', 'error');
      return;
    }

    const limit = parseFloat(editCreditLimit) || 0;
    const discount = parseFloat(editDiscount) || 0;

    const updatedClient: Client = {
      ...selectedRowClient,
      cedula_rif: editDoc.trim().toUpperCase(),
      nombre: editName.trim().toUpperCase(),
      telefono: editPhone.trim(),
      direccion: editAddress.trim(),
      limite_credito: limit,
      porcentaje_descuento: discount,
      estado: editEstado,
      aplica_precio_costo: editPrecioCosto
    };

    if (onUpdateClient) {
      const success = await onUpdateClient(updatedClient);
      if (success) {
        setShowEditModal(false);
      }
    } else {
      setShowEditModal(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!selectedRowClient) return;

    if (selectedRowClient.saldo_pendiente > 0.01) {
      showAlert('No se puede eliminar un cliente con deuda pendiente.', 'Eliminación No Permitida', 'error');
      return;
    }

    const ok = await showConfirm(
      `¿Está seguro de que desea eliminar permanentemente al cliente "${selectedRowClient.nombre}" (ID: ${selectedRowClient.cedula_rif})? Esta acción no se puede deshacer.`,
      'Eliminar Cliente',
      { confirmLabel: 'Eliminar', isDanger: true }
    );
    if (!ok) return;

    if (onDeleteClient) {
      const success = await onDeleteClient(selectedRowClient.id);
      if (success) {
        setSelectedRowClient(null);
      }
    }
  };

  // Export Report to PDF Print layout
  const handleDownloadReport = () => {
    let title = "";
    let tableHtml = "";
    const dateStr = new Date().toLocaleString();

    if (activeSubTab === 'catalogo') {
      title = "Catálogo Maestro de Clientes";
      tableHtml = `
          <table class="report-table">
          <thead>
            <tr>
              <th>Nombre / Razón Social</th>
              <th>RFC / Cédula</th>
              <th>Teléfono</th>
              <th class="text-right">Límite Crédito</th>
              <th class="text-right">Crédito Disp.</th>
              <th class="text-right">Saldo Pendiente</th>
              <th class="text-center">% Desc.</th>
              <th class="text-center">P. Costo</th>
            </tr>
          </thead>
          <tbody>
            ${filteredClients.map(c => `
              <tr>
                <td style="text-transform: uppercase;">${c.nombre}</td>
                <td>${c.cedula_rif}</td>
                <td>${c.telefono || 'N/A'}</td>
                <td class="text-right">$${c.limite_credito.toFixed(2)}</td>
                <td class="text-right">$${c.credito_disponible.toFixed(2)}</td>
                <td class="text-right font-bold ${c.saldo_pendiente > 0.01 ? 'text-red' : ''}">$${c.saldo_pendiente.toFixed(2)}</td>
                <td class="text-center">${c.porcentaje_descuento > 0 ? c.porcentaje_descuento + '%' : '—'}</td>
                <td class="text-center">${c.aplica_precio_costo ? 'COSTO' : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="report-summary">
          <p><strong>Total Clientes:</strong> ${totalClients}</p>
          <p><strong>Total Deuda Pendiente:</strong> $${totalDeuda.toFixed(2)} USD</p>
        </div>
      `;
    } else if (activeSubTab === 'historial') {
      if (!selectedRowClient) {
        showAlert('Por favor seleccione un cliente en el Catálogo para generar su reporte.', 'Seleccione un Cliente', 'warning');
        return;
      }
      title = `Historial Detallado de Facturas`;
      tableHtml = `
        <div class="client-card">
          <p><strong>Cliente:</strong> ${selectedRowClient.nombre} | <strong>RFC/Cédula:</strong> ${selectedRowClient.cedula_rif}</p>
          <p><strong>Teléfono:</strong> ${selectedRowClient.telefono || 'N/A'} | <strong>Dirección:</strong> ${selectedRowClient.direccion || 'N/A'}</p>
          <p><strong>Límite Crédito:</strong> $${selectedRowClient.limite_credito.toFixed(2)} USD | <strong>Crédito Disponible:</strong> $${selectedRowClient.credito_disponible.toFixed(2)} USD | <strong>Deuda Pendiente:</strong> $${selectedRowClient.saldo_pendiente.toFixed(2)} USD</p>
        </div>
        <table class="report-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Factura Nro</th>
              <th class="text-right">Subtotal</th>
              <th class="text-right">Descuento</th>
              <th class="text-right">Total USD</th>
              <th class="text-right">Total VES</th>
              <th style="text-align: center;">Estatus</th>
            </tr>
          </thead>
          <tbody>
            ${clientSalesHistory.length === 0 ? `
              <tr><td colspan="7" style="text-align: center; color: #777;">No hay facturas registradas.</td></tr>
            ` : clientSalesHistory.map(s => `
              <tr>
                <td>${s.fecha}</td>
                <td class="font-bold">${s.factura_nro}</td>
                <td class="text-right">$${s.subtotal.toFixed(2)}</td>
                <td class="text-right">-$${s.descuento.toFixed(2)}</td>
                <td class="text-right font-bold">$${s.totalUSD.toFixed(2)}</td>
                <td class="text-right">$${s.totalVES.toFixed(2)}</td>
                <td style="text-align: center;">${s.estatus || 'Procesada'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeSubTab === 'ranking') {
      title = "Ranking de Clientes por Volumen de Compras";
      tableHtml = `
        <table class="report-table">
          <thead>
            <tr>
              <th style="width: 80px; text-align: center;">Posición</th>
              <th>Nombre / Razón Social</th>
              <th>Identificación (ID)</th>
              <th style="text-align: center;">Compras Totales</th>
              <th style="text-align: center;">Transacciones</th>
              <th style="text-align: center;">Compra Promedio</th>
            </tr>
          </thead>
          <tbody>
            ${rankingData.length === 0 ? `
              <tr><td colspan="6" style="text-align: center; color: #777;">Sin datos disponibles.</td></tr>
            ` : rankingData.map((r, idx) => `
              <tr>
                <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
                <td style="text-transform: uppercase;">${r.nombre}</td>
                <td>${r.cedula_rif}</td>
                <td style="text-align: center; font-weight: bold; color: #1e3a8a;">$${r.totalSpent.toFixed(2)}</td>
                <td style="text-align: center;">${r.salesCount}</td>
                <td style="text-align: center;">$${r.avgSale.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeSubTab === 'creditos') {
      title = `Movimientos de Cuentas - ${selectedRowClient ? selectedRowClient.nombre : 'Historial General'}`;
      tableHtml = `
        <table class="report-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Factura / Referencia</th>
              <th>Cliente</th>
              <th>Identificación</th>
              <th class="text-right">Monto ($ USD)</th>
            </tr>
          </thead>
          <tbody>
            ${filteredCreditAbonoList.length === 0 ? `
              <tr><td colspan="6" style="text-align: center; color: #777;">Sin movimientos registrados.</td></tr>
            ` : filteredCreditAbonoList.map(item => `
              <tr>
                <td><span class="badge ${item.tipo === 'Crédito' ? 'badge-credit' : (item.tipo === 'Devolución' ? 'badge-dev' : 'badge-abono')}">${item.tipo}</span></td>
                <td>${item.fecha}</td>
                <td>${item.ref}</td>
                <td style="text-transform: uppercase;">${item.nombre}</td>
                <td>${item.cedula_rif}</td>
                <td class="text-right font-bold ${item.tipo === 'Crédito' ? 'text-credit' : (item.tipo === 'Devolución' ? 'text-dev' : 'text-abono')}">${item.tipo === 'Crédito' ? '+' : '-'}$${item.monto.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showAlert('No se pudo abrir la ventana de impresión. Por favor habilite los popups en su navegador.', 'Popups Bloqueados', 'warning');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte PDF - ${title}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #333;
              margin: 30px;
              font-size: 11px;
            }
            .header {
              border-bottom: 2px solid #333;
              padding-bottom: 8px;
              margin-bottom: 15px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .header-left h1 {
              margin: 0 0 3px 0;
              font-size: 18px;
              color: #0f172a;
              letter-spacing: 0.5px;
            }
            .header-left p {
              margin: 0;
              color: #64748b;
              font-size: 10px;
            }
            .header-right {
              text-align: right;
              font-size: 9px;
              color: #64748b;
              line-height: 1.4;
            }
            h2 {
              font-size: 12px;
              text-transform: uppercase;
              color: #1e293b;
              margin-top: 0;
              margin-bottom: 12px;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 4px;
              letter-spacing: 0.5px;
            }
            .client-card {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 4px;
              padding: 10px;
              margin-bottom: 15px;
              line-height: 1.5;
            }
            .client-card p {
              margin: 0;
            }
            .report-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }
            .report-table th, .report-table td {
              border: 1px solid #94a3b8;
              padding: 6px 8px;
              text-align: left;
            }
            .report-table th {
              background-color: #f1f5f9;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9px;
              color: #334155;
            }
            .report-table tr:nth-child(even) {
              background-color: #f8fafc;
            }
            .text-right {
              text-align: right;
            }
            .font-bold {
              font-weight: bold;
            }
            .text-red {
              color: #dc2626;
            }
            .text-credit {
              color: #ea580c;
            }
            .text-abono {
              color: #16a34a;
            }
            .text-dev {
              color: #9333ea;
            }
            .badge {
              display: inline-block;
              padding: 1px 5px;
              border-radius: 3px;
              font-size: 8px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .badge-credit {
              background-color: #ffedd5;
              color: #c2410c;
            }
            .badge-abono {
              background-color: #dcfce7;
              color: #15803d;
            }
            .badge-dev {
              background-color: #f3e8ff;
              color: #7e22ce;
            }
            .report-summary {
              display: flex;
              justify-content: flex-end;
              gap: 20px;
              margin-top: 10px;
              font-size: 11px;
              border-top: 1px solid #cbd5e1;
              padding-top: 8px;
            }
            .report-summary p {
              margin: 0;
            }
            @media print {
              body {
                margin: 0;
              }
              button {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-left">
              <h1>${companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO'}</h1>
              <p>RIF: ${companyConfig?.rif || 'J-41132631'} | Teléfono: ${companyConfig?.telefono || '0424-2042877'} | Dirección: ${companyConfig?.direccion || 'Caracas'}</p>
            </div>
            <div class="header-right">
              <p>Reporte Generado: ${dateStr}</p>
              <p>Operador: ${_currentUser.nombre || _currentUser.usuario}</p>
            </div>
          </div>
          
          <h2>${title}</h2>
          
          ${tableHtml}
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Export Report to Excel (.xlsx)
  const handleExportExcel = async () => {
    try {
      const XLSX = await loadXlsx();
      let exportData: any[] = [];
      let filename = 'Reporte_Clientes_WinterPOS.xlsx';

      if (activeSubTab === 'catalogo') {
        exportData = filteredClients.map(c => ({
          'Cédula / RIF': c.cedula_rif,
          'Nombre / Razón Social': c.nombre,
          'Teléfono': c.telefono || 'N/A',
          'Dirección': c.direccion || 'N/A',
          'Límite Crédito ($)': c.limite_credito,
          'Crédito Disponible ($)': c.credito_disponible,
          'Saldo Pendiente / Deuda ($)': c.saldo_pendiente,
          '% Descuento': c.porcentaje_descuento,
          'Tarifa Precio Costo': c.aplica_precio_costo ? 'SI' : 'NO',
          'Estado': c.estado || 'Activo'
        }));
        filename = `Catalogo_Clientes_${new Date().toISOString().substring(0, 10)}.xlsx`;
      } else if (activeSubTab === 'ranking') {
        exportData = rankingData.map((c, i) => ({
          'Posición': i + 1,
          'Nombre': c.nombre,
          'Cédula / RIF': c.cedula_rif,
          'Total Compras ($)': c.totalSpent,
          'Nro Facturas': c.salesCount,
          'Compra Promedio ($)': c.avgSale
        }));
        filename = `Ranking_Clientes_${new Date().toISOString().substring(0, 10)}.xlsx`;
      } else if (activeSubTab === 'creditos') {
        exportData = filteredCreditAbonoList.map(ev => ({
          'Tipo': ev.tipo,
          'Fecha': ev.fecha,
          'Referencia': ev.ref,
          'Cliente': ev.nombre,
          'Cédula / RIF': ev.cedula_rif,
          'Forma de Pago': ev.metodo || 'N/A',
          'Monto ($ USD)': ev.monto
        }));
        filename = `Movimientos_Creditos_Abonos_${new Date().toISOString().substring(0, 10)}.xlsx`;
      } else if (activeSubTab === 'historial') {
        if (!selectedRowClient) {
          showAlert('Seleccione un cliente para exportar su historial.', 'Seleccione Cliente', 'warning');
          return;
        }
        exportData = clientSalesHistory.map(s => {
          const isCredit = s.pagos?.some(p => p.metodo === 'CreditoCliente') || false;
          return {
            'Fecha': s.fecha,
            'Factura Nro': s.factura_nro,
            'Tipo Venta': isCredit ? 'CRÉDITO' : 'CONTADO',
            'Subtotal ($)': s.subtotal,
            'Descuento ($)': s.descuento,
            'Total ($ USD)': s.totalUSD,
            'Total (Bs VES)': s.totalVES,
            'Cajero': s.usuario || 'N/A'
          };
        });
        filename = `Historial_Facturas_${selectedRowClient.cedula_rif}_${new Date().toISOString().substring(0, 10)}.xlsx`;
      }

      if (exportData.length === 0) {
        showAlert('No hay datos para exportar bajo el filtro actual.', 'Sin Datos', 'warning');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
      XLSX.writeFile(wb, filename);
    } catch (err: any) {
      showAlert(`Error al exportar a Excel: ${err.message}`, 'Error Exportación', 'error');
    }
  };

  // Send WhatsApp Summary Report
  const handleSendWhatsAppReport = async () => {
    if (!getApiUrl) {
      showAlert('Función de WhatsApp no disponible en este momento.', 'Error', 'error');
      return;
    }
    try {
      setIsSendingWhatsAppReport(true);
      let summaryText = '';
      const dateStr = new Date().toLocaleString('es-VE');
      const companyName = companyConfig?.nombre_comercio || 'INVERSIONES';

      if (activeSubTab === 'catalogo') {
        const filterDescription = debtFilterMode === 'with_debt' ? 'Solo con Deuda (> $0)'
          : debtFilterMode === 'no_debt' ? 'Sin Deuda ($0.00)'
          : debtFilterMode === 'debt_gt' ? `Deuda > $${debtThreshold}`
          : debtFilterMode === 'debt_lte' ? `Deuda ≤ $${debtThreshold}`
          : debtFilterMode === 'debt_eq' ? `Deuda = $${debtThreshold}`
          : 'Todos los Clientes';

        const clientsWithDebt = filteredClients.filter(c => c.saldo_pendiente > 0.01);

        summaryText = `👥 *REPORTE DE CARTERA DE CLIENTES*\n`;
        summaryText += `🏬 *${companyName}*\n`;
        summaryText += `📅 *Fecha:* ${dateStr}\n`;
        summaryText += `🔍 *Filtro:* ${filterDescription}\n\n`;
        summaryText += `📊 *RESUMEN GENERAL:*\n`;
        summaryText += `• Total Clientes: ${filteredClients.length} de ${totalClients}\n`;
        summaryText += `• Total Saldo Pendiente: $${filteredDeuda.toFixed(2)} USD\n\n`;

        if (clientsWithDebt.length > 0) {
          summaryText += `⚠️ *CLIENTES CON SALDO PENDIENTE (${clientsWithDebt.length}):*\n`;
          clientsWithDebt.slice(0, 15).forEach((c, i) => {
            summaryText += `${i + 1}. *${c.nombre}* (${c.cedula_rif}): *$${c.saldo_pendiente.toFixed(2)} USD*\n`;
          });
          if (clientsWithDebt.length > 15) {
            summaryText += `_...y ${clientsWithDebt.length - 15} clientes más con deuda pendiente._\n`;
          }
        } else {
          summaryText += `✅ *No se registran clientes con deuda pendiente bajo este filtro.*\n`;
        }
        summaryText += `\n*WinterPosAL Cloud System*`;
      } else if (activeSubTab === 'ranking') {
        summaryText = `🏆 *REPORTE DE RANKING DE CLIENTES*\n🏬 *${companyName}*\n📅 *Fecha:* ${dateStr}\n\n`;
        summaryText += `Top 10 Clientes por Volumen de Compras:\n`;
        rankingData.slice(0, 10).forEach((c, i) => {
          summaryText += `${i + 1}. *${c.nombre}*: $${c.totalSpent.toFixed(2)} USD (${c.salesCount} compras)\n`;
        });
        summaryText += `\n*WinterPosAL Cloud System*`;
      } else {
        summaryText = `📋 *REPORTE DE MOVIMIENTOS Y CRÉDITOS*\n🏬 *${companyName}*\n📅 *Fecha:* ${dateStr}\n`;
        summaryText += `Total Clientes: ${totalClients} | Deuda Total: $${totalDeuda.toFixed(2)} USD\n\n*WinterPosAL Cloud System*`;
      }

      // Use /whatsapp/send-cierre (standard route supported by all backend versions)
      const res = await fetch(getApiUrl('/whatsapp/send-cierre'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textSummary: summaryText,
          imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        })
      });

      let data: any = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      }

      if (res.ok && (!data || data.success || data.simulated)) {
        showAlert('✅ Reporte de cartera de clientes enviado exitosamente por WhatsApp al grupo configurado.', 'Reporte Enviado', 'success');
      } else {
        const errorMsg = data?.error || (res.status === 404 ? 'Servicio de WhatsApp no encontrado en el servidor.' : `Error del servidor (${res.status}). Verifique la conexión de WhatsApp.`);
        showAlert(errorMsg, 'Error WhatsApp', 'error');
      }
    } catch (err: any) {
      showAlert(`Error al enviar por WhatsApp: ${err.message}`, 'Error', 'error');
    } finally {
      setIsSendingWhatsAppReport(false);
    }
  };

  return (
    <div className="space-y-4 text-slate-800 font-mono text-xs animate-fade-in">
      {/* HEADER SECTION */}
      <div>
        <h1 className="text-xl font-extrabold text-winter-header tracking-wider flex items-center gap-2">
          <Users className="w-5 h-5 text-winter-header" />
          GESTIÓN Y CARTERA DE CLIENTES
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-sans">
          Administre el catálogo maestro de clientes, límite de crédito, historial transaccional y registro de abonos.
        </p>
      </div>

      {/* TOP TABS NAVIGATION - Aligned Left (Config Module Style) */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveSubTab('catalogo')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all flex items-center gap-1.5 ${
            activeSubTab === 'catalogo'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xs font-extrabold'
              : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Catálogo
        </button>
        <button
          onClick={() => setActiveSubTab('historial')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all flex items-center gap-1.5 ${
            activeSubTab === 'historial'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xs font-extrabold'
              : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Historial Detalle
        </button>
        <button
          onClick={() => setActiveSubTab('ranking')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all flex items-center gap-1.5 ${
            activeSubTab === 'ranking'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xs font-extrabold'
              : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Movimientos por Ranking
        </button>
        <button
          onClick={() => setActiveSubTab('creditos')}
          className={`px-4 py-2 rounded-t-lg font-bold text-xs uppercase font-sans border-t border-x transition-all flex items-center gap-1.5 ${
            activeSubTab === 'creditos'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xs font-extrabold'
              : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 font-sans'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          Créditos / Abonos
        </button>
      </div>

      {/* FILTER SEARCH BAR + ADVANCED DEBT FILTERS */}
      <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-inner">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <span className="text-slate-650 font-bold font-sans whitespace-nowrap text-xs">Buscar:</span>
          <div className="relative w-full md:w-56">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Cédula, RIF, Nombre o Tel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-slate-500 font-sans shadow-sm"
            />
          </div>

          {/* Filtro de Deuda */}
          <div className="flex items-center gap-1">
            <select
              value={debtFilterMode}
              onChange={(e) => setDebtFilterMode(e.target.value as any)}
              className="bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 font-sans font-bold shadow-sm outline-none focus:border-sky-500"
            >
              <option value="all">TODOS LOS CLIENTES</option>
              <option value="with_debt">SOLO CON DEUDA (&gt; $0)</option>
              <option value="no_debt">SIN DEUDA ($0.00)</option>
              <option value="debt_gt">DEUDA MAYOR A (&gt; $)</option>
              <option value="debt_lte">DEUDA MENOR O IGUAL (≤ $)</option>
              <option value="debt_eq">DEUDA EXACTA (= $)</option>
            </select>

            {(debtFilterMode === 'debt_gt' || debtFilterMode === 'debt_lte' || debtFilterMode === 'debt_eq') && (
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2 py-1 shadow-sm">
                <span className="text-xs font-bold text-slate-500">$</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={debtThreshold}
                  onChange={(e) => setDebtThreshold(e.target.value)}
                  placeholder="Monto"
                  className="w-16 bg-transparent text-xs font-mono font-bold text-slate-800 outline-none"
                />
              </div>
            )}
          </div>

          {/* Filtro de Tarifa Costo */}
          <select
            value={costoFilterMode}
            onChange={(e) => setCostoFilterMode(e.target.value as any)}
            className="bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-700 font-sans shadow-sm outline-none font-medium"
          >
            <option value="all">TODAS LAS TARIFAS</option>
            <option value="costo">SOLO PRECIO COSTO</option>
            <option value="detalle">PRECIO DETALLE / NORMAL</option>
          </select>

          {/* Botón Limpiar Filtros */}
          {(searchTerm.trim() || debtFilterMode !== 'all' || costoFilterMode !== 'all' || selectedRowClient) && (
            <button
              onClick={handleClearFilters}
              className="bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 text-xs px-2.5 py-1.5 rounded font-sans font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
              title="Restablecer filtros y selección a valores por defecto (Tecla L)"
            >
              <X className="w-3.5 h-3.5 text-amber-700" />
              <span>Limpiar [L]</span>
            </button>
          )}
        </div>

        {/* Totals & Counters summary */}
        <div className="flex items-center gap-4 self-end md:self-auto">
          <div className="text-right text-[10px] font-sans text-slate-600">
            <div>
              <span className="font-semibold text-slate-500">Total Saldo Pendiente:</span>{' '}
              <span className="font-mono text-xs font-extrabold text-red-600">
                ${(debtFilterMode !== 'all' || searchTerm.trim() || costoFilterMode !== 'all' ? filteredDeuda : totalDeuda).toFixed(2)} USD
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Total Clientes:</span>{' '}
              <span className="font-mono text-xs font-bold text-slate-700">
                {debtFilterMode !== 'all' || searchTerm.trim() || costoFilterMode !== 'all' 
                  ? `${filteredClients.length} de ${totalClients}` 
                  : totalClients}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER LAYOUT: CONTENT + SIDEBAR ACTION BUTTONS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* LEFT COLUMN: THE ACTIVE TAB VIEW CONTENT */}
        <div className="lg:col-span-10 space-y-4">
          
          {/* TAB 1: CATÁLOGO */}
          {activeSubTab === 'catalogo' && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm animate-fade-in flex flex-col">
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[480px]">
                <table className="w-full border-collapse text-[11px] text-left">
                  <thead className="sticky top-0 z-10 bg-slate-700 text-white border-b border-slate-800 shadow-xs">
                    <tr>
                      <th className="sticky top-0 z-10 bg-slate-700 px-3 py-2.5 cursor-pointer select-none font-sans uppercase font-bold text-white" onClick={() => handleSort('nombre')}>
                        <div className="flex items-center gap-1">
                          <span>Nombre / Razón Social</span>
                          <SortIcon field="nombre" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-700 px-3 py-2.5 cursor-pointer select-none font-sans uppercase font-bold text-white" onClick={() => handleSort('cedula_rif')}>
                        <div className="flex items-center gap-1">
                          <span>RFC / Cédula</span>
                          <SortIcon field="cedula_rif" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-700 px-3 py-2.5 cursor-pointer select-none font-sans uppercase font-bold text-white" onClick={() => handleSort('telefono')}>
                        <div className="flex items-center gap-1">
                          <span>Teléfono</span>
                          <SortIcon field="telefono" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-700 px-3 py-2.5 cursor-pointer select-none font-sans uppercase font-bold text-center text-white" onClick={() => handleSort('limite_credito')}>
                        <div className="flex items-center justify-center gap-1">
                          <span>Límite Crédito</span>
                          <SortIcon field="limite_credito" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-700 px-3 py-2.5 cursor-pointer select-none font-sans uppercase font-bold text-center text-white" onClick={() => handleSort('credito_disponible')}>
                        <div className="flex items-center justify-center gap-1">
                          <span>Crédito Disponible</span>
                          <SortIcon field="credito_disponible" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-700 px-3 py-2.5 cursor-pointer select-none font-sans uppercase font-bold text-center text-white" onClick={() => handleSort('saldo_pendiente')}>
                        <div className="flex items-center justify-center gap-1">
                          <span>Saldo Pendiente</span>
                          <SortIcon field="saldo_pendiente" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-700 px-3 py-2.5 cursor-pointer select-none font-sans uppercase font-bold text-center text-white hover:bg-slate-600 transition-colors" onClick={() => handleSort('porcentaje_descuento')}>
                        <div className="flex items-center justify-center gap-1">
                          <span>% Desc.</span>
                          <SortIcon field="porcentaje_descuento" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-700 px-3 py-2.5 cursor-pointer select-none font-sans uppercase font-bold text-center text-white hover:bg-slate-600 transition-colors" onClick={() => handleSort('aplica_precio_costo')}>
                        <div className="flex items-center justify-center gap-1">
                          <span>P. Costo</span>
                          <SortIcon field="aplica_precio_costo" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-700 px-3 py-2.5 text-center font-sans uppercase font-bold w-40 text-white">Ver Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredClients.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-8 text-center text-slate-400 font-sans italic">
                          No se encontraron clientes registrados que coincidan con la búsqueda.
                        </td>
                      </tr>
                    ) : (
                      filteredClients.map(c => {
                        const isSelected = selectedRowClient?.id === c.id;
                        return (
                          <tr 
                            key={c.id} 
                            onClick={() => setSelectedRowClient(isSelected ? null : c)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setSelectedRowClient(c);
                              const menuWidth = 280;
                              const menuHeight = 290;
                              const clickX = e.clientX;
                              const clickY = e.clientY;
                              const x = clickX + menuWidth > window.innerWidth ? Math.max(10, window.innerWidth - menuWidth - 15) : clickX;
                              const y = clickY + menuHeight > window.innerHeight ? Math.max(10, window.innerHeight - menuHeight - 15) : clickY;
                              setContextMenu({ x, y, type: 'client', data: c });
                            }}
                            className={`cursor-pointer transition-colors ${isSelected ? 'bg-sky-50 hover:bg-sky-100 border-l-4 border-sky-500 font-semibold text-sky-950 shadow-inner' : 'hover:bg-slate-50'}`}
                          >
                            <td className="px-3 py-2.5 font-sans font-medium uppercase">{c.nombre}</td>
                            <td className="px-3 py-2.5 font-mono font-bold text-slate-500">{c.cedula_rif}</td>
                            <td className="px-3 py-2.5 font-sans">
                               {c.telefono && c.telefono.trim() !== '' && c.telefono.trim() !== '0' ? (
                                 <div className="flex items-center gap-1.5">
                                   <span className="font-mono text-slate-700 font-bold">{c.telefono}</span>
                                   <button
                                     type="button"
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       handleSendWhatsAppSingleClient(c);
                                     }}
                                     className="p-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 hover:text-emerald-800 transition-all border border-emerald-200 shadow-2xs active:scale-95 cursor-pointer"
                                     title={`Enviar recordatorio de pago por WhatsApp a ${c.nombre}`}
                                   >
                                     <MessageCircle className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
                                   </button>
                                 </div>
                               ) : (
                                 <span className="text-slate-400 italic text-[10px]">Sin teléfono</span>
                               )}
                             </td>
                            <td className="px-3 py-2.5 text-center font-mono">${fmtUSD(c.limite_credito)}</td>
                            <td className="px-3 py-2.5 text-center font-mono text-slate-600">${fmtUSD(c.credito_disponible)}</td>
                            <td className={`px-3 py-2.5 text-center font-mono font-extrabold ${safeNum(c.saldo_pendiente) > 0.01 ? 'text-red-550' : 'text-slate-400'}`}>
                              ${fmtUSD(c.saldo_pendiente)}
                            </td>
                            {/* Descuento */}
                            <td className="px-3 py-2 text-center">
                              {c.porcentaje_descuento > 0 ? (
                                <span className="inline-flex items-center gap-0.5 bg-violet-100 text-violet-800 border border-violet-300 rounded-full px-2 py-0.5 text-[9px] font-black font-sans">
                                  <span>%</span>
                                  <span>{c.porcentaje_descuento}%</span>
                                </span>
                              ) : (
                                <span className="text-slate-300 text-[9px] font-sans">—</span>
                              )}
                            </td>
                            {/* Precio Costo */}
                            <td className="px-3 py-2 text-center">
                              {c.aplica_precio_costo ? (
                                <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-2 py-0.5 text-[9px] font-black font-sans">
                                  <span>✓</span>
                                  <span>COSTO</span>
                                </span>
                              ) : (
                                <span className="text-slate-300 text-[9px] font-sans">—</span>
                              )}
                            </td>
                            {/* NEW NAVIGATION BUTTONS IN ROW TO DIRECTLY GO TO SUBMODULES */}
                            <td className="px-3 py-2">
                               <div className="flex justify-center gap-1.5">
                                 <button
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     handleSendWhatsAppSingleClient(c);
                                   }}
                                   className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded border border-emerald-300 font-sans font-bold transition-all flex items-center gap-1 text-[9px] shadow-2xs active:scale-95 cursor-pointer"
                                   title="Enviar recordatorio de pago vía WhatsApp"
                                 >
                                   <MessageCircle className="w-3 h-3 text-emerald-600" />
                                   <span>WhatsApp</span>
                                 </button>

                                 <button
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setSelectedRowClient(c);
                                     setActiveSubTab('historial');
                                   }}
                                   className="bg-slate-50 hover:bg-sky-100 hover:text-sky-700 text-slate-650 px-2 py-0.5 rounded border border-slate-300 hover:border-sky-300 font-sans font-bold transition-all flex items-center gap-0.5 text-[9px] shadow-sm active:scale-95 cursor-pointer"
                                   title="Ir a Historial Detalle de este cliente"
                                 >
                                   <FileText className="w-3 h-3 text-sky-650" />
                                   <span>Historial</span>
                                 </button>
                                 <button
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setSelectedRowClient(c);
                                     setActiveSubTab('creditos');
                                   }}
                                   className="bg-slate-50 hover:bg-amber-100 hover:text-amber-700 text-slate-650 px-2 py-0.5 rounded border border-slate-300 hover:border-amber-300 font-sans font-bold transition-all flex items-center gap-0.5 text-[9px] shadow-sm active:scale-95 cursor-pointer"
                                   title="Ir a Créditos / Abonos de este cliente"
                                 >
                                   <DollarSign className="w-3 h-3 text-amber-650" />
                                   <span>Créditos</span>
                                 </button>
                               </div>
                             </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: HISTORIAL DETALLE */}
          {activeSubTab === 'historial' && (
            <div className="space-y-4 animate-fade-in">
              {!selectedRowClient ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white border border-slate-200 rounded-lg text-slate-400 text-center shadow-sm">
                  <AlertCircle className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="font-sans font-medium">Por favor, seleccione un cliente en la pestaña <strong>Catálogo</strong> para ver su historial detallado.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selected Client Info Card */}
                  <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white p-4 rounded-lg shadow-sm border border-slate-600 space-y-2">
                    <h3 className="text-sm font-bold tracking-wide flex items-center gap-1.5 uppercase">
                      <FileText className="w-4 h-4 text-sky-400" />
                      Historial Detallado: {selectedRowClient.nombre}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] font-sans pt-1">
                      <div><span className="text-slate-350">Identificación:</span> <span className="font-mono font-bold text-slate-100">{selectedRowClient.cedula_rif}</span></div>
                      <div><span className="text-slate-350">Teléfono:</span> <span className="font-bold text-slate-100">{selectedRowClient.telefono || 'N/A'}</span></div>
                      <div><span className="text-slate-350">Dirección:</span> <span className="font-bold text-slate-100">{selectedRowClient.direccion || 'N/A'}</span></div>
                      <div><span className="text-slate-350">Límite Crédito:</span> <span className="font-mono font-bold text-sky-300">${fmtUSD(selectedRowClient.limite_credito)} USD</span></div>
                      <div><span className="text-slate-350">Crédito Disponible:</span> <span className="font-mono font-bold text-emerald-350">${fmtUSD(selectedRowClient.credito_disponible)} USD</span></div>
                      <div><span className="text-slate-350">Deuda Pendiente:</span> <span className="font-mono font-bold text-red-300">${fmtUSD(selectedRowClient.saldo_pendiente)} USD</span></div>
                    </div>
                  </div>

                  {/* Client Sales Table */}
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="report-print-target w-full border-collapse text-[11px] text-left">
                        <thead className="bg-slate-600 text-white border-b border-slate-700">
                          <tr>
                            <th className="px-3 py-2 font-sans uppercase">Fecha</th>
                            <th className="px-3 py-2 font-sans uppercase">Factura Nro</th>
                            <th className="px-3 py-2 text-right font-sans uppercase">Subtotal</th>
                            <th className="px-3 py-2 text-right font-sans uppercase">Descuento</th>
                            <th className="px-3 py-2 text-right font-sans uppercase">Total USD</th>
                            <th className="px-3 py-2 text-right font-sans uppercase">Total VES</th>
                            <th className="px-3 py-2 text-center font-sans uppercase">Estatus</th>
                            <th className="px-3 py-2 text-center font-sans uppercase">Detalle</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {clientSalesHistory.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-3 py-8 text-center text-slate-400 font-sans italic">
                                Este cliente no tiene facturas de venta registradas.
                              </td>
                            </tr>
                          ) : (
                            clientSalesHistory.map(s => {
                              const isExpanded = expandedInvoice === s.factura_nro;
                              return (
                                <React.Fragment key={s.factura_nro}>
                                  <tr className="hover:bg-slate-50 transition-colors">
                                    <td className="px-3 py-2.5 font-mono">{s.fecha}</td>
                                    <td className="px-3 py-2.5 font-mono font-bold text-slate-650">{s.factura_nro}</td>
                                    <td className="px-3 py-2.5 text-right font-mono">${fmtUSD(s.subtotal)}</td>
                                    <td className="px-3 py-2.5 text-right font-mono text-red-550">-${fmtUSD(s.descuento)}</td>
                                    <td className="px-3 py-2.5 text-right font-mono font-bold">${fmtUSD(s.totalUSD)}</td>
                                    <td className="px-3 py-2.5 text-right font-mono">${fmtUSD(s.totalVES)}</td>
                                    <td className="px-3 py-2.5 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-sans font-bold ${s.estatus === 'Anulada' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {s.estatus || 'Procesada'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                      <button
                                        onClick={() => setExpandedInvoice(isExpanded ? null : s.factura_nro)}
                                        className="bg-slate-50 hover:bg-slate-200 border border-slate-350 text-slate-650 px-2 py-0.5 rounded text-[10px] transition-all font-sans"
                                      >
                                        {isExpanded ? 'Ocultar' : 'Ver Items'}
                                      </button>
                                    </td>
                                  </tr>
                                  {isExpanded && (
                                    <tr className="bg-slate-50/50">
                                      <td colSpan={8} className="px-6 py-3 border-l-4 border-sky-400 bg-sky-50/10">
                                        <div className="space-y-1.5">
                                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Artículos Comprados:</div>
                                          <table className="w-full border-collapse text-[10px] text-left">
                                            <thead>
                                              <tr className="text-slate-450 border-b border-slate-200">
                                                <th className="py-1 uppercase font-sans">Código / Barras</th>
                                                <th className="py-1 uppercase font-sans">Descripción del Producto</th>
                                                <th className="py-1 text-center uppercase font-sans">Cant.</th>
                                                <th className="py-1 text-right uppercase font-sans">Precio Unit.</th>
                                                <th className="py-1 text-right uppercase font-sans">Total USD</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-slate-650">
                                              {s.items?.map((item, idx) => (
                                                <tr key={idx}>
                                                  <td className="py-1.5 font-mono">{item.product.barcode}</td>
                                                  <td className="py-1.5 font-sans uppercase text-[9px]">{item.product.description}</td>
                                                  <td className="py-1.5 text-center font-mono">{item.qty}</td>
                                                  <td className="py-1.5 text-right font-mono">${fmtUSD(item.priceUSD)}</td>
                                                  <td className="py-1.5 text-right font-mono font-bold">${fmtUSD(item.totalUSD)}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MOVIMIENTOS POR RANKING */}
          {activeSubTab === 'ranking' && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm animate-fade-in flex flex-col">
              <div className="p-3 bg-slate-700 text-white font-sans uppercase font-bold text-xs tracking-wider flex items-center gap-1.5 shadow-xs">
                <TrendingUp className="w-4 h-4 text-sky-400" />
                Ranking de Clientes por Volumen de Compras ($ USD)
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[480px]">
                <table className="w-full border-collapse text-[11px] text-left">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 border-b border-slate-300 shadow-xs">
                    <tr>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 text-center font-sans uppercase w-16">Posición</th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 font-sans uppercase">Nombre / Razón Social</th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 font-sans uppercase">Identificación (ID)</th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 text-center font-sans uppercase">Compras Totales</th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 text-center font-sans uppercase">Transacciones</th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 text-center font-sans uppercase">Compra Promedio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {rankingData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-sans italic">
                          No hay historial de ventas en el sistema para calcular el ranking.
                        </td>
                      </tr>
                    ) : (
                      rankingData.map((r, idx) => {
                        let posBadge = `${idx + 1}`;
                        let trClass = "hover:bg-slate-50";
                        if (idx === 0) {
                          posBadge = "🥇 1";
                          trClass = "bg-amber-50/20 hover:bg-amber-55 font-semibold";
                        } else if (idx === 1) {
                          posBadge = "🥈 2";
                          trClass = "bg-slate-50/40 hover:bg-slate-150 font-semibold";
                        } else if (idx === 2) {
                          posBadge = "🥉 3";
                          trClass = "bg-amber-100/10 hover:bg-amber-100/20 font-semibold";
                        }

                        const clientObj = clients.find(c => c.cedula_rif === r.cedula_rif);

                        return (
                          <tr 
                            key={r.cedula_rif} 
                            onClick={() => {
                              if (clientObj) setSelectedRowClient(clientObj);
                            }}
                            onContextMenu={(e) => {
                              if (clientObj) {
                                e.preventDefault();
                                setSelectedRowClient(clientObj);
                                const menuWidth = 280;
                                const menuHeight = 290;
                                const clickX = e.clientX;
                                const clickY = e.clientY;
                                const x = clickX + menuWidth > window.innerWidth ? Math.max(10, window.innerWidth - menuWidth - 15) : clickX;
                                const y = clickY + menuHeight > window.innerHeight ? Math.max(10, window.innerHeight - menuHeight - 15) : clickY;
                                setContextMenu({ x, y, type: 'client', data: clientObj });
                              }
                            }}
                            className={`${trClass} cursor-pointer transition-colors`}
                          >
                            <td className="px-4 py-2.5 text-center font-bold text-slate-600">{posBadge}</td>
                            <td className="px-4 py-2.5 font-sans font-medium uppercase">{r.nombre}</td>
                            <td className="px-4 py-2.5 font-mono">{r.cedula_rif}</td>
                            <td className="px-4 py-2.5 text-center font-mono font-extrabold text-blue-600">${fmtUSD(r.totalSpent)}</td>
                            <td className="px-4 py-2.5 text-center font-mono">{r.salesCount}</td>
                            <td className="px-4 py-2.5 text-center font-mono text-slate-600">${fmtUSD(r.avgSale)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: CRÉDITOS / ABONOS TIMELINE */}
          {activeSubTab === 'creditos' && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm animate-fade-in flex flex-col">
              <div className="p-3 bg-slate-700 text-white font-sans uppercase font-bold text-xs tracking-wider flex items-center justify-between gap-1.5 shadow-xs">
                <span className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-sky-400" />
                  Movimientos de Cuentas: Créditos Otorgados y Abonos Recibidos
                </span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded font-mono text-slate-200 lowercase">
                  {selectedRowClient ? `filtrado por: ${selectedRowClient.nombre.substring(0, 15)}...` : 'vista general (todos)'}
                </span>
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[480px]">
                <table className="w-full border-collapse text-[11px] text-left">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 border-b border-slate-300 shadow-xs">
                    <tr>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 font-sans uppercase w-28 cursor-pointer select-none" onClick={() => handleCreditSort('tipo')}>
                        <div className="flex items-center gap-1">
                          <span>Tipo Movimiento</span>
                          <CreditSortIcon field="tipo" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 font-sans uppercase cursor-pointer select-none" onClick={() => handleCreditSort('fecha')}>
                        <div className="flex items-center gap-1">
                          <span>Fecha / Hora</span>
                          <CreditSortIcon field="fecha" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 font-sans uppercase cursor-pointer select-none" onClick={() => handleCreditSort('ref')}>
                        <div className="flex items-center gap-1">
                          <span>Referencia / Factura</span>
                          <CreditSortIcon field="ref" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 font-sans uppercase cursor-pointer select-none" onClick={() => handleCreditSort('nombre')}>
                        <div className="flex items-center gap-1">
                          <span>Cliente</span>
                          <CreditSortIcon field="nombre" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 font-sans uppercase cursor-pointer select-none" onClick={() => handleCreditSort('cedula_rif')}>
                        <div className="flex items-center gap-1">
                          <span>Identificación (ID)</span>
                          <CreditSortIcon field="cedula_rif" />
                        </div>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 font-sans uppercase select-none">
                        <span>Forma de Pago</span>
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2.5 text-right font-sans uppercase cursor-pointer select-none" onClick={() => handleCreditSort('monto')}>
                        <div className="flex items-center justify-end gap-1">
                          <span>Monto ($ USD)</span>
                          <CreditSortIcon field="monto" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredCreditAbonoList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-sans italic">
                          No se registran movimientos de créditos o abonos {selectedRowClient ? 'para este cliente.' : 'en el sistema.'}
                        </td>
                      </tr>
                    ) : (
                      filteredCreditAbonoList.map((item, idx) => {
                        const isCredit = item.tipo === 'Crédito';
                        const isDev = item.tipo === 'Devolución';
                        const clientObj = clients.find(c => c.cedula_rif === item.cedula_rif);

                        return (
                          <tr 
                            key={idx} 
                            onClick={() => {
                              if (clientObj) setSelectedRowClient(clientObj);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (clientObj) setSelectedRowClient(clientObj);
                              const menuWidth = 280;
                              const menuHeight = 290;
                              const clickX = e.clientX;
                              const clickY = e.clientY;
                              const x = clickX + menuWidth > window.innerWidth ? Math.max(10, window.innerWidth - menuWidth - 15) : clickX;
                              const y = clickY + menuHeight > window.innerHeight ? Math.max(10, window.innerHeight - menuHeight - 15) : clickY;
                              setContextMenu({ x, y, type: 'credit_movement', data: { item, client: clientObj } });
                            }}
                            className="hover:bg-slate-55 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-2.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-sans font-bold flex items-center w-fit gap-1 ${
                                isCredit ? 'bg-orange-100 text-orange-850' : 
                                isDev ? 'bg-purple-100 text-purple-850' : 
                                'bg-emerald-100 text-emerald-850'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  isCredit ? 'bg-orange-500' : 
                                  isDev ? 'bg-purple-500' : 
                                  'bg-emerald-500'
                                }`} />
                                {item.tipo}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono">{item.fecha}</td>
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-605">{item.ref}</td>
                            <td className="px-4 py-2.5 font-sans font-medium uppercase">{item.nombre}</td>
                            <td className="px-4 py-2.5 font-mono">{item.cedula_rif}</td>
                            <td className="px-4 py-2.5 font-sans">
                              {isCredit ? (
                                <span className="text-[10px] font-bold text-orange-600">Crédito Otorgado</span>
                              ) : isDev ? (
                                <span className="text-[10px] font-bold text-purple-600">Devolución / Nota Crédito</span>
                              ) : (
                                <div className="flex flex-col">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold w-fit ${
                                    item.metodoRaw === 'Efectivo$' ? 'bg-emerald-100 text-emerald-800' :
                                    item.metodoRaw === 'EfectivoBs' ? 'bg-teal-100 text-teal-800' :
                                    item.metodoRaw === 'Biopago' ? 'bg-sky-100 text-sky-800' :
                                    'bg-purple-100 text-purple-800'
                                  }`}>
                                    {item.metodo}
                                  </span>
                                  {item.referencia && (
                                    <span className="text-[9px] font-mono text-slate-400">Ref: {item.referencia}</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono font-extrabold ${
                              isCredit ? 'text-orange-600' : isDev ? 'text-purple-600' : 'text-emerald-600'
                            }`}>
                              {isCredit ? '+' : '-'}${fmtUSD(item.monto)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: ACTION BUTTONS PANEL */}
        <div className="lg:col-span-2 space-y-3 sticky top-2 self-start">
          
          <div className="bg-slate-150 border border-slate-200 rounded-lg p-3 shadow-inner flex flex-col justify-start h-fit">
            <h4 className="text-[10px] font-sans font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3 flex items-center gap-1">
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              Operaciones
            </h4>

            {/* Selected Client Preview Banner */}
            {selectedRowClient && (
              <div className="bg-sky-50 border border-sky-200 text-sky-900 text-[10px] p-2 rounded mb-3 font-sans shadow-sm leading-tight flex flex-col gap-0.5">
                <span className="font-extrabold uppercase truncate">{selectedRowClient.nombre}</span>
                <span className="font-mono text-slate-500 font-bold">{selectedRowClient.cedula_rif}</span>
                {selectedRowClient.saldo_pendiente > 0.01 && (
                  <span className="text-red-700 font-black mt-1 font-mono">Deuda: ${fmtUSD(selectedRowClient.saldo_pendiente)}</span>
                )}
              </div>
            )}

            {/* Vertically stacked buttons */}
            <div className="flex flex-col gap-2.5">
              
              {/* BUTTON 1: AGREGAR */}
              {hasPermission('crear') && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4 bg-emerald-700/50 rounded-full p-0.5" />
                  <span>Agregar</span>
                </button>
              )}

              {/* BUTTON 2: MODIFICAR */}
              <button
                onClick={handleOpenEdit}
                disabled={!selectedRowClient || !hasPermission('editar')}
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-cyan-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                title={!selectedRowClient ? "Seleccione un cliente en el Catálogo para modificar" : !hasPermission('editar') ? "No posee permisos para modificar" : "Modificar cliente seleccionado"}
              >
                <RefreshCw className="w-4 h-4 bg-cyan-750/50 disabled:bg-transparent rounded-full p-0.5" />
                <span>Modificar</span>
              </button>

              {/* BUTTON 3: ELIMINAR */}
              {hasPermission('eliminar') && (
                <button
                  onClick={handleDeleteClick}
                  disabled={!selectedRowClient || selectedRowClient.saldo_pendiente > 0.01}
                  className="w-full bg-red-655 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-red-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                  title={
                    !selectedRowClient 
                      ? "Seleccione un cliente en el Catálogo para eliminar" 
                      : selectedRowClient.saldo_pendiente > 0.01 
                        ? "No se puede eliminar un cliente con deuda pendiente" 
                        : "Eliminar cliente permanentemente"
                  }
                >
                  <MinusCircle className="w-4 h-4 bg-red-700/50 disabled:bg-transparent rounded-full p-0.5" />
                  <span>Eliminar</span>
                </button>
              )}

              {/* BUTTON 4: ABONO */}
              <button
                onClick={handleOpenAbono}
                disabled={!selectedRowClient || selectedRowClient.saldo_pendiente <= 0.01 || !hasPermission('editar')}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-amber-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                title={
                  !selectedRowClient 
                    ? "Seleccione un cliente en el Catálogo para registrar abono" 
                    : !hasPermission('editar')
                      ? "No posee permisos para registrar abonos"
                      : selectedRowClient.saldo_pendiente <= 0.01 
                        ? "El cliente seleccionado no presenta deuda pendiente" 
                        : "Registrar abono de crédito"
                }
              >
                <DollarSign className="w-4 h-4 bg-amber-750/50 disabled:bg-transparent rounded-full p-0.5" />
                <span>Abono</span>
              </button>

              {/* BUTTON 5: CARGA MASIVA (Exclusivo Administrador) */}
              {_currentUser.rol?.toLowerCase() === 'administrador' && (
                <button
                  onClick={() => {
                    setParsedBulkClients([]);
                    setShowBulkModal(true);
                  }}
                  className="w-full bg-purple-700 hover:bg-purple-800 text-white border border-purple-900 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95 mt-1"
                  title="Importar catálogo de clientes masivo desde Excel, CSV o PDF (Exclusivo Administrador)"
                >
                  <FileSpreadsheet className="w-4 h-4 bg-purple-900/60 rounded-full p-0.5 text-yellow-300" />
                  <span>Carga Masiva</span>
                </button>
              )}

              {/* SECCIÓN DE REPORTES Y EXPORTACIÓN */}
              {hasPermission('ver') && (
                <div className="border-t border-slate-300/80 pt-2.5 mt-2 space-y-1.5 font-sans">
                  <span className="text-[9px] font-sans font-extrabold text-slate-500 uppercase tracking-wider block">
                    Reportes y Exportación
                  </span>

                  {/* REPORT BUTTON 1: PDF */}
                  <button
                    onClick={handleDownloadReport}
                    className="w-full bg-slate-700 hover:bg-slate-800 text-white border border-slate-800 py-2 px-2.5 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[10.5px] uppercase tracking-wider text-left transition-all active:scale-95"
                    title="Imprimir o descargar reporte PDF con el filtro actual"
                  >
                    <FileText className="w-3.5 h-3.5 text-sky-400 bg-slate-800/60 rounded p-0.5" />
                    <span>Descargar PDF</span>
                  </button>

                  {/* REPORT BUTTON 2: EXCEL (.XLSX) */}
                  <button
                    onClick={handleExportExcel}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-900 py-2 px-2.5 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[10.5px] uppercase tracking-wider text-left transition-all active:scale-95"
                    title="Exportar listado actual de clientes y saldos a Excel (.xlsx)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300 bg-emerald-900/60 rounded p-0.5" />
                    <span>Exportar Excel</span>
                  </button>

                  {/* REPORT BUTTON 3: WHATSAPP (CON RECONOCIMIENTO DE CLIENTE SELECCIONADO) */}
                  {selectedRowClient ? (
                    <button
                      onClick={() => handleSendWhatsAppSingleClient(selectedRowClient)}
                      className="w-full bg-[#128C7E] hover:bg-[#075E54] text-white border border-[#075E54] py-2 px-2.5 rounded shadow-sm flex items-center justify-between font-sans font-bold text-[10.5px] uppercase tracking-wider text-left transition-all active:scale-95 cursor-pointer"
                      title={`Enviar recordatorio de pago vía WhatsApp a ${selectedRowClient.nombre}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-200 bg-[#075E54]/60 rounded p-0.5 flex-shrink-0" />
                        <div className="truncate text-left">
                          <span className="block truncate font-extrabold text-white">WhatsApp Recordatorio</span>
                          <span className="block text-[8.5px] font-mono text-emerald-200 font-normal truncate">
                            {selectedRowClient.telefono && selectedRowClient.telefono.trim() !== '0' ? selectedRowClient.telefono : '⚠️ Sin teléfono'}
                          </span>
                        </div>
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={handleSendWhatsAppReport}
                      disabled={isSendingWhatsAppReport}
                      className="w-full bg-[#128C7E] hover:bg-[#075E54] disabled:opacity-50 text-white border border-[#075E54] py-2 px-2.5 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[10.5px] uppercase tracking-wider text-left transition-all active:scale-95 cursor-pointer"
                      title="Enviar resumen general de cartera y deudores vía WhatsApp"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-200 bg-[#075E54]/60 rounded p-0.5" />
                      <span>{isSendingWhatsAppReport ? 'Enviando...' : 'Enviar WhatsApp'}</span>
                    </button>
                  )}
                </div>
              )}

            </div>

            {selectedRowClient && (
              <button
                onClick={() => setSelectedRowClient(null)}
                className="mt-6 text-[10px] text-slate-455 hover:text-slate-650 underline font-sans text-center transition-all"
              >
                Limpiar selección
              </button>
            )}

            {/* Instruction tooltip */}
            <div className="mt-4 p-2 bg-slate-200 border border-slate-300 text-[10px] font-sans text-slate-500 rounded flex gap-1.5">
              <Info className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span>Haz clic en un cliente en el Catálogo para seleccionarlo y activar las operaciones de Modificar, Eliminar y Abono.</span>
            </div>

          </div>

        </div>

      </div>

      {/* MODAL: ADD CLIENT */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-500" />
                REGISTRAR NUEVO CLIENTE
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Cédula / RIF <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: V-12345678"
                    value={newDoc}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (!val || val.trim() === '') {
                        setNewDoc('V-');
                      } else if (!val.startsWith('V-') && !val.startsWith('J-') && !val.startsWith('E-') && !val.startsWith('G-') && !val.startsWith('P-')) {
                        setNewDoc('V-' + val.replace(/^[^\d]+/, ''));
                      } else {
                        setNewDoc(val);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej: 0414-1234567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Nombre o Razón Social <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Nombre completo..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none font-sans"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Dirección de Domicilio</label>
                <input
                  type="text"
                  placeholder="Ciudad, calle, local..."
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Límite de Crédito ($ USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newCreditLimit}
                    onChange={(e) => setNewCreditLimit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none font-mono text-center"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Descuento Pre-aprobado (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    disabled={newPrecioCosto}
                    value={newDiscount}
                    onChange={(e) => setNewDiscount(e.target.value)}
                    className={`w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none font-mono text-center ${newPrecioCosto ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}`}
                  />
                </div>
              </div>

              {/* Precio Costo Toggle */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPrecioCosto}
                    onChange={(e) => {
                      setNewPrecioCosto(e.target.checked);
                      if (e.target.checked) {
                        setNewDiscount('0');
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
                <div>
                  <span className="text-xs font-bold text-amber-800 font-sans">Cobrar a Precio Costo</span>
                  <p className="text-[10px] text-amber-600 font-sans">Si se activa, todos los productos que compre este cliente se facturarán al precio de costo del inventario.</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-655 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
                >
                  REGISTRAR CLIENTE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT CLIENT */}
      {showEditModal && selectedRowClient && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Edit className="w-4 h-4 text-sky-500" />
                MODIFICAR CLIENTE
              </h3>
              <button onClick={() => { setShowEditModal(false); }} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Cédula / RIF <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: V-12345678"
                    value={editDoc}
                    onChange={(e) => setEditDoc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej: 0414-1234567"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Nombre o Razón Social <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Nombre completo..."
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none font-sans"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Dirección de Domicilio</label>
                <input
                  type="text"
                  placeholder="Ciudad, calle, local..."
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none font-sans"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 text-center">
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Estado</label>
                  <select
                    value={editEstado}
                    onChange={(e) => setEditEstado(e.target.value as 'Activo' | 'Inactivo')}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none font-sans text-center"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Límite Crédito ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editCreditLimit}
                    onChange={(e) => setEditCreditLimit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none font-mono text-center"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Descuento (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    disabled={editPrecioCosto}
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(e.target.value)}
                    className={`w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none font-mono text-center ${editPrecioCosto ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}`}
                  />
                </div>
              </div>

              {safeNum(selectedRowClient.saldo_pendiente) > 0 && (
                <div className="bg-red-50 text-[10px] text-red-700 p-2.5 rounded border border-red-200 font-sans">
                  <strong>Nota Importante:</strong> Este cliente posee una deuda de <strong>${fmtUSD(selectedRowClient.saldo_pendiente)} USD</strong>. Si modificas su límite de crédito, el crédito disponible se reajustará automáticamente manteniendo el saldo pendiente actual.
                </div>
              )}

              {/* Precio Costo Toggle */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPrecioCosto}
                    onChange={(e) => {
                      setEditPrecioCosto(e.target.checked);
                      if (e.target.checked) {
                        setEditDiscount('0');
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
                <div>
                  <span className="text-xs font-bold text-amber-800 font-sans">Cobrar a Precio Costo</span>
                  <p className="text-[10px] text-amber-600 font-sans">Si se activa, todos los productos que compre este cliente se facturarán al precio de costo del inventario.</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); }}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-650 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-sky-600 hover:bg-sky-700 text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
                >
                  GUARDAR CAMBIOS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR ABONO */}
      {showAbonoModal && selectedRowClient && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                ABONAR A CUENTA CORRIENTE
              </h3>
              <button onClick={() => { setShowAbonoModal(false); }} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
              <div><span className="text-slate-550 font-sans">Cliente:</span> <span className="text-slate-800 font-bold select-text">{selectedRowClient.nombre}</span></div>
              <div><span className="text-slate-550 font-sans">ID/RIF:</span> <span className="text-slate-600 font-bold font-mono">{selectedRowClient.cedula_rif}</span></div>
              <div><span className="text-slate-550 font-sans">Deuda Total Pendiente:</span> <span className="text-red-500 font-black font-mono">${fmtUSD(selectedRowClient.saldo_pendiente)} USD</span></div>
              <div><span className="text-slate-550 font-sans">Límite Crédito Otorgado:</span> <span className="text-slate-600 font-mono">${fmtUSD(selectedRowClient.limite_credito)} USD</span></div>
            </div>

            <form onSubmit={handleSaveAbono} className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Monto del Abono ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder={`Ej: ${fmtUSD(selectedRowClient.saldo_pendiente)}`}
                  value={abonoVal}
                  onChange={(e) => setAbonoVal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-emerald-700 font-bold font-mono focus:bg-white focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Forma de Pago del Abono</label>
                <select
                  value={abonoMethod}
                  onChange={(e) => setAbonoMethod(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs font-sans text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none"
                >
                  <option value="Efectivo$">💵 Efectivo en Dólares ($ USD)</option>
                  <option value="EfectivoBs">🇻🇪 Efectivo en Bolívares (Bs VES)</option>
                  <option value="TarjetaBs">💳 Tarjeta de Débito / Crédito (Bs)</option>
                  <option value="PagoMovil">📱 Pago Móvil (Bs)</option>
                  <option value="Biopago">👆 Biopago (Bs)</option>
                </select>
              </div>

              {abonoMethod !== 'Efectivo$' && (
                <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded text-xs font-mono text-emerald-900 flex justify-between items-center">
                  <span className="font-sans text-[10px] font-bold uppercase text-emerald-700">Monto en Bs:</span>
                  <strong className="text-sm">Bs {((parseFloat(abonoVal || '0') || 0) * tasaDia).toFixed(2)}</strong>
                </div>
              )}

              {(abonoMethod === 'TarjetaBs' || abonoMethod === 'PagoMovil' || abonoMethod === 'Biopago') && (
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Nro. de Referencia (Opcional)</label>
                  <input
                    type="text"
                    value={abonoRef}
                    onChange={(e) => setAbonoRef(e.target.value)}
                    placeholder="Ej: 123456"
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2 text-xs font-mono focus:bg-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="text-[10px] text-slate-500 font-sans">
                * Nota: El abono se contabilizará según la forma de pago elegida y restablecerá el crédito disponible del cliente.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAbonoModal(false); }}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-655 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
                >
                  REGISTRAR ABONO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CARGA MASIVA / MIGRACIÓN DE CLIENTES (EXCLUSIVO ADMINISTRADOR) */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="bg-purple-900 text-white p-4 flex items-center justify-between border-b border-purple-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-800 rounded-lg">
                  <FileSpreadsheet className="w-5 h-5 text-yellow-300" />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-sm uppercase tracking-wide">Carga Masiva y Migración de Clientes</h3>
                  <p className="text-[11px] text-purple-200 font-sans">
                    Importación exclusiva para Administradores desde Excel (.xlsx, .xls), CSV o PDF
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-purple-200 hover:text-white hover:bg-purple-800 p-1.5 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-grow">
              
              {/* Instructions & Template Download */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div className="md:col-span-2 bg-purple-50/60 border border-purple-200/80 p-3.5 rounded-lg text-xs text-purple-950 font-sans leading-relaxed space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-purple-900">
                    <Info className="w-4 h-4 text-purple-700" />
                    <span>Formatos Aceptados: Excel (.xlsx, .xls), CSV y PDF</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Sube un reporte o archivo con las columnas: <strong>RIF/Cédula, Nombre, Teléfono, Límite Crédito, Saldo Pendiente (Deuda Inicial), % Descuento, Precio Costo (SI/NO)</strong>.
                  </p>
                </div>

                <div className="flex flex-col justify-center gap-2 bg-slate-50 border border-slate-200 p-3 rounded-lg">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const XLSX = await loadXlsx();
                        const templateData = [
                          {
                            "cedula_rif": "V-12345678",
                            "nombre": "DISTRIBUIDORA EJEMPLO C.A.",
                            "telefono": "04141234567",
                            "direccion": "AV. PRINCIPAL LOCAL 1",
                            "limite_credito": 500.00,
                            "saldo_pendiente": 120.50,
                            "porcentaje_descuento": 5,
                            "aplica_precio_costo": "NO"
                          },
                          {
                            "cedula_rif": "V-87654321",
                            "nombre": "MARIA PEREZ (CLIENTE FRECUENTE)",
                            "telefono": "04249876543",
                            "direccion": "CALLE LOS FLORES #12",
                            "limite_credito": 300.00,
                            "saldo_pendiente": 0.00,
                            "porcentaje_descuento": 0,
                            "aplica_precio_costo": "SI"
                          }
                        ];
                        const ws = XLSX.utils.json_to_sheet(templateData);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Clientes_Migracion");
                        XLSX.writeFile(wb, "Plantilla_Migracion_Clientes_WinterPOS.xlsx");
                      } catch (err: any) {
                        showAlert(`Error al generar la plantilla: ${err.message}`, 'Error', 'error');
                      }
                    }}
                    className="w-full bg-slate-700 hover:bg-slate-800 text-white py-2 px-3 rounded text-[11px] font-sans font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Descargar Plantilla Excel</span>
                  </button>
                </div>

              </div>

              {/* File Dropzone / Selector */}
              <div className="border-2 border-dashed border-purple-300 hover:border-purple-500 bg-purple-50/30 rounded-xl p-6 text-center transition-all cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv, .pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBulkFileLoading(true);
                    setBulkImportProgress('Procesando archivo...');
                    try {
                      const ext = file.name.split('.').pop()?.toLowerCase();
                      let rawClients: any[] = [];

                      if (ext === 'pdf') {
                        setBulkImportProgress('Extrayendo clientes desde documento PDF...');
                        const pdfjsLib = await loadPdfJs();
                        const arrayBuffer = await file.arrayBuffer();
                        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                        let fullText = '';
                        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                          const page = await pdf.getPage(pageNum);
                          const textContent = await page.getTextContent();
                          const pageText = textContent.items.map((item: any) => item.str).join(' ');
                          fullText += pageText + '\n';
                        }
                        
                        // Parse PDF line by line or pattern search
                        const lines = fullText.split('\n');
                        const docRegex = /([VJEGvjeg][-\s]?\d{6,9})/g;

                        for (const line of lines) {
                          const matches = line.match(docRegex);
                          if (matches && matches.length > 0) {
                            const doc = matches[0].toUpperCase().replace(/\s+/g, '');
                            // Extract numeric amounts if present
                            const nums = line.match(/\$?(\d+[\d,.]*)/g) || [];
                            const parsedNums = nums.map(n => parseFloat(n.replace('$', '').replace(',', '.'))).filter(n => !isNaN(n));
                            
                            const nameCandidate = line.replace(doc, '').replace(/[0-9$,.-]/g, '').trim();

                            rawClients.push({
                              cedula_rif: doc,
                              nombre: nameCandidate.length > 2 ? nameCandidate.substring(0, 40) : `CLIENTE ${doc}`,
                              telefono: '',
                              direccion: '',
                              limite_credito: parsedNums[0] || 0,
                              saldo_pendiente: parsedNums[1] || 0,
                              porcentaje_descuento: 0,
                              aplica_precio_costo: false
                            });
                          }
                        }
                      } else {
                        // Excel / CSV Parsing
                        setBulkImportProgress('Analizando hoja de cálculo...');
                        const XLSX = await loadXlsx();
                        const data = await file.arrayBuffer();
                        const workbook = XLSX.read(data);
                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

                        rawClients = jsonData.map((row: any) => {
                          const keys = Object.keys(row);
                          const findKey = (candidates: string[]) => keys.find(k => candidates.some(c => k.toLowerCase().includes(c)));

                          const docKey = findKey(['cedula', 'rif', 'rfc', 'identificacion', 'id', 'documento']);
                          const nameKey = findKey(['nombre', 'razon', 'cliente']);
                          const phoneKey = findKey(['telefono', 'celular', 'tlf']);
                          const dirKey = findKey(['direccion', 'domicilio', 'dir']);
                          const limitKey = findKey(['limite', 'credito_limite', 'cupo']);
                          const debtKey = findKey(['deuda', 'saldo', 'pendiente', 'saldo_pendiente']);
                          const descKey = findKey(['descuento', 'desc', 'porcentaje']);
                          const costoKey = findKey(['costo', 'precio_costo', 'aplica_costo']);

                          const docVal = docKey ? String(row[docKey]).trim() : '';
                          const nameVal = nameKey ? String(row[nameKey]).trim() : '';
                          const limitVal = limitKey ? parseFloat(String(row[limitKey]).replace(',', '.')) || 0 : 0;
                          const debtVal = debtKey ? parseFloat(String(row[debtKey]).replace(',', '.')) || 0 : 0;
                          const descVal = descKey ? parseFloat(String(row[descKey]).replace(',', '.')) || 0 : 0;
                          const costoValRaw = costoKey ? String(row[costoKey]).trim().toUpperCase() : '';
                          const costoVal = costoValRaw === 'SI' || costoValRaw === 'TRUE' || costoValRaw === '1' || costoValRaw.includes('COSTO');

                          return {
                            cedula_rif: docVal,
                            nombre: nameVal,
                            telefono: phoneKey ? String(row[phoneKey]).trim() : '',
                            direccion: dirKey ? String(row[dirKey]).trim() : '',
                            limite_credito: limitVal,
                            saldo_pendiente: debtVal,
                            porcentaje_descuento: descVal,
                            aplica_precio_costo: costoVal
                          };
                        });
                      }

                      // Filter valid clients & flag duplicates
                      const validList = rawClients
                        .filter(c => c.cedula_rif && c.cedula_rif.length >= 3 && c.nombre && c.nombre.length >= 2)
                        .map(c => {
                          const isDuplicate = clients.some(existing => existing.cedula_rif.toLowerCase() === c.cedula_rif.toLowerCase());
                          return { ...c, isDuplicate };
                        });

                      setParsedBulkClients(validList);
                      if (validList.length === 0) {
                        showAlert('No se pudieron reconocer datos válidos de clientes en el archivo. Verifique el formato y los encabezados.', 'Atención', 'warning');
                      }
                    } catch (err: any) {
                      showAlert(`Error al procesar el archivo: ${err.message}`, 'Error de Carga', 'error');
                    } finally {
                      setBulkFileLoading(false);
                      setBulkImportProgress('');
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                {bulkFileLoading ? (
                  <div className="flex flex-col items-center justify-center py-4 space-y-2">
                    <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-bold text-purple-900 font-sans">{bulkImportProgress}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-2 py-2">
                    <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shadow-inner">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="text-xs font-bold text-slate-800 font-sans">
                      Haz clic para seleccionar o arrastra tu archivo Excel, CSV o PDF aquí
                    </div>
                    <div className="text-[10px] text-slate-500 font-sans">
                      Archivos soportados: .xlsx, .xls, .csv, .pdf
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Table & Duplicate Strategy Selector */}
              {parsedBulkClients.length > 0 && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-3 text-xs font-sans">
                      <span className="font-bold text-slate-700">Resumen Carga:</span>
                      <span className="bg-emerald-100 text-emerald-800 font-mono font-bold px-2 py-0.5 rounded">
                        Total: {parsedBulkClients.length}
                      </span>
                      <span className="bg-amber-100 text-amber-800 font-mono font-bold px-2 py-0.5 rounded">
                        Duplicados: {parsedBulkClients.filter(c => c.isDuplicate).length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-sans">
                      <label className="text-slate-600 font-bold">Si el cliente ya existe:</label>
                      <select
                        value={bulkDuplicateMode}
                        onChange={(e) => setBulkDuplicateMode(e.target.value as any)}
                        className="bg-white border border-slate-300 text-slate-800 rounded px-2.5 py-1 text-xs outline-none font-bold"
                      >
                        <option value="update">Actualizar datos y saldos</option>
                        <option value="skip">Ignorar cliente duplicado</option>
                      </select>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-[11px] text-left border-collapse">
                      <thead className="bg-slate-700 text-white font-sans uppercase font-bold sticky top-0">
                        <tr>
                          <th className="p-2">Cédula / RIF</th>
                          <th className="p-2">Nombre / Razón Social</th>
                          <th className="p-2 text-center">Teléfono</th>
                          <th className="p-2 text-right">Límite Crédito</th>
                          <th className="p-2 text-right">Saldo Pendiente</th>
                          <th className="p-2 text-center">% Desc.</th>
                          <th className="p-2 text-center">P. Costo</th>
                          <th className="p-2 text-center">Estatus</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
                        {parsedBulkClients.map((c, idx) => (
                          <tr key={idx} className={c.isDuplicate ? 'bg-amber-50/70' : 'hover:bg-slate-50'}>
                            <td className="p-2 font-mono font-bold">{c.cedula_rif}</td>
                            <td className="p-2 uppercase font-medium">{c.nombre}</td>
                            <td className="p-2 text-center font-mono">{c.telefono || '—'}</td>
                            <td className="p-2 text-right font-mono font-bold">${fmtUSD(c.limite_credito)}</td>
                            <td className="p-2 text-right font-mono font-bold text-red-600">${fmtUSD(c.saldo_pendiente)}</td>
                            <td className="p-2 text-center font-mono">{c.porcentaje_descuento}%</td>
                            <td className="p-2 text-center">
                              {c.aplica_precio_costo ? (
                                <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded text-[9px]">COSTO</span>
                              ) : '—'}
                            </td>
                            <td className="p-2 text-center">
                              {c.isDuplicate ? (
                                <span className="bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded text-[9px]">Existe</span>
                              ) : (
                                <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[9px]">Nuevo</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

            </div>

            {/* Footer Buttons */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded text-xs font-bold font-sans transition-all"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={parsedBulkClients.length === 0 || bulkFileLoading}
                onClick={async () => {
                  if (!onAddClientsBulk) {
                    showAlert('La función de importación masiva no está disponible en este momento.', 'Error', 'error');
                    return;
                  }
                  try {
                    setBulkFileLoading(true);
                    setBulkImportProgress('Guardando clientes en base de datos...');
                    const count = await onAddClientsBulk(parsedBulkClients, bulkDuplicateMode);
                    if (count !== null) {
                      showAlert(`✅ Se han importado / actualizado ${count} clientes exitosamente en el catálogo.`, 'Carga Completada', 'success');
                      setShowBulkModal(false);
                    } else {
                      showAlert('Ocurrió un inconveniente al guardar la carga masiva.', 'Error', 'error');
                    }
                  } catch (err: any) {
                    showAlert(`Error al realizar importación: ${err.message}`, 'Error', 'error');
                  } finally {
                    setBulkFileLoading(false);
                    setBulkImportProgress('');
                  }
                }}
                className="bg-purple-700 hover:bg-purple-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-2 rounded text-xs font-bold font-sans tracking-wide transition-all shadow-md flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-yellow-300" />
                <span>CONFIRMAR E IMPORTAR CLIENTES ({parsedBulkClients.length})</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MENÚ CONTEXTUAL FLOTANTE (CLIC DERECHO EN CLIENTE O MOVIMIENTO) */}
      {contextMenu && (
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-[120] w-72 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-2xl overflow-hidden py-1 text-slate-700 font-sans text-xs animate-scale-in select-none"
        >
          {contextMenu.type === 'client' && (() => {
            const c = contextMenu.data as Client;
            return (
              <>
                {/* Header Cliente */}
                <div className="px-3 py-2 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-center gap-2.5 border-b border-slate-700">
                  <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700 flex-shrink-0">
                    <Users className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-white truncate uppercase">{c.nombre}</span>
                      {c.aplica_precio_costo && (
                        <span className="text-[8px] bg-amber-500 text-slate-900 px-1 py-0.2 rounded font-sans font-black">COSTO</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono font-bold block">{c.cedula_rif}</span>
                    <div className="flex items-center gap-2 text-[9.5px] font-mono mt-0.5">
                      {safeNum(c.saldo_pendiente) > 0.01 ? (
                        <span className="text-rose-400 font-bold">Deuda: ${fmtUSD(c.saldo_pendiente)}</span>
                      ) : (
                        <span className="text-emerald-400 font-bold">Al Día ($0.00)</span>
                      )}
                      <span className="text-slate-400">• Lím: ${fmtUSD(c.limite_credito)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-1 space-y-0.5">
                  {/* 1. Modificar Cliente */}
                  {hasPermission('editar') && (
                    <button
                      type="button"
                      onClick={() => {
                        setContextMenu(null);
                        setSelectedRowClient(c);
                        handleOpenEdit();
                      }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-cyan-50 hover:text-cyan-900 rounded-lg flex items-center gap-2 font-bold transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-cyan-600 flex-shrink-0" />
                      <span>Modificar Datos del Cliente</span>
                    </button>
                  )}

                  {/* 2. Registrar Abono */}
                  {hasPermission('editar') && (
                    <button
                      type="button"
                      disabled={c.saldo_pendiente <= 0.01}
                      onClick={() => {
                        setContextMenu(null);
                        setSelectedRowClient(c);
                        handleOpenAbono();
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 font-bold transition-colors ${
                        c.saldo_pendiente <= 0.01
                          ? 'opacity-40 cursor-not-allowed text-slate-400'
                          : 'hover:bg-amber-50 hover:text-amber-900 text-slate-700 cursor-pointer'
                      }`}
                    >
                      <DollarSign className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                      <span>Registrar Abono / Pago</span>
                    </button>
                  )}

                  {/* 3. Ver Historial Detalle */}
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      setSelectedRowClient(c);
                      setActiveSubTab('historial');
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 hover:text-blue-900 rounded-lg flex items-center gap-2 font-bold transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    <span>Ver Historial Transaccional</span>
                  </button>

                  {/* 4. Ver Créditos y Abonos */}
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      setSelectedRowClient(c);
                      setActiveSubTab('creditos');
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-emerald-50 hover:text-emerald-900 rounded-lg flex items-center gap-2 font-bold transition-colors cursor-pointer"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>Ver Créditos / Cuenta por Cobrar</span>
                  </button>

                  {/* 5. Enviar Estado de Cuenta por WhatsApp */}
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      handleSendWhatsAppSingleClient(c);
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-green-50 hover:text-green-900 rounded-lg flex items-center gap-2 font-bold transition-colors cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                    <span>Enviar Estado de Cuenta (WhatsApp)</span>
                  </button>

                  {/* 6. Eliminar Cliente */}
                  {hasPermission('eliminar') && (
                    <>
                      <div className="border-t border-slate-100 my-1"></div>
                      <button
                        type="button"
                        disabled={c.saldo_pendiente > 0.01}
                        onClick={() => {
                          setContextMenu(null);
                          setSelectedRowClient(c);
                          handleDeleteClick();
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 font-bold transition-colors ${
                          c.saldo_pendiente > 0.01
                            ? 'opacity-40 cursor-not-allowed text-slate-400'
                            : 'hover:bg-rose-50 text-rose-600 hover:text-rose-700 cursor-pointer'
                        }`}
                        title={c.saldo_pendiente > 0.01 ? "No se puede eliminar un cliente con deuda" : "Eliminar cliente"}
                      >
                        <MinusCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                        <span>Eliminar Cliente</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            );
          })()}

          {contextMenu.type === 'credit_movement' && (() => {
            const { item, client } = contextMenu.data;
            const isCredit = item.tipo === 'Crédito';
            const isDev = item.tipo === 'Devolución';

            return (
              <>
                {/* Header Movimiento */}
                <div className="px-3 py-2 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-center gap-2.5 border-b border-slate-700">
                  <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700 flex-shrink-0">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-white truncate uppercase">{item.nombre}</span>
                      <span className={`text-[8px] px-1 py-0.2 rounded font-sans font-bold ${
                        isCredit ? 'bg-orange-600 text-white' : isDev ? 'bg-purple-600 text-white' : 'bg-emerald-600 text-white'
                      }`}>
                        {item.tipo}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono font-bold block">{item.ref} • {item.fecha}</span>
                    <span className={`text-[9.5px] font-mono font-extrabold block mt-0.5 ${
                      isCredit ? 'text-orange-400' : isDev ? 'text-purple-400' : 'text-emerald-400'
                    }`}>
                      {isCredit ? '+' : '-'}${item.monto.toFixed(2)} USD
                    </span>
                  </div>
                </div>

                <div className="p-1 space-y-0.5">
                  {/* 1. Ver Ficha / Seleccionar Cliente */}
                  {client && (
                    <button
                      type="button"
                      onClick={() => {
                        setContextMenu(null);
                        setSelectedRowClient(client);
                        setActiveSubTab('catalogo');
                      }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-sky-50 hover:text-sky-900 rounded-lg flex items-center gap-2 font-bold transition-colors cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                      <span>Ver Ficha en Catálogo</span>
                    </button>
                  )}

                  {/* 2. Registrar Abono */}
                  {client && client.saldo_pendiente > 0.01 && hasPermission('editar') && (
                    <button
                      type="button"
                      onClick={() => {
                        setContextMenu(null);
                        setSelectedRowClient(client);
                        handleOpenAbono();
                      }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 hover:text-amber-900 rounded-lg flex items-center gap-2 font-bold transition-colors cursor-pointer"
                    >
                      <DollarSign className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                      <span>Registrar Nuevo Abono</span>
                    </button>
                  )}

                  {/* 3. Ver Historial Transaccional */}
                  {client && (
                    <button
                      type="button"
                      onClick={() => {
                        setContextMenu(null);
                        setSelectedRowClient(client);
                        setActiveSubTab('historial');
                      }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 hover:text-blue-900 rounded-lg flex items-center gap-2 font-bold transition-colors cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span>Ver Historial de Facturas</span>
                    </button>
                  )}

                  {/* 4. Enviar Estado de Cuenta por WhatsApp */}
                  {client && (
                    <button
                      type="button"
                      onClick={() => {
                        setContextMenu(null);
                        handleSendWhatsAppSingleClient(client);
                      }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-green-50 hover:text-green-900 rounded-lg flex items-center gap-2 font-bold transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                      <span>Enviar Estado de Cuenta (WhatsApp)</span>
                    </button>
                  )}

                  <div className="border-t border-slate-100 my-1"></div>

                  {/* 5. Descargar Reporte PDF */}
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      handleDownloadReport();
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 hover:text-slate-900 rounded-lg flex items-center gap-2 font-bold transition-colors text-slate-700 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                    <span>Descargar Reporte PDF</span>
                  </button>

                  {/* 6. Exportar Excel */}
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      handleExportExcel();
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-emerald-50 hover:text-emerald-900 rounded-lg flex items-center gap-2 font-bold transition-colors text-slate-700 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>Exportar Movimientos a Excel</span>
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}

    </div>
  );
}
