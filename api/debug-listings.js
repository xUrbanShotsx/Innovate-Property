export const config = { runtime: 'edge' };

export default async function handler(req) {
  const clientId = process.env.AGENTBOX_CLIENT_ID;
  const apiKey = process.env.AGENTBOX_API_KEY;

  const info = {
    hasClientId: !!clientId,
    hasApiKey: !!apiKey,
    clientIdPrefix: clientId ? clientId.slice(0, 8) : null,
  };

  // Show enough of each var to verify format (not the full value)
  info.apiKeyFormat = apiKey ? `${apiKey.slice(0,4)}...${apiKey.slice(-4)} (len=${apiKey.length})` : null;

  if (!clientId || !apiKey) {
    return new Response(JSON.stringify({ info, error: 'missing env vars' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test 1: plain GET with no auth (to check basic connectivity)
  const pingUrl = 'https://api.agentboxcrm.com.au/';
  const pingRes = await fetch(pingUrl);
  const pingStatus = pingRes.status;

  // Test 2a: with lowercase header
  const url = `https://api.agentboxcrm.com.au/listings?version=2&client_id=${encodeURIComponent(clientId)}&limit=10`;
  const resLower = await fetch(url, {
    headers: { 'x-api-key': apiKey, 'accept': 'application/json' },
  });
  const lowerStatus = resLower.status;

  // Test 2b: with original casing
  const res = await fetch(url, {
    headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
  });

  const status = res.status;
  const body = await res.text();

  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = null; }

  if (status !== 200) {
    return new Response(JSON.stringify({ info, pingStatus, lowerStatus, abStatus: status, errorBody: body.slice(0, 200), requestUrl: url }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const listings = parsed?.response?.listings || [];
  const sample = listings.slice(0, 3).map(l => ({
    id: l.id,
    type: l.type,
    status: l.status,
    propType: l.property?.type,
    propCat: l.property?.category,
  }));

  return new Response(JSON.stringify({ info, abStatus: status, total: parsed?.response?.items, returned: listings.length, sample }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
