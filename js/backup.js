async function runSystemMaintenance(action, payload = {}) {
  const { data, error } = await supabaseClient.functions.invoke('system-maintenance', { body: { action, ...payload } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'No se pudo completar la operación.');
  return data;
}
async function downloadSystemBackup() {
  try { const backup = await runSystemMaintenance('export'); const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `thera-dent-respaldo-${getISODate(0)}.json`; link.click(); URL.revokeObjectURL(url); showToast('Copia de seguridad descargada. Guárdala cifrada y fuera de este equipo.'); } catch (_) { showToast('No se pudo crear la copia de seguridad.'); }
}
async function restoreSystemBackup(file) {
  if (!file) return; const confirmation = prompt('Esta acción reemplaza los datos actuales. Escribe RESTABLECER TODO para continuar:'); if (confirmation !== 'RESTABLECER TODO') return;
  try { const backup = JSON.parse(await file.text()); await runSystemMaintenance('restore', { backup, confirmation }); showToast('Base restaurada. Recargando…'); setTimeout(() => location.reload(), 800); } catch (_) { showToast('No se pudo restaurar: verifica que el archivo sea una copia válida.'); }
}
async function resetSystemData() {
  const confirmation = prompt('Esta acción elimina permanentemente todos los datos clínicos. Escribe BORRAR TODO para continuar:'); if (confirmation !== 'BORRAR TODO') return;
  try { await runSystemMaintenance('reset', { backup: { format: 'theradent-backup', version: 1 }, confirmation }); showToast('Datos eliminados. Recargando…'); setTimeout(() => location.reload(), 800); } catch (_) { showToast('No se pudo restablecer el sistema.'); }
}
