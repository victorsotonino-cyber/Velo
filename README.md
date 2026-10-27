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
- Tickets: /ticket setup (panel público con selector, ayuda y Mis tickets), /ticket route, /ticket max-open, /ticket close, /ticket claim, /ticket unclaim, /ticket reopen, /ticket control lock/unlock/pin/autoclose/autoclose-off/canned-list/canned-add/canned-remove/canned-use, /ticket add, /ticket remove, /ticket rename, /ticket transfer, /ticket priority, /ticket move, /ticket note add/list, /ticket blacklist-add/remove, /ticket list, /ticket stats, /ticket transcript, /ticket delete, /ticket timer, /ticket stoptimer, /ticket client y /ticket remember.
- Panel visual público de tienda: /shop panel (selector de producto, catálogo destacado, Mi carrito, Mis pedidos y Actualizar; se restaura tras reinicios cuando se conserva el almacenamiento de datos).
- Catálogo: /shop list, /shop browse (menú interactivo efímero), /shop add, /shop edit, /shop image, /shop stock y /shop remove.
- Carrito: /shop cart-add, /shop cart-remove, /shop cart-view, /shop cart-clear y /shop checkout (varios productos por checkout).
- Pedidos: /shop order, /shop my-orders, /shop orders, /shop cancel, /shop order-status y /shop order-expiry.
- Informes: /shop stats y /shop low-stock.
- Métodos de pago informativos: /shop payment add y /shop payment remove.
- Reseñas: /shop review (solo pedidos completados del propio cliente), /shop reviews y /vouch (registro de personal).
- Comunidad: /suggestion, /poll, /afk, /remind, /reminders, /reminder-cancel, /rank y /leaderboard.
- Sorteos gratuitos: /giveaway start, /giveaway end y /giveaway reroll.
- Comunicación: /say y /announce.
- Panel interactivo de administración: /botconfig panel (canales de bienvenida/logs, rol de autorol y botones para alternar bienvenida, autorol y AutoMod).
- Configuración por comandos: /botconfig show, /botconfig welcome, /botconfig welcome-off, /botconfig logs, /botconfig autorole, /botconfig autorole-off, /botconfig automod, /botconfig blockword-add y /botconfig blockword-remove.

Ejemplos con prefijo: !ping, !ticket claim, !shop list y !shop my-orders.

## Paneles visuales

- Publica un panel público de tienda en el canal actual con /shop panel. Incluye productos destacados, selector para comprar, vista privada del carrito, vista privada de pedidos y botón para actualizar el catálogo.
- Abre /botconfig panel para configurar canales y rol con selectores de Discord y alternar AutoMod, bienvenida y autorol. El panel de administración es efímero y solo aplica cambios a administradores.
- El panel /ticket setup imita el formato del Centro de Soporte de la referencia: selector para Comprar un artículo, Hacer una consulta, Reportar un problema, Recibir una recompensa y Postular a Workers; usa los cinco emojis personalizados dados y asigna el rol global de staff <@&1562619905780486230> por defecto. Incluye formulario modal, ayuda rápida y resumen de tickets abiertos.
- Los paneles persistentes de tienda se recuperan en el arranque mediante los IDs guardados en shop_panels.json; el directorio DATASHOP_DATA_DIR debe mantenerse en almacenamiento persistente del hosting para sobrevivir a reemplazos de contenedor.

## Sistema de tickets

El panel persistente permite seleccionar entre Comprar un artículo, Hacer una consulta, Reportar un problema, Recibir una recompensa y Postular a Workers y completar un formulario de asunto y descripción. Los valores antiguos de ticket se conservan por compatibilidad. Cada usuario tiene un límite configurable de tickets abiertos, hay lista de bloqueo, rutas de categoría/rol por tipo, prioridades, reclamaciones, transferencia, notas internas privadas, respuestas predefinidas por servidor, recordatorios programados, autocierre por inactividad configurable por ticket (desactivado por defecto), botones para bloquear/desbloquear respuestas y valoración por DM persistente tras reinicios. Las transcripciones se generan en HTML con escape de contenido no confiable y límite de tamaño. La eliminación requiere guardar primero una transcripción en el canal de logs; si falla el archivado, el ticket no se borra.

Puedes configurar categoría y rol de soporte desde el comando /ticket setup. Si no se indica categoría, el bot crea una categoría de tickets cuando haga falta. Los permisos efectivos también dependen de los permisos y la jerarquía de roles del bot en Discord.

## Tienda y pedidos

El catálogo admite nombre, precio, descripción, imagen e inventario. /shop browse abre un menú interactivo con selector de producto y formulario de cantidad; el pedido se crea mediante la misma función validada que /shop order. El carrito permite acumular varios productos y crea un pedido por línea en un checkout común, comprobando todo el stock bajo el mismo bloqueo de inventario. Los pedidos guardan una copia del producto, el total y su estado; el inventario se reserva al crear un pedido y se devuelve si el pedido se cancela. Solo el personal autorizado puede cambiar estados o consultar todos los pedidos.

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
