# FLUX STORE Bot

Bot de Discord desarrollado con Node.js y discord.js v14. Tiene comandos slash y comandos con prefijo, paneles de tickets, sorteos, postulaciones, moderación y herramientas para la tienda.

## Requisitos

- Node.js 20 o superior.
- Un bot creado en Discord Developer Portal.
- Los intents que utiliza el bot habilitados en el portal, incluido **Server Members Intent** para bienvenida y autorol, y **Message Content Intent** para comandos con prefijo y AutoMod.
- Permisos adecuados en el servidor: gestionar canales, roles, mensajes y timeout, según las funciones que vayas a habilitar.

## Instalación

1. Clona o descarga este repositorio.
2. Ejecuta \`npm install\`.
3. Copia \`.env.example\` a \`.env\` y revisa todas las variables.
4. No subas \`.env\` ni pegues el token en chats. Configura las mismas variables como secretos en el hosting.
5. Ejecuta \`npm run check\` y \`npm test\`.
6. Registra los comandos con \`npm run deploy\`.
7. Inicia el bot con \`npm start\`.

## Variables de entorno

Los IDs de servidor, roles, canales y emojis se leen de las variables de entorno. Configura `FLUX_STORE_DATA_DIR` para elegir el directorio persistente; `VELO_DATA_DIR` se mantiene como alternativa compatible con despliegues existentes. Revisa las variables de \`.env.example\`, incluidas las de bienvenida, términos, métodos de pago, ticket, logs, sugerencias, reseñas y los cinco emojis del panel.

El almacenamiento actual usa archivos JSON dentro de \`data/\`. En un hosting que borre el disco al reiniciar, los carritos, pedidos, reseñas, sugerencias, vouches y sorteos pueden perderse. Usa almacenamiento persistente o migra a PostgreSQL/SQLite antes de depender de los datos para operaciones comerciales importantes.

## Funciones de FLUX STORE

### Catálogo, carrito y stock
- \`/tienda catalogo\`: consulta el catálogo.
- \`/tienda agregar\`: añade producto, precio, descripción y stock opcional.
- \`/tienda editar\`: actualiza precio o descripción.
- \`/tienda stock\`: configura unidades disponibles; \`0\` marca agotado.
- \`/tienda disponibilidad\`: pausa o activa un producto.
- \`/carrito agregar\`, \`/carrito ver\`, \`/carrito quitar\`, \`/carrito vaciar\`.
- \`/carrito confirmar\`: crea el pedido, calcula el total desde el catálogo y reserva el stock configurado.

Los productos antiguos sin propiedad \`stock\` siguen teniendo stock ilimitado por compatibilidad. Configura su stock con \`/tienda stock\` para habilitar el control de inventario. El precio debe contener una única cantidad numérica, por ejemplo \`7.50 USD\`; los importes escritos como rangos no se aceptan para el checkout.

### Pedidos y ventas
- \`/pedido crear\`: registra una solicitud para un producto del catálogo; el precio escrito debe coincidir con el precio oficial.
- \`/pedido mis-compras\`: muestra el historial del cliente.
- \`/pedido historial\`: historial de un cliente para personal autorizado.
- \`/pedido estado\`: avanza el estado del pedido; solo se puede completar tras verificar el pago o comenzar el procesamiento.
- \`/ventas\`: contador histórico de ventas.
- \`/estadisticas-tienda\`: pedidos registrados, completados, pendientes, cancelados, catálogo e ingresos estimados de pedidos completados.

Los pagos no se verifican automáticamente. Elegir un método no significa que el pedido esté pagado; el personal autorizado debe comprobar el pago antes de avanzar al estado correspondiente. Al cancelar un pedido con stock reservado, el bot intenta liberar esas unidades.

### Comunidad y confianza
- \`/resena publicar\`: permite valorar un pedido completado que pertenezca al autor; una reseña por pedido.
- \`/resena ver\`: consulta reseñas verificadas.
- \`/sugerencia enviar\`: publica una propuesta con botones para votar.
- \`/sugerencia listar\`: muestra propuestas recientes.
- \`/userinfo\`: muestra información pública de un miembro.
- \`/help\` y \`!help\`: ayuda disponible.

### Tickets y postulaciones
- \`/ticket-panel\` publica el panel.
- \`/ticket-edit\` administra la configuración.
- Los tickets incluyen reclamación, bloqueo/desbloqueo, cierre y transcripción, con los emojis personalizados configurados en el entorno.
- Las postulaciones incluyen preguntas configurables y un canal privado por solicitud.

### AutoMod
AutoMod puede bloquear invitaciones de Discord, exceso de menciones, mensajes repetidos y ráfagas de mensajes. Las variables \`AUTOMOD_*\` permiten ajustar su comportamiento. Es una capa básica, no sustituye las herramientas de AutoMod nativas de Discord ni la revisión del personal.

## Ayuda y comprobaciones

- \`npm run check\`: comprueba sintaxis de los archivos JavaScript principales.
- \`npm test\`: ejecuta pruebas unitarias del servicio comercial.
- \`npm run deploy\`: registra los comandos de la aplicación para \`GUILD_ID\`.
- \`npm start\`: inicia el bot.

Antes de usar el sistema con clientes reales, prueba en un servidor de pruebas: producto con stock 1, segundo intento de compra, cancelación de pedido y una reseña de pedido no completado.
