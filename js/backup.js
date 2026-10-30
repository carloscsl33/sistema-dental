async function runSystemMaintenance(action, payload = {}) {
  const { data, error } = await supabaseClient.functions.invoke(
    "system-maintenance",
    { body: { action, ...payload } },
  );
  if (error || data?.error)
    throw new Error(
      data?.error || error?.message || "No se pudo completar la operación.",
    );
  return data;
}
async function downloadSystemBackup() {
  try {
    const backup = await runSystemMaintenance("export");
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `thera-dent-respaldo-${getISODate(0)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(
      "Copia de seguridad descargada. Guárdala cifrada y fuera de este equipo.",
    );
  } catch (_) {
    showToast("No se pudo crear la copia de seguridad.");
  }
}
async function restoreSystemBackup(file) {
  if (!file) return;
  const { confirmed, value: confirmation } = await showConfirmationDialog({
    title: "Restaurar copia de seguridad",
    message:
      "La información actual será reemplazada por el archivo seleccionado. Esta operación no se puede deshacer.",
    confirmLabel: "Restaurar",
    input: {
      type: "text",
      label: "Escribe RESTABLECER TODO para confirmar",
      match: "RESTABLECER TODO",
      value: "",
    },
  });
  if (!confirmed) return;
  try {
    const backup = JSON.parse(await file.text());
    await runSystemMaintenance("restore", { backup, confirmation });
    showToast("Base restaurada. Recargando…");
    setTimeout(() => location.reload(), 800);
  } catch (_) {
    showToast(
      "No se pudo restaurar: verifica que el archivo sea una copia válida.",
    );
  }
}
async function resetSystemData() {
  const { confirmed, value: confirmation } = await showConfirmationDialog({
    title: "Restablecer datos clínicos",
    message:
      "Se eliminarán permanentemente pacientes, citas, cobros, expedientes y códigos QR. La configuración de la clínica se conservará.",
    confirmLabel: "Restablecer datos",
    input: {
      type: "text",
      label: "Escribe BORRAR TODO para confirmar",
      match: "BORRAR TODO",
      value: "",
    },
  });
  if (!confirmed) return;
  try {
    await runSystemMaintenance("reset", {
      backup: { format: "theradent-backup", version: 1 },
      confirmation,
    });
    showToast("Datos eliminados. Recargando…");
    setTimeout(() => location.reload(), 800);
  } catch (_) {
    showToast("No se pudo restablecer el sistema.");
  }
}
