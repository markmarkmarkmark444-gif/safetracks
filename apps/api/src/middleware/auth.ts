import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthToken, Permission, ROLE_PERMISSIONS } from '@safetracks/shared';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthToken;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return secret;
}

export function issueToken(payload: Omit<AuthToken, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthToken;
    req.auth = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const allowed = ROLE_PERMISSIONS[req.auth.role] ?? [];
    if (!allowed.includes(permission)) {
      res.status(403).json({
        error: `Role '${req.auth.role}' does not have permission '${permission}'`,
      });
      return;
    }

    next();
  };
}

export function requireJobAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const jobId = req.params['jobId'] ?? req.body?.jobId;
  if (jobId && req.auth.jobId !== jobId) {
    res.status(403).json({ error: 'Token not valid for this job' });
    return;
  }

  next();
}
