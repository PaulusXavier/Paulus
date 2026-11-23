// Ponto de entrada do Worker do Paulus (Cloudflare). O wrangler.toml aponta `main` para este arquivo.
//
// Os quatro JSONs abaixo NÃO ficam no Git: o `build` do wrangler.toml os gera antes de cada publicação
// (node scripts/build-knowledge.mjs && node scripts/build-habilidades.mjs):
//   knowledge/worker-base.json  base de normas compacta (só o que o Worker usa; limite de 3 MB compactado do plano gratuito)
//   knowledge/indice.json       índice de busca pré-calculado dessa base
//   knowledge/habilidades.json  roteiros de trabalho (habilidades/*.md)
//   knowledge/catalogo.json     lista do que está carregado (versionada; alimenta a ficha "o que eu sei")
// Toda a lógica (login, limites, CORS, rotas /login, /sessao, /voz, perguntas e streaming) está em handler.mjs.

import baseCompacta from '../knowledge/worker-base.json';
import indice from '../knowledge/indice.json';
import habilidades from '../knowledge/habilidades.json';
import catalogo from '../knowledge/catalogo.json';
import pacote from '../package.json';
import { expandirBase } from '../shared/base-compacta.mjs';
import { APPS } from './apps.mjs';
import { criarManipulador } from './handler.mjs';

const manipulador = criarManipulador({
  base: expandirBase(baseCompacta),
  apps: APPS,
  indice: indice,
  habilidades: habilidades,
  autoconhecimento: { versao: pacote.version, catalogo: catalogo }
});

export default {
  async fetch(request, env) {
    return manipulador(request, env);
  }
};

