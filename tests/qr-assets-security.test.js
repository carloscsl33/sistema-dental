const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const headers = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');

test('las bibliotecas QR se sirven localmente', () => {
  assert.match(html, /vendor\/jsQR-1\.4\.0\.js/);
  assert.match(html, /vendor\/qrcode-generator-2\.0\.4\.js/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);
  assert.ok(fs.statSync(path.join(root, 'vendor', 'jsQR-1.4.0.js')).size > 100000);
  assert.ok(fs.statSync(path.join(root, 'vendor', 'qrcode-generator-2.0.4.js')).size > 40000);
});

test('la CSP ya no permite scripts ni source maps de jsDelivr', () => {
  assert.match(headers, /script-src 'self';/);
  assert.doesNotMatch(headers, /cdn\.jsdelivr\.net/);
});

test('las bibliotecas QR locales exponen las funciones que usa la aplicación', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'jsQR-1.4.0.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'qrcode-generator-2.0.4.js'), 'utf8'), context);
  assert.equal(typeof context.jsQR, 'function');
  assert.equal(typeof context.qrcode, 'function');
});
