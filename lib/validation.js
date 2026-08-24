const { z } = require('zod');

const SOURCE_TYPES = ['PRIMARY','SECONDARY','OFFICIAL','PUBLIC_RECORD','NEWS','DOCUMENTATION','OTHER'];
const CATEGORIES = ['Technology','Companies','Products','Documentation','Research','Public Information','Other'];
const DIFFICULTIES = ['EASY','MEDIUM','HARD'];

const urlLike = z.string().trim().url().max(2000).refine(u => /^https?:\/\//i.test(u), 'must be http(s)');

const missionCreate = z.object({
  title: z.string().trim().min(10).max(200),
  description: z.string().trim().min(20).max(5000),
  claim: z.string().trim().min(15).max(1000),
  verification_rules: z.string().trim().min(20).max(3000),
  required_evidence: z.string().trim().min(20).max(2000),
  required_source_types: z.array(z.enum(SOURCE_TYPES)).min(1).default(['PRIMARY','OFFICIAL']),
  reward_amount: z.number().int().positive().max(1_000_000),
  currency: z.literal('GEN').default('GEN'),
  deadline: z.coerce.date().refine(d => d.getTime() > Date.now() + 3600_000, 'deadline must be >1h in future'),
  difficulty: z.enum(DIFFICULTIES).default('MEDIUM'),
  category: z.enum(CATEGORIES).default('Other'),
});

const evidenceItem = z.object({
  url: urlLike,
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().min(20).max(4000),
  relevant_text: z.string().trim().min(10).max(6000),
  source_type: z.enum(SOURCE_TYPES),
  screenshot_url: urlLike.optional().nullable(),
});

const submissionCreate = z.object({
  evidence: z.array(evidenceItem).min(1).max(5),
  reasoning: z.string().trim().min(30).max(8000),
});

const challengeCreate = z.object({
  reason: z.string().trim().min(30).max(4000),
  submission: submissionCreate,
});

function badRequest(res, parsed) {
  const issues = parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`);
  return res.status(400).json({ error: 'validation failed', details: issues });
}

// ---- deterministic claim-quality heuristics (server-enforced) ----
const VAGUE_TERMS = ['good','bad','best','worst','great','terrible','better than','worth it','should you','do you like','opinion','feel about','nice','awesome','overrated','underrated'];
const QUESTION_STARTERS = /^(is|are|was|were|does|do|did|has|have|had|can|could|will|would|should)\b/i;

function assessClaimQuality(claim) {
  const c = claim.trim();
  const warnings = [];
  if (c.length < 25) warnings.push('Claim is very short; specific claims are usually at least a full sentence.');
  if (!QUESTION_STARTERS.test(c)) warnings.push('Claim should be phrased as a verifiable yes/no question (e.g., "Does X currently ...").');
  const lower = c.toLowerCase();
  for (const t of VAGUE_TERMS) {
    if (lower.includes(t)) { warnings.push(`Claim contains subjective term "${t}" — claims must be objectively testable.`); break; }
  }
  const timeBounded = /\b(current|currently|as of|today|now|since|in \d{4}|by \d{4}|latest)\b/i.test(c);
  if (!timeBounded) warnings.push('Claim has no time boundary — add "currently", "as of <date>", or similar.');
  if (!/(list|state|publish|operate|offer|support|report|page|website|document|official|registry|filing|announce)/i.test(c))
    warnings.push('Claim does not reference a checkable artifact (official page, registry, documentation...).');
  return { ok: warnings.length === 0, warnings };
}

module.exports = { missionCreate, submissionCreate, challengeCreate, evidenceItem, badRequest, assessClaimQuality, SOURCE_TYPES, CATEGORIES };
