import { Request, Response, NextFunction } from 'express';
import { hashIp } from '../services/hashService';

/**
 * HIPAA-aware request logger.
 *
 * Logs request metadata for audit purposes but strips/hashes all potentially
 * identifying information before writing. Complies with HIPAA's requirement
 * for audit controls (§164.312(b)) without creating a PHI audit trail.
 *
 * What IS logged:
 *   - Method, path (sanitized), status code, response time
 *   - Hashed IP (rotates daily — cannot be reverse-engineered)
 *   - Timestamp
 *
 * What is NEVER logged:
 *   - Raw IP addresses
 *   - User-Agent strings
 *   - Request bodies (may contain health data)
 *   - Query parameters with potential PHI
 */
export function hipaaLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const ipHash = hashIp(req.ip ?? req.socket.remoteAddress ?? 'unknown');

  // Sanitize path — remove any potential IDs that look like UUIDs from log
  const sanitizedPath = req.path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '[id]'
  );

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      ts: new Date().toISOString(),
      method: req.method,
      path: sanitizedPath,
      status: res.statusCode,
      ms: duration,
      ip_hash: ipHash.slice(0, 16), // partial hash in logs — sufficient for correlation, not for de-anonymization
    };
    // In production: send to structured audit log (CloudWatch, Splunk, etc.)
    // Never log to stdout in production without log aggregator stripping PII
    console.log(JSON.stringify(logEntry));
  });

  next();
}

/**
 * Consent gate middleware — rejects requests that arrive without a session_id.
 * Applied selectively to routes that require an established session.
 */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.body?.session_id ?? req.params?.session_id ?? req.query?.session_id;

  if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
    res.status(400).json({ error: 'Valid session_id is required' });
    return;
  }

  next();
}

/**
 * Strip any fields that should never reach the DB layer.
 * Defense-in-depth: even if a route forgets to sanitize, this strips known-bad keys.
 */
export function stripPotentialPhi(req: Request, _res: Response, next: NextFunction): void {
  const PHI_KEYS = ['name', 'email', 'phone', 'address', 'dob', 'ssn', 'mrn', 'npi'];

  if (req.body && typeof req.body === 'object') {
    for (const key of PHI_KEYS) {
      if (key in req.body) {
        delete req.body[key];
      }
    }
  }

  next();
}
