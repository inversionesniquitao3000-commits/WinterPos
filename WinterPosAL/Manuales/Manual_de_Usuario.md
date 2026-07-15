# MANUAL DE USUARIO - WINTERPOSAL
## Sistema de Ventas Multimoneda y Concurrente para Venezuela

Este manual describe el flujo operativo diario del cajero y administrador en el sistema WinterPosAL.

---

### MÓDULO 1: CONFIGURACIÓN CENTRAL DEL NEGOCIO
Antes de vender, configure la identidad de su comercio:
1. Ingrese con credenciales de **Administrador**.
2. Vaya a **Configuración > Datos de la Empresa**.
3. Complete los campos de **Nombre**, **RIF**, **Dirección**, **Teléfono** y **Mensaje de Pie de Ticket**.
4. Presione **Guardar**. Estos datos se inyectarán de forma dinámica en todos los encabezados de tickets de venta y reportes fiscales de la empresa.

---

### MÓDULO 2: CONTROL DE INVENTARIO, MERMAS Y AJUSTES DE PRECIOS
Este sistema audita de manera estricta y transparente cualquier modificación de la base de datos:
1. **Entradas y Salidas de Mercancía:** Al recibir mercancía, busque el producto, presione **"Ajustar"**, elija "Entrada" o "Salida" y justifique de forma escrita el motivo.
2. **Registro de Mermas (Pérdidas/Daños):** Si un artículo se daña, rompe o vence, efectúe un ajuste de tipo **"Merma"** explicando detalladamente la justificación. El stock se deducirá automáticamente y el Kardex conservará la traza del operador a cargo.
3. **Auditoría de Ajuste de Precios:** Cualquier modificación sobre los precios de costo, detalle o mayor quedará registrada históricamente asociando el usuario que ejecutó la orden, el precio anterior y el precio nuevo.

---

### MÓDULO 3: PROCESAMIENTO DE VENTAS Y PAGOS MIXTOS (PAGO MÓVIL / BIOPAGO)
Este sistema permite registrar múltiples métodos de cobro en un mismo ticket:
1. Al pulsar **COBRAR**, se abrirá la interfaz de pago.
2. Introduzca los montos entregados por el cliente en dólares, bolívares en efectivo, tarjeta de débito, Pago Móvil o Biopago.
3. **Validación Electrónica:** Para Pago Móvil y Biopago, el sistema exige de forma obligatoria el número de referencia bancaria de al menos 4 caracteres y el banco emisor. Si el campo está vacío o es inferior, el botón de cobro se bloqueará.
4. **Cálculo de Vuelto:** El sistema calcula de forma instantánea el cambio a entregar en dólares y bolívares, utilizando la tasa de cobro para ingresos y la tasa de vuelto para el cambio.
