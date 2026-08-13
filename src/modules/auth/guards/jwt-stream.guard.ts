import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtStreamGuard extends AuthGuard('jwt-stream') {}
