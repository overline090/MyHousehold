import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReleaseCheck } from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { isUpdateAvailable } from './version';

/** Forme d'une publication GitHub, réduite à ce qu'on lit. */
interface PublishedRelease {
  tag_name?: string;
  name?: string;
  html_url?: string;
  published_at?: string;
  prerelease?: boolean;
  assets?: { name?: string; browser_download_url?: string }[];
  body?: string;
}

const FETCH_TIMEOUT_MS = 10_000;

@Injectable()
export class ReleasesService {
  private readonly logger = new Logger(ReleasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly clock: ClockService,
  ) {}

  get currentVersion(): string {
    return process.env.npm_package_version ?? '0.1.0';
  }

  get enabled(): boolean {
    return this.config.get<boolean>('MH_UPDATE_CHECK') ?? true;
  }

  /**
   * Ligne d'état, créée au besoin. En upsert et non en « lire puis
   * créer » : deux appels simultanés au démarrage se marcheraient
   * dessus sur la clé primaire.
   */
  async raw(): Promise<ReleaseCheck> {
    return this.prisma.releaseCheck.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
  }

  /**
   * État des mises à jour, pour la zone d'administration.
   *
   * Volontairement hors de `/version`, qui est public : annoncer à tout
   * visiteur qu'un serveur est en retard d'une version, c'est lui
   * indiquer quelles failles essayer.
   */
  async status() {
    const state = await this.raw();
    const current = this.currentVersion;

    return {
      enabled: this.enabled,
      currentVersion: current,
      latestVersion: state.serverVersion,
      updateAvailable: state.serverVersion
        ? isUpdateAvailable(current, state.serverVersion)
        : false,
      publishedAt: state.serverPublishedAt,
      notesUrl: state.serverNotesUrl,
      checkedAt: state.checkedAt,
      lastError: state.lastError,
      app: {
        version: state.appVersion,
        publishedAt: state.appPublishedAt,
      },
    };
  }

  /**
   * Ce que l'app interroge sur son propre serveur. Le serveur sait
   * quelle version d'app il attend : ce n'est pas au téléphone d'aller
   * chercher la dernière existante, qui pourrait parler une API que ce
   * serveur ne connaît pas.
   */
  async appRelease() {
    const state = await this.raw();
    return {
      version: state.appVersion,
      publishedAt: state.appPublishedAt,
      downloadUrl: state.appDownloadUrl,
      sha256: state.appSha256,
      // La version du serveur sert à l'app pour détecter une
      // incompatibilité sans deuxième appel.
      serverVersion: this.currentVersion,
      checkedAt: state.checkedAt,
    };
  }

  /** Job quotidien, et déclenchement manuel depuis la zone d'admin. */
  async check(): Promise<{ checked: boolean; updateAvailable: boolean }> {
    if (!this.enabled) {
      this.logger.log('Vérification des mises à jour désactivée par configuration.');
      return { checked: false, updateAvailable: false };
    }

    // La ligne d'état doit exister avant qu'on écrive dedans, y compris
    // dans la branche d'erreur.
    await this.raw();

    const serverUrl = this.config.getOrThrow<string>('MH_RELEASES_URL');
    const appUrl = this.config.getOrThrow<string>('MH_APP_RELEASES_URL');

    try {
      const [server, app] = await Promise.all([
        this.fetchRelease(serverUrl),
        this.fetchRelease(appUrl).catch(() => null),
      ]);

      const apk = app?.assets?.find((asset) => asset.name?.endsWith('.apk'));

      await this.prisma.releaseCheck.update({
        where: { id: 1 },
        data: {
          serverVersion: versionOf(server),
          serverPublishedAt: server?.published_at ? new Date(server.published_at) : null,
          serverNotesUrl: server?.html_url ?? null,
          appVersion: versionOf(app),
          appPublishedAt: app?.published_at ? new Date(app.published_at) : null,
          appDownloadUrl: apk?.browser_download_url ?? null,
          // La somme est publiée dans le corps de la version, sous la
          // forme « sha256: <64 caractères> ». L'app la vérifie avant
          // d'installer quoi que ce soit.
          appSha256: extractSha256(app?.body),
          checkedAt: this.clock.now(),
          lastError: null,
        },
      });

      const status = await this.status();
      if (status.updateAvailable) {
        this.logger.warn(
          `Version ${status.latestVersion} disponible (vous êtes en ${status.currentVersion}).`,
        );
      }
      return { checked: true, updateAvailable: status.updateAvailable };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Pas d'accès sortant, GitHub injoignable, réponse illisible :
      // c'est une information, pas une panne. Le serveur fonctionne
      // très bien sans savoir qu'une version existe.
      this.logger.warn(`Vérification des mises à jour impossible : ${message}`);
      await this.prisma.releaseCheck.update({
        where: { id: 1 },
        data: { checkedAt: this.clock.now(), lastError: message.slice(0, 500) },
      });
      return { checked: false, updateAvailable: false };
    }
  }

  private async fetchRelease(url: string): Promise<PublishedRelease | null> {
    const response = await fetch(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'MyHousehold' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status === 404) {
      // Aucune version publiée pour l'instant : ce n'est pas une erreur.
      return null;
    }

    if (!response.ok) {
      throw new Error(`${url} a répondu ${response.status}`);
    }

    return (await response.json()) as PublishedRelease;
  }
}

function versionOf(release: PublishedRelease | null): string | null {
  if (!release || release.prerelease) {
    return null;
  }
  return release.tag_name ?? release.name ?? null;
}

function extractSha256(body: string | undefined): string | null {
  const match = /sha256[:\s]+([0-9a-f]{64})/i.exec(body ?? '');
  return match ? match[1].toLowerCase() : null;
}
