const dns = require('dns').promises;
const net = require('net');

const BLOCKED_RANGES = [
  ['10.0.0.0','10.255.255.255'],
  ['172.16.0.0','172.31.255.255'],
  ['192.168.0.0','192.168.255.255'],
  ['127.0.0.0','127.255.255.255'],
  ['169.254.0.0','169.254.255.255'],
  ['0.0.0.0','0.255.255.255'],
];
const ipToInt = ip => ip.split('.').reduce((a,o)=>(a<<8)+ +o, 0) >>> 0;
function isPrivateV4(ip) {
  const n = ipToInt(ip);
  return BLOCKED_RANGES.some(([a,b]) => n >= ipToInt(a) && n <= ipToInt(b));
}
// Precise IPv6 special-purpose ranges — do NOT blanket-block all of IPv6
// (public sites resolve AAAA records from cloud/CDN environments).
function isPrivateV6(ip) {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;                 // unspecified / loopback
  if (v.startsWith('fe8') || v.startsWith('fe9') ||
      v.startsWith('fea') || v.startsWith('feb')) return true; // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(v)) return true;               // unique-local fc00::/7
  if (v.startsWith('::ffff:')) {                               // IPv4-mapped
    const tail = v.split(':').pop();
    return net.isIPv4(tail) ? isPrivateV4(tail) : true;
  }
  return false;
}
function isBlockedIp(ip) {
  return net.isIPv4(ip) ? isPrivateV4(ip) : isPrivateV6(ip);
}

async function fetchPageText(urlString, { maxBytes = 2_000_000, timeoutMs = 12_000 } = {}) {
  let u;
  try { u = new URL(urlString); } catch { throw new Error('invalid url'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('only http(s) allowed');
  const hostname = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  try { addrs = await dns.lookup(hostname, { all: true }); }
  catch { throw new Error('dns resolution failed'); }
  for (const a of addrs) if (isBlockedIp(a.address)) throw new Error(`blocked host (${a.address})`);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(u, {
      signal: ac.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ProofPatchEvidence/1.0; +https://proofpatch.app/bot) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.subarray(0, maxBytes).toString('utf8')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 20000);
  } finally {
    clearTimeout(t);
  }
}

module.exports = { fetchPageText };
