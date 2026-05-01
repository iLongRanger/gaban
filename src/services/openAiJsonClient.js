export default class OpenAiJsonClient {
  constructor({ apiKey, fetchImpl = fetch, usageRecorder } = {}) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.usageRecorder = usageRecorder;
  }

  async createJson({ model, maxTokens, prompt, operation = 'json_completion' }) {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    const response = await this.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
        max_completion_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `OpenAI request failed: ${response.status}`);
    }

    const data = await response.json();
    recordOpenAiUsage(this.usageRecorder, { data, model, operation });
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      const finishReason = data?.choices?.[0]?.finish_reason || 'unknown';
      throw new Error(`OpenAI response did not include message content (finish_reason: ${finishReason})`);
    }
    return content;
  }
}

export async function createJsonCompletion(client, { model, maxTokens, prompt, operation }) {
  if (client?.createJson) {
    return client.createJson({ model, maxTokens, prompt, operation });
  }

  if (client?.chat?.completions?.create) {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      reasoning_effort: 'low',
      max_completion_tokens: maxTokens
    });
    return response?.choices?.[0]?.message?.content;
  }

  if (client?.responses?.create) {
    const response = await client.responses.create({
      model,
      input: prompt,
      text: { format: { type: 'json_object' } },
      max_output_tokens: maxTokens
    });
    return response.output_text;
  }

  if (client?.messages?.create) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });
    return response?.content?.[0]?.text;
  }

  throw new Error('No supported AI client was provided');
}

function recordOpenAiUsage(usageRecorder, { data, model, operation }) {
  if (!usageRecorder?.safeRecord && !usageRecorder?.record) return;
  const usage = data?.usage || {};
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
  const record = usageRecorder.safeRecord?.bind(usageRecorder) || usageRecorder.record.bind(usageRecorder);
  record({
    provider: 'openai',
    service: 'chat_completions',
    operation,
    model,
    units: 1,
    unitName: 'request',
    inputTokens,
    outputTokens,
    metadata: {
      finish_reason: data?.choices?.[0]?.finish_reason || null
    }
  });
}
