import { NextResponse } from "next/server";
import { buildRuleFromTemplate } from "@/lib/rules/rule-engine";
import { FieldMapping, ParseRule, TemplateMatchResult } from "@/lib/types";

export const runtime = "nodejs";

type GenerateRuleBody = {
  fileName?: string;
  headers?: string[];
  mapping?: FieldMapping;
  sampleRows?: Array<Record<string, unknown>>;
};

async function callConfiguredLlm(body: GenerateRuleBody, fallbackRule: ParseRule) {
  const apiKey = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const apiUrl = process.env.LLM_API_URL || "";
  const model = process.env.LLM_MODEL || "deepseek-chat";

  if (!apiKey || !apiUrl) return null;
  const chatCompletionsUrl = apiUrl.endsWith("/chat/completions")
    ? apiUrl
    : `${apiUrl.replace(/\/$/, "")}/chat/completions`;

  const prompt = [
    "你是物流出库单导入系统的解析规则生成器。",
    "请根据文件名、表头和样例行生成一条通用解析规则，不要直接解析业务数据。",
    "规则必须能描述字段映射、跳过头部、尾部信息提取、跨行聚合、矩阵转置、多Sheet合并、卡片拆分、纯文本提取等操作。",
    "仅返回 JSON，字段结构必须兼容 fallbackRule。",
    JSON.stringify({ body, fallbackRule }),
  ].join("\n");

  try {
    const response = await fetch(chatCompletionsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;
    return JSON.parse(content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()) as ParseRule;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRuleBody;
    const template: TemplateMatchResult = {
      mapping: body.mapping || {},
      matchedBy: "alias",
      confidence: 0,
      missingFields: [],
      signature: (body.headers || []).join("|"),
    };
    const fallbackRule = buildRuleFromTemplate(body.fileName || "upload.xlsx", body.headers || [], template);
    const llmRule = await callConfiguredLlm(body, fallbackRule);

    return NextResponse.json({
      rule: llmRule || fallbackRule,
      generatedBy: llmRule ? "llm" : "local-heuristic",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 生成规则失败。" },
      { status: 500 },
    );
  }
}
