const crypto = require('crypto');

class Deduplicator {
  constructor() {
    this._active = new Map();
  }

  _fingerprint(title, message) {
    const norm = (title + '::' + (message || '')).replace(/\s+/g, ' ').slice(0, 300);
    return crypto.createHash('md5').update(norm).digest('hex');
  }

  process(title, message) {
    const fp = this._fingerprint(title, message);
    const existing = this._active.get(fp);
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = new Date().toISOString();
      return { isNew: false, fingerprint: fp, occurrences: existing.occurrences };
    }
    const now = new Date().toISOString();
    this._active.set(fp, { occurrences: 1, firstSeen: now, lastSeen: now });
    return { isNew: true, fingerprint: fp, occurrences: 1, firstSeen: now, lastSeen: now };
  }

  seed(records) {
    if (!records || !records.length) return;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.fingerprint) {
        this._active.set(r.fingerprint, {
          occurrences: r.occurrences || 1,
          firstSeen: r.first_seen || r.firstSeen || new Date().toISOString(),
          lastSeen: r.last_seen || r.lastSeen || new Date().toISOString(),
        });
      }
    }
  }

  clear() {
    this._active.clear();
  }

  remove(fingerprint) {
    this._active.delete(fingerprint);
  }
}

module.exports = { Deduplicator };
