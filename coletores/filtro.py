"""O filtro do corpus — espelho de ``src/lib/vigilia/alvos.ts``.

Puro, sem rede e sem banco. É a única peça da vigília que pode errar em
silêncio: um cliente de API que quebra devolve erro e a tela mostra; um filtro
que erra devolve uma lista plausível — vazia demais ou cheia de ruído — e
ninguém desconfia. Daí ``tests/test_filtro.py``, com ementas reais colhidas das
APIs, e daí os padrões virem do YAML de curadoria em vez de morarem aqui.

**O erro é enviesado de propósito para o falso positivo.** Um achado a mais
custa uma linha que o usuário lê e descarta; um achado a menos custa uma peça
protocolada com redação revogada.
"""

from __future__ import annotations

import re
import unicodedata

from coletores.config import Alvo, Config, carrega


def sem_acento(s: str) -> str:
    """Mesmo contrato de ``public.norm()`` no banco e de ``semAcento`` em TS."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    ).lower()


def toca_o_corpus(ementa: str, cfg: Config | None = None) -> list[Alvo]:
    """Quais leis do corpus esta ementa diz alterar. Lista vazia é "não
    interessa", nunca "erro".

    Não se procura o verbo colado ao nome da lei porque as ementas reais não os
    colam: "Altera a Lei nº 7.560, de 19 de dezembro de 1986, e a Lei nº 11.343,
    de 23 de agosto de 2006, para aperfeiçoar o regime de destinação de bens"
    põe 60 caracteres entre um e outro, e uma regra de proximidade perderia
    justamente o alvo.
    """
    cfg = cfg or carrega()
    t = sem_acento(ementa)

    if not cfg.verbos.search(t):
        return []

    achados: list[Alvo] = []
    for a in cfg.alvos:
        m = a.reconhece.search(t)
        if not m:
            continue
        # Casou só pelo número? Então a ementa tem de tratar o número como
        # diploma legal — `2.848` sozinho pode ser valor em reais.
        so_por_numero = not re.search(r"[a-z]", m.group(0))
        if so_por_numero and not cfg.contexto_de_lei.search(t):
            continue
        achados.append(a)

    return achados


_ARTIGOS = re.compile(
    r"\barts?\.?\s*((?:\d{1,4}(?:-[A-Za-z])?[ºo°]?(?:\s*(?:,|e)\s*)?)+)", re.IGNORECASE
)
_NUMERO = re.compile(r"\d{1,4}(?:-[A-Za-z])?")
_DIPLOMA = re.compile(r"\b\d{1,3}\.\d{3}\b")


def artigos_de(ementa: str, alvos: list[Alvo]) -> list[str]:
    """Artigos que a ementa diz alterar, como ids no formato do corpus.

    ``'Altera o art. 64 do Decreto-Lei nº 2.848…'`` → ``['dl_2848_1940_art64']``.

    Serve para uma pergunta só, e é a pergunta certa: o projeto cita
    dispositivos específicos em ``teses.fundamentos``. Uma proposição que altera
    o art. 121 do CP (homicídio) não toca nada que a minuta cite; uma que altera
    o art. 59 ou o 68 desmonta a dosimetria inteira. Sem essa distinção a
    vigília lista 666 proposições sobre o Código Penal e afoga a única que
    importa — medido contra a API em 13/08/2026.

    Duas travas, e as duas devolvem lista vazia em vez de chutar:

    1. **mais de uma lei do corpus na ementa.** "Altera o CP e o CPP, nos arts.
       33 e 155" não diz qual artigo é de qual diploma.
    2. **mais de um diploma numerado.** "Altera o art. 2º da Lei nº 7.209 e a
       Lei nº 11.343" toca uma só lei do corpus, mas o artigo nomeado é da
       OUTRA. Atribuí-lo produziria ``lei_11343_2006_art2`` — um id que existe
       no banco, aponta para o artigo errado e não levantaria suspeita.
    """
    if len(alvos) != 1:
        return []
    lei = alvos[0].lei_id

    if len(set(_DIPLOMA.findall(ementa))) > 1:
        return []

    numeros: list[str] = []
    for m in _ARTIGOS.finditer(ementa):
        for n in _NUMERO.findall(m.group(1)):
            # Caixa baixa não é estética: o corpus grava
            # `dl_2848_1940_art359-a`, e um id em maiúscula não casaria com
            # `teses.fundamentos`.
            n = n.lower()
            if n not in numeros:
                numeros.append(n)

    return [f"{lei}_art{n}" for n in numeros]


def so_artigo(dispositivo_id: str) -> str:
    """``lei_11343_2006_art33_p4`` → ``lei_11343_2006_art33``.

    Corta tudo depois do número do artigo em vez de listar os sufixos
    conhecidos: a curadoria usa ``_caput``, ``_p4`` e ``_inc1`` hoje, e uma
    lista fechada perderia em silêncio o sufixo que aparecer amanhã.
    """
    m = re.match(r"^(.*_art\d+(?:-[a-z])?)", dispositivo_id, re.IGNORECASE)
    return m.group(1) if m else dispositivo_id


def depois_do_corte(apresentado_em: str, corte: str) -> bool:
    """Achado anterior à fotografia já está no corpus. Sem data, não se descarta:
    a dúvida não vira exclusão."""
    if not apresentado_em:
        return True
    return apresentado_em[:10] > corte


_VIROU = re.compile(
    r"transformad[oa] em norma|norma juridica|transformad[oa] n[ao] lei"
    r"|convertid[oa] em lei|sancionad[oa]"
)


def virou_norma(situacao: str | None) -> bool:
    """A Câmara escreve "Transformado em Norma Jurídica" e o Senado, "NORMA
    JURÍDICA". Nenhuma das duas APIs tem um booleano para isto."""
    return bool(situacao) and bool(_VIROU.search(sem_acento(situacao or "")))


_LEI = re.compile(
    r"lei\s+(?:ordin[áa]ria\s+|complementar\s+)?n?[ºo°.]*\s*([\d.]+)", re.IGNORECASE
)
_ANO = re.compile(r"\b(?:19|20)\d{2}\b")


def extrai_norma(situacao: str | None) -> str | None:
    """Número da lei resultante, quando o texto da situação o traz.

    Devolve ``None`` quando a fonte não nomeia. Inventar o número seria pior que
    não tê-lo: ele vai para a tela ao lado de um aviso de que a data de corte
    furou.
    """
    if not situacao:
        return None

    m = _LEI.search(situacao)
    if not m:
        return None
    numero = m.group(1).rstrip(".")

    # O ano vem logo depois do número, em duas grafias que as fontes misturam:
    # `15.123/2026` e `15.164 de 14/07/2025`. A janela curta impede pegar um ano
    # de outra frase da mesma situação.
    ano = _ANO.search(situacao[m.end() : m.end() + 30])
    return f"Lei {numero}/{ano.group(0)}" if ano else f"Lei {numero}"
