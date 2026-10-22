"use strict";

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "").trim());
}

function isOptionalHttpsUrl(value) {
  const url = String(value || "").trim();
  if (!url) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function isValidCategoryKey(value) {
  return /^[a-z][a-z0-9_-]{0,31}$/.test(String(value || "").trim());
}

function isUnicodeEmoji(value) {
  const input = String(value || "").trim();
  // Include pictographs and regional-indicator flags; reject whitespace-separated prose.
  return Boolean(input) && !/\s/u.test(input) &&
    /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(input);
}

function ticketConfigErrorMessage(error, action = "unknown") {
  const code = String(error && (error.code ?? error.rawError?.code) || "");
  const permissionErrors = {
    "50001": "El bot no tiene acceso al canal o recurso seleccionado. Revisa que pueda ver el canal y que siga existiendo.",
    "50013": "Discord rechazó la acción por falta de permisos. Revisa los permisos del bot y las restricciones del canal o categoría.",
    "50035": "Discord rechazó el formato enviado. Revisa la longitud de los campos, el emoji y los componentes del panel."
  };
  if (permissionErrors[code]) return "❌ " + permissionErrors[code];
  if (code === "10062" || /unknown interaction/i.test(String(error?.message || ""))) {
    return "❌ La interacción caducó antes de terminar. Vuelve a pulsar el botón e inténtalo otra vez.";
  }
  if (["EACCES", "EROFS", "ENOSPC"].includes(code)) {
    return "❌ No se pudieron guardar los ajustes en el almacenamiento del bot. Revisa el disco y los permisos de escritura del hosting.";
  }
  const labels = {
    save_new_category: "crear la categoría",
    save_category: "guardar la apariencia de la categoría",
    save_category_content: "guardar el mensaje inicial",
    save_panel_editor: "guardar la apariencia del panel",
    save_panel_images: "guardar las imágenes",
    save_moderation: "guardar la moderación",
    create_panel: "publicar o actualizar el panel",
    category_manager_toggle: "cambiar el estado de la categoría",
    category_manager_delete_confirm: "eliminar la categoría"
  };
  const actionText = labels[action] || "completar esta acción";
  return "❌ No se pudo " + actionText + ". Comprueba los datos del formulario y los permisos del bot; el error técnico quedó registrado en los logs.";
}

module.exports = {
  isHexColor,
  isOptionalHttpsUrl,
  isValidCategoryKey,
  isUnicodeEmoji,
  ticketConfigErrorMessage
};
