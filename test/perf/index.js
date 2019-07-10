const { runTest, log, fetch } = require('../fw');
const sha1 = require('sha1');

let ntopics = 250;
let ncomments = 25;
let ngetcomments = 1e3;
let nmaxreqs = 50;

log.cp.excluded.push(/\sI\s/);

runTest(async () => {
  log.i('Adding comments.');
  log.i('# of topics:', ntopics);
  log.i('# of comments:', ncomments);
  log.i('# max outstanding requests:', nmaxreqs);
  await measure(addRandomComment, ntopics * ncomments);

  log.i('Getting comments.');
  log.i('# of gets:', ngetcomments);
  log.i('# max outstanding requests:', nmaxreqs);
  await measure(getRandomComments, ngetcomments);
});

async function measure(sendreq, total) {
  let time = Date.now();
  await start(sendreq, total);
  let dt = Date.now() - time;
  let qps = total / dt * 1000 | 0;
  log.i('QPS:', qps);
}

async function start(sendreq, total) {
  let remaining = total;
  let pending = 0;

  let timer = setInterval(() => {
    let pp = 1 - remaining / total;
    log.i(`${pp * 100 | 0}% completed`);
  }, 1000);

  function refill(resolve, reject) {
    while (pending < nmaxreqs) {
      pending++;
      sendreq().then(
        () => {
          pending--;
          remaining--;
          if (!remaining) {
            clearInterval(timer);
            resolve();
          } else {
            refill(resolve, reject);
          }
        },
        err => {
          clearInterval(timer);
          reject(err);
        });
    }
  }

  return new Promise(refill);
}

async function getRandomComments() {
  let thash = sha1(Math.random() * ntopics | 0);
  let res = await fetch('GET', '/' + thash);
  if (res.statusCode != 200)
    throw new Error(res.statusCode + ' ' + res.statusMessage);
  // log.i('Comments:', res.body);
}

async function addRandomComment() {
  let thash = sha1(Math.random() * ntopics | 0);
  let ctext = Math.random().toString(16).slice(2);
  let body = [
    'Date: ' + new Date().toJSON(),
    'Parent: ' + thash,
    '',
    ctext,
  ].join('\n');
  let chash = sha1(body);
  let res = await fetch('POST', '/' + thash + '/' + chash, { body });
  if (res.statusCode != 201)
    throw new Error(res.statusCode + ' ' + res.statusMessage);
}
