import * as http from 'http';
import { Rsp } from '../rsp';
import { HttpHandler, HttpMethod } from './http-handler';

@HttpHandler(/^\//)
class CorsPreflightHandler {
  @HttpMethod('OPTIONS')
  async get(req: http.IncomingMessage): Promise<Rsp> {
    let method = req.headers['access-control-request-method'];
    let headers = req.headers['access-control-request-headers'];

    return {
      headers: {
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Methods': method,
        'Access-Control-Allow-Headers': headers,
      }
    };
  }
}
