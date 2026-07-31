export const config = { runtime: 'edge' };

const AB_BASE = 'https://api.agentboxcrm.com.au';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'residential';   // residential | commercial | land
  const status = searchParams.get('status') || 'current';   // current | sold

  const params = new URLSearchParams({
    version: '2',
    client_id: process.env.AGENTBOX_CLIENT_ID,
    status,
    type,
    limit: '50',
  });

  try {
    const res = await fetch(`${AB_BASE}/listings?${params}`, {
      headers: {
        'X-Api-Key': process.env.AGENTBOX_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Agent Box listings error:', err);
      return new Response(JSON.stringify({ error: 'Failed to fetch listings' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    console.error('Listings handler error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
