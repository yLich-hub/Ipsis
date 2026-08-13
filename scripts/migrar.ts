// =============================================================================
// Aplica uma migration de `supabase/migrations/` no banco.
//
// Não é um framework de migration e não finge ser: não há ledger de "o que já
// rodou". Ele não precisa existir porque toda migration deste projeto é escrita
// para ser idempotente — `create table if not exists`, `create index if not
// exists`, `drop policy if exists` antes de `create policy`. Rodar duas vezes é
// operação normal, não acidente a ser prevenido.
//
// O que existe é o oposto de um ledger: a numeração no nome do arquivo, revisada
// em diff. Um runner com estado no banco esconderia num registro invisível o que
// hoje está no `ls` da pasta.
//
//   npm run migrar -- 0008_perfil.sql
//   npm run migrar -- 0008_perfil.sql 0009_clientes.sql
//
// Roda pela conexão direta de `scripts/db.ts` — nunca no runtime da Vercel.
// =============================================================================

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { encerra, sql } from './db'

const PASTA = resolve(import.meta.dirname, '..', 'supabase', 'migrations')

async function main() {
  const alvos = process.argv.slice(2)
  if (alvos.length === 0) {
    throw new Error('uso: npm run migrar -- 0008_perfil.sql [0009_clientes.sql ...]')
  }

  for (const alvo of alvos) {
    // O nome vem da linha de comando e vira caminho de arquivo: sem esta trava,
    // `../../algo.sql` lê fora da pasta de migrations.
    if (!/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(alvo)) {
      throw new Error(`nome de migration inválido: ${alvo}`)
    }

    const conteudo = await readFile(resolve(PASTA, alvo), 'utf8')
    // `unsafe` porque o arquivo TEM de chegar ao servidor como está — é DDL, não
    // consulta parametrizável. A trava do nome, acima, é o que fecha a porta.
    await sql.unsafe(conteudo)
    console.log(`· ${alvo} aplicada`)
  }
}

main().then(
  () => encerra(),
  (e) => encerra(e),
)
