from __future__ import annotations

from typing import Any

from discord.ext import commands


async def send_context(
    ctx: commands.Context,
    *args: Any,
    ephemeral: bool = False,
    **kwargs: Any,
) -> Any:
    """Send a response that works for both prefix and slash invocations."""
    if ctx.interaction is not None:
        return await ctx.send(*args, ephemeral=ephemeral, **kwargs)
    return await ctx.send(*args, **kwargs)
