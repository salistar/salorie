import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { NutritionService, FoodInput } from './nutrition.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@UseGuards(FirebaseAuthGuard)
@Controller('nutrition')
export class NutritionController {
  constructor(private nutrition: NutritionService) {}

  // Deterministic micronutrient report from OpenFoodFacts data (no AI).
  // Body: { foods: [{ name, calories, barcode? }], lang? }
  @Post('micros')
  micros(@Body() body: { foods: FoodInput[]; lang?: string }) {
    // S-fix : borne la liste (chaque aliment peut déclencher un appel OpenFoodFacts) →
    // évite l'amplification de requêtes externes via un foods[] géant.
    const foods = Array.isArray(body?.foods) ? body.foods.slice(0, 50) : [];
    return this.nutrition.micros(foods, body?.lang || 'fr');
  }
}
