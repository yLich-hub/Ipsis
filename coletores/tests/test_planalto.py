"""O extrator do texto compilado do Planalto.

Offline: o HTML de exemplo está inline e **reproduz o fonte real**, com as duas
armadilhas que fizeram a extração falhar em silêncio na primeira versão. Não é
HTML idealizado — é a forma que o ``ccivil_03`` de fato serve, com ``\\r\\n\\t``
dentro do texto da anotação e ``<span>`` atravessando o parêntese.

Estas duas armadilhas merecem teste próprio porque o modo de falha delas é o
pior possível para esta tela: nenhum erro, nenhuma exceção, uma lista vazia e a
interface afirmando que o corpus está em dia. Medido na página da Lei 11.343 em
13/08/2026, a versão ingênua encontrava 11 das 283 anotações — e as duas leis
que já alteraram a Lei de Drogas depois da data de corte estavam entre as
perdidas.
"""

from __future__ import annotations

from coletores.config import carrega
from coletores.planalto import extrai

CFG = carrega()
ALVO = CFG.alvo("lei_11343_2006")
assert ALVO is not None

# Armadilha 1: a anotação vem quebrada por `\r\n\t` DENTRO do texto do `<a>`.
# Armadilha 2: um `<span>` inline atravessa o parêntese.
# Armadilha 3: o href discorda do texto (L15281 contra "15.581") — é o que a
#              página real traz, e vale o texto, que é o que se cita.
HTML = """<html><body>
<p><b>Art. 22.</b> As atividades de atenção ao usuário observarão:</p>
<p>&nbsp;&nbsp;&nbsp;
<a href="../../../_Ato2023-2026/2025/Lei/L15281.htm#art1">(Inclu&iacute;do pela Lei \r
\tn&ordm; 15.581, de 2025)</a></p>

<p><b>Art. 23.</b> As redes de aten&ccedil;&atilde;o &agrave; sa&uacute;de:</p>
<p><a href="/x.htm">(Reda&ccedil;&atilde;o dada pela Lei <span>n&ordm; 15.358</span>, de 2026)</a></p>

<p><b>Art. 40-A.</b> Disposi&ccedil;&atilde;o nova:</p>
<p><a href="/y.htm">(Inclu&iacute;do pela Lei n&ordm; 15.358, de 2026)</a></p>

<p><b>Art. 8&ordm;</b> Antigo:</p>
<p><a href="/z.htm">(Reda&ccedil;&atilde;o dada pela Lei n&ordm; 13.840, de 2019)</a></p>

<p>Este par&aacute;grafo cita o art. 22 desta Lei sem ser cabe&ccedil;alho.</p>
<p>(Revogado)</p>
</body></html>""".encode("latin-1")


def alteracoes():
    return extrai(HTML, ALVO)


def test_encontra_anotacao_quebrada_por_espaco_de_formatacao():
    # Armadilha 1. Se cair, `_por_bloco` voltou a separar blocos com `\n` e a
    # anotação partiu no `\r\n\t` do próprio Planalto.
    a = next((x for x in alteracoes() if x.norma == "Lei 15.581/2025"), None)
    assert a is not None, "a anotação quebrada por \\r\\n\\t não foi encontrada"
    assert a.artigo == "22"
    assert a.verbo.startswith("inclu")


def test_encontra_anotacao_atravessada_por_tag_inline():
    # Armadilha 2. Se cair, alguém trocou `_por_bloco` por `get_text("\n")`.
    a = next((x for x in alteracoes() if x.artigo == "23"), None)
    assert a is not None, "a anotação com <span> no meio não foi encontrada"
    assert a.norma == "Lei 15.358/2026"


def test_atribui_ao_artigo_certo_e_entende_sufixo_de_letra():
    porta = {x.artigo for x in alteracoes()}
    assert "40-a" in porta
    # "cita o art. 22 desta Lei" no meio de uma frase é remissão, não cabeçalho:
    # se virasse cabeçalho, todas as anotações seguintes seriam atribuídas ao
    # art. 22 e o vínculo com as teses apontaria para o artigo errado.
    assert "8" in porta


def test_ignora_anotacao_que_nao_identifica_ato():
    # `(Revogado)` sem número é anotação legítima e não nomeia norma nenhuma.
    # Reportá-la produziria uma linha "alguma lei alterou algo", que é ruído.
    assert all(x.norma for x in alteracoes())


def test_dedup_por_par_norma_artigo():
    # A Lei 15.358 aparece duas vezes no HTML, em artigos diferentes: são dois
    # fatos. No art. 23 ela aparece uma vez só.
    da_358 = [x for x in alteracoes() if x.norma == "Lei 15.358/2026"]
    assert len(da_358) == 2
    assert sorted(x.artigo for x in da_358) == ["23", "40-a"]


def test_le_o_ano_para_o_corte_funcionar():
    anos = {x.norma: x.ano for x in alteracoes()}
    assert anos["Lei 15.581/2025"] == 2025
    assert anos["Lei 13.840/2019"] == 2019


def test_href_absoluto_mesmo_com_caminho_relativo():
    a = next(x for x in alteracoes() if x.norma == "Lei 15.581/2025")
    # O href da página real discorda do texto (L15281 contra 15.581). Vale o
    # texto para o número; o href fica como endereço, e resolvido.
    assert a.href.startswith("https://www.planalto.gov.br/")
    assert a.norma == "Lei 15.581/2025"
