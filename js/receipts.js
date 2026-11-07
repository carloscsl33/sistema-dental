// Comprobantes de pago. El folio se conserva en el campo interno de referencia del pago.

function receiptClinicDetails() {
  const name = String(clinicSettings?.clinic_name || 'Thera-dent').trim() || 'Thera-dent';
  return {
    name,
    phone: String(clinicSettings?.phone || '').trim(),
    email: String(clinicSettings?.email || '').trim(),
    address: String(clinicSettings?.address || '').trim()
  };
}

function receiptMonogram(name) {
  return (String(name || 'T').trim().charAt(0) || 'T').toUpperCase();
}

function createReceiptFolio() {
  const date = getISODate(0).replaceAll('-', '');
  const random = (crypto?.randomUUID?.() || generateId('receipt')).replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase();
  return `REC-${date}-${random}`;
}

function fallbackReceiptFolio(payment) {
  const stored = String(payment?.referencia || '').trim();
  if (stored.startsWith('REC-')) return stored;
  const date = String(payment?.fecha || getISODate(0)).replaceAll('-', '');
  const id = String(payment?.id || 'PAGO').replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase();
  return `REC-${date}-${id || 'PAGO'}`;
}

function createReceiptPayload({ patient, appointment, amount, paidOn, folio, balanceAfter, total }) {
  const clinic = receiptClinicDetails();
  const patientName = getPatientFullName(patient) || appointment?.name || 'Paciente';
  const appointmentTotal = total === undefined ? getNumericAmount(appointment?.total ?? appointment?.balance) : getNumericAmount(total);
  const remaining = balanceAfter === undefined ? getNumericAmount(appointment?.balance) : getNumericAmount(balanceAfter);
  return {
    clinic,
    folio: folio || createReceiptFolio(),
    patientName,
    patientPhone: patient?.telefono || '',
    paidOn: paidOn || getISODate(0),
    appointmentDate: appointment?.date || paidOn || getISODate(0),
    appointmentTime: appointment?.time || '',
    concept: appointment?.reason || 'Consulta dental',
    total: appointmentTotal,
    amount: getNumericAmount(amount),
    balanceAfter: remaining
  };
}

function receiptPayloadFromHistory(patient, payment) {
  const appointment = getPatientAppointments(patient).find(item => item.id === payment.citaId);
  return createReceiptPayload({
    patient,
    appointment: {
      name: getPatientFullName(patient),
      date: payment.fechaCita || appointment?.date || payment.fecha,
      time: payment.horaCita || appointment?.time || '',
      reason: payment.concepto || appointment?.reason || 'Consulta dental',
      total: payment.montoTotal === undefined ? appointment?.total : payment.montoTotal,
      balance: payment.saldoRestante === undefined ? appointment?.balance : payment.saldoRestante
    },
    amount: payment.monto,
    paidOn: payment.fecha,
    folio: fallbackReceiptFolio(payment),
    balanceAfter: payment.saldoRestante,
    total: payment.montoTotal
  });
}

function receiptContactLine(receipt) {
  return [receipt.clinic.phone, receipt.clinic.email, receipt.clinic.address].filter(Boolean).join(' · ');
}

function receiptMarkup(receipt) {
  const appointmentLine = `${formatDisplayDate(receipt.appointmentDate)}${receipt.appointmentTime ? ` · ${receipt.appointmentTime}` : ''}`;
  return `<article class="payment-document-paper">
    <header class="payment-document-brand">
      <span class="payment-document-monogram" aria-hidden="true">${escapeHTML(receiptMonogram(receipt.clinic.name))}</span>
      <div><p>COMPROBANTE DE PAGO</p><h2>${escapeHTML(receipt.clinic.name)}</h2><small>${escapeHTML(receiptContactLine(receipt) || 'Información de contacto no registrada')}</small></div>
    </header>
    <section class="payment-document-meta"><div><small>RECIBO</small><strong>${escapeHTML(receipt.folio)}</strong></div><div><small>FECHA DE PAGO</small><strong>${escapeHTML(formatDisplayDate(receipt.paidOn))}</strong></div></section>
    <section class="payment-document-person"><small>RECIBIMOS DE</small><strong>${escapeHTML(receipt.patientName)}</strong><span>Cita: ${escapeHTML(appointmentLine)}</span></section>
    <section class="payment-document-concept"><div><small>CONCEPTO</small><strong>${escapeHTML(receipt.concept)}</strong></div><strong>${formatCurrency(receipt.amount)}</strong></section>
    <section class="payment-document-totals"><div><small>Total de la cita</small><strong>${formatCurrency(receipt.total)}</strong></div><div><small>Pago recibido</small><strong>${formatCurrency(receipt.amount)}</strong></div><div class="payment-document-balance"><small>Saldo pendiente</small><strong>${formatCurrency(receipt.balanceAfter)}</strong></div></section>
    <footer>Comprobante informativo de pago. No sustituye una factura fiscal.</footer>
  </article>`;
}

function createPaymentDocumentModal() {
  if (document.querySelector('#payment-document-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'payment-document-modal';
  modal.className = 'modal-backdrop payment-document-backdrop';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `<div class="modal-card payment-document-card" role="dialog" aria-modal="true" aria-labelledby="payment-document-title"><header class="payment-document-modal-head"><div><h2 id="payment-document-title">Comprobante de pago</h2><p class="modal-copy">Guárdalo en PDF o compártelo con el paciente.</p></div><button type="button" class="modal-close" data-payment-document-close aria-label="Cerrar">×</button></header><div id="payment-document-content"></div><footer class="payment-document-actions"><button type="button" class="modal-secondary-button" data-payment-document-close>Cerrar</button><button type="button" class="modal-secondary-button" id="payment-document-share">Compartir PDF</button><button type="button" class="modal-primary-button" id="payment-document-download">Descargar PDF</button></footer></div>`;
  document.body.appendChild(modal);
}

function openPaymentDocument(receipt) {
  createPaymentDocumentModal();
  const modal = document.querySelector('#payment-document-modal');
  const content = document.querySelector('#payment-document-content');
  if (!modal || !content) return;
  modal._receipt = receipt;
  content.innerHTML = receiptMarkup(receipt);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
}

function closePaymentDocument() {
  const modal = document.querySelector('#payment-document-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  updatePageScrollLock();
}

function openStoredPaymentReceipt(patientId, paymentId) {
  const patient = patients.find(item => item.id === patientId);
  const payment = (patient?.historialFinanciero || []).find(item => item.id === paymentId);
  if (!patient || !payment) return showToast('No se encontró el comprobante solicitado.');
  openPaymentDocument(receiptPayloadFromHistory(patient, payment));
}

function pdfText(value, limit = 80) {
  const winAnsi = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  return Array.from(text).map(char => {
    const code = winAnsi[char] || char.charCodeAt(0);
    return code >= 32 && code <= 255 ? String.fromCharCode(code) : '?';
  }).join('').replace(/([\\()])/g, '\\$1');
}

function pdfBinary(value) {
  return Uint8Array.from(String(value), char => char.charCodeAt(0) & 255);
}

function createReceiptPdfBlob(receipt) {
  const contact = receiptContactLine(receipt) || 'Información de contacto no registrada';
  const lines = [
    'q 0.10 0.63 0.61 rg 0 692 595 150 re f Q',
    '1 1 1 rg',
    '0.18 0.72 0.69 rg 54 728 45 45 re f',
    '1 1 1 rg BT /F2 25 Tf 68 742 Td (' + pdfText(receiptMonogram(receipt.clinic.name), 1) + ') Tj ET',
    'BT /F2 11 Tf 113 797 Td (COMPROBANTE DE PAGO) Tj ET',
    'BT /F2 25 Tf 113 758 Td (' + pdfText(receipt.clinic.name, 35) + ') Tj ET',
    'BT /F1 9 Tf 113 738 Td (' + pdfText(contact, 66) + ') Tj ET',
    '0.06 0.13 0.23 rg',
    'BT /F2 9 Tf 54 660 Td (RECIBO) Tj ET',
    'BT /F2 12 Tf 54 641 Td (' + pdfText(receipt.folio, 55) + ') Tj ET',
    'BT /F2 9 Tf 365 660 Td (FECHA DE PAGO) Tj ET',
    'BT /F2 12 Tf 365 641 Td (' + pdfText(formatDisplayDate(receipt.paidOn), 36) + ') Tj ET',
    '0.94 0.97 0.97 rg 54 530 487 80 re f',
    '0.06 0.13 0.23 rg',
    'BT /F2 9 Tf 72 584 Td (RECIBIMOS DE) Tj ET',
    'BT /F2 17 Tf 72 558 Td (' + pdfText(receipt.patientName, 52) + ') Tj ET',
    'BT /F1 10 Tf 72 539 Td (Cita: ' + pdfText(`${formatDisplayDate(receipt.appointmentDate)}${receipt.appointmentTime ? ` · ${receipt.appointmentTime}` : ''}`, 56) + ') Tj ET',
    '0.82 0.88 0.88 RG 1 w 54 497 m 541 497 l S',
    'BT /F2 9 Tf 54 470 Td (CONCEPTO) Tj ET',
    'BT /F2 15 Tf 54 442 Td (' + pdfText(receipt.concept, 55) + ') Tj ET',
    'BT /F2 18 Tf 425 442 Td (' + pdfText(formatCurrency(receipt.amount), 22) + ') Tj ET',
    '0.06 0.13 0.23 rg',
    '0.82 0.88 0.88 RG 1 w 54 385 m 541 385 l S',
    'BT /F1 10 Tf 54 363 Td (Total de la cita) Tj ET',
    'BT /F2 14 Tf 456 363 Td (' + pdfText(formatCurrency(receipt.total), 20) + ') Tj ET',
    '0.88 0.91 0.93 RG 1 w 54 336 m 541 336 l S',
    'BT /F1 10 Tf 54 314 Td (Pago recibido) Tj ET',
    'BT /F2 14 Tf 456 314 Td (' + pdfText(formatCurrency(receipt.amount), 20) + ') Tj ET',
    '0.88 0.91 0.93 RG 1 w 54 287 m 541 287 l S',
    'BT /F2 10 Tf 54 265 Td (Saldo pendiente) Tj ET',
    'BT /F2 15 Tf 450 265 Td (' + pdfText(formatCurrency(receipt.balanceAfter), 20) + ') Tj ET',
    '0.45 0.50 0.58 rg',
    'BT /F1 9 Tf 54 220 Td (Comprobante informativo de pago. No sustituye una factura fiscal.) Tj ET'
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${pdfBinary(lines).length} >>\nstream\n${lines}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ];
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdfBinary(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdfBinary(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdfBinary(pdf)], { type: 'application/pdf' });
}

function downloadReceiptPdf(receipt) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(createReceiptPdfBlob(receipt));
  link.download = `${receipt.folio.toLowerCase()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function shareReceiptPdf(receipt) {
  const filename = `${receipt.folio.toLowerCase()}.pdf`;
  const file = new File([createReceiptPdfBlob(receipt)], filename, { type: 'application/pdf' });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ title: `Recibo ${receipt.folio}`, text: `Comprobante de pago de ${receipt.clinic.name}`, files: [file] });
    } catch (error) {
      if (error?.name !== 'AbortError') showToast('No se pudo abrir el menú para compartir el PDF.');
    }
    return;
  }
  downloadReceiptPdf(receipt);
  showToast('Este navegador no puede compartir archivos directamente. Descarga el PDF y adjúntalo en WhatsApp.');
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-payment-document-close]')) return closePaymentDocument();
  const modal = document.querySelector('#payment-document-modal');
  if (!modal?._receipt) return;
  if (event.target.closest('#payment-document-download')) downloadReceiptPdf(modal._receipt);
  if (event.target.closest('#payment-document-share')) shareReceiptPdf(modal._receipt);
});
