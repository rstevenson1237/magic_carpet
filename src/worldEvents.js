// §10.6 world event bus — singleton, no instantiation needed
const _L = new Map();

export const worldEvents = {
  emit(type, payload) {
    (_L.get(type) ?? []).forEach(fn => fn(payload));
  },
  on(type, handler) {
    if (!_L.has(type)) _L.set(type, []);
    _L.get(type).push(handler);
  },
  off(type, handler) {
    const L = _L.get(type);
    if (L) { const i = L.indexOf(handler); if (i >= 0) L.splice(i, 1); }
  },
};
