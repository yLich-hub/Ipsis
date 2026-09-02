"""O filtro do corpus, em Python.

Espelho de ``tests/vigilia.test.ts``. As duas suítes testam a MESMA regra em
runtimes diferentes, e as ementas são as mesmas de propósito: se uma passar e a
outra falhar, a divergência entre os dois filtros ficou visível na hora — que é
exatamente o que ``data/curadoria/vigilia.yaml`` existe para evitar e o que
estes testes existem para provar.

**As ementas são reais**, colhidas das APIs em 13/08/2026. A grafia de ementa
legislativa brasileira tem particularidades ("Decreto-Lei nº 2.848, de 7 de
dezembro de 1940 – Código Penal", com travessão) que ninguém escreveria de
memória, e testar contra texto inventado tranca a impressão que se tem da regra,
não a regra.

    .venv/Scripts/python -m pytest coletores -q
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from coletores.config import carrega
from coletores.filtro import (
    artigos_de,
    depois_do_corte,
    extrai_norma,
    sem_acento,
    so_artigo,
    toca_o_corpus,
    virou_norma,
)

RAIZ = Path(__file__).resolve().parent.parent.parent
CFG = carrega()

# --- o corpus normalizado pode não estar aqui, e isso é decisão do projeto ---
#
# `data/normalizado/*` é ignorado pelo git, com motivo escrito no `.gitignore`:
# são 5,2 MB de saída determinística do `npm run normalize`, e o que se versiona
# é a entrada e as regras, não o resultado. Nem dá para regenerar no runner — o
# PDF do Vade Mecum também é ignorado (`*.pdf`).
#
# A consequência só apareceu quando este pacote ganhou CI: as duas asserções que
# conferem id contra o corpus quebravam no GitHub Actions com `FileNotFoundError`
# e derrubavam a coleta inteira antes de ela começar. **Uma coleta que não roda
# porque um arquivo de teste não existe é o pior tipo de falha**: a tela fica
# dizendo que o corpus está em dia por um motivo que não tem nada a ver com o
# corpus.
#
# Pular é o certo, e pular ALTO é o que impede o silêncio: o pytest imprime o
# motivo, e as outras 33 asserções — que são as do filtro, o que de fato pode
# errar em silêncio — continuam rodando em toda execução. A conferência de id
# contra o corpus continua valendo na máquina de quem tem o corpus, que é onde
# `npm run verificar` roda antes de commitar.
CORPUS = RAIZ / "data" / "normalizado"

exige_corpus = pytest.mark.skipif(
    not (CORPUS / "lei_11343_2006.json").exists(),
    reason=(
        "data/normalizado/ não está neste clone (é saída do `npm run normalize`, "
        "ignorada pelo git). Rode `npm run normalize` para ativar estas asserções."
    ),
)


def ids(ementa: str) -> list[str]:
    return [a.lei_id for a in toca_o_corpus(ementa, CFG)]


# --- ementas reais -----------------------------------------------------------

DUAS_LEIS = (
    "Altera a Lei nº 7.560, de 19 de dezembro de 1986, e a Lei nº 11.343, de 23 de agosto "
    "de 2006, para aperfeiçoar o regime de destinação de bens e valores apreendidos em "
    "crimes relacionados ao tráfico de drogas e conexos."
)

OCULOS = (
    "Estabelece condições, deveres e restrições ao uso de óculos inteligentes com recursos "
    "de inteligência artificial, altera a Lei nº 9.503, de 23 de setembro de 1997 (Código "
    "de Trânsito Brasileiro) e o Decreto-Lei nº 2.848, de 7 de dezembro de 1940 (Código "
    "Penal), e dá outras providências."
)

TRAVESSAO = (
    "Altera o Decreto-Lei nº 2.848, de 7 de dezembro de 1940 - Código Penal, para suspender "
    "a prescrição em caso de fuga do condenado."
)

SEM_NUMERO = (
    "Altera a Lei Antidrogas para dispor sobre a obrigatoriedade da veiculação de campanhas "
    "permanentes de prevenção ao uso de drogas nos meios de comunicação social."
)


class TestOQueEntra:
    def test_lei_de_drogas_com_outra_lei_na_frente(self):
        assert ids(DUAS_LEIS) == ["lei_11343_2006"]

    def test_codigo_penal_em_ementa_que_nao_fala_de_droga(self):
        # Se este teste cair, a rede da Câmara voltou a depender da palavra
        # "droga" e a vigília deixou de ver metade do que altera o CP.
        assert ids(OCULOS) == ["dl_2848_1940"]

    def test_travessao_e_parenteses(self):
        assert ids(TRAVESSAO) == ["dl_2848_1940"]

    def test_apelido_sem_numero(self):
        assert ids(SEM_NUMERO) == ["lei_11343_2006"]

    def test_duas_leis_do_corpus(self):
        r = ids("Altera o Decreto-Lei nº 2.848, de 1940 (Código Penal) e a Lei nº 11.343, de 2006.")
        assert set(r) == {"dl_2848_1940", "lei_11343_2006"}

    def test_cpp_por_nome_e_por_numero(self):
        assert ids("Altera o Código de Processo Penal.") == ["dl_3689_1941"]
        assert ids("Acrescenta artigo ao Decreto-Lei nº 3.689, de 3 de outubro de 1941.") == [
            "dl_3689_1941"
        ]

    @pytest.mark.parametrize(
        "ementa",
        [
            "Acrescenta o art. 33-A à Lei nº 11.343, de 2006.",
            "Revoga o § 4º do art. 33 da Lei nº 11.343, de 2006.",
            "Dá nova redação ao art. 33 da Lei nº 11.343, de 2006.",
            "Inclui inciso no art. 40 da Lei nº 11.343, de 2006.",
        ],
    )
    def test_outros_verbos(self, ementa: str):
        assert ids(ementa) == ["lei_11343_2006"]


class TestOQueFicaDeFora:
    def test_mencao_sem_alteracao(self):
        # Metade das ementas que citam a Lei 11.343 a citam como referência. Se
        # entrassem, a tela diria que a fotografia envelheceu sem nada mudar.
        assert ids("Dispõe sobre prevenção ao uso de drogas, nos termos da Lei nº 11.343, de 2006.") == []

    def test_codigo_penal_militar(self):
        # DL 1.001/1969, fora do banco. Sem a exclusão, todo projeto sobre
        # justiça militar entraria como se mexesse no corpus.
        assert ids("Altera o Código Penal Militar para tipificar nova conduta.") == []
        assert ids("Altera o Código de Processo Penal Militar quanto ao rito ordinário.") == []

    def test_numero_solto_sem_contexto(self):
        assert ids("Altera a dotação orçamentária em R$ 2.848,00 para custeio.") == []

    def test_nao_confunde_2848_com_12848(self):
        assert ids("Altera a Lei nº 12.848, de 2013.") == []

    def test_droga_sem_lei_do_corpus(self):
        assert ids("Institui campanha nacional de prevenção ao uso de drogas nas escolas.") == []


class TestArtigos:
    def test_extrai_lista_e_sufixo_de_letra(self):
        alvos = toca_o_corpus("Altera os arts. 59 e 68 do Decreto-Lei nº 2.848 (Código Penal).", CFG)
        assert artigos_de("Altera os arts. 59 e 68 do Decreto-Lei nº 2.848 (Código Penal).", alvos) == [
            "dl_2848_1940_art59",
            "dl_2848_1940_art68",
        ]

        e = "Altera a redação dos arts. 359-A e 359-B do Decreto-Lei nº 2.848 (Código Penal)."
        assert artigos_de(e, toca_o_corpus(e, CFG)) == [
            "dl_2848_1940_art359-a",
            "dl_2848_1940_art359-b",
        ]

    def test_ignora_paragrafo_e_fica_no_artigo(self):
        e = "Altera o § 4º do art. 33 da Lei nº 11.343, de 23 de agosto de 2006."
        assert artigos_de(e, toca_o_corpus(e, CFG)) == ["lei_11343_2006_art33"]

    @exige_corpus
    def test_id_gerado_existe_no_corpus(self):
        # Mesma trava de `tests/citacao.test.ts`: id que não abre nada é pior
        # que nenhum id. Confere contra `data/normalizado/`, que é o que o seed
        # escreve — sem rede e sem segredo.
        existentes: set[str] = set()
        for alvo in CFG.alvos:
            arq = RAIZ / "data" / "normalizado" / f"{alvo.lei_id}.json"
            existentes |= {a["id"] for a in json.loads(arq.read_text(encoding="utf-8"))["artigos"]}

        for e in [
            "Altera o art. 33 da Lei nº 11.343, de 2006.",
            "Altera os arts. 59 e 68 do Decreto-Lei nº 2.848, de 1940 (Código Penal).",
            "Altera o art. 396-A do Decreto-Lei nº 3.689, de 1941 (Código de Processo Penal).",
        ]:
            gerados = artigos_de(e, toca_o_corpus(e, CFG))
            assert gerados, e
            for i in gerados:
                assert i in existentes, f"{i} não existe no corpus"

    def test_nao_atribui_com_dois_diplomas_numerados(self):
        # O art. 2º é da Lei 7.209, não da Lei de Drogas. `lei_11343_2006_art2`
        # existe no banco e apontaria para o artigo errado.
        e = "Altera o art. 2º da Lei nº 7.209, de 1984, e a Lei nº 11.343, de 2006."
        assert ids(e) == ["lei_11343_2006"]
        assert artigos_de(e, toca_o_corpus(e, CFG)) == []

    def test_nao_atribui_com_duas_leis_do_corpus(self):
        e = "Altera o Decreto-Lei nº 2.848 (Código Penal) e o Decreto-Lei nº 3.689 (CPP), nos arts. 33 e 155."
        assert len(toca_o_corpus(e, CFG)) == 2
        assert artigos_de(e, toca_o_corpus(e, CFG)) == []


class TestApoio:
    def test_so_artigo_cobre_os_sufixos_da_curadoria(self):
        assert so_artigo("lei_11343_2006_art33_p4") == "lei_11343_2006_art33"
        assert so_artigo("lei_11343_2006_art33_caput") == "lei_11343_2006_art33"
        assert so_artigo("lei_11343_2006_art40_inc1") == "lei_11343_2006_art40"
        assert so_artigo("dl_2848_1940_art359-a_caput") == "dl_2848_1940_art359-a"
        assert so_artigo("dl_2848_1940_art59") == "dl_2848_1940_art59"

    @exige_corpus
    def test_todo_fundamento_da_curadoria_reduz_a_artigo_existente(self):
        import re

        existentes: set[str] = set()
        for alvo in CFG.alvos:
            arq = RAIZ / "data" / "normalizado" / f"{alvo.lei_id}.json"
            existentes |= {a["id"] for a in json.loads(arq.read_text(encoding="utf-8"))["artigos"]}

        yaml_teses = (RAIZ / "data" / "curadoria" / "teses.yaml").read_text(encoding="utf-8")
        fundamentos = re.findall(r"^\s+- ((?:lei|dl)_\w[\w-]*)$", yaml_teses, re.MULTILINE)

        assert fundamentos
        for f in fundamentos:
            assert so_artigo(f) in existentes, f"{f} -> {so_artigo(f)}"

    def test_depois_do_corte(self):
        corte = CFG.data_de_corte
        assert depois_do_corte("2024-11-30", corte) is False
        assert depois_do_corte(corte, corte) is False
        assert depois_do_corte("2025-03-01", corte) is True
        # Sem data, a dúvida não vira exclusão.
        assert depois_do_corte("", corte) is True

    def test_virou_norma_nas_duas_grafias(self):
        assert virou_norma("Transformado em Norma Jurídica")
        assert virou_norma("TRANSFORMADA EM NORMA JURÍDICA COM VETO PARCIAL")
        assert not virou_norma("Aguardando Parecer")
        assert not virou_norma(None)

    def test_extrai_norma(self):
        assert extrai_norma("Transformado na Lei Ordinária nº 15.123/2026") == "Lei 15.123/2026"
        assert extrai_norma("Transformada na Lei nº 15.164 de 14/07/2025") == "Lei 15.164/2025"
        # Inventar o número seria pior que não tê-lo: ele vai para a tela ao
        # lado de um aviso de que a data de corte furou.
        assert extrai_norma("TRANSFORMADA EM NORMA JURÍDICA") is None

    def test_sem_acento_bate_com_o_contrato_do_banco(self):
        assert sem_acento("Tráfico Privilegiado") == "trafico privilegiado"
        assert sem_acento("REDAÇÃO") == "redacao"


class TestCuradoria:
    def test_declara_as_tres_leis_do_corpus(self):
        assert sorted(a.lei_id for a in CFG.alvos) == [
            "dl_2848_1940",
            "dl_3689_1941",
            "lei_11343_2006",
        ]

    def test_toda_lei_tem_endereco_no_planalto(self):
        # Sem o endereço, o coletor mais importante dos cinco não roda para
        # aquela lei — e roda para as outras duas, o que faz a falha parecer
        # "nada mudou nessa lei".
        for a in CFG.alvos:
            assert a.planalto.startswith("https://www.planalto.gov.br/"), a.lei_id


# --- o diploma nomeado depois do artigo --------------------------------------

#: O boilerplate que o STJ põe em quase todo tema. Não é matéria penal: é o
#: procedimento do recurso repetitivo, e nomeia o CPC.
RRC = "  RRC de Origem (art. 1030, IV e art. 1036, §1º, do CPC/15).Afetação na sessão."


def test_artigo_de_outro_diploma_nao_e_atribuido():
    """28 ids em 21 dos 72 temas do STJ vinham daqui, medidos em 02/09/2026.

    `1030` e `1036` não têm ponto de milhar, então a trava do diploma NUMERADO
    não os via — e eles viravam `lei_11343_2006_art1030`, id que não existe.
    """
    alvo = [CFG.alvo("lei_11343_2006")]
    ementa = "É vedada a utilização de inquéritos para afastar o art. 33, § 4º, da Lei n. 11.343/06." + RRC
    assert artigos_de(ementa, alvo) == ["lei_11343_2006_art33"]


def test_artigo_do_outro_codigo_do_corpus_tambem_e_recusado():
    """O caso mais sutil, e o único que produzia id de artigo EXISTENTE.

    "nos crimes da Lei n. 11.343/2006, aplica-se o rito do art. 400 do Código de
    Processo Penal" rendia `lei_11343_2006_art400`: o CPP está no corpus, mas o
    artigo é DELE. O id existe, aponta para o artigo errado e não levantaria
    suspeita de ninguém.
    """
    alvo = [CFG.alvo("lei_11343_2006")]
    ementa = (
        "Saber se, nos crimes previstos na Lei n. 11.343/2006, deve ser aplicado o rito "
        "processual do art. 400 do Código de Processo Penal, ou o rito específico "
        "(art. 57 da Lei n. 11.343/2006)."
    )
    assert artigos_de(ementa, alvo) == ["lei_11343_2006_art57"]


def test_vale_o_primeiro_diploma_nomeado_e_nao_qualquer_um():
    """**A precisão que um caso real cobrou.**

    O Tema 991 diz "majorante do art. 157, § 2º, I, do Código Penal" e, cinquenta
    caracteres depois, traz o boilerplate do CPC. Com a regra frouxa — "há CPC na
    janela?" — o art. 157 era descartado, e ele estava certo.
    """
    alvo = [CFG.alvo("dl_2848_1940")]
    ementa = (
        "Se é necessária a apreensão e perícia da arma de fogo para a incidência da "
        "majorante do art. 157, § 2º, I, do Código Penal." + RRC
    )
    assert artigos_de(ementa, alvo) == ["dl_2848_1940_art157"]


def test_sem_diploma_nomeado_o_artigo_continua_sendo_atribuido():
    """Silêncio conta a favor: a trava é para quando a frase DIZ que o artigo é
    de outro lugar, não para quando ela não diz nada."""
    alvo = [CFG.alvo("lei_11343_2006")]
    assert artigos_de("Altera a Lei nº 11.343 para modificar o art. 33.", alvo) == [
        "lei_11343_2006_art33"
    ]
