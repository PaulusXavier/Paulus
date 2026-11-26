import { WorkflowEntrypoint } from 'cloudflare:workers';
import { processarInvestigacao } from './investigacao-core.mjs';

export class PaulusInvestigacao extends WorkflowEntrypoint {
  async run(event, step) {
    return processarInvestigacao(this.env, step, event && event.payload);
  }
}
