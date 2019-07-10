const { runTest, fetch, log } = require('../fw');
const sha1 = require('sha1');

log.cp.excluded.push(/\sI\s/);
fetch.logs = true;

runTest(async () => {
  let thash = 'cfd91dfe7672d74e4af604aeaa6e7423a44bfda2';
  let uhash = '2a9f985ea5ca1f1e499a58b43a6a51d973d921f8';

  let res = await fetch('POST', `/${thash}/rules`, {
    body: `{"owner":"${uhash}"}`,
    headers: {
      'x-public-key': 'bc15c5842aed5f6fe166914302d7e68aed32b6b7d5638143e9eaa903a9516ec3',
      'x-signature': '98a2b4a0d0bac634e6809fdee67fe0660b66eed22ccf4cbefe4d8785760560c2411ee1e45cb39fd1d870585fbc044a9b18e39e8bbddce36f63299b8fe4b82701',
      'x-tag': 'sdfsf',
    },
  });

  if (res.statusCode != 200)
    throw new Error('Wrong response.');
});
