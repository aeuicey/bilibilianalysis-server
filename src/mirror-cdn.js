const dns = require('dns/promises')

// 注意：upos-sz-mirror08c / upos-sz-mirror08h 已于 2026-11 前后整体下线
// （CNAME 到华为云 CDN 后全局 NXDOMAIN），不得再放回列表，
// 运行期健康检查也会自动剔除解析失败的节点。
const MIRROR_CDN_CHINA = [
  'upos-sz-mirrorali.bilivideo.com',
  'upos-sz-mirroralib.bilivideo.com',
  'upos-sz-mirroralio1.bilivideo.com',
  'upos-sz-mirrorbd.bilivideo.com',
  'upos-sz-mirrorcos.bilivideo.com',
  'upos-sz-mirrorcosb.bilivideo.com',
  'upos-sz-mirrorcoso1.bilivideo.com',
  'upos-sz-mirrorhw.bilivideo.com',
  'upos-sz-mirrorhwb.bilivideo.com',
  'upos-sz-mirrorhwo1.bilivideo.com',
  'upos-sz-mirror08ct.bilivideo.com',
]

const PROXY_TF = 'proxy-tf-all-ws.bilivideo.com'

const MIRROR_HOST_RE = /^upos-(sz|hz|bstar)-mirror([0-9a-z]+)\.(bilivideo\.com|akamaized\.net)$/
const MCDN_PATH_RE = /^\/v1\/resource/
const PROXY_TF_RE = /^(upos|proxy).*-tf-.*\.bilivideo\.com$/

function isMirrorCdn(hostname) {
  return MIRROR_HOST_RE.test(hostname)
}

function isOverseasCdn(hostname) {
  return /mirror[a-z0-9]*ov\./.test(hostname)
    || /mirrorcf/.test(hostname)
    || hostname.includes('bstar')
    || hostname.endsWith('akamaized.net')
}

function isProxyTf(hostname) {
  return PROXY_TF_RE.test(hostname)
}

function isMcdnIpPort(hostname) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)
}

function isMcdnDomain(hostname) {
  return hostname.includes('mcdn.bilivideo')
}

// 运行期 DNS 健康检查：节点下线（NXDOMAIN/无 A 记录）时自动摘除，
// 检查结果在内存中缓存 HEALTH_TTL，DNS 瞬时故障保留上次结论不抖动。
const HEALTH_TTL = 5 * 60 * 1000
let healthyHosts = null
let healthAt = 0
let checking = null

async function refreshHealth() {
  const results = await Promise.all(MIRROR_CDN_CHINA.map(async (host) => {
    try {
      const addrs = await dns.resolve4(host)
      return [host, addrs.length > 0]
    } catch (err) {
      const dead = err.code === 'ENOTFOUND' || err.code === 'ENODATA'
      const wasHealthy = healthyHosts && healthyHosts.includes(host)
      // 仅权威应答“不存在”才判死；超时/SERVFAIL 等瞬时故障沿用上次状态
      return [host, dead ? false : Boolean(wasHealthy)]
    }
  }))
  const next = results.filter(([, ok]) => ok).map(([host]) => host)
  if (next.length > 0) {
    healthyHosts = next
    healthAt = Date.now()
  }
  return healthyHosts
}

function startHealthWatcher() {
  const run = () => {
    if (checking) return
    checking = refreshHealth()
      .catch((err) => console.error('[mirror-cdn] health check failed:', err.message))
      .finally(() => { checking = null })
  }
  run()
  setInterval(run, HEALTH_TTL).unref()
}

startHealthWatcher()

let indexChina = 0

function pickMirrorChina() {
  const pool = healthyHosts && healthyHosts.length > 0 ? healthyHosts : MIRROR_CDN_CHINA
  const host = pool[indexChina % pool.length]
  indexChina = (indexChina + 1) % pool.length
  return host
}

function upgradeCdnHostname(url) {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname
    const pathname = urlObj.pathname

    if (isProxyTf(hostname)) {
      return url
    }

    if (isOverseasCdn(hostname)) {
      urlObj.hostname = pickMirrorChina()
      return urlObj.toString()
    }

    if (isMirrorCdn(hostname)) {
      return url
    }

    if (isMcdnIpPort(hostname) || (isMcdnDomain(hostname) && MCDN_PATH_RE.test(pathname))) {
      urlObj.hostname = PROXY_TF
      return urlObj.toString()
    }

    urlObj.hostname = pickMirrorChina()
    return urlObj.toString()
  } catch (e) {
    console.error('[mirror-cdn] Failed to upgrade:', e.message)
    return url
  }
}

module.exports = { upgradeCdnHostname, MIRROR_CDN_CHINA }
