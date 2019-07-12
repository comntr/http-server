import * as http from 'http';
import { Rsp } from '../rsp';
import * as qps from '../qps';
import { BadRequest } from '../errors';
import { HttpHandler, HttpMethod } from './http-handler';

const URL_GET_STATS_QPS = /^\/stats\/qps\/(\w+)$/;

@HttpHandler(URL_GET_STATS_QPS)
class StatsQpsHandler {
  @HttpMethod('GET')
  async get(req: http.IncomingMessage): Promise<Rsp> {
    let [, qpsname] = URL_GET_STATS_QPS.exec(req.url);
    let counter = qps[qpsname];
    if (!counter) throw new BadRequest('No Such Stat');
    let json = counter.json;
    return { json };
  }
}
