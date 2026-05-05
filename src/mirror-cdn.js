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
  'upos-sz-mirror08c.bilivideo.com',
  'upos-sz-mirror08h.bilivideo.com',
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

let indexChina = 0

function pickMirrorChina() {
  const host = MIRROR_CDN_CHINA[indexChina]
  indexChina = (indexChina + 1) % MIRROR_CDN_CHINA.length
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
