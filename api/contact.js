export const config = { runtime: 'edge' };

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

  const { firstName, lastName, email, phone, interest, message } = body;

  if (!firstName || !email) {
    return new Response('Missing required fields', { status: 400 });
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9f9f9;">
      <div style="background:#000;padding:24px 32px;margin-bottom:24px;">
        <h1 style="color:#fff;font-size:20px;margin:0;letter-spacing:2px;text-transform:uppercase;">New Enquiry — Innovate Property Group</h1>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e5e5;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;width:140px;">Name</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px;">${firstName} ${lastName || ''}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Email</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px;"><a href="mailto:${email}" style="color:#000;">${email}</a></td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Phone</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px;">${phone || '—'}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Interested In</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px;">${interest || '—'}</td></tr>
          <tr><td style="padding:10px 0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:top;">Message</td><td style="padding:10px 0;font-size:15px;line-height:1.6;">${message ? message.replace(/\n/g, '<br>') : '—'}</td></tr>
        </table>
      </div>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Innovate Property Group <enquiries@innovatepropertygroup.com.au>',
        to: ['mark@innovatepg.com.au'],
        reply_to: email,
        subject: `New Enquiry from ${firstName} ${lastName || ''} — ${interest || 'General'}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return new Response('Email failed to send', { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Handler error:', err);
    return new Response('Server error', { status: 500 });
  }
}
