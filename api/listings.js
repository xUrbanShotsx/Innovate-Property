export const config = { runtime: 'edge' };

const AB_BASE = 'https://api.agentboxcrm.com.au';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  // section: prestige | development | sold
  const section = searchParams.get('section') || 'prestige';

  const abParams = new URLSearchParams({
    version: '2',
    client_id: process.env.AGENTBOX_CLIENT_ID,
    type: 'Residential',
    limit: '100',
  });

  if (section === 'sold') {
    abParams.set('status', 'sold');
  } else {
    abParams.set('status', 'current');
  }

  try {
    const res = await fetch(`${AB_BASE}/listings?${abParams}`, {
      headers: {
        'X-Api-Key': process.env.AGENTBOX_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Agent Box listings error:', err);
      return new Response(JSON.stringify({ listings: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const all = data?.response?.listings || [];

    let listings;
    if (section === 'development') {
      // Residential + Land category only
      listings = all.filter(l =>
        (l.category || '').toLowerCase() === 'land'
      );
    } else if (section === 'prestige') {
      // Residential, exclude Land category
      listings = all.filter(l =>
        (l.category || '').toLowerCase() !== 'land'
      );
    } else {
      listings = all;
    }

    return new Response(JSON.stringify({ listings }), {
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
