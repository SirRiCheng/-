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

function extractContentFromSse(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .filter((line) => line && line !== "[DONE]")
    .map((line) => {
      try {
        const data = JSON.parse(line);
        return data?.choices?.[0]?.delta?.content || data?.choices?.[0]?.message?.content || "";
      } catch {
        return "";
      }
    })
    .join("");
}

export async function callConfiguredLlmJson<T>(messages: ChatMessage[], fallbackError: string): Promise<T> {
  const config = getConfiguredLlm();

  if (!config) {
    throw new Error("未配置 LLM_API_KEY/LLM_API_URL，无法调用大模型结构化抽取。");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
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
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`${fallbackError}：${await response.text()}`);
  }

  const text = await response.text();
  let content = "";

  try {
    const data = JSON.parse(text);
    content = data?.choices?.[0]?.message?.content || "";
  } catch {
    content = extractContentFromSse(text);
  }

  if (!content || typeof content !== "string") {
    throw new Error(fallbackError);
  }

  return JSON.parse(extractJsonObject(content)) as T;
}
