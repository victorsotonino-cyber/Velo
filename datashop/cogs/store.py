from __future__ import annotations

import asyncio
import secrets
from typing import Any

import discord
from discord.ext import commands

from datashop.respond import send_context
from datashop.storage import get_guild_data, set_guild_data


VALID_ORDER_STATUSES = {"pending", "paid", "completed", "cancelled"}


def _is_staff(ctx: commands.Context) -> bool:
    return isinstance(ctx.author, discord.Member) and (
        ctx.author.guild_permissions.manage_guild
        or ctx.author.guild_permissions.administrator
    )


def _products(ctx: commands.Context) -> dict[str, Any]:
    data = get_guild_data("products.json", ctx.guild.id, {})
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


class Store(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self._inventory_lock = asyncio.Lock()

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
        if price < 0 or price > 1_000_000:
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

    @shop.command(name="order", description="Crea una solicitud de pedido y reserva stock.")
    async def create_order(self, ctx: commands.Context, product_id: str, quantity: int = 1) -> None:
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
            key, item = found
            stock = item.get("stock", 0)
            try:
                price = float(item.get("price", 0))
            except (TypeError, ValueError):
                await send_context(ctx, "El precio de este producto no es válido. Pide al personal que lo revise.")
                return
            if not isinstance(stock, int) or stock < quantity:
                await send_context(ctx, f"Stock insuficiente. Disponible: {stock if isinstance(stock, int) else 0}.")
                return
            if price < 0 or price > 1_000_000:
                await send_context(ctx, "El precio de este producto no es válido. Pide al personal que lo revise.")
                return

            orders = _orders(ctx)
            order_id = secrets.token_hex(4).upper()
            while any(str(order.get("id", "")) == order_id for order in orders if isinstance(order, dict)):
                order_id = secrets.token_hex(4).upper()
            total = round(price * quantity, 2)
            order = {
                "id": order_id,
                "buyer_id": ctx.author.id,
                "buyer": str(ctx.author),
                "product_id": key,
                "product": str(item.get("name", key)),
                "quantity": quantity,
                "price_each": round(price, 2),
                "total": total,
                "status": "pending",
                "created_at": discord.utils.utcnow().isoformat(),
                "stock_restored": False,
            }
            item["stock"] = stock - quantity
            products[key] = item
            set_guild_data("products.json", ctx.guild.id, products)
            orders.append(order)
            set_guild_data("orders.json", ctx.guild.id, orders)
        methods = _payment_methods(ctx)
        embed = discord.Embed(
            title=f"🧾 Pedido {order_id}",
            description=(
                f"Producto: **{order['product']}**\nCantidad: **{quantity}**\n"
                f"Total: **{total:.2f} {self.bot.settings.currency}**\nEstado: **Pendiente de revisión**\n\n"
                "Este pedido no confirma un pago. Espera las instrucciones del personal y no envíes datos privados."
            ),
            color=discord.Color.from_str("#8B5CF6"),
            timestamp=discord.utils.utcnow(),
        )
        embed.add_field(name="Métodos informativos", value=", ".join(methods) if methods else "Consulta al personal.", inline=False)
        await send_context(ctx, embed=embed, ephemeral=ctx.interaction is not None)

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
        try:
            revenue = sum(max(0.0, float(item.get("total", 0))) for item in paid_orders)
        except (TypeError, ValueError):
            revenue = 0.0
        sold_units = sum(max(0, int(item.get("quantity", 0))) for item in paid_orders if str(item.get("quantity", "")).isdigit())
        out_of_stock = sum(1 for item in products.values() if isinstance(item, dict) and int(item.get("stock", 0) or 0) <= 0)
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
            if isinstance(item, dict) and int(item.get("stock", 0) or 0) <= threshold
        ]
        low.sort(key=lambda pair: int(pair[1].get("stock", 0) or 0))
        lines = [
            f"**{item.get('name', key)}** · ID {key} · stock {int(item.get('stock', 0) or 0)}"
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
            if not order.get("stock_restored", False):
                products = _products(ctx)
                product_id = str(order.get("product_id", ""))
                product = products.get(product_id)
                if isinstance(product, dict):
                    try:
                        product["stock"] = max(0, int(product.get("stock", 0))) + int(order.get("quantity", 1))
                    except (TypeError, ValueError):
                        await send_context(ctx, "No pude devolver el stock; contacta al personal.")
                        return
                    products[product_id] = product
                    set_guild_data("products.json", ctx.guild.id, products)
                order["stock_restored"] = True
            order["status"] = "cancelled"
            order["cancelled_at"] = discord.utils.utcnow().isoformat()
            order["cancelled_by"] = ctx.author.id
            set_guild_data("orders.json", ctx.guild.id, orders)
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
            order = next((item for item in orders if isinstance(item, dict) and str(item.get("id", "")).upper() == order_id.strip().upper()), None)
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
            if status == "cancelled" and not order.get("stock_restored", False):
                products = _products(ctx)
                product_id = str(order.get("product_id", ""))
                item = products.get(product_id)
                if isinstance(item, dict):
                    try:
                        item["stock"] = max(0, int(item.get("stock", 0))) + int(order.get("quantity", 1))
                        products[product_id] = item
                        set_guild_data("products.json", ctx.guild.id, products)
                    except (TypeError, ValueError):
                        await send_context(ctx, "No pude devolver el stock automáticamente; revisa el inventario.")
                        return
                order["stock_restored"] = True
            order["status"] = status
            order["updated_at"] = discord.utils.utcnow().isoformat()
            order["updated_by"] = ctx.author.id
            set_guild_data("orders.json", ctx.guild.id, orders)
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
