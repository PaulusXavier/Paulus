---
id: excel-exemplo-atendimentos
nome: Excel: exemplo completo com atendimentos fictícios
quando: exemplo de análise no excel; passo a passo excel; análise completa excel; atendimentos por mês excel; relatório mensal excel; painel simples excel; tutorial excel; monte uma planilha de exemplo excel
texto: sim
---
- Cenário fictício: aba Registro com A ID, B data, C bairro ("Bairro A", "Bairro B"), D tipo (acolhida, visita, grupo), E profissional (iniciais), F idade. Pergunta: atendimentos por mês e bairro no primeiro semestre, e que parte foram visitas.
- 1. Copie o arquivo e olhe cada coluna com filtro (variações, vazios, datas como texto).
- 2. Ctrl+T e nomeie a tabela `tbReg`.
- 3. Colunas auxiliares: competência `=DATA(ANO([@data]);MÊS([@data]);1)` e faixa etária `=SES([@idade]<12;"0-11";[@idade]<18;"12-17";[@idade]<60;"18-59";VERDADEIRO;"60+")`.
- 4. Conferência: `=CONT.VALORES(tbReg[ID])` dá o total; repetidos com `=CONT.SE(tbReg[ID];[@ID])>1` numa coluna auxiliar.
- 5. Resumo por fórmula: bairros nas linhas, competências nas colunas, `=CONT.SES(tbReg[bairro];$A2;tbReg[competência];B$1)`. O total geral tem de bater com o passo 4.
- 6. Mesmo resumo por tabela dinâmica (Linhas: bairro; Colunas: competência; Valores: contagem de ID) e compare. Se divergir, há grafia diferente ou data como texto.
- 7. Parte de visitas: `=CONT.SES(tbReg[tipo];"visita")/CONT.VALORES(tbReg[ID])`. Frase do achado: "visitas foram 28% dos 412 atendimentos de janeiro a junho".
- 8. Gráfico de barras por bairro (ordenado) e de linha por mês, com título que diz a conclusão.
- 9. Aba Leia-me: o que foi contado, exclusões, data da extração, quem fez.
- 10. Mês novo: dados entram na Tabela e Dados > Atualizar Tudo.
- Variações para treinar: soma de tempo em vez de contagem; comparação com o mesmo mês do ano anterior; taxa por mil habitantes, com a população por bairro trazida por PROCV.
- Para gerar dado fictício sem usar dado real: `=ALEATÓRIOENTRE(1;3)` com ESCOLHER, e depois Colar Especial > Valores.
- Os nomes de coluna entre colchetes dependem dos cabeçalhos reais; ajuste ao que a pessoa tiver.
