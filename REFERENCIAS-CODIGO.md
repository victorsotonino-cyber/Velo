# Referencias revisadas para mejorar FLUX STORE

La implementación de FLUX STORE se mantiene en Node.js y discord.js v14. Los proyectos siguientes se revisaron como referencia; se adaptan ideas y flujos al diseño existente, en vez de mezclar dependencias incompatibles o copiar archivos completos.

- **HydracraftES/crafting-store-discord-bot** — https://github.com/HydracraftES/crafting-store-discord-bot  
  Incluye consultas de transacciones, compras por jugador y tarjetas de regalo conectadas a la API de CraftingStore. El bot usa Python y una librería slash antigua; su API y credenciales no se incorporan. La idea de enlazar cada operación con un identificador e historial se adapta al sistema de pedidos.

- **ZenkoDev/Bot-Tienda-Valorant** — https://github.com/ZenkoDev/Bot-Tienda-Valorant  
  La rama main revisada solo contiene un archivo de 1 byte llamado privado, sin comandos funcionales para adaptar.

- **la-logia-tetona/cuponero** — https://github.com/la-logia-tetona/cuponero  
  Proyecto JavaScript con discord.js v14 y PostgreSQL; package.json declara licencia ISC. Se revisaron su validación de fechas, búsqueda y límites para cupones. FLUX STORE mantiene el almacenamiento JSON actual, por lo que no requiere una base de datos nueva para estos cambios.

- **Nicolasvals/discord-bot-plantaciones** — https://github.com/Nicolasvals/discord-bot-plantaciones  
  Bot de juego con gran parte de la lógica concentrada en un index.js. Sus funciones principales son plantaciones y comandos de juego; no se encontró un subsistema de tienda apropiado para integrar directamente.

- **Otodeodo/Bot-de-Discord-para-Gesti-n-de-Tienda** — https://github.com/Otodeodo/Bot-de-Discord-para-Gesti-n-de-Tienda  
  Bot de Python/discord.py con tienda virtual, categorías, registro de compras, inventario y vistas interactivas. Se adaptan esos patrones de producto, stock e historial a JavaScript; no se copian sus módulos Python.

## Principios aplicados

- El precio del pedido se obtiene del catálogo de FLUX STORE, no de un valor libre introducido por el cliente.
- El stock limitado se reserva al crear el pedido y se devuelve al cancelarlo.
- Un cupón solo se consume al registrarse un pedido válido; al cancelar, se libera el uso.
- Los pedidos tienen transiciones de estado controladas y conservan el historial.
- Los métodos de pago se muestran como instrucciones configuradas por el administrador; el bot no afirma que un pago está verificado por sí solo.
