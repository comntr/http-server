// Implements per-room rules:
//
//    GET /<t-hash>/rules
//    POST /<t-hash>/rules
//

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

import * as sha1 from 'sha1';
import mkdirp = require('mkdirp');
import * as supercop from 'supercop.wasm';

import * as storage from './storage';
import { NotFound, BadRequest } from './errors';
import { log } from './log';
import { Rsp } from './rsp';
import { hex2bin } from './hash-util';
import { HttpHandler, HttpMethod } from './http-handler';

const URL_RULES_REGEX = /^[/]([0-9a-f]{40})[/]rules$/;
const RULES_FILENAME = '.rules';
const H_FILTER_TAG = 'X-Tag';
const H_SIGNATURE = 'X-Signature';
const H_PUBKEY = 'X-Public-Key';

let whenSupercopReady = new Promise(
  resolve => supercop.ready(
    () => resolve()));

@HttpHandler(URL_RULES_REGEX)
class RoomRulesHandler {

  @HttpMethod('GET')
  async get(req: http.IncomingMessage): Promise<Rsp> {
    let [, thash] = URL_RULES_REGEX.exec(req.url);
    let tdir = storage.getTopicDir(thash);
    let fpath = path.join(tdir, RULES_FILENAME);
    if (!fs.existsSync(fpath)) throw new NotFound();
    let json = fs.readFileSync(fpath, 'utf8');
    return { text: json };
  }

  @HttpMethod('POST')
  async set(req: http.IncomingMessage): Promise<Rsp> {
    let [, thash] = URL_RULES_REGEX.exec(req.url);
    let ftag = req.headers[H_FILTER_TAG.toLowerCase()] as string;
    let pubkey = req.headers[H_PUBKEY.toLowerCase()] as string;
    let signature = req.headers[H_SIGNATURE.toLowerCase()] as string;
    let tdir = storage.getTopicDir(thash);
    let fpath = path.join(tdir, RULES_FILENAME);
    let text = await storage.downloadRequestBody(req);

    if (!verifyJson(text))
      throw new BadRequest('Invalid JSON');

    if (!await verifySignature(text, thash, ftag, pubkey, signature))
      throw new BadRequest('Bad Signature');

    if (!fs.existsSync(tdir)) mkdirp.sync(tdir);
    fs.writeFileSync(fpath, text, 'utf8');
    log.i('Rules updated:', fpath);
    return { statusCode: 200 };
  }
}

function verifyJson(text: string) {
  try {
    JSON.parse(text);
    return true;
  } catch (err) {
    return false;
  }
}

async function verifySignature(
  payload: string,
  thash: string,
  tag: string,
  pubkey: string,
  signature: string) {

  if (!signature || !payload || !tag || !thash || !pubkey) {
    log.i('Missing signature/payload/etc. fields.');
    return false;
  }

  let ethash = sha1([
    sha1(pubkey),
    sha1(tag),
  ].join(''));

  if (ethash != thash) {
    log.i('Expected thash:', ethash);
    return false;
  }

  let payloadBytes = Buffer.from(payload);
  let pubkeyBytes = hex2bin(pubkey);
  let signatureBytes = hex2bin(signature);
  await whenSupercopReady;
  let matches = supercop.verify(signatureBytes, payloadBytes, pubkeyBytes);

  return matches;
}
