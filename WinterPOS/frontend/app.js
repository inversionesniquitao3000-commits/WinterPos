window.addEventListener('error', (e) => {
  const el = document.getElementById('pos-debug-text');
  if (el) {
    el.style.color = '#ff3333';
    el.textContent = '❌ ERROR: ' + e.message + ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')';
  }
});
function logDebug(msg) {
  const el = document.getElementById('pos-debug-text');
  if (el) el.textContent = msg;
}

// Intercept all native alerts with system custom toast notification banner
const nativeAlert = window.alert;
window.alert = function(msg) {
  // Determine alert type (severity)
  const lowerMsg = msg.toLowerCase();
  const isError = lowerMsg.includes('error') || lowerMsg.includes('no hay disponibilidad') || lowerMsg.includes('no se encuentra') || lowerMsg.includes('obligatoria') || lowerMsg.includes('inválido') || lowerMsg.includes('debe ser') || lowerMsg.includes('sin stock');
  const isSuccess = lowerMsg.includes('guardada') || lowerMsg.includes('éxito') || lowerMsg.includes('actualizado') || lowerMsg.includes('registrado') || lowerMsg.includes('abierto') || lowerMsg.includes('guardado con éxito');
  
  let color = '#20589d';      // default info blue
  let iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`;
  
  if (isError) {
    color = '#c53030';        // error red
    iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
  } else if (isSuccess) {
    color = '#276749';        // success green
    iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
  }

  // Create toast container element dynamically
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: -100px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    background: white;
    border-radius: 8px;
    padding: 0.75rem 1.25rem;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.08);
    border-left: 5px solid ${color};
    font-family: var(--font-family), sans-serif;
    transition: top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s;
    opacity: 0;
    pointer-events: auto;
    max-width: 90vw;
  `;

  // Status icon container
  const iconContainer = document.createElement('div');
  iconContainer.style.cssText = `color: ${color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;`;
  iconContainer.innerHTML = iconSvg;

  // Text message
  const textEl = document.createElement('span');
  textEl.style.cssText = `font-size: 0.88rem; font-weight: 600; color: #2d3748; line-height: 1.4; white-space: nowrap;`;
  textEl.textContent = msg;

  // Dismiss button [x]
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    color: #a0aec0;
    font-size: 1.2rem;
    font-weight: 700;
    line-height: 1;
    padding: 0 0.25rem;
    margin-left: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    outline: none;
    transition: color 0.15s;
  `;
  closeBtn.innerHTML = `&times;`;
  closeBtn.onmouseover = () => { closeBtn.style.color = '#4a5568'; };
  closeBtn.onmouseout = () => { closeBtn.style.color = '#a0aec0'; };

  toast.appendChild(iconContainer);
  toast.appendChild(textEl);
  toast.appendChild(closeBtn);
  document.body.appendChild(toast);

  // Animate slide in from top
  setTimeout(() => {
    toast.style.top = '25px';
    toast.style.opacity = '1';
  }, 50);

  // Close animation
  const dismissToast = () => {
    toast.style.top = '-100px';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 400);
  };

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissToast();
  });
  
  toast.addEventListener('click', dismissToast);

  // Auto-dismiss toast after 4.5 seconds
  setTimeout(dismissToast, 4500);
};

// Global key listener to close modals via ESC key (closes topmost z-index modal first)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const selectors = ['.modal-overlay', '#entrada-picker-modal'];
    const visibleModals = [];
    
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el.style.display !== 'none' && window.getComputedStyle(el).display !== 'none') {
          visibleModals.push(el);
        }
      });
    });

    if (visibleModals.length === 0) return;

    // Sort by z-index descending
    visibleModals.sort((a, b) => {
      const zA = parseInt(window.getComputedStyle(a).zIndex) || 0;
      const zB = parseInt(window.getComputedStyle(b).zIndex) || 0;
      return zB - zA;
    });

    const topModal = visibleModals[0];
    const modalId = topModal.id;

    const modalCloseButtons = {
      'entrada-picker-modal': '#entrada-picker-close',
      'entrada-modal': '#entrada-back-btn',
      'apertura-modal': '#apertura-cancel-arrow',
      'search-product-modal': '#close-search-modal-btn',
      'search-client-modal': '#close-search-client-modal-btn',
      'product-modal': '#close-product-modal-btn',
      'checkout-modal': '#close-checkout-modal-btn',
      'ticket-modal': '#tkt-accept-btn',
      'reprint-modal': '#close-reprint-modal-btn',
      'devolucion-modal': '#close-devolucion-modal-btn',
      'report-viewer-modal': '#report-viewer-back-btn'
    };

    const closeSelector = modalCloseButtons[modalId];
    if (closeSelector) {
      const closeBtn = document.querySelector(closeSelector);
      if (closeBtn) {
        e.preventDefault();
        closeBtn.click();
      }
    }
  }
});

/* ==========================================================================
   MODULE-SCOPE GLOBALS — Persist across login sessions (same page load)
   These will be replaced by DB calls in a future version.
   ========================================================================== */
const defaultTasaHistory = [
  { date: '10/7/2026', time: '08:15', dia: 36.30, vuelto: null,  usuario: 'ANDREA LAGUNA' },
  { date: '10/7/2026', time: '14:00', dia: 36.45, vuelto: 35.00, usuario: 'ANDERSON LAGUNA' },
  { date: '11/7/2026', time: '08:05', dia: 36.45, vuelto: null,  usuario: 'ALEJANDRA OLIVAR' },
  { date: '11/7/2026', time: '16:22', dia: 36.50, vuelto: 36.00, usuario: 'ANDERSON LAGUNA' },
  { date: '05/7/2026', time: '08:10', dia: 36.45, vuelto: null,  usuario: 'ANDREA LAGUNA' }
];
let _tasaHistory = JSON.parse(localStorage.getItem('pos_tasa_history')) || defaultTasaHistory;
let _tasaDia = _tasaHistory[_tasaHistory.length - 1].dia;
let _tasaVuelto = _tasaHistory[_tasaHistory.length - 1].vuelto;
let _exchangeRate = _tasaDia;

document.addEventListener('DOMContentLoaded', () => {
  logDebug('Cargando DOM y variables...');
  
  // Business details initialization and helper function
  function applyBusinessDetails(info) {
    const hName = document.getElementById('header-biz-name');
    const hAddress = document.getElementById('header-biz-address');
    const hContact = document.getElementById('header-biz-contact');
    if (hName) hName.textContent = info.name;
    if (hAddress) hAddress.textContent = info.address;
    if (hContact) hContact.textContent = `Rif: ${info.ruc} | Telf: ${info.phone} | Email: ${info.email}`;
    
    const lTitle = document.getElementById('login-brand-title');
    if (lTitle) lTitle.textContent = info.name;
    
    const tName = document.getElementById('tkt-store-title');
    const tRif = document.getElementById('tkt-store-rif');
    const tDir = document.getElementById('tkt-store-dir');
    const tPhone = document.getElementById('tkt-store-phone');
    if (tName) tName.textContent = info.name;
    if (tRif) tRif.textContent = `RIF: ${info.ruc}`;
    if (tDir) tDir.textContent = info.address.toUpperCase();
    if (tPhone) tPhone.textContent = `TLF: ${info.phone}`;

    const iName = document.getElementById('config-biz-name');
    const iRuc = document.getElementById('config-biz-ruc');
    const iPhone = document.getElementById('config-biz-phone');
    const iEmail = document.getElementById('config-biz-email');
    const iAddress = document.getElementById('config-biz-address');
    if (iName) iName.value = info.name;
    if (iRuc) iRuc.value = info.ruc;
    if (iPhone) iPhone.value = info.phone;
    if (iEmail) iEmail.value = info.email;
    if (iAddress) iAddress.value = info.address;
  }

  const defaultBizInfo = {
    name: 'INVERSIONES NIQUITAO',
    ruc: 'J-41132631',
    phone: '0424-2042877',
    email: 'inversiones.niquitao3000@gmail.com',
    address: '23 de Enero'
  };
  const bizInfo = JSON.parse(localStorage.getItem('pos_biz_info')) || defaultBizInfo;
  applyBusinessDetails(bizInfo);

  // Global State Variables
  let currentUser = { name: '', role: '' };
  let currentSession = { cashUSD: 0.00, cashVES: 0.00, isOpened: false };
  let currentSale = [];
  let isReprinting = false;
  let movimientosLog = [];
  let systemUsers = [
    { u: '001', display: 'Administrador', p: 'admin', role: 'ADMINISTRADOR', phone: '9671314243', email: 'info@winterpos.com', active: true },
    { u: 'ALE', display: 'ALEJANDRA OLIVAR', p: 'ale', role: 'VENDEDOR', phone: '9671314243', email: 'info@winterpos.com', active: true },
    { u: 'ANDERSON', display: 'Anderson Laguna', p: '123', role: 'ADMINISTRADOR', phone: '9671314243', email: 'info@winterpos.com', active: true },
    { u: 'ANDREA', display: 'Andrea Laguna', p: 'andrea', role: 'ADMINISTRADOR', phone: '9671314243', email: 'info@winterpos.com', active: true },
    { u: 'INES', display: 'Ines Laguna', p: 'ines', role: 'VENDEDOR', phone: '9671314243', email: 'info@winterpos.com', active: true },
    { u: 'IVAN', display: 'IVAN LAGUNA', p: 'ivan', role: 'VENDEDOR', phone: '9671314243', email: 'info@winterpos.com', active: true },
    { u: 'MAGA', display: 'Magaly Angel', p: 'maga', role: 'VENDEDOR', phone: '9671314243', email: 'info@winterpos.com', active: true },
    { u: 'ORIANA', display: 'ORIANA', p: 'oriana', role: 'VENDEDOR', phone: '9671314243', email: 'info@winterpos.com', active: true }
  ];
  let systemClients = [
    { name: 'ALBER/ JOSE LUIS', rfc: '', phone: '', limit: 0.00, available: 0.00, pending: 0.00, points: 0.00, pointBalance: 0.00, history: [] },
    { name: 'ALEJANDRA OLIVAR', rfc: '', phone: '', limit: 20.00, available: 20.00, pending: 0.00, points: 42.97, pointBalance: 0.00, history: [] },
    { name: 'ALEXANDRA HIJA DE LA NEGRA', rfc: '', phone: '', limit: 2.00, available: 2.00, pending: 0.00, points: 0.53, pointBalance: 0.00, history: [] },
    { name: 'ALVANI PANADERIA', rfc: '', phone: '', limit: 5.00, available: 5.00, pending: 0.00, points: 3.88, pointBalance: 0.00, history: [] },
    { name: 'ANA RAMONA', rfc: '', phone: '', limit: 5.00, available: 4.00, pending: 1.00, points: 15.88, pointBalance: 0.00, 
      history: [
        { type: 'VENTA', date: '2025-06-18 05:28 PM', user: 'ANDREA', station: 'AndersonLo', doc: 'CREDITO TIKET 0110519', sale: 0.29, pay: 0.00, balance: 1.29 },
        { type: 'ABONO', date: '2025-06-22 05:23 PM', user: 'ANDREA', station: 'AndersonLo', doc: 'PAGO ABONO 0000852', sale: 0.00, pay: 0.29, balance: 1.00 }
      ] 
    },
    { name: 'ANDERSON LAGUNA', rfc: '20824573', phone: '04242042877', limit: 150.00, available: 150.00, pending: 0.00, points: 2902.27, pointBalance: 0.00, history: [] },
    { name: 'ANDRE Y KHAT', rfc: '', phone: '', limit: 20.00, available: 20.00, pending: 0.00, points: 19.25, pointBalance: 0.00, history: [] },
    { name: 'ANDREA LAGUNA', rfc: '', phone: '04242175395', limit: 100.00, available: 90.09, pending: 9.91, points: 2136.77, pointBalance: 0.00, history: [] },
    { name: 'ARELYS OLIVAR', rfc: '', phone: '', limit: 0.00, available: 0.00, pending: 0.00, points: 11.23, pointBalance: 0.00, history: [] },
    { name: 'BEIKER (JULIO) AMIGO DANIEL', rfc: '', phone: '', limit: 5.00, available: 5.00, pending: 0.00, points: 7.25, pointBalance: 0.00, history: [] },
    { name: 'BOMBERO', rfc: '', phone: '', limit: 2.00, available: 2.00, pending: 0.00, points: 2.00, pointBalance: 0.00, history: [] },
    { name: 'BRICEIDA', rfc: '', phone: '', limit: 10.00, available: 10.00, pending: 0.00, points: 204.96, pointBalance: 0.00, history: [] },
    { name: 'CARLOS PROFESOR', rfc: '', phone: '', limit: 5.00, available: 5.00, pending: 0.00, points: 6.84, pointBalance: 0.00, history: [] },
    { name: 'CAROLINA CATIRA', rfc: '', phone: '', limit: 3.00, available: 3.00, pending: 0.00, points: 0.96, pointBalance: 0.00, history: [] },
    { name: 'CASA FAMILIA LAGUNA ANGEL', rfc: '', phone: '', limit: 300.00, available: 265.83, pending: 34.17, points: 2726.20, pointBalance: 0.00, history: [] },
    { name: 'CERVEZA', rfc: '', phone: '', limit: 1.00, available: 0.72, pending: 0.28, points: 5.28, pointBalance: 0.00, history: [] },
    { name: 'DAIMAR', rfc: '', phone: '', limit: 10.00, available: 10.00, pending: 0.00, points: 6.50, pointBalance: 0.00, history: [] },
    { name: 'DANIEL DIAGNEY', rfc: '', phone: '', limit: 2.00, available: 1.20, pending: 0.80, points: 0.80, pointBalance: 0.00, history: [] },
    { name: 'DANIEL FERNANDO', rfc: '', phone: '', limit: 50.00, available: 30.42, pending: 19.58, points: 349.47, pointBalance: 0.00, history: [] },
    { name: 'DANIELITA HIJAS/ESPOSA', rfc: '', phone: '', limit: 15.00, available: 13.47, pending: 1.53, points: 72.01, pointBalance: 0.00, history: [] },
    { name: 'DAVID KATY', rfc: '', phone: '', limit: 5.00, available: 1.90, pending: 3.10, points: 19.62, pointBalance: 0.00, history: [] },
    { name: 'DAVID VECINO', rfc: '', phone: '', limit: 5.00, available: 0.73, pending: 4.27, points: 9.61, pointBalance: 0.00, history: [] },
    { name: 'DIANA MOLINA', rfc: '', phone: '', limit: 20.00, available: 16.20, pending: 3.80, points: 64.66, pointBalance: 0.00, history: [] }
  ];
  let processedSales = [
    {
      ticketNumber: '0625158',
      date: '2026-07-12', // YYYY-MM-DD
      time: '09:15 AM',
      cashier: 'ANDERSON - ANDERSON LAGUNA',
      client: 'PUBLICO GENERAL',
      items: [
        { name: 'ACEITE AMANECER DE SOYA 500ML', qty: 2, priceUSD: 2.50, totalUSD: 5.00 }
      ],
      subtotalUSD: 5.00,
      netUSD: 5.80,
      totalVES: 211.41,
      payCash: 10.00,
      payCashVes: 0,
      payCard: 0,
      payBiopago: 0,
      changeUSD: 4.20,
      usdToGive: 4,
      bsToGive: 7.29
    },
    {
      ticketNumber: '0594382',
      date: '2026-07-11',
      time: '04:30 PM',
      cashier: 'ANDERSON - ANDERSON LAGUNA',
      client: 'CARLOS PÉREZ',
      items: [
        { name: 'ABRAZADERA 16-25MM', qty: 5, priceUSD: 0.04, totalUSD: 0.20 },
        { name: 'ACEITE AMANECER DE SOYA 828ML', qty: 1, priceUSD: 4.00, totalUSD: 4.00 }
      ],
      subtotalUSD: 4.20,
      netUSD: 4.87,
      totalVES: 177.51,
      payCash: 5.00,
      payCashVes: 0,
      payCard: 0,
      payBiopago: 0,
      changeUSD: 0.13,
      usdToGive: 0,
      bsToGive: 4.74
    }
  ];
  // Exchange Rate State — mirrors module-scope globals; local references for this session
  let tasaDia     = _tasaDia;      // tasa del día (Bs/$)
  let tasaVuelto  = _tasaVuelto;   // tasa de vuelto (Bs/$) — null = falls back to tasaDia
  let tasaHistory = _tasaHistory;  // shared history (same array reference)
  let exchangeRate = _exchangeRate;

  // Flag: user is actively editing a sale row (qty / delete); suppress autofocus during
  let isEditingSaleRow = false;

  // DOM Elements - Views
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  const aperturaModal = document.getElementById('apertura-modal');

  // DOM Elements - Login
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = document.getElementById('btn-text');
  const btnSpinner = document.getElementById('btn-spinner');
  const errorBox = document.getElementById('error-box');
  const errorText = document.getElementById('error-text');
  const closeBtn = document.getElementById('close-btn');

  // DOM Elements - Dashboard Header & Footer
  const userDisplayName = document.getElementById('user-display-name');
  const userDisplayRole = document.getElementById('user-display-role');
  const headerRateDisplay = document.getElementById('header-rate-display');
  const footerTimeDisplay = document.getElementById('footer-time-display');
  const logoutBtn = document.getElementById('logout-btn');

  // DOM Elements - Apertura Modal
  const aperturaForm = document.getElementById('apertura-form');
  const aperturaCajero = document.getElementById('apertura-cajero');
  const aperturaMontoUsd = document.getElementById('apertura-monto-usd');
  const aperturaMontoVes = document.getElementById('apertura-monto-ves');
  const aperturaErrorBox = document.getElementById('apertura-error-box');
  const aperturaCancelArrow = document.getElementById('apertura-cancel-arrow');

  // DOM Elements - POS Main Caja
  const posProductInput = document.getElementById('pos-product-input');
  const posClientInput = document.getElementById('pos-client-input');
  const posSellerInput = document.getElementById('pos-seller-input');
  const searchProductBtn = document.getElementById('search-product-btn');
  const salesTableBody = document.getElementById('sales-table-body');
  const emptyTableMessage = document.getElementById('empty-table-message');
  
  // DOM Elements - POS Action buttons
  const deleteRowBtn = document.getElementById('delete-row-btn');
  const editQtyBtn = document.getElementById('edit-qty-btn');
  const cancelSaleBtn = document.getElementById('cancel-sale-btn');
  const holdTicketBtn = document.getElementById('hold-ticket-btn');
  const closeRegisterBtn = document.getElementById('close-register-btn');
  const checkoutPayBtn = document.getElementById('checkout-pay-btn');

  // DOM Elements - Financial totals
  const ticketNumberId = document.getElementById('ticket-number-id');
  const subtotalAmount = document.getElementById('subtotal-amount');
  const taxAmount = document.getElementById('tax-amount');
  const totalBsAmount = document.getElementById('total-bs-amount');
  const totalUsdAmount = document.getElementById('total-usd-amount');
  const recordsCount = document.getElementById('records-count');

  // SVG Elements for Password Toggle
  const eyeOpenSvg = `
    <svg id="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
  const eyeClosedSvg = `
    <svg id="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>
  `;

  // Catalog of mock products for demo interactions
  const mockCatalog = [
    { code: '001', name: 'Harina PAN Blanca 1kg', unit: 'UNID', priceUSD: 1.10 },
    { code: '002', name: 'Leche Completa Campestre 1L', unit: 'LITR', priceUSD: 2.45 },
    { code: '003', name: 'Aceite de Girasol Vatel 1L', unit: 'LITR', priceUSD: 3.20 },
    { code: '004', name: 'Arroz Primor Clásico 1kg', unit: 'UNID', priceUSD: 1.15 },
    { code: '005', name: 'Café Fama de América 500g', unit: 'UNID', priceUSD: 4.50 },
    { code: '006', name: 'Azúcar Montalbán 1kg', unit: 'UNID', priceUSD: 1.30 },
    { code: '007', name: 'Pasta Primor Dedalitos 1kg', unit: 'UNID', priceUSD: 1.65 },
    { code: '008', name: 'Refresco Coca-Cola 2L', unit: 'UNID', priceUSD: 2.10 }
  ];

  // Selected row tracker
  let selectedRowIndex = null;

  // Inventory DOM Elements
  const invSearchInput = document.getElementById('inv-search-input');
  const invSearchBtn = document.getElementById('inv-search-btn');
  const invStatPrice1 = document.getElementById('inv-stat-price1');
  const invStatCost = document.getElementById('inv-stat-cost');
  const invStatTotal = document.getElementById('inv-stat-total');
  const inventoryTableBody = document.getElementById('inventory-table-body');
  const invAddBtn = document.getElementById('inv-add-btn');
  const invEditBtn = document.getElementById('inv-edit-btn');
  const invDeleteBtn = document.getElementById('inv-delete-btn');
  const invDetailBtn = document.getElementById('inv-detail-btn');
  const inventorySubTabs = document.querySelectorAll('.sub-tab-item');

  // Selected row tracker for Inventory
  let selectedInvRowIndex = null;

  // Active Catalog of products for Inventory Module
  let inventoryCatalog = [
    { code: 'BABY', name: 'HELADO BABY PALETA', category: 'HELADO', dept: 'NEVERA', location: 'ALMACEN 1', unit: 'UND', stock: 0, cost: 0.14, price1: 0.24, price2: 0.00 },
    { code: 'CITRICAS', name: 'PALETA CITRICO GUAO', category: 'HELADO', dept: 'NEVERA', location: 'ALMACEN 1', unit: 'UND', stock: 0, cost: 0.26, price1: 0.36, price2: 0.00 },
    { code: '6900240320576', name: 'ABRAZADERA 16-25MM', category: 'FERRETERIA', dept: 'LADO A', location: 'ALMACEN 1', unit: 'UND', stock: 8, cost: 0.02, price1: 0.04, price2: 0.00 },
    { code: 'ACEITE AMA', name: 'ACEITE AMANECER DE SOYA 500ML', category: 'ALIMENTOS', dept: 'LADO A', location: 'ALMACEN 1', unit: 'UND', stock: 35, cost: 2.00, price1: 2.50, price2: 0.00 },
    { code: '7599450000287', name: 'ACEITE AMANECER DE SOYA 828ML', category: 'ALIMENTOS', dept: 'LADO A', location: 'ALMACEN 1', unit: 'UND', stock: 3, cost: 3.22, price1: 4.00, price2: 0.00 }
  ];

  /* ==========================================================================
     1. LOGIN PROCESS & UI HANDLERS
     ========================================================================== */

  // Toggle Password Visibility
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    togglePasswordBtn.innerHTML = isPassword ? eyeClosedSvg : eyeOpenSvg;
    passwordInput.focus();
  });

  // Hide login errors on input focus
  const clearLoginErrors = () => {
    if (errorBox.style.display === 'flex') {
      errorBox.style.display = 'none';
      usernameInput.style.borderColor = 'transparent';
      passwordInput.style.borderColor = 'transparent';
    }
  };
  usernameInput.addEventListener('input', clearLoginErrors);
  passwordInput.addEventListener('input', clearLoginErrors);

  // Login Submit Handler
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearLoginErrors();

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      showLoginError('Por favor complete todos los campos');
      return;
    }

    setLoginLoading(true);

    // Simulate database lookup delay
    setTimeout(() => {
      // Original accounts
      const accounts = [
        { u: 'admin', p: 'admin', display: 'ANDERSON - Anderson Laguna', role: 'ADMINISTRADOR' },
        { u: 'niquitao', p: '123', display: 'OPERADOR - Inversiones Niquitao', role: 'OPERADOR DE CAJA' },
        { u: 'anderson', p: '123', display: 'ANDERSON - Anderson Laguna', role: 'ADMINISTRADOR' }
      ];

      let userMatch = accounts.find(
        acc => acc.u === username.toLowerCase() && acc.p === password
      );

      if (!userMatch) {
        const sysUser = systemUsers.find(
          acc => acc.u.toLowerCase() === username.toLowerCase() && acc.p === password
        );
        if (sysUser) {
          if (!sysUser.active) {
            setLoginLoading(false);
            showLoginError('El usuario se encuentra inactivo');
            return;
          }
          userMatch = {
            u: sysUser.u,
            p: sysUser.p,
            display: `${sysUser.u.toUpperCase()} - ${sysUser.display}`,
            role: sysUser.role
          };
        }
      }

      if (userMatch) {
        currentUser.name = userMatch.display;
        currentUser.role = userMatch.role;

        // Transition views
        btnText.textContent = '¡Acceso Concedido!';
        btnSpinner.style.display = 'none';
        submitBtn.style.backgroundColor = '#2eb872';
        submitBtn.style.boxShadow = '0 0 15px rgba(46, 184, 114, 0.4)';

        setTimeout(() => {
          // Initialize views
          loginView.style.display = 'none';
          dashboardView.style.display = 'flex';
          
          // Pre-fill user displays in POS dashboard
          userDisplayName.textContent = currentUser.name;
          userDisplayRole.textContent = currentUser.role;
          posSellerInput.value = currentUser.name.split(' - ')[1] || currentUser.name;

          // Open cash drawer opening modal
          showAperturaModal();
        }, 800);

      } else {
        setLoginLoading(false);
        showLoginError('Usuario o contraseña incorrectos');
        passwordInput.value = '';
        passwordInput.focus();
      }
    }, 1200);
  });

  // Helper: Display error banner
  function showLoginError(msg) {
    errorText.textContent = msg;
    errorBox.style.display = 'flex';
    usernameInput.style.borderColor = '#ff4d4f';
    passwordInput.style.borderColor = '#ff4d4f';

    errorBox.style.animation = 'none';
    errorBox.offsetHeight;
    errorBox.style.animation = 'shake 0.4s ease-in-out';
  }

  // Helper: Toggle spinner state
  function setLoginLoading(isLoading) {
    if (isLoading) {
      submitBtn.disabled = true;
      usernameInput.disabled = true;
      passwordInput.disabled = true;
      btnText.textContent = 'Validando credenciales...';
      btnSpinner.style.display = 'block';
      submitBtn.style.opacity = '0.85';
    } else {
      submitBtn.disabled = false;
      usernameInput.disabled = false;
      passwordInput.disabled = false;
      btnText.textContent = 'Iniciar sesión';
      btnSpinner.style.display = 'none';
      submitBtn.style.opacity = '1';
      submitBtn.style.backgroundColor = '';
      submitBtn.style.boxShadow = '';
    }
  }

  // Close main app dialog
  closeBtn.addEventListener('click', () => {
    if (confirm('¿Está seguro de que desea salir del Módulo Punto de Venta?')) {
      alert('Aplicación cerrada (simulación).');
    }
  });

  /* ==========================================================================
     2. "APERTURA DE CAJA" REGISTRY OPENING MODAL
     ========================================================================== */

  function showAperturaModal() {
    aperturaModal.style.display = 'flex';
    aperturaCajero.value = currentUser.name;
    aperturaMontoUsd.value = '';
    aperturaMontoVes.value = '';
    aperturaErrorBox.style.display = 'none';
    aperturaMontoUsd.focus();
  }

  // Cancel register opening returns to Login view
  aperturaCancelArrow.addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('Debe abrir la caja para poder utilizar el panel de ventas. ¿Desea regresar a la pantalla de login?')) {
      aperturaModal.style.display = 'none';
      dashboardView.style.display = 'none';
      loginView.style.display = 'grid';
      setLoginLoading(false);
      usernameInput.value = '';
      passwordInput.value = '';
      usernameInput.focus();
    }
  });

  // Handle Apertura Submit
  aperturaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    aperturaErrorBox.style.display = 'none';

    const usdVal = parseFloat(aperturaMontoUsd.value);
    const vesVal = parseFloat(aperturaMontoVes.value);

    // Validate that inputs are valid positive numbers.
    // One or both can be filled, but at least one must be defined.
    if (isNaN(usdVal) && isNaN(vesVal)) {
      showAperturaError('Debe ingresar un monto inicial en al menos una denominación ($ o Bs)');
      return;
    }
    if (usdVal < 0 || vesVal < 0) {
      showAperturaError('Los montos iniciales no pueden ser negativos');
      return;
    }

    // Save starting amounts
    currentSession.cashUSD = isNaN(usdVal) ? 0.00 : usdVal;
    currentSession.cashVES = isNaN(vesVal) ? 0.00 : vesVal;
    currentSession.isOpened = true;

    // Close Modal and notify
    aperturaModal.style.display = 'none';
    
    // Set exchange rate text in footer
    headerRateDisplay.textContent = `Tasa Oficial: 1.00 USD = ${exchangeRate.toFixed(2)} Bs`;
    
    // Initialize a new empty sale
    resetSale();
    
    // Initialize inventory table list
    renderInventoryTable();
    
    alert(`Caja Abierta Exitosamente.\nMonto Inicial: $${currentSession.cashUSD.toFixed(2)} USD | Bs ${currentSession.cashVES.toFixed(2)} VES.\nOperador: ${currentUser.name}`);
    
    // Check if exchange rate is older than 5 days and suggest update
    checkTasaAge();
  });

  function checkTasaAge() {
    if (tasaHistory.length === 0) return;
    const lastEntry = tasaHistory[tasaHistory.length - 1];
    if (!lastEntry) return;

    // Parse date from "D/M/YYYY" or "DD/MM/YYYY" format
    const parts = lastEntry.date.split('/');
    if (parts.length !== 3) return;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const year = parseInt(parts[2], 10);

    const lastDate = new Date(year, month, day);
    const currentDate = new Date();

    // Reset hours to compare purely day difference
    lastDate.setHours(0, 0, 0, 0);
    currentDate.setHours(0, 0, 0, 0);

    const diffTime = currentDate.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 5) {
      setTimeout(() => {
        alert(`⚠️ Sugerencia: La última tasa registrada fue hace ${diffDays} días (${lastEntry.date}). Se recomienda actualizar la tasa de cambio en el módulo F9 Tasa.`);
      }, 800);
    }
  }

  function showAperturaError(msg) {
    aperturaErrorBox.textContent = msg;
    aperturaErrorBox.style.display = 'block';
    aperturaErrorBox.style.animation = 'none';
    aperturaErrorBox.offsetHeight;
    aperturaErrorBox.style.animation = 'shake 0.4s ease-in-out';
  }

  /* ==========================================================================
     3. DASHBOARD TABS SWITCHING
     ========================================================================== */

  const tabItems = document.querySelectorAll('.tab-item');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabItems.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  /* ==========================================================================
     4. POS MAIN SALES MODULE (F1 CAJA)
     ========================================================================== */

  // Auto-add product when selected from suggestion list (exact code match)
  posProductInput.addEventListener('input', () => {
    const val = posProductInput.value.trim().toUpperCase();
    const matched = inventoryCatalog.find(item => item.code.toUpperCase() === val);
    if (matched) {
      addItemToCart(matched);
      posProductInput.value = '';
      posProductInput.focus();
    }
  });

  // Event: Keypress Enter on Product Input
  posProductInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addProductByQuery();
    }
  });

  // Event: Click Search Product Button (Magnifying Glass) opens lookup modal
  searchProductBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openSearchProductModal();
  });

  // Add Item to table based on search input from inventoryCatalog
  function addProductByQuery() {
    const inputVal = posProductInput.value.trim().toLowerCase();
    if (!inputVal) return;

    // Search in inventoryCatalog
    let productFound = inventoryCatalog.find(item => 
      item.code.toLowerCase() === inputVal || 
      item.name.toLowerCase().includes(inputVal)
    );

    if (!productFound) {
      // Look for prefix match of code or name
      productFound = inventoryCatalog.find(item => 
        item.code.toLowerCase().startsWith(inputVal) || 
        item.name.toLowerCase().startsWith(inputVal)
      );
    }

    if (productFound) {
      addItemToCart(productFound);
      posProductInput.value = '';
      posProductInput.focus();
    } else {
      alert(`El producto "${posProductInput.value}" no se encuentra en el inventario.`);
      posProductInput.value = '';
      posProductInput.focus();
    }
  }

  // Core Cart Item adding logic using inventory product details
  function addItemToCart(product) {
    if (product.stock <= 0) {
      alert("No hay disponibilidad del producto seleccionado.");
      return false;
    }

    // Check if product already exists in current sale
    const existingItem = currentSale.find(item => item.code === product.code);

    if (existingItem) {
      if (existingItem.qty >= product.stock) {
        alert(`No hay más stock disponible para este producto. (Stock disponible: ${product.stock})`);
        return false;
      }
      existingItem.qty += 1;
      existingItem.totalUSD = existingItem.qty * existingItem.priceUSD;
    } else {
      currentSale.push({
        code: product.code,
        name: product.name,
        unit: product.unit,
        qty: 1,
        priceUSD: product.price1, // price1 is the selling price in USD
        totalUSD: product.price1
      });
    }

    renderSaleTable();
    return true;
  }

  // Draw table and update numbers
  function renderSaleTable(keepSelection = false) {
    salesTableBody.innerHTML = '';
    if (!keepSelection) {
      selectedRowIndex = null;
    }
    updateRowActionStates();

    if (currentSale.length === 0) {
      salesTableBody.appendChild(emptyTableMessage);
      cancelSaleBtn.disabled = true;
      holdTicketBtn.disabled = true;
      checkoutPayBtn.disabled = true;
      
      subtotalAmount.textContent = '0.00';
      taxAmount.textContent = '0.00';
      totalBsAmount.textContent = '0.00';
      totalUsdAmount.textContent = '0.00';
      recordsCount.textContent = '0';
      return;
    }

    // Hide empty placeholder message
    if (emptyTableMessage.parentNode) {
      emptyTableMessage.parentNode.removeChild(emptyTableMessage);
    }

    let subtotalUSD = 0.00;

    currentSale.forEach((item, index) => {
      const priceBs = item.priceUSD * exchangeRate;
      const totalBs = item.totalUSD * exchangeRate;
      subtotalUSD += item.totalUSD;

      const tr = document.createElement('tr');
      tr.setAttribute('data-index', index);
      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: 600;">${item.code}</td>
        <td>${item.name}</td>
        <td style="text-align: center;">${item.unit}</td>
        <td style="text-align: center; font-weight: 600;">${item.qty}</td>
        <td style="text-align: right;">
          $ ${item.priceUSD.toFixed(2)}
          <span class="price-bs">Bs ${priceBs.toFixed(2)}</span>
        </td>
        <td style="text-align: right; font-weight: 700; color: #0b5fa5;">
          $ ${item.totalUSD.toFixed(2)}
          <span class="price-bs">Bs ${totalBs.toFixed(2)}</span>
        </td>
      `;

      // Row Selection Event
      tr.addEventListener('click', () => {
        const trs = salesTableBody.querySelectorAll('tr');
        trs.forEach(r => r.classList.remove('selected-row'));
        
        if (selectedRowIndex === index) {
          // Deselect
          selectedRowIndex = null;
        } else {
          // Select
          tr.classList.add('selected-row');
          selectedRowIndex = index;
        }
        updateRowActionStates();
      });

      if (keepSelection && selectedRowIndex === index) {
        tr.classList.add('selected-row');
      }

      salesTableBody.appendChild(tr);
    });

    // Calculations
    const subtotalVES = subtotalUSD * exchangeRate;
    const taxVES = subtotalVES * 0.16; // 16% IVA
    const totalVES = subtotalVES + taxVES;
    const totalUSD = subtotalUSD * 1.16;

    // Render totals
    subtotalAmount.textContent = `Bs ${subtotalVES.toFixed(2)}`;
    taxAmount.textContent = `Bs ${taxVES.toFixed(2)}`;
    totalBsAmount.textContent = `Bs ${totalVES.toFixed(2)}`;
    totalUsdAmount.textContent = `$ ${totalUSD.toFixed(2)}`;
    recordsCount.textContent = currentSale.length;

    // Enable main action buttons
    cancelSaleBtn.disabled = false;
    holdTicketBtn.disabled = false;
    checkoutPayBtn.disabled = false;
  }

  // Manage disabled states for selected-row based buttons
  function updateRowActionStates() {
    if (selectedRowIndex === null) {
      deleteRowBtn.disabled = true;
      editQtyBtn.disabled = true;
    } else {
      deleteRowBtn.disabled = false;
      editQtyBtn.disabled = false;
    }
  }

  // Delete Row Click Handler
  deleteRowBtn.addEventListener('click', () => {
    if (selectedRowIndex === null) return;
    isEditingSaleRow = true;
    currentSale.splice(selectedRowIndex, 1);
    renderSaleTable();
    setTimeout(() => { isEditingSaleRow = false; }, 300);
  });

  // Edit Quantity Click Handler
  editQtyBtn.addEventListener('click', () => {
    if (selectedRowIndex === null) return;
    isEditingSaleRow = true;
    const item = currentSale[selectedRowIndex];
    const newQtyStr = prompt(`Cambiar cantidad para "${item.name}":`, item.qty);
    isEditingSaleRow = false;
    if (newQtyStr === null) return; // cancelled

    const newQty = parseInt(newQtyStr);
    if (isNaN(newQty) || newQty <= 0) {
      alert('Por favor ingrese una cantidad numérica mayor a cero.');
      return;
    }

    const product = inventoryCatalog.find(p => p.code === item.code);
    if (product && newQty > product.stock) {
      alert(`No hay suficiente stock disponible para este producto. (Stock disponible: ${product.stock})`);
      return;
    }

    item.qty = newQty;
    item.totalUSD = item.qty * item.priceUSD;
    renderSaleTable(true); // Keep selection
  });

  // Cancel Sale Click Handler
  cancelSaleBtn.addEventListener('click', () => {
    if (confirm('¿Está seguro de que desea cancelar la venta actual? Se vaciará la lista de productos.')) {
      resetSale();
    }
  });

  // Reset Sale Helper
  function resetSale() {
    currentSale = [];
    renderSaleTable();
    // Generate new random ticket number for the next sale
    const randomTicket = Math.floor(100000 + Math.random() * 900000);
    ticketNumberId.textContent = `0${randomTicket}`;
    if (posClientInput) {
      posClientInput.value = "Publico General";
    }
    setTimeout(() => {
      if (posProductInput) posProductInput.focus();
    }, 50);
  }

  // DOM Elements - Checkout Modal
  const checkoutModal = document.getElementById('checkout-modal');
  const closeCheckoutModalBtn = document.getElementById('close-checkout-modal-btn');
  const chkTotalOp = document.getElementById('chk-total-op');
  const chkDiscount = document.getElementById('chk-discount');
  const chkTotalNet = document.getElementById('chk-total-net');
  const chkPayCash = document.getElementById('chk-pay-cash');
  const chkPayCashVes = document.getElementById('chk-pay-cash-ves');
  const chkPayCard = document.getElementById('chk-pay-card');
  const chkPayBiopago = document.getElementById('chk-pay-biopago');
  
  const chkDisplayTotalUsd = document.getElementById('chk-display-total-usd');
  const chkDisplayTotalVes = document.getElementById('chk-display-total-ves');
  const chkDisplayFraction = document.getElementById('chk-display-fraction');
  const chkChangeUsd = document.getElementById('chk-change-usd');
  const chkChangeVes = document.getElementById('chk-change-ves');
  const chkChangeStatus = document.getElementById('chk-change-status');
  
  const chkBtnTicket = document.getElementById('chk-btn-ticket');
  const chkBtnA4 = document.getElementById('chk-btn-a4');
  const chkBtnNoprint = document.getElementById('chk-btn-noprint');

  let currentSubtotalUSD = 0.00;

  // Open Checkout Modal
  checkoutPayBtn.addEventListener('click', () => {
    if (currentSale.length === 0) return;

    // Calculate subtotal
    currentSubtotalUSD = currentSale.reduce((acc, item) => acc + item.totalUSD, 0);
    const netUSD = currentSubtotalUSD * 1.16;

    // Set defaults
    chkTotalOp.value = currentSubtotalUSD.toFixed(2);
    chkDiscount.value = 0;
    chkTotalNet.value = netUSD.toFixed(2);
    
    // Clear all payment fields — user decides how client will pay
    chkPayCash.value = '';
    chkPayCashVes.value = '';
    chkPayCard.value = '';      // starts empty; tab into it to auto-fill remainder
    chkPayBiopago.value = '';

    checkoutModal.style.display = 'flex';
    recalculateCheckoutValues();
  });

  // Close Checkout Modal
  closeCheckoutModalBtn.addEventListener('click', () => {
    checkoutModal.style.display = 'none';
  });

  // Listeners for changes in payments or discount
  [chkDiscount, chkPayCash, chkPayCashVes, chkPayCard, chkPayBiopago].forEach(input => {
    input.addEventListener('input', recalculateCheckoutValues);
  });

  // When user tabs into Tarjeta field, auto-fill with the remaining unpaid balance
  chkPayCard.addEventListener('focus', () => {
    // Only auto-fill if field is currently empty
    if (chkPayCard.value !== '') return;
    const discountVal = parseFloat(chkDiscount.value) || 0;
    const discAmount = currentSubtotalUSD * (discountVal / 100);
    const netUSD = (currentSubtotalUSD - discAmount) * 1.16;
    const alreadyPaid = (parseFloat(chkPayCash.value) || 0)
      + ((parseFloat(chkPayCashVes.value) || 0) / (exchangeRate || 36.45))
      + ((parseFloat(chkPayBiopago.value) || 0) / (exchangeRate || 36.45));
    const remaining = netUSD - alreadyPaid;
    if (remaining > 0.001) {
      chkPayCard.value = remaining.toFixed(2);
      recalculateCheckoutValues();
    }
  });

  // When user clears the Tarjeta field and leaves it, recalculate
  chkPayCard.addEventListener('blur', () => {
    if (chkPayCard.value === '' || parseFloat(chkPayCard.value) === 0) {
      chkPayCard.value = '';
      recalculateCheckoutValues();
    }
  });

  // Suggested vuelto DOM elements
  const chkVueltoUsd = document.getElementById('chk-vuelto-usd');
  const chkVueltoBs = document.getElementById('chk-vuelto-bs');
  const vueltoDistribucionContainer = document.getElementById('vuelto-distribucion-container');

  // Specific listener for manual changes in the dollar change field
  chkVueltoUsd.addEventListener('input', () => {
    const discountVal = parseFloat(chkDiscount.value) || 0;
    const discAmount = currentSubtotalUSD * (discountVal / 100);
    const netUSD = (currentSubtotalUSD - discAmount) * 1.16;

    const payCash = parseFloat(chkPayCash.value) || 0;
    const payCashVes = parseFloat(chkPayCashVes.value) || 0;
    const payCard = parseFloat(chkPayCard.value) || 0;
    const payBiopago = parseFloat(chkPayBiopago.value) || 0;
    
    const totalPaid = payCash + payCard + (payCashVes / exchangeRate) + (payBiopago / exchangeRate);
    const diff = totalPaid - netUSD;

    if (diff > 0.005) {
      const defaultUsdChange = Math.floor(diff);
      let usdToGive = parseInt(chkVueltoUsd.value);
      if (isNaN(usdToGive) || usdToGive < 0) {
        usdToGive = 0;
      } else if (usdToGive > defaultUsdChange) {
        usdToGive = defaultUsdChange;
        chkVueltoUsd.value = usdToGive;
      }
      const diffBs = (diff - usdToGive) * exchangeRate;
      chkVueltoBs.textContent = `Bs ${diffBs.toFixed(2)}`;
    }
  });

  // Calculate cents helper text
  function getCentsFractionText(amount) {
    const dec = Math.round((amount % 1) * 100);
    const padded = String(dec).padStart(2, '0');
    return `CON ${padded}/100 DOLARES`;
  }

  // Live validation math
  function recalculateCheckoutValues() {
    const discountVal = parseFloat(chkDiscount.value) || 0;
    const discAmount = currentSubtotalUSD * (discountVal / 100);
    const netUSD = (currentSubtotalUSD - discAmount) * 1.16;

    // Update net field and card displays
    chkTotalNet.value = netUSD.toFixed(2);
    chkDisplayTotalUsd.textContent = `$ ${netUSD.toFixed(2)}`;
    chkDisplayTotalVes.textContent = `Bs ${(netUSD * exchangeRate).toFixed(2)}`;
    chkDisplayFraction.textContent = getCentsFractionText(netUSD);

    // Sum paid values (Cash USD and Card are in USD, Cash VES and Biopago are in VES)
    const payCash = parseFloat(chkPayCash.value) || 0;
    const payCashVes = parseFloat(chkPayCashVes.value) || 0;
    const payCard = parseFloat(chkPayCard.value) || 0;
    const payBiopago = parseFloat(chkPayBiopago.value) || 0;
    
    const totalPaid = payCash + payCard + (payCashVes / exchangeRate) + (payBiopago / exchangeRate);
    const diff = totalPaid - netUSD;

    if (diff < -0.005) { // accounts for floating precision
      // Insufficient payment
      chkChangeUsd.textContent = `$ 0.00`;
      chkChangeVes.textContent = `Bs 0.00`;
      
      chkChangeStatus.textContent = `FALTAN $ ${Math.abs(diff).toFixed(2)} USD`;
      chkChangeStatus.style.color = '#ff4d4f';

      if (vueltoDistribucionContainer) {
        vueltoDistribucionContainer.style.display = 'none';
      }

      // Disable buttons
      chkBtnTicket.disabled = true;
      chkBtnA4.disabled = true;
      chkBtnNoprint.disabled = true;
    } else {
      // Sufficient payment -> Show change/vuelto in both currencies!
      chkChangeUsd.textContent = `$ ${diff.toFixed(2)}`;
      chkChangeVes.textContent = `Bs ${(diff * exchangeRate).toFixed(2)}`;
      
      chkChangeStatus.textContent = diff > 0.005 ? 'VUELTO EN CAMBIO' : 'PAGO COMPLETADO';
      chkChangeStatus.style.color = '#2eb872';

      if (vueltoDistribucionContainer) {
        if (diff > 0.005) {
          vueltoDistribucionContainer.style.display = 'block';
          
          // Set suggested dollar change (maximum integer dollars we can give)
          const defaultUsdChange = Math.floor(diff);
          
          // Only update input if it is not currently focused by user
          if (document.activeElement !== chkVueltoUsd) {
            chkVueltoUsd.value = defaultUsdChange;
            chkVueltoUsd.max = defaultUsdChange;
          }
          
          // Calculate remaining Bs difference based on the current input value
          const usdToGive = Math.min(defaultUsdChange, Math.max(0, parseInt(chkVueltoUsd.value) || 0));
          const diffBs = (diff - usdToGive) * exchangeRate;
          chkVueltoBs.textContent = `Bs ${diffBs.toFixed(2)}`;
        } else {
          vueltoDistribucionContainer.style.display = 'none';
        }
      }

      // Enable buttons
      chkBtnTicket.disabled = false;
      chkBtnA4.disabled = false;
      chkBtnNoprint.disabled = false;
    }
  }

  // Finalize sale actions
  [chkBtnTicket, chkBtnA4, chkBtnNoprint].forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      
      const discountVal = parseFloat(chkDiscount.value) || 0;
      const discAmount = currentSubtotalUSD * (discountVal / 100);
      const netUSD = (currentSubtotalUSD - discAmount) * 1.16;
      
      const payCash = parseFloat(chkPayCash.value) || 0;
      const payCashVes = parseFloat(chkPayCashVes.value) || 0;
      const payCard = parseFloat(chkPayCard.value) || 0;
      const payBiopago = parseFloat(chkPayBiopago.value) || 0;
      
      const totalPaid = payCash + payCard + (payCashVes / exchangeRate) + (payBiopago / exchangeRate);
      const changeUSD = totalPaid - netUSD;

      const usdToGive = changeUSD > 0.005 ? (parseInt(chkVueltoUsd.value) || 0) : 0;
      const bsToGive = changeUSD > 0.005 ? Math.max(0, (changeUSD - usdToGive) * exchangeRate) : 0;

      // Save completed transaction to history database
      saveSaleToHistory(netUSD, totalPaid, changeUSD, usdToGive, bsToGive, payCash, payCashVes, payCard, payBiopago);

      if (btn.id === 'chk-btn-ticket') {
        // Render Ticket
        renderTicketDetails(netUSD, totalPaid, changeUSD, usdToGive, bsToGive, payCash, payCashVes, payCard, payBiopago);
        // Show ticket modal and hide checkout modal
        checkoutModal.style.display = 'none';
        document.getElementById('ticket-modal').style.display = 'flex';
      } else {
        alert(
          `TRANSACCIÓN EXITOSA:\n\n` +
          `Monto Neto a Pagar: $ ${netUSD.toFixed(2)} USD | Bs ${(netUSD * exchangeRate).toFixed(2)} Bs\n` +
          `Total Cancelado: $ ${totalPaid.toFixed(2)} USD\n` +
          (changeUSD > 0.005 ? `Vuelto Entregado: $ ${usdToGive} USD + Bs ${bsToGive.toFixed(2)} Bs\n\n` : `Vuelto Entregado: $ 0.00 USD\n\n`) +
          `Factura Fiscal emitida. Impresión completada.`
        );

        checkoutModal.style.display = 'none';
        resetSale();
      }
    });
  });

  // Render ticket elements
  function renderTicketDetails(netUSD, totalPaid, changeUSD, usdToGive, bsToGive, payCash, payCashVes, payCard, payBiopago) {
    const tktNumber = document.getElementById('tkt-number');
    const tktDate = document.getElementById('tkt-date');
    const tktTime = document.getElementById('tkt-time');
    const tktCashier = document.getElementById('tkt-cashier');
    const tktClient = document.getElementById('tkt-client');
    const tktItemsBody = document.getElementById('ticket-items-body');
    const tktSubtotal = document.getElementById('tkt-subtotal');
    const tktIva = document.getElementById('tkt-iva');
    const tktTotalUsd = document.getElementById('tkt-total-usd');
    const tktTotalBs = document.getElementById('tkt-total-bs');
    const tktPaymentsBody = document.getElementById('tkt-payments-body');

    // Random ticket number and current date/time
    tktNumber.textContent = ticketNumberId.textContent;
    
    const now = new Date();
    tktDate.textContent = now.toLocaleDateString();
    tktTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    tktCashier.textContent = currentUser.name.toUpperCase();
    tktClient.textContent = posClientInput.value.toUpperCase();

    // Render items list
    tktItemsBody.innerHTML = '';
    currentSale.forEach(item => {
      const itemRow = document.createElement('div');
      itemRow.className = 'ticket-item-row';

      const priceBs = item.priceUSD * exchangeRate;
      const totalBs = item.totalUSD * exchangeRate;

      itemRow.innerHTML = `
        <div class="ticket-item-main">
          <span class="col-item ticket-item-desc">${item.name}</span>
          <span class="col-qty">${item.qty}</span>
          <span class="col-price">$ ${item.priceUSD.toFixed(2)}</span>
          <span class="col-total">$ ${item.totalUSD.toFixed(2)}</span>
        </div>
        <div class="ticket-item-sub">
          Bs ${priceBs.toFixed(2)} x ${item.qty} = Bs ${totalBs.toFixed(2)}
        </div>
      `;
      tktItemsBody.appendChild(itemRow);
    });

    // Totals calculations
    const subtotalVES = currentSubtotalUSD * exchangeRate;
    const taxVES = subtotalVES * 0.16;
    const totalVES = subtotalVES + taxVES;

    tktSubtotal.textContent = `$ ${currentSubtotalUSD.toFixed(2)} (Bs ${subtotalVES.toFixed(2)})`;
    tktIva.textContent = `$ ${(currentSubtotalUSD * 0.16).toFixed(2)} (Bs ${taxVES.toFixed(2)})`;
    tktTotalUsd.textContent = `$ ${netUSD.toFixed(2)}`;
    tktTotalBs.textContent = `Bs ${totalVES.toFixed(2)}`;

    // Payments breakdown
    tktPaymentsBody.innerHTML = '';
    
    const addPaymentRow = (label, usdVal, vesVal) => {
      const row = document.createElement('div');
      row.className = 'ticket-payment-row';
      let text = '';
      if (usdVal > 0 && vesVal > 0) {
        text = `$ ${usdVal.toFixed(2)} / Bs ${vesVal.toFixed(2)}`;
      } else if (usdVal > 0) {
        text = `$ ${usdVal.toFixed(2)}`;
      } else {
        text = `Bs ${vesVal.toFixed(2)}`;
      }
      row.innerHTML = `<span>${label}:</span> <strong>${text}</strong>`;
      tktPaymentsBody.appendChild(row);
    };

    if (payCash > 0) {
      addPaymentRow('EFECTIVO ($)', payCash, 0);
    }
    if (payCashVes > 0) {
      addPaymentRow('EFECTIVO (Bs)', 0, payCashVes);
    }
    if (payCard > 0) {
      addPaymentRow('TARJETA ($)', payCard, 0);
    }
    if (payBiopago > 0) {
      addPaymentRow('BIOPAGO (Bs)', 0, payBiopago);
    }

    // Add dashed line for change
    if (changeUSD > 0.005) {
      const line = document.createElement('div');
      line.className = 'ticket-dashed-line';
      tktPaymentsBody.appendChild(line);

      const changeRow = document.createElement('div');
      changeRow.className = 'ticket-payment-row';
      changeRow.style.fontWeight = 'bold';
      changeRow.innerHTML = `
        <span>CAMBIO ENTREGADO:</span>
        <span>$ ${usdToGive} + Bs ${bsToGive.toFixed(2)}</span>
      `;
      tktPaymentsBody.appendChild(changeRow);
    }
  }

  // Ticket modal elements and events
  const ticketModal = document.getElementById('ticket-modal');
  const tktAcceptBtn = document.getElementById('tkt-accept-btn');

  tktAcceptBtn.addEventListener('click', () => {
    ticketModal.style.display = 'none';
    if (!isReprinting) {
      resetSale();
    } else {
      isReprinting = false;
      // Re-open reprint modal
      reprintModal.style.display = 'flex';
    }
    posProductInput.focus();
  });

  // Save sale details into history database
  function saveSaleToHistory(netUSD, totalPaid, changeUSD, usdToGive, bsToGive, payCash, payCashVes, payCard, payBiopago) {
    const now = new Date();
    const formattedDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    processedSales.push({
      ticketNumber: ticketNumberId.textContent,
      date: formattedDate,
      time: formattedTime,
      cashier: currentUser.name,
      client: posClientInput.value,
      items: currentSale.map(item => ({
        name: item.name,
        qty: item.qty,
        priceUSD: item.priceUSD,
        totalUSD: item.totalUSD
      })),
      subtotalUSD: currentSubtotalUSD,
      netUSD: netUSD,
      totalVES: netUSD * exchangeRate,
      payCash: payCash,
      payCashVes: payCashVes,
      payCard: payCard,
      payBiopago: payBiopago,
      changeUSD: changeUSD,
      usdToGive: usdToGive,
      bsToGive: bsToGive
    });
  }

  // DOM Elements - Reprint Modal
  const reprintBtn = document.getElementById('reprint-btn');
  const reprintModal = document.getElementById('reprint-modal');
  const closeReprintModalBtn = document.getElementById('close-reprint-modal-btn');
  const reprintSearchInput = document.getElementById('reprint-search-input');
  const reprintDateStart = document.getElementById('reprint-date-start');
  const reprintDateEnd = document.getElementById('reprint-date-end');
  const reprintClearFiltersBtn = document.getElementById('reprint-clear-filters-btn');
  const reprintModalTableBody = document.getElementById('reprint-modal-table-body');

  // DOM Elements - Devolución Modal
  const devolucionBtn = document.getElementById('devolucion-btn');
  const devolucionModal = document.getElementById('devolucion-modal');
  const closeDevolucionModalBtn = document.getElementById('close-devolucion-modal-btn');
  const devolucionSearchView = document.getElementById('devolucion-search-view');
  const devolucionItemsView = document.getElementById('devolucion-items-view');
  const devolucionSearchInput = document.getElementById('devolucion-search-input');
  const devolucionClearFiltersBtn = document.getElementById('devolucion-clear-filters-btn');
  const devolucionModalTableBody = document.getElementById('devolucion-modal-table-body');
  const devolucionItemsTableBody = document.getElementById('devolucion-items-table-body');
  
  const devolucionTktId = document.getElementById('devolucion-tkt-id');
  const devolucionClientName = document.getElementById('devolucion-client-name');
  const devolucionBackBtn = document.getElementById('devolucion-back-btn');
  const devolucionSubmitBtn = document.getElementById('devolucion-submit-btn');
  
  let selectedTicketForReturn = null;

  // Open reprint modal
  reprintBtn.addEventListener('click', (e) => {
    e.preventDefault();
    reprintModal.style.display = 'flex';
    // Clear filters
    reprintSearchInput.value = '';
    reprintDateStart.value = '';
    reprintDateEnd.value = '';
    renderReprintTable();
  });

  // Close reprint modal
  closeReprintModalBtn.addEventListener('click', () => {
    reprintModal.style.display = 'none';
  });

  // Clear filters button handler
  reprintClearFiltersBtn.addEventListener('click', () => {
    reprintSearchInput.value = '';
    reprintDateStart.value = '';
    reprintDateEnd.value = '';
    renderReprintTable();
  });

  // Filter triggers
  [reprintSearchInput, reprintDateStart, reprintDateEnd].forEach(input => {
    input.addEventListener('input', renderReprintTable);
  });

  // Render sales tickets table inside reprint modal
  function renderReprintTable() {
    reprintModalTableBody.innerHTML = '';
    
    const query = reprintSearchInput.value.toLowerCase().trim();
    const startDate = reprintDateStart.value;
    const endDate = reprintDateEnd.value;

    // Filter tickets corresponding to this cashier
    const filtered = processedSales.filter(ticket => {
      const userMatch = ticket.cashier.trim().toLowerCase() === currentUser.name.trim().toLowerCase();
      if (!userMatch) return false;

      // Date range validation
      if (startDate && ticket.date < startDate) return false;
      if (endDate && ticket.date > endDate) return false;

      // Search query check (Ticket Number, Client or Product names)
      if (query) {
        const ticketNumMatch = ticket.ticketNumber.includes(query);
        const clientMatch = ticket.client.toLowerCase().includes(query);
        const itemMatch = ticket.items.some(item => item.name.toLowerCase().includes(query));
        
        if (!ticketNumMatch && !clientMatch && !itemMatch) {
          return false;
        }
      }

      return true;
    });

    if (filtered.length === 0) {
      reprintModalTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: #888888; padding: 1.5rem;">No se encontraron tickets en el historial para los filtros ingresados.</td>
        </tr>
      `;
      return;
    }

    // Sort showing newest first
    filtered.sort((a, b) => b.ticketNumber.localeCompare(a.ticketNumber));

    filtered.forEach(ticket => {
      const tr = document.createElement('tr');
      
      const dateParts = ticket.date.split('-');
      const displayDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : ticket.date;

      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: 600;">${ticket.ticketNumber}</td>
        <td>${displayDate}</td>
        <td>${ticket.time}</td>
        <td>${ticket.client.toUpperCase()}</td>
        <td style="text-align: right; font-weight: 600;">$ ${ticket.netUSD.toFixed(2)}</td>
        <td style="text-align: center;">
          <button class="modal-search-action-btn" style="width: auto; height: 26px; padding: 0 0.5rem; background-color: #0b5fa5; color: white; border-radius: 4px; border: none; font-size: 0.75rem; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
            Reimprimir
          </button>
        </td>
      `;

      const printBtn = tr.querySelector('button');
      printBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Backup current active sale items
        const originalSale = [...currentSale];
        const originalSubtotal = currentSubtotalUSD;
        
        // Temporarily load ticket items to let renderTicketDetails calculate and print
        currentSale = ticket.items.map(item => ({
          name: item.name,
          qty: item.qty,
          priceUSD: item.priceUSD,
          totalUSD: item.totalUSD
        }));
        currentSubtotalUSD = ticket.subtotalUSD;

        const originalTktId = ticketNumberId.textContent;
        ticketNumberId.textContent = ticket.ticketNumber;

        // Render ticket modal details
        renderTicketDetails(
          ticket.netUSD,
          ticket.payCash + ticket.payCard + (ticket.payCashVes / exchangeRate) + (ticket.payBiopago / exchangeRate),
          ticket.changeUSD,
          ticket.usdToGive,
          ticket.bsToGive,
          ticket.payCash,
          ticket.payCashVes,
          ticket.payCard,
          ticket.payBiopago
        );

        // Restore original active sale states
        currentSale = originalSale;
        currentSubtotalUSD = originalSubtotal;
        ticketNumberId.textContent = originalTktId;

        // Open ticket modal and hide reprint modal
        isReprinting = true;
        reprintModal.style.display = 'none';
        document.getElementById('ticket-modal').style.display = 'flex';
      });

      reprintModalTableBody.appendChild(tr);
    });
  }

  // Open devolucion modal
  devolucionBtn.addEventListener('click', (e) => {
    e.preventDefault();
    devolucionModal.style.display = 'flex';
    devolucionSearchView.style.display = 'block';
    devolucionItemsView.style.display = 'none';
    devolucionSearchInput.value = '';
    selectedTicketForReturn = null;
    renderDevolucionSearchTable();
  });

  // Close devolucion modal
  closeDevolucionModalBtn.addEventListener('click', () => {
    devolucionModal.style.display = 'none';
  });

  // Clear filters
  devolucionClearFiltersBtn.addEventListener('click', () => {
    devolucionSearchInput.value = '';
    renderDevolucionSearchTable();
  });

  // Input filter
  devolucionSearchInput.addEventListener('input', renderDevolucionSearchTable);

  // Back button in phase 2
  devolucionBackBtn.addEventListener('click', () => {
    devolucionSearchView.style.display = 'block';
    devolucionItemsView.style.display = 'none';
    selectedTicketForReturn = null;
  });

  // Render search tickets list for devolucion
  function renderDevolucionSearchTable() {
    devolucionModalTableBody.innerHTML = '';
    const query = devolucionSearchInput.value.toLowerCase().trim();

    // Filter tickets corresponding to this cashier
    const filtered = processedSales.filter(ticket => {
      const userMatch = ticket.cashier.trim().toLowerCase() === currentUser.name.trim().toLowerCase();
      if (!userMatch) return false;

      if (query) {
        const ticketNumMatch = ticket.ticketNumber.includes(query);
        const clientMatch = ticket.client.toLowerCase().includes(query);
        const itemMatch = ticket.items.some(item => item.name.toLowerCase().includes(query));
        
        if (!ticketNumMatch && !clientMatch && !itemMatch) {
          return false;
        }
      }

      return true;
    });

    if (filtered.length === 0) {
      devolucionModalTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: #888888; padding: 1.5rem;">No se encontraron tickets correspondientes para devolución.</td>
        </tr>
      `;
      return;
    }

    filtered.sort((a, b) => b.ticketNumber.localeCompare(a.ticketNumber));

    filtered.forEach(ticket => {
      const tr = document.createElement('tr');
      const dateParts = ticket.date.split('-');
      const displayDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : ticket.date;

      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: 600;">${ticket.ticketNumber}</td>
        <td>${displayDate} ${ticket.time}</td>
        <td>${ticket.client.toUpperCase()}</td>
        <td style="text-align: right; font-weight: 600;">$ ${ticket.netUSD.toFixed(2)}</td>
        <td style="text-align: center;">
          <button class="modal-search-action-btn" style="width: auto; height: 26px; padding: 0 0.5rem; background-color: #e53e3e; color: white; border-radius: 4px; border: none; font-size: 0.75rem; font-weight: bold; cursor: pointer;">
            Seleccionar
          </button>
        </td>
      `;

      const selectBtn = tr.querySelector('button');
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedTicketForReturn = ticket;
        openDevolucionItemsView();
      });

      devolucionModalTableBody.appendChild(tr);
    });
  }

  // Load ticket items into Checklist View
  function openDevolucionItemsView() {
    devolucionSearchView.style.display = 'none';
    devolucionItemsView.style.display = 'block';

    devolucionTktId.textContent = selectedTicketForReturn.ticketNumber;
    devolucionClientName.textContent = selectedTicketForReturn.client.toUpperCase();

    devolucionItemsTableBody.innerHTML = '';

    selectedTicketForReturn.items.forEach((item, idx) => {
      const tr = document.createElement('tr');
      
      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="tkt-return-check" data-index="${idx}" style="transform: scale(1.2); cursor: pointer;">
        </td>
        <td style="font-weight: 600;">${item.name}</td>
        <td style="text-align: center; font-weight: 600;">${item.qty}</td>
        <td style="text-align: center;">
          <input type="number" class="tkt-return-qty" data-index="${idx}" value="${item.qty}" min="1" max="${item.qty}" disabled style="width: 60px; text-align: center; height: 24px; border: 1px solid #cbd5e0; border-radius: 4px; font-family: var(--font-family); font-weight: 600;">
        </td>
        <td style="text-align: right;">$ ${item.priceUSD.toFixed(2)}</td>
      `;

      const checkbox = tr.querySelector('.tkt-return-check');
      const qtyInput = tr.querySelector('.tkt-return-qty');

      checkbox.addEventListener('change', () => {
        qtyInput.disabled = !checkbox.checked;
        if (!checkbox.checked) {
          qtyInput.value = item.qty;
        }
      });

      devolucionItemsTableBody.appendChild(tr);
    });
  }

  // Submit refund/return
  devolucionSubmitBtn.addEventListener('click', () => {
    if (!selectedTicketForReturn) return;

    const checkedBoxes = Array.from(devolucionItemsTableBody.querySelectorAll('.tkt-return-check:checked'));
    if (checkedBoxes.length === 0) {
      alert('Por favor, seleccione al menos un artículo para realizar la devolución.');
      return;
    }

    let returnedItemsDetails = [];
    let isInventoryAdjusted = false;

    const returnsMap = new Map();
    let hasValidationError = false;

    checkedBoxes.forEach(cb => {
      const idx = parseInt(cb.getAttribute('data-index'));
      const originalItem = selectedTicketForReturn.items[idx];
      const qtyInput = devolucionItemsTableBody.querySelector(`.tkt-return-qty[data-index="${idx}"]`);
      const returnQty = parseInt(qtyInput.value);

      if (isNaN(returnQty) || returnQty <= 0 || returnQty > originalItem.qty) {
        alert(`Cantidad inválida para el artículo "${originalItem.name}".`);
        hasValidationError = true;
        return;
      }

      returnsMap.set(idx, returnQty);
    });

    if (hasValidationError) return;

    // Adjust inventory stock
    returnsMap.forEach((returnQty, idx) => {
      const item = selectedTicketForReturn.items[idx];
      const invProduct = inventoryCatalog.find(p => p.name.toUpperCase() === item.name.toUpperCase());
      if (invProduct) {
        invProduct.stock += returnQty;
        isInventoryAdjusted = true;
      }

      returnedItemsDetails.push({
        name: item.name,
        qty: returnQty,
        priceUSD: item.priceUSD
      });
    });

    // Calculate remaining items (kept items)
    let remainingSaleItems = [];
    selectedTicketForReturn.items.forEach((item, idx) => {
      const returnQty = returnsMap.get(idx) || 0;
      const keptQty = item.qty - returnQty;

      if (keptQty > 0) {
        remainingSaleItems.push({
          name: item.name,
          qty: keptQty,
          priceUSD: item.priceUSD
        });
      }
    });

    // Populate active shopping cart (currentSale) with kept items
    currentSale = remainingSaleItems.map(item => {
      const catalogProduct = inventoryCatalog.find(p => p.name.toUpperCase() === item.name.toUpperCase());
      return {
        code: catalogProduct ? catalogProduct.code : '000',
        name: item.name,
        unit: catalogProduct ? catalogProduct.unit : 'UND',
        qty: item.qty,
        priceUSD: item.priceUSD,
        totalUSD: item.qty * item.priceUSD
      };
    });

    if (isInventoryAdjusted) {
      renderInventoryTable();
    }

    renderSaleTable();
    devolucionModal.style.display = 'none';

    alert(
      `DEVOLUCIÓN PROCESADA CON ÉXITO:\n\n` +
      `Artículos Devueltos y reincorporados al inventario:\n` +
      returnedItemsDetails.map(it => `- ${it.qty} x ${it.name}`).join('\n') + `\n\n` +
      `Se han cargado los artículos restantes en la Caja de venta para realizar el nuevo cobro.`
    );

    posProductInput.focus();
  });

  // Close Register button handler
  closeRegisterBtn.addEventListener('click', () => {
    const confirmClose = confirm(
      '¿Está seguro de que desea realizar el cierre de caja?\n' +
      'Se imprimirá el Reporte Fiscal Z y finalizará la sesión del cajero actual.'
    );

    if (confirmClose) {
      alert(
        `CIERRE DE CAJA FISCAL PROCESADO:\n\n` +
        `Operador: ${currentUser.name}\n` +
        `Monto USD Inicial: $${currentSession.cashUSD.toFixed(2)}\n` +
        `Monto VES Inicial: Bs ${currentSession.cashVES.toFixed(2)}\n\n` +
        `Cierre de sesión exitoso.`
      );
      logout();
    }
  });

  // Logout/Return to Login Helper
  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('¿Desea cerrar sesión y salir del sistema?')) {
      logout();
    }
  });

  function logout() {
    currentSession.isOpened = false;
    currentSession.cashUSD = 0.00;
    currentSession.cashVES = 0.00;
    currentUser.name = '';
    currentUser.role = '';

    // Switch screens
    dashboardView.style.display = 'none';
    loginView.style.display = 'grid';
    
    // Reset login input values
    usernameInput.value = '';
    passwordInput.value = '';
    setLoginLoading(false);
    
    // Highlight username field
    usernameInput.focus();
  }

  /* ==========================================================================
     5. STATUS BAR REAL-TIME CLOCK
     ========================================================================== */

  function updateFooterTime() {
    const now = new Date();
    
    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    const dayName = days[now.getDay()];
    const day = now.getDate();
    const monthName = months[now.getMonth()];
    const year = now.getFullYear();

    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'p. m.' : 'a. m.';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // key hours replacement (0 becomes 12)
    const hoursStr = String(hours).padStart(2, '0');

    footerTimeDisplay.textContent = `${dayName}, ${day} de ${monthName} de ${year} - ${hoursStr}:${minutes}:${seconds} ${ampm}`;
  }

  // Update clock every second
  updateFooterTime();
  setInterval(updateFooterTime, 1000);

  /* ==========================================================================
     6. INVENTORY MODULE (F2 INVENTARIO) PROCESS
     ========================================================================== */

  // Render function for Inventory Catalog table
  function renderInventoryTable(filterQuery = '') {
    inventoryTableBody.innerHTML = '';
    selectedInvRowIndex = null;
    updateInventoryActionStates();

    const query = filterQuery.toLowerCase().trim();

    // Filter elements
    const filteredCatalog = inventoryCatalog.filter(item => 
      item.code.toLowerCase().includes(query) || 
      item.name.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    );

    if (filteredCatalog.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="10" style="text-align: center; color: #888888; padding: 2rem;">No se encontraron productos en el inventario.</td>
      `;
      inventoryTableBody.appendChild(tr);
      return;
    }

    filteredCatalog.forEach((item, index) => {
      // Find original index in master array
      const masterIndex = inventoryCatalog.findIndex(mi => mi.code === item.code);

      const tr = document.createElement('tr');
      tr.setAttribute('data-index', masterIndex);
      
      const stockCellClass = item.stock === 0 ? 'stock-zero' : '';
      if (item.stock === 0) {
        tr.classList.add('zero-stock-row');
      }

      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: 600;">${item.code}</td>
        <td class="col-desc" style="font-weight: 500;">${item.name}</td>
        <td>${item.category}</td>
        <td>${item.dept}</td>
        <td>${item.location}</td>
        <td style="text-align: center;">${item.unit}</td>
        <td style="text-align: center;" class="col-stock ${stockCellClass}">${item.stock}</td>
        <td class="col-cost" style="text-align: right;">${item.cost.toFixed(2)}</td>
        <td class="col-price1" style="text-align: right; font-weight: 600;">${item.price1.toFixed(2)}</td>
        <td class="col-price2" style="text-align: right;">${item.price2.toFixed(2)}</td>
      `;

      // Highlight selected row on click
      tr.addEventListener('click', () => {
        const rows = inventoryTableBody.querySelectorAll('tr');
        rows.forEach(r => r.classList.remove('selected-row'));

        if (selectedInvRowIndex === masterIndex) {
          selectedInvRowIndex = null;
        } else {
          tr.classList.add('selected-row');
          selectedInvRowIndex = masterIndex;
        }
        updateInventoryActionStates();
      });

      inventoryTableBody.appendChild(tr);
    });

    // Update statistics counters based on master catalog
    updateInventoryStats();

    // Rebuild product autocomplete suggestions in F1 Caja
    updateProductSuggestions();
  }

  // Update datalist options dynamically from inventoryCatalog
  function updateProductSuggestions() {
    const suggestionsDatalist = document.getElementById('inventory-suggestions');
    if (!suggestionsDatalist) return;
    suggestionsDatalist.innerHTML = '';

    inventoryCatalog.forEach(item => {
      const option = document.createElement('option');
      option.value = item.code;
      // Display description, USD price, and current stock count as suggestion description
      option.textContent = `${item.name} - $ ${item.price1.toFixed(2)} (Disponibles: ${item.stock})`;
      suggestionsDatalist.appendChild(option);
    });
  }

  // Calculate and display inventory totals
  function updateInventoryStats() {
    let totalStock = 0;
    let totalCost = 0.00;
    let totalPrice1 = 0.00;

    inventoryCatalog.forEach(item => {
      totalStock += item.stock;
      totalCost += (item.cost * item.stock);
      totalPrice1 += (item.price1 * item.stock);
    });

    invStatPrice1.textContent = totalPrice1.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    invStatCost.textContent = totalCost.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    invStatTotal.textContent = totalStock.toLocaleString('es-VE');
  }

  // Enable/Disable row specific buttons
  function updateInventoryActionStates() {
    if (selectedInvRowIndex === null) {
      invEditBtn.disabled = true;
      invDeleteBtn.disabled = true;
      invDetailBtn.disabled = true;
    } else {
      invEditBtn.disabled = false;
      invDeleteBtn.disabled = false;
      invDetailBtn.disabled = false;
    }
  }

  // Live filter search
  invSearchInput.addEventListener('input', () => {
    renderInventoryTable(invSearchInput.value);
  });

  invSearchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    renderInventoryTable(invSearchInput.value);
  });

  // Action: Add Item (Agregar) - Custom Tabbed Modal
  let isEditingProduct = false;
  let editingProductIndex = null;

  const productModal = document.getElementById('product-modal');
  const closeProductModalBtn = document.getElementById('close-product-modal-btn');
  const productModalForm = document.getElementById('product-modal-form');
  const productModalTitle = document.getElementById('product-modal-title');

  // Input bindings
  const prodFormCode = document.getElementById('prod-form-code');
  const prodFormName = document.getElementById('prod-form-name');
  const prodFormCategory = document.getElementById('prod-form-category');
  const prodFormDept = document.getElementById('prod-form-dept');
  const prodFormProvider = document.getElementById('prod-form-provider');
  const prodFormProviderCode = document.getElementById('prod-form-provider-code');
  const prodFormRef = document.getElementById('prod-form-ref');
  
  const prodFormTaxChk = document.getElementById('prod-form-tax-chk');
  const prodFormTaxName = document.getElementById('prod-form-tax-name');
  const prodFormTaxPct = document.getElementById('prod-form-tax-pct');
  const prodFormCost = document.getElementById('prod-form-cost');
  const prodFormUnit = document.getElementById('prod-form-unit');
  const prodFormPrice1 = document.getElementById('prod-form-price1');
  const prodFormPrice2 = document.getElementById('prod-form-price2');
  const prodFormPrice3 = document.getElementById('prod-form-price3');
  const prodFormPriceMed = document.getElementById('prod-form-price-med');
  const prodFormQtyMed = document.getElementById('prod-form-qty-med');
  const prodFormPriceMay = document.getElementById('prod-form-price-may');
  const prodFormQtyMay = document.getElementById('prod-form-qty-may');
  
  const prodFormMinStock = document.getElementById('prod-form-min-stock');
  const prodFormMaxStock = document.getElementById('prod-form-max-stock');
  const prodFormStock = document.getElementById('prod-form-stock');
  const prodFormExistCell = document.getElementById('prod-form-exist-cell');
  const prodFormKeepOpen = document.getElementById('prod-form-keep-open');

  const prodModalTabs = document.querySelectorAll('.prod-modal-tab');
  const prodModalPanels = document.querySelectorAll('.prod-modal-panel');

  // Open modal in Add mode
  invAddBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isEditingProduct = false;
    editingProductIndex = null;
    productModalTitle.textContent = 'Agregar Producto';
    
    // Clear and set defaults
    prodFormCode.value = '';
    prodFormCode.disabled = false;
    prodFormName.value = '';
    prodFormCategory.value = 'ALIMENTOS';
    prodFormDept.value = 'LADO A';
    prodFormProvider.value = 'DISTRIBUIDORA ALIMENTOS';
    prodFormProviderCode.value = '';
    prodFormRef.value = '';
    
    prodFormTaxChk.checked = true;
    prodFormTaxName.value = 'IVA';
    prodFormTaxPct.value = '16';
    prodFormCost.value = '0.00';
    prodFormUnit.value = 'UND';
    prodFormPrice1.value = '0.00';
    prodFormPrice2.value = '0.00';
    prodFormPrice3.value = '0.00';
    prodFormPriceMed.value = '0.00';
    prodFormQtyMed.value = '0';
    prodFormPriceMay.value = '0.00';
    prodFormQtyMay.value = '0';
    
    prodFormMinStock.value = '0';
    prodFormMaxStock.value = '0';
    prodFormStock.value = '0';
    prodFormExistCell.textContent = '0.00';
    prodFormKeepOpen.checked = false;

    // Reset toggles
    setToggleState(document.getElementById('toggle-granel'), false);
    setToggleState(document.getElementById('toggle-bloqueo'), false);
    setToggleState(document.getElementById('toggle-vencimiento'), false);
    setToggleState(document.getElementById('toggle-2x1'), false);
    setToggleState(document.getElementById('toggle-activo'), true);

    // Default tab
    activateTab('general');

    productModal.style.display = 'flex';
    prodFormCode.focus();
  });

  // Open modal in Modify mode
  invEditBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (selectedInvRowIndex === null) return;
    const item = inventoryCatalog[selectedInvRowIndex];
    
    isEditingProduct = true;
    editingProductIndex = selectedInvRowIndex;
    productModalTitle.textContent = 'Modificar Producto';
    
    // Populate fields
    prodFormCode.value = item.code;
    prodFormCode.disabled = false; // Allow key modification on edit
    prodFormName.value = item.name;
    prodFormCategory.value = item.category || 'ALIMENTOS';
    prodFormDept.value = item.dept || 'LADO A';
    prodFormProvider.value = item.provider || 'DISTRIBUIDORA ALIMENTOS';
    prodFormProviderCode.value = item.providerCode || '';
    prodFormRef.value = item.reference || '';
    
    prodFormTaxChk.checked = item.taxed !== false;
    prodFormTaxName.value = item.taxName || 'IVA';
    prodFormTaxPct.value = item.taxPct !== undefined ? item.taxPct : '16';
    prodFormCost.value = item.cost.toFixed(2);
    prodFormUnit.value = item.unit;
    prodFormPrice1.value = item.price1.toFixed(2);
    prodFormPrice2.value = (item.price2 || 0.00).toFixed(2);
    prodFormPrice3.value = (item.price3 || 0.00).toFixed(2);
    prodFormPriceMed.value = (item.priceMed || 0.00).toFixed(2);
    prodFormQtyMed.value = item.qtyMed || '0';
    prodFormPriceMay.value = (item.priceMay || 0.00).toFixed(2);
    prodFormQtyMay.value = item.qtyMay || '0';
    
    prodFormMinStock.value = item.minStock || '0';
    prodFormMaxStock.value = item.maxStock || '0';
    prodFormStock.value = item.stock;
    prodFormExistCell.textContent = parseFloat(item.stock).toFixed(2);
    prodFormKeepOpen.checked = false;

    // Set toggles
    setToggleState(document.getElementById('toggle-granel'), item.granel === true);
    setToggleState(document.getElementById('toggle-bloqueo'), item.bloqueado === true);
    setToggleState(document.getElementById('toggle-vencimiento'), item.vencimiento === true);
    setToggleState(document.getElementById('toggle-2x1'), item.twoForOne === true);
    setToggleState(document.getElementById('toggle-activo'), item.activo !== false);

    // Default tab
    activateTab('general');

    productModal.style.display = 'flex';
    prodFormName.focus();
  });

  closeProductModalBtn.addEventListener('click', () => {
    productModal.style.display = 'none';
  });

  // Tab switching click events
  prodModalTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      activateTab(targetTab);
    });
  });

  // Helper to programmatically activate tabs
  function activateTab(tabName) {
    prodModalTabs.forEach(t => {
      if (t.getAttribute('data-tab') === tabName) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    prodModalPanels.forEach(panel => {
      panel.style.display = 'none';
    });
    
    const targetPanel = document.getElementById(`prod-panel-${tabName}`);
    if (targetPanel) {
      if (tabName === 'general' || tabName === 'imagen') {
        targetPanel.style.display = 'flex';
      } else {
        targetPanel.style.display = 'flex';
        targetPanel.style.flexDirection = 'column';
      }
    }

    if (tabName === 'codbarra') {
      renderBarcodeCanvas();
    }
  }

  // Toggle helper functions
  function setToggleState(el, value) {
    if (!el) return;
    el.textContent = value ? 'Si' : 'No';
    if (value) {
      el.style.color = '#20589d';
      el.style.textDecorationColor = '#20589d';
    } else {
      el.style.color = '#e53e3e';
      el.style.textDecorationColor = '#ff4d4f';
    }
  }

  function getToggleState(el) {
    if (!el) return false;
    return el.textContent.trim() === 'Si';
  }

  // Bind toggle click events
  ['toggle-granel', 'toggle-bloqueo', 'toggle-vencimiento', 'toggle-2x1', 'toggle-activo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        const current = getToggleState(el);
        setToggleState(el, !current);
      });
    }
  });

  // Product type switcher Product/Service
  const typeProduct = document.getElementById('prod-type-product');
  const typeService = document.getElementById('prod-type-service');
  let selectedProductType = 'Producto';

  if (typeProduct && typeService) {
    typeProduct.addEventListener('click', () => {
      selectedProductType = 'Producto';
      typeProduct.style.borderBottom = '2px solid #20589d';
      typeProduct.style.color = '#20589d';
      typeService.style.borderBottom = 'none';
      typeService.style.color = '#718096';
    });

    typeService.addEventListener('click', () => {
      selectedProductType = 'Servicio';
      typeService.style.borderBottom = '2px solid #20589d';
      typeService.style.color = '#20589d';
      typeProduct.style.borderBottom = 'none';
      typeProduct.style.color = '#718096';
    });
  }

  // Live update barcode on inputs
  [prodFormCode, prodFormName, prodFormPrice1].forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        const activeTab = document.querySelector('.prod-modal-tab.active');
        if (activeTab && activeTab.getAttribute('data-tab') === 'codbarra') {
          renderBarcodeCanvas();
        }
      });
    }
  });

  // Draw Dynamic Barcode
  function renderBarcodeCanvas() {
    const canvas = document.getElementById('barcode-canvas');
    if (!canvas) return;

    const code = prodFormCode.value.trim();
    const name = prodFormName.value.trim();
    const price = parseFloat(prodFormPrice1.value) || 0.00;

    document.getElementById('barcode-display-name').textContent = name || 'PRODUCTO NUEVO';
    document.getElementById('barcode-display-price').textContent = `$ ${price.toFixed(2)}`;
    document.getElementById('barcode-display-code').textContent = code || '0000000';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!code) {
      ctx.fillStyle = '#718096';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('[Ingrese una clave para ver el código]', canvas.width / 2, canvas.height / 2);
      return;
    }

    ctx.fillStyle = '#000000';
    
    // Hash based on code to generate deterministic lines
    let hash = 5381;
    for (let i = 0; i < code.length; i++) {
      hash = ((hash << 5) + hash) + code.charCodeAt(i);
    }
    
    // Start margin
    let x = 15;
    
    // Draw start sentinel
    ctx.fillRect(x, 0, 2.5, canvas.height); x += 5;
    ctx.fillRect(x, 0, 2.5, canvas.height); x += 5;
    
    // Draw lines
    for (let i = 0; i < 28; i++) {
      const bit = (Math.abs(hash) >> (i % 31)) & 1;
      const barWidth = bit ? 4.5 : 1.5;
      ctx.fillRect(x, 0, barWidth, canvas.height);
      x += barWidth + 3.5;
    }
    
    // Draw end sentinel
    ctx.fillRect(x, 0, 2.5, canvas.height); x += 5;
    ctx.fillRect(x, 0, 2.5, canvas.height);

    // Warning and button states
    const warning = document.getElementById('prod-barcode-warning');
    const downloadBtn = document.getElementById('prod-barcode-download-btn');
    const printBtn = document.getElementById('prod-barcode-print-btn');
    
    if (isEditingProduct) {
      if (warning) warning.style.display = 'none';
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.style.opacity = '1';
        downloadBtn.style.cursor = 'pointer';
      }
      if (printBtn) {
        printBtn.disabled = false;
        printBtn.style.opacity = '1';
        printBtn.style.cursor = 'pointer';
      }
    } else {
      if (warning) {
        warning.style.display = 'block';
        warning.textContent = '* No puede imprimir etiquetas del producto que aún no está registrado';
      }
      if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.style.opacity = '0.5';
        downloadBtn.style.cursor = 'not-allowed';
      }
      if (printBtn) {
        printBtn.disabled = true;
        printBtn.style.opacity = '0.5';
        printBtn.style.cursor = 'not-allowed';
      }
    }
  }

  // Barcode actions
  const prodBarcodeDownloadBtn = document.getElementById('prod-barcode-download-btn');
  const prodBarcodePrintBtn = document.getElementById('prod-barcode-print-btn');

  if (prodBarcodeDownloadBtn) {
    prodBarcodeDownloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const code = prodFormCode.value.trim();
      if (!code) return alert('Por favor ingrese una clave para generar el código de barra.');
      const link = document.createElement('a');
      link.download = `barcode_${code}.png`;
      link.href = document.getElementById('barcode-canvas').toDataURL();
      link.click();
    });
  }

  if (prodBarcodePrintBtn) {
    prodBarcodePrintBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const code = prodFormCode.value.trim();
      const name = prodFormName.value.trim();
      const price = parseFloat(prodFormPrice1.value) || 0.00;
      const copies = parseInt(document.getElementById('prod-form-barcode-copies').value) || 1;
      
      if (!code) return alert('Por favor ingrese una clave para imprimir.');

      const printWin = window.open('', '_blank', 'width=600,height=400');
      
      let labelsHTML = '';
      for (let i = 0; i < copies; i++) {
        labelsHTML += `
          <div style="width: 220px; height: 130px; border: 1px dashed #cbd5e0; padding: 10px; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; margin: 5px;">
            <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px;">${name || 'PRODUCTO'}</div>
            <div style="font-size: 10px; font-weight: bold; margin-bottom: 4px;">$ ${price.toFixed(2)}</div>
            <img src="${document.getElementById('barcode-canvas').toDataURL()}" style="width: 150px; height: 50px; object-fit: contain;"/>
            <div style="font-family: monospace; font-size: 11px; font-weight: bold; margin-top: 3px; letter-spacing: 1px;">${code}</div>
          </div>
        `;
      }

      printWin.document.write(`
        <html>
        <head><title>Imprimir Etiquetas</title></head>
        <body style="margin: 0; padding: 10px; font-family: sans-serif; display: flex; flex-wrap: wrap;">
          ${labelsHTML}
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
        </html>
      `);
      printWin.document.close();
    });
  }

  // Handle form submission
  productModalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const code = prodFormCode.value.trim().toUpperCase();
    const name = prodFormName.value.trim().toUpperCase();
    const category = prodFormCategory.value.trim().toUpperCase();
    const dept = prodFormDept.value.trim().toUpperCase();
    const provider = prodFormProvider.value.trim().toUpperCase();
    const providerCode = prodFormProviderCode.value.trim();
    const reference = prodFormRef.value.trim();
    
    const taxed = prodFormTaxChk.checked;
    const taxName = prodFormTaxName.value.trim().toUpperCase();
    const taxPct = parseFloat(prodFormTaxPct.value) || 0.00;
    const cost = parseFloat(prodFormCost.value) || 0.00;
    const unit = prodFormUnit.value;
    const price1 = parseFloat(prodFormPrice1.value) || 0.00;
    const price2 = parseFloat(prodFormPrice2.value) || 0.00;
    const price3 = parseFloat(prodFormPrice3.value) || 0.00;
    const priceMed = parseFloat(prodFormPriceMed.value) || 0.00;
    const qtyMed = parseInt(prodFormQtyMed.value) || 0;
    const priceMay = parseFloat(prodFormPriceMay.value) || 0.00;
    const qtyMay = parseInt(prodFormQtyMay.value) || 0;
    
    const minStock = parseInt(prodFormMinStock.value) || 0;
    const maxStock = parseInt(prodFormMaxStock.value) || 0;
    const stock = parseInt(prodFormStock.value) || 0;

    const granel = getToggleState(document.getElementById('toggle-granel'));
    const bloqueado = getToggleState(document.getElementById('toggle-bloqueo'));
    const vencimiento = getToggleState(document.getElementById('toggle-vencimiento'));
    const twoForOne = getToggleState(document.getElementById('toggle-2x1'));
    const activo = getToggleState(document.getElementById('toggle-activo'));

    if (isEditingProduct) {
      // Modify
      const item = inventoryCatalog[editingProductIndex];
      // Check duplicate Clave if changed
      if (code !== item.code && inventoryCatalog.some((p, idx) => idx !== editingProductIndex && p.code.toLowerCase() === code.toLowerCase())) {
        alert('Error: Ya existe otro producto con esta clave.');
        return;
      }
      item.code = code;
      item.name = name;
      item.category = category;
      item.dept = dept;
      item.provider = provider;
      item.providerCode = providerCode;
      item.reference = reference;
      item.taxed = taxed;
      item.taxName = taxName;
      item.taxPct = taxPct;
      item.cost = cost;
      item.unit = unit;
      item.price1 = price1;
      item.price2 = price2;
      item.price3 = price3;
      item.priceMed = priceMed;
      item.qtyMed = qtyMed;
      item.priceMay = priceMay;
      item.qtyMay = qtyMay;
      item.minStock = minStock;
      item.maxStock = maxStock;
      item.stock = stock;
      item.granel = granel;
      item.bloqueado = bloqueado;
      item.vencimiento = vencimiento;
      item.twoForOne = twoForOne;
      item.activo = activo;

      alert(`Producto "${name}" modificado correctamente.`);
    } else {
      // Add
      // Check duplicate Clave
      if (inventoryCatalog.some(item => item.code.toLowerCase() === code.toLowerCase())) {
        alert('Error: Ya existe un producto con esta clave.');
        return;
      }

      inventoryCatalog.push({
        code: code,
        name: name,
        category: category,
        dept: dept,
        location: 'ALMACEN 1',
        provider: provider,
        providerCode: providerCode,
        reference: reference,
        taxed: taxed,
        taxName: taxName,
        taxPct: taxPct,
        cost: cost,
        unit: unit,
        price1: price1,
        price2: price2,
        price3: price3,
        priceMed: priceMed,
        qtyMed: qtyMed,
        priceMay: priceMay,
        qtyMay: qtyMay,
        minStock: minStock,
        maxStock: maxStock,
        stock: stock,
        granel: granel,
        bloqueado: bloqueado,
        vencimiento: vencimiento,
        twoForOne: twoForOne,
        activo: activo
      });

      alert(`Producto "${name}" creado exitosamente.`);
    }

    renderInventoryTable();

    if (prodFormKeepOpen.checked) {
      // Keep open and clear
      prodFormCode.value = '';
      prodFormCode.disabled = false;
      prodFormName.value = '';
      prodFormCode.focus();
    } else {
      productModal.style.display = 'none';
    }
  });

  // Action: Delete Item (Eliminar)
  invDeleteBtn.addEventListener('click', () => {
    if (selectedInvRowIndex === null) return;
    const item = inventoryCatalog[selectedInvRowIndex];

    if (confirm(`¿Está seguro de que desea eliminar el producto "${item.name}" del inventario?`)) {
      inventoryCatalog.splice(selectedInvRowIndex, 1);
      renderInventoryTable();
      alert('Producto eliminado exitosamente.');
    }
  });


  // Action: Detail Product (Detalle)
  invDetailBtn.addEventListener('click', () => {
    if (selectedInvRowIndex === null) return;
    const item = inventoryCatalog[selectedInvRowIndex];

    alert(
      `DETALLE DE PRODUCTO:\n\n` +
      `CLAVE: ${item.code}\n` +
      `DESCRIPCIÓN: ${item.name}\n` +
      `CATEGORÍA: ${item.category}\n` +
      `DEPARTAMENTO: ${item.dept}\n` +
      `ALMACÉN / GIRO: ${item.location}\n` +
      `U. M.: ${item.unit}\n` +
      `STOCK EXISTENTE: ${item.stock}\n` +
      `COSTO UNITARIO: ${item.cost.toFixed(2)} Bs\n` +
      `PRECIO VENTA 1: ${item.price1.toFixed(2)} Bs\n` +
      `PRECIO VENTA 2: ${item.price2.toFixed(2)} Bs\n\n` +
      `Valorización de Costo Total: ${(item.cost * item.stock).toFixed(2)} Bs\n` +
      `Valorización de Venta Total: ${(item.price1 * item.stock).toFixed(2)} Bs`
    );
  });

  // Inventory sub-panel switching
  const invPanelCatalogo    = document.getElementById('inv-panel-catalogo');
  const invPanelMovimientos = document.getElementById('inv-panel-movimientos');
  const invCatalogSidebar   = document.getElementById('inv-catalog-sidebar');

  inventorySubTabs.forEach(subtab => {
    subtab.addEventListener('click', () => {
      inventorySubTabs.forEach(s => s.classList.remove('active'));
      subtab.classList.add('active');

      const subName = subtab.getAttribute('data-subtab');
      if (subName === 'catalogo') {
        invPanelCatalogo.style.display    = 'flex';
        invPanelMovimientos.style.display = 'none';
        if (invCatalogSidebar) invCatalogSidebar.style.display = '';
      } else if (subName === 'movimientos') {
        invPanelCatalogo.style.display    = 'none';
        invPanelMovimientos.style.display = 'flex';
        if (invCatalogSidebar) invCatalogSidebar.style.display = 'none';
        renderMovimientosTable(); // load today by default
      } else {
        // Other subtabs — placeholder
        invPanelCatalogo.style.display    = 'none';
        invPanelMovimientos.style.display = 'none';
        if (invCatalogSidebar) invCatalogSidebar.style.display = 'none';
        alert(`Módulo de Inventario → Sub-vista [${subtab.textContent.trim()}] (próximamente).`);
        // Return to catalogo
        setTimeout(() => {
          inventorySubTabs.forEach(s => s.classList.remove('active'));
          inventorySubTabs[0].classList.add('active');
          invPanelCatalogo.style.display = 'flex';
          if (invCatalogSidebar) invCatalogSidebar.style.display = '';
        }, 300);
      }
    });
  });

  /* ==========================================================================
     MOVIMIENTOS DE INVENTARIO
     ========================================================================== */
  {
    // Sample hardcoded movement log — mirrors what Entrada Inventario saves to
    movimientosLog = [
      { fecha: '12/7/2026 07:07 p.m.', tipo: 'Entrada', clave: 'SAN', desc: 'SANDWICH PEQ', um: 'UND', almacen: 'ALMACEN 1', precio: 5.40, costo: 4.50, cantidad: 9 },
      { fecha: '12/7/2026 06:04 p.m.', tipo: 'Ticket Venta', clave: '7559350000031', desc: 'AGUA HELAL 1.5LT', um: 'UND', almacen: 'ALMACEN 1', precio: 1.00, costo: 0.67, cantidad: 1 },
      { fecha: '12/7/2026 05:41 p.m.', tipo: 'Ticket Venta', clave: 'CHU', desc: 'CHULETAS', um: 'UND', almacen: 'ALMACEN 1', precio: 0.75, costo: 0.50, cantidad: 5 },
      { fecha: '12/7/2026 05:29 p.m.', tipo: 'Ticket Venta', clave: 'CA', desc: 'CARAMELOS GENERAL', um: 'UND', almacen: 'ALMACEN 1', precio: 0.04, costo: 0.03, cantidad: 1 },
    ];

    const movTableBody    = document.getElementById('mov-table-body');
    const movDateFrom     = document.getElementById('mov-date-from');
    const movDateTo       = document.getElementById('mov-date-to');
    const movFilterBtn    = document.getElementById('mov-filter-btn');
    const movStatPrices   = document.getElementById('mov-stat-prices');
    const movStatCosts    = document.getElementById('mov-stat-costs');
    const movStatQty      = document.getElementById('mov-stat-qty');

    // Set default date range to today
    const todayStr = new Date().toISOString().slice(0, 10);
    if (movDateFrom) movDateFrom.value = todayStr;
    if (movDateTo)   movDateTo.value   = todayStr;

    function renderMovimientosTable() {
      if (!movTableBody) return;
      movTableBody.innerHTML = '';
      let totalPrices = 0, totalCosts = 0, totalQty = 0;

      if (movimientosLog.length === 0) {
        movTableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#a0aec0;padding:2rem;">No hay movimientos registrados en este período</td></tr>`;
        return;
      }

      movimientosLog.forEach((m, idx) => {
        totalPrices += (m.precio * m.cantidad);
        totalCosts  += (m.costo  * m.cantidad);
        totalQty    += m.cantidad;
        const isEven = idx % 2 === 0;
        const isEntrada = m.tipo === 'Entrada';
        const tr = document.createElement('tr');
        tr.style.background = isEven ? 'white' : '#f8fafc';
        if (isEntrada) tr.style.background = '#f0fdf4';
        tr.innerHTML = `
          <td style="padding: 0.3rem 0.5rem; font-size: 0.76rem; color: #4a5568;">${m.fecha}</td>
          <td style="padding: 0.3rem 0.5rem;">
            <span style="background:${isEntrada ? '#d1fae5' : '#e0f2fe'}; color:${isEntrada ? '#065f46' : '#0c4a6e'}; font-size:0.7rem; font-weight:700; padding:0.1rem 0.4rem; border-radius:4px;">${m.tipo}</span>
          </td>
          <td style="padding: 0.3rem 0.5rem; font-family: monospace; font-weight:600; font-size:0.75rem;">${m.clave}</td>
          <td style="padding: 0.3rem 0.5rem; font-size:0.76rem;">${m.desc}</td>
          <td style="padding: 0.3rem 0.5rem; text-align:center; font-size:0.76rem;">${m.um}</td>
          <td style="padding: 0.3rem 0.5rem; font-size:0.76rem;">${m.almacen}</td>
          <td style="padding: 0.3rem 0.5rem; text-align:right; font-size:0.76rem;">${m.precio.toFixed(2)}</td>
          <td style="padding: 0.3rem 0.5rem; text-align:right; font-size:0.76rem;">${m.costo.toFixed(2)}</td>
          <td style="padding: 0.3rem 0.5rem; text-align:right; font-weight:700; font-size:0.78rem; color:${isEntrada ? '#065f46' : '#7c1232'};">${isEntrada ? '+' : ''}${m.cantidad}</td>
        `;
        movTableBody.appendChild(tr);
      });

      if (movStatPrices) movStatPrices.textContent = totalPrices.toFixed(2);
      if (movStatCosts)  movStatCosts.textContent  = totalCosts.toFixed(2);
      if (movStatQty)    movStatQty.textContent     = totalQty;
    }

    if (movFilterBtn) movFilterBtn.addEventListener('click', renderMovimientosTable);

    // Movement buttons
    const movBtnEntrada = document.getElementById('mov-btn-entrada');
    const movBtnSalida  = document.getElementById('mov-btn-salida');
    const movBtnAjuste  = document.getElementById('mov-btn-ajuste');
    const movBtnMerma   = document.getElementById('mov-btn-merma');
    const movBtnPedido  = document.getElementById('mov-btn-pedido');

    if (movBtnSalida)  movBtnSalida.addEventListener('click',  () => alert('Salida de Inventario (próximamente)'));
    if (movBtnAjuste)  movBtnAjuste.addEventListener('click',  () => alert('Ajuste de Inventario (próximamente)'));
    if (movBtnMerma)   movBtnMerma.addEventListener('click',   () => alert('Merma de Inventario (próximamente)'));
    if (movBtnPedido)  movBtnPedido.addEventListener('click',  () => alert('Pedido a Proveedor (próximamente)'));

    /* ---- ENTRADA DE INVENTARIO ---- */
    const entradaModal         = document.getElementById('entrada-modal');
    const entradaBackBtn       = document.getElementById('entrada-back-btn');
    const entradaProductInput  = document.getElementById('entrada-product-input');
    const entradaProductSearch = document.getElementById('entrada-product-search-btn');
    const entradaNuevoProdBtn  = document.getElementById('entrada-nuevo-prod-btn');
    const entradaTableBody     = document.getElementById('entrada-table-body');
    const entradaEmptyRow      = document.getElementById('entrada-empty-row');
    const entradaTotalCost     = document.getElementById('entrada-total-cost');
    const entradaTotalQty      = document.getElementById('entrada-total-qty');
    const entradaTotalProds    = document.getElementById('entrada-total-prods');
    const entradaBtnBorrar     = document.getElementById('entrada-btn-borrar');
    const entradaBtnGuardar    = document.getElementById('entrada-btn-guardar');
    const entradaNumero        = document.getElementById('entrada-numero');

    let entradaItems = [];         // rows in this entry
    let entradaCounter = 1;        // increments per entry saved
    let selectedEntradaRow = null; // currently selected row index

    function recalcEntradaTotals() {
      const totalCost  = entradaItems.reduce((a, it) => a + (it.costo * it.cantidad), 0);
      const totalQty   = entradaItems.reduce((a, it) => a + it.cantidad, 0);
      if (entradaTotalCost)  entradaTotalCost.textContent  = totalCost.toFixed(2);
      if (entradaTotalQty)   entradaTotalQty.textContent   = totalQty;
      if (entradaTotalProds) entradaTotalProds.textContent = entradaItems.length;
    }

    function renderEntradaTable() {
      if (!entradaTableBody) return;
      entradaTableBody.innerHTML = '';
      if (entradaItems.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.id = 'entrada-empty-row';
        emptyRow.innerHTML = `<td colspan="9" style="text-align:center;color:#a0aec0;padding:2.5rem;">Busque y agregue productos a la entrada de inventario</td>`;
        entradaTableBody.appendChild(emptyRow);
      } else {
        entradaItems.forEach((item, idx) => {
          const tr = document.createElement('tr');
          tr.style.background = idx % 2 === 0 ? 'white' : '#f0fdf4';
          tr.style.cursor = 'pointer';
          if (selectedEntradaRow === idx) {
            tr.style.background = '#dbeafe';
            tr.style.outline = '2px solid #3b82f6';
          }
          const total = (item.costo * item.cantidad).toFixed(2);
          tr.innerHTML = `
            <td style="padding:0.3rem 0.5rem;font-family:monospace;font-weight:600;font-size:0.78rem;">${item.code}</td>
            <td style="padding:0.3rem 0.5rem;font-size:0.78rem;">${item.name}</td>
            <td style="padding:0.3rem 0.5rem;font-size:0.78rem;">${item.category}</td>
            <td style="padding:0.3rem 0.5rem;text-align:center;font-size:0.78rem;">${item.unit}</td>
            <td style="padding:0.3rem 0.5rem;text-align:right;font-size:0.78rem;">${item.stock}</td>
            <td style="padding:0.3rem 0.5rem;text-align:right;">
              <input type="number" min="1" value="${item.cantidad}" data-idx="${idx}"
                style="width:60px;border:1px solid #cbd5e0;border-radius:4px;padding:0.1rem 0.3rem;font-size:0.8rem;text-align:right;font-family:var(--font-family);outline:none;"
                class="entrada-qty-input">
            </td>
            <td style="padding:0.3rem 0.5rem;text-align:right;">
              <input type="number" min="0" step="0.01" value="${item.costo}" data-idx="${idx}"
                style="width:70px;border:1px solid #cbd5e0;border-radius:4px;padding:0.1rem 0.3rem;font-size:0.8rem;text-align:right;font-family:var(--font-family);outline:none;"
                class="entrada-cost-input">
            </td>
            <td style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:#065f46;">${total}</td>
            <td style="padding:0.3rem 0.5rem;text-align:center;">
              <button data-idx="${idx}" class="entrada-del-btn" style="background:#fee2e2;border:none;border-radius:4px;width:22px;height:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#c53030;" title="Eliminar fila">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </td>
          `;
          // Row click → select
          tr.addEventListener('click', (e) => {
            if (e.target.closest('.entrada-del-btn') || e.target.closest('input')) return;
            selectedEntradaRow = idx;
            renderEntradaTable();
          });
          entradaTableBody.appendChild(tr);
        });

        // Wire qty inputs
        entradaTableBody.querySelectorAll('.entrada-qty-input').forEach(inp => {
          inp.addEventListener('change', () => {
            const i = parseInt(inp.getAttribute('data-idx'));
            entradaItems[i].cantidad = Math.max(1, parseInt(inp.value) || 1);
            renderEntradaTable();
            recalcEntradaTotals();
          });
        });
        // Wire cost inputs
        entradaTableBody.querySelectorAll('.entrada-cost-input').forEach(inp => {
          inp.addEventListener('change', () => {
            const i = parseInt(inp.getAttribute('data-idx'));
            entradaItems[i].costo = Math.max(0, parseFloat(inp.value) || 0);
            renderEntradaTable();
            recalcEntradaTotals();
          });
        });
        // Wire delete buttons
        entradaTableBody.querySelectorAll('.entrada-del-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const i = parseInt(btn.getAttribute('data-idx'));
            entradaItems.splice(i, 1);
            if (selectedEntradaRow >= entradaItems.length) selectedEntradaRow = null;
            renderEntradaTable();
            recalcEntradaTotals();
          });
        });
      }
      recalcEntradaTotals();
    }

    function addProductToEntrada(product) {
      // Check if already in list
      const existing = entradaItems.find(it => it.code === product.code);
      if (existing) {
        existing.cantidad += 1;
      } else {
        entradaItems.push({ ...product, cantidad: 1, costo: product.cost || 0 });
      }
      renderEntradaTable();
      if (entradaProductInput) {
        entradaProductInput.value = '';
        entradaProductInput.focus();
      }
    }

    // Open Entrada modal
    if (movBtnEntrada) {
      movBtnEntrada.addEventListener('click', () => {
        entradaItems = [];
        selectedEntradaRow = null;
        renderEntradaTable();
        if (entradaNumero) {
          entradaNumero.textContent = String(entradaCounter).padStart(7, '0');
        }
        if (entradaModal) entradaModal.style.display = 'flex';
        setTimeout(() => { if (entradaProductInput) entradaProductInput.focus(); }, 100);
      });
    }

    // Close / back button
    if (entradaBackBtn) {
      entradaBackBtn.addEventListener('click', () => {
        if (entradaItems.length > 0) {
          if (!confirm('¿Desea cerrar sin guardar la entrada? Los productos no guardados se perderán.')) return;
        }
        entradaModal.style.display = 'none';
      });
    }

    /* ----------------------------------------------------------------
       PRODUCT PICKER MODAL for Entrada
    ---------------------------------------------------------------- */
    const entradaPickerModal  = document.getElementById('entrada-picker-modal');
    const entradaPickerClose  = document.getElementById('entrada-picker-close');
    const entradaPickerSearch = document.getElementById('entrada-picker-search');
    const entradaPickerTbody  = document.getElementById('entrada-picker-tbody');
    const entradaPickerCount  = document.getElementById('entrada-picker-count');
    const entradaNuevoDesdePicker = document.getElementById('entrada-nuevo-desde-picker');

    let pickerHighlightIdx = null;  // highlighted row index in picker

    function openEntradaPicker() {
      pickerHighlightIdx = null;
      if (entradaPickerSearch) entradaPickerSearch.value = '';
      renderPickerList('');
      if (entradaPickerModal) {
        entradaPickerModal.style.display = 'flex';
        setTimeout(() => { if (entradaPickerSearch) entradaPickerSearch.focus(); }, 80);
      }
    }

    function closeEntradaPicker() {
      if (entradaPickerModal) entradaPickerModal.style.display = 'none';
      if (entradaProductInput) entradaProductInput.focus();
    }

    function renderPickerList(query) {
      if (!entradaPickerTbody) return;
      const q = query.trim().toLowerCase();
      const results = q
        ? inventoryCatalog.filter(p => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
        : [...inventoryCatalog];

      if (entradaPickerCount) {
        entradaPickerCount.textContent = `${results.length} producto${results.length !== 1 ? 's' : ''}`;
      }

      entradaPickerTbody.innerHTML = '';
      if (results.length === 0) {
        entradaPickerTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#a0aec0;padding:2rem;">No se encontraron productos</td></tr>`;
        pickerHighlightIdx = null;
        return;
      }

      results.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.style.borderBottom = '1px solid #f0f4f8';
        tr.style.background = idx % 2 === 0 ? 'white' : '#f8fafc';
        if (pickerHighlightIdx === idx) {
          tr.style.background = '#dbeafe';
          tr.style.outline = '2px solid #3b82f6';
        }
        tr.innerHTML = `
          <td style="padding:0.35rem 0.75rem;font-family:monospace;font-weight:600;font-size:0.78rem;white-space:nowrap;">${p.code}</td>
          <td style="padding:0.35rem 0.75rem;font-size:0.8rem;">${p.name}</td>
          <td style="padding:0.35rem 0.75rem;font-size:0.78rem;color:#718096;">${p.category}</td>
          <td style="padding:0.35rem 0.75rem;text-align:center;font-size:0.78rem;">${p.unit}</td>
          <td style="padding:0.35rem 0.75rem;text-align:right;font-weight:700;font-size:0.78rem;color:${p.stock === 0 ? '#c53030' : '#065f46'};">${p.stock}</td>
          <td style="padding:0.35rem 0.75rem;text-align:right;font-size:0.78rem;">${(p.cost || 0).toFixed(2)}</td>
        `;
        // Single click → highlight
        tr.addEventListener('click', () => {
          pickerHighlightIdx = idx;
          renderPickerList(entradaPickerSearch?.value || '');
        });
        // Double click → add immediately
        tr.addEventListener('dblclick', () => {
          addProductToEntrada(p);
          closeEntradaPicker();
        });
        tr.setAttribute('data-picker-idx', idx);
        tr.setAttribute('data-picker-code', p.code);
        entradaPickerTbody.appendChild(tr);
      });

      // Store results for keyboard nav
      entradaPickerTbody._pickerResults = results;
    }

    // Live search
    if (entradaPickerSearch) {
      entradaPickerSearch.addEventListener('input', () => {
        pickerHighlightIdx = null;
        renderPickerList(entradaPickerSearch.value);
      });
      // Keyboard navigation in picker
      entradaPickerSearch.addEventListener('keydown', (e) => {
        const results = entradaPickerTbody._pickerResults || [];
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          pickerHighlightIdx = (pickerHighlightIdx === null) ? 0 : Math.min(pickerHighlightIdx + 1, results.length - 1);
          renderPickerList(entradaPickerSearch.value);
          // Scroll highlighted row into view
          const highlighted = entradaPickerTbody.querySelector(`tr[data-picker-idx="${pickerHighlightIdx}"]`);
          if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          pickerHighlightIdx = (pickerHighlightIdx === null) ? 0 : Math.max(pickerHighlightIdx - 1, 0);
          renderPickerList(entradaPickerSearch.value);
          const highlighted = entradaPickerTbody.querySelector(`tr[data-picker-idx="${pickerHighlightIdx}"]`);
          if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (pickerHighlightIdx !== null && results[pickerHighlightIdx]) {
            addProductToEntrada(results[pickerHighlightIdx]);
            closeEntradaPicker();
          }
        } else if (e.key === 'Escape') {
          closeEntradaPicker();
        }
      });
    }

    // Close picker buttons
    if (entradaPickerClose) entradaPickerClose.addEventListener('click', closeEntradaPicker);

    // "Crear Nuevo Producto" from picker footer
    if (entradaNuevoDesdePicker) {
      entradaNuevoDesdePicker.addEventListener('click', () => {
        closeEntradaPicker();
        invAddBtn.click();
      });
    }

    // Lupa button → open picker
    if (entradaProductSearch) {
      entradaProductSearch.addEventListener('click', () => {
        const q = entradaProductInput?.value?.trim() || '';
        if (entradaPickerSearch) entradaPickerSearch.value = q;
        openEntradaPicker();
        if (q) renderPickerList(q);
      });
    }

    // Typing in product input + Enter → direct match or open picker
    if (entradaProductInput) {
      entradaProductInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const q = entradaProductInput.value.trim().toLowerCase();
          if (!q) { openEntradaPicker(); return; }
          const exact = inventoryCatalog.find(p => p.code.toLowerCase() === q);
          if (exact) {
            addProductToEntrada(exact);
            entradaProductInput.value = '';
          } else {
            openEntradaPicker();
            if (entradaPickerSearch) entradaPickerSearch.value = entradaProductInput.value;
            renderPickerList(entradaProductInput.value);
          }
        }
      });
    }

    // "Nuevo Producto" button in Entrada toolbar → open add-product modal
    if (entradaNuevoProdBtn) {
      entradaNuevoProdBtn.addEventListener('click', () => {
        invAddBtn.click();
      });
    }

    // Borrar (delete selected row)
    if (entradaBtnBorrar) {
      entradaBtnBorrar.addEventListener('click', () => {
        if (selectedEntradaRow === null || entradaItems.length === 0) {
          alert('Seleccione un producto de la lista para eliminarlo.');
          return;
        }
        entradaItems.splice(selectedEntradaRow, 1);
        selectedEntradaRow = null;
        renderEntradaTable();
      });
    }

    // Guardar Entrada
    if (entradaBtnGuardar) {
      entradaBtnGuardar.addEventListener('click', () => {
        if (entradaItems.length === 0) {
          alert('Agregue al menos un producto a la entrada antes de guardar.');
          return;
        }
        const now = new Date();
        const dateStr = `${now.toLocaleDateString('es-VE')} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${now.getHours() >= 12 ? 'p.m.' : 'a.m.'}`;
        const almacen = document.getElementById('entrada-alm-input')?.value || 'ALMACEN 1';

        entradaItems.forEach(item => {
          // Update stock in inventoryCatalog
          const masterItem = inventoryCatalog.find(p => p.code === item.code);
          if (masterItem) {
            masterItem.stock += item.cantidad;
            masterItem.cost = item.costo; // update cost with entry cost
          }
          // Log the movement
          movimientosLog.unshift({
            fecha:    dateStr,
            tipo:     'Entrada',
            clave:    item.code,
            desc:     item.name,
            um:       item.unit,
            almacen:  almacen || 'ALMACEN 1',
            precio:   item.price1 || item.costo,
            costo:    item.costo,
            cantidad: item.cantidad
          });
        });

        entradaCounter++;
        renderInventoryTable();   // refresh catalog table
        renderMovimientosTable(); // refresh movements log

        alert(`✅ Entrada N° ${String(entradaCounter - 1).padStart(7, '0')} guardada.\n${entradaItems.length} producto(s) ingresados al inventario.`);
        entradaModal.style.display = 'none';
      });
    }
  } // end Movimientos + Entrada block



  /* ==========================================================================
     7. SEARCH PRODUCT LOOKUP MODAL CONTROLLER
     ========================================================================== */

  // DOM Elements - Search Product Modal
  const searchProductModal = document.getElementById('search-product-modal');
  const closeSearchModalBtn = document.getElementById('close-search-modal-btn');
  const searchModalTableBody = document.getElementById('search-modal-table-body');
  const modalSearchInput = document.getElementById('modal-search-input');

  // Open search modal
  function openSearchProductModal() {
    searchProductModal.style.display = 'flex';
    modalSearchInput.value = '';
    renderSearchModalTable();
    setTimeout(() => modalSearchInput.focus(), 50);
  }

  // Close search modal
  function closeSearchProductModal() {
    searchProductModal.style.display = 'none';
  }

  // Bind close buttons
  closeSearchModalBtn.addEventListener('click', () => {
    closeSearchProductModal();
  });

  // Render modal table rows based on filter
  function renderSearchModalTable(filterQuery = '') {
    searchModalTableBody.innerHTML = '';
    const query = filterQuery.toLowerCase().trim();

    const filtered = inventoryCatalog.filter(item => 
      item.code.toLowerCase().includes(query) || 
      item.name.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      searchModalTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: #888888; padding: 1.5rem;">No se encontraron productos en el catálogo.</td>
        </tr>
      `;
      return;
    }

    filtered.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-code', item.code);
      
      // Auto-select the first item on render
      if (index === 0) {
        tr.classList.add('selected-row');
      }

      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: 600;">${item.code}</td>
        <td>${item.name}</td>
        <td style="text-align: center;">${item.unit}</td>
        <td style="text-align: right; font-weight: 600;">
          $ ${item.price1.toFixed(2)}
          <span class="price-bs">Bs ${(item.price1 * exchangeRate).toFixed(2)}</span>
        </td>
        <td style="text-align: center;" class="${item.stock === 0 ? 'stock-zero' : ''}">${item.stock}</td>
      `;

      // Single click selects
      tr.addEventListener('click', () => {
        searchModalTableBody.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row'));
        tr.classList.add('selected-row');
      });

      // Double click adds to cart and closes
      tr.addEventListener('dblclick', () => {
        if (addItemToCart(item)) {
          closeSearchProductModal();
          posProductInput.focus();
        }
      });

      searchModalTableBody.appendChild(tr);
    });
  }

  // Modal live search input
  modalSearchInput.addEventListener('input', () => {
    // If the input matches a product code exactly (from autocomplete datalist click)
    const val = modalSearchInput.value.trim().toUpperCase();
    const matched = inventoryCatalog.find(item => item.code.toUpperCase() === val);
    if (matched) {
      if (addItemToCart(matched)) {
        closeSearchProductModal();
        posProductInput.focus();
      }
      return;
    }
    // Otherwise, filter table rows
    renderSearchModalTable(modalSearchInput.value);
  });

  // Handle keys for navigating and selecting in the search modal
  modalSearchInput.addEventListener('keydown', (e) => {
    const rows = Array.from(searchModalTableBody.querySelectorAll('tr'));
    if (rows.length === 0 || rows[0].querySelector('td[colspan]')) {
      return;
    }

    let selectedRow = searchModalTableBody.querySelector('tr.selected-row');
    let selectedIndex = rows.indexOf(selectedRow);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (selectedIndex === -1) {
        rows[0].classList.add('selected-row');
        rows[0].scrollIntoView({ block: 'nearest' });
      } else if (selectedIndex < rows.length - 1) {
        selectedRow.classList.remove('selected-row');
        rows[selectedIndex + 1].classList.add('selected-row');
        rows[selectedIndex + 1].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (selectedIndex > 0) {
        selectedRow.classList.remove('selected-row');
        rows[selectedIndex - 1].classList.add('selected-row');
        rows[selectedIndex - 1].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedRow) {
        const code = selectedRow.getAttribute('data-code');
        const item = inventoryCatalog.find(p => p.code === code);
        if (item) {
          if (addItemToCart(item)) {
            closeSearchProductModal();
            posProductInput.focus();
          }
        }
      }
    }
  });



  // Handle ESC key to close modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (searchProductModal.style.display === 'flex') {
        closeSearchProductModal();
        posProductInput.focus();
      } else if (checkoutModal.style.display === 'flex') {
        checkoutModal.style.display = 'none';
        posProductInput.focus();
      } else if (reprintModal.style.display === 'flex') {
        reprintModal.style.display = 'none';
        posProductInput.focus();
      } else if (devolucionModal.style.display === 'flex') {
        devolucionModal.style.display = 'none';
        posProductInput.focus();
      }
    }
  });

  // Global tab switching helper
  function switchTab(targetTab) {
    if (!currentSession.isOpened) return;

    const tabEl = Array.from(tabItems).find(tab => tab.getAttribute('data-tab') === targetTab);
    if (!tabEl) return;

    // Update active states in buttons
    tabItems.forEach(item => item.classList.remove('active'));
    tabEl.classList.add('active');

    // Update active states in panels
    tabPanels.forEach(panel => {
      panel.classList.remove('active-panel');
      if (panel.getAttribute('id') === `tab-${targetTab}`) {
        panel.classList.add('active-panel');
      }
    });

    // Auto-focus main input if transitioning to Caja
    if (targetTab === 'caja') {
      setTimeout(() => posProductInput.focus(), 50);
    } else if (targetTab === 'clientes') {
      renderClientesCatalogoTable();
    }
  }

  // Global Keydown Keyboard Shortcuts Listener (F1-F5, +, -, Supr)
  window.addEventListener('keydown', (e) => {
    // Intercept F12 globally to enter Checkout (Cobrar) and prevent browser DevTools
    if (e.key === 'F12') {
      e.preventDefault();
      if (currentSession.isOpened) {
        switchTab('caja');
        if (currentSale.length > 0) {
          checkoutPayBtn.click();
        }
      }
      return;
    }

    // Only capture shortcuts if cash register has been opened
    if (!currentSession.isOpened) return;

    // F1 - F5: Navigate Workspaces
    if (e.key === 'F1') {
      e.preventDefault();
      switchTab('caja');
    } else if (e.key === 'F2') {
      e.preventDefault();
      switchTab('inventario');
    } else if (e.key === 'F3') {
      e.preventDefault();
      switchTab('ventas');
    } else if (e.key === 'F4') {
      e.preventDefault();
      switchTab('clientes');
    } else if (e.key === 'F9') {
      e.preventDefault();
      switchTab('tasa');
    } else if (e.key === 'F10') {
      e.preventDefault();
      switchTab('config');
    }

    // Shopping List quantity/delete modifications (+, -, Delete)
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    if (!isTyping && selectedRowIndex !== null) {
      const item = currentSale[selectedRowIndex];

      if (e.key === '+' || e.key === 'Add') {
        e.preventDefault();
        const product = inventoryCatalog.find(p => p.code === item.code);
        if (product && item.qty >= product.stock) {
          alert(`No hay más stock disponible para este producto. (Stock disponible: ${product.stock})`);
          return;
        }
        item.qty += 1;
        item.totalUSD = item.qty * item.priceUSD;
        renderSaleTable(true); // Keep current selected row highlighted
      } else if (e.key === '-' || e.key === 'Subtract') {
        e.preventDefault();
        if (item.qty > 1) {
          item.qty -= 1;
          item.totalUSD = item.qty * item.priceUSD;
          renderSaleTable(true);
        } else {
          // If quantity is 1 and user presses minus, remove immediately without confirmation
          currentSale.splice(selectedRowIndex, 1);
          renderSaleTable(false);
        }
      } else if (e.key === 'Delete' || e.key === 'Del') {
        e.preventDefault();
        // Remove immediately without confirmation
        currentSale.splice(selectedRowIndex, 1);
        renderSaleTable(false);
      }
    }
  });

  /* ==========================================================================
     8. SYSTEM CONFIGURATION PANEL CONTROLLER
     ========================================================================== */

  const configSubTabItems = document.querySelectorAll('.config-sub-tab-item');
  const configSubPanels = document.querySelectorAll('.config-sub-panel');

  // Sub-tabs navigation
  configSubTabItems.forEach(btn => {
    btn.addEventListener('click', () => {
      configSubTabItems.forEach(item => item.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.getAttribute('data-subtab');
      configSubPanels.forEach(panel => {
        panel.classList.remove('active-sub-panel');
        if (panel.getAttribute('id') === `config-panel-${targetTab}`) {
          panel.classList.add('active-sub-panel');
        }
      });

      if (targetTab === 'usuarios') {
        renderConfigUsersTable();
      }
    });
  });

  // Business Info Config Save handler
  const configSaveBizBtn = document.getElementById('config-save-biz-btn');
  if (configSaveBizBtn) {
    configSaveBizBtn.addEventListener('click', (e) => {
      e.preventDefault();
      
      const name = document.getElementById('config-biz-name').value.trim();
      const ruc = document.getElementById('config-biz-ruc').value.trim();
      const phone = document.getElementById('config-biz-phone').value.trim();
      const email = document.getElementById('config-biz-email').value.trim();
      const address = document.getElementById('config-biz-address').value.trim();
      
      if (!name) {
        alert('El nombre del negocio es obligatorio.');
        return;
      }

      const info = { name, ruc, phone, email, address };
      localStorage.setItem('pos_biz_info', JSON.stringify(info));
      applyBusinessDetails(info);
      
      alert('Datos del negocio guardados con éxito.');
    });
  }

  // User Management DOM elements
  const configUserSearch = document.getElementById('config-user-search');
  const configUsersTableBody = document.getElementById('config-users-table-body');
  
  const configUserKey = document.getElementById('config-user-key');
  const configUserNames = document.getElementById('config-user-names');
  const configUserPass = document.getElementById('config-user-pass');
  const configUserConfirm = document.getElementById('config-user-confirm');
  const configUserLevel = document.getElementById('config-user-level');
  const configUserPhone = document.getElementById('config-user-phone');
  const configUserEmail = document.getElementById('config-user-email');
  const configUserActive = document.getElementById('config-user-active');

  const configUserBtnNew = document.getElementById('config-user-btn-new');
  const configUserBtnModify = document.getElementById('config-user-btn-modify');
  const configUserBtnDelete = document.getElementById('config-user-btn-delete');
  const configUserBtnSave = document.getElementById('config-user-btn-save');

  let selectedUserIndex = 0;

  // Search input filter event
  if (configUserSearch) {
    configUserSearch.addEventListener('input', renderConfigUsersTable);
  }

  // Render users table list
  function renderConfigUsersTable() {
    if (!configUsersTableBody) return;
    configUsersTableBody.innerHTML = '';

    const query = configUserSearch.value.toLowerCase().trim();

    systemUsers.forEach((user, idx) => {
      // Filter search matches
      if (query) {
        const keyMatch = user.u.toLowerCase().includes(query);
        const nameMatch = user.display.toLowerCase().includes(query);
        const roleMatch = user.role.toLowerCase().includes(query);
        if (!keyMatch && !nameMatch && !roleMatch) return;
      }

      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.style.transition = 'background-color 0.15s';
      if (selectedUserIndex === idx) {
        tr.style.backgroundColor = '#b2dfdb';
        tr.style.color = '#004d40';
        tr.style.fontWeight = 'bold';
      }

      tr.innerHTML = `
        <td style="padding: 0.35rem 0.5rem; font-family: monospace; font-weight: 600;">${user.u}</td>
        <td style="padding: 0.35rem 0.5rem;">${user.display}</td>
        <td style="padding: 0.35rem 0.5rem; font-weight: 600;">${user.role}</td>
      `;

      tr.addEventListener('click', () => {
        selectedUserIndex = idx;
        populateUserForm(user);
        renderConfigUsersTable();
      });

      configUsersTableBody.appendChild(tr);
    });
  }

  // Populate right-side form with user values
  function populateUserForm(user) {
    configUserKey.value = user.u;
    configUserKey.disabled = true; // disable editing primary key key
    configUserNames.value = user.display;
    configUserPass.value = user.p;
    configUserConfirm.value = user.p;
    configUserLevel.value = user.role;
    configUserPhone.value = user.phone || '';
    configUserEmail.value = user.email || '';
    configUserActive.checked = user.active !== false;
  }

  // Clear form
  function clearUserForm() {
    configUserKey.value = '';
    configUserKey.disabled = false;
    configUserNames.value = '';
    configUserPass.value = '';
    configUserConfirm.value = '';
    configUserLevel.value = 'VENDEDOR';
    configUserPhone.value = '';
    configUserEmail.value = '';
    configUserActive.checked = true;
    selectedUserIndex = null;
    
    // De-highlight selected rows
    const rows = configUsersTableBody.querySelectorAll('tr');
    rows.forEach(r => r.style.backgroundColor = '');
  }

  // Action: Nuevo
  if (configUserBtnNew) {
    configUserBtnNew.addEventListener('click', (e) => {
      e.preventDefault();
      clearUserForm();
      configUserKey.focus();
    });
  }

  // Action: Guardar / Crear / Modificar
  if (configUserBtnSave || configUserBtnModify) {
    const handleSave = (e) => {
      e.preventDefault();

      const userKey = configUserKey.value.trim().toUpperCase();
      const userNames = configUserNames.value.trim();
      const userPass = configUserPass.value;
      const userConfirm = configUserConfirm.value;
      const userLevel = configUserLevel.value;
      const userPhone = configUserPhone.value.trim();
      const userEmail = configUserEmail.value.trim();
      const userActive = configUserActive.checked;

      if (!userKey || !userNames || !userPass) {
        alert('Por favor, complete los campos obligatorios: Usuario, Nombres y Clave.');
        return;
      }

      if (userPass !== userConfirm) {
        alert('Las contraseñas ingresadas no coinciden.');
        return;
      }

      // If selectedUserIndex is not null, we are updating
      if (selectedUserIndex !== null) {
        const existing = systemUsers[selectedUserIndex];
        existing.display = userNames;
        existing.p = userPass;
        existing.role = userLevel;
        existing.phone = userPhone;
        existing.email = userEmail;
        existing.active = userActive;
        alert('Usuario modificado con éxito.');
      } else {
        // Creating new user
        // Check duplicate
        if (systemUsers.some(u => u.u.toUpperCase() === userKey)) {
          alert('Error: Ya existe un usuario con este identificador.');
          return;
        }

        systemUsers.push({
          u: userKey,
          display: userNames,
          p: userPass,
          role: userLevel,
          phone: userPhone,
          email: userEmail,
          active: userActive
        });
        alert('Usuario creado con éxito.');
        selectedUserIndex = systemUsers.length - 1;
      }

      renderConfigUsersTable();
    };

    if (configUserBtnSave) configUserBtnSave.addEventListener('click', handleSave);
    if (configUserBtnModify) configUserBtnModify.addEventListener('click', handleSave);
  }

  // Action: Eliminar
  if (configUserBtnDelete) {
    configUserBtnDelete.addEventListener('click', (e) => {
      e.preventDefault();

      if (selectedUserIndex === null) {
        alert('Por favor, seleccione un usuario de la lista para eliminar.');
        return;
      }

      const userToDelete = systemUsers[selectedUserIndex];
      if (userToDelete.u === '001' || userToDelete.u.toLowerCase() === 'admin') {
        alert('Error: No se puede eliminar el usuario administrador del sistema.');
        return;
      }

      const confirmDel = confirm(`¿Está seguro de que desea eliminar el usuario "${userToDelete.display}"?`);
      if (confirmDel) {
        systemUsers.splice(selectedUserIndex, 1);
        clearUserForm();
        renderConfigUsersTable();
        alert('Usuario eliminado del sistema.');
      }
    });
  }

  /* ==========================================================================
     9. CLIENT MANAGEMENT WORKSPACE CONTROLLER
     ========================================================================== */

  const clientesSubTabItems = document.querySelectorAll('.clientes-sub-tab-item');
  const clientesSubPanels = [
    document.getElementById('clientes-panel-catalogo'),
    document.getElementById('clientes-panel-historial'),
    document.getElementById('clientes-panel-ranking'),
    document.getElementById('clientes-panel-creditos')
  ];

  let selectedClientIndex = 0; // Default selection

  // Subtab switching
  clientesSubTabItems.forEach(btn => {
    btn.addEventListener('click', () => {
      clientesSubTabItems.forEach(item => {
        item.classList.remove('active');
        item.style.backgroundColor = '#20589d';
        item.style.color = 'white';
      });
      btn.classList.add('active');
      btn.style.backgroundColor = '#f8fafc';
      btn.style.color = '#20589d';

      const targetTab = btn.getAttribute('data-subtab');
      clientesSubPanels.forEach(panel => {
        if (panel) panel.style.display = 'none';
      });

      const activePanel = document.getElementById(`clientes-panel-${targetTab}`);
      if (activePanel) {
        activePanel.style.display = 'flex';
        activePanel.classList.add('active-sub-panel');
      }

      // Render corresponding content
      if (targetTab === 'catalogo') {
        renderClientesCatalogoTable();
      } else if (targetTab === 'historial') {
        renderClientesHistorialTable();
      } else if (targetTab === 'ranking') {
        renderClientesRankingTable();
      } else if (targetTab === 'creditos') {
        renderClientesCreditosTable();
      }
    });
  });

  // Tab: Catálogo variables
  const clientesSearchInput = document.getElementById('clientes-search-input');
  const clientesCatalogoTableBody = document.getElementById('clientes-catalogo-table-body');
  const cliStatPending = document.getElementById('cli-stat-pending');
  const cliStatTotal = document.getElementById('cli-stat-total');

  const clientesBtnAdd = document.getElementById('clientes-btn-add');
  const clientesBtnModify = document.getElementById('clientes-btn-modify');
  const clientesBtnDelete = document.getElementById('clientes-btn-delete');
  const clientesBtnDetail = document.getElementById('clientes-btn-detail');

  if (clientesSearchInput) {
    clientesSearchInput.addEventListener('input', renderClientesCatalogoTable);
  }

  function updateClientStats() {
    let pendingSum = 0;
    systemClients.forEach(c => pendingSum += c.pending);
    if (cliStatPending) cliStatPending.textContent = pendingSum.toFixed(2);
    if (cliStatTotal) cliStatTotal.textContent = systemClients.length;
  }

  function renderClientesCatalogoTable() {
    if (!clientesCatalogoTableBody) return;
    clientesCatalogoTableBody.innerHTML = '';
    updateClientStats();

    const query = (clientesSearchInput ? clientesSearchInput.value : '').toLowerCase().trim();

    systemClients.forEach((client, idx) => {
      if (query && !client.name.toLowerCase().includes(query)) return;

      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.style.transition = 'background-color 0.15s';
      if (selectedClientIndex === idx) {
        tr.style.backgroundColor = '#b2dfdb';
        tr.style.color = '#004d40';
        tr.style.fontWeight = 'bold';
      }

      tr.innerHTML = `
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${client.name}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${client.rfc || ''}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${client.phone || ''}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right;">${client.limit.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right;">${client.available.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right; color: ${client.pending > 0 ? '#c53030' : 'inherit'}; font-weight: ${client.pending > 0 ? 'bold' : 'normal'};">${client.pending.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right;">${client.points.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right;">${(client.pointBalance || 0).toFixed(2)}</td>
      `;

      tr.addEventListener('click', () => {
        selectedClientIndex = idx;
        renderClientesCatalogoTable();
      });

      clientesCatalogoTableBody.appendChild(tr);
    });

    // Update action button states dynamically based on selection
    const hasSelection = selectedClientIndex !== null && selectedClientIndex >= 0 && selectedClientIndex < systemClients.length;
    if (clientesBtnModify) clientesBtnModify.disabled = !hasSelection;
    if (clientesBtnDelete) clientesBtnDelete.disabled = !hasSelection;
    if (clientesBtnDetail) clientesBtnDetail.disabled = !hasSelection;
  }

  // Action Add/Modify/Delete
  if (clientesBtnAdd) {
    clientesBtnAdd.addEventListener('click', (e) => {
      e.preventDefault();
      const name = prompt('Ingrese Nombre del Cliente:');
      if (!name) return;
      const rfc = prompt('Ingrese RFC / Cédula:');
      const phone = prompt('Ingrese Teléfono:');
      const limitStr = prompt('Ingrese Límite de Crédito ($):', '20.00');
      const limit = parseFloat(limitStr) || 0.00;

      systemClients.push({
        name: name.toUpperCase(),
        rfc: rfc || '',
        phone: phone || '',
        limit: limit,
        available: limit,
        pending: 0.00,
        points: 0.00,
        pointBalance: 0.00,
        history: []
      });

      selectedClientIndex = systemClients.length - 1;
      renderClientesCatalogoTable();
      alert('Cliente agregado exitosamente.');
    });
  }

  if (clientesBtnModify) {
    clientesBtnModify.addEventListener('click', (e) => {
      e.preventDefault();
      const client = systemClients[selectedClientIndex];
      if (!client) {
        alert('Por favor, seleccione un cliente.');
        return;
      }
      const newName = prompt('Modificar Nombre:', client.name);
      if (!newName) return;
      client.name = newName.toUpperCase();
      client.rfc = prompt('Modificar RFC / Cédula:', client.rfc);
      client.phone = prompt('Modificar Teléfono:', client.phone);
      const limitStr = prompt('Modificar Límite de Crédito ($):', client.limit.toString());
      client.limit = parseFloat(limitStr) || 0.00;
      client.available = client.limit - client.pending;

      renderClientesCatalogoTable();
      alert('Cliente modificado.');
    });
  }

  if (clientesBtnDelete) {
    clientesBtnDelete.addEventListener('click', (e) => {
      e.preventDefault();
      const client = systemClients[selectedClientIndex];
      if (!client) return;
      if (client.pending > 0) {
        alert('No se puede eliminar un cliente con saldo pendiente de cobro.');
        return;
      }
      if (confirm(`¿Seguro que desea eliminar el cliente "${client.name}"?`)) {
        systemClients.splice(selectedClientIndex, 1);
        selectedClientIndex = 0;
        renderClientesCatalogoTable();
        alert('Cliente eliminado.');
      }
    });
  }

  if (clientesBtnDetail) {
    clientesBtnDetail.addEventListener('click', () => {
      const client = systemClients[selectedClientIndex];
      if (!client) return;
      alert(`Detalle Cliente: \nNombre: ${client.name}\nRFC: ${client.rfc}\nTeléfono: ${client.phone}\nLímite Crédito: $${client.limit.toFixed(2)}\nSaldo Pendiente: $${client.pending.toFixed(2)}`);
    });
  }

  // Tab: Historial Detalle
  const clientesHistStart = document.getElementById('clientes-hist-start');
  const clientesHistEnd = document.getElementById('clientes-hist-end');
  const clientesHistUser = document.getElementById('clientes-hist-user');
  const clientesHistSearchBtn = document.getElementById('clientes-hist-search-btn');
  const clientesHistorialTableBody = document.getElementById('clientes-historial-table-body');
  const cliHistDesc = document.getElementById('cli-hist-desc');
  const cliHistTotal = document.getElementById('cli-hist-total');

  if (clientesHistSearchBtn) {
    clientesHistSearchBtn.addEventListener('click', renderClientesHistorialTable);
  }

  function renderClientesHistorialTable() {
    if (!clientesHistorialTableBody) return;
    
    const clientQuery = clientesHistUser.value.toLowerCase().trim();
    if (!clientQuery) {
      clientesHistorialTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #888888; padding: 2rem;">Ingrese un nombre de cliente para filtrar su historial.</td></tr>';
      cliHistDesc.textContent = '-';
      cliHistTotal.textContent = '$ 0.00';
      return;
    }

    const client = systemClients.find(c => c.name.toLowerCase().includes(clientQuery));
    if (!client) {
      clientesHistorialTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #888888; padding: 2rem;">Cliente no encontrado.</td></tr>';
      cliHistDesc.textContent = '-';
      cliHistTotal.textContent = '$ 0.00';
      return;
    }

    cliHistDesc.textContent = client.name;
    clientesHistorialTableBody.innerHTML = '';
    
    let totalSpent = 0;
    const historyList = client.history || [];

    if (historyList.length === 0) {
      clientesHistorialTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #888888; padding: 2rem;">El cliente no registra movimientos en el sistema.</td></tr>';
      cliHistTotal.textContent = '$ 0.00';
      return;
    }

    historyList.forEach(item => {
      if (item.type === 'VENTA') totalSpent += item.sale;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${item.date}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left; font-weight: bold; color: ${item.type === 'ABONO' ? '#2eb872' : '#20589d'};">${item.type}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${item.doc}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right;">${item.sale > 0 ? '$ ' + item.sale.toFixed(2) : '-'}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right; color: #2eb872; font-weight: bold;">${item.pay > 0 ? '$ ' + item.pay.toFixed(2) : '-'}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right; font-weight: bold;">$ ${item.balance.toFixed(2)}</td>
      `;
      clientesHistorialTableBody.appendChild(tr);
    });

    cliHistTotal.textContent = `$ ${totalSpent.toFixed(2)}`;
  }

  // Tab: Movimientos por Ranking
  const clientesRankListBody = document.getElementById('clientes-rank-list-body');
  const clientesRankDetailBody = document.getElementById('clientes-rank-detail-body');
  const cliRankTotal = document.getElementById('cli-rank-total');
  
  let selectedRankIndex = null;

  function renderClientesRankingTable() {
    if (!clientesRankListBody) return;
    clientesRankListBody.innerHTML = '';
    clientesRankDetailBody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #888888; padding: 2rem;">Seleccione un cliente del ranking para inspeccionar movimientos detallados.</td></tr>';

    // Compute sales statistics dynamically from processedSales
    const stats = {};
    processedSales.forEach(sale => {
      const cliName = (sale.client || 'PUBLICO GENERAL').toUpperCase();
      if (!stats[cliName]) {
        stats[cliName] = { salesCount: 0, devCount: 0, amountUSD: 0, details: [] };
      }
      stats[cliName].salesCount += 1;
      // Sum the sale total
      let saleSum = 0;
      sale.items.forEach(it => saleSum += it.totalUSD);
      stats[cliName].amountUSD += saleSum;

      stats[cliName].details.push({
        date: sale.date + ' ' + sale.time,
        type: 'Venta',
        num: sale.ticketNumber,
        total: saleSum,
        discount: 0.00,
        efectivo: sale.paymentMethods && sale.paymentMethods.cashUSD ? sale.paymentMethods.cashUSD : 0.00,
        tarjeta: sale.paymentMethods && sale.paymentMethods.cardBs ? (sale.paymentMethods.cardBs / exchangeRate) : 0.00,
        credito: sale.paymentMethods && sale.paymentMethods.creditUSD ? sale.paymentMethods.creditUSD : 0.00,
        puntos: 0.00
      });
    });

    // Convert statistics object to array and sort by amountUSD desc
    const sortedRanking = Object.keys(stats).map(name => {
      return { name, ...stats[name] };
    }).sort((a, b) => b.amountUSD - a.amountUSD);

    let sumTotalRank = 0;
    sortedRanking.forEach((row, idx) => {
      sumTotalRank += row.amountUSD;
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.style.transition = 'background-color 0.15s';
      if (selectedRankIndex === idx) {
        tr.style.backgroundColor = '#b2dfdb';
        tr.style.color = '#004d40';
        tr.style.fontWeight = 'bold';
        
        // Render detailed movements table on the right
        renderClientesRankDetails(row.details);
      }

      tr.innerHTML = `
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${row.name}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: center;">${row.salesCount}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: center;">${row.devCount}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right; font-weight: bold;">$ ${row.amountUSD.toFixed(2)}</td>
      `;

      tr.addEventListener('click', () => {
        selectedRankIndex = idx;
        renderClientesRankingTable();
      });

      clientesRankListBody.appendChild(tr);
    });

    if (cliRankTotal) cliRankTotal.textContent = `$ ${sumTotalRank.toFixed(2)}`;
  }

  function renderClientesRankDetails(details) {
    if (!clientesRankDetailBody) return;
    clientesRankDetailBody.innerHTML = '';
    
    details.forEach(det => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${det.date}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${det.type}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left; font-family: monospace;">${det.num}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right; font-weight: bold;">$ ${det.total.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right;">$ ${det.discount.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right;">$ ${det.efectivo.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right;">$ ${det.tarjeta.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right; color: #c53030; font-weight: bold;">$ ${det.credito.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right;">$ ${det.puntos.toFixed(2)}</td>
      `;
      clientesRankDetailBody.appendChild(tr);
    });
  }

  // Tab: Créditos / Abonos
  const clientesCredSearch = document.getElementById('clientes-cred-search');
  const clientesCredTableBody = document.getElementById('clientes-cred-table-body');
  
  const cliCredName = document.getElementById('cli-cred-name');
  const cliCredLimit = document.getElementById('cli-cred-limit');
  const cliCredAvail = document.getElementById('cli-cred-avail');
  const cliCredPending = document.getElementById('cli-cred-pending');
  
  const cliTabBtnAbonos = document.getElementById('cli-tab-btn-abonos');
  const cliTabBtnEstado = document.getElementById('cli-tab-btn-estado');
  
  const cliInnerPanelAbonos = document.getElementById('cli-inner-panel-abonos');
  const cliInnerPanelEstado = document.getElementById('cli-inner-panel-estado');

  const cliAbonoAmount = document.getElementById('cli-abono-amount');
  const cliAbonoNotes = document.getElementById('cli-abono-notes');
  const cliAbonoSubmitBtn = document.getElementById('cli-abono-submit-btn');

  const cliEstVentas = document.getElementById('cli-est-ventas');
  const cliEstAbonos = document.getElementById('cli-est-abonos');
  const cliEstadoTableBody = document.getElementById('cli-estado-table-body');

  let selectedCredIndex = 4; // Select ANA RAMONA by default to populate screen beautifully

  if (clientesCredSearch) {
    clientesCredSearch.addEventListener('input', renderClientesCreditosTable);
  }

  // Subtab switching in credits panel
  if (cliTabBtnAbonos && cliTabBtnEstado) {
    cliTabBtnAbonos.addEventListener('click', () => {
      cliTabBtnAbonos.classList.add('active');
      cliTabBtnAbonos.style.backgroundColor = '#20589d';
      cliTabBtnAbonos.style.color = 'white';

      cliTabBtnEstado.classList.remove('active');
      cliTabBtnEstado.style.backgroundColor = '#cbd5e0';
      cliTabBtnEstado.style.color = '#475569';

      cliInnerPanelAbonos.style.display = 'flex';
      cliInnerPanelEstado.style.display = 'none';
    });

    cliTabBtnEstado.addEventListener('click', () => {
      cliTabBtnEstado.classList.add('active');
      cliTabBtnEstado.style.backgroundColor = '#20589d';
      cliTabBtnEstado.style.color = 'white';

      cliTabBtnAbonos.classList.remove('active');
      cliTabBtnAbonos.style.backgroundColor = '#cbd5e0';
      cliTabBtnAbonos.style.color = '#475569';

      cliInnerPanelEstado.style.display = 'flex';
      cliInnerPanelAbonos.style.display = 'none';
      renderClientesEstadoTable();
    });
  }

  function renderClientesCreditosTable() {
    if (!clientesCredTableBody) return;
    clientesCredTableBody.innerHTML = '';

    const query = (clientesCredSearch ? clientesCredSearch.value : '').toLowerCase().trim();

    systemClients.forEach((client, idx) => {
      if (query && !client.name.toLowerCase().includes(query)) return;

      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.style.transition = 'background-color 0.15s';
      if (selectedCredIndex === idx) {
        tr.style.backgroundColor = '#b2dfdb';
        tr.style.color = '#004d40';
        tr.style.fontWeight = 'bold';
        
        // Populate stats & statement
        populateCredDetails(client);
      }

      tr.innerHTML = `
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${client.name}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${client.rfc || ''}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right; color: ${client.pending > 0 ? '#c53030' : 'inherit'}; font-weight: ${client.pending > 0 ? 'bold' : 'normal'};">$ ${client.pending.toFixed(2)}</td>
      `;

      tr.addEventListener('click', () => {
        selectedCredIndex = idx;
        renderClientesCreditosTable();
      });

      clientesCredTableBody.appendChild(tr);
    });
  }

  function populateCredDetails(client) {
    if (cliCredName) cliCredName.textContent = client.name;
    if (cliCredLimit) cliCredLimit.textContent = '$ ' + client.limit.toFixed(2);
    if (cliCredAvail) cliCredAvail.textContent = '$ ' + client.available.toFixed(2);
    if (cliCredPending) cliCredPending.textContent = '$ ' + client.pending.toFixed(2);
    renderClientesEstadoTable();
  }

  function renderClientesEstadoTable() {
    if (!cliEstadoTableBody) return;
    cliEstadoTableBody.innerHTML = '';
    
    const client = systemClients[selectedCredIndex];
    if (!client) {
      cliEstadoTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #888888; padding: 2rem;">Seleccione un cliente para ver su estado de cuenta.</td></tr>';
      return;
    }

    const historyList = client.history || [];
    let salesSum = 0;
    let abonosSum = 0;

    if (historyList.length === 0) {
      cliEstadoTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #888888; padding: 2rem;">No registra transacciones en su estado de cuenta.</td></tr>';
      cliEstVentas.textContent = '$ 0.00';
      cliEstAbonos.textContent = '$ 0.00';
      return;
    }

    historyList.forEach(item => {
      if (item.type === 'VENTA') salesSum += item.sale;
      if (item.type === 'ABONO') abonosSum += item.pay;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 0.35rem 0.5rem; text-align: left; font-weight: bold; color: ${item.type === 'ABONO' ? '#2eb872' : '#20589d'};">${item.type}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${item.date}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${item.user}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${item.station}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left; font-family: monospace;">${item.doc}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right;">${item.sale > 0 ? '$ ' + item.sale.toFixed(2) : '-'}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right; color: #2eb872; font-weight: bold;">${item.pay > 0 ? '$ ' + item.pay.toFixed(2) : '-'}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: right; font-weight: bold;">$ ${item.balance.toFixed(2)}</td>
      `;
      cliEstadoTableBody.appendChild(tr);
    });

    if (cliEstVentas) cliEstVentas.textContent = '$ ' + salesSum.toFixed(2);
    if (cliEstAbonos) cliEstAbonos.textContent = '$ ' + abonosSum.toFixed(2);
  }

  // Handle abono submission
  if (cliAbonoSubmitBtn) {
    cliAbonoSubmitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      
      const client = systemClients[selectedCredIndex];
      if (!client) {
        alert('Por favor, seleccione un cliente primero.');
        return;
      }

      const amount = parseFloat(cliAbonoAmount.value);
      if (isNaN(amount) || amount <= 0) {
        alert('Por favor, ingrese un monto de abono válido y mayor a cero.');
        return;
      }

      if (amount > client.pending) {
        alert(`Error: El abono no puede ser mayor que el saldo pendiente ($${client.pending.toFixed(2)}).`);
        return;
      }

      const notes = cliAbonoNotes.value.trim() || 'PAGO ABONO REGISTRADO';
      
      // Update client balances
      client.pending -= amount;
      client.available += amount;

      // Format current timestamp
      const now = new Date();
      const formattedDate = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      // Generate abono ticket number
      const abonoNum = '0000' + Math.floor(100 + Math.random() * 900);

      // Add to client statement history
      client.history.push({
        type: 'ABONO',
        date: formattedDate,
        user: currentUser.name.split(' - ')[0] || 'ADMIN',
        station: 'Terminal-01',
        doc: `PAGO ABONO ${abonoNum}`,
        sale: 0.00,
        pay: amount,
        balance: client.pending
      });

      // Clear input
      cliAbonoAmount.value = '';
      cliAbonoNotes.value = '';
      
      alert(`Abono de $ ${amount.toFixed(2)} registrado con éxito para "${client.name}".`);
      
      // Refresh current tables views
      renderClientesCreditosTable();
      renderClientesCatalogoTable();
    });
  }

  /* ==========================================================================
     10. POS CLIENT PICKER & QUICK REGISTRATION CONTROLLER
     ========================================================================== */

  const posClientSearchBtn = document.getElementById('pos-client-search-btn');
  const posClientAddBtn = document.getElementById('pos-client-add-btn');
  const searchClientModal = document.getElementById('search-client-modal');
  const closeSearchClientModalBtn = document.getElementById('close-search-client-modal-btn');
  const searchClientModalTableBody = document.getElementById('search-client-modal-table-body');
  const modalClientSearchInput = document.getElementById('modal-client-search-input');
  const modalClientSearchBtn = document.getElementById('modal-client-search-btn');

  // Open Search Client modal
  if (posClientSearchBtn) {
    posClientSearchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      searchClientModal.style.display = 'flex';
      modalClientSearchInput.value = '';
      renderSearchClientModalTable();
      setTimeout(() => modalClientSearchInput.focus(), 50);
    });
  }

  // Close Search Client modal
  if (closeSearchClientModalBtn) {
    closeSearchClientModalBtn.addEventListener('click', (e) => {
      e.preventDefault();
      searchClientModal.style.display = 'none';
    });
  }

  // Escape key handler to close client search modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (searchClientModal && searchClientModal.style.display === 'flex') {
        searchClientModal.style.display = 'none';
        posProductInput.focus();
      }
    }
  });

  // Search input live filter
  if (modalClientSearchInput) {
    modalClientSearchInput.addEventListener('input', () => {
      renderSearchClientModalTable(modalClientSearchInput.value);
    });
  }
  if (modalClientSearchBtn) {
    modalClientSearchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      renderSearchClientModalTable(modalClientSearchInput.value);
    });
  }

  // Render client search modal table
  function renderSearchClientModalTable(filterQuery = '') {
    if (!searchClientModalTableBody) return;
    searchClientModalTableBody.innerHTML = '';

    const query = filterQuery.toLowerCase().trim();

    // 1. Render Publico General first
    const showPublicoGeneral = !query || "publico general".includes(query);
    if (showPublicoGeneral) {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.style.transition = 'background-color 0.15s';
      tr.innerHTML = `
        <td style="font-weight: 600; padding: 0.35rem 0.5rem; text-align: left;">PUBLICO GENERAL</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">-</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">-</td>
        <td style="text-align: right; padding: 0.35rem 0.5rem; font-weight: normal;">$ 0.00</td>
      `;

      tr.addEventListener('click', () => {
        if (posClientInput) {
          posClientInput.value = "Publico General";
        }
        searchClientModal.style.display = 'none';
        posProductInput.focus();
      });

      searchClientModalTableBody.appendChild(tr);
    }

    systemClients.forEach((client, index) => {
      if (query && !client.name.toLowerCase().includes(query) && !client.rfc.toLowerCase().includes(query)) return;

      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.style.transition = 'background-color 0.15s';
      tr.innerHTML = `
        <td style="font-weight: 600; padding: 0.35rem 0.5rem; text-align: left;">${client.name}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${client.rfc || '-'}</td>
        <td style="padding: 0.35rem 0.5rem; text-align: left;">${client.phone || '-'}</td>
        <td style="text-align: right; padding: 0.35rem 0.5rem; color: ${client.pending > 0 ? '#c53030' : 'inherit'}; font-weight: ${client.pending > 0 ? 'bold' : 'normal'};">$ ${client.pending.toFixed(2)}</td>
      `;

      tr.addEventListener('click', () => {
        if (posClientInput) {
          posClientInput.value = client.name;
        }
        searchClientModal.style.display = 'none';
        posProductInput.focus();
      });

      searchClientModalTableBody.appendChild(tr);
    });

    if (searchClientModalTableBody.innerHTML === '') {
      searchClientModalTableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: #888888; padding: 1.5rem;">No se encontraron clientes registrados.</td>
        </tr>
      `;
    }
  }

  // Quick register client via POS Plus button
  if (posClientAddBtn) {
    posClientAddBtn.addEventListener('click', (e) => {
      e.preventDefault();
      
      const name = prompt('Ingrese Nombre del nuevo cliente:');
      if (!name) return;
      
      const rfc = prompt('Ingrese RFC / Cédula del cliente:');
      const phone = prompt('Ingrese Teléfono del cliente:');
      const limitStr = prompt('Ingrese Límite de Crédito ($) del cliente:', '20.00');
      const limit = parseFloat(limitStr) || 0.00;

      const newClient = {
        name: name.toUpperCase(),
        rfc: rfc || '',
        phone: phone || '',
        limit: limit,
        available: limit,
        pending: 0.00,
        points: 0.00,
        pointBalance: 0.00,
        history: []
      };

      systemClients.push(newClient);
      
      // Update POS client input and catalog tables
      if (posClientInput) {
        posClientInput.value = newClient.name;
      }
      
      renderClientesCatalogoTable();
      alert(`Cliente "${newClient.name}" registrado con éxito y seleccionado en Caja.`);
      posProductInput.focus();
    });
  }
  // Autofocus posProductInput on main workspace clicks if no other input is active
  document.addEventListener('click', (e) => {
    // Only if active tab is Caja AND user is NOT editing a sale row
    if (isEditingSaleRow) return;
    const activeTab = document.querySelector('.tab-item.active');
    if (activeTab && activeTab.getAttribute('data-tab') === 'caja') {
      // If modal is not open
      const isModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
      if (!isModalOpen) {
        const tag = e.target.tagName;
        // Exclude clicks inside the sales table (row selection, edit, delete operations)
        const isInSalesTable = !!e.target.closest('#sales-table');
        // Exclude interactive elements
        const isInteractive = isInSalesTable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' ||
          tag === 'SELECT' || tag === 'A' ||
          e.target.closest('button') || e.target.closest('input') || e.target.closest('select');
        if (!isInteractive) {
          setTimeout(() => {
            if (!isEditingSaleRow && posProductInput) posProductInput.focus();
          }, 30);
        }
      }
    }
  });

  /* ==========================================================================
     TASA MODULE CONTROLLER (F9 TASA)
     ========================================================================== */
  {
    const tasaInputDia = document.getElementById('tasa-input-dia');
    const tasaInputVuelto = document.getElementById('tasa-input-vuelto');
    const tasaSaveBtn = document.getElementById('tasa-save-btn');
    const tasaClearBtn = document.getElementById('tasa-clear-btn');
    const tasaDisplayDia = document.getElementById('tasa-display-dia');
    const tasaDisplayVuelto = document.getElementById('tasa-display-vuelto');
    const tasaAlertBanner = document.getElementById('tasa-alert-banner');
    const tasaHistoryTbody = document.getElementById('tasa-history-tbody');
    const tasaHistoryCount = document.getElementById('tasa-history-count');
    const tasaDisplayDiaLabel = document.getElementById('tasa-display-dia-label');
    const tasaDisplayVueltoLabel = document.getElementById('tasa-display-vuelto-label');

    function updateTasaDisplayCards() {
      if (tasaDia === null) {
        tasaDisplayDia.textContent = '—';
        if (tasaDisplayDiaLabel) tasaDisplayDiaLabel.textContent = 'No configurada';
        if (tasaAlertBanner) tasaAlertBanner.style.display = 'flex';
      } else {
        tasaDisplayDia.textContent = `${tasaDia.toFixed(2)} Bs`;
        if (tasaDisplayDiaLabel) tasaDisplayDiaLabel.textContent = 'Tasa activa';
        if (tasaAlertBanner) tasaAlertBanner.style.display = 'none';
      }
      if (tasaVuelto === null) {
        tasaDisplayVuelto.textContent = tasaDia ? `${tasaDia.toFixed(2)} Bs *` : '—';
        if (tasaDisplayVueltoLabel) tasaDisplayVueltoLabel.textContent = tasaDia ? 'Usa tasa del día (por defecto)' : 'Usa tasa del día si vacío';
      } else {
        tasaDisplayVuelto.textContent = `${tasaVuelto.toFixed(2)} Bs`;
        if (tasaDisplayVueltoLabel) tasaDisplayVueltoLabel.textContent = 'Tasa de vuelto activa';
      }
    }

    function renderTasaHistory() {
      if (!tasaHistoryTbody) return;
      // Update count badge
      if (tasaHistoryCount) {
        tasaHistoryCount.textContent = `${tasaHistory.length} registro${tasaHistory.length !== 1 ? 's' : ''}`;
      }
      if (tasaHistory.length === 0) {
        tasaHistoryTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #a0aec0; padding: 2rem;">Sin historial registrado</td></tr>`;
        return;
      }
      tasaHistoryTbody.innerHTML = '';
      // Show newest first — mark the latest row
      [...tasaHistory].reverse().forEach((entry, idx) => {
        const isLatest = idx === 0;
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f0f4f8';
        if (isLatest) {
          tr.style.background = '#f0fdf4';
          tr.style.fontWeight = '700';
        }
        tr.innerHTML = `
          <td style="padding: 0.38rem 0.85rem; color: #4a5568; white-space: nowrap;">${entry.date}${isLatest ? ' <span style="background:#16a34a;color:white;font-size:0.65rem;padding:0.05rem 0.35rem;border-radius:99px;font-weight:700;vertical-align:middle;">ÚLTIMA</span>' : ''}</td>
          <td style="padding: 0.38rem 0.6rem; color: #4a5568; white-space: nowrap;">${entry.time}</td>
          <td style="padding: 0.38rem 0.85rem; text-align: right; font-weight: 700; color: #1b8589;">${entry.dia.toFixed(2)}</td>
          <td style="padding: 0.38rem 0.85rem; text-align: right; font-weight: 700; color: #20589d;">${entry.vuelto !== null ? entry.vuelto.toFixed(2) : '<span style="color:#a0aec0;font-weight:500;font-style:italic;">(usa día)</span>'}</td>
          <td style="padding: 0.38rem 0.85rem; color: #4a5568; white-space: nowrap;">${entry.usuario || '—'}</td>
        `;
        tasaHistoryTbody.appendChild(tr);
      });
    }

    if (tasaSaveBtn) {
      tasaSaveBtn.addEventListener('click', () => {
        const diaVal = parseFloat(tasaInputDia.value);
        if (isNaN(diaVal) || diaVal <= 0) {
          alert('⚠️ La Tasa del Día es obligatoria y debe ser mayor a cero.');
          tasaInputDia.focus();
          return;
        }

        const vueltoRaw = tasaInputVuelto.value.trim();
        const vueltoVal = vueltoRaw !== '' ? parseFloat(vueltoRaw) : null;
        if (vueltoRaw !== '' && (isNaN(vueltoVal) || vueltoVal <= 0)) {
          alert('⚠️ La Tasa de Vuelto debe ser mayor a cero o dejarse vacía para usar la Tasa del Día.');
          tasaInputVuelto.focus();
          return;
        }

        // Apply to session locals
        tasaDia    = diaVal;
        tasaVuelto = vueltoVal;
        exchangeRate = tasaDia;

        // Persist to module-scope globals so next login session inherits these values
        _tasaDia    = diaVal;
        _tasaVuelto = vueltoVal;
        _exchangeRate = diaVal;

        // Log history entry with current user
        const now = new Date();
        const entry = {
          date:    now.toLocaleDateString('es-VE'),
          time:    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dia:     tasaDia,
          vuelto:  tasaVuelto,
          usuario: currentUser.display || currentUser.name || 'Sistema'
        };
        tasaHistory.push(entry);   // same array as _tasaHistory (reference)
        localStorage.setItem('pos_tasa_history', JSON.stringify(tasaHistory));

        // Update header rate display
        if (headerRateDisplay) {
          headerRateDisplay.textContent = `Bs ${tasaDia.toFixed(2)} /$`;
        }

        updateTasaDisplayCards();
        renderTasaHistory();

        // Clear inputs after save
        tasaInputDia.value = '';
        tasaInputVuelto.value = '';
      });
    }

    if (tasaClearBtn) {
      tasaClearBtn.addEventListener('click', () => {
        if (tasaInputDia) tasaInputDia.value = '';
        if (tasaInputVuelto) tasaInputVuelto.value = '';
      });
    }

    // On initial load — show whatever the module-scope state is
    updateTasaDisplayCards();
    renderTasaHistory();

    // Alert in caja if tasa not configured when opening checkout
    const _origCheckoutClick = checkoutPayBtn.onclick;
    checkoutPayBtn.addEventListener('click', () => {
      if (tasaDia === null) {
        const proceed = confirm('⚠️ No hay ninguna Tasa del Día configurada.\nLas conversiones usarán la tasa de respaldo (Bs 36.45 /$).\n\n¿Desea continuar con la tasa de respaldo o ir a configurar la tasa?');
        if (!proceed) {
          switchTab('tasa');
          return;
        }
      }
    }, true); // capture phase so runs before open modal handler
  }

  renderClientesCatalogoTable();

  // Initialize config subtab selection default values
  if (systemUsers.length > 0) {
    populateUserForm(systemUsers[0]);
  }

  /* ==========================================================================
     REPORT VIEWER CONTROLLER
     ========================================================================== */
  {
    const reportModal          = document.getElementById('report-viewer-modal');
    const reportBackBtn        = document.getElementById('report-viewer-back-btn');
    const reportTitle          = document.getElementById('report-viewer-title');
    const reportMainTitle       = document.getElementById('report-sheet-main-title');
    const reportTableHead      = document.getElementById('report-data-table-head');
    const reportTableBody      = document.getElementById('report-data-table-body');
    const reportCurrentPageEl  = document.getElementById('report-current-page');
    const reportTotalPagesEl   = document.getElementById('report-total-pages');
    const reportFooterPageEl   = document.getElementById('report-footer-page');
    const reportFooterTotalEl  = document.getElementById('report-footer-total-pages');
    const reportTimestampEl    = document.getElementById('report-footer-timestamp');
    const reportZoomSelect     = document.getElementById('report-zoom-select');
    const reportPrintArea      = document.getElementById('report-print-area');
    const reportSearchInput    = document.getElementById('report-search-input');
    const reportSearchBtn      = document.getElementById('report-search-btn');
    const reportExportPdfBtn   = document.getElementById('report-export-pdf');
    const reportExportExcelBtn = document.getElementById('report-export-excel');
    
    // Pagination buttons
    const pageFirstBtn = document.getElementById('report-page-first');
    const pagePrevBtn  = document.getElementById('report-page-prev');
    const pageNextBtn  = document.getElementById('report-page-next');
    const pageLastBtn  = document.getElementById('report-page-last');

    // Business info header elements
    const headerBizName    = document.getElementById('report-header-bizname');
    const headerBizRuc     = document.getElementById('report-header-bizruc');
    const headerBizAddress = document.getElementById('report-header-bizaddress');
    const headerBizPhone   = document.getElementById('report-header-bizphone');
    const headerBizEmail   = document.getElementById('report-header-bizemail');

    let reportType = ''; // 'productos', 'movimientos', 'clientes'
    let rawReportData = [];
    let filteredReportData = [];
    let currentPage = 1;
    const pageSize = 25; // items per page

    function loadBusinessInfo() {
      const bizName    = document.getElementById('config-biz-name')?.value || 'INVERSIONES NIQUITAO';
      const bizRuc     = document.getElementById('config-biz-ruc')?.value || 'J-41132631';
      const bizAddress = document.getElementById('config-biz-address')?.value || '23 de Enero';
      const bizPhone   = document.getElementById('config-biz-phone')?.value || '0424-2042877';
      const bizEmail   = document.getElementById('config-biz-email')?.value || 'inversiones.niquitao3000@gmail.com';

      if (headerBizName)    headerBizName.textContent = bizName;
      if (headerBizRuc)     headerBizRuc.textContent = bizRuc;
      if (headerBizAddress) headerBizAddress.textContent = bizAddress;
      if (headerBizPhone)   headerBizPhone.textContent = bizPhone;
      if (headerBizEmail)   headerBizEmail.textContent = bizEmail;
    }

    function openReport(type) {
      reportType = type;
      loadBusinessInfo();
      
      // Update Title
      let titleText = '';
      if (type === 'productos') {
        titleText = 'Reporte de Productos';
        rawReportData = [...inventoryCatalog];
      } else if (type === 'movimientos') {
        titleText = 'Reporte de Movimientos';
        rawReportData = [...movimientosLog];
      } else if (type === 'clientes') {
        titleText = 'Reporte de Clientes';
        rawReportData = [...systemClients];
      }

      if (reportTitle)     reportTitle.textContent = titleText;
      if (reportMainTitle) reportMainTitle.textContent = titleText.toUpperCase();
      
      filteredReportData = [...rawReportData];
      currentPage = 1;
      
      if (reportSearchInput) reportSearchInput.value = '';
      if (reportTimestampEl) {
        const now = new Date();
        reportTimestampEl.textContent = `${now.toLocaleDateString('es-VE')} ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}`;
      }

      renderReportTable();
      if (reportModal) reportModal.style.display = 'flex';
    }

    function renderReportTable() {
      if (!reportTableHead || !reportTableBody) return;

      // Render Head
      let headHtml = '';
      if (reportType === 'productos') {
        headHtml = `
          <tr style="background-color: #1a365d; color: white;">
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 10%;">CLAVE</th>
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 32%;">DESCRIPCION</th>
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 12%;">DEPARTAMENTO</th>
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 12%;">ALMACEN / GIRO</th>
            <th style="padding: 0.45rem 0.5rem; text-align: center; width: 6%;">U. M.</th>
            <th style="padding: 0.45rem 0.5rem; text-align: center; width: 5%;">MINIMO</th>
            <th style="padding: 0.45rem 0.5rem; text-align: center; width: 5%;">MAXIMO</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 7%;">EXISTENCIA</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 8%;">COSTO</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 8%;">PRECIO 1</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 8%;">PRECIO 2</th>
          </tr>
        `;
      } else if (reportType === 'movimientos') {
        headHtml = `
          <tr style="background-color: #1a365d; color: white;">
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 18%;">FECHA REGISTRO</th>
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 12%;">TIPO</th>
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 11%;">CLAVE</th>
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 25%;">DESCRIPCION</th>
            <th style="padding: 0.45rem 0.5rem; text-align: center; width: 6%;">U.M.</th>
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 10%;">ALMACEN</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 8%;">PRECIO $</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 8%;">COSTO $</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 8%;">CANTIDAD</th>
          </tr>
        `;
      } else if (reportType === 'clientes') {
        headHtml = `
          <tr style="background-color: #1a365d; color: white;">
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 24%;">NOMBRE</th>
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 12%;">RFC</th>
            <th style="padding: 0.45rem 0.5rem; text-align: left; width: 12%;">TELEFONO</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 13%;">LIMITE CREDITO</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 13%;">CREDITO DISPONIBLE</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 13%;">SALDO PENDIENTE</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 6%;">PUNTOS A.</th>
            <th style="padding: 0.45rem 0.5rem; text-align: right; width: 7%;">SALDO PUNTOS</th>
          </tr>
        `;
      }
      reportTableHead.innerHTML = headHtml;

      // Paginate data
      const totalItems = filteredReportData.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      
      if (currentPage > totalPages) currentPage = totalPages;
      if (currentPage < 1) currentPage = 1;

      // Update Pagination Indicators
      if (reportCurrentPageEl) reportCurrentPageEl.textContent = currentPage;
      if (reportTotalPagesEl)  reportTotalPagesEl.textContent = totalPages;
      if (reportFooterPageEl)  reportFooterPageEl.textContent = currentPage;
      if (reportFooterTotalEl) reportFooterTotalEl.textContent = totalPages;

      const startIndex = (currentPage - 1) * pageSize;
      const endIndex   = startIndex + pageSize;
      const pageData   = filteredReportData.slice(startIndex, endIndex);

      reportTableBody.innerHTML = '';
      if (pageData.length === 0) {
        let cols = reportType === 'productos' ? 11 : (reportType === 'movimientos' ? 9 : 8);
        reportTableBody.innerHTML = `<tr><td colspan="${cols}" style="text-align: center; color: #a0aec0; padding: 3rem;">No se encontraron registros.</td></tr>`;
        return;
      }

      pageData.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #cbd5e0';
        tr.style.background = idx % 2 === 0 ? 'white' : '#f8fafc';
        
        let rowHtml = '';
        if (reportType === 'productos') {
          rowHtml = `
            <td style="padding: 0.35rem 0.5rem; font-family: monospace; font-weight: 600;">${item.code}</td>
            <td style="padding: 0.35rem 0.5rem; font-weight: 500;">${item.name}</td>
            <td style="padding: 0.35rem 0.5rem;">${item.dept || 'LADO A'}</td>
            <td style="padding: 0.35rem 0.5rem;">${item.location || 'ALMACEN 1'}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: center;">${item.unit}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: center;">${item.minStock || 0}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: center;">${item.maxStock || 0}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right; font-weight: 700;">${item.stock}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right;">${(item.cost || 0).toFixed(2)}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right;">${(item.price1 || 0).toFixed(2)}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right;">${(item.price2 || 0).toFixed(2)}</td>
          `;
        } else if (reportType === 'movimientos') {
          rowHtml = `
            <td style="padding: 0.35rem 0.5rem; color: #4a5568;">${item.fecha}</td>
            <td style="padding: 0.35rem 0.5rem;"><span style="background:${item.tipo === 'Entrada' ? '#e6fffa' : '#ebf8ff'}; color:${item.tipo === 'Entrada' ? '#047481' : '#2b6cb0'}; font-size:0.7rem; font-weight:700; padding:0.1rem 0.35rem; border-radius:4px;">${item.tipo}</span></td>
            <td style="padding: 0.35rem 0.5rem; font-family: monospace; font-weight: 600;">${item.clave}</td>
            <td style="padding: 0.35rem 0.5rem;">${item.desc}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: center;">${item.um}</td>
            <td style="padding: 0.35rem 0.5rem;">${item.almacen}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right;">${(item.precio || 0).toFixed(2)}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right;">${(item.costo || 0).toFixed(2)}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right; font-weight: 700; color:${item.tipo === 'Entrada' ? '#047481' : '#c53030'};">${item.tipo === 'Entrada' ? '+' : ''}${item.cantidad}</td>
          `;
        } else if (reportType === 'clientes') {
          rowHtml = `
            <td style="padding: 0.35rem 0.5rem; font-weight: 600;">${item.name}</td>
            <td style="padding: 0.35rem 0.5rem;">${item.rfc}</td>
            <td style="padding: 0.35rem 0.5rem;">${item.phone}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right;">${(item.limit || 0).toFixed(2)}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right;">${(item.available || 0).toFixed(2)}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right; font-weight: 700; color:${item.pending > 0 ? '#c53030' : '#2d3748'};">${(item.pending || 0).toFixed(2)}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right;">${(item.points || 0).toFixed(0)}</td>
            <td style="padding: 0.35rem 0.5rem; text-align: right;">${(item.pointBalance || 0).toFixed(2)}</td>
          `;
        }
        tr.innerHTML = rowHtml;
        reportTableBody.appendChild(tr);
      });
    }

    // Zoom event
    if (reportZoomSelect && reportPrintArea) {
      reportZoomSelect.addEventListener('change', function() {
        const val = this.value; // e.g. "100%"
        reportPrintArea.style.transform = `scale(${parseFloat(val) / 100})`;
      });
    }

    // Pagination Click Handlers
    if (pageFirstBtn) {
      pageFirstBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage = 1;
          renderReportTable();
        }
      });
    }
    if (pagePrevBtn) {
      pagePrevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderReportTable();
        }
      });
    }
    if (pageNextBtn) {
      pageNextBtn.addEventListener('click', () => {
        const totalItems = filteredReportData.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        if (currentPage < totalPages) {
          currentPage++;
          renderReportTable();
        }
      });
    }
    if (pageLastBtn) {
      pageLastBtn.addEventListener('click', () => {
        const totalItems = filteredReportData.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        if (currentPage < totalPages) {
          currentPage = totalPages;
          renderReportTable();
        }
      });
    }

    // Search function inside report
    function handleReportSearch() {
      const q = reportSearchInput?.value?.trim().toLowerCase() || '';
      if (!q) {
        filteredReportData = [...rawReportData];
      } else {
        if (reportType === 'productos') {
          filteredReportData = rawReportData.filter(p => 
            p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
          );
        } else if (reportType === 'movimientos') {
          filteredReportData = rawReportData.filter(m => 
            m.clave.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.tipo.toLowerCase().includes(q)
          );
        } else if (reportType === 'clientes') {
          filteredReportData = rawReportData.filter(c => 
            c.name.toLowerCase().includes(q) || c.rfc.toLowerCase().includes(q)
          );
        }
      }
      currentPage = 1;
      renderReportTable();
    }

    if (reportSearchBtn) reportSearchBtn.addEventListener('click', handleReportSearch);
    if (reportSearchInput) {
      reportSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleReportSearch();
      });
    }

    // Excel Export
    if (reportExportExcelBtn) {
      reportExportExcelBtn.addEventListener('click', () => {
        downloadExcel(reportType, filteredReportData);
      });
    }

    function downloadExcel(type, data) {
      let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
      let headers = [];
      if (type === 'productos') {
        headers = ["CLAVE", "DESCRIPCION", "CATEGORIA", "DEPARTAMENTO", "ALMACEN", "U.M.", "MINIMO", "MAXIMO", "EXISTENCIA", "COSTO", "PRECIO 1", "PRECIO 2"];
      } else if (type === 'movimientos') {
        headers = ["FECHA REGISTRO", "TIPO", "CLAVE", "DESCRIPCION", "U.M.", "ALMACEN", "PRECIO $", "COSTO $", "CANTIDAD"];
      } else if (type === 'clientes') {
        headers = ["NOMBRE", "RFC", "TELEFONO", "LIMITE CREDITO", "CREDITO DISPONIBLE", "SALDO PENDIENTE", "PUNTOS", "SALDO PUNTOS"];
      }

      csvContent += headers.map(h => `"${h}"`).join(",") + "\r\n";

      data.forEach(item => {
        let row = [];
        if (type === 'productos') {
          row = [item.code, item.name, item.category, item.dept, item.location, item.unit, item.minStock || 0, item.maxStock || 0, item.stock, item.cost, item.price1, item.price2];
        } else if (type === 'movimientos') {
          row = [item.fecha, item.tipo, item.clave, item.desc, item.um, item.almacen, item.precio, item.costo, item.cantidad];
        } else if (type === 'clientes') {
          row = [item.name, item.rfc, item.phone, item.limit, item.available, item.pending, item.points, item.pointBalance];
        }
        csvContent += row.map(val => `"${val !== undefined && val !== null ? String(val).replace(/"/g, '""') : ''}"`).join(",") + "\r\n";
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `reporte_${type}_${new Date().toLocaleDateString('es-VE').replace(/\//g, '-')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // PDF Export / Print
    if (reportExportPdfBtn) {
      reportExportPdfBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // Back / Close button
    if (reportBackBtn) {
      reportBackBtn.addEventListener('click', () => {
        reportModal.style.display = 'none';
      });
    }

    // Wire up triggers in main application tabs with error reporting
    const invReportBtn = document.getElementById('inv-report-btn');
    if (invReportBtn) {
      invReportBtn.addEventListener('click', () => {
        try {
          openReport('productos');
        } catch (err) {
          alert('Error al abrir reporte de productos:\n' + err.message + '\n' + err.stack);
        }
      });
    }

    const movReportBtn = document.getElementById('mov-report-btn');
    if (movReportBtn) {
      movReportBtn.addEventListener('click', () => {
        try {
          openReport('movimientos');
        } catch (err) {
          alert('Error al abrir reporte de movimientos:\n' + err.message + '\n' + err.stack);
        }
      });
    }

    const cliReportBtn = document.getElementById('clientes-report-btn');
    if (cliReportBtn) {
      cliReportBtn.addEventListener('click', () => {
        try {
          openReport('clientes');
        } catch (err) {
          alert('Error al abrir reporte de clientes:\n' + err.message + '\n' + err.stack);
        }
      });
    }
  }
  logDebug('✅ WinterPOS listo sin errores de inicialización.');
});
