import { Dosimetria } from '@/components/toga/dosimetria'
import { titulo } from '@/lib/toga/marca'

export const metadata = { title: titulo('Dosimetria') }

export default function PaginaDosimetria() {
  return <Dosimetria />
}
