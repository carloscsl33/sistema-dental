// Finanzas se centra en cobros, correcciones auditables y saldos pendientes.
let financeRefunds = [];
let financePayments = [];
let financeLoading = false;
let financeFilters = null;

function financeDefaultFilters() { const today = getISODate(0); return { from: `${today.slice(0, 7)}-01`, to: today, patientId: '' }; }
function financeDateMatches(date) { const filters = financeFilters || financeDefaultFilters(); return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to); }
function financePatientName(patientId) { const patient = patients.find(item => item.id === patientId); return patient ? getPatientFullName(patient) : 'Paciente eliminado'; }

async function loadFinanceData() {
  if (!isCloudConnected() || !hasRole('admin', 'receptionist')) return;
  const [refundsResult, paymentsResult] = await Promise.all([
    supabaseClient.from('payment_refunds').select('*').order('refunded_on', { ascending: false }),
    supabaseClient.from('payments').select('*').order('paid_on', { ascending: false })
  ]);
  const error = [refundsResult, paymentsResult].map(result => result.error).find(Boolean);
  if (error) throw error;
  financeRefunds = refundsResult.data || [];
  financePayments = paymentsResult.data || [];
}

function financeMovements() {
  const filters = financeFilters || financeDefaultFilters();
  const matchesPatient = item => !filters.patientId || item.patient_id === filters.patientId;
  const payments = financePayments.filter(item => financeDateMatches(item.paid_on) && matchesPatient(item)).map(item => ({ id: item.id, type: 'payment', date: item.paid_on, amount: Number(item.amount), patientId: item.patient_id, appointmentId: item.appointment_id, title: item.concept || 'Pago de consulta', detail: item.reference || '' }));
  const refunds = financeRefunds.filter(item => financeDateMatches(item.refunded_on) && matchesPatient(item)).map(item => ({ id: item.id, type: 'refund', date: item.refunded_on, amount: -Number(item.amount), patientId: item.patient_id, appointmentId: item.appointment_id, title: 'Corrección de pago', detail: item.reason || '' }));
  return [...payments, ...refunds].sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));
}

function financeMonths() {
  return Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setMonth(date.getMonth() - (5 - index), 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; });
}

function renderFinanceChart(months) {
  const data = months.map(month => ({ month, income: financePayments.filter(item => item.paid_on?.startsWith(month)).reduce((sum, item) => sum + Number(item.amount), 0) - financeRefunds.filter(item => item.refunded_on?.startsWith(month)).reduce((sum, item) => sum + Number(item.amount), 0) }));
  const max = Math.max(1, ...data.map(item => item.income));
  return `<div class="finance-chart" aria-label="Ingresos de los últimos seis meses">${data.map(item => { const label = MONTH_NAMES[Number(item.month.slice(5)) - 1].slice(0, 3); const height = Math.max(5, Math.round(item.income / max * 140)); return `<div class="finance-chart-month"><div class="finance-bars"><span class="finance-bar finance-bar-income" style="height:${height}px" title="Ingresos ${formatCurrency(item.income)}"></span></div><small>${label}</small></div>`; }).join('')}</div><p class="finance-legend"><span><i class="finance-dot income"></i>Ingresos cobrados</span></p>`;
}

function renderFinanceMovements(movements) {
  if (!movements.length) return '<p class="empty-state">No hay cobros ni correcciones para estos filtros.</p>';
  return movements.map(item => `<article class="finance-movement"><span class="finance-movement-icon ${item.type}" aria-hidden="true">${item.type === 'payment' ? '↓' : '↩'}</span><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(financePatientName(item.patientId))} · ${formatDisplayDate(item.date)}${item.detail ? ` · ${escapeHTML(item.detail)}` : ''}</small></div><strong class="finance-amount ${item.amount < 0 ? 'negative' : 'positive'}">${item.amount < 0 ? '−' : '+'}${formatCurrency(Math.abs(item.amount))}</strong>${item.type === 'payment' && hasRole('admin') ? `<button type="button" class="row-action finance-refund-button" data-finance-refund="${escapeHTML(item.id)}">Corregir</button>` : ''}</article>`).join('');
}

function renderFinanceDebtors() {
  const debtors = patients.map(patient => ({ patient, appointments: getPatientPendingAppointments(patient) })).filter(item => item.appointments.length);
  if (!debtors.length) return '<p class="empty-state">No hay pacientes con saldo pendiente.</p>';
  return debtors.map(({ patient, appointments }) => { const balance = appointments.reduce((sum, item) => sum + getNumericAmount(item.balance), 0); return `<article class="finance-debtor"><div><strong>${escapeHTML(getPatientFullName(patient))}</strong><small>${escapeHTML(patient.telefono || 'Sin teléfono')} · ${appointments.length} cita${appointments.length === 1 ? '' : 's'} pendiente${appointments.length === 1 ? '' : 's'}</small></div><strong>${formatCurrency(balance)}</strong><button type="button" class="outline-button" data-finance-collect="${escapeHTML(appointments[0].id)}">Cobrar</button></article>`; }).join('');
}

function renderFinanceContent() {
  const root = document.querySelector('#finance-dashboard'); if (!root) return;
  const filters = financeFilters || (financeFilters = financeDefaultFilters());
  const movements = financeMovements();
  const monthPrefix = getISODate(0).slice(0, 7);
  const monthlyIncome = financePayments.filter(item => item.paid_on?.startsWith(monthPrefix)).reduce((sum, item) => sum + Number(item.amount), 0) - financeRefunds.filter(item => item.refunded_on?.startsWith(monthPrefix)).reduce((sum, item) => sum + Number(item.amount), 0);
  const pendingAppointments = getAppointments().map(item => item.appointment).filter(item => item.status !== 'Cancelada' && getNumericAmount(item.balance) > 0);
  const pending = pendingAppointments.reduce((sum, item) => sum + getNumericAmount(item.balance), 0);
  const patientOptions = patients.slice().sort((a, b) => getPatientFullName(a).localeCompare(getPatientFullName(b), 'es-MX')).map(patient => `<option value="${escapeHTML(patient.id)}">${escapeHTML(getPatientFullName(patient))}</option>`).join('');
  root.innerHTML = `<section class="finance-toolbar card"><form id="finance-filters" class="finance-filters"><label>Desde<input type="date" name="from" value="${escapeHTML(filters.from)}"></label><label>Hasta<input type="date" name="to" value="${escapeHTML(filters.to)}"></label><label>Paciente<select name="patientId"><option value="">Todos</option>${patientOptions}</select></label><button type="button" class="outline-button" id="finance-clear-filters">Limpiar</button></form><div class="finance-toolbar-actions"><button type="button" class="outline-button" id="finance-export">Exportar CSV</button></div></section><section class="finance-kpis"><article><small>Ingresos del mes</small><strong>${formatCurrency(monthlyIncome)}</strong></article><article><small>Pacientes con saldo</small><strong>${new Set(pendingAppointments.map(item => item.patientId)).size}</strong></article><article><small>Saldo pendiente</small><strong>${formatCurrency(pending)}</strong></article></section><section class="card finance-chart-card"><header class="card-head"><div><h2>Ingresos por mes</h2><p>Incluye los cobros registrados y sus correcciones.</p></div></header>${renderFinanceChart(financeMonths())}</section><section class="finance-columns"><section class="card finance-section"><header class="card-head"><div><h2>Movimientos</h2><p>Los cobros y sus correcciones permanecen auditables.</p></div></header><div class="finance-movement-list">${renderFinanceMovements(movements)}</div></section><section class="card finance-section"><header class="card-head"><div><h2>Pacientes con saldo</h2><p>Selecciona un paciente para registrar su cobro.</p></div></header><div class="finance-debt-list">${renderFinanceDebtors()}</div></section></section>`;
  const patientSelect = root.querySelector('[name="patientId"]'); if (patientSelect) patientSelect.value = filters.patientId;
}

async function renderFinanceModule() {
  const root = document.querySelector('#finance-dashboard'); if (!root || !hasRole('admin', 'receptionist') || financeLoading) return;
  financeLoading = true; root.innerHTML = '<section class="card finance-loading">Actualizando información financiera…</section>';
  try { await loadFinanceData(); renderFinanceContent(); } catch (error) { console.error('No se pudieron cargar las finanzas:', error); root.innerHTML = '<section class="card finance-loading">No se pudo cargar la información financiera.</section>'; } finally { financeLoading = false; }
}
function refreshFinanceModule() { if (document.querySelector('#page-finanzas')?.classList.contains('active')) renderFinanceModule(); }

function createFinanceModals() {
  if (document.querySelector('#finance-refund-modal')) return;
  const host = document.createElement('div');
  host.innerHTML = `<div class="modal-backdrop finance-modal-backdrop" id="finance-refund-modal" aria-hidden="true"><form class="finance-modal" id="finance-refund-form" aria-modal="true" role="dialog"><button type="button" class="modal-close" data-finance-close aria-label="Cerrar">×</button><h2>Corregir pago</h2><p class="modal-copy" id="finance-refund-copy"></p><input name="payment_id" type="hidden"><label>Monto a devolver*<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Fecha de devolución*<input name="refunded_on" type="date" required></label><label>Motivo*<textarea name="reason" rows="3" maxlength="500" required placeholder="Explica la corrección o devolución"></textarea></label><div class="appointment-notes-actions"><button type="button" class="modal-secondary-button" data-finance-close>Cancelar</button><button class="modal-primary-button" type="submit">Registrar corrección</button></div></form></div>`;
  document.body.append(...host.children);
}
function openFinanceModal(id) { const modal = document.querySelector(id); if (!modal) return; modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); lockPageScroll(); }
function closeFinanceModals() { document.querySelectorAll('#finance-refund-modal').forEach(modal => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }); updatePageScrollLock(); }
function exportFinanceCsv() { const rows = [['Fecha', 'Tipo', 'Concepto', 'Paciente', 'Monto']]; financeMovements().forEach(item => rows.push([item.date, item.type === 'payment' ? 'Ingreso' : 'Corrección', item.title, financePatientName(item.patientId), item.amount.toFixed(2)])); const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = `thera-dent-finanzas-${getISODate(0)}.csv`; link.click(); URL.revokeObjectURL(link.href); }

document.addEventListener('DOMContentLoaded', createFinanceModals, { once: true });
document.addEventListener('submit', async event => { if (!event.target.matches('#finance-refund-form')) return; event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); try { const { error } = await supabaseClient.rpc('record_payment_refund', { p_payment_id: values.payment_id, p_amount: Number(values.amount), p_refunded_on: values.refunded_on, p_reason: values.reason }); if (error) throw error; closeFinanceModals(); await connectToCloud(); await renderFinanceModule(); showToast('Corrección registrada.'); } catch (error) { showToast('No se pudo registrar la corrección.'); } });
document.addEventListener('input', event => { if (event.target.closest('#finance-filters')) { financeFilters = { ...financeFilters, ...Object.fromEntries(new FormData(event.target.closest('#finance-filters'))) }; renderFinanceContent(); } });
document.addEventListener('change', event => { if (event.target.closest('#finance-filters')) { financeFilters = { ...financeFilters, ...Object.fromEntries(new FormData(event.target.closest('#finance-filters'))) }; renderFinanceContent(); } });
document.addEventListener('click', event => { const refund = event.target.closest('[data-finance-refund]'); if (refund) { const payment = financePayments.find(item => item.id === refund.dataset.financeRefund); const form = document.querySelector('#finance-refund-form'); if (!payment || !form) return; const previouslyRefunded = financeRefunds.filter(item => item.payment_id === payment.id).reduce((sum, item) => sum + Number(item.amount), 0); const available = Math.max(0, Number(payment.amount) - previouslyRefunded); if (available <= 0) { showToast('Ese pago ya fue corregido por completo.'); return; } form.reset(); form.elements.payment_id.value = payment.id; form.elements.amount.max = String(available); form.elements.refunded_on.value = getISODate(0); document.querySelector('#finance-refund-copy').textContent = `${financePatientName(payment.patient_id)} · disponible para corregir: ${formatCurrency(available)}.`; openFinanceModal('#finance-refund-modal'); } const collect = event.target.closest('[data-finance-collect]'); if (collect) openPaymentReceipt(collect.dataset.financeCollect); if (event.target.closest('#finance-export')) exportFinanceCsv(); if (event.target.closest('#finance-clear-filters')) { financeFilters = financeDefaultFilters(); renderFinanceContent(); } if (event.target.closest('[data-finance-close]')) closeFinanceModals(); });
