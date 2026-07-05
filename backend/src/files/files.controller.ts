import { Controller, Post, UploadedFile, UseInterceptors, Get, Param, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import type { Response } from 'express';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// Local-disk storage (swap for MinIO/S3 in prod via MINIO_* env — see docker-compose).
@Controller('files')
export class FilesController {
  // S7: auth + MIME/extension whitelist + random UUID name + tighter size cap.
  @Post()
  @UseGuards(FirebaseAuthGuard)
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      if (!ALLOWED_MIME.includes(file.mimetype) || !ALLOWED_EXT.includes(ext)) {
        return cb(new BadRequestException('Only JPG/PNG/WEBP images are allowed'), false);
      }
      cb(null, true);
    },
  }))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return { ok: true, filename: file.filename, size: file.size, url: `/files/${file.filename}` };
  }

  // S6: reject path traversal / separators; ensure the resolved path stays
  // inside UPLOAD_DIR. Kept public (no guard) so <Image> can load by URL.
  @Get(':name')
  serve(@Param('name') name: string, @Res() res: Response) {
    if (!name || name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) {
      return res.status(400).json({ error: 'invalid filename' });
    }
    const full = resolve(UPLOAD_DIR, name);
    if (!full.startsWith(resolve(UPLOAD_DIR))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return res.status(404).json({ error: 'not found' });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(full);
  }
}
