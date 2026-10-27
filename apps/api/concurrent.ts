/** Preserve input order while bounding concurrent database work. */
export async function mapConcurrent<T, U>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<U>,
): Promise<U[]> {
  const result = new Array<U>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(items.length, Math.max(1, limit)) },
      async () => {
        while (cursor < items.length) {
          const index = cursor++;
          result[index] = await run(items[index]);
        }
      },
    ),
  );
  return result;
}
