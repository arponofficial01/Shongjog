// Vercel Serverless Function to proxy SMS requests to TextBee
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const apiKey = process.env.VITE_TEXTBEE_API_KEY || body.apiKey;

    if (!apiKey || apiKey.includes('placeholder')) {
      res.status(400).json({
        error: 'TextBee API Key not configured',
      });
      return;
    }

    const deviceId = process.env.VITE_TEXTBEE_DEVICE_ID || body.deviceId;

    const textbeeResponse = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        recipients: body.recipients,
        message: body.message,
        ...(deviceId ? { deviceId } : {}),
      }),
    });

    const data = await textbeeResponse.json().catch(() => ({}));
    res.status(textbeeResponse.status).json(data);
  } catch (err: any) {
    console.error('[TextBee Proxy Serverless Error]:', err);
    res.status(500).json({ error: err.message || 'SMS dispatch failed' });
  }
}

