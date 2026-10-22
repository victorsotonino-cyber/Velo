"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = __dirname;
const files = fs.readdirSync(root).filter(function (file) { return file.endsWith(".js"); }).sort();

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { stdio: "inherit" });
  if (result.error) { console.error("No se pudo comprobar " + file + ":", result.error.message); failed = true; }
  else if (result.status !== 0) failed = true;
}

if (failed) { console.error("La comprobación de sintaxis encontró uno o más errores."); process.exitCode = 1; }
else console.log("Sintaxis válida en " + files.length + " archivos JavaScript del directorio principal.");
