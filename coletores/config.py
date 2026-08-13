"""Curadoria compartilhada da vigília, lida de ``data/curadoria/vigilia.yaml``.

Nada neste pacote guarda padrão de reconhecimento em constante Python. O
motivo está no cabeçalho do YAML: o filtro existe em dois runtimes — aqui e em
``src/lib/vigilia/alvos.ts`` — e duas cópias da mesma regra divergem na primeira
correção. O lado TypeScript é trancado por ``tests/vigilia.test.ts``, que falha
se ``alvos.ts`` discordar deste arquivo; o lado Python simplesmente o lê.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parent.parent
CURADORIA = RAIZ / "data" / "curadoria" / "vigilia.yaml"


@dataclass(frozen=True)
class Alvo:
    """Uma das três leis do corpus."""

    lei_id: str
    rotulo: str
    reconhece: re.Pattern[str]
    planalto: str


@dataclass(frozen=True)
class Config:
    data_de_corte: str
    alvos: list[Alvo]
    verbos: re.Pattern[str]
    contexto_de_lei: re.Pattern[str]
    camara: dict = field(default_factory=dict)
    datajud: dict = field(default_factory=dict)
    dou: dict = field(default_factory=dict)

    def alvo(self, lei_id: str) -> Alvo | None:
        return next((a for a in self.alvos if a.lei_id == lei_id), None)


@lru_cache(maxsize=1)
def carrega(caminho: Path | None = None) -> Config:
    """Lê e compila a curadoria. Cacheado: os padrões são compilados uma vez.

    Falha alto e cedo se o arquivo sumir ou vier incompleto. Um coletor que
    seguisse com filtro vazio varreria as APIs inteiras e gravaria tudo — o modo
    de falha mais caro possível, e o mais difícil de perceber.
    """
    arq = caminho or CURADORIA
    if not arq.exists():
        raise FileNotFoundError(
            f"curadoria da vigília não encontrada em {arq}.\n"
            "É ela que define o que o coletor procura; sem ela não há coleta."
        )

    bruto = yaml.safe_load(arq.read_text(encoding="utf-8"))

    alvos = [
        Alvo(
            lei_id=a["lei_id"],
            rotulo=a["rotulo"],
            # `IGNORECASE` não entra: o filtro trabalha sobre texto já
            # normalizado por `sem_acento`, e depender do flag esconderia um
            # caminho em que o texto chega sem normalizar.
            reconhece=re.compile(a["reconhece"]),
            planalto=a["planalto"],
        )
        for a in bruto["alvos"]
    ]

    if len(alvos) != 3:
        raise ValueError(
            f"a curadoria declara {len(alvos)} alvos; o corpus tem três leis. "
            "Alvo a mais ou a menos muda o que a vigília enxerga em silêncio."
        )

    return Config(
        data_de_corte=str(bruto["data_de_corte"]),
        alvos=alvos,
        verbos=re.compile(bruto["verbos"]),
        contexto_de_lei=re.compile(bruto["contexto_de_lei"]),
        camara=bruto.get("camara", {}),
        datajud=bruto.get("datajud", {}),
        dou=bruto.get("dou", {}),
    )
