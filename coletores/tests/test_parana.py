"""O recorte e o extrator do acervo de decretos do Paraná.

Offline, sem rede e sem segredo, como as outras quatro suítes deste pacote.

Duas metades, e elas testam coisas diferentes:

- **o recorte**, contra as 326 súmulas reais de janeiro/2025 guardadas em
  ``amostras/decretos_pr_2025_01.json``. É a peça que pode errar em silêncio:
  um recorte frouxo enche o acervo de nomeação e um recorte apertado deixa de
  fora a norma que o usuário procura, e nos dois casos nada quebra.
- **o extrator**, contra HTML que reproduz o fonte real, com as cinco
  armadilhas que estão anotadas no cabeçalho de ``coletores/parana.py``. Não é
  HTML idealizado: ``<strike>``, ``<br />``, súmula com ``<div>`` dentro e
  rótulo vazio são o que a fonte de fato serve.

**Os nomes de pessoa da amostra estão mascarados como ``[NOME]``.** As súmulas
são públicas e vêm do Diário Oficial, mas versionar uma lista de servidores
nomeados e exonerados neste repositório seria fazer, em miniatura, exatamente o
que o recorte existe para evitar. A máscara não altera o que se mede: o recorte
casa o começo da súmula, e o nome nunca está lá.
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from pathlib import Path

import pytest

from coletores.parana import (
    Decreto,
    Resumo,
    carrega,
    deduplica,
    extrai,
    no_recorte,
    resumos,
    sem_acento,
    texto_de,
    total_de,
)

AMOSTRAS = Path(__file__).resolve().parent / "amostras"
CFG = carrega()


# --- o recorte ---------------------------------------------------------------


@pytest.fixture(scope="module")
def amostra() -> list[dict]:
    arq = AMOSTRAS / "decretos_pr_2025_01.json"
    return json.loads(arq.read_text(encoding="utf-8"))


def test_amostra_tem_o_mes_inteiro(amostra):
    """326 é o total que a própria fonte declara para janeiro/2025 — as sete
    páginas, não a primeira."""
    assert len(amostra) == CFG.amostra["total"] == 326


def test_recorte_bate_com_a_curadoria(amostra):
    """O número que o YAML afirma é o número que o código produz.

    Mudar um padrão sem mexer no bloco `amostra` derruba isto, que é o ponto:
    o recorte não muda em silêncio.
    """
    entram = [x for x in amostra if no_recorte(x["sumula"], CFG)]
    assert len(entram) == CFG.amostra["entram"] == 20


def test_nenhuma_sumula_fica_sem_padrao(amostra):
    """Toda súmula da amostra casa `entra` ou `sai`.

    É a asserção mais forte da suíte, e não é estatística: súmula que não casa
    nada é espécie de ato que a curadoria não conhece. Enquanto este número for
    zero, o recorte é uma decisão sobre dado real — deixando de ser, virou
    peneira com buraco no meio.
    """
    orfas = [
        x["sumula"]
        for x in amostra
        if not CFG.recorte.entra.search(sem_acento(texto_de(x["sumula"])))
        and not CFG.recorte.sai.search(sem_acento(texto_de(x["sumula"])))
    ]
    assert orfas == [], f"{len(orfas)} súmula(s) sem padrão: {orfas[:3]}"
    assert CFG.amostra["sem_padrao"] == 0


def test_ato_de_pessoal_nunca_entra(amostra):
    """Nenhuma das quatro espécies de pessoal passa, em nenhuma redação.

    A que fundou o teste é `nomeia`: a fonte escreve "Nomeação de FULANO" e
    "Nomeia representante para compor o Conselho", e `^nomea` não casa a
    segunda. Sete atos de pessoal passaram pelo recorte na primeira medição por
    causa disso.
    """
    pessoal = re.compile(r"^(nomea|nomeia|exonera|designa|demissao)")
    vazados = [
        x["sumula"]
        for x in amostra
        if pessoal.search(sem_acento(texto_de(x["sumula"]))) and no_recorte(x["sumula"], CFG)
    ]
    assert vazados == [], f"ato de pessoal no recorte: {vazados[:3]}"


def test_homologacao_de_emergencia_fica_de_fora():
    """São 493 dos 1.989 — um quarto do acervo — e todos dizem a mesma coisa:
    emergência num município por enxurrada, vendaval ou estiagem.

    Saíram por espaço medido, não por gosto: `decretos_pr_blocos` chegou a 703 MB
    dos 827 MB do projeto, e o plano gratuito do Supabase para em 500 MB. Eles são
    normativos e não servem à advocacia criminal — foi o primeiro corte a fazer.
    """
    assert not no_recorte(
        "Homologa situação de emergência no Município de Tibagi, em face da ocorrência de Enxurradas.",
        CFG,
    )
    # E o que é norma de verdade continua entrando.
    assert no_recorte("Regulamenta a alteração do regime de trabalho dos professores.", CFG)


def test_sai_vence_entra():
    """"Autoriza a abertura de crédito" abre com verbo normativo e é
    movimentação orçamentária. A precedência é o que resolve, e ela é a razão
    de `sai` existir separado em vez de `entra` ser mais estreito."""
    assert no_recorte("Autoriza o funcionamento do Curso de Graduação em Psicologia.", CFG)
    assert not no_recorte("Autoriza a abertura de Crédito Suplementar ao Orçamento.", CFG)


def test_recorte_le_a_sumula_com_html():
    """Armadilha 3: três das 326 súmulas vêm com marcação dentro. Sem limpar,
    `^altera` não encontra nada numa string que começa por `<div`."""
    crua = '<div style="text-align: justify;">Altera a Resolução SEAP 16402, de 2022.</div>'
    assert no_recorte(crua, CFG)


def test_retificacao_fica_de_fora():
    """Redundante por construção: o acervo lê a versão compilada do decreto
    retificado, que já traz a correção aplicada."""
    assert not no_recorte("Retifica o Decreto nº 8.768, de 27 de janeiro de 2025.", CFG)


# --- o extrator --------------------------------------------------------------

# Reproduz o fonte real da página de impressão, com as armadilhas 2, 4 e 5.
ATO = """<html><head><style>
strike .tbato { text-decoration: line-through; }
</style></head><body>
<h3>Decreto 8812 - 31 de Janeiro de 2025</h3>
<br>
Publicado no <a href='javascript:void(0);'>Di&aacute;rio Oficial n&ordm;. 11835</a> de 31 de Janeiro de 2025
<p>
  <b class="labelAto">S&uacute;mula:</b>
  <a id='2221696'>Regulamenta o regime de trabalho dos professores.</a>
</p>
<p>
  <b class="labelAto"></b>
  <a id='2221697'>O GOVERNADOR DO ESTADO DO PARAN&Aacute;, no uso da atribui&ccedil;&atilde;o que lhe confere o inciso V do art. 87,<br />&nbsp;<br />DECRETA:</a>
</p>
<p>
  <b class="labelAto">Art. 1&ordm;</b>
  <a id='2221698'>Cargo em comiss&atilde;o da Ag&ecirc;ncia<br />Reguladora de Servi&ccedil;os P&uacute;blicos.</a>
</p>
<p>
  <b class="labelAto">&sect;1&ordm;</b>
  <a id='2221699'>O professor dever&aacute; possuir licenciatura plena.<strike class="tbato"> Reda&ccedil;&atilde;o revogada que continua no HTML.</strike></a>
</p>
<p>
  <b class="labelAto"></b>
  <a id='2221700'>Curitiba, em 31 de janeiro de 2025.</a>
</p>
</body></html>"""

RESUMO = Resumo(
    cod_ato="351933",
    epigrafe="Decreto 8812 - 31 de Janeiro de 2025",
    sumula="Regulamenta o regime de trabalho dos professores.",
    publicado_em="31/01/2025",
)


@pytest.fixture(scope="module")
def decreto():
    return extrai(ATO, RESUMO, CFG, hoje=date(2026, 8, 21).isoformat())


def test_identificacao(decreto):
    assert decreto.id == "decpr:2025:8812"
    assert decreto.numero == "8812"
    assert decreto.ano == 2025
    assert decreto.publicado_em == "2025-01-31"
    assert decreto.diario == "11835"
    assert decreto.versao == "compilado"
    assert decreto.conferido_em == "2026-08-21"


def test_id_nunca_casa_o_padrao_do_corpus(decreto):
    """A separação estrutural que impede um decreto estadual de virar fundamento
    de peça. `dispositivos.id` é `lei_11343_2006_art33_p4`; este é outro espaço,
    e nenhum dos dois padrões alcança o outro."""
    assert decreto.id.startswith("decpr:")
    assert not re.match(r"^[a-z]+_\d+_\d{4}(_art|$)", decreto.id)
    for b in decreto.blocos:
        assert b.id.startswith("decpr:")


def test_preambulo_nao_vira_dispositivo(decreto):
    """Armadilha 5: o bloco de rótulo vazio antes do primeiro `Art.` é a fórmula
    de promulgação. Tratá-lo como dispositivo poria "DECRETA:" no meio dos
    artigos — e ele seria embutido e recuperável como se fosse norma."""
    assert "DECRETA:" in decreto.preambulo
    assert decreto.blocos[0].rotulo == "Art. 1º"
    assert all("GOVERNADOR" not in b.texto for b in decreto.blocos)


def test_quebra_de_linha_nao_cola_palavras(decreto):
    """Armadilha 4: `<br />` separa frases dentro do bloco. Removido junto com
    as outras tags, gruda "Agência" em "Reguladora"."""
    art1 = decreto.blocos[0].texto
    assert "AgênciaReguladora" not in art1
    assert "Agência\nReguladora" in art1 or "Agência Reguladora" in art1


def test_texto_revogado_nao_entra(decreto):
    """Armadilha 2: `<strike>` guarda a redação revogada, e ela continua no
    HTML. Sem derrubá-la antes da leitura, duas redações se emendam numa frase
    e o acervo passa a transcrever o que não vale mais."""
    p1 = next(b for b in decreto.blocos if b.rotulo.startswith("§"))
    assert "licenciatura plena" in p1.texto
    assert "revogada" not in p1.texto.lower()


def test_entidades_viram_texto(decreto):
    assert "PARANÁ" in decreto.preambulo
    assert decreto.blocos[1].rotulo == "§1º"


def test_fecho_continua_no_acervo(decreto):
    """O bloco de assinatura tem rótulo vazio como o preâmbulo, mas vem DEPOIS
    do primeiro artigo — e é parte do ato publicado."""
    assert decreto.blocos[-1].rotulo == ""
    assert "Curitiba" in decreto.blocos[-1].texto


def test_ordem_e_ids_dos_blocos(decreto):
    assert [b.ordem for b in decreto.blocos] == list(range(1, len(decreto.blocos) + 1))
    assert decreto.blocos[0].id == "decpr:2025:8812:1"
    assert len({b.id for b in decreto.blocos}) == len(decreto.blocos)


# --- a listagem --------------------------------------------------------------

LISTAGEM = """
<div width="100%" align="right"><i>326 registro(s) listado(s)</i></div>
<table id="list_tabela">
<tr>
<td><a href="JavaScript:exibir('/legislacao/listarAtosAno.do?action=exibir&codAto=351933&indice=1');"><img/></a></td>
<td><div id="351933_epigrafeAto">Decreto 8812 - 31 de Janeiro de 2025</div></td>
<td><div id="351933_descricaoItemAto">Regulamenta a altera&ccedil;&atilde;o do regime de trabalho.</div></td>
<td><div id="351933_dataPublicacao">31/01/2025</div></td>
</tr>
<tr>
<td><a href="JavaScript:exibir('/legislacao/listarAtosAno.do?action=exibir&codAto=351931&indice=1');"><img/></a></td>
<td><div id="351931_epigrafeAto">Decreto 8810 - 31 de Janeiro de 2025</div></td>
<td><div id="351931_descricaoItemAto">Exonera&ccedil;&atilde;o de [NOME], de cargo em comiss&atilde;o.</div></td>
<td><div id="351931_dataPublicacao">31/01/2025</div></td>
</tr>
</table>
"""


def test_listagem_le_as_quatro_colunas():
    linhas = resumos(LISTAGEM)
    assert [x.cod_ato for x in linhas] == ["351933", "351931"]
    assert linhas[0].epigrafe == "Decreto 8812 - 31 de Janeiro de 2025"
    assert linhas[0].sumula == "Regulamenta a alteração do regime de trabalho."
    assert linhas[0].publicado_em == "31/01/2025"


def test_listagem_le_o_total_para_paginar():
    """O total é o que diz quantas páginas buscar. Lido errado, a coleta pega a
    primeira página do mês e segue como se fosse o mês inteiro."""
    assert total_de(LISTAGEM) == 326
    assert total_de("<html>sem tabela</html>") == 0


def test_recorte_separa_as_duas_linhas():
    dentro = [x for x in resumos(LISTAGEM) if no_recorte(x.sumula, CFG)]
    assert [x.cod_ato for x in dentro] == ["351933"]


# --- texto -------------------------------------------------------------------


def test_sem_acento_tem_o_contrato_do_banco():
    assert sem_acento("Exoneração") == "exoneracao"
    assert sem_acento("ÓRGÃO") == "orgao"


def test_texto_de_normaliza_espaco_sem_perder_paragrafo():
    assert texto_de("<p>a<br /><br />b</p>") == "a\n\nb"
    assert texto_de("um&nbsp;&nbsp;dois") == "um dois"
    assert texto_de("") == ""


# --- republicação ------------------------------------------------------------


def _ato(numero: str, cod: str, publicado: str) -> Decreto:
    return Decreto(
        id=f"decpr:2023:{numero}",
        numero=numero,
        ano=2023,
        epigrafe=f"Decreto {numero} - 27 de Julho de 2023",
        sumula="Regulamenta a Lei nº 12.248, de 31 de julho de 1998.",
        preambulo="",
        publicado_em=publicado,
        diario=None,
        cod_ato=cod,
        url=f"https://www.legislacao.pr.gov.br/x?codAto={cod}",
        versao="compilado",
        conferido_em="2026-08-21",
        blocos=[],
    )


def test_republicacao_fica_com_a_mais_recente():
    """O par real do Decreto 2.914/2023: publicado em 27/07 e republicado em
    28/07, com `codAto` diferente e a mesma epígrafe.

    Sem isto, o seed faria upsert de um sobre o outro e a ORDEM DO ARQUIVO
    decidiria qual texto fica — metade das vezes a publicação superada, sem
    erro nenhum.
    """
    original = _ato("2914", "301964", "2023-07-27")
    republicado = _ato("2914", "302314", "2023-07-28")

    unicos, trocados = deduplica([original, republicado])
    assert len(unicos) == 1
    assert unicos[0].cod_ato == "302314"
    assert len(trocados) == 1

    # E a ordem de entrada não pode decidir nada.
    unicos2, _ = deduplica([republicado, original])
    assert unicos2[0].cod_ato == "302314"


def test_sem_republicacao_nada_e_descartado():
    a, b = _ato("2914", "301964", "2023-07-27"), _ato("2915", "301965", "2023-07-27")
    unicos, trocados = deduplica([a, b])
    assert len(unicos) == 2
    assert trocados == []


def test_o_descarte_e_relatado():
    """Descartar em silêncio é o que a função existe para impedir: o relato vai
    para o arquivo do ano, em `republicados`."""
    _, trocados = deduplica(
        [_ato("2914", "301964", "2023-07-27"), _ato("2914", "302314", "2023-07-28")]
    )
    assert "decpr:2023:2914" in trocados[0]
    assert "302314" in trocados[0]


def test_preambulo_rotulado_errado_pela_fonte():
    """O Decreto 12.438/2022: a fonte deu `Art. 1º` ao PREÂMBULO, e o artigo
    verdadeiro veio abaixo com o mesmo rótulo.

    É um ato em 1.989, e o modo de falha justifica a regra: sem ela a fórmula de
    promulgação vira dispositivo, ganha vetor e passa a ser recuperável — um
    decreto que "responde" a qualquer pergunta sobre o Governador do Paraná.
    """
    html = """<html><body>
<h3>Decreto 12438 - 18 de Outubro de 2022</h3>
<p><b class="labelAto">S&uacute;mula:</b><a>Introduz alterações no Regulamento do ICMS.</a></p>
<p><b class="labelAto">Art. 1&ordm;</b><a>O GOVERNADOR DO ESTADO DO PARAN&Aacute;, no uso de suas atribui&ccedil;&otilde;es, DECRETA:</a></p>
<p><b class="labelAto">Art. 1&ordm;</b><a>Ficam introduzidas no Regulamento do ICMS as altera&ccedil;&otilde;es seguintes.</a></p>
<p><b class="labelAto">Art. 2&ordm;</b><a>Este Decreto entra em vigor na data da sua publica&ccedil;&atilde;o.</a></p>
</body></html>"""
    r = Resumo(
        cod_ato="274897",
        epigrafe="Decreto 12438 - 18 de Outubro de 2022",
        sumula="Introduz alterações no Regulamento do ICMS.",
        publicado_em="18/10/2022",
    )
    d = extrai(html, r, CFG, hoje="2026-08-21")

    assert "GOVERNADOR" in d.preambulo
    assert all("GOVERNADOR" not in b.texto for b in d.blocos)
    assert d.blocos[0].texto.startswith("Ficam introduzidas")
    assert [b.rotulo for b in d.blocos] == ["Art. 1º", "Art. 2º"]


def test_ano_vem_da_epigrafe_quando_a_data_discorda():
    """O Decreto 4.895: listado em 2024, epígrafe "21 de Fevereiro de 2024", e a
    coluna de data de publicação dizendo 21/02/2021.

    O id sai do ano, então a discordância punha um `decpr:2021:4895` sozinho
    numa faceta de ano fora da janela coletada — um decreto de 2024 aparecendo
    como se fosse de 2021. Dois sinais dizem 2024 e um diz 2021; vale a
    epígrafe.

    A data de publicação NÃO é corrigida: ela fica como a fonte a deu, porque
    deduzir a data certa seria inventar exatamente o dado de que se desconfia.
    """
    html = """<html><body>
<h3>Decreto 4895 - 21 de Fevereiro de 2024</h3>
<p><b class="labelAto">S&uacute;mula:</b><a>Homologa situação de emergência no Município de Espigão Alto do Iguaçu.</a></p>
<p><b class="labelAto">Art. 1&ordm;</b><a>Fica homologada a situação de emergência.</a></p>
</body></html>"""
    r = Resumo(
        cod_ato="320057",
        epigrafe="Decreto 4895 - 21 de Fevereiro de 2024",
        sumula="Homologa situação de emergência.",
        publicado_em="21/02/2021",
    )
    d = extrai(html, r, CFG, hoje="2026-08-21")

    assert d.id == "decpr:2024:4895"
    assert d.ano == 2024
    assert d.publicado_em == "2021-02-21"
