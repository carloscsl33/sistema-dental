const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const appointmentSource = fs.readFileSync(path.join(projectRoot, 'js', 'appointments.js'), 'utf8');
const eventSource = fs.readFileSync(path.join(projectRoot, 'js', 'events.js'), 'utf8');
const migrationSource = fs.readFileSync(path.join(projectRoot, 'supabase', 'migrations', '20261111223000_protect_paid_appointments.sql'), 'utf8');

function createRuntime(appointment) {
  const calls = { paymentReceipts: [], toasts: [], saves: 0, confirmationRequests: 0 };
  const appointments = [appointment];
  const context = {
    appointments,
    todayAppointments: appointments,
    followUpAppointmentId: null,
    rescheduleAppointmentId: null,
    editingAppointment: null,
    selectedPatientId: null,
    getNumericAmount: value => Number(value) || 0,
    getAppointments: () => appointments.map((item, index) => ({ appointment: item, index, source: 'today' })),
    canManageAppointments: () => true,
    resolveAppointmentPatient: () => ({ id: 'patient-1', historialFinanciero: [] }),
    saveAppointments: () => { calls.saves += 1; return true; },
    renderLists: () => {},
    refreshPatientDetails: () => {},
    showToast: message => calls.toasts.push(message),
    openPaymentReceipt: id => calls.paymentReceipts.push(id),
    openModal: () => {},
    hidePatientSuggestions: () => {},
    updatePageScrollLock: () => {},
    showConfirmationDialog: async () => { calls.confirmationRequests += 1; return { confirmed: false }; },
    removeAppointmentById: () => true,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { scrollTo: () => {} }
  };
  vm.createContext(context);
  vm.runInContext(appointmentSource, context);
  context.renderLists = () => {};
  return { calls, context };
}

function makeAppointment(overrides = {}) {
  return {
    id: 'appointment-1',
    name: 'Paciente de prueba',
    status: 'En espera',
    total: 500,
    paid: 0,
    balance: 500,
    ...overrides
  };
}

test('una cita con pago se conserva al cancelarla y no se puede eliminar', async () => {
  const appointment = makeAppointment({ paid: 250, balance: 250 });
  const { context, calls } = createRuntime(appointment);

  context.updateAppointmentStatus(appointment.id, 'Cancelada');
  await context.deleteAppointment(appointment.id);

  assert.equal(appointment.status, 'Cancelada');
  assert.equal(context.shouldPreserveCancelledAppointment(appointment), true);
  assert.equal(calls.confirmationRequests, 0);
  assert.match(calls.toasts.at(-1), /No se puede eliminar una cita con pagos/);
});

test('una cita sin pago puede seguir el flujo normal de eliminación', () => {
  const appointment = makeAppointment();
  const { context } = createRuntime(appointment);

  assert.equal(context.shouldPreserveCancelledAppointment(appointment), false);
  assert.equal(context.getAppointmentPaidAmount(appointment), 0);
});

test('finalizar una cita pagada no abre un recibo de cero pesos', () => {
  const appointment = makeAppointment({ paid: 500, balance: 0 });
  const { context, calls } = createRuntime(appointment);

  context.updateAppointmentStatus(appointment.id, 'Finalizada');

  assert.equal(appointment.status, 'Finalizada');
  assert.deepEqual(calls.paymentReceipts, []);
  assert.match(calls.toasts.at(-1), /pago ya estaba cubierto/);
});

test('finalizar una cita con saldo abre el flujo de cobro', () => {
  const appointment = makeAppointment({ paid: 100, balance: 400 });
  const { context, calls } = createRuntime(appointment);

  context.updateAppointmentStatus(appointment.id, 'Finalizada');

  assert.deepEqual(calls.paymentReceipts, [appointment.id]);
});

test('el botón No agendar conserva la cita cancelada que ya tiene pago', () => {
  assert.match(eventSource, /const cancelledHasPayment = shouldPreserveCancelledAppointment\(cancelledAppointment\);/);
  assert.match(eventSource, /cancelledAppointment && !cancelledHasPayment && removeAppointmentById/);
});

test('la migración bloquea el borrado de citas con pagos desde la base', () => {
  assert.match(migrationSource, /coalesce\(paid, 0\) = 0/);
  assert.match(migrationSource, /'admin'::public\.app_role, 'receptionist'::public\.app_role/);
});
