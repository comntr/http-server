const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

const cmdargs = require('commander');
const mkdirp = require('mkdirp');

const BadRequest = require('./bad-request');
const log = require('./log');

const RPC_CALL_URL = /^\/rpc\/(\w+)$/;
const RPC_RES_SAMPLE_LEN = 40;
const CERT_DIR = '/etc/letsencrypt/archive/comntr.live/';
const CERT_KEY_FILE = 'privkey1.pem';
const CERT_FILE = 'cert1.pem';

cmdargs
  .option('-p, --port <n>', 'HTTP port.', parseInt)
  .option('-r, --root <s>', 'Dir with the comments data.')
  .parse(process.argv);

const dataDir = path.resolve(cmdargs.root);
log.i('Data dir:', dataDir);
if (!fs.existsSync(dataDir))
  mkdirp.sync(dataDir);

let httpHandlers = [];

function registerHandler(method, url, handler) {
  httpHandlers.push({ method, url, handler });
  log.i('Registered handler:', method, url);
}

function matches(value, pattern) {
  return pattern.test ?
    pattern.test(value) :
    pattern == value;
}

registerHandler('GET', '/', handleGetRoot);
registerHandler('POST', RPC_CALL_URL, handleRpcCall);
log.i('HTTP handlers registered.');

const rpcHandlers = {}; // rpc name -> rpc handler

rpcHandlers.GetSize = require('./rpc/get-size');
rpcHandlers.AddComment = require('./rpc/add-comment');
rpcHandlers.GetComments = require('./rpc/get-comments');

log.i('RPC handlers registered:', ['', ...Object.keys(rpcHandlers)].join('\n  '));

function handleGetRoot(req, res) {
  res.statusCode = 200;
  res.end('You have reached the comntr server.');
  return;
}

async function handleRpcCall(req, res) {
  let [, rpcName] = RPC_CALL_URL.exec(req.url);
  log.i('rpc.' + rpcName);
  let time = Date.now();
  try {
    let handler = rpcHandlers[rpcName];
    if (!handler) throw new Error('No such RPC.');
    let rpcBody = await readRequestBody(req);
    let rpcArgs = JSON.parse(rpcBody);
    if (!Array.isArray(rpcArgs)) throw new Error('RPC args must be an array.');
    let rpcRes = await handler(...rpcArgs);
    res.setHeader('Content-Type', 'application/json');
    let json = JSON.stringify(rpcRes);
    log.i('rpc.' + rpcName, Date.now() - time, 'ms', json.slice(0, RPC_RES_SAMPLE_LEN));
    return json;
  } catch (err) {
    log.e('rpc.' + rpcName, Date.now() - time, 'ms', err);
    if (err instanceof BadRequest) {
      res.statusCode = 400;
      res.statusMessage = err.status;
      res.write(err.details);
    } else {
      throw err;
    }
  }
}

async function handleHttpRequest(req, res) {
  log.i(req.method, req.url);
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    for (let { method, url, handler } of httpHandlers) {
      if (!matches(req.method, method)) continue;
      if (!matches(req.url, url)) continue;
      let time = Date.now();
      let body = await handler(req, res);
      let diff = Date.now() - time;
      res.setHeader('Duration', diff);
      res.setHeader('Access-Control-Expose-Headers', 'Duration');
      if (typeof body == 'string') res.write(body);
      log.i('HTTP', res.statusCode, 'in', diff, 'ms');
      res.end();
      return;
    }

    log.w('Unhandled request.');
    res.statusCode = 400;
    res.statusMessage = 'Unrecognized HTTP Request';
    res.end();
  } catch (err) {
    log.e(err);
    res.statusCode = 500;
    res.statusMessage = err.message;
    res.end();
  }
}

function createServer() {
  log.i('Checking the cert dir:', CERT_DIR);
  if (fs.existsSync(CERT_DIR)) {
    log.i('Starting HTTPS server on port', cmdargs.port);
    let key = fs.readFileSync(path.join(CERT_DIR, CERT_KEY_FILE));
    let cert = fs.readFileSync(path.join(CERT_DIR, CERT_FILE));
    return https.createServer({ key, cert }, handleHttpRequest);
  } else {
    log.w('No cert found. Starting HTTP server on port', cmdargs.port);
    return http.createServer(handleHttpRequest);
  }
}

let server = createServer();

server.listen(cmdargs.port, err => {
  if (err) {
    log.e(err);
  } else {
    log.i('Server started.');
  }
});

function readRequestBody(req) {
  let body = '';
  return new Promise(resolve => {
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
  });
}
