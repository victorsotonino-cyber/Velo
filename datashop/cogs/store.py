from __future__ import annotations

import asyncio
import copy
import logging
import math
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

import discord
from discord.ext import commands, tasks

from datashop.respond import send_context
from datashop.storage import get_guild_data, set_guild_data


log = logging.getLogger("datashop.store")

VALID_ORDER_STATUSES = {"pending", "paid", "completed", "cancelled", "expired"}


def _is_staff(ctx: commands.Context) -> bool:
    return isinstance(ctx.author, discord.Member) and (
        ctx.author.guild_permissions.manage_guild
        or ctx.author.guild_permissions.administrator
    )


def _products(ctx: commands.Context) -> dict[str, Any]:
    data = get_guild_data("products.json", ctx.guild.id, {})
    return data if isinstance(data, dict) else {}


def _products_for_guild(guild_id: int) -> dict[str, Any]:
    data = get_guild_data("products.json", guild_id, {})
    return data if isinstance(data, dict) else {}


def _orders(ctx: commands.Context) -> list[dict[str, Any]]:
    data = get_guild_data("orders.json", ctx.guild.id, [])
    return data if isinstance(data, list) else []


def _settings(ctx: commands.Context) -> dict[str, Any]:
    data = get_guild_data("settings.json", ctx.guild.id, {})
    return data if isinstance(data, dict) else {}


def _payment_methods(ctx: commands.Context) -> list[str]:
    methods = _settings(ctx).get("payment_methods", [])
    if not isinstance(methods, list):
        return []
    return [str(method) for method in methods if str(method).strip()]


def _find_product(products: dict[str, Any], product_id: str) -> tuple[str, dict[str, Any]] | None:
    key = product_id.strip().upper()
    item = products.get(key)
    if not isinstance(item, dict):
        return None
    return key, item

def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return default


def _safe_money(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return default
    return parsed if math.isfinite(parsed) else default


def _payment_methods_for_guild(guild_id: int) -> list[str]:
    settings = get_guild_data("settings.json", guild_id, {})
    if not isinstance(settings, dict):
        return []
    methods = settings.get("payment_methods", [])
    if not isinstance(methods, list):
        return []
    return [str(method) for method in methods if str(method).strip()]


class ShopOrderModal(discord.ui.Modal):
    def __init__(self, cog: "Store", product_id: str) -> None:
        super().__init__(title="Crear pedido", timeout=300)
        self.cog = cog
        self.product_id = product_id
        self.quantity = discord.ui.TextInput(
            label="Cantidad",
            placeholder="1",
            default="1",
            min_length=1,
            max_length=3,
            required=True,
        )
        self.add_item(self.quantity)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        if interaction.guild is None or not isinstance(interaction.user, discord.Member):
            await interaction.response.send_message("Este formulario solo funciona dentro de un servidor.", ephemeral=True)
            return
        try:
            quantity = int(str(self.quantity).strip())
        except ValueError:
            await interaction.response.send_message("La cantidad debe ser un número entero.", ephemeral=True)
            return
        order, error = await self.cog._create_order(interaction.guild, interaction.user, self.product_id, quantity)
        if error:
            await interaction.response.send_message(error, ephemeral=True)
            return
        assert order is not None
        await interaction.response.send_message(
            embed=self.cog._order_embed(order, _payment_methods_for_guild(interaction.guild.id)),
            ephemeral=True,
        )


class ShopProductSelect(discord.ui.Select):
    def __init__(
        self,
        cog: "Store",
        products: dict[str, Any],
        *,
        custom_id: str = "datashop:shop:browse-product",
    ) -> None:
        options: list[discord.SelectOption] = []
        for product_id, item in products.items():
            if not isinstance(item, dict):
                continue
            try:
                stock = int(item.get("stock", 0))
                price = float(item.get("price", 0))
            except (TypeError, ValueError):
                continue
            if stock <= 0:
                continue
            name = str(item.get("name", "Producto"))[:100] or "Producto"
            description = f"{price:.2f} {cog.bot.settings.currency} · Stock {stock}"[:100]
            options.append(discord.SelectOption(label=name, value=str(product_id)[:100], description=description))
            if len(options) >= 25:
                break
        if not options:
            options = [discord.SelectOption(label="Sin productos disponibles", value="_none", description="El catálogo está vacío")]
        super().__init__(
            placeholder="Selecciona un producto para comprar…",
            min_values=1,
            max_values=1,
            options=options,
            custom_id=custom_id,
        )
        self.cog = cog
        self.has_products = any(option.value != "_none" for option in options)

    async def callback(self, interaction: discord.Interaction) -> None:
        product_id = self.values[0]
        if product_id == "_none" or not self.has_products:
            await interaction.response.send_message("Ahora mismo no hay productos con stock disponible.", ephemeral=True)
            return
        await interaction.response.send_modal(ShopOrderModal(self.cog, product_id))


class ShopBrowseView(discord.ui.View):
    def __init__(self, cog: "Store", products: dict[str, Any]) -> None:
        super().__init__(timeout=300)
        self.add_item(ShopProductSelect(cog, products))


def _storefront_embed(guild: discord.Guild, products: dict[str, Any], currency: str) -> discord.Embed:
    available: list[tuple[str, dict[str, Any], float, int]] = []
    for product_id, item in products.items():
        if not isinstance(item, dict):
            continue
        price = _safe_money(item.get("price", -1), -1)
        stock = _safe_int(item.get("stock", -1), -1)
        if price < 0 or stock <= 0:
            continue
        available.append((str(product_id), item, price, stock))

    embed = discord.Embed(
        title="🛍️ DATASHOP  •  Tienda oficial",
        description=(
            "Explora el catálogo, elige un producto y crea tu pedido desde este panel.\n"
            "Tu solicitud quedará **pendiente de revisión** hasta que el equipo verifique el pago.\n\n"
            "Selecciona un producto en el menú; los botones inferiores muestran tu carrito y tus pedidos."
        ),
        color=discord.Color.from_str("#8B5CF6"),
        timestamp=discord.utils.utcnow(),
    )
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    if available:
        rows: list[str] = []
        for product_id, item, price, stock in available[:6]:
            name = str(item.get("name", "Producto"))[:80]
            description = str(item.get("description", "Sin descripción")).strip()[:90]
            rows.append(
                f"**{name}** · {price:.2f} {currency}\n"
                f"{description or 'Sin descripción'}\nID {product_id} · Stock {stock}"
            )
        embed.add_field(name="✨ Productos disponibles", value="\n\n".join(rows)[:1024], inline=False)
        if len(available) > 6:
            embed.add_field(
                name="Catálogo",
                value=f"Hay {len(available)} productos con stock. Usa el menú para ver las opciones.",
                inline=False,
            )
        image_url = str(available[0][1].get("image_url", "")).strip()
        parsed_image = urlparse(image_url) if image_url else None
        if parsed_image and parsed_image.scheme in {"http", "https"} and parsed_image.netloc:
            embed.set_image(url=image_url)
    else:
        embed.add_field(
            name="Catálogo vacío",
            value="El equipo todavía no ha publicado productos con stock disponible.",
            inline=False,
        )
    embed.add_field(
        name="🧾 Cómo comprar",
        value="1. Elige un producto.\n2. Indica la cantidad.\n3. Espera a que el equipo compruebe el pago.",
        inline=True,
    )
    embed.add_field(
        name="🔐 Compra segura",
        value="No envíes contraseñas, tokens ni datos completos de tarjetas. El bot no cobra automáticamente.",
        inline=True,
    )
    embed.set_footer(text=f"DATASHOP · {currency} · Panel interactivo · Pulsa actualizar para refrescar el catálogo")
    return embed


class ShopPanelView(discord.ui.View):
    """Persistent public shop panel with a per-guild component namespace."""

    def __init__(self, cog: "Store", guild_id: int, products: dict[str, Any]) -> None:
        super().__init__(timeout=None)
        self.cog = cog
        self.guild_id = guild_id
        self.add_item(
            ShopProductSelect(
                cog,
                products,
                custom_id=f"datashop:shop-panel:{guild_id}:product",
            )
        )
        button_specs = (
            ("cart", "Mi carrito", "🛒", discord.ButtonStyle.secondary),
            ("orders", "Mis pedidos", "📦", discord.ButtonStyle.secondary),
            ("refresh", "Actualizar", "↻", discord.ButtonStyle.primary),
        )
        for action, label, emoji, style in button_specs:
            button = discord.ui.Button(
                label=label,
                emoji=emoji,
                style=style,
                custom_id=f"datashop:shop-panel:{guild_id}:{action}",
                row=1,
            )
            button.callback = self._button_callback(action)
            self.add_item(button)

    def _button_callback(self, action: str):
        async def callback(interaction: discord.Interaction) -> None:
            if interaction.guild is None or interaction.guild.id != self.guild_id:
                await interaction.response.send_message("Este panel no pertenece a este servidor.", ephemeral=True)
                return
            if not isinstance(interaction.user, discord.Member):
                await interaction.response.send_message("Este panel solo funciona dentro de un servidor.", ephemeral=True)
                return

            if action == "refresh":
                products = _products_for_guild(self.guild_id)
                refreshed = ShopPanelView(self.cog, self.guild_id, products)
                embed = _storefront_embed(interaction.guild, products, self.cog.bot.settings.currency)
                await interaction.response.edit_message(embed=embed, view=refreshed)
                return

            if action == "cart":
                carts = get_guild_data("carts.json", self.guild_id, {})
                cart = carts.get(str(interaction.user.id), {}) if isinstance(carts, dict) else {}
                items = cart.get("items", {}) if isinstance(cart, dict) else {}
                products = _products_for_guild(self.guild_id)
                lines: list[str] = []
                total = 0.0
                unavailable: list[str] = []
                if isinstance(items, dict):
                    for product_id, raw_quantity in list(items.items())[:20]:
                        found = _find_product(products, str(product_id))
                        quantity = _safe_int(raw_quantity, 0)
                        if found is None or quantity < 1:
                            unavailable.append(str(product_id))
                            continue
                        key, product = found
                        price = _safe_money(product.get("price", -1), -1)
                        stock = _safe_int(product.get("stock", -1), -1)
                        if price < 0 or stock < 0:
                            unavailable.append(key)
                            continue
                        subtotal = round(price * quantity, 2)
                        total += subtotal
                        warning = " (stock insuficiente)" if quantity > stock else ""
                        lines.append(
                            f"**{str(product.get('name', key))[:100]}** × {quantity}{warning}\n"
                            f"{price:.2f} {self.cog.bot.settings.currency} cada uno · "
                            f"{subtotal:.2f} {self.cog.bot.settings.currency}"
                        )
                if unavailable:
                    lines.append("No disponibles: " + ", ".join(unavailable))
                embed = discord.Embed(
                    title="🛒 Tu carrito DATASHOP",
                    description="\n\n".join(lines) or "Tu carrito está vacío.",
                    color=discord.Color.from_str("#8B5CF6"),
                )
                embed.add_field(
                    name="Total estimado",
                    value=f"{total:.2f} {self.cog.bot.settings.currency}",
                    inline=False,
                )
                embed.set_footer(text="El stock se reserva al hacer checkout. Usa /shop checkout para crear el pedido.")
                await interaction.response.send_message(embed=embed, ephemeral=True)
                return

            if action == "orders":
                all_orders = get_guild_data("orders.json", self.guild_id, [])
                user_orders = [
                    order for order in all_orders
                    if isinstance(order, dict) and _safe_int(order.get("buyer_id"), 0) == interaction.user.id
                ] if isinstance(all_orders, list) else []
                lines = [
                    f"{order.get('id', '?')} · {str(order.get('product', 'Producto'))[:70]} × "
                    f"{order.get('quantity', 1)} · {_safe_money(order.get('total'), 0):.2f} "
                    f"{self.cog.bot.settings.currency} · {str(order.get('status', 'pending'))}"
                    for order in reversed(user_orders[-10:])
                ]
                embed = discord.Embed(
                    title="📦 Mis pedidos DATASHOP",
                    description="\n".join(lines) or "Todavía no tienes pedidos registrados.",
                    color=discord.Color.from_str("#8B5CF6"),
                )
                embed.set_footer(text="El estado pagado/completado requiere verificación del personal.")
                await interaction.response.send_message(embed=embed, ephemeral=True)

        return callback


class Store(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self._inventory_lock = asyncio.Lock()
        self._registered_panel_messages: set[int] = set()

    async def cog_load(self) -> None:
        if not self.expire_pending_orders.is_running():
            self.expire_pending_orders.start()

    async def cog_unload(self) -> None:
        self.expire_pending_orders.cancel()

    @commands.Cog.listener()
    async def on_ready(self) -> None:
        """Restore public shop panels after process restarts."""
        for guild in list(self.bot.guilds):
            try:
                panels = get_guild_data("shop_panels.json", guild.id, {})
                products = _products_for_guild(guild.id)
            except RuntimeError:
                log.exception("No se pudieron restaurar paneles de tienda en %s", guild.id)
                continue
            if not isinstance(panels, dict):
                continue
            for raw_message_id, row in list(panels.items())[-20:]:
                try:
                    message_id = int(raw_message_id)
                    channel_id = int(row.get("channel_id", 0)) if isinstance(row, dict) else 0
                except (TypeError, ValueError):
                    continue
                if message_id <= 0 or channel_id <= 0 or message_id in self._registered_panel_messages:
                    continue
                if not isinstance(guild.get_channel(channel_id), discord.TextChannel):
                    continue
                view = ShopPanelView(self, guild.id, products)
                self.bot.add_view(view, message_id=message_id)
                self._registered_panel_messages.add(message_id)

    @tasks.loop(minutes=1)
    async def expire_pending_orders(self) -> None:
        for guild in list(self.bot.guilds):
            await self._expire_guild_orders(guild)

    @expire_pending_orders.before_loop
    async def before_expire_pending_orders(self) -> None:
        await self.bot.wait_until_ready()

    async def _expire_guild_orders(self, guild: discord.Guild) -> None:
        settings = get_guild_data("settings.json", guild.id, {})
        if not isinstance(settings, dict):
            settings = {}
        try:
            expiry_minutes = int(settings.get("order_expiry_minutes", 1440))
        except (TypeError, ValueError):
            expiry_minutes = 1440
        if expiry_minutes <= 0:
            return

        async with self._inventory_lock:
            orders = get_guild_data("orders.json", guild.id, [])
            products = get_guild_data("products.json", guild.id, {})
            if not isinstance(orders, list) or not isinstance(products, dict):
                return
            now = discord.utils.utcnow()
            cutoff = now - timedelta(minutes=expiry_minutes)
            products_before = copy.deepcopy(products)
            changed_orders = False
            changed_stock = False

            for order in orders:
                if not isinstance(order, dict) or order.get("status") != "pending":
                    continue
                try:
                    created_at = datetime.fromisoformat(str(order.get("created_at", "")))
                    if created_at.tzinfo is None:
                        created_at = created_at.replace(tzinfo=timezone.utc)
                    created_at = created_at.astimezone(timezone.utc)
                except (TypeError, ValueError):
                    # Invalid timestamps are kept for manual review, rather than releasing stock blindly.
                    continue
                if created_at > cutoff:
                    continue

                product_id = str(order.get("product_id", ""))
                product = products.get(product_id)
                if isinstance(product, dict) and not order.get("stock_restored", False):
                    try:
                        quantity = int(order.get("quantity", 0))
                        stock = int(product.get("stock", 0))
                    except (TypeError, ValueError, OverflowError):
                        log.error(
                            "No se puede caducar el pedido %s: cantidad o stock inválido en el servidor %s",
                            order.get("id"), guild.id,
                        )
                        continue
                    if quantity < 1 or stock < 0:
                        log.error(
                            "No se puede caducar el pedido %s: cantidad o stock fuera de rango en el servidor %s",
                            order.get("id"), guild.id,
                        )
                        continue
                    product["stock"] = stock + quantity
                    products[product_id] = product
                    changed_stock = True

                order["status"] = "expired"
                order["stock_restored"] = True
                order["expired_at"] = now.isoformat()
                order["status_reason"] = "pending_timeout"
                changed_orders = True

            if not changed_orders:
                return
            products_saved = False
            try:
                if changed_stock:
                    set_guild_data("products.json", guild.id, products)
                    products_saved = True
                set_guild_data("orders.json", guild.id, orders)
            except RuntimeError:
                if products_saved:
                    try:
                        set_guild_data("products.json", guild.id, products_before)
                    except RuntimeError:
                        log.exception(
                            "No se pudo revertir el inventario tras fallar la caducidad de pedidos en %s",
                            guild.id,
                        )
                log.exception("No se pudo caducar pedidos pendientes en el servidor %s", guild.id)

    @commands.hybrid_group(name="shop", description="Consulta y administra el catálogo y los pedidos.", invoke_without_command=True)
    @commands.guild_only()
    async def shop(self, ctx: commands.Context) -> None:
        await send_context(
            ctx,
            "Usa shop list, add, edit, stock, remove, order, my-orders, orders, order-status o payment.",
            ephemeral=ctx.interaction is not None,
        )

    @shop.command(name="list", description="Muestra el catálogo de productos.")
    async def list_products(self, ctx: commands.Context) -> None:
        products = _products(ctx)
        embed = discord.Embed(
            title="🛍️ DATASHOP • Catálogo",
            color=discord.Color.from_str("#8B5CF6"),
        )
        entries = list(products.items())
        if not entries:
            embed.description = "Todavía no hay productos en el catálogo."
        else:
            lines = []
            for product_id, item in entries[:10]:
                stock = item.get("stock", 0)
                price = item.get("price", 0)
                description = str(item.get("description", "Sin descripción"))[:110]
                lines.append(
                    f"**{item.get('name', 'Producto')}** — {price:.2f} {self.bot.settings.currency}\n"
                    f"{description}\nStock: {stock} · ID: {product_id}"
                )
            embed.description = "\n\n".join(lines)
            if len(entries) > 10:
                embed.set_footer(text=f"Mostrando 10 de {len(entries)} productos.")
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @shop.command(name="panel", description="Publica un panel visual e interactivo de tienda en este canal.")
    async def publish_shop_panel(self, ctx: commands.Context) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor o Administrador para publicar el panel público de tienda.")
            return
        products = _products(ctx)
        view = ShopPanelView(self, ctx.guild.id, products)
        embed = _storefront_embed(ctx.guild, products, self.bot.settings.currency)
        try:
            if ctx.interaction:
                await ctx.interaction.response.send_message(embed=embed, view=view, ephemeral=False)
                message = await ctx.interaction.original_response()
            else:
                message = await ctx.send(embed=embed, view=view)
        except discord.HTTPException:
            await send_context(ctx, "No pude publicar el panel. Comprueba mis permisos para enviar embeds y componentes.")
            return

        panels = get_guild_data("shop_panels.json", ctx.guild.id, {})
        if not isinstance(panels, dict):
            panels = {}
        panels[str(message.id)] = {
            "channel_id": ctx.channel.id,
            "created_at": discord.utils.utcnow().isoformat(),
        }
        if len(panels) > 20:
            ordered = sorted(
                panels.items(),
                key=lambda pair: str(pair[1].get("created_at", "")) if isinstance(pair[1], dict) else "",
            )
            panels = dict(ordered[-20:])
        try:
            set_guild_data("shop_panels.json", ctx.guild.id, panels)
        except RuntimeError:
            log.exception("El panel se publicó, pero no se pudo guardar su registro de persistencia")
        self.bot.add_view(view, message_id=message.id)
        self._registered_panel_messages.add(message.id)
        await send_context(
            ctx,
            f"✅ Panel público de tienda publicado en {ctx.channel.mention}. Sus componentes se restaurarán tras reiniciar.",
            ephemeral=ctx.interaction is not None,
        )

    @shop.command(name="panel", description="Publica un panel visual e interactivo de tienda en este canal.")
    async def publish_shop_panel(self, ctx: commands.Context) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor o Administrador para publicar el panel público de tienda.")
            return
        products = _products(ctx)
        view = ShopPanelView(self, ctx.guild.id, products)
        embed = _storefront_embed(ctx.guild, products, self.bot.settings.currency)
        try:
            if ctx.interaction:
                await ctx.interaction.response.send_message(embed=embed, view=view, ephemeral=False)
                message = await ctx.interaction.original_response()
            else:
                message = await ctx.send(embed=embed, view=view)
        except discord.HTTPException:
            await send_context(ctx, "No pude publicar el panel. Comprueba mis permisos para enviar embeds y componentes.")
            return

        panels = get_guild_data("shop_panels.json", ctx.guild.id, {})
        if not isinstance(panels, dict):
            panels = {}
        panels[str(message.id)] = {
            "channel_id": ctx.channel.id,
            "created_at": discord.utils.utcnow().isoformat(),
        }
        if len(panels) > 20:
            ordered = sorted(
                panels.items(),
                key=lambda pair: str(pair[1].get("created_at", "")) if isinstance(pair[1], dict) else "",
            )
            panels = dict(ordered[-20:])
        try:
            set_guild_data("shop_panels.json", ctx.guild.id, panels)
        except RuntimeError:
            log.exception("El panel se publicó, pero no se pudo guardar su registro de persistencia")
        self.bot.add_view(view, message_id=message.id)
        self._registered_panel_messages.add(message.id)
        await send_context(
            ctx,
            f"✅ Panel público de tienda publicado en {ctx.channel.mention}. Sus componentes se restaurarán tras reiniciar.",
            ephemeral=ctx.interaction is not None,
        )

    @shop.command(name="browse", description="Abre un menú interactivo para elegir un producto y crear un pedido.")
    async def browse_products(self, ctx: commands.Context) -> None:
        products = _products(ctx)
        available = [
            item for item in products.values()
            if isinstance(item, dict) and isinstance(item.get("stock", 0), int) and item.get("stock", 0) > 0
        ]
        if not available:
            await send_context(ctx, "No hay productos con stock disponible ahora mismo.", ephemeral=ctx.interaction is not None)
            return
        embed = discord.Embed(
            title="🛍️ DATASHOP · Compra interactiva",
            description=(
                "Selecciona un producto y completa el formulario de cantidad. "
                "El pedido quedará pendiente hasta que el equipo verifique el pago."
            ),
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.set_footer(text=f"Moneda: {self.bot.settings.currency} · No envíes contraseñas ni datos privados.")
        await send_context(
            ctx,
            embed=embed,
            view=ShopBrowseView(self, products),
            ephemeral=ctx.interaction is not None,
        )

    @shop.command(name="add", description="Añade un producto al catálogo.")
    async def add_product(
        self,
        ctx: commands.Context,
        name: str,
        price: float,
        stock: int = 0,
        *,
        description: str = "Sin descripción",
    ) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor o Administrador para añadir productos.")
            return
        if not name.strip() or len(name) > 80:
            await send_context(ctx, "El nombre debe tener entre 1 y 80 caracteres.")
            return
        if not math.isfinite(price) or price < 0 or price > 1_000_000:
            await send_context(ctx, "El precio debe estar entre 0 y 1.000.000.")
            return
        if not 0 <= stock <= 1_000_000:
            await send_context(ctx, "El stock debe estar entre 0 y 1.000.000.")
            return
        async with self._inventory_lock:
            products = _products(ctx)
            product_id = secrets.token_hex(3).upper()
            while product_id in products:
                product_id = secrets.token_hex(3).upper()
            products[product_id] = {
                "name": name.strip(),
                "price": round(price, 2),
                "stock": stock,
                "description": description.strip()[:500] or "Sin descripción",
            }
            set_guild_data("products.json", ctx.guild.id, products)
        await send_context(
            ctx,
            f"✅ Producto añadido: {name.strip()} — {price:.2f} {self.bot.settings.currency}. ID: {product_id}",
        )

    @shop.command(name="edit", description="Edita un producto existente.")
    async def edit_product(
        self,
        ctx: commands.Context,
        product_id: str,
        name: str | None = None,
        price: float | None = None,
        stock: int | None = None,
        *,
        description: str | None = None,
    ) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor o Administrador para editar productos.")
            return
        async with self._inventory_lock:
            products = _products(ctx)
            found = _find_product(products, product_id)
            if found is None:
                await send_context(ctx, "No existe un producto con ese ID.")
                return
            if name is not None and (not name.strip() or len(name) > 80):
                await send_context(ctx, "El nombre debe tener entre 1 y 80 caracteres.")
                return
            if price is not None and not 0 <= price <= 1_000_000:
                await send_context(ctx, "El precio debe estar entre 0 y 1.000.000.")
                return
            if stock is not None and not 0 <= stock <= 1_000_000:
                await send_context(ctx, "El stock debe estar entre 0 y 1.000.000.")
                return
            key, item = found
            changes: list[str] = []
            if name is not None:
                item["name"] = name.strip()
                changes.append("nombre")
            if price is not None:
                item["price"] = round(price, 2)
                changes.append("precio")
            if stock is not None:
                item["stock"] = stock
                changes.append("stock")
            if description is not None:
                item["description"] = description.strip()[:500] or "Sin descripción"
                changes.append("descripción")
            if not changes:
                await send_context(ctx, "Indica al menos un campo para cambiar: nombre, precio, stock o descripción.")
                return
            products[key] = item
            set_guild_data("products.json", ctx.guild.id, products)
        await send_context(ctx, f"✅ Producto **{item.get('name', key)}** actualizado: {', '.join(changes)}.")

    @shop.command(name="stock", description="Establece el stock disponible de un producto.")
    async def set_stock(self, ctx: commands.Context, product_id: str, quantity: int) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor o Administrador para cambiar el stock.")
            return
        if not 0 <= quantity <= 1_000_000:
            await send_context(ctx, "El stock debe estar entre 0 y 1.000.000.")
            return
        async with self._inventory_lock:
            products = _products(ctx)
            found = _find_product(products, product_id)
            if found is None:
                await send_context(ctx, "No existe un producto con ese ID.")
                return
            key, item = found
            item["stock"] = quantity
            products[key] = item
            set_guild_data("products.json", ctx.guild.id, products)
        await send_context(ctx, f"✅ Stock de **{item.get('name', key)}** establecido en {quantity}.")

    @shop.command(name="image", description="Configura o quita la imagen de un producto.")
    async def set_product_image(self, ctx: commands.Context, product_id: str, image_url: str) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor o Administrador para cambiar imágenes.")
            return
        remove_image = image_url.strip().casefold() in {"off", "remove", "none"}
        if not remove_image:
            parsed = urlparse(image_url.strip())
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                await send_context(ctx, "Indica una URL de imagen válida que empiece por https:// o http://; usa 'off' para quitarla.")
                return
            image_url = image_url.strip()
        async with self._inventory_lock:
            products = _products(ctx)
            found = _find_product(products, product_id)
            if found is None:
                await send_context(ctx, "No existe un producto con ese ID.")
                return
            key, item = found
            if remove_image:
                item.pop("image_url", None)
            else:
                item["image_url"] = image_url[:1000]
            products[key] = item
            set_guild_data("products.json", ctx.guild.id, products)
        await send_context(ctx, f"✅ Imagen {'retirada de' if remove_image else 'actualizada para'} **{item.get('name', key)}**.")

    @shop.command(name="remove", description="Elimina un producto del catálogo usando su ID.")
    async def remove_product(self, ctx: commands.Context, product_id: str) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor o Administrador para eliminar productos.")
            return
        async with self._inventory_lock:
            products = _products(ctx)
            key = product_id.strip().upper()
            if key not in products:
                await send_context(ctx, "No existe un producto con ese ID.")
                return
            removed = products.pop(key)
            set_guild_data("products.json", ctx.guild.id, products)
        await send_context(ctx, f"🗑️ Producto eliminado: {removed.get('name', key)}.")

    @shop.group(name="payment", description="Configura métodos de pago informativos.", invoke_without_command=True)
    async def payment(self, ctx: commands.Context) -> None:
        methods = _payment_methods(ctx)
        await send_context(
            ctx,
            "Métodos configurados: " + (", ".join(methods) if methods else "ninguno") +
            ". Usa payment add o payment remove para editarlos.",
            ephemeral=ctx.interaction is not None,
        )

    @payment.command(name="add", description="Añade un método de pago a la información de la tienda.")
    async def add_payment_method(self, ctx: commands.Context, *, method: str) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor o Administrador para cambiar los métodos de pago.")
            return
        method = method.strip()
        if not method or len(method) > 60:
            await send_context(ctx, "El método debe tener entre 1 y 60 caracteres.")
            return
        settings = _settings(ctx)
        methods = settings.get("payment_methods", [])
        if not isinstance(methods, list):
            methods = []
        if any(str(existing).casefold() == method.casefold() for existing in methods):
            await send_context(ctx, "Ese método ya está configurado.")
            return
        methods.append(method)
        settings["payment_methods"] = methods[:20]
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, f"✅ Método informativo añadido: **{method}**. Los pagos aún deben verificarse manualmente.")

    @payment.command(name="remove", description="Retira un método de pago de la información de la tienda.")
    async def remove_payment_method(self, ctx: commands.Context, *, method: str) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor o Administrador para cambiar los métodos de pago.")
            return
        settings = _settings(ctx)
        methods = settings.get("payment_methods", [])
        if not isinstance(methods, list):
            methods = []
        kept = [str(existing) for existing in methods if str(existing).casefold() != method.strip().casefold()]
        if len(kept) == len(methods):
            await send_context(ctx, "No encontré ese método configurado.")
            return
        settings["payment_methods"] = kept
        set_guild_data("settings.json", ctx.guild.id, settings)
        await send_context(ctx, f"✅ Método retirado: **{method.strip()}**.")

    async def _create_order(
        self,
        guild: discord.Guild,
        buyer: discord.Member,
        product_id: str,
        quantity: int,
    ) -> tuple[dict[str, Any] | None, str | None]:
        if not 1 <= quantity <= 100:
            return None, "La cantidad debe ser de 1 a 100 unidades."
        async with self._inventory_lock:
            products = get_guild_data("products.json", guild.id, {})
            if not isinstance(products, dict):
                products = {}
            found = _find_product(products, product_id)
            if found is None:
                return None, "No existe un producto con ese ID."
            key, item = found
            stock = item.get("stock", 0)
            try:
                price = float(item.get("price", 0))
                parsed_stock = int(stock)
            except (TypeError, ValueError):
                return None, "El precio o stock de este producto no es válido. Pide al personal que lo revise."
            if parsed_stock < quantity or parsed_stock < 0:
                return None, f"Stock insuficiente. Disponible: {parsed_stock}."
            if not math.isfinite(price) or price < 0 or price > 1_000_000:
                return None, "El precio de este producto no es válido. Pide al personal que lo revise."

            orders = get_guild_data("orders.json", guild.id, [])
            if not isinstance(orders, list):
                orders = []
            order_id = secrets.token_hex(4).upper()
            while any(isinstance(row, dict) and str(row.get("id", "")).upper() == order_id for row in orders):
                order_id = secrets.token_hex(4).upper()
            total = round(price * quantity, 2)
            order = {
                "id": order_id,
                "buyer_id": buyer.id,
                "buyer": str(buyer),
                "product_id": key,
                "product": str(item.get("name", key)),
                "quantity": quantity,
                "price_each": round(price, 2),
                "total": total,
                "status": "pending",
                "created_at": discord.utils.utcnow().isoformat(),
                "image_url": str(item.get("image_url", ""))[:1000],
                "stock_restored": False,
            }
            previous_products = copy.deepcopy(products)
            item["stock"] = parsed_stock - quantity
            products[key] = item
            orders.append(order)
            try:
                set_guild_data("products.json", guild.id, products)
                set_guild_data("orders.json", guild.id, orders)
            except RuntimeError:
                try:
                    # Avoid consuming stock if the order record could not be persisted.
                    set_guild_data("products.json", guild.id, previous_products)
                except RuntimeError:
                    log.exception("Failed to roll back inventory after order persistence failure for guild %s", guild.id)
                return None, "No pude guardar el pedido de forma segura. No se ha confirmado; vuelve a intentarlo o contacta al personal."
        return order, None

    def _order_embed(self, order: dict[str, Any], methods: list[str]) -> discord.Embed:
        embed = discord.Embed(
            title=f"🧾 Pedido {order['id']}",
            description=(
                f"Producto: **{order['product']}**\nCantidad: **{order['quantity']}**\n"
                f"Total: **{float(order['total']):.2f} {self.bot.settings.currency}**\n"
                "Estado: **Pendiente de revisión**\n\n"
                "Este pedido no confirma un pago. Espera las instrucciones del personal y no envíes datos privados."
            ),
            color=discord.Color.from_str("#8B5CF6"),
            timestamp=discord.utils.utcnow(),
        )
        embed.add_field(name="Métodos informativos", value=", ".join(methods) if methods else "Consulta al personal.", inline=False)
        image_url = str(order.get("image_url", "")).strip()
        parsed_image = urlparse(image_url) if image_url else None
        if parsed_image and parsed_image.scheme in {"http", "https"} and parsed_image.netloc:
            embed.set_thumbnail(url=image_url)
        embed.set_footer(text="No hay cobro automático: el personal verificará el pago manualmente.")
        return embed

    def _load_cart(self, guild_id: int, user_id: int) -> dict[str, Any]:
        carts = get_guild_data("carts.json", guild_id, {})
        if not isinstance(carts, dict):
            return {"items": {}, "checkout_id": ""}
        cart = carts.get(str(user_id), {})
        if not isinstance(cart, dict):
            return {"items": {}, "checkout_id": ""}
        items = cart.get("items", {})
        if not isinstance(items, dict):
            items = {}
        return {"items": items, "checkout_id": str(cart.get("checkout_id", "") or "")}

    def _cart_orders(self, orders: list[Any], user_id: int, checkout_id: str) -> list[dict[str, Any]]:
        if not checkout_id:
            return []
        return [
            order for order in orders
            if isinstance(order, dict)
            and order.get("buyer_id") == user_id
            and order.get("cart_checkout_id") == checkout_id
        ]

    @shop.command(name="cart-add", description="Añade un producto al carrito.")
    async def cart_add(self, ctx: commands.Context, product_id: str, quantity: int = 1) -> None:
        if not isinstance(ctx.author, discord.Member):
            await send_context(ctx, "Este comando solo se puede usar dentro de un servidor.")
            return
        if not 1 <= quantity <= 100:
            await send_context(ctx, "La cantidad debe ser de 1 a 100 unidades.")
            return
        async with self._inventory_lock:
            products = _products(ctx)
            found = _find_product(products, product_id)
            if found is None:
                await send_context(ctx, "No existe un producto con ese ID.")
                return
            key, product = found
            stock = _safe_int(product.get("stock", 0), -1)
            if stock < 1:
                await send_context(ctx, "Ese producto no tiene stock disponible.")
                return
            carts = get_guild_data("carts.json", ctx.guild.id, {})
            if not isinstance(carts, dict):
                carts = {}
            user_key = str(ctx.author.id)
            cart = carts.get(user_key, {})
            if not isinstance(cart, dict):
                cart = {}
            marker_id = str(cart.get("checkout_id", "") or "")
            if marker_id:
                existing_orders = self._cart_orders(_orders(ctx), ctx.author.id, marker_id)
                if existing_orders:
                    # Old cart contents have already been checked out; do not resell them.
                    cart = {"items": {}, "checkout_id": ""}
                else:
                    cart["checkout_id"] = ""
            items = cart.get("items", {})
            if not isinstance(items, dict):
                items = {}
            try:
                current_quantity = int(items.get(key, 0))
            except (TypeError, ValueError):
                current_quantity = 0
            if current_quantity + quantity > stock:
                await send_context(ctx, f"Stock disponible: {stock}. Ya tienes {current_quantity} en el carrito.")
                return
            if key not in items and len(items) >= 25:
                await send_context(ctx, "El carrito admite un máximo de 25 productos diferentes.")
                return
            items[key] = current_quantity + quantity
            cart["items"] = items
            cart["checkout_id"] = ""
            carts[user_key] = cart
            set_guild_data("carts.json", ctx.guild.id, carts)
        await send_context(ctx, f"✅ Añadí **{product.get('name', key)} × {quantity}** al carrito.")

    @shop.command(name="cart-remove", description="Retira productos del carrito.")
    async def cart_remove(self, ctx: commands.Context, product_id: str, quantity: int | None = None) -> None:
        if not isinstance(ctx.author, discord.Member):
            await send_context(ctx, "Este comando solo se puede usar dentro de un servidor.")
            return
        if quantity is not None and quantity < 1:
            await send_context(ctx, "La cantidad a retirar debe ser positiva.")
            return
        async with self._inventory_lock:
            carts = get_guild_data("carts.json", ctx.guild.id, {})
            if not isinstance(carts, dict):
                carts = {}
            user_key = str(ctx.author.id)
            cart = carts.get(user_key, {})
            if not isinstance(cart, dict):
                await send_context(ctx, "Tu carrito está vacío.")
                return
            marker_id = str(cart.get("checkout_id", "") or "")
            if marker_id and self._cart_orders(_orders(ctx), ctx.author.id, marker_id):
                carts.pop(user_key, None)
                set_guild_data("carts.json", ctx.guild.id, carts)
                await send_context(ctx, "Ese carrito ya se convirtió en pedidos; no modifiqué los pedidos existentes.")
                return
            items = cart.get("items", {})
            if not isinstance(items, dict):
                items = {}
            key = product_id.strip().upper()
            if key not in items:
                await send_context(ctx, "Ese producto no está en tu carrito.")
                return
            try:
                current_quantity = int(items[key])
            except (TypeError, ValueError):
                current_quantity = 0
            if quantity is None or quantity >= current_quantity:
                items.pop(key, None)
            else:
                items[key] = current_quantity - quantity
            cart["items"] = items
            cart["checkout_id"] = ""
            if items:
                carts[user_key] = cart
            else:
                carts.pop(user_key, None)
            set_guild_data("carts.json", ctx.guild.id, carts)
        await send_context(ctx, f"✅ Carrito actualizado para el producto {key}.")

    @shop.command(name="cart-view", description="Muestra los productos de tu carrito.")
    async def cart_view(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.author, discord.Member):
            await send_context(ctx, "Este comando solo se puede usar dentro de un servidor.")
            return
        cart = self._load_cart(ctx.guild.id, ctx.author.id)
        items = cart.get("items", {})
        if not isinstance(items, dict) or not items:
            await send_context(ctx, "Tu carrito está vacío.", ephemeral=ctx.interaction is not None)
            return
        products = _products(ctx)
        lines = []
        total = 0.0
        unavailable: list[str] = []
        for product_id, raw_quantity in list(items.items())[:25]:
            found = _find_product(products, str(product_id))
            quantity = _safe_int(raw_quantity, 0)
            if found is None or quantity < 1:
                unavailable.append(str(product_id))
                continue
            key, product = found
            price = _safe_money(product.get("price", 0), -1)
            stock = _safe_int(product.get("stock", 0), -1)
            if price < 0 or stock < 0:
                unavailable.append(key)
                continue
            line_total = round(price * quantity, 2)
            total += line_total
            warning = " ⚠️" if quantity > stock else ""
            lines.append(
                f"**{product.get('name', key)}** × {quantity}{warning}\n"
                f"{price:.2f} {self.bot.settings.currency} c/u · **{line_total:.2f} {self.bot.settings.currency}** · ID {key}"
            )
        if unavailable:
            lines.append("\nNo disponibles o datos inválidos: " + ", ".join(unavailable))
        embed = discord.Embed(
            title="🛒 Tu carrito DATASHOP",
            description="\n\n".join(lines) or "No hay artículos disponibles en el carrito.",
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.add_field(name="Total estimado", value=f"{total:.2f} {self.bot.settings.currency}", inline=False)
        embed.set_footer(text="El stock se reserva al hacer checkout; el total puede cambiar si el personal edita precios.")
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @shop.command(name="cart-clear", description="Vacía tu carrito.")
    async def cart_clear(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.author, discord.Member):
            await send_context(ctx, "Este comando solo se puede usar dentro de un servidor.")
            return
        async with self._inventory_lock:
            carts = get_guild_data("carts.json", ctx.guild.id, {})
            if not isinstance(carts, dict) or str(ctx.author.id) not in carts:
                await send_context(ctx, "Tu carrito ya está vacío.")
                return
            cart = carts.get(str(ctx.author.id), {})
            if isinstance(cart, dict) and cart.get("checkout_id"):
                orders = _orders(ctx)
                if self._cart_orders(orders, ctx.author.id, str(cart["checkout_id"])):
                    await send_context(ctx, "Este carrito ya se convirtió en pedidos. Comprueba /shop my-orders.")
                    return
            carts.pop(str(ctx.author.id), None)
            set_guild_data("carts.json", ctx.guild.id, carts)
        await send_context(ctx, "✅ Carrito vacío.")

    @shop.command(name="checkout", description="Crea pedidos para todos los productos de tu carrito.")
    async def checkout_cart(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.author, discord.Member):
            await send_context(ctx, "Este comando solo se puede usar dentro de un servidor.")
            return
        async with self._inventory_lock:
            carts = get_guild_data("carts.json", ctx.guild.id, {})
            if not isinstance(carts, dict):
                carts = {}
            user_key = str(ctx.author.id)
            cart = carts.get(user_key, {})
            if not isinstance(cart, dict):
                await send_context(ctx, "Tu carrito está vacío.")
                return
            items = cart.get("items", {})
            if not isinstance(items, dict) or not items:
                await send_context(ctx, "Tu carrito está vacío.")
                return
            orders = _orders(ctx)
            checkout_id = str(cart.get("checkout_id", "") or "")
            if checkout_id:
                existing_orders = self._cart_orders(orders, ctx.author.id, checkout_id)
                if existing_orders:
                    carts.pop(user_key, None)
                    try:
                        set_guild_data("carts.json", ctx.guild.id, carts)
                    except RuntimeError:
                        log.exception("No se pudo limpiar el carrito tras recuperar checkout %s", checkout_id)
                    await send_context(
                        ctx,
                        "Este checkout ya estaba registrado; no he creado pedidos duplicados. IDs: "
                        + ", ".join(str(order.get("id")) for order in existing_orders),
                        ephemeral=ctx.interaction is not None,
                    )
                    return
                cart["checkout_id"] = ""
                carts[user_key] = cart

            products = _products(ctx)
            requested: list[tuple[str, int, dict[str, Any], float]] = []
            total = 0.0
            for raw_id, raw_quantity in items.items():
                found = _find_product(products, str(raw_id))
                quantity = _safe_int(raw_quantity, 0)
                if found is None:
                    await send_context(ctx, f"El producto {raw_id} ya no existe. Retíralo con /shop cart-remove y vuelve a intentar.")
                    return
                key, product = found
                price = _safe_money(product.get("price", -1), -1)
                stock = _safe_int(product.get("stock", -1), -1)
                if quantity < 1 or quantity > 100 or price < 0 or stock < quantity:
                    await send_context(
                        ctx,
                        f"No pude completar el carrito: revisa stock/precio de **{product.get('name', key)}**. Disponible: {max(0, stock)}.",
                    )
                    return
                requested.append((key, quantity, product, price))
                total += price * quantity
            if not requested:
                await send_context(ctx, "Tu carrito no contiene artículos válidos.")
                return

            checkout_id = secrets.token_hex(8).upper()
            cart["checkout_id"] = checkout_id
            carts[user_key] = cart
            products_before = copy.deepcopy(products)
            orders_before = copy.deepcopy(orders)
            created_orders: list[dict[str, Any]] = []
            now = discord.utils.utcnow().isoformat()
            for key, quantity, product, price in requested:
                order_id = secrets.token_hex(4).upper()
                while any(isinstance(row, dict) and str(row.get("id", "")).upper() == order_id for row in orders):
                    order_id = secrets.token_hex(4).upper()
                product["stock"] = _safe_int(product.get("stock", 0)) - quantity
                products[key] = product
                order = {
                    "id": order_id,
                    "cart_checkout_id": checkout_id,
                    "buyer_id": ctx.author.id,
                    "buyer": str(ctx.author),
                    "product_id": key,
                    "product": str(product.get("name", key)),
                    "quantity": quantity,
                    "price_each": round(price, 2),
                    "total": round(price * quantity, 2),
                    "status": "pending",
                    "created_at": now,
                    "image_url": str(product.get("image_url", ""))[:1000],
                    "stock_restored": False,
                }
                orders.append(order)
                created_orders.append(order)

            # Persist checkout marker first, so a retry can detect a committed checkout.
            try:
                set_guild_data("carts.json", ctx.guild.id, carts)
                set_guild_data("products.json", ctx.guild.id, products)
                set_guild_data("orders.json", ctx.guild.id, orders)
            except RuntimeError:
                try:
                    set_guild_data("products.json", ctx.guild.id, products_before)
                    set_guild_data("orders.json", ctx.guild.id, orders_before)
                    carts[user_key]["checkout_id"] = ""
                    set_guild_data("carts.json", ctx.guild.id, carts)
                except RuntimeError:
                    log.exception("No se pudo revertir checkout fallido en el servidor %s", ctx.guild.id)
                await send_context(ctx, "No pude guardar el checkout de forma segura; revisa el carrito y vuelve a intentarlo.")
                return

            # If clearing fails after order persistence, the marker prevents duplicate orders on retry.
            carts.pop(user_key, None)
            try:
                set_guild_data("carts.json", ctx.guild.id, carts)
            except RuntimeError:
                log.exception("Los pedidos se guardaron pero no se pudo limpiar el carrito %s", ctx.author.id)

        methods = _payment_methods(ctx)
        summary = "\n".join(
            f"• **{order['product']} × {order['quantity']}** — {float(order['total']):.2f} {self.bot.settings.currency} · Pedido {order['id']}"
            for order in created_orders[:10]
        )
        if len(created_orders) > 10:
            summary += f"\n…y {len(created_orders) - 10} pedidos más."
        embed = discord.Embed(
            title="🧾 Checkout completado · Pago pendiente",
            description=summary or "Pedidos creados.",
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.add_field(name="Total de carrito", value=f"{total:.2f} {self.bot.settings.currency}", inline=False)
        embed.add_field(name="Métodos informativos", value=", ".join(methods) if methods else "Consulta al personal.", inline=False)
        embed.set_footer(text="Los pagos no se procesan automáticamente. Espera instrucciones y confirmación del personal.")
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @shop.command(name="order", description="Crea una solicitud de pedido y reserva stock.")
    async def create_order(self, ctx: commands.Context, product_id: str, quantity: int = 1) -> None:
        if not isinstance(ctx.author, discord.Member):
            await send_context(ctx, "Este comando solo se puede usar dentro de un servidor.")
            return
        order, error = await self._create_order(ctx.guild, ctx.author, product_id, quantity)
        if error:
            await send_context(ctx, error)
            return
        assert order is not None
        await send_context(
            ctx,
            embed=self._order_embed(order, _payment_methods(ctx)),
            ephemeral=ctx.interaction is not None,
        )

    @shop.command(name="my-orders", description="Consulta tus pedidos recientes.")
    async def my_orders(self, ctx: commands.Context) -> None:
        if not isinstance(ctx.author, discord.Member):
            await send_context(ctx, "Este comando solo se puede usar dentro de un servidor.")
            return
        orders = [order for order in _orders(ctx) if isinstance(order, dict) and order.get("buyer_id") == ctx.author.id]
        orders = orders[-10:]
        if not orders:
            await send_context(ctx, "Todavía no tienes pedidos registrados.", ephemeral=ctx.interaction is not None)
            return
        lines = [
            f"**{order.get('id', '?')}** · {order.get('product', 'Producto')} × {order.get('quantity', 1)} — "
            f"{float(order.get('total', 0)):.2f} {self.bot.settings.currency} · {order.get('status', 'pending')}"
            for order in reversed(orders)
        ]
        embed = discord.Embed(title="📦 Mis pedidos", description="\n".join(lines), color=discord.Color.from_str("#8B5CF6"))
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @shop.command(name="orders", description="Lista pedidos para el equipo de la tienda.")
    async def list_orders(self, ctx: commands.Context, status: str | None = None) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Solo el personal de la tienda puede consultar todos los pedidos.")
            return
        if status is not None and status not in VALID_ORDER_STATUSES:
            await send_context(ctx, "Estados válidos: pending, paid, completed o cancelled.")
            return
        orders = [order for order in _orders(ctx) if isinstance(order, dict)]
        if status:
            orders = [order for order in orders if order.get("status") == status]
        orders = orders[-15:]
        if not orders:
            await send_context(ctx, "No hay pedidos para mostrar.", ephemeral=ctx.interaction is not None)
            return
        lines = [
            f"**{order.get('id', '?')}** · <@{order.get('buyer_id', 0)}> · {order.get('product', 'Producto')} × "
            f"{order.get('quantity', 1)} — {float(order.get('total', 0)):.2f} {self.bot.settings.currency} · "
            f"**{order.get('status', 'pending')}**"
            for order in reversed(orders)
        ]
        embed = discord.Embed(title="📦 Pedidos de la tienda", description="\n".join(lines), color=discord.Color.from_str("#8B5CF6"))
        embed.set_footer(text="No se muestran más de 15 pedidos en esta vista.")
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @shop.command(name="order-expiry", description="Configura caducidad automática para pedidos pendientes.")
    async def set_order_expiry(self, ctx: commands.Context, minutes: int) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Solo el personal de la tienda puede cambiar la caducidad de pedidos.")
            return
        if minutes != 0 and not 5 <= minutes <= 10080:
            await send_context(ctx, "Usa 0 para desactivar la caducidad o un valor entre 5 y 10080 minutos (7 días).")
            return
        settings = _settings(ctx)
        settings["order_expiry_minutes"] = minutes
        set_guild_data("settings.json", ctx.guild.id, settings)
        message = "desactivada" if minutes == 0 else f"establecida en {minutes} minutos"
        await send_context(ctx, f"✅ Caducidad automática de pedidos {message}.")

    @shop.command(name="stats", description="Muestra ventas, pedidos e inventario.")
    async def store_stats(self, ctx: commands.Context) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Solo el personal puede consultar las estadísticas de la tienda.")
            return
        products = _products(ctx)
        orders = [item for item in _orders(ctx) if isinstance(item, dict)]
        paid_orders = [item for item in orders if item.get("status") in {"paid", "completed"}]
        pending = [item for item in orders if item.get("status") == "pending"]
        completed = [item for item in orders if item.get("status") == "completed"]
        revenue = sum(max(0.0, _safe_money(item.get("total", 0))) for item in paid_orders)
        sold_units = sum(max(0, _safe_int(item.get("quantity", 0))) for item in paid_orders)
        out_of_stock = sum(
            1 for item in products.values()
            if isinstance(item, dict) and _safe_int(item.get("stock", 0)) <= 0
        )
        embed = discord.Embed(title="📈 DATASHOP · Estadísticas de tienda", color=discord.Color.from_str("#8B5CF6"))
        embed.add_field(name="Ventas verificadas", value=f"{revenue:.2f} {self.bot.settings.currency}", inline=True)
        embed.add_field(name="Unidades vendidas", value=str(sold_units), inline=True)
        embed.add_field(name="Pedidos completados", value=str(len(completed)), inline=True)
        embed.add_field(name="Pedidos pendientes", value=str(len(pending)), inline=True)
        embed.add_field(name="Pedidos totales", value=str(len(orders)), inline=True)
        embed.add_field(name="Productos", value=str(len(products)), inline=True)
        embed.add_field(name="Sin stock", value=str(out_of_stock), inline=True)
        embed.set_footer(text="El ingreso solo suma pedidos marcados como pago verificado o completado.")
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @shop.command(name="low-stock", description="Lista productos con stock bajo.")
    async def low_stock(self, ctx: commands.Context, threshold: int = 5) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Solo el personal puede consultar el inventario bajo.")
            return
        if not 0 <= threshold <= 1000:
            await send_context(ctx, "El umbral debe estar entre 0 y 1000.")
            return
        products = _products(ctx)
        low = [
            (key, item) for key, item in products.items()
            if isinstance(item, dict) and _safe_int(item.get("stock", 0)) <= threshold
        ]
        low.sort(key=lambda pair: _safe_int(pair[1].get("stock", 0)))
        lines = [
            f"**{item.get('name', key)}** · ID {key} · stock {_safe_int(item.get('stock', 0))}"
            for key, item in low[:20]
        ]
        embed = discord.Embed(
            title=f"📦 Stock bajo (≤ {threshold})",
            description="\n".join(lines) or "No hay productos dentro de este umbral.",
            color=discord.Color.orange(),
        )
        if len(low) > 20:
            embed.set_footer(text=f"Mostrando 20 de {len(low)} productos.")
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @shop.command(name="cancel", description="Cancela uno de tus pedidos pendientes y devuelve su stock.")
    async def cancel_order(self, ctx: commands.Context, order_id: str) -> None:
        if not isinstance(ctx.author, discord.Member):
            await send_context(ctx, "Este comando solo se puede usar dentro de un servidor.")
            return
        async with self._inventory_lock:
            orders = _orders(ctx)
            order = next(
                (item for item in orders if isinstance(item, dict) and str(item.get("id", "")).upper() == order_id.strip().upper()),
                None,
            )
            if order is None:
                await send_context(ctx, "No encontré ese pedido.")
                return
            if order.get("buyer_id") != ctx.author.id:
                await send_context(ctx, "Solo puedes cancelar tus propios pedidos.")
                return
            if order.get("status") != "pending":
                await send_context(ctx, "Solo puedes cancelar pedidos pendientes. Para pedidos ya pagados, contacta al personal.")
                return

            products_before: dict[str, Any] | None = None
            products_saved = False
            try:
                if not order.get("stock_restored", False):
                    products = _products(ctx)
                    products_before = copy.deepcopy(products)
                    product_id = str(order.get("product_id", ""))
                    product = products.get(product_id)
                    if isinstance(product, dict):
                        product["stock"] = max(0, _safe_int(product.get("stock", 0))) + max(0, _safe_int(order.get("quantity", 1), 1))
                        products[product_id] = product
                        set_guild_data("products.json", ctx.guild.id, products)
                        products_saved = True
                    order["stock_restored"] = True
                order["status"] = "cancelled"
                order["cancelled_at"] = discord.utils.utcnow().isoformat()
                order["cancelled_by"] = ctx.author.id
                set_guild_data("orders.json", ctx.guild.id, orders)
            except RuntimeError:
                if products_saved and products_before is not None:
                    try:
                        set_guild_data("products.json", ctx.guild.id, products_before)
                    except RuntimeError:
                        log.exception("No se pudo restaurar el inventario tras un fallo cancelando el pedido %s", order_id)
                log.exception("No se pudo guardar la cancelación del pedido %s", order_id)
                await send_context(ctx, "No pude guardar la cancelación de forma segura. No vuelvas a intentarlo repetidamente; avisa al personal para revisar el pedido y el stock.")
                return
        await send_context(ctx, f"✅ Pedido {order.get('id')} cancelado; el stock reservado se ha devuelto.")

    @shop.command(name="order-status", description="Actualiza el estado de un pedido tras comprobarlo.")
    async def set_order_status(self, ctx: commands.Context, order_id: str, status: str) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Solo el personal de la tienda puede actualizar pedidos.")
            return
        status = status.strip().lower()
        if status not in VALID_ORDER_STATUSES:
            await send_context(ctx, "Estados válidos: pending, paid, completed o cancelled.")
            return
        async with self._inventory_lock:
            orders = _orders(ctx)
            order = next(
                (item for item in orders if isinstance(item, dict) and str(item.get("id", "")).upper() == order_id.strip().upper()),
                None,
            )
            if order is None:
                await send_context(ctx, "No encontré ese pedido.")
                return
            old_status = str(order.get("status", "pending"))
            allowed_transitions = {
                "pending": {"paid", "cancelled"},
                "paid": {"completed"},
                "completed": set(),
                "cancelled": set(),
            }
            if status == old_status:
                await send_context(ctx, f"El pedido ya está en estado {status}.")
                return
            if status not in allowed_transitions.get(old_status, set()):
                await send_context(
                    ctx,
                    f"Transición no permitida: {old_status} -> {status}. "
                    "Flujo admitido: pending -> paid -> completed; pending -> cancelled. "
                    "Un pedido pagado requiere un proceso de reembolso aparte.",
                )
                return

            products_before: dict[str, Any] | None = None
            products_saved = False
            try:
                if status == "cancelled" and not order.get("stock_restored", False):
                    products = _products(ctx)
                    products_before = copy.deepcopy(products)
                    product_id = str(order.get("product_id", ""))
                    item = products.get(product_id)
                    if isinstance(item, dict):
                        item["stock"] = max(0, _safe_int(item.get("stock", 0))) + max(0, _safe_int(order.get("quantity", 1), 1))
                        products[product_id] = item
                        set_guild_data("products.json", ctx.guild.id, products)
                        products_saved = True
                    order["stock_restored"] = True
                order["status"] = status
                order["updated_at"] = discord.utils.utcnow().isoformat()
                order["updated_by"] = ctx.author.id
                set_guild_data("orders.json", ctx.guild.id, orders)
            except RuntimeError:
                if products_saved and products_before is not None:
                    try:
                        set_guild_data("products.json", ctx.guild.id, products_before)
                    except RuntimeError:
                        log.exception("No se pudo restaurar el inventario tras fallar el estado del pedido %s", order_id)
                log.exception("No se pudo guardar la actualización del pedido %s", order_id)
                await send_context(ctx, "No pude guardar el cambio de estado de forma segura. Avisa al personal para revisar el pedido y el stock.")
                return

        labels = {
            "pending": "pendiente",
            "paid": "pago verificado manualmente",
            "completed": "completado",
            "cancelled": "cancelado",
        }
        await send_context(
            ctx,
            f"✅ Pedido {order.get('id')} actualizado a **{labels[status]}**. Verifica el pago fuera del bot antes de marcarlo como pagado.",
        )

    @shop.command(name="review", description="Valora un pedido completado que te pertenece.")
    async def add_verified_review(
        self,
        ctx: commands.Context,
        order_id: str,
        rating: int,
        *,
        comment: str,
    ) -> None:
        if not isinstance(ctx.author, discord.Member):
            await send_context(ctx, "Este comando solo se puede usar dentro de un servidor.")
            return
        if not 1 <= rating <= 5:
            await send_context(ctx, "La valoración debe estar entre 1 y 5 estrellas.")
            return
        comment = comment.strip()
        if not comment or len(comment) > 1000:
            await send_context(ctx, "El comentario debe tener entre 1 y 1000 caracteres.")
            return
        orders = _orders(ctx)
        order = next(
            (row for row in orders if isinstance(row, dict) and str(row.get("id", "")).upper() == order_id.strip().upper()),
            None,
        )
        if order is None or order.get("buyer_id") != ctx.author.id:
            await send_context(ctx, "No encontré un pedido tuyo con ese ID.")
            return
        if order.get("status") != "completed":
            await send_context(ctx, "Solo puedes valorar pedidos marcados como completados.")
            return
        reviews = get_guild_data("reviews.json", ctx.guild.id, [])
        if not isinstance(reviews, list):
            reviews = []
        if any(isinstance(row, dict) and str(row.get("order_id", "")).upper() == str(order.get("id", "")).upper() for row in reviews):
            await send_context(ctx, "Ese pedido ya tiene una reseña registrada.")
            return
        review = {
            "order_id": str(order.get("id", "")),
            "buyer_id": ctx.author.id,
            "buyer": str(ctx.author),
            "product_id": str(order.get("product_id", "")),
            "product": str(order.get("product", "Producto"))[:120],
            "rating": rating,
            "comment": comment,
            "created_at": discord.utils.utcnow().isoformat(),
            "verified": True,
        }
        reviews.append(review)
        set_guild_data("reviews.json", ctx.guild.id, reviews)
        embed = discord.Embed(
            title="⭐ Reseña verificada",
            description=comment,
            color=discord.Color.from_str("#8B5CF6"),
            timestamp=discord.utils.utcnow(),
        )
        embed.add_field(name="Producto", value=f"{review['product']} · ID {review['product_id']}", inline=False)
        embed.add_field(name="Valoración", value="⭐" * rating + f" ({rating}/5)", inline=True)
        embed.add_field(name="Pedido", value=str(order.get("id")), inline=True)
        embed.set_author(name=ctx.author.display_name, icon_url=ctx.author.display_avatar.url)
        embed.set_footer(text="Reseña vinculada a un pedido completado")
        await send_context(ctx, embed=embed, allowed_mentions=discord.AllowedMentions.none())

    @shop.command(name="reviews", description="Consulta reseñas verificadas de los productos.")
    async def list_verified_reviews(self, ctx: commands.Context, product_id: str | None = None) -> None:
        reviews = get_guild_data("reviews.json", ctx.guild.id, [])
        if not isinstance(reviews, list):
            reviews = []
        selected = [
            row for row in reviews
            if isinstance(row, dict)
            and row.get("verified") is True
            and (
                product_id is None
                or str(row.get("product_id", "")).casefold() == product_id.strip().casefold()
                or str(row.get("product", "")).casefold() == product_id.strip().casefold()
            )
        ]
        recent = selected[-10:]
        if not recent:
            await send_context(ctx, "Todavía no hay reseñas verificadas para esa búsqueda.", ephemeral=ctx.interaction is not None)
            return
        ratings = [int(row.get("rating", 0)) for row in selected if isinstance(row.get("rating"), int) and 1 <= row["rating"] <= 5]
        average = sum(ratings) / len(ratings) if ratings else 0.0
        lines = []
        for row in reversed(recent):
            rating = _safe_int(row.get("rating", 0))
            stars = "⭐" * max(0, min(5, rating))
            product = str(row.get("product", "Producto"))[:100]
            comment = str(row.get("comment", ""))[:180].replace("\n", " ")
            lines.append(f"{stars} **{product}**\n{comment}\nPedido: {row.get('order_id', '—')}")
        embed = discord.Embed(
            title="⭐ Reseñas verificadas",
            description="\n\n".join(lines)[:4000],
            color=discord.Color.from_str("#8B5CF6"),
        )
        embed.add_field(name="Media", value=f"{average:.2f}/5 · {len(ratings)} reseñas", inline=False)
        if product_id:
            embed.set_footer(text=f"Filtro: {product_id}")
        else:
            embed.set_footer(text="Mostrando las 10 reseñas más recientes.")
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

    @commands.hybrid_command(name="vouch", description="Registra una reseña o venta completada.")
    @commands.guild_only()
    async def vouch(
        self,
        ctx: commands.Context,
        buyer: discord.Member,
        product: str,
        *,
        details: str = "Sin detalles adicionales",
    ) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Solo el personal autorizado puede registrar vouches.")
            return
        records = get_guild_data("vouches.json", ctx.guild.id, [])
        if not isinstance(records, list):
            records = []
        record = {
            "buyer_id": buyer.id,
            "buyer": str(buyer),
            "product": product[:120],
            "details": details[:400],
            "staff_id": ctx.author.id,
            "staff": str(ctx.author),
            "timestamp": discord.utils.utcnow().isoformat(),
        }
        records.append(record)
        set_guild_data("vouches.json", ctx.guild.id, records)
        embed = discord.Embed(
            title="⚡ Vouch registrado",
            description=(
                f"Cliente: {buyer.mention}\n"
                f"Producto: **{product[:120]}**\n"
                f"Detalles: {details[:400]}\n"
                f"Registrado por: {ctx.author.mention}"
            ),
            color=discord.Color.green(),
            timestamp=discord.utils.utcnow(),
        )
        embed.set_footer(text=f"DATASHOP • Venta registrada #{len(records)}")
        await send_context(ctx, embed=embed)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Store(bot))
