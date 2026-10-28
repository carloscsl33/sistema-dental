// Capa de datos (hoy localStorage/IndexedDB; aquí se conectará Supabase)

let restoringFromStorage = false;
function restoreLastSavedState() {
  if (restoringFromStorage) return;
  restoringFromStorage = true;
  try {
    if (isCloudConnected() && lastSyncedPatients.size) {
      patients = Array.from(lastSyncedPatients.values()).map(cloneDeep);
      rebuildAppointmentCollections(Array.from(lastSyncedAppointments.values()).map(cloneDeep));
      cachePatientsLocally();
      cacheAppointmentsLocally();
    } else {
      initializeStorage();
    }
    renderLists();
  } finally {
    restoringFromStorage = false;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`No se pudo guardar ${key}:`, error);
    showToast('No se pudieron guardar los cambios. Se restauró el último estado guardado.');
    setTimeout(restoreLastSavedState, 0);
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

function cachePatientsLocally() {
  return saveToStorage(PATIENTS_STORAGE_KEY, patients);
}

function savePatients() {
  const result = cachePatientsLocally();
  if (isCloudConnected()) syncPatientsToCloud().catch(error => console.error('Sincronización de pacientes falló:', error));
  return result;
}

function deleteClinicalFiles(fileIds) {
  if (!fileIds.length) return Promise.resolve();
  if (isCloudConnected()) {
    return Promise.all([
      supabaseClient.storage.from('clinical-files').remove(fileIds),
      supabaseClient.from('patient_files').delete().in('id', fileIds)
    ]);
  }
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
  if (isCloudConnected()) {
    const { error } = await supabaseClient.storage.from('clinical-files')
      .upload(id, file, { contentType: mimeFromExtension(file.name, file.type), upsert: false });
    if (error) throw error;
    return;
  }
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
  if (isCloudConnected()) {
    const { data, error } = await supabaseClient.storage.from('clinical-files').download(id);
    if (error) throw error;
    return data;
  }
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

function cacheAppointmentsLocally() {
  return saveToStorage(APPOINTMENTS_STORAGE_KEY, getAppointments().map(({ appointment }) => appointment));
}

function saveAppointments() {
  const result = cacheAppointmentsLocally();
  if (isCloudConnected()) syncAppointmentsToCloud().catch(error => console.error('Sincronización de citas falló:', error));
  return result;
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
      count: Math.min(MAX_PATIENTS_PER_SLOT, Math.max(1, Number.isInteger(Number(slot.count)) ? Number(slot.count) : MAX_PATIENTS_PER_SLOT))
    }))
    : [];
}

function cacheBlockedSlotsLocally() {
  return saveToStorage(BLOCKED_SLOTS_STORAGE_KEY, blockedAppointmentSlots);
}

function saveBlockedAppointmentSlots() {
  const result = cacheBlockedSlotsLocally();
  if (isCloudConnected()) syncBlockedSlotsToCloud().catch(error => console.error('Sincronización de horarios falló:', error));
  return result;
}

function getBlockedAppointmentSlotCount(date, time) {
  return blockedAppointmentSlots
    .filter(slot => slot.date === date && slot.time === time)
    .reduce((total, slot) => total + Math.max(1, Number(slot.count) || MAX_PATIENTS_PER_SLOT), 0);
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
        diagnostico: String(service.diagnostico || '')
      }))
      : [],
    fechaRegistroClinico: patient.fechaRegistroClinico || '',
    archivosClinicos: Array.isArray(patient.archivosClinicos) ? patient.archivosClinicos : [],
    historialClinico: Array.isArray(patient.historialClinico) ? patient.historialClinico : [],
    historialFinanciero: Array.isArray(patient.historialFinanciero) ? patient.historialFinanciero : [],
    createdAt: patient.createdAt || new Date().toISOString()
  };
}

function normalizeAppointment(raw) {
  const row = Array.isArray(raw) ? raw : null;
  const source = row
    ? { time: row[0], name: row[1], reason: row[2], balance: row[3], date: row[4], status: row[5], id: row[6], patientId: row[7], total: row[8], paid: row[9], observations: row[11] }
    : raw;
  if (!source || typeof source !== 'object') return null;
  const balance = getNumericAmount(source.balance);
  const total = source.total !== undefined ? getNumericAmount(source.total) : balance;
  const paid = source.paid !== undefined ? getNumericAmount(source.paid) : Math.max(total - balance, 0);
  const pending = Math.max(Math.round((total - paid) * 100) / 100, 0);
  return {
    id: source.id || generateId('appointment'),
    patientId: source.patientId || null,
    name: String(source.name || '').trim(),
    time: source.time || '09:00 AM',
    date: source.date || getISODate(0),
    reason: sanitizeReason(source.reason),
    status: ['En espera', 'Finalizada', 'Cancelada'].includes(source.status) ? source.status : 'En espera',
    total,
    paid,
    balance: pending,
    paymentStatus: pending <= 0 && total > 0 ? 'Completo' : paid > 0 ? 'Parcial' : 'No pagado',
    observations: Array.isArray(source.observations)
      ? source.observations.filter(entry => entry && typeof entry.text === 'string' && entry.text.trim()).map(entry => ({
        id: String(entry.id || generateId('observation')), text: entry.text.trim(), createdAt: String(entry.createdAt || ''),
        ...(entry.updatedAt ? { updatedAt: String(entry.updatedAt) } : {})
      }))
      : []
  };
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
    fechaRegistroClinico: '',
    archivosClinicos: [],
    historialClinico: [],
    historialFinanciero: [],
    createdAt: new Date().toISOString()
  };
}

function findPatientByName(name) {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  return patients.find(p => normalizeName(getPatientFullName(p)) === normalized) || null;
}

function findPatientById(id) {
  return id ? patients.find(p => p.id === id) || null : null;
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
  const collection = getAppointmentCollectionByDate(appointment.date);
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

function ensureAppointmentId(appointment) {
  return appointment.id;
}

function resolveAppointmentPatient(appointment) {
  return appointment?.patientId ? findPatientById(appointment.patientId) : null;
}

function getPatientAppointments(patient) {
  if (!patient) return [];
  return getAppointments().map(({ appointment }) => appointment).filter(appointment => appointment.patientId === patient.id);
}

function updatePatientAppointmentReferences(patientId, oldName, newName) {
  let changed = false;
  getAppointments().forEach(({ appointment }) => {
    if (appointment.patientId === patientId && appointment.name !== newName) {
      appointment.name = newName;
      changed = true;
    }
  });
  
  if (changed) saveAppointments();
}

function removeAppointmentById(appointmentId) {
  let removed = false;
  [todayAppointments, tomorrowAppointments, otherAppointments].forEach(collection => {
    for (let i = collection.length - 1; i >= 0; i--) {
      if (collection[i].id === appointmentId) {
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
    if (!appointment.patientId) {
      const patient = findPatientByName(appointment.name);
      if (patient) appointment.patientId = patient.id;
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
        normalizeName(record.diagnostico)
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
    if (!validStatuses.includes(appointment.status)) {
      appointment.status = 'En espera';
      changed = true;
    }
    if (!appointment.date) {
      appointment.date = getISODate(0);
      changed = true;
    }
    ensureAppointmentId(appointment);
    if (!appointment.patientId) {
      const patient = findPatientByName(appointment.name);
      if (patient) {
        appointment.patientId = patient.id;
        changed = true;
      }
    }
  });
  
  const unique = new Map();
  appointments.forEach(app => unique.set(app.id, app));
  if (unique.size !== appointments.length) changed = true;
  
  rebuildAppointmentCollections(Array.from(unique.values()));
  return changed;
}

function syncPatientAppointmentReferences() {
  let changed = false;
  getAppointments().forEach(({ appointment }) => {
    if (!appointment.patientId) {
      const patient = findPatientByName(appointment.name);
      if (patient) {
        appointment.patientId = patient.id;
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
}


// ===================== Sincronización con Supabase =====================
// Mientras js/config.js esté vacío, isCloudConnected() es false y nada de este bloque se ejecuta:
// la app sigue funcionando 100% local, como antes.

function cloneDeep(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function mimeFromExtension(fileName, fallbackType) {
  const extension = String(fileName || '').split('.').pop().toLowerCase();
  const byExtension = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return byExtension[extension] || (SAFE_PREVIEW_TYPES.includes(fallbackType) ? fallbackType : 'application/pdf');
}

const APPOINTMENT_STATUS_TO_DB = { 'En espera': 'en_espera', 'Finalizada': 'finalizada', 'Cancelada': 'cancelada' };
const APPOINTMENT_STATUS_FROM_DB = { en_espera: 'En espera', finalizada: 'Finalizada', cancelada: 'Cancelada' };
const PATIENT_SEX_TO_DB = {
  femenino: 'Femenino',
  masculino: 'Masculino',
  otro: 'Prefiero no especificar',
  'no-especificado': 'Prefiero no especificar'
};

let lastSyncedPatients = new Map();
let lastSyncedAppointments = new Map();
let lastSyncedBlockedSlots = new Map();
let cloudSyncedPaymentIds = new Set();
let realtimeChannel = null;
let realtimeRefreshTimer = null;
let cloudSessionActive = false;

function patientToRow(patient) {
  return {
    id: patient.id,
    first_name: patient.nombre,
    last_name: patient.apellidos,
    birth_date: patient.fechaNacimiento || null,
    // Mantiene compatibilidad con registros locales anteriores y respeta el CHECK de la base.
    sex: PATIENT_SEX_TO_DB[patient.sexo] || patient.sexo || null,
    phone: patient.telefono,
    email: patient.correo || null,
    address: patient.direccion || null,
    emergency_name: patient.contactoEmergencia,
    emergency_relation: patient.parentescoEmergencia,
    emergency_phone: patient.telefonoEmergencia,
    blood_type: patient.tipoSangre || null,
    medical_history: patient.antecedentesMedicos || null,
    allergies: patient.alergias,
    medications: patient.medicamentos || null,
    medical_notes: patient.observacionesMedicas || null
  };
}

function rowToPatient(row, treatmentRows, fileRows) {
  const activeTreatments = treatmentRows.filter(t => t.is_active);
  const patient = normalizePatient({
    id: row.id,
    nombre: row.first_name,
    apellidos: row.last_name,
    fechaNacimiento: row.birth_date || '',
    sexo: row.sex || '',
    telefono: row.phone || '',
    correo: row.email || '',
    direccion: row.address || '',
    contactoEmergencia: row.emergency_name || '',
    parentescoEmergencia: row.emergency_relation || '',
    telefonoEmergencia: row.emergency_phone || '',
    antecedentesMedicos: row.medical_history || '',
    alergias: row.allergies || '',
    medicamentos: row.medications || '',
    tipoSangre: row.blood_type || '',
    observacionesMedicas: row.medical_notes || '',
    tratamientoActual: activeTreatments[0]?.name || '',
    diagnostico: activeTreatments[0]?.diagnosis || '',
    tratamientoServicios: activeTreatments.map(t => ({ tratamiento: t.name, diagnostico: t.diagnosis })),
    fechaRegistroClinico: treatmentRows[0]?.recorded_on || '',
    historialClinico: treatmentRows.map(t => ({ id: t.id, fecha: t.recorded_on, tratamiento: t.name, diagnostico: t.diagnosis })),
    archivosClinicos: fileRows.map(f => ({ id: f.id, name: f.file_name, type: f.mime_type, size: f.size_bytes, date: (f.uploaded_at || '').slice(0, 10) })),
    historialFinanciero: [],
    createdAt: row.created_at
  });
  return patient;
}

function appointmentToRow(appointment) {
  return {
    id: appointment.id,
    patient_id: appointment.patientId,
    appt_date: appointment.date,
    appt_time: toInputTime(appointment.time),
    motive: appointment.reason,
    status: APPOINTMENT_STATUS_TO_DB[appointment.status] || 'en_espera',
    total: appointment.total,
    paid: appointment.paid
  };
}

function appointmentToUpdateRow(appointment) {
  // `paid` solo cambia dentro de record_payment(), nunca desde una edición de cita.
  const { id, paid, ...row } = appointmentToRow(appointment);
  return row;
}

function rowToAppointment(row, patientsById, note) {
  const patient = patientsById.get(row.patient_id);
  return normalizeAppointment({
    id: row.id,
    patientId: row.patient_id,
    name: patient ? getPatientFullName(patient) : '',
    time: formatTimeFromInput(row.appt_time),
    date: row.appt_date,
    reason: row.motive,
    status: APPOINTMENT_STATUS_FROM_DB[row.status] || 'En espera',
    total: Number(row.total),
    paid: Number(row.paid),
    observations: note && note.body ? [{ id: row.id, text: note.body, createdAt: note.created_at, updatedAt: note.updated_at }] : []
  });
}

function describeCloudError(error) {
  const message = String(error?.message || '');
  if (message.includes('slot_full')) return `Ese horario ya alcanzó el límite de ${MAX_PATIENTS_PER_SLOT} pacientes.`;
  if (message.includes('past_date')) return 'No se pueden agendar ni mover citas a fechas pasadas.';
  if (message.includes('appointments_patient_day_uq')) return 'Ese paciente ya tiene una cita activa ese día.';
  if (message.includes('patients_identity_uq')) return 'Ya existe un paciente con ese nombre y fecha de nacimiento.';
  if (message.includes('appointments_paid_le_total')) return 'El monto pagado no puede ser mayor que el costo de la cita.';
  return 'No se pudo guardar en la nube. Se restauró el último estado sincronizado.';
}

async function syncPatientsToCloud() {
  if (!isCloudConnected()) return;
  const currentIds = new Set(patients.map(p => p.id));
  const toDelete = Array.from(lastSyncedPatients.keys()).filter(id => !currentIds.has(id));
  const toUpsert = patients.filter(p => {
    const previous = lastSyncedPatients.get(p.id);
    return !previous || JSON.stringify(previous) !== JSON.stringify(p);
  });
  if (!toDelete.length && !toUpsert.length) return;

  try {
    for (const id of toDelete) {
      const { error } = await supabaseClient.from('patients').delete().eq('id', id);
      if (error) throw error;
      lastSyncedPatients.delete(id);
    }

    for (const patient of toUpsert) {
      const { error: patientError } = await supabaseClient.from('patients').upsert(patientToRow(patient));
      if (patientError) throw patientError;

      const { error: treatmentsDeleteError } = await supabaseClient.from('treatments').delete().eq('patient_id', patient.id);
      if (treatmentsDeleteError) throw treatmentsDeleteError;
      const activeKeys = new Set((patient.tratamientoServicios || [])
        .map(service => normalizeName(service.tratamiento) + '|' + normalizeName(service.diagnostico)));
      const treatmentRows = (patient.historialClinico || []).map(record => ({
        id: record.id,
        patient_id: patient.id,
        name: record.tratamiento || 'Tratamiento',
        diagnosis: record.diagnostico || 'Sin diagnóstico',
        recorded_on: record.fecha || getISODate(0),
        is_active: activeKeys.has(normalizeName(record.tratamiento) + '|' + normalizeName(record.diagnostico))
      }));
      if (treatmentRows.length) {
        const { error: treatmentsInsertError } = await supabaseClient.from('treatments').insert(treatmentRows);
        if (treatmentsInsertError) throw treatmentsInsertError;
      }

      const { error: filesDeleteError } = await supabaseClient.from('patient_files').delete().eq('patient_id', patient.id);
      if (filesDeleteError) throw filesDeleteError;
      const fileRows = (patient.archivosClinicos || []).map(file => ({
        id: file.id,
        patient_id: patient.id,
        storage_path: file.id,
        file_name: file.name || 'archivo',
        mime_type: mimeFromExtension(file.name, file.type),
        size_bytes: Math.max(1, Number(file.size) || 1)
      }));
      if (fileRows.length) {
        const { error: filesInsertError } = await supabaseClient.from('patient_files').insert(fileRows);
        if (filesInsertError) throw filesInsertError;
      }

      lastSyncedPatients.set(patient.id, cloneDeep(patient));
    }
  } catch (error) {
    console.error('No se pudo sincronizar con Supabase (pacientes):', error);
    showToast(describeCloudError(error));
    restoreLastSavedState();
  }
}

async function syncAppointmentsToCloud() {
  if (!isCloudConnected()) return;
  const current = getAppointments().map(({ appointment }) => appointment);
  const currentIds = new Set(current.map(a => a.id));
  const toDelete = Array.from(lastSyncedAppointments.keys()).filter(id => !currentIds.has(id));
  const toUpsert = current.filter(a => {
    const previous = lastSyncedAppointments.get(a.id);
    return !previous || JSON.stringify(previous) !== JSON.stringify(a);
  });
  if (!toDelete.length && !toUpsert.length) return;

  try {
    for (const id of toDelete) {
      const { error } = await supabaseClient.from('appointments').delete().eq('id', id);
      if (error) throw error;
      lastSyncedAppointments.delete(id);
    }

    for (const appointment of toUpsert) {
      if (!appointment.patientId) continue;
      const previous = lastSyncedAppointments.get(appointment.id);
      const { error } = previous
        ? await supabaseClient.from('appointments').update(appointmentToUpdateRow(appointment)).eq('id', appointment.id)
        : await supabaseClient.from('appointments').insert(appointmentToRow(appointment));
      if (error) throw error;

      const note = appointment.observations && appointment.observations[0];
      if (note && note.text) {
        const { error: noteError } = await supabaseClient.from('appointment_notes')
          .upsert({ appointment_id: appointment.id, body: note.text });
        if (noteError) throw noteError;
      } else {
        await supabaseClient.from('appointment_notes').delete().eq('appointment_id', appointment.id);
      }
      lastSyncedAppointments.set(appointment.id, cloneDeep(appointment));
    }
  } catch (error) {
    console.error('No se pudo sincronizar con Supabase (citas):', error);
    showToast(describeCloudError(error));
    restoreLastSavedState();
  }
}

async function syncBlockedSlotsToCloud() {
  if (!isCloudConnected()) return;
  const currentSlots = new Map(blockedAppointmentSlots.map(slot => [`${slot.date}|${slot.time}`, slot]));
  const slotsToDelete = Array.from(lastSyncedBlockedSlots.entries())
    .filter(([key]) => !currentSlots.has(key))
    .map(([, slot]) => slot);
  const slotsToSave = Array.from(currentSlots.entries())
    .filter(([key, slot]) => JSON.stringify(lastSyncedBlockedSlots.get(key)) !== JSON.stringify(slot))
    .map(([, slot]) => slot);
  if (!slotsToDelete.length && !slotsToSave.length) return;

  try {
    for (const slot of slotsToDelete) {
      const { error } = await supabaseClient.from('blocked_slots')
        .delete()
        .eq('slot_date', slot.date)
        .eq('slot_time', slot.time);
      if (error) throw error;
      lastSyncedBlockedSlots.delete(`${slot.date}|${slot.time}`);
    }
    for (const slot of slotsToSave) {
      const { error } = await supabaseClient.from('blocked_slots').upsert({
        slot_date: slot.date,
        slot_time: slot.time,
        places: slot.count
      }, { onConflict: 'slot_date,slot_time' });
      if (error) throw error;
      lastSyncedBlockedSlots.set(`${slot.date}|${slot.time}`, cloneDeep(slot));
    }
  } catch (error) {
    console.error('No se pudo sincronizar con Supabase (horarios bloqueados):', error);
    showToast('No se pudieron guardar los horarios bloqueados en la nube.');
  }
}

async function connectToCloud() {
  if (!isCloudConnected()) return;
  try {
    const [patientsResult, treatmentsResult, filesResult, paymentsResult, appointmentsResult, notesResult, blockedResult, settingsResult, hoursResult, closuresResult, reasonsResult, catalogResult] = await Promise.all([
      supabaseClient.from('patients').select('*'),
      supabaseClient.from('treatments').select('*').order('recorded_on'),
      supabaseClient.from('patient_files').select('*'),
      supabaseClient.from('payments').select('*'),
      supabaseClient.from('appointments').select('*'),
      supabaseClient.from('appointment_notes').select('*'),
      supabaseClient.from('blocked_slots').select('*'),
      supabaseClient.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
      supabaseClient.from('business_hours').select('*').order('day_of_week'),
      supabaseClient.from('clinic_closures').select('*'),
      supabaseClient.from('appointment_reasons').select('*').order('sort_order'),
      supabaseClient.from('treatment_catalog').select('*').order('sort_order')
    ]);
    const firstError = [patientsResult, treatmentsResult, filesResult, paymentsResult, appointmentsResult, notesResult, blockedResult, settingsResult, hoursResult, closuresResult, reasonsResult, catalogResult]
      .map(result => result.error).find(Boolean);
    if (firstError) throw firstError;
    applyClinicConfiguration(settingsResult.data, hoursResult.data || [], closuresResult.data || [], reasonsResult.data || [], catalogResult.data || []);

    const patientRows = patientsResult.data || [];
    const appointmentRows = appointmentsResult.data || [];

    if (!patientRows.length && !appointmentRows.length) {
      const localPatients = loadPatients();
      const localAppointments = readFromStorage(APPOINTMENTS_STORAGE_KEY, []).map(normalizeAppointment).filter(Boolean);
      if (localPatients.length || localAppointments.length) {
        const { confirmed } = await showConfirmationDialog({
          title: 'Subir los datos de este dispositivo',
          message: `Encontré ${localPatients.length} paciente(s) y ${localAppointments.length} cita(s) guardados en este navegador, y la base de datos en la nube está vacía. ¿Quieres subirlos ahora?`,
          confirmLabel: 'Subir a la nube'
        });
        if (confirmed) {
          patients = localPatients;
          rebuildAppointmentCollections(localAppointments);
          lastSyncedPatients = new Map();
          lastSyncedAppointments = new Map();
          cloudSyncedPaymentIds = new Set();
          await syncPatientsToCloud();
          await syncAppointmentsToCloud();
          finishCloudRefresh();
          return;
        }
      }
    }

    const treatmentsByPatient = new Map();
    (treatmentsResult.data || []).forEach(row => {
      const list = treatmentsByPatient.get(row.patient_id) || [];
      list.push(row);
      treatmentsByPatient.set(row.patient_id, list);
    });
    const filesByPatient = new Map();
    (filesResult.data || []).forEach(row => {
      const list = filesByPatient.get(row.patient_id) || [];
      list.push(row);
      filesByPatient.set(row.patient_id, list);
    });
    const paymentsByPatient = new Map();
    (paymentsResult.data || []).forEach(row => {
      const list = paymentsByPatient.get(row.patient_id) || [];
      list.push(row);
      paymentsByPatient.set(row.patient_id, list);
    });

    patients = patientRows.map(row => {
      const patient = rowToPatient(row, treatmentsByPatient.get(row.id) || [], filesByPatient.get(row.id) || []);
      patient.historialFinanciero = (paymentsByPatient.get(row.id) || []).map(payment => ({
        id: payment.id,
        fecha: payment.paid_on,
        monto: Number(payment.amount),
        concepto: payment.concept || 'Pago de consulta',
        metodo: payment.method,
        citaId: payment.appointment_id,
        referencia: payment.reference || '',
        notas: payment.notes || '',
        createdAt: payment.created_at
      }));
      return patient;
    });

    const patientsById = new Map(patients.map(patient => [patient.id, patient]));
    const notesByAppointment = new Map((notesResult.data || []).map(note => [note.appointment_id, note]));
    rebuildAppointmentCollections(appointmentRows.map(row => rowToAppointment(row, patientsById, notesByAppointment.get(row.id))));

    blockedAppointmentSlots = (blockedResult.data || []).map(row => ({
      date: row.slot_date, time: row.slot_time.slice(0, 5), count: row.places
    }));

    lastSyncedPatients = new Map(patients.map(patient => [patient.id, cloneDeep(patient)]));
    lastSyncedAppointments = new Map(getAppointments().map(({ appointment }) => [appointment.id, cloneDeep(appointment)]));
    lastSyncedBlockedSlots = new Map(blockedAppointmentSlots.map(slot => [`${slot.date}|${slot.time}`, cloneDeep(slot)]));
    cloudSyncedPaymentIds = new Set((paymentsResult.data || []).map(payment => payment.id));

    finishCloudRefresh();
  } catch (error) {
    console.error('No se pudo cargar los datos de Supabase:', error);
    showToast('No se pudieron cargar los datos de la nube. Mostrando la última copia guardada en este dispositivo.');
  }
}

function finishCloudRefresh() {
  cachePatientsLocally();
  cacheAppointmentsLocally();
  cacheBlockedSlotsLocally();
  subscribeRealtime();
  renderLists();
  renderDashboardCalendar();
  renderConfigurationModule?.();
  renderFinanceModule?.();
  updateAttendedCount();
  updateDashboardIncome();
  if (document.querySelector('#page-pacientes')?.classList.contains('active')) renderPatientDirectory(globalSearchQuery);
}

function disconnectFromCloud() {
  unsubscribeRealtime();
  patients = [];
  rebuildAppointmentCollections([]);
  blockedAppointmentSlots = [];
  lastSyncedPatients = new Map();
  lastSyncedAppointments = new Map();
  lastSyncedBlockedSlots = new Map();
  cloudSyncedPaymentIds = new Set();
  localStorage.removeItem(PATIENTS_STORAGE_KEY);
  localStorage.removeItem(APPOINTMENTS_STORAGE_KEY);
  localStorage.removeItem(BLOCKED_SLOTS_STORAGE_KEY);
  renderLists();
}

function scheduleRealtimeRefresh() {
  clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = setTimeout(() => connectToCloud(), 400);
}

function subscribeRealtime() {
  unsubscribeRealtime();
  realtimeChannel = supabaseClient
    .channel('dental-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, scheduleRealtimeRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_slots' }, scheduleRealtimeRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, scheduleRealtimeRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'treatments' }, scheduleRealtimeRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_notes' }, scheduleRealtimeRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, scheduleRealtimeRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_files' }, scheduleRealtimeRefresh)
    .subscribe();
}

function unsubscribeRealtime() {
  clearTimeout(realtimeRefreshTimer);
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}
