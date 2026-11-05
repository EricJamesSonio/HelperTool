'use strict';

const PRIVATE_V4 = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^127\./,
];

function isLocalHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '[::1]') return true;
  return PRIVATE_V4.some((re) => re.test(h));
}

function check(urlString, confirmedHosts) {
  let url;
  try {
    url = new URL(urlString);
  } catch (e) {
    return { allowed: false, reason: 'That is not a valid URL.', hostname: null };
  }
  if (isLocalHost(url.hostname)) return { allowed: true, reason: null, hostname: url.hostname };
  if (Array.isArray(confirmedHosts) && confirmedHosts.includes(url.hostname)) {
    return { allowed: true, reason: null, hostname: url.hostname };
  }
  return {
    allowed: false,
    reason: 'This is not a local address. Confirm you own this target before using it.',
    hostname: url.hostname,
  };
}

module.exports = { check, isLocalHost };