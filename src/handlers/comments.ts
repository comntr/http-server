// The main comments handler:
//
//    GET /<t-hash>
//    POST /<t-hash>/<c-hash>
//

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as sha1 from 'sha1';

import * as storage from '../storage';
import { BadRequest } from '../errors';
import { log } from '../log';
import { Rsp } from '../rsp';
import * as qps from '../qps';
import { HttpHandler, HttpMethod } from './http-handler';

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
  async set(req: http.IncomingMessage): Promise<Rsp> {
    qps.cadd.send();
    let [, topicHash, commentHash] = req.url.split('/');
    let commentBody = await storage.downloadRequestBody(req);

    if (sha1(commentBody) != commentHash) {
      log.i('Actual SHA1:', sha1(commentBody));
      return {
        statusCode: 400,
        statusMessage: 'Bad SHA1',
      };
    }

    if (!validateCommentSyntax(commentBody)) {
      return {
        statusCode: 400,
        statusMessage: 'Bad Syntax',
      };
    }

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

function validateCommentSyntax(body: string) {
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
    if (!/^\w+(-\w+)*: \S+$/.test(header)) {
      log.v('Bad header:', header);
      return false;
    }

  if (!/^\S[^\x00]+\S$/.test(text)) {
    log.v('Bad comment text.');
    return false;
  }

  return true;
}
