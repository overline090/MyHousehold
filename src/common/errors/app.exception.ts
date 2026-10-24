import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodeValue } from './error-codes';

/**
 * Exception métier portant un code stable. Toutes les erreurs volontaires
 * du serveur passent par là, ce qui garantit une enveloppe de réponse
 * unique côté client.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCodeValue,
    message: string,
    status: HttpStatus,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(message = "Cette ressource n'existe pas."): AppException {
    return new AppException(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static badRequest(
    code: ErrorCodeValue,
    message: string,
    details?: Record<string, unknown>,
  ): AppException {
    return new AppException(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static conflict(
    code: ErrorCodeValue,
    message: string,
    details?: Record<string, unknown>,
  ): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT, details);
  }

  static forbidden(
    code: ErrorCodeValue,
    message: string,
    details?: Record<string, unknown>,
  ): AppException {
    return new AppException(code, message, HttpStatus.FORBIDDEN, details);
  }

  static unauthorized(code: ErrorCodeValue, message: string): AppException {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED);
  }
}
