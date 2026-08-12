// Enquanto o Supabase responde. É a única espera real desta tela — filtrar,
// depois que os dados chegaram, é síncrono e local.
import { Esqueletos } from '@/components/toga/jurisprudencia'

export default function Carregando() {
  return <Esqueletos />
}
