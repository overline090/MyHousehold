import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssignmentMode,
  TaskKind,
  Prisma,
  ServerSetup,
  SetupPairingPurpose,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { PasswordService } from '../auth/password.service';
import { TokensService } from '../auth/tokens.service';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { generateInviteCode } from '../households/invite-code';
import { NetworkService } from '../network/network.service';
import { buildServerLink } from '../network/server-link';
import { displayFingerprint } from '../network/tls';
import { HouseholdsService } from '../households/households.service';
import { StatusesService } from '../households/statuses.service';
import { TasksService } from '../tasks/tasks.service';
import { ClaimDto, ImportDto, SetupHouseholdDto } from './dto/setup.dto';

/** Au-delà, l'assistant se verrouille jusqu'au prochain démarrage. */
const SETUP_WINDOW_HOURS = 24;
const PAIRING_TTL_MINUTES = 15;

export type SetupStepId = 'network' | 'import' | 'household' | 'account' | 'done';

export interface SetupStep {
  id: SetupStepId;
  label: string;
  /** Une étape non applicable est sautée : le réseau sur une installation Docker. */
  applicable: boolean;
  required: boolean;
  done: boolean;
}

@Injectable()
export class SetupService implements OnModuleInit {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly clock: ClockService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly tasks: TasksService,
    private readonly households: HouseholdsService,
    private readonly statuses: StatusesService,
    private readonly network: NetworkService,
  ) {}

  /**
   * Au premier démarrage, le jeton d'installation est écrit dans les
   * journaux : c'est le seul endroit où quelqu'un ayant accès à la
   * machine peut le lire, et c'est voulu.
   */
  async onModuleInit(): Promise<void> {
    const state = await this.raw();
    if (state.completedAt !== null) {
      return;
    }

    this.logger.warn(
      `Installation non terminée. Jeton d'installation : ${state.setupToken}`,
    );
    this.logger.warn(
      `Ouvrez ${this.config.getOrThrow<string>('MH_PUBLIC_URL')}/setup pour la poursuivre.`,
    );
  }

  /** Ligne d'état, créée au premier appel. */
  async raw(): Promise<ServerSetup> {
    // En upsert et non en « lire puis créer » : deux requêtes arrivant
    // ensemble au premier démarrage se marcheraient dessus sur la clé
    // primaire, et l'une des deux échouerait en pleine installation.
    return this.prisma.serverSetup.upsert({
      where: { id: 1 },
      create: { id: 1, setupToken: randomBytes(24).toString('base64url') },
      update: {},
    });
  }

  windowClosed(state: ServerSetup): boolean {
    if (state.adminUserId !== null) {
      return false;
    }
    const elapsedHours =
      (this.clock.now().getTime() - state.firstBootAt.getTime()) / 3_600_000;
    return elapsedHours > SETUP_WINDOW_HOURS;
  }

  /**
   * Ce que l'assistant doit afficher : les étapes, leur état, et ce
   * qu'il a déjà appris du téléphone.
   */
  async state() {
    const setup = await this.raw();
    const pending = (setup.pendingImport as ImportSummary | null) ?? null;

    const steps: SetupStep[] = [
      {
        id: 'network',
        label: 'Réseau',
        // Configurer le Wi-Fi suppose de piloter les interfaces de la
        // machine, ce qu'un conteneur ne peut pas faire. L'étape
        // n'existe que sur l'image Raspberry Pi.
        applicable: this.networkSetupAvailable(),
        required: false,
        done: setup.networkDone,
      },
      {
        id: 'import',
        label: 'App',
        applicable: true,
        required: false,
        done: setup.importDone,
      },
      {
        id: 'household',
        label: 'Foyer',
        applicable: true,
        required: true,
        done: setup.householdId !== null,
      },
      {
        id: 'account',
        label: 'Compte',
        applicable: true,
        required: true,
        done: setup.adminUserId !== null,
      },
      {
        id: 'done',
        label: 'Terminé',
        applicable: true,
        required: true,
        done: setup.completedAt !== null,
      },
    ];

    const current = steps.find((step) => step.applicable && !step.done);

    return {
      completed: setup.completedAt !== null,
      currentStep: current?.id ?? 'done',
      steps,
      serverUrl: this.config.getOrThrow<string>('MH_PUBLIC_URL'),
      household: setup.householdId
        ? await this.prisma.household.findUnique({
            where: { id: setup.householdId },
            select: { id: true, name: true, timezone: true },
          })
        : null,
      // Détecté, pas demandé : une étape de plus pour confirmer ce que
      // la machine sait déjà n'en vaut pas le prix.
      detectedTimezone: this.config.getOrThrow<string>('MH_DEFAULT_TIMEZONE'),
      imported: pending,
    };
  }

  /** Étape 1, sur l'image Raspberry Pi seulement. */
  networkSetupAvailable(): boolean {
    return Boolean(this.config.get<string>('MH_NETWORK_SETUP_SOCKET'));
  }

  assertNetworkSetupAvailable(): void {
    if (!this.networkSetupAvailable()) {
      throw AppException.badRequest(
        ErrorCode.SETUP_NOT_APPLICABLE,
        "Ce serveur ne pilote pas le réseau de sa machine : configurez-le depuis le système. L'étape n'existe que sur l'image Raspberry Pi.",
      );
    }
  }

  async createPairing(purpose: SetupPairingPurpose) {
    const code = `${generateInviteCode().slice(0, 4)}-${generateInviteCode().slice(0, 4)}`;
    const pairing = await this.prisma.setupPairing.create({
      data: {
        code,
        purpose,
        expiresAt: this.clock.in(PAIRING_TTL_MINUTES * 60),
      },
      select: { code: true, purpose: true, expiresAt: true },
    });

    // Ce que le QR code encode : l'adresse du serveur sur le réseau de
    // la maison, l'empreinte de son certificat et le code. Avec lui,
    // l'app vérifie le serveur sans rien demander.
    const address = this.network.localAddress();
    const link = buildServerLink({
      address,
      fingerprint: this.network.fingerprint,
      code,
    });

    return {
      ...pairing,
      url: `${this.config.getOrThrow<string>('MH_PUBLIC_URL')}/setup/pair/${code}`,
      link,
      qrSvg: await QRCode.toString(link, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
      }),
      address,
      fingerprint: displayFingerprint(this.network.fingerprint),
    };
  }

  async pairingStatus(code: string) {
    const pairing = await this.prisma.setupPairing.findUnique({
      where: { code: normalizePairingCode(code) },
      select: { purpose: true, usedAt: true, expiresAt: true },
    });

    if (!pairing) {
      throw AppException.notFound("Ce code d'appariement n'existe pas.");
    }

    const status = pairing.usedAt
      ? 'USED'
      : pairing.expiresAt <= this.clock.now()
        ? 'EXPIRED'
        : 'PENDING';

    return { status, purpose: pairing.purpose, expiresAt: pairing.expiresAt };
  }

  /**
   * Étape 2, appelée par l'app. La configuration est **stockée, pas
   * appliquée** : tâches et compteurs ont besoin d'un auteur, et aucun
   * compte n'existe à cette étape. Tout est créé au moment où le compte
   * administrateur l'est.
   */
  async import(dto: ImportDto) {
    await this.consumePairing(dto.code, SetupPairingPurpose.IMPORT);

    const summary: ImportSummary = {
      householdName: dto.householdName.trim(),
      timezone: dto.timezone ?? null,
      tasks: dto.tasks ?? [],
      backgroundTasks: dto.backgroundTasks ?? [],
      appointments: dto.appointments ?? [],
    };

    await this.prisma.serverSetup.update({
      where: { id: 1 },
      data: { importDone: true, pendingImport: summary as unknown as Prisma.JsonObject },
    });

    return this.recap(summary);
  }

  /**
   * Passer une étape facultative.
   *
   * L'état de l'assistant vivant côté serveur, « je n'ai rien à
   * importer » doit y être enregistré : sans cela, l'étape resterait
   * courante et la page y reviendrait à chaque rechargement, ou sur
   * l'appareil suivant.
   */
  async skip(step: 'network' | 'import') {
    await this.prisma.serverSetup.update({
      where: { id: 1 },
      data: step === 'network' ? { networkDone: true } : { importDone: true },
    });
    return this.state();
  }

  /** Étape 3 : le nom du foyer, et rien d'autre. */
  async createHousehold(dto: SetupHouseholdDto) {
    const setup = await this.raw();

    if (setup.householdId) {
      await this.prisma.household.update({
        where: { id: setup.householdId },
        data: { name: dto.name.trim() },
      });
      return this.state();
    }

    // Le foyer naît sans membre : le compte administrateur arrive à
    // l'étape suivante. C'est le seul moment de la vie d'un foyer où
    // personne ne l'administre.
    const household = await this.prisma.household.create({
      data: {
        name: dto.name.trim(),
        timezone:
          (setup.pendingImport as ImportSummary | null)?.timezone ??
          this.config.getOrThrow<string>('MH_DEFAULT_TIMEZONE'),
      },
      select: { id: true },
    });

    await this.prisma.serverSetup.update({
      where: { id: 1 },
      data: { householdId: household.id },
    });

    return this.state();
  }

  /**
   * Étape 4, appelée par l'app : crée le premier compte, qui devient
   * administrateur de l'instance et propriétaire du foyer, puis applique
   * ce que l'étape 2 avait mis de côté.
   */
  async claim(dto: ClaimDto) {
    const setup = await this.raw();

    if (!setup.householdId) {
      throw AppException.badRequest(
        ErrorCode.SETUP_STEP_ORDER,
        "Le foyer n'est pas encore créé.",
      );
    }

    if (setup.adminUserId) {
      throw AppException.conflict(
        ErrorCode.SETUP_ALREADY_DONE,
        'Le compte administrateur existe déjà.',
      );
    }

    await this.consumePairing(dto.code, SetupPairingPurpose.CLAIM);

    const passwordHash = await this.passwords.hash(dto.password);
    const householdId = setup.householdId;
    const pending = (setup.pendingImport as ImportSummary | null) ?? null;
    const statutAdministrateur = await this.statuses.administratorStatusId();

    const importedTaskIds: string[] = [];

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: dto.username,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
          passwordHash,
          // Le premier compte administre le foyer : quelqu'un doit
          // pouvoir configurer les statuts et supprimer le compte d'un
          // titulaire devenu injoignable.
          statusId: statutAdministrateur,
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          status: { select: { id: true, name: true, rights: true } },
        },
      });

      await tx.activityLog.create({
        data: {
          householdId,
          actorId: created.id,
          verb: 'MEMBER_JOINED',
          summary: 'a créé le foyer',
        },
      });

      if (pending) {
        importedTaskIds.push(
          ...(await this.applyImport(tx, householdId, created.id, pending)),
        );
      }

      await tx.serverSetup.update({
        where: { id: 1 },
        data: { adminUserId: created.id },
      });

      return created;
    });

    // Hors transaction : les occurrences se matérialisent une fois les
    // tâches réellement en base. Sans cela, le foyer s'ouvre sur une
    // liste vide alors que ses tâches viennent d'être importées — et il
    // faudrait attendre le passage horaire du job pour les voir.
    for (const taskId of importedTaskIds) {
      await this.tasks.materializeDefinition(taskId);
    }

    this.logger.log(`Compte administrateur créé pendant l'installation : ${user.id}`);

    return {
      ...(await this.tokens.issue(user.id)),
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        status: { id: user.status.id, name: user.status.name },
        rights: user.status.rights,
      },
      household: await this.households.currentOrNull(),
    };
  }

  /**
   * Étape 5 : verrouille l'assistant et ferme les inscriptions libres.
   * Sans cela, un serveur exposé continue d'accepter les inscriptions de
   * n'importe qui parce que personne n'a édité un fichier.
   */
  async complete() {
    const setup = await this.raw();

    if (!setup.householdId || !setup.adminUserId) {
      throw AppException.badRequest(
        ErrorCode.SETUP_STEP_ORDER,
        "L'installation n'est pas terminée : il manque le foyer ou le compte administrateur.",
      );
    }

    await this.prisma.serverSetup.update({
      where: { id: 1 },
      data: { completedAt: this.clock.now() },
    });

    this.logger.log('Installation terminée, inscriptions libres fermées.');

    return {
      completed: true,
      serverUrl: this.config.getOrThrow<string>('MH_PUBLIC_URL'),
      householdId: setup.householdId,
    };
  }

  private recap(summary: ImportSummary) {
    return {
      imported: {
        householdName: summary.householdName,
        timezone: summary.timezone,
        tasks: summary.tasks.length,
        backgroundTasks: summary.backgroundTasks.length,
        appointments: summary.appointments.length,
      },
      // Ce qu'un foyer utilisé seul n'a pas, et que le serveur apporte.
      missing: [
        { id: 'account', label: 'Premier compte, administrateur', required: true },
        { id: 'members', label: 'Les autres membres du foyer', required: false },
        {
          id: 'statuses',
          label: 'Statuts, droits et tour de rôle des tâches',
          required: false,
        },
      ],
    };
  }

  /** Rend les identifiants des tâches créées, à matérialiser ensuite. */
  private async applyImport(
    tx: Prisma.TransactionClient,
    householdId: string,
    createdById: string,
    summary: ImportSummary,
  ): Promise<string[]> {
    const taskIds: string[] = [];

    for (const task of summary.tasks) {
      const created = await tx.task.create({
        data: {
          id: task.id,
          householdId,
          createdById,
          title: task.title,
          kind: TaskKind.SCHEDULED,
          rrule: task.rrule,
          dueTime: task.dueTime ?? null,
          priority: task.priority ?? 0,
          // Les tâches arrivent sans assignation : il n'y avait qu'une
          // personne dans le foyer local. Les statuts se règlent ensuite.
          assignmentMode: AssignmentMode.ANYONE,
        },
        select: { id: true },
      });
      taskIds.push(created.id);
    }

    // Les tâches de fond du téléphone — ce que l'app appelait des
    // compteurs — arrivent comme ce qu'elles sont.
    for (const deFond of summary.backgroundTasks) {
      await tx.task.create({
        data: {
          id: deFond.id,
          householdId,
          createdById,
          title: deFond.title,
          kind: TaskKind.BACKGROUND,
          maxIntervalSeconds: deFond.maxIntervalSeconds ?? null,
          assignmentMode: AssignmentMode.ANYONE,
        },
      });
    }

    for (const appointment of summary.appointments) {
      await tx.appointment.create({
        data: {
          id: appointment.id,
          householdId,
          createdById,
          title: appointment.title,
          startAt: new Date(appointment.startAt),
          endAt: new Date(appointment.endAt),
          isAllDay: appointment.isAllDay ?? false,
          rrule: appointment.rrule ?? null,
        },
      });
    }

    return taskIds;
  }

  private async consumePairing(
    code: string,
    purpose: SetupPairingPurpose,
  ): Promise<void> {
    const normalized = normalizePairingCode(code);
    const now = this.clock.now();

    const consumed = await this.prisma.setupPairing.updateMany({
      where: { code: normalized, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    if (consumed.count === 0) {
      throw AppException.badRequest(
        ErrorCode.PAIRING_INVALID,
        "Ce code d'appariement n'est pas valide, a expiré, ou a déjà servi.",
      );
    }
  }
}

interface ImportSummary {
  householdName: string;
  timezone: string | null;
  tasks: {
    id?: string;
    title: string;
    rrule: string;
    dueTime?: string;
    priority?: number;
  }[];
  backgroundTasks: { id?: string; title: string; maxIntervalSeconds?: number }[];
  appointments: {
    id?: string;
    title: string;
    startAt: string;
    endAt: string;
    isAllDay?: boolean;
    rrule?: string;
  }[];
}

function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/\s/g, '');
}
