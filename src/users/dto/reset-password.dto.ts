import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'paul' })
  @IsString()
  @Length(1, 32)
  username!: string;

  @ApiProperty({ example: 'RW4K-9TQM', description: 'Le code donné par un administrateur du foyer.' })
  @IsString()
  @Length(4, 20)
  code!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'Le mot de passe doit faire au moins 10 caractères.' })
  @MaxLength(256)
  newPassword!: string;
}
