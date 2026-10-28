// Utilidades (fechas, dinero, texto, diálogos)

function lockPageScroll() {
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
}

function unlockPageScroll() {
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
}

function updatePageScrollLock() {
  const paymentReceiptOpen = document.querySelector('#payment-receipt-modal')?.classList.contains('open');
  const appointmentOpen = document.querySelector('#appointment-modal')?.classList.contains('open');
  const appointmentNotesOpen = document.querySelector('#appointment-notes-modal')?.classList.contains('open');
  const patientAppointmentsOpen = document.querySelector('#patient-appointments-modal')?.classList.contains('open');
  const patientOpen = document.querySelector('#patient-modal')?.classList.contains('open');
  const dailyAgendaOpen = document.querySelector('#daily-agenda-modal')?.classList.contains('open');
  const confirmationOpen = document.querySelector('#confirmation-modal')?.classList.contains('open');
  
  if (appointmentOpen || appointmentNotesOpen || patientAppointmentsOpen || patientOpen || paymentReceiptOpen || dailyAgendaOpen || confirmationOpen) {
    lockPageScroll();
  } else {
    unlockPageScroll();
  }
}

function generateId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.random() * 16 | 0;
    return (char === 'x' ? value : (value & 0x3 | 0x8)).toString(16);
  });
}

function getISODate(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function sanitizeReason(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH) || 'Consulta';
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '$0';
  const digits = String(value).replace(/[^\d.]/g, '');
  if (!digits) return '$0';
  const numeric = Number(digits);
  if (Number.isNaN(numeric)) return '$0';
  return `$${numeric.toLocaleString('es-MX', {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
}

function formatTimeFromInput(timeValue) {
  const [hours, minutes] = toInputTime(timeValue || '09:00').split(':').map(Number);
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

function toInputTime(timeValue) {
  const value = String(timeValue).trim();
  const twelveHourTime = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHourTime) {
    let hours = Number(twelveHourTime[1]) % 12;
    if (twelveHourTime[3].toUpperCase() === 'PM') hours += 12;
    return `${String(hours).padStart(2, '0')}:${twelveHourTime[2]}`;
  }

  const twentyFourHourTime = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!twentyFourHourTime) return '09:00';
  const hours = Number(twentyFourHourTime[1]);
  const minutes = Number(twentyFourHourTime[2]);
  if (hours > 23 || minutes > 59) return '09:00';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function createAppointmentTimeSlots(dateValue = getISODate(0)) {
  const date = new Date(`${dateValue}T12:00:00`);
  const weekday = date.getDay();
  const dateClosed = clinicClosures.some(closure => closure.closed_on === dateValue || closure.date === dateValue);
  const dayHours = businessHours.find(row => Number(row.day_of_week) === weekday);
  if (dateClosed || dayHours && !dayHours.is_open) return [];
  const opensAt = dayHours?.opens_at || '09:00';
  const closesAt = dayHours?.closes_at || '19:00';
  const start = toMinutes(opensAt);
  const end = toMinutes(closesAt);
  const interval = Number(clinicSettings.slot_minutes) || 30;
  const slots = [];
  for (let minutes = start; minutes <= end; minutes += interval) {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const inBreak = dayHours?.break_starts_at && dayHours?.break_ends_at && toMinutes(time) >= toMinutes(dayHours.break_starts_at) && toMinutes(time) < toMinutes(dayHours.break_ends_at);
    if (!inBreak) slots.push(time);
  }
  return slots;
}

function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function formatDisplayDate(dateValue) {
  if (!dateValue) return 'Fecha pendiente';
  const [year, month, day] = String(dateValue).split('-').map(Number);
  if (!year || !month || !day) return 'Fecha pendiente';
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInitials(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function showConfirmationDialog({ title, message, confirmLabel = 'Continuar', input = null }) {
  const modal = document.querySelector('#confirmation-modal');
  const titleElement = document.querySelector('#confirmation-title');
  const messageElement = document.querySelector('#confirmation-message');
  const inputLabel = document.querySelector('#confirmation-input-label');
  const inputCaption = document.querySelector('#confirmation-input-caption');
  const inputElement = document.querySelector('#confirmation-input');
  const cancelButton = document.querySelector('#confirmation-cancel');
  const acceptButton = document.querySelector('#confirmation-accept');
  if (!modal || !titleElement || !messageElement || !inputLabel || !inputCaption || !inputElement || !cancelButton || !acceptButton) {
    return Promise.reject(new Error('No se pudo abrir el diálogo de confirmación.'));
  }

  titleElement.textContent = title;
  messageElement.textContent = message;
  acceptButton.textContent = confirmLabel;
  inputLabel.hidden = !input;
  inputElement.required = Boolean(input);
  inputElement.value = input ? String(input.value) : '';
  inputElement.setCustomValidity('');
  if (input) {
    inputCaption.textContent = input.label;
    inputElement.min = String(input.min);
    inputElement.max = String(input.max);
    inputElement.step = '1';
  } else {
    inputElement.removeAttribute('min');
    inputElement.removeAttribute('max');
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();

  return new Promise(resolve => {
    const previouslyFocused = document.activeElement;
    const finish = confirmed => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      cancelButton.removeEventListener('click', cancel);
      acceptButton.removeEventListener('click', accept);
      modal.removeEventListener('click', handleBackdropClick);
      document.removeEventListener('keydown', handleKeydown);
      updatePageScrollLock();
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
      resolve({ confirmed, value: input ? Number(inputElement.value) : null });
    };
    const cancel = () => finish(false);
    const accept = () => {
      if (input) {
        inputElement.setCustomValidity('');
        const value = Number(inputElement.value);
        if (!Number.isInteger(value) || value < input.min || value > input.max) {
          inputElement.setCustomValidity(`Ingresa un número del ${input.min} al ${input.max}.`);
          inputElement.reportValidity();
          return;
        }
      }
      finish(true);
    };
    const handleBackdropClick = event => {
      if (event.target === modal) cancel();
    };
    const handleKeydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      } else if (event.key === 'Enter' && event.target === inputElement) {
        event.preventDefault();
        accept();
      }
    };

    cancelButton.addEventListener('click', cancel);
    acceptButton.addEventListener('click', accept);
    modal.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleKeydown);
    (input ? inputElement : cancelButton).focus();
  });
}

function getPatientFullName(patient) {
  return `${patient?.nombre || ''} ${patient?.apellidos || ''}`.replace(/\s+/g, ' ').trim();
}

function normalizeName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es-MX');
}

function normalizeSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es-MX');
}

function getNumericAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isNaN(numeric) ? 0 : Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function formatFileSize(size) {
  if (!size) return '0 KB';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getFirstDayMonday(year, month) {
  let day = new Date(year, month, 1).getDay();
  return (day === 0 ? 7 : day) - 1;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function toMinutes(time) {
  const [hours, minutes] = toInputTime(time).split(':').map(Number);
  return hours * 60 + minutes;
}
