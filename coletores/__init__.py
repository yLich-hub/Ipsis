"""Vigília do corpus — os coletores em Python.

Cinco fontes, uma pergunta: **a fotografia de 28/02/2025 envelheceu?**

O que este pacote NUNCA faz, em nenhum dos cinco coletores: escrever em
``dispositivos``, ``artigos`` ou ``leis``. O texto legal do projeto vem de
``vade_parser.py`` → ``normalize.ts`` → ``seed.ts``, com conferência humana no
meio, e a decisão nº 1 do CLAUDE.md diz que ele vem de uma fonte só. A vigília
avisa que o corpus precisa ser reconferido; quem reconfere é gente.

Ver ``coletores/README.md``.
"""

import sys as _sys

# --- saída em UTF-8, sempre ---------------------------------------------------
#
# O console do Windows entrega `sys.stdout` em cp1252, e cp1252 não tem `→`. O
# efeito era o pior possível para um comando de verificação:
# ``python -m coletores.redacao`` fazia o trabalho inteiro, imprimia
# "0 blocos a atualizar" nas três leis — que é a resposta que se foi buscar — e
# então morria com `UnicodeEncodeError` na última linha, saindo com **código 1**.
# Sucesso indistinguível de falha, num script cuja única função é dizer se o
# corpus está em dia.
#
# O conserto é a saída, não o texto. Trocar a seta por ASCII calaria este caso e
# deixaria a armadilha armada para o próximo `·`, `º` ou `§` — e o projeto inteiro,
# do `normalize.ts` ao README, escreve nesses caracteres. O Node já escreve UTF-8
# no mesmo terminal; aqui é só o Python honrando a codepage em vez do conteúdo.
#
# Fica no ``__init__`` porque todo caminho de entrada passa por ele: ``-m
# coletores``, ``-m coletores.redacao`` (executar submódulo importa o pacote pai)
# e o pytest. No Actions, que roda em UTF-8, o laço não faz nada.
for _fluxo in (_sys.stdout, _sys.stderr):
    if _fluxo is None:
        continue
    if (getattr(_fluxo, "encoding", "") or "").lower().replace("-", "") == "utf8":
        continue
    try:
        _fluxo.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError, ValueError):
        # Captura do pytest e fluxos redirecionados nem sempre são
        # `TextIOWrapper`. Perder o UTF-8 aqui não pode derrubar a coleta.
        pass

__all__ = [
    "banco", "camara", "config", "datajud", "dou", "filtro", "inlabs",
    "planalto", "rede", "senado", "tipos",
]
