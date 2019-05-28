module.exports = class BadRequest extends Error {
  constructor(status, details) {
    super(status + ': ' + details);
    this.status = status || '';
    this.details = details || '';
  }
};
