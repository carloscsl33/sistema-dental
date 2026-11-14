const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

test('el favicon se sirve localmente y favicon.ico es compatible', () => {
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="favicon\.svg"/);
  assert.match(fs.readFileSync(path.join(root, 'favicon.svg'), 'utf8'), /<svg/);
  assert.deepEqual(vercel.rewrites, [{ source: '/favicon.ico', destination: '/favicon.svg' }]);
});
