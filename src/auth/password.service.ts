import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

/**
 * Argon2id, et non bcrypt : pour un projet neuf il n'y a aucune raison de
 * partir sur l'algorithme de l'époque précédente.
 *
 * Paramètres choisis pour un Raspberry Pi 4 : ~19 Mo de mémoire et 2
 * itérations tiennent en une centaine de millisecondes, ce qui reste
 * dissuasif pour une attaque hors ligne sans rendre la connexion pénible
 * sur un petit serveur.
 */
@Injectable()
export class PasswordService {
  private readonly options: argon2.HashOptions = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  };

  private decoy?: string;

  /**
   * Empreinte d'une valeur aléatoire, vérifiée lorsqu'un compte n'existe
   * pas : sans cela, le temps de réponse révèle quelles adresses sont
   * inscrites sur le serveur.
   */
  async decoyHash(): Promise<string> {
    this.decoy ??= await this.hash(randomBytes(16).toString('hex'));
    return this.decoy;
  }

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Empreinte illisible ou corrompue : c'est un échec
      // d'authentification, pas une erreur 500.
      return false;
    }
  }
}
