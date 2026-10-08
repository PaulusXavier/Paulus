// Ponto de entrada do Worker (é o "main" do wrangler.toml).
// A base de normas entra no pacote na hora de publicar: se mudar knowledge/documentos, rode
// npm run build:conhecimento e publique de novo.

import base from '../knowledge/conhecimento.json';
import { APPS } from './apps.mjs';
import { criarManipulador } from './handler.mjs';

const manipular = criarManipulador({ base, apps: APPS });

export default {
  fetch(request, env) {
    return manipular(request, env);
  }
};
