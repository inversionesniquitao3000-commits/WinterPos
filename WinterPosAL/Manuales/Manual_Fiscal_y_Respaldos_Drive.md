# 📖 MANUAL OFICIAL Y GUÍA DE REFERENCIA TÉCNICA
## WinterPOS Pro: Módulo Fiscal SENIAT, Respaldo en la Nube (Google Drive) y Comercialización

**Versión del Sistema:** 4.5.0 Fiscal & Cloud Sync  
**Fecha de Publicación:** 15 de Agosto de 2026  
**Empresa / Autor:** INVERSIONES NIQUITAO 3000 C.A.  

---

## 📑 ÍNDICE DE CONTENIDOS
1. [Módulo de Respaldo Automático en Google Drive](#1-módulo-de-respaldo-automático-en-google-drive)
   - 1.1 ¿Qué es y cómo funciona?
   - 1.2 Código definitivo para Google Apps Script
   - 1.3 Pasos para crear la Aplicación Web en Google Drive
   - 1.4 Cómo superar la pantalla de verificación de Google
   - 1.5 Configuración en WinterPOS y selección de carpeta personalizada
   - 1.6 Pruebas, sincronización inmediata y respaldos programados
2. [Módulo de Facturación Fiscal SENIAT y Notas de Entrega](#2-módulo-de-facturación-fiscal-seniat-y-notas-de-entrega)
   - 2.1 Compatibilidad con y sin máquina fiscal
   - 2.2 Drivers y marcas de impresoras fiscales compatibles
   - 2.3 Matriz de permisos por rol en Caja POS
   - 2.4 Operación en Caja POS: Selector de Documento
   - 2.5 Reporte X (Mediodía) y Reporte Z (Cierre Diario)
   - 2.6 Libro de Ventas Fiscal Oficial (Providencia SENIAT 0071)
3. [Modelo Comercial para la Venta e Instalación del Software](#3-modelo-comercial-para-la-venta-e-instalación-del-software)
   - 3.1 Modalidades de venta y planes de licenciamiento
   - 3.2 Tabla de precios sugeridos de instalación y soporte mensual
   - 3.3 Servicios de alto margen para fidelizar clientes a largo plazo

---

# 1. Módulo de Respaldo Automático en Google Drive

### 1.1 ¿Qué es y cómo funciona?
Este módulo permite que el sistema WinterPOS guarde copias de seguridad completas de la base de datos (inventario, ventas, clientes, saldos, accionistas, proveedores, configuraciones) directamente en la cuenta de **Google Drive** del comercio.

* **Ventaja:** Protección 100% contra robos de computadoras, daños en disco duro o fallas eléctricas.
* **Costo:** 100% Gratuito (utiliza el almacenamiento de 15 GB que Google incluye con cada cuenta de Gmail).

---

### 1.2 Código definitivo para Google Apps Script

Este script optimizado procesa automáticamente cualquier archivo de respaldo, lo ubica en la carpeta configurada y crea la carpeta si aún no existe.

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var folderName = data.folderName || "WinterPOS_Backups";
    var filename = data.fileName || data.filename || ("winterpos_backup_" + Date.now() + ".json");
    
    // Contenido del archivo (admite JSON directo, texto o Base64)
    var contentString = "";
    if (data.fileContent) {
      contentString = Utilities.newBlob(Utilities.base64Decode(data.fileContent)).getDataAsString();
    } else if (data.backup) {
      contentString = typeof data.backup === "string" ? data.backup : JSON.stringify(data.backup, null, 2);
    } else {
      contentString = JSON.stringify(data, null, 2);
    }

    // Busca si la carpeta ya existe en Google Drive, sino la crea automáticamente
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    // Guarda el archivo de respaldo en la carpeta seleccionada
    var file = folder.createFile(filename, contentString, "application/json");
    
    return ContentService.createTextOutput(JSON.stringify({ 
      ok: true, 
      message: "Respaldo recibido y guardado con éxito en Google Drive", 
      fileId: file.getId(), 
      fileName: filename 
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      ok: false, 
      error: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

### 1.3 Pasos para crear la Aplicación Web en Google Drive

1. Inicia sesión en tu cuenta de Google y entra en [https://script.google.com](https://script.google.com).
2. Haz clic en **`+ Nuevo proyecto`**.
3. Borra todo el código que aparezca y pega el código mostrado en la sección 1.2.
4. Arriba en el menú, haz clic en el ícono del **Disco 💾 (Guardar)**.
5. Haz clic en el botón azul **`Implementar` -> `Nueva implementación`**.
6. En el engranaje ⚙️ a la izquierda de "Seleccionar tipo", elige **`Aplicación web`**.
7. Llena los campos exactamente así:
   * **Descripción:** `WinterPOS Cloud Backup`
   * **Ejecutar como:** `Yo (tu correo de Gmail)`
   * **Quién tiene acceso:** **`Cualquier usuario`** *(o Anyone)*.
8. Haz clic en el botón azul **`Implementar`**.

---

### 1.4 Cómo superar la pantalla de verificación de Google

La primera vez que implementas el script, Google te mostrará una ventana de seguridad (*Google hasn't verified this app*):

1. Haz clic en el enlace gris pequeño abajo a la izquierda:  
   👉 **`Go to Proyecto sin título (unsafe)`** *(o "Ir a Proyecto sin título - no seguro")*.
2. En la siguiente pantalla, haz clic en el botón azul:  
   👉 **`Allow`** *(Permitir)*.
3. Copia la **URL de la aplicación web** generada (termina en `/exec`).

---

### 1.5 Configuración en WinterPOS y selección de carpeta personalizada

1. En el sistema WinterPOS, ingresa al módulo **F7 CONFIGURACIÓN**.
2. Haz clic en la pestaña **Base de Datos**.
3. En la tarjeta azul **`Respaldo Automático en la Nube (Google Drive)`**:
   * Cambia el switch a **`ACTIVO`**.
   * **Método:** `Google Apps Script Webhook`.
   * **URL de Webhook:** Pega el enlace `/exec`.
   * **Nombre de Carpeta en Google Drive:** Escribe el nombre exacto de la carpeta que desees (ej. `BackupBD`, `WinterPOS_Backups_PC_SALA`, `Respaldos_Principal`).
4. Haz clic en **`Guardar Configuración Drive`**.

> **💡 Nota sobre carpetas:** Si escribes el nombre de una carpeta que ya existe en tu Google Drive (como `BackupBD`), el sistema guardará los archivos dentro de ella. Si no existe, Google Drive la creará automáticamente.

---

### 1.6 Pruebas, sincronización inmediata y respaldos programados

* **Probar conexión:** Haz clic en **`Probar Subida a Drive`**. El sistema enviará un archivo ligero de comprobación y te mostrará el mensaje verde de éxito.
* **Sincronización manual:** Haz clic en **`Sincronizar Respaldo Ahora`** para subir una copia completa en cualquier momento.
* **Respaldo automático:** En la misma pestaña de Base de Datos, activa la **Programación de Respaldo Automático** (ej. *Cada 24 horas a las 02:00 hrs*). El servidor local guardará la copia en el disco duro y la subirá automáticamente a Google Drive.

---

# 2. Módulo de Facturación Fiscal SENIAT y Notas de Entrega

### 2.1 Compatibilidad con y sin máquina fiscal
* **Clientes que NO usan máquina fiscal:** El sistema trabaja al 100% de capacidad como siempre. Las ventas se procesan como *Notas de Entrega / Comprobantes Internos* y se imprimen en impresoras térmicas (58mm/80mm USB o de red).
* **Clientes que SÍ usan máquina fiscal:** El sistema envía los renglones, exentos, bases imponibles y tasas de IVA a la máquina fiscal física, obteniendo de vuelta el número fiscal oficial, serial troquelado y número de Z.

---

### 2.2 Drivers y marcas de impresoras fiscales compatibles
El conector de protocolo fiscal está integrado nativamente en Node.js (`fiscal-service.js`). Es compatible con las principales marcas homologadas por el SENIAT:
1. **The Factory HKA / PNP** (Bixolon SRP-280, SRP-350, Dascom DT-230, Aclas, etc.).
2. **Protocolo PNP Serial / Spooler HTTP Local (`127.0.0.1:8080`)**.
3. **Modo Prueba / Simulación:** Permite probar todo el flujo de ventas fiscales en comercios que aún están esperando la entrega de su máquina fiscal.

**Configuración en F7 Configuración -> Tab Máquinas Fiscales:**
* **Modelo:** Seleccionar *The Factory HKA / PNP*.
* **Puerto COM:** Asignar el puerto COM detectado en Windows (ej. `COM1`, `COM3`).
* **Baud Rate:** `9600` o `19200`.
* **Serial Máquina:** Número troquelado en la chapa fiscal (ej. `Z3C1234567`).
* **Botón `VERIFICAR ESTADO`:** Comprueba la comunicación física con la máquina.

---

### 2.3 Matriz de permisos por rol en Caja POS

Para evitar que cualquier cajero emita ventas no fiscales sin autorización:

1. Ingresa a **F7 Configuración -> Tab Usuarios y Roles**.
2. Al editar un rol o usuario, encontrarás la casilla:
   * **`Autorizar Emisión de Notas de Entrega / Comprobantes No Fiscales (F1 Caja)`**.
3. **Comportamiento:**
   * **Habilitado:** El cajero puede alternar libremente entre *Fiscal SENIAT* y *Nota de Entrega*.
   * **Bloqueado:** El switch de la caja queda fijo en `🔒 Solo Fiscal SENIAT` y no se le permite emitir notas de entrega.
   * **Administrador:** Tiene autorización total en todo momento.

---

### 2.4 Operación en Caja POS: Selector de Documento

Tanto en la barra superior de la Caja POS como en la ventana de cobro (**Checkout**), el operador cuenta con los botones:

* **`[ 🧾 Fiscal SENIAT ]`**: Imprime en la máquina fiscal con correlativo oficial del SENIAT y desglose de IVA (16%), Exento e IGTF (3%).
* **`[ 📄 Nota de Entrega ]`**: Guarda la venta y descuenta el inventario, pero **no** envía datos a la máquina fiscal. Imprime ticket térmico con la leyenda *(DOCUMENTO NO FISCAL - USO ADMINISTRATIVO)*.

---

### 2.5 Reporte X (Mediodía) y Reporte Z (Cierre Diario)

En **F7 Configuración -> Tab Máquinas Fiscales** dispones de los botones de auditoría:

* **`📄 LECTURA X (MEDIODÍA)`**: Emite un reporte informativo parcial sin cerrar el día fiscal.
* **`⚠️ REPORTE Z (CIERRE)`**: Emite el cierre diario oficial del SENIAT, graba en la memoria fiscal y reinicia los contadores diarios a cero.

---

### 2.6 Libro de Ventas Fiscal Oficial (Providencia SENIAT 0071)

En **F4 Historial de Ventas**:
1. **Filtro de visualización:** Puedes alternar entre `[ 🌐 Todos | 🧾 Fiscal SENIAT | 📄 Notas de Entrega ]`.
2. **Botón `📑 Libro de Ventas SENIAT`:** Genera en formato apaisado el **Libro de Ventas Oficial** listo para entregar al contador o fiscal del SENIAT con todas las columnas reglamentarias:
   * N° de Operación
   * Fecha de Emisión
   * RIF / Cédula y Razón Social del Cliente
   * N° de Factura Fiscal y Serial de Máquina
   * N° de Reporte Z
   * Total Ventas (Incluyendo IVA)
   * Ventas Exentas
   * Base Imponible (16%)
   * Débito Fiscal IVA (16%)
   * Retención IGTF (3%)
   * Resumen de Declaración Impositiva y espacio para firma de auditoría.

---

# 3. Modelo Comercial para la Venta e Instalación del Software

Para comercializar WinterPOS y construir un negocio rentable y escalable de soporte de software POS, se recomienda aplicar el siguiente esquema de paquetes:

### 3.1 Planes y Modalidades de Licenciamiento

| Paquete Comercial | Dirigido A | Qué Incluye | Precio Sugerido de Instalación | Mensualidad / Soporte |
| :--- | :--- | :--- | :--- | :--- |
| **Plan Básico Comercial (No Fiscal)** | Abastos, bodegones, panaderías, tiendas de ropa, ferreterías pequeñas. | POS completo, Inventario con Código de Barras, Clientes, Deudas, Notificaciones por WhatsApp, Respaldos en Google Drive y soporte de ticket térmico USB. | **$180 - $250 USD** (Pago único de instalación y capacitación) | **$15 - $20 USD/mes** (Mantenimiento y soporte remoto) |
| **Plan Fiscal SENIAT Pro** | Comercios medianos y grandes, supermercados, farmacias, distribuidores obligados a usar máquina fiscal. | Todo lo del Plan Básico + Driver de Máquina Fiscal (The Factory HKA / Bixolon / Dascom), Reportes X y Z, Libro de Ventas SENIAT (Providencia 0071) y control de permisos. | **$350 - $480 USD** (Instalación, homologación física y capacitación tributaria) | **$30 - $45 USD/mes** (Actualizaciones de ley y soporte prioritario) |
| **Plan SaaS Anual (Todo Incluido)** | Clientes que prefieren no pagar costos altos de entrada y pagar por suscripción. | Licencia activa del sistema, actualizaciones continuas de tasas BCV automáticas, bot de WhatsApp, respaldos ilimitados en Drive y soporte 24/7. | **$60 - $80 USD** (Costo de puesta en marcha) | **$25 - $35 USD/mes** por caja (Cobro trimestral o semestral) |

---

### 3.2 Servicios Adicionales de Alto Margen

1. **Carga y Digitalización de Catálogo Inicial:**  
   * Si el cliente tiene sus productos en Excel o en papel, cobrar de **$50 a $120 USD** por ingresar el catálogo con código de barras, categorías y fotos.
2. **Terminales de Red Adicionales (Multicaja):**  
   * Cobrar **$40 a $60 USD** por cada computadora adicional conectada al servidor principal de la tienda.
3. **Venta de Paquete Llave en Mano (Hardware + Software):**  
   * Armar un combo: Mini PC Intel Core i3/i5 + Impresora Térmica 80mm + Lector de Códigos de Barra Omnidireccional + Gaveta de Dinero + WinterPOS preinstalado.  
   * **Costo del Hardware:** ~$280 USD  
   * **Precio de Venta al Comercio:** **$550 - $650 USD** *(Margen de ganancia de más del 100%)*.
4. **Contratos de Mantenimiento Preventivo:**  
   * Visita mensual presencial para limpieza de base de datos, verificación de respaldos en Google Drive y optimización de velocidad.
