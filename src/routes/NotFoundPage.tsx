import { Link } from 'react-router-dom'

import { SiteCredit } from '@/components/layout/SiteCredit'

export function NotFoundPage() {
  return (
    <main className="shell-fallback">
      <section className="shell-fallback-card">
        <p className="eyebrow">404</p>
        <h1>Sayfa bulunamadı.</h1>
        <p className="lede">
          Bağlantı değişmiş olabilir veya bu adres artık kullanılmıyor olabilir.
        </p>
        <div className="button-row">
          <Link className="primary-button" to="/app">
            GeoPulse paneline dön
          </Link>
          <Link className="secondary-button" to="/login">
            Giriş ekranına git
          </Link>
        </div>
        <SiteCredit />
      </section>
    </main>
  )
}
