import fs from "node:fs";

export function log(...args: any[]) {
  console.log(...args);
  // Check if logging is enabled via environment variable
  const isLogEnabled = process.env.LOG === "true" || true;

  if (!isLogEnabled) {
    return;
  }

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${
    Array.isArray(args)
      ? args
          .map((arg) =>
            typeof arg === "object" ? JSON.stringify(arg) : String(arg)
          )
          .join(" ")
      : ""
  }\n`;

  // Append to log file
  const LOG_FILE = process.env.LOG_FILE || "app.log";
  fs.appendFileSync(LOG_FILE, logMessage, "utf8");
}
