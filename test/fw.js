const cp = require('child_process');
const http = require('http');

let port = 26581;

let srv = cp.spawn('node', [
  'bin/http',
  '-p', port,
  '-r', '/tmp/comntr/' + Math.random(),
  '-z', 1024,
]);

srv.stdout.on('data', (data) => log.cp(srv.pid, data + ''));
srv.stderr.on('data', (data) => log.cp(srv.pid, data + ''));

process.on('SIGINT', () => exit(1));

function exit(code = 0) {
  srv.kill();
  process.exit(code);
}

function log(...args) {
  console.log(...args);
}

log.i = (...args) => log('I', ...args);
log.d = (...args) => log('D', ...args);

log.listeners = [];

log.cp = (pid, text) => {
  let lines = text.split(/\r?\n/g);

  for (let line of lines) {
    line = line.trimRight();
    if (!line) continue;

    if (!isLogExcluded(line))
      log(pid, '::', line);

    for (let listener of log.listeners)
      listener(line);
  }
};

function isLogExcluded(line) {
  for (let regex of log.cp.excluded)
    if (regex.test(line))
      return true;
  return false;
}

log.cp.excluded = [];

log.waitFor = pattern => new Promise(resolve => {
  log.i('Waiting for the srv log:', JSON.stringify(pattern));
  log.listeners.push(function listener(line = '') {
    if (line.indexOf(pattern) < 0) return;
    log.i('Detected the srv log:', JSON.stringify(pattern));
    let i = log.listeners.indexOf(listener);
    log.listeners.splice(i, 1);
    resolve(line);
  });
});

let srvReady = log.waitFor('I Listening on port ' + port);

async function runTest(test) {
  try {
    await srvReady;
    let time = Date.now();
    await test();
    log.i(Date.now() - time, 'ms');
    log.i('Test passed.');
    exit(0);
  } catch (err) {
    log.i('Test failed:', err);
    exit(1);
  }
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
      'Content-Length': body ? Buffer.byteLength(body) : 0,
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
        fetch.logs && log.i('<-', rsp.statusCode,
          rsp.statusMessage,
          JSON.stringify(rsp.body));
        resolve(rsp);
      });
      res.on('error', reject);
    });

    if (body) req.write(body);
    req.end();
    fetch.logs && log.i('->', method, path);
  });
}

fetch.logs = false;

module.exports = {
  runTest,
  log,
  fetch,
};