import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { generateAssemblyFromGemini, parseAssemblyProxyBody } from './server/assemblyProxyCore';

export default defineConfig(() => {
  const base = process.env.VITE_BASE_PATH || '/';
  return {
    base,
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      {
        name: 'assembly-proxy-endpoint',
        configureServer(server) {
          server.middlewares.use('/api/assembly', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Method Not Allowed' }));
              return;
            }

            try {
              let raw = '';
              for await (const chunk of req) {
                raw += chunk;
              }
              const parsedBody = raw.length === 0 ? {} : JSON.parse(raw);
              const body = parseAssemblyProxyBody(parsedBody);
              const result = await generateAssemblyFromGemini(body);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown server error.';
              const statusCode = message.startsWith('Invalid request:') ? 400 : 500;
              res.statusCode = statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: message }));
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@analysis/midi': path.resolve(__dirname, 'components/services/midiAnalysis.ts'),
        }
      }
    };
});
