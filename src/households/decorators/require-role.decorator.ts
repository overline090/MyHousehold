import { SetMetadata } from '@nestjs/common';
import { HouseholdRole } from '@prisma/client';

export const REQUIRED_ROLE_KEY = 'requiredHouseholdRole';

/** Rôle minimal requis dans le foyer visé par la route. */
export const RequireRole = (role: HouseholdRole) => SetMetadata(REQUIRED_ROLE_KEY, role);
