const path = require('path');
const fs = require('fs');
const lru = require('./lru-cache');

exports.getFilenames = function getFilenames(topicId) {
  let filenames = lru.topicsCache.get(topicId);
  if (filenames) return filenames;
  let topicDir = getTopicDir(topicId);
  filenames = !fs.existsSync(topicDir) ? [] :
    fs.readdirSync(topicDir);
  lru.topicsCache.set(topicId, filenames);
  return filenames;
};

exports.getCommentFilePath = function getCommentFilePath(topicHash, commentHash) {
  let topicDir = getTopicDir(topicHash);
  return path.join(topicDir, commentHash);
};

exports.getTopicDir = function getTopicDir(hash) {
  return path.join(dataDir, hash);
};
