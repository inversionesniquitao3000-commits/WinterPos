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
  metodo: 'Efectivo$' | 'EfectivoBs' | 'Tarjeta$' | 'TarjetaBs' | 'PagoMovil' | 'Biopago' | 'Binance' | 'PayPal' | 'CreditoCliente';
  monto: number; // in the currency of the payment (VES for Bs, USD for $)
  montoUSD: number; // calculated in USD
  montoVES?: number;
  montoBs?: number;
  reference?: string;
  bancoEmisor?: string;
  telefonoPagoMovil?: string;
}

export interface InventoryMovement {
  id: number;
  date: string;
  productCode: string;
  productDescription: string;
  type: 'Entrada' | 'Salida' | 'Merma' | 'Venta' | 'Devolucion' | 'Devolución' | 'Entrada Rápida';
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
  permitir_multisesion?: boolean;
  compartir_apertura_caja?: boolean;
  tasa_oficial_bcv?: number;
  logo_url?: string;
}

export interface Sale {
  id?: number;
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
  usuario_id?: number;
  caja_estatus?: 'Abierta' | 'Cerrada' | string;
  estatus?: string;
  iva?: number;
  terminal?: string;
}

export interface CierreDetails {
  aperturaUsd?: number;
  aperturaVes?: number;
  expectedVes?: number;
  costoTotalUsd?: number;
  utilidadUsd?: number;
  ventasEfectivoUsd?: number;
  ventasEfectivoVes?: number;
  abonoClientesUsd?: number;
  abonoClientesVes?: number;
  abonosEfectivoUsd?: number;
  abonosEfectivoBsVes?: number;
  abonosEfectivoBsUsd?: number;
  abonosBiopagoVes?: number;
  abonosBiopagoUsd?: number;
  abonosPagoMovilVes?: number;
  abonosPagoMovilUsd?: number;
  abonosPuntoVes?: number;
  abonosPuntoUsd?: number;
  abonosZelleUsd?: number;
  abonosBinanceUsd?: number;
  abonosPayPalUsd?: number;
  entradaEfectivoUsd?: number;
  entradaEfectivoVes?: number;
  salidaEfectivoUsd?: number;
  salidaEfectivoVes?: number;
  devolucionEfectivoUsd?: number;
  devolucionEfectivoVes?: number;
  vueltosEntregadosUsd?: number;
  vueltosEntregadosVes?: number;
  dineroEnCajaExpected?: number;
  ventasTotalesUsd?: number;
  descuentosUsd?: number;
  ventaBrutaUsd?: number;
  pagosEfectivoUsd?: number;
  pagosEfectivoBsUsd?: number;
  pagosEfectivoBsVes?: number;
  pagosBiopagoUsd?: number;
  pagosBiopagoVes?: number;
  pagosPuntoUsd?: number;
  pagosPuntoVes?: number;
  pagosPagoMovilUsd?: number;
  pagosPagoMovilVes?: number;
  pagosBinanceUsd?: number;
  pagosPayPalUsd?: number;
  pagosTarjetaUsd?: number;
  pagosCreditoUsd?: number;
  pagosPuntosUsd?: number;
  devolucionVentasUsd?: number;
  devolucionVentasVes?: number;
  ventaTotalUsd?: number;
  subtotalNetoUsd?: number;
  terminal?: string;

  // Movimientos de Cambio de Divisas y Venta de Efectivo (Avance)
  cambioDivisasCount?: number;
  cambioDivisasUsd?: number;
  cambioDivisasEur?: number;
  cambioDivisasVesSalida?: number;
  ventaEfectivoCount?: number;
  ventaEfectivoVesSalida?: number;
  ventaEfectivoDigitalEntradaVes?: number;
  ventaEfectivoComisionUsd?: number;
  ventaEfectivoComisionVes?: number;
}

export interface DivisaOperation {
  id?: number;
  tipo_operacion: 'COMPRA_DIVISA' | 'VENTA_EFECTIVO';
  currency: 'USD' | 'EUR';
  monto_divisa: number;
  tasa_aplicada: number;
  es_tasa_manual?: boolean;
  monto_ves_entregado: number;
  metodo_cobro?: 'BIOPAGO' | 'PUNTO' | 'PAGO_MOVIL' | 'TRANSFERENCIA' | 'EFECTIVO_USD';
  comision_pct?: number;
  comision_monto_ves?: number;
  comision_monto_usd?: number;
  monto_digital_cobrado_ves?: number;
  monto_digital_cobrado_usd?: number;
  observacion?: string;
  usuario: string;
  fecha: string;
}

export interface CierreCaja {
  id: number;
  fecha: string;
  fechaCierre?: string;
  fechaApertura?: string;
  costoTotalUsd?: number;
  utilidadUsd?: number;
  ventaEfectivoComisionVes?: number;
  ventaEfectivoComisionUsd?: number;
  usuario: string;
  usuarioId?: number;
  aperturaUsd: number;
  aperturaVes: number;
  terminal?: string;
  status?: string;
  diffUsd?: number;
  
  // Detailed cash registry metrics
  ventasEfectivoUsd: number;
  ventasEfectivoVes?: number;
  abonoClientesUsd: number;
  abonoClientesVes?: number;
  abonosEfectivoUsd?: number;
  abonosEfectivoBsVes?: number;
  abonosEfectivoBsUsd?: number;
  abonosBiopagoVes?: number;
  abonosBiopagoUsd?: number;
  abonosPagoMovilVes?: number;
  abonosPagoMovilUsd?: number;
  abonosPuntoVes?: number;
  abonosPuntoUsd?: number;
  abonosZelleUsd?: number;
  abonosBinanceUsd?: number;
  abonosPayPalUsd?: number;
  entradaEfectivoUsd: number;
  entradaEfectivoVes?: number;
  salidaEfectivoUsd: number;
  salidaEfectivoVes?: number;
  devolucionEfectivoUsd: number;
  devolucionEfectivoVes?: number;
  vueltosEntregadosUsd?: number;
  vueltosEntregadosVes?: number;
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
  pagosPagoMovilUsd?: number;    // Pago Móvil USD
  pagosPagoMovilVes?: number;    // Pago Móvil VES
  pagosTransferenciaUsd?: number; // Transferencia USD
  pagosTransferenciaVes?: number; // Transferencia VES
  pagosBinanceUsd?: number;      // Binance $
  pagosPayPalUsd?: number;       // PayPal $
  pagosTarjetaUsd: number;
  pagosCreditoUsd: number;
  pagosPuntosUsd: number;
  devolucionVentasUsd: number;
  devolucionVentasVes?: number;
  ventaTotalUsd: number;
  realVes: number;
  expectedVes: number;
}

export type MetodoPagoAbono = 'Efectivo$' | 'EfectivoBs' | 'Tarjeta$' | 'TarjetaBs' | 'PagoMovil' | 'Biopago' | 'Binance' | 'PayPal' | 'Zelle';

/** A single payment line within a multi-payment abono */
export interface AbonoPayment {
  metodo_pago: MetodoPagoAbono;
  monto_usd: number;   // amount in USD (0 if Bs-based method)
  monto_ves: number;   // amount in VES (0 if USD-based method)
  referencia?: string;
}

export interface Abono {
  id: number;
  cliente_id: number;
  nombre: string;
  cedula_rif: string;
  monto: number;        // total abono in USD (used for local state display)
  metodo_pago?: MetodoPagoAbono;
  monto_ves?: number;
  referencia?: string;
  observacion?: string;
  usuario?: string;
  fecha: string;
}

export interface Accionista {
  id: number;
  nombre: string;
  cedula_rif?: string;
  telefono?: string;
  estado: 'Activo' | 'Inactivo';
  created_at?: string;
}

export interface InversionAccionista {
  id: number;
  accionista_id: number;
  fecha: string;
  monto_usd: number;
  observacion?: string;
  created_at?: string;
}

export interface ResumenAccionista {
  accionista: Accionista;
  totalInvertido: number;
  porcentajeParticipacion: number;
}

export interface GastoOperativo {
  id: number;
  concepto: string;
  monto_usd: number;
  fecha: string;
  observacion?: string;
  usuario?: string;
  created_at?: string;
}


