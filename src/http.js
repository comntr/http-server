const https = require('https');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const fs = require('fs');

const cmdargs = require('commander');
const mkdirp = require('mkdirp');
const sha1 = require('sha1');
const LRU = require('lru-cache');

const log = require('./log');

const LRU_COMMENT_CACHE_SIZE = 1e5;
const LRU_DIR_CACHE_SIZE = 100;
const LRU_GET_CACHE_SIZE = 100;
const URL_GET_COMMENTS = /^\/[0-9a-f]{40}$/;
const URL_RPC_COMMENTS_COUNT = /^\/rpc\/GetCommentsCount$/;
const URL_ADD_COMMENT = /^\/[0-9a-f]{40}\/[0-9a-f]{40}$/;
const CERT_DIR = '/etc/letsencrypt/archive/comntr.live/';
const CERT_KEY_FILE = 'privkey1.pem';
const CERT_FILE = 'cert1.pem';

cmdargs
  .option('-p, --port <n>', 'HTTP port.', parseInt)
  .option('-r, --root <s>', 'Dir with the comments data.')
  .option('-z, --gzip <n>', 'GZips responses bigger than <n> bytes.')
  .parse(process.argv);

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
registerHandler('POST', URL_RPC_COMMENTS_COUNT, handleGetCommentsCount);
registerHandler('GET', URL_GET_COMMENTS, handleGetComments);
registerHandler('POST', URL_ADD_COMMENT, handleAddComment);
log.i('All HTTP handlers registered.');

let cachedComments = new LRU(LRU_COMMENT_CACHE_SIZE); // comment sha1 -> comment
let cachedTopics = new LRU(LRU_DIR_CACHE_SIZE); // topic sha1 -> comment sha1s
let cachedGets = new LRU(LRU_GET_CACHE_SIZE); // GET url -> rsp

function getFilenames(topicId) {
  let filenames = cachedTopics.get(topicId);
  if (filenames) return filenames;
  let topicDir = getTopicDir(topicId);
  filenames = !fs.existsSync(topicDir) ? [] :
    fs.readdirSync(topicDir);
  cachedTopics.set(topicId, filenames);
  return filenames;
}

// Returns a dummy message to see that the server is alive.
//
// GET /
// HTTP 200
//
function handleGetRoot(req) {
  return { text: 'You have reached the comntr server.' };
}

// Returns the number of comments in a topic.
//
// POST /rpc/GetCommentsCount
// [<sha1>, <sha1>, ...]
// HTTP 200
// [34, 2, ...]
//
async function handleGetCommentsCount(req) {
  let reqBody = await downloadRequestBody(req);
  let topics = JSON.parse(reqBody);
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
function handleGetComments(req) {
  let topicHash = req.url.slice(1);
  let topicDir = getTopicDir(topicHash);
  log.i('Loading comments.');

  if (!fs.existsSync(topicDir)) {
    log.i('No such topic.');
    return { json: {} };
  }

  let time = Date.now();
  let filenames = getFilenames(topicHash);
  log.i('fs.readdir:', Date.now() - time, 'ms');

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

  return {
    body: response,
    headers: { 'Content-Type': contentType },
  };
}

// Adds a comment to a topic.
//
// POST /<topic-sha1>/<comment-sha1>
// <text>
// HTTP 201
//
async function handleAddComment(req) {
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

  log.i('Adding comment /' + commentHash);
  cachedGets.del('/' + topicHash);
  cachedTopics.del(topicHash);
  fs.writeFileSync(commentFilePath, commentBody, 'utf8');
  return {
    statusCode: 201,
    statusMessage: 'Comment Added',
  };
}

async function handleHttpRequest(req, res) {
  let htime = Date.now();
  log.i(req.method, req.url);
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    let rsp = null;

    if (req.method == 'GET') {
      let cached = cachedGets.get(req.url);
      if (cached) {
        log.i('Got cached response.');
        rsp = cached;
      }
    }

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

    if (req.method == 'GET' && URL_GET_COMMENTS.test(req.url)) {
      cachedGets.set(req.url, rsp);
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
    } else if (rsp.body) {
      res.write(rsp.body);
    }

    res.statusCode = rsp.statusCode || 200;
    res.statusMessage = rsp.statusMessage || '';
  } catch (err) {
    log.e(err);
    res.statusCode = 500;
    res.statusMessage = (err && err.message || '') + '';
    res.write((err && err.stack || err) + '');
  } finally {
    res.end();
    log.i('HTTP', res.statusCode, 'in', Date.now() - htime, 'ms');
  }
}

function gzipText(text) {
  return new Promise((resolve, reject) => {
    zlib.gzip(text, (err, buf) => {
      if (err) {
        reject(err);
      } else {
        resolve(buf);
      }
    });
  });
}

function validateCommentSyntax(body) {
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
    if (!/^\w+: \S+$/.test(header)) {
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

server.listen(cmdargs.port, err => {
  if (err) {
    log.e(err);
  } else {
    log.i('Listening on port', cmdargs.port);
  }
});

function getCommentFilePath(topicHash, commentHash) {
  let topicDir = getTopicDir(topicHash);
  return path.join(topicDir, commentHash);
}

function getTopicDir(hash) {
  return path.join(dataDir, hash);
}

function downloadRequestBody(req) {
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
