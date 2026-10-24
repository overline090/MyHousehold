import { Injectable } from '@nestjs/common';
import {
  ActivityVerb,
  AppointmentSource,
  AppointmentVisibility,
  Prisma,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { assertValidRrule, generateOccurrences, LocalDate } from '../tasks/recurrence';
import {
  CreateAppointmentDto,
  RespondDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

const appointmentSelect = {
  id: true,
  householdId: true,
  title: true,
  description: true,
  location: true,
  startAt: true,
  endAt: true,
  isAllDay: true,
  rrule: true,
  visibility: true,
  source: true,
  externalUid: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  attendees: {
    select: {
      response: true,
      user: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.AppointmentSelect;

type AppointmentRow = Prisma.AppointmentGetPayload<{ select: typeof appointmentSelect }>;

/** Une instance d'un rendez-vous récurrent, déroulée à la lecture. */
export interface AppointmentInstance {
  appointmentId: string;
  title: string;
  location: string | null;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  isRecurring: boolean;
  visibility: AppointmentVisibility;
  source: AppointmentSource;
  attendees: { id: string; displayName: string; response: string }[];
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async create(householdId: string, createdById: string, dto: CreateAppointmentDto) {
    if (dto.rrule) {
      assertValidRrule(dto.rrule);
    }
    this.assertChronological(dto.startAt, dto.endAt);
    await this.assertAttendeesAreMembers(householdId, dto.attendees ?? []);

    if (dto.id) {
      const existing = await this.prisma.appointment.findUnique({
        where: { id: dto.id },
        select: { id: true, householdId: true },
      });
      if (existing) {
        if (existing.householdId !== householdId) {
          throw AppException.notFound();
        }
        return this.findOne(householdId, existing.id, createdById);
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.create({
        data: {
          id: dto.id,
          householdId,
          createdById,
          title: dto.title.trim(),
          description: dto.description?.trim() ?? null,
          location: dto.location?.trim() ?? null,
          startAt: new Date(dto.startAt),
          endAt: new Date(dto.endAt),
          isAllDay: dto.isAllDay ?? false,
          rrule: dto.rrule ?? null,
          visibility: dto.visibility ?? AppointmentVisibility.HOUSEHOLD,
          attendees: {
            create: (dto.attendees ?? []).map((userId) => ({ userId })),
          },
        },
        select: { id: true, title: true },
      });

      await tx.activityLog.create({
        data: {
          householdId,
          actorId: createdById,
          verb: ActivityVerb.APPOINTMENT_CREATED,
          subjectType: 'APPOINTMENT',
          subjectId: row.id,
          summary: `a ajouté « ${row.title} »`,
        },
      });

      return row;
    });

    return this.findOne(householdId, created.id, createdById);
  }

  async findOne(householdId: string, appointmentId: string, userId: string) {
    const appointment = await this.require(householdId, appointmentId);
    this.assertVisible(appointment, userId);
    return shape(appointment);
  }

  /**
   * Rendez-vous d'une fenêtre, récurrences déroulées.
   *
   * Les instances ne sont pas matérialisées en base, contrairement aux
   * occurrences de tâches : un rendez-vous ne s'assigne pas et ne se
   * complète pas, il n'y a donc rien à y accrocher.
   */
  async list(
    householdId: string,
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<AppointmentInstance[]> {
    if (from > to) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'La date de fin précède la date de début.',
      );
    }

    const household = await this.prisma.household.findFirstOrThrow({
      where: { id: householdId },
      select: { timezone: true },
    });

    const windowStart = DateTime.fromISO(from, { zone: household.timezone })
      .startOf('day')
      .toJSDate();
    const windowEnd = DateTime.fromISO(to, { zone: household.timezone })
      .endOf('day')
      .toJSDate();

    const rows = await this.prisma.appointment.findMany({
      where: {
        householdId,
        deletedAt: null,
        OR: [
          // Rendez-vous simple qui recoupe la fenêtre
          { rrule: null, startAt: { lte: windowEnd }, endAt: { gte: windowStart } },
          // Série commencée avant la fin de la fenêtre
          { rrule: { not: null }, startAt: { lte: windowEnd } },
        ],
      },
      select: appointmentSelect,
      orderBy: { startAt: 'asc' },
    });

    const visible = rows.filter((row) => this.isVisible(row, userId));

    const instances = visible.flatMap((row) =>
      row.rrule
        ? this.expand(row, household.timezone, from, to)
        : [toInstance(row, row.startAt, row.endAt, false)],
    );

    return instances.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  async update(
    householdId: string,
    appointmentId: string,
    userId: string,
    dto: UpdateAppointmentDto,
  ) {
    const appointment = await this.require(householdId, appointmentId);
    this.assertVisible(appointment, userId);

    // Un événement venu d'un agenda externe est le reflet de cet agenda :
    // le modifier ici serait écrasé à la prochaine synchronisation.
    if (appointment.source === AppointmentSource.IMPORTED) {
      throw AppException.conflict(
        ErrorCode.APPOINTMENT_READ_ONLY,
        "Ce rendez-vous vient d'un agenda externe : modifiez-le dans cet agenda.",
      );
    }

    if (dto.rrule) {
      assertValidRrule(dto.rrule);
    }

    const startAt = dto.startAt ?? appointment.startAt.toISOString();
    const endAt = dto.endAt ?? appointment.endAt.toISOString();
    this.assertChronological(startAt, endAt);

    if (dto.attendees) {
      await this.assertAttendeesAreMembers(householdId, dto.attendees);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          location: dto.location?.trim(),
          startAt: dto.startAt ? new Date(dto.startAt) : undefined,
          endAt: dto.endAt ? new Date(dto.endAt) : undefined,
          isAllDay: dto.isAllDay,
          rrule: dto.rrule,
          visibility: dto.visibility,
        },
      });

      if (dto.attendees) {
        await tx.appointmentAttendee.deleteMany({ where: { appointmentId } });
        if (dto.attendees.length > 0) {
          await tx.appointmentAttendee.createMany({
            data: dto.attendees.map((attendeeId) => ({
              appointmentId,
              userId: attendeeId,
            })),
          });
        }
      }
    });

    return this.findOne(householdId, appointmentId, userId);
  }

  async remove(
    householdId: string,
    appointmentId: string,
    userId: string,
  ): Promise<void> {
    const appointment = await this.require(householdId, appointmentId);
    this.assertVisible(appointment, userId);

    if (appointment.source === AppointmentSource.IMPORTED) {
      throw AppException.conflict(
        ErrorCode.APPOINTMENT_READ_ONLY,
        "Ce rendez-vous vient d'un agenda externe : retirez-le dans cet agenda.",
      );
    }

    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { deletedAt: this.clock.now() },
    });
  }

  /** Répondre à une invitation : on ne répond que pour soi. */
  async respond(
    householdId: string,
    appointmentId: string,
    userId: string,
    dto: RespondDto,
  ) {
    const appointment = await this.require(householdId, appointmentId);
    this.assertVisible(appointment, userId);

    const isAttendee = appointment.attendees.some((a) => a.user.id === userId);
    if (!isAttendee) {
      throw AppException.badRequest(
        ErrorCode.NOT_INVITED,
        "Vous n'êtes pas invité à ce rendez-vous.",
      );
    }

    await this.prisma.appointmentAttendee.update({
      where: { appointmentId_userId: { appointmentId, userId } },
      data: { response: dto.response, respondedAt: this.clock.now() },
    });

    return this.findOne(householdId, appointmentId, userId);
  }

  /**
   * Déroule une série dans la fenêtre, en heure locale du foyer : un
   * rendez-vous hebdomadaire à 15 h 30 reste à 15 h 30 après un
   * changement d'heure.
   */
  private expand(
    row: AppointmentRow,
    timezone: string,
    from: LocalDate,
    to: LocalDate,
  ): AppointmentInstance[] {
    const localStart = DateTime.fromJSDate(row.startAt).setZone(timezone);
    const durationMs = row.endAt.getTime() - row.startAt.getTime();

    const occurrences = generateOccurrences(
      {
        rrule: row.rrule as string,
        timezone,
        seriesStart: localStart.toISODate() as LocalDate,
        dueTime: row.isAllDay ? '00:00' : localStart.toFormat('HH:mm'),
      },
      from,
      to,
    );

    return occurrences.map((occurrence) =>
      toInstance(
        row,
        occurrence.dueAt,
        new Date(occurrence.dueAt.getTime() + durationMs),
        true,
      ),
    );
  }

  private async require(
    householdId: string,
    appointmentId: string,
  ): Promise<AppointmentRow> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, householdId, deletedAt: null },
      select: appointmentSelect,
    });

    if (!appointment) {
      throw AppException.notFound("Ce rendez-vous n'existe pas.");
    }
    return appointment;
  }

  /**
   * Un rendez-vous privé n'est visible que de son auteur et de ses
   * invités. Les autres ne doivent même pas savoir qu'il existe, d'où le
   * 404 plutôt qu'un 403.
   */
  private isVisible(appointment: AppointmentRow, userId: string): boolean {
    if (appointment.visibility === AppointmentVisibility.HOUSEHOLD) {
      return true;
    }
    return (
      appointment.createdById === userId ||
      appointment.attendees.some((a) => a.user.id === userId)
    );
  }

  private assertVisible(appointment: AppointmentRow, userId: string): void {
    if (!this.isVisible(appointment, userId)) {
      throw AppException.notFound("Ce rendez-vous n'existe pas.");
    }
  }

  private assertChronological(startAt: string, endAt: string): void {
    if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'Un rendez-vous ne peut pas se terminer avant de commencer.',
      );
    }
  }

  private async assertAttendeesAreMembers(
    householdId: string,
    attendees: string[],
  ): Promise<void> {
    if (attendees.length === 0) {
      return;
    }

    const members = await this.prisma.householdMember.findMany({
      where: { householdId, userId: { in: attendees }, deletedAt: null },
      select: { userId: true },
    });

    if (members.length !== new Set(attendees).size) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'Une personne invitée ne fait pas partie du foyer.',
      );
    }
  }
}

function shape(row: AppointmentRow) {
  return {
    ...row,
    attendees: row.attendees.map((a) => ({
      id: a.user.id,
      displayName: a.user.displayName,
      response: a.response,
    })),
  };
}

function toInstance(
  row: AppointmentRow,
  startAt: Date,
  endAt: Date,
  isRecurring: boolean,
): AppointmentInstance {
  return {
    appointmentId: row.id,
    title: row.title,
    location: row.location,
    startAt,
    endAt,
    isAllDay: row.isAllDay,
    isRecurring,
    visibility: row.visibility,
    source: row.source,
    attendees: row.attendees.map((a) => ({
      id: a.user.id,
      displayName: a.user.displayName,
      response: a.response,
    })),
  };
}
