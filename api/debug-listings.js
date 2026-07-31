export const config = { runtime: 'edge' };

export default async function handler(req) {
  const clientId = process.env.AGENTBOX_CLIENT_ID;
  const apiKey = process.env.AGENTBOX_API_KEY;

  const info = {
    hasClientId: !!clientId,
    hasApiKey: !!apiKey,
    clientIdPrefix: clientId ? clientId.slice(0, 8) : null,
  };

  if (!clientId || !apiKey) {
    return new Response(JSON.stringify({ info, error: 'missing env vars' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = `https://api.agentboxcrm.com.au/listings?version=2&client_id=${encodeURIComponent(clientId)}&limit=10`;
  const res = await fetch(url, {
    headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
  });

  const status = res.status;
  const body = await res.text();

  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = null; }

  if (status !== 200) {
    return new Response(JSON.stringify({ info, abStatus: status, errorBody: body, requestUrl: url }), {
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
