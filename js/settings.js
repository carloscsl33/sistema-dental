const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function applyClinicConfiguration(settings, hours, reasons, catalog) {
  if (settings) clinicSettings = { ...clinicSettings, ...settings };
  businessHours = hours || [];
  appointmentReasons = reasons || [];
  treatmentCatalog = catalog || [];
  MAX_PATIENTS_PER_SLOT = Number(clinicSettings.slot_capacity) || 3;
  document.querySelectorAll('[data-clinic-name]').forEach(node => { node.textContent = clinicSettings.clinic_name || 'Thera-dent'; });
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
  return `<div class="hours-row"><label class="hours-day-toggle"><input type="checkbox" data-hours-open="${day}" ${row.is_open ? 'checked' : ''}><span>${name}</span></label><input aria-label="Apertura ${name}" type="time" data-hours-open-at="${day}" value="${opens}" ${row.is_open ? '' : 'disabled'}><span class="hours-separator">a</span><input aria-label="Cierre ${name}" type="time" data-hours-close-at="${day}" value="${closes}" ${row.is_open ? '' : 'disabled'}></div>`;
}

function renderCatalogList(selector, rows, kind) {
  const host = document.querySelector(selector);
  if (!host) return;
  host.innerHTML = rows.length ? rows.map(row => `<li><span>${escapeHTML(row.name)}</span><button type="button" class="catalog-status-button ${row.is_active ? 'is-active' : 'is-inactive'}" data-toggle-catalog="${kind}" data-catalog-id="${row.id}" data-active="${row.is_active}">${row.is_active ? 'Activo' : 'Inactivo'}</button></li>`).join('') : '<li class="empty-state">Aún no hay opciones.</li>';
}

async function renderConfigurationModule() {
  const form = document.querySelector('#clinic-settings-form');
  if (!form || !hasRole('admin')) return;
  try { await loadClinicConfiguration(); } catch (error) { showToast('No se pudo cargar la configuración.'); return; }
  for (const key of ['clinic_name', 'responsible_name', 'phone', 'email', 'address', 'slot_minutes', 'slot_capacity']) form.elements[key].value = clinicSettings[key] ?? '';
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
    const values = Object.fromEntries(new FormData(form));
    const settings = { id: true, clinic_name: values.clinic_name.trim(), responsible_name: values.responsible_name.trim(), phone: values.phone.trim(), email: values.email.trim(), address: values.address.trim(), slot_minutes: Number(values.slot_minutes), slot_capacity: Number(values.slot_capacity) };
    try {
      const [settingsResult, hoursResult] = await Promise.all([supabaseClient.from('clinic_settings').upsert(settings), supabaseClient.from('business_hours').upsert(getConfigurationHours(form), { onConflict: 'day_of_week' })]);
      if (settingsResult.error || hoursResult.error) throw settingsResult.error || hoursResult.error;
      await loadClinicConfiguration();
      showToast('Configuración guardada. Se aplicará a citas nuevas o modificadas.');
    } catch (error) { showToast('No se pudo guardar la configuración.'); }
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

document.addEventListener('click', async event => {
  const toggle = event.target.closest('[data-toggle-catalog]');
  if (!toggle) return;
  const table = toggle.dataset.toggleCatalog === 'reason' ? 'appointment_reasons' : 'treatment_catalog';
  const { error } = await supabaseClient.from(table).update({ is_active: toggle.dataset.active !== 'true' }).eq('id', toggle.dataset.catalogId);
  if (error) return showToast('No se pudo actualizar la opción.');
  await renderConfigurationModule();
});
