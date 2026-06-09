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
    return this.nutrition.micros(body?.foods || [], body?.lang || 'fr');
  }
}
