# MANUAL DE ADMINISTRACIÓN AVANZADA Y PERIFÉRICOS
## WinterPosAL - Control de Seguridad, Mantenimiento de BD y Dispositivos de Tienda

Este manual detalla paso a paso el uso de las herramientas del **Submódulo del Administrador** y la parametrización de hardware del sistema **WinterPosAL**.

---

### MÓDULO 1: GESTIÓN DE USUARIOS Y ROLES (SEGURIDAD)

El sistema cuenta con un control de accesos granular que permite restringir qué puede hacer cada operador por módulo (ver, crear, editar, eliminar).

#### 1. Creación de un Nuevo Usuario
1. Ingrese con un usuario de rol **Administrador** (ej. `admin`).
2. Diríjase a **F10 Config.** > pestaña **Usuarios y Roles**.
3. Haga clic en **Nuevo Usuario**.
4. Rellene los campos obligatorios:
   - **Usuario (Login):** Nombre de usuario en minúsculas (ej. `pedro`).
   - **Nombre Completo:** Nombre del operador (ej. `Pedro Pérez`).
   - **Contraseña / PIN:** Clave de acceso del operador para el Login.
   - **Perfil / Rol Base:** Elija una plantilla (Administrador, Cajero / Vendedor, etc.). Al seleccionarla, la matriz de permisos se autocompletará con los accesos sugeridos.
   - **Estado:** Activo o Inactivo.
5. Presione **Guardar Usuario**.

#### 2. Definición de Permisos a Medida (Matriz de Permisos)
En la parte inferior de la ficha del usuario o al crear un nuevo perfil de rol, verá la **Matriz de Permisos**:
- **Módulos:** F1 Caja, F2 Inventario, F3 Historial Ventas, F4 Clientes, F9 Tasa, F10 Configuración.
- **Acciones:**
  - **Ver:** Permite visualizar la pestaña en la navegación y acceder a los datos.
  - **Crear:** Habilita los botones de agregar (ej. Registrar producto, Nuevo Cliente).
  - **Editar:** Habilita las operaciones de modificación (ej. Ajustar Stock, Editar Precios, Registrar Abonos).
  - **Eliminar:** Habilita el botón de borrado (ej. Eliminar Producto).
- *Nota:* Puede encender o apagar casillas de verificación específicas para crear permisos a medida (ej. Un cajero que pueda ver y registrar ventas, pero no modificar clientes).

---

### MÓDULO 2: CONTROL Y CONFIGURACIÓN DE PERIFÉRICOS

Configure los dispositivos externos que interactúan con su estación de facturación. Vaya a **F10 Config.** > pestaña **Básculas e Impresoras**.

#### 1. Configuración de Impresoras Térmicas de Tickets
1. **Puerto/Método de Conexión:**
   - **Impresora del Sistema Operativo:** Envía la orden usando el gestor de impresión de Windows (ideal para impresoras USB instaladas con driver).
   - **Conexión Directa USB (Raw):** Envía comandos POS/ESC binarios directos al puerto USB (sin necesidad de driver).
   - **Conexión por Red IP:** Para impresoras de red o Wi-Fi. Escriba la IP del equipo (ej. `192.168.1.200`).
2. **Ancho de Papel:** Seleccione `58mm` (angosto) o `80mm` (estándar de ticket fiscal).
3. **Corte de Papel Automático:** Activa la guillotina al finalizar el ticket.
4. **Imprimir Copia del Ticket:** Genera automáticamente un duplicado al procesar la venta.

#### 2. Configuración de Básculas / Balanzas de Peso
Para la venta a granel de productos pesados (ej. quesos, verduras):
1. **Método de Captura de Peso:**
   - **Entrada Manual:** El sistema le pedirá que digite el peso de forma manual en pantalla al seleccionar el producto a granel.
   - **Puerto Serial COM:** Conecta directamente a básculas por cable serial (COM1, COM2, USB Emulado).
2. **Protocolo:** Seleccione `CAS` o `Toledo` según la marca de su balanza, o `Custom` para capturas genéricas.
3. **Baud Rate:** Ajuste la velocidad (típicamente `9600 bps`).

---

### MÓDULO 3: ADMINISTRACIÓN Y MANTENIMIENTO DE BASE DE DATOS

#### 1. Limpieza y Puesta a Cero (Wipe / Formateo)
Si va a iniciar operaciones reales y desea borrar las pruebas previas, utilice la **Danger Zone**:
1. Vaya a **F10 Config.** > pestaña **Base de Datos**.
2. Identifique la acción requerida:
   - **Vaciar Inventario / Catálogo:** Borra productos, movimientos e historial de precios.
   - **Vaciar Registro de Ventas y Facturas:** Borra transacciones, reinicia correlativos y limpia cajas.
   - **Vaciar Directorio de Clientes:** Borra clientes (excepto Consumidor Final).
   - **Limpiar Sistema Completo:** Deja el sistema completamente en blanco.
3. Escriba exactamente la palabra de seguridad **`CONFIRMAR`** en el recuadro inferior.
4. Haga clic en el botón de limpieza deseado y presione **Aceptar** en el cuadro de confirmación.
5. El sistema se recargará automáticamente listo para la nueva configuración.

#### 2. Respaldos (Backups) Manuales e Importación
- **Exportar Backup:** Presione **Generar y Descargar Respaldo (.json)**. Se descargará un archivo con toda la información histórica que puede guardar como copia física.
- **Importar Backup:** Presione **Seleccionar y Cargar Archivo**, busque el archivo `.json` de respaldo y confirme. El servidor restaurará todo el historial de forma inmediata.

#### 3. Programación de Respaldos Automáticos
- **Configuración:** En la tarjeta inferior de la pestaña **Base de Datos**, seleccione la frecuencia del respaldo automático en el desplegable:
  - **Diario (Recomendado):** Respaldo automático cada 24 horas.
  - **Semanal:** Cada Domingo.
  - **Mensual:** Al finalizar el mes.
- **Ubicación:** Los respaldos se guardarán automáticamente en la carpeta `./backend/data/backups/` del servidor con el formato `backup_auto_[Fecha]_[Timestamp].json`.
