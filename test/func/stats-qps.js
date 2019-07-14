const { runTest, fetch, log } = require('../fw');

const QPS_ALL_REQUESTS = 'all-requests';

fetch.logs = true;
log.cp.excluded.push(/\sI\s/);

runTest(async () => {
  let res = await fetch('GET', '/stats/');
  if (res.statusCode != 200)
    throw new Error('Wrong response.');
  let json = JSON.parse(res.body);
  let keys = Object.keys(json);
  log.i(keys.join(', '));
  if (keys.length < 2)
    throw new Error('Too few QPS counters');
  if (!json[QPS_ALL_REQUESTS])
    throw new Error('Missing counter: ' + QPS_ALL_REQUESTS);
  for (let name of keys) {
    if (!Array.isArray(json[name]) || json[name].length != 2)
      throw new Error('Invalid stats: ' + name);
    let [stime, values] = json[name];
    if (!Number.isFinite(stime) || stime < 0)
      throw new Error('Invalid stime: ' + name + '; ' + stime);
    if (!Array.isArray(values) || values.length != 3600)
      throw new Error('Invalid values array: ' + name);
    for (let val of values)
      if (!Number.isFinite(val) || val < 0)
        throw new Error('Invalid value: ' + name + '; ' + val);
  }
});
