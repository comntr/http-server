// The main comments handler:
//
//    GET /<t-hash>
//    POST /<t-hash>/<c-hash>
//

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as sha1 from 'sha1';

import { getSupercop } from '../ed25519'
import * as storage from '../storage';
import { hex2bin } from '../hash-util';
import { BadRequest, Unauthorized } from '../errors';
import { log } from '../log';
import { Rsp } from '../rsp';
import * as qps from '../qps';
import { HttpHandler, HttpMethod } from './http-handler';
import { downloadRequestBody } from '../http-util';

const VALID_COMMENT_TEXT = /^\S[\x01-\x7F]+\S$/; // ASCII only, for now
const VALID_COMMENT_HEADER = /^\w+(-\w+)*: \S+$/;
const H_SIGNATURE = /^Signature: (\w+)$/m;
const H_PUBKEY = /^Public-Key: (\w+)$/m;
const URL_COMMENTS = /^\/[0-9a-f]{40}(\/[0-9a-f]{40})?$/;

@HttpHandler(URL_COMMENTS)
class CommentsHandler {
  @HttpMethod('GET')
  async get(req: http.IncomingMessage): Promise<Rsp> {
    qps.cget.send();
    let [, topicHash, commentHash] = req.url.split('/');
    if (commentHash) throw new BadRequest;

    let topicDir = storage.getTopicDir(topicHash);
    log.i('Loading comments:', topicHash.slice(0, 8));

    if (!fs.existsSync(topicDir)) {
      log.i('No such topic.');
      return { json: {} };
    }

    let time = Date.now();
    let filenames = storage.getFilenames(topicHash);
    log.i('fs.readdir:', Date.now() - time, 'ms');

    let time3 = Date.now();
    let serverXorHash = storage.getTopicXorHash(topicHash);
    let clientXorHash = req.headers['if-none-match'];

    if (clientXorHash == serverXorHash) {
      log.i('ETag matched:', serverXorHash);
      return {
        statusCode: 304,
        statusMessage: 'Not Modified',
      };
    }

    log.i('ETag time:', Date.now() - time3, 'ms');

    let cached = storage.cachedGets.get(req.url);
    if (cached) {
      log.i('Got cached response.');
      return cached;
    }

    let time2 = Date.now();
    let comments = [];

    for (let hash of filenames) {
      let text = storage.cachedComments.get(hash);

      if (!text) {
        let filepath = path.join(topicDir, hash);
        text = fs.readFileSync(filepath, 'utf8');
        storage.cachedComments.set(hash, text);
      }

      comments.push(text);
    }

    log.i('fs.readFile x ' + filenames.length + ':', Date.now() - time2, 'ms');

    let boundary = sha1(new Date().toJSON()).slice(0, 7);
    let contentType = 'multipart/mixed; boundary="' + boundary + '"';
    let response = comments.join('\n--' + boundary + '\n');
    let xorhash = storage.getTopicXorHash(topicHash);
    log.i('xorhash:', xorhash);

    let rsp = {
      body: response,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'ETag': '"' + xorhash + '"',
      },
    };

    storage.cachedGets.set(req.url, rsp);
    return rsp;
  }

  @HttpMethod('POST')
  async add(req: http.IncomingMessage): Promise<Rsp> {
    qps.cadd.send();
    let [, topicHash, commentHash] = req.url.split('/');
    let commentBody = await downloadRequestBody(req);
    let actualCommentHash = sha1(commentBody);

    if (!commentHash) {
      // POST /<t-hash> is accepted too.
      commentHash = actualCommentHash;
      log.v('Actual comment sha1:', actualCommentHash);
    } else if (actualCommentHash != commentHash) {
      log.i('Actual SHA1:', sha1(commentBody));
      return {
        statusCode: 400,
        statusMessage: 'Bad SHA1',
      };
    }

    await validateCommentSyntax(commentBody);
    await verifyTopicRules(topicHash, commentBody);

    let topicDir = storage.getTopicDir(topicHash);
    let commentFilePath = storage.getCommentFilePath(topicHash, commentHash);

    if (fs.existsSync(commentFilePath)) {
      return {
        statusCode: 204,
        statusMessage: 'Already Exists',
      };
    }

    if (!fs.existsSync(topicDir)) {
      log.i('+ topic /' + topicHash);
      fs.mkdirSync(topicDir);
    }

    log.i('Adding comment:',
      commentHash.slice(0, 8), 'to', topicHash.slice(0, 8),
      ':', commentBody.length, 'bytes');

    storage.cachedGets.del('/' + topicHash);
    storage.cachedTopics.del(topicHash);
    storage.cachedXorHashes.del(topicHash);
    fs.writeFileSync(commentFilePath, commentBody, 'utf8');
    return {
      statusCode: 201,
      statusMessage: 'Comment Added',
    };
  }
}

async function verifyTopicRules(thash: string, cdata: string) {
  let rules = storage.getTopicRules(thash);
  if (!rules) return;

  let owner = JSON.parse(rules).owner;
  if (!owner) {
    log.i('rules.owner is null:', thash);
    return;
  }

  let pubkey = getCommentPubKey(cdata);
  if (!pubkey) throw new BadRequest('No Public Key');

  let userid = sha1(pubkey);
  if (userid != owner) {
    log.i(`User id doesn't match the owner id:`, userid, owner);
    throw new Unauthorized;
  }

  await verifyCommentSignature(cdata);
  log.i('ed25519 signature is ok');
}

function getCommentPubKey(cdata: string) {
  let match = H_PUBKEY.exec(cdata);
  return match && match[1];
}

function getCommentSig(cdata: string) {
  let match = H_SIGNATURE.exec(cdata);
  return match && match[1];
}

async function verifyCommentSignature(cdata: string) {
  let signature = hex2bin(getCommentSig(cdata));
  let publicKey = hex2bin(getCommentPubKey(cdata));

  if (!signature) throw new BadRequest('No Signature');
  if (!publicKey) throw new BadRequest('No Public Key');

  let signedPart = cdata.slice(cdata.indexOf('\n') + 1);
  let signedPartBytes = Buffer.from(signedPart);
  let supercop = await getSupercop();
  let valid = supercop.verify(signature, signedPartBytes, publicKey);

  if (!valid) {
    log.i(`Wrong ed25519 signature:`,
      signature.length, signedPartBytes.length, publicKey.length);
    throw new BadRequest('Bad Signature');
  }
}

function validateCommentSyntax(body: string) {
  let sep = body.indexOf('\n\n');
  if (sep < 0) throw new BadRequest('No LF LF Separator');

  let hdrs = body.slice(0, sep);
  let text = body.slice(sep + 2);

  if (!hdrs) throw new BadRequest('No Comment Headers');
  if (!text) throw new BadRequest('No Comment Data');

  for (let header of hdrs.split('\n'))
    if (!VALID_COMMENT_HEADER.test(header))
      throw new BadRequest('Bad Comment Header', header);

  if (!VALID_COMMENT_TEXT.test(text))
    throw new BadRequest('Bad Comment Text');
}
