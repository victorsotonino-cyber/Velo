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
- `/tienda cupon-crear`: crea un descuento porcentual limitado al servidor actual y, opcionalmente, al número de usos.
- `/tienda cupones`: lista los cupones y sus usos (solo personal autorizado).
- `/tienda cupon-eliminar`: elimina un cupón.
- `/carrito confirmar` acepta la opción opcional `cupon`; el bot recalcula el total desde el catálogo y comprueba el límite de usos antes de aplicar el descuento.
- \`/carrito agregar\`, \`/carrito ver\`, \`/carrito quitar\`, \`/carrito vaciar\`.

### Panel profesional y moderación de tickets
- `f!ticket setup`: abre la consola de administración de tickets (solo administradores o el rol administrador configurado).
- La consola muestra el estado de puesta en marcha y permite elegir canal público, roles de soporte y categoría de Discord antes de publicar el panel.
- El panel público utiliza un diseño de atención profesional con pasos de apertura, indicación de privacidad y el selector de categorías.
- En **Ajustes avanzados → Apariencia del panel y tickets** puedes editar título, descripción, color hexadecimal, pie, texto del selector, miniatura y banner HTTPS.
- El diseño público se puede publicar como **menú desplegable** (hasta 25 categorías) o **botones por categoría** (hasta 5 categorías).
- Cada categoría tiene nombre visible, descripción del selector, título del embed, emoji personalizado/Unicode y color propio; otro formulario permite personalizar el mensaje inicial que aparece dentro del ticket usando `{user}`, `{name}`, `{emoji}` y `{type}`.
- El botón **Gestionar categorías** permite crear categorías nuevas (ID interno, nombre, descripción, emoji y color), editar su apariencia y mensaje inicial, activar/desactivar categorías predeterminadas y eliminar categorías personalizadas con confirmación. Los tickets ya abiertos no se borran al eliminar la opción del panel.
- **Vista previa** muestra el embed real de forma efímera sin controles activos, para no abrir tickets por accidente. El panel no se publica si todas las categorías están desactivadas.
- También puedes elegir el formato de los nombres de canales nuevos. Al volver a publicar en el mismo canal, el bot intenta editar el panel guardado en vez de crear uno duplicado; si el mensaje fue borrado o cambiaste de canal, publica uno nuevo.
- Las imágenes admiten únicamente URL HTTPS. Los cambios del panel público se aplican al pulsar **Publicar panel**; la apariencia y el mensaje de cada ticket se aplican a los tickets nuevos.
- En **Ajustes avanzados → Moderación de tickets** puedes configurar el límite de tickets por miembro, el autocierre y las horas de recordatorio al equipo.
- Los recordatorios se envían cuando el último mensaje humano del ticket es del cliente y no hay respuesta posterior del equipo. El autocierre sigue desactivado por defecto.
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

## Diagnóstico del panel de tickets

Si el panel no se publica, primero selecciona un canal de texto, una categoría de Discord y al menos un rol de soporte que siga existiendo. El configurador comprueba además los permisos del bot antes de publicar: en el canal público necesita ver el canal, enviar mensajes, insertar enlaces y leer el historial para actualizar el panel existente; en la categoría privada necesita ver el canal y gestionar canales para poder crear tickets.

Los errores se diferencian para que no todos aparezcan como “revisa los permisos”: el código de Discord \`50013\` indica permisos insuficientes, \`50001\` indica que falta acceso al recurso y \`50035\` suele indicar que Discord rechazó el formato enviado. En el segundo caso, revisa los logs del hosting y la longitud de los campos o los emojis configurados. Los títulos de los formularios se limitan automáticamente al máximo admitido por Discord.

## Ayuda y comprobaciones

- \`npm run check\`: comprueba sintaxis de los archivos JavaScript principales.
- \`npm test\`: ejecuta pruebas unitarias del servicio comercial.
- \`npm run deploy\`: registra los comandos de la aplicación para \`GUILD_ID\`.
- \`npm start\`: inicia el bot.

Antes de usar el sistema con clientes reales, prueba en un servidor de pruebas: producto con stock 1, segundo intento de compra, cancelación de pedido y una reseña de pedido no completado.


### Automatización de tickets (FLUX STORE)
- El módulo `ticket-tool-x-automation.js` añade aviso de inactividad con botón para cancelar, cierre por inactividad configurable y transcript HTML con entrega a logs/DM según `ticket-config.json`.
- Para activar el autocierre, configura en `ticket-config.json` el objeto de tu servidor (`guildId`) con `autoCloseEnabled: true`, `autoCloseHours: 24`, `transcriptMode: "channel"` (o `"dm"` / `"both"`) y `logChannelId` o `transcriptChannelId`. Los datos del ticket deben conservar el formato de tema `VeloTicket:<userId>:<tipo>:<staffId opcional>`.
- Este módulo es una implementación propia basada en patrones habituales de bots de tickets. El repositorio [MinusTech/Ticket-Tool-X-](https://github.com/MinusTech/Ticket-Tool-X-) se usa como referencia de funcionalidades (transcripts, aviso/cancelación y autocierre); no se copia su archivo fuente íntegro.


### Cupones de descuento
- Ejemplo: `/tienda cupon-crear codigo:FLUX10 porcentaje:10 usos-maximos:50` crea un descuento del 10 % con hasta 50 usos.
- Ejemplo: `/carrito confirmar metodo:PayPal cupon:FLUX10` aplica el descuento válido al pedido.
- Los códigos se guardan en `flux-store-coupons.json`, separados por servidor, con uso contabilizado al crear el pedido. No se procesa ni verifica el pago automáticamente; el equipo debe comprobarlo.