// Ponto de entrada do Worker (é o "main" do wrangler.toml).
// A base de normas e o índice de busca (gerados por npm run build:conhecimento, que o wrangler roda sozinho
// antes de publicar) entram no pacote na hora de publicar.

import base from '../knowledge/conhecimento.json';
import indice from '../knowledge/indice.json';
import { APPS } from './apps.mjs';
import { criarManipulador } from './handler.mjs';

const manipular = criarManipulador({ base, apps: APPS, indice });

export default {
  fetch(request, env) {
    return manipular(request, env);
  }
};
