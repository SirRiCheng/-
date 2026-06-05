import crypto from "crypto";

type DingTalkNotifyPayload = {
  title: string;
  text: string;
};

function buildSignedWebhookUrl(webhookUrl: string, secret?: string) {
  if (!secret) return webhookUrl;

  const timestamp = Date.now();
  const sign = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}\n${secret}`)
    .digest("base64");
  const url = new URL(webhookUrl);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  return url.toString();
}

export function isDingTalkConfigured() {
  return Boolean(process.env.DINGTALK_WEBHOOK_URL?.trim());
}

export async function sendDingTalkNotification(payload: DingTalkNotifyPayload) {
  const webhookUrl = process.env.DINGTALK_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return { sent: false, reason: "钉钉 Webhook 未配置。" };
  }

  const response = await fetch(buildSignedWebhookUrl(webhookUrl, process.env.DINGTALK_SECRET?.trim()), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: {
        title: payload.title,
        text: `### ${payload.title}\n\n${payload.text}`,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`钉钉通知发送失败：${response.status}`);
  }

  const data = (await response.json().catch(() => ({}))) as { errcode?: number; errmsg?: string };
  if (typeof data.errcode === "number" && data.errcode !== 0) {
    throw new Error(data.errmsg || "钉钉通知发送失败。");
  }

  return { sent: true };
}
