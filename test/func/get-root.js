const { runTest, fetch, log } = require('../fw');

log.cp.excluded.push(/\sI\s/);
fetch.logs = true;

runTest(async () => {
  let res = await fetch('GET', '/');
  if (res.body != 'You have reached the comntr server.')
    throw new Error('Wrong response.');
});
