import * as http from 'http';
import { log } from './log';
import { Rsp } from './rsp';

type MethodSpec = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS';
type UrlPattern = RegExp | string;

interface HandlerFn {
  (req: http.IncomingMessage): Rsp | Promise<Rsp>;
}

interface HandlerSpec {
  method: MethodSpec;
  url: UrlPattern;
  handler: HandlerFn;
}

// constructor -> (class-method-name -> http-method-name)
let httpMethodTags = new Map<Function, Map<string, MethodSpec>>();
let handlers: HandlerSpec[] = [];

function matches(value, pattern) {
  return pattern.test ?
    pattern.test(value) :
    pattern == value;
}

export async function executeHandler(req: http.IncomingMessage): Promise<Rsp> {
  for (let { method, url, handler } of handlers) {
    if (!matches(req.method, method)) continue;
    if (!matches(req.url, url)) continue;
    return await handler(req);
  }
}

export function registerHandler(
  method: MethodSpec,
  url: UrlPattern,
  handler: HandlerFn) {

  handlers.push({ method, url, handler });
  log.i('Registered handler:', method, url);
}

export function HttpHandler(urlPattern: UrlPattern) {
  log.v('HttpHandler()', urlPattern);
  let instance = null;
  return function decorate(target) {
    log.v('HttpHandler:decorate()', target);
    let tags = httpMethodTags.get(target.prototype);
    if (!tags) throw new Error(
      '@HttpHandler cannot be used without @HttpMethod');
    for (let [name, method] of tags) {
      log.i(target.name + '.' + name, 'handles', method, urlPattern);
      registerHandler(method, urlPattern, req => {
        if (!instance) instance = new target;
        return instance[name](req);
      });
    }
  };
}

export function HttpMethod(method: MethodSpec) {
  log.v('HttpMethod()', method);
  return function decorate(prototype, name: string) {
    log.v('HttpMethod:decorate()', prototype, name);
    let tags = httpMethodTags.get(prototype);
    if (!tags) httpMethodTags.set(prototype, tags = new Map);
    tags.set(name, method);
  };
}
