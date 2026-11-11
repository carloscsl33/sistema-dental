async function loadClinicalProgress(patientId) {
  if (!isCloudConnected() || !canRecordClinicalProgress()) {
    throw new Error('clinical_progress_access_denied');
  }
  const { data, error } = await supabaseClient
    .from('clinical_progress')
    .select('id,patient_id,body,progress_on,created_at,updated_at,author_name')
    .eq('patient_id', patientId)
    .order('progress_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createClinicalProgress(patientId, body) {
  if (!isCloudConnected() || !canRecordClinicalProgress()) {
    throw new Error('clinical_progress_access_denied');
  }
  const text = String(body || '').trim();
  if (!text || text.length > 3000) throw new Error('clinical_progress_invalid_body');
  const { error } = await supabaseClient.from('clinical_progress').insert({
    patient_id: patientId,
    body: text
  });
  if (error) throw error;
}

async function updateClinicalProgress(patientId, progressId, body) {
  if (!isCloudConnected() || !canRecordClinicalProgress()) {
    throw new Error('clinical_progress_access_denied');
  }
  const text = String(body || '').trim();
  if (!text || text.length > 3000) throw new Error('clinical_progress_invalid_body');
  const { data, error } = await supabaseClient.from('clinical_progress')
    .update({ body: text }).eq('id', progressId).eq('patient_id', patientId)
    .select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('clinical_progress_not_found');
}

async function deleteClinicalProgress(patientId, progressId) {
  if (!isCloudConnected() || !canRecordClinicalProgress()) {
    throw new Error('clinical_progress_access_denied');
  }
  const { data, error } = await supabaseClient.from('clinical_progress')
    .delete().eq('id', progressId).eq('patient_id', patientId)
    .select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('clinical_progress_not_found');
}

let clinicalProgressItems = [];
let clinicalProgressPatientId = null;

async function refreshClinicalProgress() {
  const host = document.querySelector('[data-progress-list]');
  const patientId = selectedPatientId;
  if (!host || !patientId) return;
  if (!canRecordClinicalProgress()) {
    host.textContent = 'Tu rol no tiene acceso a los avances clínicos.';
    return;
  }
  host.textContent = 'Cargando avances…';
  try {
    const items = await loadClinicalProgress(patientId);
    if (selectedPatientId !== patientId || !host.isConnected) return;
    clinicalProgressItems = items;
    clinicalProgressPatientId = patientId;
    host.innerHTML = items.length ? items.map(item => {
      const date = item.progress_on || String(item.created_at || '').slice(0, 10);
      const preview = item.body.slice(0, 145);
      return `<details class="clinical-progress-card"><summary><span class="clinical-progress-date"><span class="clinical-progress-icon" aria-hidden="true">▣</span><span><strong>${escapeHTML(formatDisplayDate(date))}</strong><small>${escapeHTML(item.author_name || 'Usuario')}</small></span></span><span class="clinical-progress-summary"><strong>Evolución clínica</strong><span>${escapeHTML(preview)}${item.body.length > preview.length ? '…' : ''}</span></span><span class="clinical-progress-toggle">Ver completo <span aria-hidden="true">›</span></span></summary><div class="clinical-progress-content"><section><h3>Nota clínica</h3><p>${escapeHTML(item.body)}</p></section><div class="clinical-progress-actions"><button type="button" class="patient-info-button" data-progress-edit="${escapeHTML(item.id)}">Editar</button><button type="button" class="patient-info-button delete-action" data-progress-delete="${escapeHTML(item.id)}">Eliminar</button></div></div></details>`;
    }).join('') : '<p class="empty-history">Aún no hay avances registrados.</p>';
  } catch (error) {
    console.error('No se pudieron cargar los avances:', error);
    host.textContent = 'No se pudieron cargar los avances. Inténtalo de nuevo.';
  }
}

function openClinicalProgressEditor(item = null) {
  const modal = document.querySelector('#clinical-progress-modal');
  const form = document.querySelector('#clinical-progress-form');
  const input = document.querySelector('#clinical-progress-text');
  if (!modal || !form || !input || !selectedPatientId || !canRecordClinicalProgress()) return;
  form.dataset.progressPatientId = selectedPatientId;
  form.dataset.progressId = item?.id || '';
  document.querySelector('#clinical-progress-title').textContent = item ? 'Editar avance' : 'Registrar avance';
  document.querySelector('#clinical-progress-patient').textContent = getPatientFullName(findPatientById(selectedPatientId));
  input.placeholder = 'Describe el avance, procedimiento u observación...';
  input.value = item?.body || '';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
  input.focus();
}

function closeClinicalProgressModal() {
  const modal = document.querySelector('#clinical-progress-modal');
  const form = document.querySelector('#clinical-progress-form');
  if (!modal) return;
  if (modal.contains(document.activeElement)) document.activeElement.blur();
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  form?.reset();
  if (form) {
    delete form.dataset.progressPatientId;
    delete form.dataset.progressId;
  }
  updatePageScrollLock();
}

document.addEventListener('click', async event => {
  if (event.target.closest('[data-patient-tab="evolucion"]')) {
    await refreshClinicalProgress();
  } else if (event.target.closest('[data-progress-create]')) {
    openClinicalProgressEditor();
  } else if (event.target.closest('[data-progress-edit]')) {
    const item = clinicalProgressItems.find(row => row.id === event.target.closest('[data-progress-edit]').dataset.progressEdit);
    if (item && clinicalProgressPatientId === selectedPatientId) openClinicalProgressEditor(item);
  } else if (event.target.closest('[data-progress-delete]')) {
    const progressId = event.target.closest('[data-progress-delete]').dataset.progressDelete;
    const patientId = selectedPatientId;
    const { confirmed } = await showConfirmationDialog({ title: '¿Eliminar este avance?', message: 'El avance se eliminará del expediente. Esta acción no se puede deshacer.', confirmLabel: 'Eliminar avance' });
    if (!confirmed) return;
    try {
      await deleteClinicalProgress(patientId, progressId);
      if (selectedPatientId === patientId) await refreshClinicalProgress();
      showToast('Avance eliminado.');
    } catch (error) {
      console.error('No se pudo eliminar el avance:', error);
      showToast('No se pudo eliminar el avance.');
    }
  }
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('#clinical-progress-form') || !form.dataset.progressPatientId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const patientId = form.dataset.progressPatientId;
  const progressId = form.dataset.progressId;
  const body = document.querySelector('#clinical-progress-text').value;
  const button = document.querySelector('#clinical-progress-save');
  button.disabled = true;
  try {
    if (progressId) await updateClinicalProgress(patientId, progressId, body);
    else await createClinicalProgress(patientId, body);
    delete form.dataset.progressPatientId;
    delete form.dataset.progressId;
    closeClinicalProgressModal();
    if (selectedPatientId === patientId) await refreshClinicalProgress();
    showToast(progressId ? 'Avance actualizado.' : 'Avance registrado.');
  } catch (error) {
    console.error('No se pudo guardar el avance:', error);
    showToast('No se pudo guardar el avance. Revisa la conexión y el contenido.');
  } finally {
    button.disabled = false;
  }
}, true);
