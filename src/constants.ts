import path from "node:path";
import os from "node:os";

export const HOME_DIR = path.join(os.homedir(), ".claude-code-router");

export const CONFIG_FILE = `${HOME_DIR}/config.json`;

export const PLUGINS_DIR = `${HOME_DIR}/plugins`;

export const PID_FILE = path.join(HOME_DIR, process.env.NODE_ENV === 'development' ? '.claude-code-router-dev.pid' : '.claude-code-router.pid');

export const REFERENCE_COUNT_FILE = '/tmp/claude-code-reference-count.txt';


export const DEFAULT_CONFIG = {
  LOG: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
};
