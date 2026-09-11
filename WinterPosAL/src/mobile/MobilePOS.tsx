import { useState, useMemo, useCallback } from 'react';
import { 
  Search, ShoppingCart, Plus, Minus, Trash2, Camera, User, 
  X, Check, AlertCircle, Sparkles, Store, Lock, DollarSign,
  Package, ChevronRight, UserPlus, ArrowRight, Layers,
  PauseCircle, Play, RotateCcw, CreditCard
} from 'lucide-react';
import { Product, Client, User as UserType, CompanyConfig, SaleItem, Payment, Sale } from '../types';
import MobileScannerModal from './MobileScannerModal';
import MobileCheckoutModal from './MobileCheckoutModal';
import MobileTicketModal from './MobileTicketModal';
import MobileMovimientoCajaModal from './MobileMovimientoCajaModal';
import MobileCierreCajaModal from './MobileCierreCajaModal';
import MobileAbonoModal from './MobileAbonoModal';
import MobileDevolucionModal from './MobileDevolucionModal';
import { getApiBaseUrl } from '../utils';

interface MobilePOSProps {
  products: Product[];
  clients: Client[];
  companyConfig: CompanyConfig;
  tasaDia: number;
  tasaVuelto: number;
  currentUser: UserType | null;
  cajaAbierta: boolean;
  montoAperturaUsd: number;
  montoAperturaVes: number;
  onAbrirCaja?: (usd: number, ves: number) => void;
  onRegisterSale: (sale: {
    factura_nro: string;
    client: Client;
    items: SaleItem[];
    subtotal: number;
    descuento: number;
    totalUSD: number;
    totalVES: number;
    pagos: Payment[];
    vueltoUSD: number;
    vueltoVES: number;
  }) => Promise<Sale | undefined> | void;
  onAddClient?: (cli: Client) => Promise<void> | void;
}

export default function MobilePOS({
  products = [],
  clients = [],
  companyConfig,
  tasaDia = 1,
  tasaVuelto = 1,
  currentUser,
  cajaAbierta = true,
  montoAperturaUsd = 0,
  montoAperturaVes = 0,
  onAbrirCaja,
  onRegisterSale,
  onAddClient
}: MobilePOSProps) {
  const activeTasa = tasaDia > 0 ? tasaDia : 1;

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');

  // Scanner Modal State
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Cart State
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([]);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);

  // Selected Client
  const defaultClient: Client = useMemo(() => {
    const found = clients.find(c => c.cedula_rif === 'V-00000000' || c.nombre.toLowerCase().includes('consumidor'));
    return found || {
      id: 0,
      cedula_rif: 'V-00000000',
      nombre: 'Consumidor Final',
      telefono: '',
      direccion: 'Ciudad'
    };
  }, [clients]);

  const [selectedClient, setSelectedClient] = useState<Client>(defaultClient);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [isNewClientForm, setIsNewClientForm] = useState(false);
  const [newClientDoc, setNewClientDoc] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  // Apertura de caja inputs
  const [aperturaBaseUSD, setAperturaBaseUSD] = useState('0');
  const [aperturaBaseVES, setAperturaBaseVES] = useState('0');

  // Checkout & Ticket Modals
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [confirmedSale, setConfirmedSale] = useState<Sale | null>(null);
  const [isTicketOpen, setIsTicketOpen] = useState(false);

  // Paused Sales (Ventas en Espera) State
  interface PausedSale {
    id: string;
    client: Client;
    cart: { product: Product; qty: number }[];
    totalUSD: number;
    timestamp: string;
  }

  const [pausedSales, setPausedSales] = useState<PausedSale[]>(() => {
    try {
      const raw = localStorage.getItem('mobile_pos_paused_sales');
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  });

  const [isPausedModalOpen, setIsPausedModalOpen] = useState(false);

  const savePausedSalesToStorage = (sales: PausedSale[]) => {
    setPausedSales(sales);
    try {
      localStorage.setItem('mobile_pos_paused_sales', JSON.stringify(sales));
    } catch (_) {}
  };

  // Caja Quick Actions (Movimientos, Abonos, Devoluciones y Cierre directo desde POS)
  const [isCajaQuickMenuOpen, setIsCajaQuickMenuOpen] = useState(false);
  const [isMovModalOpen, setIsMovModalOpen] = useState(false);
  const [isAbonoModalOpen, setIsAbonoModalOpen] = useState(false);
  const [isDevolucionModalOpen, setIsDevolucionModalOpen] = useState(false);
  const [isCierreModalOpen, setIsCierreModalOpen] = useState(false);
  const [liveCajaData, setLiveCajaData] = useState<any>(null);

  const fetchCajaData = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/manager/cajas-live`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          const match = list.find((c: any) => c.terminal === 'CAJA_01') || list[0];
          setLiveCajaData(match);
          return;
        }
      }
    } catch (_) {}
    setLiveCajaData({
      terminal: 'CAJA_01',
      cajero: currentUser?.nombre || 'Anderson Laguna',
      fechaApertura: new Date().toISOString(),
      aperturaUsd: montoAperturaUsd || 0,
      aperturaVes: montoAperturaVes || 0,
      salesUsd: 0,
      salesVes: 0,
      cashExpectedUsd: montoAperturaUsd || 0,
      cashExpectedVes: montoAperturaVes || 0,
      totalTickets: 0
    });
  };

  const handlePauseCurrentSale = () => {
    if (cart.length === 0) return;
    const newPaused: PausedSale = {
      id: `P-${Date.now().toString().slice(-4)}`,
      client: selectedClient,
      cart: [...cart],
      totalUSD: cartTotalUSD,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    savePausedSalesToStorage([newPaused, ...pausedSales]);
    clearCart();
    setSelectedClient(defaultClient);
    setIsCartDrawerOpen(false);
    showToast(`Venta pausada #${newPaused.id}`);
  };

  const handleResumeSale = (pSale: PausedSale) => {
    if (cart.length > 0) {
      if (!confirm('Actualmente tienes productos en el carrito. ¿Deseas reemplazar el carrito con la venta en espera?')) {
        return;
      }
    }
    setCart(pSale.cart);
    setSelectedClient(pSale.client);
    savePausedSalesToStorage(pausedSales.filter(p => p.id !== pSale.id));
    setIsPausedModalOpen(false);
    showToast(`Venta #${pSale.id} reanudada`);
  };

  const handleDeletePausedSale = (id: string) => {
    savePausedSalesToStorage(pausedSales.filter(p => p.id !== id));
  };

  // Notification toast on scan
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 2400);
  };

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      const cat = p.categoria || p.category;
      if (cat && cat.trim().length > 0) {
        set.add(cat.trim());
      }
    });
    return ['TODAS', ...Array.from(set).sort()];
  }, [products]);

  // Filtered products:
  // On-demand search only: Do NOT load entire 3000+ catalog on mobile to save memory & battery.
  const isSearchActive = searchTerm.trim().length > 0 || selectedCategory !== 'TODAS';

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term && selectedCategory === 'TODAS') {
      return []; // Return empty so we don't bloat mobile DOM with thousands of cards
    }

    const matches: Product[] = [];
    for (const p of products) {
      if (selectedCategory !== 'TODAS') {
        const cat = (p.categoria || p.category || '').trim();
        if (cat !== selectedCategory) continue;
      }

      if (term.length > 0) {
        const name = (p.descripcion || p.description || '').toLowerCase();
        const code = (p.codigo_barras_clave || p.barcode || '').toLowerCase();
        const pId = String(p.id || '');

        if (!name.includes(term) && !code.includes(term) && pId !== term) {
          continue;
        }
      }

      matches.push(p);
      // Cap at 30 items for ultra-smooth 60fps mobile scrolling
      if (matches.length >= 30) break;
    }

    return matches;
  }, [products, selectedCategory, searchTerm]);

  // Cart actions
  const addToCart = useCallback((product: Product) => {
    const stock = parseFloat(String(product.stock_actual ?? (product as any).stock ?? 0));
    if (stock <= 0) {
      showToast(`⚠️ "${product.descripcion || product.description || 'Producto'}" está agotado`);
      return;
    }

    setCart(prev => {
      const idx = prev.findIndex(item => item.product.id === product.id);
      if (idx >= 0) {
        const currentQty = prev[idx].qty;
        if (currentQty >= stock) {
          showToast(`⚠️ No hay más stock disponible (${stock} unid.)`);
          return prev;
        }
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + 1 };
        return updated;
      } else {
        return [...prev, { product, qty: 1 }];
      }
    });
    showToast(`+1 ${product.descripcion || product.description || 'Producto'}`);
  }, []);

  const updateQty = useCallback((productId: number, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.product.id === productId) {
            const stock = parseFloat(String(item.product.stock_actual ?? (item.product as any).stock ?? 0));
            const newQty = item.qty + delta;
            if (delta > 0 && stock > 0 && newQty > stock) {
              showToast(`⚠️ Máximo stock alcanzado (${stock} unid.)`);
              return item;
            }
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as { product: Product; qty: number }[];
    });
  }, []);

  const removeFromCart = useCallback((productId: number) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setIsCartDrawerOpen(false);
  }, []);

  // Barcode / QR Scan Handler
  const handleScanCode = (code: string) => {
    const trimmed = code.trim().toLowerCase();
    const found = products.find(p => {
      const pCode = (p.codigo_barras_clave || p.barcode || '').toLowerCase();
      return pCode === trimmed || String(p.id) === trimmed;
    });

    if (found) {
      addToCart(found);
    } else {
      setSearchTerm(code);
      showToast(`Filtrando por: ${code}`);
    }
  };

  // Cart Calculations
  const cartTotalUSD = useMemo(() => {
    return cart.reduce((sum, item) => {
      const price = parseFloat(String(item.product.precio_detalle_usd || item.product.priceUSD || 0)) || 0;
      return sum + price * item.qty;
    }, 0);
  }, [cart]);

  const cartTotalVES = cartTotalUSD * activeTasa;
  const cartItemCount = cart.reduce((sum, item) => sum + item.qty, 0);

  // Apertura de caja submit
  const handleConfirmApertura = () => {
    if (onAbrirCaja) {
      const usd = parseFloat(aperturaBaseUSD) || 0;
      const ves = parseFloat(aperturaBaseVES) || 0;
      onAbrirCaja(usd, ves);
    }
  };

  // Confirm and register sale
  const handleConfirmSale = async (pagos: Payment[], vueltoUSD: number, vueltoVES: number) => {
    setIsProcessingSale(true);
    try {
      const saleItems: SaleItem[] = cart.map(item => {
        const price = parseFloat(String(item.product.precio_detalle_usd || item.product.priceUSD || 0)) || 0;
        return {
          productId: item.product.id,
          product_id: item.product.id,
          qty: item.qty,
          cantidad: item.qty,
          priceUSD: price,
          precio_unitario_usd: price,
          tipo_precio: 'Detalle',
          totalUSD: price * item.qty,
          total_fila_usd: price * item.qty,
          product: {
            id: item.product.id,
            barcode: item.product.codigo_barras_clave || item.product.barcode || '',
            description: item.product.descripcion || item.product.description || '',
            priceUSD: price,
            precio_costo_usd: item.product.precio_costo_usd || 0,
            costo_usd: item.product.precio_costo_usd || 0,
            categoria: item.product.categoria || item.product.category || 'General',
            imagen_url: item.product.imagen_url || ''
          }
        };
      });

      const tempInvoice = `FACT-${Date.now().toString().slice(-6)}`;

      const salePayload = {
        factura_nro: tempInvoice,
        client: selectedClient,
        items: saleItems,
        subtotal: cartTotalUSD,
        descuento: 0,
        totalUSD: cartTotalUSD,
        totalVES: cartTotalVES,
        pagos,
        vueltoUSD,
        vueltoVES
      };

      const result = await onRegisterSale(salePayload);

      // Successfully registered
      const savedSale: Sale = result || {
        ...salePayload,
        id: Date.now(),
        fecha: new Date().toLocaleString(),
        tipo_documento: 'FACTURA_FISCAL',
        caja_id: 1,
        terminal: 'MOVIL'
      };

      setConfirmedSale(savedSale);
      setIsCheckoutOpen(false);
      clearCart();
      setIsTicketOpen(true);
    } catch (err: any) {
      console.error('Error al procesar venta móvil:', err);
      alert(`Error al registrar la venta: ${err.message || 'Intente nuevamente'}`);
    } finally {
      setIsProcessingSale(false);
    }
  };

  // Save new client
  const handleSaveNewClient = async () => {
    if (!newClientDoc.trim() || !newClientName.trim()) {
      alert('Por favor ingrese Cédula/RIF y Nombre.');
      return;
    }

    const newCli: Client = {
      id: Date.now(),
      cedula_rif: newClientDoc.trim().toUpperCase(),
      nombre: newClientName.trim(),
      telefono: newClientPhone.trim(),
      direccion: 'Ciudad'
    };

    if (onAddClient) {
      await onAddClient(newCli);
    }

    setSelectedClient(newCli);
    setIsNewClientForm(false);
    setIsClientModalOpen(false);
    showToast(`Cliente asignado: ${newCli.nombre}`);
  };

  // Filtered clients in selector modal
  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase().trim();
    if (!q) return clients.slice(0, 25);
    return clients.filter(c => 
      c.nombre.toLowerCase().includes(q) || 
      c.cedula_rif.toLowerCase().includes(q) ||
      (c.telefono && c.telefono.includes(q))
    ).slice(0, 25);
  }, [clients, clientSearch]);

  // IF CAJA IS CLOSED: Prompt Apertura
  if (!cajaAbierta) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[70vh] text-center max-w-sm mx-auto animate-in fade-in duration-200">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-xl">
          <Lock className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-black text-white mb-1">Caja Cerrada</h2>
        <p className="text-xs text-slate-400 mb-6">
          Para realizar ventas desde el móvil debes iniciar el turno indicando el fondo base de apertura.
        </p>

        <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 text-left shadow-xl mb-6">
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
              Fondo Base en Dólares ($ USD)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-emerald-400 font-mono">$</span>
              <input
                type="number"
                step="any"
                value={aperturaBaseUSD}
                onChange={(e) => setAperturaBaseUSD(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl pl-8 pr-3 py-2.5 text-lg font-black text-white font-mono outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
              Fondo Base en Bolívares (Bs)
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={aperturaBaseVES}
                onChange={(e) => setAperturaBaseVES(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-lg font-black text-white font-mono outline-none"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Bs</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleConfirmApertura}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
        >
          <Store className="w-4 h-4" />
          <span>ABRIR TURNO Y COMENZAR A VENDER</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-28">
      {/* Toast Banner */}
      {toastMsg && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-slate-950 font-black text-xs px-4 py-2 rounded-full shadow-2xl flex items-center gap-1.5 animate-in slide-in-from-top-3 duration-150">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* POS Top Control Panel (Search, Scanner, Client, Categories) */}
      <div className="bg-slate-900/95 border-b border-slate-800 p-3 space-y-2.5 shadow-md">
        
        {/* Row 1: Prominent Search Input & Camera Scanner Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-blue-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, código de barra o ID..."
              className="w-full bg-slate-950 border-2 border-slate-700/80 focus:border-blue-500 rounded-2xl pl-10 pr-9 py-2.5 text-xs font-medium text-white placeholder:text-slate-400 outline-none transition shadow-inner"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-full"
                title="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Camera Scanner Button */}
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="h-10 px-3 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-500 text-white flex items-center gap-1.5 shadow-lg shadow-blue-900/40 transition active:scale-90 shrink-0 font-bold text-xs"
            title="Escanear código QR o de barras con la cámara"
          >
            <Camera className="w-4 h-4" />
            <span className="hidden xs:inline text-[11px]">Escanear</span>
          </button>
        </div>

        {/* Row 2: Client Selector & Tasa BCV */}
        <div className="flex items-center justify-between gap-2">
          {/* Client selector pill */}
          <button
            type="button"
            onClick={() => setIsClientModalOpen(true)}
            className="flex items-center gap-2 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 px-3 py-1.5 rounded-xl transition text-left flex-1 min-w-0 active:scale-95 shadow-sm"
          >
            <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Cliente</p>
              <p className="text-xs font-bold text-white truncate leading-tight mt-0.5">
                {selectedClient.nombre}
              </p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 ml-auto shrink-0" />
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Caja Actions Button */}
            <button
              type="button"
              onClick={() => {
                fetchCajaData();
                setIsCajaQuickMenuOpen(true);
              }}
              className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-amber-300 flex items-center gap-1 text-[11px] font-bold shrink-0 transition active:scale-95 shadow-sm"
              title="Cierre de Turno y Movimientos de Caja"
            >
              <Store className="w-3.5 h-3.5 text-amber-400" />
              <span>Caja</span>
            </button>

            {/* Paused Sales Button */}
            {pausedSales.length > 0 && (
              <button
                type="button"
                onClick={() => setIsPausedModalOpen(true)}
                className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 rounded-xl text-amber-300 flex items-center gap-1 text-[11px] font-black shrink-0 transition active:scale-95 animate-pulse"
                title="Ventas en Espera"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                <span>Espera ({pausedSales.length})</span>
              </button>
            )}

            {/* Tasa del día badge */}
            <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-right shadow-sm">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Tasa BCV</p>
              <p className="text-xs font-black text-emerald-400 font-mono leading-tight mt-0.5">
                {activeTasa.toFixed(2)} Bs
              </p>
            </div>
          </div>
        </div>

        {/* Row 3: Categories Carousel */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5 pb-1 no-scrollbar text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition active:scale-95 ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800/80'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main POS Content Area */}
      <div className="px-3 flex-1">
        {!isSearchActive ? (
          /* IDLE STATE: No query or category selected. Saves memory, battery & CPU. */
          <div className="py-6 space-y-4">
            
            {/* Quick Camera Scanner Big Card */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="w-full p-5 rounded-3xl bg-gradient-to-br from-blue-900/40 via-indigo-950/40 to-slate-900 border-2 border-blue-500/40 hover:border-blue-400 text-left transition active:scale-[0.98] shadow-xl flex items-center justify-between group"
            >
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-wider">
                  <Camera className="w-3 h-3" />
                  <span>Escaneo Rápido</span>
                </div>
                <h3 className="text-base font-black text-white group-hover:text-blue-300 transition">
                  Escanear con la Cámara
                </h3>
                <p className="text-xs text-slate-400 max-w-[220px]">
                  Apunta al código QR o código de barras para agregarlo al carrito.
                </p>
              </div>

              <div className="w-13 h-13 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-900/50 group-hover:scale-105 transition shrink-0 p-3">
                <Camera className="w-7 h-7" />
              </div>
            </button>

            {/* Current Cart Preview if items exist */}
            {cart.length > 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-blue-400" />
                    Ítems en la Venta Actual ({cartItemCount})
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePauseCurrentSale}
                      className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-950/40 border border-amber-800/50 px-2 py-0.5 rounded-lg transition active:scale-95"
                      title="Pausar venta para atender a otro cliente"
                    >
                      <PauseCircle className="w-3 h-3" />
                      <span>Pausar</span>
                    </button>
                    <button
                      type="button"
                      onClick={clearCart}
                      className="text-[10px] font-bold text-rose-400 hover:text-rose-300"
                    >
                      Vaciar
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {cart.map((item) => {
                    const price = parseFloat(String(item.product.precio_detalle_usd || item.product.priceUSD || 0)) || 0;
                    const lineTot = price * item.qty;
                    return (
                      <div
                        key={item.product.id}
                        className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {item.product.descripcion || item.product.description}
                          </p>
                          <p className="text-[10px] text-emerald-400 font-mono font-bold">
                            ${lineTot.toFixed(2)} (${price.toFixed(2)} c/u)
                          </p>
                        </div>

                        <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => updateQty(item.product.id, -1)}
                            className="w-6 h-6 rounded text-slate-300 hover:text-white flex items-center justify-center text-xs"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center font-mono font-bold text-xs text-white">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.product.id, 1)}
                            className="w-6 h-6 rounded text-slate-300 hover:text-white flex items-center justify-center text-xs"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Search Helper Info */
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-center space-y-2">
                <Search className="w-6 h-6 text-slate-500 mx-auto" />
                <h4 className="text-xs font-bold text-slate-300">
                  Búsqueda Instantánea de Productos
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                  Escribe arriba el nombre, marca o código del producto. Los resultados aparecerán al instante mientras escribes sin sobrecargar tu teléfono.
                </p>
              </div>
            )}

          </div>
        ) : (
          /* SEARCH RESULTS STATE */
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-bold text-slate-400">
                {filteredProducts.length === 0 
                  ? 'Sin resultados' 
                  : `Resultados encontrados (${filteredProducts.length}${filteredProducts.length >= 30 ? '+' : ''}):`}
              </span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="text-[10px] text-blue-400 font-bold hover:underline"
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>

            {filteredProducts.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-bold">No se encontró "{searchTerm}"</p>
                <p className="text-[11px] text-slate-400 mt-1">Verifica la ortografía o intenta buscar por código de barra</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {filteredProducts.map((p) => {
                  const priceUSD = parseFloat(String(p.precio_detalle_usd || p.priceUSD || 0)) || 0;
                  const priceVES = priceUSD * activeTasa;
                  const stock = parseFloat(String(p.stock_actual ?? (p as any).stock ?? 0));
                  const inCartItem = cart.find(c => c.product.id === p.id);
                  const isOutOfStock = stock <= 0;

                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        if (isOutOfStock) {
                          showToast(`⚠️ "${p.descripcion || p.description}" está agotado`);
                        } else {
                          addToCart(p);
                        }
                      }}
                      className={`bg-slate-900 border rounded-2xl p-2.5 flex flex-col justify-between transition relative overflow-hidden shadow-md ${
                        isOutOfStock
                          ? 'opacity-65 border-rose-950/40 bg-slate-900/60 cursor-not-allowed select-none'
                          : inCartItem
                          ? 'border-blue-500/80 ring-1 ring-blue-500/50 bg-blue-950/20 active:scale-[0.97] cursor-pointer'
                          : 'border-slate-800/80 hover:border-slate-700 active:scale-[0.97] cursor-pointer'
                      }`}
                    >
                      {/* Cart Quantity Badge */}
                      {inCartItem && (
                        <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-lg">
                          {inCartItem.qty}
                        </div>
                      )}

                      {/* Product Image or Icon */}
                      <div className="w-full h-24 rounded-xl bg-slate-950 flex items-center justify-center overflow-hidden mb-2 relative">
                        {p.imagen_url ? (
                          <img
                            src={p.imagen_url}
                            alt={p.descripcion || p.description}
                            className={`w-full h-full object-cover ${isOutOfStock ? 'grayscale opacity-75' : ''}`}
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Package className="w-8 h-8 text-slate-700" />
                        )}

                        {/* Stock badge */}
                        <div className={`absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider backdrop-blur-sm ${
                          isOutOfStock
                            ? 'bg-rose-600/90 text-white shadow-sm ring-1 ring-rose-400/40'
                            : stock <= 5
                            ? 'bg-amber-500/80 text-slate-950'
                            : 'bg-emerald-500/80 text-slate-950'
                        }`}>
                          {isOutOfStock ? 'Agotado' : `Stock: ${stock}`}
                        </div>
                      </div>

                      {/* Product Details */}
                      <div className="flex-1 flex flex-col justify-between">
                        <h3 className={`text-xs font-bold line-clamp-2 leading-snug mb-1 ${isOutOfStock ? 'text-slate-400' : 'text-slate-100'}`}>
                          {p.descripcion || p.description || 'Producto'}
                        </h3>

                        <div className="mt-1 pt-1.5 border-t border-slate-800/80 flex items-baseline justify-between">
                          <div>
                            <span className={`text-sm font-black font-mono tracking-tight ${isOutOfStock ? 'text-slate-400' : 'text-emerald-400'}`}>
                              ${priceUSD.toFixed(2)}
                            </span>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {priceVES.toLocaleString('es-VE', { maximumFractionDigits: 1 })} Bs
                            </p>
                          </div>

                          {isOutOfStock ? (
                            <span 
                              className="px-2 py-1 rounded-lg bg-rose-950/80 border border-rose-800/60 text-rose-300 text-[10px] font-black uppercase tracking-wider"
                              title="Sin existencias"
                            >
                              Agotado
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="w-7 h-7 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white flex items-center justify-center transition active:scale-90"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Bar */}
      {cartItemCount > 0 && (
        <div className="fixed bottom-14 left-0 right-0 z-40 max-w-md mx-auto px-3">
          <div className="bg-gradient-to-r from-slate-900 to-slate-950 border border-blue-500/40 rounded-2xl p-2.5 flex items-center justify-between shadow-2xl backdrop-blur-lg">
            <div
              onClick={() => setIsCartDrawerOpen(true)}
              className="flex items-center gap-2.5 cursor-pointer pl-1"
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-900/40">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black text-[11px] flex items-center justify-center shadow">
                  {cartItemCount}
                </span>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 font-medium leading-none">Total Carrito</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-lg font-black text-white font-mono leading-tight">
                    ${cartTotalUSD.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    ({cartTotalVES.toFixed(1)} Bs)
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsCheckoutOpen(true)}
              className="py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <span>COBRAR</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Cart Slide-up Drawer */}
      {isCartDrawerOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col justify-end max-w-md mx-auto animate-in fade-in duration-150">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-200 pb-6">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm text-white">
                  Carrito de Compras ({cartItemCount} {cartItemCount === 1 ? 'ítem' : 'ítems'})
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePauseCurrentSale}
                  className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition flex items-center gap-1 text-[11px] font-bold"
                  title="Pausar venta para atender a otro cliente"
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span>Pausar</span>
                </button>
                <button
                  onClick={clearCart}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Vaciar Carrito"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsCartDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {cart.map((item) => {
                const price = parseFloat(String(item.product.precio_detalle_usd || item.product.priceUSD || 0)) || 0;
                const lineTot = price * item.qty;

                return (
                  <div
                    key={item.product.id}
                    className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">
                        {item.product.descripcion || item.product.description}
                      </h4>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          ${lineTot.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          (${price.toFixed(2)} c/u)
                        </span>
                      </div>
                    </div>

                    {/* Stepper buttons */}
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-xl p-0.5">
                      <button
                        onClick={() => updateQty(item.product.id, -1)}
                        className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition active:scale-90"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center font-mono font-black text-xs text-white">
                        {item.qty}
                      </span>
                      <button
                        onClick={() => updateQty(item.product.id, 1)}
                        className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition active:scale-90"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Bottom Drawer Actions */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-400 font-medium">Total a Pagar:</span>
                <div className="text-right">
                  <span className="text-xl font-black text-white font-mono">
                    ${cartTotalUSD.toFixed(2)}
                  </span>
                  <p className="text-xs text-emerald-400 font-mono">
                    {cartTotalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsCartDrawerOpen(false);
                  setIsCheckoutOpen(true);
                }}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-900/30 flex items-center justify-center gap-2 transition active:scale-95"
              >
                <span>PROCEDER AL COBRO</span>
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Selector Modal */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col justify-end max-w-md mx-auto">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden pb-6">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Seleccionar Cliente</h3>
              <button
                onClick={() => setIsClientModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isNewClientForm ? (
              <div className="p-4 flex-1 overflow-y-auto space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Buscar por cédula o nombre..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                  <button
                    onClick={() => setIsNewClientForm(true)}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Nuevo</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  {filteredClients.map((cli) => (
                    <button
                      key={cli.id || cli.cedula_rif}
                      onClick={() => {
                        setSelectedClient(cli);
                        setIsClientModalOpen(false);
                        showToast(`Cliente: ${cli.nombre}`);
                      }}
                      className={`w-full p-3 rounded-xl border text-left transition flex items-center justify-between ${
                        selectedClient.cedula_rif === cli.cedula_rif
                          ? 'bg-blue-600/20 border-blue-500 text-white'
                          : 'bg-slate-950 border-slate-800 hover:bg-slate-800/60 text-slate-200'
                      }`}
                    >
                      <div>
                        <p className="text-xs font-bold">{cli.nombre}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{cli.cedula_rif}</p>
                      </div>
                      {selectedClient.cedula_rif === cli.cedula_rif && (
                        <Check className="w-4 h-4 text-blue-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-300">Registrar Nuevo Cliente</h4>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Cédula o RIF</label>
                  <input
                    type="text"
                    value={newClientDoc}
                    onChange={(e) => setNewClientDoc(e.target.value)}
                    placeholder="Ej: V-12345678"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Nombre Completo</label>
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Teléfono (WhatsApp)</label>
                  <input
                    type="tel"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    placeholder="Ej: 04121234567"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={() => setIsNewClientForm(false)}
                    className="py-2.5 px-3 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                  >
                    Volver
                  </button>
                  <button
                    onClick={handleSaveNewClient}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl"
                  >
                    Guardar Cliente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Camera Barcode / QR Scanner Modal */}
      <MobileScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScanCode}
      />

      {/* Checkout Modal */}
      <MobileCheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        totalUSD={cartTotalUSD}
        tasaDia={activeTasa}
        tasaVuelto={tasaVuelto}
        client={selectedClient}
        onConfirmSale={handleConfirmSale}
        isProcessing={isProcessingSale}
      />

      {/* Digital Ticket Modal */}
      <MobileTicketModal
        isOpen={isTicketOpen}
        onClose={() => setIsTicketOpen(false)}
        sale={confirmedSale}
        companyConfig={companyConfig}
        onNewSale={() => {
          setSelectedClient(defaultClient);
          clearCart();
        }}
      />
      {/* Paused Sales (Ventas en Espera) Modal */}
      {isPausedModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col justify-end max-w-md mx-auto animate-in fade-in duration-150">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-200 pb-6">
            <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <PauseCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Ventas en Espera ({pausedSales.length})</h3>
                  <p className="text-[11px] text-slate-400">Pausadas para atender a otros clientes</p>
                </div>
              </div>
              <button
                onClick={() => setIsPausedModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center transition active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {pausedSales.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No tienes ventas en espera guardadas.
                </div>
              ) : (
                pausedSales.map((pSale) => (
                  <div
                    key={pSale.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 shadow-md"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/40 px-1.5 py-0.2 rounded">
                          {pSale.id}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {pSale.timestamp}
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-white truncate">
                        {pSale.client.nombre}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {pSale.cart.reduce((s, i) => s + i.qty, 0)} producto(s) · <strong className="text-emerald-400 font-mono">${pSale.totalUSD.toFixed(2)}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDeletePausedSale(pSale.id)}
                        className="w-8 h-8 rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 flex items-center justify-center transition active:scale-90"
                        title="Descartar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResumeSale(pSale)}
                        className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1 shadow-md shadow-emerald-900/30 transition active:scale-95"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Reanudar</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Caja Action Menu Sheet */}
      {isCajaQuickMenuOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col justify-end max-w-md mx-auto animate-in fade-in duration-150">
          <div className="bg-slate-900 border-t border-slate-700 rounded-t-3xl p-5 pb-8 space-y-4 shadow-2xl animate-in slide-in-from-bottom-5 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Opciones de Caja (Turno Activo)</h3>
                  <p className="text-[10px] text-slate-400">Terminal: {liveCajaData?.terminal || 'CAJA_01'} · {liveCajaData?.cajero || currentUser?.nombre || 'Cajero'}</p>
                </div>
              </div>
              <button
                onClick={() => setIsCajaQuickMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center transition active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Drawer Summary */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 grid grid-cols-2 gap-2 text-center">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Efectivo en Gaveta ($)</span>
                <span className="text-lg font-black text-emerald-400 font-mono">
                  ${(liveCajaData?.cashExpectedUsd ?? montoAperturaUsd ?? 0).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Efectivo en Gaveta (Bs)</span>
                <span className="text-lg font-black text-blue-400 font-mono">
                  {(liveCajaData?.cashExpectedVes ?? montoAperturaVes ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 0 })} Bs
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsCajaQuickMenuOpen(false);
                  setIsMovModalOpen(true);
                }}
                className="w-full p-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl text-left flex items-center gap-3 transition active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black text-white">Registrar Entrada / Salida de Efectivo</h4>
                  <p className="text-[10px] text-slate-400">Ingreso menor, retiro de dinero, cambio de billetes</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>

              {/* Abono de Cliente */}
              <button
                type="button"
                onClick={() => {
                  setIsCajaQuickMenuOpen(false);
                  setIsAbonoModalOpen(true);
                }}
                className="w-full p-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl text-left flex items-center gap-3 transition active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black text-white">Registrar Abono de Cliente</h4>
                  <p className="text-[10px] text-slate-400">Cobro de deudas, abonos a cuenta corriente</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>

              {/* Devolución de Venta */}
              <button
                type="button"
                onClick={() => {
                  setIsCajaQuickMenuOpen(false);
                  setIsDevolucionModalOpen(true);
                }}
                className="w-full p-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl text-left flex items-center gap-3 transition active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black text-white">Procesar Devolución de Venta</h4>
                  <p className="text-[10px] text-slate-400">Reintegro de productos a inventario o dinero a cliente</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsCajaQuickMenuOpen(false);
                  setIsCierreModalOpen(true);
                }}
                className="w-full p-3.5 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 rounded-2xl text-left flex items-center gap-3 transition active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black text-rose-300">Arqueo y Cierre de Turno</h4>
                  <p className="text-[10px] text-rose-400/80">Contar dinero físico, verificar diferencias y cerrar sesión</p>
                </div>
                <ChevronRight className="w-4 h-4 text-rose-400/60 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Movimiento */}
      <MobileMovimientoCajaModal
        isOpen={isMovModalOpen}
        onClose={() => setIsMovModalOpen(false)}
        terminal={liveCajaData?.terminal || 'CAJA_01'}
        usuarioNombre={currentUser?.nombre || 'Anderson Laguna'}
        usuarioId={currentUser?.id || 1}
        tasaDia={activeTasa}
        onSuccess={() => {
          showToast('✅ Movimiento de caja registrado');
          fetchCajaData();
        }}
      />

      {/* Modal Abono */}
      <MobileAbonoModal
        isOpen={isAbonoModalOpen}
        onClose={() => setIsAbonoModalOpen(false)}
        client={selectedClient && selectedClient.id !== 0 && selectedClient.cedula_rif !== 'V-00000000' ? (selectedClient as any) : null}
        terminal={liveCajaData?.terminal || 'CAJA_01'}
        usuarioNombre={currentUser?.nombre || 'Anderson Laguna'}
        usuarioId={currentUser?.id || 1}
        tasaDia={activeTasa}
        onSuccess={() => {
          showToast('✅ Abono registrado exitosamente');
          fetchCajaData();
        }}
      />

      {/* Modal Devolucion */}
      <MobileDevolucionModal
        isOpen={isDevolucionModalOpen}
        onClose={() => setIsDevolucionModalOpen(false)}
        terminal={liveCajaData?.terminal || 'CAJA_01'}
        cajero={currentUser?.nombre || 'Anderson Laguna'}
        usuarioId={currentUser?.id || 1}
        tasaDia={activeTasa}
        onSuccess={() => {
          showToast('🔄 Devolución procesada exitosamente');
          fetchCajaData();
        }}
      />

      {/* Modal Cierre */}
      <MobileCierreCajaModal
        isOpen={isCierreModalOpen}
        onClose={() => setIsCierreModalOpen(false)}
        caja={liveCajaData}
        onSuccess={() => {
          showToast('🔒 Turno cerrado exitosamente');
          fetchCajaData();
        }}
      />
    </div>
  );
}
