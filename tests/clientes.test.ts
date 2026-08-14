// =============================================================================
// CPF e crítica do cadastro de clientes.
//
// `cpfValido`, `formataCpf` e `critica` são funções puras — não tocam o banco —
// e são a única barreira entre um dígito trocado e um cadastro que parece
// conferido. O check de `0009_clientes.sql` só olha o formato (11 dígitos);
// dígito verificador é conta, e conta se testa.
//
// O resto de `clientes.ts` fala com o Supabase e é verificado contra o banco de
// verdade, não em teste offline — mesma divisão de `historico.test.ts`.
// =============================================================================

import { describe, expect, it } from 'vitest'

import {
  RASCUNHO_VAZIO,
  type Rascunho,
  cpfValido,
  critica,
  formataCpf,
  soDigitos,
} from '@/lib/toga/clientes'

/** CPFs com dígito verificador correto, gerados pela própria regra. */
const VALIDOS = ['52998224725', '11144477735', '12345678909']

const com = (p: Partial<Rascunho>): Rascunho => ({ ...RASCUNHO_VAZIO, nome: 'Fulano', ...p })

describe('cpfValido', () => {
  it('aceita CPF com dígitos verificadores corretos', () => {
    for (const cpf of VALIDOS) expect(cpfValido(cpf), cpf).toBe(true)
  })

  it('aceita com pontuação, porque a máscara é da tela', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
  })

  it('recusa quando um dígito verificador está trocado', () => {
    // O último dígito de 52998224725 é 5; qualquer outro tem de cair.
    expect(cpfValido('52998224726')).toBe(false)
    expect(cpfValido('52998224715')).toBe(false)
  })

  it('recusa os onze repetidos, que passam na conta mas não existem', () => {
    for (const d of ['00000000000', '11111111111', '99999999999']) {
      expect(cpfValido(d), d).toBe(false)
    }
  })

  it('recusa comprimento errado e texto', () => {
    expect(cpfValido('')).toBe(false)
    expect(cpfValido('5299822472')).toBe(false)
    expect(cpfValido('529982247250')).toBe(false)
    expect(cpfValido('não é cpf')).toBe(false)
  })
})

describe('formataCpf', () => {
  it('põe a máscara nos 11 dígitos', () => {
    expect(formataCpf('52998224725')).toBe('529.982.247-25')
  })

  it('devolve como veio o que não tem 11 dígitos — nunca inventa pontuação', () => {
    expect(formataCpf('123')).toBe('123')
    expect(formataCpf('')).toBe('')
  })

  it('soDigitos tira tudo que não é número', () => {
    expect(soDigitos('529.982.247-25')).toBe('52998224725')
    expect(soDigitos('(11) 90000-0000')).toBe('11900000000')
  })
})

describe('critica do rascunho', () => {
  it('exige o nome, e só o nome', () => {
    expect(critica(com({ nome: '   ' }))).toMatch(/nome/i)
    expect(critica(com({}))).toBeNull()
  })

  it('deixa passar cadastro sem CPF, telefone, e-mail, caso ou nota', () => {
    expect(critica({ ...RASCUNHO_VAZIO, nome: 'Fulano de Tal' })).toBeNull()
  })

  it('recusa CPF inválido, mas aceita o campo vazio', () => {
    expect(critica(com({ cpf: '11111111111' }))).toMatch(/CPF inválido/)
    expect(critica(com({ cpf: '123' }))).toMatch(/11 dígitos/)
    expect(critica(com({ cpf: '' }))).toBeNull()
    expect(critica(com({ cpf: '529.982.247-25' }))).toBeNull()
  })

  it('recusa e-mail malformado', () => {
    expect(critica(com({ email: 'fulano@' }))).toMatch(/E-mail/)
    expect(critica(com({ email: 'fulano@exemplo.com' }))).toBeNull()
  })

  it('recusa telefone curto demais e nome longo demais', () => {
    expect(critica(com({ telefone: '1234' }))).toMatch(/telefone/i)
    expect(critica(com({ nome: 'a'.repeat(121) }))).toMatch(/120/)
  })

  // Os tetos daqui têm de bater com os checks de 0009: um teto maior aqui
  // transforma erro de formulário em erro do Postgres na cara do usuário.
  it('recusa anotação acima do teto do banco', () => {
    expect(critica(com({ nota: 'a'.repeat(2001) }))).toMatch(/2000/)
    expect(critica(com({ nota: 'a'.repeat(2000) }))).toBeNull()
  })
})
