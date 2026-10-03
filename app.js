const MAX_REASON_LENGTH = 32;

const todayAppointments = [
  ['09:00 AM', 'Ana Ramírez', 'Control de brackets', '$500'],
  ['10:00 AM', 'Jorge López', 'Ajuste mensual', '$1,200'],
  ['11:30 AM', 'Sofía Morales', 'Primera valoración', '$0'],
  ['12:30 PM', 'Daniel Ruiz', 'Cambio de ligas', '$350'],
  ['01:30 PM', 'Paola Torres', 'Revisión clínica', '$500'],
  ['03:00 PM', 'Carlos Vega', 'Control de brackets', '$700'],
  ['04:00 PM', 'Mariana Díaz', 'Ajuste mensual', '$450'],
  ['05:00 PM', 'Ricardo Cruz', 'Retenedor', '$1,000'],
  ['05:30 PM', 'Laura Pérez', 'Revisión ortodoncia', '$300'],
  ['06:00 PM', 'José Núñez', 'Ajuste mensual', '$600'],
  ['06:30 PM', 'Mónica Reyes', 'Control de brackets', '$500']
];

const tomorrowAppointments = [
  ['09:00 AM', 'Carla Hernández', 'Limpieza dental', '$500'],
  ['09:30 AM', 'Carlos Pérez', 'Control de brackets', '$300'],
  ['10:00 AM', 'Mariana Díaz', 'Revisión de ortodoncia', '$0'],
  ['11:00 AM', 'Pedro Sánchez', 'Cambio de ligas', '$450'],
  ['12:00 PM', 'Andrea Fuentes', 'Ajuste mensual', '$700'],
  ['01:00 PM', 'Luis Castro', 'Primera valoración', '$0'],
  ['03:00 PM', 'Elena Ruiz', 'Control de brackets', '$500'],
  ['04:00 PM', 'Marco Silva', 'Revisión clínica', '$450'],
  ['05:00 PM', 'Valeria Mora', 'Ajuste mensual', '$650'],
  ['06:00 PM', 'Bruno Flores', 'Cambio de ligas', '$300'],
  ['06:30 PM', 'Karen Luna', 'Control de brackets', '$500']
];
const otherAppointments = [];

const todayDate = getISODate(0);
const tomorrowDate = getISODate(1);
todayAppointments.forEach(appointment => { appointment[4] = todayDate; });
tomorrowAppointments.forEach(appointment => { appointment[4] = tomorrowDate; });

const pages = {
  centro: ['Centro de Mando'],
  calendario: ['Calendario'],
  citas: ['Citas'],
  pacientes: ['Pacientes'],
  finanzas: ['Finanzas'],
  administrar: ['Administrar']
};

let selectedPatient = null, toastTimer, editingAppointment = null, activeAppointmentFilter = 'today';

function getISODate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sanitizeReason(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH) || 'Consulta';
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatCurrency(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (!digits) return '$0';
  const numeric = Number(digits);
  return `$${numeric.toLocaleString('es-MX')}`;
}

function formatTimeFromInput(timeValue) {
  if (!timeValue) return '09:00 AM';
  const [hours, minutes] = timeValue.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getAppointments() {
  return [
    ...todayAppointments.map((appointment, index) => ({ appointment, index, source: 'today' })),
    ...tomorrowAppointments.map((appointment, index) => ({ appointment, index, source: 'tomorrow' })),
    ...otherAppointments.map((appointment, index) => ({ appointment, index, source: 'other' }))
  ];
}

function statusDots(name) {
  return `
    <div>
      <div class="status-dots" role="group" aria-label="Estatus de ${name}">
        <button class="status-dot confirmed" data-status="Confirmada" title="Confirmada" aria-label="Confirmada"></button>
        <button class="status-dot pending selected" data-status="Pendiente" title="Pendiente" aria-label="Pendiente"></button>
        <button class="status-dot postponed" data-status="Pospuesta" title="Pospuesta" aria-label="Pospuesta"></button>
      </div>
      <span class="status-text">Pendiente</span>
    </div>`;
}

function todayMarkup(item, index) {
  const [time, name, treatment, balance] = item;
  return `
    <div class="appointment-row" data-type="today" data-index="${index}">
      <div class="time">${escapeHTML(time)}</div>
      <div class="person">
        <div><strong>${escapeHTML(name)}</strong><small>${escapeHTML(treatment)}</small></div>
      </div>
      <div class="charge">${escapeHTML(balance)}<button class="charge-button" data-name="${escapeHTML(name)}"></button></div>
      ${statusDots(escapeHTML(name))}
      <button class="new-followup" data-new-appointment="${index}">Cita nueva</button>
    </div>`;
}

function tomorrowMarkup(item) {
  const [time, name, treatment, balance] = item;
  return `
    <div class="tomorrow-row">
      <div class="person">
        <div><strong>${escapeHTML(name)} · ${escapeHTML(time)}</strong><small>${escapeHTML(treatment)} · Saldo: ${escapeHTML(balance)}</small></div>
      </div>
      <button class="whatsapp" data-reminder="${escapeHTML(name)}" aria-label="Recordar por WhatsApp">✆</button>
    </div>`;
}

function renderLists() {
  document.querySelector('#today-list').innerHTML = todayAppointments.map(todayMarkup).join('');
  document.querySelector('#tomorrow-list').innerHTML = tomorrowAppointments.map(tomorrowMarkup).join('');
  renderAppointmentTable();
  renderPatientDirectory(document.querySelector('#directory-search').value);
  document.querySelector('#today-count').textContent = todayAppointments.length;
}

function appointmentCardMarkup(appointment, index, source) {
  const [time, name, reason, balance, date] = appointment;
  return `
    <article class="managed-appointment">
      <div class="managed-appointment-time"><strong>${escapeHTML(time)}</strong><small>${formatDisplayDate(date)}</small></div>
      <div class="managed-appointment-person">
        <strong>${escapeHTML(name)}</strong>
        <small>${escapeHTML(reason)}</small>
      </div>
      <div class="managed-appointment-charge">
        <span>Saldo</span>
        <strong>${escapeHTML(balance || '$0')}</strong>
      </div>
      <div class="managed-appointment-actions">
        <button class="row-action" data-edit-appointment="${source}:${index}">Editar cita</button>
        <button class="patient-info-button" data-patient-info="${escapeHTML(encodeURIComponent(name))}">Info del paciente</button>
      </div>
    </article>`;
}

function renderAppointmentTable() {
  const appointments = getAppointments().filter(({ source }) =>
    activeAppointmentFilter === 'all' || source === activeAppointmentFilter
  );
  document.querySelector('#all-appointments').innerHTML = appointments.length
    ? appointments.map(({ appointment, index, source }) => appointmentCardMarkup(appointment, index, source)).join('')
    : '<p class="empty-state">No hay citas para este filtro.</p>';
}

function renderPatientDirectory(query = '') {
  const patients = new Map();
  getAppointments().forEach(({ appointment }) => {
    const [time, name, reason, balance, date] = appointment;
    const patient = patients.get(name) || { name, appointments: [] };
    patient.appointments.push({ time, reason, balance: balance || '$0', date });
    patients.set(name, patient);
  });

  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const filteredPatients = [...patients.values()].filter(patient =>
    `${patient.name} ${patient.appointments.map(item => item.reason).join(' ')}`
      .toLocaleLowerCase('es')
      .includes(normalizedQuery)
  );

  document.querySelector('#patient-list').innerHTML = filteredPatients.length
    ? filteredPatients.map(patient => `
      <button class="patient-list-item" data-select-patient="${escapeHTML(encodeURIComponent(patient.name))}">
        <span class="patient-list-avatar">${escapeHTML(getInitials(patient.name))}</span>
        <span class="patient-list-copy">
          <strong>${escapeHTML(patient.name)}</strong>
          <small>${patient.appointments.length} ${patient.appointments.length === 1 ? 'cita' : 'citas'}</small>
        </span>
        <span class="patient-list-arrow" aria-hidden="true">›</span>
      </button>`).join('')
    : '<p class="empty-state">No se encontraron pacientes.</p>';
}

function getInitials(name) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function showPatientDetails(name) {
  const appointments = getAppointments()
    .filter(({ appointment }) => appointment[1] === name)
    .map(({ appointment }) => appointment);
  const details = document.querySelector('#patient-details');

  if (!appointments.length) {
    details.innerHTML = '<p class="empty-state">No hay información disponible para este paciente.</p>';
    return;
  }

  details.innerHTML = `
    <div class="patient-details-heading">
      <span class="patient-details-avatar">${escapeHTML(getInitials(name))}</span>
      <div><span class="eyebrow">EXPEDIENTE</span><h2>${escapeHTML(name)}</h2></div>
    </div>
    <div class="patient-detail-stats">
      <div><span>Citas registradas</span><strong>${appointments.length}</strong></div>
      <div><span>Saldo próximo</span><strong>${escapeHTML(appointments[appointments.length - 1][3] || '$0')}</strong></div>
    </div>
    <h3>Agenda</h3>
    <div class="patient-appointment-history">
      ${appointments.map(appointment => `
        <div>
          <span><strong>${escapeHTML(appointment[2])}</strong><small>${formatDisplayDate(appointment[4])} · ${escapeHTML(appointment[0])}</small></span>
          <strong>${escapeHTML(appointment[3] || '$0')}</strong>
        </div>`).join('')}
    </div>`;
}

function formatDisplayDate(dateValue) {
  if (!dateValue) return 'Fecha pendiente';
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function dayMarkup(number, muted = false) {
  const events = {
    29: ['09:00 Ana Ramírez', '10:00 Jorge López'],
    30: ['09:30 Carla Hernández'],
    3: ['11:00 Pedro Sánchez'],
    6: ['15:00 Paola Torres'],
    9: ['10:00 Mariana Díaz'],
    14: ['12:30 Daniel Ruiz'],
    18: ['09:00 Andrea Fuentes'],
    22: ['16:00 Carlos Vega'],
    26: ['10:00 Sofía Morales']
  };
  return `
    <div class="day ${muted ? 'muted' : ''} ${number === 29 ? 'today' : ''}">
      <span>${number}</span>
      ${(events[number] || []).map((event, i) => `<span class="event ${i ? 'violet' : ''}">${event}</span>`).join('')}
    </div>`;
}

function renderCalendar(target, large = false) {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  target.innerHTML = [
    dayMarkup(31, true),
    ...days.map(day => dayMarkup(day)),
    ...([1, 2, 3, 4].map(day => dayMarkup(day, true)))
  ].join('');
  if (large) target.classList.add('large');
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function changePage(page) {
  document.querySelectorAll('.app-page').forEach(x => x.classList.toggle('active', x.id === `page-${page}`));
  document.querySelectorAll('[data-page-link]').forEach(x => x.classList.toggle('active', x.dataset.pageLink === page));
  document.querySelector('#page-title').textContent = pages[page][0];
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openModal(index = null) {
  const modal = document.querySelector('#appointment-modal');
  const patientInput = document.querySelector('#modal-patient');
  const motiveInput = document.querySelector('#modal-motive');
  const amountInput = document.querySelector('#modal-amount');
  const fullPaymentCheckbox = document.querySelector('#modal-full-payment');
  const dateInput = document.querySelector('#modal-date');
  const timeInput = document.querySelector('#modal-time');

  const isoDate = getISODate(0);

  if (index === null || index === undefined) {
    selectedPatient = null;
    editingAppointment = null;
    patientInput.value = '';
    patientInput.readOnly = false;
    patientInput.placeholder = 'Nombre del paciente';
    motiveInput.value = '';
    amountInput.value = '0';
    fullPaymentCheckbox.checked = false;
    amountInput.disabled = false;
    dateInput.value = isoDate;
    timeInput.value = '09:00';
    document.querySelector('#modal-title').textContent = 'Agendar nueva cita';
    document.querySelector('#appointment-modal .eyebrow').textContent = 'NUEVA CITA';
    document.querySelector('.modal-copy').textContent = 'Completa los datos para guardar la cita en la agenda.';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    return;
  }

  selectedPatient = index;
  editingAppointment = null;
  const appointment = todayAppointments[index];
  patientInput.value = appointment[1];
  patientInput.readOnly = true;
  patientInput.placeholder = '';
  motiveInput.value = sanitizeReason(appointment[2]);
  const currentAmount = (appointment[3] || '$0').replace(/\D/g, '') || '0';
  amountInput.value = currentAmount;
  fullPaymentCheckbox.checked = currentAmount === '0';
  amountInput.disabled = fullPaymentCheckbox.checked;
  dateInput.value = getISODate(1);
  timeInput.value = '09:00';
  document.querySelector('#modal-title').textContent = 'Generar nueva cita';
  document.querySelector('#appointment-modal .eyebrow').textContent = 'REAGENDAR PACIENTE';
  document.querySelector('.modal-copy').textContent = 'Al guardar, se registra la nueva cita y este paciente sale de la agenda de hoy.';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function editAppointment(source, index) {
  const list = source === 'today'
    ? todayAppointments
    : source === 'tomorrow'
      ? tomorrowAppointments
      : otherAppointments;
  const appointment = list[index];
  if (!appointment) return;

  editingAppointment = { source, index };
  selectedPatient = null;
  const patientInput = document.querySelector('#modal-patient');
  patientInput.value = appointment[1];
  patientInput.readOnly = true;
  document.querySelector('#modal-motive').value = sanitizeReason(appointment[2]);
  const amount = (appointment[3] || '$0').replace(/\D/g, '') || '0';
  document.querySelector('#modal-amount').value = amount;
  document.querySelector('#modal-full-payment').checked = amount === '0';
  document.querySelector('#modal-amount').disabled = amount === '0';
  document.querySelector('#modal-date').value = appointment[4] || getISODate(source === 'today' ? 0 : 1);
  document.querySelector('#modal-time').value = toInputTime(appointment[0]);
  document.querySelector('#modal-title').textContent = 'Editar cita';
  document.querySelector('#appointment-modal .eyebrow').textContent = 'CONFIGURAR CITA';
  document.querySelector('.modal-copy').textContent = 'Actualiza la fecha, hora, motivo o saldo de la cita.';
  const modal = document.querySelector('#appointment-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function toInputTime(timeValue) {
  const match = String(timeValue).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '09:00';
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hours += 12;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

function closeModal() {
  document.querySelector('#appointment-modal').classList.remove('open');
  document.querySelector('#appointment-modal').setAttribute('aria-hidden', 'true');
}

document.addEventListener('click', event => {
  const filter = event.target.closest('[data-appointment-filter]');
  if (filter) {
    activeAppointmentFilter = filter.dataset.appointmentFilter;
    document.querySelectorAll('[data-appointment-filter]').forEach(button => {
      const isActive = button === filter;
      button.classList.toggle('active-filter', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    renderAppointmentTable();
    return;
  }

  const editButton = event.target.closest('[data-edit-appointment]');
  if (editButton) {
    const [source, index] = editButton.dataset.editAppointment.split(':');
    editAppointment(source, Number(index));
    return;
  }

  const patientInfoButton = event.target.closest('[data-patient-info]');
  if (patientInfoButton) {
    const name = decodeURIComponent(patientInfoButton.dataset.patientInfo);
    changePage('pacientes');
    document.querySelector('#directory-search').value = '';
    renderPatientDirectory();
    showPatientDetails(name);
    document.querySelectorAll('.patient-list-item').forEach(item => {
      item.classList.toggle('selected', decodeURIComponent(item.dataset.selectPatient) === name);
    });
    return;
  }

  const patientItem = event.target.closest('[data-select-patient]');
  if (patientItem) {
    const name = decodeURIComponent(patientItem.dataset.selectPatient);
    showPatientDetails(name);
    document.querySelectorAll('.patient-list-item').forEach(item => {
      item.classList.toggle('selected', item === patientItem);
    });
    return;
  }

  if (event.target.closest('[data-open-appointment]')) {
    openModal();
    return;
  }

  const link = event.target.closest('[data-page-link]');
  if (link) {
    event.preventDefault();
    changePage(link.dataset.pageLink);
    return;
  }

  const dot = event.target.closest('.status-dot');
  if (dot) {
    const group = dot.closest('.status-dots');
    group.querySelectorAll('.status-dot').forEach(x => x.classList.remove('selected'));
    dot.classList.add('selected');
    group.nextElementSibling.textContent = dot.dataset.status;
    return;
  }

  const next = event.target.closest('[data-new-appointment]');
  if (next) {
    openModal(Number(next.dataset.newAppointment));
    return;
  }

  const charge = event.target.closest('.charge-button');
  if (charge) {
    showToast(`Cobro de ${charge.closest('.charge').firstChild.textContent} para ${charge.dataset.name}.`);
    return;
  }

  const reminder = event.target.closest('[data-reminder]');
  if (reminder) {
    const message = encodeURIComponent(`Hola ${reminder.dataset.reminder}, te recordamos tu cita dental.`);
    window.open(`https://wa.me/?text=${message}`, '_blank');
    showToast(`Recordatorio enviado para ${reminder.dataset.reminder}.`);
    return;
  }

  if (event.target.closest('#new-appointment')) {
    openModal();
    return;
  }

  if (event.target.closest('#modal-close') || event.target === document.querySelector('#appointment-modal')) {
    closeModal();
  }
});

document.querySelector('#modal-full-payment').addEventListener('change', event => {
  const amountInput = document.querySelector('#modal-amount');
  amountInput.disabled = event.target.checked;
  if (event.target.checked) {
    amountInput.value = '0';
  }
});

document.querySelector('#appointment-form').addEventListener('submit', event => {
  event.preventDefault();

  const patientInput = document.querySelector('#modal-patient');
  const motiveInput = document.querySelector('#modal-motive');
  const amountInput = document.querySelector('#modal-amount');
  const dateInput = document.querySelector('#modal-date');
  const timeInput = document.querySelector('#modal-time');

  const patientName = patientInput.value.trim();
  if (!patientName) {
    showToast('Ingresa el nombre del paciente.');
    return;
  }

  const treatment = sanitizeReason(motiveInput.value);
  const fullPaymentChecked = document.querySelector('#modal-full-payment').checked;
  const balance = fullPaymentChecked ? '$0' : formatCurrency(amountInput.value);
  const formattedTime = formatTimeFromInput(timeInput.value);
  const appointmentDate = dateInput.value;
  if (!appointmentDate) {
    showToast('Selecciona la fecha de la cita.');
    return;
  }

  if (editingAppointment) {
    const sourceList = editingAppointment.source === 'today'
      ? todayAppointments
      : editingAppointment.source === 'tomorrow'
        ? tomorrowAppointments
        : otherAppointments;
    const [time, name] = sourceList[editingAppointment.index];
    const updatedAppointment = [formattedTime, name, treatment, balance, appointmentDate];
    sourceList.splice(editingAppointment.index, 1);
    const destination = appointmentDate === getISODate(0)
      ? todayAppointments
      : appointmentDate === getISODate(1)
        ? tomorrowAppointments
        : otherAppointments;
    destination.push(updatedAppointment);
    renderLists();
    closeModal();
    showToast(`Cita de ${name} actualizada.`);
    editingAppointment = null;
    return;
  }

  if (selectedPatient !== null) {
    const patient = todayAppointments[selectedPatient];
    patient[2] = treatment;
    patient[3] = balance;
    todayAppointments.splice(selectedPatient, 1);
    const destination = appointmentDate === getISODate(0)
      ? todayAppointments
      : appointmentDate === getISODate(1)
        ? tomorrowAppointments
        : otherAppointments;
    destination.unshift([formattedTime, patientName, treatment, balance, appointmentDate]);
  } else {
    const appointment = [formattedTime, patientName, treatment, balance, appointmentDate];
    if (appointmentDate === getISODate(0)) {
      todayAppointments.unshift(appointment);
    } else if (appointmentDate === getISODate(1)) {
      tomorrowAppointments.unshift(appointment);
    } else {
      otherAppointments.unshift(appointment);
    }
  }

  renderLists();
  closeModal();
  showToast(selectedPatient !== null
    ? `Nueva cita de ${patientName} confirmada correctamente.`
    : `Cita agendada para ${patientName}.`);
  selectedPatient = null;
  editingAppointment = null;
  patientInput.value = '';
  motiveInput.value = '';
  amountInput.value = '0';
  document.querySelector('#modal-full-payment').checked = false;
  amountInput.disabled = false;
});

document.querySelector('#patient-search').addEventListener('input', event => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('.appointment-row,.tomorrow-row').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
});

document.querySelector('#directory-search').addEventListener('input', event => {
  renderPatientDirectory(event.target.value);
});

renderLists();
renderCalendar(document.querySelector('#dashboard-calendar'));
renderCalendar(document.querySelector('#full-calendar'), true);