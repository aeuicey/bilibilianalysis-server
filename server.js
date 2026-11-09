const express = require('express')
const { resolveRawUrl } = require('./src/bilibili')
const { upgradeCdnHostname } = require('./src/mirror-cdn')
const cache = require('./src/cache')

const app = express()
const PORT = process.env.PORT || 3000
const CACHE_TTL = 10 * 60 * 1000

app.set('trust proxy', true)

// 直播链接原样返回（签名绑定域名）；点播链接每次请求现选 mirror 节点，
// 缓存只存 B 站原始地址，避免单个故障节点的链接被缓存后分发给所有用户。
function toRedirectUrl(resolved) {
  return resolved.type === 'video' ? upgradeCdnHostname(resolved.url) : resolved.url
}

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
    return res.redirect(302, toRedirectUrl(cached))
  }

  try {
    const resolved = await resolveRawUrl(targetUrl)
    cache.set(cacheKey, resolved, CACHE_TTL)
    return res.redirect(302, toRedirectUrl(resolved))
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
