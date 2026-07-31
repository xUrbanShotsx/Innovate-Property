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
    type: 'Sale',      // listing type: Sale (not Lease)
    include: 'images', // include images array in response
    limit: '100',
  });

  if (section === 'sold') {
    abParams.set('status', 'Settled');
  } else {
    // Available = active for sale listings
    abParams.set('status', 'Available');
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

    // Filter to Residential properties only, then split by category
    const residential = all.filter(l =>
      (l.property?.type || '').toLowerCase() === 'residential'
    );

    let listings;
    if (section === 'development') {
      // Residential + Land category → Development Sites
      listings = residential.filter(l =>
        (l.property?.category || '').toLowerCase() === 'land'
      );
    } else if (section === 'prestige') {
      // Residential, anything except Land → Prestige Homes
      listings = residential.filter(l =>
        (l.property?.category || '').toLowerCase() !== 'land'
      );
    } else {
      // sold: return all residential (already filtered by Settled status)
      listings = residential;
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
