# MANUAL DE CONFIGURACIÓN: INTERCONEXIÓN MULTI-ESTACIÓN (LAN)
## WinterPosAL - Red Local de Caja y Facturación Concurrente

Este manual técnico explica paso a paso cómo conectar de manera simultánea múltiples computadoras o dispositivos móviles para operar de forma concurrente bajo un inventario centralizado.

---

### CONFIGURACIÓN EN LA PC SERVIDOR (PRINCIPAL)
1. Configure una **IP estática (fija)** en las propiedades TCP/IPv4 del adaptador de red (Ej. `192.168.1.100`).
2. Abra el **Firewall de Windows** o Linux y agregue una regla de entrada para habilitar el puerto `5432` (PostgreSQL).
3. **Servidor Web Expropiado (Vite):** Para permitir que otros dispositivos en la red local se conecten al frontend de la aplicación web, inicie el servidor de desarrollo exponiendo el host:
   ```bash
   npm run dev -- --host
   ```
   Esto expondrá el sistema a través de la dirección IP de la red local (ej. `http://192.168.1.100:5173`).

---

### CONFIGURACIÓN EN LAS ESTACIONES CLIENTE (SEGUNDA Y MÁS COMPUTADORAS)
1. **Conexión de Red Física (LAN):**
   * Conecte la segunda (o más) computadora al mismo router o switch de red local que la PC principal (servidor).
   * **Recomendación crítica:** Utilice cables de red Ethernet Cat5e o Cat6 para todas las computadoras adicionales. La conexión por Wi-Fi no es recomendable para computadoras de facturación fija debido a posibles microcortes de red inalámbrica que interrumpen la comunicación con la base de datos central.
2. **Obtener la dirección IP de la PC Principal (Servidor):**
   * En la PC principal, abra el menú Inicio, escriba `cmd` y pulse Enter para abrir la consola.
   * Ejecute el comando `ipconfig` y anote la dirección IPv4 local (ejemplo: `192.168.1.100`).
3. **Configuración de Firewall de Windows en la PC Principal:**
   * Las terminales cliente se conectarán al backend (puerto `5000`) y al frontend (puerto `5173`). Ambos puertos deben estar abiertos en la PC Servidor.
   * En el Servidor, vaya a *Panel de Control > Firewall de Windows Defender > Configuración Avanzada > Reglas de Entrada > Nueva Regla*.
   * Elija **Puerto**, luego escriba `5000, 5173` y seleccione **Permitir la conexión**. Habilite la regla para redes Privadas.
4. **Vincular la Terminal Cliente:**
   * Encienda la segunda computadora e inicie la interfaz web del sistema desde el navegador local accediendo a la IP de la PC principal: `http://192.168.1.100:5173`
   * Si accede por separado a través de una compilación local independiente en la PC cliente: en la ventana de login, pulse la combinación de teclas **`Ctrl + Alt + P`** o haga clic 5 veces seguidas sobre el logotipo de WinterPos.
   * Se abrirá el panel oculto de **Configuración de Endpoint**.
   * Escriba la IP de la PC Servidor (ejemplo: `192.168.1.100`) y presione **Guardar Ruta y Reconectar**.
5. **Sesiones de Operadores Independientes:**
   * Desde la PC principal, ingrese a *Configuración > Usuarios* y cree un usuario diferente para el operador de la segunda caja.
   * Al iniciar sesión en la segunda terminal, el sistema detectará el operador asignado. Todas las ventas registradas e ingresos quedarán auditados de manera independiente indicando en el Kardex y en el cierre la estación y usuario correspondiente.

---

### CONFIGURACIÓN EN DISPOSITIVOS MÓVILES (TELÉFONOS Y TABLETS)
1. Conecte el dispositivo móvil (teléfono o tablet) al mismo router **Wi-Fi** al que está conectada la PC Servidor.
2. Abra el navegador web de su dispositivo móvil.
3. Ingrese la dirección IP de red expuesta por la PC Servidor junto con el puerto asignado (Ej: `http://192.168.1.100:5173`).
4. La interfaz cargará de inmediato.
   * *Nota:* Para operar cómodamente la interfaz de caja desde un teléfono móvil, úselo en **modo horizontal (landscape)**.
   * Para más detalles sobre adaptabilidad móvil, consulte el archivo [Manual_Acceso_Movil_y_Responsividad.md](file:///c:/Users/Casa/.gemini/antigravity-ide/scratch/WinterPos/WinterPosAL/Manuales/Manual_Acceso_Movil_y_Responsividad.md).
