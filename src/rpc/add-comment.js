const fs = require('fs');
const sha1 = require('sha1');
const log = require('../log');
const BadRequest = require('../bad-request');
const lru = require('../lru-cache');
const storage = require('../storage');

module.exports = async function rpcAddComment(topicHash, commentHash, commentBody) {
  let actualHash = sha1(commentBody);
  if (actualHash != commentHash)
    throw new BadRequest('Bad SHA1', 'Actual SHA1: ' + actualHash);

  if (!validateCommentSyntax(commentBody))
    throw new BadRequest('Bad Comment Syntax');

  let topicDir = storage.getTopicDir(topicHash);
  let commentFilePath = storage.getCommentFilePath(topicHash, commentHash);

  if (fs.existsSync(commentFilePath)) {
    log.i('Comment already exists.');
    return;
  }

  if (!fs.existsSync(topicDir)) {
    log.i('Adding topic /' + topicHash);
    fs.mkdirSync(topicDir);
  }

  log.i('Adding comment /' + commentHash);
  lru.topicsCache.del(topicHash);
  fs.writeFileSync(commentFilePath, commentBody, 'utf8');
};

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