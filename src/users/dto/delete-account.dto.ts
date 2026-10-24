import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    description:
      "Mot de passe de l'appelant. Une suppression est irréversible : une session volée ne doit pas suffire à la déclencher.",
  })
  @IsString()
  @MinLength(1)
  password!: string;
}
