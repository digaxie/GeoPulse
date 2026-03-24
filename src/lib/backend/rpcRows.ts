export function unwrapRpcSingleRow<T extends object>(
  data: T | T[] | null | undefined,
  errorMessage: string,
): T {
  if (Array.isArray(data)) {
    const [firstRow] = data
    if (firstRow && typeof firstRow === 'object') {
      return firstRow
    }
  } else if (data && typeof data === 'object') {
    return data
  }

  throw new Error(errorMessage)
}
