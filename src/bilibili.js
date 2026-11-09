const XOR_CODE = 23442827791579n
const MAX_AID = 1n << 51n
const BASE = 58n
const BV_DATA = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf'

function av2bv(av) {
  const aid = av.startsWith('av') ? av.slice(2) : av
  const bytes = ['B', 'V', '1', '0', '0', '0', '0', '0', '0', '0', '0', '0']
  let bvIndex = bytes.length - 1
  let tmp = (MAX_AID | BigInt(aid)) ^ XOR_CODE
  while (tmp > 0) {
    bytes[bvIndex] = BV_DATA[Number(tmp % BigInt(BASE))]
    tmp = tmp / BASE
    bvIndex -= 1
  }
  ;[bytes[3], bytes[9]] = [bytes[9], bytes[3]]
  ;[bytes[4], bytes[7]] = [bytes[7], bytes[4]]
  return bytes.join('')
}

function extractVideoInfo(url) {
  const bvMatch = url.match(/BV[0-9a-zA-Z]+/)
  const avMatch = url.match(/av(\d+)/i)
  const pMatch = url.match(/[?&]p=(\d+)/)

  const bvid = bvMatch ? bvMatch[0] : (avMatch ? av2bv(avMatch[0]) : null)
  const page = pMatch ? Math.max(1, parseInt(pMatch[1], 10) || 1) : 1

  return { bvid, page }
}

function extractLiveRoomId(url) {
  const match = String(url).match(/live\.bilibili\.com\/(?:blanc\/)?(\d+)/i)
  return match ? match[1] : null
}

async function fetchVideoCid(bvid) {
  const res = await fetch(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`)
  if (!res.ok) {
    throw new Error(`CID request failed, status: ${res.status}`)
  }
  const json = await res.json()
  if (!json.data || !Array.isArray(json.data)) {
    throw new Error('Invalid pagelist response')
  }
  return json.data
}

async function fetchVideoUrl(bvid, cid) {
  const params = new URLSearchParams({
    bvid,
    cid,
    qn: '116',
    type: '',
    otype: 'json',
    platform: 'html5',
    high_quality: '1'
  })
  const res = await fetch(`https://api.bilibili.com/x/player/playurl?${params}`, {
    headers: {
      'Referer': 'https://www.bilibili.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })
  if (!res.ok) {
    throw new Error(`Playurl request failed, status: ${res.status}`)
  }
  const json = await res.json()
  if (!json.data || !json.data.durl || !json.data.durl[0]) {
    throw new Error('Cannot get video URL from response')
  }
  return json.data.durl[0].url
}

async function fetchLiveUrl(roomId) {
  const params = new URLSearchParams({
    room_id: roomId,
    protocol: '0,1',
    format: '0,1,2',
    codec: '0,1',
    qn: '10000',
    platform: 'web',
    ptype: '8',
    dolby: '5',
    panorama: '1'
  })
  const res = await fetch(`https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?${params}`, {
    headers: {
      'Referer': 'https://live.bilibili.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })
  if (!res.ok) {
    throw new Error(`Live request failed, status: ${res.status}`)
  }
  const json = await res.json()
  const streams = json?.data?.playurl_info?.playurl?.stream || []
  for (const streamIndex of [1, 0]) {
    const stream = streams[streamIndex]
    if (!stream?.format) continue
    for (const formatIndex of [1, 0]) {
      const fmt = stream.format[formatIndex]
      const codec = fmt?.codec?.[0]
      const info = codec?.url_info?.[0]
      if (codec && info) {
        return info.host + codec.base_url + info.extra
      }
    }
  }
  throw new Error('Cannot get live stream URL from response')
}

// 返回 B 站下发的原始 CDN 地址及链接类型。
// 直播流签名与域名绑定，替换成 mirror 节点会被边缘以 959 拒绝，因此直播链接
// 必须原样返回；视频点播签名不绑定域名，由路由层每次请求现选 mirror 节点。
async function resolveRawUrl(targetUrl) {
  if (targetUrl.includes('live.bilibili.com')) {
    const roomId = extractLiveRoomId(targetUrl)
    if (!roomId) {
      throw new Error('Cannot find live room ID')
    }
    const url = await fetchLiveUrl(roomId)
    return { type: 'live', url }
  }

  if (targetUrl.includes('bilibili.com')) {
    const { bvid, page } = extractVideoInfo(targetUrl)
    if (!bvid) {
      throw new Error('Cannot find BV/AV ID in URL')
    }
    const pageList = await fetchVideoCid(bvid)
    if (!pageList[page - 1]) {
      throw new Error(`Page ${page} not found`)
    }
    const cid = pageList[page - 1].cid
    const url = await fetchVideoUrl(bvid, cid)
    return { type: 'video', url }
  }

  throw new Error('Unsupported URL format')
}

module.exports = { resolveRawUrl }
