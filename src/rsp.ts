export interface Rsp {
  statusCode?: number;
  statusMessage?: string;
  headers?: any;
  text?: string;
  html?: string;
  json?: any;
  body?: string | Buffer;
}
