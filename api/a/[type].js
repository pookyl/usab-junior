export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405);
    return res.end();
  }

  const { type } = req.query;
  if (type !== 'view' && type !== 'event') {
    res.writeHead(404);
    return res.end();
  }

  const host = req.headers.host;
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';

  try {
    const upstream = await fetch(`https://${host}/_vercel/insights/${type}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
        'user-agent': ua,
      },
      body: JSON.stringify(req.body),
    });

    res.writeHead(upstream.status);
    res.end(await upstream.text());
  } catch {
    res.writeHead(502);
    res.end();
  }
}
