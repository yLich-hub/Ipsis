"""O extrator da redação compilada — o que ele lê e o que ele recusa a ler.

Offline, com o HTML inline. Como em ``test_planalto.py``, o exemplo **reproduz o
fonte real** do ``ccivil_03``, com as armadilhas que fizeram a extração errar em
silêncio na prática — e o modo de falha aqui é pior que o da vigília: lá uma
armadilha produz lista vazia e a tela diz que nada mudou; aqui ela produz texto
legal errado dentro do corpus, que sai transcrito numa peça.

As seis armadilhas cobertas, todas medidas nas três páginas reais:

1. ``Art. 1º - Não há crime`` — o ``- N`` de "Não" virava sufixo de artigo, e
   302 dos 416 artigos do Código Penal deixavam de casar com o corpus.
2. ``§ 1º - Para os efeitos`` — o mesmo com parágrafo, decapitando o texto.
3. A rubrica marginal em bloco próprio ("Lei penal no tempo"), que colada no
   dispositivo anterior fazia 414 artigos parecerem alterados.
4. O texto revogado, que continua na página riscado.
5. A anotação de procedência, com e sem parêntese.
6. ``cp1252``: as páginas não declaram charset e trazem travessão do Windows na
   faixa 0x91–0x97, que o latin-1 lê como caractere de controle invisível — e
   com ele some o ``VII – contra`` que separa um inciso do parágrafo pai.
"""

from __future__ import annotations

from coletores.redacao import chave, compara, extrai_artigos, tem_enumeracao_embutida

# `–` é o travessão; codificado em cp1252 ele vira o byte 0x96, que é
# exatamente o que as páginas do Planalto trazem sem declarar charset.
HTML = """<html><body>
<p><b>CAP\xcdTULO I</b></p>
<p><b>DOS CRIMES</b></p>

<p>Art. 1\xba - N\xe3o h\xe1 crime sem lei anterior que o defina.
<a href="#">(Reda\xe7\xe3o dada pela Lei n\xba 7.209, de 11.7.1984)</a></p>

<p><strong>Lei penal no tempo</strong></p>

<p>Art. 2\xba - Ningu\xe9m pode ser punido por fato que lei posterior deixa de considerar crime.</p>
<p>Pena \u2013 reclus\xe3o, de 1 (um) a 6 (seis) anos, e multa.</p>
<p>\xa7 1\xba - Para os efeitos penais, consideram-se extens\xe3o do territ\xf3rio nacional as embarca\xe7\xf5es.</p>
<p>\xa7 2\xba <strike>A pena ser\xe1 de deten\xe7\xe3o.</strike> A pena ser\xe1 de reclus\xe3o.
<a href="#">(Reda\xe7\xe3o dada pela Lei n\xba 15.358, de 2026)</a></p>
<p>I \u2013 na presen\xe7a da v\xedtima;</p>
<p>II \u2013 contra pessoa idosa.</p>
<p>Vig\xeancia</p>

<p>Art. 3\xba - (Revogado pela Lei n\xba 6.368, de 1976)</p>

<p><strong>Apropria\xe7\xe3o de coisa havida por erro, caso fortuito ou for\xe7a da natureza</strong></p>

<p>Art. 4\xba - Receber coisa alheia.</p>
</body></html>""".encode("cp1252")

ARTIGOS = extrai_artigos(HTML)


def test_o_sufixo_de_letra_nao_come_a_primeira_palavra():
    """`Art. 1º - Não há crime` é o art. 1, não o art. 1-N."""
    assert set(ARTIGOS) == {"1", "2", "3", "4"}


def test_o_paragrafo_nao_perde_a_primeira_letra():
    par = next(b for b in ARTIGOS["2"].blocos if b.sufixo == "_p1")
    assert par.rotulo == "§ 1º"
    assert par.texto.startswith("Para os efeitos penais")


def test_a_rubrica_marginal_nao_entra_no_texto_legal():
    """Ela é do artigo SEGUINTE, e o corpus a guarda em `rubricas`."""
    assert "Lei penal no tempo" not in ARTIGOS["1"].blocos[0].texto
    assert ARTIGOS["1"].rubricas == ["Lei penal no tempo"]
    # E o artigo seguinte fica sabendo que ela é dele.
    assert ARTIGOS["2"].rubrica_propria == "Lei penal no tempo"


def test_rubrica_longa_tambem_e_reconhecida():
    """71 caracteres. O limite de ~70 da limpeza A deixava esta passar, e ela
    entrava como texto legal no fim do artigo anterior."""
    assert ARTIGOS["3"].rubricas == [
        "Apropriação de coisa havida por erro, caso fortuito ou força da natureza"
    ]
    assert "Apropriação de coisa" not in ARTIGOS["3"].blocos[0].texto


def test_a_redacao_revogada_riscada_nao_entra():
    par = next(b for b in ARTIGOS["2"].blocos if b.sufixo == "_p2")
    assert par.texto == "A pena será de reclusão."
    assert "detenção" not in par.texto


def test_artigo_revogado_por_inteiro_vira_a_forma_do_corpus():
    """Sem isto o caput fica vazio, e o bloco seguinte — que é a rubrica do
    artigo depois dele — é colado como se fosse o texto do artigo revogado."""
    assert ARTIGOS["3"].blocos[0].texto == "(Revogado)"


def test_a_anotacao_de_procedencia_sai_do_texto():
    caput = ARTIGOS["1"].blocos[0]
    assert "Redação dada" not in caput.texto
    assert caput.texto == "Não há crime sem lei anterior que o defina."


def test_a_norma_que_alterou_o_bloco_vem_junto():
    par = next(b for b in ARTIGOS["2"].blocos if b.sufixo == "_p2")
    assert par.normas == ["Lei 15.358/2026"]


def test_anotacao_com_data_por_extenso_nao_identifica_a_norma():
    """`(Redação dada pela Lei nº 7.209, de 11.7.1984)` fica sem norma, e está
    certo assim.

    O padrão exige que o ano venha logo depois do número da lei, como o Planalto
    escreve nas anotações recentes (`de 2025`). Com a data por extenso, o `11.7`
    no meio impede o casamento — e isso só acontece em anotação ANTIGA, que é
    justamente a que a curadoria não usa: o que entra em `redacoes.yaml` é
    alteração posterior à data de corte. Perder a identificação aqui não custa
    nada; afrouxar o padrão para alcançá-la faria `de 11.7.1984` virar "Lei
    7.209/1911" em algum outro artigo, e aí o custo seria uma procedência falsa.
    """
    assert ARTIGOS["1"].blocos[0].normas == []


def test_anotacao_sem_parentese_nao_e_colada_no_dispositivo():
    """`(Vigência)` às vezes vem como o conteúdo inteiro de um link, sem os
    parênteses — e então nenhum regex de anotação a vê."""
    assert all("Vigência" not in b.texto for b in ARTIGOS["2"].blocos)


def test_a_pena_e_continuacao_do_caput():
    """No Planalto ela é bloco próprio; no corpus, parte do caput. Os dois lados
    precisam segmentar igual, senão a comparação acusa alteração em todo crime."""
    assert ARTIGOS["2"].blocos[0].texto.endswith("e multa.")
    assert "Pena – reclusão" in ARTIGOS["2"].blocos[0].texto


def test_o_travessao_do_windows_separa_o_inciso_do_pai():
    """Lido como latin-1, o `–` de `I – na presença` some e o inciso vira
    continuação do parágrafo. O id do bloco é o que denuncia."""
    sufixos = [b.sufixo for b in ARTIGOS["2"].blocos]
    assert "_p2_inc1" in sufixos and "_p2_inc2" in sufixos


def test_o_id_do_inciso_pende_do_paragrafo_aberto():
    """Alinhar por rótulo casaria este `I` com qualquer outro `I` do artigo."""
    inc = next(b for b in ARTIGOS["2"].blocos if b.sufixo == "_p2_inc1")
    assert inc.rotulo == "I"
    assert inc.texto == "na presença da vítima;"


# --- comparação ---------------------------------------------------------------


def test_chave_ignora_tipografia_e_nao_ignora_palavra():
    assert chave("Pena – reclusão") == chave("Pena - reclusão")
    assert chave("§ 1o Nos casos") == chave("§ 1º Nos casos")
    assert chave("(VETADO).") == chave("(Vetado)")
    assert chave("de um a quatro anos") != chave("de 1 (um) a 6 (seis) anos")


def test_compara_alinha_por_id_e_nomeia_a_acao():
    corpus = [
        ("x_art2_caput", "caput", "Ninguém pode ser punido por fato que lei posterior deixa de considerar crime. Pena - reclusão, de 1 (um) a 6 (seis) anos, e multa."),
        ("x_art2_p1", "§ 1º", "Para os efeitos penais, consideram-se extensão do território nacional as embarcações."),
        ("x_art2_p2", "§ 2º", "A pena será de detenção."),
    ]
    divs = {d.id: d for d in compara("x_art2", corpus, ARTIGOS["2"])}

    # O caput e o § 1º batem: não viram divergência.
    assert "x_art2_caput" not in divs
    assert "x_art2_p1" not in divs
    # O § 2º mudou de redação, e a lei que mudou vem junto.
    assert divs["x_art2_p2"].acao == "alterar"
    assert divs["x_art2_p2"].normas == ["Lei 15.358/2026"]
    # Os dois incisos são novos, e sabem depois de quem entram.
    assert divs["x_art2_p2_inc1"].acao == "incluir"
    assert divs["x_art2_p2_inc1"].depois_de == "x_art2_p2"


def test_enumeracao_embutida_e_reconhecida():
    """O bloco que traz os próprios incisos dentro do texto não pode ser aplicado
    no automático: o texto deles ficaria gravado duas vezes."""
    assert tem_enumeracao_embutida("A pena é aumentada se: I – na presença; II – contra idoso.")
    assert not tem_enumeracao_embutida("A pena é aumentada de 1/3 até a metade.")
    # Remissão a inciso no meio da frase não é enumeração embutida.
    assert not tem_enumeracao_embutida("nos termos do inciso I do art. 22 desta Lei.")
