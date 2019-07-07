import * as supercop from 'supercop.wasm';

let whenSupercopReady = new Promise(
  resolve => supercop.ready(
    () => resolve()));

export const getSupercop =
  () => whenSupercopReady.then(
    () => supercop);
