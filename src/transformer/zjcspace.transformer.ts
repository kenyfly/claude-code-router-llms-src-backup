import { Transformer } from "../types/transformer.js";
import { UnifiedChatRequest } from "../types/llm";
import { LLMProvider } from "../types/llm";
import { log } from "@/utils/log"; // 如果有 log 工具
import * as fs from 'fs';
import * as path from 'path';

export class ZjcspaceTransformer implements Transformer {
  static LOG_PREFIX = '[ZjcspaceTransformer v1.7.0]';
  name = "zjcspace"; 
  // endPoint = "/v1/chat/completions";
  
  // 日志级别配置
  private logLevel: 'none' | 'error' | 'warn' | 'info' | 'debug' | 'verbose' = 'info';
  
  // 日志级别权重
  private readonly LOG_LEVELS = {
    none: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    verbose: 5
  };
  
  // 日志分类配置
  private logCategories: {
    input: boolean;
    fieldCleanup: boolean;
    tools: boolean;
    messages: boolean;
    requestBody: boolean;
    responseProcessing: boolean;
    streamProcessing: boolean;
    contentAnalysis: boolean;
    rawData: boolean;
    chunkProcessing: boolean;
  } = {
    input: true,
    fieldCleanup: true,
    tools: true,
    messages: true,
    requestBody: true,
    responseProcessing: true,
    streamProcessing: true,
    contentAnalysis: true,
    rawData: false, // 默认关闭，因为数据量很大
    chunkProcessing: false, // 默认关闭，因为chunk数量很多
  };
  
  constructor(options?: {
    logLevel?: 'none' | 'error' | 'warn' | 'info' | 'debug' | 'verbose';
    logCategories?: Partial<typeof ZjcspaceTransformer.prototype.logCategories>;
  }) {
    if (options?.logLevel) {
      this.logLevel = options.logLevel;
    }
    if (options?.logCategories) {
      this.logCategories = { ...this.logCategories, ...options.logCategories };
    }
  }
  
  // 日志输出方法
  private shouldLog(level: 'error' | 'warn' | 'info' | 'debug' | 'verbose', category?: keyof typeof ZjcspaceTransformer.prototype.logCategories): boolean {
    // 检查日志级别
    if (this.LOG_LEVELS[level] > this.LOG_LEVELS[this.logLevel]) {
      return false;
    }
    
    // 检查日志分类
    if (category && !this.logCategories[category]) {
      return false;
    }
    
    return true;
  }
  
  private log(level: 'error' | 'warn' | 'info' | 'debug' | 'verbose', message: string, category?: keyof typeof ZjcspaceTransformer.prototype.logCategories): void {
    if (this.shouldLog(level, category)) {
      log(message);
    }
  }

  // 持久化请求体到debug目录
  private persistRequestBody(requestBody: any, requestId: string): void {
    try {
      // 使用当前工作目录的debug文件夹
      const debugDir = path.join(process.cwd(), 'debug');
      
      // 确保debug目录存在
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `request-${requestId}-${timestamp}.json`;
      const filepath = path.join(debugDir, filename);
      
      const debugData = {
        timestamp: new Date().toISOString(),
        requestId,
        requestBody,
        metadata: {
          transformer: 'ZjcspaceTransformer',
          version: 'v1.7.0'
        }
      };
      
      fs.writeFileSync(filepath, JSON.stringify(debugData, null, 2), 'utf8');
      log(`[ZjcspaceTransformer] 💾 请求体已持久化到: ${filepath}`);
    } catch (error) {
      log(`[ZjcspaceTransformer] ❌ 持久化请求体失败: ${error}`);
    }
  }

  // 持久化响应体到debug目录
  private persistResponseBody(responseBody: any, requestId: string, status: number): void {
    try {
      // 使用当前工作目录的debug文件夹
      const debugDir = path.join(process.cwd(), 'debug');
      
      // 确保debug目录存在
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `response-${requestId}-${timestamp}.json`;
      const filepath = path.join(debugDir, filename);
      
      const debugData = {
        timestamp: new Date().toISOString(),
        requestId,
        status,
        responseBody,
        metadata: {
          transformer: 'ZjcspaceTransformer',
          version: 'v1.7.0'
        }
      };
      
      fs.writeFileSync(filepath, JSON.stringify(debugData, null, 2), 'utf8');
      log(`[ZjcspaceTransformer] 💾 响应体已持久化到: ${filepath}`);
    } catch (error) {
      log(`[ZjcspaceTransformer] ❌ 持久化响应体失败: ${error}`);
    }
  }

  transformRequestIn(request: UnifiedChatRequest, provider: LLMProvider): Record<string, any> {
    const LOG_PREFIX = ZjcspaceTransformer.LOG_PREFIX;
    const LOG_MARKERS = {
      REQUEST_OUT: `${LOG_PREFIX} 📤 [REQUEST-OUT]`,
      REQUEST_BODY: `${LOG_PREFIX} 📝 [REQUEST-BODY]`,
      REQUEST_HEADERS: `${LOG_PREFIX} 🏷️ [REQUEST-HEADERS]`,
      STRICT_CLEAN: `${LOG_PREFIX} 🧹 [STRICT-CLEAN]`,
      INPUT_VALIDATION: `${LOG_PREFIX} 🔍 [INPUT-VALIDATION]`,
      FIELD_CLEANUP: `${LOG_PREFIX} 🧽 [FIELD-CLEANUP]`,
      TOOLS_PROCESSING: `${LOG_PREFIX} 🔧 [TOOLS-PROCESSING]`,
      MESSAGES_PROCESSING: `${LOG_PREFIX} 💬 [MESSAGES-PROCESSING]`,
    };
    
    // 输入验证日志
    this.log('info', `${LOG_MARKERS.INPUT_VALIDATION} 开始处理请求 - model: ${request.model}, messages数量: ${request.messages?.length || 0}, tools数量: ${request.tools?.length || 0}`, 'input');
    this.log('debug', `${LOG_MARKERS.INPUT_VALIDATION} provider信息 - baseUrl: ${provider.baseUrl}, apiKey长度: ${provider.apiKey?.length || 0}`, 'input');
    // 顶层字段白名单 - 遵循OpenAI标准
    const allowedTop = [
      'model', 'messages', 'tools', 'tool_choice', 'stream', 'max_tokens', 'max_completion_tokens',
      'temperature', 'top_p', 'n', 'stop', 'user', 'logprobs', 'top_logprobs', 'response_format',
      'seed', 'parallel_tool_calls', 'web_search_options', 'audio', 'modalities', 'prediction',
      'reasoning_effort', 'metadata', 'store'
    ];
    
    // messages 字段白名单 (已修改，支持多轮对话和工具调用)
    const allowedMsg = ['role', 'content', 'name', 'tool_calls', 'tool_call_id'];
    
    // tools 字段白名单
    const allowedTool = ['type', 'function'];
    // function 字段白名单
    const allowedFn = ['name', 'description', 'parameters'];
    // parameters 字段白名单 - 严格按照OpenAI官方文档
    const allowedParam = [
      'type', 'properties', 'required', 'enum', 'description', 'items'
    ];

    // 字段变更追踪
    const removedFields: string[] = [];
    const addedFields: string[] = [];
    
    this.log('debug', `${LOG_MARKERS.FIELD_CLEANUP} 开始字段清理 - 追踪字段变更`, 'fieldCleanup');

    function strictCleanParameters(params: any, path = ''): any {
      if (!params || typeof params !== 'object') return params;
      const cleaned: any = {};
      for (const k in params) {
        if (!allowedParam.includes(k)) {
          removedFields.push(path ? `${path}.${k}` : k);
        }
      }
      for (const k of allowedParam) {
        if (params[k] !== undefined) {
          if (k === 'properties' && typeof params[k] === 'object') {
            cleaned.properties = {};
            for (const pk in params.properties) {
              cleaned.properties[pk] = strictCleanParameters(params.properties[pk], path ? `${path}.properties.${pk}` : `properties.${pk}`);
            }
          } else if (k === 'items' && typeof params[k] === 'object') {
            cleaned.items = strictCleanParameters(params.items, path ? `${path}.items` : 'items');
          } else {
            cleaned[k] = params[k];
          }
        }
      }
      // array 必须有 items
      if (cleaned.type === 'array' && !cleaned.items) {
        cleaned.items = { type: 'string' };
        addedFields.push(path ? `${path}.items` : 'items');
      }
      return cleaned;
    }
    const strictCleanTools = (tools: any[]): any[] | undefined => {
      if (!Array.isArray(tools)) {
        this.log('warn', `${LOG_MARKERS.TOOLS_PROCESSING} tools不是数组，跳过处理`, 'tools');
        return undefined;
      }
      
      this.log('info', `${LOG_MARKERS.TOOLS_PROCESSING} 开始处理tools - 原始数量: ${tools.length}`, 'tools');
      
      const cleaned = tools.map((tool, idx) => {
        if (tool?.type === "function" && tool.function) {
          const fn = tool.function;
          const cleanedFn: any = {};
          for (const k in fn) {
            if (!allowedFn.includes(k)) {
              removedFields.push(`tools[${idx}].function.${k}`);
            }
          }
          for (const k of allowedFn) {
            if (fn[k] !== undefined) {
              if (k === 'parameters') {
                cleanedFn.parameters = strictCleanParameters(fn.parameters, `tools[${idx}].function.parameters`);
              } else {
                cleanedFn[k] = fn[k];
              }
            }
          }
          return {
            type: "function",
            function: cleanedFn
          };
        }
        return undefined;
      }).filter(Boolean);
      
      this.log('info', `${LOG_MARKERS.TOOLS_PROCESSING} tools处理完成 - 清理后数量: ${cleaned.length}, 移除字段: ${removedFields.filter(f => f.startsWith('tools')).join(', ') || '无'}`, 'tools');
      
      return cleaned.length > 0 ? cleaned : undefined;
    };
    const strictCleanMessages = (messages: any[]): any[] => {
      if (!Array.isArray(messages)) {
        this.log('warn', `${LOG_MARKERS.MESSAGES_PROCESSING} messages不是数组，返回空数组`, 'messages');
        return [];
      }
      
      this.log('info', `${LOG_MARKERS.MESSAGES_PROCESSING} 开始处理messages - 原始数量: ${messages.length}`, 'messages');
      
      // 内容清理函数
      const cleanContent = (content: string): string => {
        if (typeof content !== 'string') {
          return content;
        }
        
        let cleanedContent = content;
        const originalLength = content.length;
        const cleanupStats = {
          nestedImages: 0,
          malformedLinks: 0,
          windowsPaths: 0,
          excessiveLength: 0,
          invalidUrls: 0,
          brokenSyntax: 0
        };
        
        // 1. 修复嵌套Markdown图片语法 [![...](...)](...) -> [...](...)
        const nestedImagePattern = /\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g;
        const nestedImageMatches = content.match(nestedImagePattern);
        if (nestedImageMatches && nestedImageMatches.length > 0) {
          cleanupStats.nestedImages = nestedImageMatches.length;
          this.log('warn', `${LOG_MARKERS.MESSAGES_PROCESSING} 检测到嵌套Markdown图片语法，进行清理: ${nestedImageMatches.length} 个`, 'messages');
          cleanedContent = cleanedContent.replace(nestedImagePattern, '[$1]($3)');
        }
        
        // 2. 修复不完整的Markdown链接语法
        // 2.1 修复缺少右括号的链接 [...](... -> [...](...)
        const incompleteLinkPattern = /\[([^\]]+)\]\(([^)]*)$/gm;
        const incompleteLinkMatches = cleanedContent.match(incompleteLinkPattern);
        if (incompleteLinkMatches && incompleteLinkMatches.length > 0) {
          cleanupStats.malformedLinks += incompleteLinkMatches.length;
          this.log('warn', `${LOG_MARKERS.MESSAGES_PROCESSING} 检测到不完整的Markdown链接，进行修复: ${incompleteLinkMatches.length} 个`, 'messages');
          cleanedContent = cleanedContent.replace(incompleteLinkPattern, '[$1]($2)');
        }
        
        // 2.2 修复缺少左括号的链接 [...](... -> [...](...)
        const missingOpenBracketPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
        const validLinks = cleanedContent.match(missingOpenBracketPattern);
        if (validLinks) {
          // 检查是否有不匹配的括号
          const openBrackets = (cleanedContent.match(/\[/g) || []).length;
          const closeBrackets = (cleanedContent.match(/\]/g) || []).length;
          const openParens = (cleanedContent.match(/\(/g) || []).length;
          const closeParens = (cleanedContent.match(/\)/g) || []).length;
          
          if (openBrackets !== closeBrackets || openParens !== closeParens) {
            cleanupStats.brokenSyntax = Math.abs(openBrackets - closeBrackets) + Math.abs(openParens - closeParens);
            this.log('warn', `${LOG_MARKERS.MESSAGES_PROCESSING} 检测到不匹配的括号，进行修复: 方括号差${Math.abs(openBrackets - closeBrackets)}, 圆括号差${Math.abs(openParens - closeParens)}`, 'messages');
          }
        }
        
        // 3. 修复Windows路径格式 \\\\ -> /
        const windowsPathPattern = /\\\\/g;
        const windowsPathMatches = cleanedContent.match(windowsPathPattern);
        if (windowsPathMatches && windowsPathMatches.length > 0) {
          cleanupStats.windowsPaths = windowsPathMatches.length;
          this.log('info', `${LOG_MARKERS.MESSAGES_PROCESSING} 检测到Windows路径格式，进行修复: ${windowsPathMatches.length} 个`, 'messages');
          cleanedContent = cleanedContent.replace(windowsPathPattern, '/');
        }
        
        // 4. 修复无效的URL格式
        // 4.1 修复缺少协议的URL
        const urlPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
        const urlMatches = cleanedContent.match(urlPattern);
        if (urlMatches) {
          let invalidUrlCount = 0;
          cleanedContent = cleanedContent.replace(urlPattern, (match, text, url) => {
            // 检查URL是否有效
            if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:') && !url.startsWith('tel:') && !url.startsWith('#')) {
              // 如果是相对路径或本地路径，保持原样
              if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
                return match;
              }
              // 如果是看起来像域名的，添加https://
              if (url.includes('.') && !url.includes(' ') && !url.includes('\\')) {
                invalidUrlCount++;
                return `[${text}](https://${url})`;
              }
            }
            return match;
          });
          if (invalidUrlCount > 0) {
            cleanupStats.invalidUrls = invalidUrlCount;
            this.log('info', `${LOG_MARKERS.MESSAGES_PROCESSING} 修复无效URL格式: ${invalidUrlCount} 个`, 'messages');
          }
        }
        
        // 5. 清理过长的内容（如果超过某个阈值）
        const maxContentLength = 10000; // 10KB
        if (cleanedContent.length > maxContentLength) {
          cleanupStats.excessiveLength = cleanedContent.length - maxContentLength;
          this.log('warn', `${LOG_MARKERS.MESSAGES_PROCESSING} 内容过长 (${cleanedContent.length} 字符)，进行截断`, 'messages');
          cleanedContent = cleanedContent.substring(0, maxContentLength) + '\n\n[内容已截断...]';
        }
        
        // 6. 修复其他常见的Markdown语法问题
        // 6.1 修复多余的空格
        cleanedContent = cleanedContent.replace(/\s+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n');
        
        // 6.2 修复不正确的图片语法
        const malformedImagePattern = /!\[([^\]]*)\]\(([^)]*)\)/g;
        const malformedImages = cleanedContent.match(malformedImagePattern);
        if (malformedImages) {
          cleanedContent = cleanedContent.replace(malformedImagePattern, (match, alt, src) => {
            // 如果alt为空，使用默认值
            if (!alt || alt.trim() === '') {
              return `![图片](${src})`;
            }
            return match;
          });
        }
        
        // 记录清理统计
        if (cleanedContent !== content) {
          const reduction = originalLength - cleanedContent.length;
          const totalFixes = Object.values(cleanupStats).reduce((sum, count) => sum + count, 0);
          
          this.log('info', `${LOG_MARKERS.MESSAGES_PROCESSING} 内容清理完成 - 原始长度: ${originalLength}, 清理后长度: ${cleanedContent.length}, 减少: ${reduction} 字符`, 'messages');
          
          if (totalFixes > 0) {
            this.log('info', `${LOG_MARKERS.MESSAGES_PROCESSING} 清理统计: 嵌套图片${cleanupStats.nestedImages}, 畸形链接${cleanupStats.malformedLinks}, Windows路径${cleanupStats.windowsPaths}, 无效URL${cleanupStats.invalidUrls}, 语法错误${cleanupStats.brokenSyntax}, 超长内容${cleanupStats.excessiveLength}`, 'messages');
          }
        }
        
        return cleanedContent;
      };
      
      const cleaned = messages.map((msg, idx) => {
        const cleanedMsg: any = {};
        for (const k of allowedMsg) {
          if (msg[k] !== undefined) {
            if (k === 'content') {
              // content 只允许 string, array, 或在 tool_calls 存在时为 null
              if (typeof msg.content === 'string' || Array.isArray(msg.content) || (msg.content === null && msg.tool_calls)) {
                if (typeof msg.content === 'string') {
                  // 对字符串内容进行清理
                  cleanedMsg.content = cleanContent(msg.content);
                } else {
                  cleanedMsg.content = msg.content;
                }
              }
            } else {
              cleanedMsg[k] = msg[k];
            }
          }
        }
        return cleanedMsg;
      });
      
      this.log('info', `${LOG_MARKERS.MESSAGES_PROCESSING} messages处理完成 - 清理后数量: ${cleaned.length}`, 'messages');
      
      return cleaned;
    };
    function deepStrictClean(obj: any): any {
      if (Array.isArray(obj)) {
        return obj.map(deepStrictClean).filter(v => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0));
      } else if (typeof obj === 'object' && obj !== null) {
        const cleaned: any = {};
        for (const k in obj) {
          const v = deepStrictClean(obj[k]);
          if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && Object.keys(v).length === 0)) {
            cleaned[k] = v;
          }
        }
        return cleaned;
      }
      return obj;
    }
    // 构建严格格式化后的请求体
    this.log('info', `${LOG_MARKERS.REQUEST_BODY} 开始构建请求体`, 'requestBody');
    
    const cleanedMessages = strictCleanMessages(request.messages);
    const rawStrict: Record<string, any> = {
      model: request.model,
      messages: cleanedMessages,
      tools: strictCleanTools(request.tools ?? []),
      tool_choice: request.tool_choice, // 按实际请求体决定
      stream: false, // 强制非流式请求 - 这样服务器会返回非流式响应，便于准确转发
      max_tokens: request.max_tokens,
      max_completion_tokens: (request as any).max_completion_tokens,
      temperature: request.temperature,
      top_p: (request as any).top_p,
      n: (request as any).n,
      stop: (request as any).stop,
      user: (request as any).user,
      logprobs: (request as any).logprobs,
      top_logprobs: (request as any).top_logprobs,
      response_format: (request as any).response_format,
      seed: (request as any).seed,
      parallel_tool_calls: (request as any).parallel_tool_calls,
      web_search_options: (request as any).web_search_options,
      audio: (request as any).audio,
      modalities: (request as any).modalities,
      prediction: (request as any).prediction,
      reasoning_effort: (request as any).reasoning_effort,
      metadata: (request as any).metadata,
      store: (request as any).store,
    };
    
    this.log('debug', `${LOG_MARKERS.REQUEST_BODY} 原始请求体字段: ${Object.keys(rawStrict).filter(k => rawStrict[k] !== undefined).join(', ')}`, 'requestBody');
    
    const requestBody: any = {};
    for (const k of allowedTop) {
      if (rawStrict[k] !== undefined) requestBody[k] = rawStrict[k];
    }
    
    this.log('debug', `${LOG_MARKERS.REQUEST_BODY} 白名单过滤后字段: ${Object.keys(requestBody).join(', ')}`, 'requestBody');
    
    const cleanedBody = deepStrictClean(requestBody);
    
    this.log('debug', `${LOG_MARKERS.REQUEST_BODY} 深度清理后字段: ${Object.keys(cleanedBody).join(', ')}`, 'requestBody');
    this.log('info', `${LOG_MARKERS.REQUEST_BODY} 字段变更统计 - 移除: ${removedFields.length}, 添加: ${addedFields.length}`, 'requestBody');
    if (removedFields.length > 0) {
      this.log('debug', `${LOG_MARKERS.REQUEST_BODY} 移除的字段: ${removedFields.join(', ')}`, 'requestBody');
    }
    if (addedFields.length > 0) {
      this.log('debug', `${LOG_MARKERS.REQUEST_BODY} 添加的字段: ${addedFields.join(', ')}`, 'requestBody');
    }
    
    // 保存请求体到文件
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${provider.apiKey}`
    };
    this.log('info', `${LOG_MARKERS.REQUEST_OUT} 开始构建请求 (强制非流式请求，服务器将返回非流式响应)`, 'requestBody');
    this.log('debug', `${LOG_MARKERS.REQUEST_HEADERS} 请求头: Content-Type=${headers["Content-Type"]}, Authorization长度=${headers["Authorization"].length}`, 'requestBody');
    
    // 生成请求ID用于持久化
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 持久化请求体到debug目录
    this.persistRequestBody(cleanedBody, requestId);
    
    // 不再在日志中打印完整的请求体，避免占满缓冲区
    // 请求体已通过persistRequestBody持久化到debug目录
    this.log('debug', `${LOG_MARKERS.REQUEST_BODY} 请求体已持久化到debug目录，字段数量: ${Object.keys(cleanedBody).length}`, 'requestBody');
    return {
      body: cleanedBody,
      config: {
        url: new URL(provider.baseUrl),
        headers,
      },
    };
  }

  async transformResponseOut(response: Response): Promise<Response> {
    // 生成响应ID用于持久化
    const responseId = `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 日志标签定义
    const LOG_PREFIX = ZjcspaceTransformer.LOG_PREFIX;
    const LOG_MARKERS = {
      RESPONSE_IN: `${LOG_PREFIX} 📨 [RESPONSE-IN]`,
      STREAM_PROCESSING: `${LOG_PREFIX} 🌊 [STREAM]`,
      EVENT: `${LOG_PREFIX} 📤 [EVENT]`,
      ERROR: `${LOG_PREFIX} ❌ [ERROR]`,
      INFO: `${LOG_PREFIX} ℹ️ [INFO]`,
      RAW_CHUNK: `${LOG_PREFIX} 🟦 [RAW-CHUNK]`,
      CHUNK_JSON: `${LOG_PREFIX} 🟧 [CHUNK-JSON]`,
      DECODED: `${LOG_PREFIX} 🟩 [DECODED]`,
      RESPONSE_PROCESSING: `${LOG_PREFIX} 🔄 [RESPONSE-PROCESSING]`,
      CONTENT_ANALYSIS: `${LOG_PREFIX} 📊 [CONTENT-ANALYSIS]`,
    };
    
    this.log('info', `${LOG_MARKERS.RESPONSE_PROCESSING} 开始处理响应 - status: ${response.status}, statusText: ${response.statusText}`, 'responseProcessing');
    // 打印响应头
    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    this.log('info', `${LOG_MARKERS.RESPONSE_IN} 响应头: ` + JSON.stringify(headersObj), 'responseProcessing');
    
    // 详细分析响应类型
    this.log('info', `${LOG_MARKERS.CONTENT_ANALYSIS} 响应分析 - status: ${response.status}, statusText: ${response.statusText}`, 'contentAnalysis');
    this.log('info', `${LOG_MARKERS.CONTENT_ANALYSIS} Content-Type: ${response.headers.get("Content-Type")}`, 'contentAnalysis');
    this.log('info', `${LOG_MARKERS.CONTENT_ANALYSIS} Content-Length: ${response.headers.get("Content-Length")}`, 'contentAnalysis');
    this.log('info', `${LOG_MARKERS.CONTENT_ANALYSIS} Transfer-Encoding: ${response.headers.get("Transfer-Encoding")}`, 'contentAnalysis');

    const contentType = response.headers.get("Content-Type") || "";
    this.log('debug', `${LOG_MARKERS.CONTENT_ANALYSIS} 响应Content-Type: ${contentType}`, 'contentAnalysis');
    
    // 由于我们发送的是非流式请求，206状态码可能是特殊的响应格式
    // 优先尝试作为JSON响应处理
    if (response.status === 206 && contentType.includes("application/json")) {
      this.log('info', `${LOG_MARKERS.RESPONSE_PROCESSING} 检测到206状态码的JSON响应，尝试作为JSON响应处理`, 'responseProcessing');
      try {
        const clonedResponse = response.clone();
        const jsonData = await clonedResponse.json();
        this.log('info', `${LOG_MARKERS.RAW_CHUNK} 206响应实际内容: ${JSON.stringify(jsonData)}`, 'rawData');
        
        // 持久化206响应到debug目录
        this.persistResponseBody(jsonData, responseId, response.status);
        
        // 检查是否是错误响应
        if (jsonData && jsonData.error) {
          this.log('error', `${LOG_MARKERS.ERROR} 206响应包含错误信息: ${jsonData.error.message}`, 'responseProcessing');
          // 将206错误响应转换为200状态码，但保持错误内容
          return new Response(JSON.stringify(jsonData), {
            status: 200,
            statusText: 'OK',
            headers: {
              'Content-Type': 'application/json',
              ...response.headers
            },
          });
        }
        
        // 如果确实是正常的JSON格式，按JSON响应处理
        if (jsonData && typeof jsonData === 'object') {
          this.log('info', `${LOG_MARKERS.RESPONSE_PROCESSING} 206响应实际是JSON格式，按JSON响应处理`, 'responseProcessing');
          return this.handleJsonResponse(response, jsonData);
        }
      } catch (e) {
        this.log('error', `${LOG_MARKERS.ERROR} 206响应JSON解析失败: ${e}`, 'responseProcessing');
        return response;
      }
    }
    
    // 真正的流式响应处理（Content-Type包含stream）
    if (contentType.includes("stream")) {
      this.log('info', `${LOG_MARKERS.STREAM_PROCESSING} 检测到真正的流式响应 (status: ${response.status}, contentType: ${contentType})，开始标准OpenAI流式输出`, 'streamProcessing');
      if (!response.body) {
        this.log('error', `${LOG_MARKERS.ERROR} 流式响应但body为空`, 'streamProcessing');
        return response;
      }
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let chunkIndex = 0;
      const transformer = this; // 保存对transformer实例的引用
      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          try {
            transformer.log('info', `${LOG_MARKERS.STREAM_PROCESSING} 开始读取流式数据`, 'streamProcessing');
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                transformer.log('info', `${LOG_MARKERS.STREAM_PROCESSING} 流式读取完成`, 'streamProcessing');
                break;
              }
              const chunk = decoder.decode(value, { stream: true });
              transformer.log('verbose', `${LOG_MARKERS.RAW_CHUNK} 原始chunk数据: ${JSON.stringify(chunk)}`, 'rawData');
              const lines = chunk.split("\n");
              transformer.log('debug', `${LOG_MARKERS.STREAM_PROCESSING} 分割后行数: ${lines.length}`, 'streamProcessing');
              for (const line of lines) {
                if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
                  try {
                    const data = JSON.parse(line.slice(6));
                    transformer.log('verbose', `${LOG_MARKERS.RAW_CHUNK} 解析chunk数据: ${JSON.stringify(data)}`, 'rawData');
                    
                    // 添加额外的安全检查
                    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
                      transformer.log('error', `${LOG_MARKERS.ERROR} chunk数据格式异常: choices字段缺失或为空`, 'streamProcessing');
                      controller.enqueue(encoder.encode(line + "\n"));
                      continue;
                    }
                    const content = data.choices?.[0]?.delta?.content;
                    transformer.log('debug', `${LOG_MARKERS.CHUNK_JSON} 提取content: ${typeof content} - ${content}`, 'chunkProcessing');
                    
                    if (typeof content === "string" && content.length > 0) {
                      const res = {
                        choices: [
                          {
                            delta: {
                              ...(chunkIndex === 0 ? { role: "assistant" } : {}),
                              content
                            },
                            index: chunkIndex,
                            finish_reason: null
                          }
                        ],
                        created: data.created || Math.floor(Date.now() / 1000),
                        id: data.id || "",
                        model: data.model || "",
                        object: "chat.completion.chunk"
                      };
                      transformer.log('debug', `${LOG_MARKERS.DECODED} 发送chunk ${chunkIndex}: ${JSON.stringify(res)}`, 'chunkProcessing');
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(res)}\n\n`));
                      chunkIndex++;
                    } else {
                      transformer.log('debug', `${LOG_MARKERS.INFO} 跳过空content的chunk`, 'chunkProcessing');
                    }
                  } catch (e) {
                    transformer.log('error', `${LOG_MARKERS.ERROR} chunk解析失败: ${e}`, 'streamProcessing');
                    controller.enqueue(encoder.encode(line + "\n"));
                  }
                } else {
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
            }
            // 补发最后一个 finish_reason: 'stop' 的 chunk
            transformer.log('info', `${LOG_MARKERS.INFO} 流式处理完成，发送结束chunk - 总chunk数: ${chunkIndex}`, 'streamProcessing');
            const res = {
              choices: [
                {
                  delta: {},
                  index: chunkIndex,
                  finish_reason: "stop"
                }
              ],
              created: Math.floor(Date.now() / 1000),
              id: `done_${Date.now()}`,
              model: "zjcspace",
              object: "chat.completion.chunk"
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(res)}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (error) {
            transformer.log('error', `${LOG_MARKERS.ERROR} 流式处理异常: ${error}`, 'streamProcessing');
            controller.error(error);
          } finally {
            try { reader.releaseLock(); } catch {}
            controller.close();
          }
        }
      });
      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "text/plain",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
    // 非流式 JSON 响应时打印内容和做内容清洗
    if (contentType.includes("application/json")) {
      this.log('info', `${LOG_MARKERS.RESPONSE_PROCESSING} 检测到JSON响应，开始处理`, 'responseProcessing');
      
      let jsonResponse;
      try {
        // 只读取一次响应体
        jsonResponse = await response.json();
        // 打印响应内容用于调试
        this.log('info', `${LOG_MARKERS.INFO} 响应内容: ${JSON.stringify(jsonResponse)}`, 'rawData');
      } catch (e) {
        this.log('error', `${LOG_MARKERS.ERROR} 响应体解析失败: ${e}`, 'responseProcessing');
        return response;
      }
      // 添加额外的安全检查
      if (!jsonResponse || !jsonResponse.choices || !Array.isArray(jsonResponse.choices) || jsonResponse.choices.length === 0) {
        this.log('error', `${LOG_MARKERS.ERROR} 响应格式异常: choices 字段缺失或为空`, 'responseProcessing');
        return response;
      }
      
      this.log('info', `${LOG_MARKERS.CONTENT_ANALYSIS} 响应格式正常 - choices数量: ${jsonResponse.choices.length}`, 'contentAnalysis');
      
      const messageContent = jsonResponse.choices?.[0]?.message?.content;
      this.log('debug', `${LOG_MARKERS.CONTENT_ANALYSIS} 提取message content: ${typeof messageContent} - 长度: ${typeof messageContent === 'string' ? messageContent.length : 'N/A'}`, 'contentAnalysis');
      
      if (typeof messageContent === 'string') {
        const jsonMatch = messageContent.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1] && jsonResponse.choices?.[0]?.message) {
          this.log('info', `${LOG_MARKERS.CONTENT_ANALYSIS} 检测到JSON代码块，进行内容清洗`, 'contentAnalysis');
          jsonResponse.choices[0].message.content = jsonMatch[1];
        } else {
          this.log('debug', `${LOG_MARKERS.CONTENT_ANALYSIS} 未检测到JSON代码块，保持原始内容`, 'contentAnalysis');
        }
      }
      this.log('info', `${LOG_MARKERS.RESPONSE_PROCESSING} JSON响应处理完成，返回处理后的响应`, 'responseProcessing');
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    // 其他情况直接透传
    this.log('info', `${LOG_MARKERS.RESPONSE_PROCESSING} 非JSON/非流式响应，直接透传`, 'responseProcessing');
    return response;
  }
  
  // 处理JSON响应的辅助方法
  private handleJsonResponse(response: Response, jsonData: any): Response {
    const LOG_PREFIX = ZjcspaceTransformer.LOG_PREFIX;
    const LOG_MARKERS = {
      RESPONSE_PROCESSING: `${LOG_PREFIX} 🔄 [RESPONSE-PROCESSING]`,
      CONTENT_ANALYSIS: `${LOG_PREFIX} 📊 [CONTENT-ANALYSIS]`,
      ERROR: `${LOG_PREFIX} ❌ [ERROR]`,
    };
    
    this.log('info', `${LOG_MARKERS.RESPONSE_PROCESSING} 处理JSON响应`, 'responseProcessing');
    
    // 生成响应ID用于持久化
    const responseId = `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 持久化JSON响应到debug目录
    this.persistResponseBody(jsonData, responseId, response.status);
    
    // 添加额外的安全检查
    if (!jsonData || !jsonData.choices || !Array.isArray(jsonData.choices) || jsonData.choices.length === 0) {
      this.log('error', `${LOG_MARKERS.ERROR} JSON响应格式异常: choices 字段缺失或为空`, 'responseProcessing');
      return response;
    }
    
    this.log('info', `${LOG_MARKERS.CONTENT_ANALYSIS} JSON响应格式正常 - choices数量: ${jsonData.choices.length}`, 'contentAnalysis');
    
    const messageContent = jsonData.choices?.[0]?.message?.content;
    this.log('debug', `${LOG_MARKERS.CONTENT_ANALYSIS} 提取message content: ${typeof messageContent} - 长度: ${typeof messageContent === 'string' ? messageContent.length : 'N/A'}`, 'contentAnalysis');
    
    if (typeof messageContent === 'string') {
      const jsonMatch = messageContent.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1] && jsonData.choices?.[0]?.message) {
        this.log('info', `${LOG_MARKERS.CONTENT_ANALYSIS} 检测到JSON代码块，进行内容清洗`, 'contentAnalysis');
        jsonData.choices[0].message.content = jsonMatch[1];
      } else {
        this.log('debug', `${LOG_MARKERS.CONTENT_ANALYSIS} 未检测到JSON代码块，保持原始内容`, 'contentAnalysis');
      }
    }
    
    this.log('info', `${LOG_MARKERS.RESPONSE_PROCESSING} JSON响应处理完成，返回处理后的响应`, 'responseProcessing');
    return new Response(JSON.stringify(jsonData), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
}

/*
使用示例：

// 1. 默认配置（只输出info级别及以上，关闭rawData和chunkProcessing）
const transformer = new ZjcspaceTransformer();

// 2. 开发调试模式（输出所有日志）
const debugTransformer = new ZjcspaceTransformer({
  logLevel: 'verbose',
  logCategories: {
    rawData: true,
    chunkProcessing: true
  }
});

// 3. 生产环境模式（只输出错误和警告）
const productionTransformer = new ZjcspaceTransformer({
  logLevel: 'warn'
});

// 4. 只关注特定类型的日志
const focusedTransformer = new ZjcspaceTransformer({
  logLevel: 'debug',
  logCategories: {
    input: true,
    tools: true,
    messages: false,
    requestBody: false,
    responseProcessing: true,
    streamProcessing: false,
    contentAnalysis: true,
    rawData: false,
    chunkProcessing: false
  }
});

// 5. 完全关闭日志
const silentTransformer = new ZjcspaceTransformer({
  logLevel: 'none'
});

日志级别说明：
- none: 不输出任何日志
- error: 只输出错误日志
- warn: 输出警告和错误日志
- info: 输出信息、警告和错误日志（默认）
- debug: 输出调试、信息、警告和错误日志
- verbose: 输出所有日志

日志分类说明：
- input: 输入验证相关日志
- fieldCleanup: 字段清理相关日志
- tools: 工具处理相关日志
- messages: 消息处理相关日志
- requestBody: 请求体构建相关日志
- responseProcessing: 响应处理相关日志
- streamProcessing: 流式处理相关日志
- contentAnalysis: 内容分析相关日志
- rawData: 原始数据日志（数据量大，默认关闭）
- chunkProcessing: chunk处理日志（数量多，默认关闭）
*/