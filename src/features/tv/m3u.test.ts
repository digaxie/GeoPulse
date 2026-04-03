import { describe, expect, it } from 'vitest'

import { normalizeChannels, parseM3u } from './m3u'

const SAMPLE_M3U = `#EXTM3U
#EXTINF:-1 tvg-logo="https://example.com/logo1.png" group-title="Turkey",TRT 1
https://trt1.example.com/stream.m3u8
#EXTINF:-1 tvg-logo="https://example.com/logo2.png" group-title="Germany: News",DW News
https://dw.example.com/stream.m3u8
#EXTINF:-1 group-title="France",France 24
https://france24.example.com/stream.m3u8
#EXTINF:-1,No Group Channel
https://nogroup.example.com/stream.m3u8
`

describe('parseM3u', () => {
  it('parses a basic M3U playlist', () => {
    const entries = parseM3u(SAMPLE_M3U)
    expect(entries).toHaveLength(4)
  })

  it('extracts channel names correctly', () => {
    const entries = parseM3u(SAMPLE_M3U)
    expect(entries[0].name).toBe('TRT 1')
    expect(entries[1].name).toBe('DW News')
    expect(entries[2].name).toBe('France 24')
    expect(entries[3].name).toBe('No Group Channel')
  })

  it('extracts logo URLs', () => {
    const entries = parseM3u(SAMPLE_M3U)
    expect(entries[0].logoUrl).toBe('https://example.com/logo1.png')
    expect(entries[1].logoUrl).toBe('https://example.com/logo2.png')
    expect(entries[2].logoUrl).toBe('')
  })

  it('extracts group titles', () => {
    const entries = parseM3u(SAMPLE_M3U)
    expect(entries[0].group).toBe('Turkey')
    expect(entries[1].group).toBe('Germany: News')
    expect(entries[2].group).toBe('France')
    expect(entries[3].group).toBe('')
  })

  it('extracts stream URLs', () => {
    const entries = parseM3u(SAMPLE_M3U)
    expect(entries[0].streamUrl).toBe('https://trt1.example.com/stream.m3u8')
    expect(entries[3].streamUrl).toBe('https://nogroup.example.com/stream.m3u8')
  })

  it('handles empty input', () => {
    expect(parseM3u('')).toEqual([])
    expect(parseM3u('#EXTM3U\n')).toEqual([])
  })

  it('skips entries without a stream URL', () => {
    const entries = parseM3u('#EXTINF:-1,Broken Channel\n')
    expect(entries).toHaveLength(0)
  })
})

describe('normalizeChannels', () => {
  it('converts entries to TvChannel objects', () => {
    const entries = parseM3u(SAMPLE_M3U)
    const channels = normalizeChannels(entries, 'TestSource', 'https://example.com', 'Unknown')

    expect(channels).toHaveLength(4)
    expect(channels[0]).toMatchObject({
      id: 'testsource-0',
      name: 'TRT 1',
      streamUrl: 'https://trt1.example.com/stream.m3u8',
      logoUrl: 'https://example.com/logo1.png',
      group: 'Turkey',
      country: 'Turkey',
      sourceName: 'TestSource',
      sourceUrl: 'https://example.com',
    })
  })

  it('extracts country from colon-separated group', () => {
    const entries = parseM3u(SAMPLE_M3U)
    const channels = normalizeChannels(entries, 'Test', 'https://example.com', 'Fallback')
    expect(channels[1].country).toBe('Germany')
  })

  it('uses fallback country when extraction fails', () => {
    const entries = parseM3u('#EXTINF:-1,Test\nhttps://test.com/s.m3u8\n')
    const channels = normalizeChannels(entries, 'Test', 'https://example.com', 'Fallback')
    expect(channels[0].country).toBe('Fallback')
  })
})
