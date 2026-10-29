// Configuración de la clínica y resumen financiero. Las escrituras quedan protegidas por RLS.

const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function applyClinicConfiguration(settings, hours, closures, reasons, catalog) {
  if (settings) clinicSettings = settings;
  businessHours = hours;
  clinicClosures = closures;
  appointmentReasons = reasons;
  treatmentCatalog = catalog;
  MAX_PATIENTS_PER_SLOT = Number(clinicSettings.slot_capacity) || 3;
  document.querySelectorAll('[data-clinic-name]').forEach(node => { node.textContent = clinicSettings.clinic_name || 'Thera-dent'; });
  document.title = `${clinicSettings.clinic_name || 'Thera-dent'} | Gestión`;
  populateAppointmentReasonOptions();
}

function populateAppointmentReasonOptions() {
  const select = document.querySelector('#modal-motive');
  if (!select) return;
  const selected = select.value;
  const reasons = appointmentReasons.filter(item => item.is_active).map(item => item.name);
  const fallback = ['Control de brackets', 'Endodoncia', 'Estética dental', 'Limpieza dental', 'Valoración', 'Dolor / urgencia', 'Extracción'];
  const names = reasons.length ? reasons : fallback;
  select.replaceChildren(new Option('Seleccionar motivo', ''), ...names.map(name => new Option(name, name)), new Option('Otro', 'Otro'));
  if (Array.from(select.options).some(option => option.value === selected)) select.value = selected;
}

function getTreatmentCatalogOptions() {
  const options = treatmentCatalog.filter(item => item.is_active).map(item => item.name);
  return options.length ? [...options, 'Otro...'] : CLINICAL_SERVICE_OPTIONS;
}

function renderConfigurationModule() {
  const form = document.querySelector('#clinic-settings-form');
  if (!form) return;
  form.elements.clinic_name.value = clinicSettings.clinic_name || '';
  form.elements.responsible_name.value = clinicSettings.responsible_name || '';
  form.elements.phone.value = clinicSettings.phone || '';
  form.elements.email.value = clinicSettings.email || '';
  form.elements.address.value = clinicSettings.address || '';
  form.elements.slot_minutes.value = String(clinicSettings.slot_minutes || 30);
  form.elements.slot_capacity.value = String(clinicSettings.slot_capacity || 3);
  const hoursHost = document.querySelector('#business-hours-list');
  if (hoursHost) hoursHost.innerHTML = WEEKDAY_NAMES.map((name, day) => {
    const row = businessHours.find(item => Number(item.day_of_week) === day) || { day_of_week: day, is_open: true, opens_at: '09:00', closes_at: '19:00' };
    return `<div class="hours-row"><label class="hours-day-toggle"><input type="checkbox" data-hours-open="${day}" ${row.is_open ? 'checked' : ''}><span>${name}</span></label><label class="hours-time-field"><span class="sr-only">Apertura ${name}</span><input aria-label="Apertura ${name}" type="time" data-hours-open-at="${day}" value="${String(row.opens_at || '09:00').slice(0, 5)}" ${row.is_open ? '' : 'disabled'}></label><span class="hours-separator" aria-hidden="true">a</span><label class="hours-time-field"><span class="sr-only">Cierre ${name}</span><input aria-label="Cierre ${name}" type="time" data-hours-close-at="${day}" value="${String(row.closes_at || '19:00').slice(0, 5)}" ${row.is_open ? '' : 'disabled'}></label></div>`;
  }).join('');
  renderCatalogList('#appointment-reasons-list', appointmentReasons, 'reason');
  renderCatalogList('#treatment-catalog-list', treatmentCatalog, 'treatment');
}

function renderCatalogList(selector, rows, kind) {
  const host = document.querySelector(selector);
  if (!host) return;
  host.innerHTML = rows.length ? rows.map(row => `<li><span>${escapeHTML(row.name)}</span><button type="button" class="catalog-status-button ${row.is_active ? 'is-active' : 'is-inactive'}" data-toggle-catalog="${kind}" data-catalog-id="${row.id}" data-active="${row.is_active}" title="${row.is_active ? 'Desactivar' : 'Activar'}">${row.is_active ? 'Activo' : 'Inactivo'}</button></li>`).join('') : '<li class="empty-state">Aún no hay opciones.</li>';
}

async function saveClinicConfiguration(event) {
  event.preventDefault();
  if (!isCloudConnected()) return showToast('Inicia sesión para guardar la configuración.');
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const future = getAppointments().filter(({ appointment }) => appointment.date >= getISODate(0) && appointment.status !== 'Cancelada');
  const proposedCapacity = Number(values.slot_capacity);
  if (future.some(({ appointment }) => getAppointmentTimeSlotCount(appointment.date, toInputTime(appointment.time)) > proposedCapacity)) {
    return showToast('No se guardó: la nueva capacidad deja una cita futura sin lugar. Ajusta primero esas citas.');
  }
  const settings = { id: true, clinic_name: values.clinic_name.trim(), responsible_name: values.responsible_name.trim(), phone: values.phone.trim(), email: values.email.trim(), address: values.address.trim(), slot_minutes: Number(values.slot_minutes), slot_capacity: proposedCapacity, updated_by: currentAccess?.profile?.id || null };
  const hours = WEEKDAY_NAMES.map((_, day) => ({ day_of_week: day, is_open: Boolean(form.querySelector(`[data-hours-open="${day}"]`)?.checked), opens_at: form.querySelector(`[data-hours-open-at="${day}"]`)?.value || null, closes_at: form.querySelector(`[data-hours-close-at="${day}"]`)?.value || null }));
  const [settingsResult, hoursResult] = await Promise.all([
    supabaseClient.from('clinic_settings').upsert(settings),
    supabaseClient.from('business_hours').upsert(hours, { onConflict: 'day_of_week' })
  ]);
  if (settingsResult.error || hoursResult.error) throw settingsResult.error || hoursResult.error;
  await connectToCloud();
  showToast('Configuración guardada. Se aplicará a citas nuevas o modificadas.');
}

async function addCatalogItem(kind) {
  const input = document.querySelector(kind === 'reason' ? '#new-appointment-reason' : '#new-treatment-catalog');
  const name = input?.value.trim();
  if (!name) return;
  const table = kind === 'reason' ? 'appointment_reasons' : 'treatment_catalog';
  const { error } = await supabaseClient.from(table).insert({ name, sort_order: 1000 });
  if (error) throw error;
  input.value = '';
  await connectToCloud();
}

function financeData() {
  const allAppointments = getAppointments().map(item => item.appointment);
  const allPayments = patients.flatMap(patient => (patient.historialFinanciero || []).map(payment => ({ ...payment, patient })));
  const today = getISODate(0);
  const currentMonth = today.slice(0, 7);
  const pending = allAppointments.filter(item => item.status !== 'Cancelada').reduce((sum, item) => sum + getNumericAmount(item.balance), 0);
  const debtors = patients.map(patient => ({ patient, appointments: getPatientPendingAppointments(patient) })).filter(item => item.appointments.length);
  return { allPayments, todayIncome: allPayments.filter(item => item.fecha === today).reduce((sum, item) => sum + getNumericAmount(item.monto), 0), monthIncome: allPayments.filter(item => String(item.fecha).slice(0, 7) === currentMonth).reduce((sum, item) => sum + getNumericAmount(item.monto), 0), pending, debtors };
}

function renderFinanceModule() {
  const root = document.querySelector('#finance-dashboard');
  if (!root) return;
  const data = financeData();
  const months = Array.from({ length: 6 }, (_, offset) => { const date = new Date(); date.setMonth(date.getMonth() - (5 - offset), 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; });
  const totals = months.map(month => data.allPayments.filter(item => String(item.fecha).slice(0, 7) === month).reduce((sum, item) => sum + getNumericAmount(item.monto), 0));
  const max = Math.max(...totals, 1);
  root.innerHTML = `<div class="finance-kpis"><article><small>Ingresos de hoy</small><strong>${formatCurrency(data.todayIncome)}</strong></article><article><small>Ingresos del mes</small><strong>${formatCurrency(data.monthIncome)}</strong></article><article><small>Saldo pendiente</small><strong>${formatCurrency(data.pending)}</strong></article><article><small>Pacientes con saldo</small><strong>${data.debtors.length}</strong></article></div><section class="card finance-chart-card"><header class="card-head"><div><h2>Ingresos por mes</h2><p>Pagos efectivamente registrados; no incluye gastos.</p></div></header><div class="finance-bars">${months.map((month, index) => `<div><span style="height:${Math.max(8, Math.round((totals[index] / max) * 140))}px" title="${formatCurrency(totals[index])}"></span><small>${MONTH_NAMES[Number(month.slice(5)) - 1].slice(0, 3)}</small></div>`).join('')}</div></section><section class="card"><header class="card-head"><div><h2>Saldos pendientes</h2><p>Los pagos son permanentes. Para una corrección se registra un ajuste, nunca se borra el recibo.</p></div></header><div class="finance-debt-list">${data.debtors.length ? data.debtors.map(({ patient, appointments }) => `<article><div><strong>${escapeHTML(getPatientFullName(patient))}</strong><small>${escapeHTML(patient.telefono || 'Sin teléfono')} · Desde ${formatDisplayDate(appointments[0].date)}</small></div><strong>${formatCurrency(appointments.reduce((sum, item) => sum + getNumericAmount(item.balance), 0))}</strong><button type="button" class="outline-button" data-collect-payment="${appointments[0].id}">Cobrar</button></article>`).join('') : '<p class="empty-state">No hay saldos pendientes.</p>'}</div></section>`;
}

document.addEventListener('submit', event => {
  if (event.target.matches('#clinic-settings-form')) saveClinicConfiguration(event).catch(error => { console.error(error); showToast('No se pudo guardar la configuración.'); });
  if (event.target.matches('#catalog-reason-form')) { event.preventDefault(); addCatalogItem('reason').catch(() => showToast('No se pudo agregar el motivo.')); }
  if (event.target.matches('#catalog-treatment-form')) { event.preventDefault(); addCatalogItem('treatment').catch(() => showToast('No se pudo agregar el tratamiento.')); }
});

document.addEventListener('change', event => {
  const day = event.target.dataset.hoursOpen;
  if (day !== undefined) document.querySelectorAll(`[data-hours-open-at="${day}"], [data-hours-close-at="${day}"]`).forEach(input => { input.disabled = !event.target.checked; });
});

document.addEventListener('click', event => {
  const toggle = event.target.closest('[data-toggle-catalog]');
  if (toggle) {
    const table = toggle.dataset.toggleCatalog === 'reason' ? 'appointment_reasons' : 'treatment_catalog';
    supabaseClient.from(table).update({ is_active: toggle.dataset.active !== 'true' }).eq('id', toggle.dataset.catalogId).then(({ error }) => { if (error) throw error; return connectToCloud(); }).catch(() => showToast('No se pudo actualizar la opción.'));
  }
  const collect = event.target.closest('[data-collect-payment]');
  if (collect) openPaymentReceipt(collect.dataset.collectPayment);
});
