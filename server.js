const express = require('express')
const { resolveRawUrl } = require('./src/bilibili')
const cache = require('./src/cache')

const app = express()
const PORT = process.env.PORT || 3000
const CACHE_TTL = 10 * 60 * 1000

app.set('trust proxy', true)

app.get('/', async (req, res) => {
  const targetUrl = req.query.url

  if (!targetUrl) {
    return res.status(400).json({
      error: 'Missing "url" parameter',
      usage: 'GET /?url=<bilibili video or live URL>'
    })
  }

  const cacheKey = `raw:${targetUrl}`
  const cached = cache.get(cacheKey)
  if (cached) {
    return res.redirect(302, cached)
  }

  try {
    const cdnUrl = await resolveRawUrl(targetUrl)
    cache.set(cacheKey, cdnUrl, CACHE_TTL)
    return res.redirect(302, cdnUrl)
  } catch (err) {
    console.error(`[ERROR] Failed to resolve: ${targetUrl}`, err.message)
    return res.status(502).json({
      error: 'Failed to resolve video URL',
      detail: err.message
    })
  }
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.use((err, req, res, next) => {
  console.error('[UNHANDLED]', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`BiliAnalysis Server running on http://localhost:${PORT}`)
})
