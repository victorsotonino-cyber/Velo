# Flux Store Bot

Bot de Discord en español, preparado para Railway.

## Variables
- DISCORD_TOKEN
- CLIENT_ID
- GUILD_ID

## Inicio
`npm start`

## Tickets
`/ticket-panel` crea el panel y `/ticket-edit` administra categorías y tickets.

No subas nunca tu archivo `.env` ni el token de Discord.

## 🎉 Sistema de giveaways

El comando `/giveaway` permite crear y administrar sorteos gratuitos con botón de participación.

### Comandos slash
- `/giveaway crear`: premio, duración, número de ganadores y canal opcional. También acepta descripción y rol requerido.
- `/giveaway terminar id:<ID>`: termina el sorteo y selecciona los ganadores.
- `/giveaway cancelar id:<ID>`: cancela el sorteo y desactiva el botón.
- `/giveaway reroll id:<ID>`: elige nuevos ganadores sin repetir a quienes ya ganaron.
- `/giveaway lista`: muestra los sorteos activos del servidor.

### Comandos con prefijo
- `!giveaway start [#canal] 2h 1 Nitro | Descripción opcional`
- `!giveaway end ID`
- `!giveaway cancel ID`
- `!giveaway reroll ID [cantidad]`
- `!giveaway list`

Las duraciones aceptadas son `30m`, `2h`, `1d` y `1w`; el máximo es de 90 días. Usa el ID del mensaje que aparece al crear el sorteo para terminarlo, cancelarlo o volver a sortear.

Para administrar sorteos, el moderador necesita el permiso **Gestionar servidor**. El bot necesita ver el canal, enviar mensajes, insertar enlaces e historial de mensajes. Los sorteos activos y sus participantes se guardan con el almacenamiento JSON del bot y sus temporizadores se restauran al iniciar.
