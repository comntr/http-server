import * as http from 'http';
import { Rsp } from '../rsp';
import * as qps from '../qps';
import { HttpHandler, HttpMethod } from './http-handler';

const URL_GET_STATS_QPS = /^\/stats\/(.*)$/;

@HttpHandler(URL_GET_STATS_QPS)
class StatsQpsHandler {
  @HttpMethod('GET')
  async get(req: http.IncomingMessage): Promise<Rsp> {
    let [, prefix] = URL_GET_STATS_QPS.exec(req.url);
    let json = {};

    for (let [qpsname, counter] of qps.counters) {
      if (!qpsname.startsWith(prefix))
        continue;
      json[qpsname] = counter.json;
    }

    return { json };
  }
}
