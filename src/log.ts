const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const T_BASE = Date.now();

export function log(...args) {
  let ts = dt2s(Date.now() - T_BASE);
  console.log(ts, ...args);
}

log.v = (...args) => log('V', ...args);
log.i = (...args) => log('I', ...args);
log.w = (...args) => log('W', ...args);
log.e = (...args) => log('E', ...args);

function p2(x) {
  return (100 + x).toString().slice(1);
}

function dt2s(dt) {
  let s = dt / SEC % 60;
  let m = dt / MIN % 60 | 0;
  let h = dt / HOUR % 24 | 0;
  let d = dt / DAY | 0;

  let x = '';

  if (d > 0) {
    x = p2(d) + ':' + p2(h) + ':' + p2(m) + ':';
  } else if (h > 0) {
    x = p2(h) + ':' + p2(m) + ':';
  } else if (m > 0) {
    x = p2(m) + ':';
  }

  return '[' + x + s.toFixed(3) + ']';
}

log('Started:', new Date().toISOString());
