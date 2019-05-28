const path = require('path');
const fs = require('fs');
const log = require('../log');
const lru = require('../lru-cache');
const storage = require('../storage');

module.exports = function rpcGetComments(topicHash) {
  let topicDir = storage.getTopicDir(topicHash);
  log.i('Loading comments.');

  if (!fs.existsSync(topicDir)) {
    log.i('No such topic.');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return '{}';
  }

  let time = Date.now();
  let filenames = storage.getFilenames(topicHash);
  log.i('Comments:', filenames.length);
  log.i('fs.readdir:', Date.now() - time, 'ms');

  let time2 = Date.now();
  let comments = {}; // comment hash -> comment data

  for (let hash of filenames) {
    let text = lru.commentsCache.get(hash);

    if (!text) {
      let filepath = path.join(topicDir, hash);
      text = fs.readFileSync(filepath, 'utf8');
      lru.commentsCache.set(hash, text);
    }

    comments[hash] = text;
  }

  log.i('fs.readFile:', Date.now() - time2, 'ms');
  return comments;
};
