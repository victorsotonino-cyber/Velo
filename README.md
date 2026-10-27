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
- Moderación: /ban, /kick, /timeout, /untimeout, /warn, /warnings y /clear.
- Tickets: /ticket setup, /ticket close, /ticket claim, /ticket unclaim, /ticket reopen, /ticket add, /ticket remove y /ticket transcript.
- Catálogo: /shop list, /shop add, /shop edit, /shop stock y /shop remove.
- Pedidos: /shop order, /shop my-orders, /shop orders y /shop order-status.
- Métodos de pago informativos: /shop payment add y /shop payment remove.
- Reseñas: /vouch.
- Comunidad: /suggestion y /poll.
- Configuración: /botconfig show, /botconfig welcome, /botconfig welcome-off, /botconfig logs, /botconfig autorole, /botconfig autorole-off y /botconfig automod.

Ejemplos con prefijo: !ping, !ticket claim, !shop list y !shop my-orders.

## Sistema de tickets

El panel publica un botón persistente para abrir canales privados. Cada usuario puede tener un ticket abierto a la vez. El equipo configurado puede reclamar y liberar tickets, añadir o quitar participantes, cerrar o reabrir tickets y generar una transcripción de texto.

Puedes configurar categoría y rol de soporte desde el comando /ticket setup. Si no se indica categoría, el bot crea una categoría de tickets cuando haga falta. Los permisos efectivos también dependen de los permisos y la jerarquía de roles del bot en Discord.

## Tienda y pedidos

El catálogo admite nombre, precio, descripción e inventario. Los pedidos guardan una copia del producto, el total y su estado; el inventario se reserva al crear un pedido y se devuelve si el pedido se cancela. Solo el personal autorizado puede cambiar estados o consultar todos los pedidos.

Los métodos añadidos mediante /shop payment son texto informativo. **No existe integración con una pasarela de pagos**: el equipo debe verificar los cobros fuera del bot y marcar el pedido como pagado únicamente después de comprobarlos. No solicites contraseñas, tokens, números completos de tarjetas ni otros secretos por Discord.

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
- AutoMod solo bloquea invitaciones de Discord cuando se activa desde /botconfig automod; todavía no sustituye un sistema completo anti-spam o anti-raid.
- Los comandos de moderación dependen de los permisos de Discord y de la jerarquía de roles.
