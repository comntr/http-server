const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const T_BASE = Date.now();

function log(...args) {
  let ts = dt2s(Date.now() - T_BASE);
  console.log(ts, ...args);
}

log.v = (...args) => log('V', ...args);
log.i = (...args) => log('I', ...args);
log.w = (...args) => log('W', ...args);
log.e = (...args) => log('E', ...args);

function dt2s(dt) {
  let s = dt / SEC % 60;
  let m = dt / MIN % 60 | 0;
  let h = dt / HOUR % 24 | 0;
  let d = dt / DAY | 0;

  let x = '';

  if (d > 0) {
    x = d + ':' + h + ':' + m + ':';
  } else if (h > 0) {
    x = h + ':' + m + ':';
  } else if (m > 0) {
    x = m + ':';
  }

  return '[' + x + s.toFixed(3) + ']';
}

log('Started:', new Date().toISOString());

module.exports = log;
