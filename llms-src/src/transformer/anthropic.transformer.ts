import { ChatCompletion } from "openai/resources";
import { UnifiedChatRequest, UnifiedMessage, UnifiedTool } from "@/types/llm";
import { Transformer } from "@/types/transformer";
import { log } from "@/utils/log";

export class AnthropicTransformer implements Transformer {
  name = "Anthropic";
  endPoint = "/v1/messages";

  transformRequestOut(request: Record<string, any>): UnifiedChatRequest {
    log(`🚀 [MODEL_ROUTING] Anthropic Request - Model: ${request.model}, Messages: ${request.messages?.length || 0}`);
    // 检查是否是背景模型
    if (request.model?.includes("gemini-2.5-flash-lite-preview-06-17")) {
      log(`✅ [BACKGROUND_MODEL] 检测到背景模型: ${request.model}`);
    } else {
      log(`🟡 [OTHER_MODEL] 其他模型: ${request.model}`);
    }

    const messages: UnifiedMessage[] = [];

    if (request.system) {
      if (typeof request.system === "string") {
        messages.push({
          role: "system",
          content: [{
            type: "text",
            text: request.system,
            cache_control: { type: "ephemeral" }
          }],
        });
      } else if (Array.isArray(request.system)) {
        const textParts = request.system
          .filter((item: any) => item.type === "text" && item.text)
          .map((item: any) => ({
            type: "text" as const,
            text: item.text,
            cache_control: { type: "ephemeral" }
          }));
        messages.push({
          role: 'system',
          content: textParts,
        });
      }
    }

    const requestMessages = JSON.parse(JSON.stringify(request.messages || []));

    requestMessages?.forEach((msg: any, index: number) => {
      if (msg.role === "user" || msg.role === "assistant") {
        if (typeof msg.content === "string") {
          messages.push({
            role: msg.role,
            content: [{
              type: "text",
              text: msg.content,
              cache_control: { type: "ephemeral" }
            }],
          });
        } else if (Array.isArray(msg.content)) {
          if (msg.role === "user") {
            const toolParts = msg.content.filter(
              (c: any) => c.type === "tool_result" && c.tool_use_id
            );
            if (toolParts.length) {
              toolParts.forEach((tool: any, toolIndex: number) => {
                const toolMessage: UnifiedMessage = {
                  role: "tool",
                  name: tool.name || tool.tool_use_id || "unknown",
                  content:
                    typeof tool.content === "string"
                      ? tool.content
                      : JSON.stringify(tool.content),
                  tool_call_id: tool.tool_use_id,
                  cache_control: tool.cache_control,
                };
                messages.push(toolMessage);
              });
            }

            const textParts = msg.content.filter(
              (c: any) => c.type === "text" && c.text
            ).map((c: any) => ({
              type: "text",
              text: c.text,
              cache_control: { type: "ephemeral" }
            }));
            if (textParts.length) {
              messages.push({
                role: "user",
                content: textParts,
              });
            }
          } else if (msg.role === "assistant") {
            const textParts = msg.content.filter(
              (c: any) => c.type === "text" && c.text
            ).map((c: any) => ({
              type: "text",
              text: c.text,
              cache_control: { type: "ephemeral" }
            }));
            if (textParts.length) {
              messages.push(
                ...textParts.map((text: any) => ({
                  role: "assistant",
                  content: text.text,
                }))
              );
            }

            const toolCallParts = msg.content.filter(
              (c: any) => c.type === "tool_use" && c.id
            );
            if (toolCallParts.length) {
              messages.push({
                role: "assistant" as const,
                content: null,
                tool_calls: toolCallParts.map((tool: any) => {
                  return {
                    id: tool.id,
                    type: "function" as const,
                    function: {
                      name: tool.name,
                      arguments: JSON.stringify(tool.input || {}),
                    },
                  };
                }),
              });
            }
          }
          return;
        }
      }
    });

    const result: UnifiedChatRequest = {
      messages,
      model: request.model,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      stream: request.stream,
      tools: request.tools
        ? this.convertAnthropicToolsToUnified(request.tools)
        : undefined,
      tool_choice: request.tool_choice,
    };
    return result;
  }

  async transformResponseIn(response: Response): Promise<Response> {
    const isStream = response.headers
      .get("Content-Type")
      ?.includes("text/event-stream");
    
    log(`📡 [RESPONSE_TYPE] 响应类型: ${isStream ? '流式' : '非流式'}`);
    log(`📡 [RESPONSE_HEADERS] 响应头: Content-Type=${response.headers.get('Content-Type')}`);
    
    if (isStream) {
      if (!response.body) {
        throw new Error("Stream response body is null");
      }
      const convertedStream = await this.convertOpenAIStreamToAnthropic(
        response.body
      );
      return new Response(convertedStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      const data = await response.json();
      const anthropicResponse = this.convertOpenAIResponseToAnthropic(data);
      
      return new Response(JSON.stringify(anthropicResponse), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private convertAnthropicToolsToUnified(tools: any[]): UnifiedTool[] {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.input_schema,
      },
    }));
  }

    private parseSseMessage(messageString: string): { data: string } | null {
    const lines = messageString.split('\n');  // 修复：使用正确的换行符
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataLines.push(line.substring(6));
      } else if (line.startsWith('data:')) {
        dataLines.push(line.substring(5));
      }
    }

    if (dataLines.length === 0) {
      return null;
    }

    return { data: dataLines.join('\n') };  // 修复：使用正确的换行符
  }

  private async convertOpenAIStreamToAnthropic(
    openaiStream: ReadableStream
  ): Promise<ReadableStream> {
    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const messageId = `msg_${Date.now()}`;
        let model = "unknown";
        let hasStarted = false;
        let hasTextContentStarted = false;
        let hasFinished = false;
        const toolCalls = new Map<number, any>();
        const toolCallIndexToContentBlockIndex = new Map<number, number>();
        let totalChunks = 0;
        let contentChunks = 0;
        let toolCallChunks = 0;
        let isClosed = false;
        let isThinkingStarted = false;
        let contentIndex = 0;

        const safeEnqueue = (data: Uint8Array) => {
          if (!isClosed) {
            try {
              const dataStr = new TextDecoder().decode(data);
              // 为了避免刷屏，我们只打印包含 "thinking" 的事件
              // if (dataStr.includes("thinking")) {
              //   log.info(`📬 [ANTHROPIC_SSE_EVENT] 发送给客户端的思考事件:`, dataStr.trim());
              // }
              controller.enqueue(data);
            } catch (error) {
              if (
                error instanceof TypeError &&
                error.message.includes("Controller is already closed")
              ) {
                isClosed = true;
              } else {
                log(`send data error: ${(error as Error).message}`);
                throw error;
              }
            }
          }
        };

        const safeClose = () => {
          if (!isClosed) {
            try {
              controller.close();
              isClosed = true;
            } catch (error) {
              if (
                error instanceof TypeError &&
                error.message.includes("Controller is already closed")
              ) {
                isClosed = true;
              } else {
                throw error;
              }
            }
          }
        };

        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

        try {
          reader = openaiStream.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            if (isClosed) {
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (isClosed || hasFinished) break;

              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") {
                continue;
              }

              try {
                const chunk = JSON.parse(data);
                totalChunks++;
                
                if (totalChunks === 1) {
                  log(`📊 [FIRST_CHUNK] 模型: ${chunk.model || 'unknown'}, ID: ${chunk.id || 'unknown'}`);
                  if (chunk.model?.includes("gemini-2.5-flash-lite-preview-06-17")) {
                    log(`🎯 [BACKGROUND_STREAM_START] 背景模型流式响应开始`);
                  }
                }

                model = chunk.model || model;
                if (chunk.model && chunk.model !== model) {
                  log(`🔄 [MODEL_RESPONSE] 响应模型: ${chunk.model}`);
                  if (chunk.model.includes("gemini-2.5-flash-lite-preview-06-17")) {
                    log(`✅ [BACKGROUND_MODEL_RESPONSE] 背景模型响应确认: ${chunk.model}`);
                  }
                }

                if (chunk.error) {
                  const errorMessage = {
                    type: "error",
                    message: {
                      type: "api_error",
                      message: JSON.stringify(chunk.error),
                    },
                  };

                  safeEnqueue(
                    encoder.encode(
                      `event: error\ndata: ${JSON.stringify(errorMessage)}\n\n`
                    )
                  );
                  continue;
                }

                if (!hasStarted && !isClosed && !hasFinished) {
                  hasStarted = true;

                  const messageStart = {
                    type: "message_start",
                    message: {
                      id: messageId,
                      type: "message",
                      role: "assistant",
                      content: [],
                      model: model,
                      stop_reason: null,
                      stop_sequence: null,
                      usage: { input_tokens: 1, output_tokens: 1 },
                    },
                  };

                  safeEnqueue(
                    encoder.encode(
                      `event: message_start\ndata: ${JSON.stringify(
                        messageStart
                      )}\n\n`
                    )
                  );
                }

                const choice = chunk.choices?.[0];
                if (!choice) {
                  if (model?.includes("gemini-2.5-flash-lite-preview-06-17")) {
                    log(`⚠️ [BACKGROUND_NO_CHOICE] 背景模型响应没有选择: ${JSON.stringify(chunk).substring(0, 200)}...`);
                  }
                  continue;
                }

                if (choice?.delta?.thinking && !isClosed && !hasFinished) {
                  // log.info(`✅ [ANTHROPIC_THINKING] 接收到上游的 "thinking" 信号:`, JSON.stringify(choice.delta.thinking));
                  if (!isThinkingStarted) {
                    const contentBlockStart = {
                      type: "content_block_start",
                      index: contentIndex,
                      content_block: { type: "thinking", thinking: "" },
                    };
                    safeEnqueue(
                      encoder.encode(
                        `event: content_block_start\ndata: ${JSON.stringify(
                          contentBlockStart
                        )}\n\n`
                      )
                    );
                    isThinkingStarted = true;
                  }
                  if (choice.delta.thinking.signature) {
                    const thinkingSignature = {
                      type: "content_block_delta",
                      index: contentIndex,
                      delta: {
                        type: "signature_delta",
                        signature: choice.delta.thinking.signature,
                      },
                    };
                    safeEnqueue(
                      encoder.encode(
                        `event: content_block_delta\ndata: ${JSON.stringify(
                          thinkingSignature
                        )}\n\n`
                      )
                    );
                    const contentBlockStop = {
                      type: "content_block_stop",
                      index: contentIndex,
                    };
                    safeEnqueue(
                      encoder.encode(
                        `event: content_block_stop\ndata: ${JSON.stringify(
                          contentBlockStop
                        )}\n\n`
                      )
                    );
                    contentIndex++;
                  } else if (choice.delta.thinking.content) {
                    // log.info(`➡️ [ANTHROPIC_THINKING] 正在向下游发送 "thinking_delta": "${choice.delta.thinking.content}"`);
                    const thinkingChunk = {
                      type: "content_block_delta",
                      index: contentIndex,
                      delta: {
                        type: "thinking_delta",
                        thinking: choice.delta.thinking.content || "",
                      },
                    };
                    safeEnqueue(
                      encoder.encode(
                        `event: content_block_delta\ndata: ${JSON.stringify(
                          thinkingChunk
                        )}\n\n`
                      )
                    );
                  }
                }

                if (choice?.delta?.content && !isClosed && !hasFinished) {
                  contentChunks++;

                  if (!hasTextContentStarted && !hasFinished) {
                    hasTextContentStarted = true;
                    const contentBlockStart = {
                      type: "content_block_start",
                      index: contentIndex,
                      content_block: {
                        type: "text",
                        text: "",
                      },
                    };
                    safeEnqueue(
                      encoder.encode(
                        `event: content_block_start\ndata: ${JSON.stringify(
                          contentBlockStart
                        )}\n\n`
                      )
                    );
                  }

                  if (!isClosed && !hasFinished) {
                    const anthropicChunk = {
                      type: "content_block_delta",
                      index: contentIndex,
                      delta: {
                        type: "text_delta",
                        text: choice.delta.content,
                      },
                    };
                    safeEnqueue(
                      encoder.encode(
                        `event: content_block_delta\ndata: ${JSON.stringify(
                          anthropicChunk
                        )}\n\n`
                      )
                    );
                  }
                }

                if (choice?.delta?.tool_calls && !isClosed && !hasFinished) {
                  toolCallChunks++;
                  const processedInThisChunk = new Set<number>();

                  for (const toolCall of choice.delta.tool_calls) {
                    if (isClosed) break;
                    const toolCallIndex = toolCall.index ?? 0;
                    if (processedInThisChunk.has(toolCallIndex)) {
                      continue;
                    }
                    processedInThisChunk.add(toolCallIndex);
                    const isUnknownIndex =
                      !toolCallIndexToContentBlockIndex.has(toolCallIndex);

                    if (isUnknownIndex) {
                      const newContentBlockIndex = hasTextContentStarted
                        ? toolCallIndexToContentBlockIndex.size + 1
                        : toolCallIndexToContentBlockIndex.size;
                      if (newContentBlockIndex !== 0) {
                        log("content_block_stop2");
                        const contentBlockStop = {
                          type: "content_block_stop",
                          index: contentIndex,
                        };
                        safeEnqueue(
                          encoder.encode(
                            `event: content_block_stop\ndata: ${JSON.stringify(
                              contentBlockStop
                            )}\n\n`
                          )
                        );
                        contentIndex++;
                      }
                      toolCallIndexToContentBlockIndex.set(
                        toolCallIndex,
                        newContentBlockIndex
                      );
                      const toolCallId =
                        toolCall.id || `call_${Date.now()}_${toolCallIndex}`;
                      const toolCallName =
                        toolCall.function?.name || `tool_${toolCallIndex}`;
                      const contentBlockStart = {
                        type: "content_block_start",
                        index: contentIndex,
                        content_block: {
                          type: "tool_use",
                          id: toolCallId,
                          name: toolCallName,
                          input: {},
                        },
                      };

                      safeEnqueue(
                        encoder.encode(
                          `event: content_block_start\ndata: ${JSON.stringify(
                            contentBlockStart
                          )}\n\n`
                        )
                      );

                      const toolCallInfo = {
                        id: toolCallId,
                        name: toolCallName,
                        arguments: "",
                        contentBlockIndex: newContentBlockIndex,
                      };
                      toolCalls.set(toolCallIndex, toolCallInfo);
                    } else if (toolCall.id && toolCall.function?.name) {
                      const existingToolCall = toolCalls.get(toolCallIndex)!;
                      const wasTemporary =
                        existingToolCall.id.startsWith("call_") &&
                        existingToolCall.name.startsWith("tool_");

                      if (wasTemporary) {
                        existingToolCall.id = toolCall.id;
                        existingToolCall.name = toolCall.function.name;
                      }
                    }

                    if (
                      toolCall.function?.arguments &&
                      !isClosed &&
                      !hasFinished
                    ) {
                      const blockIndex =
                        toolCallIndexToContentBlockIndex.get(toolCallIndex);
                      if (blockIndex === undefined) {
                        continue;
                      }
                      const currentToolCall = toolCalls.get(toolCallIndex);
                      if (currentToolCall) {
                        currentToolCall.arguments +=
                          toolCall.function.arguments;
                        try {
                          let parsedParams = null;
                          const trimmedArgs = currentToolCall.arguments.trim();
                          if (
                            trimmedArgs.startsWith("{") &&
                            trimmedArgs.endsWith("}")
                          ) {
                            try {
                              parsedParams = JSON.parse(trimmedArgs);
                            } catch (e: any) {
                              log(
                                "Tool call index:",
                                toolCallIndex,
                                "error",
                                e.message
                              );
                            }
                          }
                        } catch (e: any) {
                          log(
                            "Tool call index:",
                            toolCallIndex,
                            "error",
                            e.message
                          );
                        }
                      }

                      try {
                        const anthropicChunk = {
                          type: "content_block_delta",
                          index: contentIndex,
                          delta: {
                            type: "input_json_delta",
                            partial_json: toolCall.function.arguments,
                          },
                        };
                        safeEnqueue(
                          encoder.encode(
                            `event: content_block_delta\ndata: ${JSON.stringify(
                              anthropicChunk
                            )}\n\n`
                          )
                        );
                      } catch (error) {
                        try {
                          const fixedArgument = toolCall.function.arguments
                            .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
                            .replace(/\\/g, "\\\\")
                            .replace(/"/g, '\\"');

                          const fixedChunk = {
                            type: "content_block_delta",
                            index: contentIndex,
                            delta: {
                              type: "input_json_delta",
                              partial_json: fixedArgument,
                            },
                          };
                          safeEnqueue(
                            encoder.encode(
                              `event: content_block_delta\ndata: ${JSON.stringify(
                                fixedChunk
                              )}\n\n`
                            )
                          );
                        } catch (fixError) {
                          console.error(fixError);
                        }
                      }
                    }
                  }
                }

                if (choice?.finish_reason && !isClosed && !hasFinished) {
                  hasFinished = true;
                  if (model?.includes("gemini-2.5-flash-lite-preview-06-17")) {
                    log(`🎯 [BACKGROUND_FINISH_REASON] 背景模型完成原因: ${choice.finish_reason}`);
                  }
                  log(`🏁 [STREAM_END] 总块数: ${totalChunks}, 内容块: ${contentChunks}, 工具块: ${toolCallChunks}, 模型: ${model}`);
                  if (model?.includes("gemini-2.5-flash-lite-preview-06-17")) {
                    log(`🎯 [BACKGROUND_STREAM_END] 背景模型流式响应结束`);
                  }
                  if (contentChunks === 0 && toolCallChunks === 0) {
                    console.error(
                      "Warning: No content in the stream response!"
                    );
                  }

                  if (
                    (hasTextContentStarted || toolCallChunks > 0) &&
                    !isClosed
                  ) {
                    log("content_block_stop hasTextContentStarted");
                    const contentBlockStop = {
                      type: "content_block_stop",
                      index: contentIndex,
                    };
                    safeEnqueue(
                      encoder.encode(
                        `event: content_block_stop\ndata: ${JSON.stringify(
                          contentBlockStop
                        )}\n\n`
                      )
                    );
                  }

                  if (!isClosed) {
                    const stopReasonMapping: Record<string, string> = {
                      stop: "end_turn",
                      length: "max_tokens",
                      tool_calls: "tool_use",
                      content_filter: "stop_sequence",
                    };

                    const anthropicStopReason =
                      stopReasonMapping[choice.finish_reason] || "end_turn";

                    const messageDelta = {
                      type: "message_delta",
                      delta: {
                        stop_reason: anthropicStopReason,
                        stop_sequence: null,
                      },
                      usage: {
                        input_tokens: chunk.usage?.prompt_tokens || 0,
                        output_tokens: chunk.usage?.completion_tokens || 0,
                      },
                    };
                    safeEnqueue(
                      encoder.encode(
                        `event: message_delta\ndata: ${JSON.stringify(
                          messageDelta
                        )}\n\n`
                      )
                    );
                  }

                  if (!isClosed) {
                    const messageStop = {
                      type: "message_stop",
                    };
                    safeEnqueue(
                      encoder.encode(
                        `event: message_stop\ndata: ${JSON.stringify(
                          messageStop
                        )}\n\n`
                      )
                    );
                  }

                  const finalResponse: any = {
                    type: "message",
                    role: "assistant",
                    content: [],
                    stop_reason: choice.finish_reason === "stop" ? "end_turn" : 
                                choice.finish_reason === "length" ? "max_tokens" :
                                choice.finish_reason === "tool_calls" ? "tool_use" :
                                choice.finish_reason === "content_filter" ? "stop_sequence" : "end_turn",
                    stop_sequence: null,
                    usage: {
                      input_tokens: chunk.usage?.prompt_tokens || 0,
                      output_tokens: chunk.usage?.completion_tokens || 0,
                    },
                  };

                  if (contentChunks > 0) {
                    finalResponse.content.push({
                      type: "text",
                      text: choice.delta?.content || ""
                    });
                  }

                  if (toolCallChunks > 0) {
                    toolCalls.forEach((toolCall) => {
                      finalResponse.content.push({
                        type: "tool_use",
                        id: toolCall.id,
                        name: toolCall.name,
                        input: toolCall.arguments ? JSON.parse(toolCall.arguments) : {}
                      });
                    });
                  }

                  log(`🎯 [FINAL_RESPONSE] Conversion complete, final Anthropic response: ${JSON.stringify(finalResponse, null, 2)}`);
                  if (model?.includes("gemini-2.5-flash-lite-preview-06-17")) {
                    log(`🎯 [BACKGROUND_FINAL_RESPONSE] 背景模型最终响应完成`);
                  }
                  break;
                }
              } catch (parseError: any) {
                if (model?.includes("gemini-2.5-flash-lite-preview-06-17")) {
                  log(`❌ [BACKGROUND_PARSE_ERROR] 背景模型响应解析错误: ${parseError.message}`);
                  log(`❌ [BACKGROUND_PARSE_ERROR] 问题数据: ${data.substring(0, 200)}...`);
                } else {
                  log(`parseError: ${parseError.name} message: ${parseError.message} data: ${data.substring(0, 100)}...`);
                }
              }
            }
          }
          
          // 监控背景模型的流式响应结束
          if (model?.includes("gemini-2.5-flash-lite-preview-06-17")) {
            log(`🏁 [BACKGROUND_STREAM_LOOP_END] 背景模型流式响应主循环结束，总块数: ${totalChunks}`);
          }
          
          safeClose();
        } catch (error) {
          if (!isClosed) {
            try {
              // 特别标记背景模型的错误
              if (model?.includes("gemini-2.5-flash-lite-preview-06-17")) {
                log(`❌ [BACKGROUND_STREAM_ERROR] 背景模型流式响应错误: ${(error as Error).message}`);
              }
              controller.error(error);
            } catch (controllerError) {
              console.error(controllerError);
            }
          }
        } finally {
          if (reader) {
            try {
              reader.releaseLock();
            } catch (releaseError) {
              console.error(releaseError);
            }
          }
        }
      },
      cancel(reason) {
        log("cancle stream:", reason);
        // 特别标记背景模型的取消
        log(`❌ [STREAM_CANCEL] 流式响应被取消: ${reason}`);
      },
    });

    return readable;
  }

  private convertOpenAIResponseToAnthropic(
    openaiResponse: ChatCompletion
  ): any {
          // log(`Original OpenAI response: id=${openaiResponse.id || 'unknown'}`); // 注释掉详细日志，避免刷屏

    const choice = openaiResponse.choices[0];
    if (!choice) {
      throw new Error("No choices found in OpenAI response");
    }
    const content: any[] = [];
    if (choice.message.content) {
      content.push({
        type: "text",
        text: choice.message.content,
      });
    }
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      choice.message.tool_calls.forEach((toolCall) => {
        let parsedInput = {};
        try {
          const argumentsStr = toolCall.function.arguments || "{}";

          if (typeof argumentsStr === "object") {
            parsedInput = argumentsStr;
          } else if (typeof argumentsStr === "string") {
            parsedInput = JSON.parse(argumentsStr);
          }
        } catch (parseError) {
          parsedInput = { text: toolCall.function.arguments || "" };
        }

        content.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function.name,
          input: parsedInput,
        });
      });
    }

    const result = {
      id: openaiResponse.id,
      type: "message",
      role: "assistant",
      model: openaiResponse.model,
      content: content,
      stop_reason:
        choice.finish_reason === "stop"
          ? "end_turn"
          : choice.finish_reason === "length"
            ? "max_tokens"
            : choice.finish_reason === "tool_calls"
              ? "tool_use"
              : choice.finish_reason === "content_filter"
                ? "stop_sequence"
                : "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: openaiResponse.usage?.prompt_tokens || 0,
        output_tokens: openaiResponse.usage?.completion_tokens || 0,
      },
    };
    // 显示完整的最终响应信息
    log(`🎯 [FINAL_RESPONSE] Conversion complete, final Anthropic response: ${JSON.stringify(result, null, 2)}`);
    return result;
  }
}
