# DATASHOP Discord Bot

Base limpia para DATASHOP, desarrollada con Node.js 20+ y discord.js v14. El bot separa los comandos de la lógica principal y mantiene los secretos fuera del repositorio.

## Requisitos
- Node.js 20 o superior.
- Aplicación y bot creados en Discord Developer Portal.
- Variables de entorno `DISCORD_TOKEN`, `CLIENT_ID` y `GUILD_ID`.
- Activar Message Content Intent y Server Members Intent solo si las funciones instaladas los necesitan.

## Configuración
1. Copia `.env.example` a `.env` localmente o configura las variables directamente en tu hosting.
2. No subas `.env`, no pegues el token en chats y no guardes secretos en el código.
3. Instala dependencias con `npm install`.
4. Valida el código con `npm run check`.
5. Registra comandos con `npm run deploy`.
6. Inicia el bot con `npm start`.

## Comandos base
- `/ping`: latencia del bot.
- `/help`: ayuda inicial.
- `!ping` y `!help`: alternativas por prefijo.

## Seguridad y datos
La rama `backup/pre-datashop-rebuild-2026-10-27` conserva el estado anterior del código. Los secretos y variables del hosting son externos a GitHub y deben conservarse en la configuración del servicio. Los datos de negocio no deben borrarse hasta exportarlos y verificarlos.

## Próxima fase
Añadir por módulos: tienda y catálogo, carrito y pedidos, tickets, pagos configurables, reseñas, moderación, logs y paneles de administración. Cada sistema debe tener permisos, validación y pruebas antes de activarse.
