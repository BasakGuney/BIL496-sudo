import { AppError } from "../../domain/errors/AppError.js";

export class ErrorHandlerMiddleware {
  constructor({ logger }) {
    this.logger = logger;
    this.handle = this.handle.bind(this);
  }

  handle(error, _req, res, _next) {
    if (error instanceof AppError) {
      this.logger.error(error.message, error.details || error.code);
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    this.logger.error("Unexpected session error", error);
    res.status(500).json({ error: "Failed to process request" });
  }
}
