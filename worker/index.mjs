// Ponto de entrada do Worker (é o "main" do wrangler.toml).
// A base de normas e o índice de busca (gerados por npm run build:conhecimento, que o wrangler roda sozinho
// antes de publicar) entram no pacote na hora de publicar.

import compacta from '../knowledge/worker-base.json';
import indice from '../knowledge/indice.json';
import habilidades from '../knowledge/habilidades.json';
import { expandirBase } from '../shared/base-compacta.mjs';
import { APPS } from './apps.mjs';
import { criarManipulador } from './handler.mjs';

const manipular = criarManipulador({ base: expandirBase(compacta), apps: APPS, indice, habilidades });

export default {
  fetch(request, env) {
    return manipular(request, env);
  }
};
