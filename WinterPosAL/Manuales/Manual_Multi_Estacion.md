# MANUAL DE CONFIGURACIÓN: INTERCONEXIÓN MULTI-ESTACIÓN (LAN)
## WinterPosAL - Red Local de Caja y Facturación Concurrente

Este manual técnico explica paso a paso cómo conectar de manera simultánea múltiples computadoras para operar de forma concurrente bajo un inventario centralizado.

---

### CONFIGURACIÓN EN LA PC SERVIDOR (PRINCIPAL)
1. Configure una **IP estática (fija)** en las propiedades TCP/IPv4 del adaptador de red (Ej. `192.168.1.100`).
2. Abra el **Firewall de Windows** o Linux y agregue una regla de entrada para habilitar el puerto `5432` (PostgreSQL).

---

### CONFIGURACIÓN EN LAS ESTACIONES CLIENTE
1. Conecte los equipos al router utilizando un cable Ethernet Cat5e/6 de alta velocidad.
2. Inicie WinterPosAL en la estación cliente y, en el login, pulse `Ctrl + Alt + P` o haga clic 5 veces sobre el logotipo.
3. Configure la IP del servidor origen (`192.168.1.100`).
4. Presione **Guardar Ruta y Reconectar**. La terminal cliente se enlazará automáticamente al servidor centralizado.
