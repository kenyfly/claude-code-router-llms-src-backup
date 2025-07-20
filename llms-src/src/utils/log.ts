import fs from 'node:fs';
import path from 'node:path';

// --- 1. 读取版本号 ---
let version = 'unknown';
try {
  // 假设应用从项目根目录运行 (package.json 所在位置)
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    version = JSON.parse(packageJsonContent).version || 'unknown';
  }
} catch (error) {
  console.error('[Logger Init Error]无法读取 package.json 中的版本号', error);
}

// --- 2. 日志级别定义 ---
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

type LogLevelName = keyof typeof LogLevel;
const LOG_LEVEL_NAMES: LogLevelName[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

// --- 3. 从环境变量获取日志级别 ---
const configuredLogLevelName = (process.env.LOG_LEVEL || 'INFO').toUpperCase() as LogLevelName;
const configuredLogLevel = LogLevel[configuredLogLevelName] ?? LogLevel.INFO;

// --- 4. 日志文件配置 ---
const LOG_FILE = process.env.LOG_FILE || 'app.log';


// --- 5. 核心日志函数 ---
const mainLog = (level: typeof LogLevel[LogLevelName], ...args: any[]) => {
  if (level < configuredLogLevel) {
    return;
  }

  const levelName = LOG_LEVEL_NAMES[level];
  const timestamp = new Date().toISOString();
  
  const message = args.map(arg => 
    (arg instanceof Error) ? arg.stack : (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))
  ).join(' ');

  const formattedMessage = `[${timestamp}] [v${version}] [${levelName}] ${message}`;

  // 写入控制台
  if (level >= LogLevel.ERROR) {
    console.error(formattedMessage);
  } else if (level >= LogLevel.WARN) {
    console.warn(formattedMessage);
  } else {
    console.log(formattedMessage);
  }

  // 只将警告和错误写入文件
  if (level >= LogLevel.WARN) {
    try {
      fs.appendFileSync(LOG_FILE, formattedMessage + '\n', 'utf8');
    } catch (fileError) {
      console.error(`[Logger File Error] 无法写入日志文件 ${LOG_FILE}`, fileError);
    }
  }
};

// --- 6. 创建可调用的日志对象 ---
// 默认的 log() 调用将映射到 info 级别
const log = (...args: any[]) => mainLog(LogLevel.INFO, ...args);

log.debug = (...args: any[]) => mainLog(LogLevel.DEBUG, ...args);
log.info = (...args: any[]) => mainLog(LogLevel.INFO, ...args);
log.warn = (...args: any[]) => mainLog(LogLevel.WARN, ...args);
log.error = (...args: any[]) => mainLog(LogLevel.ERROR, ...args);

// --- 7. 导出 ---
// 保持向后兼容性，使得 `import { log } from '...'` 仍然有效
export { log };
