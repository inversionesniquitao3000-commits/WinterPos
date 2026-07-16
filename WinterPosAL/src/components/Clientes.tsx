import React, { useState, useEffect } from 'react';
import { Client, User } from '../types';
import { Users, Plus, DollarSign, Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

interface ClientesProps {
  clients: Client[];
  currentUser: User;
  onAddClient: (newClient: Client) => void;
  onRegisterAbono: (clientId: number, amountUSD: number) => void;
}

export default function Clientes({ clients, currentUser: _currentUser, onAddClient, onRegisterAbono }: ClientesProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Sorting state
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

  // Escape key listener to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setShowAbonoModal(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Add Client Form State
  const [newName, setNewName] = useState('');
  const [newDoc, setNewDoc] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCreditLimit, setNewCreditLimit] = useState('0');
  const [newDiscount, setNewDiscount] = useState('0');

  // Abono form state
  const [abonoVal, setAbonoVal] = useState('');

  const baseFiltered = clients.filter(c =>
    c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cedula_rif.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredClients = [...baseFiltered].sort((a, b) => {
    const va = a[sortField];
    const vb = b[sortField];
    if (typeof va === 'number' && typeof vb === 'number') {
      return sortDir === 'asc' ? va - vb : vb - va;
    }
    return sortDir === 'asc'
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  // Totals
  const totalClients = clients.length;
  const totalDeuda = clients.reduce((acc, c) => acc + (c.saldo_pendiente || 0), 0);

  // Helper to render sort icon in column headers
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="inline w-3 h-3 ml-0.5 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="inline w-3 h-3 ml-0.5 text-winter-clientesStart" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5 text-winter-clientesStart" />;
  };

  const handleOpenAbono = (client: Client) => {
    setSelectedClient(client);
    setAbonoVal('');
    setShowAbonoModal(true);
  };

  const handleSaveAbono = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;

    const val = parseFloat(abonoVal);
    if (isNaN(val) || val <= 0) {
      alert('Por favor ingrese un monto válido para el abono.');
      return;
    }

    if (val > selectedClient.saldo_pendiente) {
      alert(`El abono ($${val.toFixed(2)}) no puede ser mayor que el saldo pendiente ($${selectedClient.saldo_pendiente.toFixed(2)}).`);
      return;
    }

    onRegisterAbono(selectedClient.id, val);
    setShowAbonoModal(false);
    setSelectedClient(null);
    alert('Abono registrado con éxito. El crédito disponible del cliente ha sido restablecido.');
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDoc.trim()) {
      alert('Cédula/RIF y Nombre son requeridos.');
      return;
    }

    if (clients.some(c => c.cedula_rif === newDoc.trim())) {
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
      saldo_pendiente: 0.00
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
  };

  return (
    <div className="space-y-6 text-slate-800 font-mono text-xs">
      
      {/* HEADER SECTION */}
      <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-winter-clientesStart tracking-wider flex items-center gap-2">
            <Users className="w-5 h-5 text-winter-clientesStart" />
            MAESTRO DE CLIENTES Y CRÉDITOS
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Registro de cuentas, otorgamiento de límites crediticios y cobro de abonos en cuenta.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="bg-winter-clientesStart hover:bg-winter-clientesEnd text-white px-4 py-2 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 shadow-sm self-start"
        >
          <Plus className="w-4 h-4" />
          Registrar Cliente
        </button>
      </div>

      {/* FILTER SEARCH BAR + SUMMARY TOTALS */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative w-full sm:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Buscar por cédula, RIF o nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-350 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-winter-clientesStart font-sans"
          />
        </div>

        {/* Summary cards */}
        <div className="flex gap-3 ml-auto">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
            <Users className="w-4 h-4 text-winter-clientesStart" />
            <div>
              <p className="text-[9px] text-slate-400 font-sans uppercase tracking-wide">Clientes Registrados</p>
              <p className="text-sm font-extrabold text-slate-700 font-mono leading-tight">{totalClients}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-2 shadow-sm">
            <DollarSign className="w-4 h-4 text-red-500" />
            <div>
              <p className="text-[9px] text-slate-400 font-sans uppercase tracking-wide">Total Saldo Pendiente</p>
              <p className="text-sm font-extrabold text-red-600 font-mono leading-tight">${totalDeuda.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* TABLE LIST */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs text-left">
            <thead className="bg-slate-55 border-b border-slate-200">
              <tr className="text-slate-550">
                <th
                  className="px-2.5 py-2 font-sans uppercase cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('cedula_rif')}
                >
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span>Identificación (ID)</span>
                    <SortIcon field="cedula_rif" />
                  </div>
                </th>
                <th
                  className="px-2.5 py-2 font-sans uppercase cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('nombre')}
                >
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span>Nombre / Razón Social</span>
                    <SortIcon field="nombre" />
                  </div>
                </th>
                <th
                  className="px-2.5 py-2 font-sans uppercase cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('telefono')}
                >
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span>Teléfono</span>
                    <SortIcon field="telefono" />
                  </div>
                </th>
                <th className="px-2.5 py-2 font-sans uppercase">Dirección</th>
                <th
                  className="px-2.5 py-2 text-right font-sans uppercase cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('porcentaje_descuento')}
                >
                  <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    <span>Descuento (%)</span>
                    <SortIcon field="porcentaje_descuento" />
                  </div>
                </th>
                <th
                  className="px-2.5 py-2 text-right font-sans uppercase cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('limite_credito')}
                >
                  <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    <span>Límite Crédito</span>
                    <SortIcon field="limite_credito" />
                  </div>
                </th>
                <th
                  className="px-2.5 py-2 text-right font-sans uppercase cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('credito_disponible')}
                >
                  <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    <span>Crédito Disp.</span>
                    <SortIcon field="credito_disponible" />
                  </div>
                </th>
                <th
                  className="px-2.5 py-2 text-right font-sans uppercase cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('saldo_pendiente')}
                >
                  <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    <span>Deuda Pendiente</span>
                    <SortIcon field="saldo_pendiente" />
                  </div>
                </th>
                <th className="px-2.5 py-2 text-center font-sans uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredClients.map(c => {
                const hasDebt = c.saldo_pendiente > 0;
                return (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-2.5 py-2 font-mono font-bold text-slate-450">{c.cedula_rif}</td>
                    <td className="px-2.5 py-2 font-sans font-medium">{c.nombre}</td>
                    <td className="px-2.5 py-2 font-sans">{c.telefono || 'N/A'}</td>
                    <td className="px-2.5 py-2 font-sans truncate max-w-xs">{c.direccion || 'N/A'}</td>
                    <td className="px-2.5 py-2 text-right font-mono font-bold text-emerald-600">{c.porcentaje_descuento}%</td>
                    <td className="px-2.5 py-2 text-right font-mono">${c.limite_credito.toFixed(2)}</td>
                    <td className="px-2.5 py-2 text-right font-mono text-slate-600">${c.credito_disponible.toFixed(2)}</td>
                    <td className={`px-2.5 py-2 text-right font-mono font-bold ${hasDebt ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                      ${c.saldo_pendiente.toFixed(2)}
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleOpenAbono(c)}
                          disabled={!hasDebt}
                          className="bg-slate-50 border border-slate-200 text-slate-650 px-2.5 py-1.5 rounded hover:border-winter-clientesStart hover:text-winter-clientesStart font-sans transition-all flex items-center gap-1 shadow-sm disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-450"
                          title="Registrar abono a deuda pendiente"
                        >
                          <DollarSign className="w-3 h-3 text-emerald-600" />
                          Abono
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ADD CLIENT */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-winter-clientesStart" />
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
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-clientesStart focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1 font-sans">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej: 0414-1234567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-clientesStart focus:outline-none"
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
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-clientesStart focus:outline-none font-sans"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Dirección de Domicilio</label>
                <input
                  type="text"
                  placeholder="Ciudad, calle, local..."
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-clientesStart focus:outline-none font-sans"
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
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-clientesStart focus:outline-none font-mono text-center"
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
                    className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-clientesStart focus:outline-none font-mono text-center"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-600 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-winter-clientesStart hover:bg-winter-clientesEnd text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
                >
                  REGISTRAR CLIENTE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR ABONO */}
      {showAbonoModal && selectedClient && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                ABONAR A CUENTA CORRIENTE
              </h3>
              <button onClick={() => { setShowAbonoModal(false); setSelectedClient(null); }} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
              <div><span className="text-slate-550 font-sans">Cliente:</span> <span className="text-slate-800 font-bold select-text">{selectedClient.nombre}</span></div>
              <div><span className="text-slate-550 font-sans">ID/RIF:</span> <span className="text-slate-600 font-bold font-mono">{selectedClient.cedula_rif}</span></div>
              <div><span className="text-slate-550 font-sans">Deuda Total Pendiente:</span> <span className="text-red-500 font-black font-mono">${selectedClient.saldo_pendiente.toFixed(2)} USD</span></div>
              <div><span className="text-slate-550 font-sans">Límite Crédito Otorgado:</span> <span className="text-slate-600 font-mono">${selectedClient.limite_credito.toFixed(2)} USD</span></div>
            </div>

            <form onSubmit={handleSaveAbono} className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Monto del Abono ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder={`Ej: ${selectedClient.saldo_pendiente.toFixed(2)}`}
                  value={abonoVal}
                  onChange={(e) => setAbonoVal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-emerald-700 font-bold font-mono focus:bg-white focus:border-winter-clientesStart focus:outline-none"
                />
              </div>

              <div className="text-[10px] text-slate-500 font-sans">
                * Nota: El abono se registrará como un ingreso de caja en efectivo por defecto. El crédito disponible del cliente aumentará en proporción al abono.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAbonoModal(false); setSelectedClient(null); }}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-600 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-winter-clientesStart hover:bg-winter-clientesEnd text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
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
