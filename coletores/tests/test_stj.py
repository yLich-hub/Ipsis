"""O recorte dos precedentes qualificados do STJ.

Offline: as linhas de exemplo reproduzem o `Temas.csv` real, com as
particularidades que ele de fato tem — quebra de linha dentro da tese firmada,
`situacao` em vocabulário próprio do STJ, e campos vazios em quase todo lugar.

O que estes testes trancam é o **recorte**, que é a peça que pode errar em
silêncio: um filtro largo demais enche a tela de temas sobre homicídio e roubo;
um estreito demais perde a compensação da confissão com a reincidência, que é
dosimetria e vale para qualquer defesa, inclusive a de tráfico.

    .venv/Scripts/python -m pytest coletores -q
"""

from __future__ import annotations

import csv
import io
import json
import re

import pytest

from pathlib import Path

from coletores import stj
from coletores.config import carrega as carrega_vigilia

RAIZ = Path(__file__).resolve().parent.parent.parent
CFG = stj.curadoria()


def tema(**campos: str) -> dict[str, str]:
    """Uma linha do CSV, com os campos que o filtro lê."""
    base = {
        "sequencialPrecedente": "1",
        "tipoPrecedente": "Tema Repetitivo",
        "numeroPrecedente": "1",
        "situacao": "Trânsito em Julgado",
        "teseFirmada": "",
        "questaoSubmetidaAJulgamento": "",
        "referenciaLegislativa": "",
        "anotacoesNUGEPNAC": "",
        "delimitacaoJulgado": "",
        "entendimentoAnterior": "",
        "informacoesComplementares": "",
        "referenciaSumular": "",
        "sumulaOriginada": "",
        "dataJulgamento": "",
        "dataPublicacaoAcordao": "",
        "dataPrimeiraAfetacao": "",
    }
    return base | campos


def recorta(linhas: list[dict[str, str]]):
    """Roda só o filtro, sem rede: injeta as linhas no lugar do download."""
    original = stj.baixa_temas
    stj.baixa_temas = lambda _s, _c: linhas  # type: ignore[assignment]
    try:
        return stj.colhe(None, CFG)  # type: ignore[arg-type]
    finally:
        stj.baixa_temas = original  # type: ignore[assignment]


class TestOQueEntra:
    def test_tema_sobre_a_lei_de_drogas(self):
        c = recorta([tema(teseFirmada="É cabível a aplicação retroativa da Lei n. 11.343/2006.")])
        assert len(c.precedentes) == 1
        assert c.precedentes[0].escopo == "drogas"

    def test_parte_geral_do_cp_entra_porque_vale_para_o_tráfico(self):
        # Tema 585 real: compensação da confissão com a reincidência. É segunda
        # fase da dosimetria e serve a qualquer defesa — inclusive a de tráfico.
        c = recorta(
            [
                tema(
                    teseFirmada=(
                        "É possível, na segunda fase da dosimetria, a compensação integral da "
                        "atenuante da confissão espontânea, do art. 65 do Código Penal, com a "
                        "agravante da reincidência."
                    )
                )
            ]
        )
        assert len(c.precedentes) == 1
        assert c.precedentes[0].escopo == "parte_geral"

    def test_parte_especial_entra_pelos_institutos_acolhidos(self):
        # A tese que este projeto precisa: perícia da arma para a majorante do
        # § 2º do art. 157 — exatamente o caso de roubo que está em casos.yaml.
        c = recorta(
            [tema(teseFirmada="Perícia da arma para a majorante do art. 157, § 2º, do Código Penal.")]
        )
        assert len(c.precedentes) == 1
        assert c.precedentes[0].escopo == "parte_especial"

    def test_dosimetria_aplicada_a_roubo_conta_como_parte_geral(self):
        # A ordem das cláusulas no coletor é decisão: uma tese sobre o art. 68
        # aplicado ao art. 157 é, antes de tudo, dosimetria — e é como
        # dosimetria que ela serve a qualquer defesa, não só à de roubo.
        c = recorta(
            [tema(teseFirmada="O art. 68 do Código Penal na dosimetria do art. 157.")]
        )
        assert c.precedentes[0].escopo == "parte_geral"

    def test_apelido_da_lei_sem_numero(self):
        c = recorta([tema(questaoSubmetidaAJulgamento="Discute-se o alcance da Lei de Drogas.")])
        assert len(c.precedentes) == 1

    def test_le_a_situacao_como_o_stj_a_escreve(self):
        # É o campo que justifica esta fonte existir. Se ele se perder, a tela
        # passa a mostrar entendimento morto como se valesse.
        c = recorta([tema(situacao="Cancelada", teseFirmada="Tese sobre tráfico de drogas.")])
        assert c.precedentes[0].situacao == "Cancelada"


class TestOQueFicaDeFora:
    def test_crime_fora_do_recorte_nao_entra(self):
        # Homicídio, estelionato e receptação são parte especial e nenhuma tese
        # deste projeto os alcança — encheriam a tela sem sustentar nada.
        c = recorta(
            [
                tema(teseFirmada="Qualificadora do art. 121, § 2º, I, do Código Penal, na pronúncia."),
                tema(teseFirmada="O art. 171 do Código Penal e a representação da vítima."),
                tema(teseFirmada="Receptação qualificada do art. 180, § 1º, do Código Penal."),
            ]
        )
        assert c.precedentes == []

    def test_artigo_da_parte_geral_sem_mencionar_o_codigo_penal(self):
        # "art. 65" sozinho pode ser de qualquer lei. Sem a menção ao Código
        # Penal, não se atribui — mesma cautela do filtro da vigília.
        c = recorta([tema(teseFirmada="O art. 65 da Lei n. 9.099/1995 admite transação.")])
        assert c.precedentes == []

    def test_codigo_penal_militar_nao_conta(self):
        # DL 1.001/1969, fora do banco — a mesma exclusão da vigília.
        c = recorta([tema(teseFirmada="O art. 59 do Código Penal Militar aplica-se ao caso.")])
        assert c.precedentes == []

    def test_tema_de_outro_ramo(self):
        c = recorta([tema(teseFirmada="Os juros de mora nas condenações impostas à Fazenda Pública.")])
        assert c.precedentes == []


class TestFormato:
    def test_id_estavel_pelo_sequencial(self):
        # Tipo e número mudam quando o tema muda de natureza jurídica; o
        # sequencial é a chave do banco do STJ e sobrevive. Se o id passar a
        # sair de tipo+número, o upsert duplica a cada reclassificação.
        c = recorta([tema(sequencialPrecedente="4062", teseFirmada="Tráfico de drogas.")])
        assert c.precedentes[0].id == "stj:4062"

    def test_data_brasileira_vira_iso(self):
        c = recorta([tema(teseFirmada="Tráfico de drogas.", dataJulgamento="18/8/2021")])
        assert c.precedentes[0].julgado_em == "2021-08-18"

    def test_data_ilegivel_vira_ausencia_e_nao_palpite(self):
        c = recorta([tema(teseFirmada="Tráfico de drogas.", dataJulgamento="sem data")])
        assert c.precedentes[0].julgado_em is None

    def test_colapsa_o_espaco_do_csv(self):
        # A tese firmada vem com quebra de linha e espaço duplo no arquivo real.
        c = recorta([tema(teseFirmada="Tráfico de drogas\n\n   e condutas    afins.")])
        assert c.precedentes[0].tese_firmada == "Tráfico de drogas e condutas afins."

    def test_vincula_ao_artigo_do_corpus_quando_da(self):
        c = recorta(
            [tema(teseFirmada="Vedado usar inquéritos para afastar o art. 33 da Lei n. 11.343/2006.")]
        )
        assert "lei_11343_2006_art33" in c.precedentes[0].artigos_tocados

    def test_o_bom_do_csv_com_bom_e_quebra_de_linha_na_celula(self):
        # `utf-8-sig` come o BOM; sem isso a primeira coluna nasce com `﻿`
        # grudado e o DictReader nunca a encontra. E a tese firmada do STJ tem
        # quebra de linha dentro da célula, que o csv precisa respeitar.
        bruto = (
            "﻿sequencialPrecedente,tipoPrecedente,situacao,teseFirmada\r\n"
            '9,"Tema Repetitivo","Cancelada","Linha um\nlinha dois"\r\n'
        ).encode("utf-8")
        linhas = list(csv.DictReader(io.StringIO(bruto.decode("utf-8-sig"))))
        assert linhas[0]["sequencialPrecedente"] == "9"
        assert "\n" in linhas[0]["teseFirmada"]


class TestCuradoria:
    def test_a_lista_da_parte_geral_e_fechada(self):
        # Aceitar qualquer artigo do CP traria 53 temas a mais sobre crimes
        # fora do recorte. A lista é decisão de produto, e mexer nela tem de ser
        # deliberado.
        geral = set(CFG["parte_geral_cp"])
        assert 68 in geral, "o critério trifásico é o coração da dosimetria"
        assert 65 in geral, "a confissão espontânea aparece em quase toda defesa"
        assert 121 not in geral, "homicídio é parte especial e está fora do recorte"
        assert 157 not in geral, "roubo não é parte geral — ele entra pela outra lista"

    def test_a_parte_especial_espelha_os_institutos_acolhidos(self):
        # A lista existe porque roubo majorado e a vulnerabilidade do art. 217-A
        # entraram no projeto por pedido explícito, com rubrica e tese. Ela é
        # fechada pelo mesmo motivo da parte geral: aceitar qualquer artigo
        # traria homicídio e estelionato, que nenhuma tese alcança.
        especial = set(CFG["parte_especial_cp"])
        assert 157 in especial, "roubo majorado tem rubrica curada, caso e tese"
        assert 217 in especial, "captura o art. 217-A — estupro de vulnerável"
        assert 121 not in especial, "homicídio continua fora"
        assert 171 not in especial, "estelionato continua fora"
        # Nenhum artigo em duas listas: o escopo do tema ficaria indefinido, e a
        # ordem das cláusulas no coletor decidiria em silêncio.
        assert not (especial & set(CFG["parte_geral_cp"])), "artigo em duas listas"

    def test_situacoes_de_alerta_cobrem_o_que_nao_vale(self):
        alerta = {s.lower() for s in CFG["situacoes_de_alerta"]}
        assert "cancelada" in alerta
        assert "sobrestado" in alerta


class TestMudancaDeSituacao:
    """O que fecha o ciclo: um tema que deixa de valer tem de virar aviso."""

    def prec(self, situacao: str, **extra):
        c = recorta([tema(situacao=situacao, teseFirmada="Tráfico de drogas.", **extra)])
        return c.precedentes[0]

    def test_tema_novo_nao_gera_aviso(self):
        # Ele não mudou de nada. "Situação alterada de nada para trânsito em
        # julgado" seria ruído numa tela que existe para destacar o que importa.
        p = self.prec("Trânsito em Julgado")
        assert stj.mudancas([p], antes={}) == []

    def test_situacao_igual_nao_gera_aviso(self):
        p = self.prec("Trânsito em Julgado")
        assert stj.mudancas([p], antes={p.id: "Trânsito em Julgado"}) == []

    def test_deixar_de_ser_citavel_avisa_que_saiu_do_chat(self):
        # O caso que justifica tudo. Enquanto o tema está em trânsito em
        # julgado ele é afirmado no chat com selo verde; no dia em que for
        # cancelado, tem de sair — e alguém tem de saber que saiu.
        p = self.prec("Cancelada")
        m = stj.mudancas([p], antes={p.id: "Trânsito em Julgado"})
        assert len(m) == 1
        assert "SAIU do contexto do chat" in m[0].ementa
        assert "Trânsito em Julgado" in m[0].ementa and "Cancelada" in m[0].ementa

    def test_virar_citavel_tambem_avisa(self):
        p = self.prec("Trânsito em Julgado")
        m = stj.mudancas([p], antes={p.id: "Sobrestado"})
        assert "ENTROU no contexto do chat" in m[0].ementa

    def test_mudanca_entre_duas_nao_citaveis(self):
        p = self.prec("Cancelada")
        m = stj.mudancas([p], antes={p.id: "Afetado"})
        assert "Segue fora do contexto" in m[0].ementa

    def test_o_achado_cabe_em_vigilia_alteracoes(self):
        # `leis_tocadas` é `cardinality > 0` no banco (migration 0012). Um
        # achado sem lei seria recusado pelo Postgres no meio da coleta.
        p = self.prec("Cancelada")
        linha = stj.mudancas([p], antes={p.id: "Trânsito em Julgado"})[0].linha()
        assert linha["leis_tocadas"], "sem lei o insert é recusado pelo check do banco"
        assert linha["virou_norma"] is False, "precedente não é norma publicada"
        assert len(linha["identificacao"]) <= 80

    def test_id_carrega_a_situacao_nova(self):
        # Cada transição é um fato próprio e fica no histórico. Sem a situação
        # no id, uma segunda mudança sobrescreveria o registro da primeira.
        p = self.prec("Cancelada")
        m = stj.mudancas([p], antes={p.id: "Trânsito em Julgado"})
        assert m[0].id.endswith(":cancelada")
        assert m[0].id.startswith("stj-mudanca:")

    def test_citavel_espelha_o_lado_typescript(self):
        # Se divergir de `CITAVEL` em `src/lib/vigilia/precedentes.ts`, a vigília
        # avisa sobre mudança que o chat não sofreu — ou cala sobre uma que sofreu.
        ts = (RAIZ / "src" / "lib" / "vigilia" / "precedentes.ts").read_text(encoding="utf-8")
        assert f"const CITAVEL = '{stj.CITAVEL}'" in ts


# --- vínculo curado ----------------------------------------------------------
#
# Seis dos dezoito temas citáveis não tinham artigo e eram inalcançáveis pelo
# grafo: apareciam na tela e nunca no chat. O conserto foi curadoria manual, e o
# que precisa de trava é justamente ela — um id errado aqui não quebra nada
# visivelmente, só faz o precedente entrar na resposta de outra pergunta.

VINCULOS = CFG.get("vinculos") or {}

exige_corpus = pytest.mark.skipif(
    not (RAIZ / "data" / "normalizado" / "lei_11343_2006.json").exists(),
    reason=(
        "data/normalizado/ não está neste clone (é saída do `npm run normalize`, "
        "ignorada pelo git). Rode `npm run normalize` para ativar esta asserção."
    ),
)


def test_todo_vinculo_tem_artigos_e_motivo():
    assert VINCULOS, "a curadoria de vínculos sumiu — seis temas voltam a ficar fora do chat"
    for chave, v in VINCULOS.items():
        assert chave.startswith("stj:"), f"{chave}: a chave é o id do precedente, como no banco"
        assert v.get("artigos"), f"{chave}: vínculo sem artigo não vincula nada"
        # O `porque` não é ornamento: é o que permite conferir a escolha depois,
        # e cada linha aqui é uma decisão de leitura da tese.
        assert v.get("porque", "").strip(), f"{chave}: vínculo sem justificativa escrita"


def test_o_id_do_vinculo_tem_a_forma_de_artigo_do_corpus():
    """Id de DISPOSITIVO (`..._art33_p4`) passaria despercebido e nunca casaria:
    `artigos_tocados` é comparado com artigo, não com dispositivo."""
    for chave, v in VINCULOS.items():
        for a in v["artigos"]:
            assert re.fullmatch(
                r"(lei_11343_2006|dl_2848_1940|dl_3689_1941)_art\d{1,4}(-[a-z])*", a
            ), f"{chave}: {a} não tem a forma de id de artigo do corpus"


@exige_corpus
def test_todo_artigo_curado_existe_no_corpus():
    existentes: set[str] = set()
    for lei in ("lei_11343_2006", "dl_2848_1940", "dl_3689_1941"):
        arq = RAIZ / "data" / "normalizado" / f"{lei}.json"
        if arq.exists():
            existentes |= {a["id"] for a in json.loads(arq.read_text(encoding="utf-8"))["artigos"]}

    for chave, v in VINCULOS.items():
        for a in v["artigos"]:
            assert a in existentes, f"{chave}: {a} não existe no corpus"


def test_o_vinculo_curado_vence_a_extracao_automatica():
    """O tema que o extrator resolveria de um jeito e a curadoria de outro fica
    com o da curadoria — quem leu a tese inteira foi ela."""
    chave = next(iter(VINCULOS))
    linha = tema(
        sequencialPrecedente=chave.split(":")[1],
        teseFirmada="Tráfico de drogas: aplica-se o art. 59 da Lei n. 11.343/2006.",
    )
    p = stj.colhe.__globals__["_para_precedente"](
        linha, "drogas", linha["teseFirmada"], carrega_vigilia().alvos, CFG
    )
    assert p.artigos_tocados == VINCULOS[chave]["artigos"]
