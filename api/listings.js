// Listing data is stored in /data/*.json and updated by running:
//   node scripts/sync-listings.js
// This avoids Agent Box's IP whitelist restriction on cloud-hosted calls.
// When Agent Box issues a production key without IP restriction, this file
// can be updated to call the API directly instead.

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section') || 'prestige';

  const fileMap = {
    prestige: '/data/prestige.json',
    development: '/data/development.json',
    sold: '/data/sold.json',
  };

  const path = fileMap[section] || fileMap.prestige;

  // Serve from the static data file
  const baseUrl = new URL(req.url);
  const dataUrl = `${baseUrl.protocol}//${baseUrl.host}${path}`;

  try {
    const res = await fetch(dataUrl);
    const listings = await res.json();

    return new Response(JSON.stringify({ listings }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    console.error('Listings read error:', err);
    return new Response(JSON.stringify({ listings: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
