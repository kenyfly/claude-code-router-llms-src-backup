import { Transformer } from "../types/transformer.js";
import { UnifiedChatRequest } from "../types/llm";
import { LLMProvider } from "../types/llm";
import { log } from "@/utils/log";

export class ZjcspaceProTransformer implements Transformer {
  static LOG_PREFIX = '[ZjcspaceProTransformer v1.0.0]';
  name = "zjcspace-pro";

  transformRequestIn(request: UnifiedChatRequest, provider: LLMProvider): Record<string, any> {
    const LOG_PREFIX = ZjcspaceProTransformer.LOG_PREFIX;
    const LOG_MARKERS = {
      REQUEST_OUT: `${LOG_PREFIX} 📤 [REQUEST-OUT]`,
      REQUEST_BODY: `${LOG_PREFIX} 📝 [REQUEST-BODY]`,
      REQUEST_HEADERS: `${LOG_PREFIX} 🏷️ [REQUEST-HEADERS]`,
      STRICT_CLEAN: `${LOG_PREFIX} 🧹 [STRICT-CLEAN]`,
    };
    // This is a simplified version of the strict clean from zjcspace, assuming the core logic is sound.
    // For a production system, this would be refactored into a shared utility.
    const allowedTop = [
      'model', 'messages', 'tools', 'tool_choice', 'stream', 'max_tokens', 'temperature',
      'top_p', 'n', 'stop', 'user'
    ];
    const allowedMsg = ['role', 'content', 'name', 'tool_calls', 'tool_call_id'];

    function strictCleanMessages(messages: any[]): any[] {
      if (!Array.isArray(messages)) return [];
      return messages.map(msg => {
        const cleanedMsg: any = {};
        for (const k of allowedMsg) {
          if (msg[k] !== undefined) {
            cleanedMsg[k] = msg[k];
          }
        }
        return cleanedMsg;
      });
    }

    const requestBody: any = {};
    for (const key of allowedTop) {
        if ((request as any)[key] !== undefined) {
            if (key === 'messages') {
                requestBody[key] = strictCleanMessages((request as any)[key]);
            } else {
                requestBody[key] = (request as any)[key];
            }
        }
    }
    
    // Ensure stream is explicitly set if not present, for clarity
    if (requestBody.stream === undefined) {
        requestBody.stream = true; // Defaulting to stream as we handle it manually
    }


    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${provider.apiKey}`
    };

    log(`${LOG_MARKERS.REQUEST_OUT} Building request for provider.`);
    
    return {
      body: requestBody,
      config: {
        url: new URL(provider.baseUrl),
        headers,
      },
    };
  }

  async transformResponseOut(response: Response): Promise<Response> {
    const LOG_PREFIX = ZjcspaceProTransformer.LOG_PREFIX;
    const LOG_MARKERS = {
      RESPONSE_IN: `${LOG_PREFIX} 📨 [RESPONSE-IN]`,
      STREAM_PROCESSING: `${LOG_PREFIX} 🌊 [STREAM-MANUAL]`,
      EVENT: `${LOG_PREFIX} 📤 [EVENT]`,
      ERROR: `${LOG_PREFIX} ❌ [ERROR]`,
      INFO: `${LOG_PREFIX} ℹ️ [INFO]`,
    };

    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    log(`${LOG_MARKERS.RESPONSE_IN} Response headers: ` + JSON.stringify(headersObj));

    if (!response.body) {
        log(`${LOG_MARKERS.ERROR} Response body is empty, cannot process.`);
        return new Response("Error: Response body is empty.", { status: 500 });
    }

    log(`${LOG_MARKERS.STREAM_PROCESSING} Response detected, starting manual stream processing...`);
    const decoder = new TextDecoder("utf-8");
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        
        let buffer = "";
        let braceCount = 0;
        let jsonStartIndex = -1;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              if (buffer.trim().length > 0) {
                  log(`${LOG_MARKERS.INFO} Stream ended, processing remaining buffer content:`, buffer);
                  try {
                      const finalJson = JSON.parse(buffer);
                      const finalChunk = { choices: [{ delta: finalJson.choices[0].message, finish_reason: "stop" }] };
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
                  } catch (e) {
                      log(`${LOG_MARKERS.ERROR} Failed to parse remaining buffer:`, e);
                  }
              }
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            let cursor = 0;
            while (cursor < buffer.length) {
              const char = buffer[cursor];
              
              if (braceCount === 0 && char === '{') {
                braceCount = 1;
                jsonStartIndex = cursor;
              } else if (jsonStartIndex !== -1) {
                if (char === '{') braceCount++;
                if (char === '}') braceCount--;
              }

              if (jsonStartIndex !== -1 && braceCount === 0) {
                const jsonString = buffer.substring(jsonStartIndex, cursor + 1);
                
                try {
                  const jsonData = JSON.parse(jsonString);
                  log(`${LOG_MARKERS.EVENT} Successfully parsed and forwarding an independent message.`);

                  const chunkToSend = {
                    id: jsonData.id || `chunk-${Date.now()}`,
                    object: "chat.completion.chunk",
                    created: jsonData.created || Math.floor(Date.now() / 1000),
                    model: jsonData.model || "zjcspace-pro-model",
                    choices: [{
                      index: 0,
                      delta: jsonData.choices[0].message,
                      finish_reason: null
                    }]
                  };
                  
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunkToSend)}\n\n`));

                } catch (e) {
                  log(`${LOG_MARKERS.ERROR} JSON parse failed, skipping chunk:`, jsonString, e);
                }

                buffer = buffer.substring(cursor + 1);
                cursor = -1;
                jsonStartIndex = -1;
              }
              cursor++;
            }
          }
        } catch (error) {
          log(`${LOG_MARKERS.ERROR} Manual stream processing exception:`, error);
          controller.error(error);
        } finally {
          log(`${LOG_MARKERS.STREAM_PROCESSING} Manual stream processing complete, sending [DONE] signal.`);
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          try {
            reader.releaseLock();
          } catch {}
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }
}
