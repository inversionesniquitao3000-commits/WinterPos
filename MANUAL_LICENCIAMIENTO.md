# 📖 MANUAL TÉCNICO Y OPERATIVO DE LICENCIAMIENTO - WINTERPOS

Este documento constituye la guía oficial para el **Desarrollador / Vendedor** y para el **Usuario Final** sobre cómo generar, instalar y administrar licencias criptográficas vinculadas a Hardware (HWID) en **WinterPos**.

---

## 🛠️ PARTE 1: MANUAL TÉCNICO (Para el Desarrollador / Vendedor)

### 1.1. Arquitectura de Seguridad
- **Algoritmo:** Criptografía Asimétrica **RSA-2048** con firma digest **SHA-256**.
- **Resguardo de Claves:**
  - **Clave Privada (`tools/keys/private_key.pem`):** Reside **ÚNICAMENTE** en la computadora del desarrollador. Está protegida en el `.gitignore` y **NUNCA** debe entregarse al cliente ni subirse a Git. Sirve para firmar los archivos `license.lic`.
  - **Clave Pública (`backend/keys/public_key.pem`):** Viene empaquetada dentro del backend de WinterPos para verificar que la firma RSA sea auténtica.

---

### 1.2. Paso a Paso para Generar una Licencia

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
  node tools/generate-license.js --hwid="WPOS-8F18-BE43-09BF" --client="Comercio VIP" --rif="J-00000000" --terminals=ILIMITADO --days=0
  ```

#### 3. Entregar al cliente:
El comando creará un archivo llamado **`license.lic`** en la raíz del proyecto. Envíale este archivo al cliente por WhatsApp/Correo (o copia su contenido de texto y envíaselo).

---

## 🏪 PARTE 2: MANUAL DEL USUARIO FINAL (Para el Cliente / Comercio)

### 2.1. ¿Cómo Activar o Renovar la Licencia en el Comercio?

1. **Pantalla de Activación:** Al abrir WinterPos en la máquina **Servidor Central** sin licencia activa o con licencia vencida, el sistema mostrará automáticamente la pantalla bloqueante **"ACTIVACIÓN DE LICENCIA REQUERIDA"**.
2. **Copiar HWID:** Presiona el botón **"📋 Copiar"** al lado de tu Código de Hardware (HWID).
3. **Solicitar Licencia:** Presiona **"💬 Solicitar Licencia por WhatsApp"** para enviar tu HWID a soporte.
4. **Cargar Licencia:** Al recibir el archivo `license.lic` de soporte:
   - Haz clic en **"Examinar Archivo"** y selecciona el archivo `license.lic`.
   - O bien, abre el archivo con Bloc de Notas, copia el texto y pégalo en el cuadro de texto.
5. **Activar:** Haz clic en **"🔓 ACTIVAR SISTEMA WINTERPOS"**.
6. **¡Listo!** El sistema verificará la firma digital en menos de 1 segundo, desbloqueará el punto de venta y dejará operativas todas las cajas de tu red local.

---

## 🔒 PARTE 3: MEDIDAS DE SEGURIDAD Y PREGUNTAS FRECUENTES

- **¿Qué ocurre si el cliente atrasa la fecha de Windows para evadir la expiración?**
  WinterPos registra en la base de datos la última fecha de operación. Si la fecha de Windows es menor a la registrada anteriormente, el sistema activa la protección **Anti-Time Tampering** y se bloquea por seguridad de tiempo.
- **¿Qué ocurre si copian la carpeta del sistema a otra computadora?**
  No funcionará. La licencia está vinculada criptográficamente al **HWID de la placa y procesador del equipo original**. En la nueva computadora mostrará error `HWID_MISMATCH` y exigirá una nueva licencia.
- **¿Qué ocurre con las cajas secundarias conectadas en red local (LAN)?**
  Las cajas secundarias no requieren licencia individual. Se conectan al Servidor Central y el Servidor controla que el número de cajas activas no supere el límite contratado en la licencia.
