/*
  Paulus no Umbrella — refinamento da consulta à base local (roda no aparelho, sem rede).

  A busca do Paulus compara as palavras da pergunta com os trechos da base. Perguntas naturais trazem
  palavras de enfeite ("o que significa", "no app", "me explique") que derrubam a cobertura e fazem a
  busca desistir. Aqui a pergunta é limpa e recebe sinônimos do vocabulário do PAIF.
  Só mexe na consulta LOCAL. A pergunta enviada à IA continua exatamente como a pessoa escreveu.

  Função pura (sem DOM, sem dados de família): testável em Node.
*/
(function (root) {
  "use strict";

  const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  // Expressões que não dizem nada sobre o assunto (testadas já sem acento).
  const ENFEITE = [
    "o que significa", "o que quer dizer", "o que e", "o que sao", "qual e a diferenca entre", "qual a diferenca entre",
    "me explique", "me explica", "explique", "explica", "pode explicar", "pode me explicar", "quero saber", "gostaria de saber",
    "como funciona", "como e que", "para que serve", "pra que serve", "qual o", "qual a", "quais os", "quais as", "quais sao",
    "no aplicativo", "no app", "do app", "deste app", "neste app", "do aplicativo", "no sistema", "aqui no", "aqui",
    "por favor", "paulus", "umbrella", "oi", "ola"
  ];

  // Palavra da pessoa -> termos que o texto técnico usa. Só entra o que ajuda a achar o trecho certo.
  const SINONIMOS = [
    [/\b(tecnico|tecnica|profissional|assistente social|psicologo|psicologa)\b/, "tecnico referencia equipe"],
    [/\b(quantas familias|quantas familia|limite de familias|capacidade)\b/, "familias por tecnico demanda reprimida"],
    [/\b(prioridade|prioridades|priorizar|priorizacao|fila)\b/, "prioridades escala fila tecnica busca ativa"],
    [/\b(encerrar|encerramento|fechar|finalizar|dar baixa|concluir)\b/, "encerramento objetivos alcancados desligamento"],
    [/\b(desistiu|desistencia|desistir|nao quer mais)\b/, "familia desistiu excluido registro minimo"],
    [/\b(meta|metas|objetivo da familia)\b/, "metas pactuacao expectativas da familia"],
    [/\b(grupo|grupos|roda|rodas|oficina|oficinas|coletivo|coletiva|coletivas)\b/, "coletivo oficina grupo acolhida coletiva"],
    [/\b(rede|intersetorial|articulacao)\b/, "rede territorio articulacao referencia contrarreferencia"],
    [/\b(encaminhar|encaminhamento|encaminhamentos|contrarreferencia|contra referencia)\b/, "encaminhamento referencia contrarreferencia"],
    [/\b(vulnerabilidade|vulnerabilidades|risco|riscos|desprotecao|desprotecoes)\b/, "vulnerabilidade risco desprotecao diagnostico"],
    [/\b(potencialidade|potencialidades|pontos fortes|forcas)\b/, "potencialidades estrategias de sobrevivencia redes de solidariedade"],
    [/\b(acompanhamento|acompanhar)\b/, "acompanhamento familiar PAF processo continuado"],
    [/\b(atendimento)\b/, "atendimento pontual acompanhamento"],
    [/\b(violencia|violacao|violacoes|abuso|maus tratos)\b/, "violencia violacao CREAS PAEFI"],
    [/\b(bolsa familia|condicionalidade|condicionalidades|descumprimento)\b/, "bolsa familia condicionalidades descumprimento"],
    [/\b(beneficio eventual|beneficios eventuais|cesta basica|auxilio natalidade|auxilio funeral|aluguel social)\b/, "beneficios eventuais cesta basica auxilio"],
    [/\b(territorio|comunidade|comunitario|comunitaria)\b/, "territorio comunitario referencias comunitarias"],
    [/\b(grafico|graficos|indicador|indicadores|rma|relatorio)\b/, "graficos indicadores RMA resumo mensal"],
    [/\b(seguranca|segurancas)\b/, "segurancas socioassistenciais acolhida convivio autonomia"],
    [/\b(registro|registrar|prontuario|anotar|anotacao)\b/, "registro prontuario sem juizo de valor"],
    [/\b(sigilo|lgpd|anexo|anexos|confidencial)\b/, "sigilo anexos LGPD"],
    [/\b(visita|visitas|domiciliar)\b/, "visita domiciliar consentimento"],
    [/\b(construir com|junto com a familia|participacao)\b/, "participacao familia sujeito pactuacao"],
    [/\b(terapia|psicoterapia|terapeutico|terapeutica|clinico|clinica|tratamento psicologico)\b/, "terapeutico carater nao terapeutico saude mental rede intersetorial"],
    [/\b(religiao|religioso|religiosa|igreja|culto|oracao)\b/, "laicidade praticas religiosas"],
    [/\b(nao adere|nao aderiu|adesao|nao comparece|nao vem|faltou|abandono do acompanhamento|baixa adesao)\b/, "adesao baixa adesao desprotecao fatalismo participacao voluntaria"],
    [/\b(exigir|obrigar|obrigatorio|obrigatoria|imposto|condicao)\b/, "voluntaria nao pode ser imposta condicionalidade"]
  ];

  function limparPergunta(texto) {
    let t = " " + norm(texto) + " ";
    for (const e of ENFEITE.slice().sort((a, b) => b.length - a.length)) t = t.split(" " + e + " ").join(" ");
    return t.replace(/\s+/g, " ").trim();
  }

  // Devolve { limpa, expandida }. "expandida" = pergunta limpa + sinônimos (usada na busca local).
  function refinar(texto) {
    const limpa = limparPergunta(texto);
    const base = limpa || norm(texto);
    const extras = [];
    for (const [re, termos] of SINONIMOS) if (re.test(" " + base + " ")) extras.push(termos);
    return { limpa: base, expandida: (base + " " + extras.join(" ")).trim() };
  }

  const api = { refinar, limparPergunta };
  root.PaulusConsulta = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
