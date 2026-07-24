# MANUAL TÉCNICO: CONFIGURACIÓN DE BASE DE DATOS (POSTGRESQL) Y DESPLIEGUE EN PRODUCCIÓN
## WinterPosAL - Servidor de Datos Central y Producción

Este manual detalla los requisitos, credenciales y el paso a paso para configurar la base de datos PostgreSQL y desplegar el sistema WinterPosAL en un ambiente de producción.

---

## 1. UBICACIÓN DE CREDENCIALES DE LA BASE DE DATOS

Las credenciales de acceso a la base de datos están almacenadas en el archivo de configuración ambiental **`.env`** ubicado en la raíz de la carpeta del backend:
`[directorio-del-proyecto]/backend/.env`

### Estructura de credenciales en el archivo `.env`:
```env
PORT=5000
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=winterposal_db
```
*(Nota: Modifica estos valores en producción con contraseñas seguras y hosts adecuados).*

---

## 2. REQUISITOS PREVIOS (¿Qué debe estar instalado y activo?)

Para que el sistema funcione correctamente de forma permanente, deben estar activos los siguientes servicios:
1. **Motor de Base de Datos:** PostgreSQL (Versión 15 o superior).
2. **Servicio del Sistema:** El servicio de PostgreSQL debe estar corriendo en segundo plano.
3. **Entorno de Ejecución:** Node.js (Versión 18 o superior).
4. **Backend Server:** El proceso Node.js del backend escuchando peticiones en el puerto `5000` (o el configurado en `.env`).
5. **Frontend Web:** El servidor estático de producción o servidor Vite escuchando en el puerto `5173`.

---

## 3. PASO A PASO PARA EL DESPLIEGUE EN PRODUCCIÓN

Siga este orden riguroso para instalar y desplegar el sistema en un nuevo ambiente:

### PASO 1: Instalación de Dependencias de Software
1. **Instalar Node.js:** Descargue e instale la versión LTS desde [nodejs.org](https://nodejs.org/).
2. **Instalar PostgreSQL:**
   - **En Windows:** Descargue el instalador interactivo de PostgreSQL 15+ de [EnterpriseDB](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads). Durante la instalación, defina una contraseña para el usuario administrador `postgres` (por ejemplo, `postgres` o una contraseña segura).
   - **En Linux (Ubuntu/Debian):** Ejecute:
     ```bash
     sudo apt update
     sudo apt install postgresql postgresql-contrib
     ```
3. **Verificar que PostgreSQL esté activo:**
   - **En Windows:** Presione `Win + R`, escriba `services.msc` y verifique que el servicio `postgresql-x64-[versión]` esté en estado *En ejecución* (Running) y con tipo de inicio *Automático*.
   - **En Linux:** Ejecute `sudo systemctl status postgresql` y asegúrese de que esté `active (running)`.

### PASO 2: Configuración del Archivo `.env` del Backend
1. Navegue al directorio `backend/`.
2. Cree o edite el archivo `.env`.
3. Ingrese los detalles de conexión de su PostgreSQL:
   ```env
   PORT=5000
   DB_USER=postgres
   DB_PASSWORD=LA_CONTRASENA_QUE_DEFINISTE_EN_LA_INSTALACION
   DB_HOST=localhost
   DB_PORT=5432
   DB_DATABASE=winterposal_db
   ```

### PASO 3: Inicialización de la Base de Datos (Tablas y Esquema)
1. Abra una terminal en el directorio `backend/`.
2. Asegúrese de tener instaladas las dependencias ejecutando:
   ```bash
   npm install
   ```
3. Ejecute el script de inicialización automática de base de datos:
   ```bash
   node init-db.js
   ```
   *Este script se encarga de:*
   - Conectarse al motor PostgreSQL.
   - Verificar si la base de datos `winterposal_db` existe. Si no, la creará de forma automática.
   - Leer el archivo `schema.sql` y crear todas las tablas, relaciones e índices del sistema de forma automática si no existen.

### PASO 4: Despliegue Permanente del Backend
Para producción, no se recomienda correr el backend con una consola abierta de forma manual. Use un administrador de procesos como **PM2** para que el servidor backend se reinicie automáticamente si falla o si el equipo se reinicia:
1. Instale PM2 de forma global:
   ```bash
   npm install -g pm2
   ```
2. Inicie el servidor con PM2 desde la carpeta `backend/`:
   ```bash
   pm2 start server.js --name "winterpos-backend"
   ```
3. Guarde la lista de procesos y configure el inicio automático con el sistema operativo:
   ```bash
   pm2 save
   pm2 startup
   ```

### PASO 5: Despliegue de Producción del Frontend
En lugar de correr el servidor de desarrollo (`vite` / `npm run dev`), debe compilar la aplicación para producción:
1. Abra una terminal en la carpeta `WinterPosAL/`.
2. Instale las dependencias necesarias:
   ```bash
   npm install
   ```
3. Genere los archivos listos para producción:
   ```bash
   npm run build
   ```
   *Esto generará una carpeta llamada `dist/` en el directorio `WinterPosAL/` que contiene archivos HTML, JS y CSS optimizados.*
4. **Servir la aplicación:**
   - **Opción A (Recomendada):** Monte la carpeta `dist/` en un servidor web de alto rendimiento como **Nginx** o **Apache**.
   - **Opción B (Rápida usando Node):** Instale un servidor estático ligero:
     ```bash
     npm install -g serve
     serve -s dist -l 5173
     ```
     O administre el servidor estático con PM2:
     ```bash
     pm2 serve dist 5173 --name "winterpos-frontend" --spa
     ```

---

## 4. CONFIGURACIÓN MULTI-ESTACIÓN (ACCESO REMOTO)

Si otras computadoras de la red local necesitan conectarse al servidor central de base de datos:
1. **Configurar PostgreSQL para permitir conexiones de red:**
   En el archivo de configuración de PostgreSQL (`postgresql.conf`, usualmente en `C:\Program Files\PostgreSQL\[versión]\data`):
   ```text
   listen_addresses = '*'
   ```
2. **Permitir accesos en `pg_hba.conf`:**
   Al final del archivo `pg_hba.conf` (en la misma carpeta `data/` de PostgreSQL), agregue la regla para su segmento de red (ejemplo si su red es `192.168.1.X`):
   ```text
   host    all             all             192.168.1.0/24          scram-sha-256
   ```
3. **Abrir puertos en el Firewall:**
   Asegúrese de abrir el puerto de comunicación entrante `5432` (PostgreSQL) y el `5000` (Backend API) en el Firewall de Windows del equipo servidor.
4. Reinicie el servicio de PostgreSQL desde el Panel de Servicios de Windows para aplicar los cambios.
