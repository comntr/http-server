import * as http from 'http';
import { Rsp } from '../rsp';
import { HttpHandler, HttpMethod } from './http-handler';
import * as storage from '../storage';
import * as qps from '../qps';
import { log } from '../log';

@HttpHandler('/rpc/GetCommentsCount')
class CommentsCountHandler {
  // Returns the number of comments for each topic:
  //
  // POST /rpc/GetCommentsCount
  // [<sha1>, <sha1>, ...]
  //
  // HTTP 200
  // [34, 2, ...]
  //
  @HttpMethod('POST')
  async get(req: http.IncomingMessage): Promise<Rsp> {
    qps.nget.send();
    let reqBody = await storage.downloadRequestBody(req);
    let topics = JSON.parse(reqBody);

    if (topics.length > 1)
      log.i('Topics:', topics.length);

    let counts = topics.map(topicHash => {
      let filenames = storage.getFilenames(topicHash);
      return filenames.length;
    });

    return { json: counts };
  }
}
