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

#: Quantos caracteres depois de "art. N" se olha para achar o diploma. Trinta
#: cobririam ", § 4.º, da Lei n. 11.343/2006" com folga; oitenta ainda pegam
#: "art. 1030, IV e art. 1036, §1º, do CPC/15" a partir do primeiro artigo.
JANELA_DIPLOMA = 80


def _de_outro_diploma(janela: str, lei_alvo: str, cfg: Config) -> bool:
    """A janela depois de um artigo nomeia um diploma que NÃO é o alvo?

    **Vale o PRIMEIRO diploma nomeado, não qualquer um na janela** — e essa
    precisão foi cobrada por um caso real. O Tema 991 diz "majorante do art.
    157, § 2º, I, do Código Penal" e, cinquenta caracteres depois, traz o
    boilerplate "RRC de Origem (… do CPC/15)". Com a regra frouxa — "há CPC na
    janela?" — o art. 157 era descartado, e ele estava certo.

    Devolve ``False`` quando nenhum diploma é nomeado: silêncio conta a favor de
    atribuir, que é o comportamento que esta função preserva.
    """
    def primeiro(padrao) -> int:
        m = padrao.search(janela)
        return m.start() if m else len(janela) + 1

    do_alvo = next((a for a in cfg.alvos if a.lei_id == lei_alvo), None)
    inicio_alvo = primeiro(do_alvo.reconhece) if do_alvo else len(janela) + 1

    inicio_outro = primeiro(cfg.outros_diplomas)
    for a in cfg.alvos:
        if a.lei_id != lei_alvo:
            inicio_outro = min(inicio_outro, primeiro(a.reconhece))

    # Nenhum dos dois apareceu: atribui.
    if inicio_alvo > len(janela) and inicio_outro > len(janela):
        return False

    return inicio_outro < inicio_alvo



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

    cfg = carrega()
    t = sem_acento(ementa)

    numeros: list[str] = []
    for m in _ARTIGOS.finditer(ementa):
        # **Terceira trava, por ARTIGO e não pela ementa inteira.** As duas
        # anteriores olham o texto todo; esta olha o que vem logo DEPOIS de cada
        # `art. N` e pergunta de que diploma ele é.
        #
        # Nasceu de um boilerplate do STJ: quase todo tema traz "RRC de Origem
        # (art. 1030, IV e art. 1036, §1º, do CPC/15)", e como `1030` e `1036`
        # não têm ponto de milhar, a trava do diploma NUMERADO não os via —
        # 28 ids em 21 dos 72 temas, medidos em 02/09/2026.
        #
        # E pega o caso mais sutil, que nenhuma das outras pegava: "nos crimes
        # da Lei n. 11.343/2006, aplica-se o rito do art. 400 do Código de
        # Processo Penal". O CPP está no corpus, o artigo é DELE, e atribuí-lo
        # à Lei de Drogas produzia `lei_11343_2006_art400` — id que existe,
        # aponta para o artigo errado e não levanta suspeita de ninguém.
        #
        # Silêncio conta a favor: sem diploma nomeado na janela, atribui-se ao
        # alvo, como sempre se fez. A trava é para quando a frase DIZ que o
        # artigo é de outro lugar.
        janela = t[m.end() : m.end() + JANELA_DIPLOMA]
        if _de_outro_diploma(janela, lei, cfg):
            continue

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
