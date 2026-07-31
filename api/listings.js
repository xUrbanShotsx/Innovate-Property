export const config = { runtime: 'edge' };

const AB_BASE = 'https://api.agentboxcrm.com.au';

// Statuses that mean a Sale listing is live/active
const ACTIVE_STATUSES = new Set(['available', 'conditional', 'unconditional', 'listing presentation', 'pending']);

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section') || 'prestige';

  const clientId = process.env.AGENTBOX_CLIENT_ID;
  const apiKey = process.env.AGENTBOX_API_KEY;

  if (!clientId || !apiKey) {
    console.error('Missing Agent Box env vars');
    return new Response(JSON.stringify({ listings: [], error: 'configuration' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const abHeaders = {
    'X-Api-Key': apiKey,
    'Accept': 'application/json',
  };

  // Fetch first 100 listings (Agent Box ignores type/status query params in sandbox,
  // so we filter server-side below)
  const listUrl = `${AB_BASE}/listings?version=2&client_id=${encodeURIComponent(clientId)}&limit=100`;

  try {
    const res = await fetch(listUrl, { headers: abHeaders });

    if (!res.ok) {
      const err = await res.text();
      console.error('Agent Box listings error:', res.status, err);
      return new Response(JSON.stringify({ listings: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const all = data?.response?.listings || [];

    // Filter completely server-side (API query params are ignored in sandbox)
    const residential = all.filter(l =>
      (l.property?.type || '').toLowerCase() === 'residential'
      && l.type === 'Sale'
    );

    let filtered;
    if (section === 'development') {
      filtered = residential.filter(l =>
        (l.property?.category || '').toLowerCase() === 'land'
      );
    } else if (section === 'sold') {
      filtered = all.filter(l =>
        l.type === 'Sale'
        && (l.property?.type || '').toLowerCase() === 'residential'
        && l.status === 'Settled'
      );
    } else {
      // prestige: active Residential Sale, non-Land
      filtered = residential.filter(l =>
        ACTIVE_STATUSES.has((l.status || '').toLowerCase())
        && (l.property?.category || '').toLowerCase() !== 'land'
      );
    }

    // Fetch images for each matched listing (individual endpoint supports include=images)
    const withImages = await Promise.all(
      filtered.slice(0, 24).map(async (l) => {
        try {
          const imgRes = await fetch(
            `${AB_BASE}/listings/${l.id}?version=2&client_id=${encodeURIComponent(clientId)}&include=images`,
            { headers: abHeaders }
          );
          if (imgRes.ok) {
            const imgData = await imgRes.json();
            const images = imgData?.response?.listing?.images || [];
            return { ...l, images };
          }
        } catch {
          // return listing without images on error
        }
        return l;
      })
    );

    return new Response(JSON.stringify({ listings: withImages }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    console.error('Listings handler error:', err);
    return new Response(JSON.stringify({ listings: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
