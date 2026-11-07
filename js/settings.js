const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function clinicLogoFallback() {
  return (String(clinicSettings?.clinic_name || 'T').trim().charAt(0) || 'T').toUpperCase();
}

function setClinicLogo(node, url = '') {
  if (!node) return;
  node.classList.remove('has-logo');
  node.replaceChildren(document.createTextNode(clinicLogoFallback()));
  if (!url) return;
  const image = new Image();
  image.alt = '';
  image.decoding = 'async';
  image.onload = () => { node.classList.add('has-logo'); node.replaceChildren(image); };
  image.onerror = () => { node.classList.remove('has-logo'); node.replaceChildren(document.createTextNode(clinicLogoFallback())); };
  image.src = url;
}

function renderClinicLogoPreview(url = clinicLogoUrl) {
  const preview = document.querySelector('#clinic-logo-preview');
  const remove = document.querySelector('#clinic-logo-remove');
  if (preview) setClinicLogo(preview, url);
  if (remove) remove.hidden = !(url || selectedClinicLogoFile || clinicSettings?.logo_path);
}

function renderClinicBranding() {
  const clinicName = clinicSettings.clinic_name || 'Thera-dent';
  document.title = `${clinicName} | Gestión`;
  document.querySelectorAll('[data-clinic-name]').forEach(node => { node.textContent = clinicName; });
  document.querySelectorAll('[data-clinic-brand-icon]').forEach(node => setClinicLogo(node, clinicLogoUrl));
  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) favicon.href = clinicLogoUrl || `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2321a69b'/%3E%3Ctext x='16' y='23' font-size='20' text-anchor='middle' fill='white' font-family='sans-serif'%3E${encodeURIComponent(clinicLogoFallback())}%3C/text%3E%3C/svg%3E`;
  renderClinicLogoPreview();
}

async function refreshClinicLogo() {
  clinicLogoUrl = '';
  const path = String(clinicSettings?.logo_path || '').trim();
  if (path && isCloudConnected()) {
    const { data, error } = await supabaseClient.storage.from('clinic-assets').createSignedUrl(path, 60 * 60 * 12);
    if (!error && data?.signedUrl) clinicLogoUrl = data.signedUrl;
    else console.warn('No se pudo cargar el logo de la clínica.', error);
  }
  renderClinicBranding();
}

function applyClinicConfiguration(settings, hours, reasons, catalog) {
  if (settings) clinicSettings = { ...clinicSettings, ...settings };
  businessHours = hours || [];
  appointmentReasons = reasons || [];
  treatmentCatalog = catalog || [];
  MAX_PATIENTS_PER_SLOT = Number(clinicSettings.slot_capacity) || 3;
  refreshClinicLogo();
  populateAppointmentReasonOptions();
}

function populateAppointmentReasonOptions() {
  const select = document.querySelector('#modal-motive');
  if (!select) return;
  const selected = select.value;
  const names = appointmentReasons.filter(item => item.is_active).map(item => item.name);
  const fallback = ['Control de brackets', 'Endodoncia', 'Estética dental', 'Limpieza dental', 'Valoración', 'Dolor / urgencia', 'Extracción'];
  select.replaceChildren(new Option('Seleccionar motivo', ''), ...(names.length ? names : fallback).map(name => new Option(name, name)), new Option('Otro', 'Otro'));
  if (Array.from(select.options).some(option => option.value === selected)) select.value = selected;
}

function getTreatmentCatalogOptions() {
  const options = treatmentCatalog.filter(item => item.is_active).map(item => item.name);
  return options.length ? [...options, 'Otro...'] : CLINICAL_SERVICE_OPTIONS;
}

async function loadClinicConfiguration() {
  if (!isCloudConnected()) return;
  const [settings, hours, reasons, catalog] = await Promise.all([
    supabaseClient.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    supabaseClient.from('business_hours').select('*').order('day_of_week'),
    supabaseClient.from('appointment_reasons').select('*').order('sort_order'),
    supabaseClient.from('treatment_catalog').select('*').order('sort_order')
  ]);
  const error = [settings, hours, reasons, catalog].map(result => result.error).find(Boolean);
  if (error) throw error;
  applyClinicConfiguration(settings.data, hours.data, reasons.data, catalog.data);
}

function renderBusinessHoursRow(name, day) {
  const row = businessHours.find(item => Number(item.day_of_week) === day) || { is_open: true, opens_at: '09:00', closes_at: '19:00' };
  const opens = String(row.opens_at || '09:00').slice(0, 5);
  const closes = String(row.closes_at || '19:00').slice(0, 5);
  return `<div class="hours-row"><label class="hours-day-toggle"><input type="checkbox" data-hours-open="${day}" ${row.is_open ? 'checked' : ''}><span>${name}</span></label><label class="hours-time-field"><span>Apertura</span><input aria-label="Apertura ${name}" type="time" data-hours-open-at="${day}" value="${opens}" ${row.is_open ? '' : 'disabled'}></label><label class="hours-time-field"><span>Cierre</span><input aria-label="Cierre ${name}" type="time" data-hours-close-at="${day}" value="${closes}" ${row.is_open ? '' : 'disabled'}></label></div>`;
}

function renderCatalogList(selector, rows, kind) {
  const host = document.querySelector(selector);
  if (!host) return;
  host.innerHTML = rows.length ? rows.map(row => `<li><span>${escapeHTML(row.name)}</span><span class="catalog-row-actions"><button type="button" class="catalog-status-button ${row.is_active ? 'is-active' : 'is-inactive'}" data-toggle-catalog="${kind}" data-catalog-id="${row.id}" data-active="${row.is_active}">${row.is_active ? 'Activo' : 'Inactivo'}</button><button type="button" class="row-action delete-action catalog-delete-button" data-delete-catalog="${kind}" data-catalog-id="${row.id}" data-catalog-name="${escapeHTML(row.name)}">Eliminar</button></span></li>`).join('') : '<li class="empty-state">Aún no hay opciones.</li>';
}

async function renderConfigurationModule() {
  const form = document.querySelector('#clinic-settings-form');
  if (!form || !hasRole('admin')) return;
  try { await loadClinicConfiguration(); } catch (error) { showToast('No se pudo cargar la configuración.'); return; }
  for (const key of ['clinic_name', 'responsible_name', 'phone', 'email', 'address', 'slot_minutes', 'slot_capacity']) form.elements[key].value = clinicSettings[key] ?? '';
  renderClinicLogoPreview();
  document.querySelector('#business-hours-list').innerHTML = WEEKDAY_NAMES.map(renderBusinessHoursRow).join('');
  renderCatalogList('#appointment-reasons-list', appointmentReasons, 'reason');
  renderCatalogList('#treatment-catalog-list', treatmentCatalog, 'treatment');
}

function getConfigurationHours(form) {
  return WEEKDAY_NAMES.map((_, day) => ({ day_of_week: day, is_open: Boolean(form.querySelector(`[data-hours-open="${day}"]`)?.checked), opens_at: form.querySelector(`[data-hours-open-at="${day}"]`)?.value || null, closes_at: form.querySelector(`[data-hours-close-at="${day}"]`)?.value || null }));
}

document.addEventListener('submit', async event => {
  if (event.target.matches('#clinic-settings-form')) {
    event.preventDefault();
    const form = event.target;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const values = Object.fromEntries(new FormData(form));
    const previousLogoPath = String(clinicSettings.logo_path || '').trim();
    let logoPath = previousLogoPath || null;
    let uploadedLogoPath = '';
    try {
      if (selectedClinicLogoFile) {
        const extension = selectedClinicLogoFile.type === 'image/png' ? 'png' : selectedClinicLogoFile.type === 'image/webp' ? 'webp' : 'jpg';
        uploadedLogoPath = `clinic-logo-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabaseClient.storage.from('clinic-assets').upload(uploadedLogoPath, selectedClinicLogoFile, { contentType: selectedClinicLogoFile.type, upsert: false });
        if (uploadError) throw uploadError;
        logoPath = uploadedLogoPath;
      }
      const settings = { id: true, clinic_name: values.clinic_name.trim(), responsible_name: values.responsible_name.trim(), phone: values.phone.trim(), email: values.email.trim(), address: values.address.trim(), slot_minutes: Number(values.slot_minutes), slot_capacity: Number(values.slot_capacity), logo_path: logoPath, updated_by: currentAccess.id };
      const [settingsResult, hoursResult] = await Promise.all([supabaseClient.from('clinic_settings').upsert(settings), supabaseClient.from('business_hours').upsert(getConfigurationHours(form), { onConflict: 'day_of_week' })]);
      if (settingsResult.error || hoursResult.error) throw settingsResult.error || hoursResult.error;
      if (uploadedLogoPath && previousLogoPath && previousLogoPath !== uploadedLogoPath) await supabaseClient.storage.from('clinic-assets').remove([previousLogoPath]);
      selectedClinicLogoFile = null;
      const logoInput = document.querySelector('#clinic-logo-input');
      if (logoInput) logoInput.value = '';
      await loadClinicConfiguration();
      showToast('Configuración guardada. Se aplicará a citas nuevas o modificadas.');
    } catch (error) {
      if (uploadedLogoPath) await supabaseClient.storage.from('clinic-assets').remove([uploadedLogoPath]);
      console.error('No se pudo guardar la configuración.', error);
      showToast('No se pudo guardar la configuración.');
    }
  }
  const formKinds = { '#catalog-reason-form': ['reason', '#new-appointment-reason', 'appointment_reasons'], '#catalog-treatment-form': ['treatment', '#new-treatment-catalog', 'treatment_catalog'] };
  const entry = formKinds[`#${event.target.id}`];
  if (!entry) return;
  event.preventDefault();
  const [, inputSelector, table] = entry;
  const input = document.querySelector(inputSelector);
  const name = input?.value.trim();
  if (!name) return;
  const { error } = await supabaseClient.from(table).insert({ name, sort_order: 1000 });
  if (error) return showToast('No se pudo agregar la opción.');
  input.value = '';
  await renderConfigurationModule();
});

document.addEventListener('change', event => {
  const day = event.target.dataset.hoursOpen;
  if (day === undefined) return;
  document.querySelectorAll(`[data-hours-open-at="${day}"], [data-hours-close-at="${day}"]`).forEach(input => { input.disabled = !event.target.checked; });
});

document.addEventListener('input', event => {
  if (event.target.matches('#clinic-settings-form input[name="phone"]')) {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 10);
  }
});

document.addEventListener('change', event => {
  if (event.target.id !== 'clinic-logo-input') return;
  const file = event.target.files?.[0];
  if (!file) return;
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type) || file.size > 1048576) {
    event.target.value = '';
    selectedClinicLogoFile = null;
    renderClinicLogoPreview();
    showToast('El logo debe ser PNG, JPG o WebP y pesar máximo 1 MB.');
    return;
  }
  selectedClinicLogoFile = file;
  renderClinicLogoPreview(URL.createObjectURL(file));
});

document.addEventListener('click', async event => {
  if (event.target.closest('#clinic-logo-remove')) {
    const previousLogoPath = String(clinicSettings.logo_path || '').trim();
    if (!previousLogoPath && !selectedClinicLogoFile) return;
    const { confirmed } = await showConfirmationDialog({ title: 'Quitar logo', message: 'El sistema volverá a mostrar la inicial de la clínica.', confirmLabel: 'Quitar' });
    if (!confirmed) return;
    selectedClinicLogoFile = null;
    const logoInput = document.querySelector('#clinic-logo-input');
    if (logoInput) logoInput.value = '';
    if (!previousLogoPath) { renderClinicLogoPreview(); return; }
    const { error } = await supabaseClient.from('clinic_settings').update({ logo_path: null, updated_by: currentAccess.id }).eq('id', true);
    if (error) return showToast('No se pudo quitar el logo.');
    await supabaseClient.storage.from('clinic-assets').remove([previousLogoPath]);
    await loadClinicConfiguration();
    showToast('Logo eliminado.');
    return;
  }
  const toggle = event.target.closest('[data-toggle-catalog]');
  if (toggle) {
    const table = toggle.dataset.toggleCatalog === 'reason' ? 'appointment_reasons' : 'treatment_catalog';
    const { error } = await supabaseClient.from(table).update({ is_active: toggle.dataset.active !== 'true' }).eq('id', toggle.dataset.catalogId);
    if (error) return showToast('No se pudo actualizar la opción.');
    await renderConfigurationModule();
    return;
  }
  const remove = event.target.closest('[data-delete-catalog]');
  if (!remove) return;
  const label = remove.dataset.deleteCatalog === 'reason' ? 'motivo' : 'tratamiento';
  const { confirmed } = await showConfirmationDialog({ title: `¿Eliminar ${label}?`, message: `Se eliminará “${remove.dataset.catalogName}”. Las citas y expedientes ya registrados conservarán su historial.`, confirmLabel: 'Eliminar' });
  if (!confirmed) return;
  const table = remove.dataset.deleteCatalog === 'reason' ? 'appointment_reasons' : 'treatment_catalog';
  const { error } = await supabaseClient.from(table).delete().eq('id', remove.dataset.catalogId);
  if (error) return showToast('No se pudo eliminar la opción.');
  await renderConfigurationModule();
  showToast(`${label[0].toUpperCase() + label.slice(1)} eliminado.`);
});
