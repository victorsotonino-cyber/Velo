# ✦ FLUX STORE — UPDATE

Fecha: 22 de octubre de 2026
Repositorio: `victorsotonino-cyber/Velo`
Rama de desarrollo: `feat/flux-commerce-tools`

## Cambios preparados

### Tienda y pedidos
- Catálogo con precios numéricos, descripciones y stock finito o ilimitado.
- Carrito persistente por servidor y usuario; checkout crea pedidos y conserva las líneas que no pudieron procesarse.
- Los pedidos usan precios del catálogo y conservan un historial de estados: pendiente, pago verificado, en preparación, completado o cancelado.
- El stock limitado se reserva al crear el pedido y vuelve al inventario si el pedido se cancela.
- Los cupones tienen fecha de vencimiento, límites de uso y asociación a un servidor.
- El pago no se marca como verificado automáticamente.

### Confianza y administración
- Reseñas ligadas a pedidos propios completados.
- Estadísticas de pedidos e ingresos calculados a partir de pedidos completados.
- Historial de compras visible para cada cliente y consulta de historiales para el personal autorizado.
- Métodos de pago mostrados desde `PAYMENT_METHODS_TEXT`.

### Comunidad y seguridad
- Encuestas interactivas con botones y recuento de votos.
- Sugerencias con votos a favor/en contra.
- Comando `/userinfo`.
- Automod básico configurable para spam repetitivo e invitaciones.
- Los comandos nuevos se organizan en subcarpetas y el cargador y el despliegue slash las detectan automáticamente.
- Los eventos de inicio, interacciones, mensajes, entradas y salidas se cargan desde `events/`; utilidades compartidas viven en `utils/`.
- Se añade una suite de pruebas y validación mediante GitHub Actions.

### Referencias de código revisadas
Los patrones adaptados y los repositorios consultados están documentados en [REFERENCIAS-CODIGO.md](REFERENCIAS-CODIGO.md). No se copiaron módulos Python a Node.js ni se mezclaron bibliotecas slash obsoletas.

## Requisito antes de activar en el hosting
Todos los IDs de canales, roles y emojis se trasladaron a variables de entorno y dejaron de tener valores por defecto dentro del código. Completa los campos de `.env.example` en el panel de hosting antes de desplegar esta rama; de lo contrario, las funciones dependientes de esos canales/roles no podrán resolverlos.

## Arranque y pruebas
1. Configura las variables de entorno del bot.
2. Ejecuta `npm install`.
3. Ejecuta `npm test` para comprobar los flujos automatizados.
4. Ejecuta `npm run deploy` y después `npm start`.
5. Prueba un pedido con producto de bajo stock, la cancelación, un cupón y una encuesta en un canal de prueba.

El código está en una rama de desarrollo; estos cambios no significan que el hosting esté desplegado o reiniciado.