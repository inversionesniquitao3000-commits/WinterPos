import React, { useState, useEffect, useMemo } from 'react';
import { Client, User, Sale, Abono } from '../types';
import { 
  Users, Plus, DollarSign, Search, ChevronUp, ChevronDown, 
  ChevronsUpDown, Edit, Download, FileText, TrendingUp, 
  Info, AlertCircle, RefreshCw, MinusCircle, Settings
} from 'lucide-react';

interface ClientesProps {
  clients: Client[];
  currentUser: User;
  onAddClient: (newClient: Client) => void;
  onRegisterAbono: (clientId: number, amountUSD: number) => void;
  onUpdateClient?: (updatedClient: Client) => Promise<boolean>;
  onDeleteClient?: (clientId: number) => Promise<boolean>;
  sales: Sale[];
  abonos: Abono[];
}

export default function Clientes({ 
  clients, 
  currentUser: _currentUser, 
  onAddClient, 
  onRegisterAbono, 
  onUpdateClient, 
  onDeleteClient,
  sales,
  abonos
}: ClientesProps) {
  // Navigation / Tabs
  const [activeSubTab, setActiveSubTab] = useState<'catalogo' | 'historial' | 'ranking' | 'creditos'>('catalogo');
  
  // Selection
  const [selectedRowClient, setSelectedRowClient] = useState<Client | null>(null);
  
  // Search / Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAbonoModal, setShowAbonoModal] = useState(false);

  // Form states
  const [newName, setNewName] = useState('');
  const [newDoc, setNewDoc] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCreditLimit, setNewCreditLimit] = useState('0');
  const [newDiscount, setNewDiscount] = useState('0');

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

  // Sorting state (Catálogo)
  type SortField = 'cedula_rif' | 'nombre' | 'telefono' | 'porcentaje_descuento' | 'limite_credito' | 'credito_disponible' | 'saldo_pendiente';
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

  // Escape key to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setShowAbonoModal(false);
        setShowEditModal(false);
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

  // Filters for Catálogo
  const baseFiltered = clients.filter(c =>
    c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cedula_rif.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredClients = useMemo(() => {
    return [...baseFiltered].sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [baseFiltered, sortField, sortDir]);

  // Summary Metrics
  const totalClients = clients.length;
  const totalDeuda = clients.reduce((acc, c) => acc + (c.saldo_pendiente || 0), 0);

  // Sorting Icon helper
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="inline w-3 h-3 ml-0.5 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="inline w-3 h-3 ml-0.5 text-blue-500" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5 text-blue-500" />;
  };

  // 1. Ranking Calculation
  const rankingData = useMemo(() => {
    const clientsMap: { [rif: string]: { nombre: string; cedula_rif: string; totalSpent: number; salesCount: number } } = {};
    
    // Initialize map with catalog clients
    clients.forEach(c => {
      clientsMap[c.cedula_rif] = {
        nombre: c.nombre,
        cedula_rif: c.cedula_rif,
        totalSpent: 0,
        salesCount: 0
      };
    });

    // Populate from sales
    sales.forEach(s => {
      const doc = s.client.cedula_rif;
      if (doc) {
        if (!clientsMap[doc]) {
          clientsMap[doc] = {
            nombre: s.client.nombre || 'Desconocido',
            cedula_rif: doc,
            totalSpent: 0,
            salesCount: 0
          };
        }
        clientsMap[doc].totalSpent += s.totalUSD;
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
    const list: { tipo: 'Crédito' | 'Abono'; fecha: string; ref: string; nombre: string; cedula_rif: string; monto: number }[] = [];
    
    // Extract credit payments from sales
    sales.forEach(s => {
      const creditPayment = s.pagos?.find(p => p.metodo === 'CreditoCliente');
      if (creditPayment && creditPayment.monto > 0) {
        list.push({
          tipo: 'Crédito',
          fecha: s.fecha,
          ref: s.factura_nro,
          nombre: s.client.nombre,
          cedula_rif: s.client.cedula_rif,
          monto: creditPayment.monto
        });
      }
    });

    // Extract Abonos history
    abonos.forEach(a => {
      list.push({
        tipo: 'Abono',
        fecha: a.fecha,
        ref: `ABO-${a.id.toString().substring(7)}`,
        nombre: a.nombre,
        cedula_rif: a.cedula_rif,
        monto: a.monto
      });
    });

    return list.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [sales, abonos]);

  // Filter credit & abonos by selected client
  const filteredCreditAbonoList = useMemo(() => {
    if (!selectedRowClient) return creditAbonoList;
    return creditAbonoList.filter(item => item.cedula_rif === selectedRowClient.cedula_rif);
  }, [creditAbonoList, selectedRowClient]);

  // 3. Client sales history list
  const clientSalesHistory = useMemo(() => {
    if (!selectedRowClient) return [];
    return sales.filter(s => s.client.cedula_rif === selectedRowClient.cedula_rif);
  }, [sales, selectedRowClient]);

  // Handlers
  const handleOpenAbono = () => {
    if (!selectedRowClient) return;
    setAbonoVal('');
    setShowAbonoModal(true);
  };

  const handleSaveAbono = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRowClient) return;

    const val = parseFloat(abonoVal);
    if (isNaN(val) || val <= 0) {
      alert('Por favor ingrese un monto válido para el abono.');
      return;
    }

    if (val > selectedRowClient.saldo_pendiente) {
      alert(`El abono ($${val.toFixed(2)}) no puede ser mayor que el saldo pendiente ($${selectedRowClient.saldo_pendiente.toFixed(2)}).`);
      return;
    }

    onRegisterAbono(selectedRowClient.id, val);
    setShowAbonoModal(false);
    alert('Abono registrado con éxito. El crédito disponible del cliente ha sido restablecido.');
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDoc.trim()) {
      alert('Cédula/RIF y Nombre son requeridos.');
      return;
    }

    if (clients.some(c => c.cedula_rif.toUpperCase() === newDoc.trim().toUpperCase())) {
      alert('Ya existe un cliente registrado con esa Cédula o RIF.');
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
      alert('Cédula/RIF y Nombre son requeridos.');
      return;
    }

    if (clients.some(c => c.cedula_rif.toUpperCase() === editDoc.trim().toUpperCase() && c.id !== selectedRowClient.id)) {
      alert('Ya existe otro cliente registrado con esa Cédula o RIF.');
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
      alert('No se puede eliminar un cliente con deuda pendiente.');
      return;
    }

    if (!window.confirm(`¿Está seguro de que desea eliminar permanentemente al cliente "${selectedRowClient.nombre}" (ID: ${selectedRowClient.cedula_rif})?`)) {
      return;
    }

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
        alert("Por favor seleccione un cliente en el Catálogo para generar su reporte.");
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
              <th class="text-right">Compras Totales</th>
              <th style="text-align: center;">Transacciones</th>
              <th class="text-right">Compra Promedio</th>
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
                <td class="text-right" style="font-weight: bold; color: #1e3a8a;">$${r.totalSpent.toFixed(2)}</td>
                <td style="text-align: center;">${r.salesCount}</td>
                <td class="text-right">$${r.avgSale.toFixed(2)}</td>
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
                <td><span class="badge ${item.tipo === 'Crédito' ? 'badge-credit' : 'badge-abono'}">${item.tipo}</span></td>
                <td>${item.fecha}</td>
                <td>${item.ref}</td>
                <td style="text-transform: uppercase;">${item.nombre}</td>
                <td>${item.cedula_rif}</td>
                <td class="text-right font-bold ${item.tipo === 'Crédito' ? 'text-credit' : 'text-abono'}">${item.tipo === 'Crédito' ? '+' : '-'}$${item.monto.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("No se pudo abrir la ventana de impresión. Por favor habilite los popups.");
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
              <h1>INVERSIONES NIQUITAO</h1>
              <p>RIF: J-41132631 | Teléfono: 0424-2042877 | Dirección: Caracas</p>
            </div>
            <div class="header-right">
              <p>Reporte Generado: ${dateStr}</p>
              <p>Operador: Anderson Laguna</p>
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

  return (
    <div className="space-y-4 text-slate-800 font-mono text-xs animate-fade-in">
      
      {/* SUBMODULE BANNER TABS (STYLISH DARK BLUE / SLATE DESIGN FOR VISIBILITY ON WHITE BACKGROUNDS) */}
      <div className="flex bg-slate-800 text-white rounded-t-lg overflow-hidden border border-slate-700 shadow-sm">
        <button 
          className={`px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 ${activeSubTab === 'catalogo' ? 'bg-slate-900 border-b-2 border-sky-400 text-white font-black' : 'text-slate-350 hover:bg-slate-700 hover:text-white'}`}
          onClick={() => setActiveSubTab('catalogo')}
        >
          <Users className="w-3.5 h-3.5" />
          Catálogo
        </button>
        <button 
          className={`px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 ${activeSubTab === 'historial' ? 'bg-slate-900 border-b-2 border-sky-400 text-white font-black' : 'text-slate-350 hover:bg-slate-700 hover:text-white'}`}
          onClick={() => setActiveSubTab('historial')}
        >
          <FileText className="w-3.5 h-3.5" />
          Historial Detalle
        </button>
        <button 
          className={`px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 ${activeSubTab === 'ranking' ? 'bg-slate-900 border-b-2 border-sky-400 text-white font-black' : 'text-slate-350 hover:bg-slate-700 hover:text-white'}`}
          onClick={() => setActiveSubTab('ranking')}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Movimientos por Ranking
        </button>
        <button 
          className={`px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 ${activeSubTab === 'creditos' ? 'bg-slate-900 border-b-2 border-sky-400 text-white font-black' : 'text-slate-350 hover:bg-slate-700 hover:text-white'}`}
          onClick={() => setActiveSubTab('creditos')}
        >
          <DollarSign className="w-3.5 h-3.5" />
          Créditos / Abonos
        </button>
        <div className="ml-auto flex items-center pr-4 text-[10px] uppercase font-sans tracking-widest text-slate-400 font-bold hidden sm:flex">
          Administra tus Clientes
        </div>
      </div>

      {/* FILTER SEARCH BAR + PDF EXPORT BAR */}
      <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-inner">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-slate-650 font-bold font-sans whitespace-nowrap">Buscar Cliente :</span>
          <div className="relative w-full md:w-80">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Escriba Cédula, RIF o Nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-slate-500 font-sans shadow-sm"
            />
          </div>
        </div>

        {/* Totals & PDF export button */}
        <div className="flex items-center gap-4 self-end md:self-auto">
          <div className="text-right text-[10px] font-sans text-slate-600">
            <div><span className="font-semibold text-slate-500">Total Saldo Pendiente :</span> <span className="font-mono text-xs font-extrabold text-red-655">${totalDeuda.toFixed(2)}</span></div>
            <div><span className="font-semibold text-slate-500">Total Clientes :</span> <span className="font-mono text-xs font-bold text-slate-700">{totalClients}</span></div>
          </div>

          <button
            onClick={handleDownloadReport}
            className="bg-slate-700 hover:bg-slate-800 text-white p-2 rounded shadow-sm transition-all flex items-center gap-1.5 font-sans font-bold text-xs"
            title="Generar y abrir reporte PDF de lo que ve en la tabla"
          >
            <Download className="w-4 h-4 text-sky-400" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* MAIN CONTAINER LAYOUT: CONTENT + SIDEBAR ACTION BUTTONS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* LEFT COLUMN: THE ACTIVE TAB VIEW CONTENT */}
        <div className="lg:col-span-10 space-y-4">
          
          {/* TAB 1: CATÁLOGO */}
          {activeSubTab === 'catalogo' && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px] text-left">
                  <thead className="bg-slate-600 text-white border-b border-slate-700">
                    <tr>
                      <th className="px-3 py-2 cursor-pointer select-none font-sans uppercase font-bold" onClick={() => handleSort('nombre')}>
                        <div className="flex items-center gap-1">
                          <span>Nombre / Razón Social</span>
                          <SortIcon field="nombre" />
                        </div>
                      </th>
                      <th className="px-3 py-2 cursor-pointer select-none font-sans uppercase font-bold" onClick={() => handleSort('cedula_rif')}>
                        <div className="flex items-center gap-1">
                          <span>RFC / Cédula</span>
                          <SortIcon field="cedula_rif" />
                        </div>
                      </th>
                      <th className="px-3 py-2 cursor-pointer select-none font-sans uppercase font-bold" onClick={() => handleSort('telefono')}>
                        <div className="flex items-center gap-1">
                          <span>Teléfono</span>
                          <SortIcon field="telefono" />
                        </div>
                      </th>
                      <th className="px-3 py-2 cursor-pointer select-none font-sans uppercase font-bold text-right" onClick={() => handleSort('limite_credito')}>
                        <div className="flex items-center justify-end gap-1">
                          <span>Límite Crédito</span>
                          <SortIcon field="limite_credito" />
                        </div>
                      </th>
                      <th className="px-3 py-2 cursor-pointer select-none font-sans uppercase font-bold text-right" onClick={() => handleSort('credito_disponible')}>
                        <div className="flex items-center justify-end gap-1">
                          <span>Crédito Disponible</span>
                          <SortIcon field="credito_disponible" />
                        </div>
                      </th>
                      <th className="px-3 py-2 cursor-pointer select-none font-sans uppercase font-bold text-right" onClick={() => handleSort('saldo_pendiente')}>
                        <div className="flex items-center justify-end gap-1">
                          <span>Saldo Pendiente</span>
                          <SortIcon field="saldo_pendiente" />
                        </div>
                      </th>
                      <th className="px-3 py-2 text-center font-sans uppercase font-bold w-40">Ver Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredClients.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-slate-400 font-sans italic">
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
                            className={`cursor-pointer transition-colors ${isSelected ? 'bg-sky-50 hover:bg-sky-100 border-l-4 border-sky-500 font-semibold text-sky-950 shadow-inner' : 'hover:bg-slate-50'}`}
                          >
                            <td className="px-3 py-2.5 font-sans font-medium uppercase">{c.nombre}</td>
                            <td className="px-3 py-2.5 font-mono font-bold text-slate-500">{c.cedula_rif}</td>
                            <td className="px-3 py-2.5 font-sans">{c.telefono || 'N/A'}</td>
                            <td className="px-3 py-2.5 text-right font-mono">${c.limite_credito.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-600">${c.credito_disponible.toFixed(2)}</td>
                            <td className={`px-3 py-2.5 text-right font-mono font-extrabold ${c.saldo_pendiente > 0.01 ? 'text-red-550' : 'text-slate-400'}`}>
                              ${c.saldo_pendiente.toFixed(2)}
                            </td>
                            {/* NEW NAVIGATION BUTTONS IN ROW TO DIRECTLY GO TO SUBMODULES */}
                            <td className="px-3 py-2">
                              <div className="flex justify-center gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRowClient(c);
                                    setActiveSubTab('historial');
                                  }}
                                  className="bg-slate-50 hover:bg-sky-100 hover:text-sky-700 text-slate-650 px-2 py-0.5 rounded border border-slate-300 hover:border-sky-300 font-sans font-bold transition-all flex items-center gap-0.5 text-[9px] shadow-sm active:scale-95"
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
                                  className="bg-slate-50 hover:bg-emerald-100 hover:text-emerald-700 text-slate-650 px-2 py-0.5 rounded border border-slate-300 hover:border-emerald-300 font-sans font-bold transition-all flex items-center gap-0.5 text-[9px] shadow-sm active:scale-95"
                                  title="Ir a Créditos y Abonos de este cliente"
                                >
                                  <DollarSign className="w-3 h-3 text-emerald-600" />
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
                      <div><span className="text-slate-350">Límite Crédito:</span> <span className="font-mono font-bold text-sky-300">${selectedRowClient.limite_credito.toFixed(2)} USD</span></div>
                      <div><span className="text-slate-350">Crédito Disponible:</span> <span className="font-mono font-bold text-emerald-350">${selectedRowClient.credito_disponible.toFixed(2)} USD</span></div>
                      <div><span className="text-slate-350">Deuda Pendiente:</span> <span className="font-mono font-bold text-red-300">${selectedRowClient.saldo_pendiente.toFixed(2)} USD</span></div>
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
                                    <td className="px-3 py-2.5 text-right font-mono">${s.subtotal.toFixed(2)}</td>
                                    <td className="px-3 py-2.5 text-right font-mono text-red-550">-${s.descuento.toFixed(2)}</td>
                                    <td className="px-3 py-2.5 text-right font-mono font-bold">${s.totalUSD.toFixed(2)}</td>
                                    <td className="px-3 py-2.5 text-right font-mono">${s.totalVES.toFixed(2)}</td>
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
                                                  <td className="py-1.5 text-right font-mono">${item.priceUSD.toFixed(2)}</td>
                                                  <td className="py-1.5 text-right font-mono font-bold">${item.totalUSD.toFixed(2)}</td>
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
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm animate-fade-in">
              <div className="p-3 bg-slate-600 text-white font-sans uppercase font-bold text-xs tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-sky-400" />
                Ranking de Clientes por Volumen de Compras ($ USD)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px] text-left">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2 text-center font-sans uppercase w-16">Posición</th>
                      <th className="px-4 py-2 font-sans uppercase">Nombre / Razón Social</th>
                      <th className="px-4 py-2 font-sans uppercase">Identificación (ID)</th>
                      <th className="px-4 py-2 text-right font-sans uppercase">Compras Totales</th>
                      <th className="px-4 py-2 text-center font-sans uppercase">Transacciones</th>
                      <th className="px-4 py-2 text-right font-sans uppercase">Compra Promedio</th>
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

                        return (
                          <tr key={r.cedula_rif} className={trClass}>
                            <td className="px-4 py-2.5 text-center font-bold text-slate-600">{posBadge}</td>
                            <td className="px-4 py-2.5 font-sans font-medium uppercase">{r.nombre}</td>
                            <td className="px-4 py-2.5 font-mono">{r.cedula_rif}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-extrabold text-blue-600">${r.totalSpent.toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-center font-mono">{r.salesCount}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-600">${r.avgSale.toFixed(2)}</td>
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
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm animate-fade-in">
              <div className="p-3 bg-slate-600 text-white font-sans uppercase font-bold text-xs tracking-wider flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-sky-400" />
                  Movimientos de Cuentas: Créditos Otorgados y Abonos Recibidos
                </span>
                <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded font-mono text-slate-200 lowercase">
                  {selectedRowClient ? `filtrado por: ${selectedRowClient.nombre.substring(0, 15)}...` : 'vista general (todos)'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px] text-left">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2 font-sans uppercase w-28">Tipo Movimiento</th>
                      <th className="px-4 py-2 font-sans uppercase">Fecha / Hora</th>
                      <th className="px-4 py-2 font-sans uppercase">Referencia / Factura</th>
                      <th className="px-4 py-2 font-sans uppercase">Cliente</th>
                      <th className="px-4 py-2 font-sans uppercase">Identificación (ID)</th>
                      <th className="px-4 py-2 text-right font-sans uppercase">Monto ($ USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredCreditAbonoList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-sans italic">
                          No se registran movimientos de créditos o abonos {selectedRowClient ? 'para este cliente.' : 'en el sistema.'}
                        </td>
                      </tr>
                    ) : (
                      filteredCreditAbonoList.map((item, idx) => {
                        const isCredit = item.tipo === 'Crédito';
                        return (
                          <tr key={idx} className="hover:bg-slate-55 transition-colors">
                            <td className="px-4 py-2.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-sans font-bold flex items-center w-fit gap-1 ${isCredit ? 'bg-orange-100 text-orange-850' : 'bg-emerald-100 text-emerald-850'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isCredit ? 'bg-orange-500' : 'bg-emerald-500'}`} />
                                {item.tipo}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono">{item.fecha}</td>
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-605">{item.ref}</td>
                            <td className="px-4 py-2.5 font-sans font-medium uppercase">{item.nombre}</td>
                            <td className="px-4 py-2.5 font-mono">{item.cedula_rif}</td>
                            <td className={`px-4 py-2.5 text-right font-mono font-extrabold ${isCredit ? 'text-orange-600' : 'text-emerald-600'}`}>
                              {isCredit ? '+' : '-'}${item.monto.toFixed(2)}
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
        <div className="lg:col-span-2 space-y-3">
          
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
                  <span className="text-red-700 font-black mt-1 font-mono">Deuda: ${selectedRowClient.saldo_pendiente.toFixed(2)}</span>
                )}
              </div>
            )}

            {/* Vertically stacked buttons */}
            <div className="flex flex-col gap-2.5">
              
              {/* BUTTON 1: AGREGAR */}
              <button
                onClick={() => setShowAddModal(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all active:scale-95"
              >
                <Plus className="w-4 h-4 bg-emerald-700/50 rounded-full p-0.5" />
                <span>Agregar</span>
              </button>

              {/* BUTTON 2: MODIFICAR */}
              <button
                onClick={handleOpenEdit}
                disabled={!selectedRowClient}
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-cyan-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                title={!selectedRowClient ? "Seleccione un cliente en el Catálogo para modificar" : "Modificar cliente seleccionado"}
              >
                <RefreshCw className="w-4 h-4 bg-cyan-750/50 disabled:bg-transparent rounded-full p-0.5" />
                <span>Modificar</span>
              </button>

              {/* BUTTON 3: ELIMINAR */}
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

              {/* BUTTON 4: ABONO */}
              <button
                onClick={handleOpenAbono}
                disabled={!selectedRowClient || selectedRowClient.saldo_pendiente <= 0.01}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-350 text-white border border-amber-700 py-2 px-3 rounded shadow-sm flex items-center gap-2 font-sans font-bold text-[11px] uppercase tracking-wider text-left transition-all enabled:active:scale-95 disabled:cursor-not-allowed"
                title={
                  !selectedRowClient 
                    ? "Seleccione un cliente en el Catálogo para registrar abono" 
                    : selectedRowClient.saldo_pendiente <= 0.01 
                      ? "El cliente seleccionado no presenta deuda pendiente" 
                      : "Registrar abono de crédito"
                }
              >
                <DollarSign className="w-4 h-4 bg-amber-750/50 disabled:bg-transparent rounded-full p-0.5" />
                <span>Abono</span>
              </button>

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
                    onChange={(e) => setNewDoc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none"
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
                    value={newDiscount}
                    onChange={(e) => setNewDiscount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-slate-500 focus:outline-none font-mono text-center"
                  />
                </div>
              </div>

              {/* Precio Costo Toggle */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPrecioCosto}
                    onChange={(e) => setNewPrecioCosto(e.target.checked)}
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
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-500 focus:outline-none font-mono text-center"
                  />
                </div>
              </div>

              {selectedRowClient.saldo_pendiente > 0 && (
                <div className="bg-red-50 text-[10px] text-red-700 p-2.5 rounded border border-red-200 font-sans">
                  <strong>Nota Importante:</strong> Este cliente posee una deuda de <strong>${selectedRowClient.saldo_pendiente.toFixed(2)} USD</strong>. Si modificas su límite de crédito, el crédito disponible se reajustará automáticamente manteniendo el saldo pendiente actual.
                </div>
              )}

              {/* Precio Costo Toggle */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPrecioCosto}
                    onChange={(e) => setEditPrecioCosto(e.target.checked)}
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
              <div><span className="text-slate-550 font-sans">Deuda Total Pendiente:</span> <span className="text-red-500 font-black font-mono">${selectedRowClient.saldo_pendiente.toFixed(2)} USD</span></div>
              <div><span className="text-slate-550 font-sans">Límite Crédito Otorgado:</span> <span className="text-slate-600 font-mono">${selectedRowClient.limite_credito.toFixed(2)} USD</span></div>
            </div>

            <form onSubmit={handleSaveAbono} className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Monto del Abono ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder={`Ej: ${selectedRowClient.saldo_pendiente.toFixed(2)}`}
                  value={abonoVal}
                  onChange={(e) => setAbonoVal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-emerald-700 font-bold font-mono focus:bg-white focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="text-[10px] text-slate-500 font-sans">
                * Nota: El abono se registrará como un ingreso de caja en efectivo por defecto. El crédito disponible del cliente aumentará en proporción al abono.
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

    </div>
  );
}
