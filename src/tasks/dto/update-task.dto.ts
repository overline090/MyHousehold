import { PartialType } from '@nestjs/swagger';
import { OmitType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';

/**
 * Tous les champs sont optionnels, sauf `id` qui n'a pas de sens ici :
 * on ne change pas l'identifiant d'une tâche existante.
 */
export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['id'] as const),
) {}
