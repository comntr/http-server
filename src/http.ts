import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import * as zlib from 'zlib';
import * as fs from 'fs';

import * as cmdargs from 'commander';
import * as mkdirp from 'mkdirp';
import * as sha1 from 'sha1';
import * as LRU from 'lru-cache';

import { log } from './log';
import * as hashutil from './hash-util';
import rules from './rules';
import { BadRequest } from './errors';
import QPSMeter from './qps';

const LRU_COMMENT_CACHE_SIZE = 1e4;
const LRU_DIR_CACHE_SIZE = 1e2;
const LRU_GET_CACHE_SIZE = 1e2;
const URL_GET_COMMENTS = /^\/[0-9a-f]{40}$/;
const URL_RPC_COMMENTS_COUNT = /^\/rpc\/GetCommentsCount$/;
const URL_ADD_COMMENT = /^\/[0-9a-f]{40}\/[0-9a-f]{40}$/;
const URL_QPS_SVG = /^\/stats\/qps\/(\w+)\.svg$/;
const CERT_DIR = '/etc/letsencrypt/archive/comntr.live/';
const CERT_KEY_FILE = 'privkey1.pem';
const CERT_FILE = 'cert1.pem';

const qps = {
  http: new QPSMeter,
  cget: new QPSMeter,
  cadd: new QPSMeter,
  nget: new QPSMeter,
};

log('>', process.argv.join(' '));

cmdargs
  .option('-p, --port <n>', 'HTTP port.', parseInt)
  .option('-r, --root <s>', 'Dir with the comments data.')
  .option('-z, --gzip <n>', 'GZips responses bigger than <n> bytes.')
  .option('-v, --verbose', 'Verbose logging.')
  .parse(process.argv);

log.i('Verbose logging?', cmdargs.verbose);
log.verbose = cmdargs.verbose;

const minGZipRspSize = cmdargs.gzip;
if (minGZipRspSize > 0) {
  log.i('Min gzip response size:', (minGZipRspSize / 1024).toFixed(1), 'KB');
} else {
  log.i('GZip disabled.');
}

const dataDir = path.resolve(cmdargs.root);
log.i('Data dir:', dataDir);
if (!fs.existsSync(dataDir))
  mkdirp.sync(dataDir);

let handlers = [];

function registerHandler(method, url, handler) {
  handlers.push({ method, url, handler });
  log.i('Registered handler:', method, url);
}

function matches(value, pattern) {
  return pattern.test ?
    pattern.test(value) :
    pattern == value;
}

registerHandler('GET', '/', handleGetRoot);
registerHandler('GET', URL_QPS_SVG, handleGetQpsSvg);
registerHandler('GET', '/stats/qps', handleGetQpsDashboard);
registerHandler('POST', URL_RPC_COMMENTS_COUNT, handleGetCommentsCount);
registerHandler('GET', URL_GET_COMMENTS, handleGetComments);
registerHandler('POST', URL_ADD_COMMENT, handleAddComment);
registerHandler('OPTIONS', /^\/.*$/, handleCorsPreflight);
log.i('All HTTP handlers registered.');

interface Rsp {
  statusCode?: number;
  statusMessage?: string;
  headers?: any;
  text?: string;
  html?: string;
  json?: any;
  body?: string;
}

let cachedComments = new LRU<string, string>(LRU_COMMENT_CACHE_SIZE); // comment sha1 -> comment
let cachedTopics = new LRU<string, string[]>(LRU_DIR_CACHE_SIZE); // topic sha1 -> comment sha1s
let cachedXorHashes = new LRU<string, string>(LRU_DIR_CACHE_SIZE); // topic sha1 -> xor of comment sha1s
let cachedGets = new LRU<string, Rsp>(LRU_GET_CACHE_SIZE); // GET url -> rsp

function getFilenames(topicId) {
  let filenames = cachedTopics.get(topicId);
  if (filenames) return filenames;
  let topicDir = getTopicDir(topicId);
  filenames = !fs.existsSync(topicDir) ? [] :
    fs.readdirSync(topicDir);
  cachedTopics.set(topicId, filenames);
  return filenames;
}

function getTopicXorHash(topicId) {
  let xorhash = cachedXorHashes.get(topicId);
  if (!xorhash) {
    let filenames = getFilenames(topicId);
    let binhashes = filenames.map(hashutil.hex2bin);
    let binxorhash = hashutil.xorall(binhashes);
    xorhash = hashutil.bin2hex(binxorhash);
  }
  cachedXorHashes.set(topicId, xorhash);
  return xorhash;
}

// Returns a dummy message to see that the server is alive.
//
// GET /
// HTTP 200
//
function handleGetRoot(req: http.IncomingMessage): Rsp {
  return { text: 'You have reached the comntr server.' };
}

// Returns SVG with the QPS counters.
//
// GET /stats/qps/http
// HTTP 200
function handleGetQpsSvg(req: http.IncomingMessage): Rsp {
  let stat = URL_QPS_SVG.exec(req.url)[1];
  let counter: QPSMeter = qps[stat];
  if (!counter) return { statusCode: 404 };
  let ctime = Date.now() / 1000 | 0;
  let [stime, nreqs] = counter.json;
  let nsize = nreqs.length;
  let avgqps = [];

  log.i(`ctime = ${ctime}; stime = ${stime}; diff = ${ctime - stime} s`);

  for (let dt = 0; dt < nsize; dt++) {
    let i = (ctime + 1 + dt) % nsize;
    let j = dt / 60 | 0;
    avgqps[j] = avgqps[j] || 0;
    avgqps[j] += nreqs[i] / 60;
  }

  let maxqps = Math.max(...avgqps);
  let mpath = avgqps.map((q, t) => `${t > 0 ? 'L' : 'M'} ${t} ${q.toFixed(2)}`).join(' ');

  let svg = `
    <svg viewBox="0 0 ${avgqps.length} ${Math.max(1, maxqps)}"
      preserveAspectRatio="none"
      transform="scale(1,-1)"
      xmlns="http://www.w3.org/2000/svg">

      <!-- max qps: ${maxqps} -->

      <path fill="none"
        stroke="black" stroke-width="2"
        vector-effect="non-scaling-stroke"
        d="${mpath}"/>

    </svg>`;

  return {
    headers: { 'Content-Type': 'image/svg+xml' },
    body: svg,
  };
}

function handleGetQpsDashboard(): Rsp {
  return {
    html: `
      <!doctype html>
      <html>
      <head>
        <title>QPS Dashboard</title>
        <style>
          body {
            display: flex;
            flex-wrap: wrap;
          }
          img {
            width: 250px;
            height: 250px;
            margin: 25px;
            background: #efe;
          }
        </style>
      </head>
      <body>
        <img src="/stats/qps/http.svg" title="All HTTP requests.">
        <img src="/stats/qps/cget.svg" title="GET comments.">
        <img src="/stats/qps/cadd.svg" title="POST comments.">
        <img src="/stats/qps/nget.svg" title="GET comments count.">
      </body>
      </html>
    `,
  };
}

// Handles the CORS preflight request.
//
// OPTIONS /<sha1>/...
// HTTP 200
//
function handleCorsPreflight(req: http.IncomingMessage): Rsp {
  return {
    headers: {
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE',
      'Access-Control-Allow-Headers': 'If-None-Match',
    }
  };
}

// Returns the number of comments in a topic.
//
// POST /rpc/GetCommentsCount
// [<sha1>, <sha1>, ...]
// HTTP 200
// [34, 2, ...]
//
async function handleGetCommentsCount(req: http.IncomingMessage): Promise<Rsp> {
  qps.nget.send();
  let reqBody = await downloadRequestBody(req);
  let topics = JSON.parse(reqBody);

  if (topics.length > 1)
    log.i('Topics:', topics.length);

  let counts = topics.map(topicHash => {
    let filenames = getFilenames(topicHash);
    return filenames.length;
  });

  return { json: counts };
}

// Returns all comments for a topic.
//
// GET /<sha1>
// HTTP 200
// <json>
//
function handleGetComments(req: http.IncomingMessage): Rsp {
  qps.cget.send();
  let topicHash = req.url.slice(1);
  let topicDir = getTopicDir(topicHash);
  log.i('Loading comments:', topicHash.slice(0, 8));

  if (!fs.existsSync(topicDir)) {
    log.i('No such topic.');
    return { json: {} };
  }

  let time = Date.now();
  let filenames = getFilenames(topicHash);
  log.i('fs.readdir:', Date.now() - time, 'ms');

  let time3 = Date.now();
  let serverXorHash = getTopicXorHash(topicHash);
  let clientXorHash = req.headers['if-none-match'];

  if (clientXorHash == serverXorHash) {
    log.i('ETag matched:', serverXorHash);
    return {
      statusCode: 304,
      statusMessage: 'Not Modified',
    };
  }

  log.i('ETag time:', Date.now() - time3, 'ms');

  let cached = cachedGets.get(req.url);
  if (cached) {
    log.i('Got cached response.');
    return cached;
  }

  let time2 = Date.now();
  let comments = [];

  for (let hash of filenames) {
    let text = cachedComments.get(hash);

    if (!text) {
      let filepath = path.join(topicDir, hash);
      text = fs.readFileSync(filepath, 'utf8');
      cachedComments.set(hash, text);
    }

    comments.push(text);
  }

  log.i('fs.readFile x ' + filenames.length + ':', Date.now() - time2, 'ms');

  let boundary = sha1(new Date().toJSON()).slice(0, 7);
  let contentType = 'multipart/mixed; boundary="' + boundary + '"';
  let response = comments.join('\n--' + boundary + '\n');
  let xorhash = getTopicXorHash(topicHash);
  log.i('xorhash:', xorhash);

  let rsp = {
    body: response,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'ETag': '"' + xorhash + '"',
    },
  };

  cachedGets.set(req.url, rsp);
  return rsp;
}

// Adds a comment to a topic.
//
// POST /<topic-sha1>/<comment-sha1>
// <text>
// HTTP 201
//
async function handleAddComment(req: http.IncomingMessage): Promise<Rsp> {
  qps.cadd.send();
  let [, topicHash, commentHash] = req.url.split('/');
  let commentBody = await downloadRequestBody(req);

  if (sha1(commentBody) != commentHash) {
    log.i('Actual SHA1:', sha1(commentBody));
    return {
      statusCode: 400,
      statusMessage: 'Bad SHA1',
    };
  }

  if (!validateCommentSyntax(commentBody)) {
    return {
      statusCode: 400,
      statusMessage: 'Bad Syntax',
    };
  }

  let topicDir = getTopicDir(topicHash);
  let commentFilePath = getCommentFilePath(topicHash, commentHash);

  if (fs.existsSync(commentFilePath)) {
    return {
      statusCode: 204,
      statusMessage: 'Already Exists',
    };
  }

  if (!fs.existsSync(topicDir)) {
    log.i('+ topic /' + topicHash);
    fs.mkdirSync(topicDir);
  }

  log.i('Adding comment:',
    commentHash.slice(0, 8), 'to', topicHash.slice(0, 8),
    ':', commentBody.length, 'bytes');

  cachedGets.del('/' + topicHash);
  cachedTopics.del(topicHash);
  cachedXorHashes.del(topicHash);
  fs.writeFileSync(commentFilePath, commentBody, 'utf8');
  return {
    statusCode: 201,
    statusMessage: 'Comment Added',
  };
}

async function handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  let htime = Date.now();
  log.v(req.method, req.url);
  qps.http.send();
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    let rsp = null;

    if (!rsp) {
      for (let { method, url, handler } of handlers) {
        if (!matches(req.method, method)) continue;
        if (!matches(req.url, url)) continue;
        rsp = await handler(req);
        break;
      }
    }

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
      let gzipped = await gzipText(rsp.body);
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
    if (err instanceof BadRequest) {
      log.w(err.message);
      res.statusCode = 400;
      res.statusMessage = err.message;
    } else {
      log.e(err);
      res.statusCode = 500;
      res.statusMessage = err.message;
      res.write(err.message);
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

function validateCommentSyntax(body: string) {
  let sep = body.indexOf('\n\n');

  if (sep < 0) {
    log.v('No \\n\\n separator.');
    return false;
  }

  let hdrs = body.slice(0, sep);
  let text = body.slice(sep + 2);

  // log.v('Headers:', JSON.stringify(hdrs));
  // log.v('Comment text:', JSON.stringify(text));

  if (!hdrs || !text) {
    log.v('Missing headers or comment text.');
    return false;
  }

  for (let header of hdrs.split('\n'))
    if (!/^\w+(-\w+)*: \S+$/.test(header)) {
      log.v('Bad header:', header);
      return false;
    }

  if (!/^\S[^\x00]+\S$/.test(text)) {
    log.v('Bad comment text.');
    return false;
  }

  return true;
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

function getCommentFilePath(topicHash: string, commentHash: string) {
  let topicDir = getTopicDir(topicHash);
  return path.join(topicDir, commentHash);
}

function getTopicDir(hash: string) {
  return path.join(dataDir, hash);
}

function downloadRequestBody(req: http.IncomingMessage) {
  let body = '';
  let size = 0;
  let aborted = false;
  let maxlen = rules.request.body.maxlen;

  return new Promise<string>((resolve, reject) => {
    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      let n = chunk.length;

      if (size + n > maxlen) {
        aborted = true;
        reject(new BadRequest('Request Too Large'));
      } else {
        body += chunk.toString();
        size += n;
      }
    });
    req.on('end', () => {
      if (!aborted) resolve(body);
    });
  });
}
