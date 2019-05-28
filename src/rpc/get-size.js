const storage = require('../storage');

module.exports = function rpcGetSize(topicHash) {
  let filenames = storage.getFilenames(topicHash);
  return filenames.length;
};