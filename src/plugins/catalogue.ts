/**
 * Les plugins livrés avec MyHousehold. Un plugin est une fonctionnalité
 * qu'un foyer active ou non ; seuls ceux d'ici existent pour l'instant —
 * pas de plugin venu d'ailleurs. `disponible: false` : annoncé, pas
 * encore écrit, donc pas activable.
 */
export interface Plugin {
  id: string;
  nom: string;
  description: string;
  /** Ce qu'il ajoute : une page, une tuile d'accueil, un réglage du profil… */
  apporte: string[];
  disponible: boolean;
}

export const CATALOGUE: Plugin[] = [
  {
    id: 'stock',
    nom: 'Gestion de stock',
    description:
      'Des tableaux d’articles (garde-manger, salle de bain…) : quantité et minimum, péremption, lien pour racheter.',
    apporte: ['Page', 'Tuile'],
    disponible: true,
  },
  {
    id: 'agendas-externes',
    nom: 'Agendas externes',
    description:
      'Chacun relie son agenda Google, Outlook ou Nextcloud (CalDAV) : ses rendez-vous apparaissent dans celui du foyer.',
    apporte: ['Réglage du profil', 'Agenda'],
    disponible: false,
  },
  {
    id: 'notifications',
    nom: 'Notifications',
    description: 'Rappels des tâches et des rendez-vous sur les téléphones, par UnifiedPush.',
    apporte: ['Réglage du profil'],
    disponible: false,
  },
  {
    id: 'anniversaires',
    nom: 'Anniversaires',
    description: 'Les dates de naissance des membres deviennent des rendez-vous dans l’agenda.',
    apporte: ['Agenda', 'Tuile'],
    disponible: false,
  },
  {
    id: 'courses',
    nom: 'Liste de courses',
    description: 'Une liste partagée, cochée au magasin ; un article peut naître d’une tâche.',
    apporte: ['Page', 'Tuile'],
    disponible: false,
  },
  {
    id: 'menus',
    nom: 'Menus de la semaine',
    description: 'Qui cuisine quoi, chaque soir ; les ingrédients vont dans la liste de courses.',
    apporte: ['Page', 'Tuile'],
    disponible: false,
  },
  {
    id: 'sauvegarde',
    nom: 'Sauvegarde automatique',
    description: 'Une copie chaque nuit de la base et des photos, sur un disque ou un dossier réseau.',
    apporte: ['Serveur'],
    disponible: false,
  },
];
