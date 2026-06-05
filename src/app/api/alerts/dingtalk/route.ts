import { NextResponse } from "next/server";
import { sendDingTalkNotification } from "@/lib/dingtalk";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; text?: string };
    if (!body.title || !body.text) {
      return NextResponse.json({ error: "title 和 text 必填。" }, { status: 400 });
    }

    const result = await sendDingTalkNotification({
      title: body.title,
      text: body.text,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "钉钉通知发送失败。" },
      { status: 500 },
    );
  }
}
