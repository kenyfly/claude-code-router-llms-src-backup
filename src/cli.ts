#!/usr/bin/env node
import minimist from "minimist";
import { run } from "./index";
import { showStatus } from "./utils/status";
import { executeCodeCommand } from "./utils/codeCommand";
import { cleanupPidFile, isServiceRunning, getServicePid } from "./utils/processCheck";
import { version } from "../package.json";
import { spawn } from "child_process";
import { PID_FILE, REFERENCE_COUNT_FILE } from "./constants";
import { existsSync, readFileSync } from "fs";
import { readConfigFile } from "./utils/index";

const argv = minimist(process.argv.slice(2));
const command = argv._[0];

const HELP_TEXT = `
Usage: ccr [command] [options]

Commands:
  start         Start service 
  stop          Stop service
  status        Show service status
  code          Execute code command
  -v, version   Show version information
  -h, help      Show help information

Options:
  --port <port>  Specify port number (default: from config or 3456)

Examples:
  ccr start --port 8001
  ccr code "Write a Hello World" --port 8001
  ccr stop --port 8001
`;

async function waitForService(
  port: number,
  timeout = 10000,
  initialDelay = 1000
): Promise<boolean> {
  // Wait for an initial period to let the service initialize
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (isServiceRunning(port)) {
      // Wait for an additional short period to ensure service is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function getDefaultPort(): Promise<number> {
  try {
    const config = await readConfigFile();
    return process.env.CLAUDE_CODE_ROUTER_PORT ? parseInt(process.env.CLAUDE_CODE_ROUTER_PORT) : (config.Port || 3456);
  } catch {
    return 3456;
  }
}

async function main() {
  const port = argv.port || await getDefaultPort();
  
  switch (command) {
    case "start":
      run({ port });
      break;
    case "stop":
      try {
        const pid = getServicePid(port);
        if (pid) {
          process.kill(pid);
          cleanupPidFile(port);
          if (existsSync(REFERENCE_COUNT_FILE)) {
            try {
              require("fs").unlinkSync(REFERENCE_COUNT_FILE);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
          console.log(
            `claude code router service on port ${port} has been successfully stopped.`
          );
        } else {
          console.log(
            `No service found on port ${port}.`
          );
        }
      } catch (e) {
        console.log(
          `Failed to stop the service on port ${port}. It may have already been stopped.`
        );
        cleanupPidFile(port);
      }
      break;
    case "status":
      showStatus(port);
      break;
    case "code":
      if (!isServiceRunning(port)) {
        console.log(`Service not running on port ${port}, starting service...`);
        const startArgs = ["start"];
        if (argv.port) {
          startArgs.push("--port", argv.port.toString());
        }
        const startProcess = spawn(process.execPath, [__filename, ...startArgs], {
          detached: true,
          stdio: "ignore",
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error);
          process.exit(1);
        });

        startProcess.unref();

        if (await waitForService(port)) {
          executeCodeCommand(argv._.slice(1), port);
        } else {
          console.error(
            `Service startup timeout on port ${port}, please manually run \`ccr start --port ${port}\` to start the service`
          );
          process.exit(1);
        }
      } else {
        executeCodeCommand(argv._.slice(1), port);
      }
      break;
    case "-v":
    case "version":
      console.log(`claude-code-router version: ${version}`);
      break;
    case "-h":
    case "help":
      console.log(HELP_TEXT);
      break;
    default:
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch(console.error);
