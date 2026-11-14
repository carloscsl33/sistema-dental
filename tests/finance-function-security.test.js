const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261113120000_harden_finance_function_roles.sql'), 'utf8');

test('las funciones financieras rechazan roles no autorizados', () => {
  assert.match(migration, /record_payment\([\s\S]*?coalesce\(\(select private\.current_role\(\)\)::text, ''\) not in \('admin', 'receptionist'\)/);
  assert.match(migration, /record_expense\([\s\S]*?coalesce\(\(select private\.current_role\(\)\)::text, ''\) <> 'admin'/);
  assert.match(migration, /record_payment_refund\([\s\S]*?coalesce\(\(select private\.current_role\(\)\)::text, ''\) <> 'admin'/);
});

test('las funciones financieras no quedan disponibles para anon o public', () => {
  assert.match(migration, /revoke all on function public\.record_payment[\s\S]*from public, anon/);
  assert.match(migration, /revoke all on function public\.record_expense[\s\S]*from public, anon/);
  assert.match(migration, /revoke all on function public\.record_payment_refund[\s\S]*from public, anon/);
});
