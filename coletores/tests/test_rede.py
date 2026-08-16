"""O prazo por fonte, que é o que impede uma fonte pendurada de matar a coleta.

Offline: nenhum teste aqui toca a rede. O que se verifica é o **contrato de
tempo** de `Sessao`, e ele é verificável sem sair da máquina — a decisão de
desistir acontece antes de qualquer socket abrir.

Por que este arquivo existe. O `timeout` de 60 s limita cada requisição e não
limita nada além disso: com `tentativas=3` e a espera crescente, uma única URL
pendurada custa 183 s, e a Câmara pagina. As duas execuções agendadas do Actions
bateram no `timeout-minutes: 25` do job, foram mortas no meio da PRIMEIRA fonte e
**não gravaram nada** — nem o que as outras cinco teriam colhido. O disparo
manual, no mesmo dia, terminava em 60 s.

O modo de falha é o de sempre por aqui: nenhum erro, nenhuma exceção, e a tela
afirmando que o corpus está em dia porque a última coleta bem-sucedida é de
ontem.
"""

from __future__ import annotations

import time

import pytest

from coletores.rede import FalhaDeRede, Sessao

URL = "https://exemplo.invalido/qualquer"


def _sessao(**kw: object) -> Sessao:
    return Sessao(usar_cache=False, **kw)  # type: ignore[arg-type]


class TestPrazo:
    def test_sem_prazo_o_comportamento_nao_muda(self):
        # `prazo = None` é o padrão, e tem de continuar sendo: quem roda na mão
        # não deve herdar um teto pensado para o job do Actions.
        assert _sessao().prazo is None

    def test_prazo_vencido_recusa_antes_de_abrir_conexao(self):
        s = _sessao()
        s.prazo = time.monotonic() - 1

        inicio = time.monotonic()
        with pytest.raises(FalhaDeRede, match="orçamento da fonte esgotado"):
            s.bytes(URL)

        # Instantâneo é o ponto: se ele tentasse a conexão, o host inválido
        # custaria a resolução de DNS antes de falhar. A URL nem existe.
        assert time.monotonic() - inicio < 1.0

    def test_o_erro_nomeia_o_host_para_o_relato_dizer_qual_fonte(self):
        s = _sessao()
        s.prazo = time.monotonic() - 1
        with pytest.raises(FalhaDeRede, match="exemplo.invalido"):
            s.bytes(URL)

    def test_resta_encolhe_conforme_o_tempo_passa(self):
        s = _sessao()
        assert s._resta() is None

        s.prazo = time.monotonic() + 10
        primeiro = s._resta()
        assert primeiro is not None and 9 < primeiro <= 10

        time.sleep(0.05)
        segundo = s._resta()
        assert segundo is not None and segundo < primeiro

    def test_o_prazo_limita_o_timeout_da_requisicao(self):
        # Sem este corte, a última tentativa sozinha estoura o orçamento por até
        # `timeout` segundos — 60, no padrão. O teto passa a ser o que resta.
        s = _sessao(timeout=60)
        s.prazo = time.monotonic() + 5

        capturado: dict[str, object] = {}

        class _Falso:
            headers: dict[str, str] = {}

            def request(self, metodo: str, url: str, **kw: object):
                capturado.update(kw)
                raise RuntimeError("parar aqui: só interessa o timeout calculado")

        s._s = _Falso()  # type: ignore[assignment]

        with pytest.raises(Exception):
            s.bytes(URL)

        assert "timeout" in capturado
        assert 0 < float(capturado["timeout"]) <= 5  # type: ignore[arg-type]

    def test_desistir_de_uma_fonte_nao_e_desistir_da_coleta(self):
        # O contrato que o `__main__` depende: prazo esgotado vira `FalhaDeRede`,
        # e `FalhaDeRede` é o que todo coletor já converte em `colheita.erro`.
        # É por isso que o conserto coube na sessão, e não em cada coletor.
        assert issubclass(FalhaDeRede, Exception)

        s = _sessao()
        s.prazo = time.monotonic() - 1
        try:
            s.bytes(URL)
        except FalhaDeRede:
            pass
        else:  # pragma: no cover
            pytest.fail("deveria ter levantado FalhaDeRede")

        # E a sessão continua utilizável: rearmar o prazo é o que o laço faz a
        # cada fonte.
        s.prazo = time.monotonic() + 60
        resta = s._resta()
        assert resta is not None and resta > 0
