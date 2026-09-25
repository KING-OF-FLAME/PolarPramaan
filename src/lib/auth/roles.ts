export type Role = 'contributor' | 'reviewer' | 'admin';

export interface Actor {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

const rank: Record<Role, number> = { contributor: 1, reviewer: 2, admin: 3 };

export function hasRole(actor: Actor | null, min: Role): actor is Actor {
  return !!actor && rank[actor.role] >= rank[min];
}

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function assertRole(actor: Actor | null, min: Role): Actor {
  if (!actor) throw new AuthError(401, 'Sign in required.');
  if (!hasRole(actor, min)) throw new AuthError(403, `This action requires the ${min} role.`);
  return actor;
}
