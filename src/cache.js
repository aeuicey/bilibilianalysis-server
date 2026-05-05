const CACHE_TTL = 10 * 60 * 1000

class Cache {
  constructor(ttl = CACHE_TTL) {
    this.ttl = ttl
    this.store = new Map()
    this.timers = new Map()
  }

  get(key) {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      this.timers.delete(key)
      return null
    }
    return entry.value
  }

  set(key, value, ttl = this.ttl) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl
    })
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
    }
    this.timers.set(key, setTimeout(() => {
      this.store.delete(key)
      this.timers.delete(key)
    }, ttl))
  }

  has(key) {
    return this.get(key) !== null
  }

  delete(key) {
    this.store.delete(key)
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
      this.timers.delete(key)
    }
  }

  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.store.clear()
    this.timers.clear()
  }
}

module.exports = new Cache()
