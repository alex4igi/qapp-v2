import type { PostgrestError } from '@supabase/supabase-js'

const PAGE = 1000

type Pageable<T> = {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
}

// PostgREST taie orice răspuns la max_rows (1000 în config.toml). Query-urile care
// au nevoie de TOATE rândurile (export CSV, agregări client-side) trebuie paginate.
// `build` construiește un query NOU la fiecare apel (builder-ul PostgREST e mutabil)
// și trebuie să aibă un ORDER deterministic (tiebreaker pe o coloană unică, ex. id),
// altfel rândurile pot sări/dubla între pagini.
export async function fetchAllRows<T>(build: () => Pageable<T>): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
}
