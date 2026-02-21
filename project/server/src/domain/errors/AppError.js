export class AppError extends Error {
  constructor(message, { code = null, statusCode = 500, details = null, status } = {}) {
    super(message);
    this.name = "AppError";
    this.message = message;
    this.statusCode = Number(status ?? statusCode ?? 500);
    this.code = code;
    this.details = details;
    this.status = this.statusCode;
    this.cause = details;
  }
}
