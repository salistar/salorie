import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';

/**
 * Module "objective" — fondation PARTAGÉE.
 * Fournit et exporte ScoringService (scoring pur d'aliments vs objectif),
 * réutilisé par les modules d'analyse menu / fridge / receipt.
 * Aucune dépendance Mongo : le backend boote sans base.
 */
@Module({
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ObjectiveModule {}
