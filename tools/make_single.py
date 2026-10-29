import re,glob
root='/workspace/projects/b057e655-c0c1-4cdc-b187-cf16e7554199/kota-nusantara/'
h=open(root+'dist-classic/index.html').read()
js=open(glob.glob(root+'dist-classic/assets/index-*.js')[0]).read().replace('</script>','<\\/script>')
css=open(glob.glob(root+'dist/assets/index-*.css')[0]).read()
h=re.sub(r'\s*<script type="module" crossorigin src="[^"]+"></script>','',h)
h=re.sub(r'\s*<link rel="stylesheet"[^>]*>','',h)
guard='''<script>
(function(){
  function msg(t){var l=document.querySelector('.ld-title');if(l){l.textContent=t;l.style.fontSize='20px';}}
  window.addEventListener('error',function(e){msg('Gagal memuat: '+(e.message||'error')+' (coba Chrome/Edge terbaru)');});
  try{var c=document.createElement('canvas');var ok=!!(window.WebGLRenderingContext&&(c.getContext('webgl2')||c.getContext('webgl')));}catch(e){ok=false;}
  window.__noWebGL=!ok;
  document.addEventListener('DOMContentLoaded',function(){if(!ok)msg('Browser/perangkat ini tidak mendukung WebGL. Aktifkan akselerasi hardware atau pakai Chrome/Edge terbaru.');});
})();
</script>'''
h=h.replace('</head>','<style>'+css+'</style>\n'+guard+'\n</head>',1)
h=h.replace('</body>','<script>'+js+'</script>\n</body>')
for f in ['kota-nusantara.html','index.html']: open('/workspace/work/kota-single/'+f,'w').write(h)
print(len(h))
