# MANUAL DE ACCESO MÓVIL Y RESPONSIVIDAD (TABLETS Y TELÉFONOS)
## WinterPosAL - Flexibilidad de Caja y Consulta de Inventario Portátil

Este manual técnico y de usuario detalla las características de diseño adaptable de **WinterPosAL** y los pasos para habilitar el acceso inalámbrico desde dispositivos móviles (teléfonos inteligentes y tablets) dentro de la misma red local (Wi-Fi).

---

### MÓDULO 1: RESPONSIVIDAD Y COMPATIBILIDAD MÓVIL
WinterPosAL está optimizado con **Tailwind CSS** empleando patrones de diseño responsive para adaptarse a diferentes tamaños de pantalla:

1. **Vistas Adaptables:**
   * **Login:** Se ajusta a una sola columna en pantallas verticales móviles.
   * **Inventario:** Las tablas tienen desplazamiento horizontal automático (`overflow-x-auto`), permitiendo ver los productos sin desconfigurar la pantalla.
   * **Clientes:** Las tarjetas de totales y de filtrado se acomodan verticalmente en móviles y en cuadrículas en tablets.
2. **Recomendación de Uso:**
   * **Caja / Punto de Venta (CajaPOS):** Debido a la cantidad de información (lista de productos, totales de cobro, teclado numérico y tasas de cambio), se recomienda encarecidamente utilizar dispositivos de al menos **8 pulgadas (tablets)** o usar teléfonos móviles en **modo horizontal (landscape)** para una experiencia cómoda.

---

### MÓDULO 2: PASO A PASO PARA ABRIR EL SISTEMA EN TU CELULAR/TABLET
Para poder abrir WinterPosAL en tu teléfono o tablet, ambos equipos (la computadora Servidor y el dispositivo móvil) deben estar conectados al **mismo router Wi-Fi**.

#### Paso 1: Configurar el Servidor Vite para Acceso de Red
El sistema ya viene preconfigurado en `vite.config.ts` con la directiva `server: { host: true }`. Esto significa que ya no hace falta pasar ningún parámetro especial.

1. Simplemente inicia el servidor normalmente:
   ```bash
   npm run dev
   ```
2. En la terminal se mostrará la dirección de red local similar a esta:
   ```text
     VITE v5.4.21  ready in 663 ms

     ➜  Local:   http://localhost:5173/
     ➜  Network: http://192.168.11.13:5173/
   ```

#### Paso 2: Conectar desde el Dispositivo Móvil (Detección Automática)
1. Asegúrate de que el Wi-Fi de tu celular o tablet esté **encendido** y conectado a la misma red de la tienda.
2. Abre el navegador web de tu preferencia (Chrome, Safari, Firefox).
3. Introduce en la barra de direcciones la URL de la red local que te dio la consola del servidor (ej. `http://192.168.11.13:5173`).
4. **¡Listo!** La pantalla de login del sistema cargará de inmediato en tu pantalla móvil.
5. **Conexión de Base de Datos Automática:** El sistema detectará de forma inteligente que estás accediendo desde una IP de la red local, y configurará el backend automáticamente para que se comunique con la PC Servidor en `http://192.168.11.13:5000`. No requiere que configures nada en la pantalla oculta de la app.

---

### MÓDULO 3: PERMISOS DE CORTAFUEGOS (FIREWALL)
Si al ingresar la dirección en tu móvil se queda cargando o muestra un error de conexión, es muy probable que el Firewall de Windows esté bloqueando la entrada:

1. Ve a **Inicio > Panel de Control > Firewall de Windows**.
2. Selecciona **Permitir que una aplicación o una característica a través de Firewall de Windows**.
3. Asegúrate de que **Node.js JavaScript Runtime** tenga habilitados los checks de red **Privada** y **Pública**.
4. Alternativamente, puedes abrir un puerto específico (ej. puerto `5173`) agregando una **Regla de Entrada** en la configuración avanzada del Firewall.
