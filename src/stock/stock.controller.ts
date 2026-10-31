import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Right } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { RequireRight } from '../households/decorators/require-right.decorator';
import { PluginsService } from '../plugins/plugins.service';
import { AdjustDto, CreateBoardDto, CreateItemDto, SortieDto, UpdateBoardDto, UpdateItemDto } from './dto/stock.dto';
import { StockImagesService } from './images.service';
import { StockService } from './stock.service';

const TAILLE_MAX = 8 * 1024 * 1024;

/**
 * Le plugin Gestion de stock. Lire demande de voir le foyer ; faire
 * bouger les quantités, de pouvoir faire les tâches ; créer et modifier
 * tableaux et articles, de pouvoir gérer les tâches. Toutes les routes
 * répondent 403 tant que le plugin n'est pas activé.
 */
@ApiTags('stock')
@Controller('stock')
export class StockController {
  constructor(
    private readonly stock: StockService,
    private readonly plugins: PluginsService,
    private readonly images: StockImagesService,
  ) {}

  private actif() {
    return this.plugins.assertEnabled('stock');
  }

  @Get('boards')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Les tableaux' })
  async boards() {
    await this.actif();
    return this.stock.boards();
  }

  @Post('boards')
  @RequireRight(Right.MANAGE_TASKS)
  async createBoard(@Body() dto: CreateBoardDto) {
    await this.actif();
    return this.stock.createBoard(dto);
  }

  @Patch('boards/:id')
  @RequireRight(Right.MANAGE_TASKS)
  async updateBoard(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBoardDto) {
    await this.actif();
    return this.stock.updateBoard(id, dto);
  }

  @Delete('boards/:id')
  @RequireRight(Right.MANAGE_TASKS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeBoard(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.actif();
    await this.stock.removeBoard(id);
  }

  @Put('boards/:id/image')
  @RequireRight(Right.MANAGE_TASKS)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TAILLE_MAX } }))
  @ApiConsumes('multipart/form-data')
  async boardImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer }) {
    await this.actif();
    const b = await this.stock.requireBoard(id);
    const chemin = await this.images.store(id, this.fichier(file));
    const vue = await this.stock.setBoardImage(id, chemin);
    await this.images.remove(b.imagePath);
    return vue;
  }

  @Delete('boards/:id/image')
  @RequireRight(Right.MANAGE_TASKS)
  async boardImageRemove(@Param('id', ParseUUIDPipe) id: string) {
    await this.actif();
    const b = await this.stock.requireBoard(id);
    const vue = await this.stock.setBoardImage(id, null);
    await this.images.remove(b.imagePath);
    return vue;
  }

  @Get('boards/:id/image')
  @RequireRight(Right.VIEW)
  async boardImageGet(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    await this.actif();
    this.envoyer(res, (await this.stock.requireBoard(id)).imagePath);
  }

  @Get('items')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Les articles, d’un tableau ou de tous' })
  async items(@Query('boardId') boardId?: string) {
    await this.actif();
    return this.stock.items(boardId || undefined);
  }

  @Get('to-buy')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'À racheter : sous le minimum, ou bientôt périmé' })
  async toBuy() {
    await this.actif();
    return this.stock.aRacheter();
  }

  @Post('items')
  @RequireRight(Right.MANAGE_TASKS)
  async createItem(@Body() dto: CreateItemDto) {
    await this.actif();
    return this.stock.createItem(dto);
  }

  @Patch('items/:id')
  @RequireRight(Right.MANAGE_TASKS)
  async updateItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto) {
    await this.actif();
    return this.stock.updateItem(id, dto);
  }

  @Delete('items/:id')
  @RequireRight(Right.MANAGE_TASKS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItem(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.actif();
    await this.stock.removeItem(id);
  }

  @Post('items/:id/adjust')
  @RequireRight(Right.COMPLETE_TASKS)
  @ApiOperation({ summary: 'Une de plus, une de moins' })
  async adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustDto) {
    await this.actif();
    return this.stock.adjust(id, dto.delta);
  }

  @Put('items/:id/image')
  @RequireRight(Right.MANAGE_TASKS)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TAILLE_MAX } }))
  @ApiConsumes('multipart/form-data')
  async itemImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer }) {
    await this.actif();
    const i = await this.stock.requireItem(id);
    const chemin = await this.images.store(id, this.fichier(file));
    const vue = await this.stock.setItemImage(id, chemin);
    await this.images.remove(i.imagePath);
    return vue;
  }

  @Delete('items/:id/image')
  @RequireRight(Right.MANAGE_TASKS)
  async itemImageRemove(@Param('id', ParseUUIDPipe) id: string) {
    await this.actif();
    const i = await this.stock.requireItem(id);
    const vue = await this.stock.setItemImage(id, null);
    await this.images.remove(i.imagePath);
    return vue;
  }

  @Get('items/:id/image')
  @RequireRight(Right.VIEW)
  async itemImageGet(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    await this.actif();
    this.envoyer(res, (await this.stock.requireItem(id)).imagePath);
  }

  @Post('out')
  @RequireRight(Right.COMPLETE_TASKS)
  @ApiOperation({ summary: 'Déclarer une sortie : un ou plusieurs articles, et combien' })
  async sortie(@Body() dto: SortieDto, @CurrentUser() user: AuthenticatedUser) {
    await this.actif();
    return this.stock.sortie(dto, user.id);
  }

  private fichier(file?: { buffer: Buffer }): Buffer {
    if (!file?.buffer?.length) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, 'Aucun fichier reçu, sous le champ « file ».');
    }
    return file.buffer;
  }

  private envoyer(res: Response, chemin: string | null): void {
    if (!chemin) throw AppException.notFound('Pas d’image.');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(this.images.absolu(chemin));
  }
}
