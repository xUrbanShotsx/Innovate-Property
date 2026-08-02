// Receives Agent Box listing.created / listing.updated events.
// Verifies Ed25519 signature, then triggers a Vercel redeploy so the
// sync script output (committed to the repo) goes live automatically.
//
// To register this webhook with Agent Box, run:
//   node scripts/register-webhooks.js

export const config = { runtime: 'edge' };

const AB_BASE = 'https://api.agentboxcrm.com.au';

// Cache the public key for the session (edge function warm instance)
let cachedKey = null;

async function getPublicKey() {
  if (cachedKey) return cachedKey;

  const res = await fetch(
    `${AB_BASE}/signing?version=2&client_id=${encodeURIComponent(process.env.AGENTBOX_CLIENT_ID)}`,
    { headers: { 'X-Api-Key': process.env.AGENTBOX_API_KEY, 'Accept': 'application/json' } }
  );

  const data = await res.json();
  const key = data?.response?.keys?.[0];
  if (!key) throw new Error('No signing key returned');

  // Import as Web Crypto CryptoKey
  const rawKey = Uint8Array.from(atob(key.x.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  cachedKey = await crypto.subtle.importKey(
    'raw', rawKey, { name: 'Ed25519' }, false, ['verify']
  );
  return cachedKey;
}

async function verifySignature(signatureHeader, timestamp, body) {
  // Header format: s:keyId:timestamp:signature
  const parts = signatureHeader.split(':');
  if (parts.length < 4) return false;
  const signature = parts[3];

  const pubKey = await getPublicKey();

  const message = new TextEncoder().encode(timestamp + body);
  const sig = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

  return crypto.subtle.verify('Ed25519', pubKey, sig, message);
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signatureHeader = req.headers.get('x-signature') || '';
  const body = await req.text();

  // Extract timestamp from signature header (s:keyId:timestamp:signature)
  const parts = signatureHeader.split(':');
  const timestamp = parts[2] || '';

  // Verify signature (skip in dev if no key configured)
  if (process.env.AGENTBOX_API_KEY) {
    try {
      const valid = await verifySignature(signatureHeader, timestamp, body);
      if (!valid) {
        console.error('Agent Box webhook: invalid signature');
        return new Response('Forbidden', { status: 403 });
      }
    } catch (err) {
      console.error('Signature verification error:', err);
      // Still return 200 to avoid Agent Box retry storm; log for investigation
    }
  }

  let payload;
  try { payload = JSON.parse(body); } catch { payload = {}; }

  const events = payload.events || [];
  const listingEvents = events.filter(e => e.eventCategory === 'listing');

  console.log(`Agent Box webhook: ${listingEvents.length} listing event(s)`, listingEvents.map(e => `${e.eventType} ${e.resourceId}`));

  // Trigger Vercel redeploy so the latest synced data goes live.
  // Set VERCEL_DEPLOY_HOOK in Vercel env vars (Project Settings → Git → Deploy Hooks).
  if (listingEvents.length > 0 && process.env.VERCEL_DEPLOY_HOOK) {
    fetch(process.env.VERCEL_DEPLOY_HOOK, { method: 'POST' }).catch(() => {});
  }

  // Must return 200 or Agent Box will retry for 24 hours
  return new Response(JSON.stringify({ received: true, events: listingEvents.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
