export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function getConfiguredLlm() {
  const apiKey = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const apiUrl = process.env.LLM_API_URL || "";
  const model = process.env.LLM_MODEL || "deepseek-chat";

  if (!apiKey || !apiUrl) return null;

  return {
    apiKey,
    model,
    chatCompletionsUrl: apiUrl.endsWith("/chat/completions")
      ? apiUrl
      : `${apiUrl.replace(/\/$/, "")}/chat/completions`,
  };
}

export function extractJsonObject(content: string) {
  const normalized = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("模型未返回有效 JSON。");
  }

  return normalized.slice(start, end + 1);
}

export async function callConfiguredLlmJson<T>(messages: ChatMessage[], fallbackError: string): Promise<T> {
  const config = getConfiguredLlm();

  if (!config) {
    throw new Error("未配置 LLM_API_KEY/LLM_API_URL，无法调用大模型结构化抽取。");
  }

  const response = await fetch(config.chatCompletionsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`${fallbackError}：${await response.text()}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error(fallbackError);
  }

  return JSON.parse(extractJsonObject(content)) as T;
}
