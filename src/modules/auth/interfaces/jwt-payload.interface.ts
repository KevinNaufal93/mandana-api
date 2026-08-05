import { UserRole } from '../../users/enums/user-role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number; // issued-at — auto-added by JWT library
  exp?: number;
}
