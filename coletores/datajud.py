"""DataJud — API Pública do CNJ.

**Esta fonte não participa da detecção de alteração legislativa, e a razão não é
técnica.** A API funciona, é gratuita e a chave é pública; o problema é que ela
responde outra pergunta. O DataJud devolve metadados de capa processual e
movimentação — número do processo, tribunal, grau, órgão julgador, classe,
assuntos, movimentos. **Não devolve ementa nem inteiro teor**, e o card do
desenho TOGA v2 promete "metadados e ementas": a metade das ementas não existe
na API. Nem STF nem STJ oferecem API pública de jurisprudência; quem entrega
ementa em API é serviço pago.

E, mais de fundo: nada em processo judicial altera o texto de uma lei. Fazer o
DataJud alimentar a lista de alterações seria misturar duas perguntas e deixar
uma contagem de processos aparecer entre normas publicadas.

**O que ele responde de verdade, e que vale a pena.** Quanto o recorte deste
projeto pesa no Judiciário. O assunto "Tráfico de Drogas e Condutas Afins"
(código 3608 da Tabela Processual Unificada) é consultável por tribunal, e a
contagem é um número real, conferível, com origem declarada. Vai para
``vigilia_jurimetria`` — como estatística, nunca como fonte de texto.

A chave pública pode ser trocada pelo CNJ a qualquer momento; ela mora em
``data/curadoria/vigilia.yaml`` justamente para a troca ser um diff de uma linha.
"""

from __future__ import annotations

from coletores.config import Config, carrega
from coletores.rede import FalhaDeRede, Sessao
from coletores.tipos import Colheita, Metrica

BASE = "https://api-publica.datajud.cnj.jus.br"


def colhe(sessao: Sessao, cfg: Config | None = None) -> Colheita:
    cfg = cfg or carrega()
    chave = cfg.datajud.get("chave_publica", "")
    assuntos = cfg.datajud.get("assuntos", [])
    tribunais = cfg.datajud.get("tribunais", [])

    colheita = Colheita(fonte="datajud")

    if not chave:
        colheita.erro = "chave pública do DataJud ausente na curadoria"
        return colheita

    cabecalhos = {"Authorization": f"APIKey {chave}"}
    falhas: list[str] = []

    for assunto in assuntos:
        for tribunal in tribunais:
            url = f"{BASE}/api_publica_{tribunal}/_search"
            corpo = {
                # `size: 0` porque só a contagem interessa. Pedir documento e
                # descartá-lo seria trafegar megabytes de dado processual —
                # dado de processo real, de pessoas reais — sem uso nenhum.
                "size": 0,
                "track_total_hits": True,
                "query": {"term": {"assuntos.codigo": assunto["codigo"]}},
            }

            try:
                r = sessao.post_json(url, corpo, cabecalhos)
            except FalhaDeRede as e:
                falhas.append(f"{tribunal}: {e}")
                continue

            total = ((r.get("hits") or {}).get("total") or {}).get("value")
            if total is None:
                falhas.append(f"{tribunal}: resposta sem contagem")
                continue

            colheita.vistos += 1
            colheita.metricas.append(
                Metrica(
                    assunto=assunto["nome"],
                    codigo_assunto=int(assunto["codigo"]),
                    tribunal=tribunal,
                    total=int(total),
                )
            )

    if falhas and not colheita.metricas:
        colheita.erro = falhas[0]
    elif falhas:
        colheita.erro = f"{len(falhas)} tribunais falharam: {falhas[0]}"

    return colheita
