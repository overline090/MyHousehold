-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'ADULT', 'CHILD', 'GUEST');

-- CreateEnum
CREATE TYPE "AssignmentMode" AS ENUM ('FIXED', 'ROTATION', 'ANYONE');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED', 'MISSED');

-- CreateEnum
CREATE TYPE "AppointmentVisibility" AS ENUM ('HOUSEHOLD', 'PRIVATE');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('LOCAL', 'IMPORTED');

-- CreateEnum
CREATE TYPE "AttendeeResponse" AS ENUM ('NEEDS_ACTION', 'ACCEPTED', 'DECLINED', 'TENTATIVE');

-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'CALDAV', 'ICS_URL');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('PULL', 'PUSH', 'BOTH');

-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('FCM', 'UNIFIEDPUSH', 'NONE');

-- CreateEnum
CREATE TYPE "ReminderTargetType" AS ENUM ('APPOINTMENT', 'TASK_OCCURRENCE', 'COUNTER');

-- CreateEnum
CREATE TYPE "ActivityVerb" AS ENUM ('TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_MISSED', 'COUNTER_RESET', 'APPOINTMENT_CREATED', 'MEMBER_JOINED', 'MEMBER_LEFT', 'MEMBER_ROLE_CHANGED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarColor" TEXT NOT NULL DEFAULT '#6750A4',
    "locale" TEXT NOT NULL DEFAULT 'fr-FR',
    "timezone" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "weekStartsOn" SMALLINT NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_member" (
    "householdId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'ADULT',
    "nickname" TEXT,
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "household_member_pkey" PRIMARY KEY ("householdId","userId")
);

-- CreateTable
CREATE TABLE "invite" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'ADULT',
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ,

    CONSTRAINT "invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_definition" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "rrule" TEXT NOT NULL,
    "dueTime" VARCHAR(5),
    "durationMinutes" INTEGER,
    "assignmentMode" "AssignmentMode" NOT NULL DEFAULT 'ANYONE',
    "graceHours" INTEGER NOT NULL DEFAULT 24,
    "points" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsOn" DATE,
    "endsOn" DATE,
    "rotationCursor" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "task_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignee" (
    "taskDefinitionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "task_assignee_pkey" PRIMARY KEY ("taskDefinitionId","userId")
);

-- CreateTable
CREATE TABLE "task_occurrence" (
    "id" UUID NOT NULL,
    "taskDefinitionId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "scheduledFor" DATE NOT NULL,
    "dueAt" TIMESTAMPTZ NOT NULL,
    "assigneeId" UUID,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMPTZ,
    "completedById" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "task_occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counter_definition" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "targetIntervalSeconds" INTEGER,
    "warnRatio" DECIMAL(3,2) NOT NULL DEFAULT 0.8,
    "assignmentMode" "AssignmentMode" NOT NULL DEFAULT 'ANYONE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "counter_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counter_event" (
    "id" UUID NOT NULL,
    "counterDefinitionId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "recordedById" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "counter_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "rrule" TEXT,
    "recurrenceId" TEXT,
    "visibility" "AppointmentVisibility" NOT NULL DEFAULT 'HOUSEHOLD',
    "source" "AppointmentSource" NOT NULL DEFAULT 'LOCAL',
    "calendarAccountId" UUID,
    "externalUid" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_attendee" (
    "appointmentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "response" "AttendeeResponse" NOT NULL DEFAULT 'NEEDS_ACTION',
    "respondedAt" TIMESTAMPTZ,

    CONSTRAINT "appointment_attendee_pkey" PRIMARY KEY ("appointmentId","userId")
);

-- CreateTable
CREATE TABLE "reminder" (
    "id" UUID NOT NULL,
    "targetType" "ReminderTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "userId" UUID,
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_account" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "displayName" TEXT NOT NULL,
    "credentials" BYTEA NOT NULL,
    "syncDirection" "SyncDirection" NOT NULL DEFAULT 'PULL',
    "defaultVisibility" "AppointmentVisibility" NOT NULL DEFAULT 'HOUSEHOLD',
    "busyOnly" BOOLEAN NOT NULL DEFAULT true,
    "syncCursor" TEXT,
    "lastSyncAt" TIMESTAMPTZ,
    "lastErrorAt" TIMESTAMPTZ,
    "lastError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "calendar_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_event" (
    "calendarAccountId" UUID NOT NULL,
    "externalUid" TEXT NOT NULL,
    "appointmentId" UUID NOT NULL,
    "etag" TEXT,
    "lastSeenAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "external_event_pkey" PRIMARY KEY ("calendarAccountId","externalUid")
);

-- CreateTable
CREATE TABLE "device" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "pushToken" TEXT,
    "pushProvider" "PushProvider" NOT NULL DEFAULT 'NONE',
    "platform" TEXT,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" UUID,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "revokedAt" TIMESTAMPTZ,
    "replacedById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "userId" UUID NOT NULL,
    "tasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "countersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "appointmentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "householdActivity" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" VARCHAR(5),
    "quietHoursEnd" VARCHAR(5),
    "defaultReminderMinutes" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "actorId" UUID,
    "verb" "ActivityVerb" NOT NULL,
    "subjectType" TEXT,
    "subjectId" UUID,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_mutation" (
    "clientMutationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_mutation_pkey" PRIMARY KEY ("clientMutationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_email_idx" ON "user"("email");

-- CreateIndex
CREATE INDEX "household_member_userId_idx" ON "household_member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "invite_code_key" ON "invite"("code");

-- CreateIndex
CREATE INDEX "invite_householdId_idx" ON "invite"("householdId");

-- CreateIndex
CREATE INDEX "task_definition_householdId_isActive_idx" ON "task_definition"("householdId", "isActive");

-- CreateIndex
CREATE INDEX "task_definition_householdId_updatedAt_idx" ON "task_definition"("householdId", "updatedAt");

-- CreateIndex
CREATE INDEX "task_occurrence_householdId_scheduledFor_status_idx" ON "task_occurrence"("householdId", "scheduledFor", "status");

-- CreateIndex
CREATE INDEX "task_occurrence_assigneeId_status_idx" ON "task_occurrence"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "task_occurrence_householdId_updatedAt_idx" ON "task_occurrence"("householdId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_occurrence_taskDefinitionId_scheduledFor_key" ON "task_occurrence"("taskDefinitionId", "scheduledFor");

-- CreateIndex
CREATE INDEX "counter_definition_householdId_isActive_idx" ON "counter_definition"("householdId", "isActive");

-- CreateIndex
CREATE INDEX "counter_definition_householdId_updatedAt_idx" ON "counter_definition"("householdId", "updatedAt");

-- CreateIndex
CREATE INDEX "counter_event_counterDefinitionId_occurredAt_idx" ON "counter_event"("counterDefinitionId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "counter_event_householdId_updatedAt_idx" ON "counter_event"("householdId", "updatedAt");

-- CreateIndex
CREATE INDEX "appointment_householdId_startAt_endAt_idx" ON "appointment"("householdId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "appointment_householdId_updatedAt_idx" ON "appointment"("householdId", "updatedAt");

-- CreateIndex
CREATE INDEX "appointment_attendee_userId_idx" ON "appointment_attendee"("userId");

-- CreateIndex
CREATE INDEX "reminder_targetType_targetId_idx" ON "reminder"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "reminder_sentAt_idx" ON "reminder"("sentAt");

-- CreateIndex
CREATE INDEX "calendar_account_userId_idx" ON "calendar_account"("userId");

-- CreateIndex
CREATE INDEX "calendar_account_isActive_lastSyncAt_idx" ON "calendar_account"("isActive", "lastSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "external_event_appointmentId_key" ON "external_event"("appointmentId");

-- CreateIndex
CREATE INDEX "device_userId_idx" ON "device"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_tokenHash_key" ON "refresh_token"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_replacedById_key" ON "refresh_token"("replacedById");

-- CreateIndex
CREATE INDEX "refresh_token_userId_idx" ON "refresh_token"("userId");

-- CreateIndex
CREATE INDEX "refresh_token_expiresAt_idx" ON "refresh_token"("expiresAt");

-- CreateIndex
CREATE INDEX "activity_log_householdId_createdAt_idx" ON "activity_log"("householdId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "processed_mutation_processedAt_idx" ON "processed_mutation"("processedAt");

-- AddForeignKey
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_definition" ADD CONSTRAINT "task_definition_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_taskDefinitionId_fkey" FOREIGN KEY ("taskDefinitionId") REFERENCES "task_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrence" ADD CONSTRAINT "task_occurrence_taskDefinitionId_fkey" FOREIGN KEY ("taskDefinitionId") REFERENCES "task_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrence" ADD CONSTRAINT "task_occurrence_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrence" ADD CONSTRAINT "task_occurrence_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrence" ADD CONSTRAINT "task_occurrence_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_definition" ADD CONSTRAINT "counter_definition_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_event" ADD CONSTRAINT "counter_event_counterDefinitionId_fkey" FOREIGN KEY ("counterDefinitionId") REFERENCES "counter_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_event" ADD CONSTRAINT "counter_event_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_event" ADD CONSTRAINT "counter_event_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_attendee" ADD CONSTRAINT "appointment_attendee_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_attendee" ADD CONSTRAINT "appointment_attendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_account" ADD CONSTRAINT "calendar_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_event" ADD CONSTRAINT "external_event_calendarAccountId_fkey" FOREIGN KEY ("calendarAccountId") REFERENCES "calendar_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_event" ADD CONSTRAINT "external_event_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "refresh_token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

