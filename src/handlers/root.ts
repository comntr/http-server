import { Rsp } from '../rsp';
import { HttpHandler, HttpMethod } from './http-handler';

@HttpHandler('/')
class RootHandler {
  @HttpMethod('GET')
  async get(): Promise<Rsp> {
    return { text: 'You have reached the comntr server.' };
  }
}
