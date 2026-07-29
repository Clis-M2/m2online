import fs from 'node:fs';
import path from 'node:path';

export function loadEnvFile(filePath = path.resolve(process.cwd(), '.env.local')) {
  if (!fs.existsSync(filePath)) return {};

  const loaded = {};
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\n/)) {
    if (!/^[A-Z0-9_]+=/.test(line)) continue;
    const [key, ...rest] = line.split('=');
    const value = rest.join('=');
    loaded[key] = value;
    if (!(key in process.env)) process.env[key] = value;
  }
  return loaded;
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value || /cole_|PROJECT_REF|exemplo|example|\*\*\*/i.test(value)) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
