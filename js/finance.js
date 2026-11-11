// Finanzas se centra en cobros y saldos pendientes.
let financePayments = [];
let financeLoading = false;
let financeFilters = null;
let financeChartYear = String(new Date().getFullYear());

function financeDefaultFilters() { const today = getISODate(0); return { from: `${today.slice(0, 7)}-01`, to: today }; }
function financeDateMatches(date) { const filters = financeFilters || financeDefaultFilters(); return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to); }
function financePatientName(patientId) { const patient = patients.find(item => item.id === patientId); return patient ? getPatientFullName(patient) : 'Paciente eliminado'; }

async function loadFinanceData() {
  if (!isCloudConnected() || !hasRole('admin', 'receptionist')) return;
  const paymentsResult = await supabaseClient.from('payments').select('*').order('paid_on', { ascending: false });
  if (paymentsResult.error) throw paymentsResult.error;
  financePayments = paymentsResult.data || [];
}

function financeMovements() {
  const payments = financePayments.filter(item => financeDateMatches(item.paid_on)).map(item => ({ id: item.id, type: 'payment', date: item.paid_on, amount: Number(item.amount), patientId: item.patient_id, appointmentId: item.appointment_id, title: item.concept || 'Pago de consulta', detail: item.reference || '' }));
  return payments.sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));
}

function financeMonths(year = financeChartYear) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
}

function renderFinanceChart(months) {
  const currentMonth = getISODate(0).slice(0, 7);
  const data = months.map(month => ({ month, income: financePayments.filter(item => item.paid_on?.startsWith(month)).reduce((sum, item) => sum + (Number(item.amount) || 0), 0) }));
  const max = Math.max(1, ...data.map(item => item.income));
  return `<div class="finance-chart finance-year-chart" aria-label="Ingresos del año seleccionado">${data.map(item => { const label = MONTH_NAMES[Number(item.month.slice(5)) - 1].slice(0, 3); const hasIncome = item.income > 0; const monthName = MONTH_NAMES[Number(item.month.slice(5)) - 1]; return `<article class="finance-chart-month${item.month === currentMonth ? ' is-current' : ''}" aria-label="${escapeHTML(monthName)}: ${formatCurrency(item.income)}"><small class="finance-chart-label">${label}</small><progress class="finance-bar finance-bar-income" value="${item.income}" max="${max}" aria-label="Ingresos de ${escapeHTML(monthName)}: ${formatCurrency(item.income)}">${formatCurrency(item.income)}</progress><small class="finance-chart-value">${hasIncome ? formatCurrency(item.income) : 'Sin cobros'}</small></article>`; }).join('')}</div><p class="finance-legend"><span><i class="finance-dot income"></i>Ingresos cobrados</span><span>Los montos se actualizan con cada pago.</span></p>`;
}

function renderFinanceMovements(movements) {
  if (!movements.length) return '<p class="empty-state">No hay cobros para estos filtros.</p>';
  return movements.map(item => `<article class="finance-movement"><span class="finance-movement-icon payment" aria-hidden="true">↓</span><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(financePatientName(item.patientId))} · ${formatDisplayDate(item.date)}${item.detail ? ` · ${escapeHTML(item.detail)}` : ''}</small></div><strong class="finance-amount positive">+${formatCurrency(item.amount)}</strong><button type="button" class="row-action" data-payment-receipt-patient="${escapeHTML(item.patientId)}" data-payment-receipt="${escapeHTML(item.id)}">Recibo</button></article>`).join('');
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
  const monthlyIncome = financePayments.filter(item => item.paid_on?.startsWith(monthPrefix)).reduce((sum, item) => sum + Number(item.amount), 0);
  const pendingAppointments = getAppointments().map(item => item.appointment).filter(item => item.status !== 'Cancelada' && getNumericAmount(item.balance) > 0);
  const pending = pendingAppointments.reduce((sum, item) => sum + getNumericAmount(item.balance), 0);
  const today = getISODate(0);
  const todayIncome = financePayments.filter(item => item.paid_on === today).reduce((sum, item) => sum + Number(item.amount), 0);
  const years = [...new Set([String(new Date().getFullYear()), ...financePayments.map(item => String(item.paid_on || '').slice(0, 4))].filter(Boolean))].sort((a, b) => Number(b) - Number(a));
  if (!years.includes(financeChartYear)) financeChartYear = years[0] || String(new Date().getFullYear());
  root.innerHTML = `<section class="finance-kpis"><article><small>Ingresos de hoy</small><strong>${formatCurrency(todayIncome)}</strong></article><article><small>Ingresos del mes</small><strong>${formatCurrency(monthlyIncome)}</strong></article><article><small>Pacientes con saldo</small><strong>${new Set(pendingAppointments.map(item => item.patientId)).size}</strong></article><article><small>Saldo pendiente</small><strong>${formatCurrency(pending)}</strong></article></section><section class="card finance-chart-card"><header class="card-head finance-chart-head"><div><h2>Ingresos por mes</h2><p>Resumen anual de cobros.</p></div><label class="finance-year-select">Año<select name="chartYear">${years.map(year => `<option value="${year}" ${year === financeChartYear ? 'selected' : ''}>${year}</option>`).join('')}</select></label></header>${renderFinanceChart(financeMonths())}</section><section class="finance-toolbar finance-movement-filters"><form id="finance-filters" class="finance-filters"><label>Desde<input type="date" name="from" value="${escapeHTML(filters.from)}"></label><label>Hasta<input type="date" name="to" value="${escapeHTML(filters.to)}"></label></form><div class="finance-toolbar-actions"><button type="button" class="outline-button" id="finance-export">Exportar CSV</button></div></section><section class="finance-columns"><section class="card finance-section"><header class="card-head"><div><h2>Movimientos</h2><p>Los filtros de fecha se aplican aquí y al archivo exportado.</p></div></header><div class="finance-movement-list">${renderFinanceMovements(movements)}</div></section><section class="card finance-section"><header class="card-head"><div><h2>Pacientes con saldo</h2><p>Selecciona un paciente para registrar su cobro.</p></div></header><div class="finance-debt-list">${renderFinanceDebtors()}</div></section></section>`;
}

async function renderFinanceModule() {
  const root = document.querySelector('#finance-dashboard'); if (!root || !hasRole('admin', 'receptionist') || financeLoading) return;
  financeLoading = true; root.innerHTML = '<section class="card finance-loading">Actualizando información financiera…</section>';
  try { await loadFinanceData(); renderFinanceContent(); } catch (error) { console.error('No se pudieron cargar las finanzas:', error); root.innerHTML = '<section class="card finance-loading">No se pudo cargar la información financiera.</section>'; } finally { financeLoading = false; }
}
function refreshFinanceModule() { if (document.querySelector('#page-finanzas')?.classList.contains('active')) renderFinanceModule(); }

function exportFinanceCsv() { const rows = [['Fecha', 'Tipo', 'Concepto', 'Paciente', 'Monto']]; financeMovements().forEach(item => rows.push([item.date, 'Ingreso', item.title, financePatientName(item.patientId), item.amount.toFixed(2)])); const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = `thera-dent-finanzas-${getISODate(0)}.csv`; link.click(); URL.revokeObjectURL(link.href); }

document.addEventListener('input', event => { if (event.target.closest('#finance-filters')) { financeFilters = { ...financeFilters, ...Object.fromEntries(new FormData(event.target.closest('#finance-filters'))) }; renderFinanceContent(); } });
document.addEventListener('change', event => { if (event.target.matches('[name="chartYear"]')) { financeChartYear = event.target.value; renderFinanceContent(); return; } if (event.target.closest('#finance-filters')) { financeFilters = { ...financeFilters, ...Object.fromEntries(new FormData(event.target.closest('#finance-filters'))) }; renderFinanceContent(); } });
document.addEventListener('click', event => { const collect = event.target.closest('[data-finance-collect]'); if (collect) openPaymentReceipt(collect.dataset.financeCollect); if (event.target.closest('#finance-export')) exportFinanceCsv(); });
