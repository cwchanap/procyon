import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_ENV_KEYS_TO_LOAD = new Set(['SUPABASE_URL', 'SUPABASE_ANON_KEY']);

function normalizeEnvValue(rawValue) {
  const trimmed = rawValue.trim();
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.length < 2) return trimmed;
  if (trimmed[trimmed.length - 1] !== quote) return trimmed;

  const inner = trimmed.slice(1, -1);

  let out = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && i + 1 < inner.length) {
      const next = inner[i + 1];
      if (next === '\\' || next === quote) {
        out += next;
        i++;
        continue;
      }
    }
    out += ch;
  }

  return out;
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  const apiEnvPath = path.resolve(__dirname, '../api/.env');
  if (fs.existsSync(apiEnvPath)) {
    const lines = fs.readFileSync(apiEnvPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = normalizeEnvValue(trimmed.slice(eqIndex + 1));

      if (!API_ENV_KEYS_TO_LOAD.has(key)) continue;
      if (key && value && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

if (process.env.SUPABASE_URL && !process.env.PUBLIC_SUPABASE_URL) {
  process.env.PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
}

if (process.env.SUPABASE_ANON_KEY && !process.env.PUBLIC_SUPABASE_ANON_KEY) {
  process.env.PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
}

export default defineConfig({
  integrations: [react(), tailwind()],
  devToolbar: {
    enabled: false,
  },
  output: 'static',
  server: {
    port: 3500,
    host: true
  }
});