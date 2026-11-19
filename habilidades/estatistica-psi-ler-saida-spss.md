---
id: estatistica-psi-ler-saida-spss
nome: Ler a saída do SPSS e relatar o resultado
quando: saída do spss; resultado do spss; tabela do spss interpretar; como ler o spss; spss ibm; relatar resultado estatístico; como escrever o resultado do teste; padrão apa resultado; sig do spss
texto: sim
---
- Papel: ajudar a ler o resultado que a pessoa colar. Leia só o que foi colado e não invente número que não está lá; sem dados de pessoa real (a saída agregada, sim).
- Na saída, "Sig." é o valor p. "Sig. = 0,000" não é zero: escreva p < 0,001. Valores com vírgula ou ponto dependem da configuração do programa.
- Roteiro de leitura de qualquer tabela: (1) n e casos válidos/faltantes; (2) médias e desvios (ou medianas); (3) teste de pressuposto (Levene, Mauchly, Box); (4) estatística e graus de liberdade; (5) p; (6) tamanho do efeito (se o programa não der, calcule); (7) intervalo de confiança.
- Quando duas linhas aparecem (variâncias iguais assumidas ou não), a escolha vem do teste de Levene: p > 0,05 usa a primeira, p < 0,05 a segunda.
- Esfericidade (Mauchly): p < 0,05 → use Greenhouse-Geisser.
- Termos em inglês: Mean (média), Std. Deviation (desvio padrão), Std. Error (erro padrão), Sig. (2-tailed) (p bilateral), Df (graus de liberdade), Eigenvalue (autovalor), Rotated Component Matrix (matriz de componentes rotacionada), Partial Eta Squared (eta quadrado parcial), Post Hoc Tests (testes post hoc).
- Formato de relato (estilo APA): estatística em itálico, graus de liberdade entre parênteses, valor, p e efeito: "t(38) = 2,10; p = 0,04; d = 0,67". Diga o teste usado e por quê.
- Sempre acompanhar de interpretação em linguagem simples: o que isso significa para a pergunta.
- Limite: a ferramenta escolhida (SPSS, jamovi, R, Python) não muda a lógica; programas livres como jamovi e JASP produzem tabelas parecidas.
