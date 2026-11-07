# DATASHOP

Proyecto nuevo del bot de tienda para Discord, basado en el ZIP que compartiste.

## Tecnología
- Node.js 22 LTS
- discord.js v14
- Prefijo predeterminado: `!`
- SQLite con `better-sqlite3`
- Configuración independiente por servidor

## Preparación
1. Entra en `datashop/` e instala dependencias con `npm install`.
2. Copia `.env.example` a `.env` y configura `DISCORD_TOKEN`.
3. En Discord Developer Portal habilita los intents **Server Members Intent** y **Message Content Intent**.
4. Ejecuta `npm start`.

No compartas el token del bot ni lo subas al repositorio. La base de datos se guarda en `data/datashop.sqlite` y no debe versionarse.
