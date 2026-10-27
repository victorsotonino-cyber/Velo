from __future__ import annotations

import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from datashop.bot import DataShopBot
from datashop.config import Settings

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
log = logging.getLogger("datashop")


def start_health_server(bot: DataShopBot, port: int) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path not in ("/", "/health"):
                self.send_error(404)
                return
            ready = bot.is_ready()
            body = json.dumps({
                "service": "DATASHOP",
                "status": "online" if ready else "starting",
            }).encode("utf-8")
            self.send_response(200 if ready else 503)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format: str, *_args: object) -> None:
            return

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    thread = threading.Thread(target=server.serve_forever, name="health-server", daemon=True)
    thread.start()
    log.info("Servidor de salud iniciado en el puerto %s", port)


def main() -> None:
    settings = Settings.from_env()
    if not settings.token:
        raise SystemExit("Falta DISCORD_TOKEN. Configúralo en el entorno del hosting; no lo pegues en el código.")
    bot = DataShopBot(settings)
    start_health_server(bot, settings.port)
    try:
        bot.run(settings.token, log_handler=None)
    except KeyboardInterrupt:
        log.info("Apagado solicitado.")


if __name__ == "__main__":
    main()
