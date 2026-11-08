---
id: dados-python-primeiros-passos
nome: Python: primeiros passos da linguagem
quando: primeiros passos python; variável python; lista python; dicionário python; função python; def python; for python; f-string; indentação python; tipos python
---
- Variável guarda um valor: `total = 120 + 35`. Tipos básicos: `int`, `float` (decimal com ponto: `3.5`), `str` (texto entre aspas), `bool` (`True`, `False`). Veja com `type(x)`. Python diferencia maiúscula de minúscula; nomes em snake_case, sem acento nem espaço.
- Lista (ordenada, muda): `idades = [2, 5, 9]`; `idades[0]` é o **primeiro** (a contagem começa em 0); `idades[-1]` é o último; `idades.append(12)`; `len(idades)`.
- Dicionário (chave e valor): `familia = {"bairro": "A", "pessoas": 4}`; `familia["bairro"]`. É a base do `DataFrame`: `pd.DataFrame({"bairro": [...], "n": [...]})`.
- Condição e repetição: `if n > 10:` e `for b in bairros:`. O que está dentro do bloco vem com **recuo de 4 espaços**, e a linha anterior termina em `:`.
- Texto formatado: `f"Total: {total:.1f}"` (uma casa decimal). Comentário com `#`.
- Função: `def taxa_por_mil(n, pop):` com recuo e `return n / pop * 1000`. Crie função quando copiar o mesmo código a terceira vez; teste com valores simples.
- Bibliotecas: `import pandas as pd` e `import numpy as np` (apelidos convencionais). Instale uma vez com `pip install pandas`, importe em cada sessão.
- Compreensão de lista (`[x * 2 for x in idades]`) é elegante, mas só mostre depois do `for` comum.
- Por trecho: o que faz, o que aparece na tela e um mini exercício ("troque os valores e rode de novo"). Uma ideia por vez; iniciante não precisa de classes agora.
