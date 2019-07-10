const sha1 = require('sha1');
const { runTest, fetch, srv, log } = require('../fw');

log.cp.excluded.push(/\sI\s/);
fetch.logs = true;

let thash = sha1('abc');
let comments = [1, 2, 3].map(i => makeComment('Hello world! ' + i));

runTest(async () => {
  for (let body of comments)
    await fetch('POST', '/' + thash, { body });

  await testGetComments();

  await srv.stop();
  await srv.start();

  await testGetComments();
});

async function testGetComments() {
  let { body } = await fetch('GET', '/' + thash);

  for (let comm of comments)
    if (body.indexOf(comm) < 0)
      throw new Error('Comment missing in the response.');
}

function makeComment(text) {
  return [
    'User: qwerty',
    '',
    text,
  ].join('\n');
}
