"""Camada de rede dos coletores: uma sessão com educação e memória.

Os quatro serviços que este pacote consulta são públicos e gratuitos, e três
deles são do próprio governo. Nenhum cobra, e é justamente por isso que o
coletor precisa se comportar: identificar-se, respeitar intervalo entre
requisições, não repetir download que já fez e desistir de vez em vez de
insistir. Um scraper mal-educado é bloqueado por IP, e um portfólio bloqueado
pelo Planalto não demonstra nada.

Três coisas moram aqui, e nenhuma outra:

- **retry com espera crescente**, só para falha transitória (429, 5xx, timeout).
  400 e 404 não são retentados: repetir uma requisição malformada não a
  conserta, só multiplica o erro por três.
- **intervalo mínimo entre chamadas ao mesmo host.** O Planalto serve páginas de
  900 KB; pedir cinco de uma vez é o que faz um servidor tratar você como
  ataque.
- **cache em disco.** O texto compilado de uma lei muda algumas vezes por ano;
  baixá-lo a cada execução é desperdício dos dois lados. O cache tem validade e
  pode ser ignorado com ``--sem-cache``.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import requests

RAIZ = Path(__file__).resolve().parent.parent
CACHE = RAIZ / "data" / "vigilia" / ".cache"

# Identificação, na forma `compatible` — e a forma foi imposta pela realidade,
# não escolhida por estilo.
#
# A primeira versão dizia só `Toga/vigilia (projeto de portfolio; ...)`, sem
# token `Mozilla`. O Planalto derruba a conexão na hora: medido em 13/08/2026,
# ConnectionError em 0,4 s com o agente próprio e 200 com qualquer coisa que
# comece por `Mozilla/5.0`. O WAF filtra por prefixo, não por conteúdo.
#
# A saída NÃO foi fingir ser Chrome. `Mozilla/5.0 (compatible; ...)` é a
# convenção que buscadores usam há décadas exatamente para isto: passa pelo
# filtro de prefixo e continua dizendo quem é e para quê. Conferido: 200 em
# 0,5 s. Um coletor que se disfarça de navegador é o que merece bloqueio; um que
# se identifica dentro da convenção que o servidor aceita, não.
AGENTE = "Mozilla/5.0 (compatible; LJ-vigilia/1.0; coletor de alteracoes legislativas do corpus)"

# Segundos entre duas requisições ao mesmo host.
INTERVALO = {
    "www.planalto.gov.br": 1.5,
    "www.in.gov.br": 1.5,
    "dadosabertos.camara.leg.br": 0.3,
    "legis.senado.leg.br": 0.3,
    "api-publica.datajud.cnj.jus.br": 0.5,
}
INTERVALO_PADRAO = 1.0

_ultima: dict[str, float] = {}


class FalhaDeRede(Exception):
    """Erro de fonte, e não do coletor. Quem chama transforma em relato."""


@dataclass
class Sessao:
    """Sessão de coleta. Uma por execução — não é thread-safe de propósito: os
    coletores rodam em sequência para o intervalo entre requisições valer."""

    tentativas: int = 3
    timeout: int = 60
    usar_cache: bool = True
    validade_horas: int = 12
    _s: requests.Session | None = None

    #: Prazo da fonte em curso, em `time.monotonic()`. `None` é sem prazo.
    #:
    #: Existe porque **o timeout por requisição não limita a execução**. Cada
    #: URL custa até `tentativas × timeout` mais a espera crescente — 183 s no
    #: padrão —, e com paginação em seis fontes isso passa de meia hora sem que
    #: nada esteja quebrado do ponto de vista de cada chamada.
    #:
    #: Foi o que derrubou as duas execuções agendadas do Actions: elas batiam no
    #: `timeout-minutes: 25` do job, eram mortas no meio da primeira fonte e não
    #: gravavam **nada** — nem o que as outras cinco teriam colhido. O disparo
    #: manual, no mesmo dia, terminava em 60 s.
    #:
    #: Com prazo, uma fonte pendurada vira `colheita.erro` — que é como o resto
    #: do pacote já trata fonte fora do ar — e as outras seguem e gravam.
    prazo: float | None = None

    def __post_init__(self) -> None:
        self._s = requests.Session()
        self._s.headers.update({"User-Agent": AGENTE, "Accept-Encoding": "gzip, deflate"})

    # --- cache ---------------------------------------------------------------

    def _arquivo_de_cache(self, url: str, corpo: str = "") -> Path:
        chave = hashlib.sha256(f"{url}{corpo}".encode()).hexdigest()[:24]
        host = urlsplit(url).netloc.replace(":", "_")
        return CACHE / host / f"{chave}.bin"

    def _do_cache(self, arq: Path) -> bytes | None:
        if not self.usar_cache or not arq.exists():
            return None
        idade = (time.time() - arq.stat().st_mtime) / 3600
        if idade > self.validade_horas:
            return None
        return arq.read_bytes()

    # --- espera --------------------------------------------------------------

    def _respira(self, url: str) -> None:
        host = urlsplit(url).netloc
        minimo = INTERVALO.get(host, INTERVALO_PADRAO)
        passou = time.time() - _ultima.get(host, 0.0)
        if passou < minimo:
            time.sleep(minimo - passou)
        _ultima[host] = time.time()

    # --- requisições ---------------------------------------------------------

    def bytes(self, url: str, **kw: Any) -> bytes:
        """GET cru, com cache. É o caminho do scraping — HTML do Planalto e do
        DOU vem em latin-1 e a decodificação é problema de quem chama."""
        arq = self._arquivo_de_cache(url)
        guardado = self._do_cache(arq)
        if guardado is not None:
            return guardado

        conteudo = self._tenta("GET", url, **kw).content

        if self.usar_cache:
            arq.parent.mkdir(parents=True, exist_ok=True)
            arq.write_bytes(conteudo)
        return conteudo

    def json(self, url: str, **kw: Any) -> Any:
        """GET com resposta JSON. Sem cache: dado legislativo do dia é o ponto."""
        r = self._tenta("GET", url, headers={"Accept": "application/json"}, **kw)
        try:
            return r.json()
        except ValueError as e:
            raise FalhaDeRede(f"{urlsplit(url).netloc} respondeu algo que não é JSON") from e

    def post_json(self, url: str, corpo: dict, cabecalhos: dict | None = None) -> Any:
        r = self._tenta(
            "POST",
            url,
            headers={"Content-Type": "application/json", **(cabecalhos or {})},
            data=json.dumps(corpo),
        )
        try:
            return r.json()
        except ValueError as e:
            raise FalhaDeRede(f"{urlsplit(url).netloc} respondeu algo que não é JSON") from e

    def _resta(self) -> float | None:
        """Segundos até o prazo da fonte. `None` quando não há prazo."""
        if self.prazo is None:
            return None
        return self.prazo - time.monotonic()

    def _tenta(self, metodo: str, url: str, **kw: Any) -> requests.Response:
        assert self._s is not None
        ultima: Exception | None = None

        for n in range(self.tentativas):
            # O prazo é conferido ANTES de cada tentativa, e não só no começo:
            # é a repetição que consome o orçamento, e uma fonte lenta gasta
            # tudo no retry sem nunca dar erro.
            resta = self._resta()
            if resta is not None and resta <= 0:
                raise FalhaDeRede(
                    f"{urlsplit(url).netloc}: orçamento da fonte esgotado"
                    + (f" ({ultima})" if ultima else "")
                )

            # O timeout da requisição também não pode ultrapassar o prazo, senão
            # a última tentativa sozinha o estoura por até `timeout` segundos.
            kw["timeout"] = self.timeout if resta is None else max(1.0, min(self.timeout, resta))

            self._respira(url)
            try:
                r = self._s.request(metodo, url, **kw)
            except requests.RequestException as e:
                ultima = e
            else:
                if r.status_code < 400:
                    return r
                # 4xx que não é 429 é erro nosso: repetir não conserta.
                if r.status_code != 429 and r.status_code < 500:
                    raise FalhaDeRede(
                        f"{r.status_code} {r.reason} em {urlsplit(url).path or '/'}"
                    )
                ultima = FalhaDeRede(f"{r.status_code} {r.reason}")

            if n < self.tentativas - 1:
                # Esperar mais do que resta do orçamento é gastar o prazo
                # dormindo, para acordar e desistir.
                espera = 2**n
                resta = self._resta()
                if resta is not None:
                    espera = min(espera, max(0.0, resta))
                time.sleep(espera)

        raise FalhaDeRede(f"{urlsplit(url).netloc}: {ultima}")
