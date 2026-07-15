# MANUAL TÉCNICO: CONFIGURACIÓN DE BASE DE DATOS (POSTGRESQL)
## WinterPosAL - Servidor de Datos Central

Este manual detalla los pasos para instalar, configurar y securizar la base de datos PostgreSQL de WinterPosAL.

---

### PASO 1: INSTALACIÓN DEL MOTOR DE BASE DE DATOS
1. Descargue e instale **PostgreSQL 15 o superior** en el equipo Servidor.
2. Defina la clave maestra para el usuario administrador `postgres`.

---

### PASO 2: CREACIÓN DE LA BD Y DE LAS TABLAS DE AUDITORÍA
1. Ejecute el script SQL para crear la base de datos de producción:
   ```sql
   CREATE DATABASE winterposal_db;
   ```
2. Corra el archivo `schema.sql` que incluye las tablas transaccionales y de trazabilidad (`Movimientos_Inventario`, `Historial_Precios`).

---

### PASO 3: CONFIGURACIÓN DE CONEXIÓN REMOTA EN POSTGRES
1. En `postgresql.conf`, asegure:
   ```text
   listen_addresses = '*'
   ```
2. En `pg_hba.conf`, configure el segmento de su red local:
   ```text
   host    winterposal_db   all             192.168.1.0/24          scram-sha-256
   ```
3. Reinicie el servicio de PostgreSQL.
