export class Logger {
  info(msg, meta = null) { console.log(`[INFO] ${msg}`, meta || ""); }
  warn(msg, meta = null) { console.warn(`[WARN] ${msg}`, meta || ""); }
  error(msg, err = null) { console.error(`[ERROR] ${msg}`, err || ""); }
}
