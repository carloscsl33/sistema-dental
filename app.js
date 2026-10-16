const MAX_REASON_LENGTH = 32;

const pages = {
  centro: ['Centro de Mando'],
  citas: ['Citas'],
  pacientes: ['Pacientes'],
  administrar: ['Administrar']
};

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

const PATIENTS_STORAGE_KEY = 'dentalClinicPatients';
const APPOINTMENTS_STORAGE_KEY = 'dentalClinicAppointments';
const BLOCKED_SLOTS_STORAGE_KEY = 'dentalClinicBlockedAppointmentSlots';
const STORAGE_VERSION_KEY = 'dentalClinicStorageVersion';
const STORAGE_VERSION = '5';
const CLINICAL_FILES_DATABASE = 'dentalClinicFiles';
const CLINICAL_FILES_STORE = 'files';
const CLINICAL_SERVICE_OPTIONS = [
  'Ortodoncia / Brackets',
  'Limpieza dental',
  'Extracción / Cirugía',
  'Endodoncia',
  'Valoración inicial',
  'Otro...'
];

const todayAppointments = [];
const tomorrowAppointments = [];
const otherAppointments = [];
let blockedAppointmentSlots = [];

let selectedPatient = null;
let selectedPatientId = null;
let followUpAppointmentId = null;
let rescheduleAppointmentId = null;
let toastTimer = null;
let editingAppointment = null;
let editingPatient = null;
let pendingClinicalFiles = [];
let clinicalFilesDatabasePromise = null;
let activeAppointmentFilter = 'all';
let activeAppointmentSort = 'recent';

const currentDate = new Date();
let calendarMonth = currentDate.getMonth();
let calendarYear = currentDate.getFullYear();
let patients = [];
let globalSearchQuery = '';

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

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`No se pudo guardar ${key}:`, error);
    showToast('No se pudieron guardar los cambios.');
    return false;
  }
}

function readFromStorage(key, fallback = []) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (error) {
    console.error(`No se pudo leer ${key}:`, error);
    return fallback;
  }
}

function savePatients() {
  return saveToStorage(PATIENTS_STORAGE_KEY, patients);
}

function deleteClinicalFiles(fileIds) {
  if (!fileIds.length) return Promise.resolve();
  return openClinicalFilesDatabase().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(CLINICAL_FILES_STORE, 'readwrite');
    const store = transaction.objectStore(CLINICAL_FILES_STORE);
    fileIds.forEach(id => store.delete(id));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('No se pudieron eliminar los archivos clínicos.'));
    transaction.onabort = () => reject(transaction.error || new Error('Se canceló la eliminación de los archivos clínicos.'));
  }));
}

function openClinicalFilesDatabase() {
  if (!window.indexedDB) {
    return Promise.reject(new Error('El navegador no admite almacenamiento local de archivos.'));
  }
  if (clinicalFilesDatabasePromise) return clinicalFilesDatabasePromise;

  clinicalFilesDatabasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(CLINICAL_FILES_DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CLINICAL_FILES_STORE)) {
        database.createObjectStore(CLINICAL_FILES_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento de archivos.'));
  }).catch(error => {
    clinicalFilesDatabasePromise = null;
    throw error;
  });

  return clinicalFilesDatabasePromise;
}

async function storeClinicalFile(id, file) {
  const database = await openClinicalFilesDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(CLINICAL_FILES_STORE, 'readwrite');
    transaction.objectStore(CLINICAL_FILES_STORE).put({ id, blob: file });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar el archivo.'));
    transaction.onabort = () => reject(transaction.error || new Error('Se canceló el guardado del archivo.'));
  });
}

async function getClinicalFile(id) {
  const database = await openClinicalFilesDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(CLINICAL_FILES_STORE, 'readonly')
      .objectStore(CLINICAL_FILES_STORE)
      .get(id);
    request.onsuccess = () => resolve(request.result?.blob || null);
    request.onerror = () => reject(request.error || new Error('No se pudo leer el archivo.'));
  });
}

function loadPatients() {
  const parsed = readFromStorage(PATIENTS_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed.map(normalizePatient).filter(Boolean) : [];
}

function saveAppointments() {
  return saveToStorage(APPOINTMENTS_STORAGE_KEY, getAppointments().map(({ appointment }) => appointment));
}

function loadAppointments() {
  const parsed = readFromStorage(APPOINTMENTS_STORAGE_KEY, []);
  todayAppointments.length = 0;
  tomorrowAppointments.length = 0;
  otherAppointments.length = 0;
  
  if (Array.isArray(parsed)) {
    parsed.forEach(raw => {
      const appt = normalizeAppointment(raw);
      if (appt) addAppointmentToDateCollection(appt);
    });
  }
}

function loadBlockedAppointmentSlots() {
  const parsed = readFromStorage(BLOCKED_SLOTS_STORAGE_KEY, []);
  blockedAppointmentSlots = Array.isArray(parsed)
    ? parsed.filter(slot => slot && /^\d{4}-\d{2}-\d{2}$/.test(slot.date) && /^\d{2}:\d{2}$/.test(slot.time)).map(slot => ({
      date: slot.date,
      time: slot.time,
      count: Math.min(3, Math.max(1, Number.isInteger(Number(slot.count)) ? Number(slot.count) : 3))
    }))
    : [];
}

function saveBlockedAppointmentSlots() {
  return saveToStorage(BLOCKED_SLOTS_STORAGE_KEY, blockedAppointmentSlots);
}

function getBlockedAppointmentSlotCount(date, time) {
  return blockedAppointmentSlots
    .filter(slot => slot.date === date && slot.time === time)
    .reduce((total, slot) => total + Math.max(1, Number(slot.count) || 3), 0);
}

function normalizePatient(patient) {
  if (!patient || typeof patient !== 'object') return null;
  return {
    id: patient.id || generateId('patient'),
    nombre: String(patient.nombre || '').trim(),
    apellidos: String(patient.apellidos || '').trim(),
    fechaNacimiento: patient.fechaNacimiento || '',
    sexo: patient.sexo || '',
    telefono: patient.telefono || '',
    correo: patient.correo || '',
    direccion: patient.direccion || '',
    contactoEmergencia: patient.contactoEmergencia || '',
    parentescoEmergencia: patient.parentescoEmergencia || '',
    telefonoEmergencia: patient.telefonoEmergencia || '',
    antecedentesMedicos: patient.antecedentesMedicos || '',
    alergias: patient.alergias || '',
    medicamentos: patient.medicamentos || '',
    tipoSangre: patient.tipoSangre || '',
    observacionesMedicas: patient.observacionesMedicas || '',
    tratamientoActual: patient.tratamientoActual || '',
    diagnostico: patient.diagnostico || '',
    tratamientoServicios: Array.isArray(patient.tratamientoServicios)
      ? patient.tratamientoServicios.filter(service => service && typeof service === 'object').map(service => ({
        tratamiento: String(service.tratamiento || ''),
        diagnostico: String(service.diagnostico || ''),
        costo: service.costo ?? ''
      }))
      : [],
    avanceClinico: patient.avanceClinico || '',
    fechaRegistroClinico: patient.fechaRegistroClinico || '',
    archivosClinicos: Array.isArray(patient.archivosClinicos) ? patient.archivosClinicos : [],
    historialClinico: Array.isArray(patient.historialClinico) ? patient.historialClinico : [],
    historialFinanciero: Array.isArray(patient.historialFinanciero) ? patient.historialFinanciero : [],
    createdAt: patient.createdAt || new Date().toISOString()
  };
}

function normalizeAppointment(appointment) {
  if (!Array.isArray(appointment)) return null;
  
  const time = appointment[0] || '09:00 AM';
  const name = String(appointment[1] || '').trim();
  const reason = sanitizeReason(appointment[2]);
  const balance = appointment[3] || '$0';
  const date = appointment[4] || getISODate(0);
  const status = appointment[5] || 'En espera';
  const id = appointment[6] || generateId('appointment');
  const patientId = appointment[7] || null;
  
  const totalAmount = appointment[8] !== undefined ? getNumericAmount(appointment[8]) : getNumericAmount(balance);
  const paidAmount = appointment[9] !== undefined ? getNumericAmount(appointment[9]) : Math.max(totalAmount - getNumericAmount(balance), 0);
  const paymentStatus = appointment[10] || (getNumericAmount(balance) === 0 && totalAmount > 0 ? 'Completo' : paidAmount > 0 ? 'Parcial' : 'No pagado');
  const observations = Array.isArray(appointment[11])
    ? appointment[11]
      .filter(entry => entry && typeof entry.text === 'string' && entry.text.trim())
      .map(entry => ({
        id: String(entry.id || generateId('observation')),
        text: entry.text.trim(),
        createdAt: String(entry.createdAt || '')
      }))
    : [];

  return [time, name, reason, balance, date, status, id, patientId, totalAmount, paidAmount, paymentStatus, observations];
}

function createEmptyPatient() {
  return {
    id: generateId('patient'),
    nombre: '',
    apellidos: '',
    fechaNacimiento: '',
    sexo: '',
    telefono: '',
    correo: '',
    direccion: '',
    contactoEmergencia: '',
    parentescoEmergencia: '',
    telefonoEmergencia: '',
    antecedentesMedicos: '',
    alergias: '',
    medicamentos: '',
    tipoSangre: '',
    observacionesMedicas: '',
    tratamientoActual: '',
    diagnostico: '',
    tratamientoServicios: [],
    avanceClinico: '',
    fechaRegistroClinico: '',
    archivosClinicos: [],
    historialClinico: [],
    historialFinanciero: [],
    createdAt: new Date().toISOString()
  };
}

function createPatientFromAppointmentName(fullName) {
  const cleanName = String(fullName || '').replace(/\s+/g, ' ').trim();
  if (!cleanName) return null;
  
  const parts = cleanName.split(' ');
  let nombre = cleanName;
  let apellidos = '';
  
  if (parts.length >= 2) {
    apellidos = parts.slice(-2).join(' ');
    nombre = parts.slice(0, -2).join(' ');
    if (!nombre) {
      nombre = parts.slice(0, -1).join(' ');
      apellidos = parts[parts.length - 1];
    }
  }
  
  const patient = createEmptyPatient();
  patient.nombre = nombre || cleanName;
  patient.apellidos = apellidos;
  patient.fechaRegistroClinico = getISODate(0);
  
  patients.push(patient);
  savePatients();
  
  return patient;
}

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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

function setAppointmentMotive(value = '') {
  const motiveSelect = document.querySelector('#modal-motive');
  const customLabel = document.querySelector('#modal-motive-custom-label');
  const customInput = document.querySelector('#modal-motive-custom');
  if (!motiveSelect || !customLabel || !customInput) return;

  const knownMotive = Array.from(motiveSelect.options).some(option => option.value === value && value !== '' && value !== 'Otro');
  if (knownMotive) {
    motiveSelect.value = value;
    customInput.value = '';
  } else if (value) {
    motiveSelect.value = 'Otro';
    customInput.value = String(value).slice(0, MAX_REASON_LENGTH);
  } else {
    motiveSelect.value = '';
    customInput.value = '';
  }

  const isCustom = motiveSelect.value === 'Otro';
  customLabel.hidden = !isCustom;
  customInput.required = isCustom;
  customInput.disabled = !isCustom;
}

function getAppointmentMotive() {
  const motiveSelect = document.querySelector('#modal-motive');
  const customInput = document.querySelector('#modal-motive-custom');
  return motiveSelect?.value === 'Otro' ? customInput?.value.trim() || '' : motiveSelect?.value || '';
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
  if (!timeValue) return '09:00 AM';
  const [hours, minutes] = timeValue.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function toInputTime(timeValue) {
  const value = String(timeValue).trim();
  const twelveHourTime = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHourTime) {
    let hours = Number(twelveHourTime[1]) % 12;
    if (twelveHourTime[3].toUpperCase() === 'PM') hours += 12;
    return `${String(hours).padStart(2, '0')}:${twelveHourTime[2]}`;
  }

  const twentyFourHourTime = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHourTime) return '09:00';
  const hours = Number(twentyFourHourTime[1]);
  const minutes = Number(twentyFourHourTime[2]);
  if (hours > 23 || minutes > 59) return '09:00';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function createAppointmentTimeSlots() {
  const slots = [];
  for (let minutes = 9 * 60; minutes <= 19 * 60; minutes += 30) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  return slots;
}

function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isAppointmentTimeInPast(date, time) {
  if (date < getISODate(0)) return true;
  return date === getISODate(0) && toMinutes(time) < getCurrentMinutes();
}

function patientHasAppointmentOnDate(patient, date, excludedAppointmentId = null) {
  const patientName = getPatientFullName(patient);
  return getAppointments().some(({ appointment }) => {
    if (appointment[4] !== date || appointment[5] === 'Cancelada' || appointment[6] === excludedAppointmentId) {
      return false;
    }
    return patient.id
      ? appointment[7] === patient.id ||
        (!appointment[7] && normalizeName(appointment[1]) === normalizeName(patientName))
      : normalizeName(appointment[1]) === normalizeName(patientName);
  });
}

function getAppointmentTimeSlotCount(date, time) {
  const appointmentsCount = getAppointments().filter(({ appointment }) => {
    if (appointment[4] !== date || appointment[5] === 'Cancelada') return false;
    if (editingAppointment && appointment[6] === editingAppointment.id) return false;
    return toInputTime(appointment[0]) === time;
  }).length;
  return appointmentsCount + getBlockedAppointmentSlotCount(date, time);
}

function refreshAppointmentTimeSlots(preferredTime = '') {
  const timeSelect = document.querySelector('#modal-time');
  const dateInput = document.querySelector('#modal-date');
  const confirmButton = document.querySelector('#confirm-appointment');
  const help = document.querySelector('#modal-time-help');
  const morningSlots = document.querySelector('#morning-time-slots');
  const afternoonSlots = document.querySelector('#afternoon-time-slots');
  if (!timeSelect || !dateInput || !morningSlots || !afternoonSlots) return;

  const date = dateInput.value;
  dateInput.min = getISODate(0);
  const slots = createAppointmentTimeSlots().map(time => {
    const count = getAppointmentTimeSlotCount(date, time);
    const isPast = isAppointmentTimeInPast(date, time);
    const available = isPast ? 0 : Math.max(3 - count, 0);
    const isFull = count >= 3;
    return {
      time,
      count,
      available,
      disabled: isFull || isPast,
      isPast,
      label: `${formatTimeFromInput(time).replace(/^0/, '').toLowerCase()}, ${isPast ? 'horario no disponible' : isFull ? 'sin lugares disponibles' : `${available} ${available === 1 ? 'lugar disponible' : 'lugares disponibles'}`}`
    };
  });

  const availablePreferred = slots.find(slot => slot.time === preferredTime && !slot.disabled);
  const firstAvailable = slots.find(slot => !slot.disabled);
  const selectedTime = (availablePreferred || firstAvailable)?.time || '';
  timeSelect.replaceChildren(...slots.map(slot => {
    const option = document.createElement('option');
    option.value = slot.time;
    option.textContent = slot.label;
    option.disabled = slot.disabled;
    option.selected = slot.time === selectedTime;
    return option;
  }));
  timeSelect.value = selectedTime;
  timeSelect.disabled = !selectedTime;
  if (confirmButton) confirmButton.disabled = !selectedTime;
  morningSlots.replaceChildren();
  afternoonSlots.replaceChildren();
  slots.forEach(slot => {
    const button = document.createElement('button');
    const isSelected = slot.time === selectedTime;
    const timeLabel = formatTimeFromInput(slot.time).replace(/^0/, '').toLowerCase();
    button.type = 'button';
    button.className = 'appointment-time-slot';
    button.dataset.appointmentTime = slot.time;
    button.disabled = slot.disabled;
    button.setAttribute('aria-pressed', String(isSelected));
    button.setAttribute('aria-label', slot.label);
    button.title = slot.label;

    const timeText = document.createElement('span');
    timeText.className = 'appointment-time-value';
    timeText.textContent = timeLabel;
    const availability = document.createElement('span');
    availability.className = 'appointment-time-availability';
    availability.textContent = slot.isPast ? 'No disponible' : slot.disabled ? 'Lleno' : `${slot.available} ${slot.available === 1 ? 'lugar' : 'lugares'}`;
    button.append(timeText, availability);
    (Number(slot.time.slice(0, 2)) < 12 ? morningSlots : afternoonSlots).append(button);
  });

  if (help) {
    if (!selectedTime) {
      help.textContent = date < getISODate(0)
        ? 'No se pueden agendar citas en fechas pasadas.'
        : date === getISODate(0) && slots.every(slot => slot.isPast || slot.count >= 3)
          ? 'Ya no hay horarios disponibles para el resto del día.'
          : 'No hay horarios disponibles en esta fecha.';
    } else {
      const fullSlots = slots.filter(slot => slot.disabled).length;
      const availableSpaces = slots.reduce((total, slot) => total + slot.available, 0);
      help.textContent = `${date === getISODate(0) ? 'Horarios desde la hora actual · ' : ''}Máximo 3 pacientes por horario · ${availableSpaces} ${availableSpaces === 1 ? 'lugar disponible' : 'lugares disponibles'} en total · ${fullSlots} horarios no disponibles`;
    }
  }
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

function setGlobalSearchQuery(query) {
  globalSearchQuery = normalizeSearchText(query);
}

function getSearchableAppointmentText(appointment) {
  if (!appointment) return '';
  const [time, name, treatment, balance, date, status] = appointment;
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
    .map(a => [a[1], a[2], a[5]].filter(Boolean).join(' '))
    .join(' ');
    
  return normalizeSearchText([
    getPatientFullName(patient),
    patient.telefono,
    patient.correo,
    patient.tratamientoActual,
    patient.diagnostico,
    patient.avanceClinico,
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

function findPatientByName(name) {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  return patients.find(p => normalizeName(getPatientFullName(p)) === normalized) || null;
}

function findPatientById(id) {
  return id ? patients.find(p => p.id === id) || null : null;
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
  selectedPatient = null;
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
  
  selectedPatient = patient;
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
    selectedPatient = null;
    selectedPatientId = null;
    showToast('Ingresa el nombre del paciente.');
    return null;
  }
  
  const patientId = hiddenId?.value || selectedPatientId || '';
  
  if (patientId) {
    const patient = findPatientById(patientId);
    if (patient && normalizeSearchText(typedName) === normalizeSearchText(getPatientFullName(patient))) {
      selectedPatient = patient;
      selectedPatientId = patient.id;
      if (hiddenId) hiddenId.value = patient.id;
      return patient;
    }
    
    if (hiddenId) hiddenId.value = '';
    selectedPatient = null;
    selectedPatientId = null;
  }
  
  const existingPatient = findPatientByName(typedName);
  if (existingPatient) {
    selectedPatient = existingPatient;
    selectedPatientId = existingPatient.id;
    if (hiddenId) hiddenId.value = existingPatient.id;
    return existingPatient;
  }
  
  return { isNewPatient: true, nombre: typedName };
}

function getAppointments() {
  return [
    ...todayAppointments.map((appointment, index) => ({ appointment, index, source: 'today' })),
    ...tomorrowAppointments.map((appointment, index) => ({ appointment, index, source: 'tomorrow' })),
    ...otherAppointments.map((appointment, index) => ({ appointment, index, source: 'other' }))
  ];
}

function getAppointmentList(source) {
  if (source === 'today') return todayAppointments;
  if (source === 'tomorrow') return tomorrowAppointments;
  return otherAppointments;
}

function getAppointmentCollectionByDate(date) {
  if (date === getISODate(0)) return todayAppointments;
  if (date === getISODate(1)) return tomorrowAppointments;
  return otherAppointments;
}

function addAppointmentToDateCollection(appointment, atBeginning = false) {
  const collection = getAppointmentCollectionByDate(appointment[4]);
  if (atBeginning) {
    collection.unshift(appointment);
  } else {
    collection.push(appointment);
  }
}

function rebuildAppointmentCollections(appointments) {
  todayAppointments.length = 0;
  tomorrowAppointments.length = 0;
  otherAppointments.length = 0;
  appointments.forEach(a => addAppointmentToDateCollection(a));
}

function getStatusClass(status) {
  if (status === 'Finalizada') return 'confirmed';
  if (status === 'Cancelada') return 'postponed';
  return 'pending';
}

function renderAppointmentObservations(appointment) {
  const observations = Array.isArray(appointment[11]) ? appointment[11] : [];
  if (!observations.length) {
    return '<p class="empty-state">Todavía no hay avances u observaciones para esta cita.</p>';
  }

  return observations.slice().reverse().map(observation => {
    const createdAt = observation.createdAt ? new Date(observation.createdAt) : null;
    const hasValidDate = createdAt && !Number.isNaN(createdAt.getTime());
    const createdDate = hasValidDate
      ? createdAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Fecha no registrada';
    const createdTime = hasValidDate
      ? createdAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      : '';
    return `<article class="appointment-observation">
      <small>${escapeHTML(createdDate)}${createdTime ? ` · ${escapeHTML(createdTime)}` : ''}</small>
      <p>${escapeHTML(observation.text)}</p>
    </article>`;
  }).join('');
}

function sortPatientAppointments(appointments) {
  const today = getISODate(0);
  const bySoonest = (a, b) => a[4].localeCompare(b[4]) || toMinutes(a[0]) - toMinutes(b[0]);
  const todayAppointments = appointments
    .filter(appointment => appointment[4] === today)
    .sort((a, b) => toMinutes(a[0]) - toMinutes(b[0]));
  const upcomingAppointments = appointments
    .filter(appointment => appointment[4] > today)
    .sort(bySoonest);
  const pastAppointments = appointments
    .filter(appointment => appointment[4] < today)
    .sort((a, b) => b[4].localeCompare(a[4]) || toMinutes(b[0]) - toMinutes(a[0]));

  return [...todayAppointments, ...upcomingAppointments, ...pastAppointments];
}

function renderPatientAppointmentRows(appointments) {
  return appointments.map(appointment => {
    const isToday = appointment[4] === getISODate(0);
    const hasObservation = Array.isArray(appointment[11]) && appointment[11].length > 0;
    const canAddObservation = appointment[4] === getISODate(0) && appointment[5] !== 'Cancelada';
    return `<div class="patient-appointment-entry ${isToday ? 'is-today-appointment' : ''}">
      <span>
        <strong>${escapeHTML(appointment[2])}${isToday ? ' <span class="today-appointment-badge">HOY</span>' : ''}</strong>
        <small>${formatDisplayDate(appointment[4])} · ${escapeHTML(appointment[0])} · ${escapeHTML(appointment[5] || 'En espera')}</small>
        ${hasObservation ? '<small class="appointment-observation-count">Avance registrado</small>' : ''}
      </span>
      <div class="patient-appointment-actions">
        ${hasObservation
          ? `<button type="button" class="patient-info-button" data-appointment-notes="${escapeHTML(appointment[6])}">Ver avance</button>`
          : canAddObservation
            ? `<button type="button" class="patient-info-button" data-appointment-notes="${escapeHTML(appointment[6])}">Agregar avance</button>`
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

function openAppointmentNotes(appointmentId) {
  const appointment = getAppointments().find(({ appointment: item }) => item[6] === appointmentId)?.appointment;
  const modal = document.querySelector('#appointment-notes-modal');
  const form = document.querySelector('#appointment-notes-form');
  const history = document.querySelector('#appointment-notes-history');
  if (!appointment || !modal || !form || !history) {
    showToast('No se encontró la cita para registrar avances.');
    return;
  }

  ensureAppointmentId(appointment);
  const patient = resolveAppointmentPatient(appointment);
  const patientName = patient ? getPatientFullName(patient) : appointment[1];
  const appointmentDetails = document.querySelector('#appointment-notes-appointment');
  const title = document.querySelector('#appointment-notes-title');
  const appointmentIdInput = document.querySelector('#appointment-notes-id');
  const notesInput = document.querySelector('#appointment-notes-text');
  const notesLabel = document.querySelector('#appointment-notes-label');
  const saveButton = document.querySelector('#appointment-notes-save');
  const editButton = document.querySelector('#appointment-notes-edit');
  const cancelEditButton = document.querySelector('#appointment-notes-cancel-edit');
  const cancelButton = document.querySelector('#appointment-notes-cancel');
  const actions = document.querySelector('.appointment-notes-actions');
  const hasObservation = Array.isArray(appointment[11]) && appointment[11].length > 0;
  form.dataset.editingObservation = 'false';
  modal.classList.toggle('is-viewing-observation', hasObservation);
  form.classList.toggle('is-viewing-observation', hasObservation);
  if (title) title.textContent = hasObservation ? 'Avance registrado' : 'Registrar avance';
  if (appointmentDetails) {
    appointmentDetails.textContent = `${patientName} · ${formatDisplayDate(appointment[4])} · ${appointment[0]} · ${appointment[2]}`;
  }
  if (appointmentIdInput) appointmentIdInput.value = appointmentId;
  if (notesInput) notesInput.value = '';
  if (notesLabel) notesLabel.hidden = hasObservation;
  if (saveButton) saveButton.hidden = hasObservation;
  if (editButton) editButton.hidden = !hasObservation;
  if (cancelEditButton) cancelEditButton.hidden = true;
  if (cancelButton) cancelButton.textContent = 'Cerrar';
  if (actions) actions.hidden = false;
  history.innerHTML = renderAppointmentObservations(appointment);
  history.hidden = false;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
  if (!hasObservation) notesInput?.focus();
}

function closeAppointmentNotes() {
  const modal = document.querySelector('#appointment-notes-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.classList.remove('is-viewing-observation');
  const form = document.querySelector('#appointment-notes-form');
  form?.classList.remove('is-viewing-observation');
  if (form) form.dataset.editingObservation = 'false';
  modal.setAttribute('aria-hidden', 'true');
  document.querySelector('#appointment-notes-form')?.reset();
  updatePageScrollLock();
}

function ensureAppointmentId(appointment) {
  if (!appointment[6]) appointment[6] = generateId('appointment');
  if (!['En espera', 'Finalizada', 'Cancelada'].includes(appointment[5])) {
    appointment[5] = 'En espera';
  }
  return appointment[6];
}

function resolveAppointmentPatient(appointment) {
  if (!appointment) return null;
  
  if (appointment[7]) {
    const patient = findPatientById(appointment[7]);
    if (patient) return patient;
  }
  
  const patient = findPatientByName(appointment[1]);
  if (patient) {
    appointment[7] = patient.id;
    return patient;
  }
  
  return null;
}

function getPatientAppointments(patient) {
  if (!patient) return [];
  
  return getAppointments().filter(({ appointment }) => {
    if (appointment[7] === patient.id) return true;
    
    if (!appointment[7] && normalizeName(appointment[1]) === normalizeName(getPatientFullName(patient))) {
      appointment[7] = patient.id;
      return true;
    }
    
    return false;
  }).map(({ appointment }) => appointment);
}

function statusActions(name, appointmentId) {
  const currentStatus = getAppointments().find(({ appointment }) => appointment[6] === appointmentId)?.appointment?.[5] || 'En espera';
  return `
    <div class="appointment-status">
      <span class="appointment-status-current ${getStatusClass(currentStatus)}">${escapeHTML(currentStatus)}</span>
      <div class="status-actions" role="group" aria-label="Cambiar estatus de la cita de ${escapeHTML(name)}">
        <button class="status-action finish ${currentStatus === 'Finalizada' ? 'selected' : ''}" data-status="Finalizada" data-appointment-status="${escapeHTML(appointmentId)}" aria-pressed="${currentStatus === 'Finalizada'}">Finalizar</button>
        <button class="status-action pending ${currentStatus === 'En espera' ? 'selected' : ''}" data-status="En espera" data-appointment-status="${escapeHTML(appointmentId)}" aria-pressed="${currentStatus === 'En espera'}">En espera</button>
        <button class="status-action cancel ${currentStatus === 'Cancelada' ? 'selected' : ''}" data-status="Cancelada" data-appointment-status="${escapeHTML(appointmentId)}" aria-pressed="${currentStatus === 'Cancelada'}">Cancelar</button>
      </div>
    </div>
  `;
}

function todayMarkup(item) {
  const [time, name, treatment, balance, date, status, appointmentId] = item;
  ensureAppointmentId(item);
  return `
    <div class="appointment-row is-today-appointment" data-type="today">
      <div class="time">${escapeHTML(time)}</div>
      <div class="person">
        <div>
          <strong>${escapeHTML(name)} <span class="today-appointment-badge">HOY</span></strong>
          <small>${escapeHTML(treatment)}</small>
        </div>
      </div>
      <div class="charge">
        ${escapeHTML(balance || '$0')}
      </div>
      ${statusActions(name, appointmentId)}
    </div>
  `;
}

function tomorrowMarkup(item, index) {
  const [time, name, treatment, balance] = item;
  ensureAppointmentId(item);
  return `
    <div class="tomorrow-row">
      <div class="person">
        <div>
          <strong>${escapeHTML(name)} · ${escapeHTML(time)}</strong>
          <small>${escapeHTML(treatment)} · Saldo: ${escapeHTML(balance || '$0')}</small>
        </div>
      </div>
      <button class="whatsapp" data-reminder="${escapeHTML(name)}" data-reminder-time="${escapeHTML(time)}" aria-label="Preparar recordatorio por WhatsApp">
        <span>WhatsApp</span>
      </button>
    </div>
  `;
}

function appointmentCardMarkup(appointment, index, source) {
  const [time, name, reason, balance, date, status] = appointment;
  ensureAppointmentId(appointment);
  const canEdit = date !== getISODate(0) || status !== 'Finalizada';
  return `
    <article class="managed-appointment" data-search-match="${appointmentMatchesSearch(appointment) ? 'true' : 'false'}">
      <div class="managed-appointment-time">
        <strong>${escapeHTML(time)}</strong>
        <small>${formatDisplayDate(date)}</small>
      </div>
      <div class="managed-appointment-person">
        <strong>${escapeHTML(name)}</strong>
        <small>${escapeHTML(reason)}</small>
      </div>
      <div class="managed-appointment-charge">
        <span>Saldo</span>
        <strong>${escapeHTML(balance || '$0')}</strong>
      </div>
      <div class="managed-appointment-actions">
        <button class="patient-info-button" data-patient-info="${escapeHTML(encodeURIComponent(name))}">Expediente</button>
        ${canEdit ? `<button class="patient-info-button appointment-edit-button" data-edit-appointment="${source}:${index}">Editar cita</button>` : ''}
        ${date === getISODate(1) ? `<button class="whatsapp" data-reminder="${escapeHTML(name)}" data-reminder-time="${escapeHTML(time)}" aria-label="Preparar recordatorio por WhatsApp"><span>WhatsApp</span></button>` : ''}
        <button class="row-action delete-action" data-delete-appointment="${source}:${index}">Eliminar cita</button>
      </div>
    </article>
  `;
}

function renderAppointmentTable() {
  const oldestVisibleDate = getISODate(-2);
  const appointments = getAppointments()
    .filter(({ appointment }) =>
      appointment[4] >= oldestVisibleDate &&
      (activeAppointmentFilter === 'all' ||
        appointment[4] === getISODate(activeAppointmentFilter === 'today' ? 0 : 1)) &&
      appointmentMatchesSearch(appointment)
    )
    .sort((a, b) => {
      const dateOrder = a.appointment[4].localeCompare(b.appointment[4]);
      if (dateOrder !== 0) return activeAppointmentSort === 'recent' ? dateOrder : -dateOrder;

      const timeOrder = toMinutes(a.appointment[0]) - toMinutes(b.appointment[0]);
      return activeAppointmentSort === 'recent' ? timeOrder : -timeOrder;
    });
  const container = document.querySelector('#all-appointments');
  if (!container) return;
  
  container.innerHTML = appointments.length 
    ? appointments.map(({ appointment, index, source }) => appointmentCardMarkup(appointment, index, source)).join('') 
    : `<p class="empty-state">No hay citas para este filtro.</p>`;
}

function renderLists() {
  const todayList = document.querySelector('#today-list');
  const tomorrowList = document.querySelector('#tomorrow-list');
  
  if (todayList) {
    todayList.innerHTML = todayAppointments
      .filter(appointment =>
        (appointment[5] !== 'Finalizada' || appointment[6] === followUpAppointmentId) &&
        (appointment[5] !== 'Cancelada' || appointment[6] === rescheduleAppointmentId)
      )
      .filter(appointmentMatchesSearch)
      .map(todayMarkup)
      .join('');
  }
  if (tomorrowList) {
    tomorrowList.innerHTML = tomorrowAppointments.filter(appointmentMatchesSearch).map(tomorrowMarkup).join('');
  }
  
  renderAppointmentTable();
  renderPatientDirectory(globalSearchQuery);
  
  const todayCount = document.querySelector('#today-count');
  if (todayCount) {
    todayCount.textContent = todayAppointments.filter(appointment =>
      (appointment[5] !== 'Finalizada' || appointment[6] === followUpAppointmentId) &&
      (appointment[5] !== 'Cancelada' || appointment[6] === rescheduleAppointmentId)
    ).length;
  }
  
  updateDashboardIncome();
  updateAttendedCount();
  renderDashboardCalendar();
}

function getNumericAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isNaN(numeric) ? 0 : Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function updateDashboardIncome() {
  const incomeElement = document.querySelector('#today-income');
  if (!incomeElement) return;
  
  const today = getISODate(0);
  const total = patients.reduce((sum, patient) => {
    const paymentsToday = (patient.historialFinanciero || [])
      .filter(payment => payment.fecha === today);
    return sum + paymentsToday.reduce((paymentSum, payment) => paymentSum + getNumericAmount(payment.monto), 0);
  }, 0);
  incomeElement.textContent = formatCurrency(total);
}

function updateAttendedCount() {
  const element = document.querySelector('#attended-count');
  if (!element) return;
  
  const count = todayAppointments.filter(a => a[5] === 'Finalizada').length;
  element.textContent = String(count);
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
    const [time, name, reason, balance, date] = appointment;
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
    <button class="patient-list-item" data-select-patient="${escapeHTML(encodeURIComponent(item.name))}">
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
        <div>
          <strong>${escapeHTML(record.tratamiento || 'Registro clínico')}</strong>
          <small><strong>Fecha:</strong> ${formatDisplayDate(record.fecha)}</small>
        </div>
        ${patient.id ? `<button type="button" class="row-action delete-action clinical-service-record-remove" data-remove-patient-service="${escapeHTML(patient.id)}" data-clinical-record-index="${index}">Quitar</button>` : ''}
      </div>
      ${record.diagnostico ? `<p><strong>Diagnóstico:</strong> ${escapeHTML(record.diagnostico)}</p>` : ''}
      ${record.costo !== undefined && record.costo !== null && record.costo !== '' ? `<p><strong>Costo:</strong> ${formatCurrency(record.costo)}</p>` : ''}
      ${record.avance ? `<p><strong>Avance:</strong> ${escapeHTML(record.avance)}</p>` : ''}
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

function removePatientClinicalService(patientId, recordIndex) {
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
  if (!window.confirm(`¿Deseas quitar "${record.tratamiento || 'este servicio'}" del expediente del paciente?`)) return;

  patient.historialClinico.splice(recordIndex, 1);
  if (Array.isArray(patient.tratamientoServicios)) {
    const serviceIndex = patient.tratamientoServicios.findIndex(service =>
      normalizeName(service.tratamiento) === normalizeName(record.tratamiento) &&
      normalizeName(service.diagnostico) === normalizeName(record.diagnostico) &&
      Number(service.costo || 0) === Number(record.costo || 0)
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
  showPatientDetails(getPatientFullName(patient));
  showToast('Servicio quitado del expediente.');
}

function formatFileSize(size) {
  if (!size) return '0 KB';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
    if (!appointmentsWithPayments.has(appointment[6])) return;
    const total = getNumericAmount(appointment[8] ?? appointment[3]);
    const due = getNumericAmount(appointment[3]);
    const paid = appointment[9] !== undefined
      ? getNumericAmount(appointment[9])
      : Math.max(total - due, 0);
    appointments.set(appointment[6], {
      fecha: appointment[4],
      concepto: appointment[2] || 'Cita',
      estipulado: total,
      pagado: paid,
      debe: due,
      fechaMovimiento: appointment[4]
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

function showPatientDetails(name) {
  let patient = findPatientByName(name);
  const appointments = patient ? getPatientAppointments(patient) : getAppointments().filter(({ appointment }) => normalizeName(appointment[1]) === normalizeName(name)).map(({ appointment }) => appointment);
  const details = document.querySelector('#patient-details');
  if (!details) return;
  
  if (!patient && !appointments.length) {
    details.innerHTML = `<p class="empty-state">No hay información disponible para este paciente.</p>`;
    return;
  }
  
  if (!patient) {
    patient = { id: null, nombre: name, apellidos: '', fechaNacimiento: '', sexo: '', telefono: '', correo: '', direccion: '', contactoEmergencia: '', parentescoEmergencia: '', telefonoEmergencia: '', antecedentesMedicos: '', alergias: '', medicamentos: '', tipoSangre: '', observacionesMedicas: '', tratamientoActual: '', diagnostico: '', avanceClinico: '', fechaRegistroClinico: '', historialClinico: [], historialFinanciero: [], archivosClinicos: [] };
  }
  
  selectedPatient = patient.id || null;
  selectedPatientId = patient.id || null;
  const fullName = getPatientFullName(patient) || name;
  const outstandingBalance = appointments.reduce((sum, appointment) => {
    if (appointment[5] === 'Cancelada') return sum;
    const totalAmount = getNumericAmount(appointment[8] ?? appointment[3]);
    const balance = Math.max(getNumericAmount(appointment[3]), 0);
    const paidAmount = appointment[9] !== undefined
      ? getNumericAmount(appointment[9])
      : Math.max(totalAmount - balance, 0);
    const credit = Math.max(paidAmount - totalAmount, 0);
    return sum + balance - credit;
  }, 0);
  const patientOutstandingBalance = Math.max(outstandingBalance, 0);
  const financialTotal = (patient.historialFinanciero || []).reduce((sum, payment) => sum + getNumericAmount(payment.monto), 0);
  const orderedAppointments = sortPatientAppointments(appointments);
  const appointmentForToday = appointments.find(appointment =>
    appointment[4] === getISODate(0) && appointment[5] !== 'Cancelada'
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
          <span>Cita de hoy · ${escapeHTML(appointmentForToday[0])}</span>
          <strong>${escapeHTML(appointmentForToday[2] || 'Cita')}</strong>
        </div>
        <button type="button" class="patient-info-button patient-general-add-advance" data-appointment-notes="${escapeHTML(ensureAppointmentId(appointmentForToday))}">${Array.isArray(appointmentForToday[11]) && appointmentForToday[11].length ? 'Ver avance' : 'Agregar avance'}</button>
      </div>` : ''}
    </section>
    <section class="patient-record-section patient-folder-panel" role="tabpanel" data-patient-panel="medico" hidden>
      <div class="patient-record-heading"><h2>Expediente médico</h2></div>
      <div class="patient-record-grid">
        <div><span>Tipo de sangre: </span><strong>${escapeHTML(patient.tipoSangre || 'No registrado')}</strong></div>
        <div><span>Medicamentos actuales: </span><strong>${escapeHTML(patient.medicamentos || 'Ninguno registrado')}</strong></div>
        <div><span>Alergias: </span><strong>${escapeHTML(patient.alergias || 'Ninguna registrada')}</strong></div>
      </div><br></br>
      <div class="patient-record-text"><span>Antecedentes médicos: </span><p><strong>${escapeHTML(patient.antecedentesMedicos || 'No registrados.')}</strong></p></div>
      <div class="patient-record-text"><span>Observaciones médicas: </span><p><strong>${escapeHTML(patient.observacionesMedicas || 'Sin observaciones.')}</strong></p></div>
    </section>
    <section class="patient-record-section patient-folder-panel" role="tabpanel" data-patient-panel="clinico" hidden>
      <div class="patient-record-heading"><h2>Historial clínico</h2></div>
      <div class="patient-current-treatment"><span><strong>Tratamientos actuales:</strong> ${escapeHTML((patient.tratamientoServicios || []).map(service => service.tratamiento).filter(Boolean).join(', ') || patient.tratamientoActual || 'No registrado')}</span></div>
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
  showPatientDetails(getPatientFullName(patient));
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
      const existingService = editingPatient?.tratamientoServicios?.find(service =>
        normalizeName(service.tratamiento) === normalizeName(treatment) &&
        normalizeName(service.diagnostico) === normalizeName(diagnosis)
      );
      return {
        tratamiento: treatment,
        diagnostico: diagnosis,
        ...(existingService ? { costo: existingService.costo ?? '' } : {})
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
    normalizeName(existing.diagnostico) === normalizeName(record.diagnostico) && 
    normalizeName(existing.avance) === normalizeName(record.avance) &&
    Number(existing.costo || 0) === Number(record.costo || 0)
  );
}

function updatePatientAppointmentReferences(patientId, oldName, newName) {
  let changed = false;
  getAppointments().forEach(({ appointment }) => {
    if (appointment[7] === patientId && appointment[1] !== newName) {
      appointment[1] = newName;
      changed = true;
    } else if (!appointment[7] && normalizeName(appointment[1]) === normalizeName(oldName)) {
      appointment[1] = newName;
      appointment[7] = patientId;
      changed = true;
    }
  });
  
  if (changed) saveAppointments();
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
  const existing = patients.find(item => item.id !== patient.id && normalizeName(getPatientFullName(item)) === normalizeName(newPatientName));
  
  if (existing) {
    showToast('Ya existe un paciente con ese nombre.');
    return false;
  }
  
  processPatientFiles(patient);
  
  const clinicalServices = patient.tratamientoServicios.length
    ? patient.tratamientoServicios
    : patient.tratamientoActual || patient.diagnostico || patient.avanceClinico
      ? [{ tratamiento: patient.tratamientoActual, diagnostico: patient.diagnostico }]
      : [];
  clinicalServices.forEach(service => {
    const newRecord = {
      id: generateId('clinical'),
      fecha: patient.fechaRegistroClinico || getISODate(0),
      tratamiento: service.tratamiento,
      diagnostico: service.diagnostico,
      costo: service.costo,
      avance: patient.avanceClinico
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
  showPatientDetails(newPatientName);
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
    
    selectedPatient = patient.id;
    selectedPatientId = patient.id;
  }
  
  return true;
}

function getFirstDayMonday(year, month) {
  let day = new Date(year, month, 1).getDay();
  return (day === 0 ? 7 : day) - 1;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getCalendarAppointments(date) {
  return getAppointments()
    .filter(({ appointment }) => appointment[4] === date)
    .map(({ appointment }) => appointment)
    .sort((a, b) => toMinutes(a[0]) - toMinutes(b[0]));
}

function toMinutes(time) {
  const [hours, minutes] = toInputTime(time).split(':').map(Number);
  return hours * 60 + minutes;
}

function openDailyAgenda(date) {
  const modal = document.querySelector('#daily-agenda-modal');
  const list = document.querySelector('#daily-agenda-list');
  const dateLabel = document.querySelector('#daily-agenda-date');
  if (!modal || !list || !dateLabel) return;

  const dateObject = new Date(`${date}T12:00:00`);
  dateLabel.textContent = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(dateObject);
  const appointments = getCalendarAppointments(date);
  const slots = [];
  for (let minutes = 9 * 60; minutes <= 19 * 60; minutes += 30) {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const matches = appointments.filter(appointment => toMinutes(appointment[0]) === minutes);
    const blockedCount = getBlockedAppointmentSlotCount(date, time);
    const availableCount = Math.max(3 - matches.length - blockedCount, 0);
    const blocked = blockedCount > 0;
    const hasSpace = availableCount > 0;
    const isPastDate = date < getISODate(0);
    const isPastTime = date === getISODate(0) && isAppointmentTimeInPast(date, time);
    const canBook = hasSpace && !isPastDate && !isPastTime;
    slots.push(`<div class="daily-agenda-slot ${blocked ? 'is-blocked' : matches.length ? 'has-appointments' : 'is-free'}">
      <strong class="daily-agenda-time">${formatTimeFromInput(time)}</strong>
      <div class="daily-agenda-slot-content">${matches.length ? matches.map(appointment => `<div class="daily-agenda-appointment"><strong>${escapeHTML(appointment[1])}</strong><span>${escapeHTML(appointment[2] || 'Cita')}${appointment[5] ? ` · ${escapeHTML(appointment[5])}` : ''}</span></div>`).join('') : ''}<span class="daily-agenda-free-label">${blocked ? `${blockedCount} ${blockedCount === 1 ? 'lugar ocupado' : 'lugares ocupados'} · ` : ''}${availableCount ? `${availableCount} ${availableCount === 1 ? 'lugar disponible' : 'lugares disponibles'}` : 'Sin lugares disponibles'}</span></div>
      <div class="daily-agenda-slot-actions">${canBook ? `<button type="button" class="daily-agenda-book" data-agenda-book="${date}" data-agenda-time="${time}">Agendar</button>` : ''}${hasSpace && !isPastDate && !isPastTime ? `<button type="button" class="daily-agenda-block" data-agenda-block="${date}" data-agenda-time="${time}">Deshabilitar</button>` : ''}${blocked ? `<button type="button" class="daily-agenda-unblock" data-agenda-unblock="${date}" data-agenda-time="${time}">Liberar 1 lugar</button>` : ''}</div>
    </div>`);
  }
  list.innerHTML = slots.join('');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
}

function closeDailyAgenda() {
  const modal = document.querySelector('#daily-agenda-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  updatePageScrollLock();
}

function calendarDayMarkup(year, month, day, muted = false) {
  const date = new Date(year, month, day);
  const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const isToday = isoDate === getISODate(0);
  const events = getCalendarAppointments(isoDate).filter(appointmentMatchesSearch);
  
  return `
    <button type="button" class="day ${muted ? 'muted' : ''} ${isToday ? 'today' : ''}" data-calendar-date="${isoDate}" aria-label="Ver agenda del ${day} de ${MONTH_NAMES[date.getMonth()]}">
      <span>${day}</span>
      ${events.slice(0, 4).map((event, index) => `<span class="event ${index % 2 ? 'violet' : ''}">${escapeHTML(event[0])} ${escapeHTML(event[1])}</span>`).join('')}
      ${events.length > 4 ? `<span class="event">+${events.length - 4} más</span>` : ''}
    </button>
  `;
}

function renderCalendar(target) {
  if (!target) return;
  
  const firstDay = getFirstDayMonday(calendarYear, calendarMonth);
  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
  const previousMonthDays = getDaysInMonth(calendarYear, calendarMonth - 1);
  const cells = [];
  
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push(calendarDayMarkup(calendarYear, calendarMonth - 1, previousMonthDays - i, true));
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(calendarDayMarkup(calendarYear, calendarMonth, day));
  }
  
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push(calendarDayMarkup(calendarYear, calendarMonth + 1, nextDay, true));
    nextDay++;
  }
  
  target.innerHTML = cells.join('');
}

function updateDashboardCalendarTitle() {
  const dashboardTitle = document.querySelector('#dashboard-calendar-title');
  if (dashboardTitle) {
    dashboardTitle.textContent = `${MONTH_NAMES[calendarMonth]} ${calendarYear}`;
  }
}

function renderDashboardCalendar() {
  updateDashboardCalendarTitle();
  renderCalendar(document.querySelector('#dashboard-calendar'));
}

function changeCalendarMonth(amount) {
  calendarMonth += amount;
  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear--;
  }
  if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear++;
  }
  renderDashboardCalendar();
}

function openPaymentReceipt(appointmentId) {
  const appointmentData = getAppointments().find(({ appointment }) => appointment[6] === appointmentId);
  if (!appointmentData) {
    showToast('La cita seleccionada ya no existe.');
    return;
  }
  
  const appointment = appointmentData.appointment;
  const patient = resolveAppointmentPatient(appointment);
  if (!patient) {
    showToast('No se encontró el expediente del paciente.');
    return;
  }
  
  const modal = document.querySelector('#payment-receipt-modal');
  if (!modal) return;
  
  const totalAmount = getNumericAmount(appointment[8] ?? appointment[3]);
  const balanceAmount = getNumericAmount(appointment[3]);
  const paidAmount = Math.max(totalAmount - balanceAmount, 0);
  const patientName = getPatientFullName(patient) || appointment[1];
  
  setFieldValue('#receipt-appointment-id', appointmentId);
  setFieldValue('#receipt-patient', patientName);
  setFieldValue('#receipt-appointment-date', formatDisplayDate(appointment[4]));
  setFieldValue('#receipt-treatment', appointment[2] || 'Consulta');
  setFieldValue('#receipt-total', formatCurrency(totalAmount));
  setFieldValue('#receipt-balance', formatCurrency(balanceAmount));
  
  updatePaymentReceiptSummary();
  
  setFieldValue('#receipt-payment-date', getISODate(0));
  setFieldValue('#receipt-reference', '');
  setFieldValue('#receipt-notes', '');
  
  const paymentStatus = document.querySelector('#receipt-payment-status');
  const paymentAmount = document.querySelector('#receipt-payment-amount');
  
  if (balanceAmount <= 0) {
    if (paymentStatus) paymentStatus.value = 'Completo';
    if (paymentAmount) paymentAmount.value = '0';
  } else {
    if (paymentStatus) paymentStatus.value = 'Parcial';
    if (paymentAmount) paymentAmount.value = String(balanceAmount);
  }
  
  setFieldValue('#receipt-payment-method', 'Efectivo');
  updatePaymentReceiptAmountState();
  
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
}

function updatePaymentReceiptAmountState() {
  const status = document.querySelector('#receipt-payment-status');
  const amount = document.querySelector('#receipt-payment-amount');
  if (!status || !amount) return;
  
  if (status.value === 'No pagado') {
    amount.value = '0';
    amount.readOnly = true;
  } else {
    amount.readOnly = false;
  }
}

function closePaymentReceipt() {
  const modal = document.querySelector('#payment-receipt-modal');
  if (!modal) return;
  
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  
  const form = document.querySelector('#payment-receipt-form');
  if (form) form.reset();
  followUpAppointmentId = null;
  
  updatePageScrollLock();
}

function createPaymentReceiptModal() {
  if (document.querySelector('#payment-receipt-modal')) return;
  
  const modal = document.createElement('div');
  modal.id = 'payment-receipt-modal';
  modal.className = 'modal-backdrop';
  modal.setAttribute('aria-hidden', 'true');
  
  modal.innerHTML = `
    <div class="modal-card payment-receipt-card" role="dialog" aria-modal="true" aria-labelledby="payment-receipt-title">
      <div class="payment-receipt-header">
        <div>
          <h2 id="payment-receipt-title">Registrar pago</h2>
          <p class="modal-copy">Registra el pago realizado correspondiente a esta cita.</p>
        </div>
        <button type="button" class="modal-close" id="payment-receipt-close" aria-label="Cerrar">×</button>
      </div>
      <form id="payment-receipt-form">
        <input type="hidden" id="receipt-appointment-id">
        <div class="payment-receipt-grid">
          <label><span>Paciente</span><input type="text" id="receipt-patient" readonly></label>
          <label><span>Fecha de la cita</span><input type="text" id="receipt-appointment-date" readonly></label>
          <label><span>Tratamiento / concepto</span><input type="text" id="receipt-treatment" readonly></label>
          <label><span>Fecha del pago</span><input type="date" id="receipt-payment-date" required></label>
        </div>
        <div class="payment-summary">
          <div><small>Total de la cita</small><strong id="receipt-total-display">$0</strong></div>
        </div>
        <input type="hidden" id="receipt-total">
        <input type="hidden" id="receipt-balance">
        <div class="payment-receipt-fields">
          <label>
            <span>Estado del pago*</span>
            <select id="receipt-payment-status" required>
              <option value="No pagado">No pagado</option>
              <option value="Parcial">Pago parcial</option>
              <option value="Completo">Pago completo</option>
            </select>
          </label>
          <label>
            <span>Monto recibido*</span>
            <input type="number" id="receipt-payment-amount" min="0" step="0.01" placeholder="0.00" required>
            <small>El excedente se aplicará a otros saldos pendientes del paciente.</small>
          </label>
          <label>
            <span>Forma de pago*</span>
            <select id="receipt-payment-method" required>
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Transferencia">Transferencia</option>
            </select>
          </label>
          <label>
            <span>Referencia / comprobante</span>
            <input type="text" id="receipt-reference" maxlength="100" placeholder="Número de transferencia, folio, etc.">
          </label>
        </div>
        <label>
          <span>Notas</span>
          <textarea id="receipt-notes" rows="3" placeholder="Observaciones del pago..."></textarea>
        </label>
        <div class="payment-receipt-actions">
          <button type="button" class="modal-secondary-button" id="payment-receipt-cancel">Cancelar</button>
          <button type="submit" class="modal-secondary-button" id="payment-receipt-whatsapp">Guardar y enviar recibo por WhatsApp</button>
          <button type="submit" class="modal-primary-button">Guardar recibo y nueva cita</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);
}

function updatePaymentReceiptSummary() {
  const total = document.querySelector('#receipt-total');
  const balance = document.querySelector('#receipt-balance');
  const totalDisplay = document.querySelector('#receipt-total-display');
  
  if (totalDisplay) totalDisplay.textContent = formatCurrency(total?.value || 0);
}

function openModal(index = null) {
  const modal = document.querySelector('#appointment-modal');
  const patientInput = document.querySelector('#modal-patient');
  const patientIdInput = document.querySelector('#modal-patient-id');
  const motiveInput = document.querySelector('#modal-motive');
  const amountInput = document.querySelector('#modal-amount');
  const dateInput = document.querySelector('#modal-date');
  const timeInput = document.querySelector('#modal-time');
  
  if (!modal || !patientInput || !motiveInput || !amountInput || !dateInput || !timeInput) return;
  
  selectedPatient = null;
  selectedPatientId = null;
  editingAppointment = null;
  hidePatientSuggestions();
  
  if (patientIdInput) patientIdInput.value = '';
  
  if (index === null || index === undefined) {
    patientInput.value = '';
    patientInput.readOnly = false;
    patientInput.placeholder = 'Escribe el nombre del paciente';
    patientInput.removeAttribute('data-patient-selected');
    setAppointmentMotive();
    amountInput.value = '';
    dateInput.value = getISODate(0);
    dateInput.min = getISODate(0);
    document.querySelector('#modal-title').textContent = 'Agendar cita';
  } else {
    const appointment = todayAppointments[index];
    if (!appointment) return;
    ensureAppointmentId(appointment);
    if (rescheduleAppointmentId === appointment[6]) {
      editingAppointment = { source: 'today', index, id: appointment[6] };
    }
    
    const patient = resolveAppointmentPatient(appointment);
    selectedPatient = patient?.id || null;
    selectedPatientId = patient?.id || null;
    
    patientInput.value = patient ? getPatientFullName(patient) : appointment[1];
    patientInput.readOnly = true;
    patientInput.placeholder = '';
    patientInput.setAttribute('data-patient-selected', patient?.id ? 'true' : 'false');
    
    if (patientIdInput) patientIdInput.value = patient?.id || appointment[7] || '';
    
    setAppointmentMotive(sanitizeReason(appointment[2]));
    const currentAmount = getNumericAmount(appointment[3]);
    amountInput.value = String(currentAmount);
    
    dateInput.value = getISODate(1);
    dateInput.min = getISODate(0);
    document.querySelector('#modal-title').textContent = 'Agendar cita';
  }
  document.querySelector('#appointment-modal .modal-copy').textContent = 'Completa los datos para agendar o actualizar una cita.';
  refreshAppointmentTimeSlots(index === null || index === undefined ? '09:00' : '');
  
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
}

function editAppointment(source, index) {
  const list = getAppointmentList(source);
  const appointment = list[index];
  if (!appointment) return;
  ensureAppointmentId(appointment);
  
  editingAppointment = { source, index, id: appointment[6] };
  const patient = resolveAppointmentPatient(appointment);
  selectedPatient = patient?.id || null;
  selectedPatientId = patient?.id || null;
  
  const patientInput = document.querySelector('#modal-patient');
  const patientIdInput = document.querySelector('#modal-patient-id');
  const motiveInput = document.querySelector('#modal-motive');
  const amountInput = document.querySelector('#modal-amount');
  const dateInput = document.querySelector('#modal-date');
  const timeInput = document.querySelector('#modal-time');
  
  if (!patientInput || !motiveInput || !amountInput || !dateInput || !timeInput) return;
  
  hidePatientSuggestions();
  patientInput.value = patient ? getPatientFullName(patient) : appointment[1];
  patientInput.readOnly = true;
  patientInput.placeholder = '';
  patientInput.setAttribute('data-patient-selected', patient?.id ? 'true' : 'false');
  
  if (patientIdInput) patientIdInput.value = patient?.id || appointment[7] || '';
  
  setAppointmentMotive(sanitizeReason(appointment[2]));
  const amount = getNumericAmount(appointment[3]);
  amountInput.value = String(amount);
  
  dateInput.value = appointment[4] || getISODate(0);
  dateInput.min = getISODate(0);
  refreshAppointmentTimeSlots(toInputTime(appointment[0]));
  
  document.querySelector('#modal-title').textContent = 'Agendar cita';
  document.querySelector('#appointment-modal .modal-copy').textContent = 'Completa los datos para agendar o actualizar una cita.';
  
  const modal = document.querySelector('#appointment-modal');
  if (!modal) return;
  
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
}

function closeModal() {
  const modal = document.querySelector('#appointment-modal');
  if (!modal) return;
  
  hidePatientSuggestions();
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  
  editingAppointment = null;
  rescheduleAppointmentId = null;
  selectedPatient = null;
  selectedPatientId = null;
  
  const patientIdInput = document.querySelector('#modal-patient-id');
  if (patientIdInput) patientIdInput.value = '';
  
  updatePageScrollLock();
}

async function deleteAppointment(source, index) {
  const list = getAppointmentList(source);
  const appointment = list[index];
  if (!appointment) return;
  
  const patientName = appointment[1];
  const { confirmed } = await showConfirmationDialog({
    title: '¿Eliminar esta cita?',
    message: `Se eliminará la cita de ${patientName}. Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar cita'
  });
  if (!confirmed) return;
  
  const patient = resolveAppointmentPatient(appointment);
  list.splice(index, 1);
  saveAppointments();
  renderLists();
  refreshPatientDetails(patient);
  showToast(`Cita de ${patientName} eliminada.`);
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
      appointment[7] !== patientId &&
      (appointment[7] || normalizeName(appointment[1]) !== normalizedPatientName)
    ));
  selectedPatient = null;
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

document.addEventListener('submit', event => {
  if (event.target.matches('#payment-receipt-form')) {
    event.preventDefault();
    
    const appointmentId = document.querySelector('#receipt-appointment-id')?.value;
    const paymentStatus = document.querySelector('#receipt-payment-status')?.value;
    const paymentAmountInput = document.querySelector('#receipt-payment-amount');
    const paymentDate = document.querySelector('#receipt-payment-date')?.value;
    const paymentMethod = document.querySelector('#receipt-payment-method')?.value;
    const reference = document.querySelector('#receipt-reference')?.value.trim();
    const notes = document.querySelector('#receipt-notes')?.value.trim();
    
    if (!appointmentId) {
      showToast('No se identificó la cita.');
      return;
    }
    if (!paymentStatus) {
      showToast('Selecciona el estado del pago.');
      return;
    }
    if (!paymentAmountInput?.value || !Number.isFinite(Number(paymentAmountInput.value)) || Number(paymentAmountInput.value) < 0) {
      showToast('Ingresa un monto recibido válido.');
      return;
    }
    if (!paymentMethod) {
      showToast('Selecciona la forma de pago.');
      return;
    }
    
    const appointmentData = getAppointments().find(({ appointment }) => appointment[6] === appointmentId);
    if (!appointmentData) {
      showToast('La cita ya no existe.');
      closePaymentReceipt();
      return;
    }
    
    const appointment = appointmentData.appointment;
    const patient = resolveAppointmentPatient(appointment);
    
    if (!patient) {
      showToast('No se encontró el paciente de la cita.');
      return;
    }
    if (!paymentDate) {
      showToast('Selecciona la fecha del pago.');
      return;
    }
    
    const totalAmount = getNumericAmount(appointment[8] ?? appointment[3]);
    const currentBalance = getNumericAmount(appointment[3]);
    let paymentAmount = 0;
    
    if (paymentStatus === 'Completo') {
      paymentAmount = Math.max(currentBalance, getNumericAmount(paymentAmountInput?.value));
    } else if (paymentStatus === 'Parcial') {
      paymentAmount = getNumericAmount(paymentAmountInput?.value);
      if (paymentAmount <= 0) {
        showToast('Ingresa el monto del pago parcial.');
        return;
      }
    }

    const sendWhatsApp = event.submitter?.id === 'payment-receipt-whatsapp';
    const newBalance = Math.max(currentBalance - paymentAmount, 0);
    if (sendWhatsApp) {
      const paidBefore = appointment[9] !== undefined
        ? getNumericAmount(appointment[9])
        : Math.max(totalAmount - currentBalance, 0);
      const receiptMessage = [
        '____________________________',
        'RECIBO DE PAGO',
        `Paciente: ${getPatientFullName(patient) || appointment[1]}`,
        `Fecha de la cita: ${formatDisplayDate(appointment[4])}`,
        `Motivo de la cita: ${appointment[2] || 'Consulta'}`,
        `Estado del pago: ${newBalance <= 0 ? 'Completo' : paymentAmount > 0 ? 'Parcial' : 'No pagado'}`,
        `Forma de pago: ${paymentMethod || 'No especificado'}`,
        `Cantidad por pagar: ${formatCurrency(totalAmount)}`,
        `Cantidad pagada: ${formatCurrency(paidBefore + paymentAmount)}`,
        `Cantidad adeudada: ${formatCurrency(newBalance)}`
      ].join('\n');
      const whatsappWindow = window.open(`https://wa.me/?text=${encodeURIComponent(receiptMessage)}`, '_blank');
      if (!whatsappWindow) showToast('Permite las ventanas emergentes para abrir WhatsApp.');
    }

    const paidBefore = appointment[9] !== undefined
      ? getNumericAmount(appointment[9])
      : Math.max(totalAmount - currentBalance, 0);
    
    appointment[3] = formatCurrency(newBalance);
    appointment[8] = totalAmount;
    appointment[9] = paidBefore + paymentAmount;
    appointment[10] = newBalance <= 0 ? 'Completo' : paymentAmount > 0 ? 'Parcial' : 'No pagado';
    
    if (!Array.isArray(patient.historialFinanciero)) {
      patient.historialFinanciero = [];
    }
    
    patient.historialFinanciero.push({
      id: generateId('payment'),
      fecha: paymentDate,
      monto: paymentAmount,
      concepto: appointment[2] || 'Pago de consulta',
      metodo: paymentMethod || 'No especificado',
      estado: appointment[10],
      citaId: appointmentId,
      fechaCita: appointment[4],
      referencia: reference,
      notas: notes,
      saldoAnterior: currentBalance,
      saldoRestante: newBalance,
      montoTotal: totalAmount,
      createdAt: new Date().toISOString()
    });
    
    const shouldScheduleFollowUp = followUpAppointmentId === appointmentId;
    closePaymentReceipt();
    savePatients();
    saveAppointments();
    renderLists();
    refreshPatientDetails(patient);
    
    if (shouldScheduleFollowUp) {
      const todayIndex = todayAppointments.findIndex(item => item[6] === appointmentId);
      showToast(paymentAmount > 0 ? `Pago de ${formatCurrency(paymentAmount)} registrado. Agenda la siguiente cita.` : 'Recibo registrado. Agenda la siguiente cita.');
      if (todayIndex !== -1) openModal(todayIndex);
      return;
    }
    showToast(paymentAmount > 0 ? `Pago de ${formatCurrency(paymentAmount)} registrado correctamente.` : 'Recibo registrado sin pago.');
  }
});

document.addEventListener('change', event => {
  if (event.target.matches('#receipt-payment-status')) {
    updatePaymentReceiptAmountState();
  }
});

function updateAppointmentStatus(appointmentId, status) {
  const item = getAppointments().find(({ appointment }) => appointment[6] === appointmentId);
  if (!item) return;
  const todayIndex = todayAppointments.findIndex(a => a[6] === appointmentId);
  if (item.appointment[5] === status) {
    if (status === 'Finalizada') {
      followUpAppointmentId = appointmentId;
      if (rescheduleAppointmentId === appointmentId) rescheduleAppointmentId = null;
      openPaymentReceipt(appointmentId);
    } else if (status === 'Cancelada' && todayIndex !== -1) {
      rescheduleAppointmentId = appointmentId;
      openModal(todayIndex);
    }
    return;
  }
  
  item.appointment[5] = status;
  const patient = resolveAppointmentPatient(item.appointment);
  
  if (status === 'Finalizada') {
    followUpAppointmentId = appointmentId;
    if (rescheduleAppointmentId === appointmentId) rescheduleAppointmentId = null;
    saveAppointments();
    renderLists();
    refreshPatientDetails(patient);
    openPaymentReceipt(appointmentId);
    return;
  }
  if (status === 'Cancelada') {
    rescheduleAppointmentId = appointmentId;
    if (followUpAppointmentId === appointmentId) followUpAppointmentId = null;
    saveAppointments();
    renderLists();
    refreshPatientDetails(patient);
    if (todayIndex !== -1) openModal(todayIndex);
    return;
  }
  if (status === 'En espera') {
    if (followUpAppointmentId === appointmentId) followUpAppointmentId = null;
    if (rescheduleAppointmentId === appointmentId) rescheduleAppointmentId = null;
  }
  saveAppointments();
  renderLists();
  refreshPatientDetails(patient);
  showToast(`Cita marcada como ${status}.`);
}

function changePage(page, appointmentFilter = null) {
  if (!pages[page]) return;

  if (page === 'citas' && appointmentFilter) {
    activeAppointmentFilter = appointmentFilter;
    const dateFilter = document.querySelector('#appointment-date-filter');
    if (dateFilter) dateFilter.value = appointmentFilter;
  }
  
  document.querySelectorAll('.app-page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  document.querySelectorAll('[data-page-link]').forEach(el => el.classList.toggle('active', el.dataset.pageLink === page));
  
  const title = document.querySelector('#page-title');
  if (title) title.textContent = pages[page][0];
  
  if (page === 'pacientes') renderPatientDirectory();
  if (page === 'citas') renderAppointmentTable();
  
  if (!document.querySelector('#patient-modal.open') && !document.querySelector('#appointment-modal.open')) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function initializeAuthPreview() {
  const preview = new URLSearchParams(window.location.search).get('auth');
  if (preview !== 'login' && preview !== 'pending') return;

  document.body.classList.add('auth-preview-mode');
  document.querySelectorAll('.auth-preview-screen').forEach(screen => {
    const isActive = screen.id === `auth-${preview}-preview`;
    screen.classList.toggle('is-active', isActive);
    screen.setAttribute('aria-hidden', String(!isActive));
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
  const fullName = getPatientFullName(patient);
  showPatientDetails(fullName);
  document.querySelectorAll('.patient-list-item').forEach(item => {
    item.classList.toggle('selected', decodeURIComponent(item.dataset.selectPatient) === fullName);
  });
}

document.addEventListener('click', async event => {
  const patientFolderTab = event.target.closest('[data-patient-tab]');
  if (patientFolderTab) {
    const details = patientFolderTab.closest('#patient-details');
    const section = patientFolderTab.dataset.patientTab;
    if (!details || !section) return;
    details.querySelectorAll('[data-patient-tab]').forEach(tab => {
      const isActive = tab === patientFolderTab;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
    details.querySelectorAll('[data-patient-panel]').forEach(panel => {
      const isActive = panel.dataset.patientPanel === section;
      panel.hidden = !isActive;
      panel.classList.toggle('active', isActive);
    });
    return;
  }

  const agendaBookButton = event.target.closest('[data-agenda-book]');
  if (agendaBookButton) {
    const { agendaBook: date, agendaTime: time } = agendaBookButton.dataset;
    if (date < getISODate(0)) {
      showToast('No se pueden agendar citas en fechas pasadas.');
      return;
    }
    if (isAppointmentTimeInPast(date, time)) {
      showToast('Selecciona un horario a partir de la hora actual.');
      return;
    }
    closeDailyAgenda();
    openModal();
    const dateInput = document.querySelector('#modal-date');
    const timeInput = document.querySelector('#modal-time');
    if (dateInput) dateInput.value = date;
    refreshAppointmentTimeSlots(time);
    if (timeInput) timeInput.value = time;
    return;
  }

  const agendaBlockButton = event.target.closest('[data-agenda-block]');
  if (agendaBlockButton) {
    const { agendaBlock: date, agendaTime: time } = agendaBlockButton.dataset;
    const appointmentCount = getCalendarAppointments(date).filter(appointment => toInputTime(appointment[0]) === time && appointment[5] !== 'Cancelada').length;
    const remainingPlaces = Math.max(3 - appointmentCount - getBlockedAppointmentSlotCount(date, time), 0);
    if (!remainingPlaces) return;
    const { confirmed, value: placesToBlock } = await showConfirmationDialog({
      title: 'Marcar horario como no disponible',
      message: `El horario de las ${formatTimeFromInput(time)} tiene ${remainingPlaces} ${remainingPlaces === 1 ? 'lugar disponible' : 'lugares disponibles'}.`,
      confirmLabel: 'Marcar como ocupado',
      input: {
        label: `¿Cuántos lugares deseas bloquear? (1-${remainingPlaces})`,
        min: 1,
        max: remainingPlaces,
        value: 1
      }
    });
    if (!confirmed) return;
    const existingBlockedSlot = blockedAppointmentSlots.find(slot => slot.date === date && slot.time === time);
    if (existingBlockedSlot) existingBlockedSlot.count = getBlockedAppointmentSlotCount(date, time) + placesToBlock;
    else blockedAppointmentSlots.push({ date, time, count: placesToBlock });
    if (saveBlockedAppointmentSlots()) {
      openDailyAgenda(date);
      showToast(`${placesToBlock} ${placesToBlock === 1 ? 'lugar marcado' : 'lugares marcados'} como ocupado${placesToBlock === 1 ? '' : 's'} a las ${formatTimeFromInput(time)}.`);
    } else {
      if (existingBlockedSlot) existingBlockedSlot.count -= placesToBlock;
      else blockedAppointmentSlots.pop();
    }
    return;
  }

  const agendaUnblockButton = event.target.closest('[data-agenda-unblock]');
  if (agendaUnblockButton) {
    const { agendaUnblock: date, agendaTime: time } = agendaUnblockButton.dataset;
    const previousSlots = blockedAppointmentSlots.map(slot => ({ ...slot }));
    const slotIndex = blockedAppointmentSlots.findIndex(slot => slot.date === date && slot.time === time);
    const blockedSlot = blockedAppointmentSlots[slotIndex];
    if (blockedSlot && getBlockedAppointmentSlotCount(date, time) > 1) blockedSlot.count = getBlockedAppointmentSlotCount(date, time) - 1;
    else if (slotIndex >= 0) blockedAppointmentSlots.splice(slotIndex, 1);
    if (saveBlockedAppointmentSlots()) {
      openDailyAgenda(date);
      showToast(`Se liberó 1 lugar a las ${formatTimeFromInput(time)}.`);
    } else {
      blockedAppointmentSlots = previousSlots;
    }
    return;
  }

  const calendarDay = event.target.closest('[data-calendar-date]');
  if (calendarDay) {
    openDailyAgenda(calendarDay.dataset.calendarDate);
    return;
  }

  if (event.target.closest('#daily-agenda-close')) {
    closeDailyAgenda();
    return;
  }

  if (event.target.closest('#auth-pending-signout')) {
    window.location.search = '?auth=login';
    return;
  }

  const appointmentTime = event.target.closest('[data-appointment-time]');
  if (appointmentTime && !appointmentTime.disabled) {
    const timeSelect = document.querySelector('#modal-time');
    if (timeSelect) {
      timeSelect.value = appointmentTime.dataset.appointmentTime;
      refreshAppointmentTimeSlots(timeSelect.value);
      document.querySelector(`[data-appointment-time="${timeSelect.value}"]`)?.focus();
    }
    return;
  }

  if (!event.target.closest('.search')) {
    renderGlobalPatientSearch('');
  }

  const globalPatientResult = event.target.closest('[data-global-patient-id]');
  if (globalPatientResult) {
    openPatientRecordFromSearch(globalPatientResult.dataset.globalPatientId);
    return;
  }

  const viewClinicalFileButton = event.target.closest('[data-view-clinical-file]');
  if (viewClinicalFileButton) {
    const fileId = viewClinicalFileButton.dataset.viewClinicalFile;
    const fileName = viewClinicalFileButton.dataset.fileName || 'archivo';
    const pendingFile = pendingClinicalFiles.find(item => item.id === fileId)?.file;
    const viewWindow = window.open('', '_blank');
    if (!viewWindow) {
      showToast('Permite las ventanas emergentes para ver el archivo.');
      return;
    }
    viewWindow.opener = null;

    const openFile = async () => {
      try {
        const file = pendingFile || await getClinicalFile(fileId);
        if (!file) {
          viewWindow.close();
          showToast(`No está disponible el contenido de "${fileName}". Vuelve a adjuntarlo para poder verlo.`);
          return;
        }
        const fileUrl = URL.createObjectURL(file);
        viewWindow.location.href = fileUrl;
        window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
      } catch (error) {
        console.error(`No se pudo abrir el archivo "${fileName}":`, error);
        viewWindow.close();
        showToast('No se pudo abrir el archivo.');
      }
    };
    openFile();
    return;
  }

  if (event.target.closest('#add-clinical-files')) {
    document.querySelector('#clinical-files')?.click();
    return;
  }

  if (event.target.closest('#add-clinical-service')) {
    const container = document.querySelector('#clinical-services-list');
    if (container) {
      container.append(createClinicalServiceRow({}, true));
    }
    return;
  }

  const removeClinicalService = event.target.closest('.clinical-service-remove');
  if (removeClinicalService) {
    removeClinicalService.closest('.clinical-service-row').remove();
    return;
  }
  const appointmentPatientField = event.target.closest('.patient-search-field');
  if (!appointmentPatientField && !event.target.closest('#modal-patient-suggestions')) {
    hidePatientSuggestions();
  }
  
  const aptPatientOption = event.target.closest('[data-appointment-patient-id]');
  if (aptPatientOption) {
    selectAppointmentPatient(aptPatientOption.dataset.appointmentPatientId);
    return;
  }
  
  const editBtn = event.target.closest('[data-edit-appointment]');
  if (editBtn) {
    const [source, index] = editBtn.dataset.editAppointment.split(':');
    editAppointment(source, Number(index));
    return;
  }
  
  const deleteBtn = event.target.closest('[data-delete-appointment]');
  if (deleteBtn) {
    const [source, index] = deleteBtn.dataset.deleteAppointment.split(':');
    await deleteAppointment(source, Number(index));
    return;
  }
  
  const patientInfoBtn = event.target.closest('[data-patient-info]');
  if (patientInfoBtn) {
    const name = decodeURIComponent(patientInfoBtn.dataset.patientInfo);
    changePage('pacientes');
    renderPatientDirectory();
    showPatientDetails(name);
    document.querySelectorAll('.patient-list-item').forEach(item => {
      item.classList.toggle('selected', decodeURIComponent(item.dataset.selectPatient) === name);
    });
    return;
  }

  const appointmentNotesButton = event.target.closest('[data-appointment-notes]');
  if (appointmentNotesButton) {
    openAppointmentNotes(appointmentNotesButton.dataset.appointmentNotes);
    return;
  }

  if (event.target.closest('#appointment-notes-edit')) {
    const appointmentId = document.querySelector('#appointment-notes-id')?.value;
    const appointment = getAppointments().find(({ appointment: item }) => item[6] === appointmentId)?.appointment;
    const observation = appointment?.[11]?.[0];
    if (!appointment || !observation) {
      showToast('No se encontró el avance para editar.');
      return;
    }
    const form = document.querySelector('#appointment-notes-form');
    const modal = document.querySelector('#appointment-notes-modal');
    const history = document.querySelector('#appointment-notes-history');
    const notesInput = document.querySelector('#appointment-notes-text');
    if (!form || !modal || !history || !notesInput) return;
    form.dataset.editingObservation = 'true';
    form.classList.remove('is-viewing-observation');
    modal.classList.remove('is-viewing-observation');
    history.hidden = true;
    notesInput.value = observation.text || '';
    document.querySelector('#appointment-notes-label').hidden = false;
    document.querySelector('#appointment-notes-save').hidden = false;
    document.querySelector('#appointment-notes-edit').hidden = true;
    document.querySelector('#appointment-notes-cancel-edit').hidden = false;
    document.querySelector('#appointment-notes-cancel').textContent = 'Cerrar';
    notesInput.focus();
    return;
  }

  if (event.target.closest('#appointment-notes-cancel-edit')) {
    const appointmentId = document.querySelector('#appointment-notes-id')?.value;
    openAppointmentNotes(appointmentId);
    return;
  }

  const patientAppointmentsButton = event.target.closest('[data-patient-appointments]');
  if (patientAppointmentsButton) {
    openPatientAppointments(patientAppointmentsButton.dataset.patientAppointments);
    return;
  }
  
  const patientItem = event.target.closest('[data-select-patient]');
  const removePatientService = event.target.closest('[data-remove-patient-service]');
  if (removePatientService) {
    removePatientClinicalService(
      removePatientService.dataset.removePatientService,
      Number(removePatientService.dataset.clinicalRecordIndex)
    );
    return;
  }

  if (patientItem) {
    const name = decodeURIComponent(patientItem.dataset.selectPatient);
    showPatientDetails(name);
    document.querySelectorAll('.patient-list-item').forEach(item => {
      item.classList.toggle('selected', item === patientItem);
    });
    return;
  }
  
  if (event.target.closest('[data-open-appointment]') || event.target.closest('#new-appointment')) {
    openModal();
    return;
  }
  
  if (event.target.closest('#new-patient-dashboard') || event.target.closest('#new-patient')) {
    openPatientModal();
    return;
  }
  
  const editPatientBtn = event.target.closest('[data-edit-patient]');
  if (editPatientBtn) {
    openPatientModal(editPatientBtn.dataset.editPatient);
    return;
  }

  const deletePatientBtn = event.target.closest('[data-delete-patient]');
  if (deletePatientBtn) {
    await deletePatient(deletePatientBtn.dataset.deletePatient);
    return;
  }
  
  const dot = event.target.closest('[data-appointment-status]');
  if (dot) {
    updateAppointmentStatus(dot.dataset.appointmentStatus, dot.dataset.status);
    return;
  }
  
  const reminder = event.target.closest('[data-reminder]');
  if (reminder) {
    const msg = encodeURIComponent(`Hola ${reminder.dataset.reminder}, te recordamos que tienes una cita dental programada para el día de mañana a las ${reminder.dataset.reminderTime}. Agradecemos tu puntualidad. ¡Te esperamos!`);
    const whatsappWindow = window.open(`https://wa.me/?text=${msg}`, '_blank');
    if (!whatsappWindow) {
      showToast('Permite las ventanas emergentes para abrir WhatsApp.');
      return;
    }
    showToast(`Recordatorio preparado para ${reminder.dataset.reminder}.`);
    return;
  }
  
  if (event.target.closest('#previous-month')) {
    changeCalendarMonth(-1);
    return;
  }
  
  if (event.target.closest('#next-month')) {
    changeCalendarMonth(1);
    return;
  }
  
  if (event.target.closest('#payment-receipt-close') || event.target.closest('#payment-receipt-cancel')) {
    closePaymentReceipt();
    return;
  }

  if (event.target.closest('#appointment-notes-close') || event.target.closest('#appointment-notes-cancel')) {
    closeAppointmentNotes();
    return;
  }

  if (event.target.closest('#patient-appointments-close') || event.target.closest('#patient-appointments-cancel')) {
    closePatientAppointments();
    return;
  }
  
  if (event.target.closest('#appointment-no-schedule')) {
    const rescheduledAppointmentId = rescheduleAppointmentId;
    const wasFollowingUp = Boolean(followUpAppointmentId);
    const cancelledAppointment = rescheduledAppointmentId
      ? getAppointments().find(({ appointment }) => appointment[6] === rescheduledAppointmentId)?.appointment
      : null;
    const cancelledPatient = cancelledAppointment ? resolveAppointmentPatient(cancelledAppointment) : null;
    if (cancelledAppointment && removeAppointmentById(rescheduledAppointmentId)) {
      if (!saveAppointments()) {
        addAppointmentToDateCollection(cancelledAppointment);
        rescheduleAppointmentId = null;
        followUpAppointmentId = null;
        refreshPatientDetails(cancelledPatient);
        closeModal();
        renderLists();
        return;
      }
    }
    rescheduleAppointmentId = null;
    followUpAppointmentId = null;
    if (cancelledAppointment) renderLists();
    refreshPatientDetails(cancelledPatient);
    closeModal();
    if (cancelledAppointment) {
      showToast('La cita cancelada se eliminó; no se agendó otra.');
    } else {
      if (wasFollowingUp) renderLists();
      showToast('No se agendó una nueva cita.');
    }
    return;
  }

  if (event.target.closest('#modal-close')) {
    closeModal();
    return;
  }
  
  if (event.target.closest('#patient-modal-close') || event.target.closest('#patient-cancel')) {
    closePatientModal();
    return;
  }
  
  const link = event.target.closest('[data-page-link]');
  if (link) {
    event.preventDefault();
    changePage(link.dataset.pageLink, link.dataset.appointmentFilter || null);
    return;
  }
});

document.addEventListener('change', event => {
  if (event.target.matches('#modal-motive')) {
    const customLabel = document.querySelector('#modal-motive-custom-label');
    const customInput = document.querySelector('#modal-motive-custom');
    const isCustom = event.target.value === 'Otro';
    if (customLabel) customLabel.hidden = !isCustom;
    if (customInput) {
      customInput.required = isCustom;
      customInput.disabled = !isCustom;
      if (!isCustom) customInput.value = '';
    }
    return;
  }

  if (event.target.matches('#appointment-date-filter')) {
    activeAppointmentFilter = event.target.value;
    renderAppointmentTable();
    return;
  }

  if (event.target.matches('#appointment-sort-filter')) {
    activeAppointmentSort = event.target.value;
    renderAppointmentTable();
    return;
  }

  if (event.target.matches('#modal-date')) {
    refreshAppointmentTimeSlots(document.querySelector('#modal-time')?.value || '');
    return;
  }

  if (event.target.matches('.clinical-service-select')) {
    const row = event.target.closest('.clinical-service-row');
    const customLabel = row?.querySelector('.clinical-service-custom');
    const customInput = row?.querySelector('.clinical-service-custom-input');
    const isCustom = event.target.value === 'Otro...';
    if (customLabel) customLabel.hidden = !isCustom;
    if (customInput) {
      customInput.required = isCustom;
      if (!isCustom) customInput.value = '';
    }
    return;
  }

});

document.addEventListener('click', event => {
  const dateInput = event.target.closest('input[type="date"]');
  if (dateInput && !dateInput.disabled && typeof dateInput.showPicker === 'function') {
    dateInput.showPicker();
  }
});

document.addEventListener('submit', event => {
  if (event.target.matches('#auth-login-form')) {
    event.preventDefault();
    const message = document.querySelector('#auth-login-message');
    if (message) message.textContent = 'Supabase aún no está conectado; el inicio de sesión estará disponible al configurar la autenticación.';
    return;
  }

  if (event.target.matches('#appointment-notes-form')) {
    event.preventDefault();
    const appointmentId = document.querySelector('#appointment-notes-id')?.value;
    const notesInput = document.querySelector('#appointment-notes-text');
    const observationText = notesInput?.value.trim();
    const notesForm = document.querySelector('#appointment-notes-form');
    const isEditingObservation = notesForm?.dataset.editingObservation === 'true';
    const appointment = getAppointments().find(({ appointment: item }) => item[6] === appointmentId)?.appointment;
    if (!appointment) {
      showToast('No se encontró la cita para guardar el avance.');
      closeAppointmentNotes();
      return;
    }
    if (Array.isArray(appointment[11]) && appointment[11].length && !isEditingObservation) {
      showToast('Esta cita ya tiene un avance registrado.');
      openAppointmentNotes(appointmentId);
      return;
    }
    if (!observationText) {
      showToast('Escribe el avance u observación antes de guardar.');
      return;
    }
    if (isEditingObservation && Array.isArray(appointment[11]) && appointment[11].length) {
      appointment[11][0] = {
        ...appointment[11][0],
        text: observationText,
        updatedAt: new Date().toISOString()
      };
    } else {
      appointment[11] = [{
        id: generateId('observation'),
        text: observationText,
        createdAt: new Date().toISOString()
      }];
    }
    if (!saveAppointments()) return;
    renderLists();
    const patient = resolveAppointmentPatient(appointment);
    if (patient) {
      refreshPatientDetails(patient);
      document.querySelectorAll('[data-appointment-notes]').forEach(button => {
        if (button.dataset.appointmentNotes === appointmentId) button.textContent = 'Ver avance';
      });
    }
    if (patient && document.querySelector('#patient-appointments-modal.open')) {
      renderPatientAppointmentsModal(patient.id);
    }
    closeAppointmentNotes();
    showToast('Avance registrado correctamente.');
    return;
  }

  if (!event.target.matches('#appointment-form')) return;
  event.preventDefault();
  
  const patientInput = document.querySelector('#modal-patient');
  const patientIdInput = document.querySelector('#modal-patient-id');
  const motiveInput = document.querySelector('#modal-motive');
  const customMotiveInput = document.querySelector('#modal-motive-custom');
  const amountInput = document.querySelector('#modal-amount');
  const dateInput = document.querySelector('#modal-date');
  const timeInput = document.querySelector('#modal-time');
  
  if (!patientInput || !motiveInput || !amountInput || !dateInput || !timeInput) return;

  if (motiveInput.value === 'Otro' && !customMotiveInput?.value.trim()) {
    customMotiveInput?.focus();
    showToast('Especifica el motivo de la cita.');
    return;
  }

  const appointmentDate = dateInput.value;
  if (!appointmentDate) {
    dateInput.focus();
    showToast('Selecciona la fecha de la cita.');
    return;
  }
  if (appointmentDate < getISODate(0)) {
    dateInput.focus();
    showToast('No se pueden agendar citas en fechas pasadas.');
    return;
  }
  if (!timeInput.value) {
    showToast('Selecciona un horario disponible.');
    return;
  }
  if (isAppointmentTimeInPast(appointmentDate, timeInput.value)) {
    refreshAppointmentTimeSlots('');
    showToast('Selecciona un horario a partir de la hora actual.');
    return;
  }
  if (getAppointmentTimeSlotCount(appointmentDate, timeInput.value) >= 3) {
    refreshAppointmentTimeSlots('');
    showToast('Ese horario ya alcanzó el límite de 3 pacientes. Selecciona otro.');
    return;
  }

  if (!patientInput.value.trim()) {
    patientInput.focus();
    showToast('Ingresa el nombre del paciente.');
    return;
  }

  let patient = validateSelectedAppointmentPatient();
  if (!patient) return;

  if (patientHasAppointmentOnDate(patient, appointmentDate, editingAppointment?.id || null)) {
    showToast(`Este paciente ya tiene una cita registrada el ${formatDisplayDate(appointmentDate)}. Edita la cita existente para cambiarla.`);
    return;
  }

  if (patient.isNewPatient) {
    patient = createPatientFromAppointmentName(patient.nombre);
    if (!patient) {
      showToast('No se pudo crear el expediente del paciente.');
      return;
    }
    selectedPatient = patient;
    selectedPatientId = patient.id;
    if (patientIdInput) patientIdInput.value = patient.id;
    showToast('Nuevo paciente registrado y cita preparada.');
  }

  const treatment = sanitizeReason(getAppointmentMotive());
  const enteredAmount = getNumericAmount(amountInput.value);
  const totalAmount = enteredAmount;
  const balance = formatCurrency(enteredAmount);
  const initialPaidAmount = 0;
  const initialPaymentStatus = 'No pagado';
  const formattedTime = formatTimeFromInput(timeInput.value);
  
  if (editingAppointment) {
    const appointmentData = getAppointments().find(({ appointment }) => appointment[6] === editingAppointment.id);
    if (!appointmentData) {
      closeModal();
      showToast('La cita ya no existe.');
      return;
    }
    
    const appointment = appointmentData.appointment;
    const patientId = patient.id;
    const patientNameFinal = getPatientFullName(patient);
    const isRescheduling = rescheduleAppointmentId === appointment[6];
    
    const originalTotalAmount = getNumericAmount(appointment[8] ?? appointment[3]);
    const newBalance = getNumericAmount(balance);
    const updatedPaidAmount = Math.max(originalTotalAmount - newBalance, 0);
    const updatedPaymentStatus = newBalance <= 0 ? 'Completo' : updatedPaidAmount > 0 ? 'Parcial' : 'No pagado';
    
    const updatedAppointment = [
      formattedTime,
      patientNameFinal,
      treatment,
      balance,
      appointmentDate,
      isRescheduling ? 'En espera' : appointment[5] || 'En espera',
      appointment[6],
      patientId,
      originalTotalAmount,
      updatedPaidAmount,
      updatedPaymentStatus,
      Array.isArray(appointment[11]) ? appointment[11] : []
    ];
    
    removeAppointmentById(appointment[6]);
    addAppointmentToDateCollection(updatedAppointment);
    if (isRescheduling) rescheduleAppointmentId = null;
    saveAppointments();
    renderLists();
    refreshPatientDetails(patient);
    closeModal();
    showToast(`Cita de ${patientNameFinal} actualizada.`);
    return;
  }
  
  const appointment = [
    formattedTime,
    getPatientFullName(patient),
    treatment,
    balance,
    appointmentDate,
    'En espera',
    generateId('appointment'),
    patient.id,
    totalAmount,
    initialPaidAmount,
    initialPaymentStatus,
    []
  ];
  
  rescheduleAppointmentId = null;
  addAppointmentToDateCollection(appointment, true);
  saveAppointments();
  renderLists();
  refreshPatientDetails(patient);
  closeModal();
  showToast(`Cita agendada para ${getPatientFullName(patient)}.`);
  
  selectedPatient = null;
  selectedPatientId = null;
  if (patientIdInput) patientIdInput.value = '';
});

document.addEventListener('submit', event => {
  if (event.target.matches('#patient-form')) {
    event.preventDefault();
    const generateAppointment = event.submitter?.id === 'patient-save-appointment';
    Promise.all(pendingClinicalFiles.map(item => item.persistence))
      .then(() => savePatientForm(generateAppointment))
      .catch(error => {
        console.error('No se pudieron guardar los archivos clínicos:', error);
        showToast('No se pudieron guardar los archivos. Intenta adjuntarlos de nuevo.');
      });
  }
});

document.addEventListener('input', event => {
  if (event.target.matches('#patient-phone, #emergency-phone')) {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 10);
    return;
  }
  if (event.target.matches('#patient-name, #patient-lastname, #emergency-name')) {
    event.target.value = event.target.value.replace(/[^\p{L}\p{M}'’ -]/gu, '');
    return;
  }
  if (event.target.matches('#emergency-relation')) {
    event.target.value = event.target.value.replace(/[^\p{L}\p{M}'’ /-]/gu, '');
  }
});

document.addEventListener('change', event => {
  if (!event.target.matches('#clinical-files')) return;
  const files = Array.from(event.target.files || []);
  files.forEach(file => {
    const alreadySelected = pendingClinicalFiles.some(existing =>
      existing.file.name === file.name && existing.file.size === file.size && existing.file.type === file.type
    );
    const alreadyAttached = (editingPatient?.archivosClinicos || []).some(existing =>
      existing.name === file.name && existing.size === file.size && existing.type === file.type
    );
    if (!alreadySelected && !alreadyAttached) {
      const id = generateId('file');
      const persistence = storeClinicalFile(id, file);
      persistence.catch(error => {
        console.error(`No se pudo guardar el archivo "${file.name}":`, error);
        showToast(`No se pudo preparar "${file.name}" para guardarlo.`);
      });
      pendingClinicalFiles.push({ id, file, persistence });
    }
  });
  renderSelectedFiles([
    ...(editingPatient?.archivosClinicos || []),
    ...pendingClinicalFiles.map(({ id, file }) => ({ id, name: file.name, type: file.type, size: file.size }))
  ]);
  const formScroll = document.querySelector('#patient-form-scroll');
  if (formScroll) {
    requestAnimationFrame(() => {
      formScroll.scrollTo({ top: formScroll.scrollHeight, behavior: 'smooth' });
    });
  }
  event.target.value = '';
});

function applyGlobalSearch() {
  renderLists();
}

document.addEventListener('input', event => {
  if (event.target.matches('#patient-search')) {
    setGlobalSearchQuery(event.target.value);
    applyGlobalSearch();
    renderGlobalPatientSearch(event.target.value);
  }
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (document.querySelector('#appointment-modal.open')) {
    hidePatientSuggestions();
  }
});

function removeAppointmentById(appointmentId) {
  let removed = false;
  [todayAppointments, tomorrowAppointments, otherAppointments].forEach(collection => {
    for (let i = collection.length - 1; i >= 0; i--) {
      if (collection[i][6] === appointmentId) {
        collection.splice(i, 1);
        removed = true;
      }
    }
  });
  return removed;
}

function migrateAppointments() {
  let changed = false;
  const appointments = getAppointments().map(({ appointment }) => appointment);
  
  appointments.forEach(appointment => {
    const before = JSON.stringify(appointment);
    ensureAppointmentId(appointment);
    if (!appointment[7]) {
      const patient = findPatientByName(appointment[1]);
      if (patient) appointment[7] = patient.id;
    }
    if (before !== JSON.stringify(appointment)) changed = true;
  });
  
  const unique = new Map();
  appointments.forEach(app => unique.set(ensureAppointmentId(app), app));
  if (unique.size !== appointments.length) changed = true;
  
  rebuildAppointmentCollections(Array.from(unique.values()));
  if (changed) saveAppointments();
}

function normalizeStoredPatients() {
  let changed = false;
  const unique = new Map();
  
  patients.forEach(patient => {
    if (!patient.id) {
      patient.id = generateId('patient');
      changed = true;
    }
    if (!Array.isArray(patient.historialClinico)) {
      patient.historialClinico = [];
      changed = true;
    }
    if (!Array.isArray(patient.historialFinanciero)) {
      patient.historialFinanciero = [];
      changed = true;
    }
    if (!Array.isArray(patient.archivosClinicos)) {
      patient.archivosClinicos = [];
      changed = true;
    }
    unique.set(patient.id, patient);
  });
  
  if (unique.size !== patients.length) {
    patients = Array.from(unique.values());
    changed = true;
  }
  
  patients.forEach(patient => {
    const records = patient.historialClinico || [];
    const uniqueRecords = new Map();
    records.forEach(record => {
      const key = [
        record.fecha || '',
        normalizeName(record.tratamiento),
        normalizeName(record.diagnostico),
        normalizeName(record.avance)
      ].join('|');
      uniqueRecords.set(key, record);
    });
    if (uniqueRecords.size !== records.length) {
      patient.historialClinico = Array.from(uniqueRecords.values());
      changed = true;
    }
  });
  
  return changed;
}

function cleanAppointments() {
  let changed = false;
  const appointments = getAppointments().map(({ appointment }) => appointment);
  const validStatuses = ['En espera', 'Finalizada', 'Cancelada'];
  
  appointments.forEach(appointment => {
    if (!validStatuses.includes(appointment[5])) {
      appointment[5] = 'En espera';
      changed = true;
    }
    if (!appointment[4]) {
      appointment[4] = getISODate(0);
      changed = true;
    }
    ensureAppointmentId(appointment);
    if (!appointment[7]) {
      const patient = findPatientByName(appointment[1]);
      if (patient) {
        appointment[7] = patient.id;
        changed = true;
      }
    }
  });
  
  const unique = new Map();
  appointments.forEach(app => unique.set(app[6], app));
  if (unique.size !== appointments.length) changed = true;
  
  rebuildAppointmentCollections(Array.from(unique.values()));
  return changed;
}

function syncPatientAppointmentReferences() {
  let changed = false;
  getAppointments().forEach(({ appointment }) => {
    if (!appointment[7]) {
      const patient = findPatientByName(appointment[1]);
      if (patient) {
        appointment[7] = patient.id;
        changed = true;
      }
    }
  });
  if (changed) saveAppointments();
  return changed;
}

function initializeStorage() {
  patients = loadPatients();
  loadAppointments();
  loadBlockedAppointmentSlots();
  
  const patientsChanged = normalizeStoredPatients();
  migrateAppointments();
  syncPatientAppointmentReferences();
  const appointmentsChanged = cleanAppointments();
  
  if (patientsChanged) savePatients();
  if (appointmentsChanged) saveAppointments();
  
  localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
}

function initializeApp() {
  initializeAuthPreview();
  initializeStorage();
  createPaymentReceiptModal();
  renderLists();
  renderDashboardCalendar();
  updateAttendedCount();
  updateDashboardIncome();
  initializeAppointmentPatientSearch();
  unlockPageScroll();
  
  const patientModal = document.querySelector('#patient-modal');
  const appointmentModal = document.querySelector('#appointment-modal');
  
  if (patientModal) {
    patientModal.classList.remove('open');
    patientModal.setAttribute('aria-hidden', 'true');
  }
  if (appointmentModal) {
    appointmentModal.classList.remove('open');
    appointmentModal.setAttribute('aria-hidden', 'true');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
  initializeApp();
}
