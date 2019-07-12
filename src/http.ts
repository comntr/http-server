import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as cmdargs from 'commander';

import { log } from './log';
import { HttpError } from './errors';
import { executeHandler } from './handlers/http-handler';
import * as storage from './storage';
import * as qps from './qps';

import './handlers/cors-preflight';
import './handlers/comments-count';
import './handlers/stats-qps';
import './handlers/room-rules';
import './handlers/comments';
import './handlers/root';

const CERT_DIR = '/etc/letsencrypt/archive/comntr.live/';
const CERT_KEY_FILE = 'privkey1.pem';
const CERT_FILE = 'cert1.pem';

log('>', process.argv.join(' '));

cmdargs
  .option('-p, --port <n>', 'HTTP port.', parseInt)
  .option('-r, --root <s>', 'Dir with the comments data.')
  .option('-t, --tdirp <j>', 'e.g. [2,4] turns thash into /4f/67f0/27aa...')
  .option('-z, --gzip <n>', 'GZips responses bigger than <n> bytes.')
  .option('-v, --verbose', 'Verbose logging.')
  .parse(process.argv);

log.verbose = cmdargs.verbose || false;
log.i('Verbose logging?', log.verbose);

const minGZipRspSize = cmdargs.gzip;
if (minGZipRspSize > 0) {
  log.i('Min gzip response size:', (minGZipRspSize / 1024).toFixed(1), 'KB');
} else {
  log.i('GZip disabled.');
}

storage.initStorage(
  cmdargs.root,
  cmdargs.tdirp && JSON.parse(cmdargs.tdirp));

async function handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  let htime = Date.now();
  log.v(req.method, req.url);
  qps.http.send();
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    let rsp = await executeHandler(req);

    if (!rsp) {
      rsp = {
        statusCode: 400,
        statusMessage: 'Unhandled request',
      };
    }

    let useGZip = typeof rsp.body == 'string' &&
      minGZipRspSize > 0 && rsp.body.length > minGZipRspSize;

    if (useGZip) {
      let gtime = Date.now();
      let gzipped = await gzipText(rsp.body as string);
      log.i('gzip time:', Date.now() - gtime, 'ms');
      rsp.body = gzipped;
      rsp.headers = {
        ...rsp.headers,
        'Content-Encoding': 'gzip',
      };
    }

    for (let name in rsp.headers || {}) {
      res.setHeader(name, rsp.headers[name]);
    }

    if (rsp.text) {
      res.setHeader('Content-Type', 'text/plain');
      res.write(rsp.text);
    } else if (rsp.json) {
      res.setHeader('Content-Type', 'application/json');
      res.write(JSON.stringify(rsp.json));
    } else if (rsp.html) {
      res.setHeader('Content-Type', 'text/html');
      res.write(rsp.html);
    } else if (rsp.body) {
      res.write(rsp.body);
    }

    res.statusCode = rsp.statusCode || 200;
    res.statusMessage = rsp.statusMessage || '';
  } catch (err) {
    if (err instanceof HttpError) {
      log.w(err.message);
      res.statusCode = err.code;
      res.statusMessage = err.status;
      res.write(err.description);
    } else {
      log.e(err);
      res.statusCode = 500;
    }
  } finally {
    res.end();
    log.v('HTTP', res.statusCode, 'in', Date.now() - htime, 'ms');
  }
}

function gzipText(text: string) {
  return new Promise<Buffer>((resolve, reject) => {
    zlib.gzip(text, (err, buf) => {
      if (err) {
        reject(err);
      } else {
        resolve(buf);
      }
    });
  });
}

function createServer() {
  log.i('Checking the cert dir:', CERT_DIR);
  if (fs.existsSync(CERT_DIR)) {
    log.i('Starting HTTPS server.');
    let key = fs.readFileSync(path.join(CERT_DIR, CERT_KEY_FILE));
    let cert = fs.readFileSync(path.join(CERT_DIR, CERT_FILE));
    return https.createServer({ key, cert }, handleHttpRequest);
  } else {
    log.w('SSL certs not found.');
    log.i('Starting HTTP server.');
    return http.createServer(handleHttpRequest);
  }
}

let server = createServer();
server.listen(cmdargs.port);
server.on('error', err => log.e(err));
server.on('listening', () => log.i('Listening on port', cmdargs.port));
