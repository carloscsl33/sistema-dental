const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8').replace('initializeAuth();', '');

function createRuntime() {
  const storage = new Map([['sb-project-auth-token', 'expired'], ['unrelated', 'kept']]);
  const context = {
    currentAccess: { id: 'user-1', role: 'admin' },
    ROLE_LABELS: { admin: 'Administrador' },
    document: { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, body: { classList: { toggle: () => {} } } },
    window: { addEventListener: () => {}, setTimeout: () => {}, location: { hash: '', search: '', origin: 'http://localhost', pathname: '/' }, history: { replaceState: () => {} } },
    URL,
    URLSearchParams,
    localStorage: { get length() { return storage.size; }, key: index => Array.from(storage.keys())[index] || null, removeItem: key => storage.delete(key) },
    Object,
    supabaseClient: { auth: { signOut: async () => {} } },
    console
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.disconnectFromCloud = () => {};
  context.clearCurrentAccess = () => { context.currentAccess = { id: null, role: null }; };
  context.showAuthView = () => {};
  context.applyAuthState = () => {};
  context.setAuthMessage = () => {};
  return { context, storage };
}

test('reconoce los errores de refresh token que requieren reiniciar sesión', () => {
  const { context } = createRuntime();
  assert.equal(context.isInvalidRefreshTokenError(new Error('Invalid Refresh Token: Refresh Token Not Found')), true);
  assert.equal(context.isInvalidRefreshTokenError(new Error('network timeout')), false);
});

test('limpia únicamente el token de Supabase cuando la sesión venció', async () => {
  const { context, storage } = createRuntime();
  await context.recoverInvalidSession();
  assert.equal(storage.has('sb-project-auth-token'), false);
  assert.equal(storage.has('unrelated'), true);
  assert.equal(context.currentAccess.id, null);
});
