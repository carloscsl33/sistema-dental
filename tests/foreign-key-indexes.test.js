const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261114010000_add_foreign_key_indexes.sql'), 'utf8');

test('la migración cubre las siete claves foráneas señaladas por el asesor', () => {
  [
    'clinical_progress_author_id_idx',
    'expenses_created_by_idx',
    'google_drive_connection_connected_by_idx',
    'google_drive_oauth_states_user_id_idx',
    'payment_refunds_appointment_id_idx',
    'payment_refunds_created_by_idx',
    'payment_refunds_patient_id_idx'
  ].forEach(index => assert.match(migration, new RegExp(`create index if not exists ${index}`)));
});
