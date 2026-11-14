const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'js', 'auth.js'), 'utf8').replace('initializeAuth();', '');

function createRuntime() {
  const authStates = [];
  const element = { toggleAttribute: () => {}, classList: { toggle: () => {} }, textContent: '', dataset: {} };
  const context = {
    currentAccess: { id: null, role: null, status: null, fullName: '', email: '' },
    ROLE_LABELS: { receptionist: 'Recepcionista' },
    passwordRecoveryActive: false,
    document: {
      querySelector: () => element,
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: { classList: { toggle: () => {} } }
    },
    window: { setTimeout: () => {}, location: { hash: '', search: '', origin: 'http://localhost', pathname: '/' }, history: { replaceState: () => {} } },
    URL,
    URLSearchParams,
    supabaseClient: { auth: { signOut: async () => {} } },
    loadPublicClinicBranding: async () => {},
    isCloudConnected: () => true,
    console
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.applyAuthState = (session, loading = false) => authStates.push({ userId: session?.user?.id || null, loading });
  context.setAuthMessage = () => {};
  context.renderSessionIdentity = () => {};
  context.clearCurrentAccess = () => { context.currentAccess = { id: null, role: null, status: null, fullName: '', email: '' }; };
  context.setCurrentAccess = access => { context.currentAccess = access; return access; };
  context.disconnectFromCloud = () => {};
  context.loadClinicConfiguration = async () => {};
  return { authStates, context };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('mantiene la pantalla bloqueada hasta terminar la primera carga', async () => {
  const { context, authStates } = createRuntime();
  let resolveCloud;
  context.getAccessForSession = async session => ({ id: session.user.id, role: 'receptionist', status: 'approved', email: session.user.email });
  context.connectToCloud = () => new Promise(resolve => { resolveCloud = resolve; });
  const session = { user: { id: 'user-1', email: 'uno@clinica.test' } };

  const loading = context.handleSession(session);
  await tick();
  assert.deepEqual(authStates.at(-1), { userId: 'user-1', loading: true });

  resolveCloud(true);
  await loading;
  assert.deepEqual(authStates.at(-1), { userId: 'user-1', loading: false });
});

test('descarta una carga antigua si se cambia de cuenta durante la sincronización', async () => {
  const { context, authStates } = createRuntime();
  const cloudResolvers = new Map();
  context.getAccessForSession = async session => ({ id: session.user.id, role: 'receptionist', status: 'approved', email: session.user.email });
  context.connectToCloud = userId => new Promise(resolve => cloudResolvers.set(userId, resolve));
  const firstSession = { user: { id: 'user-1', email: 'uno@clinica.test' } };
  const secondSession = { user: { id: 'user-2', email: 'dos@clinica.test' } };

  const firstLoad = context.handleSession(firstSession);
  await tick();
  const secondLoad = context.handleSession(secondSession);
  await tick();
  cloudResolvers.get('user-2')(true);
  await secondLoad;
  cloudResolvers.get('user-1')(true);
  await firstLoad;

  assert.deepEqual(authStates.at(-1), { userId: 'user-2', loading: false });
  assert.equal(context.currentAccess.id, 'user-2');
});
