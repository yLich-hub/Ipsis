"""Gravação no Supabase, por PostgREST.

Service role, e não conexão direta ao Postgres, por dois motivos que se somam:
o CLAUDE.md reserva a conexão direta para ``scripts/`` que rodam localmente, e
este pacote foi feito para rodar também num agendador remoto (GitHub Actions),
onde abrir conexão de banco significa liberar IP e guardar senha de Postgres.
PostgREST é HTTPS com uma chave.

A RLS de 0012 fecha escrita para ``anon`` e ``authenticated``; a coleta não tem
sessão para ancorar policy, então a service role é o caminho — o mesmo raciocínio
e as mesmas duas alternativas recusadas estão no cabeçalho de
``src/lib/vigilia/escrita.ts``.

**Sem chave, o pacote não fica inútil.** ``--para-disco`` escreve o resultado em
``data/vigilia/*.json``, que é como se confere uma coleta antes de deixá-la
escrever em qualquer lugar.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import requests

from coletores.tipos import Achado, Colheita, Metrica

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "data" / "vigilia"


class SemCredencial(Exception):
    """Falta URL ou service role. Erro de configuração, não de coleta."""


def _credenciais() -> tuple[str, str]:
    """Lê e SANEIA as duas credenciais.

    O `.strip()` não é zelo cosmético — é o defeito mais provável de uma coleta
    que roda na máquina e falha no CI. O campo de secret do GitHub é uma
    `textarea`: colar a chave e apertar Enter sem querer deixa um `\\n` no fim
    do valor, e o painel não mostra isso de jeito nenhum. Com a quebra de linha:

      - na chave, o `requests` recusa o cabeçalho (`Authorization` com `\\n` é
        header splitting) e levanta antes de qualquer requisição sair;
      - na URL, a montagem vira `https://x.supabase.co\\n/rest/v1/...` e o erro
        que aparece é de URL inválida, que não aponta para o secret nenhum.

    Nos dois casos o traceback fala de HTTP e não de configuração, e quem lê o
    log procura no lugar errado. Sanear na entrada custa uma linha.
    """
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip().strip("\"'").rstrip("/")
    chave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip().strip("\"'")

    if not url or not chave:
        raise SemCredencial(
            "NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são exigidas para gravar.\n"
            "Rode com --para-disco para conferir a coleta sem escrever no banco."
        )

    if not url.startswith("https://"):
        raise SemCredencial(
            f"NEXT_PUBLIC_SUPABASE_URL não parece uma URL: {url[:40]!r}.\n"
            "Esperado algo como https://SEU-PROJETO.supabase.co"
        )

    return url, chave


def _cabecalhos(chave: str, resolucao: str | None = None) -> dict:
    h = {
        "apikey": chave,
        "Authorization": f"Bearer {chave}",
        "Content-Type": "application/json",
        # `return=minimal` para o PostgREST não devolver as linhas gravadas: são
        # milhares, e nada aqui as lê de volta.
        "Prefer": "return=minimal",
    }
    if resolucao:
        h["Prefer"] = f"{h['Prefer']},{resolucao}"
    return h


def grava_achados(achados: Iterable[Achado]) -> int:
    """Upsert por id estável. Rodar duas vezes no mesmo dia não duplica nada —
    mesma garantia do seed da curadoria.

    ``visto_em`` e ``reconferido_*`` ficam de fora do payload de propósito: a
    data em que o achado apareceu é histórico, e a marca de conferência é do
    usuário. Sobrescrevê-las na coleta seguinte apagaria o trabalho de quem leu
    a linha.
    """
    linhas = [a.linha() | {"atualizado_em": _agora()} for a in achados]
    if not linhas:
        return 0

    url, chave = _credenciais()
    # Em lotes: um upsert de 800 linhas num POST só é o tipo de requisição que
    # o PostgREST aceita e o gateway corta no meio.
    total = 0
    for i in range(0, len(linhas), 200):
        lote = linhas[i : i + 200]
        r = requests.post(
            f"{url}/rest/v1/vigilia_alteracoes?on_conflict=id",
            headers=_cabecalhos(chave, "resolution=merge-duplicates"),
            data=json.dumps(lote),
            timeout=90,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"falha ao gravar achados ({r.status_code}): {r.text[:300]}")
        total += len(lote)

    return total


def ids_conhecidos(ids: list[str]) -> set[str]:
    """Quais desses ids o banco já tem. É o que separa "novo" de "revisto" no
    relatório — sem isso, toda execução diria que achou tudo pela primeira vez."""
    if not ids:
        return set()

    url, chave = _credenciais()
    conhecidos: set[str] = set()

    for i in range(0, len(ids), 100):
        lote = ids[i : i + 100]
        lista = ",".join(f'"{x}"' for x in lote)
        r = requests.get(
            f"{url}/rest/v1/vigilia_alteracoes?select=id&id=in.({lista})",
            headers=_cabecalhos(chave),
            timeout=60,
        )
        if r.status_code >= 400:
            # Não saber o que é novo não invalida a coleta; o relatório fica
            # menos preciso e a gravação segue.
            return conhecidos
        conhecidos.update(l["id"] for l in r.json())

    return conhecidos


def grava_metricas(metricas: Iterable[Metrica]) -> int:
    linhas = [m.linha() | {"coletado_em": _agora()} for m in metricas]
    if not linhas:
        return 0

    url, chave = _credenciais()
    r = requests.post(
        f"{url}/rest/v1/vigilia_jurimetria?on_conflict=assunto,tribunal",
        headers=_cabecalhos(chave, "resolution=merge-duplicates"),
        data=json.dumps(linhas),
        timeout=60,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"falha ao gravar jurimetria ({r.status_code}): {r.text[:300]}")
    return len(linhas)


def registra(colheita: Colheita, novos: int) -> None:
    """Uma linha no diário de bordo. Falha aqui não derruba nada: o dado já foi
    gravado, e um relato perdido custa a data do card, não o achado."""
    try:
        url, chave = _credenciais()
    except SemCredencial:
        return

    requests.post(
        f"{url}/rest/v1/vigilia_coletas",
        headers=_cabecalhos(chave),
        data=json.dumps(
            {
                "fonte": colheita.fonte,
                "ok": colheita.ok,
                "erro": colheita.erro,
                "vistos": colheita.vistos,
                "candidatos": len(colheita.achados) + len(colheita.metricas),
                "novos": novos,
                "ms": colheita.ms,
            }
        ),
        timeout=30,
    )


def para_disco(colheita: Colheita) -> Path:
    """Escreve a colheita em ``data/vigilia/<fonte>.json``.

    É o modo de conferir uma coleta antes de deixá-la escrever no banco, e é o
    que permite rodar o pacote inteiro sem nenhuma credencial.
    """
    SAIDA.mkdir(parents=True, exist_ok=True)
    arq = SAIDA / f"{colheita.fonte}.json"
    arq.write_text(
        json.dumps(
            {
                "fonte": colheita.fonte,
                "coletado_em": _agora(),
                "ok": colheita.ok,
                "erro": colheita.erro,
                "vistos": colheita.vistos,
                "achados": [a.linha() for a in colheita.achados],
                "metricas": [m.linha() for m in colheita.metricas],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return arq


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat()
