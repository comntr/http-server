import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import * as LRU from 'lru-cache';

import * as hashutil from './hash-util';
import { log } from './log';
import { Rsp } from './rsp';

const LRU_DIR_CACHE_SIZE = 1e2;
const LRU_COMMENT_CACHE_SIZE = 1e4;
const LRU_GET_CACHE_SIZE = 1e2;
const SHA1_PATTERN = /^[0-9a-f]{40}$/;
const RULES_FILENAME = '.rules';
const DEFAULT_TDIR_PATTERN = [3, 3]; // /d34/2bf/2213..., 4096 x 4096 x N/16M

let config = {
  tdirBase: '',
  tdirPattern: [],
};

export const cachedTopics = new LRU<string, string[]>(LRU_DIR_CACHE_SIZE); // topic sha1 -> comment sha1s
export const cachedXorHashes = new LRU<string, string>(LRU_DIR_CACHE_SIZE); // topic sha1 -> xor of comment sha1s
export const cachedComments = new LRU<string, string>(LRU_COMMENT_CACHE_SIZE); // comment sha1 -> comment
export const cachedGets = new LRU<string, Rsp>(LRU_GET_CACHE_SIZE); // GET url -> rsp

export function initStorage(dir: string, pattern: number[]) {
  config.tdirBase = path.resolve(dir);
  config.tdirPattern = pattern || DEFAULT_TDIR_PATTERN;
  log.i('Data dir:', config.tdirBase);
  log.i('Pattern:', config.tdirPattern);
  if (!fs.existsSync(config.tdirBase))
    mkdirp.sync(config.tdirBase);
}

/** Returns null if there are no rules. */
export function getTopicRules(thash: string): string {
  let tdir = getTopicDir(thash);
  let fpath = path.join(tdir, RULES_FILENAME);
  if (!fs.existsSync(fpath)) return null;
  let json = fs.readFileSync(fpath, 'utf8');
  return json;
}

export function setTopicRules(thash: string, json: string) {
  let tdir = getTopicDir(thash);
  let fpath = path.join(tdir, RULES_FILENAME);
  if (!fs.existsSync(tdir)) mkdirp.sync(tdir);
  fs.writeFileSync(fpath, json, 'utf8');
  log.i('Rules updated:', fpath, json);
}

export function getCommentFilePath(thash: string, chash: string) {
  let topicDir = getTopicDir(thash);
  return path.join(topicDir, chash);
}

export function getTopicDir(thash: string) {
  let parts = [], ibase = 0;
  for (let n of config.tdirPattern) {
    let part = thash.slice(ibase, ibase + n);
    parts.push(part);
    ibase += n;
  }
  parts.push(thash.slice(ibase));
  return path.join(config.tdirBase, ...parts);
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
