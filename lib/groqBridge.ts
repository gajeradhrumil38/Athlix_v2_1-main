// Translate between the Gemini request/response shape the coach client speaks
// and Groq's OpenAI-compatible Chat Completions API, so the whole client
// (streaming, tool-calling, message history) stays unchanged while requests are
// served by Groq. Text-only: image requests (food scanner) must stay on Gemini.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export function containsImage(contents: any[]): boolean {
  return (contents || []).some((c) =>
    (c?.parts || []).some((p: any) => p?.inline_data || p?.inlineData || p?.fileData || p?.file_data),
  );
}

// Gemini generateContent body → Groq chat.completions body.
export function translateToGroq(body: any, model: string): any {
  const messages: any[] = [];

  const sys = (body.system_instruction?.parts || body.systemInstruction?.parts || [])
    .map((p: any) => p.text)
    .filter(Boolean)
    .join('\n');
  if (sys) messages.push({ role: 'system', content: sys });

  for (const c of body.contents || []) {
    const parts = c.parts || [];
    const toolCalls: any[] = [];
    const toolResponses: any[] = [];
    let text = '';
    for (const p of parts) {
      if (p.text) text += p.text;
      else if (p.functionCall) {
        toolCalls.push({
          id: `call_${p.functionCall.name}`,
          type: 'function',
          function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) },
        });
      } else if (p.functionResponse) {
        toolResponses.push({ name: p.functionResponse.name, response: p.functionResponse.response });
      }
    }

    if (toolResponses.length) {
      // Gemini carries a functionResponse inside a 'user' turn; OpenAI needs a
      // 'tool' message keyed to the matching tool_call id.
      for (const tr of toolResponses) {
        messages.push({ role: 'tool', tool_call_id: `call_${tr.name}`, content: JSON.stringify(tr.response ?? {}) });
      }
      if (text.trim()) messages.push({ role: 'user', content: text });
    } else if (toolCalls.length) {
      messages.push({ role: 'assistant', content: text || null, tool_calls: toolCalls });
    } else {
      messages.push({ role: c.role === 'model' ? 'assistant' : 'user', content: text });
    }
  }

  const tools = (body.tools?.[0]?.function_declarations || []).map((fd: any) => ({
    type: 'function',
    function: { name: fd.name, description: fd.description, parameters: fd.parameters || { type: 'object', properties: {} } },
  }));

  const out: any = {
    model,
    messages,
    temperature: body.generationConfig?.temperature ?? 1,
    max_completion_tokens: body.generationConfig?.maxOutputTokens ?? 1024,
  };
  if (tools.length) {
    out.tools = tools;
    out.tool_choice = 'auto';
  }
  return out;
}

// Groq non-streaming response → Gemini generateContent response.
export function groqToGeminiResponse(groq: any): any {
  const choice = groq?.choices?.[0];
  const msg = choice?.message || {};
  const parts: any[] = [];
  if (msg.content) parts.push({ text: msg.content });
  for (const tc of msg.tool_calls || []) {
    let args = {};
    try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* leave empty */ }
    parts.push({ functionCall: { name: tc.function?.name, args } });
  }
  return {
    candidates: [{ content: { parts, role: 'model' }, finishReason: choice?.finish_reason }],
    usageMetadata: { totalTokenCount: groq?.usage?.total_tokens ?? 0 },
  };
}

// Groq SSE stream → Gemini SSE stream. Text deltas pass straight through;
// tool-call fragments are accumulated and emitted as one functionCall part at
// the end (the client expects a complete functionCall object).
export function groqStreamToGemini(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  let buffer = '';
  const toolAcc: Record<number, { name?: string; args: string }> = {};
  let usageTokens = 0;

  const emit = (controller: ReadableStreamDefaultController, obj: any) =>
    controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let chunk: any;
            try { chunk = JSON.parse(payload); } catch { continue; }

            if (chunk.usage?.total_tokens) usageTokens = chunk.usage.total_tokens;
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
              emit(controller, { candidates: [{ content: { parts: [{ text: delta.content }], role: 'model' } }] });
            }
            for (const tc of delta?.tool_calls || []) {
              const idx = tc.index ?? 0;
              const acc = toolAcc[idx] || (toolAcc[idx] = { args: '' });
              if (tc.function?.name) acc.name = tc.function.name;
              if (tc.function?.arguments) acc.args += tc.function.arguments;
            }
          }
        }

        const parts: any[] = [];
        for (const key of Object.keys(toolAcc)) {
          const acc = toolAcc[Number(key)];
          if (!acc.name) continue;
          let args = {};
          try { args = JSON.parse(acc.args || '{}'); } catch { /* leave empty */ }
          parts.push({ functionCall: { name: acc.name, args } });
        }
        if (parts.length) emit(controller, { candidates: [{ content: { parts, role: 'model' } }] });
        if (usageTokens) emit(controller, { usageMetadata: { totalTokenCount: usageTokens } });
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
      } catch (e) {
        controller.error(e);
        return;
      } finally {
        reader.releaseLock();
      }
      controller.close();
    },
  });
}
