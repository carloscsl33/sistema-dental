const MAX_REASON_LENGTH = 32;

const pages = {
  centro: ["Centro de Mando"],
  citas: ["Citas"],
  pacientes: ["Pacientes"],
  cobros: ["Cobros"],
  configuracion: ["Configuración"],
  administrar: ["Administrar usuarios"],
};

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const PATIENTS_STORAGE_KEY = "dentalClinicPatients";

const APPOINTMENTS_STORAGE_KEY = "dentalClinicAppointments";

const BLOCKED_SLOTS_STORAGE_KEY = "dentalClinicBlockedAppointmentSlots";

let MAX_PATIENTS_PER_SLOT = 3;

let clinicSettings = {
  clinic_name: "Thera-dent",
  timezone: "America/Mexico_City",
  currency_code: "MXN",
  slot_minutes: 30,
  slot_capacity: 3,
};
let businessHours = [];
let clinicClosures = [];
let appointmentReasons = [];
let treatmentCatalog = [];

const ALLOWED_FILE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
  "doc",
  "docx",
];

const SAFE_PREVIEW_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const CLINICAL_FILES_DATABASE = "dentalClinicFiles";

const CLINICAL_FILES_STORE = "files";

const CLINICAL_SERVICE_OPTIONS = [
  "Ortodoncia / Brackets",
  "Limpieza dental",
  "Extracción / Cirugía",
  "Endodoncia",
  "Valoración inicial",
  "Otro...",
];

const todayAppointments = [];

const tomorrowAppointments = [];

const otherAppointments = [];

let blockedAppointmentSlots = [];

let selectedPatientId = null;

let followUpAppointmentId = null;

let rescheduleAppointmentId = null;

let toastTimer = null;

let editingAppointment = null;

let editingPatient = null;

let pendingClinicalFiles = [];

let clinicalFilesDatabasePromise = null;

let activeAppointmentFilter = "all";

let activeAppointmentSort = "recent";

const currentDate = new Date();

let calendarMonth = currentDate.getMonth();

let calendarYear = currentDate.getFullYear();

let patients = [];

let globalSearchQuery = "";

let searchTimer = null;
