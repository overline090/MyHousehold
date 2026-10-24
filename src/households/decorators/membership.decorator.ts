import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { HouseholdMembershipContext } from '../guards/household-member.guard';

/** Appartenance résolue par HouseholdMemberGuard. */
export const Membership = createParamDecorator(
  (_data: unknown, context: ExecutionContext): HouseholdMembershipContext => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { membership: HouseholdMembershipContext }>();
    return request.membership;
  },
);
