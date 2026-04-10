import { GoogleGenAI } from '@google/genai';

export interface AssemblyProxyRequestBody {
  model: string;
  contents: string;
  systemInstruction: string;
}

export interface AssemblyProxyResponseBody {
  text: string;
}

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid request: \`${fieldName}\` must be a non-empty string.`);
  }
}

export function parseAssemblyProxyBody(input: unknown): AssemblyProxyRequestBody {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid request: JSON object body required.');
  }

  const record = input as Record<string, unknown>;
  assertNonEmptyString(record.model, 'model');
  assertNonEmptyString(record.contents, 'contents');
  assertNonEmptyString(record.systemInstruction, 'systemInstruction');

  return {
    model: record.model,
    contents: record.contents,
    systemInstruction: record.systemInstruction,
  };
}

export async function generateAssemblyFromGemini(body: AssemblyProxyRequestBody): Promise<AssemblyProxyResponseBody> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Server misconfiguration: GEMINI_API_KEY is not set.');
  }

  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: body.model,
    contents: body.contents,
    config: {
      systemInstruction: body.systemInstruction,
    },
  });

  return {
    text: response.text ?? '',
  };
}
