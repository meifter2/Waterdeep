import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { capturarCompartido } from './lib/compartir'
import { prepararPwa } from './lib/pwa'
import { completarConexionSpotify, escucharSpotifyOtrasPestanas } from './lib/spotifyAuth'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/tarjetas.css'
import './styles/reproductor.css'
import './styles/dialogos.css'
import './styles/editor.css'
import './styles/entrada.css'

capturarCompartido()
prepararPwa()
void completarConexionSpotify()
escucharSpotifyOtrasPestanas()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
