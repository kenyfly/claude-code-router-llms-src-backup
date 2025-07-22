import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { initConfig, initDir } from "./utils";
import { createServer } from "./server";
import { router } from "./utils/router";
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { CONFIG_FILE } from "./constants";

async function initializeClaudeConfig() {
  const homeDir = process.env.HOME;
  const configPath = `${homeDir}/.claude.json`;
  if (!existsSync(configPath)) {
    const userID = Array.from(
      { length: 64 },
      () => Math.random().toString(16)[2]
    ).join("");
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: "enabled",
      userID,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "1.0.17",
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}

interface RunOptions {
  port?: number;
}

async function run(options: RunOptions = {}) {
  const config = await initConfig();
  const port = options.port || process.env.CLAUDE_CODE_ROUTER_PORT || config.Port || 3456;
  
  // Check if service is already running
  if (isServiceRunning(port)) {
    console.log(`✅ Service is already running on port ${port}.`);
    return;
  }

  await initializeClaudeConfig();
  await initDir();

  // Save the PID of the background process
  savePid(process.pid, port);

  // Handle SIGINT (Ctrl+C) to clean up PID file
  process.on("SIGINT", () => {
    console.log("Received SIGINT, cleaning up...");
    cleanupPidFile(port);
    process.exit(0);
  });

  // Handle SIGTERM to clean up PID file
  process.on("SIGTERM", () => {
    cleanupPidFile(port);
    process.exit(0);
  });

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      providers: config.Providers || config.providers,
      PORT: port,
      LOG_FILE: join(
        homedir(),
        ".claude-code-router",
        "claude-code-router.log"
      ),
    },
  });
  server.addHook("preHandler", async (req, reply) =>
    router(req, reply, config)
  );
  server.start();
}

export { run };
// run();
