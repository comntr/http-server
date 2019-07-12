const { runTest, fetch, log } = require('../fw');

const STAT_NAMES = ['http', 'cget', 'cadd', 'nget'];
const VALID_RESP = /^\[\d+,\[\d+(,\d+)+\]\]$/;

log.cp.excluded.push(/\sI\s/);

runTest(async () => {
  for (let stat of STAT_NAMES) {
    let res = await fetch('GET', '/stats/qps/' + stat);
    if (!VALID_RESP.test(res.body))
      throw new Error('Wrong response.');
  }
});
