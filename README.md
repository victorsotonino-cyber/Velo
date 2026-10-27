# DATASHOP Discord Bot — Python

DATASHOP es un bot multipropósito para Discord construido con Python y discord.py. Está organizado por módulos, admite comandos slash y de prefijo, y guarda configuración y registros separados por servidor. Las funciones toman como referencia patrones habituales de aplicaciones de soporte, moderación y comunidad del directorio de Discord; no copia el código privado de otras aplicaciones.

## Requisitos

- Python 3.12 recomendado.
- Una aplicación y un bot creados en Discord Developer Portal.
- El token del bot guardado como variable de entorno DISCORD_TOKEN.
- El ID del servidor guardado como GUILD_ID para registrar los comandos de esa comunidad.
- Activar Server Members Intent y Message Content Intent en el Developer Portal.

## Ejecutar localmente

1. Crea un entorno virtual: python -m venv .venv.
2. Actívalo e instala dependencias: python -m pip install -r requirements.txt.
3. Copia .env.example a .env y rellena DISCORD_TOKEN y GUILD_ID.
4. Inicia el bot: python main.py.
5. Ejecuta pruebas: python -m unittest discover -s tests -v.

No subas .env a GitHub, no insertes tokens en archivos y no compartas el token por chat. Si un token es inválido, vuelve a generarlo en Discord Developer Portal y actualízalo de forma privada en el hosting.

## Comandos

Los comandos híbridos funcionan como comandos slash y con el prefijo configurado, que por defecto es !.

- General: /help, /ping, /serverinfo, /userinfo.
- Moderación: /ban, /unban, /kick, /timeout, /untimeout, /warn, /warnings, /clear, /purge-user, /slowmode, /lock, /unlock y /nick. Las acciones principales también se registran en el canal configurado con /botconfig logs.
- Roles: /role add y /role remove; se bloquean roles con permisos sensibles y se comprueba la jerarquía.
- Tickets: /ticket setup, /ticket route, /ticket max-open, /ticket close, /ticket claim, /ticket unclaim, /ticket reopen, /ticket add, /ticket remove, /ticket rename, /ticket transfer, /ticket priority, /ticket move, /ticket note add/list, /ticket blacklist-add/remove, /ticket list, /ticket stats, /ticket transcript y /ticket delete.
- Catálogo: /shop list, /shop browse (menú interactivo), /shop add, /shop edit, /shop image, /shop stock y /shop remove.
- Pedidos: /shop order, /shop my-orders, /shop orders, /shop cancel, /shop order-status y /shop order-expiry.
- Informes: /shop stats y /shop low-stock.
- Métodos de pago informativos: /shop payment add y /shop payment remove.
- Reseñas: /vouch.
- Comunidad: /suggestion, /poll, /afk, /remind, /reminders, /reminder-cancel, /rank y /leaderboard.
- Sorteos gratuitos: /giveaway start, /giveaway end y /giveaway reroll.
- Comunicación: /say y /announce.
- Configuración: /botconfig show, /botconfig welcome, /botconfig welcome-off, /botconfig logs, /botconfig autorole, /botconfig autorole-off, /botconfig automod, /botconfig blockword-add y /botconfig blockword-remove.

Ejemplos con prefijo: !ping, !ticket claim, !shop list y !shop my-orders.

## Sistema de tickets

El panel persistente permite seleccionar Soporte, Compras, Reclamación u Otros y completar un formulario de asunto y descripción. Cada usuario tiene un límite configurable de tickets abiertos, hay lista de bloqueo, rutas de categoría/rol por tipo, prioridades, reclamaciones, transferencia, notas internas privadas, valoraciones por DM y transcripciones. La eliminación requiere guardar primero una transcripción en el canal de logs.

Puedes configurar categoría y rol de soporte desde el comando /ticket setup. Si no se indica categoría, el bot crea una categoría de tickets cuando haga falta. Los permisos efectivos también dependen de los permisos y la jerarquía de roles del bot en Discord.

## Tienda y pedidos

El catálogo admite nombre, precio, descripción e inventario. /shop browse abre un menú interactivo con selector de producto y formulario de cantidad; el pedido se crea mediante la misma función validada que /shop order. Los pedidos guardan una copia del producto, el total y su estado; el inventario se reserva al crear un pedido y se devuelve si el pedido se cancela. Solo el personal autorizado puede cambiar estados o consultar todos los pedidos.

Los métodos añadidos mediante /shop payment son texto informativo. **No existe integración con una pasarela de pagos**: el equipo debe verificar los cobros fuera del bot y marcar el pedido como pagado únicamente después de comprobarlos. Los pedidos usan un bloqueo asíncrono para serializar las reservas de inventario dentro del proceso, y los estados siguen el flujo pending → paid → completed o pending → cancelled; los pedidos pagados no se cancelan como si fueran reembolsos. Por defecto, los pedidos pendientes caducan tras 24 horas y devuelven el stock; el personal puede cambiar el plazo con /shop order-expiry (0 lo desactiva, 5–10080 minutos lo configura). Las imágenes del catálogo se administran con /shop image ID URL y se retiran usando /shop image ID off. No solicites contraseñas, tokens, números completos de tarjetas ni otros secretos por Discord.

## Registro y AutoMod

Configura un canal con /botconfig logs para registrar entradas y salidas de miembros, cambios de apodo y roles, mensajes editados o eliminados y acciones de AutoMod. El registro no permite recuperar mensajes eliminados completos a menos que el evento entregue el contenido al bot.

Activa el filtro con /botconfig automod true. El filtro puede eliminar invitaciones de Discord, mensajes que coincidan con frases configuradas y flood repetitivo. Añade y quita frases con /botconfig blockword-add y /botconfig blockword-remove. La detección de flood usa una regla básica y puede necesitar ajustes según el ritmo de tu comunidad.

El módulo de participación añade estado AFK por servidor, recordatorios persistentes, experiencia con cooldown, ranking de niveles y sorteos gratuitos que recuperan su fecha final al reiniciar el proceso. Los sorteos no requieren compra para participar.

## Configuración y alojamiento

Variables básicas: DISCORD_TOKEN, GUILD_ID, BOT_PREFIX, PORT, DATASHOP_DATA_DIR y STORE_CURRENCY. Los valores opcionales de canales y roles se documentan en .env.example.

Para Render:
- Runtime: Python 3
- Build Command: pip install -r requirements.txt
- Start Command: python main.py

El servidor HTTP integrado expone /health. Para conservar productos, pedidos, advertencias y ajustes entre reinicios, configura almacenamiento persistente para DATASHOP_DATA_DIR en el hosting.

## Alcance conocido

- La información se guarda en archivos JSON por servidor.
- No se procesan pagos reales ni se verifican automáticamente transferencias.
- El AutoMod del bot no sustituye las funciones nativas de seguridad de Discord ni un sistema completo anti-raid. Las valoraciones del ticket se guardan como datos por servidor; los botones de valoración son temporales y pueden dejar de responder si el proceso se reinicia.
- Los comandos de moderación dependen de los permisos de Discord y de la jerarquía de roles.
