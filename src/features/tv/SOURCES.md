# GeoPulse TV — Channel Sources

## Sources Used

### 1. Free-TV/IPTV
- **Repository:** https://github.com/Free-TV/IPTV
- **Playlist:** `https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8`
- **Why legal:** Explicitly excludes commercially gated channels. Only includes streams that are free-to-air or provided free to everyone in their country of origin. Streams point to official broadcaster CDNs.

### 2. freecasthub/public-iptv
- **Repository:** https://github.com/freecasthub/public-iptv
- **Playlist:** `https://raw.githubusercontent.com/freecasthub/public-iptv/main/playlist.m3u`
- **Why legal:** Curated collection from official public broadcasters worldwide. Repository explicitly states: "No subscriptions, no piracy — only verified public channels." Categories: News, Sports, Weather, Education.

## Exclusion Criteria

The following types of sources are **not** used:
- Streams requiring paid subscriptions
- Pirated/re-streamed commercial content
- Sources with unclear licensing or terms of use
- Private or geo-restricted content accessed via circumvention

## Sync Command

```bash
npm run sync:tv
```

This downloads the playlists, parses M3U format, deduplicates by stream URL, and writes normalized JSON to `public/data/tv/channels.json`.
