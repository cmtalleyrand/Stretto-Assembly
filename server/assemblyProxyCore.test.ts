import assert from 'node:assert/strict';
import { generateAssemblyFromGemini, parseAssemblyProxyBody } from './assemblyProxyCore';

async function runTests(): Promise<void> {
  const parsed = parseAssemblyProxyBody({
    model: 'gemini-3-pro-preview',
    contents: 'Subject ABC: X:1...',
    systemInstruction: 'System prompt',
  });

  assert.equal(parsed.model, 'gemini-3-pro-preview');
  assert.equal(parsed.contents.startsWith('Subject ABC'), true);

  assert.throws(() => parseAssemblyProxyBody({ model: '', contents: 'x', systemInstruction: 'y' }), /Invalid request/);

  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  await assert.rejects(
    () => generateAssemblyFromGemini(parsed),
    /GEMINI_API_KEY is not set/
  );

  if (previousKey) {
    process.env.GEMINI_API_KEY = previousKey;
  }
}

await runTests();
