# FLUX STORE Bot

Bot de Discord en Node.js con discord.js v14 para atención de clientes, catálogo, pedidos, tickets, sorteos y utilidades de comunidad.

## Funciones añadidas para la tienda

- **Catálogo con inventario:** /tienda catalogo, /tienda agregar, /tienda editar y /tienda eliminar. Cada producto puede tener precio numérico, categoría, stock y disponibilidad.
- **Carrito:** /carrito agregar, /carrito ver, /carrito quitar, /carrito vaciar y /carrito comprar. Los importes se calculan con el catálogo, no con un precio escrito por el cliente.
- **Pedidos:** /pedido mis-compras, /pedido historial y /pedido estado. Los estados tienen transiciones validadas; el stock se descuenta al verificar el pago y se devuelve al cancelar cuando sea posible.
- **Cupones:** /cupones crear, /cupones listar, /cupones validar y /cupones eliminar. Incluye vencimiento, máximo de usos y registro de redenciones; los nuevos cupones quedan asociados al servidor.
- **Pagos:** /pagos muestra los métodos e instrucciones configurados. El bot registra el método elegido, pero no procesa ni verifica transacciones bancarias automáticamente.
- **Confianza y comunidad:** /resena acepta reseñas de pedidos completados, /sugerencia guarda ideas con reacciones, /encuesta crea votaciones con reacciones y /userinfo muestra información pública de un miembro.
- **Estadísticas:** /ventas estadisticas resume pedidos completos, pendientes, cancelados e ingresos calculables de los pedidos completados.
- **Ayuda:** /help incluye una categoría desplegable de tienda y pedidos.
- **Automod básico:** cuando AUTOMOD_ENABLED=true, detecta ráfagas de mensajes, elimina mensajes que exceden el límite, avisa y puede aplicar timeout en un segundo evento de spam. Los errores de permisos quedan registrados sin tumbar el bot.

## Configuración

1. Copia .env.example a .env y completa el token, IDs de aplicación/servidor, canales, roles y emojis personalizados.
2. Configura STORE_CURRENCY (por ejemplo USD o EUR), STORE_PAYMENT_METHODS separados por coma y, si corresponde, STORE_PAYMENT_INSTRUCTIONS.
3. Configura REVIEWS_CHANNEL_ID y SUGGESTIONS_CHANNEL_ID para publicar reseñas y sugerencias en sus canales. Configura LOGS_CHANNEL_ID para los registros.
4. Configura MEMBER_ROLE_ID, WELCOME_CHANNEL_ID, TERMS_CHANNEL_ID, PAYMENT_METHODS_CHANNEL_ID, TICKETS_INFO_CHANNEL_ID y TICKETS_CATEGORY_ID según tu servidor.
5. Para el automod, ajusta AUTOMOD_ENABLED, AUTOMOD_MAX_MESSAGES, AUTOMOD_WINDOW_SECONDS y AUTOMOD_TIMEOUT_MINUTES. Prueba los límites en un canal controlado antes de activarlo.

Todos los IDs y tokens configurables se leen desde variables de entorno. No subas el archivo .env real. El .gitignore excluye archivos de entorno privados, copias temporales y datos de ejecución.

## Ejecución

- Instala una versión compatible de Node.js (Node 20 o superior recomendado) y ejecuta npm install.
- Rellena .env.
- Ejecuta npm run deploy para registrar los comandos slash.
- Ejecuta npm start para iniciar el bot.
- En Discord Developer Portal, habilita los intents que corresponden al uso de miembros y contenido de mensajes. El bot necesita los permisos mínimos necesarios para tickets, logs, timeout y gestión de roles.

## Persistencia y pagos

El sistema actual guarda productos, cupones, carritos, pedidos, reseñas y sugerencias en archivos JSON bajo data/ (o VELO_DATA_DIR si se define). Usa un disco persistente en tu hosting y haz copias de seguridad: un sistema de archivos efímero puede perder datos al redeplegar.

Los pedidos iniciados desde el carrito son solicitudes pendientes. Un miembro autorizado debe verificar el pago con /pedido estado antes de que se descuente inventario y se registre el uso del cupón. El bot no procesa pagos ni confirma automáticamente el dinero recibido.

## Repositorios consultados

- [HydracraftES/crafting-store-discord-bot](https://github.com/HydracraftES/crafting-store-discord-bot): se revisaron patrones de consulta de transacciones y productos digitales; su código es Python y no se pegó en el proyecto Node.js.
- [ZenkoDev/Bot-Tienda-Valorant](https://github.com/ZenkoDev/Bot-Tienda-Valorant): la rama principal consultada no contenía módulos de tienda utilizables.
- [la-logia-tetona/cuponero](https://github.com/la-logia-tetona/cuponero): referencia para vencimiento, límites de uso, validación de códigos y separación del acceso a datos. El código del bot de FLUX STORE se adaptó a su formato JSON actual.
- [Nicolasvals/discord-bot-plantaciones](https://github.com/Nicolasvals/discord-bot-plantaciones): se revisó la estructura; el flujo de plantaciones no era relevante para compras y no se incorporó al sistema de tienda.
- [Otodeodo/Bot-de-Discord-para-Gesti-n-de-Tienda](https://github.com/Otodeodo/Bot-de-Discord-para-Gesti-n-de-Tienda): la documentación de tienda sirvió de referencia conceptual para catálogo, disponibilidad, historial y estadísticas. La implementación aquí es propia y para discord.js.

Consulta UPDATE.md para ver el registro de cambios del proyecto.