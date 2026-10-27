# DATASHOP Discord Bot — Python

DATASHOP está construido desde cero en Python con discord.py 2.7.1. La arquitectura separa comandos y funciones en extensiones (cogs), mantiene los secretos fuera del código y guarda la configuración básica en archivos JSON por servidor.

## Requisitos

- Python 3.12 recomendado.
- Una aplicación y un bot creados en Discord Developer Portal.
- El token del bot guardado como variable de entorno DISCORD_TOKEN.
- El ID del servidor guardado como GUILD_ID para registrar y actualizar comandos slash de inmediato.
- Activar Server Members Intent y Message Content Intent en el Developer Portal. El bot usa eventos de miembros y comandos por prefijo.

## Ejecutar localmente

1. Crea un entorno virtual: python -m venv .venv.
2. Actívalo e instala dependencias: python -m pip install -r requirements.txt.
3. Copia .env.example a .env y rellena DISCORD_TOKEN y GUILD_ID.
4. Inicia el bot: python main.py.
5. Ejecuta pruebas: python -m unittest discover -s tests -v.

No subas .env a GitHub, no insertes tokens en archivos y no compartas el token por chat. Si el token actual es inválido, genera o copia uno nuevo desde Discord Developer Portal y actualízalo de forma privada en el hosting.

## Comandos implementados

Los comandos híbridos se pueden usar como comandos slash y con el prefijo configurado (por defecto !):

- General: /help, /ping, /serverinfo, /userinfo.
- Moderación: /ban, /kick, /timeout, /untimeout, /warn, /warnings, /clear.
- Tickets: /ticket setup, /ticket close, /ticket add, con panel persistente y canales privados.
- Tienda: /shop list, /shop add, /shop remove, /vouch.
- Comunidad: /suggestion, /poll.
- Configuración: /botconfig show, /botconfig welcome, /botconfig welcome-off, /botconfig logs, /botconfig autorole, /botconfig autorole-off, /botconfig automod.

Los comandos de prefijo correspondientes funcionan con ! por defecto; por ejemplo !ping, !ban @miembro motivo y !shop list.

## Registro de comandos antiguos

En el arranque, el bot copia el árbol de comandos actual al servidor configurado y lo sincroniza. Discord sustituye el registro de comandos slash de ese servidor por los comandos que expone esta versión, eliminando los comandos antiguos que quedaron registrados. Esta operación requiere un token válido y acceso a esa aplicación y servidor.

## Despliegue en Render

Configura el servicio con:

- Runtime: Python 3
- Build Command: pip install -r requirements.txt
- Start Command: python main.py
- Variables de entorno: DISCORD_TOKEN, GUILD_ID, BOT_PREFIX, PORT, DATASHOP_DATA_DIR

El servidor HTTP integrado expone /health para comprobar el estado. Usa almacenamiento persistente de Render para DATASHOP_DATA_DIR si necesitas conservar el catálogo, las advertencias y los ajustes después de reinicios o despliegues.

## Notas

- El catálogo registra productos, precio, stock y descripción; no procesa pagos reales.
- Los tickets son privados por canal y permiten un ticket abierto por usuario y servidor.
- Las funciones de moderación dependen de los permisos de Discord y de la jerarquía de roles.
- El AutoMod inicial bloquea invitaciones de Discord solo cuando se activa desde /botconfig automod.
