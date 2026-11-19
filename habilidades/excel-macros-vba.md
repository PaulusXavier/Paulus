---
id: excel-macros-vba
nome: Excel: macros, VBA e Office Scripts
quando: macro excel; vba excel; gravar macro; macros no excel; botão com macro; office scripts; automatizar excel; xlsm; habilitar macros; macro não funciona
texto: sim
---
- Macro é uma sequência de ações guardada; VBA é a linguagem dela (arquivo .xlsm). O Excel para web não roda VBA: usa Office Scripts (TypeScript) em planos Microsoft 365 que o incluem, e o Power Automate liga a rotina a e-mail ou pasta.
- Antes de macro, veja se resolve com fórmula, tabela dinâmica, Power Query (Atualizar Tudo), Preenchimento Relâmpago ou Localizar e Substituir. Macro é para a sequência que nada disso faz.
- Gravar: Exibir > Macros > Gravar Macro (nome sem espaço, guardar nesta pasta de trabalho). Faça os passos e pare. Rodar: Alt+F8. Para funcionar a partir da célula atual, marque Usar Referências Relativas. Salve como .xlsm.
- Código: Alt+F11 abre o editor. O gravado vem cheio de `Select` e `Selection`: troque por variáveis e referências diretas. Teste numa cópia e com dado fictício, porque macro não tem Ctrl+Z.
- Quando escrever VBA para a pessoa: código curto, comentado, com `Option Explicit`, sem apagar dado (trabalhar numa aba nova), dizendo onde colar (Inserir > Módulo) e como testar. Você não executa o código: a pessoa roda e conta o resultado.
- Exemplo de esqueleto: `Sub FormatarRelatorio()` ... `End Sub`, com `With ws` e `.Range("A1:F1").Font.Bold = True`.
- Segurança: macro de origem desconhecida é porta de golpe por e-mail. Nunca habilite conteúdo de arquivo que não esperava e guarde as próprias macros em local confiável. A TI do serviço pode bloquear macros, e tudo bem.
- Limites: .xlsm não roda no celular nem no Google Planilhas (o equivalente lá é Apps Script, em JavaScript). VBA é frágil a mudança de pasta e de versão.
- Rotina mensal com vários arquivos e relatórios dura mais em Python ou R, com versionamento (roteiro de automatizar tarefas).
- Dado de família não entra em código de exemplo.
