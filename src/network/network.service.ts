import { createServer, type Server } from 'node:https';
import { hostname } from 'node:os';
import type { RequestListener } from 'node:http';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bonjour, type Service } from 'bonjour-service';
import { PrismaService } from '../common/prisma/prisma.service';
import { privateIPv4Addresses } from './local-addresses';
import { ensureCertificate, type TlsMaterial } from './tls';

/** Le type de service annoncé sur le réseau local : `_myhousehold._tcp`. */
export const MDNS_TYPE = 'myhousehold';

/**
 * Ce qui permet au téléphone de trouver le serveur et de lui faire
 * confiance : l'écoute HTTPS sur le réseau local, le certificat et son
 * empreinte, et l'annonce sur le Wi-Fi.
 */
@Injectable()
export class NetworkService
  implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NetworkService.name);
  private tls!: TlsMaterial;
  private https?: Server;
  private bonjour?: Bonjour;
  private annonce?: Service;
  private nomAnnonce?: string;
  private minuterie?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const machine = hostname();
    this.tls = ensureCertificate(
      this.config.getOrThrow<string>('MH_DATA_DIR'),
      [machine, `${machine}.local`, 'localhost'],
      ['127.0.0.1', ...privateIPv4Addresses()],
    );
  }

  get fingerprint(): string {
    return this.tls.fingerprint;
  }

  get httpsPort(): number {
    return this.config.getOrThrow<number>('MH_HTTPS_PORT');
  }

  /**
   * L'adresse à donner au téléphone sur le réseau de la maison. Faute
   * d'adresse privée connue (un conteneur isolé du réseau), le nom
   * mDNS de la machine.
   */
  localAddress(): string {
    const ip = privateIPv4Addresses()[0] ?? `${hostname()}.local`;
    return `https://${ip}:${this.httpsPort}`;
  }

  /** Démarre l'écoute HTTPS, sur toutes les interfaces : c'est elle que le téléphone joint. */
  listenHttps(handler: RequestListener): void {
    this.https = createServer({ key: this.tls.key, cert: this.tls.cert }, handler);
    this.https.listen(this.httpsPort);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get<boolean>('MH_MDNS')) {
      return;
    }

    try {
      this.bonjour = new Bonjour();
      await this.annoncer();
      // Le nom du foyer peut changer, ou n'exister qu'après l'assistant.
      this.minuterie = setInterval(() => void this.annoncer(), 60_000);
      this.minuterie.unref();
    } catch (error) {
      // Sans multicast (réseau Docker isolé), le serveur reste joignable
      // par QR code ou par adresse : l'annonce est un confort.
      this.logger.warn(`Annonce sur le réseau local impossible : ${String(error)}`);
    }
  }

  private async annoncer(): Promise<void> {
    const foyer = await this.prisma.household.findFirst({
      where: { deletedAt: null },
      select: { name: true },
    });
    const nom = foyer?.name ?? 'MyHousehold';
    if (nom === this.nomAnnonce) {
      return;
    }

    // Le nom change : on retire l'ancienne annonce avant de publier la
    // nouvelle, sinon le téléphone verrait deux serveurs.
    const arreter = this.annonce?.stop as ((fin: () => void) => void) | undefined;
    if (arreter) {
      await new Promise<void>((fin) => arreter.call(this.annonce, fin));
    }
    this.annonce = this.bonjour!.publish({
      name: nom,
      type: MDNS_TYPE,
      port: this.httpsPort,
      txt: { v: '1' },
    });
    this.nomAnnonce = nom;
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.minuterie);
    await new Promise<void>((fin) =>
      this.bonjour ? this.bonjour.unpublishAll(() => fin()) : fin(),
    );
    this.bonjour?.destroy();
    await new Promise<void>((fin) =>
      this.https ? this.https.close(() => fin()) : fin(),
    );
  }
}
