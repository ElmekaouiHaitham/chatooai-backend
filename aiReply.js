// aiReply.js
// Helper to get AI-generated replies from OpenRouter (OpenAI GPT-OSS-20B)
// Usage: import { getAIResponse } from './aiReply.js';
// Requires: npm install node-fetch

import fetch from 'node-fetch';

export async function getAIResponse(prompt, systemPrompt, aiModel) {
  const apiKey = "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";
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set in environment');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b:free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    })
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
}
