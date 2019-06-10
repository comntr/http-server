const cp = require('child_process');
const http = require('http');
const sha1 = require('sha1');

let runid = Math.random().toString(16).slice(2);
let port = 55271;

let ntopics = 1500;
let ncomments = 25;
let nmaxreqs = 50;

let srv = cp.spawn('node', [
  'bin/http',
  '-p', port,
  '-r', '/tmp/comntr/' + runid,
  '-z', 1024,
]);

srv.stdout.on('data', (data) => !/\sI\s/.test(data) && log.cp(srv.pid, data + ''));
srv.stderr.on('data', (data) => log.cp(srv.pid, data + ''));

process.on('SIGINT', exit);

function exit() {
  srv.kill();
  process.exit();
}

function log(...args) {
  console.log(...args);
}

log.i = (...args) => log('I', ...args);
log.d = (...args) => log('D', ...args);

log.cp = (pid, text) => {
  let lines = text.split(/\r?\n/g);
  for (let line of lines)
    if (line.trim())
      log(pid, '::', line.trim());
};

setTimeout(async () => {
  try {
    log.i('Starting the test.');
    let time = Date.now();
    await start();
    let dt = Date.now() - time;
    let qps = ntopics * ncomments / dt * 1000 | 0;
    log.i('Test completed in', dt, 'ms');
    log.i('Average QPS:', qps);
  } finally {
    exit();
  }
}, 2500);

async function start() {
  log.i('# of topics:', ntopics);
  log.i('# of comments:', ncomments);
  log.i('# max outstanding requests:', nmaxreqs);

  let remaining = ntopics * ncomments;
  let pending = 0;

  let timer = setInterval(() => {
    let pp = 1 - remaining / (ntopics * ncomments);
    log.i(pp.toFixed(2), 'requests completed');
  }, 1000);

  function refill(resolve, reject) {
    while (pending < nmaxreqs) {
      pending++;
      addRandomComment().then(
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
  if (res.statusCode != 201) throw new Error(res.statusCode + ' ' + res.statusMessage);
}

function fetch(method, path, { body, json, headers = {} } = {}) {
  if (json) {
    body = JSON.stringify(json);
    headers['Content-Type'] = 'application/json';
  }

  let options = {
    host: '127.0.0.1',
    port: port,
    path: path,
    method: method,
    headers: {
      'Content-Length': Buffer.byteLength(body),
      ...headers,
    }
  };

  return new Promise((resolve, reject) => {
    let req = http.request(options, res => {
      let rsp = {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        body: '',
      };
      res.setEncoding('utf8');
      res.on('data', (data) => rsp.body += data);
      res.on('end', () => {
        // log.i('<-', rsp.statusCode, rsp.statusMessage, rsp.body);
        resolve(rsp);
      });
      res.on('error', reject);
    });

    req.write(body);
    req.end();
    // log.i('->', method, path);
  });
}
