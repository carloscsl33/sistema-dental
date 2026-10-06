const MAX_REASON_LENGTH = 32;

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const pages = {
  centro: ['Centro de Mando'],
  calendario: ['Calendario'],
  citas: ['Citas'],
  pacientes: ['Pacientes'],
  finanzas: ['Finanzas'],
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


/* =========================================================
   STORAGE
========================================================= */

const PATIENTS_STORAGE_KEY =
  'dentalClinicPatients';

const APPOINTMENTS_STORAGE_KEY =
  'dentalClinicAppointments';

const STORAGE_VERSION_KEY =
  'dentalClinicStorageVersion';

const STORAGE_VERSION = '5';


/* =========================================================
   COLECCIONES
========================================================= */

const todayAppointments = [];
const tomorrowAppointments = [];
const otherAppointments = [];


/* =========================================================
   VARIABLES GLOBALES
========================================================= */

let selectedPatient = null;
let selectedPatientId = null;

let toastTimer = null;

let editingAppointment = null;
let editingPatient = null;

let activeAppointmentFilter = 'today';

const currentDate = new Date();

let calendarMonth =
  currentDate.getMonth();

let calendarYear =
  currentDate.getFullYear();

let patients = [];

let globalSearchQuery = '';

/* =========================================================
   CONTROL DE SCROLL DE MODALES
========================================================= */

function lockPageScroll() {

  document.documentElement.classList.add(
    'modal-open'
  );

  document.body.classList.add(
    'modal-open'
  );
}


function unlockPageScroll() {

  document.documentElement.classList.remove(
    'modal-open'
  );

  document.body.classList.remove(
    'modal-open'
  );
}


function updatePageScrollLock() {

  const paymentReceiptModal =
    document.querySelector(
      '#payment-receipt-modal'
    );

  const paymentReceiptOpen =
    paymentReceiptModal?.classList.contains(
      'open'
    );
    
  const appointmentModal =
    document.querySelector(
      '#appointment-modal'
    );

  const patientModal =
    document.querySelector(
      '#patient-modal'
    );

  const appointmentOpen =
    appointmentModal?.classList.contains(
      'open'
    );

  const patientOpen =
    patientModal?.classList.contains(
      'open'
    );

  if (
    appointmentOpen ||
    patientOpen ||
    paymentReceiptOpen
  ) {
    lockPageScroll();
  } else {
    unlockPageScroll();
  }
}


/* =========================================================
   STORAGE - UTILIDADES
========================================================= */

function saveToStorage(
  key,
  value
) {

  try {

    localStorage.setItem(
      key,
      JSON.stringify(value)
    );

    return true;

  } catch (error) {

    console.error(
      `No se pudo guardar ${key}:`,
      error
    );

    showToast(
      'No se pudieron guardar los cambios.'
    );

    return false;
  }
}


function readFromStorage(
  key,
  fallback = []
) {

  try {

    const saved =
      localStorage.getItem(key);

    if (!saved) {
      return fallback;
    }

    const parsed =
      JSON.parse(saved);

    return parsed;

  } catch (error) {

    console.error(
      `No se pudo leer ${key}:`,
      error
    );

    return fallback;
  }
}


function savePatients() {

  return saveToStorage(
    PATIENTS_STORAGE_KEY,
    patients
  );
}


function loadPatients() {

  const parsed =
    readFromStorage(
      PATIENTS_STORAGE_KEY,
      []
    );

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map(normalizePatient)
    .filter(Boolean);
}


function saveAppointments() {

  const allAppointments =
    getAppointments()
      .map(
        ({ appointment }) =>
          appointment
      );

  return saveToStorage(
    APPOINTMENTS_STORAGE_KEY,
    allAppointments
  );
}


function loadAppointments() {

  const parsed =
    readFromStorage(
      APPOINTMENTS_STORAGE_KEY,
      []
    );

  todayAppointments.length = 0;
  tomorrowAppointments.length = 0;
  otherAppointments.length = 0;

  if (!Array.isArray(parsed)) {
    return;
  }

  parsed.forEach(
    rawAppointment => {

      const appointment =
        normalizeAppointment(
          rawAppointment
        );

      if (!appointment) {
        return;
      }

      addAppointmentToDateCollection(
        appointment
      );
    }
  );
}


/* =========================================================
   NORMALIZACIÓN DE PACIENTES
========================================================= */

function normalizePatient(
  patient
) {

  if (
    !patient ||
    typeof patient !== 'object'
  ) {
    return null;
  }

  return {

    id:
      patient.id ||
      generateId('patient'),

    nombre:
      String(
        patient.nombre || ''
      ).trim(),

    apellidos:
      String(
        patient.apellidos || ''
      ).trim(),

    fechaNacimiento:
      patient.fechaNacimiento || '',

    sexo:
      patient.sexo || '',

    telefono:
      patient.telefono || '',

    correo:
      patient.correo || '',

    direccion:
      patient.direccion || '',

    contactoEmergencia:
      patient.contactoEmergencia || '',

    parentescoEmergencia:
      patient.parentescoEmergencia || '',

    telefonoEmergencia:
      patient.telefonoEmergencia || '',

    antecedentesMedicos:
      patient.antecedentesMedicos || '',

    alergias:
      patient.alergias || '',

    medicamentos:
      patient.medicamentos || '',

    tipoSangre:
      patient.tipoSangre || '',

    observacionesMedicas:
      patient.observacionesMedicas || '',

    tratamientoActual:
      patient.tratamientoActual || '',

    diagnostico:
      patient.diagnostico || '',

    avanceClinico:
      patient.avanceClinico || '',

    fechaRegistroClinico:
      patient.fechaRegistroClinico || '',

    archivosClinicos:
      Array.isArray(
        patient.archivosClinicos
      )
        ? patient.archivosClinicos
        : [],

    historialClinico:
      Array.isArray(
        patient.historialClinico
      )
        ? patient.historialClinico
        : [],

    historialFinanciero:
      Array.isArray(
        patient.historialFinanciero
      )
        ? patient.historialFinanciero
        : [],

    createdAt:
      patient.createdAt ||
      new Date().toISOString()
  };
}


/* =========================================================
   NORMALIZACIÓN DE CITAS
========================================================= */

function normalizeAppointment(
  appointment
) {

  if (!Array.isArray(appointment)) {
    return null;
  }

  const time =
    appointment[0] ||
    '09:00 AM';

  const name =
    String(
      appointment[1] || ''
    ).trim();

  const reason =
    sanitizeReason(
      appointment[2]
    );

  const balance =
    appointment[3] || '$0';

  const date =
    appointment[4] ||
    getISODate(0);

  const status =
    appointment[5] ||
    'En espera';

  const id =
    appointment[6] ||
    generateId('appointment');

  const patientId =
    appointment[7] ||
    null;

  /*
   * =====================================================
   * DATOS FINANCIEROS
   * =====================================================
   *
   * Las posiciones 8, 9 y 10 son nuevas.
   *
   * Las citas antiguas no las tendrán, por eso
   * utilizamos valores compatibles.
   */

  const totalAmount =
    appointment[8] !== undefined
      ? getNumericAmount(
          appointment[8]
        )
      : getNumericAmount(
          balance
        );

  const paidAmount =
    appointment[9] !== undefined
      ? getNumericAmount(
          appointment[9]
        )
      : Math.max(
          totalAmount -
          getNumericAmount(balance),
          0
        );

  const paymentStatus =
    appointment[10] ||
    (
      getNumericAmount(balance) === 0 &&
      totalAmount > 0
        ? 'Completo'
        : paidAmount > 0
          ? 'Parcial'
          : 'No pagado'
    );

  return [
    time,
    name,
    reason,
    balance,
    date,
    status,
    id,
    patientId,
    totalAmount,
    paidAmount,
    paymentStatus
  ];
}

/* =========================================================
   PACIENTE VACÍO
========================================================= */

function createEmptyPatient() {

  return {

    id:
      generateId('patient'),

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
    avanceClinico: '',
    fechaRegistroClinico: '',

    archivosClinicos: [],
    historialClinico: [],
    historialFinanciero: [],

    createdAt:
      new Date().toISOString()
  };
}
/* =========================================================
   PACIENTE NUEVO POR CITA
========================================================= */

function createPatientFromAppointmentName(
  fullName
) {

  const cleanName =
    String(fullName || '')
      .replace(/\s+/g, ' ')
      .trim();

  if (!cleanName) {
    return null;
  }

  /*
   * Intentamos separar:
   *
   * Nombre(s) + Apellidos
   *
   * Para este primer registro,
   * dejamos el último bloque como apellidos.
   */
  const parts =
    cleanName.split(' ');

  let nombre = cleanName;
  let apellidos = '';

  if (parts.length >= 2) {

    apellidos =
      parts
        .slice(-2)
        .join(' ');

    nombre =
      parts
        .slice(0, -2)
        .join(' ');

    /*
     * Si solamente quedaron una o cero
     * palabras como nombre, utilizamos
     * la última palabra como apellido.
     */
    if (!nombre) {

      nombre =
        parts
          .slice(0, -1)
          .join(' ');

      apellidos =
        parts[parts.length - 1];
    }
  }

  const patient =
    createEmptyPatient();

  patient.nombre =
    nombre || cleanName;

  patient.apellidos =
    apellidos;

  patient.fechaRegistroClinico =
    getISODate(0);

  patients.push(patient);

  savePatients();

  return patient;
}

/* =========================================================
   UTILIDADES GENERALES
========================================================= */

function generateId(
  prefix = 'id'
) {

  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;
}


function getISODate(
  offset = 0
) {

  const date =
    new Date();

  date.setHours(
    12,
    0,
    0,
    0
  );

  date.setDate(
    date.getDate() + offset
  );

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, '0');

  const day =
    String(
      date.getDate()
    ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


function sanitizeReason(
  value
) {

  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(
      0,
      MAX_REASON_LENGTH
    ) ||
    'Consulta';
}


function escapeHTML(
  value
) {

  return String(
    value ?? ''
  ).replace(
    /[&<>"']/g,
    character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]
  );
}


function formatCurrency(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '$0';
  }

  const digits =
    String(value)
      .replace(/[^\d.]/g, '');

  if (!digits) {
    return '$0';
  }

  const numeric =
    Number(digits);

  if (
    Number.isNaN(numeric)
  ) {
    return '$0';
  }

  return `$${numeric.toLocaleString(
    'es-MX'
  )}`;
}


function formatTimeFromInput(
  timeValue
) {

  if (!timeValue) {
    return '09:00 AM';
  }

  const [
    hours,
    minutes
  ] =
    timeValue
      .split(':')
      .map(Number);

  const date =
    new Date();

  date.setHours(
    hours,
    minutes,
    0,
    0
  );

  return date.toLocaleTimeString(
    'en-US',
    {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }
  );
}


function toInputTime(
  timeValue
) {

  const match =
    String(timeValue)
      .match(
        /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
      );

  if (!match) {
    return '09:00';
  }

  let hours =
    Number(match[1]) % 12;

  if (
    match[3].toUpperCase() ===
    'PM'
  ) {
    hours += 12;
  }

  return `${String(
    hours
  ).padStart(
    2,
    '0'
  )}:${match[2]}`;
}


function formatDisplayDate(
  dateValue
) {

  if (!dateValue) {
    return 'Fecha pendiente';
  }

  const [
    year,
    month,
    day
  ] =
    String(dateValue)
      .split('-')
      .map(Number);

  if (
    !year ||
    !month ||
    !day
  ) {
    return 'Fecha pendiente';
  }

  return new Date(
    year,
    month - 1,
    day
  ).toLocaleDateString(
    'es-MX',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }
  );
}


function getInitials(
  name
) {

  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(
      part => part[0]
    )
    .join('')
    .toUpperCase();
}


function showToast(
  message
) {

  const toast =
    document.querySelector(
      '#toast'
    );

  if (!toast) {
    return;
  }

  toast.textContent =
    message;

  toast.classList.add(
    'show'
  );

  clearTimeout(
    toastTimer
  );

  toastTimer =
    setTimeout(
      () => {
        toast.classList.remove(
          'show'
        );
      },
      2800
    );
}


/* =========================================================
   PACIENTES - BÚSQUEDA
========================================================= */

function getPatientFullName(
  patient
) {

  return `${patient?.nombre || ''} ${
    patient?.apellidos || ''
  }`
    .replace(/\s+/g, ' ')
    .trim();
}


function normalizeName(
  name
) {

  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase(
      'es-MX'
    );
}


function normalizeSearchText(
  value
) {

  return String(value || '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase(
      'es-MX'
    );
}

/* =========================================================
   BUSCADOR GLOBAL - UTILIDADES
========================================================= */

function setGlobalSearchQuery(query) {

  globalSearchQuery =
    normalizeSearchText(query);

}


function getSearchableAppointmentText(
  appointment
) {

  if (!appointment) {
    return '';
  }

  const [
    time,
    name,
    treatment,
    balance,
    date,
    status
  ] = appointment;

  const patient =
    resolveAppointmentPatient(
      appointment
    );

  const patientName =
    patient
      ? getPatientFullName(patient)
      : name;

  return normalizeSearchText(
    [
      patientName,
      name,
      treatment,
      status,
      balance,
      time,
      date
    ]
      .filter(Boolean)
      .join(' ')
  );
}


function appointmentMatchesSearch(
  appointment
) {

  if (!globalSearchQuery) {
    return true;
  }

  return getSearchableAppointmentText(
    appointment
  ).includes(
    globalSearchQuery
  );
}


function getSearchablePatientText(
  patient
) {

  if (!patient) {
    return '';
  }

  const appointments =
    getPatientAppointments(
      patient
    );

  const appointmentText =
    appointments
      .map(
        appointment =>
          [
            appointment[1],
            appointment[2],
            appointment[5]
          ]
            .filter(Boolean)
            .join(' ')
      )
      .join(' ');

  return normalizeSearchText(
    [
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

      appointmentText
    ]
      .filter(Boolean)
      .join(' ')
  );
}


function patientMatchesSearch(
  patient
) {

  if (!globalSearchQuery) {
    return true;
  }

  return getSearchablePatientText(
    patient
  ).includes(
    globalSearchQuery
  );
}


function findPatientByName(
  name
) {

  const normalized =
    normalizeName(name);

  if (!normalized) {
    return null;
  }

  return patients.find(
    patient =>
      normalizeName(
        getPatientFullName(
          patient
        )
      ) === normalized
  ) || null;
}


function findPatientById(
  id
) {

  if (!id) {
    return null;
  }

  return patients.find(
    patient =>
      patient.id === id
  ) || null;
}


/* =========================================================
   NUEVA CITA - AUTOCOMPLETADO DE PACIENTES
========================================================= */

function getAppointmentPatientElements() {

  return {

    input:
      document.querySelector(
        '#modal-patient'
      ),

    hiddenId:
      document.querySelector(
        '#modal-patient-id'
      ),

    suggestions:
      document.querySelector(
        '#modal-patient-suggestions'
      ),

    help:
      document.querySelector(
        '#modal-patient-help'
      )
  };
}


function clearAppointmentPatientSelection(
  clearInput = false
) {

  selectedPatient =
    null;

  selectedPatientId =
    null;

  const {
    input,
    hiddenId
  } =
    getAppointmentPatientElements();

  if (hiddenId) {
    hiddenId.value = '';
  }

  if (clearInput && input) {
    input.value = '';
  }

  if (input) {
    input.removeAttribute(
      'data-patient-selected'
    );
  }
}


function hidePatientSuggestions() {

  const {
    suggestions,
    input
  } =
    getAppointmentPatientElements();

  if (!suggestions) {
    return;
  }

  suggestions.innerHTML = '';

  suggestions.classList.remove(
    'open'
  );

  if (input) {
    input.setAttribute(
      'aria-expanded',
      'false'
    );
  }
}


function getFilteredAppointmentPatients(
  query
) {

  const normalizedQuery =
    normalizeSearchText(
      query
    );

  if (!normalizedQuery) {
    return [];
  }

  return patients
    .filter(
      patient => {

        const fullName =
          getPatientFullName(
            patient
          );

        const normalizedName =
          normalizeSearchText(
            fullName
          );

        return normalizedName.includes(
          normalizedQuery
        );
      }
    )
    .sort(
      (a, b) =>
        getPatientFullName(a)
          .localeCompare(
            getPatientFullName(b),
            'es-MX',
            {
              sensitivity: 'base'
            }
          )
    );
}


function renderPatientSuggestions(
  query
) {

  const {
    input,
    suggestions
  } =
    getAppointmentPatientElements();

  if (!input || !suggestions) {
    return;
  }

  const trimmedQuery =
    query.trim();

  if (!trimmedQuery) {
    hidePatientSuggestions();
    return;
  }

  const matches =
    getFilteredAppointmentPatients(
      trimmedQuery
    );

  if (!matches.length) {

    suggestions.innerHTML = `
      <div
        class="patient-suggestion-empty">
        No se encontraron pacientes registrados.
      </div>
    `;

    suggestions.classList.add(
      'open'
    );

    input.setAttribute(
      'aria-expanded',
      'true'
    );

    return;
  }

  suggestions.innerHTML =
    matches
      .map(
        patient => {

          const fullName =
            getPatientFullName(
              patient
            );

          return `
            <button
              type="button"
              class="patient-suggestion"
              role="option"
              aria-selected="false"
              data-appointment-patient-id="${escapeHTML(
                patient.id
              )}">

              <span
                class="patient-suggestion-avatar">
                ${escapeHTML(
                  getInitials(
                    fullName
                  )
                )}
              </span>

              <span
                class="patient-suggestion-copy">

                <strong>
                  ${escapeHTML(
                    fullName
                  )}
                </strong>

                ${
                  patient.telefono
                    ? `
                      <small>
                        ${escapeHTML(
                          patient.telefono
                        )}
                      </small>
                    `
                    : ''
                }

              </span>

            </button>
          `;
        }
      )
      .join('');

  suggestions.classList.add(
    'open'
  );

  input.setAttribute(
    'aria-expanded',
    'true'
  );
}


function selectAppointmentPatient(
  patientId
) {

  const patient =
    findPatientById(
      patientId
    );

  const {
    input,
    hiddenId,
    suggestions
  } =
    getAppointmentPatientElements();

  if (!patient) {

    clearAppointmentPatientSelection(
      false
    );

    if (input) {
      input.value = '';
    }

    hidePatientSuggestions();

    showToast(
      'El paciente seleccionado ya no existe.'
    );

    return false;
  }

  const fullName =
    getPatientFullName(
      patient
    );

  selectedPatient =
    patient;

  selectedPatientId =
    patient.id;

  if (input) {

    input.value =
      fullName;

    input.setAttribute(
      'data-patient-selected',
      'true'
    );
  }

  if (hiddenId) {
    hiddenId.value =
      patient.id;
  }

  if (suggestions) {

    suggestions.innerHTML =
      '';

    suggestions.classList.remove(
      'open'
    );
  }

  if (input) {

    input.setAttribute(
      'aria-expanded',
      'false'
    );
  }

  return true;
}


function initializeAppointmentPatientSearch() {

  const {
    input,
    suggestions
  } =
    getAppointmentPatientElements();

  if (!input) {
    return;
  }

  input.addEventListener(
    'input',
    () => {

      /*
       * Cualquier modificación manual
       * invalida la selección anterior.
       */
      clearAppointmentPatientSelection(
        false
      );

      renderPatientSuggestions(
        input.value
      );
    }
  );

  input.addEventListener(
    'focus',
    () => {

      if (
        input.readOnly
      ) {
        return;
      }

      if (
        input.value.trim()
      ) {

        renderPatientSuggestions(
          input.value
        );
      }
    }
  );

  input.addEventListener(
    'keydown',
    event => {

      if (
        event.key ===
        'Escape'
      ) {

        hidePatientSuggestions();

        return;
      }
    }
  );

  if (suggestions) {

    suggestions.addEventListener(
      'mousedown',
      event => {

        const button =
          event.target.closest(
            '[data-appointment-patient-id]'
          );

        if (!button) {
          return;
        }

        /*
         * Evita que el input pierda
         * el foco antes de realizar
         * la selección.
         */
        event.preventDefault();

        selectAppointmentPatient(
          button.dataset
            .appointmentPatientId
        );
      }
    );
  }
}


function validateSelectedAppointmentPatient() {

  const {
    input,
    hiddenId
  } = getAppointmentPatientElements();

  const typedName =
    input?.value.trim() || '';

  /*
   * Si no se escribió ningún paciente,
   * no permitimos guardar la cita.
   */
  if (!typedName) {

    if (hiddenId) {
      hiddenId.value = '';
    }

    selectedPatient = null;
    selectedPatientId = null;

    showToast(
      'Ingresa el nombre del paciente.'
    );

    return null;
  }

  /*
   * Si existe un ID seleccionado,
   * comprobamos que siga existiendo.
   */
  const patientId =
    hiddenId?.value ||
    selectedPatientId ||
    '';

  if (patientId) {

    const patient =
      findPatientById(patientId);

    if (patient) {

      const visibleName =
        normalizeSearchText(
          typedName
        );

      const patientName =
        normalizeSearchText(
          getPatientFullName(patient)
        );

      /*
       * Si el usuario modificó manualmente
       * el nombre después de seleccionar
       * un paciente, dejamos de considerarlo
       * como paciente existente.
       */
      if (
        visibleName === patientName
      ) {

        selectedPatient = patient;
        selectedPatientId = patient.id;

        if (hiddenId) {
          hiddenId.value = patient.id;
        }

        return patient;
      }
    }

    /*
     * El ID ya no corresponde al nombre
     * escrito. Se tratará como paciente nuevo.
     */
    if (hiddenId) {
      hiddenId.value = '';
    }

    selectedPatient = null;
    selectedPatientId = null;
  }

  /*
   * Buscar coincidencia exacta por nombre.
   *
   * Esto permite que el usuario escriba
   * manualmente el nombre completo de un
   * paciente que ya existe.
   */
  const existingPatient =
    findPatientByName(typedName);

  if (existingPatient) {

    selectedPatient =
      existingPatient;

    selectedPatientId =
      existingPatient.id;

    if (hiddenId) {
      hiddenId.value =
        existingPatient.id;
    }

    return existingPatient;
  }

  /*
   * No existe:
   *
   * Se devuelve un objeto temporal.
   * La función que guarda la cita será
   * responsable de crear el expediente.
   */
  return {
    isNewPatient: true,
    nombre: typedName
  };
}

/* =========================================================
   CITAS - COLECCIONES
========================================================= */

function getAppointments() {

  return [

    ...todayAppointments.map(
      (
        appointment,
        index
      ) => ({
        appointment,
        index,
        source: 'today'
      })
    ),

    ...tomorrowAppointments.map(
      (
        appointment,
        index
      ) => ({
        appointment,
        index,
        source: 'tomorrow'
      })
    ),

    ...otherAppointments.map(
      (
        appointment,
        index
      ) => ({
        appointment,
        index,
        source: 'other'
      })
    )

  ];
}


function getAppointmentList(
  source
) {

  if (
    source === 'today'
  ) {
    return todayAppointments;
  }

  if (
    source === 'tomorrow'
  ) {
    return tomorrowAppointments;
  }

  return otherAppointments;
}


function getAppointmentCollectionByDate(
  date
) {

  if (
    date === getISODate(0)
  ) {
    return todayAppointments;
  }

  if (
    date === getISODate(1)
  ) {
    return tomorrowAppointments;
  }

  return otherAppointments;
}


function addAppointmentToDateCollection(
  appointment,
  atBeginning = false
) {

  const collection =
    getAppointmentCollectionByDate(
      appointment[4]
    );

  if (atBeginning) {
    collection.unshift(
      appointment
    );
  } else {
    collection.push(
      appointment
    );
  }
}


function rebuildAppointmentCollections(
  appointments
) {

  todayAppointments.length = 0;
  tomorrowAppointments.length = 0;
  otherAppointments.length = 0;

  appointments.forEach(
    appointment => {

      addAppointmentToDateCollection(
        appointment
      );

    }
  );
}


function getStatusClass(
  status
) {

  switch (status) {

    case 'Finalizada':
      return 'confirmed';

    case 'Cancelada':
      return 'postponed';

    case 'En espera':
    default:
      return 'pending';
  }
}


function ensureAppointmentId(
  appointment
) {

  if (!appointment[6]) {
    appointment[6] =
      generateId(
        'appointment'
      );
  }

  if (
    ![
      'En espera',
      'Finalizada',
      'Cancelada'
    ].includes(
      appointment[5]
    )
  ) {
    appointment[5] =
      'En espera';
  }

  return appointment[6];
}


/* =========================================================
   RELACIÓN PACIENTE - CITA
========================================================= */

function resolveAppointmentPatient(
  appointment
) {

  if (!appointment) {
    return null;
  }

  if (appointment[7]) {

    const patient =
      findPatientById(
        appointment[7]
      );

    if (patient) {
      return patient;
    }
  }

  const patient =
    findPatientByName(
      appointment[1]
    );

  if (patient) {

    appointment[7] =
      patient.id;

    return patient;
  }

  return null;
}


function getPatientAppointments(
  patient
) {

  if (!patient) {
    return [];
  }

  return getAppointments()
    .filter(
      ({ appointment }) => {

        if (
          appointment[7] ===
          patient.id
        ) {
          return true;
        }

        if (
          !appointment[7] &&
          normalizeName(
            appointment[1]
          ) ===
          normalizeName(
            getPatientFullName(
              patient
            )
          )
        ) {

          appointment[7] =
            patient.id;

          return true;
        }

        return false;
      }
    )
    .map(
      ({ appointment }) =>
        appointment
    );
}


/* =========================================================
   DASHBOARD - ESTATUS
========================================================= */

function statusDots(
  name,
  appointmentId
) {

  const appointmentData =
    getAppointments().find(
      ({ appointment }) =>
        appointment[6] ===
        appointmentId
    );

  const currentStatus =
    appointmentData
      ?.appointment?.[5] ||
    'En espera';

  return `
    <div>

      <div
        class="status-dots"
        role="group"
        aria-label="Estatus de ${escapeHTML(name)}">

        <button
          class="status-dot confirmed ${
            currentStatus === 'Finalizada'
              ? 'selected'
              : ''
          }"
          data-status="Finalizada"
          data-appointment-status="${escapeHTML(
            appointmentId
          )}"
          title="Finalizada"
          aria-label="Finalizada">
        </button>

        <button
          class="status-dot pending ${
            currentStatus === 'En espera'
              ? 'selected'
              : ''
          }"
          data-status="En espera"
          data-appointment-status="${escapeHTML(
            appointmentId
          )}"
          title="En espera"
          aria-label="En espera">
        </button>

        <button
          class="status-dot postponed ${
            currentStatus === 'Cancelada'
              ? 'selected'
              : ''
          }"
          data-status="Cancelada"
          data-appointment-status="${escapeHTML(
            appointmentId
          )}"
          title="Cancelada"
          aria-label="Cancelada">
        </button>

      </div>

      <span class="status-text">
        ${escapeHTML(currentStatus)}
      </span>

    </div>
  `;
}


function todayMarkup(
  item,
  index
) {

  const [
    time,
    name,
    treatment,
    balance,
    date,
    status,
    appointmentId
  ] = item;

  ensureAppointmentId(item);

  return `
    <div
      class="appointment-row"
      data-type="today"
      data-index="${index}">

      <div class="time">
        ${escapeHTML(time)}
      </div>

      <div class="person">
        <div>
          <strong>
            ${escapeHTML(name)}
          </strong>

          <small>
            ${escapeHTML(treatment)}
          </small>
        </div>
      </div>

      <div class="charge">

        ${escapeHTML(
          balance || '$0'
        )}

        <button
          class="charge-button"
          data-name="${escapeHTML(name)}">
        </button>

      </div>

      ${statusDots(
        name,
        appointmentId
      )}

      <button
        class="new-followup"
        data-new-appointment="${index}">
        Cita nueva
      </button>

      <button
        class="new-followup payment-receipt-button"
        data-payment-receipt="${escapeHTML(
          appointmentId
        )}">
        Recibo de pago
      </button>

    </div>
  `;
}


function tomorrowMarkup(
  item,
  index
) {

  const [
    time,
    name,
    treatment,
    balance
  ] = item;

  ensureAppointmentId(item);

  return `
    <div
      class="tomorrow-row">

      <div class="person">

        <div>

          <strong>
            ${escapeHTML(name)}
            · ${escapeHTML(time)}
          </strong>

          <small>
            ${escapeHTML(treatment)}
            · Saldo:
            ${escapeHTML(
              balance || '$0'
            )}
          </small>

        </div>

      </div>

      <button
        class="whatsapp"
        data-reminder="${escapeHTML(name)}"
        data-reminder-time="${escapeHTML(time)}"
        aria-label="Recordar por WhatsApp">
        ✆
      </button>

    </div>
  `;
}

/* =========================================================
   TABLA DE CITAS
========================================================= */

function appointmentCardMarkup(
  appointment,
  index,
  source
) {

  const [
    time,
    name,
    reason,
    balance,
    date,
    status,
    appointmentId
  ] = appointment;

  ensureAppointmentId(
    appointment
  );

  return `
    <article
      class="managed-appointment"
      data-search-match="${
        appointmentMatchesSearch(appointment)
          ? 'true'
          : 'false'
      }">

      <div
        class="managed-appointment-time">

        <strong>
          ${escapeHTML(time)}
        </strong>

        <small>
          ${formatDisplayDate(date)}
        </small>

      </div>

      <div
        class="managed-appointment-person">

        <strong>
          ${escapeHTML(name)}
        </strong>

        <small>
          ${escapeHTML(reason)}
        </small>

      </div>

      <div
        class="managed-appointment-charge">

        <span>
          Saldo
        </span>

        <strong>
          ${escapeHTML(
            balance || '$0'
          )}
        </strong>

      </div>

      <div
        class="managed-appointment-actions">

        <span class="appointment-status-label ${getStatusClass(status)}">

          ${escapeHTML(
            status || 'En espera'
          )}

        </span>

        <button
          class="patient-info-button"
          data-patient-info="${escapeHTML(
            encodeURIComponent(name)
          )}">
          Info del paciente
        </button>

        <button
          class="row-action"
          data-edit-appointment="${source}:${index}">
          Editar cita
        </button>

        <button
          class="row-action delete-action"
          data-delete-appointment="${source}:${index}">
          Eliminar cita
        </button>

      </div>

    </article>
  `;
}


function renderAppointmentTable() {

  const appointments =
    getAppointments().filter(
      ({ appointment, source }) => {

        const matchesDate =
          activeAppointmentFilter ===
            'all' ||
          source ===
            activeAppointmentFilter;

        const matchesSearch =
          appointmentMatchesSearch(
            appointment
          );

        return (
          matchesDate &&
          matchesSearch
        );
      }
    );

  const container =
    document.querySelector(
      '#all-appointments'
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    appointments.length
      ? appointments
          .map(
            ({
              appointment,
              index,
              source
            }) =>
              appointmentCardMarkup(
                appointment,
                index,
                source
              )
          )
          .join('')
      : `
        <p class="empty-state">
          No hay citas para este filtro.
        </p>
      `;
}


/* =========================================================
   RENDER GENERAL
========================================================= */

function renderLists() {

  const todayList =
    document.querySelector(
      '#today-list'
    );

  const tomorrowList =
    document.querySelector(
      '#tomorrow-list'
    );

  /*
   * =====================================================
   * CENTRO DE MANDO
   * =====================================================
   *
   * Las listas se vuelven a construir cada vez que
   * cambia la búsqueda para que appointmentMatchesSearch()
   * utilice el valor actual de globalSearchQuery.
   */

  if (todayList) {

    todayList.innerHTML =
      todayAppointments
        .filter(appointment =>
          appointmentMatchesSearch(
            appointment
          )
        )
        .map(todayMarkup)
        .join('');
  }

  if (tomorrowList) {

    tomorrowList.innerHTML =
      tomorrowAppointments
        .filter(appointment =>
          appointmentMatchesSearch(
            appointment
          )
        )
        .map(tomorrowMarkup)
        .join('');
  }


  /*
   * =====================================================
   * CITAS
   * =====================================================
   */

  renderAppointmentTable();


  /*
   * =====================================================
   * PACIENTES
   * =====================================================
   */

  renderPatientDirectory(
    globalSearchQuery
  );


  /*
   * =====================================================
   * CONTADORES
   * =====================================================
   */

  const todayCount =
    document.querySelector(
      '#today-count'
    );

  if (todayCount) {
    todayCount.textContent =
      todayAppointments.length;
  }


  /*
   * =====================================================
   * FINANZAS / DASHBOARD
   * =====================================================
   */

  updateDashboardIncome();

  updateAttendedCount();


  /*
   * =====================================================
   * CALENDARIOS
   * =====================================================
   */

  renderCalendars();
}

/* =========================================================
   INGRESOS
========================================================= */

function getNumericAmount(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return 0;
  }

  const numeric =
    Number(
      String(value)
        .replace(/[^0-9.]/g, '')
    );

  return Number.isNaN(numeric)
    ? 0
    : numeric;
}


function updateDashboardIncome() {

  const incomeElement =
    document.querySelector(
      '#today-income'
    );

  if (!incomeElement) {
    return;
  }

  const total =
    todayAppointments.reduce(
      (
        sum,
        appointment
      ) =>
        sum +
        getNumericAmount(
          appointment[3]
        ),
      0
    );

  incomeElement.textContent =
    formatCurrency(total);
}


function updateAttendedCount() {

  const element =
    document.querySelector(
      '#attended-count'
    );

  if (!element) {
    return;
  }

  const count =
    todayAppointments.filter(
      appointment =>
        appointment[5] ===
        'Finalizada'
    ).length;

  element.textContent =
    String(count).padStart(
      2,
      '0'
    );
}


/* =========================================================
   DIRECTORIO DE PACIENTES
========================================================= */

function renderPatientDirectory(
  query = ''
) {

  const container =
    document.querySelector(
      '#patient-list'
    );

  if (!container) {
    return;
  }

  const normalizedQuery =
    normalizeSearchText(
      query || globalSearchQuery
    );

  const directoryMap =
    new Map();

  patients.forEach(
    patient => {

      const name =
        getPatientFullName(
          patient
        );

      directoryMap.set(
        patient.id,
        {
          patient,
          name,
          appointments: []
        }
      );
    }
  );

  getAppointments().forEach(
    ({ appointment }) => {

      ensureAppointmentId(
        appointment
      );

      const patient =
        resolveAppointmentPatient(
          appointment
        );

      const [
        time,
        name,
        reason,
        balance,
        date
      ] = appointment;

      const appointmentData = {
        time,
        reason,
        balance:
          balance || '$0',
        date
      };

      if (
        patient &&
        directoryMap.has(
          patient.id
        )
      ) {

        directoryMap
          .get(patient.id)
          .appointments
          .push(
            appointmentData
          );

        return;
      }

      const temporaryKey =
        `appointment_${normalizeName(
          name
        )}`;

      if (
        !directoryMap.has(
          temporaryKey
        )
      ) {

        directoryMap.set(
          temporaryKey,
          {
            patient: null,
            name,
            appointments: []
          }
        );
      }

      directoryMap
        .get(temporaryKey)
        .appointments
        .push(
          appointmentData
        );
    }
  );

  const directoryPatients =
    Array.from(
      directoryMap.values()
    );

  const filteredPatients =
    directoryPatients.filter(
      item => {

        if (!normalizedQuery) {
          return true;
        }

        const patient =
          item.patient;

        if (patient) {

          return getSearchablePatientText(
            patient
          ).includes(
            normalizedQuery
          );
        }

        const appointmentText =
          item.appointments
            .map(
              appointment =>
                [
                  appointment.reason,
                  appointment.time,
                  appointment.date,
                  appointment.balance
                ]
                  .filter(Boolean)
                  .join(' ')
            )
            .join(' ');

        return normalizeSearchText(
          `${item.name} ${appointmentText}`
        ).includes(
          normalizedQuery
        );
      }
    );

  container.innerHTML =
    filteredPatients.length
      ? filteredPatients
          .map(
            item => `
              <button
                class="patient-list-item"
                data-select-patient="${escapeHTML(
                  encodeURIComponent(
                    item.name
                  )
                )}">

                <span
                  class="patient-list-avatar">

                  ${escapeHTML(
                    getInitials(
                      item.name
                    )
                  )}

                </span>

                <span
                  class="patient-list-copy">

                  <strong>
                    ${escapeHTML(
                      item.name
                    )}
                  </strong>

                  <small>
                    ${
                      item.appointments
                        .length
                    }
                    ${
                      item.appointments
                        .length === 1
                        ? 'cita'
                        : 'citas'
                    }
                  </small>

                </span>

                <span
                  class="patient-list-arrow"
                  aria-hidden="true">
                  ›
                </span>

              </button>
            `
          )
          .join('')
      : `
        <p class="empty-state">
          No se encontraron pacientes.
        </p>
      `;
}


/* =========================================================
   HISTORIAL CLÍNICO
========================================================= */

function renderPatientHistory(
  patient
) {

  if (
    !patient.historialClinico ||
    !patient.historialClinico.length
  ) {

    return `
      <p class="empty-history">
        No hay registros clínicos todavía.
      </p>
    `;
  }

  return patient.historialClinico
    .slice()
    .reverse()
    .map(
      record => `
        <article
          class="patient-history-entry">

          <div>

            <strong>
              ${escapeHTML(
                record.tratamiento ||
                'Registro clínico'
              )}
            </strong>

            <small>
              ${formatDisplayDate(
                record.fecha
              )}
            </small>

          </div>

          ${
            record.diagnostico
              ? `
                <p>
                  ${escapeHTML(
                    record.diagnostico
                  )}
                </p>
              `
              : ''
          }

          ${
            record.avance
              ? `
                <p>
                  ${escapeHTML(
                    record.avance
                  )}
                </p>
              `
              : ''
          }

        </article>
      `
    )
    .join('');
}


/* =========================================================
   ARCHIVOS CLÍNICOS
========================================================= */

function renderPatientFiles(
  patient
) {

  if (
    !patient.archivosClinicos ||
    !patient.archivosClinicos.length
  ) {

    return `
      <p class="empty-history">
        No hay archivos adjuntos.
      </p>
    `;
  }

  return patient.archivosClinicos
    .map(
      file => `
        <div class="patient-file-item">

          <span>
            ${escapeHTML(file.name)}
          </span>

          <small>
            ${escapeHTML(
              file.type ||
              'Archivo'
            )}
            ·
            ${formatFileSize(
              file.size
            )}
          </small>

        </div>
      `
    )
    .join('');
}


function formatFileSize(
  size
) {

  if (!size) {
    return '0 KB';
  }

  if (
    size < 1024
  ) {
    return `${size} B`;
  }

  if (
    size < 1024 * 1024
  ) {
    return `${Math.round(
      size / 1024
    )} KB`;
  }

  return `${(
    size /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}


/* =========================================================
   HISTORIAL FINANCIERO
========================================================= */

function renderPatientFinancialHistory(
  patient
) {

  const history =
    patient.historialFinanciero ||
    [];

  if (!history.length) {

    return `
      <p class="empty-history">
        No hay pagos registrados.
      </p>
    `;
  }

  return history
    .slice()
    .reverse()
    .map(
      payment => `
        <div
          class="patient-financial-entry">

          <span>

            <strong>
              ${formatDisplayDate(
                payment.fecha
              )}
            </strong>

            <small>
              ${escapeHTML(
                payment.concepto ||
                'Pago'
              )}
              ·
              ${escapeHTML(
                payment.metodo ||
                'No especificado'
              )}
            </small>

          </span>

          <strong>
            ${formatCurrency(
              payment.monto
            )}
          </strong>

        </div>
      `
    )
    .join('');
}


/* =========================================================
   DETALLES DEL PACIENTE
========================================================= */

function showPatientDetails(
  name
) {

  let patient =
    findPatientByName(
      name
    );

  const appointments =
    patient
      ? getPatientAppointments(
          patient
        )
      : getAppointments()
          .filter(
            ({ appointment }) =>
              normalizeName(
                appointment[1]
              ) ===
              normalizeName(
                name
              )
          )
          .map(
            ({ appointment }) =>
              appointment
          );

  const details =
    document.querySelector(
      '#patient-details'
    );

  if (!details) {
    return;
  }

  if (
    !patient &&
    !appointments.length
  ) {

    details.innerHTML = `
      <p class="empty-state">
        No hay información disponible
        para este paciente.
      </p>
    `;

    return;
  }

  if (!patient) {

    patient = {
      id: null,
      nombre: name,
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
      avanceClinico: '',
      fechaRegistroClinico: '',
      historialClinico: [],
      historialFinanciero: [],
      archivosClinicos: []
    };
  }

  selectedPatient =
    patient.id || null;

  selectedPatientId =
    patient.id || null;

  const fullName =
    getPatientFullName(
      patient
    ) || name;

  const nextBalance =
    appointments.length
      ? appointments[
          appointments.length - 1
        ][3] || '$0'
      : '$0';

  const financialTotal =
    (
      patient.historialFinanciero ||
      []
    ).reduce(
      (
        sum,
        payment
      ) =>
        sum +
        getNumericAmount(
          payment.monto
        ),
      0
    );

  details.innerHTML = `
    <div
      class="patient-details-heading">

      <span
        class="patient-details-avatar">

        ${escapeHTML(
          getInitials(fullName)
        )}

      </span>

      <div>

        <span class="eyebrow">
          EXPEDIENTE
        </span>

        <h2>
          ${escapeHTML(fullName)}
        </h2>

      </div>

      ${
        patient.id
          ? `
            <button
              type="button"
              class="row-action"
              data-edit-patient="${escapeHTML(
                patient.id
              )}">
              Editar expediente
            </button>
          `
          : ''
      }

    </div>

    <div
      class="patient-detail-stats">

      <div>
        <span>
          Citas registradas
        </span>

        <strong>
          ${appointments.length}
        </strong>
      </div>

      <div>
        <span>
          Saldo próximo
        </span>

        <strong>
          ${escapeHTML(
            nextBalance
          )}
        </strong>
      </div>

      <div>
        <span>
          Total pagado
        </span>

        <strong>
          ${formatCurrency(
            financialTotal
          )}
        </strong>
      </div>
      
      <div>
        <span>
          Saldo Adeudao
        </span>

        <strong>
          ${formatCurrency(
            financialTotal
          )}
        </strong>
      </div>

    </div>

    <section
      class="patient-record-section">

      <div
        class="patient-record-heading">

        <h2>
          Datos generales
        </h2>

      </div>

      <div
        class="patient-record-grid">

        <div>
          <span>
            Nombre completo
          </span>

          <strong>
            ${escapeHTML(fullName)}
          </strong>
        </div>

        <div>
          <span>
            Fecha de nacimiento
          </span>

          <strong>
            ${
              patient.fechaNacimiento
                ? formatDisplayDate(
                    patient.fechaNacimiento
                  )
                : 'No registrado'
            }
          </strong>
        </div>

        <div>
          <span>
            Sexo
          </span>

          <strong>
            ${escapeHTML(
              patient.sexo ||
              'No registrado'
            )}
          </strong>
        </div>

        <div>
          <span>
            Teléfono
          </span>

          <strong>
            ${escapeHTML(
              patient.telefono ||
              'No registrado'
            )}
          </strong>
        </div>

        <div>
          <span>
            Correo
          </span>

          <strong>
            ${escapeHTML(
              patient.correo ||
              'No registrado'
            )}
          </strong>
        </div>

        <div>
          <span>
            Dirección
          </span>

          <strong>
            ${escapeHTML(
              patient.direccion ||
              'No registrada'
            )}
          </strong>
        </div>

      </div>

      <div class="patient-emergency">

        <h4>
          Contacto de emergencia
        </h4>

        <p>

          <strong>
            ${escapeHTML(
              patient.contactoEmergencia ||
              'No registrado'
            )}
          </strong>

          ${
            patient.parentescoEmergencia
              ? ` · ${escapeHTML(
                  patient.parentescoEmergencia
                )}`
              : ''
          }

          ${
            patient.telefonoEmergencia
              ? ` · ${escapeHTML(
                  patient.telefonoEmergencia
                )}`
              : ''
          }

        </p>

      </div>

    </section>

    <section
      class="patient-record-section">

      <div
        class="patient-record-heading">

        <h2>
          Expediente médico
        </h2>

      </div>

      <div
        class="patient-record-grid">

        <div>
          <span>
            Tipo de sangre
          </span>

          <strong>
            ${escapeHTML(
              patient.tipoSangre ||
              'No registrado'
            )}
          </strong>
        </div>

        <div>
          <span>
            Medicamentos actuales
          </span>

          <strong>
            ${escapeHTML(
              patient.medicamentos ||
              'Ninguno registrado'
            )}
          </strong>
        </div>

        <div>
          <span>
            Alergias
          </span>

          <strong>
            ${escapeHTML(
              patient.alergias ||
              'Ninguna registrada'
            )}
          </strong>
        </div>

      </div>
      <br></br>
      <div
        class="patient-record-text">

        <span>
          Antecedentes médicos
        </span>

        <p>
          <strong>
            ${escapeHTML(
              patient.antecedentesMedicos ||
              'No registrados.'
            )}
          </strong>
        </p>

      </div>

      <div
        class="patient-record-text">

        <span>
          Observaciones médicas
        </span>

        <p>
          <strong> 
            ${escapeHTML(
              patient.observacionesMedicas ||
              'Sin observaciones.'
            )}
          </strong>
        </p>

      </div>

    </section>

    <section
      class="patient-record-section">

      <div
        class="patient-record-heading">

        <h2>
          Historial clínico
        </h2>

      </div>
      <div
        class="patient-current-treatment">

        <span>
          Tratamiento actual
        </span>
      </div>

      <div
        class="patient-clinical-history">

        ${renderPatientHistory(
          patient
        )}

      </div>

      <div class="patient-files">

        <h4>
          Documentos y fotografías
        </h4>

        ${renderPatientFiles(
          patient
        )}

      </div>

    </section>

    <section
      class="patient-record-section">

      <div
        class="patient-record-heading">

        <span class="eyebrow">
          AGENDA
        </span>

        <h2>
          Historial de citas
        </h2>

      </div>

      <div
        class="patient-appointment-history">

        ${
          appointments.length
            ? appointments
                .slice()
                .sort(
                  (a, b) =>
                    String(a[4])
                      .localeCompare(
                        String(b[4])
                      )
                )
                .map(
                  appointment => `
                    <div>

                      <span>

                        <strong>
                          ${escapeHTML(
                            appointment[2]
                          )}
                        </strong>

                        <small>
                          ${formatDisplayDate(
                            appointment[4]
                          )}
                          ·
                          ${escapeHTML(
                            appointment[0]
                          )}
                          ·
                          ${escapeHTML(
                            appointment[5] ||
                            'En espera'
                          )}
                        </small>

                      </span>

                      <strong>
                        ${escapeHTML(
                          appointment[3] ||
                          '$0'
                        )}
                      </strong>

                    </div>
                  `
                )
                .join('')
            : `
              <p class="empty-history">
                No hay citas registradas.
              </p>
            `
        }

      </div>

    </section>

    <section
      class="patient-record-section">

      <div
        class="patient-record-heading">

        <h2>
          Historial financiero
        </h2>

      </div>

      <div class="financial-history">

        ${renderPatientFinancialHistory(
          patient
        )}

      </div>

    </section>
  `;
}


/* =========================================================
   MODAL PACIENTE
========================================================= */

function openPatientModal(
  patientId = null
) {

  const modal =
    document.querySelector(
      '#patient-modal'
    );

  const form =
    document.querySelector(
      '#patient-form'
    );

  if (
    !modal ||
    !form
  ) {
    return;
  }

  editingPatient =
    patientId
      ? findPatientById(
          patientId
        )
      : null;

  form.reset();

  const fileList =
    document.querySelector(
      '#clinical-file-list'
    );

  if (fileList) {
    fileList.innerHTML = '';
  }

  const title =
    document.querySelector(
      '#patient-modal-title'
    );

  const eyebrow =
    document.querySelector(
      '#patient-modal .eyebrow'
    );

  if (editingPatient) {

    if (title) {
      title.textContent =
        'Editar expediente';
    }

    if (eyebrow) {
      eyebrow.textContent =
        'EXPEDIENTE DEL PACIENTE';
    }

    fillPatientForm(
      editingPatient
    );

  } else {

    if (title) {
      title.textContent =
        'Nuevo paciente';
    }

    if (eyebrow) {
      eyebrow.textContent =
        'REGISTRO DE PACIENTE';
    }

    setPatientDateDefaults();

  }

  const formScroll =
    document.querySelector(
      '#patient-form-scroll'
    );

  if (formScroll) {
    formScroll.scrollTop = 0;
  }

  modal.classList.add(
    'open'
  );

  modal.setAttribute(
    'aria-hidden',
    'false'
  );

  lockPageScroll();
}


function closePatientModal() {

  const modal =
    document.querySelector(
      '#patient-modal'
    );

  if (!modal) {
    return;
  }

  modal.classList.remove(
    'open'
  );

  modal.setAttribute(
    'aria-hidden',
    'true'
  );

  editingPatient = null;

  updatePageScrollLock();
}


function setPatientDateDefaults() {

  const clinicalDate =
    document.querySelector(
      '#clinical-date'
    );

  if (clinicalDate) {

    clinicalDate.value =
      getISODate(0);
  }
}


function setFieldValue(
  selector,
  value
) {

  const element =
    document.querySelector(
      selector
    );

  if (element) {

    element.value =
      value ?? '';
  }
}


/* =========================================================
   LLENAR FORMULARIO DE PACIENTE
========================================================= */

function fillPatientForm(
  patient
) {

  setFieldValue(
    '#patient-name',
    patient.nombre
  );

  setFieldValue(
    '#patient-lastname',
    patient.apellidos
  );

  setFieldValue(
    '#patient-birthdate',
    patient.fechaNacimiento
  );

  setFieldValue(
    '#patient-sex',
    patient.sexo
  );

  setFieldValue(
    '#patient-phone',
    patient.telefono
  );

  setFieldValue(
    '#patient-email',
    patient.correo
  );

  setFieldValue(
    '#patient-address',
    patient.direccion
  );


  /* CONTACTO DE EMERGENCIA */

  setFieldValue(
    '#emergency-name',
    patient.contactoEmergencia
  );

  setFieldValue(
    '#emergency-relation',
    patient.parentescoEmergencia
  );

  setFieldValue(
    '#emergency-phone',
    patient.telefonoEmergencia
  );


  /* EXPEDIENTE MÉDICO */

  setFieldValue(
    '#patient-blood',
    patient.tipoSangre
  );

  setFieldValue(
    '#medical-history',
    patient.antecedentesMedicos
  );

  setFieldValue(
    '#patient-allergies',
    patient.alergias
  );

  setFieldValue(
    '#patient-medications',
    patient.medicamentos
  );

  setFieldValue(
    '#medical-notes',
    patient.observacionesMedicas
  );


  /* HISTORIAL CLÍNICO */

  setFieldValue(
    '#clinical-treatment',
    patient.tratamientoActual
  );

  setFieldValue(
    '#clinical-diagnosis',
    patient.diagnostico
  );

  setFieldValue(
    '#clinical-progress',
    patient.avanceClinico
  );

  setFieldValue(
    '#clinical-date',
    patient.fechaRegistroClinico ||
    getISODate(0)
  );


  /* ARCHIVOS */

  renderSelectedFiles(
    patient.archivosClinicos ||
    []
  );
}


/* =========================================================
   RECOLECTAR FORMULARIO DE PACIENTE
========================================================= */

function collectPatientForm() {

  /*
   * Si estamos editando, hacemos una copia
   * para conservar historial y archivos.
   */
  const source =
    editingPatient
      ? JSON.parse(
          JSON.stringify(
            editingPatient
          )
        )
      : createEmptyPatient();

  const patient =
    source;


  /* DATOS GENERALES */

  patient.nombre =
    document.querySelector(
      '#patient-name'
    )?.value.trim() || '';

  patient.apellidos =
    document.querySelector(
      '#patient-lastname'
    )?.value.trim() || '';

  patient.fechaNacimiento =
    document.querySelector(
      '#patient-birthdate'
    )?.value || '';

  patient.sexo =
    document.querySelector(
      '#patient-sex'
    )?.value || '';

  patient.telefono =
    document.querySelector(
      '#patient-phone'
    )?.value.trim() || '';

  patient.correo =
    document.querySelector(
      '#patient-email'
    )?.value.trim() || '';

  patient.direccion =
    document.querySelector(
      '#patient-address'
    )?.value.trim() || '';


  /* CONTACTO DE EMERGENCIA */

  patient.contactoEmergencia =
    document.querySelector(
      '#emergency-name'
    )?.value.trim() || '';

  patient.parentescoEmergencia =
    document.querySelector(
      '#emergency-relation'
    )?.value.trim() || '';

  patient.telefonoEmergencia =
    document.querySelector(
      '#emergency-phone'
    )?.value.trim() || '';


  /* EXPEDIENTE MÉDICO */

  patient.tipoSangre =
    document.querySelector(
      '#patient-blood'
    )?.value || '';

  patient.antecedentesMedicos =
    document.querySelector(
      '#medical-history'
    )?.value.trim() || '';

  patient.alergias =
    document.querySelector(
      '#patient-allergies'
    )?.value.trim() || '';

  patient.medicamentos =
    document.querySelector(
      '#patient-medications'
    )?.value.trim() || '';

  patient.observacionesMedicas =
    document.querySelector(
      '#medical-notes'
    )?.value.trim() || '';


  /* HISTORIAL CLÍNICO */

  patient.tratamientoActual =
    document.querySelector(
      '#clinical-treatment'
    )?.value.trim() || '';

  patient.diagnostico =
    document.querySelector(
      '#clinical-diagnosis'
    )?.value.trim() || '';

  patient.avanceClinico =
    document.querySelector(
      '#clinical-progress'
    )?.value.trim() || '';

  patient.fechaRegistroClinico =
    document.querySelector(
      '#clinical-date'
    )?.value ||
    getISODate(0);


  /* ASEGURAR ARRAYS */

  if (
    !Array.isArray(
      patient.historialClinico
    )
  ) {

    patient.historialClinico = [];
  }

  if (
    !Array.isArray(
      patient.historialFinanciero
    )
  ) {

    patient.historialFinanciero = [];
  }

  if (
    !Array.isArray(
      patient.archivosClinicos
    )
  ) {

    patient.archivosClinicos = [];
  }

  return patient;
}


/* =========================================================
   ARCHIVOS
========================================================= */

function processPatientFiles(
  patient
) {

  const input =
    document.querySelector(
      '#clinical-files'
    );

  if (
    !input ||
    !input.files ||
    !input.files.length
  ) {
    return;
  }

  Array.from(
    input.files
  ).forEach(
    file => {

      const alreadyExists =
        patient.archivosClinicos.some(
          existing =>
            existing.name ===
              file.name &&
            existing.size ===
              file.size &&
            existing.type ===
              file.type
        );

      if (alreadyExists) {
        return;
      }

      patient.archivosClinicos.push({

        id:
          generateId('file'),

        name:
          file.name,

        type:
          file.type,

        size:
          file.size,

        date:
          getISODate(0)
      });
    }
  );

  renderSelectedFiles(
    patient.archivosClinicos
  );
}


function renderSelectedFiles(
  files
) {

  const container =
    document.querySelector(
      '#clinical-file-list'
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(files) ||
    !files.length
  ) {

    container.innerHTML = '';

    return;
  }

  container.innerHTML =
    files
      .map(
        file => `
          <div class="selected-file">

            <span>
              ${escapeHTML(
                file.name
              )}
            </span>

            <small>
              ${escapeHTML(
                file.type ||
                'Archivo'
              )}
              ·
              ${formatFileSize(
                file.size
              )}
            </small>

          </div>
        `
      )
      .join('');
}


/* =========================================================
   EVITAR DUPLICADOS CLÍNICOS
========================================================= */

function clinicalRecordExists(
  patient,
  record
) {

  return (
    patient.historialClinico ||
    []
  ).some(
    existing =>
      existing.fecha ===
        record.fecha &&
      normalizeName(
        existing.tratamiento
      ) ===
        normalizeName(
          record.tratamiento
        ) &&
      normalizeName(
        existing.diagnostico
      ) ===
        normalizeName(
          record.diagnostico
        ) &&
      normalizeName(
        existing.avance
      ) ===
        normalizeName(
          record.avance
        )
  );
}


/* =========================================================
   ACTUALIZAR REFERENCIAS
========================================================= */

function updatePatientAppointmentReferences(
  patientId,
  oldName,
  newName
) {

  let changed = false;

  getAppointments().forEach(
    ({ appointment }) => {

      if (
        appointment[7] ===
        patientId
      ) {

        if (
          appointment[1] !==
          newName
        ) {

          appointment[1] =
            newName;

          changed = true;
        }

        return;
      }

      if (
        !appointment[7] &&
        normalizeName(
          appointment[1]
        ) ===
          normalizeName(
            oldName
          )
      ) {

        appointment[1] =
          newName;

        appointment[7] =
          patientId;

        changed = true;
      }
    }
  );

  if (changed) {
    saveAppointments();
  }
}


/* =========================================================
   GUARDAR PACIENTE
========================================================= */

function savePatientForm() {

  const wasEditing =
    Boolean(
      editingPatient
    );

  const oldPatientName =
    editingPatient
      ? getPatientFullName(
          editingPatient
        )
      : '';

  const patient =
    collectPatientForm();


  /* VALIDACIONES */

  if (!patient.nombre) {

    showToast(
      'Ingresa el nombre del paciente.'
    );

    return false;
  }

  if (!patient.apellidos) {

    showToast(
      'Ingresa los apellidos del paciente.'
    );

    return false;
  }


  const newPatientName =
    getPatientFullName(
      patient
    );


  /* EVITAR DUPLICADOS */

  const existing =
    patients.find(
      item =>
        item.id !==
          patient.id &&
        normalizeName(
          getPatientFullName(
            item
          )
        ) ===
          normalizeName(
            newPatientName
          )
    );

  if (existing) {

    showToast(
      'Ya existe un paciente con ese nombre.'
    );

    return false;
  }


  /* ARCHIVOS NUEVOS */

  processPatientFiles(
    patient
  );


  /* =====================================================
     HISTORIAL CLÍNICO
  ===================================================== */

  const clinicalHasData =
    Boolean(
      patient.tratamientoActual ||
      patient.diagnostico ||
      patient.avanceClinico
    );

  if (clinicalHasData) {

    const newRecord = {

      id:
        generateId(
          'clinical'
        ),

      fecha:
        patient.fechaRegistroClinico ||
        getISODate(0),

      tratamiento:
        patient.tratamientoActual,

      diagnostico:
        patient.diagnostico,

      avance:
        patient.avanceClinico
    };

    if (
      !clinicalRecordExists(
        patient,
        newRecord
      )
    ) {

      patient.historialClinico.push(
        newRecord
      );
    }
  }


  /* =====================================================
     ACTUALIZAR PACIENTE
  ===================================================== */

  if (wasEditing) {

    const index =
      patients.findIndex(
        item =>
          item.id ===
          patient.id
      );

    if (index !== -1) {

      patients[index] =
        patient;
    }

    if (
      oldPatientName !==
      newPatientName
    ) {

      updatePatientAppointmentReferences(
        patient.id,
        oldPatientName,
        newPatientName
      );
    }

    showToast(
      'Expediente actualizado correctamente.'
    );

  } else {

    patients.push(
      patient
    );

    showToast(
      'Paciente registrado correctamente.'
    );
  }


  savePatients();
  saveAppointments();

  renderPatientDirectory();

  showPatientDetails(
    newPatientName
  );

  closePatientModal();

  return true;
}


/* =========================================================
   CALENDARIO
========================================================= */

function getFirstDayMonday(
  year,
  month
) {

  const date =
    new Date(
      year,
      month,
      1
    );

  let day =
    date.getDay();

  if (day === 0) {
    day = 7;
  }

  return day - 1;
}


function getDaysInMonth(
  year,
  month
) {

  return new Date(
    year,
    month + 1,
    0
  ).getDate();
}


function getCalendarAppointments(
  date
) {

  return getAppointments()
    .filter(
      ({ appointment }) =>
        appointment[4] ===
        date
    )
    .map(
      ({ appointment }) =>
        appointment
    )
    .sort(
      (a, b) =>
        toMinutes(a[0]) -
        toMinutes(b[0])
    );
}


function toMinutes(
  time
) {

  const input =
    toInputTime(time);

  const [
    hours,
    minutes
  ] =
    input
      .split(':')
      .map(Number);

  return (
    hours * 60 +
    minutes
  );
}


function calendarDayMarkup(
  year,
  month,
  day,
  muted = false
) {

  const date =
    new Date(
      year,
      month,
      day
    );

  const isoDate =
    `${date.getFullYear()}-${
      String(
        date.getMonth() + 1
      ).padStart(2, '0')
    }-${
      String(
        date.getDate()
      ).padStart(2, '0')
    }`;

  const isToday =
    isoDate ===
    getISODate(0);

 const events =
    getCalendarAppointments(
      isoDate
    ).filter(
      appointment =>
        appointmentMatchesSearch(
          appointment
        )
    );

  return `
    <div
      class="day
        ${muted ? 'muted' : ''}
        ${isToday ? 'today' : ''}"
      data-calendar-date="${isoDate}">

      <span>
        ${day}
      </span>

      ${
        events
          .slice(0, 4)
          .map(
            (
              event,
              index
            ) => `
              <span
                class="event ${
                  index % 2
                    ? 'violet'
                    : ''
                }">

                ${escapeHTML(
                  event[0]
                )}

                ${escapeHTML(
                  event[1]
                )}

              </span>
            `
          )
          .join('')
      }

      ${
        events.length > 4
          ? `
            <span class="event">
              +${events.length - 4} más
            </span>
          `
          : ''
      }

    </div>
  `;
}


function renderCalendar(
  target,
  large = false
) {

  if (!target) {
    return;
  }

  const firstDay =
    getFirstDayMonday(
      calendarYear,
      calendarMonth
    );

  const daysInMonth =
    getDaysInMonth(
      calendarYear,
      calendarMonth
    );

  const previousMonthDays =
    getDaysInMonth(
      calendarYear,
      calendarMonth - 1
    );

  const cells = [];

  for (
    let i = firstDay - 1;
    i >= 0;
    i--
  ) {

    const day =
      previousMonthDays - i;

    cells.push(
      calendarDayMarkup(
        calendarYear,
        calendarMonth - 1,
        day,
        true
      )
    );
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {

    cells.push(
      calendarDayMarkup(
        calendarYear,
        calendarMonth,
        day
      )
    );
  }

  let nextDay = 1;

  while (
    cells.length < 42
  ) {

    cells.push(
      calendarDayMarkup(
        calendarYear,
        calendarMonth + 1,
        nextDay,
        true
      )
    );

    nextDay++;
  }

  target.innerHTML =
    cells.join('');

  if (large) {
    target.classList.add(
      'large'
    );
  }
}


function updateCalendarTitles() {

  const title =
    `${MONTH_NAMES[calendarMonth]} ${
      calendarYear
    }`;

  const dashboardTitle =
    document.querySelector(
      '#dashboard-calendar-title'
    );

  const fullTitle =
    document.querySelector(
      '#full-calendar-title'
    );

  if (dashboardTitle) {
    dashboardTitle.textContent =
      title;
  }

  if (fullTitle) {
    fullTitle.textContent =
      title;
  }
}


function renderCalendars() {

  updateCalendarTitles();

  renderCalendar(
    document.querySelector(
      '#dashboard-calendar'
    )
  );

  renderCalendar(
    document.querySelector(
      '#full-calendar'
    ),
    true
  );
}


function changeCalendarMonth(
  amount
) {

  calendarMonth +=
    amount;

  if (
    calendarMonth < 0
  ) {

    calendarMonth = 11;
    calendarYear--;
  }

  if (
    calendarMonth > 11
  ) {

    calendarMonth = 0;
    calendarYear++;
  }

  renderCalendars();
}

  /* =========================================================
    RECIBO DE PAGO
  ========================================================= */

  function openPaymentReceipt(
    appointmentId
  ) {

    const appointmentData =
      getAppointments().find(
        ({ appointment }) =>
          appointment[6] ===
          appointmentId
      );

    if (!appointmentData) {

      showToast(
        'La cita seleccionada ya no existe.'
      );

      return;
    }

    const appointment =
      appointmentData.appointment;

    const patient =
      resolveAppointmentPatient(
        appointment
      );

    if (!patient) {

      showToast(
        'No se encontró el expediente del paciente.'
      );

      return;
    }

    const modal =
      document.querySelector(
        '#payment-receipt-modal'
      );

    if (!modal) {

      showToast(
        'No se pudo abrir el recibo de pago.'
      );

      return;
    }

    const totalAmount =
      getNumericAmount(
        appointment[8] ??
        appointment[3]
      );

    const balanceAmount =
      getNumericAmount(
        appointment[3]
      );

    const paidAmount =
      Math.max(
        totalAmount -
        balanceAmount,
        0
      );

    const patientName =
      getPatientFullName(
        patient
      ) ||
      appointment[1];

    const patientInput =
      document.querySelector(
        '#receipt-patient'
      );

    const appointmentDate =
      document.querySelector(
        '#receipt-appointment-date'
      );

    const treatment =
      document.querySelector(
        '#receipt-treatment'
      );

    const totalInput =
      document.querySelector(
        '#receipt-total'
      );

    const balanceInput =
      document.querySelector(
        '#receipt-balance'
      );

    const paymentAmount =
      document.querySelector(
        '#receipt-payment-amount'
      );

    const paymentStatus =
      document.querySelector(
        '#receipt-payment-status'
      );

    const paymentDate =
      document.querySelector(
        '#receipt-payment-date'
      );

    const paymentMethod =
      document.querySelector(
        '#receipt-payment-method'
      );

    const paymentReference =
      document.querySelector(
        '#receipt-reference'
      );

    const paymentNotes =
      document.querySelector(
        '#receipt-notes'
      );

    const receiptId =
      document.querySelector(
        '#receipt-appointment-id'
      );

    if (
      !patientInput ||
      !appointmentDate ||
      !treatment ||
      !totalInput ||
      !balanceInput ||
      !paymentAmount ||
      !paymentStatus ||
      !paymentDate ||
      !paymentMethod ||
      !paymentReference ||
      !paymentNotes ||
      !receiptId
    ) {
      return;
    }

    receiptId.value =
      appointmentId;

    patientInput.value =
      patientName;

    appointmentDate.value =
      formatDisplayDate(
        appointment[4]
      );

    treatment.value =
      appointment[2] ||
      'Consulta';

    totalInput.value =
      formatCurrency(
        totalAmount
      );

    balanceInput.value =
      formatCurrency(
        balanceAmount
      );
    
    updatePaymentReceiptSummary();

    paymentDate.value =
      getISODate(0);

    paymentReference.value =
      '';

    paymentNotes.value =
      '';

    /*
    * Por defecto:
    *
    * Si todavía existe saldo,
    * proponemos pago parcial.
    *
    * Si el saldo es 0,
    * mostramos completo.
    */

    if (balanceAmount <= 0) {

      paymentStatus.value =
        'Completo';

      paymentAmount.value =
        '0';

    } else {

      paymentStatus.value =
        'Parcial';

      paymentAmount.value =
        String(
          balanceAmount
        );
    }

    paymentMethod.value =
      'Efectivo';

    updatePaymentReceiptAmountState();

    modal.classList.add(
      'open'
    );

    modal.setAttribute(
      'aria-hidden',
      'false'
    );

    lockPageScroll();
  }

  function updatePaymentReceiptAmountState() {

  const status =
    document.querySelector(
      '#receipt-payment-status'
    );

  const amount =
    document.querySelector(
      '#receipt-payment-amount'
    );

  if (
    !status ||
    !amount
  ) {
    return;
  }

  if (
    status.value ===
    'No pagado'
  ) {

    amount.value =
      '0';

    amount.disabled =
      true;

    return;
  }

  amount.disabled =
    false;
}


function closePaymentReceipt() {

  const modal =
    document.querySelector(
      '#payment-receipt-modal'
    );

  if (!modal) {
    return;
  }

  modal.classList.remove(
    'open'
  );

  modal.setAttribute(
    'aria-hidden',
    'true'
  );

  const form =
    document.querySelector(
      '#payment-receipt-form'
    );

  if (form) {
    form.reset();
  }

  updatePageScrollLock();
}

function createPaymentReceiptModal() {

  if (
    document.querySelector(
      '#payment-receipt-modal'
    )
  ) {
    return;
  }

  const modal =
    document.createElement(
      'div'
    );

  modal.id =
    'payment-receipt-modal';

  modal.className =
    'modal-backdrop';

  modal.setAttribute(
    'aria-hidden',
    'true'
  );

  modal.innerHTML = `

    <div
      class="modal-card payment-receipt-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-receipt-title">

      <div class="payment-receipt-header">

        <div>

          <span class="eyebrow">
            RECIBO DE PAGO
          </span>

          <h2 id="payment-receipt-title">
            Registrar pago
          </h2>

          <p class="modal-copy">
            Registra el pago realizado
            correspondiente a esta cita.
          </p>

        </div>

        <button
          type="button"
          class="modal-close"
          id="payment-receipt-close"
          aria-label="Cerrar">
          ×
        </button>

      </div>

      <form
        id="payment-receipt-form">

        <input
          type="hidden"
          id="receipt-appointment-id">

        <div class="payment-receipt-grid">

          <label>
            <span>Paciente</span>

            <input
              type="text"
              id="receipt-patient"
              readonly>
          </label>

          <label>
            <span>Fecha de la cita</span>

            <input
              type="text"
              id="receipt-appointment-date"
              readonly>
          </label>

          <label>
            <span>Tratamiento / concepto</span>

            <input
              type="text"
              id="receipt-treatment"
              readonly>
          </label>

          <label>
            <span>Fecha del pago</span>

            <input
              type="date"
              id="receipt-payment-date"
              required>
          </label>

        </div>

        <div class="payment-summary">

          <div>
            <small>
              Total de la cita
            </small>

            <strong
              id="receipt-total-display">
              $0
            </strong>
          </div>

          <div>
            <small>
              Saldo actual
            </small>

            <strong
              id="receipt-balance-display">
              $0
            </strong>
          </div>

        </div>

        <input
          type="hidden"
          id="receipt-total">

        <input
          type="hidden"
          id="receipt-balance">

        <div class="payment-receipt-fields">

          <label>
            <span>Estado del pago</span>

            <select
              id="receipt-payment-status"
              required>

              <option value="No pagado">
                No pagado
              </option>

              <option value="Parcial">
                Pago parcial
              </option>

              <option value="Completo">
                Pago completo
              </option>

            </select>
          </label>

          <label>
            <span>Monto recibido</span>

            <input
              type="number"
              id="receipt-payment-amount"
              min="0"
              step="0.01"
              placeholder="0.00">
          </label>

          <label>
            <span>Forma de pago</span>

            <select
              id="receipt-payment-method"
              required>

              <option value="Efectivo">
                Efectivo
              </option>

              <option value="Tarjeta">
                Tarjeta
              </option>

              <option value="Transferencia">
                Transferencia
              </option>

              <option value="Depósito">
                Depósito
              </option>

              <option value="Cheque">
                Cheque
              </option>

              <option value="Otro">
                Otro
              </option>

            </select>
          </label>

          <label>
            <span>Referencia / comprobante</span>

            <input
              type="text"
              id="receipt-reference"
              maxlength="100"
              placeholder="Número de transferencia, folio, etc.">
          </label>

        </div>

        <label>
          <span>Notas</span>

          <textarea
            id="receipt-notes"
            rows="3"
            maxlength="500"
            placeholder="Observaciones del pago..."></textarea>
        </label>

        <div
          class="payment-receipt-actions">

          <button
            type="button"
            class="modal-secondary-button"
            id="payment-receipt-cancel">
            Cancelar
          </button>

          <button
            type="submit"
            class="modal-primary-button">
            Guardar recibo y nueva cita
          </button>

        </div>

      </form>

    </div>
  `;

  document.body.appendChild(
    modal
  );

  /*
   * Estilos propios del recibo.
   * Se generan aquí para no obligarte
   * a modificar todavía tu CSS.
   */

  if (
    !document.querySelector(
      '#payment-receipt-inline-style'
    )
  ) {

    const style =
      document.createElement(
        'style'
      );

    style.id =
      'payment-receipt-inline-style';

    style.textContent = `

      .payment-receipt-card {
        width: min(760px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow-y: auto;
      }

      .payment-receipt-grid,
      .payment-receipt-fields {
        display: grid;
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .payment-receipt-card label {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .payment-receipt-card label > span {
        font-size: 13px;
        font-weight: 600;
        color: var(--muted, #98a6b9);
      }

      .payment-receipt-card input,
      .payment-receipt-card select,
      .payment-receipt-card textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid
          var(--line, #e9edf3);
        border-radius: 10px;
        padding: 11px 12px;
        background: #fff;
        color: var(--ink, #202b45);
        font: inherit;
      }

      .payment-receipt-card
      input[readonly] {
        background: #f8f9fb;
      }

      .payment-summary {
        display: grid;
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 20px 0;
      }

      .payment-summary > div {
        padding: 16px;
        border: 1px solid
          var(--line, #e9edf3);
        border-radius: 12px;
        background: #f8f9fb;
      }

      .payment-summary small {
        display: block;
        margin-bottom: 5px;
        color: var(--muted, #98a6b9);
      }

      .payment-summary strong {
        font-size: 22px;
        color: var(--ink, #202b45);
      }

      .payment-receipt-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 22px;
      }

      @media (max-width: 650px) {

        .payment-receipt-grid,
        .payment-receipt-fields,
        .payment-summary {
          grid-template-columns: 1fr;
        }

      }
    `;

    document.head.appendChild(
      style
    );
  }
}

function updatePaymentReceiptSummary() {

  const total =
    document.querySelector(
      '#receipt-total'
    );

  const balance =
    document.querySelector(
      '#receipt-balance'
    );

  const totalDisplay =
    document.querySelector(
      '#receipt-total-display'
    );

  const balanceDisplay =
    document.querySelector(
      '#receipt-balance-display'
    );

  if (totalDisplay) {

    totalDisplay.textContent =
      formatCurrency(
        total?.value || 0
      );
  }

  if (balanceDisplay) {

    balanceDisplay.textContent =
      formatCurrency(
        balance?.value || 0
      );
  }
}
/* =========================================================
   MODAL DE CITAS
========================================================= */

function openModal(
  index = null
) {

  const modal =
    document.querySelector(
      '#appointment-modal'
    );

  const patientInput =
    document.querySelector(
      '#modal-patient'
    );

  const patientIdInput =
    document.querySelector(
      '#modal-patient-id'
    );

  const motiveInput =
    document.querySelector(
      '#modal-motive'
    );

  const amountInput =
    document.querySelector(
      '#modal-amount'
    );

  const fullPaymentCheckbox =
    document.querySelector(
      '#modal-full-payment'
    );

  const dateInput =
    document.querySelector(
      '#modal-date'
    );

  const timeInput =
    document.querySelector(
      '#modal-time'
    );

  if (
    !modal ||
    !patientInput ||
    !motiveInput ||
    !amountInput ||
    !fullPaymentCheckbox ||
    !dateInput ||
    !timeInput
  ) {
    return;
  }

  selectedPatient =
    null;

  selectedPatientId =
    null;

  editingAppointment =
    null;

  hidePatientSuggestions();

  if (patientIdInput) {
    patientIdInput.value = '';
  }


  /* NUEVA CITA */

  if (
    index === null ||
    index === undefined
  ) {

    patientInput.value =
      '';

    patientInput.readOnly =
      false;

    patientInput.placeholder =
      'Escribe el nombre del paciente';

    patientInput.removeAttribute(
      'data-patient-selected'
    );

    motiveInput.value =
      '';

    amountInput.value =
      '0';

    fullPaymentCheckbox.checked =
      false;

    amountInput.disabled =
      false;

    dateInput.value =
      getISODate(0);

    timeInput.value =
      '09:00';

    const title =
      document.querySelector(
        '#modal-title'
      );

    const eyebrow =
      document.querySelector(
        '#appointment-modal .eyebrow'
      );

    const copy =
      document.querySelector(
        '#appointment-modal .modal-copy'
      );

    if (title) {
      title.textContent =
        'Agendar nueva cita';
    }

    if (eyebrow) {
      eyebrow.textContent =
        'NUEVA CITA';
    }

    if (copy) {
      copy.textContent =
        'Completa los datos para guardar la cita en la agenda.';
    }

  } else {

    const appointment =
      todayAppointments[index];

    if (!appointment) {
      return;
    }

    ensureAppointmentId(
      appointment
    );

    const patient =
      resolveAppointmentPatient(
        appointment
      );

    selectedPatient =
      patient?.id ||
      null;

    selectedPatientId =
      patient?.id ||
      null;

    patientInput.value =
      patient
        ? getPatientFullName(
            patient
          )
        : appointment[1];

    patientInput.readOnly =
      true;

    patientInput.placeholder =
      '';

    patientInput.setAttribute(
      'data-patient-selected',
      patient?.id
        ? 'true'
        : 'false'
    );

    if (patientIdInput) {
      patientIdInput.value =
        patient?.id ||
        appointment[7] ||
        '';
    }

    motiveInput.value =
      sanitizeReason(
        appointment[2]
      );

    const currentAmount =
      String(
        appointment[3] ||
        '$0'
      )
        .replace(/\D/g, '') ||
      '0';

    amountInput.value =
      currentAmount;

    fullPaymentCheckbox.checked =
      currentAmount === '0';

    amountInput.disabled =
      fullPaymentCheckbox.checked;

    dateInput.value =
      getISODate(1);

    timeInput.value =
      '09:00';

    const title =
      document.querySelector(
        '#modal-title'
      );

    const eyebrow =
      document.querySelector(
        '#appointment-modal .eyebrow'
      );

    const copy =
      document.querySelector(
        '#appointment-modal .modal-copy'
      );

    if (title) {
      title.textContent =
        'Generar nueva cita';
    }

    if (eyebrow) {
      eyebrow.textContent =
        'REAGENDAR PACIENTE';
    }

    if (copy) {
      copy.textContent =
        'Al guardar, se registra la nueva cita para este paciente.';
    }
  }

  modal.classList.add(
    'open'
  );

  modal.setAttribute(
    'aria-hidden',
    'false'
  );

  lockPageScroll();
}


/* =========================================================
   EDITAR CITA
========================================================= */

function editAppointment(
  source,
  index
) {

  const list =
    getAppointmentList(
      source
    );

  const appointment =
    list[index];

  if (!appointment) {
    return;
  }

  ensureAppointmentId(
    appointment
  );

  editingAppointment = {
    source,
    index,
    id: appointment[6]
  };

  const patient =
    resolveAppointmentPatient(
      appointment
    );

  selectedPatient =
    patient?.id ||
    null;

  selectedPatientId =
    patient?.id ||
    null;

  const patientInput =
    document.querySelector(
      '#modal-patient'
    );

  const patientIdInput =
    document.querySelector(
      '#modal-patient-id'
    );

  const motiveInput =
    document.querySelector(
      '#modal-motive'
    );

  const amountInput =
    document.querySelector(
      '#modal-amount'
    );

  const fullPayment =
    document.querySelector(
      '#modal-full-payment'
    );

  const dateInput =
    document.querySelector(
      '#modal-date'
    );

  const timeInput =
    document.querySelector(
      '#modal-time'
    );

  if (
    !patientInput ||
    !motiveInput ||
    !amountInput ||
    !fullPayment ||
    !dateInput ||
    !timeInput
  ) {
    return;
  }

  hidePatientSuggestions();

  patientInput.value =
    patient
      ? getPatientFullName(
          patient
        )
      : appointment[1];

  patientInput.readOnly =
    true;

  patientInput.placeholder =
    '';

  patientInput.setAttribute(
    'data-patient-selected',
    patient?.id
      ? 'true'
      : 'false'
  );

  if (patientIdInput) {
    patientIdInput.value =
      patient?.id ||
      appointment[7] ||
      '';
  }

  motiveInput.value =
    sanitizeReason(
      appointment[2]
    );

  const amount =
    String(
      appointment[3] ||
      '$0'
    )
      .replace(/\D/g, '') ||
    '0';

  amountInput.value =
    amount;

  fullPayment.checked =
    amount === '0';

  amountInput.disabled =
    amount === '0';

  dateInput.value =
    appointment[4] ||
    getISODate(0);

  timeInput.value =
    toInputTime(
      appointment[0]
    );

  const title =
    document.querySelector(
      '#modal-title'
    );

  const eyebrow =
    document.querySelector(
      '#appointment-modal .eyebrow'
    );

  const copy =
    document.querySelector(
      '#appointment-modal .modal-copy'
    );

  if (title) {
    title.textContent =
      'Editar cita';
  }

  if (eyebrow) {
    eyebrow.textContent =
      'CONFIGURAR CITA';
  }

  if (copy) {
    copy.textContent =
      'Actualiza la fecha, hora, motivo o saldo de la cita.';
  }

  const modal =
    document.querySelector(
      '#appointment-modal'
    );

  if (!modal) {
    return;
  }

  modal.classList.add(
    'open'
  );

  modal.setAttribute(
    'aria-hidden',
    'false'
  );

  lockPageScroll();
}


function closeModal() {

  const modal =
    document.querySelector(
      '#appointment-modal'
    );

  if (!modal) {
    return;
  }

  hidePatientSuggestions();

  modal.classList.remove(
    'open'
  );

  modal.setAttribute(
    'aria-hidden',
    'true'
  );

  editingAppointment =
    null;

  selectedPatient =
    null;

  selectedPatientId =
    null;

  const patientIdInput =
    document.querySelector(
      '#modal-patient-id'
    );

  if (patientIdInput) {
    patientIdInput.value = '';
  }

  updatePageScrollLock();
}


/* =========================================================
   ELIMINAR CITA
========================================================= */

function deleteAppointment(
  source,
  index
) {

  const list =
    getAppointmentList(
      source
    );

  const appointment =
    list[index];

  if (!appointment) {
    return;
  }

  const patientName =
    appointment[1];

  const confirmed =
    window.confirm(
      `¿Deseas eliminar la cita de ${patientName}?\n\nEsta acción no se puede deshacer.`
    );

  if (!confirmed) {
    return;
  }

  list.splice(
    index,
    1
  );

  saveAppointments();

  renderLists();

  showToast(
    `Cita de ${patientName} eliminada.`
  );
}

/* =========================================================
   FORMULARIO DE RECIBO DE PAGO
========================================================= */

document.addEventListener(
  'submit',
  event => {

    if (
      !event.target.matches(
        '#payment-receipt-form'
      )
    ) {
      return;
    }

    event.preventDefault();

    const appointmentId =
      document.querySelector(
        '#receipt-appointment-id'
      )?.value;

    const paymentStatus =
      document.querySelector(
        '#receipt-payment-status'
      )?.value;

    const paymentAmountInput =
      document.querySelector(
        '#receipt-payment-amount'
      );

    const paymentDate =
      document.querySelector(
        '#receipt-payment-date'
      )?.value;

    const paymentMethod =
      document.querySelector(
        '#receipt-payment-method'
      )?.value;

    const reference =
      document.querySelector(
        '#receipt-reference'
      )?.value.trim();

    const notes =
      document.querySelector(
        '#receipt-notes'
      )?.value.trim();

    if (!appointmentId) {

      showToast(
        'No se identificó la cita.'
      );

      return;
    }

    const appointmentData =
      getAppointments().find(
        ({ appointment }) =>
          appointment[6] ===
          appointmentId
      );

    if (!appointmentData) {

      showToast(
        'La cita ya no existe.'
      );

      closePaymentReceipt();

      return;
    }

    const appointment =
      appointmentData.appointment;

    const patient =
      resolveAppointmentPatient(
        appointment
      );

    if (!patient) {

      showToast(
        'No se encontró el paciente de la cita.'
      );

      return;
    }

    if (!paymentDate) {

      showToast(
        'Selecciona la fecha del pago.'
      );

      return;
    }

    const totalAmount =
      getNumericAmount(
        appointment[8] ??
        appointment[3]
      );

    const currentBalance =
      getNumericAmount(
        appointment[3]
      );

    let paymentAmount = 0;

    /*
     * =====================================================
     * CALCULAR MONTO DEL PAGO
     * =====================================================
     */

    if (
      paymentStatus ===
      'Completo'
    ) {

      paymentAmount =
        currentBalance;

    } else if (
      paymentStatus ===
      'Parcial'
    ) {

      paymentAmount =
        getNumericAmount(
          paymentAmountInput?.value
        );

      if (
        paymentAmount <= 0
      ) {

        showToast(
          'Ingresa el monto del pago parcial.'
        );

        return;
      }

      if (
        paymentAmount >
        currentBalance
      ) {

        showToast(
          `El pago no puede ser mayor al saldo actual de ${formatCurrency(
            currentBalance
          )}.`
        );

        return;
      }

    } else {

      paymentAmount =
        0;
    }

    const newBalance =
      Math.max(
        currentBalance -
        paymentAmount,
        0
      );

    /*
     * =====================================================
     * ACTUALIZAR DATOS FINANCIEROS DE LA CITA
     * =====================================================
     */

    appointment[3] =
      formatCurrency(
        newBalance
      );

    appointment[8] =
      totalAmount;

    appointment[9] =
      Math.max(
        totalAmount -
        newBalance,
        0
      );

    appointment[10] =
      newBalance <= 0
        ? 'Completo'
        : paymentAmount > 0
          ? 'Parcial'
          : 'No pagado';

    /*
     * =====================================================
     * HISTORIAL FINANCIERO DEL PACIENTE
     * =====================================================
     */

    if (
      !Array.isArray(
        patient.historialFinanciero
      )
    ) {

      patient.historialFinanciero =
        [];
    }

    patient.historialFinanciero.push({

      id:
        generateId(
          'payment'
        ),

      fecha:
        paymentDate,

      monto:
        paymentAmount,

      concepto:
        appointment[2] ||
        'Pago de consulta',

      metodo:
        paymentMethod ||
        'No especificado',

      estado:
        appointment[10],

      citaId:
        appointmentId,

      fechaCita:
        appointment[4],

      referencia:
        reference,

      notas:
        notes,

      saldoAnterior:
        currentBalance,

      saldoRestante:
        newBalance,

      montoTotal:
        totalAmount,

      createdAt:
        new Date().toISOString()

    });

    savePatients();

    saveAppointments();

    renderLists();

    closePaymentReceipt();

    showToast(
      paymentAmount > 0
        ? `Pago de ${formatCurrency(
            paymentAmount
          )} registrado correctamente.`
        : 'Recibo registrado sin pago.'
    );
  }
);

document.addEventListener(
  'change',
  event => {

    if (
      event.target.matches(
        '#receipt-payment-status'
      )
    ) {

      updatePaymentReceiptAmountState();

    }

  }
);

/* =========================================================
   CAMBIAR ESTATUS
========================================================= */

function updateAppointmentStatus(
  appointmentId,
  status
) {

  const item =
    getAppointments().find(
      ({ appointment }) =>
        appointment[6] ===
        appointmentId
    );

  if (!item) {
    return;
  }

  item.appointment[5] =
    status;

  saveAppointments();

  renderLists();

  /*
   * Si la cita pertenece a "Citas de Hoy"
   * y se marca como "Cancelada", abrir
   * automáticamente el formulario de
   * "Cita nueva" para reagendarla.
   *
   * La cita original NO se modifica después
   * de quedar cancelada. El formulario se
   * utiliza para crear una NUEVA cita.
   */
  if (
    status === 'Cancelada'
  ) {

    const todayIndex =
      todayAppointments.findIndex(
        appointment =>
          appointment[6] ===
          appointmentId
      );

    if (todayIndex !== -1) {

      openModal(
        todayIndex
      );
    }
  }

  showToast(
    status === 'Cancelada'
      ? 'Cita cancelada. Puedes seleccionar una nueva fecha y hora para reagendarla.'
      : `Cita marcada como ${status}.`
  );
}

/* =========================================================
   CAMBIAR PÁGINA
========================================================= */

function changePage(
  page
) {

  if (!pages[page]) {
    return;
  }

  document
    .querySelectorAll(
      '.app-page'
    )
    .forEach(
      element => {

        element.classList.toggle(
          'active',
          element.id ===
            `page-${page}`
        );

      }
    );

  document
    .querySelectorAll(
      '[data-page-link]'
    )
    .forEach(
      element => {

        element.classList.toggle(
          'active',
          element.dataset
            .pageLink ===
            page
        );

      }
    );

  const title =
    document.querySelector(
      '#page-title'
    );

  if (title) {
    title.textContent =
      pages[page][0];
  }

  if (
    page === 'calendario'
  ) {
    renderCalendars();
  }

  if (
    page === 'pacientes'
  ) {
    renderPatientDirectory();
  }

  if (
    page === 'citas'
  ) {
    renderAppointmentTable();
  }

  if (
    !document.querySelector(
      '#patient-modal.open'
    ) &&
    !document.querySelector(
      '#appointment-modal.open'
    )
  ) {

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}


/* =========================================================
   CLICK
========================================================= */

document.addEventListener(
  'click',
  event => {

    /*
     * Cerrar sugerencias al hacer clic
     * fuera del campo/lista de pacientes.
     */
    const appointmentPatientField =
      event.target.closest(
        '.patient-search-field'
      );

    if (
      !appointmentPatientField &&
      !event.target.closest(
        '#modal-patient-suggestions'
      )
    ) {

      hidePatientSuggestions();
    }


    const filter =
      event.target.closest(
        '[data-appointment-filter]'
      );

    if (filter) {

      activeAppointmentFilter =
        filter.dataset
          .appointmentFilter;

      document
        .querySelectorAll(
          '[data-appointment-filter]'
        )
        .forEach(
          button => {

            const isActive =
              button ===
              filter;

            button.classList.toggle(
              'active-filter',
              isActive
            );

            button.setAttribute(
              'aria-pressed',
              String(
                isActive
              )
            );
          }
        );

      renderAppointmentTable();

      return;
    }


    /*
     * Seleccionar paciente de la
     * lista de Nueva cita.
     */
    const appointmentPatientOption =
      event.target.closest(
        '[data-appointment-patient-id]'
      );

    if (appointmentPatientOption) {

      selectAppointmentPatient(
        appointmentPatientOption
          .dataset
          .appointmentPatientId
      );

      return;
    }


    const editButton =
      event.target.closest(
        '[data-edit-appointment]'
      );

    if (editButton) {

      const [
        source,
        index
      ] =
        editButton.dataset
          .editAppointment
          .split(':');

      editAppointment(
        source,
        Number(index)
      );

      return;
    }


    const deleteButton =
      event.target.closest(
        '[data-delete-appointment]'
      );

    if (deleteButton) {

      const [
        source,
        index
      ] =
        deleteButton.dataset
          .deleteAppointment
          .split(':');

      deleteAppointment(
        source,
        Number(index)
      );

      return;
    }


    const patientInfoButton =
      event.target.closest(
        '[data-patient-info]'
      );

    if (patientInfoButton) {

      const name =
        decodeURIComponent(
          patientInfoButton.dataset
            .patientInfo
        );

      changePage(
        'pacientes'
      );

      renderPatientDirectory();

      showPatientDetails(
        name
      );

      document
        .querySelectorAll(
          '.patient-list-item'
        )
        .forEach(
          item => {

            item.classList.toggle(
              'selected',
              decodeURIComponent(
                item.dataset
                  .selectPatient
              ) === name
            );

          }
        );

      return;
    }


    const patientItem =
      event.target.closest(
        '[data-select-patient]'
      );

    if (patientItem) {

      const name =
        decodeURIComponent(
          patientItem.dataset
            .selectPatient
        );

      showPatientDetails(
        name
      );

      document
        .querySelectorAll(
          '.patient-list-item'
        )
        .forEach(
          item => {

            item.classList.toggle(
              'selected',
              item ===
                patientItem
            );

          }
        );

      return;
    }


    if (
      event.target.closest(
        '[data-open-appointment]'
      ) ||
      event.target.closest(
        '#new-appointment'
      )
    ) {

      openModal();

      return;
    }


    if (
      event.target.closest(
        '#new-patient-dashboard'
      ) ||
      event.target.closest(
        '#new-patient'
      )
    ) {

      openPatientModal();

      return;
    }


    const editPatientButton =
      event.target.closest(
        '[data-edit-patient]'
      );

    if (editPatientButton) {

      openPatientModal(
        editPatientButton.dataset
          .editPatient
      );

      return;
    }


    const dot =
      event.target.closest(
        '[data-appointment-status]'
      );

    if (dot) {

      updateAppointmentStatus(
        dot.dataset
          .appointmentStatus,
        dot.dataset.status
      );

      return;
    }

    const paymentReceiptButton =
      event.target.closest(
        '[data-payment-receipt]'
      );

    if (paymentReceiptButton) {

      openPaymentReceipt(
        paymentReceiptButton.dataset
          .paymentReceipt
      );

      return;
    }

    const next =
      event.target.closest(
        '[data-new-appointment]'
      );

    if (next) {

      openModal(
        Number(
          next.dataset
            .newAppointment
        )
      );

      return;
    }


    const charge =
      event.target.closest(
        '.charge-button'
      );

    if (charge) {

      const row =
        charge.closest(
          '.charge'
        );

      const name =
        charge.dataset.name;

      showToast(
        `Cobro de ${
          row?.firstChild
            ?.textContent
            ?.trim() ||
          '$0'
        } para ${name}.`
      );

      return;
    }


    const reminder =
      event.target.closest(
        '[data-reminder]'
      );

    if (reminder) {

      const patientName =
        reminder.dataset.reminder;

      const appointmentTime =
        reminder.dataset.reminderTime;

      const message =
        encodeURIComponent(
          `Hola ${patientName}, te recordamos que tienes una cita dental programada para el día de mañana a las ${appointmentTime}. Agradecemos tu puntualidad. ¡Te esperamos!`
        );

      window.open(
        `https://wa.me/?text=${message}`,
        '_blank'
      );

      showToast(
        `Recordatorio preparado para ${patientName}.`
      );

      return;
    }


    if (
      event.target.closest(
        '#previous-month'
      )
    ) {

      changeCalendarMonth(
        -1
      );

      return;
    }


    if (
      event.target.closest(
        '#next-month'
      )
    ) {

      changeCalendarMonth(
        1
      );

      return;
    }

    /* CERRAR MODAL DE RECIBO */

    if (
      event.target.closest(
        '#payment-receipt-close'
      ) ||
      event.target.closest(
        '#payment-receipt-cancel'
      ) ||
      event.target ===
        document.querySelector(
          '#payment-receipt-modal'
        )
    ) {

      closePaymentReceipt();

      return;
    }

    /* CERRAR MODAL DE CITAS */

    if (
      event.target.closest(
        '#modal-close'
      ) ||
      event.target ===
        document.querySelector(
          '#appointment-modal'
        )
    ) {

      closeModal();

      return;
    }


    /* CERRAR MODAL DE PACIENTES */

    if (
      event.target.closest(
        '#patient-modal-close'
      ) ||
      event.target.closest(
        '#patient-cancel'
      ) ||
      event.target ===
        document.querySelector(
          '#patient-modal'
        )
    ) {

      closePatientModal();

      return;
    }


    const link =
      event.target.closest(
        '[data-page-link]'
      );

    if (link) {

      event.preventDefault();

      changePage(
        link.dataset.pageLink
      );

      return;
    }

  }
);


/* =========================================================
   CHECKBOX COBRO COMPLETO
========================================================= */

document.addEventListener(
  'change',
  event => {

    if (
      event.target.matches(
        '#modal-full-payment'
      )
    ) {

      const amountInput =
        document.querySelector(
          '#modal-amount'
        );

      if (!amountInput) {
        return;
      }

      amountInput.disabled =
        event.target.checked;

      if (
        event.target.checked
      ) {

        amountInput.value =
          '0';
      }
    }

  }
);

/* =========================================================
   FORMULARIO DE CITAS
========================================================= */

document.addEventListener(
  'submit',
  event => {

    if (
      !event.target.matches(
        '#appointment-form'
      )
    ) {
      return;
    }

    event.preventDefault();

    const patientInput =
      document.querySelector(
        '#modal-patient'
      );

    const patientIdInput =
      document.querySelector(
        '#modal-patient-id'
      );

    const motiveInput =
      document.querySelector(
        '#modal-motive'
      );

    const amountInput =
      document.querySelector(
        '#modal-amount'
      );

    const dateInput =
      document.querySelector(
        '#modal-date'
      );

    const timeInput =
      document.querySelector(
        '#modal-time'
      );

    const fullPaymentCheckbox =
      document.querySelector(
        '#modal-full-payment'
      );

    if (
      !patientInput ||
      !motiveInput ||
      !amountInput ||
      !dateInput ||
      !timeInput ||
      !fullPaymentCheckbox
    ) {
      return;
    }

    const patientName =
      patientInput.value.trim();

    if (!patientName) {

      showToast(
        'Ingresa el nombre del paciente.'
      );

      return;
    }


    /*
     * =====================================================
     * VALIDAR PACIENTE REGISTRADO
     * =====================================================
     *
     * Esta validación es obligatoria tanto para:
     *
     * - Nueva cita
     * - Reagendar
     * - Editar una cita
     *
     * La cita no puede guardarse únicamente
     * con el nombre escrito.
     */
      let patient =
        validateSelectedAppointmentPatient();

      if (!patient) {
        return;
      }

      /*
      * Si el paciente no existe, se crea
      * automáticamente un nuevo expediente.
      */
      if (patient.isNewPatient) {

        patient =
          createPatientFromAppointmentName(
            patient.nombre
          );

        if (!patient) {

          showToast(
            'No se pudo crear el expediente del paciente.'
          );

          return;
        }

        selectedPatient =
          patient;

        selectedPatientId =
          patient.id;

        const patientIdInput =
          document.querySelector(
            '#modal-patient-id'
          );

        if (patientIdInput) {
          patientIdInput.value =
            patient.id;
        }

        showToast(
          'Nuevo paciente registrado y cita preparada.'
        );
      }


    const treatment =
      sanitizeReason(
        motiveInput.value
      );

    const enteredAmount =
      getNumericAmount(
        amountInput.value
      );

    const totalAmount =
      enteredAmount;

    const balance =
      fullPaymentCheckbox.checked
        ? '$0'
        : formatCurrency(
            enteredAmount
          );

    const initialPaidAmount =
      fullPaymentCheckbox.checked
        ? totalAmount
        : 0;

    const initialPaymentStatus =
      fullPaymentCheckbox.checked
        ? 'Completo'
        : 'No pagado';

    const formattedTime =
      formatTimeFromInput(
        timeInput.value
      );

    const appointmentDate =
      dateInput.value;

    if (!appointmentDate) {

      showToast(
        'Selecciona la fecha de la cita.'
      );

      return;
    }


    /* =====================================================
       EDITAR CITA EXISTENTE
    ===================================================== */

    if (editingAppointment) {

      const appointmentData =
        getAppointments().find(
          ({ appointment }) =>
            appointment[6] ===
            editingAppointment.id
        );

      if (!appointmentData) {

        closeModal();

        showToast(
          'La cita ya no existe.'
        );

        return;
      }

      const appointment =
        appointmentData.appointment;

      /*
       * El paciente validado mediante
       * la lista es ahora la referencia
       * oficial de la cita.
       */
      const patientId =
        patient.id;

      const patientNameFinal =
        getPatientFullName(
          patient
        );

      const originalTotalAmount =
        getNumericAmount(
          appointment[8] ??
          appointment[3]
        );

      const newBalance =
        getNumericAmount(
          balance
        );

      const updatedPaidAmount =
        Math.max(
          originalTotalAmount -
          newBalance,
          0
        );

      const updatedPaymentStatus =
        newBalance <= 0
          ? 'Completo'
          : updatedPaidAmount > 0
            ? 'Parcial'
            : 'No pagado';

      const updatedAppointment = [

        formattedTime,

        patientNameFinal,

        treatment,

        balance,

        appointmentDate,

        appointment[5] ||
          'En espera',

        appointment[6],

        patientId,

        originalTotalAmount,

        updatedPaidAmount,

        updatedPaymentStatus

      ];

      removeAppointmentById(
        appointment[6]
      );

      addAppointmentToDateCollection(
        updatedAppointment
      );

      saveAppointments();

      renderLists();

      closeModal();

      showToast(
        `Cita de ${patientNameFinal} actualizada.`
      );

      return;
    }


    /* =====================================================
       NUEVA CITA
    ===================================================== */

    /*
     * IMPORTANTE:
     *
     * Ya NO se crea un expediente
     * automáticamente.
     *
     * El paciente tuvo que haber sido
     * seleccionado previamente desde
     * la lista de pacientes registrados.
     */

    const appointment = [

      formattedTime,

      getPatientFullName(
        patient
      ),

      treatment,

      balance,

      appointmentDate,

      'En espera',

      generateId(
        'appointment'
      ),

      patient.id,

      totalAmount,

      initialPaidAmount,

      initialPaymentStatus

    ];

    addAppointmentToDateCollection(
      appointment,
      true
    );

    saveAppointments();

    renderLists();

    closeModal();

    showToast(
      `Cita agendada para ${
        getPatientFullName(
          patient
        )
      }.`
    );

    selectedPatient =
      null;

    selectedPatientId =
      null;

    if (patientIdInput) {
      patientIdInput.value = '';
    }
  }
);


/* =========================================================
   FORMULARIO DE PACIENTES
========================================================= */

document.addEventListener(
  'submit',
  event => {

    if (
      !event.target.matches(
        '#patient-form'
      )
    ) {
      return;
    }

    event.preventDefault();

    savePatientForm();
  }
);


/* =========================================================
   ARCHIVOS DEL PACIENTE
========================================================= */

document.addEventListener(
  'change',
  event => {

    if (
      !event.target.matches(
        '#clinical-files'
      )
    ) {
      return;
    }

    const files =
      Array.from(
        event.target.files || []
      );

    const container =
      document.querySelector(
        '#clinical-file-list'
      );

    if (!container) {
      return;
    }

    container.innerHTML =
      files
        .map(
          file => `
            <div class="selected-file">

              <span>
                ${escapeHTML(
                  file.name
                )}
              </span>

              <small>
                ${escapeHTML(
                  file.type ||
                  'Archivo'
                )}
                ·
                ${formatFileSize(
                  file.size
                )}
              </small>

            </div>
          `
        )
        .join('');
  }
);


/* =========================================================
   BUSCADOR GLOBAL
========================================================= */

  function applyGlobalSearch() {

    /*
    * =====================================================
    * RENDERIZADO GLOBAL
    * =====================================================
    *
    * Cada sección se vuelve a construir utilizando
    * el valor actualizado de globalSearchQuery.
    *
    * Esto evita depender de elementos que ya estaban
    * renderizados antes de realizar la búsqueda.
    */

    renderLists();
  }

    /*
    * =====================================================
    * CITAS
    * =====================================================
    *
    * La tabla se vuelve a construir utilizando
    * el filtro global.
    */

    renderAppointmentTable();


      /*
      * =====================================================
      * PACIENTES
      * =====================================================
      */

      renderPatientDirectory(
        globalSearchQuery
      );


      /*
      * =====================================================
      * CALENDARIO
      * =====================================================
      *
      * El calendario se vuelve a renderizar para que
      * solamente aparezcan los eventos coincidentes.
      */

      renderCalendars();


  document.addEventListener(
    'input',
    event => {

      if (
        !event.target.matches(
          '#patient-search'
        )
      ) {
        return;
      }

      setGlobalSearchQuery(
        event.target.value
      );

      applyGlobalSearch();
    }
  );

/* =========================================================
   ESC
========================================================= */

document.addEventListener(
  'keydown',
  event => {

    if (
      event.key !==
      'Escape'
    ) {
      return;
    }

    const patientModal =
      document.querySelector(
        '#patient-modal.open'
      );

    const appointmentModal =
      document.querySelector(
        '#appointment-modal.open'
      );

    if (patientModal) {

      closePatientModal();

      return;
    }

    if (appointmentModal) {

      hidePatientSuggestions();

      closeModal();
    }
  }
);


/* =========================================================
   ELIMINAR CITA POR ID
========================================================= */

function removeAppointmentById(
  appointmentId
) {

  let removed = false;

  [
    todayAppointments,
    tomorrowAppointments,
    otherAppointments
  ].forEach(
    collection => {

      for (
        let i =
          collection.length - 1;
        i >= 0;
        i--
      ) {

        if (
          collection[i][6] ===
          appointmentId
        ) {

          collection.splice(
            i,
            1
          );

          removed = true;
        }
      }
    }
  );

  return removed;
}


/* =========================================================
   MIGRACIÓN DE CITAS ANTIGUAS
========================================================= */

function migrateAppointments() {

  let changed = false;

  const appointments =
    getAppointments()
      .map(
        ({ appointment }) =>
          appointment
      );

  appointments.forEach(
    appointment => {

      const before =
        JSON.stringify(
          appointment
        );

      ensureAppointmentId(
        appointment
      );

      if (!appointment[7]) {

        const patient =
          findPatientByName(
            appointment[1]
          );

        if (patient) {

          appointment[7] =
            patient.id;
        }
      }

      const after =
        JSON.stringify(
          appointment
        );

      if (
        before !== after
      ) {
        changed = true;
      }
    }
  );


  const unique =
    new Map();

  appointments.forEach(
    appointment => {

      const id =
        ensureAppointmentId(
          appointment
        );

      unique.set(
        id,
        appointment
      );
    }
  );

  if (
    unique.size !==
    appointments.length
  ) {
    changed = true;
  }

  rebuildAppointmentCollections(
    Array.from(
      unique.values()
    )
  );

  if (changed) {
    saveAppointments();
  }
}


/* =========================================================
   NORMALIZAR PACIENTES
========================================================= */

function normalizeStoredPatients() {

  let changed = false;

  const unique =
    new Map();

  patients.forEach(
    patient => {

      if (!patient.id) {

        patient.id =
          generateId(
            'patient'
          );

        changed = true;
      }


      if (
        !Array.isArray(
          patient.historialClinico
        )
      ) {

        patient.historialClinico =
          [];

        changed = true;
      }


      if (
        !Array.isArray(
          patient.historialFinanciero
        )
      ) {

        patient.historialFinanciero =
          [];

        changed = true;
      }


      if (
        !Array.isArray(
          patient.archivosClinicos
        )
      ) {

        patient.archivosClinicos =
          [];

        changed = true;
      }

      unique.set(
        patient.id,
        patient
      );
    }
  );


  if (
    unique.size !==
    patients.length
  ) {

    patients =
      Array.from(
        unique.values()
      );

    changed = true;
  }


  /* LIMPIAR REGISTROS CLÍNICOS DUPLICADOS */

  patients.forEach(
    patient => {

      const records =
        patient.historialClinico ||
        [];

      const uniqueRecords =
        new Map();

      records.forEach(
        record => {

          const key =
            [
              record.fecha || '',
              normalizeName(
                record.tratamiento
              ),
              normalizeName(
                record.diagnostico
              ),
              normalizeName(
                record.avance
              )
            ].join('|');

          uniqueRecords.set(
            key,
            record
          );
        }
      );

      if (
        uniqueRecords.size !==
        records.length
      ) {

        patient.historialClinico =
          Array.from(
            uniqueRecords.values()
          );

        changed = true;
      }
    }
  );

  return changed;
}


/* =========================================================
   LIMPIEZA DE CITAS
========================================================= */

function cleanAppointments() {

  let changed = false;

  const appointments =
    getAppointments()
      .map(
        ({ appointment }) =>
          appointment
      );

  const validStatuses = [
    'En espera',
    'Finalizada',
    'Cancelada'
  ];

  appointments.forEach(
    appointment => {

      if (
        !validStatuses.includes(
          appointment[5]
        )
      ) {

        appointment[5] =
          'En espera';

        changed = true;
      }

      if (!appointment[4]) {

        appointment[4] =
          getISODate(0);

        changed = true;
      }

      ensureAppointmentId(
        appointment
      );

      if (!appointment[7]) {

        const patient =
          findPatientByName(
            appointment[1]
          );

        if (patient) {

          appointment[7] =
            patient.id;

          changed = true;
        }
      }
    }
  );


  const unique =
    new Map();

  appointments.forEach(
    appointment => {

      unique.set(
        appointment[6],
        appointment
      );
    }
  );

  if (
    unique.size !==
    appointments.length
  ) {
    changed = true;
  }

  rebuildAppointmentCollections(
    Array.from(
      unique.values()
    )
  );

  return changed;
}


/* =========================================================
   SINCRONIZAR PACIENTES Y CITAS
========================================================= */

function syncPatientAppointmentReferences() {

  let changed = false;

  getAppointments().forEach(
    ({ appointment }) => {

      if (appointment[7]) {
        return;
      }

      const patient =
        findPatientByName(
          appointment[1]
        );

      if (patient) {

        appointment[7] =
          patient.id;

        changed = true;
      }
    }
  );

  if (changed) {
    saveAppointments();
  }

  return changed;
}


/* =========================================================
   INICIALIZAR STORAGE
========================================================= */

function initializeStorage() {

  patients =
    loadPatients();

  loadAppointments();


  const patientsChanged =
    normalizeStoredPatients();


  migrateAppointments();


  syncPatientAppointmentReferences();


  const appointmentsChanged =
    cleanAppointments();


  if (patientsChanged) {
    savePatients();
  }

  if (appointmentsChanged) {
    saveAppointments();
  }


  localStorage.setItem(
    STORAGE_VERSION_KEY,
    STORAGE_VERSION
  );
}


/* =========================================================
   INICIALIZAR APP
========================================================= */

function initializeApp() {

  initializeStorage();

  createPaymentReceiptModal();

  renderLists();

  renderCalendars();

  updateAttendedCount();

  updateDashboardIncome();

  initializeAppointmentPatientSearch();

  unlockPageScroll();


  const patientModal =
    document.querySelector(
      '#patient-modal'
    );

  const appointmentModal =
    document.querySelector(
      '#appointment-modal'
    );

  if (patientModal) {

    patientModal.classList.remove(
      'open'
    );

    patientModal.setAttribute(
      'aria-hidden',
      'true'
    );
  }

  if (appointmentModal) {

    appointmentModal.classList.remove(
      'open'
    );

    appointmentModal.setAttribute(
      'aria-hidden',
      'true'
    );
  }
}


/* =========================================================
   EJECUCIÓN
========================================================= */

if (
  document.readyState ===
  'loading'
) {

  document.addEventListener(
    'DOMContentLoaded',
    initializeApp,
    {
      once: true
    }
  );

} else {

  initializeApp();

}