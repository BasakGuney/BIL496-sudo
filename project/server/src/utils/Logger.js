export class Logger {
  info(message, meta = null) {
    console.log("[INFO]", message, meta ?? "");
  }

  warn(message, meta = null) {
    console.warn("[WARN]", message, meta ?? "");
  }

  error(message, meta = null) {
    console.error("[ERROR]", message, meta ?? "");
  }
}
