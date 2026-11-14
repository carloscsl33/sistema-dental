const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');

function createRuntime() {
  let activeElement = null;
  class Element {
    constructor(parent = null) {
      this.parent = parent;
      this.attributes = new Map();
      this.isConnected = true;
      this.classList = {
        values: new Set(),
        add: value => this.classList.values.add(value),
        remove: value => this.classList.values.delete(value),
        contains: value => this.classList.values.has(value)
      };
    }
    contains(element) {
      for (let current = element; current; current = current.parent) if (current === this) return true;
      return false;
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    closest() { return null; }
    blur() { if (activeElement === this) activeElement = null; }
    focus() { activeElement = this; }
  }
  const document = {
    querySelector: () => null,
    get activeElement() { return activeElement; },
    set activeElement(value) { activeElement = value; },
    documentElement: { classList: { add: () => {}, remove: () => {} } },
    body: { classList: { add: () => {}, remove: () => {} } }
  };
  const context = { document, HTMLElement: Element, window: {}, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(source, context);
  let scrollUpdates = 0;
  context.updatePageScrollLock = () => { scrollUpdates += 1; };
  return { Element, context, document, getScrollUpdates: () => scrollUpdates };
}

test('cerrar un modal quita el foco interno antes de ocultarlo y restaura el disparador', () => {
  const { Element, context, document, getScrollUpdates } = createRuntime();
  const opener = new Element();
  const modal = new Element();
  const closeButton = new Element(modal);
  document.activeElement = opener;

  context.openAccessibleModal(modal);
  assert.equal(modal.getAttribute('aria-hidden'), 'false');
  assert.equal(modal.attributes.has('inert'), false);

  document.activeElement = closeButton;
  context.closeAccessibleModal(modal);

  assert.equal(modal.getAttribute('aria-hidden'), 'true');
  assert.equal(modal.getAttribute('inert'), '');
  assert.equal(document.activeElement, opener);
  assert.equal(getScrollUpdates(), 1);
});
