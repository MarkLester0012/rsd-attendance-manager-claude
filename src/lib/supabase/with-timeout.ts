/**
 * Aborts a Supabase query after `ms` milliseconds instead of letting it hang
 * indefinitely. Supabase's query builders expose `.abortSignal(signal)`,
 * which cancels the underlying `fetch` for real — unlike a `Promise.race`
 * timeout, the request doesn't keep running in the background after the
 * caller gives up. `.abortSignal()` must be chained onto the builder before
 * a terminal call like `.single()`, so this hands back the signal to attach
 * plus a `settle()` to await the finished query through (which also clears
 * the timer either way).
 *
 * A timeout surfaces through the same `{ data, error }` shape every caller
 * already checks, so it reads as just another kind of query failure — no new
 * branching needed at call sites.
 *
 * Only use this where a tight timeout is actually appropriate (e.g. a Slack
 * slash command's synchronous response path) — not on shared code also used
 * by callers with no such time pressure.
 *
 * @example
 * const timeout = withTimeout();
 * const { data } = await timeout.settle(
 *   supabase.from("users").select("id").eq("id", userId).abortSignal(timeout.signal).single()
 * );
 */
export function withTimeout(ms = 4000): {
  signal: AbortSignal;
  settle<T>(query: PromiseLike<T>): Promise<T>;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    settle<T>(query: PromiseLike<T>): Promise<T> {
      return Promise.resolve(query).finally(() => clearTimeout(timer));
    },
  };
}
