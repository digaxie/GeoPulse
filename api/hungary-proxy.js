const HUNGARY_PROXY_ALLOWED_PATH =
  /^(config\.json|[0-9]{8}\/(?:ver|napkozi|szavossz)\/[A-Za-z0-9]+\.json)$/u

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
}

function normalizeProxyPath(rawValue) {
  if (typeof rawValue !== 'string') {
    return null
  }

  const trimmed = rawValue.trim()

  if (!trimmed) {
    return null
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/u, '')

  if (!HUNGARY_PROXY_ALLOWED_PATH.test(withoutLeadingSlash) || withoutLeadingSlash.includes('..')) {
    return null
  }

  return withoutLeadingSlash
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.status(200).send('ok')
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  const normalizedPath = normalizeProxyPath(req.query?.path)

  if (!normalizedPath) {
    res.status(400).json({ error: 'Invalid Hungary proxy path.' })
    return
  }

  try {
    const upstream = await fetch(`https://vtr.valasztas.hu/ogy2026/data/${normalizedPath}`, {
      headers: {
        Accept: 'application/json',
      },
    })

    const contentType = upstream.headers.get('content-type')
    const cacheControl = upstream.headers.get('cache-control')

    if (contentType) {
      res.setHeader('Content-Type', contentType)
    }

    if (cacheControl) {
      res.setHeader('Cache-Control', cacheControl)
    }

    const body = Buffer.from(await upstream.arrayBuffer())
    res.status(upstream.status).send(body)
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Hungary proxy request failed.',
    })
  }
}
