# GeoPulse

[English](#english) | [Türkçe](#türkçe)

## English

GeoPulse is a real-time geopolitical scenario editor and briefing platform built for live analysis, map-based storytelling, alerts, missile tracking, and synchronized presentation workflows.

### Installation

Prerequisites:
- Node.js 20+
- npm 10+
- A Supabase project for full backend mode, or mock mode for local/demo use

```bash
git clone https://github.com/digaxie/GeoPulse-public.git
cd GeoPulse-public
npm install
```

### Environment Setup

Copy `.env.example` to `.env` and fill in the values you need:

```bash
cp .env.example .env
```

Required runtime variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional variables:
- `VITE_HGM_ATLAS_API_KEY`
- `VITE_ENABLE_SCENES`
- `VITE_DEMO_USERNAME`
- `VITE_DEMO_PASSWORD`

### Demo / Mock Mode

If Supabase variables are not configured, the app falls back to mock/demo mode.

The demo username and password values in `.env.example` are placeholders for local testing only. Replace them with your own values if you want predictable mock credentials.

### Supabase / Vercel Notes

Supabase:
- Apply the migration chain in `supabase/migrations/`
- Deploy the edge functions in `supabase/functions/`
- Use `npm run bootstrap:admin` only for the first admin bootstrap

Vercel:
- `vercel.json` contains SPA rewrites and security headers
- The app can be deployed as a standard Vite frontend
- Public endpoint references in client config are expected; secrets must stay in env vars, not tracked files

### Test / Build Commands

```bash
npm run lint
npm run test
npm run build
```

Useful generation helpers:

```bash
npm run sync:map-data
npm run sync:seed-assets
npm run sync:scene-packs
npm run verify:generated
```

### License

This repository is source-available and licensed under BUSL-1.1. See `LICENSE` for full terms.

Copyright (c) 2026 digaxie. Licensed under BUSL-1.1.

## Türkçe

GeoPulse, canlı analiz, harita tabanlı anlatım, alarm takibi, füze izleme ve senkron sunum akışları için geliştirilmiş gerçek zamanlı bir jeopolitik senaryo editörü ve briefing platformudur.

### Kurulum

Gereksinimler:
- Node.js 20+
- npm 10+
- Tam backend modu için bir Supabase projesi veya yerel/demo kullanım için mock mode

```bash
git clone https://github.com/digaxie/GeoPulse-public.git
cd GeoPulse-public
npm install
```

### Env Kurulumu

`.env.example` dosyasını `.env` olarak kopyalayın ve ihtiyacınız olan alanları doldurun:

```bash
cp .env.example .env
```

Gerekli çalışma zamanı değişkenleri:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Opsiyonel değişkenler:
- `VITE_HGM_ATLAS_API_KEY`
- `VITE_ENABLE_SCENES`
- `VITE_DEMO_USERNAME`
- `VITE_DEMO_PASSWORD`

### Demo / Mock Mode Açıklaması

Supabase değişkenleri tanımlı değilse uygulama mock/demo moduna düşer.

`.env.example` içindeki demo kullanıcı adı ve şifre alanları yalnızca yerel test için placeholder değerlerdir. Sabit mock giriş bilgileri istiyorsanız bunları kendi değerlerinizle değiştirin.

### Supabase / Vercel Notları

Supabase:
- `supabase/migrations/` içindeki migration zincirini uygulayın
- `supabase/functions/` içindeki edge function dosyalarını deploy edin
- İlk admin kurulumu için yalnızca bir kez `npm run bootstrap:admin` kullanın

Vercel:
- `vercel.json` içinde SPA rewrite ve güvenlik header ayarları bulunur
- Uygulama standart bir Vite frontend olarak deploy edilebilir
- Client tarafındaki public endpoint referansları normaldir; secret değerler env içinde kalmalı, tracked dosyalara girmemelidir

### Test / Build Komutları

```bash
npm run lint
npm run test
npm run build
```

Yardımcı üretim komutları:

```bash
npm run sync:map-data
npm run sync:seed-assets
npm run sync:scene-packs
npm run verify:generated
```

### Lisans Bilgisi

Bu repo source-available olarak BUSL-1.1 ile lisanslanmıştır. Tüm şartlar için `LICENSE` dosyasına bakın.

Copyright (c) 2026 digaxie. Licensed under BUSL-1.1.
