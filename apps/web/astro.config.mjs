import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_ENV_KEYS_TO_LOAD = new Set(['SUPABASE_URL', 'SUPABASE_ANON_KEY']);

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
      const value = trimmed.slice(eqIndex + 1).trim();

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
  output: 'static',
  server: {
    port: 3500,
    host: true
  }
});