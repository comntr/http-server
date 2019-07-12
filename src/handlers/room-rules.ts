// Implements per-room rules:
//
//    GET /<t-hash>/rules
//    POST /<t-hash>/rules
//

import * as http from 'http';
import * as sha1 from 'sha1';

import { getSupercop } from '../ed25519';
import * as storage from '../storage';
import { NotFound, BadRequest, Unauthorized } from '../errors';
import { log } from '../log';
import { Rsp } from '../rsp';
import { hex2bin } from '../hash-util';
import { HttpHandler, HttpMethod } from './http-handler';
import { downloadRequestBody } from '../http-util';

const URL_RULES_REGEX = /^[/]([0-9a-f]{40})[/]rules$/;
const H_FILTER_TAG = 'X-Tag';
const H_SIGNATURE = 'X-Signature';
const H_PUBKEY = 'X-Public-Key';

@HttpHandler(URL_RULES_REGEX)
class RoomRulesHandler {

  @HttpMethod('GET')
  async get(req: http.IncomingMessage): Promise<Rsp> {
    let [, thash] = URL_RULES_REGEX.exec(req.url);
    let json = storage.getTopicRules(thash);
    if (!json) throw new NotFound();
    return { text: json };
  }

  @HttpMethod('POST')
  async set(req: http.IncomingMessage): Promise<Rsp> {
    let [, thash] = URL_RULES_REGEX.exec(req.url);
    let ftag = req.headers[H_FILTER_TAG.toLowerCase()] as string;
    let pubkey = req.headers[H_PUBKEY.toLowerCase()] as string;
    let signature = req.headers[H_SIGNATURE.toLowerCase()] as string;
    let newRules = await downloadRequestBody(req);
    await verifyJson(newRules);
    await verifySignature(newRules, thash, ftag, pubkey, signature);
    await verifyCanSetRules(thash, pubkey);
    storage.setTopicRules(thash, newRules);
    return { statusCode: 200 };
  }
}

function verifyJson(text: string) {
  try {
    JSON.parse(text);
  } catch (err) {
    throw new BadRequest('Invalid JSON');
  }
}

function verifyCanSetRules(thash: string, pubkey: string) {
  let rules = storage.getTopicRules(thash);
  if (!rules) return;
  let ownerid = JSON.parse(rules).owner;
  if (!ownerid) return log.w('rules.owner is missing:', thash);
  let userid = sha1(pubkey);
  if (ownerid != userid) throw new Unauthorized;
}

async function verifySignature(
  payload: string,
  thash: string,
  tag: string,
  pubkey: string,
  signature: string) {

  if (!signature || !payload || !tag || !thash || !pubkey)
    throw new BadRequest('No Signature');

  let ethash = sha1([
    sha1(pubkey),
    sha1(tag),
  ].join(''));

  if (ethash != thash) {
    log.i('Expected thash:', ethash);
    throw new BadRequest('Bad THash');
  }

  let payloadBytes = Buffer.from(payload);
  let pubkeyBytes = hex2bin(pubkey);
  let signatureBytes = hex2bin(signature);
  let supercop = await getSupercop();
  let matches = supercop.verify(signatureBytes, payloadBytes, pubkeyBytes);

  if (!matches)
    throw new BadRequest('Bad Signature');
}
