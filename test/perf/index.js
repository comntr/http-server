const { runTest, log, fetch } = require('../fw');
const sha1 = require('sha1');

const N_TOPICS = 250;
const N_COMMENTS = 75;
const N_GETS = 1500;
const N_MAXREQS = 25;

log.cp.excluded.push(/\sI\s/);

runTest(async () => {
  log.i('Adding comments.');
  await measure(addRandomComment, N_TOPICS * N_COMMENTS);

  log.i('Getting comments for the same topic.');
  await measure(getSameComments, N_GETS);

  log.i('Getting comments for random topics.');
  await measure(getRandomComments, N_GETS);
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
    while (pending < N_MAXREQS) {
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
  let thash = sha1(Math.random() * N_TOPICS | 0);
  let res = await fetch('GET', '/' + thash);
  if (res.statusCode != 200)
    throw new Error(res.statusCode + ' ' + res.statusMessage);
  // log.i('Comments:', res.body);
}

async function getSameComments() {
  let thash = sha1(0);
  let res = await fetch('GET', '/' + thash);
  if (res.statusCode != 200)
    throw new Error(res.statusCode + ' ' + res.statusMessage);
  // log.i('Comments:', res.body);
}

async function addRandomComment() {
  let thash = sha1(Math.random() * N_TOPICS | 0);
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
