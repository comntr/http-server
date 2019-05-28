const LRU = require('lru-cache');

const LRU_COMMENT_CACHE_SIZE = 1e5;
const LRU_DIR_CACHE_SIZE = 100;

exports.commentsCache = new LRU(LRU_COMMENT_CACHE_SIZE); // comment sha1 -> comment
exports.topicsCache = new LRU(LRU_DIR_CACHE_SIZE); // topic sha1 -> comment sha1s