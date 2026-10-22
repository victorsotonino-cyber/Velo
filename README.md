# FLUX STORE Bot

Bot de Discord para la tienda FLUX STORE, con comandos slash y comandos con prefijo.

## Variables de entorno
- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- Opcionales: `WELCOME_CHANNEL_ID`, `LOGS_CHANNEL_ID`, `TICKETS_CATEGORY_ID`, `ANNOUNCEMENTS_CHANNEL_ID`

## Inicio
`npm install`  
`npm start`

## Bienvenida y autorol
Cuando entra un miembro, el bot intenta asignarle automáticamente el rol de FLUX STORE configurado en `config.js`:
`1562619913485557901`

El bot necesita el permiso **Gestionar roles**, y el rol del bot debe estar por encima del rol que va a entregar. Habilita **Server Members Intent** en Discord Developer Portal. La bienvenida se envía al canal configurado como `WELCOME_CHANNEL_ID` (por defecto, el canal de bienvenida de FLUX STORE).

### Comandos relacionados
- `!test-bienvenida` / `!bienvenida-test`: muestra una vista previa de la bienvenida.
- `/update` o `!update`: muestra el registro de novedades.
- `/help` y `!help`: ayuda de comandos.
- `/tienda`: catálogo y gestión de productos.
- `/ticket-panel` o `!ticket-panel`: publica el panel de atención.
- `/giveaway` y `!giveaway`: gestiona sorteos.

## Tickets
`/ticket-panel` crea el panel; `/ticket-edit` administra categorías y tickets.

El panel usa cinco emojis personalizados configurados por ID en `config.js`. El sistema evita la apertura simultánea por doble clic y la repetición de una categoría ya abierta, incluye acceso de los roles Staff/Admin y genera transcripciones paginadas de hasta 2.000 mensajes al cerrar.

## Sorteos
El sistema de giveaways permite crear sorteos con botones, cerrar o cancelar sorteos y volver a seleccionar ganadores. Las duraciones aceptadas incluyen `30m`, `2h`, `1d` y `1w`, hasta 90 días.

## Seguridad
No subas nunca tu archivo `.env` ni el token de Discord. Usa variables de entorno privadas en tu hosting y no publiques secretos en GitHub.

Consulta [UPDATE.md](UPDATE.md) para ver los cambios recientes.
