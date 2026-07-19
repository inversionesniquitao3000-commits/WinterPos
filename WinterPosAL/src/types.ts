export interface Product {
  id: number;
  barcode: string;
  description: string;
  category: string;
  stock_actual: number;
  stock_minimo: number;
  precio_costo_usd: number;
  precio_detalle_usd: number;
  precio_mayor_usd: number;
  cantidad_mayorista: number;
  exento_impuesto: boolean;
  imagen_url: string;
  estado: 'Activo' | 'Inactivo';
  a_granel?: boolean;
  fecha_vencimiento?: string;
  porcentaje_impuesto?: number;
}

export interface Client {
  id: number;
  cedula_rif: string;
  nombre: string;
  telefono: string;
  direccion: string;
  limite_credito: number;
  credito_disponible: number;
  porcentaje_descuento: number;
  estado: 'Activo' | 'Inactivo';
  saldo_pendiente: number;
  aplica_precio_costo?: boolean;
}

export interface User {
  id: number;
  usuario: string;
  nombre: string;
  rol: string; // custom role name or core roles
  estado: 'Activo' | 'Inactivo';
  clave?: string;
  permisos?: {
    [modulo: string]: {
      ver: boolean;
      crear: boolean;
      editar: boolean;
      eliminar: boolean;
      admin?: boolean;
    }
  };
}

export interface Role {
  id: number;
  nombre: string;
  permisos: {
    [modulo: string]: {
      ver: boolean;
      crear: boolean;
      editar: boolean;
      eliminar: boolean;
      admin?: boolean;
    }
  };
}

export interface PrinterConfig {
  puerto: string; // 'USB' | 'IP' | 'SISTEMA' | 'NINGUNA'
  ipAddress?: string;
  anchoPapel: '58mm' | '80mm';
  cortarAutomatico: boolean;
  copiaTicket: boolean;
}

export interface ScaleConfig {
  puerto: string; // 'COM1' | 'COM2' | 'USB' | 'RED' | 'MANUAL'
  baudRate: number;
  protocolo: string; // 'CAS' | 'Toledo' | 'Custom'
  taraPrevia: number;
}

export interface TasaHistoryItem {
  id: number;
  tasa_cobro: number;
  tasa_vuelto: number;
  fecha_actualizacion: string;
  usuario: string;
}

export interface SaleItem {
  product: Product;
  qty: number;
  priceType: 'Detalle' | 'Mayor' | 'Costo';
  priceUSD: number;
  totalUSD: number;
}

export interface Payment {
  metodo: 'Efectivo$' | 'EfectivoBs' | 'Tarjeta$' | 'TarjetaBs' | 'PagoMovil' | 'Biopago' | 'CreditoCliente';
  monto: number; // in the currency of the payment (VES for Bs, USD for $)
  montoUSD: number; // calculated in USD
  reference?: string;
  bancoEmisor?: string;
  telefonoPagoMovil?: string;
}

export interface InventoryMovement {
  id: number;
  date: string;
  productCode: string;
  productDescription: string;
  type: 'Entrada' | 'Salida' | 'Merma' | 'Venta' | 'Devolucion' | 'Entrada Rápida';
  qty: number;
  stock_anterior: number;
  stock_posterior: number;
  motivo: string;
  usuario: string;
}

export interface PriceAdjustmentHistory {
  id: number;
  date: string;
  productCode: string;
  productDescription: string;
  type: 'Costo' | 'Detalle' | 'Mayor';
  precio_anterior: number;
  precio_nuevo: number;
  motivo: string;
  usuario: string;
}

export interface CompanyConfig {
  rif: string;
  nombre_comercio: string;
  direccion: string;
  telefono: string;
  correo: string;
  moneda_base: string;
  mensaje_pie_ticket: string;
  metodos_pago_activos: string[];
}

export interface Sale {
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
  fecha: string;
  usuario: string;
  estatus?: string;
  iva?: number;
}

export interface CierreCaja {
  id: number;
  fecha: string;
  fechaCierre?: string;
  fechaApertura?: string;
  costoTotalUsd?: number;
  utilidadUsd?: number;
  usuario: string;
  aperturaUsd: number;
  aperturaVes: number;
  
  // Detailed cash registry metrics
  ventasEfectivoUsd: number;
  abonoClientesUsd: number;
  entradaEfectivoUsd: number;
  salidaEfectivoUsd: number;
  devolucionEfectivoUsd: number;
  dineroEnCajaExpected: number;
  realUsd: number; 
  
  // Detailed sales metrics
  ventasTotalesUsd: number;
  descuentosUsd: number;
  ventaBrutaUsd: number;
  pagosEfectivoUsd: number;      // Efectivo $
  pagosEfectivoBsUsd: number;    // Efectivo Bs (USD equivalent)
  pagosEfectivoBsVes: number;    // Efectivo Bs (monto real)
  pagosBiopagoUsd: number;       // Biopago (USD equivalent)
  pagosBiopagoVes: number;       // Biopago (monto real)
  pagosPuntoUsd: number;         // Punto (Tarjeta/PagoMovil USD equivalent)
  pagosPuntoVes: number;         // Punto (Tarjeta/PagoMovil monto real)
  pagosTarjetaUsd: number;
  pagosCreditoUsd: number;
  pagosPuntosUsd: number;
  devolucionVentasUsd: number;
  ventaTotalUsd: number;
  realVes: number;
  expectedVes: number;
}

export interface Abono {
  id: number;
  cliente_id: number;
  nombre: string;
  cedula_rif: string;
  monto: number;
  fecha: string;
}

