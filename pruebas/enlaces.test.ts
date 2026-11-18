import { interpretarEnlace } from '../src/lib/enlaces.ts'
const casos: [string, string][] = [
  ['https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123', 'spotify:track:4cOdK2wGLETKBW3PvgPWqT'],
  ['https://open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT?si=x', 'spotify:track:4cOdK2wGLETKBW3PvgPWqT'],
  ['open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'],
  ['https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3', 'spotify:album:1DFixLWuPkv3KT3TnV35m3'],
  ['https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT', 'spotify:track:4cOdK2wGLETKBW3PvgPWqT'],
  ['spotify:track:4cOdK2wGLETKBW3PvgPWqT', 'spotify:track:4cOdK2wGLETKBW3PvgPWqT'],
  ['  https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT  ', 'spotify:track:4cOdK2wGLETKBW3PvgPWqT'],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'yt:dQw4w9WgXcQ'],
  ['https://youtu.be/dQw4w9WgXcQ?si=xyz&t=42', 'yt:dQw4w9WgXcQ@42'],
  ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', 'yt:dQw4w9WgXcQ@90'],
  ['https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ', 'yt:dQw4w9WgXcQ+RDAMVMdQw4w9WgXcQ'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'yt:dQw4w9WgXcQ'],
  ['https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI', 'yt:+PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'],
  ['https://spotify.link/abc', 'ERROR'],
  ['https://open.spotify.com/user/pepe', 'ERROR'],
  ['https://soundcloud.com/x/y', 'ERROR'],
  ['hola que tal', 'ERROR'],
  ['', 'ERROR'],
  // Audio en internet (fase 2): https, extensión de audio; Dropbox pasa a raw=1
  ['https://sonidos.example.com/ambientes/lluvia%20fuerte.mp3', 'url:https://sonidos.example.com/ambientes/lluvia%20fuerte.mp3|MP3|lluvia fuerte'],
  ['https://cdn.example.org/taberna.ogg?v=2#t=10', 'url:https://cdn.example.org/taberna.ogg?v=2|OGG|taberna'],
  ['https://x.example/a.OPUS', 'url:https://x.example/a.OPUS|OPUS|a'],
  ['https://x.example/b.m4a', 'url:https://x.example/b.m4a|M4A|b'],
  ['https://x.example/c.wav', 'url:https://x.example/c.wav|WAV|c'],
  ['https://x.example/d.flac', 'url:https://x.example/d.flac|FLAC|d'],
  ['sonidos.example.com/viento.mp3', 'url:https://sonidos.example.com/viento.mp3|MP3|viento'],
  ['https://www.dropbox.com/scl/fi/abc123/tormenta.mp3?rlkey=xyz&dl=0', 'url:https://www.dropbox.com/scl/fi/abc123/tormenta.mp3?rlkey=xyz&raw=1|MP3|tormenta'],
  ['http://sonidos.example.com/lluvia.mp3', 'ERROR'],
  ['https://usuario:clave@sonidos.example.com/lluvia.mp3', 'ERROR'],
  ['https://sonidos.example.com/lluvia.txt', 'ERROR'],
  ['https://sonidos.example.com/lluvia', 'ERROR'],
  ['https://sonidos.example.com/video.mp4', 'ERROR'],
  ['https://sonidos.example.com/' + 'a'.repeat(500) + '.mp3', 'ERROR'],
]
let fallos = 0
for (const [entrada, esperado] of casos) {
  const r = interpretarEnlace(entrada)
  const obtenido = typeof r === 'string' ? 'ERROR' : r.servicio === 'url' ? `url:${r.url}|${r.formato}|${r.nombre}` : r.servicio === 'spotify' ? r.uri : `yt:${r.videoId ?? ''}${r.listaId ? '+' + r.listaId : ''}${r.inicio ? '@' + r.inicio : ''}`
  const ok = obtenido === esperado
  if (!ok) fallos++
  console.log(ok ? 'OK ' : 'MAL', JSON.stringify(entrada).slice(0, 60), '→', obtenido, typeof r === 'string' ? `(${r.slice(0, 50)}…)` : '')
}
console.log(fallos ? `${fallos} FALLOS` : 'Todos los casos correctos')
