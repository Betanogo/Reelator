import { createRoot } from 'react-dom/client'
import { installPlatform } from './platform'
import { requestPersistence } from './storage'
import App from './App'
import './mobile.css'

installPlatform()
requestPersistence()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('sw', e))
}

createRoot(document.getElementById('root')!).render(<App />)
