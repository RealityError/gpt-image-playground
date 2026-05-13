import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AdminApp from './AdminApp'
import './index.css'
import { installMobileViewportGuards } from './lib/viewport'

installMobileViewportGuards()

// Admin page is served at a configurable path (not "/").
// If the current path is "/" we show the user app, otherwise the admin app.
const Root = window.location.pathname === '/' ? App : AdminApp

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
