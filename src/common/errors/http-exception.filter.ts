import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode } from './error-codes';

interface ErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Enveloppe unique pour toutes les erreurs : { error: { code, message,
 * details } }. Une forme unique côté client vaut mieux que trois formes
 * selon l'origine de l'erreur.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const { status, body } = this.describe(exception);

    // Une 5xx est un bug de notre côté : on la trace entièrement côté
    // serveur, et on n'en renvoie rien au client (pas de détail
    // d'implémentation dans une réponse publique).
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json({ error: body });
  }

  private describe(exception: unknown): { status: HttpStatus; body: ErrorBody } {
    if (exception instanceof HttpException) {
      const status: HttpStatus = exception.getStatus();
      const payload = exception.getResponse();

      // AppException : { code, message, details }
      if (typeof payload === 'object' && payload !== null && 'code' in payload) {
        const p = payload as ErrorBody;
        return {
          status,
          body: { code: p.code, message: p.message, details: p.details },
        };
      }

      // Erreurs de validation du ValidationPipe : { message: string[] }
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'message' in payload &&
        Array.isArray(payload.message)
      ) {
        const issues = payload.message;
        return {
          status,
          body: {
            code: ErrorCode.VALIDATION_FAILED,
            message: 'Les données envoyées sont invalides.',
            details: { issues },
          },
        };
      }

      // Exception HTTP standard de Nest (garde JWT, throttler, pipes) :
      // son message est en anglais et destiné au développeur. On le
      // remplace par un message affichable par l'app.
      return {
        status,
        body: {
          code: this.codeForStatus(status),
          message: this.messageForStatus(status, exception.message),
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ErrorCode.INTERNAL,
        message: 'Erreur interne du serveur.',
      },
    };
  }

  private messageForStatus(status: HttpStatus, fallback: string): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'Authentification requise.';
      case HttpStatus.FORBIDDEN:
        return "Vous n'avez pas le droit d'effectuer cette action.";
      case HttpStatus.NOT_FOUND:
        return "Cette ressource n'existe pas.";
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Trop de tentatives. Réessayez dans quelques minutes.';
      default:
        return fallback;
    }
  }

  private codeForStatus(status: HttpStatus): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN_RIGHT;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL;
    }
  }
}
