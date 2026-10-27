from __future__ import annotations

import secrets
from typing import Any

import discord
from discord.ext import commands

from datashop.respond import send_context
from datashop.storage import get_guild_data, set_guild_data


def _is_staff(ctx: commands.Context) -> bool:
    return isinstance(ctx.author, discord.Member) and (
        ctx.author.guild_permissions.manage_guild
        or ctx.author.guild_permissions.administrator
    )


def _products(ctx: commands.Context) -> dict[str, Any]:
    data = get_guild_data("products.json", ctx.guild.id, {})
    return data if isinstance(data, dict) else {}


class Store(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.hybrid_group(name="shop", description="Consulta y administra el catálogo de DATASHOP.", invoke_without_command=True)
    @commands.guild_only()
    async def shop(self, ctx: commands.Context) -> None:
        await send_context(ctx, "Usa shop list para ver el catálogo, shop add para añadir un producto o shop remove para eliminarlo.")

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

    @shop.command(name="remove", description="Elimina un producto del catálogo usando su ID.")
    async def remove_product(self, ctx: commands.Context, product_id: str) -> None:
        if not _is_staff(ctx):
            await send_context(ctx, "Necesitas Gestionar servidor o Administrador para eliminar productos.")
            return
        products = _products(ctx)
        key = product_id.strip().upper()
        if key not in products:
            await send_context(ctx, "No existe un producto con ese ID.")
            return
        removed = products.pop(key)
        set_guild_data("products.json", ctx.guild.id, products)
        await send_context(ctx, f"🗑️ Producto eliminado: {removed.get('name', key)}.")

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
