function openPaymentReceipt(appointmentId) {
  const appointmentData = getAppointments().find(
    ({ appointment }) => appointment.id === appointmentId,
  );
  if (!appointmentData) {
    showToast("La cita seleccionada ya no existe.");
    return;
  }

  const appointment = appointmentData.appointment;
  const patient = resolveAppointmentPatient(appointment);
  if (!patient) {
    showToast("No se encontró el expediente del paciente.");
    return;
  }

  const modal = document.querySelector("#payment-receipt-modal");
  if (!modal) return;

  const totalAmount = getNumericAmount(
    appointment.total ?? appointment.balance,
  );
  const balanceAmount = getNumericAmount(appointment.balance);
  const paidAmount = Math.max(totalAmount - balanceAmount, 0);
  const patientName = getPatientFullName(patient) || appointment.name;

  setFieldValue("#receipt-appointment-id", appointmentId);
  setFieldValue("#receipt-patient", patientName);
  setFieldValue(
    "#receipt-appointment-date",
    formatDisplayDate(appointment.date),
  );
  setFieldValue("#receipt-treatment", appointment.reason || "Consulta");
  setFieldValue("#receipt-total", formatCurrency(totalAmount));
  setFieldValue("#receipt-balance", formatCurrency(balanceAmount));

  updatePaymentReceiptSummary();
  const previousDisplay = document.querySelector("#receipt-previous-display");
  if (previousDisplay)
    previousDisplay.textContent = formatCurrency(
      getPatientPendingAppointments(patient)
        .filter((item) => item.id !== appointment.id)
        .reduce((sum, item) => sum + getNumericAmount(item.balance), 0),
    );

  setFieldValue("#receipt-payment-date", getISODate(0));
  setFieldValue("#receipt-reference", "");
  setFieldValue("#receipt-notes", "");

  const paymentStatus = document.querySelector("#receipt-payment-status");
  const paymentAmount = document.querySelector("#receipt-payment-amount");

  if (balanceAmount <= 0) {
    if (paymentStatus) paymentStatus.value = "Completo";
    if (paymentAmount) paymentAmount.value = "0";
  } else {
    if (paymentStatus) paymentStatus.value = "Parcial";
    if (paymentAmount) paymentAmount.value = String(balanceAmount);
  }

  setFieldValue("#receipt-payment-method", "Efectivo");
  updatePaymentReceiptAmountState();

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  lockPageScroll();
}

function updatePaymentReceiptAmountState() {
  const status = document.querySelector("#receipt-payment-status");
  const amount = document.querySelector("#receipt-payment-amount");
  if (!status || !amount) return;

  if (status.value === "No pagado") {
    amount.value = "0";
    amount.readOnly = true;
  } else {
    amount.readOnly = false;
  }
}

function closePaymentReceipt() {
  const modal = document.querySelector("#payment-receipt-modal");
  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");

  const form = document.querySelector("#payment-receipt-form");
  if (form) form.reset();
  followUpAppointmentId = null;

  updatePageScrollLock();
}

function createPaymentReceiptModal() {
  if (document.querySelector("#payment-receipt-modal")) return;

  const modal = document.createElement("div");
  modal.id = "payment-receipt-modal";
  modal.className = "modal-backdrop";
  modal.setAttribute("aria-hidden", "true");

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
          <div><small>Costo de esta cita</small><strong id="receipt-total-display">$0</strong></div>
          <div><small>Saldo de citas anteriores</small><strong id="receipt-previous-display">$0</strong></div>
        </div>
        <input type="hidden" id="receipt-total">
        <input type="hidden" id="receipt-balance">
        <div class="payment-receipt-fields">
          <label>
            <span>Monto recibido*</span>
            <input type="number" id="receipt-payment-amount" min="0" step="0.01" placeholder="0.00" required>
            <small>Si pagas más que esta cita, el resto abona a saldos anteriores. Con $0 el saldo queda pendiente para la próxima cita.</small>
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

function getPatientPendingAppointments(patient) {
  return getPatientAppointments(patient)
    .filter(
      (item) =>
        item.status !== "Cancelada" && getNumericAmount(item.balance) > 0,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || toMinutes(a.time) - toMinutes(b.time),
    );
}

function allocatePatientPayment(patient, appointment, amount) {
  let remaining = amount;
  const allocations = [];
  [
    appointment,
    ...getPatientPendingAppointments(patient).filter(
      (item) => item.id !== appointment.id,
    ),
  ].forEach((item) => {
    const applied = Math.min(getNumericAmount(item.balance), remaining);
    if (applied > 0) {
      allocations.push({ appointment: item, amount: applied });
      remaining = Math.round((remaining - applied) * 100) / 100;
    }
  });
  return allocations;
}

async function recordPaymentSafely({
  appointmentId,
  amount,
  method,
  paidOn,
  reference,
  notes,
  finalize,
}) {
  if (!isCloudConnected()) return false;
  const { error } = await supabaseClient.rpc("record_payment", {
    p_appointment_id: appointmentId,
    p_amount: amount,
    p_method: method,
    p_paid_on: paidOn || null,
    p_reference: reference || null,
    p_notes: notes || null,
    p_finalize: Boolean(finalize),
  });
  if (error) throw error;
  await connectToCloud();
  return true;
}

function updatePaymentReceiptSummary() {
  const total = document.querySelector("#receipt-total");
  const totalDisplay = document.querySelector("#receipt-total-display");

  if (totalDisplay)
    totalDisplay.textContent = formatCurrency(total?.value || 0);
}
