import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";

export class TooluseTransformer implements Transformer {
  name = "tooluse";

  transformRequestIn(request: UnifiedChatRequest): UnifiedChatRequest {
    request.messages.push({
      role: "system",
      content: `<system-reminder>Tool mode is active. The user expects you to proactively execute the most suitable tool to help complete the task. 
Before invoking a tool, you must carefully evaluate whether it matches the current task. If no available tool is appropriate for the task, you MUST call the \`ExitTool\` to exit tool mode — this is the only valid way to terminate tool mode.
Always prioritize completing the user's task effectively and efficiently by using tools whenever appropriate.</system-reminder>`,
    });
    if (request.tools?.length) {
      request.tool_choice = "required";
      request.tools.unshift({
        type: "function",
        function: {
          name: "ExitTool",
          description: `Use this tool when you are in tool mode and have completed the task. This is the only valid way to exit tool mode.
IMPORTANT: Before using this tool, ensure that none of the available tools are applicable to the current task. You must evaluate all available options — only if no suitable tool can help you complete the task should you use ExitTool to terminate tool mode.
Examples:
1. Task: "Use a tool to summarize this document" — Do not use ExitTool if a summarization tool is available.
2. Task: "What’s the weather today?" — If no tool is available to answer, use ExitTool after reasoning that none can fulfill the task.`,
          parameters: {
            type: "object",
            properties: {
              response: {
                type: "string",
                description:
                  "Your response will be forwarded to the user exactly as returned — the tool will not modify or post-process it in any way.",
              },
            },
            required: ["response"],
          },
        },
      });
    }
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      if (
        jsonResponse?.choices[0]?.message.tool_calls?.length &&
        jsonResponse?.choices[0]?.message.tool_calls[0]?.function?.name ===
          "ExitTool"
      ) {
        const toolCall = jsonResponse?.choices[0]?.message.tool_calls[0];
        const toolArguments = JSON.parse(toolCall.function.arguments || "{}");
        jsonResponse.choices[0].message.content = toolArguments.response || "";
        delete jsonResponse.choices[0].message.tool_calls;
      }

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
      let exitToolIndex = -1;
      let exitToolResponse = "";

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

                    if (data.choices[0]?.delta?.tool_calls?.length) {
                      const toolCall = data.choices[0].delta.tool_calls[0];

                      if (toolCall.function?.name === "ExitTool") {
                        exitToolIndex = toolCall.index;
                        continue;
                      } else if (
                        exitToolIndex > -1 &&
                        toolCall.index === exitToolIndex &&
                        toolCall.function.arguments
                      ) {
                        exitToolResponse += toolCall.function.arguments;
                        try {
                          const response = JSON.parse(exitToolResponse);
                          data.choices = [
                            {
                              delta: {
                                role: "assistant",
                                content: response.response || "",
                              },
                            },
                          ];
                          const modifiedLine = `data: ${JSON.stringify(
                            data
                          )}\n\n`;
                          controller.enqueue(encoder.encode(modifiedLine));
                        } catch (e) {}
                        continue;
                      }
                    }

                    if (
                      data.choices?.[0]?.delta &&
                      Object.keys(data.choices[0].delta).length > 0
                    ) {
                      const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                      controller.enqueue(encoder.encode(modifiedLine));
                    }
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
