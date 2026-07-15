import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const folderPath = path.join(__dirname, 'Manuales');

if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log('✅ Directorio /Manuales creado con éxito.');
}

const manualUsuario = `# MANUAL DE USUARIO - WINTERPOSAL
## Sistema de Ventas Multimoneda y Concurrente para Venezuela

Este manual describe el flujo operativo diario del cajero y administrador en el sistema WinterPosAL.

---

### MÓDULO 1: CONFIGURACIÓN CENTRAL DEL NEGOCIO
Antes de vender, configure la identidad de su comercio:
1. Ingrese con credenciales de **Administrador**.
2. Vaya a **Configuración > Datos de la Empresa**.
3. Complete los campos de **Nombre**, **RIF**, **Dirección**, **Teléfono** y **Mensaje de Pie de Ticket**.
4. Presione **Guardar**. Estos datos se inyectarán de forma dinámica en todos los encabezados de tickets de venta y reportes fiscales de la empresa.

---

### MÓDULO 2: CONTROL DE INVENTARIO, MERMAS Y AJUSTES DE PRECIOS
Este sistema audita de manera estricta y transparente cualquier modificación de la base de datos:
1. **Entradas y Salidas de Mercancía:** Al recibir mercancía, busque el producto, presione **"Ajustar"**, elija "Entrada" o "Salida" y justifique de forma escrita el motivo.
2. **Registro de Mermas (Pérdidas/Daños):** Si un artículo se daña, rompe o vence, efectúe un ajuste de tipo **"Merma"** explicando detalladamente la justificación. El stock se deducirá automáticamente y el Kardex conservará la traza del operador a cargo.
3. **Auditoría de Ajuste de Precios:** Cualquier modificación sobre los precios de costo, detalle o mayor quedará registrada históricamente asociando el usuario que ejecutó la orden, el precio anterior y el precio nuevo.

---

### MÓDULO 3: PROCESAMIENTO DE VENTAS Y PAGOS MIXTOS (PAGO MÓVIL / BIOPAGO)
Este sistema permite registrar múltiples métodos de cobro en un mismo ticket:
1. Al pulsar **COBRAR**, se abrirá la interfaz de pago.
2. Introduzca los montos entregados por el cliente en dólares, bolívares en efectivo, tarjeta de débito, Pago Móvil o Biopago.
3. **Validación Electrónica:** Para Pago Móvil y Biopago, el sistema exige de forma obligatoria el número de referencia bancaria de al menos 4 caracteres y el banco emisor. Si el campo está vacío o es inferior, el botón de cobro se bloqueará.
4. **Cálculo de Vuelto:** El sistema calcula de forma instantánea el cambio a entregar en dólares y bolívares, utilizando la tasa de cobro para ingresos y la tasa de vuelto para el cambio.
`;

const manualTecnicoBD = `# MANUAL TÉCNICO: CONFIGURACIÓN DE BASE DE DATOS (POSTGRESQL)
## WinterPosAL - Servidor de Datos Central

Este manual detalla los pasos para instalar, configurar y securizar la base de datos PostgreSQL de WinterPosAL.

---

### PASO 1: INSTALACIÓN DEL MOTOR DE BASE DE DATOS
1. Descargue e instale **PostgreSQL 15 o superior** en el equipo Servidor.
2. Defina la clave maestra para el usuario administrador \`postgres\`.

---

### PASO 2: CREACIÓN DE LA BD Y DE LAS TABLAS DE AUDITORÍA
1. Ejecute el script SQL para crear la base de datos de producción:
   \`\`\`sql
   CREATE DATABASE winterposal_db;
   \`\`\`
2. Corra el archivo \`schema.sql\` que incluye las tablas transaccionales y de trazabilidad (\`Movimientos_Inventario\`, \`Historial_Precios\`).

---

### PASO 3: CONFIGURACIÓN DE CONEXIÓN REMOTA EN POSTGRES
1. En \`postgresql.conf\`, asegure:
   \`\`\`text
   listen_addresses = '*'
   \`\`\`
2. En \`pg_hba.conf\`, configure el segmento de su red local:
   \`\`\`text
   host    winterposal_db   all             192.168.1.0/24          scram-sha-256
   \`\`\`
3. Reinicie el servicio de PostgreSQL.
`;

const manualMultiEstacion = `# MANUAL DE CONFIGURACIÓN: INTERCONEXIÓN MULTI-ESTACIÓN (LAN)
## WinterPosAL - Red Local de Caja y Facturación Concurrente

Este manual técnico explica paso a paso cómo conectar de manera simultánea múltiples computadoras para operar de forma concurrente bajo un inventario centralizado.

---

### CONFIGURACIÓN EN LA PC SERVIDOR (PRINCIPAL)
1. Configure una **IP estática (fija)** en las propiedades TCP/IPv4 del adaptador de red (Ej. \`192.168.1.100\`).
2. Abra el **Firewall de Windows** o Linux y agregue una regla de entrada para habilitar el puerto \`5432\` (PostgreSQL).

---

### CONFIGURACIÓN EN LAS ESTACIONES CLIENTE
1. Conecte los equipos al router utilizando un cable Ethernet Cat5e/6 de alta velocidad.
2. Inicie WinterPosAL en la estación cliente y, en el login, pulse \`Ctrl + Alt + P\` o haga clic 5 veces sobre el logotipo.
3. Configure la IP del servidor origen (\`192.168.1.100\`).
4. Presione **Guardar Ruta y Reconectar**. La terminal cliente se enlazará automáticamente al servidor centralizado.
`;

try {
    fs.writeFileSync(path.join(folderPath, 'Manual_de_Usuario.md'), manualUsuario, 'utf8');
    fs.writeFileSync(path.join(folderPath, 'Manual_Tecnico_BD.md'), manualTecnicoBD, 'utf8');
    fs.writeFileSync(path.join(folderPath, 'Manual_Multi_Estacion.md'), manualMultiEstacion, 'utf8');
    console.log('✅ Manuales de control y parametrización generados exitosamente en /Manuales/');
} catch (error) {
    console.error('❌ Error al escribir los manuales:', error);
}
