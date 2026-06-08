import { Controller, Post, UploadedFile, UseInterceptors, Get, Param, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import type { Response } from 'express';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Local-disk storage (swap for MinIO/S3 in prod via MINIO_* env — see docker-compose).
@Controller('files')
export class FilesController {
  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${extname(file.originalname)}`),
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
  }))
  upload(@UploadedFile() file: Express.Multer.File) {
    return { ok: true, filename: file.filename, size: file.size, url: `/files/${file.filename}` };
  }

  @Get(':name')
  serve(@Param('name') name: string, @Res() res: Response) {
    const p = join(UPLOAD_DIR, name);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
    return res.sendFile(p);
  }
}
