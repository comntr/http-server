const { runTest, fetch } = require('../fw');

runTest(async () => {
  let res = await fetch('GET', '/');
  if (res.body != 'You have reached the comntr server.')
    throw new Error('Wrong response.');
});
