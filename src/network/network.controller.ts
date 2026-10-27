import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { isPrivateAddress } from '../setup/network-address';
import { NetworkService } from './network.service';
import { displayFingerprint } from './tls';

@ApiTags('network')
@Controller()
export class NetworkController {
  constructor(
    private readonly network: NetworkService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Ce que l'app lit avant toute connexion : de quoi vérifier qu'elle
   * parle au bon serveur. Le nom du foyer n'est donné qu'au réseau
   * local — il est déjà annoncé sur le Wi-Fi, pas à Internet.
   */
  @Public()
  @Get('identity')
  @ApiOperation({ summary: 'Identité du serveur : version, empreinte du certificat' })
  async identity(@Req() request: Request) {
    const local = isPrivateAddress(request.ip);
    const foyer = local
      ? await this.prisma.household.findFirst({
          where: { deletedAt: null },
          select: { name: true },
        })
      : null;

    return {
      name: 'myhousehold-server',
      version: process.env.npm_package_version ?? '0.1.0',
      fingerprint: this.network.fingerprint,
      fingerprintDisplay: displayFingerprint(this.network.fingerprint),
      householdName: foyer?.name ?? null,
    };
  }
}
