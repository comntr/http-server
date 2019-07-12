import * as http from 'http';
import rules from './rules';
import { BadRequest } from './errors';

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