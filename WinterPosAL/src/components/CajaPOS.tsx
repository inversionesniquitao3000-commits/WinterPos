import React, { useState, useEffect, useRef } from 'react';
import { Product, Client, User, CompanyConfig, SaleItem, Payment, Sale, CierreCaja } from '../types';
import { 
  ShoppingBag, Search, Trash2, 
  Printer, XCircle, ArrowUpRight, 
  Calculator, CheckCircle2, Ticket,
  Clock, ListOrdered
} from 'lucide-react';
import { formatNumberToWordsUSD } from '../utils';

interface CajaPOSProps {
  products: Product[];
  clients: Client[];
  companyConfig: CompanyConfig;
  tasaDia: number;
  tasaVuelto: number;
  currentUser: User;
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
  }) => void;
  onRegisterCajaMovement: (type: 'Entrada' | 'Salida', description: string, usd: number, ves: number) => void;
  cajaAbierta: boolean;
  montoAperturaUsd: number;
  montoAperturaVes: number;
  onAbrirCaja: (usd: number, ves: number) => void;
  onCerrarCaja: (
    realUsd: number, 
    realVes: number,
    details?: {
      ventasEfectivoUsd: number;
      abonoClientesUsd: number;
      entradaEfectivoUsd: number;
      salidaEfectivoUsd: number;
      devolucionEfectivoUsd: number;
      dineroEnCajaExpected: number;
      ventasTotalesUsd: number;
      descuentosUsd: number;
      ventaBrutaUsd: number;
      pagosEfectivoUsd: number;
      pagosEfectivoBsUsd: number;
      pagosEfectivoBsVes: number;
      pagosBiopagoUsd: number;
      pagosBiopagoVes: number;
      pagosPuntoUsd: number;
      pagosPuntoVes: number;
      pagosTarjetaUsd: number;
      pagosCreditoUsd: number;
      pagosPuntosUsd: number;
      devolucionVentasUsd: number;
      ventaTotalUsd: number;
    }
  ) => CierreCaja;
  shiftSales: Sale[];
  shiftAbonosUsd: number;
  shiftEntradasUsd: number;
  shiftSalidasUsd: number;
}

export default function CajaPOS({
  products,
  clients,
  companyConfig,
  tasaDia,
  tasaVuelto,
  currentUser,
  onRegisterSale,
  onRegisterCajaMovement,
  cajaAbierta,
  montoAperturaUsd: _montoAperturaUsd,
  montoAperturaVes: _montoAperturaVes,
  onAbrirCaja,
  onCerrarCaja,
  shiftSales,
  shiftAbonosUsd,
  shiftEntradasUsd,
  shiftSalidasUsd
}: CajaPOSProps) {
  // Opening/Closing state
  const [showAperturaModal, setShowAperturaModal] = useState(!cajaAbierta);
  const [aperturaUsdVal, setAperturaUsdVal] = useState('');
  const [aperturaVesVal, setAperturaVesVal] = useState('');
  
  const [showCierreModal, setShowCierreModal] = useState(false);
  const [cierreRealUsd, setCierreRealUsd] = useState('0');
  const [cierreRealVes, setCierreRealVes] = useState('0');
  const [cierreResult, setCierreResult] = useState<CierreCaja | null>(null);

  // Manual movements state
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [movType, setMovType] = useState<'Entrada' | 'Salida'>('Entrada');
  const [movDesc, setMovDesc] = useState('');
  const [movUsd, setMovUsd] = useState('');
  const [movVes, setMovVes] = useState('');

  // POS State
  const [selectedClient, setSelectedClient] = useState<Client>(() => {
    try {
      const savedDoc = localStorage.getItem('pos_current_client_doc');
      if (savedDoc) {
        const match = clients.find(c => c.cedula_rif === savedDoc);
        if (match) return match;
      }
    } catch (e) {
      console.error(e);
    }
    return clients.find(c => c.cedula_rif === 'V-00000000') || clients[0];
  });
  
  const [selectedSeller, setSelectedSeller] = useState<string>(currentUser.nombre);
  
  const [searchProdTerm, setSearchProdTerm] = useState('');
  
  const [saleItems, setSaleItems] = useState<SaleItem[]>(() => {
    try {
      const saved = localStorage.getItem('pos_current_cart');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });

  const [discountPct, setDiscountPct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pos_current_discount');
      return saved ? parseFloat(saved) || 0 : 0;
    } catch (e) {
      console.error(e);
      return 0;
    }
  });

  // Tickets on hold state
  const [ticketsOnHold, setTicketsOnHold] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('pos_tickets_on_hold');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });

  const [showOnHoldModal, setShowOnHoldModal] = useState(false);

  // Persist POS state to localStorage
  useEffect(() => {
    localStorage.setItem('pos_current_cart', JSON.stringify(saleItems));
  }, [saleItems]);

  useEffect(() => {
    localStorage.setItem('pos_current_discount', String(discountPct));
  }, [discountPct]);

  useEffect(() => {
    if (selectedClient) {
      localStorage.setItem('pos_current_client_doc', selectedClient.cedula_rif);
    }
  }, [selectedClient]);

  useEffect(() => {
    localStorage.setItem('pos_tickets_on_hold', JSON.stringify(ticketsOnHold));
  }, [ticketsOnHold]);

  const handlePutOnHold = () => {
    if (saleItems.length === 0) return;
    
    const defaultTag = `Ticket ${ticketsOnHold.length + 1} - ${selectedClient.nombre}`;
    const customTag = window.prompt("Ingrese una nota o referencia para guardar este ticket en espera:", defaultTag);
    if (customTag === null) return; // user cancelled

    const newHold = {
      id: Date.now(),
      fecha: new Date().toLocaleString(),
      tag: customTag || defaultTag,
      client: selectedClient,
      items: saleItems,
      discount: discountPct
    };

    setTicketsOnHold(prev => [...prev, newHold]);
    
    // Clear active POS state
    setSaleItems([]);
    setDiscountPct(0);
    const defaultClient = clients.find(c => c.cedula_rif === 'V-00000000') || clients[0];
    if (defaultClient) {
      setSelectedClient(defaultClient);
    }
    localStorage.removeItem('pos_current_cart');
    localStorage.removeItem('pos_current_discount');
    localStorage.removeItem('pos_current_client_doc');

    alert("Venta guardada en espera con éxito.");
  };

  const handleRetrieveHold = (hold: any) => {
    if (saleItems.length > 0) {
      const confirmReplace = window.confirm("Ya hay artículos en el carrito actual. ¿Desea reemplazarlos con el ticket recuperado?");
      if (!confirmReplace) return;
    }

    setSaleItems(hold.items);
    setDiscountPct(hold.discount);
    setSelectedClient(hold.client);
    
    setTicketsOnHold(prev => prev.filter(h => h.id !== hold.id));
    setShowOnHoldModal(false);
  };

  const handleRemoveHold = (holdId: number) => {
    if (window.confirm("¿Está seguro de eliminar permanentemente este ticket en espera?")) {
      setTicketsOnHold(prev => prev.filter(h => h.id !== holdId));
    }
  };

  // Checkout modal state
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  // Keyboard row selection and mixed change state
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0);
  const [mixedChangeUSDVal, setMixedChangeUSDVal] = useState('');

  // Reset mixed change on open/close
  useEffect(() => {
    if (!showCheckoutModal) {
      setMixedChangeUSDVal('');
    }
  }, [showCheckoutModal]);

  // Clamp selection index
  useEffect(() => {
    if (saleItems.length === 0) {
      setSelectedItemIndex(-1);
    } else if (selectedItemIndex >= saleItems.length) {
      setSelectedItemIndex(saleItems.length - 1);
    } else if (selectedItemIndex < 0) {
      setSelectedItemIndex(0);
    }
  }, [saleItems, selectedItemIndex]);

  // Keyboard navigation inside the cart
  useEffect(() => {
    const handleCartKeys = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.tagName === 'TEXTAREA'
      );
      if (isInputActive) return;

      if (saleItems.length === 0) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedItemIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedItemIndex(prev => Math.min(saleItems.length - 1, prev + 1));
      } else if (e.key === '+' || e.key === 'Add') {
        e.preventDefault();
        const selectedItem = saleItems[selectedItemIndex];
        if (selectedItem) {
          const step = selectedItem.product.a_granel ? 0.1 : 1;
          handleUpdateItemQty(selectedItem.product.id, selectedItem.qty + step);
        }
      } else if (e.key === '-' || e.key === 'Subtract') {
        e.preventDefault();
        const selectedItem = saleItems[selectedItemIndex];
        if (selectedItem) {
          const step = selectedItem.product.a_granel ? 0.1 : 1;
          handleUpdateItemQty(selectedItem.product.id, Math.max(0.001, selectedItem.qty - step));
        }
      } else if (e.key === 'Delete' || e.key === 'Del') {
        e.preventDefault();
        const selectedItem = saleItems[selectedItemIndex];
        if (selectedItem) {
          handleRemoveItem(selectedItem.product.id);
        }
      }
    };
    window.addEventListener('keydown', handleCartKeys);
    return () => window.removeEventListener('keydown', handleCartKeys);
  }, [saleItems, selectedItemIndex]);

  
  // Mixed payment values
  const [payCashUSD, setPayCashUSD] = useState('');
  const [payCashVES, setPayCashVES] = useState('');
  const [payCardVES, setPayCardVES] = useState('');
  const [payPagoMovilVES, setPayPagoMovilVES] = useState('');
  const [payBiopagoVES, setPayBiopagoVES] = useState('');
  const [payCreditUSD, setPayCreditUSD] = useState('');

  const [refPagoMovil, setRefPagoMovil] = useState('');
  const [bankPagoMovil, setBankPagoMovil] = useState('');

  // Generated Ticket Modal state
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [printedTicketData, setPrintedTicketData] = useState<any>(null);

  // Search input ref and auto-focus handlers
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on state changes or mounting
  useEffect(() => {
    if (cajaAbierta && !showAperturaModal && !showCheckoutModal && !showCierreModal && !showMovementsModal && !showTicketModal) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [cajaAbierta, showAperturaModal, showCheckoutModal, showCierreModal, showMovementsModal, showTicketModal]);

  // Listener for F11
  // Listener for F11 and Escape (modals closing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setShowCheckoutModal(false);
        setShowMovementsModal(false);
        setShowCierreModal(false);
        setShowTicketModal(false);
        setCierreResult(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync selected seller with currentUser
  useEffect(() => {
    setSelectedSeller(currentUser.nombre);
  }, [currentUser]);

  // Auto-focus opening modal if closed
  useEffect(() => {
    setShowAperturaModal(!cajaAbierta);
  }, [cajaAbierta]);

  // Compute Totals
  const subtotalUSD = saleItems.reduce((acc, item) => acc + item.totalUSD, 0);
  const discountAmountUSD = subtotalUSD * (discountPct / 100);
  const totalUSD = Math.max(0, subtotalUSD - discountAmountUSD);
  const totalVES = totalUSD * tasaDia;

  const handleAddProduct = (prod: Product, qty: number = 1) => {
    if (!cajaAbierta) {
      alert('Debe abrir la caja registradora para poder realizar ventas.');
      return;
    }
    
    // Strict block: do not add to sales list if there is no stock
    if (prod.stock_actual <= 0) {
      alert(`Sin Existencias: El producto "${prod.description}" no cuenta con stock disponible en almacén.`);
      return;
    }

    let finalQty = qty;
    if (prod.a_granel) {
      const inputStr = prompt(`Ingrese la cantidad en KG para el producto a granel "${prod.description}" (Stock disponible: ${prod.stock_actual} uds/kg):`, "1.000");
      if (inputStr === null) return; // User cancelled
      const parsed = parseFloat(inputStr);
      if (isNaN(parsed) || parsed <= 0) {
        alert("Cantidad ingresada no es válida.");
        return;
      }
      finalQty = parsed;
    }

    setSaleItems(prev => {
      const existing = prev.find(item => item.product.id === prod.id);
      if (existing) {
        const nextQty = existing.qty + finalQty;
        if (nextQty > prod.stock_actual) {
          alert(`No hay disponibilidad suficiente. Stock máximo disponible: ${prod.stock_actual}`);
          return prev;
        }
        return prev.map(item =>
          item.product.id === prod.id
            ? { ...item, qty: nextQty, totalUSD: nextQty * item.priceUSD }
            : item
        );
      } else {
        const priceUSD = prod.precio_detalle_usd;
        return [...prev, {
          product: prod,
          qty: finalQty,
          priceType: 'Detalle',
          priceUSD,
          totalUSD: priceUSD * finalQty
        }];
      }
    });
  };

  const handleUpdateItemQty = (prodId: number, nextQty: number) => {
    const prod = products.find(p => p.id === prodId);
    if (!prod) return;

    if (nextQty <= 0) {
      handleRemoveItem(prodId);
      return;
    }

    if (nextQty > prod.stock_actual) {
      alert(`No hay disponibilidad suficiente. Stock máximo disponible: ${prod.stock_actual}`);
      return;
    }

    setSaleItems(prev =>
      prev.map(item =>
        item.product.id === prodId
          ? {
              ...item,
              qty: nextQty,
              priceUSD: nextQty >= item.product.cantidad_mayorista ? item.product.precio_mayor_usd : item.product.precio_detalle_usd,
              priceType: nextQty >= item.product.cantidad_mayorista ? 'Mayor' : 'Detalle',
              totalUSD: nextQty * (nextQty >= item.product.cantidad_mayorista ? item.product.precio_mayor_usd : item.product.precio_detalle_usd)
            }
          : item
      )
    );
  };

  const handleRemoveItem = (prodId: number) => {
    setSaleItems(prev => prev.filter(item => item.product.id !== prodId));
  };

  const handleClearSale = () => {
    if (window.confirm('¿Está seguro de cancelar la venta en curso? Se limpiarán todos los ítems.')) {
      setSaleItems([]);
      setDiscountPct(0);
      const defaultClient = clients.find(c => c.cedula_rif === 'V-00000000') || clients[0];
      if (defaultClient) {
        setSelectedClient(defaultClient);
      }
      localStorage.removeItem('pos_current_cart');
      localStorage.removeItem('pos_current_discount');
      localStorage.removeItem('pos_current_client_doc');
    }
  };

  const handleOpenCheckout = () => {
    if (saleItems.length === 0) return;
    
    // Reset payment forms
    setPayCashUSD('');
    setPayCashVES('');
    setPayCardVES('');
    setPayPagoMovilVES('');
    setPayBiopagoVES('');
    setPayCreditUSD('');
    
    setRefPagoMovil('');
    setBankPagoMovil('');

    setShowCheckoutModal(true);
  };

  // Mixed currency calculations
  const cashUSDVal = parseFloat(payCashUSD) || 0;
  const cashVESVal = parseFloat(payCashVES) || 0;
  const cardVESVal = parseFloat(payCardVES) || 0;
  const pagoMovilVESVal = parseFloat(payPagoMovilVES) || 0;
  const biopagoVESVal = parseFloat(payBiopagoVES) || 0;
  const creditUSDVal = parseFloat(payCreditUSD) || 0;

  const totalPaidUSD =
    cashUSDVal +
    (cashVESVal / tasaDia) +
    (cardVESVal / tasaDia) +
    (pagoMovilVESVal / tasaDia) +
    (biopagoVESVal / tasaDia) +
    creditUSDVal;

  const remainingUSD = Math.max(0, totalUSD - totalPaidUSD);
  const changeUSD = Math.max(0, totalPaidUSD - totalUSD);
  const changeVES = changeUSD * tasaVuelto;

  const isPagoMovilValid = pagoMovilVESVal === 0 || (refPagoMovil.trim().length >= 4 && bankPagoMovil !== '');
  const isBiopagoValid = true;
  const isCreditValid = creditUSDVal === 0 || creditUSDVal <= selectedClient.credito_disponible;

  const canConfirmCheckout = totalPaidUSD >= totalUSD && isPagoMovilValid && isBiopagoValid && isCreditValid;

  const handleConfirmCheckout = () => {
    if (!canConfirmCheckout) {
      alert('Información de cobro incompleta o inválida.');
      return;
    }

    // Reference validations (Pago Móvil)
    if (pagoMovilVESVal > 0) {
      if (!refPagoMovil.trim() || refPagoMovil.trim().length < 4) {
        alert('La referencia bancaria es obligatoria y debe tener mínimo 4 caracteres para pagos por Pago Móvil.');
        return;
      }
      if (!bankPagoMovil) {
        alert('Debe especificar el banco emisor para Pago Móvil.');
        return;
      }
    }

    // Limit credit validations
    if (creditUSDVal > 0) {
      if (creditUSDVal > selectedClient.credito_disponible) {
        alert(`Crédito insuficiente. Límite disponible del cliente: $${selectedClient.credito_disponible.toFixed(2)} USD.`);
        return;
      }
    }

    // Build payment array
    const pagos: Payment[] = [];
    if (cashUSDVal > 0) pagos.push({ metodo: 'Efectivo$', monto: cashUSDVal, montoUSD: cashUSDVal });
    if (cashVESVal > 0) pagos.push({ metodo: 'EfectivoBs', monto: cashVESVal, montoUSD: cashVESVal / tasaDia });
    if (cardVESVal > 0) pagos.push({ metodo: 'TarjetaBs', monto: cardVESVal, montoUSD: cardVESVal / tasaDia });
    if (pagoMovilVESVal > 0) {
      pagos.push({
        metodo: 'PagoMovil',
        monto: pagoMovilVESVal,
        montoUSD: pagoMovilVESVal / tasaDia,
        reference: refPagoMovil,
        bancoEmisor: bankPagoMovil
      });
    }
    if (biopagoVESVal > 0) {
      pagos.push({
        metodo: 'Biopago',
        monto: biopagoVESVal,
        montoUSD: biopagoVESVal / tasaDia,
        reference: '',
        bancoEmisor: ''
      });
    }
    if (creditUSDVal > 0) {
      pagos.push({ metodo: 'CreditoCliente', monto: creditUSDVal, montoUSD: creditUSDVal });
    }

    const factura_nro = `FAC-${Math.floor(100000 + Math.random() * 900000)}`;

    const saleResult = {
      factura_nro,
      client: selectedClient,
      items: saleItems,
      subtotal: subtotalUSD,
      descuento: discountAmountUSD,
      totalUSD,
      totalVES,
      pagos,
      vueltoUSD: changeUSD,
      vueltoVES: changeVES
    };

    onRegisterSale(saleResult);
    
    // Setup printable data
    setPrintedTicketData(saleResult);
    setShowCheckoutModal(false);
    setShowTicketModal(true);

    // Clear sale state
    setSaleItems([]);
    setDiscountPct(0);
    localStorage.removeItem('pos_current_cart');
    localStorage.removeItem('pos_current_discount');
    localStorage.removeItem('pos_current_client_doc');
  };

  const handleSaveApertura = (e: React.FormEvent) => {
    e.preventDefault();
    const usdStr = aperturaUsdVal.trim();
    const vesStr = aperturaVesVal.trim();

    if (usdStr === "" && vesStr === "") {
      const confirmZero = window.confirm("No ha ingresado montos de apertura. ¿Desea iniciar la caja en cero ($0.00 USD / Bs 0.00 VES)?");
      if (!confirmZero) {
        // User clicked Cancel, stay in menu to edit data
        return;
      }
    }

    const usd = parseFloat(usdStr) || 0;
    const ves = parseFloat(vesStr) || 0;
    onAbrirCaja(usd, ves);
    setShowAperturaModal(false);
  };

  const handleSaveCierre = (e: React.FormEvent) => {
    e.preventDefault();
    const realUsd = parseFloat(cierreRealUsd) || 0;
    const realVes = parseFloat(cierreRealVes) || 0;

    // Detailed metrics calculation
    const aperturaUsd = _montoAperturaUsd;
    const ventasEfectivoUsd = shiftSales.reduce((acc, sale) => {
      const cashPay = sale.pagos.find(p => p.metodo === 'Efectivo$');
      return acc + (cashPay ? cashPay.monto : 0);
    }, 0);
    const abonoClientesUsd = shiftAbonosUsd;
    const entradaEfectivoUsd = shiftEntradasUsd;
    const salidaEfectivoUsd = shiftSalidasUsd;
    const devolucionEfectivoUsd = 0;
    const dineroEnCajaExpected = aperturaUsd + ventasEfectivoUsd + abonoClientesUsd + entradaEfectivoUsd - salidaEfectivoUsd;
    
    const ventasTotalesUsd = shiftSales.reduce((acc, sale) => acc + sale.totalUSD, 0);
    const descuentosUsd = shiftSales.reduce((acc, sale) => acc + sale.descuento, 0);
    const ventaBrutaUsd = ventasTotalesUsd + descuentosUsd;
    
    const pagosEfectivoUsd = shiftSales.reduce((acc, sale) => {
      return acc + sale.pagos.reduce((a, p) => p.metodo === 'Efectivo$' ? a + p.montoUSD : a, 0);
    }, 0);
    const pagosEfectivoBsUsd = shiftSales.reduce((acc, sale) => {
      return acc + sale.pagos.reduce((a, p) => p.metodo === 'EfectivoBs' ? a + p.montoUSD : a, 0);
    }, 0);
    const pagosEfectivoBsVes = shiftSales.reduce((acc, sale) => {
      return acc + sale.pagos.reduce((a, p) => p.metodo === 'EfectivoBs' ? a + p.monto : a, 0);
    }, 0);
    const pagosBiopagoUsd = shiftSales.reduce((acc, sale) => {
      return acc + sale.pagos.reduce((a, p) => p.metodo === 'Biopago' ? a + p.montoUSD : a, 0);
    }, 0);
    const pagosBiopagoVes = shiftSales.reduce((acc, sale) => {
      return acc + sale.pagos.reduce((a, p) => p.metodo === 'Biopago' ? a + p.monto : a, 0);
    }, 0);
    const pagosPuntoUsd = shiftSales.reduce((acc, sale) => {
      return acc + sale.pagos.reduce((a, p) => (p.metodo === 'Tarjeta$' || p.metodo === 'PagoMovil' || p.metodo === 'TarjetaBs') ? a + p.montoUSD : a, 0);
    }, 0);
    const pagosPuntoVes = shiftSales.reduce((acc, sale) => {
      return acc + sale.pagos.reduce((a, p) => (p.metodo === 'Tarjeta$' || p.metodo === 'PagoMovil' || p.metodo === 'TarjetaBs') ? a + p.monto : a, 0);
    }, 0);
    
    const pagosTarjetaUsd = pagosEfectivoBsUsd; 
    const pagosCreditoUsd = shiftSales.reduce((acc, sale) => {
      return acc + sale.pagos.reduce((a, p) => p.metodo === 'CreditoCliente' ? a + p.montoUSD : a, 0);
    }, 0);
    const pagosPuntosUsd = pagosBiopagoUsd; 
    const devolucionVentasUsd = 0;
    const ventaTotalUsd = ventasTotalesUsd;

    const res = onCerrarCaja(realUsd, realVes, {
      ventasEfectivoUsd,
      abonoClientesUsd,
      entradaEfectivoUsd,
      salidaEfectivoUsd,
      devolucionEfectivoUsd,
      dineroEnCajaExpected,
      ventasTotalesUsd,
      descuentosUsd,
      ventaBrutaUsd,
      pagosEfectivoUsd,
      pagosEfectivoBsUsd,
      pagosEfectivoBsVes,
      pagosBiopagoUsd,
      pagosBiopagoVes,
      pagosPuntoUsd,
      pagosPuntoVes,
      pagosTarjetaUsd,
      pagosCreditoUsd,
      pagosPuntosUsd,
      devolucionVentasUsd,
      ventaTotalUsd
    });

    setCierreResult(res);
  };

  const handleSaveCajaMovement = (e: React.FormEvent) => {
    e.preventDefault();
    const usd = parseFloat(movUsd) || 0;
    const ves = parseFloat(movVes) || 0;
    if (!movDesc.trim()) {
      alert('Debe especificar una descripción.');
      return;
    }
    onRegisterCajaMovement(movType, movDesc.trim(), usd, ves);
    setShowMovementsModal(false);
    setMovDesc('');
    setMovUsd('');
    setMovVes('');
    alert('Movimiento de caja registrado exitosamente.');
  };

  const venezuelanBanks = [
    'BANCO DE VENEZUELA S.A.',
    'BANESCO BANCO UNIVERSAL',
    'BANCO MERCANTIL C.A.',
    'BANCO PROVINCIAL',
    'BANCO OCCIDENTAL DE DESCUENTO (BOD)',
    'BANCO EXTERIOR C.A.',
    'BANCO NACIONAL DE CREDITO (BNC)',
    'BANCO FONDO COMUN (BFC)'
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 font-mono text-xs text-slate-800">
      
      {/* LEFT TERMINAL AREA: PRODUCTS SELECTION & SALE TABLE */}
      <div className="xl:col-span-3 space-y-4 flex flex-col h-[calc(100vh-180px)]">
        
        {/* INPUTS HEADER STACK - Light Mode */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
          
          {/* SEARCH PRODUCT SELECTOR */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 font-sans block">Buscar Producto (F11)</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                autoFocus={true}
                type="text"
                placeholder="Escriba código o descripción..."
                value={searchProdTerm}
                onChange={(e) => setSearchProdTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-350 rounded p-2 pl-9 outline-none text-slate-800 focus:bg-white focus:border-winter-blueBtn font-sans"
              />
              
              {/* Autocomplete Dropdown - Light Styled */}
              {searchProdTerm && (
                <div className="absolute left-0 right-0 top-11 bg-white border border-slate-250 rounded max-h-48 overflow-y-auto z-40 shadow-2xl divide-y divide-slate-100">
                  {products
                    .filter(p => p.description.toLowerCase().includes(searchProdTerm.toLowerCase()) || p.barcode.toLowerCase().includes(searchProdTerm.toLowerCase()))
                    .map(p => {
                      const hasStock = p.stock_actual > 0;
                      const priceVES = p.precio_detalle_usd * tasaDia;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={!hasStock}
                          onClick={() => {
                            if (!hasStock) return;
                            handleAddProduct(p);
                            setSearchProdTerm('');
                          }}
                          className={`w-full text-left p-2.5 text-[11px] font-sans block transition-all ${
                            hasStock 
                              ? 'hover:bg-slate-100 text-slate-800 hover:text-slate-900' 
                              : 'opacity-50 cursor-not-allowed text-slate-400 bg-slate-55'
                          }`}
                        >
                          <span className="font-mono text-slate-500 font-bold mr-1.5">{p.barcode}</span>
                          <span className={`${!hasStock ? 'line-through' : ''}`}>{p.description}</span>
                          {hasStock ? (
                            <span className="float-right text-emerald-600 font-bold font-mono text-right flex flex-col items-end">
                              <span>${p.precio_detalle_usd.toFixed(2)} <span className="text-slate-550 font-normal text-[9px] font-sans">/ Bs {priceVES.toFixed(2)}</span></span>
                              <span className="text-[9px] text-slate-500 font-sans font-semibold">Stock: {p.stock_actual} uds</span>
                            </span>
                          ) : (
                            <span className="float-right text-red-500 font-bold font-mono text-right flex flex-col items-end">
                              <span>SIN STOCK</span>
                              <span className="text-[9px] text-slate-400 font-sans font-normal">Stock: {p.stock_actual} uds</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          {/* CLIENT SELECTOR */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 font-sans block">Cliente Facturación</label>
            <select
              value={selectedClient.id}
              onChange={(e) => {
                const cli = clients.find(c => c.id === parseInt(e.target.value));
                if (cli) {
                  setSelectedClient(cli);
                  setDiscountPct(cli.porcentaje_descuento);
                }
              }}
              className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-slate-800 outline-none focus:bg-white focus:border-winter-blueBtn font-sans"
            >
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.cedula_rif}) {c.porcentaje_descuento > 0 ? `[Desc ${c.porcentaje_descuento}%]` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* VENDEDOR SELECTOR */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 font-sans block">Vendedor Asignado (Bloqueado)</label>
            <select
              value={selectedSeller}
              disabled={true}
              onChange={(e) => setSelectedSeller(e.target.value)}
              className="w-full bg-slate-100 border border-slate-300 rounded p-2.5 text-slate-500 outline-none cursor-not-allowed font-sans font-bold"
            >
              <option value={currentUser.nombre}>{currentUser.nombre}</option>
            </select>
          </div>

        </div>

        {/* SALE ITEMS TABLE - Light Mode */}
        <div className="flex-grow bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-0">
          <div className="flex-grow overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr className="text-slate-550">
                  <th className="px-4 py-2.5 w-24">CÓDIGO</th>
                  <th className="px-4 py-2.5">DESCRIPCIÓN</th>
                  <th className="px-4 py-2.5 text-center w-24">TIPO P.</th>
                  <th className="px-4 py-2.5 text-center w-28">CANTIDAD</th>
                  <th className="px-4 py-2.5 text-right w-24">PRECIO U.</th>
                  <th className="px-4 py-2.5 text-right w-24">TOTAL</th>
                  <th className="px-4 py-2.5 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {saleItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-slate-450 font-sans text-xs">
                      No hay artículos cargados en la venta actual. Use el buscador de arriba.
                    </td>
                  </tr>
                ) : (
                  saleItems.map((item, idx) => {
                    const isSelected = idx === selectedItemIndex;
                    return (
                      <tr 
                        key={item.product.id} 
                        onClick={() => setSelectedItemIndex(idx)}
                        className={`cursor-pointer hover:bg-slate-50/50 transition-all ${
                          isSelected ? 'bg-blue-50/70 border-l-2 border-winter-blueBtn shadow-sm' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-bold font-mono text-slate-450">{item.product.barcode}</td>
                        <td className="px-4 py-3 font-sans select-text">{item.product.description}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] border font-bold ${
                            item.priceType === 'Mayor' 
                              ? 'bg-purple-50 border-purple-200 text-purple-700' 
                              : 'bg-emerald-50 border-emerald-250 text-emerald-700'
                          }`}>
                            {item.priceType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleUpdateItemQty(item.product.id, item.qty - (item.product.a_granel ? 0.1 : 1)); }}
                              className="bg-slate-100 border border-slate-205 hover:bg-slate-200 hover:border-slate-350 w-6 h-6 flex items-center justify-center rounded text-slate-700 text-sm font-bold"
                            >
                              -
                            </button>
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.product.a_granel) {
                                  const val = prompt(`Modificar cantidad en KG para "${item.product.description}":`, item.qty.toString());
                                  if (val !== null) {
                                    const parsed = parseFloat(val);
                                    if (!isNaN(parsed) && parsed > 0) {
                                      handleUpdateItemQty(item.product.id, parsed);
                                    }
                                  }
                                }
                              }}
                              className={`font-bold text-center text-slate-800 text-sm ${item.product.a_granel ? 'cursor-pointer underline decoration-dotted text-blue-600 hover:text-blue-800 px-1' : 'w-8'}`}
                            >
                              {item.product.a_granel ? item.qty.toFixed(3) : item.qty}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleUpdateItemQty(item.product.id, item.qty + (item.product.a_granel ? 0.1 : 1)); }}
                              className="bg-slate-100 border border-slate-205 hover:bg-slate-200 hover:border-slate-350 w-6 h-6 flex items-center justify-center rounded text-slate-700 text-sm font-bold"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                          <div className="flex flex-col text-right">
                            <span>${item.priceUSD.toFixed(2)}</span>
                            <span className="text-[10px] text-slate-500 font-sans">Bs {(item.priceUSD * tasaDia).toFixed(2)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          <div className="flex flex-col text-right">
                            <span className="text-emerald-600 font-bold">${item.totalUSD.toFixed(2)}</span>
                            <span className="text-[10px] text-slate-500 font-sans font-normal">Bs {(item.totalUSD * tasaDia).toFixed(2)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.product.id); }}
                            className="text-red-500 hover:text-red-655"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* RIGHT SIDEBAR: FINANCIALS & CONTROL BUTTONS */}
      <div className="space-y-4">
        
        {/* TOTALS CARD - Light Mode */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex justify-between items-center text-[10px] text-slate-400 border-b border-slate-100 pb-2">
            <span className="font-sans">SUCURSAL NIQUITAO 3000</span>
            <span className="text-winter-blueBtn font-bold">MONEDA: USD</span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">Subtotal</span>
              <span className="font-mono">${subtotalUSD.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center text-slate-655">
              <span className="flex items-center gap-1 font-sans">
                Descuento
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="bg-slate-50 border border-slate-300 w-12 text-center rounded p-0.5 font-bold font-mono text-emerald-700 text-[11px]"
                />
                %
              </span>
              <span className="text-red-500 font-mono">-${discountAmountUSD.toFixed(2)}</span>
            </div>

            <div className="border-t border-slate-150 pt-3 flex justify-between items-baseline">
              <span className="font-extrabold text-slate-700 font-sans">TOTAL USD:</span>
              <span className="text-2xl font-black text-emerald-600 font-mono">${totalUSD.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-baseline text-slate-500 border-t border-dashed border-slate-200 pt-2">
              <span className="text-[10px] font-sans uppercase">Ref VES (Tasa {tasaDia.toFixed(2)}):</span>
              <span className="text-sm font-bold font-mono">Bs {totalVES.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* CONTROLS BUTTONS GRID */}
        <div className="grid grid-cols-2 gap-2">
          
          <button
            onClick={() => setShowMovementsModal(true)}
            disabled={!cajaAbierta}
            className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-350 hover:bg-slate-50 transition-all gap-1.5 text-center text-[10px] text-slate-550 shadow-sm disabled:opacity-40"
          >
            <ArrowUpRight className="w-4 h-4 text-green-600" />
            Movimiento Caja
          </button>

          <button
            onClick={() => setShowCierreModal(true)}
            disabled={!cajaAbierta}
            className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-350 hover:bg-slate-50 transition-all gap-1.5 text-center text-[10px] text-slate-550 shadow-sm disabled:opacity-40"
          >
            <XCircle className="w-4 h-4 text-red-500" />
            Cierre de Caja
          </button>

        </div>

        {/* BIG COBRAR ACTION BUTTON - WinterPOS Blue */}
        <button
          onClick={handleOpenCheckout}
          disabled={saleItems.length === 0 || !cajaAbierta}
          className="w-full bg-winter-blueBtn hover:bg-winter-blueBtnHover disabled:bg-slate-300 disabled:text-slate-500 text-white font-black text-sm tracking-wider py-4 rounded-xl transition-all shadow-[0_4px_12px_rgba(11,95,165,0.2)] flex items-center justify-center gap-2 select-none font-sans"
        >
          <ShoppingBag className="w-5 h-5" />
          COBRAR (F12)
        </button>

        {/* TICKETS EN ESPERA CONTROLS */}
        <div className="space-y-2 pt-2 border-t border-slate-200 mt-2 flex flex-col gap-1.5">
          {saleItems.length > 0 && (
            <button
              onClick={handlePutOnHold}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg text-xs font-sans font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
              title="Poner venta actual en espera"
            >
              <Clock className="w-3.5 h-3.5" />
              Poner en Espera
            </button>
          )}
          
          {ticketsOnHold.length > 0 && (
            <button
              onClick={() => setShowOnHoldModal(true)}
              className="w-full bg-slate-700 hover:bg-slate-800 text-white py-2 rounded-lg text-xs font-sans font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm relative"
              title="Ver ventas en espera"
            >
              <ListOrdered className="w-3.5 h-3.5 text-sky-400" />
              <span>Tickets en Espera</span>
              <span className="absolute -top-1.5 -right-1.5 bg-red-650 text-white text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white animate-bounce">
                {ticketsOnHold.length}
              </span>
            </button>
          )}

          {saleItems.length > 0 && (
            <button
              onClick={handleClearSale}
              className="w-full bg-white border border-slate-200 text-red-500 hover:text-red-750 hover:bg-red-50 py-2 rounded-lg text-xs font-sans transition-all flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Cancelar Venta
            </button>
          )}
        </div>

      </div>

      {/* MODAL: CAJA APERTURA - Light Styled */}
      {showAperturaModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-sm shadow-2xl p-6 space-y-5">
            <div className="text-center">
              <div className="inline-flex p-3 bg-emerald-50 border border-emerald-250 rounded-full mb-3 text-emerald-600">
                <Calculator className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-800">APERTURA DE CAJA REGISTRADORA</h3>
              <p className="text-[10px] text-slate-500 font-sans mt-1">Identificador de Estación: CAJA_01</p>
            </div>

            <form onSubmit={handleSaveApertura} className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1 font-sans">Monto Apertura (Dólares USD)</label>
                <div className="flex rounded border border-slate-300 bg-slate-50 items-center focus-within:bg-white focus-within:border-winter-blueBtn transition-all">
                  <span className="bg-slate-200 px-3 py-1.5 text-xs text-emerald-700 border-r border-slate-300 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={aperturaUsdVal}
                    onChange={(e) => setAperturaUsdVal(e.target.value)}
                    className="bg-transparent border-none text-slate-800 text-xs px-3 py-1.5 w-full font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-1 font-sans">Monto Apertura (Bolívares VES)</label>
                <div className="flex rounded border border-slate-300 bg-slate-50 items-center focus-within:bg-white focus-within:border-winter-blueBtn transition-all">
                  <span className="bg-slate-200 px-3 py-1.5 text-xs text-purple-750 border-r border-slate-300 font-bold">Bs</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={aperturaVesVal}
                    onChange={(e) => setAperturaVesVal(e.target.value)}
                    className="bg-transparent border-none text-slate-800 text-xs px-3 py-1.5 w-full font-bold focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-winter-blueBtn hover:bg-winter-blueBtnHover text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all"
              >
                CONFIRMAR E INICIAR APERTURA
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CHECKOUT - Light Styled */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
            
            <div className="bg-slate-100 border-b border-slate-250 px-6 py-4 flex justify-between items-center flex-shrink-0">
              <span className="text-xs font-black text-slate-700 tracking-widest uppercase flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-winter-blueBtn" />
                Interfaz de Liquidación (Checkout)
              </span>
              <button onClick={() => setShowCheckoutModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="flex-grow overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Payments Form */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-1.5 font-sans">
                  Distribución de Métodos de Cobro
                </h3>

                {/* Cash USD */}
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Efectivo ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={payCashUSD}
                    onChange={(e) => setPayCashUSD(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs font-bold font-mono text-emerald-600 focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                  />
                </div>

                {/* Cash VES */}
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Efectivo (Bs VES)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={payCashVES}
                    onChange={(e) => setPayCashVES(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs font-bold font-mono text-purple-700 focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                  />
                </div>

                {/* Debit Card VES */}
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Tarjeta de Débito (Bs VES)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={payCardVES}
                    onChange={(e) => setPayCardVES(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-700 focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                  />
                </div>

                {/* Pago Móvil (VES) */}
                <div className="space-y-2 border-t border-slate-200 pt-2">
                  <label className="text-[10px] text-emerald-700 block font-bold font-sans">Pago Móvil (Bs VES)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={payPagoMovilVES}
                    onChange={(e) => setPayPagoMovilVES(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-700 focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                  />
                  {pagoMovilVESVal > 0 && (
                    <div className="space-y-1">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={bankPagoMovil}
                          onChange={(e) => setBankPagoMovil(e.target.value)}
                          className="bg-slate-55 border border-slate-300 text-[10px] p-2 rounded text-slate-700 outline-none focus:bg-white focus:border-winter-blueBtn font-sans"
                        >
                          <option value="">Banco Emisor...</option>
                          {venezuelanBanks.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <input
                          type="text"
                          placeholder="N° Referencia (>3 dig)..."
                          value={refPagoMovil}
                          onChange={(e) => setRefPagoMovil(e.target.value)}
                          className="bg-slate-55 border border-slate-300 p-2 rounded text-[10px] font-bold text-yellow-600 outline-none focus:bg-white focus:border-winter-blueBtn"
                        />
                      </div>
                      {!isPagoMovilValid && (
                        <span className="text-[9px] text-red-500 font-bold block mt-1 font-sans">
                          * Ingrese Banco y Referencia (mín. 4 caracteres)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Biopago (VES) */}
                <div className="space-y-2 border-t border-slate-200 pt-2">
                  <label className="text-[10px] text-purple-750 block font-bold font-sans">Biopago (Bs VES)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={payBiopagoVES}
                    onChange={(e) => setPayBiopagoVES(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-700 focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                  />
                </div>

                {/* Client Credit limit option */}
                {selectedClient.limite_credito > 0 && (
                  <div className="border-t border-slate-200 pt-2 space-y-1">
                    <label className="text-[10px] text-red-500 block font-bold font-sans">Financiar a Crédito ($ USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={`Máximo $${selectedClient.credito_disponible.toFixed(2)}`}
                      value={payCreditUSD}
                      onChange={(e) => setPayCreditUSD(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-xs font-bold font-mono text-red-550 focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                    />
                    {!isCreditValid && (
                      <span className="text-[9px] text-red-550 font-bold block mt-1 font-sans">
                        * Límite de crédito excedido (máx: ${selectedClient.credito_disponible.toFixed(2)} USD)
                      </span>
                    )}
                    <span className="text-[9px] text-slate-500 block font-sans">
                      * El saldo pendiente del cliente se incrementará al confirmar la venta.
                    </span>
                  </div>
                )}

              </div>

              {/* Receipt Summary & Status Card */}
              <div className="flex flex-col justify-between space-y-6">
                
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-4">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-2">
                    Resumen de Liquidación
                  </h3>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-550 font-sans">Monto Venta USD:</span>
                      <span className="font-bold text-slate-800 font-mono">${totalUSD.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-550 font-sans">Monto Venta VES:</span>
                      <span className="font-bold text-slate-600 font-mono">Bs {totalVES.toFixed(2)}</span>
                    </div>
                    
                    <div className="border-t border-slate-200 pt-2 flex justify-between text-emerald-700 font-bold">
                      <span className="font-sans">Total Pagado USD:</span>
                      <span className="font-mono">${totalPaidUSD.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-xs border-t border-slate-200 pt-2 items-baseline">
                      <span className="text-slate-550 font-sans">Monto por Liquidar:</span>
                      <div className="text-right font-mono flex flex-col items-end">
                        <span className={`font-black ${remainingUSD > 0 ? 'text-red-500' : 'text-slate-500'}`}>
                          ${remainingUSD.toFixed(2)} USD
                        </span>
                        {remainingUSD > 0 && (
                          <span className="text-[10px] text-red-500/80 font-bold font-sans">
                            Bs {(remainingUSD * tasaDia).toFixed(2)} VES
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-dashed border-slate-200 pt-3">
                      <span className="text-[10px] text-slate-500 block font-sans">Diferencia / Cambio (Vuelto):</span>
                      <div className="flex justify-between items-baseline mt-1 font-mono">
                        <span className="text-purple-750 font-black text-lg">
                          Bs {changeVES.toFixed(2)}
                        </span>
                        <span className="text-slate-500 text-xs">
                          (${changeUSD.toFixed(2)} USD)
                        </span>
                      </div>

                      {/* MIXED CHANGE HELPER CALCULATOR */}
                      {changeUSD > 0 && (
                        <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-lg mt-3 space-y-2 text-[10px] font-sans text-purple-955">
                          <div className="font-bold border-b border-purple-100 pb-1 uppercase tracking-wider text-[9px] text-purple-800">
                            🧮 Auxiliar Vuelto Mixto
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] text-slate-500 block mb-0.5">Entregar en USD ($)</label>
                              <input
                                type="number"
                                step="0.01"
                                max={changeUSD}
                                min="0"
                                placeholder="Monto en $"
                                value={mixedChangeUSDVal}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  if (val > changeUSD) {
                                    setMixedChangeUSDVal(changeUSD.toString());
                                  } else {
                                    setMixedChangeUSDVal(e.target.value);
                                  }
                                }}
                                className="w-full bg-white border border-purple-200 rounded p-1 font-bold font-mono text-slate-800 outline-none text-[11px]"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-slate-500 block mb-0.5">Restante en VES (Bs)</label>
                              <div className="w-full bg-purple-100/50 border border-purple-200 rounded p-1 font-bold font-mono text-purple-900 text-sm">
                                Bs {((changeUSD - (Math.min(changeUSD, Math.max(0, parseFloat(mixedChangeUSDVal) || 0)))) * tasaVuelto).toFixed(2)}
                              </div>
                            </div>
                          </div>
                          <div className="text-[8.5px] text-slate-500 italic mt-1 leading-tight">
                            * Ingrese el monto en USD que devolverá en billetes. El sistema calcula la diferencia a devolver en Bolívares usando la tasa de vuelto ({tasaVuelto.toFixed(2)} Bs).
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className={`p-3.5 rounded-lg border text-center font-bold tracking-wider font-sans text-xs ${
                    canConfirmCheckout
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}>
                    {canConfirmCheckout 
                      ? 'PAGO COMPLETO Y VALIDADO' 
                      : (totalPaidUSD < totalUSD 
                          ? 'INGRESE LOS MEDIOS DE PAGO' 
                          : (!isPagoMovilValid || !isBiopagoValid 
                              ? 'VERIFIQUE BANCO Y REFERENCIA' 
                              : 'CRÉDITO EXCEDIDO'))}
                  </div>

                  <button
                    onClick={handleConfirmCheckout}
                    disabled={!canConfirmCheckout}
                    className="w-full bg-winter-blueBtn hover:bg-winter-blueBtnHover disabled:bg-slate-200 disabled:text-slate-450 text-white py-4 rounded-xl font-black text-xs tracking-widest transition-all shadow-[0_4px_12px_rgba(11,95,165,0.2)] flex items-center justify-center gap-1.5 font-sans"
                  >
                    <Printer className="w-4 h-4" />
                    CONFIRMAR COBRO Y EMITIR TICKET
                  </button>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* MODAL: TICKET FISCAL PRINT PREVIEW - Light Styled */}
      {showTicketModal && printedTicketData && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-900">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden w-full max-w-sm shadow-2xl p-6 space-y-4">
            
            <div className="max-h-[60vh] overflow-y-auto bg-white p-5 rounded font-mono text-[10px] space-y-3">
              
              {/* Commerce info */}
              <div className="text-center">
                <h4 className="font-extrabold text-sm uppercase">{companyConfig.nombre_comercio}</h4>
                <p className="font-bold">RIF: {companyConfig.rif}</p>
                <p className="text-[9px] mt-0.5">{companyConfig.direccion}</p>
                <p>Telf: {companyConfig.telefono}</p>
              </div>

              <p className="text-center select-none text-slate-400">----------------------------------------</p>

              {/* Metadata */}
              <div className="space-y-0.5">
                <div>FACTURA: {printedTicketData.factura_nro}</div>
                <div>FECHA: {new Date().toLocaleDateString()}</div>
                <div>HORA: {new Date().toLocaleTimeString()}</div>
                <div>CAJERO: {currentUser.nombre.toUpperCase()}</div>
                <div>VENDEDOR: {selectedSeller.toUpperCase()}</div>
                <div>CLIENTE: {printedTicketData.client.nombre.toUpperCase()}</div>
                <div>ID/RIF: {printedTicketData.client.cedula_rif}</div>
              </div>

              <p className="text-center select-none text-slate-400">----------------------------------------</p>

              {/* Items */}
              <div className="space-y-1">
                <div className="flex font-bold justify-between">
                  <span className="w-1/2">CONCEPTO</span>
                  <span className="w-1/12 text-center">CT</span>
                  <span className="w-1/4 text-right">P.UN</span>
                  <span className="w-1/6 text-right">TOTAL</span>
                </div>
                {printedTicketData.items.map((item: any) => (
                  <div key={item.product.id} className="flex justify-between">
                    <span className="w-1/2 overflow-hidden truncate">{item.product.description}</span>
                    <span className="w-1/12 text-center">{item.qty}</span>
                    <span className="w-1/4 text-right">${item.priceUSD.toFixed(2)}</span>
                    <span className="w-1/6 text-right">${item.totalUSD.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <p className="text-center select-none text-slate-400">----------------------------------------</p>

              {/* Summary */}
              <div className="text-right space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>SUBTOTAL USD:</span>
                  <span>${printedTicketData.subtotal.toFixed(2)}</span>
                </div>
                {printedTicketData.descuento > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>DESCUENTO:</span>
                    <span>-${printedTicketData.descuento.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-sm border-t border-slate-300 pt-1">
                  <span>TOTAL USD:</span>
                  <span>${printedTicketData.totalUSD.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 font-bold border-t border-dashed border-slate-350 pt-1">
                  <span>TOTAL VES (Tasa {tasaDia.toFixed(2)}):</span>
                  <span>Bs {printedTicketData.totalVES.toFixed(2)}</span>
                </div>
              </div>

              <p className="text-center select-none text-slate-400">----------------------------------------</p>

              {/* Payments & Change */}
              <div className="space-y-0.5">
                <span className="font-bold block">MEDIOS DE PAGO LIQUIDADOS:</span>
                {printedTicketData.pagos.map((p: any, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <span>{p.metodo} {p.bancoEmisor ? `(${p.bancoEmisor})` : ''} {p.reference ? `Ref:${p.reference}` : ''}:</span>
                    <span>{p.metodo.endsWith('$') || p.metodo.includes('Credito') ? `$${p.monto.toFixed(2)}` : `Bs ${p.monto.toFixed(2)}`}</span>
                  </div>
                ))}
                
                {printedTicketData.vueltoVES > 0 && (
                  <div className="flex justify-between font-bold border-t border-slate-300 pt-1 text-[11px]">
                    <span>CAMBIO ENTREGADO VES (Tasa {tasaVuelto.toFixed(2)}):</span>
                    <span>Bs {printedTicketData.vueltoVES.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <p className="text-center select-none text-slate-400">----------------------------------------</p>

              <div className="text-center text-[9px] italic leading-relaxed text-slate-500 font-sans">
                {companyConfig.mensaje_pie_ticket}
              </div>

              <div className="text-center text-[7px] text-slate-400 font-sans">
                WINTERPOS - DOCUMENTO DIGITAL DE CAJA
              </div>
            </div>

            <button
              onClick={() => { setShowTicketModal(false); setPrintedTicketData(null); }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-955 py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              ACEPTAR Y CONTINUAR (TICKET REGISTRADO)
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CIERRE DE CAJA - Light Styled */}
      {showCierreModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800">
          <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xl p-6 space-y-4 transition-all ${cierreResult ? 'max-w-2xl w-full' : 'max-w-md w-full'}`}>
            
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                CONCILIACIÓN Y ARQUEO DE CAJA
              </h3>
              <button onClick={() => { setShowCierreModal(false); setCierreResult(null); }} className="text-slate-400 hover:text-slate-655">✕ Cerrar [ESC]</button>
            </div>

            {!cierreResult ? (
              <form onSubmit={handleSaveCierre} className="space-y-4">
                <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                  Ingrese el saldo físico real disponible en la gaveta de caja en dólares y bolívares para realizar el balance y auditoría final.
                </p>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Efectivo en Caja Real ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={cierreRealUsd}
                    onChange={(e) => setCierreRealUsd(e.target.value)}
                    className="w-full bg-slate-55 border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-800 focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Efectivo en Caja Real (Bs VES)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={cierreRealVes}
                    onChange={(e) => setCierreRealVes(e.target.value)}
                    className="w-full bg-slate-55 border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-800 focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-650 hover:bg-red-700 text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all shadow-[0_4px_10px_rgba(220,38,38,0.2)]"
                >
                  EJECUTAR ARQUEO FINAL
                </button>
              </form>
            ) : (
              <div className="space-y-4 max-w-2xl w-full">
                
                {/* BLUE HEADER TICKET STYLE */}
                <div className="bg-winter-header text-white px-4 py-2 flex items-center justify-between rounded-t-lg">
                  <h3 className="text-sm font-extrabold flex items-center gap-1.5 font-sans">
                    Cierre de Caja
                  </h3>
                  <span className="text-[9px] opacity-75 font-mono">{new Date().toLocaleDateString()}</span>
                </div>

                <div className="bg-white border border-slate-250 p-5 rounded-b-lg grid grid-cols-1 md:grid-cols-2 gap-6 text-[10px] text-slate-700 leading-relaxed shadow-inner">
                  
                  {/* Left Column: Cash Drawer Arqueo */}
                  <div className="space-y-2.5">
                    <div>
                      <span className="text-slate-500 font-sans block text-[9px] uppercase">Usuario</span>
                      <strong className="text-slate-850 text-xs block truncate uppercase">
                        {currentUser.usuario.toUpperCase()} - {currentUser.nombre}
                      </strong>
                    </div>

                    <div className="space-y-1.5 border-t border-slate-100 pt-2 font-mono">
                      <div className="flex justify-between">
                        <span>Apertura de Caja :</span>
                        <span className="font-bold text-slate-800">$ {cierreResult.aperturaUsd.toFixed(2)} / Bs {cierreResult.aperturaVes.toFixed(2)}</span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span>Ventas en Efectivo :</span>
                        <span className="font-bold text-slate-800">$ {cierreResult.ventasEfectivoUsd.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between">
                        <span>Abono de Clientes :</span>
                        <span className="font-bold text-slate-800">$ {cierreResult.abonoClientesUsd.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between">
                        <span>Entrada Efectivo :</span>
                        <span className="font-bold text-slate-800">$ {cierreResult.entradaEfectivoUsd.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between text-red-500 font-bold">
                        <span>Salida Efectivo :</span>
                        <span>- $ {cierreResult.salidaEfectivoUsd.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between text-red-550">
                        <span>Devolución Efectivo :</span>
                        <span>- $ {cierreResult.devolucionEfectivoUsd.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Dinero en Caja Expected Footer */}
                    <div className="border-t border-slate-300 pt-2.5 space-y-0.5">
                      <div className="flex justify-between text-sm font-black text-slate-900">
                        <span className="font-sans uppercase text-[10px]">Dinero en Caja :</span>
                        <span className="text-base text-winter-blueBtn font-mono">
                          $ {cierreResult.dineroEnCajaExpected.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[7.5px] text-slate-450 italic font-sans font-medium uppercase tracking-tighter text-right">
                        {formatNumberToWordsUSD(cierreResult.dineroEnCajaExpected)}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Sales Performance & Payment breakdown */}
                  <div className="space-y-2.5 border-t md:border-t-0 md:border-l border-slate-200 md:pl-6">
                    <div className="space-y-1.5 font-mono">
                      <div className="flex justify-between">
                        <span>Ventas Totales :</span>
                        <span className="font-bold text-slate-800">$ {cierreResult.ventasTotalesUsd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Descuentos :</span>
                        <span className="font-bold text-slate-800">$ {cierreResult.descuentosUsd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900 border-b border-dashed border-slate-200 pb-1.5">
                        <span className="font-sans text-[9px] uppercase">Venta Bruta :</span>
                        <span>$ {cierreResult.ventaBrutaUsd.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1 font-mono text-[9px]">
                      <div className="flex justify-between">
                        <span>Efectivo $ :</span>
                        <span className="font-bold text-slate-800">$ {cierreResult.pagosEfectivoUsd.toFixed(2)}</span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span>Efectivo Bs :</span>
                        <span className="font-bold text-slate-800">$ {cierreResult.pagosEfectivoBsUsd.toFixed(2)} (Bs {cierreResult.pagosEfectivoBsVes.toFixed(2)})</span>
                      </div>

                      <div className="flex justify-between">
                        <span>Biopago :</span>
                        <span className="font-bold text-slate-800">$ {cierreResult.pagosBiopagoUsd.toFixed(2)} (Bs {cierreResult.pagosBiopagoVes.toFixed(2)})</span>
                      </div>

                      <div className="flex justify-between">
                        <span>Punto / Tarjeta :</span>
                        <span className="font-bold text-slate-800">$ {cierreResult.pagosPuntoUsd.toFixed(2)} (Bs {cierreResult.pagosPuntoVes.toFixed(2)})</span>
                      </div>

                      <div className="flex justify-between">
                        <span>A Crédito :</span>
                        <span className="font-bold text-slate-800">$ {cierreResult.pagosCreditoUsd.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between text-red-500">
                        <span>Devolución Ventas :</span>
                        <span>- $ {cierreResult.devolucionVentasUsd.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Venta Total Footer */}
                    <div className="border-t border-slate-300 pt-2.5 space-y-0.5">
                      <div className="flex justify-between text-sm font-black text-slate-900">
                        <span className="font-sans uppercase text-[10px]">Venta Total :</span>
                        <span className="text-base text-winter-blueBtn font-mono">
                          $ {cierreResult.ventaTotalUsd.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[7.5px] text-slate-450 italic font-sans font-medium uppercase tracking-tighter text-right">
                        {formatNumberToWordsUSD(cierreResult.ventaTotalUsd)}
                      </div>
                    </div>
                  </div>

                </div>

                {/* Arqueo Audit differences table */}
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-lg text-xs space-y-2.5 font-sans shadow-sm">
                  <div className="font-bold text-center text-slate-600 border-b border-slate-100 pb-1.5">
                    RECONCILIACIÓN DE EFECTIVO ENTREGADO
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-slate-500 font-medium">
                    <span>Efectivo</span>
                    <span className="text-right">Gaveta Esperado</span>
                    <span className="text-right">Físico Recibido</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 font-mono font-bold text-slate-700">
                    <span className="text-emerald-700">Dólares USD:</span>
                    <span className="text-right">${cierreResult.dineroEnCajaExpected.toFixed(2)}</span>
                    <span className="text-right text-emerald-600">${parseFloat(cierreRealUsd).toFixed(2)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 font-mono font-bold text-slate-700 border-b border-slate-205 pb-2">
                    <span className="text-purple-750">Bolívares Bs:</span>
                    <span className="text-right">Bs {cierreResult.expectedVes.toFixed(2)}</span>
                    <span className="text-right text-purple-600">Bs {parseFloat(cierreRealVes).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-[11px] text-slate-800 font-mono">
                    <span>DIFERENCIA USD / VES:</span>
                    <div className="text-right space-y-0.5">
                      <span className={parseFloat(cierreRealUsd) - cierreResult.dineroEnCajaExpected >= 0 ? 'text-green-600' : 'text-red-650'}>
                        USD: ${(parseFloat(cierreRealUsd) - cierreResult.dineroEnCajaExpected).toFixed(2)}
                      </span>
                      <span className={`block ${parseFloat(cierreRealVes) - cierreResult.expectedVes >= 0 ? 'text-green-600' : 'text-red-650'}`}>
                        VES: Bs {(parseFloat(cierreRealVes) - cierreResult.expectedVes).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 p-3 rounded text-[10px] text-red-750 leading-relaxed font-sans font-medium">
                  ⚠️ NOTA: Al confirmar, se guardará el registro inmutable en el historial de arqueos y se cerrará su sesión de trabajo automáticamente.
                </div>

                <button
                  onClick={() => {
                    setShowCierreModal(false);
                    setCierreResult(null);
                    window.location.reload(); 
                  }}
                  className="w-full bg-winter-blueBtn hover:bg-winter-blueBtnHover text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all shadow"
                >
                  CONFIRMAR REGISTRO Y REINICIAR TERMINAL
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: MANUAL CASH MOVEMENT - Light Styled */}
      {showMovementsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-md shadow-2xl p-6 space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Ticket className="w-4 h-4 text-winter-blueBtn" />
                MOVIMIENTO MANUAL DE CAJA
              </h3>
              <button onClick={() => setShowMovementsModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleSaveCajaMovement} className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Tipo de Movimiento</label>
                <select
                  value={movType}
                  onChange={(e) => setMovType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-slate-800 outline-none focus:bg-white focus:border-winter-blueBtn font-sans"
                >
                  <option value="Entrada">Entrada (Aporte de Efectivo, Cambio inicial...)</option>
                  <option value="Salida">Salida (Retiro de Efectivo, Pago a proveedores...)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-sans">Descripción / Concepto <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pago de flete a camión, reposición de caja chica..."
                  value={movDesc}
                  onChange={(e) => setMovDesc(e.target.value)}
                  className="w-full bg-slate-55 border border-slate-350 rounded p-2.5 text-xs text-slate-800 outline-none focus:bg-white focus:border-winter-blueBtn font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Monto ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={movUsd}
                    onChange={(e) => setMovUsd(e.target.value)}
                    className="w-full bg-slate-55 border border-slate-350 rounded p-2.5 text-xs text-emerald-600 font-bold focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1 font-sans">Monto (Bs VES)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={movVes}
                    onChange={(e) => setMovVes(e.target.value)}
                    className="w-full bg-slate-55 border border-slate-350 rounded p-2.5 text-xs text-purple-700 font-bold focus:bg-white focus:border-winter-blueBtn focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMovementsModal(false)}
                  className="w-1/3 bg-slate-100 border border-slate-250 text-slate-600 py-2.5 rounded font-sans text-xs hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-winter-blueBtn hover:bg-winter-blueBtnHover text-white py-2.5 rounded font-bold font-sans text-xs tracking-wider transition-all"
                >
                  REGISTRAR MOVIMIENTO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TICKETS EN ESPERA */}
      {showOnHoldModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                TICKETS EN ESPERA (VENTAS SUSPENDIDAS)
              </h3>
              <button onClick={() => setShowOnHoldModal(false)} className="text-slate-400 hover:text-slate-705">✕</button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {ticketsOnHold.length === 0 ? (
                <div className="text-center py-8 text-slate-400 font-sans italic">
                  No hay tickets en espera registrados.
                </div>
              ) : (
                ticketsOnHold.map(h => (
                  <div key={h.id} className="border border-slate-250 p-3 rounded-lg flex justify-between items-center bg-slate-55 hover:bg-slate-100 transition-colors shadow-sm">
                    <div className="space-y-1 font-sans text-xs">
                      <div className="font-extrabold text-slate-800 uppercase">{h.tag}</div>
                      <div className="text-[10px] text-slate-500">Fecha: {h.fecha}</div>
                      <div className="text-[10px] text-slate-600 font-mono">
                        Artículos: <span className="font-bold text-slate-800">{h.items.reduce((acc: number, item: any) => acc + item.qty, 0)}</span> | Total: <span className="font-bold text-emerald-600">${(h.items.reduce((acc: number, item: any) => acc + item.totalUSD, 0) * (1 - h.discount / 100)).toFixed(2)} USD</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRetrieveHold(h)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded text-[10px] uppercase shadow-sm transition-all"
                      >
                        Recuperar
                      </button>
                      <button
                        onClick={() => handleRemoveHold(h.id)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 font-bold p-1.5 rounded border border-red-200 transition-all"
                        title="Eliminar ticket"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end border-t border-slate-200 pt-3">
              <button
                onClick={() => setShowOnHoldModal(false)}
                className="bg-slate-100 border border-slate-250 text-slate-650 px-4 py-2 rounded text-xs hover:bg-slate-200 transition-all font-sans"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
