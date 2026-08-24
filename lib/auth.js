const jwt = require('jsonwebtoken');
const { createHash } = require('crypto');

const SECRET = () => process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';

function signSession(userId) {
  return jwt.sign({ sub: userId }, SECRET(), { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'authentication required' });
  try {
    const payload = jwt.verify(token, SECRET());
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

function optionalAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try { req.userId = jwt.verify(h.slice(7), SECRET()).sub; } catch {}
  }
  next();
}

// Verify EIP-191 personal_sign signature using viem (production-grade ECDSA recovery).
async function verifyWalletSignature(address, nonce, signatureHex) {
  try {
    const { verifyMessage } = require('viem');
    const msg = `ProofPatch login\nnonce:${nonce}`;
    return await verifyMessage({
      address: String(address),
      message: msg,
      signature: String(signatureHex),
    });
  } catch {
    return false;
  }
}

function sha256(s) { return createHash('sha256').update(s).digest('hex'); }

module.exports = { signSession, requireAuth, optionalAuth, verifyWalletSignature, sha256 };
