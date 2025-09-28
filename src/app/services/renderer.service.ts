// src/app/services/renderer.service.ts
import { Injectable } from '@angular/core';
import { LocalPlantUmlRenderer } from './renderer-local.service';

@Injectable({ providedIn: 'root' })
export class RendererService {
  async renderPlantUmlToSvg(puml: string): Promise<string> {
    const out = await this.runPlantUml(puml); // string (peut être SVG ou erreur texte)

    const text = (out ?? '').trim();
    if (!text) throw new Error('Sortie vide du renderer.');

    if (/No diagram found/i.test(text)) {
      throw new Error('PlantUML: “No diagram found”. Vérifie @startuml/@enduml après transpilation.');
    }
    if (!/^<svg[\s\S]*<\/svg>\s*$/i.test(text)) {
      // Laisse une trace en console pour aider
      console.error('[Renderer raw output]', text.slice(0, 1000));
      throw new Error('La sortie du renderer n’est pas un SVG. Ouvre “PUML généré” pour vérifier.');
    }
    return text;
  }

  // À remplacer par ton implémentation (CheerpJ/pipe/etc.)
  private async runPlantUml(puml: string): Promise<string> {
    return await LocalPlantUmlRenderer.render(puml);
  }

}
