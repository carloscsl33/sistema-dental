const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');

test('la sincronización de archivos no borra toda la lista antes de guardarla', () => {
  assert.doesNotMatch(source, /from\('patient_files'\)\.delete\(\)\.eq\('patient_id', patient\.id\)/);
  assert.match(source, /const deletedFileIds = previousFiles\.map/);
  assert.match(source, /from\('patient_files'\)\.delete\(\)\.in\('id', deletedFileIds\)/);
  assert.match(source, /from\('patient_files'\)\.upsert\(fileRows\)/);
});
