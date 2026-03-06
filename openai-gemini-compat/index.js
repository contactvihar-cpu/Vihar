const https = require("https");

function requestJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);

    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch (err) {
            reject(
              new Error(`Gemini response parse error: ${err.message}. Body: ${raw}`)
            );
            return;
          }

          if (res.statusCode >= 400) {
            const msg =
              parsed?.error?.message ||
              `Gemini request failed with status ${res.statusCode}`;
            reject(new Error(msg));
            return;
          }

          resolve(parsed);
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function toText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

class ChatCompletions {
  constructor(client) {
    this.client = client;
  }

  async create(payload = {}) {
    const model = this.client.resolveModel(payload.model);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const prompt = messages
      .map((m) => `${m?.role || "user"}: ${toText(m?.content)}`)
      .join("\n\n")
      .trim();

    const text = await this.client.generate(model, prompt);
    return {
      choices: [
        {
          message: {
            content: text,
          },
        },
      ],
    };
  }
}

class OpenAI {
  constructor(options = {}) {
    this.apiKey =
      options.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.OPENAI_API_KEY;

    if (!this.apiKey) {
      throw new Error(
        "Missing API key. Set GEMINI_API_KEY (or OPENAI_API_KEY for compatibility)."
      );
    }

    this.baseUrl =
      options.baseURL ||
      process.env.GEMINI_BASE_URL ||
      "https://generativelanguage.googleapis.com/v1beta";
    this.defaultModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    this.chat = { completions: new ChatCompletions(this) };
  }

  resolveModel(requested) {
    if (!requested) return this.defaultModel;
    if (/^gpt-/i.test(requested)) return this.defaultModel;
    return requested;
  }

  async generate(model, prompt) {
    const cleanBase = this.baseUrl.replace(/\/+$/, "");
    const url = new URL(
      `${cleanBase}/models/${encodeURIComponent(model)}:generateContent`
    );
    url.searchParams.set("key", this.apiKey);

    const response = await requestJson(url, {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
      },
    });

    const text = extractGeminiText(response);
    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }
    return text;
  }
}

module.exports = OpenAI;
module.exports.OpenAI = OpenAI;
