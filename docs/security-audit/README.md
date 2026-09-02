# Auditoria de segurança — relatório e gerador

`relatorio-auditoria-seguranca.pdf` é a saída. Os três arquivos ao lado dele são a
entrada, e existem separados de propósito: **o conteúdo da auditoria não mora no
renderizador**. Corrigir um achado é editar um dicionário; o PDF sai igual em
qualquer máquina, sem ninguém mexer em layout.

| Arquivo                   | O que é                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `dados_auditoria.py`      | Achados, pontos fortes, pontos fracos, recomendações, stack, metodologia |
| `issues_github.py`        | Texto integral das issues, em Markdown, pronto para copiar e colar       |
| `gerar_relatorio.py`      | Só desenho: capa, gráficos, tabelas, blocos de código                    |
| `graficos/*.png`          | Saída do matplotlib, regerada a cada execução                            |

## Regerar

O ambiente é isolado — nada é instalado globalmente:

```
python -m venv .venv-relatorio
.venv-relatorio/Scripts/pip install reportlab matplotlib
.venv-relatorio/Scripts/python gerar_relatorio.py relatorio-auditoria-seguranca.pdf
```

No Linux ou no macOS, troque `Scripts/` por `bin/`.

## Duas decisões do gerador que não são óbvias

**As fontes vêm do matplotlib, não do PDF.** Helvetica e Courier são WinAnsi, e
o relatório tem setas, aspas tipográficas e sinais que não existem nessa
codificação — fonte incompleta vira quadradinho preto no meio de um trecho de
código. As DejaVu que o matplotlib já traz cobrem tudo, e não custam download.

**Cada painel de código é uma linha de tabela por linha de código.** Célula de
tabela não quebra entre páginas, e o corpo de uma issue passa de mil pontos de
altura: um painel de célula única estourava o quadro com `LayoutError`. Com uma
linha por linha, a tabela quebra entre elas e o fundo continua do outro lado sem
emenda visível — as bordas horizontais ficam de fora justamente para não
anunciar uma emenda que não existe.

## Verificação da saída

O que foi conferido antes de entregar, rasterizando as páginas com PyMuPDF a 110
dpi: 30 páginas, os dois gráficos renderizados na página 4, nenhuma página órfã
ou quase vazia, nenhum caminho de arquivo quebrado no meio do nome na tabela de
achados, e os painéis de issue atravessando a virada de página sem buraco.
