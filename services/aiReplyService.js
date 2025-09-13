import fetch from "node-fetch";

// Helper to get AI-generated replies from OpenRouter (kept identical)
export async function getAIResponse(prompt, systemPrompt, aiModel) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in environment");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
}



