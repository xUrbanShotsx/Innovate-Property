// Node.js runtime (no edge config — tests AWS Lambda IP pool)

export default async function handler(req, res) {
  const clientId = process.env.AGENTBOX_CLIENT_ID;
  const apiKey = process.env.AGENTBOX_API_KEY;

  const url = `https://api.agentboxcrm.com.au/listings?version=2&client_id=${encodeURIComponent(clientId)}&limit=5`;

  try {
    const abRes = await fetch(url, {
      headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
    });
    const status = abRes.status;
    const body = await abRes.text();
    let parsed = null;
    try { parsed = JSON.parse(body); } catch {}

    res.json({
      runtime: 'nodejs',
      abStatus: status,
      total: parsed?.response?.items,
      returned: parsed?.response?.listings?.length,
      errorSnippet: status !== 200 ? body.slice(0, 300) : null,
    });
  } catch (err) {
    res.json({ runtime: 'nodejs', fetchError: err.message });
  }
}
