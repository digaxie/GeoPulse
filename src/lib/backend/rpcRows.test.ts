import { describe, expect, it } from 'vitest'

import { unwrapRpcSingleRow } from '@/lib/backend/rpcRows'

describe('unwrapRpcSingleRow', () => {
  it('returns an object response as-is', () => {
    expect(
      unwrapRpcSingleRow({ id: '1', revision: 3 }, 'invalid response'),
    ).toEqual({ id: '1', revision: 3 })
  })

  it('unwraps the first row from a table response array', () => {
    expect(
      unwrapRpcSingleRow(
        [
          { id: '1', revision: 3 },
          { id: '2', revision: 4 },
        ],
        'invalid response',
      ),
    ).toEqual({ id: '1', revision: 3 })
  })

  it('throws when no row is returned', () => {
    expect(() => unwrapRpcSingleRow([], 'invalid response')).toThrow('invalid response')
    expect(() => unwrapRpcSingleRow(null, 'invalid response')).toThrow('invalid response')
  })
})
