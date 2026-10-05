# Velo Studio Bot 🤖

Bot completo de Discord basado en discord.js v14.

## Requisitos

- Node.js 20+
- Aplicación/bot creado en Discord Developer Portal
- Token del bot

## Instalación

```bash
npm install
```

Copia `.env.example` como `.env` y completa:

```env
DISCORD_TOKEN=tu_token
CLIENT_ID=id_del_bot
GUILD_ID=id_del_servidor
```

## Registrar comandos

```bash
npm run deploy
```

## Iniciar

```bash
npm start
```

## Importante

Nunca publiques el token del bot ni lo subas a GitHub.

## Permisos

El bot necesita los permisos correspondientes para moderación, tickets, mensajes y gestión de miembros.

Este proyecto es una base funcional y modular. Los módulos restantes (economía, niveles, sorteos, automod avanzado, captcha, logs detallados, etc.) pueden añadirse sobre esta estructura.


## Administración avanzada de tickets

Comando principal:

`/ticket-edit`

Subcomandos:

- `/ticket-edit crear-categoria`
- `/ticket-edit eliminar-categoria`
- `/ticket-edit renombrar-categoria`
- `/ticket-edit mover`
- `/ticket-edit quitar-categoria`
- `/ticket-edit renombrar`
- `/ticket-edit añadir`
- `/ticket-edit quitar`
- `/ticket-edit bloquear`
- `/ticket-edit desbloquear`
- `/ticket-edit slowmode`
- `/ticket-edit privado`
- `/ticket-edit ver`

Panel:

`/ticket-panel`

Configuración:

`/ticket-config`

Esto permite administrar el sistema de tickets directamente desde Discord sin editar el código para cada cambio.
