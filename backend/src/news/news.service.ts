import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NewsItem } from './news.schemas';

const TENANT = 'default';

@Injectable()
export class NewsService {
  constructor(@InjectModel(NewsItem.name) private news: Model<NewsItem>) {}

  // App : actus actives, plus récentes d'abord.
  listActive(max = 50) {
    return this.news.find({ tenantId: TENANT, active: true }).sort({ createdAt: -1 }).limit(max).lean();
  }

  // Admin
  listAll() { return this.news.find({ tenantId: TENANT }).sort({ createdAt: -1 }).lean(); }
  create(dto: any) { return this.news.create({ ...dto, tenantId: TENANT }); }
  async update(id: string, dto: any) {
    const n = await this.news.findByIdAndUpdate(id, dto, { new: true });
    if (!n) throw new NotFoundException('Actu introuvable');
    return n;
  }
  async remove(id: string) { await this.news.findByIdAndDelete(id); return { ok: true }; }
}
