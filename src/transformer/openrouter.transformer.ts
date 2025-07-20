import { MessageContent, TextContent, UnifiedChatRequest } from "@/types/llm";
import { Transformer } from "../types/transformer";

export class OpenrouterTransformer implements Transformer {
  name = "openrouter";

  transformRequestIn(request: UnifiedChatRequest): UnifiedChatRequest {
    if (!request.model.includes('claude')) {
      request.messages.forEach(msg => {
        if (Array.isArray(msg.content)) {
          (msg.content as MessageContent[]).forEach((item) => {
            if ((item as TextContent).cache_control) {
              delete (item as TextContent).cache_control;
            }
          });
        } else if (msg.cache_control) {
          delete msg.cache_control;
        }
      })
    }
    return request
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();

      // Handle non-streaming response if needed
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else if (response.headers.get("Content-Type")?.includes("stream")) {
      if (!response.body) {
        return response;
      }

      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      let hasTextContent = false;
      let reasoningContent = "";
      let isReasoningComplete = false;

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (
                  line.startsWith("data: ") &&
                  line.trim() !== "data: [DONE]"
                ) {
                  try {
                    const data = JSON.parse(line.slice(6));

                    if (data.choices[0]?.delta?.content && !hasTextContent) {
                      hasTextContent = true;
                    }

                    // Extract reasoning_content from delta
                    if (data.choices?.[0]?.delta?.reasoning) {
                      reasoningContent += data.choices[0].delta.reasoning;
                      const thinkingChunk = {
                        ...data,
                        choices: [
                          {
                            ...data.choices[0],
                            delta: {
                              ...data.choices[0].delta,
                              thinking: {
                                content: data.choices[0].delta.reasoning,
                              },
                            },
                          },
                        ],
                      };
                      delete thinkingChunk.choices[0].delta.reasoning;
                      const thinkingLine = `data: ${JSON.stringify(
                        thinkingChunk
                      )}\n\n`;
                      controller.enqueue(encoder.encode(thinkingLine));
                      continue;
                    }

                    // Check if reasoning is complete (when delta has content but no reasoning_content)
                    if (
                      data.choices?.[0]?.delta?.content &&
                      reasoningContent &&
                      !isReasoningComplete
                    ) {
                      isReasoningComplete = true;
                      const signature = Date.now().toString();

                      // Create a new chunk with thinking block
                      const thinkingChunk = {
                        ...data,
                        choices: [
                          {
                            ...data.choices[0],
                            delta: {
                              ...data.choices[0].delta,
                              content: null,
                              thinking: {
                                content: reasoningContent,
                                signature: signature,
                              },
                            },
                          },
                        ],
                      };
                      delete thinkingChunk.choices[0].delta.reasoning;
                      // Send the thinking chunk
                      const thinkingLine = `data: ${JSON.stringify(
                        thinkingChunk
                      )}\n\n`;
                      controller.enqueue(encoder.encode(thinkingLine));
                    }

                    if (data.choices[0]?.delta?.reasoning) {
                      delete data.choices[0].delta.reasoning;
                    }

                    if (
                      data.choices[0]?.delta?.tool_calls?.length &&
                      hasTextContent
                    ) {
                      data.choices[0].index += 1;
                    }
                    const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                    controller.enqueue(encoder.encode(modifiedLine));
                  } catch (e) {
                    // If JSON parsing fails, pass through the original line
                    controller.enqueue(encoder.encode(line + "\n"));
                  }
                } else {
                  // Pass through non-data lines (like [DONE])
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
            }
          } catch (error) {
            controller.error(error);
          } finally {
            try {
              reader.releaseLock();
            } catch (e) {
              console.error("Error releasing reader lock:", e);
            }
            controller.close();
          }
        },
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

    return response;
  }
}
