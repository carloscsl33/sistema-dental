let selectedSystemBackupFile = null;

async function runSystemMaintenance(action, payload = {}) {
  if (!hasRole('admin')) throw new Error('Solo una cuenta administradora puede realizar esta acción.');
  if (!supabaseClient) throw new Error('No hay conexión con la base de datos.');

  const { data, error } = await supabaseClient.functions.invoke('system-maintenance', {
    body: { action, ...payload }
  });
  if (error) {
    let message = '';
    try {
      const details = await error.context?.clone?.().json();
      message = details?.error || '';
    } catch (_) {
      // La respuesta no siempre contiene JSON; se utiliza el mensaje seguro de respaldo.
    }
    throw new Error(message || error.message || 'No se pudo completar la operación.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function downloadSystemBackup() {
  try {
    const backup = await runSystemMaintenance('export');
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `thera-dent-respaldo-${getISODate(0)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Copia de seguridad descargada. Guárdala en un lugar seguro.');
  } catch (error) {
    showToast(error.message || 'No se pudo descargar la copia de seguridad.');
  }
}

async function restoreSystemBackup(file) {
  if (!file) return;
  const { confirmed, value: confirmation } = await showConfirmationDialog({
    title: 'Restaurar copia de seguridad',
    message: 'La información clínica actual será reemplazada por la del archivo. Escribe RESTAURAR TODO para continuar.',
    confirmLabel: 'Restaurar copia',
    input: { type: 'text', value: '', label: 'Confirmación: RESTAURAR TODO', match: 'RESTAURAR TODO' }
  });
  if (!confirmed) return;

  try {
    const backup = JSON.parse(await file.text());
    await runSystemMaintenance('restore', { backup, confirmation });
    showToast('Copia restaurada. Actualizando el sistema…');
    window.setTimeout(() => window.location.reload(), 850);
  } catch (error) {
    showToast(error instanceof SyntaxError ? 'El archivo no contiene una copia válida.' : (error.message || 'No se pudo restaurar la copia.'));
  }
}

async function resetSystemData() {
  const { confirmed, value: confirmation } = await showConfirmationDialog({
    title: 'Restablecer datos clínicos',
    message: 'Esta acción elimina pacientes, citas, expedientes y cobros. No elimina usuarios. Escribe BORRAR TODO para continuar.',
    confirmLabel: 'Restablecer sistema',
    input: { type: 'text', value: '', label: 'Confirmación: BORRAR TODO', match: 'BORRAR TODO' }
  });
  if (!confirmed) return;

  try {
    await runSystemMaintenance('reset', {
      backup: { format: 'theradent-backup', version: 1 },
      confirmation
    });
    showToast('Datos clínicos restablecidos. Actualizando el sistema…');
    window.setTimeout(() => window.location.reload(), 850);
  } catch (error) {
    showToast(error.message || 'No se pudo restablecer el sistema.');
  }
}

document.addEventListener('click', event => {
  if (event.target.closest('#backup-download')) downloadSystemBackup();
  if (event.target.closest('#backup-restore-open')) document.querySelector('#backup-restore-file')?.click();
  if (event.target.closest('#backup-restore-confirm') && selectedSystemBackupFile) restoreSystemBackup(selectedSystemBackupFile);
  if (event.target.closest('#system-reset')) resetSystemData();
});

document.addEventListener('change', event => {
  if (!event.target.matches('#backup-restore-file')) return;
  const file = event.target.files?.[0];
  const selection = document.querySelector('#backup-restore-selection');
  const filename = document.querySelector('#backup-restore-filename');
  selectedSystemBackupFile = file || null;
  if (filename) filename.textContent = file ? file.name : '';
  if (selection) selection.hidden = !file;
  event.target.value = '';
});
