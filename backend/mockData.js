export const mockUsers = [
  { id: 1, usuario: 'admin', nombre: 'Anderson Laguna', rol: 'administrador', estado: 'Activo' },
  { id: 2, usuario: 'ale', nombre: 'Alejandra Olivar', rol: 'vendedor', estado: 'Activo' },
  { id: 3, usuario: 'ines', nombre: 'Ines Laguna', rol: 'vendedor', estado: 'Activo' }
];

export const mockProducts = [
  {
    id: 1,
    barcode: 'ACEITE-AMA-500',
    description: 'ACEITE AMANECER DE SOYA 500ML',
    category: 'ALIMENTOS',
    stock_actual: 35,
    stock_minimo: 10,
    precio_costo_usd: 2.00,
    precio_detalle_usd: 2.50,
    precio_mayor_usd: 2.20,
    cantidad_mayorista: 12,
    exento_impuesto: false,
    imagen_url: '',
    estado: 'Activo'
  },
  {
    id: 2,
    barcode: 'ACEITE-AMA-828',
    description: 'ACEITE AMANECER DE SOYA 828ML',
    category: 'ALIMENTOS',
    stock_actual: 8,
    stock_minimo: 5,
    precio_costo_usd: 3.22,
    precio_detalle_usd: 4.00,
    precio_mayor_usd: 3.50,
    cantidad_mayorista: 12,
    exento_impuesto: false,
    imagen_url: '',
    estado: 'Activo'
  },
  {
    id: 3,
    barcode: '6900240320576',
    description: 'ABRAZADERA 16-25MM',
    category: 'FERRETERIA',
    stock_actual: 150,
    stock_minimo: 20,
    precio_costo_usd: 0.02,
    precio_detalle_usd: 0.04,
    precio_mayor_usd: 0.03,
    cantidad_mayorista: 50,
    exento_impuesto: true,
    imagen_url: '',
    estado: 'Activo'
  },
  {
    id: 4,
    barcode: 'HARINA-PAN-1K',
    description: 'HARINA PAN BLANCA 1KG',
    category: 'ALIMENTOS',
    stock_actual: 85,
    stock_minimo: 15,
    precio_costo_usd: 1.00,
    precio_detalle_usd: 1.25,
    precio_mayor_usd: 1.10,
    cantidad_mayorista: 20,
    exento_impuesto: false,
    imagen_url: '',
    estado: 'Activo'
  },
  {
    id: 5,
    barcode: 'LECHE-CAMP-1L',
    description: 'LECHE COMPLETA CAMPESTRE 1L',
    category: 'ALIMENTOS',
    stock_actual: 3,
    stock_minimo: 10,
    precio_costo_usd: 2.10,
    precio_detalle_usd: 2.70,
    precio_mayor_usd: 2.45,
    cantidad_mayorista: 12,
    exento_impuesto: false,
    imagen_url: '',
    estado: 'Activo'
  }
];

export const mockClients = [
  { id: 1, cedula_rif: 'V-20824573', nombre: 'Anderson Laguna', telefono: '0424-2042877', direccion: '23 de Enero, Caracas', limite_credito: 150.00, credito_disponible: 150.00, porcentaje_descuento: 5.00, estado: 'Activo', saldo_pendiente: 0.00 },
  { id: 2, cedula_rif: 'V-12345678', nombre: 'Alejandra Olivar', telefono: '0412-5556677', direccion: 'Catia, Caracas', limite_credito: 50.00, credito_disponible: 35.50, porcentaje_descuento: 0.00, estado: 'Activo', saldo_pendiente: 14.50 },
  { id: 3, cedula_rif: 'V-87654321', nombre: 'Andrea Laguna', telefono: '0424-2175395', direccion: 'El Valle, Caracas', limite_credito: 100.00, credito_disponible: 100.00, porcentaje_descuento: 2.00, estado: 'Activo', saldo_pendiente: 0.00 },
  { id: 4, cedula_rif: 'V-00000000', nombre: 'Publico General', telefono: '', direccion: 'Caracas, Venezuela', limite_credito: 0.00, credito_disponible: 0.00, porcentaje_descuento: 0.00, estado: 'Activo', saldo_pendiente: 0.00 }
];

export const mockTasaHistory = [
  { id: 1, tasa_cobro: 36.30, tasa_vuelto: 36.30, fecha_actualizacion: '2026-07-10 08:15', usuario: 'ALEJANDRA OLIVAR' },
  { id: 2, tasa_cobro: 36.45, tasa_vuelto: 35.00, fecha_actualizacion: '2026-07-10 14:00', usuario: 'Anderson Laguna' },
  { id: 3, tasa_cobro: 36.50, tasa_vuelto: 36.00, fecha_actualizacion: '2026-07-15 08:05', usuario: 'Anderson Laguna' }
];

export const mockConfig = {
  rif: 'J-41132631',
  nombre_comercio: 'INVERSIONES NIQUITAO',
  direccion: 'Caracas, Venezuela',
  telefono: '0424-2042877',
  correo: 'niquitao@correo.com',
  moneda_base: 'USD',
  mensaje_pie_ticket: 'Gracias por su compra!',
  metodos_pago_activos: ["efectivo_usd", "efectivo_ves", "debito", "pago_movil", "biopago", "credito"]
};
