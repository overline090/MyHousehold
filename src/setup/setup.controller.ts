import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import {
  ClaimDto,
  CreatePairingDto,
  ImportDto,
  SetupHouseholdDto,
} from './dto/setup.dto';
import { SetupGuard } from './setup.guard';
import { SetupService } from './setup.service';

/**
 * Hors de `/api/v1` : ces routes précèdent l'existence de tout compte,
 * et l'app doit pouvoir les atteindre avant de savoir quoi que ce soit
 * du serveur.
 *
 * Elles sont publiques au sens de la garde JWT, mais SetupGuard les
 * ferme au réseau extérieur, aux serveurs déjà installés, et aux
 * machines laissées sans compte pendant 24 heures.
 */
@ApiTags('setup')
@Controller('setup')
@Public()
@UseGuards(SetupGuard)
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get('state')
  @ApiOperation({ summary: 'Étapes, laquelle est courante, ce qui est applicable' })
  state() {
    return this.setup.state();
  }

  @Post('network')
  @ApiOperation({ summary: 'Appliquer une configuration réseau (image Raspberry Pi)' })
  network() {
    this.setup.assertNetworkSetupAvailable();
    return { applied: false };
  }

  @Get('network/scan')
  @ApiOperation({ summary: 'Réseaux Wi-Fi détectés (image Raspberry Pi)' })
  scan() {
    this.setup.assertNetworkSetupAvailable();
    return { networks: [] };
  }

  @Post('pairing')
  @ApiOperation({ summary: 'Créer un code d’appariement pour le téléphone' })
  createPairing(@Body() dto: CreatePairingDto) {
    return this.setup.createPairing(dto.purpose);
  }

  @Get('pairing/:code')
  // Interrogé en boucle par la page pendant qu'elle attend le téléphone.
  @Throttle({ default: { limit: 600, ttl: 900_000 } })
  @ApiOperation({ summary: 'État d’un appariement : en attente, utilisé, expiré' })
  pairingStatus(@Param('code') code: string) {
    return this.setup.pairingStatus(code);
  }

  @Post('import')
  @ApiOperation({ summary: 'Appelé par l’app : pousse sa configuration locale' })
  import(@Body() dto: ImportDto) {
    return this.setup.import(dto);
  }

  @Post('household')
  @ApiOperation({ summary: 'Nom du foyer' })
  household(@Body() dto: SetupHouseholdDto) {
    return this.setup.createHousehold(dto);
  }

  @Post('claim')
  @ApiOperation({
    summary: 'Appelé par l’app : crée le compte administrateur et ouvre une session',
  })
  claim(@Body() dto: ClaimDto) {
    return this.setup.claim(dto);
  }

  @Post('complete')
  @ApiOperation({ summary: 'Verrouille l’assistant et ferme les inscriptions' })
  complete() {
    return this.setup.complete();
  }
}
