import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Public()
  @Get(':id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async serveImage(@Param('id') id: string, @Res() res: Response) {
    try {
      const { buffer, mime, etag } = await this.media.getRenderableImage(id);
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('ETag', etag);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(buffer);
    } catch {
      throw new NotFoundException('Image not found.');
    }
  }
}
