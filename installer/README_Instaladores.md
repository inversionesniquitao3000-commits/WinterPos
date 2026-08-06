# INSTRUCCIONES DE COMPILACIÓN DE INSTALADORES - WINTERPOS PUNTO DE VENTA

Este directorio contiene los scripts oficiales de Inno Setup para compilar los ejecutables de distribución comercial del sistema **WinterPosAL**.

---

## 🛠️ ARCHIVOS DE INSTALADOR (.ISS) INCLUIDOS

1. **`WinterPos_Installer_Completo.iss` (Recomendado para Producción Offline)**
   * **Nombre de salida:** `WinterPosSetup_Completo_Offline.exe`
   * **Tamaño aprox:** ~350 MB (incluye motor PostgreSQL 15 + Node portátil + Frontend dist).
   * **Uso:** Ideal para instalar en negocios nuevos sin conexión a internet. Instala la base de datos automáticamente en segundo plano (`--mode unattended`).

2. **`WinterPos_Installer_Liviano.iss` (Instalador de Red LAN)**
   * **Nombre de salida:** `WinterPosSetup_Liviano.exe`
   * **Tamaño aprox:** ~9 MB.
   * **Uso:** Ideal para instalar en Cajas Secundarias (Terminales Cliente) o servidores que ya cuentan con PostgreSQL previamente instalado.

3. **`WinterPos_Installer.iss` (Instalador Estándar)**
   * **Nombre de salida:** `WinterPosSetup_v1.0.exe`
   * **Uso:** Script base configurable para despliegues personalizados.

---

## 🚀 CÓMO COMPILAR LOS INSTALADORES

1. Descargue e instale **Inno Setup 6** (gratuito) desde [https://jrsoftware.org/isdl.php](https://jrsoftware.org/isdl.php).
2. Abra cualquiera de los archivos `.iss` con Inno Setup Compiler.
3. Presione **`Ctrl + F9`** (o el botón *Compile* en la barra de herramientas).
4. El ejecutable compilado listo para entregar al cliente se generará en la carpeta: `..\installer_output\`.

---

## ⚙️ CARACTERÍSTICAS Y AUTOMATIZACIONES INCLUIDAS

* **Asistente de Selección de Rol (Servidor Central vs Caja Secundaria)**.
* **Configuración Automática de Red e IP del Servidor (`backend\.env`)**.
* **Reglas del Cortafuegos de Windows (Netsh)** para apertura de puertos `5000` (Web/API) y `5432` (PostgreSQL).
* **Acceso Directo Silencioso (`Iniciar_WinterPos.vbs`)** para ocultar la consola CMD en producción.
* **Casilla opcional de Modo Depuración (`debugmode`)** para revisar la consola CMD con logs técnicos en vivo.
* **Icono Personalizado Oficial (`app_icon.ico`)** en el instalador, acceso directo y desinstalador.
