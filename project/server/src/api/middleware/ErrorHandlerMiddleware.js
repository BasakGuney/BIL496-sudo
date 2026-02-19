export class ErrorHandlerMiddleware {
  handle(err, _req, res, _next) {
    const status = err.statusCode || 500;
    res.status(status).json({
      message: err.message || "Unexpected error",
      code: err.code || "INTERNAL_ERROR",
      details: err.details || null,
    });
  }
}
