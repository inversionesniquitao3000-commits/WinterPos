# 📖 MANUAL TÉCNICO Y OPERATIVO DE LICENCIAMIENTO Y SEGURIDAD - WINTERPOS

Este documento constituye la guía oficial para el **Desarrollador / Vendedor** y para el **Usuario Final** sobre cómo generar, instalar, probar y administrar licencias criptográficas vinculadas a Hardware (HWID) en **WinterPos**.

---

## 🛠️ PARTE 1: MANUAL TÉCNICO (Para el Desarrollador / Vendedor)

### 1.1. Arquitectura de Seguridad y Protección de Código
- **Backend Executable & Obfuscation:** El servidor backend Express se compila a binario ejecutable de máquina (`.exe`). Ningún cliente o tercero puede abrir, copiar ni modificar los scripts `.js` o controladores de base de datos.
- **Algoritmo de Licenciamiento:** Criptografía Asimétrica **RSA-2048** con firma digest **SHA-256**.
- **Resguardo de Claves:**
  - **Clave Privada (`tools/keys/private_key.pem`):** Reside en tu repositorio Git privado y en tu máquina de desarrollo. Se utiliza exclusivamente para firmar los archivos `license.lic` y no se incluye en el instalador final del cliente.
  - **Clave Pública (`backend/keys/public_key.pem`):** Viene empaquetada dentro del backend compilado de WinterPos para verificar que la firma RSA sea auténtica.

---

### 1.2. Modo de Prueba Gratuita Automática de 3 Días (Auto-Trial por HWID)

Para facilitar la entrega de demos a potenciales compradores sin necesidad de generar una licencia previa:

- **Primer Arranque:** Al instalar WinterPos en un nuevo equipo sin archivo `license.lic`, el sistema registra de forma segura el **HWID único del equipo** y la fecha del primer arranque.
- **Vigencia de la Prueba:** Concede **3 días (72 horas) de uso 100% operativo y gratuito**.
- **Protección Anti-Reinstalación (HWID Registry):** Si el cliente desinstala y vuelve a instalar la aplicación en esa misma máquina, el servidor reconoce que su HWID ya consumió los 3 días de prueba en el pasado y no otorga días adicionales, exigiendo la compra de una licencia.
- **Protección Anti-Reloj:** Si el cliente atrasa la fecha de Windows para intentar burlar los 3 días, el sistema detecta la alteración de tiempo (`TIME_TAMPER`) y bloquea las operaciones.

---

### 1.3. Paso a Paso para Generar una Licencia Definitiva

Cuando un cliente compra el sistema o renueva su suscripción:

#### 1. Obtener el HWID del cliente:
El cliente te enviará por WhatsApp o correo su **Código HWID de Equipo** (ejemplo: `WPOS-8F18-BE43-09BF`), el cual aparece en su pantalla de activación.

#### 2. Ejecutar la herramienta generadora:
Abre una consola / terminal en la carpeta principal del proyecto y ejecuta el comando con los parámetros correspondientes:

```bash
# Sintaxis General:
node tools/generate-license.js --hwid="CODIGO_HWID" --client="NOMBRE_EMPRESA" --rif="RIF_O_CEDULA" --terminals=CANTIDAD --days=DIAS
```

#### Ejemplos Prácticos:

* **Ejemplo 1: Licencia por 1 Mes (30 días) con 3 Cajas/Terminales:**
  ```bash
  node tools/generate-license.js --hwid="WPOS-8F18-BE43-09BF" --client="Abasto Central C.A." --rif="J-12345678" --terminals=3 --days=30
  ```

* **Ejemplo 2: Licencia por 1 Año (365 días) con 5 Cajas/Terminales:**
  ```bash
  node tools/generate-license.js --hwid="WPOS-8F18-BE43-09BF" --client="Supermercado Niquitao 3000" --rif="J-41132631" --terminals=5 --days=365
  ```

* **Ejemplo 3: Licencia Vitalicia (Sin fecha de vencimiento) y Cajas Ilimitadas:**
  ```bash
  node tools/generate-license.js --hwid="WPOS-8F18-BE43-09BF" --client="Inversiones Niquitao JB AL 3000" --rif="J-411332631" --terminals=ILIMITADO --days=0
  ```

#### 3. Entregar al cliente:
El comando creará un archivo llamado **`license.lic`** en la raíz del proyecto. Envíale este archivo al cliente por WhatsApp/Correo (o copia su contenido de texto y envíaselo).

---

## 🏪 PARTE 2: MANUAL DEL USUARIO FINAL (Para el Cliente / Comercio)

### 2.1. ¿Cómo Funciona la Prueba Gratuita y la Activación?

1. **Uso de Prueba (Primeros 3 Días):** Al instalar el sistema, el comercio disfruta de **3 días de prueba totalmente gratuitos**. En la barra superior verá la insignia azul **`🛡️ Prueba Gratuita (72h restantes)`**.
2. **Expiración de Prueba / Pantalla de Activación:** Cumplidas las 72 horas o al expirar la licencia, el sistema mostrará la pantalla bloqueante **"ACTIVACIÓN DE LICENCIA REQUERIDA"**. Ningún dato cargado por el comercio se pierde.
3. **Copiar HWID:** Presiona el botón **"📋 Copiar"** al lado de tu Código de Hardware (HWID).
4. **Solicitar Licencia:** Presiona **"💬 Solicitar Licencia por WhatsApp"** para enviar tu HWID a soporte.
5. **Cargar Licencia:** Al recibir el archivo `license.lic` de soporte:
   - Haz clic en **"Examinar Archivo"** y selecciona el archivo `license.lic`.
   - O bien, abre el archivo con Bloc de Notas, copia el texto y pégalo en el cuadro de texto.
6. **Activar:** Haz clic en **"🔓 ACTIVAR SISTEMA WINTERPOS"**.
7. **¡Listo!** El sistema verificará la firma digital en menos de 1 segundo, desbloqueará el punto de venta y dejará operativas todas las cajas de tu red local.

### 2.2. Consulta Anticipada de Licencia e Información de Equipo (Tecla F9)

- **Consulta en Pantalla de Login:** El usuario puede presionar la tecla **`F9`** o hacer clic en el botón **`🛡️ Licencia (F9)`** en la esquina superior de la pantalla de inicio de sesión en cualquier momento (incluso durante la prueba).
- **Consulta dentro del Punto de Venta:** Presionando **`F9`** o haciendo clic en el badge superior.
- **Detalles Mostrados:** Muestra el nombre de la empresa registrada, RIF, vigencia, días u horas restantes de prueba/licencia, número de cajas autorizadas, botón para copiar HWID, contacto directo de soporte y la opción de renovar o extender la licencia con anticipación.

---

## 🔒 PARTE 3: MEDIDAS DE SEGURIDAD Y PREGUNTAS FRECUENTES

- **¿Qué ocurre si el cliente desinstala y reinstala para intentar tener otros 3 días gratis?**
  No funcionará. El servidor guarda el HWID único del procesador/tarjeta madre. Al reinstalar, reconoce que ese equipo ya agotó sus 3 días y exige la compra de la licencia.
- **¿Qué ocurre si el cliente atrasa la fecha de Windows para evadir la expiración?**
  WinterPos registra en la base de datos la última fecha de operación. Si la fecha de Windows es menor a la registrada anteriormente, el sistema activa la protección **Anti-Time Tampering** y se bloquea por seguridad de tiempo.
- **¿Qué ocurre si copian la carpeta del sistema a otra computadora?**
  No funcionará. La licencia está vinculada criptográficamente al **HWID de la placa y procesador del equipo original**. En la nueva computadora mostrará error `HWID_MISMATCH` y exigirá una nueva licencia.
- **¿Qué ocurre con las cajas secundarias conectadas en red local (LAN)?**
  Las cajas secundarias no requieren licencia individual. Se conectan al Servidor Central y el Servidor controla que el número de cajas activas no supere el límite contratado en la licencia.
