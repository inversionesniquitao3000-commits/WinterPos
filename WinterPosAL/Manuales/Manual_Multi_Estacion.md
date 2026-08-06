# MANUAL DE CONFIGURACIÓN: INTERCONEXIÓN MULTI-ESTACIÓN (LAN)
## WinterPosAL - Red Local de Caja y Facturación Concurrente

Este manual técnico explica paso a paso cómo conectar de manera simultánea múltiples computadoras o dispositivos móviles para operar de forma concurrente bajo un inventario centralizado, utilizando tanto el **Instalador Automático** como la **Configuración Manual**.

---

## MÉTODO 1: INSTALACIÓN 100% AUTOMÁTICA CON EL INSTALADOR (RECOMENDADO)

El ejecutable del instalador (`WinterPosSetup_Completo_Offline.exe`, `WinterPosSetup_Liviano.exe` o `WinterPosSetup_v1.0.exe`) automatiza la configuración de red, reglas de firewall y archivo de entorno en cuestión de segundos.

### 1. En la PC Servidor Principal (Caja 1 / Central)
1. Ejecute el instalador `WinterPosSetup.exe` como Administrador.
2. En la pantalla **"Modo de Instalación"**, seleccione:
   * `🖥️ Servidor Principal (Caja 1 / Central)`
3. Haga clic en **Siguiente** e **Instalar**.
4. **¿Qué hace el instalador automáticamente?**
   * Configura la Base de Datos PostgreSQL local en el puerto `5432`.
   * Genera la configuración de entorno (`backend\.env`) asignando `DB_HOST=localhost`.
   * Ejecuta comandos silenciosos de `netsh` que crean las **Reglas de Entrada en el Cortafuegos de Windows (Firewall)** para habilitar los puertos `5000` (Servidor Web y API) y `5432` (PostgreSQL).
   * Deja la PC lista para servir la aplicación a toda la red local a través del puerto `5000`.

### 2. En las Cajas Secundarias (Terminales Cliente con Aplicación Instalada)
1. Ejecute el instalador `WinterPosSetup.exe` en la segunda (o subsiguiente) computadora.
2. En la pantalla **"Modo de Instalación"**, seleccione:
   * `💻 Caja Secundaria (Terminal Cliente LAN)`
3. El asistente le solicitará ingresar la **Dirección IP de la PC Servidor Principal** (ejemplo: `192.168.1.100` o `192.168.11.13`).
   *(Para averiguar la IP de la PC Servidor, en el Servidor abra `cmd` y ejecute `ipconfig`).*
4. Haga clic en **Siguiente** e **Instalar**.
5. **¿Qué hace el instalador automáticamente?**
   * Escribe la dirección IP del servidor central en el archivo `backend\.env` (`DB_HOST=192.168.x.x`).
   * Deshabilita la instalación redundante de PostgreSQL local.
   * Configura las reglas de red para conectar la terminal a la base de datos central de la Caja 1.

### 3. Acceso Directo por Navegador Web (Sin necesidad de instalador en las clientes)
Cualquier computadora, laptop, tablet o smartphone en la misma red local (Wi-Fi o cable) puede conectarse a la PC Servidor sin instalar nada:
1. Abra el navegador (Chrome, Edge, Safari, Firefox).
2. Ingrese la dirección: `http://<IP_DEL_SERVIDOR>:5000` (Ejemplo: `http://192.168.11.13:5000`).
3. El punto de venta cargará al instante y sincronizará en tiempo real.

---

## MÉTODO 2: CONFIGURACIÓN MANUAL Y ENTORNO DE DESARROLLO (VITE / NPM)

Si está ejecutando el proyecto en modo desarrollo desde código fuente:

### CONFIGURACIÓN EN LA PC SERVIDOR (PRINCIPAL)
1. Configure una **IP estática (fija)** en las propiedades TCP/IPv4 del adaptador de red (Ej. `192.168.1.100`).
2. Abra el **Firewall de Windows** y agregue reglas de entrada para habilitar los puertos `5432` (PostgreSQL), `5000` (Backend Express API) y `5173` (Vite Dev Server).
3. **Servidor Web de Desarrollo (Vite):** El proyecto en `vite.config.ts` está preconfigurado para exponer el servidor web de desarrollo a la red local (LAN) automáticamente. Simplemente ejecute:
   ```bash
   npm run dev
   ```
   Esto expondrá el sistema a través de la dirección IP de la red local (ej. `http://192.168.11.13:5173`).

---

### CONFIGURACIÓN EN LAS ESTACIONES CLIENTE (SEGUNDA Y MÁS COMPUTADORAS)
1. **Conexión de Red Física (LAN):**
   * Conecte la segunda computadora al mismo router o switch de red local que la PC principal (servidor).
   * **Recomendación crítica:** Utilice cables de red Ethernet Cat5e o Cat6 para todas las computadoras adicionales. La conexión por Wi-Fi no es recomendable para computadoras de facturación fija debido a posibles microcortes de red inalámbrica que interrumpen la comunicación con la base de datos central.
2. **Obtener la dirección IP de la PC Principal (Servidor):**
   * En la PC principal, abra el menú Inicio, escriba `cmd` y pulse Enter para abrir la consola.
   * Ejecute el comando `ipconfig` y anote la dirección IPv4 local (ejemplo: `192.168.11.13`).
3. **Configuración de Firewall de Windows en la PC Principal:**
   * Las terminales cliente se conectarán al backend (puerto `5000`) y al servidor frontend (puerto `5173` en dev o `5000` en producción). Ambos puertos deben estar abiertos en la PC Servidor.
   * En el Servidor, vaya a *Panel de Control > Firewall de Windows Defender > Configuración Avanzada > Reglas de Entrada > Nueva Regla*.
   * Elija **Puerto**, luego escriba `5000, 5173, 5432` y seleccione **Permitir la conexión**. Habilite la regla para redes Privadas.
4. **Vincular la Terminal Cliente (¡Detección Automática!):**
   * Encienda la segunda computadora e inicie la interfaz web del sistema desde el navegador local accediendo a la IP de la PC principal: `http://192.168.11.13:5000` (o `http://192.168.11.13:5173` en modo dev).
   * **No es necesario configurar nada más:** El sistema detecta automáticamente la IP desde la que estás accediendo y redirige todas las llamadas de la base de datos y API hacia la IP del servidor.
   * *(Opcional)* Si por alguna razón de red requieres forzar una IP diferente, en la ventana de login pulsa la combinación de teclas **`Ctrl + Alt + P`** o haz clic 5 veces seguidas sobre el logotipo de WinterPos para abrir el panel oculto de configuración de Endpoint.
5. **Sesiones de Operadores Independientes:**
   * Desde la PC principal, ingrese a *Configuración > Usuarios* y cree un usuario diferente para el operador de la segunda caja.
   * Al iniciar sesión en la segunda terminal, el sistema detectará el operador asignado. Todas las ventas registradas e ingresos quedarán auditados de manera independiente indicando en el Kardex y en el cierre la estación y usuario correspondiente.

---

### CONFIGURACIÓN EN DISPOSITIVOS MÓVILES (TELÉFONOS Y TABLETS)
1. Conecte el dispositivo móvil (teléfono o tablet) al mismo router **Wi-Fi** al que está conectada la PC Servidor.
2. Abra el navegador web de su dispositivo móvil.
3. Ingrese la dirección IP de red expuesta por la PC Servidor junto con el puerto asignado (Ej: `http://192.168.11.13:5000`).
4. La interfaz cargará de inmediato y se conectará automáticamente a la base de datos del servidor central sin requerir configuraciones adicionales.
   * *Nota:* Para operar cómodamente la interfaz de caja desde un teléfono móvil, úselo en **modo horizontal (landscape)**.
   * Para más detalles sobre adaptabilidad móvil, consulte el archivo [Manual_Acceso_Movil_y_Responsividad.md](file:///d:/Antigravity/Proyecto1/WinterPosAL/Manuales/Manual_Acceso_Movil_y_Responsividad.md).

---

### SINCRONIZACIÓN Y EXPULSIÓN DE SESIONES AL CERRAR CAJA EN RED LOCAL (LAN)
1. **Comportamiento Multi-Terminal de Turno**:
   * Las terminales cliente sincronizan sus ventas, productos, clientes y tasas en segundo plano mediante la API de sincronización unificada `/api/sync/poll`.
   * Un operador (no administrador) puede mantener sesiones abiertas en varias computadoras cliente compartiendo su misma apertura de caja activa.
2. **Cierre de Caja Global y Expulsión Remota**:
   * En el instante en que el operador ejecuta el **Cierre de Caja** en cualquier terminal, el servidor registra el timestamp de cierre.
   * La rutina de sincronización en red detecta el cierre y emite la orden de expulsión remota a todos los navegadores/clientes de ese usuario.
   * Las estaciones cliente limpian inmediatamente el carrito de compras no cobrado y redirigen al cajero a la pantalla de login con el aviso correspondiente.
3. **Excepción de Rol para Administradores**:
   * El rol `Administrador` está excluido de esta comprobación. Los administradores pueden monitorear y operar en múltiples computadoras sin ser desconectados por eventos de cierre de caja.
4. **Contingencia por Desconexión de Red**:
   * Toda llamada a la API que procese dinero o ventas valida previamente el estatus del turno en la base de datos central. Si un cliente estuvo desconectado de la red durante el cierre y vuelve a reconectarse, la API rechazará la transacción e iniciará el procedimiento de cierre de sesión remoto de inmediato.
