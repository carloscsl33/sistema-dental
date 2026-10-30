function setAppointmentMotive(value = "") {
  const motiveSelect = document.querySelector("#modal-motive");
  const customLabel = document.querySelector("#modal-motive-custom-label");
  const customInput = document.querySelector("#modal-motive-custom");
  if (!motiveSelect || !customLabel || !customInput) return;

  const knownMotive = Array.from(motiveSelect.options).some(
    (option) => option.value === value && value !== "" && value !== "Otro",
  );
  if (knownMotive) {
    motiveSelect.value = value;
    customInput.value = "";
  } else if (value) {
    motiveSelect.value = "Otro";
    customInput.value = String(value).slice(0, MAX_REASON_LENGTH);
  } else {
    motiveSelect.value = "";
    customInput.value = "";
  }

  const isCustom = motiveSelect.value === "Otro";
  customLabel.hidden = !isCustom;
  customInput.required = isCustom;
  customInput.disabled = !isCustom;
}

function getAppointmentMotive() {
  const motiveSelect = document.querySelector("#modal-motive");
  const customInput = document.querySelector("#modal-motive-custom");
  return motiveSelect?.value === "Otro"
    ? customInput?.value.trim() || ""
    : motiveSelect?.value || "";
}

function isAppointmentTimeInPast(date, time) {
  if (date < getISODate(0)) return true;
  return date === getISODate(0) && toMinutes(time) < getCurrentMinutes();
}

function patientHasAppointmentOnDate(
  patient,
  date,
  excludedAppointmentId = null,
) {
  const patientName = getPatientFullName(patient);
  return getAppointments().some(({ appointment }) => {
    if (
      appointment.date !== date ||
      appointment.status === "Cancelada" ||
      appointment.id === excludedAppointmentId
    ) {
      return false;
    }
    return appointment.patientId === patient.id;
  });
}

function getAppointmentTimeSlotCount(date, time) {
  const appointmentsCount = getAppointments().filter(({ appointment }) => {
    if (appointment.date !== date || appointment.status === "Cancelada")
      return false;
    if (editingAppointment && appointment.id === editingAppointment.id)
      return false;
    return toInputTime(appointment.time) === time;
  }).length;
  return appointmentsCount + getBlockedAppointmentSlotCount(date, time);
}

function renderAppointmentCalendar(resetMonth = false) {
  const dateInput = document.querySelector("#modal-date");
  const title = document.querySelector("#appointment-calendar-title");
  const daysHost = document.querySelector("#appointment-calendar-days");
  const previousButton = document.querySelector(
    '[data-appointment-calendar-month="-1"]',
  );
  if (!dateInput || !title || !daysHost) return;

  const selectedDate = dateInput.value;
  const selectedParts = selectedDate.split("-").map(Number);
  if (resetMonth || !daysHost.dataset.month) {
    daysHost.dataset.month = `${selectedParts[0]}-${String(selectedParts[1]).padStart(2, "0")}`;
  }
  const [year, month] = daysHost.dataset.month.split("-").map(Number);
  if (!year || !month) return;

  const monthDate = new Date(year, month - 1, 1, 12);
  title.textContent = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(monthDate);
  const currentDate = new Date(`${getISODate(0)}T12:00:00`);
  const currentMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1,
    12,
  );
  if (previousButton) previousButton.disabled = monthDate <= currentMonth;

  const firstWeekday = (monthDate.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = Array.from(
    { length: firstWeekday },
    () => '<span class="appointment-calendar-empty" aria-hidden="true"></span>',
  );
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dateObject = new Date(year, month - 1, day, 12);
    const isToday = date === getISODate(0);
    const selected = date === selectedDate;
    const label = new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(dateObject);
    cells.push(
      `<button type="button" class="appointment-calendar-day${selected ? " is-selected" : ""}${isToday ? " is-today" : ""}" data-appointment-date="${date}" aria-label="${label}" aria-pressed="${selected}"${date < getISODate(0) ? " disabled" : ""}>${day}</button>`,
    );
  }
  daysHost.innerHTML = cells.join("");

  const help = document.querySelector("#appointment-calendar-help");
  if (help) {
    help.textContent = selectedDate
      ? `Fecha seleccionada: ${new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${selectedDate}T12:00:00`))}.`
      : "Selecciona un día para consultar sus horarios.";
  }
}

function refreshAppointmentTimeSlots(preferredTime = "") {
  const timeSelect = document.querySelector("#modal-time");
  const dateInput = document.querySelector("#modal-date");
  const confirmButton = document.querySelector("#confirm-appointment");
  const help = document.querySelector("#modal-time-help");
  const morningSlots = document.querySelector("#morning-time-slots");
  const afternoonSlots = document.querySelector("#afternoon-time-slots");
  if (!timeSelect || !dateInput || !morningSlots || !afternoonSlots) return;

  const date = dateInput.value;
  dateInput.min = getISODate(0);
  const slots = createAppointmentTimeSlots(date).map((time) => {
    const count = getAppointmentTimeSlotCount(date, time);
    const isPast = isAppointmentTimeInPast(date, time);
    const available = isPast ? 0 : Math.max(MAX_PATIENTS_PER_SLOT - count, 0);
    const isFull = count >= MAX_PATIENTS_PER_SLOT;
    return {
      time,
      count,
      available,
      disabled: isFull || isPast,
      isPast,
      label: `${formatTimeFromInput(time).replace(/^0/, "").toLowerCase()}, ${isPast ? "horario no disponible" : isFull ? "sin lugares disponibles" : `${available} ${available === 1 ? "lugar disponible" : "lugares disponibles"}`}`,
    };
  });

  const availablePreferred = slots.find(
    (slot) => slot.time === preferredTime && !slot.disabled,
  );
  const firstAvailable = slots.find((slot) => !slot.disabled);
  const selectedTime = (availablePreferred || firstAvailable)?.time || "";
  timeSelect.replaceChildren(
    ...slots.map((slot) => {
      const option = document.createElement("option");
      option.value = slot.time;
      option.textContent = slot.label;
      option.disabled = slot.disabled;
      option.selected = slot.time === selectedTime;
      return option;
    }),
  );
  timeSelect.value = selectedTime;
  timeSelect.disabled = !selectedTime;
  if (confirmButton) confirmButton.disabled = !selectedTime;
  morningSlots.replaceChildren();
  afternoonSlots.replaceChildren();
  slots.forEach((slot) => {
    const button = document.createElement("button");
    const isSelected = slot.time === selectedTime;
    const timeLabel = formatTimeFromInput(slot.time)
      .replace(/^0/, "")
      .toLowerCase();
    button.type = "button";
    button.className = "appointment-time-slot";
    button.dataset.appointmentTime = slot.time;
    button.disabled = slot.disabled;
    button.setAttribute("aria-pressed", String(isSelected));
    button.setAttribute("aria-label", slot.label);
    button.title = slot.label;

    const timeText = document.createElement("span");
    timeText.className = "appointment-time-value";
    timeText.textContent = timeLabel;
    const availability = document.createElement("span");
    availability.className = "appointment-time-availability";
    availability.textContent = slot.isPast
      ? "No disponible"
      : slot.disabled
        ? "Lleno"
        : `${slot.available} ${slot.available === 1 ? "lugar" : "lugares"}`;
    button.append(timeText, availability);
    (Number(slot.time.slice(0, 2)) < 12 ? morningSlots : afternoonSlots).append(
      button,
    );
  });

  if (help) {
    if (!selectedTime) {
      help.textContent =
        date < getISODate(0)
          ? "No se pueden agendar citas en fechas pasadas."
          : date === getISODate(0) &&
              slots.every(
                (slot) => slot.isPast || slot.count >= MAX_PATIENTS_PER_SLOT,
              )
            ? "Ya no hay horarios disponibles para el resto del día."
            : "No hay horarios disponibles en esta fecha.";
    } else {
      const fullSlots = slots.filter((slot) => slot.disabled).length;
      const availableSpaces = slots.reduce(
        (total, slot) => total + slot.available,
        0,
      );
      help.textContent = `${date === getISODate(0) ? "Horarios desde la hora actual · " : ""}Máximo ${MAX_PATIENTS_PER_SLOT} pacientes por horario · ${availableSpaces} ${availableSpaces === 1 ? "lugar disponible" : "lugares disponibles"} en total · ${fullSlots} horarios no disponibles`;
    }
    renderAppointmentCalendar();
  }
}

function getStatusClass(status) {
  if (status === "Finalizada") return "confirmed";
  if (status === "Cancelada") return "postponed";
  return "pending";
}

function renderAppointmentObservations(appointment) {
  const observations = Array.isArray(appointment.observations)
    ? appointment.observations
    : [];
  if (!observations.length) {
    return '<p class="empty-state">Todavía no hay avances u observaciones para esta cita.</p>';
  }

  return observations
    .slice()
    .reverse()
    .map((observation) => {
      const createdAt = observation.createdAt
        ? new Date(observation.createdAt)
        : null;
      const hasValidDate = createdAt && !Number.isNaN(createdAt.getTime());
      const createdDate = hasValidDate
        ? createdAt.toLocaleDateString("es-MX", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "Fecha no registrada";
      const createdTime = hasValidDate
        ? createdAt.toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      return `<article class="appointment-observation">
      <small>${escapeHTML(createdDate)}${createdTime ? ` · ${escapeHTML(createdTime)}` : ""}</small>
      <p>${escapeHTML(observation.text)}</p>
    </article>`;
    })
    .join("");
}

function openAppointmentNotes(appointmentId) {
  const appointment = getAppointments().find(
    ({ appointment: item }) => item.id === appointmentId,
  )?.appointment;
  const modal = document.querySelector("#appointment-notes-modal");
  const form = document.querySelector("#appointment-notes-form");
  const history = document.querySelector("#appointment-notes-history");
  if (!appointment || !modal || !form || !history) {
    showToast("No se encontró la cita para registrar avances.");
    return;
  }

  ensureAppointmentId(appointment);
  const patient = resolveAppointmentPatient(appointment);
  const patientName = patient ? getPatientFullName(patient) : appointment.name;
  const appointmentDetails = document.querySelector(
    "#appointment-notes-appointment",
  );
  const title = document.querySelector("#appointment-notes-title");
  const appointmentIdInput = document.querySelector("#appointment-notes-id");
  const notesInput = document.querySelector("#appointment-notes-text");
  const notesLabel = document.querySelector("#appointment-notes-label");
  const saveButton = document.querySelector("#appointment-notes-save");
  const editButton = document.querySelector("#appointment-notes-edit");
  const cancelEditButton = document.querySelector(
    "#appointment-notes-cancel-edit",
  );
  const cancelButton = document.querySelector("#appointment-notes-cancel");
  const actions = document.querySelector(".appointment-notes-actions");
  const hasObservation =
    Array.isArray(appointment.observations) &&
    appointment.observations.length > 0;
  form.dataset.editingObservation = "false";
  modal.classList.toggle("is-viewing-observation", hasObservation);
  form.classList.toggle("is-viewing-observation", hasObservation);
  if (title)
    title.textContent = hasObservation
      ? "Avance registrado"
      : "Registrar avance";
  if (appointmentDetails) {
    appointmentDetails.textContent = `${patientName} · ${formatDisplayDate(appointment.date)} · ${appointment.time} · ${appointment.reason}`;
  }
  if (appointmentIdInput) appointmentIdInput.value = appointmentId;
  if (notesInput) notesInput.value = "";
  if (notesLabel) notesLabel.hidden = hasObservation;
  if (saveButton) saveButton.hidden = hasObservation;
  if (editButton) editButton.hidden = !hasObservation;
  if (cancelEditButton) cancelEditButton.hidden = true;
  if (cancelButton) cancelButton.textContent = "Cerrar";
  if (actions) actions.hidden = false;
  history.innerHTML = renderAppointmentObservations(appointment);
  history.hidden = false;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  lockPageScroll();
  if (!hasObservation) notesInput?.focus();
}

function closeAppointmentNotes() {
  const modal = document.querySelector("#appointment-notes-modal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.classList.remove("is-viewing-observation");
  const form = document.querySelector("#appointment-notes-form");
  form?.classList.remove("is-viewing-observation");
  if (form) form.dataset.editingObservation = "false";
  modal.setAttribute("aria-hidden", "true");
  document.querySelector("#appointment-notes-form")?.reset();
  updatePageScrollLock();
}

function statusActions(name, appointmentId) {
  const currentStatus =
    getAppointments().find(
      ({ appointment }) => appointment.id === appointmentId,
    )?.appointment?.status || "En espera";
  return `
    <div class="appointment-status">
      <span class="appointment-status-current ${getStatusClass(currentStatus)}">${escapeHTML(currentStatus)}</span>
      <div class="status-actions" role="group" aria-label="Cambiar estatus de la cita de ${escapeHTML(name)}">
        <button class="status-action finish ${currentStatus === "Finalizada" ? "selected" : ""}" data-status="Finalizada" data-appointment-status="${escapeHTML(appointmentId)}" aria-pressed="${currentStatus === "Finalizada"}">Finalizar</button>
        <button class="status-action pending ${currentStatus === "En espera" ? "selected" : ""}" data-status="En espera" data-appointment-status="${escapeHTML(appointmentId)}" aria-pressed="${currentStatus === "En espera"}">En espera</button>
        <button class="status-action cancel ${currentStatus === "Cancelada" ? "selected" : ""}" data-status="Cancelada" data-appointment-status="${escapeHTML(appointmentId)}" aria-pressed="${currentStatus === "Cancelada"}">Cancelar</button>
      </div>
    </div>
  `;
}

function todayMarkup(item) {
  const {
    time,
    name,
    reason: treatment,
    balance,
    status,
    id: appointmentId,
  } = item;
  ensureAppointmentId(item);
  const patient = resolveAppointmentPatient(item);
  const patientReference = patient ? `id:${patient.id}` : `name:${name}`;
  return `
    <div class="appointment-row is-today-appointment" data-type="today">
      <div class="time">${escapeHTML(time)}</div>
      <div class="person">
        <div>
          <div class="today-person-heading">
            <strong>${escapeHTML(name)}</strong>
            <button type="button" class="patient-info-button today-expedient-button" data-patient-info="${escapeHTML(patientReference)}" aria-label="Abrir expediente de ${escapeHTML(name)}">Expediente</button>
          </div>
          <small>${escapeHTML(treatment)}</small>
        </div>
      </div>
      <div class="charge">
        ${formatCurrency(balance)}
      </div>
      ${statusActions(name, appointmentId)}
    </div>
  `;
}

function tomorrowMarkup(item, index) {
  const { time, name, reason: treatment, balance } = item;
  ensureAppointmentId(item);
  const phone = resolveAppointmentPatient(item)?.telefono || "";
  return `
    <div class="tomorrow-row">
      <div class="person">
        <div>
          <strong>${escapeHTML(name)} · ${escapeHTML(time)}</strong>
          <small>${escapeHTML(treatment)} · Saldo: ${formatCurrency(balance)}</small>
        </div>
      </div>
      <button class="whatsapp" data-reminder="${escapeHTML(name)}" data-reminder-time="${escapeHTML(time)}" data-reminder-phone="${escapeHTML(phone)}" aria-label="Preparar recordatorio por WhatsApp">
        <span>WhatsApp</span>
      </button>
    </div>
  `;
}

function appointmentCardMarkup(appointment, index, source) {
  const { time, name, reason, balance, date, status } = appointment;
  ensureAppointmentId(appointment);
  const cardPatient = resolveAppointmentPatient(appointment);
  const phone = cardPatient?.telefono || "";
  const canEdit = status !== "Finalizada" && date >= getISODate(0);
  return `
    <article class="managed-appointment" data-search-match="${appointmentMatchesSearch(appointment) ? "true" : "false"}">
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
        <strong>${formatCurrency(balance)}</strong>
      </div>
      <div class="managed-appointment-actions">
        <button class="patient-info-button" data-patient-info="${escapeHTML(cardPatient ? "id:" + cardPatient.id : "name:" + name)}">Expediente</button>
        ${canEdit ? `<button class="patient-info-button appointment-edit-button" data-edit-appointment="${escapeHTML(appointment.id)}">Editar cita</button>` : ""}
        ${date === getISODate(1) ? `<button class="whatsapp" data-reminder="${escapeHTML(name)}" data-reminder-time="${escapeHTML(time)}" data-reminder-phone="${escapeHTML(phone)}" aria-label="Preparar recordatorio por WhatsApp"><span>WhatsApp</span></button>` : ""}
        ${status !== "Finalizada" ? `<button class="row-action delete-action" data-delete-appointment="${escapeHTML(appointment.id)}">Eliminar cita</button>` : ""}
      </div>
    </article>
  `;
}

function renderAppointmentTable() {
  const today = getISODate(0);
  const appointments = getAppointments()
    .filter(
      ({ appointment }) =>
        appointment.date >= today &&
        (activeAppointmentFilter === "all" ||
          appointment.date ===
            getISODate(activeAppointmentFilter === "today" ? 0 : 1)) &&
        appointmentMatchesSearch(appointment),
    )
    .sort((a, b) => {
      const dateOrder = a.appointment.date.localeCompare(b.appointment.date);
      if (dateOrder !== 0)
        return activeAppointmentSort === "recent" ? dateOrder : -dateOrder;

      const timeOrder =
        toMinutes(a.appointment.time) - toMinutes(b.appointment.time);
      return activeAppointmentSort === "recent" ? timeOrder : -timeOrder;
    });
  const container = document.querySelector("#all-appointments");
  if (!container) return;

  container.innerHTML = appointments.length
    ? appointments
        .map(({ appointment, index, source }) =>
          appointmentCardMarkup(appointment, index, source),
        )
        .join("")
    : `<p class="empty-state">No hay citas para este filtro.</p>`;
}

function renderLists() {
  rebuildAppointmentCollections(
    getAppointments().map(({ appointment }) => appointment),
  );
  const todayList = document.querySelector("#today-list");
  const tomorrowList = document.querySelector("#tomorrow-list");
  const visibleTodayAppointments = todayAppointments
    .filter(
      (appointment) =>
        (appointment.status !== "Finalizada" ||
          appointment.id === followUpAppointmentId) &&
        (appointment.status !== "Cancelada" ||
          appointment.id === rescheduleAppointmentId),
    )
    .filter(appointmentMatchesSearch);
  const visibleTomorrowAppointments = tomorrowAppointments
    .filter((appointment) => appointment.status !== "Cancelada")
    .filter(appointmentMatchesSearch);

  if (todayList) {
    todayList.innerHTML = visibleTodayAppointments.length
      ? visibleTodayAppointments.map(todayMarkup).join("")
      : '<p class="dashboard-empty-state" role="status">No hay citas para hoy.</p>';
  }
  if (tomorrowList) {
    tomorrowList.innerHTML = visibleTomorrowAppointments.length
      ? visibleTomorrowAppointments.map(tomorrowMarkup).join("")
      : '<p class="dashboard-empty-state" role="status">No hay citas para mañana.</p>';
  }

  renderAppointmentTable();
  renderPatientDirectory(globalSearchQuery);

  const todayCount = document.querySelector("#today-count");
  if (todayCount) {
    todayCount.textContent = todayAppointments.filter(
      (appointment) =>
        (appointment.status !== "Finalizada" ||
          appointment.id === followUpAppointmentId) &&
        (appointment.status !== "Cancelada" ||
          appointment.id === rescheduleAppointmentId),
    ).length;
  }

  updateDashboardIncome();
  updateAttendedCount();
  renderDashboardCalendar();
  renderFinanceModule?.();
}

function updateDashboardIncome() {
  const incomeElement = document.querySelector("#today-income");
  if (!incomeElement) return;

  const today = getISODate(0);
  const total = patients.reduce((sum, patient) => {
    const paymentsToday = (patient.historialFinanciero || []).filter(
      (payment) => payment.fecha === today,
    );
    return (
      sum +
      paymentsToday.reduce(
        (paymentSum, payment) => paymentSum + getNumericAmount(payment.monto),
        0,
      )
    );
  }, 0);
  incomeElement.textContent = formatCurrency(total);
}

function updateAttendedCount() {
  const element = document.querySelector("#attended-count");
  if (!element) return;

  const count = todayAppointments.filter(
    (a) => a.status === "Finalizada",
  ).length;
  element.textContent = String(count);
}

function openModal(index = null) {
  const modal = document.querySelector("#appointment-modal");
  const patientInput = document.querySelector("#modal-patient");
  const patientIdInput = document.querySelector("#modal-patient-id");
  const motiveInput = document.querySelector("#modal-motive");
  const amountInput = document.querySelector("#modal-amount");
  const dateInput = document.querySelector("#modal-date");
  const timeInput = document.querySelector("#modal-time");

  if (
    !modal ||
    !patientInput ||
    !motiveInput ||
    !amountInput ||
    !dateInput ||
    !timeInput
  )
    return;
  selectedPatientId = null;
  editingAppointment = null;
  hidePatientSuggestions();

  if (patientIdInput) patientIdInput.value = "";

  if (index === null || index === undefined) {
    patientInput.value = "";
    patientInput.readOnly = false;
    patientInput.placeholder = "Escribe el nombre del paciente";
    patientInput.removeAttribute("data-patient-selected");
    setAppointmentMotive();
    amountInput.value = "";
    dateInput.value = getISODate(0);
    dateInput.min = getISODate(0);
    renderAppointmentCalendar(true);
    document.querySelector("#modal-title").textContent = "Agendar cita";
  } else {
    const appointment = todayAppointments[index];
    if (!appointment) return;
    ensureAppointmentId(appointment);
    if (rescheduleAppointmentId === appointment.id) {
      editingAppointment = { source: "today", index, id: appointment.id };
    }

    const patient = resolveAppointmentPatient(appointment);
    selectedPatientId = patient?.id || null;

    patientInput.value = patient
      ? getPatientFullName(patient)
      : appointment.name;
    patientInput.readOnly = true;
    patientInput.placeholder = "";
    patientInput.setAttribute(
      "data-patient-selected",
      patient?.id ? "true" : "false",
    );

    if (patientIdInput)
      patientIdInput.value = patient?.id || appointment.patientId || "";

    setAppointmentMotive(sanitizeReason(appointment.reason));
    amountInput.value = "";

    dateInput.value = getISODate(1);
    dateInput.min = getISODate(0);
    renderAppointmentCalendar(true);
    document.querySelector("#modal-title").textContent = "Agendar cita";
  }
  document.querySelector("#appointment-modal .modal-copy").textContent =
    "Completa los datos para agendar o actualizar una cita.";
  refreshAppointmentTimeSlots(
    index === null || index === undefined ? "09:00" : "",
  );

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  lockPageScroll();
}

function editAppointment(source, index) {
  const list = getAppointmentList(source);
  const appointment = list[index];
  if (!appointment) return;
  ensureAppointmentId(appointment);

  editingAppointment = { source, index, id: appointment.id };
  const patient = resolveAppointmentPatient(appointment);
  selectedPatientId = patient?.id || null;

  const patientInput = document.querySelector("#modal-patient");
  const patientIdInput = document.querySelector("#modal-patient-id");
  const motiveInput = document.querySelector("#modal-motive");
  const amountInput = document.querySelector("#modal-amount");
  const dateInput = document.querySelector("#modal-date");
  const timeInput = document.querySelector("#modal-time");

  if (!patientInput || !motiveInput || !amountInput || !dateInput || !timeInput)
    return;

  hidePatientSuggestions();
  patientInput.value = patient ? getPatientFullName(patient) : appointment.name;
  patientInput.readOnly = true;
  patientInput.placeholder = "";
  patientInput.setAttribute(
    "data-patient-selected",
    patient?.id ? "true" : "false",
  );

  if (patientIdInput)
    patientIdInput.value = patient?.id || appointment.patientId || "";

  setAppointmentMotive(sanitizeReason(appointment.reason));
  const amount = getNumericAmount(appointment.total ?? appointment.balance);
  amountInput.value = String(amount);

  dateInput.value = appointment.date || getISODate(0);
  dateInput.min = getISODate(0);
  renderAppointmentCalendar(true);
  refreshAppointmentTimeSlots(toInputTime(appointment.time));

  document.querySelector("#modal-title").textContent = "Agendar cita";
  document.querySelector("#appointment-modal .modal-copy").textContent =
    "Completa los datos para agendar o actualizar una cita.";

  const modal = document.querySelector("#appointment-modal");
  if (!modal) return;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  lockPageScroll();
}

function closeModal() {
  const modal = document.querySelector("#appointment-modal");
  if (!modal) return;

  hidePatientSuggestions();
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");

  editingAppointment = null;
  rescheduleAppointmentId = null;
  selectedPatientId = null;

  const patientIdInput = document.querySelector("#modal-patient-id");
  if (patientIdInput) patientIdInput.value = "";

  updatePageScrollLock();
}

async function deleteAppointment(appointmentId) {
  const appointment = getAppointments().find(
    ({ appointment: item }) => item.id === appointmentId,
  )?.appointment;
  if (!appointment) return;

  const patientName = appointment.name;
  const { confirmed } = await showConfirmationDialog({
    title: "¿Eliminar esta cita?",
    message: `Se eliminará la cita de ${patientName}. Esta acción no se puede deshacer.`,
    confirmLabel: "Eliminar cita",
  });
  if (!confirmed) return;

  const patient = resolveAppointmentPatient(appointment);
  removeAppointmentById(appointmentId);
  saveAppointments();
  renderLists();
  refreshPatientDetails(patient);
  showToast(`Cita de ${patientName} eliminada.`);
}

function updateAppointmentStatus(appointmentId, status) {
  const item = getAppointments().find(
    ({ appointment }) => appointment.id === appointmentId,
  );
  if (!item) return;
  const todayIndex = todayAppointments.findIndex((a) => a.id === appointmentId);
  if (item.appointment.status === status) {
    if (status === "Finalizada") {
      followUpAppointmentId = appointmentId;
      if (rescheduleAppointmentId === appointmentId)
        rescheduleAppointmentId = null;
      openPaymentReceipt(appointmentId);
    } else if (status === "Cancelada" && todayIndex !== -1) {
      rescheduleAppointmentId = appointmentId;
      openModal(todayIndex);
    }
    return;
  }

  const patient = resolveAppointmentPatient(item.appointment);

  if (status === "Finalizada") {
    followUpAppointmentId = appointmentId;
    if (rescheduleAppointmentId === appointmentId)
      rescheduleAppointmentId = null;
    openPaymentReceipt(appointmentId);
    return;
  }
  item.appointment.status = status;
  if (status === "Cancelada") {
    rescheduleAppointmentId = appointmentId;
    if (followUpAppointmentId === appointmentId) followUpAppointmentId = null;
    saveAppointments();
    renderLists();
    refreshPatientDetails(patient);
    if (todayIndex !== -1) openModal(todayIndex);
    return;
  }
  if (status === "En espera") {
    if (followUpAppointmentId === appointmentId) followUpAppointmentId = null;
    if (rescheduleAppointmentId === appointmentId)
      rescheduleAppointmentId = null;
  }
  saveAppointments();
  renderLists();
  refreshPatientDetails(patient);
  showToast(`Cita marcada como ${status}.`);
}

function changePage(page, appointmentFilter = null) {
  if (!pages[page]) return;
  if (!canAccessPage(page)) {
    showToast("No tienes permiso para acceder a este módulo.");
    return;
  }

  if (page === "citas" && appointmentFilter) {
    activeAppointmentFilter = appointmentFilter;
    const dateFilter = document.querySelector("#appointment-date-filter");
    if (dateFilter) dateFilter.value = appointmentFilter;
  }

  document
    .querySelectorAll(".app-page")
    .forEach((el) => el.classList.toggle("active", el.id === `page-${page}`));
  document
    .querySelectorAll("[data-page-link]")
    .forEach((el) =>
      el.classList.toggle("active", el.dataset.pageLink === page),
    );

  const title = document.querySelector("#page-title");
  if (title) title.textContent = pages[page][0];

  if (page === "pacientes") renderPatientDirectory();
  if (page === "citas") renderAppointmentTable();
  if (page === "administrar") loadManagedUsers();
  if (page === "configuracion") renderConfigurationModule?.();
  if (page === "cobros") renderFinanceModule?.();

  if (
    !document.querySelector("#patient-modal.open") &&
    !document.querySelector("#appointment-modal.open")
  ) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
