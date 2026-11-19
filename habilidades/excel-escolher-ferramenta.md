---
id: excel-escolher-ferramenta
nome: Excel ou outra ferramenta? Limites e quando mudar
quando: excel ou python; excel ou r; excel ou sql; quando usar excel; quando não usar excel; excel é suficiente; limite do excel; excel travando; excel lento; planilha pesada; passar do excel para python; excel ou power bi
texto: sim
---
- Excel serve muito bem para: digitar e organizar alguns milhares de registros, resumir (dinâmica), gráficos rápidos, modelos de controle, conta pequena e conferência visual. Todo mundo da equipe conhece, e isso vale muito.
- Mude de ferramenta quando: (a) a mesma limpeza se repete todo mês → Power Query, depois R ou Python; (b) são muitas planilhas ou centenas de milhares de linhas (limite de 1.048.576) → Power Query, modelo de dados, DuckDB ou SQL, R, Python; (c) é preciso rastro e reprodução (o script registra cada passo, os cliques não) → script; (d) é estatística de verdade (testes, modelos, intervalos) → R ou Python; (e) é painel para a gestão → dinâmica com segmentações, ou ferramenta de painéis; (f) várias pessoas digitando ao mesmo tempo, com histórico e permissão → sistema, formulário ou banco.
- Sinais de que a planilha chegou ao limite: demora para abrir e calcular, passa de dezenas de MB, tem fórmulas de 400 caracteres, circulam versões "final_v3_agora_sim", todo mês é copiar e colar à mão, ninguém sabe de onde vem o número.
- Deixar mais leve: trocar fórmula por valor no histórico, evitar coluna inteira em SOMARPRODUTO, tirar INDIRETO e DESLOC, apagar formatação de linhas vazias (Ctrl+End mostra a última célula "usada"), salvar em .xlsb, e cálculo manual temporário (F9).
- Combinação comum: o miolo em R ou Python e a entrega em Excel (`to_excel` e `writexl`), para a equipe filtrar e ler.
- Estudar Excel bem primeiro (estrutura, tabela dinâmica, Power Query) facilita R e Python, porque chave, agregação e junção são os mesmos conceitos.
- Dado de família: a ferramenta é a autorizada pelo serviço e roda no computador dele.
- Ver também os roteiros de Python, R e automatizar tarefas.
