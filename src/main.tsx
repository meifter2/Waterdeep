import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/sellado.css'
import './styles/fichas.css'
import './styles/mesa.css'
import './styles/combate.css'
import './styles/ajustes.css'
import './styles/jugadores.css'
import './styles/responsive.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
