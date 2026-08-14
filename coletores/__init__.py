"""Vigília do corpus — os coletores em Python.

Cinco fontes, uma pergunta: **a fotografia de 28/02/2025 envelheceu?**

O que este pacote NUNCA faz, em nenhum dos cinco coletores: escrever em
``dispositivos``, ``artigos`` ou ``leis``. O texto legal do projeto vem de
``vade_parser.py`` → ``normalize.ts`` → ``seed.ts``, com conferência humana no
meio, e a decisão nº 1 do CLAUDE.md diz que ele vem de uma fonte só. A vigília
avisa que o corpus precisa ser reconferido; quem reconfere é gente.

Ver ``coletores/README.md``.
"""

__all__ = [
    "banco", "camara", "config", "datajud", "dou", "filtro", "inlabs",
    "planalto", "rede", "senado", "tipos",
]
