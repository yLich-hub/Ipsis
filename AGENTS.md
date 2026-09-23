# Ipsis — instruções do projeto

**As instruções deste repositório moram em [`CLAUDE.md`](./CLAUDE.md), e só lá.**
Leia aquele arquivo por inteiro antes de mexer em qualquer coisa: ele descreve o
recorte do produto, as três decisões que o definem, o que está deliberadamente
fora de escopo e as convenções que não se negociam.

Não há instrução adicional neste arquivo. Ele existe porque parte das
ferramentas de agente procura por `AGENTS.md` e não por `CLAUDE.md`.

## Por que um ponteiro, e não uma cópia

Este arquivo já foi uma cópia integral do `CLAUDE.md`, com "Claude" trocado por
"Codex" num find-and-replace. As duas coisas que se esperava dele falharam:

- **Envelheceu numa única sincronização.** Quando a landing page entrou, a cópia
  ficou 130 linhas atrás — afirmando que `/` era um desvio para `/login`, que é
  justamente o que aquele commit deixou de ser verdade.
- **O find-and-replace corrompeu dado.** O id do modelo `claude-opus-5` virou
  `Codex-opus-5`, que não existe. Um agente lendo aquilo passaria adiante um
  nome inventado.

Nenhum teste pegaria isso, porque não há como testar prosa duplicada. É a mesma
razão pela qual `src/lib/toga/marca.ts` existe, e pela qual `tests/vigilia.test.ts`
falha quando `lib/vigilia/alvos.ts` se afasta de `data/curadoria/vigilia.yaml`:
**duplicação sem trava diverge na primeira correção.** Aqui não havia trava, e
ela divergiu.

Uma fonte só. Se você veio parar neste arquivo, vá para o `CLAUDE.md`.
