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

### CONFIGURACIÓN EN LAS ESTACIONES CLIENTE (COMPUTADORAS)
1. Conecte los equipos al router utilizando un cable Ethernet Cat5e/6 de alta velocidad.
2. Inicie WinterPosAL en la estación cliente y, en el login, pulse `Ctrl + Alt + P` o haga clic 5 veces sobre el logotipo.
3. Configure la IP del servidor origen (`192.168.1.100`).
4. Presione **Guardar Ruta y Reconectar**. La terminal cliente se enlazará automáticamente al servidor centralizado.

---

### CONFIGURACIÓN EN DISPOSITIVOS MÓVILES (TELÉFONOS Y TABLETS)
1. Conecte el dispositivo móvil (teléfono o tablet) al mismo router **Wi-Fi** al que está conectada la PC Servidor.
2. Abra el navegador web de su dispositivo móvil.
3. Ingrese la dirección IP de red expuesta por la PC Servidor junto con el puerto asignado (Ej: `http://192.168.1.100:5173`).
4. La interfaz cargará de inmediato.
   * *Nota:* Para operar cómodamente la interfaz de caja desde un teléfono móvil, úselo en **modo horizontal (landscape)**.
   * Para más detalles sobre adaptabilidad móvil, consulte el archivo [Manual_Acceso_Movil_y_Responsividad.md](file:///d:/Antigravity/Proyecto1/WinterPosAL/Manuales/Manual_Acceso_Movil_y_Responsividad.md).
