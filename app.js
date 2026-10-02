const todayAppointments = [
  ['09:00 AM', 'Ana Ramírez', 'Control de brackets', '$500', 'AR', 'avatar-purple'],
  ['10:00 AM', 'Jorge López', 'Ajuste mensual', '$1,200', 'JL', 'avatar-blue'],
  ['11:30 AM', 'Sofía Morales', 'Primera valoración', '$0', 'SM', 'avatar-orange'],
  ['12:30 PM', 'Daniel Ruiz', 'Cambio de ligas', '$350', 'DR', 'avatar-green'],
  ['01:30 PM', 'Paola Torres', 'Revisión clínica', '$500', 'PT', 'avatar-purple'],
  ['03:00 PM', 'Carlos Vega', 'Control de brackets', '$700', 'CV', 'avatar-blue'],
  ['04:00 PM', 'Mariana Díaz', 'Ajuste mensual', '$450', 'MD', 'avatar-orange'],
  ['05:00 PM', 'Ricardo Cruz', 'Retenedor', '$1,000', 'RC', 'avatar-green'],
  ['05:30 PM', 'Laura Pérez', 'Revisión ortodoncia', '$300', 'LP', 'avatar-purple'],
  ['06:00 PM', 'José Núñez', 'Ajuste mensual', '$600', 'JN', 'avatar-blue'],
  ['06:30 PM', 'Mónica Reyes', 'Control de brackets', '$500', 'MR', 'avatar-orange']
];

const tomorrowAppointments = [
  ['09:00 AM', 'Carla Hernández', 'Limpieza dental', '$500', 'CH', 'avatar-purple'],
  ['09:30 AM', 'Carlos Pérez', 'Control de brackets', '$300', 'CP', 'avatar-blue'],
  ['10:00 AM', 'Mariana Díaz', 'Revisión de ortodoncia', '$0', 'MD', 'avatar-orange'],
  ['11:00 AM', 'Pedro Sánchez', 'Cambio de ligas', '$450', 'PS', 'avatar-green'],
  ['12:00 PM', 'Andrea Fuentes', 'Ajuste mensual', '$700', 'AF', 'avatar-purple'],
  ['01:00 PM', 'Luis Castro', 'Primera valoración', '$0', 'LC', 'avatar-blue'],
  ['03:00 PM', 'Elena Ruiz', 'Control de brackets', '$500', 'ER', 'avatar-orange'],
  ['04:00 PM', 'Marco Silva', 'Revisión clínica', '$450', 'MS', 'avatar-green'],
  ['05:00 PM', 'Valeria Mora', 'Ajuste mensual', '$650', 'VM', 'avatar-purple'],
  ['06:00 PM', 'Bruno Flores', 'Cambio de ligas', '$300', 'BF', 'avatar-blue'],
  ['06:30 PM', 'Karen Luna', 'Control de brackets', '$500', 'KL', 'avatar-orange']
];

const pages = {
  centro: ['Centro de Mando', 'Páginas / Dashboard'],
  calendario: ['Calendario', 'Páginas / Calendario'],
  citas: ['Citas', 'Páginas / Citas'],
  pacientes: ['Pacientes', 'Páginas / Pacientes'],
  finanzas: ['Finanzas', 'Páginas / Finanzas'],
  administrar: ['Administrar', 'Páginas / Administrar']
};

let selectedPatient = null, toastTimer;

function statusDots(name) {
  return `
    <div>
      <div class="status-dots" role="group" aria-label="Estatus de ${name}">
        <button class="status-dot pending selected" data-status="Pendiente" title="Pendiente" aria-label="Pendiente"></button>
        <button class="status-dot confirmed" data-status="Confirmada" title="Confirmada" aria-label="Confirmada"></button>
        <button class="status-dot postponed" data-status="Pospuesta" title="Pospuesta" aria-label="Pospuesta"></button>
      </div>
      <span class="status-text">Pendiente</span>
    </div>`;
}

function todayMarkup(item, index) {
  const [time, name, treatment, balance, initials, color] = item;
  return `
    <div class="appointment-row" data-type="today" data-index="${index}">
      <div class="time">${time}<small>Hoy</small></div>
      <div class="person">
        <span class="person-avatar ${color}">${initials}</span>
        <div><strong>${name}</strong><small>${treatment}</small></div>
      </div>
      <div class="charge">${balance}<button class="charge-button" data-name="${name}">Cobrar</button></div>
      ${statusDots(name)}
      <button class="new-followup" data-new-appointment="${index}">Cita nueva</button>
    </div>`;
}

function tomorrowMarkup(item) {
  const [time, name, treatment, balance, initials, color] = item;
  return `
    <div class="tomorrow-row">
      <span class="tomorrow-point"></span>
      <div class="person">
        <span class="person-avatar ${color}">${initials}</span>
        <div><strong>${name} · ${time}</strong><small>${treatment} · Saldo: ${balance}</small></div>
      </div>
      <button class="whatsapp" data-reminder="${name}">◔ Recordar</button>
    </div>`;
}

function renderLists() {
  document.querySelector('#today-list').innerHTML = todayAppointments.map(todayMarkup).join('');
  document.querySelector('#tomorrow-list').innerHTML = tomorrowAppointments.map(tomorrowMarkup).join('');
  document.querySelector('#all-appointments').innerHTML = todayAppointments.map(todayMarkup).join('');
  document.querySelector('#today-count').textContent = todayAppointments.length;
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
  document.querySelector('#breadcrumb').innerHTML = pages[page][1].replace('/', '<b>/</b>');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openModal(index) {
  selectedPatient = index;
  const appointment = todayAppointments[index];
  document.querySelector('#modal-patient').value = appointment[1];
  document.querySelector('#modal-date').value = '2026-10-01';
  document.querySelector('#modal-time').value = '09:00';
  document.querySelector('#appointment-modal').classList.add('open');
  document.querySelector('#appointment-modal').setAttribute('aria-hidden', 'false');
}

function closeModal() {
  document.querySelector('#appointment-modal').classList.remove('open');
  document.querySelector('#appointment-modal').setAttribute('aria-hidden', 'true');
}

document.addEventListener('click', event => {
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
    showToast(`Recordatorio preparado para ${reminder.dataset.reminder}.`);
    return;
  }

  if (event.target.closest('#new-appointment')) {
    showToast('Selecciona a un paciente en Citas de Hoy para generar su siguiente cita.');
  }

  if (event.target.closest('#modal-close') || event.target === document.querySelector('#appointment-modal')) {
    closeModal();
  }
});

document.querySelector('#appointment-form').addEventListener('submit', event => {
  event.preventDefault();
  if (selectedPatient === null) return;
  
  const patient = todayAppointments[selectedPatient];
  todayAppointments.splice(selectedPatient, 1);
  renderLists();
  closeModal();
  showToast(`Nueva cita de ${patient[1]} confirmada correctamente.`);
  selectedPatient = null;
});

document.querySelector('#patient-search').addEventListener('input', event => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('.appointment-row,.tomorrow-row').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
});

renderLists();
renderCalendar(document.querySelector('#dashboard-calendar'));
renderCalendar(document.querySelector('#full-calendar'), true);