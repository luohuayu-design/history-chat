/**
 * 时空对话 · 免费中转（Cloudflare Pages Functions / _worker.js）
 * 浏览器不能直接跨域调用智谱接口，这里代转发一次。
 * 密钥不写在代码里，用 `wrangler pages secret put ZHIPU_API_KEY` 存进环境变量。
 */
export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') {
      return new Response('时空对话中转服务在运行中，请用 POST 调用。', {
        status: 200,
        headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    if (!env.ZHIPU_API_KEY) return json({ error: '中转还没有配置 ZHIPU_API_KEY' }, 500, cors);

    let messages;
    try {
      const body = await request.json();
      messages = body && body.messages;
    } catch {
      return json({ error: '请求体不是合法 JSON' }, 400, cors);
    }
    if (!Array.isArray(messages) || !messages.length) {
      return json({ error: 'messages 格式不正确' }, 400, cors);
    }

    try {
      const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.ZHIPU_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'glm-4-flash',
          messages: messages.slice(-14),
          temperature: 0.8,
          max_tokens: 500,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return json({ error: data?.error?.message || `智谱接口错误(${res.status})` }, 502, cors);
      }
      const reply = data?.choices?.[0]?.message?.content;
      if (!reply) return json({ error: '模型没有返回内容' }, 502, cors);
      return json({ reply }, 200, cors);
    } catch (err) {
      return json({ error: '中转请求失败：' + (err && err.message ? err.message : err) }, 500, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
