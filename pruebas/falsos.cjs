exports.SPOTIFY = `
window.__log = window.__log || [];
window.onSpotifyIframeApiReady({ createController(el, opts, cb) {
  const f = document.createElement('div'); f.className='falso-spotify';
  f.style.cssText='background:#1db954;color:#000;height:80px;display:flex;align-items:center;padding:0 1rem;font:14px sans-serif';
  el.replaceWith(f);
  const L = {ready:[], playback_update:[]}; const emit=(e,d)=>L[e].forEach(fn=>fn(d));
  let uri = opts.uri, paused = true;
  const dur = () => uri.includes('previewPreview') ? 30000 : 200000;
  f.textContent = 'Spotify simulado: ' + uri;
  const c = {
    addListener(e, fn){ L[e].push(fn) },
    loadUri(u, v, inicio){ uri=u; f.textContent='Spotify simulado: '+u; __log.push('spotify:loadUri '+u+(inicio ? ' @'+inicio : '')); paused=true; setTimeout(()=>emit('ready'), 80) },
    play(){ __log.push('spotify:play '+uri); paused=false; emit('playback_update',{data:{isPaused:false,isBuffering:false,duration:dur(),position:0}}) },
    pause(){ __log.push('spotify:pause'); paused=true; emit('playback_update',{data:{isPaused:true,isBuffering:false,duration:dur(),position:1000}}) },
    togglePlay(){ paused ? c.play() : c.pause() }, seek(sg){ __log.push('spotify:seek '+sg) }, resume(){ c.play() }, destroy(){},
    _terminar(){ emit('playback_update',{data:{isPaused:false,isBuffering:false,duration:dur(),position:dur()-200}}); emit('playback_update',{data:{isPaused:true,isBuffering:false,duration:dur(),position:0}}) },
  };
  window.__spotify = c;
  __log.push('spotify:create ' + uri); cb(c); setTimeout(()=>emit('ready'), 80);
}});`;
exports.YOUTUBE = `
window.__log = window.__log || [];
window.YT = { PlayerState:{PLAYING:1,PAUSED:2,ENDED:0,BUFFERING:3,CUED:5}, Player: class {
  constructor(el, o){ this.o=o; const f=document.createElement('div'); f.className='falso-yt';
    f.style.cssText='background:#c00;color:#fff;width:100%;height:100%;display:grid;place-items:center;font:14px sans-serif';
    el.replaceWith(f); this.f=f; this.state=-1; this.id=o.videoId||o.playerVars.list; f.textContent='YouTube simulado: '+this.id;
    __log.push('yt:create '+this.id+(o.playerVars.start ? ' start='+o.playerVars.start : '')+(o.playerVars.end ? ' end='+o.playerVars.end : '')); window.__yt=this;
    setTimeout(()=>{ if(this.id==='bloqueado01') return o.events.onError({data:150}); o.events.onReady({target:this}) }, 80) }
  playVideo(){ __log.push('yt:play '+this.id); this.state=1; this.o.events.onStateChange({data:1}) }
  pauseVideo(){ __log.push('yt:pause'); this.state=2; this.o.events.onStateChange({data:2}) }
  stopVideo(){ __log.push('yt:stop'); this.state=5; this.o.events.onStateChange({data:5}) }
  loadVideoById(x){ this.id=x.videoId; this.f.textContent='YouTube simulado: '+x.videoId; __log.push('yt:load '+x.videoId+(x.startSeconds != null ? ' start='+x.startSeconds : '')+(x.endSeconds != null ? ' end='+x.endSeconds : ''));
    if(x.videoId==='bloqueado01') return this.o.events.onError({data:150}); this.playVideo() }
  loadPlaylist(x){ this.id=x.list; __log.push('yt:loadPlaylist '+x.list); this.playVideo() }
  getPlayerState(){ return this.state } destroy(){}
  _terminar(){ this.state=0; this.o.events.onStateChange({data:0}) }
}};
window.onYouTubeIframeAPIReady();`;
