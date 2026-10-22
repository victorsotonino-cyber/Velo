# FLUX STORE Bot

Bot de Discord en Node.js y discord.js v14, con comandos slash, prefijo, tickets, sorteos, postulaciones, moderación y tienda.

## Requisitos e inicio

- Node.js 20 o superior.
- Una aplicación de Discord y el bot invitado al servidor.
- El archivo .env configurado en el hosting.

```bash
npm install
npm run deploy
npm start
```

`npm run deploy` registra los comandos de la rama y servidor configurados en `CLIENT_ID` y `GUILD_ID`.

## Variables de entorno

Copia `.env.example` a `.env` o define en el panel del hosting las mismas variables. Los IDs de canales, roles y emojis deben contener IDs de tu servidor. El `.env` real nunca debe subirse a GitHub.

Imprescindibles:
- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `WELCOME_CHANNEL_ID`, `LOGS_CHANNEL_ID`, `TICKETS_CATEGORY_ID`
- `ADMIN_ROLE_ID`, `STAFF_ROLE_ID`, `MEMBER_ROLE_ID`
- `TERMS_CHANNEL_ID`, `PAYMENT_METHODS_CHANNEL_ID`, `TICKETS_INFO_CHANNEL_ID`
- Los cinco IDs `TICKET_EMOJI_*_ID` del panel de tickets.

Opcionales:
- `SUGGESTIONS_CHANNEL_ID`, `REVIEWS_CHANNEL_ID`, `ORDER_LOG_CHANNEL_ID`
- `STORE_CURRENCY`, `PAYMENT_METHODS_TEXT`, `VELO_DATA_DIR`
- `AUTOMOD_ENABLED`, `AUTOMOD_MAX_MESSAGES`, `AUTOMOD_TIMEOUT_MINUTES`, `AUTOMOD_BLOCK_INVITES`
- `BOT_PREFIX`, `MAX_TICKETS_PER_USER`

Los datos JSON se guardan en `data/` por defecto. Si el hosting borra los archivos al reiniciar, configura almacenamiento persistente y apunta `VELO_DATA_DIR` a esa ruta.

## Comandos añadidos o ampliados

- `/tienda catalogo`: catálogo y disponibilidad de stock.
- `/tienda agregar`: añade un producto con precio numérico, descripción y stock (`-1` = ilimitado; `0` = agotado).
- `/tienda editar`, `/tienda eliminar`, `/tienda stock`: administración de catálogo e inventario con autocompletado.
- `/carrito agregar`, `/carrito ver`, `/carrito quitar`, `/carrito vaciar`, `/carrito checkout`: carrito persistente con cantidades y checkout de uno o varios pedidos.
- `/pedido crear`: pedido desde catálogo, cantidad, método de pago y cupón opcional.
- El carrito reserva stock al finalizar checkout, conserva los productos cuyo pedido no se pudo crear y no duplica cupones entre líneas. Para aplicar un cupón, usa `/pedido crear` para ese producto.
- `/pedido mis-compras`, `/pedido ver`, `/pedido historial`, `/pedido estado`: historiales y gestión de estados.
- `/cupones crear`, `/cupones listar`, `/cupones validar`, `/cupones eliminar`: cupones con vencimiento y límite de usos.
- `/pagos`: instrucciones de pago configuradas por el equipo.
- `/resena publicar`, `/resena listar`: reseñas vinculadas a pedidos completados.
- `/estadisticas`: estadísticas de pedidos y ventas (solo personal autorizado).
- `/sugerencia enviar`: sugerencias con votación.
- `/encuesta`: encuestas interactivas (requiere permiso Manage Messages).
- `/userinfo`: información de usuario.
- Automod básico: detecta spam repetitivo y opcionalmente invitaciones de Discord. Se desactiva con `AUTOMOD_ENABLED=false`.

## Estados y validaciones de pedidos

El pedido parte de `pendiente`, pasa a `pago_verificado`, luego a `procesando` y finalmente a `completado`. Puede cancelarse antes de completarse. El precio proviene del catálogo y no de un importe libre introducido por el cliente. El stock limitado se reserva al registrar la solicitud y se devuelve al cancelar. Los usos de cupón siguen el mismo flujo. El bot no verifica un pago de forma automática.

Los precios deben incluir una cantidad numérica: `5 USD`, `7,50€` o `$10`. Los importes se guardan en unidades menores enteras para evitar errores habituales de redondeo.

## Intents y permisos de Discord

Activa `Server Members Intent` y `Message Content Intent` en Discord Developer Portal si usas bienvenida, autorol y comandos de prefijo. Revisa que el bot tenga los permisos y la jerarquía de roles necesarias para gestionar canales, roles, mensajes y sanciones.

## Pruebas

```bash
npm test
```

Los tests cubren parsing de precios, reserva/devolución de stock, cupones y transiciones de estado. GitHub Actions ejecuta la suite en Node.js 20.

## Referencias consultadas

Consulta [REFERENCIAS-CODIGO.md](REFERENCIAS-CODIGO.md) para los repositorios revisados y las ideas adaptadas sin mezclar librerías incompatibles.
