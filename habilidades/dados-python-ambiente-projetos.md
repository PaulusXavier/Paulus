---
id: dados-python-ambiente-projetos
nome: Python: ambiente, Jupyter e pastas
quando: instalar python; ambiente virtual; venv python; pip install; jupyter notebook; jupyterlab; vs code python; google colab; requirements.txt; pastas projeto python
---
- Instalar: Python em python.org (marque "Add Python to PATH" no Windows) e um editor: VS Code com a extensão Python, ou Jupyter. Confira no terminal com `python --version` (em alguns sistemas, `python3`).
- Uma **pasta por projeto**, com ambiente virtual próprio: `python -m venv .venv`, ativar (Windows: `.venv\Scripts\activate`; Linux e Mac: `source .venv/bin/activate`) e `pip install pandas matplotlib seaborn openpyxl jupyter`. Registre as versões com `pip freeze > requirements.txt`; outra pessoa reproduz com `pip install -r requirements.txt`.
- Jupyter (`jupyter lab`) mistura texto, código e resultado em células; bom para aprender e explorar. Script `.py` é melhor para rotinas que se repetem. Rode do topo ao fim de vez em quando (Restart and Run All): é o teste de que o caderno não depende de célula esquecida.
- Google Colab é prático, mas roda na nuvem do Google: serve para aprender com dado fictício, não para dado de pessoa.
- Pastas (prática sugerida): `dados/` (entrada, nunca editada à mão), `scripts/` ou `cadernos/`, `resultados/`. Nomes sem espaço nem acento.
- Caminhos relativos à pasta do projeto (`"dados/atend.csv"`) e `pathlib.Path` para montar caminhos; evite caminho absoluto, que quebra em outro computador.
- "FileNotFoundError" quase sempre é a pasta de trabalho errada: peça `import os; os.getcwd()` e `os.listdir("dados")`.
- `.gitignore` com `.venv/`, `dados/` e `*.csv` antes do primeiro commit. Veja o roteiro de dados de pessoas.
