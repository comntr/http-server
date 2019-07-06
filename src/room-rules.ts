// Implements per-room rules:
//
//    GET /<t-hash>/rules
//    POST /<t-hash>/rules
//

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

import * as storage from './storage';
import { NotFound, BadRequest } from './errors';
import { log } from './log';
import { Rsp } from './rsp';
import { HttpHandler, HttpMethod } from './http-handler';
import mkdirp = require('mkdirp');

const URL_RULES_REGEX = /^[/]([0-9a-f]{40})[/]rules$/;
const RULES_FILENAME = '.rules';

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
    let tdir = storage.getTopicDir(thash);
    let fpath = path.join(tdir, RULES_FILENAME);
    let json = await storage.downloadRequestBody(req);

    try {
      JSON.parse(json);
    } catch (err) {
      throw new BadRequest('Invalid JSON');
    }

    if (!fs.existsSync(tdir)) mkdirp.sync(tdir);
    fs.writeFileSync(fpath, json, 'utf8');
    log.i('Rules updated:', fpath);
    return { statusCode: 200 };
  }
}
