import { log } from "../utils/log";
import { LLMProvider, UnifiedChatRequest, UnifiedMessage } from "../types/llm";
import { Transformer } from "../types/transformer";
import { Content, ContentListUnion, Part, ToolListUnion } from "@google/genai";

export class GeminiTransformer implements Transformer {
  name = "gemini";

  endPoint = "/v1beta/models/:modelAndAction";

  transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider
  ): Record<string, any> {
    return {
      body: {
        contents: request.messages.map((message: UnifiedMessage) => {
          let role: "user" | "model";
          if (message.role === "assistant") {
            role = "model";
          } else if (["user", "system", "tool"].includes(message.role)) {
            role = "user";
          } else {
            role = "user"; // Default to user if role is not recognized
          }
          const parts = [];
          if (typeof message.content === "string") {
            parts.push({
              text: message.content,
            });
          } else if (Array.isArray(message.content)) {
            parts.push(
              ...message.content.map((content) => {
                if (content.type === "text") {
                  return {
                    text: content.text || "",
                  };
                }
              })
            );
          }

          if (Array.isArray(message.tool_calls)) {
            parts.push(
              ...message.tool_calls.map((toolCall) => {
                return {
                  functionCall: {
                    id:
                      toolCall.id ||
                      `tool_${Math.random().toString(36).substring(2, 15)}`,
                    name: toolCall.function.name,
                    args: JSON.parse(toolCall.function.arguments || "{}"),
                  },
                };
              })
            );
          }
          return {
            role,
            parts,
          };
        }),
        tools: [
          {
            functionDeclarations:
              request.tools?.map((tool) => {
                delete tool.function.parameters?.$schema;
                delete tool.function.parameters?.additionalProperties;
                if (tool.function.parameters?.properties) {
                  Object.keys(tool.function.parameters.properties).forEach(
                    (key) => {
                      delete tool.function.parameters.properties[key].$schema;
                      delete tool.function.parameters.properties[key]
                        .additionalProperties;
                      if (
                        tool.function.parameters.properties[key].items &&
                        typeof tool.function.parameters.properties[key]
                          .items === "object"
                      ) {
                        delete tool.function.parameters.properties[key].items
                          .$schema;
                        delete tool.function.parameters.properties[key].items
                          .additionalProperties;
                      }

                      if (
                        tool.function.parameters.properties[key].type ===
                        "string"
                      ) {
                        if (
                          !["enum", "date-time"].includes(
                            tool.function.parameters.properties[key].format
                          )
                        ) {
                          delete tool.function.parameters.properties[key]
                            .format;
                        }
                      }
                    }
                  );
                }
                return {
                  name: tool.function.name,
                  description: tool.function.description,
                  parameters: tool.function.parameters,
                };
              }) || [],
          },
        ],
      },
      config: {
        url: new URL(
          `./${request.model}:${
            request.stream ? "streamGenerateContent?alt=sse" : "generateContent"
          }`,
          provider.baseUrl
        ),
        headers: {
          "x-goog-api-key": provider.apiKey,
          Authorization: undefined,
        },
      },
    };
  }

  transformRequestOut(request: Record<string, any>): UnifiedChatRequest {
    const contents: ContentListUnion = request.contents;
    const tools: ToolListUnion = request.tools;
    const model: string = request.model;
    const max_tokens: number | undefined = request.max_tokens;
    const temperature: number | undefined = request.temperature;
    const stream: boolean | undefined = request.stream;
    const tool_choice: "auto" | "none" | string | undefined =
      request.tool_choice;

    const unifiedChatRequest: UnifiedChatRequest = {
      messages: [],
      model,
      max_tokens,
      temperature,
      stream,
      tool_choice,
    };

    if (Array.isArray(contents)) {
      contents.forEach((content) => {
        if (typeof content === "string") {
          unifiedChatRequest.messages.push({
            role: "user",
            content,
          });
        } else if (typeof (content as Part).text === "string") {
          unifiedChatRequest.messages.push({
            role: "user",
            content: (content as Part).text || null,
          });
        } else if ((content as Content).role === "user") {
          unifiedChatRequest.messages.push({
            role: "user",
            content:
              (content as Content)?.parts?.map((part: Part) => ({
                type: "text",
                text: part.text || "",
              })) || [],
          });
        } else if ((content as Content).role === "model") {
          unifiedChatRequest.messages.push({
            role: "assistant",
            content:
              (content as Content)?.parts?.map((part: Part) => ({
                type: "text",
                text: part.text || "",
              })) || [],
          });
        }
      });
    }

    if (Array.isArray(tools)) {
      unifiedChatRequest.tools = [];
      tools.forEach((tool) => {
        if (Array.isArray(tool.functionDeclarations)) {
          tool.functionDeclarations.forEach((tool) => {
            unifiedChatRequest.tools!.push({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            });
          });
        }
      });
    }

    return unifiedChatRequest;
  }

  // transformResponseIn(response: GeminiChatResponse): UnifiedChatResponse {
  //     return {
  //         id: response.id,
  //         model: response.model,
  //         content: response.content || null,
  //         usage: response.usage ? {
  //             prompt_tokens: response.usage.prompt_tokens,
  //             completion_tokens: response.usage.completion_tokens,
  //             total_tokens: response.usage.total_tokens,
  //         } : undefined,
  //         tool_calls: response.tool_calls?.map(call => ({
  //             id: call.id,
  //             type: call.type,
  //             function: {
  //                 name: call.function.name,
  //                 arguments: call.function.arguments,
  //             },
  //         })),
  //     };
  // }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse: any = await response.json();
      const tool_calls = jsonResponse.candidates[0].content.parts
        .filter((part: Part) => part.functionCall)
        .map((part: Part) => ({
          id:
            part.functionCall?.id ||
            `tool_${Math.random().toString(36).substring(2, 15)}`,
          type: "function",
          function: {
            name: part.functionCall?.name,
            arguments: JSON.stringify(part.functionCall?.args || {}),
          },
        }));
      const res = {
        id: jsonResponse.responseId,
        choices: [
          {
            finish_reason:
              (
                jsonResponse.candidates[0].finishReason as string
              )?.toLowerCase() || null,
            index: 0,
            message: {
              content: jsonResponse.candidates[0].content.parts
                .filter((part: Part) => part.text)
                .map((part: Part) => part.text)
                .join("\n"),
              role: "assistant",
              tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
            },
          },
        ],
        created: parseInt(new Date().getTime() / 1000 + "", 10),
        model: jsonResponse.modelVersion,
        object: "chat.completion",
        usage: {
          completion_tokens: jsonResponse.usageMetadata.candidatesTokenCount,
          prompt_tokens: jsonResponse.usageMetadata.promptTokenCount,
          total_tokens: jsonResponse.usageMetadata.totalTokenCount,
        },
      };
      return new Response(JSON.stringify(res), {
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
      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              let chunk = decoder.decode(value, { stream: true });
              if (chunk.startsWith("data: ")) {
                chunk = chunk.slice(6).trim();
              } else {
                break;
              }
              log("gemini chunk:", chunk);
              chunk = JSON.parse(chunk);
              const tool_calls = chunk.candidates[0].content.parts
                .filter((part: Part) => part.functionCall)
                .map((part: Part) => ({
                  id:
                    part.functionCall?.id ||
                    `tool_${Math.random().toString(36).substring(2, 15)}`,
                  type: "function",
                  function: {
                    name: part.functionCall?.name,
                    arguments: JSON.stringify(part.functionCall?.args || {}),
                  },
                }));
              const res = {
                choices: [
                  {
                    delta: {
                      role: "assistant",
                      content: chunk.candidates[0].content.parts
                        .filter((part: Part) => part.text)
                        .map((part: Part) => part.text)
                        .join("\n"),
                      tool_calls:
                        tool_calls.length > 0 ? tool_calls : undefined,
                    },
                    finish_reason:
                      chunk.candidates[0].finishReason?.toLowerCase() || null,
                    index:
                      chunk.candidates[0].index || tool_calls.length > 0
                        ? 1
                        : 0,
                    logprobs: null,
                  },
                ],
                created: parseInt(new Date().getTime() / 1000 + "", 10),
                id: chunk.responseId || "",
                model: chunk.modelVersion || "",
                object: "chat.completion.chunk",
                system_fingerprint: "fp_a49d71b8a1",
              };
              log(`gemini response: candidates=${res.candidates?.length || 0}`);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(res)}\n\n`)
              );
            }
          } catch (error) {
            controller.error(error);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    return response;
  }
}
