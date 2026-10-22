// Pacientes y expedientes

function setGlobalSearchQuery(query) {
  globalSearchQuery = normalizeSearchText(query);
}

function getSearchableAppointmentText(appointment) {
  if (!appointment) return '';
  const { time, name, reason: treatment, balance, date, status } = appointment;
  const patient = resolveAppointmentPatient(appointment);
  return normalizeSearchText([
    patient ? getPatientFullName(patient) : name,
    name,
    treatment,
    status,
    balance,
    time,
    date
  ].filter(Boolean).join(' '));
}

function appointmentMatchesSearch(appointment) {
  return !globalSearchQuery || getSearchableAppointmentText(appointment).includes(globalSearchQuery);
}

function getSearchablePatientText(patient) {
  if (!patient) return '';
  const aptText = getPatientAppointments(patient)
    .map(a => [a.name, a.reason, a.status].filter(Boolean).join(' '))
    .join(' ');
    
  return normalizeSearchText([
    getPatientFullName(patient),
    patient.telefono,
    patient.correo,
    patient.tratamientoActual,
    patient.diagnostico,
    patient.antecedentesMedicos,
    patient.alergias,
    patient.medicamentos,
    patient.observacionesMedicas,
    aptText
  ].filter(Boolean).join(' '));
}

function patientMatchesSearch(patient) {
  return !globalSearchQuery || getSearchablePatientText(patient).includes(globalSearchQuery);
}

function renderGlobalPatientSearch(query) {
  const results = document.querySelector('#patient-search-results');
  const input = document.querySelector('#patient-search');
  if (!results || !input) return;

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    results.innerHTML = '';
    results.classList.remove('open');
    results.setAttribute('aria-hidden', 'true');
    input.setAttribute('aria-expanded', 'false');
    return;
  }

  const matches = patients
    .filter(patient => getSearchablePatientText(patient).includes(normalizedQuery))
    .sort((a, b) => getPatientFullName(a).localeCompare(getPatientFullName(b), 'es-MX', { sensitivity: 'base' }))
    .slice(0, 8);

  results.innerHTML = matches.length
    ? matches.map(patient => `
      <button type="button" class="patient-search-result" role="option" aria-selected="false" data-global-patient-id="${escapeHTML(patient.id)}">
        <span class="patient-search-result-avatar">${escapeHTML(getInitials(getPatientFullName(patient)))}</span>
        <span class="patient-search-result-copy">
          <strong>${escapeHTML(getPatientFullName(patient))}</strong>
          <small>${escapeHTML(patient.telefono || 'Paciente registrado')}</small>
        </span>
        <span class="patient-search-result-action" aria-hidden="true">›</span>
      </button>
    `).join('')
    : '<p class="patient-search-empty">No se encontraron pacientes.</p>';
  results.classList.add('open');
  results.setAttribute('aria-hidden', 'false');
  input.setAttribute('aria-expanded', 'true');
}

function getAppointmentPatientElements() {
  return {
    input: document.querySelector('#modal-patient'),
    hiddenId: document.querySelector('#modal-patient-id'),
    suggestions: document.querySelector('#modal-patient-suggestions'),
    help: document.querySelector('#modal-patient-help')
  };
}

function clearAppointmentPatientSelection(clearInput = false) {
  selectedPatientId = null;
  const { input, hiddenId } = getAppointmentPatientElements();
  
  if (hiddenId) hiddenId.value = '';
  if (clearInput && input) input.value = '';
  if (input) input.removeAttribute('data-patient-selected');
}

function hidePatientSuggestions() {
  const { suggestions, input } = getAppointmentPatientElements();
  if (!suggestions) return;
  
  suggestions.innerHTML = '';
  suggestions.classList.remove('open');
  if (input) input.setAttribute('aria-expanded', 'false');
}

function getFilteredAppointmentPatients(query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  
  return patients.filter(p => normalizeSearchText(getPatientFullName(p)).includes(normalizedQuery))
                 .sort((a, b) => getPatientFullName(a).localeCompare(getPatientFullName(b), 'es-MX', { sensitivity: 'base' }));
}

function renderPatientSuggestions(query) {
  const { input, suggestions } = getAppointmentPatientElements();
  if (!input || !suggestions) return;
  
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    hidePatientSuggestions();
    return;
  }
  
  const matches = getFilteredAppointmentPatients(trimmedQuery);
  
  if (!matches.length) {
    suggestions.innerHTML = `<div class="patient-suggestion-empty">No se encontraron pacientes registrados.</div>`;
    suggestions.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    return;
  }
  
  suggestions.innerHTML = matches.map(patient => {
    const fullName = getPatientFullName(patient);
    return `
      <button type="button" class="patient-suggestion" role="option" aria-selected="false" data-appointment-patient-id="${escapeHTML(patient.id)}">
        <span class="patient-suggestion-avatar">${escapeHTML(getInitials(fullName))}</span>
        <span class="patient-suggestion-copy">
          <strong>${escapeHTML(fullName)}</strong>
          ${patient.telefono ? `<small>${escapeHTML(patient.telefono)}</small>` : ''}
        </span>
      </button>
    `;
  }).join('');
  
  suggestions.classList.add('open');
  input.setAttribute('aria-expanded', 'true');
}

function selectAppointmentPatient(patientId) {
  const patient = findPatientById(patientId);
  const { input, hiddenId, suggestions } = getAppointmentPatientElements();
  
  if (!patient) {
    clearAppointmentPatientSelection(false);
    if (input) input.value = '';
    hidePatientSuggestions();
    showToast('El paciente seleccionado ya no existe.');
    return false;
  }
  selectedPatientId = patient.id;
  
  if (input) {
    input.value = getPatientFullName(patient);
    input.setAttribute('data-patient-selected', 'true');
  }
  
  if (hiddenId) hiddenId.value = patient.id;
  
  if (suggestions) {
    suggestions.innerHTML = '';
    suggestions.classList.remove('open');
  }
  
  if (input) input.setAttribute('aria-expanded', 'false');
  return true;
}

function initializeAppointmentPatientSearch() {
  const { input, suggestions } = getAppointmentPatientElements();
  if (!input) return;
  
  input.addEventListener('input', () => {
    clearAppointmentPatientSelection(false);
    renderPatientSuggestions(input.value);
  });
  
  input.addEventListener('focus', () => {
    if (!input.readOnly && input.value.trim()) {
      renderPatientSuggestions(input.value);
    }
  });
  
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') hidePatientSuggestions();
  });
  
  if (suggestions) {
    suggestions.addEventListener('mousedown', e => {
      const btn = e.target.closest('[data-appointment-patient-id]');
      if (btn) {
        e.preventDefault();
        selectAppointmentPatient(btn.dataset.appointmentPatientId);
      }
    });
  }
}

function validateSelectedAppointmentPatient() {
  const { input, hiddenId } = getAppointmentPatientElements();
  const typedName = input?.value.trim() || '';
  
  if (!typedName) {
    if (hiddenId) hiddenId.value = '';
    selectedPatientId = null;
    showToast('Ingresa el nombre del paciente.');
    return null;
  }
  
  const patientId = hiddenId?.value || selectedPatientId || '';
  
  if (patientId) {
    const patient = findPatientById(patientId);
    if (patient && normalizeSearchText(typedName) === normalizeSearchText(getPatientFullName(patient))) {
      selectedPatientId = patient.id;
      if (hiddenId) hiddenId.value = patient.id;
      return patient;
    }
    
    if (hiddenId) hiddenId.value = '';
    selectedPatientId = null;
  }
  
  const sameName = patients.filter(p => normalizeName(getPatientFullName(p)) === normalizeName(typedName));
  if (sameName.length === 1) {
    selectedPatientId = sameName[0].id;
    if (hiddenId) hiddenId.value = sameName[0].id;
    return sameName[0];
  }

  showToast(sameName.length > 1
    ? 'Hay varios pacientes con ese nombre; elige uno de la lista.'
    : 'Selecciona un paciente registrado o primero crea su expediente.');
  return null;
}

function sortPatientAppointments(appointments) {
  const today = getISODate(0);
  const bySoonest = (a, b) => a.date.localeCompare(b.date) || toMinutes(a.time) - toMinutes(b.time);
  const todayAppointments = appointments
    .filter(appointment => appointment.date === today)
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  const upcomingAppointments = appointments
    .filter(appointment => appointment.date > today)
    .sort(bySoonest);
  const pastAppointments = appointments
    .filter(appointment => appointment.date < today)
    .sort((a, b) => b.date.localeCompare(a.date) || toMinutes(b.time) - toMinutes(a.time));

  return [...todayAppointments, ...upcomingAppointments, ...pastAppointments];
}

function renderPatientAppointmentRows(appointments) {
  return appointments.map(appointment => {
    const isToday = appointment.date === getISODate(0);
    const hasObservation = Array.isArray(appointment.observations) && appointment.observations.length > 0;
    const canAddObservation = appointment.date === getISODate(0) && appointment.status !== 'Cancelada';
    return `<div class="patient-appointment-entry ${isToday ? 'is-today-appointment' : ''}">
      <span>
        <strong>${escapeHTML(appointment.reason)}${isToday ? ' <span class="today-appointment-badge">HOY</span>' : ''}</strong>
        <small>${formatDisplayDate(appointment.date)} · ${escapeHTML(appointment.time)} · ${escapeHTML(appointment.status || 'En espera')}</small>
        ${hasObservation ? '<small class="appointment-observation-count">Avance registrado</small>' : ''}
      </span>
      <div class="patient-appointment-actions">
        ${hasObservation
          ? `<button type="button" class="patient-info-button" data-appointment-notes="${escapeHTML(appointment.id)}">Ver avance</button>`
          : canAddObservation
            ? `<button type="button" class="patient-info-button" data-appointment-notes="${escapeHTML(appointment.id)}">Agregar avance</button>`
            : ''}
      </div>
    </div>`;
  }).join('');
}

function renderPatientAppointmentsModal(patientId) {
  const patient = findPatientById(patientId);
  const modal = document.querySelector('#patient-appointments-modal');
  const title = document.querySelector('#patient-appointments-title');
  const list = document.querySelector('#patient-appointments-list');
  if (!patient || !modal || !title || !list) return;

  title.textContent = `Todas las citas · ${getPatientFullName(patient)}`;
  const appointments = sortPatientAppointments(getPatientAppointments(patient));
  list.innerHTML = appointments.length
    ? renderPatientAppointmentRows(appointments)
    : '<p class="empty-history">No hay citas registradas.</p>';
}

function openPatientAppointments(patientId) {
  renderPatientAppointmentsModal(patientId);
  const modal = document.querySelector('#patient-appointments-modal');
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
}

function closePatientAppointments() {
  const modal = document.querySelector('#patient-appointments-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  updatePageScrollLock();
}

function renderPatientDirectory(query = '') {
  const container = document.querySelector('#patient-list');
  if (!container) return;
  
  const normalizedQuery = normalizeSearchText(query || globalSearchQuery);
  const directoryMap = new Map();
  
  patients.forEach(patient => {
    directoryMap.set(patient.id, { patient, name: getPatientFullName(patient), appointments: [] });
  });
  
  getAppointments().forEach(({ appointment }) => {
    ensureAppointmentId(appointment);
    const patient = resolveAppointmentPatient(appointment);
    const { time, name, reason, balance, date } = appointment;
    const apptData = { time, reason, balance: balance || '$0', date };
    
    if (patient && directoryMap.has(patient.id)) {
      directoryMap.get(patient.id).appointments.push(apptData);
      return;
    }
    
    const tempKey = `appointment_${normalizeName(name)}`;
    if (!directoryMap.has(tempKey)) {
      directoryMap.set(tempKey, { patient: null, name, appointments: [] });
    }
    directoryMap.get(tempKey).appointments.push(apptData);
  });
  
  const filteredPatients = Array.from(directoryMap.values()).filter(item => {
    if (!normalizedQuery) return true;
    if (item.patient) return getSearchablePatientText(item.patient).includes(normalizedQuery);
    
    const apptText = item.appointments.map(a => [a.reason, a.time, a.date, a.balance].filter(Boolean).join(' ')).join(' ');
    return normalizeSearchText(`${item.name} ${apptText}`).includes(normalizedQuery);
  });
  
  container.innerHTML = filteredPatients.length ? filteredPatients.map(item => `
    <button class="patient-list-item" data-select-patient="${escapeHTML(item.patient ? 'id:' + item.patient.id : 'name:' + item.name)}">
      <span class="patient-list-avatar">${escapeHTML(getInitials(item.name))}</span>
      <span class="patient-list-copy">
        <strong>${escapeHTML(item.name)}</strong>
        <small>${item.appointments.length} ${item.appointments.length === 1 ? 'cita' : 'citas'}</small>
      </span>
      <span class="patient-list-arrow" aria-hidden="true">›</span>
    </button>
  `).join('') : `<p class="empty-state">No se encontraron pacientes.</p>`;
}

function renderPatientHistory(patient) {
  if (!patient.historialClinico || !patient.historialClinico.length) {
    return `<p class="empty-history">No hay registros clínicos todavía.</p>`;
  }
  
  return patient.historialClinico.map((record, index) => ({ record, index })).reverse().map(({ record, index }) => `
    <article class="patient-history-entry">
      <div class="patient-history-entry-heading">
        <div class="patient-history-title-row">
          <strong>${escapeHTML(record.tratamiento || 'Registro clínico')}</strong>
          <small class="patient-history-date"><strong>Fecha:</strong> ${formatDisplayDate(record.fecha)}</small>
        </div>
        ${patient.id ? `<button type="button" class="row-action delete-action clinical-service-record-remove" data-remove-patient-service="${escapeHTML(patient.id)}" data-clinical-record-index="${index}">Quitar</button>` : ''}
      </div>
      ${record.diagnostico ? `<p><strong>Diagnóstico:</strong> ${escapeHTML(record.diagnostico)}</p>` : ''}
    </article>
  `).join('');
}

function renderPatientFiles(patient) {
  if (!patient.archivosClinicos || !patient.archivosClinicos.length) {
    return `<p class="empty-history">No hay archivos adjuntos.</p>`;
  }
  
  return patient.archivosClinicos.map(file => `
    <div class="patient-file-item">
      <span class="clinical-file-name">${escapeHTML(file.name)}</span>
      <button type="button" class="outline-button clinical-file-view" data-view-clinical-file="${escapeHTML(file.id || '')}" data-file-name="${escapeHTML(file.name)}">Ver</button>
      <small>${escapeHTML(file.type || 'Archivo')} · ${formatFileSize(file.size)}</small>
    </div>
  `).join('');
}

async function removePatientClinicalService(patientId, recordIndex) {
  const patient = findPatientById(patientId);
  if (!patient || !Array.isArray(patient.historialClinico) || !Number.isInteger(recordIndex)) {
    showToast('No se encontró el servicio seleccionado.');
    return;
  }
  const record = patient.historialClinico[recordIndex];
  if (!record) {
    showToast('El servicio seleccionado ya no existe.');
    return;
  }
  const { confirmed } = await showConfirmationDialog({
    title: '¿Quitar servicio?',
    message: `Se quitará "${record.tratamiento || 'este servicio'}" del expediente del paciente.`,
    confirmLabel: 'Quitar'
  });
  if (!confirmed) return;

  patient.historialClinico.splice(recordIndex, 1);
  if (Array.isArray(patient.tratamientoServicios)) {
    const serviceIndex = patient.tratamientoServicios.findIndex(service =>
      normalizeName(service.tratamiento) === normalizeName(record.tratamiento) &&
      normalizeName(service.diagnostico) === normalizeName(record.diagnostico)
    );
    if (serviceIndex !== -1) patient.tratamientoServicios.splice(serviceIndex, 1);
    patient.tratamientoActual = patient.tratamientoServicios[0]?.tratamiento || '';
    patient.diagnostico = patient.tratamientoServicios[0]?.diagnostico || '';
  } else if (
    normalizeName(patient.tratamientoActual) === normalizeName(record.tratamiento) &&
    normalizeName(patient.diagnostico) === normalizeName(record.diagnostico)
  ) {
    patient.tratamientoActual = '';
    patient.diagnostico = '';
  }

  savePatients();
  renderPatientDirectory(globalSearchQuery);
  showPatientDetails('id:' + patient.id);
  showToast('Servicio quitado del expediente.');
}

function renderPatientFinancialHistory(patient) {
  const history = patient.historialFinanciero || [];
  if (!history.length) {
    return `<p class="empty-history">No hay movimientos financieros registrados.</p>`;
  }

  const appointmentsWithPayments = new Set(
    history.map(payment => payment.citaId).filter(Boolean)
  );
  const appointments = new Map();
  getPatientAppointments(patient).forEach(appointment => {
    if (!appointmentsWithPayments.has(appointment.id)) return;
    const total = getNumericAmount(appointment.total ?? appointment.balance);
    const due = getNumericAmount(appointment.balance);
    const paid = appointment.paid !== undefined
      ? getNumericAmount(appointment.paid)
      : Math.max(total - due, 0);
    appointments.set(appointment.id, {
      fecha: appointment.date,
      concepto: appointment.reason || 'Cita',
      estipulado: total,
      pagado: paid,
      debe: due,
      fechaMovimiento: appointment.date
    });
  });

  history.forEach(payment => {
    const record = appointments.get(payment.citaId);
    if (record) {
      record.fechaMovimiento = payment.fecha || record.fechaMovimiento;
      return;
    }
    const key = payment.citaId || payment.id;
    const legacyRecord = appointments.get(key) || {
      fecha: payment.fechaCita || payment.fecha,
      concepto: payment.concepto || 'Cita',
      estipulado: getNumericAmount(payment.montoTotal),
      pagado: 0,
      debe: getNumericAmount(payment.saldoRestante),
      fechaMovimiento: payment.fecha
    };
    legacyRecord.estipulado = Math.max(legacyRecord.estipulado, getNumericAmount(payment.montoTotal));
    legacyRecord.pagado += getNumericAmount(payment.monto);
    legacyRecord.debe = getNumericAmount(payment.saldoRestante);
    legacyRecord.fechaMovimiento = payment.fecha || legacyRecord.fechaMovimiento;
    appointments.set(key, legacyRecord);
  });

  if (!appointments.size) {
    return `<p class="empty-history">No hay movimientos financieros registrados.</p>`;
  }

  return [...appointments.values()].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).map(record => `
    <div class="patient-financial-entry">
      <span>
        <strong>${formatDisplayDate(record.fecha)}</strong>
        <small><strong>Concepto:</strong> ${escapeHTML(record.concepto)} · <strong>Total:</strong> ${formatCurrency(record.estipulado)} · <strong>Pagado:</strong> ${formatCurrency(record.pagado)} · <strong>Pendiente:</strong> ${formatCurrency(record.debe)}</small>
      </span>
      <strong>Actualizado: ${formatDisplayDate(record.fechaMovimiento)}</strong>
    </div>
  `).join('');
}

function resolvePatientRef(ref) {
  const value = String(ref || '');
  if (value.startsWith('id:')) return { patient: findPatientById(value.slice(3)), name: '' };
  const name = value.startsWith('name:') ? value.slice(5) : value;
  return { patient: findPatientByName(name), name };
}

function showPatientDetails(ref) {
  const resolved = resolvePatientRef(ref);
  const name = resolved.name;
  let patient = resolved.patient;
  const appointments = patient ? getPatientAppointments(patient) : getAppointments().filter(({ appointment }) => normalizeName(appointment.name) === normalizeName(name)).map(({ appointment }) => appointment);
  const details = document.querySelector('#patient-details');
  if (!details) return;
  
  if (!patient && !appointments.length) {
    details.innerHTML = `<p class="empty-state">No hay información disponible para este paciente.</p>`;
    return;
  }
  
  if (!patient) {
    patient = { id: null, nombre: name, apellidos: '', fechaNacimiento: '', sexo: '', telefono: '', correo: '', direccion: '', contactoEmergencia: '', parentescoEmergencia: '', telefonoEmergencia: '', antecedentesMedicos: '', alergias: '', medicamentos: '', tipoSangre: '', observacionesMedicas: '', tratamientoActual: '', diagnostico: '', fechaRegistroClinico: '', historialClinico: [], historialFinanciero: [], archivosClinicos: [] };
  }
  selectedPatientId = patient.id || null;
  const fullName = getPatientFullName(patient) || name;
  const outstandingBalance = appointments.reduce((sum, appointment) => {
    if (appointment.status === 'Cancelada') return sum;
    const totalAmount = getNumericAmount(appointment.total ?? appointment.balance);
    const balance = Math.max(getNumericAmount(appointment.balance), 0);
    const paidAmount = appointment.paid !== undefined
      ? getNumericAmount(appointment.paid)
      : Math.max(totalAmount - balance, 0);
    const credit = Math.max(paidAmount - totalAmount, 0);
    return sum + balance - credit;
  }, 0);
  const patientOutstandingBalance = Math.max(outstandingBalance, 0);
  const financialTotal = (patient.historialFinanciero || []).reduce((sum, payment) => sum + getNumericAmount(payment.monto), 0);
  const orderedAppointments = sortPatientAppointments(appointments);
  const appointmentForToday = appointments.find(appointment =>
    appointment.date === getISODate(0) && appointment.status !== 'Cancelada'
  );
  
  details.innerHTML = `
    <div class="patient-details-heading">
      <span class="patient-details-avatar">${escapeHTML(getInitials(fullName))}</span>
      <div><span class="eyebrow">EXPEDIENTE</span><h2>${escapeHTML(fullName)}</h2></div>
      ${patient.id ? `<div class="patient-details-actions">
        <button type="button" class="row-action" data-edit-patient="${escapeHTML(patient.id)}">Editar expediente</button>
        <button type="button" class="row-action delete-action" data-delete-patient="${escapeHTML(patient.id)}">Eliminar paciente</button>
      </div>` : ''}
    </div>
    <div class="patient-detail-stats">
      <div><span>Citas registradas</span><strong>${appointments.length}</strong></div>
      <div><span>Saldo adeudado</span><strong>${formatCurrency(patientOutstandingBalance)}</strong></div>
      <div><span>Total pagado</span><strong>${formatCurrency(financialTotal)}</strong></div>
    </div>
    <nav class="patient-folder-tabs" role="tablist" aria-label="Secciones del expediente">
      <button type="button" class="patient-folder-tab active" role="tab" aria-selected="true" data-patient-tab="generales"><span aria-hidden="true">▤</span>Datos generales</button>
      <button type="button" class="patient-folder-tab" role="tab" aria-selected="false" data-patient-tab="medico"><span aria-hidden="true">✚</span>Expediente médico</button>
      <button type="button" class="patient-folder-tab" role="tab" aria-selected="false" data-patient-tab="clinico"><span aria-hidden="true">◉</span>Historial clínico</button>
      <button type="button" class="patient-folder-tab" role="tab" aria-selected="false" data-patient-tab="citas"><span aria-hidden="true">◷</span>Historial de citas</button>
      <button type="button" class="patient-folder-tab" role="tab" aria-selected="false" data-patient-tab="financiero"><span aria-hidden="true">$</span>Historial financiero</button>
    </nav>
    <section class="patient-record-section patient-folder-panel active" role="tabpanel" data-patient-panel="generales">
      <div class="patient-record-heading"><h2>Datos generales</h2></div>
      <div class="patient-record-grid">
        <div><span>Nombre completo: </span><strong>${escapeHTML(fullName)}</strong></div>
        <div><span>Fecha de nacimiento: </span><strong>${patient.fechaNacimiento ? formatDisplayDate(patient.fechaNacimiento) : 'No registrado'}</strong></div>
        <div><span>Sexo: </span><strong>${escapeHTML(patient.sexo || 'No registrado')}</strong></div>
        <div><span>Teléfono: </span><strong>${escapeHTML(patient.telefono || 'No registrado')}</strong></div>
        <div><span>Correo: </span><strong>${escapeHTML(patient.correo || 'No registrado')}</strong></div>
        <div><span>Dirección: </span><strong>${escapeHTML(patient.direccion || 'No registrada')}</strong></div>
      </div>
      <div class="patient-emergency">
        <h4>Contacto de emergencia</h4>
        <p><strong>Nombre:</strong> ${escapeHTML(patient.contactoEmergencia || 'No registrado')} <span>· <strong>Parentesco:</strong> ${escapeHTML(patient.parentescoEmergencia || 'No registrado')} · <strong>Teléfono:</strong> ${escapeHTML(patient.telefonoEmergencia || 'No registrado')}</span></p>
      </div>
      ${appointmentForToday ? `<div class="patient-general-appointment-action">
        <div class="patient-general-appointment-details">
          <span>Cita de hoy · ${escapeHTML(appointmentForToday.time)}</span>
          <strong>${escapeHTML(appointmentForToday.reason || 'Cita')}</strong>
        </div>
        <button type="button" class="patient-info-button patient-general-add-advance" data-appointment-notes="${escapeHTML(ensureAppointmentId(appointmentForToday))}">${Array.isArray(appointmentForToday.observations) && appointmentForToday.observations.length ? 'Ver avance' : 'Agregar avance'}</button>
      </div>` : ''}
    </section>
    <section class="patient-record-section patient-folder-panel" role="tabpanel" data-patient-panel="medico" hidden>
      <div class="patient-record-heading"><h2>Expediente médico</h2></div>
      <div class="patient-record-grid">
        <div><span>Tipo de sangre: </span><strong>${escapeHTML(patient.tipoSangre || 'No registrado')}</strong></div>
        <div><span>Medicamentos actuales: </span><strong>${escapeHTML(patient.medicamentos || 'Ninguno registrado')}</strong></div>
        <div><span>Alergias: </span><strong>${escapeHTML(patient.alergias || 'Ninguna registrada')}</strong></div>
      </div>
      <div class="patient-record-text"><span>Antecedentes médicos: </span><p><strong>${escapeHTML(patient.antecedentesMedicos || 'No registrados.')}</strong></p></div>
      <div class="patient-record-text"><span>Observaciones médicas: </span><p><strong>${escapeHTML(patient.observacionesMedicas || 'Sin observaciones.')}</strong></p></div>
    </section>
    <section class="patient-record-section patient-folder-panel" role="tabpanel" data-patient-panel="clinico" hidden>
      <div class="patient-record-heading"><h2>Historial clínico</h2></div>
      <div class="patient-current-treatment"><strong>Tratamientos actuales</strong></div>
      <div class="patient-clinical-history">${renderPatientHistory(patient)}</div>
      <div class="patient-files"><h4>Documentos y fotografías</h4>${renderPatientFiles(patient)}</div>
    </section>
    <section class="patient-record-section patient-folder-panel" role="tabpanel" data-patient-panel="citas" hidden>
      <div class="patient-record-heading"><span class="eyebrow">AGENDA</span><h2>Historial de citas</h2></div>
      <div class="patient-appointment-history">
        ${orderedAppointments.length
          ? renderPatientAppointmentRows(orderedAppointments.slice(0, 3))
          : '<p class="empty-history">No hay citas registradas.</p>'}
      </div>
      ${orderedAppointments.length > 3 && patient.id
        ? `<button type="button" class="patient-appointments-more" data-patient-appointments="${escapeHTML(patient.id)}">Ver todas las citas (${orderedAppointments.length})</button>`
        : ''}
    </section>
    <section class="patient-record-section patient-folder-panel" role="tabpanel" data-patient-panel="financiero" hidden>
      <div class="patient-record-heading"><h2>Historial financiero</h2></div>
      <div class="financial-history">${renderPatientFinancialHistory(patient)}</div>
    </section>
  `;
}

function refreshPatientDetails(patient) {
  const details = document.querySelector('#patient-details');
  if (!details || !patient?.id || selectedPatientId !== patient.id) return;

  const activePanel = details.querySelector('[data-patient-panel].active')?.dataset.patientPanel;
  showPatientDetails('id:' + patient.id);
  if (!activePanel || activePanel === 'generales') return;

  details.querySelectorAll('[data-patient-tab]').forEach(tab => {
    const isActive = tab.dataset.patientTab === activePanel;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  details.querySelectorAll('[data-patient-panel]').forEach(panel => {
    const isActive = panel.dataset.patientPanel === activePanel;
    panel.hidden = !isActive;
    panel.classList.toggle('active', isActive);
  });
}

function openPatientModal(patientId = null) {
  const modal = document.querySelector('#patient-modal');
  const form = document.querySelector('#patient-form');
  if (!modal || !form) return;
  
  editingPatient = patientId ? findPatientById(patientId) : null;
  pendingClinicalFiles = [];
  form.reset();
  renderClinicalServiceRows();
  
  renderSelectedFiles([]);
  
  const title = document.querySelector('#patient-modal-title');
  
  if (editingPatient) {
    if (title) title.textContent = 'Editar expediente';
    fillPatientForm(editingPatient);
  } else {
    if (title) title.textContent = 'Registro de paciente';
    setPatientDateDefaults();
  }
  
  const formScroll = document.querySelector('#patient-form-scroll');
  if (formScroll) formScroll.scrollTop = 0;
  
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
}

function closePatientModal() {
  const modal = document.querySelector('#patient-modal');
  if (!modal) return;
  
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  editingPatient = null;
  if (pendingClinicalFiles.length) {
    deleteClinicalFiles(pendingClinicalFiles.map(item => item.id)).catch(() => {});
    pendingClinicalFiles = [];
  }
  updatePageScrollLock();
}

function setPatientDateDefaults() {
  const clinicalDate = document.querySelector('#clinical-date');
  if (clinicalDate) clinicalDate.value = getISODate(0);
}

function setFieldValue(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.value = value ?? '';
}

function createClinicalServiceRow(service = {}, removable = false) {
  const row = document.createElement('div');
  row.className = 'clinical-service-row';
  row.innerHTML = `
    <div class="clinical-service-controls">
      <label>Tratamiento / servicio*
        <select class="clinical-service-select" aria-label="Tratamiento o servicio" required>
          <option value="">Seleccionar tratamiento</option>
          ${CLINICAL_SERVICE_OPTIONS.map(option => `<option value="${escapeHTML(option)}">${escapeHTML(option)}</option>`).join('')}
        </select>
      </label>
      ${removable ? '<button type="button" class="clinical-service-remove outline-button" aria-label="Quitar servicio">Quitar</button>' : ''}
    </div>
    <label class="clinical-service-custom" hidden>Tratamiento personalizado*
      <input class="clinical-service-custom-input" type="text" maxlength="120" placeholder="Escribe el tratamiento" required>
    </label>
    <label>Diagnóstico / motivo del tratamiento*
      <textarea class="clinical-service-diagnosis" rows="3" placeholder="Describe el diagnóstico o motivo del tratamiento..." required></textarea>
    </label>
  `;

  const select = row.querySelector('.clinical-service-select');
  const customLabel = row.querySelector('.clinical-service-custom');
  const customInput = row.querySelector('.clinical-service-custom-input');
  const diagnosis = row.querySelector('.clinical-service-diagnosis');
  const serviceName = String(service.tratamiento || '');
  if (serviceName && CLINICAL_SERVICE_OPTIONS.includes(serviceName)) {
    select.value = serviceName;
  } else if (serviceName) {
    select.value = 'Otro...';
    customInput.value = serviceName;
  }
  customLabel.hidden = select.value !== 'Otro...';
  customInput.required = select.value === 'Otro...';
  diagnosis.value = service.diagnostico || '';
  return row;
}

function renderClinicalServiceRows(services = []) {
  const container = document.querySelector('#clinical-services-list');
  if (!container) return;
  const rows = services.length ? services : [{}];
  container.replaceChildren(...rows.map((service, index) => createClinicalServiceRow(service, index > 0)));
}

function fillPatientForm(patient) {
  setFieldValue('#patient-name', patient.nombre);
  setFieldValue('#patient-lastname', patient.apellidos);
  setFieldValue('#patient-birthdate', patient.fechaNacimiento);
  setFieldValue('#patient-sex', patient.sexo);
  setFieldValue('#patient-phone', patient.telefono);
  setFieldValue('#patient-email', patient.correo);
  setFieldValue('#patient-address', patient.direccion);
  setFieldValue('#emergency-name', patient.contactoEmergencia);
  const relationSelect = document.querySelector('#emergency-relation');
  if (relationSelect && patient.parentescoEmergencia && !Array.from(relationSelect.options).some(option => option.value === patient.parentescoEmergencia)) {
    relationSelect.add(new Option(patient.parentescoEmergencia, patient.parentescoEmergencia));
  }
  setFieldValue('#emergency-relation', patient.parentescoEmergencia);
  setFieldValue('#emergency-phone', patient.telefonoEmergencia);
  setFieldValue('#patient-blood', patient.tipoSangre);
  setFieldValue('#medical-history', patient.antecedentesMedicos);
  setFieldValue('#patient-allergies', patient.alergias);
  setFieldValue('#patient-medications', patient.medicamentos);
  setFieldValue('#medical-notes', patient.observacionesMedicas);
  const services = patient.tratamientoServicios?.length
    ? patient.tratamientoServicios
    : patient.tratamientoActual || patient.diagnostico
      ? [{ tratamiento: patient.tratamientoActual, diagnostico: patient.diagnostico }]
      : [];
  renderClinicalServiceRows(services);
  setFieldValue('#clinical-date', patient.fechaRegistroClinico || getISODate(0));
  renderSelectedFiles(patient.archivosClinicos || []);
}

function collectPatientForm() {
  const patient = editingPatient ? JSON.parse(JSON.stringify(editingPatient)) : createEmptyPatient();
  
  patient.nombre = document.querySelector('#patient-name')?.value.trim() || '';
  patient.apellidos = document.querySelector('#patient-lastname')?.value.trim() || '';
  patient.fechaNacimiento = document.querySelector('#patient-birthdate')?.value || '';
  patient.sexo = document.querySelector('#patient-sex')?.value || '';
  patient.telefono = document.querySelector('#patient-phone')?.value.trim() || '';
  patient.correo = document.querySelector('#patient-email')?.value.trim() || '';
  patient.direccion = document.querySelector('#patient-address')?.value.trim() || '';
  patient.contactoEmergencia = document.querySelector('#emergency-name')?.value.trim() || '';
  patient.parentescoEmergencia = document.querySelector('#emergency-relation')?.value.trim() || '';
  patient.telefonoEmergencia = document.querySelector('#emergency-phone')?.value.trim() || '';
  patient.tipoSangre = document.querySelector('#patient-blood')?.value || '';
  patient.antecedentesMedicos = document.querySelector('#medical-history')?.value.trim() || '';
  patient.alergias = document.querySelector('#patient-allergies')?.value.trim() || '';
  patient.medicamentos = document.querySelector('#patient-medications')?.value.trim() || '';
  patient.observacionesMedicas = document.querySelector('#medical-notes')?.value.trim() || '';
  patient.tratamientoServicios = Array.from(document.querySelectorAll('#clinical-services-list .clinical-service-row'))
    .map(row => {
      const selected = row.querySelector('.clinical-service-select')?.value || '';
      const custom = row.querySelector('.clinical-service-custom-input')?.value.trim() || '';
      const treatment = selected === 'Otro...' ? custom : selected;
      const diagnosis = row.querySelector('.clinical-service-diagnosis')?.value.trim() || '';
      return {
        tratamiento: treatment,
        diagnostico: diagnosis
      };
    })
    .filter(service => service.tratamiento || service.diagnostico);
  patient.tratamientoActual = patient.tratamientoServicios[0]?.tratamiento || '';
  patient.diagnostico = patient.tratamientoServicios[0]?.diagnostico || '';
  patient.fechaRegistroClinico = document.querySelector('#clinical-date')?.value || getISODate(0);
  
  if (!Array.isArray(patient.historialClinico)) patient.historialClinico = [];
  if (!Array.isArray(patient.historialFinanciero)) patient.historialFinanciero = [];
  if (!Array.isArray(patient.archivosClinicos)) patient.archivosClinicos = [];
  
  return patient;
}

function processPatientFiles(patient) {
  pendingClinicalFiles.forEach(({ file, id }) => {
    if (patient.archivosClinicos.some(existing => existing.name === file.name && existing.size === file.size && existing.type === file.type)) return;
    patient.archivosClinicos.push({ id, name: file.name, type: file.type, size: file.size, date: getISODate(0) });
  });
  
  renderSelectedFiles(patient.archivosClinicos);
  pendingClinicalFiles = [];
}

function renderSelectedFiles(files) {
  const container = document.querySelector('#clinical-file-list');
  if (!container) return;
  const hasFiles = Array.isArray(files) && files.length > 0;

  container.innerHTML = !hasFiles
    ? '' 
    : files.map(file => `
      <div class="selected-file">
        <span class="clinical-file-name">${escapeHTML(file.name)}</span>
        <button type="button" class="outline-button clinical-file-view" data-view-clinical-file="${escapeHTML(file.id || '')}" data-file-name="${escapeHTML(file.name)}">Ver</button>
        <small>${escapeHTML(file.type || 'Archivo')} · ${formatFileSize(file.size)}</small>
      </div>
    `).join('');
  const addFilesButton = document.querySelector('#add-clinical-files');
  if (addFilesButton) addFilesButton.textContent = hasFiles ? '+ Agregar más archivos' : '+ Agregar archivo';
}

function clinicalRecordExists(patient, record) {
  return (patient.historialClinico || []).some(existing => 
    existing.fecha === record.fecha && 
    normalizeName(existing.tratamiento) === normalizeName(record.tratamiento) && 
    normalizeName(existing.diagnostico) === normalizeName(record.diagnostico)
  );
}

function savePatientForm(generateAppointment = false) {
  const wasEditing = Boolean(editingPatient);
  const oldPatientName = editingPatient ? getPatientFullName(editingPatient) : '';
  const patient = collectPatientForm();
  
  if (!patient.nombre) {
    showToast('Ingresa el nombre del paciente.');
    return false;
  }
  if (!patient.apellidos) {
    showToast('Ingresa los apellidos del paciente.');
    return false;
  }
  
  const newPatientName = getPatientFullName(patient);
  const existing = patients.find(item => item.id !== patient.id &&
    normalizeName(getPatientFullName(item)) === normalizeName(newPatientName) &&
    (item.fechaNacimiento || '') === (patient.fechaNacimiento || ''));
  
  if (existing) {
    showToast('Ya existe un paciente con ese nombre y fecha de nacimiento.');
    return false;
  }
  
  processPatientFiles(patient);
  
  const clinicalServices = patient.tratamientoServicios.length
    ? patient.tratamientoServicios
    : patient.tratamientoActual || patient.diagnostico
      ? [{ tratamiento: patient.tratamientoActual, diagnostico: patient.diagnostico }]
      : [];
  clinicalServices.filter(service => !wasEditing || !(editingPatient?.tratamientoServicios || []).some(old =>
    normalizeName(old.tratamiento) === normalizeName(service.tratamiento) &&
    normalizeName(old.diagnostico) === normalizeName(service.diagnostico))).forEach(service => {
    const newRecord = {
      id: generateId('clinical'),
      fecha: patient.fechaRegistroClinico || getISODate(0),
      tratamiento: service.tratamiento,
      diagnostico: service.diagnostico
    };
    if (!clinicalRecordExists(patient, newRecord)) patient.historialClinico.push(newRecord);
  });
  
  if (wasEditing) {
    const index = patients.findIndex(item => item.id === patient.id);
    if (index !== -1) patients[index] = patient;
    if (oldPatientName !== newPatientName) updatePatientAppointmentReferences(patient.id, oldPatientName, newPatientName);
    showToast('Expediente actualizado correctamente.');
  } else {
    patients.push(patient);
    showToast('Paciente registrado correctamente.');
  }
  
  savePatients();
  saveAppointments();
  renderLists();
  showPatientDetails('id:' + patient.id);
  closePatientModal();
  
  if (generateAppointment) {
    openModal();
    const patientInput = document.querySelector('#modal-patient');
    const patientIdInput = document.querySelector('#modal-patient-id');
    
    if (patientInput) {
      patientInput.value = getPatientFullName(patient);
      patientInput.readOnly = true;
      patientInput.setAttribute('data-patient-selected', 'true');
    }
    if (patientIdInput) patientIdInput.value = patient.id;
    selectedPatientId = patient.id;
  }
  
  return true;
}

async function deletePatient(patientId) {
  const patientIndex = patients.findIndex(patient => patient.id === patientId);
  if (patientIndex === -1) {
    showToast('No se encontró el paciente para eliminar.');
    return;
  }

  const patient = patients[patientIndex];
  const patientName = getPatientFullName(patient);
  const patientAppointments = getPatientAppointments(patient);
  const appointmentsCount = patientAppointments.length;
  const { confirmed } = await showConfirmationDialog({
    title: '¿Eliminar expediente?',
    message: `Se eliminará el expediente de ${patientName}.${appointmentsCount ? ` También se ${appointmentsCount === 1 ? 'eliminará 1 cita relacionada' : `eliminarán ${appointmentsCount} citas relacionadas`}.` : ''} Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar paciente'
  });
  if (!confirmed) return;

  const fileIds = (patient.archivosClinicos || []).map(file => file.id).filter(Boolean);
  const normalizedPatientName = normalizeName(patientName);
  const currentPatientIndex = patients.findIndex(item => item.id === patientId);
  if (currentPatientIndex === -1) {
    showToast('No se encontró el paciente para eliminar.');
    return;
  }
  patients.splice(currentPatientIndex, 1);
  rebuildAppointmentCollections(getAppointments()
    .map(({ appointment }) => appointment)
    .filter(appointment =>
      appointment.patientId !== patientId
    ));
  selectedPatientId = null;

  const patientsSaved = savePatients();
  const appointmentsSaved = saveAppointments();
  if (!patientsSaved || !appointmentsSaved) return;

  closePatientAppointments();
  renderPatientDirectory(globalSearchQuery);
  const details = document.querySelector('#patient-details');
  if (details) {
    details.innerHTML = '<span class="large-module-icon">♟</span><h2>Selecciona un paciente</h2><p>Su expediente, información y próximas citas aparecerán aquí.</p>';
  }
  renderLists();
  showToast(`Expediente de ${patientName} eliminado.`);

  deleteClinicalFiles(fileIds).catch(error => {
    console.error(`No se pudieron eliminar los archivos clínicos de ${patientName}:`, error);
    showToast('El expediente se eliminó, pero no se pudieron borrar todos sus archivos adjuntos.');
  });
}

function openPatientRecordFromSearch(patientId) {
  const patient = findPatientById(patientId);
  if (!patient) {
    showToast('No se encontró el expediente de ese paciente.');
    return;
  }

  const searchInput = document.querySelector('#patient-search');
  if (searchInput) searchInput.value = '';
  setGlobalSearchQuery('');
  renderGlobalPatientSearch('');
  renderLists();
  changePage('pacientes');
  renderPatientDirectory();
  const ref = 'id:' + patient.id;
  showPatientDetails(ref);
  document.querySelectorAll('.patient-list-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.selectPatient === ref);
  });
}

function applyGlobalSearch() {
  renderLists();
}
