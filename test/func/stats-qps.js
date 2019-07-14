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
});
