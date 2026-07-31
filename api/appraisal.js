export const config = { runtime: 'edge' };

const AB_BASE = 'https://api.agentboxcrm.com.au';
const AB_PARAMS = `version=2&client_id=${encodeURIComponent(process.env.AGENTBOX_CLIENT_ID)}`;

async function agentboxRequest(path, method, body) {
  return fetch(`${AB_BASE}${path}?${AB_PARAMS}`, {
    method,
    headers: {
      'X-Api-Key': process.env.AGENTBOX_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { firstName, lastName, phone, email, address } = body;

  if (!firstName || !email || !address) {
    return new Response('Missing required fields', { status: 400 });
  }

  // ── 1. Send email via Resend ──────────────────────────────────────────────
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9f9f9;">
      <div style="background:#000;padding:24px 32px;margin-bottom:24px;">
        <h1 style="color:#fff;font-size:20px;margin:0;letter-spacing:2px;text-transform:uppercase;">New Appraisal Request — Innovate Property Group</h1>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e5e5;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;width:140px;">Name</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px;">${firstName} ${lastName || ''}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Email</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px;"><a href="mailto:${email}" style="color:#000;">${email}</a></td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Phone</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px;">${phone || '—'}</td></tr>
          <tr><td style="padding:10px 0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Property Address</td><td style="padding:10px 0;font-size:15px;">${address}</td></tr>
        </table>
      </div>
    </div>
  `;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Innovate Property Group <enquiries@innovatepropertygroup.com.au>',
      to: ['mark@innovatepg.com.au'],
      reply_to: email,
      subject: `New Appraisal Request from ${firstName} ${lastName || ''} — ${address}`,
      html,
    }),
  });

  if (!emailRes.ok) {
    console.error('Resend error:', await emailRes.text());
  }

  // ── 2. Create contact in Agent Box ────────────────────────────────────────
  let contactId = null;
  try {
    const contactRes = await agentboxRequest('/contacts', 'POST', {
      contact: {
        firstName,
        lastName: lastName || '',
        email,
        mobile: phone || '',
        class: 'Seller',
        source: 'Website',
      },
    });

    if (contactRes.ok) {
      const contactData = await contactRes.json();
      contactId = contactData?.response?.contact?.id || null;
    } else {
      console.error('Agent Box contact error:', await contactRes.text());
    }
  } catch (err) {
    console.error('Agent Box contact exception:', err);
  }

  // ── 3. Create appraisal in Agent Box ─────────────────────────────────────
  if (contactId) {
    try {
      const appraisalRes = await agentboxRequest('/appraisals', 'POST', {
        appraisal: {
          contact: { id: contactId },
          property: { streetAddress: address },
          classification: 'Residential',
          source: 'Website',
        },
      });

      if (!appraisalRes.ok) {
        console.error('Agent Box appraisal error:', await appraisalRes.text());
      }
    } catch (err) {
      console.error('Agent Box appraisal exception:', err);
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
