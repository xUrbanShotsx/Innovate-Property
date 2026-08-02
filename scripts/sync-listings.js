#!/usr/bin/env node
/**
 * sync-listings.js
 * Run this script from your office/local machine whenever listings change in Agent Box.
 * It fetches all listings and writes them to /data/*.json, then commits and pushes.
 * Vercel auto-deploys the updated data within ~30 seconds.
 *
 * Usage:
 *   node scripts/sync-listings.js
 *
 * Requires environment variables (copy .env.example to .env.local and fill in):
 *   AGENTBOX_API_KEY
 *   AGENTBOX_CLIENT_ID
 */

import { writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load env from .env.local if present
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

if (!CLIENT_ID || !API_KEY) {
  console.error('❌  Missing AGENTBOX_CLIENT_ID or AGENTBOX_API_KEY in .env.local');
  process.exit(1);
}

const ACTIVE_STATUSES = new Set(['available', 'conditional', 'unconditional', 'listing presentation', 'pending']);

async function abGet(path) {
  const url = `${AB_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'X-Api-Key': API_KEY, 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Agent Box ${path} → ${res.status}`);
  return res.json();
}

async function fetchListingWithImages(id) {
  const data = await abGet(`/listings/${id}?version=2&client_id=${encodeURIComponent(CLIENT_ID)}&include=images`);
  return data?.response?.listing || null;
}

function slim(l) {
  const imgs = l.images || [];
  return {
    id: l.id,
    type: l.type,
    status: l.status,
    displayPrice: l.displayPrice || '',
    soldPrice: l.soldPrice || '',
    soldPriceConfidential: l.soldPriceConfidential ?? true,
    mainHeadline: l.mainHeadline || '',
    inspectionType: l.inspectionType || '',
    property: {
      type: l.property?.type || '',
      category: l.property?.category || '',
      address: l.property?.address || {},
      bedrooms: l.property?.bedrooms || '',
      bathrooms: l.property?.bathrooms || '',
      totalParking: l.property?.totalParking || '',
      landArea: l.property?.landArea || {},
      landSizeText: l.property?.landSizeText || '',
      features: l.property?.features || [],
    },
    images: imgs.slice(0, 8).map(i => ({ url: i.url || '', thumbnails: i.thumbnails || [] })),
  };
}

async function main() {
  console.log('🔄  Fetching listings from Agent Box…');

  const data = await abGet(`/listings?version=2&client_id=${encodeURIComponent(CLIENT_ID)}&limit=100`);
  const all = data?.response?.listings || [];
  console.log(`   Found ${all.length} total listings in first page`);

  // Categorise
  const prestigeIds = all
    .filter(l => l.type === 'Sale' && ACTIVE_STATUSES.has((l.status || '').toLowerCase())
      && l.property?.type === 'Residential' && l.property?.category?.toLowerCase() !== 'land')
    .map(l => l.id);

  const developmentIds = all
    .filter(l => l.type === 'Sale' && ACTIVE_STATUSES.has((l.status || '').toLowerCase())
      && l.property?.type === 'Residential' && l.property?.category?.toLowerCase() === 'land')
    .map(l => l.id);

  const soldIds = all
    .filter(l => l.type === 'Sale' && l.status === 'Settled' && l.property?.type === 'Residential')
    .map(l => l.id).slice(0, 20);

  console.log(`   Prestige: ${prestigeIds.length}, Development: ${developmentIds.length}, Sold: ${soldIds.length}`);

  // Fetch full data with images
  async function fetchAll(ids, label) {
    const results = [];
    for (const id of ids) {
      process.stdout.write(`   Fetching ${label} ${id}…`);
      try {
        const listing = await fetchListingWithImages(id);
        if (listing) { results.push(slim(listing)); process.stdout.write(' ✓\n'); }
      } catch (e) { process.stdout.write(` ✗ ${e.message}\n`); }
    }
    return results;
  }

  const prestige = await fetchAll(prestigeIds, 'prestige');
  const development = await fetchAll(developmentIds, 'development');
  const sold = await fetchAll(soldIds, 'sold');

  // Write JSON files
  const dataDir = join(ROOT, 'data');
  writeFileSync(join(dataDir, 'prestige.json'), JSON.stringify(prestige, null, 2));
  writeFileSync(join(dataDir, 'development.json'), JSON.stringify(development, null, 2));
  writeFileSync(join(dataDir, 'sold.json'), JSON.stringify(sold, null, 2));

  console.log('\n✅  Data files written:');
  console.log(`   data/prestige.json    (${prestige.length} listings)`);
  console.log(`   data/development.json (${development.length} listings)`);
  console.log(`   data/sold.json        (${sold.length} listings)`);

  // Commit and push
  try {
    execSync('git add data/prestige.json data/development.json data/sold.json', { cwd: ROOT });
    execSync(`git commit -m "sync: update listing data from Agent Box"`, { cwd: ROOT });
    execSync('git push origin main', { cwd: ROOT });
    console.log('\n🚀  Pushed to GitHub — Vercel will deploy in ~30 seconds.');
  } catch (e) {
    if (e.message.includes('nothing to commit')) {
      console.log('\n✓  No changes — listing data is already up to date.');
    } else {
      console.error('\n⚠️  Git push failed:', e.message);
    }
  }
}

main().catch(err => { console.error('❌ ', err.message); process.exit(1); });
