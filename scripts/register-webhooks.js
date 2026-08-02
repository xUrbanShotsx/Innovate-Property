#!/usr/bin/env node
/**
 * register-webhooks.js
 * Run once from your local machine to register Agent Box webhook subscriptions.
 * Agent Box will then POST to your Vercel webhook endpoint whenever a listing changes.
 *
 * Usage:
 *   node scripts/register-webhooks.js
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
}

const AB_BASE = 'https://api.agentboxcrm.com.au';
const CLIENT_ID = process.env.AGENTBOX_CLIENT_ID;
const API_KEY = process.env.AGENTBOX_API_KEY;
const WEBHOOK_URL = 'https://innovate-property.vercel.app/api/webhook';

if (!CLIENT_ID || !API_KEY) {
  console.error('❌  Missing AGENTBOX_CLIENT_ID or AGENTBOX_API_KEY in .env.local');
  process.exit(1);
}

async function main() {
  // Check existing subscriptions
  console.log('🔍  Checking existing webhook subscriptions…');
  const existing = await fetch(
    `${AB_BASE}/webhook-subscriptions?version=2&client_id=${encodeURIComponent(CLIENT_ID)}`,
    { headers: { 'X-Api-Key': API_KEY, 'Accept': 'application/json' } }
  ).then(r => r.json());

  const subs = existing?.response?.subscriptions || [];
  const alreadyRegistered = subs.filter(s => s.webhookUrl === WEBHOOK_URL);
  if (alreadyRegistered.length > 0) {
    console.log(`✓  Already registered ${alreadyRegistered.length} subscription(s) for ${WEBHOOK_URL}`);
    alreadyRegistered.forEach(s => console.log(`   ${s.id}: ${s.eventType}`));
    return;
  }

  // Register listing.created and listing.updated
  console.log(`\n📡  Registering webhooks → ${WEBHOOK_URL}`);
  const res = await fetch(
    `${AB_BASE}/webhook-subscriptions?version=2&client_id=${encodeURIComponent(CLIENT_ID)}`,
    {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: [
          { webhookUrl: WEBHOOK_URL, eventType: 'listing.created' },
          { webhookUrl: WEBHOOK_URL, eventType: 'listing.updated' },
        ],
      }),
    }
  );

  const result = await res.json();
  if (!res.ok) {
    console.error('❌  Failed:', JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log('✅  Webhooks registered:');
  const created = result?.response?.subscriptions || [];
  created.forEach(s => console.log(`   ${s.id}: ${s.eventType}`));
  console.log('\n   Agent Box will now POST to your webhook when listings change.');
  console.log('   Run node scripts/sync-listings.js after each notification to update the site.');
}

main().catch(err => { console.error('❌ ', err.message); process.exit(1); });
