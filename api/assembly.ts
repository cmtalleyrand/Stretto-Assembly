import type { IncomingMessage, ServerResponse } from 'node:http';
import { generateAssemblyFromGemini, parseAssemblyProxyBody } from '../server/assemblyProxyCore';

async function readBody(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
  }
  return raw.length === 0 ? {} : JSON.parse(raw);
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    writeJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = parseAssemblyProxyBody(await readBody(req));
    const result = await generateAssemblyFromGemini(body);
    writeJson(res, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    const statusCode = message.startsWith('Invalid request:') ? 400 : 500;
    writeJson(res, statusCode, { error: message });
  }
}
