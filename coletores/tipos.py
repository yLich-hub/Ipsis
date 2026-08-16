"""O formato comum das cinco fontes.

Câmara, Senado, Planalto, DOU e DataJud não têm parentesco nenhum entre si: uma
devolve JSON REST, outra JSON de outro feitio, duas devolvem HTML em latin-1 e a
última fala Elasticsearch. Este arquivo é o formato que todas viram antes de
qualquer coisa a jusante encostar nelas — o filtro, a gravação e a tela conhecem
só ``Achado``.

``Achado`` cobre a pergunta da vigília: *alguma coisa alterou o corpus?*
``Metrica`` cobre a única pergunta que o DataJud responde de verdade, que é
outra: *quanto o recorte pesa no Judiciário?* Elas são tipos separados porque
misturá-las faria uma contagem de processos aparecer numa lista de alterações
legislativas — e é assim que um painel começa a mentir.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# `planalto` e `dou` são fontes de norma JÁ PUBLICADA; `camara` e `senado`, de
# proposição em tramitação. A distinção não é cosmética: só a primeira metade
# fura a data de corte.
FONTES = ("camara", "senado", "planalto", "dou", "datajud", "stj")


@dataclass
class Achado:
    """Uma norma ou proposição que declara alterar uma das três leis do corpus."""

    id: str
    """Id estável com prefixo da fonte: ``camara:2602373``, ``planalto:lei_11343_2006:15.581/2025``.
    É o que torna a coleta idempotente — rodar duas vezes não duplica."""

    fonte: str
    identificacao: str
    ementa: str
    leis_tocadas: list[str]
    artigos_tocados: list[str] = field(default_factory=list)

    apresentado_em: str = ""
    situacao: str = ""

    virou_norma: bool = False
    """O que separa "alguém propôs" de "a lei mudou". Achado do Planalto nasce
    ``True``: o que está no texto compilado já está em vigor."""

    norma: str | None = None
    url: str = ""

    def linha(self) -> dict:
        """A forma que ``public.vigilia_alteracoes`` espera."""
        return {
            "id": self.id,
            "fonte": self.fonte,
            "leis_tocadas": self.leis_tocadas,
            "artigos_tocados": self.artigos_tocados,
            "identificacao": self.identificacao[:80],
            "ementa": self.ementa,
            "apresentado_em": self.apresentado_em or None,
            "situacao": self.situacao or None,
            "virou_norma": self.virou_norma,
            "norma": self.norma,
            "url": self.url or None,
        }


@dataclass
class Metrica:
    """Uma contagem do DataJud. Estatística, nunca fonte de texto."""

    assunto: str
    codigo_assunto: int
    tribunal: str
    total: int

    def linha(self) -> dict:
        return {
            "assunto": self.assunto,
            "codigo_assunto": self.codigo_assunto,
            "tribunal": self.tribunal.upper(),
            "total": self.total,
        }


@dataclass
class Precedente:
    """Um tema qualificado do STJ.

    Separado de ``Achado`` de propósito: um achado é "alguém quer mudar a lei";
    um precedente é "o STJ decidiu como a lei se lê". Misturá-los faria a tela
    de alterações mostrar entendimento jurisprudencial como se fosse projeto de
    lei — e é assim que um painel começa a mentir.
    """

    id: str
    tipo: str
    numero: str
    situacao: str
    """Vocabulário do STJ: 'Trânsito em Julgado', 'Cancelada', 'Sobrestado'…
    É o campo que justifica esta fonte existir — ver ``coletores/stj.py``."""

    escopo: str
    """``drogas`` ou ``parte_geral``. Por que o tema entrou no recorte."""

    tese_firmada: str | None = None
    questao: str | None = None
    entendimento_anterior: str | None = None
    historico: str | None = None
    ref_legislativa: str | None = None
    ref_sumular: str | None = None
    sumula_originada: str | None = None
    julgado_em: str | None = None
    publicado_em: str | None = None
    afetado_em: str | None = None
    artigos_tocados: list[str] = field(default_factory=list)

    def linha(self) -> dict:
        """A forma que ``public.precedentes_stj`` espera."""
        return {
            "id": self.id,
            "tipo": self.tipo[:60],
            "numero": self.numero,
            "situacao": self.situacao,
            "tese_firmada": self.tese_firmada,
            "questao": self.questao,
            "entendimento_anterior": self.entendimento_anterior,
            "historico": self.historico,
            "ref_legislativa": self.ref_legislativa,
            "ref_sumular": self.ref_sumular,
            "sumula_originada": self.sumula_originada,
            "julgado_em": self.julgado_em,
            "publicado_em": self.publicado_em,
            "afetado_em": self.afetado_em,
            "escopo": self.escopo,
            "artigos_tocados": self.artigos_tocados,
        }


@dataclass
class Colheita:
    """O que uma fonte devolve. Erro é valor, não exceção: uma fonte fora do ar
    não pode derrubar as outras quatro."""

    fonte: str
    achados: list[Achado] = field(default_factory=list)
    metricas: list[Metrica] = field(default_factory=list)
    precedentes: list[Precedente] = field(default_factory=list)
    vistos: int = 0
    erro: str | None = None
    ms: int = 0

    @property
    def ok(self) -> bool:
        return self.erro is None
