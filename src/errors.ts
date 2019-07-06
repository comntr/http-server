export class BadRequest extends Error {
  constructor(message = '') {
    super(message);
  }
}

export class NotFound extends Error {
  constructor(message = '') {
    super(message);
  }
}
