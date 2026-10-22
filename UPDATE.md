# ✦ FLUX STORE — UPDATE

**Fecha:** 22 de octubre de 2026  
**Repositorio:** `victorsotonino-cyber/Velo`  
**Rama:** `main`

## Novedades de esta actualización

### 🎭 Autorol al entrar
- Los nuevos miembros reciben automáticamente el rol <@&1562619913485557901>.
- El rol se configura mediante `MEMBER_ROLE_ID`; si esa variable no existe, se utiliza el ID anterior.
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
- Sistema de sorteos con botones.
- Herramientas de moderación, ayuda, encuestas y utilidades.

## Activación
1. Sincroniza la rama `main` en el hosting o vuelve a desplegar el repositorio.
2. Reinicia el proceso del bot.
3. Comprueba que el bot tenga **Gestionar roles** y que su rol esté por encima del rol automático.
4. En Discord Developer Portal, habilita **Server Members Intent**.
5. En Discord, prueba `!test-bienvenida` y `!update`; después prueba con una cuenta que se una realmente.

**Importante:** los cambios están guardados en GitHub. No se afirma que el hosting ya esté desplegado; eso depende de la sincronización y reinicio del servicio.
