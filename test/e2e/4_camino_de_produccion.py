# Prueba 4: el camino de PRODUCCIÓN en un navegador de verdad. config.js apunta a «Supabase» (acá, el servidor de desarrollo, que habla
# el protocolo de Realtime por WebSocket): se usa el cliente empaquetado, no el atajo SSE. Los cambios tienen que llegar en segundos.
import json, secrets, sys, urllib.request
from playwright.sync_api import sync_playwright
URL='http://localhost:8787'
fallas=[]; oks=0
def chk(c, msg):
    global oks
    if c: oks+=1; print('ok   '+msg)
    else: fallas.append(msg); print('FALLA '+msg)
def post(path, body):
    r=urllib.request.Request(URL+path, data=json.dumps(body).encode(), headers={'content-type':'application/json'})
    return json.load(urllib.request.urlopen(r))
def rpc(fn, **a): return post('/rest/v1/rpc/'+fn, a)
g=post('/dev/crear-grupo',{'nombre':'Producción','umbral':2})
ka=secrets.token_hex(32); kb=secrets.token_hex(32)
rpc('unirse',p_codigo=g['codigo_admin'],p_nombre='Ana',p_clave=ka); rpc('unirse',p_codigo=g['codigo'],p_nombre='Beto',p_clave=kb)
CONFIG="window.CONJUGARNOS={url:location.origin,clave_publica:'sb_publishable_de_prueba'};"
with sync_playwright() as p:
    b=p.chromium.launch()
    def persona(k):
        ctx=b.new_context(viewport={'width':420,'height':800}); ctx.route('**/config.js', lambda r: r.fulfill(body=CONFIG, content_type='text/javascript'))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        evs=[]; pg.on('request', lambda r: evs.append(r.url) if 'dev/eventos' in r.url else None)
        pg.goto(URL+'/#volver/'+k); pg.wait_for_selector('table.grilla'); return pg, errs, evs
    ana,ea,va=persona(ka); beto,eb,vb=persona(kb)
    ana.goto(URL+'/#c/jupiter'); ana.wait_for_selector('.vacio-msg'); beto.goto(URL+'/#grupo'); beto.wait_for_selector('#gVivo')
    ana.wait_for_function("document.querySelector('#vivo').dataset.e==='vivo'", timeout=8000); chk(True,'el indicador pasa a «en vivo» por el WebSocket')
    chk(not va and not vb,'no usa el atajo de desarrollo (SSE)')
    chk('Conectado' in beto.inner_text('#gVivo'),'Grupo dice «Conectado: los cambios aparecen al instante»')
    # Beto propone por la API directa; Ana lo ve sin recargar (tiene que llegar por Realtime: el respaldo tarda 45 s)
    t0=beto.evaluate('Date.now()')
    rpc('proponer',p_clave=kb,p_titulo='Por websocket',p_autor='X',p_cuerpo='hola mundo',p_combinaciones=[['jupiter']])
    ana.wait_for_selector('.tx', timeout=6000); chk(True,'EN VIVO (WebSocket): Ana ve el texto nuevo en pocos segundos')
    rpc('votar',p_clave=ka,p_vinculo=rpc('combinacion',p_clave=ka,p_a='jupiter',p_b=None)[0]['vinculo_id'],p_valor='favor')
    ana.wait_for_selector('.tx.validado', timeout=6000); chk(True,'EN VIVO (WebSocket): se valida con 2 votos y lo ve')
    chk(not ea and not eb, f'sin errores de página {ea[:1]} {eb[:1]}')
    b.close()
print(f'\n{oks} bien, {len(fallas)} mal'); sys.exit(1 if fallas else 0)
