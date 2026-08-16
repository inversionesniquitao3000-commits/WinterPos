## 💡 ACLARACIÓN IMPORTANTE SOBRE LOS ARCHIVOS Y PESOS

* **Los archivos `.iss` de la carpeta `installer\` (pesan ~8 KB):** Son **scripts de texto** con instrucciones de código. No son los programas instaladores en sí, sino las "recetas" que lee el programa Inno Setup para construir los ejecutables.
* **Los ejecutables `.exe` compilados (pesan entre ~9 MB y ~350 MB):** Son los verdaderos instaladores comerciales que se generan en la carpeta `installer_output\` después de compilar.

---

## 🛠️ ARCHIVOS DE INSTALADOR (.ISS) Y SUS RESULTADOS COMPILADOS

1. **`WinterPos_Installer_Completo.iss` (Recomendado para Producción Offline)**
   * **Script `.iss` (Texto):** ~8 KB.
   * **Ejecutable final compilado (`WinterPosSetup_Completo_Offline.exe`):** ~350 MB.
   * **¿Por qué pesa ~350 MB el `.exe` final?** Porque al compilar empaqueta dentro del mismo ejecutable el instalador oficial de PostgreSQL 15 (~300 MB) + el motor `node.exe` (~35 MB) + los módulos del backend y la interfaz web `dist/`.
   * **Uso:** Ideal para instalar en negocios nuevos sin conexión a internet. Instala la base de datos automáticamente en segundo plano (`--mode unattended`).

2. **`WinterPos_Installer_Liviano.iss` (Instalador de Red LAN)**
   * **Script `.iss` (Texto):** ~8 KB.
   * **Ejecutable final compilado (`WinterPosSetup_Liviano.exe`):** ~9 MB a ~40 MB.
   * **Uso:** Ideal para Cajas Secundarias (Terminales Cliente) o servidores que ya tienen PostgreSQL previamente instalado. No incluye la base de datos dentro del paquete.

3. **`WinterPos_Installer.iss` (Instalador Estándar)**
   * **Nombre de salida:** `WinterPosSetup_v1.0.exe`
   * **Uso:** Script base configurable para despliegues personalizados.

---

## 🔒 SEGURIDAD Y PROTECCIÓN DE CÓDIGO FUENTE (PRODUCCIÓN)

Para evitar que los clientes o terceros puedan ver tu código fuente o las herramientas de licenciamiento:

1. **Aislamiento Total:** El generador de licencias (`tools/generate-license.js`), la clave privada RSA (`private_key.pem`) y el registro de clientes están **100% excluidos** del instalador.
2. **Cifrado y Ofuscación Anti-Manipulación:** Antes de compilar, el backend se encripta con algoritmos de ofuscación de grado militar (RC4, aplanamiento de flujo de control, auto-defensa contra manipulación).
3. **Frontend sin Sourcemaps:** El frontend en React se compila sin mapas de desarrollo.

---

## 🚀 CÓMO COMPILAR LOS INSTALADORES DE FORMA PROTEGIDA

1. Ejecute el archivo **`Preparar_Instalador_Protegido.bat`** (ubicado en la raíz de WinterPos).
   * Este script compila automáticamente el frontend y encripta el backend.
2. Abra **Inno Setup 6** con el script que desee (ej. `installer\WinterPos_Installer_Completo.iss`).
3. Presione **`Ctrl + F9`** para compilar el `.exe` final.
4. Cuando termine, en la ventana de `Preparar_Instalador_Protegido.bat` presione `S` para restaurar su código fuente limpio de desarrollo.

---

## 🔑 CREDENCIALES DE ACCESO DEL INSTALADOR

Al iniciar cualquiera de los instaladores generados, se solicitará autenticación del técnico autorizado:

* **Usuario:** `laguna12`
* **Contraseña:** `Osopolar*01`
* **Casilla:** `👁️ Mostrar contraseña` (para verificar que se escribió correctamente).

Sin estas credenciales, el instalador no permitirá continuar ni instalará ningún componente en el equipo.

---

## ⚙️ CARACTERÍSTICAS Y AUTOMATIZACIONES INCLUIDAS

* **Bloqueo por Autenticación de Seguridad** (Usuario y Contraseña protegida).
* **Asistente de Selección de Rol (Servidor Central vs Caja Secundaria)**.
* **Configuración Automática de Red e IP del Servidor (`backend\.env`)**.
* **Reglas del Cortafuegos de Windows (Netsh)** para apertura de puertos `5000` (Web/API) y `5432` (PostgreSQL).
* **Acceso Directo Silencioso (`Iniciar_WinterPos.vbs`)** para ocultar la consola CMD en producción.
* **Casilla opcional de Modo Depuración (`debugmode`)** para revisar la consola CMD con logs técnicos en vivo.
* **Icono Personalizado Oficial (`app_icon.ico`)** en el instalador, acceso directo y desinstalador.

