import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import * as LRU from 'lru-cache';

import * as hashutil from './hash-util';
import { BadRequest } from './errors';
import { log } from './log';
import rules from './rules';
import { Rsp } from './rsp';

const LRU_DIR_CACHE_SIZE = 1e2;
const LRU_COMMENT_CACHE_SIZE = 1e4;
const LRU_GET_CACHE_SIZE = 1e2;
const SHA1_PATTERN = /^[0-9a-f]{40}$/;

let dataDir = '';

export const cachedTopics = new LRU<string, string[]>(LRU_DIR_CACHE_SIZE); // topic sha1 -> comment sha1s
export const cachedXorHashes = new LRU<string, string>(LRU_DIR_CACHE_SIZE); // topic sha1 -> xor of comment sha1s
export const cachedComments = new LRU<string, string>(LRU_COMMENT_CACHE_SIZE); // comment sha1 -> comment
export const cachedGets = new LRU<string, Rsp>(LRU_GET_CACHE_SIZE); // GET url -> rsp

export function initStorage(dir: string) {
  dataDir = path.resolve(dir);
  log.i('Data dir:', dataDir);
  if (!fs.existsSync(dataDir))
    mkdirp.sync(dataDir);
}

export function getCommentFilePath(thash: string, chash: string) {
  let topicDir = getTopicDir(thash);
  return path.join(topicDir, chash);
}

export function getTopicDir(thash: string) {
  return path.join(dataDir, thash);
}

export function downloadRequestBody(req: http.IncomingMessage) {
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

export function getFilenames(topicId) {
  let filenames = cachedTopics.get(topicId);
  if (filenames) return filenames;
  let topicDir = getTopicDir(topicId);
  filenames = !fs.existsSync(topicDir) ? [] :
    fs.readdirSync(topicDir);
  filenames = filenames.filter(name => SHA1_PATTERN.test(name));
  cachedTopics.set(topicId, filenames);
  return filenames;
}

export function getTopicXorHash(topicId) {
  let xorhash = cachedXorHashes.get(topicId);
  if (!xorhash) {
    let filenames = getFilenames(topicId);
    if (!filenames.length) return null;
    let binhashes = filenames.map(hashutil.hex2bin);
    let binxorhash = hashutil.xorall(binhashes);
    xorhash = hashutil.bin2hex(binxorhash);
  }
  cachedXorHashes.set(topicId, xorhash);
  return xorhash;
}