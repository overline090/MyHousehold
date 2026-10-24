import { Injectable } from '@nestjs/common';

/**
 * Horloge injectable. Tout le code qui manipule le temps passe par ici :
 * un test qui appelle `new Date()` en dur finit toujours par échouer un
 * dimanche de changement d'heure.
 */
@Injectable()
export class ClockService {
  now(): Date {
    return new Date();
  }

  /** Instant décalé de `seconds` par rapport à maintenant. */
  in(seconds: number): Date {
    return new Date(this.now().getTime() + seconds * 1000);
  }
}

/** Horloge figée, pour les tests. */
export class FixedClock extends ClockService {
  constructor(private current: Date) {
    super();
  }

  override now(): Date {
    return new Date(this.current);
  }

  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}
