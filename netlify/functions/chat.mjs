// Netlify Function: secure proxy between the website and Dify.ai.
// The API key is read from the DIFY_API_KEY environment variable and never reaches the browser.
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed. Use POST." }, 405);

  const apiKey = process.env.DIFY_API_KEY;
  if (!apiKey) return json({ error: "Server configuration error: DIFY_API_KEY is not set in Netlify environment variables." }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return json({ error: "The 'query' field is required." }, 400);
  if (query.length > 2000) return json({ error: "Message is too long (2000 characters max)." }, 400);

  const baseUrl = (process.env.DIFY_BASE_URL || "https://dify.ai").replace(/\/+$/, "");

  try {
    const res = await fetch(`${baseUrl}/chat-messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: "blocking",
        conversation_id: body.conversation_id || "",
        user: body.user || "corvit-student",
      }),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }

    if (!res.ok || !data) {
      const message = (data && (data.message || data.error)) || `Dify returned an unexpected response (HTTP ${res.status}).`;
      return json({ error: message, code: data && data.code }, res.ok ? 502 : res.status);
    }
    return json({ answer: data.answer || "", conversation_id: data.conversation_id || "", message_id: data.message_id || "" });
  } catch (err) {
    return json({ error: "Could not reach Dify. Check DIFY_BASE_URL and try again.", detail: String(err && err.message || err) }, 502);
  }
};
