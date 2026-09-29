/**
 * Logs how long each step of a request took, e.g.
 * [timing] confirm 66f0... load=41ms seats=12ms tickets=88ms total=160ms
 */
export function stepTimer(label) {
  const start = Date.now();
  let last = start;
  const steps = [];
  return {
    mark(name) {
      const now = Date.now();
      steps.push(`${name}=${now - last}ms`);
      last = now;
    },
    done(extra = '') {
      console.log(`[timing] ${label} ${steps.join(' ')} total=${Date.now() - start}ms${extra ? ` ${extra}` : ''}`);
    },
  };
}
