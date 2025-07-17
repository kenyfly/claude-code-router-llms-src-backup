好的，完全没问题。为这个新计划创建一个清晰的文档是一个非常好的实践，它能帮助我们明确目标、统一认知，并指导后续的开发工作。

下面是一份为您起草的设计文档，可以将其保存为 `docs/newapi-gemini-transformer.md`。

---

```md docs/newapi-gemini-transformer.md
# 设计文档：NewAPI Gemini 原生协议转换器

**文档状态**: 草案
**创建日期**: 2025-07-17
**负责人**: [你的名字]
**相关文档**: `docs/gemini.md`

---

## 1. 概述与目标

### 1.1. 背景

经过调研，我们发现 `newapi` 服务在暴露 Google Gemini 模型时，提供了两种不同的 API 端口：
1.  **OpenAI 兼容端口** (`/v1/chat/completions`)：此端口遵循 OpenAI API 格式，但**不支持**获取模型在响应过程中的流式思考内容（Thinking Process）。
2.  **Gemini 原生端口** (`/v1beta/models/*:generateContent`)：此端口遵循 Google Gemini 的原生 API 格式，根据其文档 (`docs/gemini.md`)，它明确支持通过 `thinkingConfig` 参数来请求并获取模型的思考内容。

当前的 `NewAPITransformer` 是为 Anthropic Claude 的 `thinking` 模式设计的，无法直接用于 Gemini 原生端口。

### 1.2. 目标

为了利用 Gemini 模型的原生思考功能，并将其统一到我们的内部系统中，本项目旨在设计并实现一个新的转换器：`NewAPIGeminiTransformer`。

该转换器的核心目标是：
1.  **请求转换**：将内部统一的 `UnifiedChatRequest` 格式转换为 Gemini 原生 API 所需的 `GenerateContentRequest` 格式。
2.  **响应转换**：将 Gemini 原生 API 返回的 `GenerateContentResponse`（包括流式的思考内容）转换为内部统一的响应格式，特别是要生成标准的 `thinking` 内容块。
3.  **无缝集成**：确保上游应用可以通过一个统一的接口（例如，在请求中添加特定元数据）来启用 Gemini 的思考模式，而无需关心底层的 API 差异。

## 2. 技术设计

### 2.1. 文件与类结构

-   **文件名**: `llms-src/src/transformer/newapi-gemini.transformer.ts`
-   **类名**: `NewAPIGeminiTransformer`
-   **实现接口**: `Transformer`

### 2.2. 请求转换 (`transformRequestIn`)

此方法负责将 `UnifiedChatRequest` 转换为 Gemini 原生的 `GenerateContentRequest`。

#### 2.2.1. 启用思考模式的触发机制

为了向上游应用提供统一的调用方式，我们约定在 `UnifiedChatRequest` 的 `metadata` 对象中添加一个标志来启用思考模式。

```typescript
// 上游应用发起的请求示例
const request: UnifiedChatRequest = {
  model: 'gemini-2.5-pro',
  messages: [...],
  metadata: {
    enable_thinking: true // 👈 触发标志
  }
};
```

#### 2.2.2. 字段映射规则

| UnifiedChatRequest 字段 | Gemini `GenerateContentRequest` 字段 | 转换逻辑和备注                                                                                                                                                             |
| ------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messages`                | `contents` / `system_instruction`    | - `role: "system"` -> `system_instruction` 对象。<br>- `role: "user"`/`"assistant"` -> `contents` 数组中的 `{"role": "user"}` / `{"role": "model"}` 对象。<br>- 多模态内容（如图片）需转换为 `inline_data` 格式。 |
| `tools`                   | `tools`                              | 将 `UnifiedChatRequest.tools` 数组中的函数定义映射到 Gemini 的 `functionDeclarations` 数组中。                                                                            |
| `tool_choice`             | `tool_config`                        | 将 `auto`, `any`, `none` 等值映射到 `tool_config.function_calling_config.mode`。                                                                                           |
| `temperature`, `top_p`, `top_k`, `max_tokens` | `generationConfig` | 将这些参数映射到 `generationConfig` 对象的对应字段 (`maxOutputTokens` 等)。                                                                                                |
| `tool_choice`             | `tool_config`                        | 将 `auto`、`any`、`none` 等值映射到 `tool_config.function_calling_config.mode`。                                                                                           |
| `temperature`、`top_p`、`top_k`、`max_tokens` | `generationConfig` | 将这些参数映射到 `generationConfig` 对象的对应字段（如 `maxOutputTokens`）。                                                                                               |
| `metadata.enable_thinking`| `thinkingConfig`                     | **核心逻辑**：如果 `enable_thinking` 为 `true`，则在请求体中添加 `thinkingConfig: { "includeThoughts": true }`。                                                           |

### 2.3. 响应转换 (`transformResponseOut`)

此方法负责处理来自 Gemini 原生端口的流式响应，并将其转换为统一格式。

#### 2.3.1. 识别思考内容

这是本设计的关键和难点。我们需要在 Gemini 的流式响应中准确识别出代表“思考过程”的数据块。

**假设与验证计划**:
- **初步假设**: 根据 Google 的 API 设计习惯，思考内容很可能会以一种特殊的 `Part` 对象形式出现，例如 `{"thought": "..."}`，或者在 `executableCode` 中以注释或打印输出的形式体现。
- **验证步骤**:
    1.  实现 `transformRequestIn`，构造一个开启 `thinkingConfig` 的请求。
    2.  向 `:streamGenerateContent` 端点发送此请求。
    3.  **捕获并记录完整的、未经处理的原始响应流数据。**
    4.  分析原始数据，确定思考内容块的确切 JSON 结构。

#### 2.3.2. 转换逻辑

一旦确定了思考内容块的格式，我们将采用与 `NewAPITransformer` 类似的“累积-注入”模式。

1.  **初始化**: 在 `ReadableStream` 的 `start` 方法中，初始化一个空的 `thinkingAccumulator` 字符串和一个 `thinkingCompleted` 布尔标志。

2.  **累积**: 循环处理响应流中的每一个 `GenerateContentResponse` 块。遍历其 `candidates[0].content.parts` 数组。如果一个 `part` 被识别为思考内容，则将其内容追加到 `thinkingAccumulator`。

3.  **注入**: 当遇到**第一个非思考内容**的 `part`（例如，一个普通的 `text` part 或 `functionCall` part）时，执行以下操作：
    a. 检查 `thinkingAccumulator` 是否有内容且 `thinkingCompleted` 为 `false`。
    b. 如果是，则创建一个符合我们内部统一格式的 `thinking` 事件块。
    c. 将这个合成的 `thinking` 块 `enqueue`到输出流中。
    d. 设置 `thinkingCompleted = true`，以防止重复注入。

4.  **常规转换**: 对所有非思考内容的 `part`（如 `text`, `functionCall`），将其转换为我们统一格式的相应事件块（如 `content` 块, `tool_calls` 块）并 `enqueue`。

## 3. 开发与验证计划

1.  **阶段一：请求转换与初步测试 (1-2天)**
    - [ ] 创建 `newapi-gemini.transformer.ts` 文件。
    - [ ] 实现 `transformRequestIn` 的完整逻辑。
    - [ ] 编写单元测试，确保字段映射正确。
    - [ ] **关键任务**: 手动或通过脚本发送一个开启了 `thinkingConfig` 的请求，并捕获原始响应流，用于下一阶段的分析。

2.  **阶段二：响应分析与转换实现 (2-3天)**
    - [ ] **关键任务**: 分析阶段一捕获的原始响应，最终确定思考内容块的格式。
    - [ ] 在 `transformResponseOut` 中实现对思考内容的识别、累积和注入逻辑。
    - [ ] 实现对常规内容（文本、函数调用）的转换。
    - [ ] 编写集成测试，覆盖包含思考过程和不包含思考过程两种场景。

3.  **阶段三：集成与文档完善 (1天)**
    - [ ] 将新的转换器集成到主路由或分发逻辑中。
    - [ ] 更新相关配置，确保对 `gemini-2.5-pro` 等模型的请求能正确路由到 `NewAPIGeminiTransformer`。
    - [ ] 完善本设计文档，将“初步假设”更新为“最终实现”，并补充代码示例。

## 4. 风险与未知项

-   **思考内容的格式未知**: 这是最大的风险。如果 `newapi` 返回的思考内容格式非常不规则或难以解析，可能会增加 `transformResponseOut` 的实现复杂度。**缓解措施**: 阶段一的“捕获原始响应”是解决此问题的关键。
-   **性能开销**: 启用 `thinking` 模式可能会增加模型的响应延迟和 token 消耗。需要在上线后进行监控和评估。
```