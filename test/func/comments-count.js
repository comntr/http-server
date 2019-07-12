const sha1 = require('sha1');
const { runTest, fetch, srv, log } = require('../fw');

log.cp.excluded.push(/\sI\s/);

runTest(async () => {
  let thash1 = sha1('a');
  let thash2 = sha1('b');
  let thash3 = sha1('c');

  await fetch('POST', '/' + thash1, { body: makeComment(11) });

  await fetch('POST', '/' + thash2, { body: makeComment(21) });
  await fetch('POST', '/' + thash2, { body: makeComment(22) });

  await fetch('POST', '/' + thash3, { body: makeComment(31) });
  await fetch('POST', '/' + thash3, { body: makeComment(32) });
  await fetch('POST', '/' + thash3, { body: makeComment(33) });

  let res = await fetch('POST', '/rpc/GetCommentsCount', {
    json: [
      thash1,
      thash2,
      thash3,
    ],
  });

  if (res.body != '[1,2,3]')
    throw new Error('Wrong response.');
});

function makeComment(text) {
  return [
    'User: qwerty',
    '',
    text,
    sha1(text),
  ].join('\n');
}
