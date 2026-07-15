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
5. **Marca Dinámica en Login:** El nombre comercial configurado se cargará automáticamente en la pantalla de inicio de sesión de todos los terminales. Si se deja en blanco, el login mostrará de forma predeterminada la leyenda **"Sistema WinterPosAL"**.

---

### MÓDULO 2: CONTROL DE INVENTARIO Y REGISTRO DE PRODUCTOS
Este sistema audita de manera estricta y transparente cualquier modificación de la base de datos:
1. **Entradas y Salidas de Mercancía:** Al recibir mercancía, busque el producto, presione **"Ajustar"**, elija "Entrada" o "Salida" y justifique de forma escrita el motivo.
2. **Registro de Mermas (Pérdidas/Daños):** Si un artículo se daña, rompe o vence, efectúe un ajuste de tipo **"Merma"** explicando detalladamente la justificación. El stock se deducirá automáticamente y el Kardex conservará la traza del operador a cargo.
3. **Auditoría de Ajuste de Precios:** Cualquier modificación sobre los precios de costo, detalle o mayor quedará registrada históricamente asociando el usuario que ejecutó la orden, el precio anterior y el precio nuevo.
4. **Campos Especiales de Registro (Maestro de Productos):**
   * **Descripción en Mayúsculas:** El campo de descripción forzará automáticamente el uso de letras mayúsculas durante la escritura.
   * **Código de Barras Automático:** Si el producto no dispone de un código de barras físico, al guardar se generará uno automático basado en la **Clave** del producto.
   * **Venta a Granel (Peso/Fraccional):** Puede configurar si el producto se vende a granel (ej. Queso por kilogramos). Al venderlo, el sistema le solicitará ingresar la cantidad exacta en decimales (ej. `0.350`).
   * **Fecha de Vencimiento Opcional:** Puede opcionalmente asignar una fecha de vencimiento al producto.
   * **Impuesto/IVA Personalizable:** Permite configurar de forma exacta el nombre del impuesto y el porcentaje (ej. IVA 16% o IGTF 3%), mostrando una previsualización interactiva con el impuesto sumado al precio de venta.
   * **Modal Desplazable y Minimizable:** El modal de registro de productos puede arrastrarse desde el encabezado para ver las existencias detrás del mismo. También cuenta con un botón para **Minimizar** en la esquina inferior derecha, guardando los datos del formulario temporalmente para reanudarlos después.

---

### MÓDULO 3: APERTURA DE CAJA REGISTRADORA
Al iniciar el día en la terminal de caja:
1. El sistema presentará la ventana de **Apertura de Caja** con los montos en dólares (USD) y bolívares (VES) vacíos.
2. Si el cajero intenta iniciar el turno sin rellenar ningún monto, aparecerá una **Alerta de Advertencia**: *¿Desea iniciar la caja en cero ($0.00 USD / Bs 0.00 VES)?*.
   * Si hace clic en **Aceptar (OK)**, la terminal iniciará su sesión con saldo inicial en cero.
   * Si hace clic en **Cancelar**, el modal permanecerá en pantalla con los datos previamente escritos para que pueda corregir o ingresar los montos de caja inicial.

---

### MÓDULO 4: PROCESAMIENTO DE VENTAS Y PAGOS MIXTOS (PAGO MÓVIL / BIOPAGO)
Este sistema permite registrar múltiples métodos de cobro en un mismo ticket:
1. Al pulsar **COBRAR**, se abrirá la interfaz de pago.
2. Introduzca los montos entregados por el cliente en dólares, bolívares en efectivo, tarjeta de débito, Pago Móvil o Biopago.
3. **Monto por Liquidar en Bs:** Al ingresar montos combinados, el sistema muestra en tiempo real cuánto resta por liquidar tanto en dólares como su conversión exacta en bolívares (`Bs`), agilizando el cálculo.
4. **Validación Electrónica:** Para Pago Móvil y Biopago, el sistema exige de forma obligatoria el número de referencia bancaria de al menos 4 caracteres y el banco emisor. Si el campo está vacío o es inferior, el botón de cobro se bloqueará.
5. **Cálculo de Vuelto y Auxiliar Mixto:** El sistema calcula de forma instantánea el cambio a entregar. Si el vuelto es mixto (dólares y bolívares), el asistente interactivo de **Vuelto Mixto** le indicará cuánto entregar en dólares y cuánto es el restante exacto en bolívares según las tasas configuradas.

---

### MÓDULO 5: ATAJOS DE TECLADO EN EL CARRITO DE COMPRAS
Para agilizar la atención al cliente, el carrito de compras soporta navegación sin mouse:
1. Haga clic en cualquier producto dentro del carrito para seleccionarlo (se resaltará con un borde izquierdo azul).
2. Utilice las siguientes teclas:
   * `Flecha Arriba` / `Flecha Abajo` (`ArrowUp` / `ArrowDown`): Desplaza la selección del producto activo hacia arriba o hacia abajo.
   * `+` (Teclado numérico o estándar): Incrementa la cantidad del producto seleccionado. Si es a granel, lo incrementa en fracciones de `0.1` (100g); si es unitario, en `1`.
   * `-` (Teclado numérico o estándar): Disminuye la cantidad del producto seleccionado.
   * `Supr` o `Delete`: Elimina inmediatamente el artículo seleccionado de la venta actual.

---

### MÓDULO 6: MAESTRO DE CLIENTES Y CRÉDITOS
El módulo de clientes proporciona control sobre cuentas y deudas:
1. **Búsqueda Avanzada:** Filtre instantáneamente por Cédula, RIF o Nombre.
2. **Columnas Ordenables:** Haga clic sobre el encabezado de cualquier columna (ej. *Identificación (ID)*, *Nombre*, *Deuda Pendiente*) para ordenar la tabla de menor a mayor (Ascendente) o de mayor a menor (Descendente).
3. **Indicadores de Resumen:** Justo arriba de la tabla se muestran en tiempo real:
   * **Clientes Registrados:** Cantidad total de clientes en el sistema.
   * **Total Saldo Pendiente:** Monto total acumulado de deudas pendientes por cobrar.
