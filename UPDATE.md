# ✦ FLUX STORE — UPDATE

**Fecha:** 22 de octubre de 2026  
**Repositorio:** `victorsotonino-cyber/Velo`  
**Rama:** `main`

## Novedades de esta actualización

### 🎭 Autorol al entrar
- Los nuevos miembros reciben automáticamente el rol <@&1562619913485557901>.
- El ID del rol está fijado directamente en `config.js` para que una variable antigua del hosting no lo sustituya.
- Si Discord rechaza la asignación, el error queda registrado en la consola y la bienvenida sigue su proceso.

### 👋 Bienvenida
- Se conserva el diseño blanco de FLUX STORE.
- La bienvenida incluye avatar del miembro, contador de miembros y accesos directos a términos, métodos y tickets.
- El canal se lee desde `WELCOME_CHANNEL_ID` o la configuración predeterminada.

### 🧪 Vista previa
- `!test-bienvenida`
- `!bienvenida-test`

Estos comandos muestran un ejemplo en el canal donde se ejecutan; no fingen una entrada real ni asignan roles.

### 🆕 Centro de actualizaciones
- `/update` muestra este resumen dentro de Discord.
- `!update` muestra el mismo resumen con prefijo.

### 🛍️ Funciones existentes incluidas
- Catálogo de productos con `/tienda`.
- Panel de tickets con categorías de Compras, Dudas, Reportes, Partner y Alianzas.
- Emojis personalizados asignados por ID: `<:emoji_20:1550146329915949077>` para Compras, `<:emoji_138:1561921833203142757>` para Dudas, `<:emoji_139:1561921915658969099>` para Reportes, `<:flux_pandahiyapolice_2219:1561698594136920214>` para Partner y `<:flux_owner_4264:1561551235285385227>` para Alianzas.
- La selección de tickets usa un bloqueo de creación por usuario para evitar aperturas simultáneas por doble clic, y no permite repetir una categoría que ya tenga abierta.
- Los permisos del canal privado incluyen los roles configurados de Staff y Admin. Al cerrar, se guarda una transcripción paginada de hasta 2.000 mensajes, con texto, embeds y enlaces de adjuntos.
- Sistema de sorteos con botones.
- Herramientas de moderación, ayuda, encuestas y utilidades.

## Activación
1. Sincroniza la rama `main` en el hosting o vuelve a desplegar el repositorio.
2. Reinicia el proceso del bot.
3. Comprueba que el bot tenga **Gestionar roles** y que su rol esté por encima del rol automático.
4. En Discord Developer Portal, habilita **Server Members Intent**.
5. En Discord, prueba `!test-bienvenida` y `!update`; después prueba con una cuenta que se una realmente.

**Importante:** los cambios están guardados en GitHub. No se afirma que el hosting ya esté desplegado; eso depende de la sincronización y reinicio del servicio.
