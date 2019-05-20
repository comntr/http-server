const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

const cmdargs = require('commander');
const mkdirp = require('mkdirp');
const sha1 = require('sha1');
const LRU = require('lru-cache');

const log = require('./log');

const LRU_COMMENT_CACHE_SIZE = 1e5;
const LRU_DIR_CACHE_SIZE = 100;
const GET_COMMENTS_URL = /^\/[0-9a-f]{40}$/;
const RPC_COMMENTS_COUNT_URL = /^\/rpc\/GetCommentsCount$$/;
const POST_COMMENT_URL = /^\/[0-9a-f]{40}\/[0-9a-f]{40}$/;
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
registerHandler('POST', RPC_COMMENTS_COUNT_URL, handleGetCommentsCount);
registerHandler('GET', GET_COMMENTS_URL, handleGetComments);
registerHandler('POST', POST_COMMENT_URL, handleAddComment);
log.i('All HTTP handlers registered.');

let commentsCache = new LRU(LRU_COMMENT_CACHE_SIZE); // comment sha1 -> comment
let topicsCache = new LRU(LRU_DIR_CACHE_SIZE); // topic sha1 -> comment sha1s

function getFilenames(topicId) {
  let filenames = topicsCache.get(topicId);
  if (filenames) return filenames;
  let topicDir = getTopicDir(topicId);
  filenames = !fs.existsSync(topicDir) ? [] :
    fs.readdirSync(topicDir);
  topicsCache.set(topicId, filenames);
  return filenames;
}

// Returns a dummy message to see that the server is alive.
//
// GET /
// HTTP 200
//
function handleGetRoot(req, res) {
  res.statusCode = 200;
  res.end('You have reached the comntr server.');
  return;
}

// Returns the number of comments in a topic.
//
// POST /rpc/GetCommentsCount
// [<sha1>, <sha1>, ...]
// HTTP 200
// [34, 2, ...]
//
async function handleGetCommentsCount(req, res) {
  let reqBody = await downloadRequestBody(req);
  let topics = JSON.parse(reqBody);
  log.i('Topics:', topics.length);

  let counts = topics.map(topicHash => {
    let filenames = getFilenames(topicHash);
    return filenames.length;
  });

  res.statusCode = 200;
  return JSON.stringify(counts);
}

// Returns all comments for a topic.
//
// GET /<sha1>
// HTTP 200
// <json>
//
function handleGetComments(req, res) {
  let topicHash = req.url.slice(1);
  let topicDir = getTopicDir(topicHash);
  log.i('Loading comments.');

  if (!fs.existsSync(topicDir)) {
    log.i('No such topic.');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return '{}';
  }

  let time = Date.now();
  let filenames = getFilenames(topicHash);
  log.i('Comments:', filenames.length);
  log.i('fs.readdir:', Date.now() - time, 'ms');

  let time2 = Date.now();
  let comments = [];

  for (let hash of filenames) {
    let text = commentsCache.get(hash);

    if (!text) {
      let filepath = path.join(topicDir, hash);
      text = fs.readFileSync(filepath, 'utf8');
      commentsCache.set(hash, text);
    }

    comments.push(text);
  }

  log.i('fs.readFile:', Date.now() - time2, 'ms');

  let boundary = sha1(new Date().toJSON()).slice(0, 7);
  let contentType = 'multipart/mixed; boundary="' + boundary + '"';
  let response = comments.join('\n--' + boundary + '\n');

  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  return response;
}

// Adds a comment to a topic.
//
// POST /<topic-sha1>/<comment-sha1>
// <text>
// HTTP 201
//
async function handleAddComment(req, res) {
  let [, topicHash, commentHash] = req.url.split('/');
  let commentBody = await downloadRequestBody(req);

  if (sha1(commentBody) != commentHash) {
    log.i('Actual SHA1:', sha1(commentBody));
    res.statusCode = 400;
    res.statusMessage = 'Bad SHA1';
    return;
  }

  if (!validateCommentSyntax(commentBody)) {
    res.statusCode = 400;
    res.statusMessage = 'Bad Syntax';
    return;
  }

  let topicDir = getTopicDir(topicHash);
  let commentFilePath = getCommentFilePath(topicHash, commentHash);

  if (fs.existsSync(commentFilePath)) {
    res.statusCode = 204;
    res.statusMessage = 'Already Exists';
    return;
  }

  if (!fs.existsSync(topicDir)) {
    log.i('+ topic /' + topicHash);
    fs.mkdirSync(topicDir);
  }

  log.i('Adding comment /' + commentHash);
  topicsCache.del(topicHash);
  fs.writeFileSync(commentFilePath, commentBody, 'utf8');
  res.statusCode = 201;
  res.statusMessage = 'Comment Added';
  return;
}

async function handleHttpRequest(req, res) {
  log.i(req.method, req.url);
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    for (let { method, url, handler } of handlers) {
      if (!matches(req.method, method)) continue;
      if (!matches(req.url, url)) continue;
      let time = Date.now();
      let body = await handler(req, res);
      let diff = Date.now() - time;
      res.setHeader('Duration', diff);
      res.setHeader('Access-Control-Expose-Headers', 'Duration');
      if (typeof body == 'string') {
        res.setHeader('Content-Length', body.length);
        res.write(body);
      }
      log.i('HTTP', res.statusCode, 'in', diff, 'ms');
      res.end();
      return;
    }

    log.w('Unhandled request.');
    res.statusCode = 400;
    res.end();
  } catch (err) {
    log.e(err);
    res.statusCode = 500;
    res.statusMessage = (err && err.message || '') + '';
    res.end((err && err.stack || err) + '');
  }
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
    log.i('Starting HTTP+SSL server on port', cmdargs.port);
    let key = fs.readFileSync(path.join(CERT_DIR, CERT_KEY_FILE));
    let cert = fs.readFileSync(path.join(CERT_DIR, CERT_FILE));
    return https.createServer({ key, cert }, handleHttpRequest);
  } else {
    log.i('Starting HTTP server on port', cmdargs.port);
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
