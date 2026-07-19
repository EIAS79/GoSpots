import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtAccessPayload } from '../auth.service';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtAccessPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
