import { useEffect, useState } from 'react'

const THEME_STORAGE_KEY = 'geopulse-hub-theme'

export function useAppTheme() {
  const [uiTheme, setUiTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return (saved === 'dark' || saved === 'light') ? saved : 'dark'
  })

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, uiTheme)
  }, [uiTheme])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
        setUiTheme(e.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    root.dataset.theme = uiTheme
    root.style.colorScheme = uiTheme
    body.dataset.theme = uiTheme
  }, [uiTheme])

  return { uiTheme, setUiTheme, isDarkTheme: uiTheme === 'dark' }
}
