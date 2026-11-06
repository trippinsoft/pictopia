const { makeLoader } = require('./loader.cjs');
exports.hooks = (file, exportName, mocks, initialProps) => {
  const slots = [], cleanup = [];
  let cursor = 0, effects = [], props = initialProps;
  const equal = (a,b) => a && b && a.length === b.length && a.every((x,i) => x === b[i]);
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn,deps) { const i = cursor++; if (!equal(slots[i],deps)) { slots[i] = deps; effects.push(() => { cleanup[i]?.(); cleanup[i] = fn(); }); } },
    useMemo(fn,deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps,deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn,deps) { return this.useMemo(fn,deps); },
  };
  // Compiled named hook calls do not preserve `this`.
  react.useCallback = (fn,deps) => react.useMemo(() => fn,deps);
  const load = makeLoader({ ...mocks, react, 'expo-router': { useFocusEffect: fn => react.useEffect(fn,[fn]) } });
  const component = load(file)[exportName];
  return {
    render(next = props) { props = next; cursor = 0; const tree = Array.isArray(props) ? component(...props) : component(props); const todo = effects; effects = []; todo.forEach(fn => fn()); return tree; },
    unmount() { cleanup.forEach(fn => fn?.()); },
  };
};
exports.textOf = node => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  return [node.props?.children].flat().map(exports.textOf).join(' ');
};
