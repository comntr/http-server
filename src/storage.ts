import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as mkdirp from 'mkdirp';

import { BadRequest } from './errors';
import { log } from './log';
import rules from './rules';

let dataDir = '';

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
