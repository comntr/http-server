const { runTest, fetch, log } = require('../fw');

log.cp.excluded.push(/\sI\s/);
fetch.logs = true;

runTest(async () => {
  let res = await fetch('OPTIONS', '/foo/bar', {
    headers: {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'ETag,If-None-Match',
    },
  });
  if (res.statusCode != 200)
    throw new Error('Wrong response status.');
  if (res.headers['access-control-allow-origin'] != '*')
    throw new Error('Wrong response headers.');
  if (res.headers['access-control-allow-methods'] != 'POST')
    throw new Error('Wrong response headers.');
  if (res.headers['access-control-allow-headers'] != 'ETag,If-None-Match')
    throw new Error('Wrong response headers.');
});
