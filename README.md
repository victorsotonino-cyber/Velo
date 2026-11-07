# DATASHOP

Bot comercial de Discord con Node.js y discord.js v14. Los comandos usan el prefijo ! y la interfaz está en español.

## Requisitos
- Node.js 20 o superior.
- Variable privada DISCORD_TOKEN.
- Activar Server Members Intent y Message Content Intent en Discord Developer Portal.
- Permisos de Discord según cada módulo.

## Instalación
1. npm install
2. Configurar DISCORD_TOKEN en el entorno privado.
3. npm start
4. npm run check

## Comandos
General: !ayuda, !ping, !userinfo, !serverinfo.
Tickets: !ticket panel, !ticket categoria #canal, !ticket logs #canal, !ticket staff @rol, !ticket reclamar, !ticket cerrar.
Tienda: !tienda, !producto listar, !producto agregar nombre precio [stock], !producto quitar id, !venta @cliente id [cantidad].
Moderación: !ban, !kick, !timeout, !untimeout, !warn, !warns, !clear, !lock, !unlock, !slowmode.
Comunidad: !sorteo crear 1h 1 Premio, !sugerencia texto.
Administración: !plantilla, !config tienda nombre, !config prefijo !, !config moneda $, !config automod-links on/off, !rango crear nombre gasto, !rangos, !metodo agregar nombre | instrucciones.

## Persistencia
La base SQLite se guarda en DATA_DIR/datashop.sqlite. En el hosting usa un disco persistente y configura DATA_DIR en ese disco.

## Seguridad
No subas .env, tokens ni bases de datos a GitHub. Los métodos de pago son instrucciones informativas; verifica los cobros antes de registrar ventas.
