function setMobileNavigation(open) {
  const navigation = document.querySelector("#mobile-navigation");
  const toggle = document.querySelector("#mobile-nav-toggle");
  const scrim = document.querySelector("#mobile-nav-scrim");
  if (!navigation || !toggle || !scrim) return;
  document.body.classList.toggle("mobile-nav-open", open);
  navigation.setAttribute("aria-hidden", String(!open));
  toggle.setAttribute("aria-expanded", String(open));
  scrim.setAttribute("aria-hidden", String(!open));
  scrim.tabIndex = open ? 0 : -1;
  if (open) document.querySelector("#mobile-nav-close")?.focus();
  else toggle.focus();
}

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    document.body.classList.contains("mobile-nav-open")
  )
    setMobileNavigation(false);
});

document.addEventListener("submit", async (event) => {
  if (event.target.matches("#payment-receipt-form")) {
    event.preventDefault();

    const appointmentId = document.querySelector(
      "#receipt-appointment-id",
    )?.value;
    const paymentStatus = document.querySelector(
      "#receipt-payment-status",
    )?.value;
    const paymentAmountInput = document.querySelector(
      "#receipt-payment-amount",
    );
    const paymentDate = document.querySelector("#receipt-payment-date")?.value;
    const paymentMethod = document.querySelector(
      "#receipt-payment-method",
    )?.value;
    const reference = document
      .querySelector("#receipt-reference")
      ?.value.trim();
    const notes = document.querySelector("#receipt-notes")?.value.trim();

    if (!appointmentId) {
      showToast("No se identificó la cita.");
      return;
    }
    if (
      !paymentAmountInput?.value ||
      !Number.isFinite(Number(paymentAmountInput.value)) ||
      Number(paymentAmountInput.value) < 0
    ) {
      showToast("Ingresa un monto recibido válido.");
      return;
    }
    if (!paymentMethod) {
      showToast("Selecciona la forma de pago.");
      return;
    }

    const appointmentData = getAppointments().find(
      ({ appointment }) => appointment.id === appointmentId,
    );
    if (!appointmentData) {
      showToast("La cita ya no existe.");
      closePaymentReceipt();
      return;
    }

    const appointment = appointmentData.appointment;
    const patient = resolveAppointmentPatient(appointment);

    if (!patient) {
      showToast("No se encontró el paciente de la cita.");
      return;
    }
    if (!paymentDate) {
      showToast("Selecciona la fecha del pago.");
      return;
    }

    const totalAmount = getNumericAmount(
      appointment.total ?? appointment.balance,
    );
    const currentBalance = getNumericAmount(appointment.balance);
    const paymentAmount = getNumericAmount(paymentAmountInput.value);
    const previousPending = getPatientPendingAppointments(patient)
      .filter((item) => item.id !== appointment.id)
      .reduce((sum, item) => sum + getNumericAmount(item.balance), 0);
    if (paymentAmount > currentBalance + previousPending + 0.001) {
      showToast(
        `El monto supera el saldo pendiente del paciente (${formatCurrency(currentBalance + previousPending)}).`,
      );
      return;
    }

    const shouldScheduleFollowUp = followUpAppointmentId === appointmentId;
    if (isCloudConnected() && paymentAmount > 0) {
      try {
        await recordPaymentSafely({
          appointmentId,
          amount: paymentAmount,
          method: paymentMethod,
          paidOn: paymentDate,
          reference,
          notes,
          finalize: shouldScheduleFollowUp,
        });
      } catch (error) {
        console.error("No se pudo registrar el pago:", error);
        showToast(
          error.message?.includes("overpayment")
            ? "El monto excede el saldo pendiente actual."
            : "No se pudo registrar el pago. Verifica el saldo e inténtalo de nuevo.",
        );
        return;
      }
      closePaymentReceipt();
      if (shouldScheduleFollowUp) {
        showToast(
          `Pago de ${formatCurrency(paymentAmount)} registrado. Agenda la siguiente cita.`,
        );
        const currentIndex = todayAppointments.findIndex(
          (item) => item.id === appointmentId,
        );
        if (currentIndex !== -1) openModal(currentIndex);
      } else {
        showToast(
          `Pago de ${formatCurrency(paymentAmount)} registrado correctamente.`,
        );
      }
      return;
    }

    allocatePatientPayment(patient, appointment, paymentAmount).forEach(
      ({ appointment: item, amount }) => {
        const itemTotal = getNumericAmount(item.total ?? item.balance);
        const before = getNumericAmount(item.balance);
        const after = Math.max(Math.round((before - amount) * 100) / 100, 0);
        item.balance = after;
        item.total = itemTotal;
        item.paid =
          Math.round((getNumericAmount(item.paid) + amount) * 100) / 100;
        item.paymentStatus = after <= 0 ? "Completo" : "Parcial";
        if (!Array.isArray(patient.historialFinanciero))
          patient.historialFinanciero = [];
        patient.historialFinanciero.push({
          id: generateId("payment"),
          fecha: paymentDate,
          monto: amount,
          concepto: item.reason || "Pago de consulta",
          metodo: paymentMethod,
          estado: item.paymentStatus,
          citaId: item.id,
          fechaCita: item.date,
          referencia: reference,
          notas: notes,
          saldoAnterior: before,
          saldoRestante: after,
          montoTotal: itemTotal,
          createdAt: new Date().toISOString(),
        });
      },
    );

    if (shouldScheduleFollowUp) appointment.status = "Finalizada";

    if (event.submitter?.id === "payment-receipt-whatsapp") {
      const pendingAfter = getPatientPendingAppointments(patient).reduce(
        (sum, item) => sum + getNumericAmount(item.balance),
        0,
      );
      const receiptMessage = [
        "____________________________",
        "RECIBO DE PAGO",
        `Paciente: ${getPatientFullName(patient) || appointment.name}`,
        `Fecha de la cita: ${formatDisplayDate(appointment.date)}`,
        `Motivo: ${appointment.reason || "Consulta"}`,
        `Costo de la cita: ${formatCurrency(totalAmount)}`,
        `Pago recibido: ${formatCurrency(paymentAmount)} (${paymentMethod})`,
        `Saldo pendiente total: ${formatCurrency(pendingAfter)}`,
      ].join("\n");
      const phone = /^\d{10}$/.test(patient.telefono)
        ? `52${patient.telefono}`
        : "";
      const whatsappWindow = window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(receiptMessage)}`,
        "_blank",
      );
      if (!whatsappWindow)
        showToast("Permite las ventanas emergentes para abrir WhatsApp.");
    }
    closePaymentReceipt();
    savePatients();
    saveAppointments();
    renderLists();
    refreshPatientDetails(patient);

    if (shouldScheduleFollowUp) {
      const todayIndex = todayAppointments.findIndex(
        (item) => item.id === appointmentId,
      );
      showToast(
        paymentAmount > 0
          ? `Pago de ${formatCurrency(paymentAmount)} registrado. Agenda la siguiente cita.`
          : "Recibo registrado. Agenda la siguiente cita.",
      );
      if (todayIndex !== -1) openModal(todayIndex);
      return;
    }
    showToast(
      paymentAmount > 0
        ? `Pago de ${formatCurrency(paymentAmount)} registrado correctamente.`
        : "Recibo registrado sin pago.",
    );
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("#receipt-payment-status")) {
    updatePaymentReceiptAmountState();
  }
  if (event.target.matches("#backup-restore-file")) {
    restoreSystemBackup(event.target.files?.[0]);
    event.target.value = "";
  }
});

document.addEventListener("click", async (event) => {
  if (event.target.closest("#mobile-nav-toggle")) {
    setMobileNavigation(true);
    return;
  }
  if (
    event.target.closest("#mobile-nav-close") ||
    event.target.closest("#mobile-nav-scrim")
  ) {
    setMobileNavigation(false);
    return;
  }
  if (event.target.closest("#backup-download")) {
    await downloadSystemBackup();
    return;
  }
  if (event.target.closest("#system-reset")) {
    await resetSystemData();
    return;
  }

  if (event.target.closest("[data-patient-back]")) {
    selectedPatientId = null;
    const layout = document.querySelector(".patient-directory-layout");
    const details = document.querySelector("#patient-details");
    layout?.classList.remove("is-detail-open");
    if (details)
      details.innerHTML =
        '<span class="large-module-icon" aria-hidden="true">◷</span><h2>Selecciona un paciente</h2><p>Su expediente, información y próximas citas aparecerán aquí.</p>';
    return;
  }

  const patientFolderTab = event.target.closest("[data-patient-tab]");
  if (patientFolderTab) {
    const details = patientFolderTab.closest("#patient-details");
    const section = patientFolderTab.dataset.patientTab;
    if (!details || !section) return;
    details.querySelectorAll("[data-patient-tab]").forEach((tab) => {
      const isActive = tab === patientFolderTab;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });
    details.querySelectorAll("[data-patient-panel]").forEach((panel) => {
      const isActive = panel.dataset.patientPanel === section;
      panel.hidden = !isActive;
      panel.classList.toggle("active", isActive);
    });
    return;
  }

  const agendaBookButton = event.target.closest("[data-agenda-book]");
  if (agendaBookButton) {
    const { agendaBook: date, agendaTime: time } = agendaBookButton.dataset;
    if (date < getISODate(0)) {
      showToast("No se pueden agendar citas en fechas pasadas.");
      return;
    }
    if (isAppointmentTimeInPast(date, time)) {
      showToast("Selecciona un horario a partir de la hora actual.");
      return;
    }
    closeDailyAgenda();
    openModal();
    const dateInput = document.querySelector("#modal-date");
    const timeInput = document.querySelector("#modal-time");
    if (dateInput) dateInput.value = date;
    renderAppointmentCalendar(true);
    refreshAppointmentTimeSlots(time);
    if (timeInput) timeInput.value = time;
    return;
  }

  const agendaBlockButton = event.target.closest("[data-agenda-block]");
  if (agendaBlockButton) {
    const { agendaBlock: date, agendaTime: time } = agendaBlockButton.dataset;
    const appointmentCount = getCalendarAppointments(date).filter(
      (appointment) =>
        toInputTime(appointment.time) === time &&
        appointment.status !== "Cancelada",
    ).length;
    const remainingPlaces = Math.max(
      MAX_PATIENTS_PER_SLOT -
        appointmentCount -
        getBlockedAppointmentSlotCount(date, time),
      0,
    );
    if (!remainingPlaces) return;
    const { confirmed, value: placesToBlock } = await showConfirmationDialog({
      title: "Marcar horario como no disponible",
      message: `El horario de las ${formatTimeFromInput(time)} tiene ${remainingPlaces} ${remainingPlaces === 1 ? "lugar disponible" : "lugares disponibles"}.`,
      confirmLabel: "Marcar como ocupado",
      input: {
        label: `¿Cuántos lugares deseas bloquear? (1-${remainingPlaces})`,
        min: 1,
        max: remainingPlaces,
        value: 1,
      },
    });
    if (!confirmed) return;
    const existingBlockedSlot = blockedAppointmentSlots.find(
      (slot) => slot.date === date && slot.time === time,
    );
    if (existingBlockedSlot)
      existingBlockedSlot.count =
        getBlockedAppointmentSlotCount(date, time) + placesToBlock;
    else blockedAppointmentSlots.push({ date, time, count: placesToBlock });
    if (saveBlockedAppointmentSlots()) {
      openDailyAgenda(date);
      showToast(
        `${placesToBlock} ${placesToBlock === 1 ? "lugar marcado" : "lugares marcados"} como ocupado${placesToBlock === 1 ? "" : "s"} a las ${formatTimeFromInput(time)}.`,
      );
    } else {
      if (existingBlockedSlot) existingBlockedSlot.count -= placesToBlock;
      else blockedAppointmentSlots.pop();
    }
    return;
  }

  const agendaUnblockButton = event.target.closest("[data-agenda-unblock]");
  if (agendaUnblockButton) {
    const { agendaUnblock: date, agendaTime: time } =
      agendaUnblockButton.dataset;
    const previousSlots = blockedAppointmentSlots.map((slot) => ({ ...slot }));
    const slotIndex = blockedAppointmentSlots.findIndex(
      (slot) => slot.date === date && slot.time === time,
    );
    const blockedSlot = blockedAppointmentSlots[slotIndex];
    if (blockedSlot && getBlockedAppointmentSlotCount(date, time) > 1)
      blockedSlot.count = getBlockedAppointmentSlotCount(date, time) - 1;
    else if (slotIndex >= 0) blockedAppointmentSlots.splice(slotIndex, 1);
    if (saveBlockedAppointmentSlots()) {
      openDailyAgenda(date);
      showToast(`Se liberó 1 lugar a las ${formatTimeFromInput(time)}.`);
    } else {
      blockedAppointmentSlots = previousSlots;
    }
    return;
  }

  const calendarDay = event.target.closest("[data-calendar-date]");
  if (calendarDay) {
    openDailyAgenda(calendarDay.dataset.calendarDate);
    return;
  }

  if (event.target.closest("#daily-agenda-close")) {
    closeDailyAgenda();
    return;
  }

  const appointmentCalendarMonth = event.target.closest(
    "[data-appointment-calendar-month]",
  );
  if (appointmentCalendarMonth) {
    const daysHost = document.querySelector("#appointment-calendar-days");
    const direction = Number(
      appointmentCalendarMonth.dataset.appointmentCalendarMonth,
    );
    const [year, month] = (daysHost?.dataset.month || "")
      .split("-")
      .map(Number);
    if (!daysHost || !year || !month || ![-1, 1].includes(direction)) return;
    const nextMonth = new Date(year, month - 1 + direction, 1, 12);
    const currentDate = new Date(`${getISODate(0)}T12:00:00`);
    const currentMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
      12,
    );
    if (nextMonth < currentMonth) return;
    daysHost.dataset.month = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
    renderAppointmentCalendar();
    document
      .querySelector(`[data-appointment-calendar-month="${direction}"]`)
      ?.focus();
    return;
  }

  const appointmentCalendarDay = event.target.closest(
    "[data-appointment-date]",
  );
  if (appointmentCalendarDay && !appointmentCalendarDay.disabled) {
    const dateInput = document.querySelector("#modal-date");
    if (!dateInput) return;
    dateInput.value = appointmentCalendarDay.dataset.appointmentDate;
    renderAppointmentCalendar();
    refreshAppointmentTimeSlots(
      document.querySelector("#modal-time")?.value || "",
    );
    return;
  }

  const appointmentTime = event.target.closest("[data-appointment-time]");
  if (appointmentTime && !appointmentTime.disabled) {
    const timeSelect = document.querySelector("#modal-time");
    if (timeSelect) {
      timeSelect.value = appointmentTime.dataset.appointmentTime;
      refreshAppointmentTimeSlots(timeSelect.value);
      document
        .querySelector(`[data-appointment-time="${timeSelect.value}"]`)
        ?.focus();
    }
    return;
  }

  if (!event.target.closest(".search")) {
    renderGlobalPatientSearch("");
  }

  const globalPatientResult = event.target.closest("[data-global-patient-id]");
  if (globalPatientResult) {
    openPatientRecordFromSearch(globalPatientResult.dataset.globalPatientId);
    return;
  }

  const viewClinicalFileButton = event.target.closest(
    "[data-view-clinical-file]",
  );
  if (viewClinicalFileButton) {
    const fileId = viewClinicalFileButton.dataset.viewClinicalFile;
    const fileName = viewClinicalFileButton.dataset.fileName || "archivo";
    const pendingFile = pendingClinicalFiles.find(
      (item) => item.id === fileId,
    )?.file;
    const viewWindow = window.open("", "_blank");
    if (!viewWindow) {
      showToast("Permite las ventanas emergentes para ver el archivo.");
      return;
    }
    viewWindow.opener = null;

    const openFile = async () => {
      try {
        const file = pendingFile || (await getClinicalFile(fileId));
        if (!file) {
          viewWindow.close();
          showToast(
            `No está disponible el contenido de "${fileName}". Vuelve a adjuntarlo para poder verlo.`,
          );
          return;
        }
        const fileUrl = URL.createObjectURL(file);
        if (SAFE_PREVIEW_TYPES.includes(file.type)) {
          viewWindow.location.href = fileUrl;
        } else {
          viewWindow.close();
          const link = document.createElement("a");
          link.href = fileUrl;
          link.download = fileName;
          link.click();
        }
        window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
      } catch (error) {
        console.error(`No se pudo abrir el archivo "${fileName}":`, error);
        viewWindow.close();
        showToast("No se pudo abrir el archivo.");
      }
    };
    openFile();
    return;
  }

  if (event.target.closest("#add-clinical-files")) {
    document.querySelector("#clinical-files")?.click();
    return;
  }

  if (event.target.closest("#add-clinical-service")) {
    const container = document.querySelector("#clinical-services-list");
    if (container) {
      container.append(createClinicalServiceRow({}, true));
    }
    return;
  }

  const removeClinicalService = event.target.closest(
    ".clinical-service-remove",
  );
  if (removeClinicalService) {
    removeClinicalService.closest(".clinical-service-row").remove();
    return;
  }
  const appointmentPatientField = event.target.closest(".patient-search-field");
  if (
    !appointmentPatientField &&
    !event.target.closest("#modal-patient-suggestions")
  ) {
    hidePatientSuggestions();
  }

  const aptPatientOption = event.target.closest(
    "[data-appointment-patient-id]",
  );
  if (aptPatientOption) {
    selectAppointmentPatient(aptPatientOption.dataset.appointmentPatientId);
    return;
  }

  const editBtn = event.target.closest("[data-edit-appointment]");
  if (editBtn) {
    const found = getAppointments().find(
      ({ appointment }) => appointment.id === editBtn.dataset.editAppointment,
    );
    if (found) editAppointment(found.source, found.index);
    return;
  }

  const deleteBtn = event.target.closest("[data-delete-appointment]");
  if (deleteBtn) {
    await deleteAppointment(deleteBtn.dataset.deleteAppointment);
    return;
  }

  const patientInfoBtn = event.target.closest("[data-patient-info]");
  if (patientInfoBtn) {
    const ref = patientInfoBtn.dataset.patientInfo;
    changePage("pacientes");
    renderPatientDirectory();
    showPatientDetails(ref);
    document.querySelectorAll(".patient-list-item").forEach((item) => {
      item.classList.toggle("selected", item.dataset.selectPatient === ref);
    });
    return;
  }

  const appointmentNotesButton = event.target.closest(
    "[data-appointment-notes]",
  );
  if (appointmentNotesButton) {
    openAppointmentNotes(appointmentNotesButton.dataset.appointmentNotes);
    return;
  }

  if (event.target.closest("#appointment-notes-edit")) {
    const appointmentId = document.querySelector(
      "#appointment-notes-id",
    )?.value;
    const appointment = getAppointments().find(
      ({ appointment: item }) => item.id === appointmentId,
    )?.appointment;
    const observation = appointment?.observations?.[0];
    if (!appointment || !observation) {
      showToast("No se encontró el avance para editar.");
      return;
    }
    const form = document.querySelector("#appointment-notes-form");
    const modal = document.querySelector("#appointment-notes-modal");
    const history = document.querySelector("#appointment-notes-history");
    const notesInput = document.querySelector("#appointment-notes-text");
    if (!form || !modal || !history || !notesInput) return;
    form.dataset.editingObservation = "true";
    form.classList.remove("is-viewing-observation");
    modal.classList.remove("is-viewing-observation");
    history.hidden = true;
    notesInput.value = observation.text || "";
    document.querySelector("#appointment-notes-label").hidden = false;
    document.querySelector("#appointment-notes-save").hidden = false;
    document.querySelector("#appointment-notes-edit").hidden = true;
    document.querySelector("#appointment-notes-cancel-edit").hidden = false;
    document.querySelector("#appointment-notes-cancel").textContent = "Cerrar";
    notesInput.focus();
    return;
  }

  if (event.target.closest("#appointment-notes-cancel-edit")) {
    const appointmentId = document.querySelector(
      "#appointment-notes-id",
    )?.value;
    openAppointmentNotes(appointmentId);
    return;
  }

  const patientAppointmentsButton = event.target.closest(
    "[data-patient-appointments]",
  );
  if (patientAppointmentsButton) {
    openPatientAppointments(
      patientAppointmentsButton.dataset.patientAppointments,
    );
    return;
  }

  const patientItem = event.target.closest("[data-select-patient]");
  const removePatientService = event.target.closest(
    "[data-remove-patient-service]",
  );
  if (removePatientService) {
    removePatientClinicalService(
      removePatientService.dataset.removePatientService,
      Number(removePatientService.dataset.clinicalRecordIndex),
    );
    return;
  }

  if (patientItem) {
    showPatientDetails(patientItem.dataset.selectPatient);
    document.querySelectorAll(".patient-list-item").forEach((item) => {
      item.classList.toggle("selected", item === patientItem);
    });
    return;
  }

  if (event.target.closest("#new-appointment")) {
    openModal();
    return;
  }

  if (event.target.closest("#new-patient-dashboard")) {
    openPatientModal();
    return;
  }

  const editPatientBtn = event.target.closest("[data-edit-patient]");
  if (editPatientBtn) {
    openPatientModal(editPatientBtn.dataset.editPatient);
    return;
  }

  const qrButton = event.target.closest("[data-patient-qr]");
  if (qrButton) {
    await openPatientQr(qrButton.dataset.patientQr);
    return;
  }
  if (event.target.closest("#patient-qr-scan-open")) {
    openPatientQrScanner();
    return;
  }
  if (event.target.closest("#patient-qr-close")) {
    const modal = document.querySelector("#patient-qr-modal");
    modal?.classList.remove("open");
    modal?.setAttribute("aria-hidden", "true");
    updatePageScrollLock();
    return;
  }
  if (event.target.closest("#patient-qr-download")) {
    downloadPatientQr();
    return;
  }
  if (event.target.closest("#patient-qr-scanner-close")) {
    closePatientQrScanner();
    return;
  }
  if (event.target.closest("#patient-qr-camera")) {
    await startPatientQrCamera();
    return;
  }

  const deletePatientBtn = event.target.closest("[data-delete-patient]");
  if (deletePatientBtn) {
    await deletePatient(deletePatientBtn.dataset.deletePatient);
    return;
  }

  const dot = event.target.closest("[data-appointment-status]");
  if (dot) {
    updateAppointmentStatus(dot.dataset.appointmentStatus, dot.dataset.status);
    return;
  }

  const reminder = event.target.closest("[data-reminder]");
  if (reminder) {
    const msg = encodeURIComponent(
      `Hola ${reminder.dataset.reminder}, te recordamos que tienes una cita dental programada para el día de mañana a las ${reminder.dataset.reminderTime}. Agradecemos tu puntualidad. ¡Te esperamos!`,
    );
    const phone = reminder.dataset.reminderPhone;
    const whatsappWindow = window.open(
      `https://wa.me/${/^\d{10}$/.test(phone) ? "52" + phone : ""}?text=${msg}`,
      "_blank",
    );
    if (!whatsappWindow) {
      showToast("Permite las ventanas emergentes para abrir WhatsApp.");
      return;
    }
    showToast(`Recordatorio preparado para ${reminder.dataset.reminder}.`);
    return;
  }

  if (event.target.closest("#previous-month")) {
    changeCalendarMonth(-1);
    return;
  }

  if (event.target.closest("#next-month")) {
    changeCalendarMonth(1);
    return;
  }

  if (
    event.target.closest("#payment-receipt-close") ||
    event.target.closest("#payment-receipt-cancel")
  ) {
    closePaymentReceipt();
    return;
  }

  if (
    event.target.closest("#appointment-notes-close") ||
    event.target.closest("#appointment-notes-cancel")
  ) {
    closeAppointmentNotes();
    return;
  }

  if (
    event.target.closest("#patient-appointments-close") ||
    event.target.closest("#patient-appointments-cancel")
  ) {
    closePatientAppointments();
    return;
  }

  if (event.target.closest("#appointment-no-schedule")) {
    const rescheduledAppointmentId = rescheduleAppointmentId;
    const wasFollowingUp = Boolean(followUpAppointmentId);
    const cancelledAppointment = rescheduledAppointmentId
      ? getAppointments().find(
          ({ appointment }) => appointment.id === rescheduledAppointmentId,
        )?.appointment
      : null;
    const cancelledPatient = cancelledAppointment
      ? resolveAppointmentPatient(cancelledAppointment)
      : null;
    if (
      cancelledAppointment &&
      removeAppointmentById(rescheduledAppointmentId)
    ) {
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
      showToast("La cita cancelada se eliminó; no se agendó otra.");
    } else {
      if (wasFollowingUp) renderLists();
      showToast("No se agendó una nueva cita.");
    }
    return;
  }

  if (event.target.closest("#modal-close")) {
    closeModal();
    return;
  }

  if (
    event.target.closest("#patient-modal-close") ||
    event.target.closest("#patient-cancel")
  ) {
    closePatientModal();
    return;
  }

  const link = event.target.closest("[data-page-link]");
  if (link) {
    event.preventDefault();
    changePage(link.dataset.pageLink, link.dataset.appointmentFilter || null);
    if (document.body.classList.contains("mobile-nav-open"))
      setMobileNavigation(false);
    return;
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("#modal-motive")) {
    const customLabel = document.querySelector("#modal-motive-custom-label");
    const customInput = document.querySelector("#modal-motive-custom");
    const isCustom = event.target.value === "Otro";
    if (customLabel) customLabel.hidden = !isCustom;
    if (customInput) {
      customInput.required = isCustom;
      customInput.disabled = !isCustom;
      if (!isCustom) customInput.value = "";
    }
    return;
  }

  if (event.target.matches("#appointment-date-filter")) {
    activeAppointmentFilter = event.target.value;
    renderAppointmentTable();
    return;
  }

  if (event.target.matches("#appointment-sort-filter")) {
    activeAppointmentSort = event.target.value;
    renderAppointmentTable();
    return;
  }

  if (event.target.matches("#modal-date")) {
    refreshAppointmentTimeSlots(
      document.querySelector("#modal-time")?.value || "",
    );
    return;
  }

  if (event.target.matches(".clinical-service-select")) {
    const row = event.target.closest(".clinical-service-row");
    const customLabel = row?.querySelector(".clinical-service-custom");
    const customInput = row?.querySelector(".clinical-service-custom-input");
    const isCustom = event.target.value === "Otro...";
    if (customLabel) customLabel.hidden = !isCustom;
    if (customInput) {
      customInput.required = isCustom;
      if (!isCustom) customInput.value = "";
    }
    return;
  }
});

document.addEventListener("submit", async (event) => {
  if (!event.target.matches("#patient-qr-scanner-form")) return;
  event.preventDefault();
  await resolvePatientQr(document.querySelector("#patient-qr-manual")?.value);
});

document.addEventListener("click", (event) => {
  const dateInput = event.target.closest('input[type="date"]');
  if (
    dateInput &&
    !dateInput.disabled &&
    typeof dateInput.showPicker === "function"
  ) {
    try {
      dateInput.showPicker();
    } catch (error) {}
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.matches("#appointment-notes-form")) {
    event.preventDefault();
    const appointmentId = document.querySelector(
      "#appointment-notes-id",
    )?.value;
    const notesInput = document.querySelector("#appointment-notes-text");
    const observationText = notesInput?.value.trim();
    const notesForm = document.querySelector("#appointment-notes-form");
    const isEditingObservation =
      notesForm?.dataset.editingObservation === "true";
    const appointment = getAppointments().find(
      ({ appointment: item }) => item.id === appointmentId,
    )?.appointment;
    if (!appointment) {
      showToast("No se encontró la cita para guardar el avance.");
      closeAppointmentNotes();
      return;
    }
    if (
      Array.isArray(appointment.observations) &&
      appointment.observations.length &&
      !isEditingObservation
    ) {
      showToast("Esta cita ya tiene un avance registrado.");
      openAppointmentNotes(appointmentId);
      return;
    }
    if (!observationText) {
      showToast("Escribe el avance u observación antes de guardar.");
      return;
    }
    if (
      isEditingObservation &&
      Array.isArray(appointment.observations) &&
      appointment.observations.length
    ) {
      appointment.observations[0] = {
        ...appointment.observations[0],
        text: observationText,
        updatedAt: new Date().toISOString(),
      };
    } else {
      appointment.observations = [
        {
          id: generateId("observation"),
          text: observationText,
          createdAt: new Date().toISOString(),
        },
      ];
    }
    if (!saveAppointments()) return;
    renderLists();
    const patient = resolveAppointmentPatient(appointment);
    if (patient) {
      refreshPatientDetails(patient);
      document
        .querySelectorAll("[data-appointment-notes]")
        .forEach((button) => {
          if (button.dataset.appointmentNotes === appointmentId)
            button.textContent = "Ver avance";
        });
    }
    if (patient && document.querySelector("#patient-appointments-modal.open")) {
      renderPatientAppointmentsModal(patient.id);
    }
    closeAppointmentNotes();
    showToast("Avance registrado correctamente.");
    return;
  }

  if (!event.target.matches("#appointment-form")) return;
  event.preventDefault();

  const patientInput = document.querySelector("#modal-patient");
  const patientIdInput = document.querySelector("#modal-patient-id");
  const motiveInput = document.querySelector("#modal-motive");
  const customMotiveInput = document.querySelector("#modal-motive-custom");
  const amountInput = document.querySelector("#modal-amount");
  const dateInput = document.querySelector("#modal-date");
  const timeInput = document.querySelector("#modal-time");

  if (!patientInput || !motiveInput || !amountInput || !dateInput || !timeInput)
    return;

  if (motiveInput.value === "Otro" && !customMotiveInput?.value.trim()) {
    customMotiveInput?.focus();
    showToast("Especifica el motivo de la cita.");
    return;
  }

  const appointmentDate = dateInput.value;
  if (!appointmentDate) {
    document
      .querySelector("#appointment-calendar-days button:not(:disabled)")
      ?.focus();
    showToast("Selecciona la fecha de la cita.");
    return;
  }
  if (appointmentDate < getISODate(0)) {
    document
      .querySelector("#appointment-calendar-days button:not(:disabled)")
      ?.focus();
    showToast("No se pueden agendar citas en fechas pasadas.");
    return;
  }
  if (!timeInput.value) {
    showToast("Selecciona un horario disponible.");
    return;
  }
  if (isAppointmentTimeInPast(appointmentDate, timeInput.value)) {
    refreshAppointmentTimeSlots("");
    showToast("Selecciona un horario a partir de la hora actual.");
    return;
  }
  if (
    getAppointmentTimeSlotCount(appointmentDate, timeInput.value) >=
    MAX_PATIENTS_PER_SLOT
  ) {
    refreshAppointmentTimeSlots("");
    showToast(
      `Ese horario ya alcanzó el límite de ${MAX_PATIENTS_PER_SLOT} pacientes. Selecciona otro.`,
    );
    return;
  }

  if (!patientInput.value.trim()) {
    patientInput.focus();
    showToast("Ingresa el nombre del paciente.");
    return;
  }

  let patient = validateSelectedAppointmentPatient();
  if (!patient) return;

  if (
    patientHasAppointmentOnDate(
      patient,
      appointmentDate,
      editingAppointment?.id || null,
    )
  ) {
    showToast(
      `Este paciente ya tiene una cita registrada el ${formatDisplayDate(appointmentDate)}. Edita la cita existente para cambiarla.`,
    );
    return;
  }

  const treatment = sanitizeReason(getAppointmentMotive());
  const enteredAmount = getNumericAmount(amountInput.value);
  const totalAmount = enteredAmount;
  const balance = formatCurrency(enteredAmount);
  const initialPaidAmount = 0;
  const initialPaymentStatus = "No pagado";
  const formattedTime = formatTimeFromInput(timeInput.value);

  if (editingAppointment) {
    const appointmentData = getAppointments().find(
      ({ appointment }) => appointment.id === editingAppointment.id,
    );
    if (!appointmentData) {
      closeModal();
      showToast("La cita ya no existe.");
      return;
    }

    const appointment = appointmentData.appointment;
    const patientId = patient.id;
    const patientNameFinal = getPatientFullName(patient);
    const isRescheduling = rescheduleAppointmentId === appointment.id;

    const originalTotalAmount = enteredAmount;
    const updatedPaidAmount =
      appointment.paid !== undefined
        ? getNumericAmount(appointment.paid)
        : Math.max(
            getNumericAmount(appointment.total ?? appointment.balance) -
              getNumericAmount(appointment.balance),
            0,
          );
    const newBalance = Math.max(originalTotalAmount - updatedPaidAmount, 0);
    const updatedPaymentStatus =
      newBalance <= 0
        ? "Completo"
        : updatedPaidAmount > 0
          ? "Parcial"
          : "No pagado";

    const updatedAppointment = {
      ...appointment,
      time: formattedTime,
      name: patientNameFinal,
      reason: treatment,
      balance: newBalance,
      date: appointmentDate,
      status: isRescheduling ? "En espera" : appointment.status || "En espera",
      patientId,
      total: originalTotalAmount,
      paid: updatedPaidAmount,
      paymentStatus: updatedPaymentStatus,
    };

    removeAppointmentById(appointment.id);
    addAppointmentToDateCollection(updatedAppointment);
    if (isRescheduling) rescheduleAppointmentId = null;
    saveAppointments();
    renderLists();
    refreshPatientDetails(patient);
    closeModal();
    showToast(`Cita de ${patientNameFinal} actualizada.`);
    return;
  }

  const appointment = {
    id: generateId("appointment"),
    patientId: patient.id,
    name: getPatientFullName(patient),
    time: formattedTime,
    date: appointmentDate,
    reason: treatment,
    status: "En espera",
    total: totalAmount,
    paid: 0,
    balance: totalAmount,
    paymentStatus: "No pagado",
    observations: [],
  };

  rescheduleAppointmentId = null;
  addAppointmentToDateCollection(appointment, true);
  saveAppointments();
  renderLists();
  refreshPatientDetails(patient);
  closeModal();
  showToast(`Cita agendada para ${getPatientFullName(patient)}.`);
  selectedPatientId = null;
  if (patientIdInput) patientIdInput.value = "";
});

document.addEventListener("submit", (event) => {
  if (event.target.matches("#patient-form")) {
    event.preventDefault();
    const generateAppointment =
      event.submitter?.id === "patient-save-appointment";
    Promise.all(pendingClinicalFiles.map((item) => item.persistence))
      .then(() => savePatientForm(generateAppointment))
      .catch((error) => {
        console.error("No se pudieron guardar los archivos clínicos:", error);
        showToast(
          "No se pudieron guardar los archivos. Intenta adjuntarlos de nuevo.",
        );
      });
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("#patient-phone, #emergency-phone")) {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 10);
    return;
  }
  if (
    event.target.matches("#patient-name, #patient-lastname, #emergency-name")
  ) {
    event.target.value = event.target.value.replace(/[^\p{L}\p{M}'’. -]/gu, "");
    return;
  }
});

document.addEventListener("change", (event) => {
  if (!event.target.matches("#clinical-files")) return;
  const files = Array.from(event.target.files || []);
  files.forEach((file) => {
    const extension = file.name.split(".").pop().toLowerCase();
    if (
      !ALLOWED_FILE_EXTENSIONS.includes(extension) ||
      file.size > MAX_FILE_SIZE
    ) {
      showToast(
        `"${file.name}" no es válido (JPG, PNG, WEBP, PDF o Word; máx. 10 MB).`,
      );
      return;
    }
    const alreadySelected = pendingClinicalFiles.some(
      (existing) =>
        existing.file.name === file.name &&
        existing.file.size === file.size &&
        existing.file.type === file.type,
    );
    const alreadyAttached = (editingPatient?.archivosClinicos || []).some(
      (existing) =>
        existing.name === file.name &&
        existing.size === file.size &&
        existing.type === file.type,
    );
    if (!alreadySelected && !alreadyAttached) {
      const id = generateId("file");
      const persistence = storeClinicalFile(id, file);
      persistence.catch((error) => {
        console.error(`No se pudo guardar el archivo "${file.name}":`, error);
        showToast(`No se pudo preparar "${file.name}" para guardarlo.`);
      });
      pendingClinicalFiles.push({ id, file, persistence });
    }
  });
  renderSelectedFiles([
    ...(editingPatient?.archivosClinicos || []),
    ...pendingClinicalFiles.map(({ id, file }) => ({
      id,
      name: file.name,
      type: file.type,
      size: file.size,
    })),
  ]);
  const formScroll = document.querySelector("#patient-form-scroll");
  if (formScroll) {
    requestAnimationFrame(() => {
      formScroll.scrollTo({ top: formScroll.scrollHeight, behavior: "smooth" });
    });
  }
  event.target.value = "";
});

document.addEventListener("input", (event) => {
  if (!event.target.matches("#patient-search")) return;
  const value = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    setGlobalSearchQuery(value);
    applyGlobalSearch();
    renderGlobalPatientSearch(value);
  }, 150);
});

document.addEventListener("keydown", (event) => {
  if (
    event.key !== "Escape" ||
    document.querySelector("#confirmation-modal.open")
  )
    return;
  if (document.querySelector("#modal-patient-suggestions.open")) {
    hidePatientSuggestions();
    return;
  }
  const closers = [
    ["#patient-appointments-modal", closePatientAppointments],
    ["#appointment-notes-modal", closeAppointmentNotes],
    ["#daily-agenda-modal", closeDailyAgenda],
    ["#payment-receipt-modal", closePaymentReceipt],
    ["#appointment-modal", closeModal],
    ["#patient-modal", closePatientModal],
  ];
  const open = closers.find(([selector]) =>
    document.querySelector(`${selector}.open`),
  );
  if (open) open[1]();
});

window.addEventListener("storage", (event) => {
  if (
    ![
      PATIENTS_STORAGE_KEY,
      APPOINTMENTS_STORAGE_KEY,
      BLOCKED_SLOTS_STORAGE_KEY,
    ].includes(event.key)
  )
    return;
  initializeStorage();
  renderLists();
});
