import { SiteCredit } from '@/components/layout/SiteCredit'

export function AppShellFallback() {
  return (
    <main className="shell-fallback">
      <section className="shell-fallback-card">
        <p className="eyebrow">GeoPulse yükleniyor</p>
        <h1>Harita arayüzü hazırlanıyor.</h1>
        <p className="lede">GeoPulse editörü, dünya verisi ve senaryo katmanları açılıyor.</p>
        <SiteCredit />
      </section>
    </main>
  )
}
