# Prueba 3: casos borde — código malicioso en los textos y nombres, texto repetido, tope de palabras, borrador, 12 combinaciones, rutas raras, 360 px.
import json, secrets, sys, urllib.request
from playwright.sync_api import sync_playwright
URL='http://localhost:8787'
import os; S=os.path.join(os.path.dirname(os.path.abspath(__file__)),'salida'); os.makedirs(S,exist_ok=True)
fallas=[]; oks=0
def chk(c, msg):
    global oks
    if c: oks+=1; print('ok   '+msg)
    else: fallas.append(msg); print('FALLA '+msg)
def post(path, body):
    r=urllib.request.Request(URL+path, data=json.dumps(body).encode(), headers={'content-type':'application/json'})
    return json.load(urllib.request.urlopen(r))
def rpc(fn, **a): return post('/rest/v1/rpc/'+fn, a)
g=post('/dev/crear-grupo',{'nombre':'Borde','umbral':4})
k1=secrets.token_hex(32); k2=secrets.token_hex(32)
rpc('unirse',p_codigo=g['codigo_admin'],p_nombre='<b>Fede</b>',p_clave=k1)
rpc('unirse',p_codigo=g['codigo'],p_nombre='Ana',p_clave=k2)
XSS='<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'
rpc('proponer',p_clave=k2,p_titulo='Título '+XSS,p_autor='Autor '+XSS,p_cuerpo='Cuerpo '+XSS+'\n\nSegundo párrafo & más <b>negrita</b>',p_combinaciones=[['venus','mars']])
with sync_playwright() as p:
    b=p.chromium.launch()
    def vuelve(k, ancho=360):
        ctx=b.new_context(viewport={'width':ancho,'height':800}); pg=ctx.new_page(); errs=[]
        pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e)))
        pg.goto(URL+'/#volver/'+k); pg.wait_for_selector('table.grilla'); return pg, errs
    fede,ef=vuelve(k1)
    chk('<b>Fede</b>' in fede.inner_text('#quien'),'un nombre con etiquetas se muestra como texto, no se interpreta')
    fede.goto(URL+'/#c/venus-mars'); fede.wait_for_selector('.tx')
    chk(fede.evaluate('window.__xss')is None,'textos con <script> e <img onerror> no ejecutan nada')
    chk(fede.locator('.tx-cuerpo img, .tx-cuerpo script, .tx-cuerpo b, .tx-tit *, .tx-meta *:not(.mp-au)').count()==0,'no se crean elementos a partir del texto de otros')
    chk('<script>' in fede.inner_text('.tx'),'el código aparece como texto visible')
    # 360 px: grilla entra sin scroll horizontal
    fede.goto(URL+'/#grilla'); fede.wait_for_selector('table.grilla')
    chk(fede.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'360 px: la grilla no se desborda')
    fede.screenshot(path=S+'/e3_360_grilla.png',full_page=True)
    # tope de palabras en la página
    fede.goto(URL+'/#proponer/moon'); fede.wait_for_selector('#fProp')
    fede.fill('input[name=titulo]','Largo'); fede.fill('input[name=autor]','X');
    fede.fill('textarea[name=cuerpo]',' '.join(['a']*2001))
    chk('2.001 de 2.000' in fede.inner_text('#pCuenta') and fede.locator('#pCuenta.pasa').count()==1,'el contador avisa cuando pasa de 2.000 palabras')
    fede.click('#pEnviar'); chk('máximo' in fede.inner_text('#pAviso'),'no deja enviar más de 2.000 palabras')
    fede.fill('textarea[name=cuerpo]',' '.join(['a']*2000)); chk(fede.locator('#pCuenta.pasa').count()==0,'2.000 justo está bien')
    # la base no tiene la función que pide la página (se actualizó una y la otra no): lo dice claro
    fede.route('**/rest/v1/rpc/proponer', lambda r: r.fulfill(status=404, content_type='application/json', body='{"code":"PGRST202","message":"Could not find the function public.proponer(p_cuerpo) in the schema cache"}'))
    fede.click('#pEnviar'); fede.wait_for_selector('#pAviso:not([hidden])')
    chk('no coinciden' in fede.inner_text('#pAviso') and 'schema.sql' in fede.inner_text('#pAviso'),'base desactualizada: el aviso dice qué hacer, no «algo salió mal»')
    fede.unroute('**/rest/v1/rpc/proponer')
    # borrador: se guarda y vuelve
    fede.fill('textarea[name=cuerpo]','Texto a medias para el borrador'); fede.wait_for_timeout(700)
    fede.goto(URL+'/#grilla'); fede.goto(URL+'/#proponer'); fede.wait_for_selector('#fProp')
    chk(fede.input_value('input[name=titulo]')=='Largo' and 'a medias' in fede.input_value('textarea[name=cuerpo]'),'borrador recuperado al volver a Proponer')
    fede.click('#pDescartar'); fede.wait_for_selector('#fProp'); chk(fede.input_value('input[name=titulo]')=='','«Empezar de cero» borra el borrador')
    # sin combinación elegida
    fede.fill('input[name=titulo]','Sin combo'); fede.fill('input[name=autor]','X'); fede.fill('textarea[name=cuerpo]','hola')
    fede.click('#pEnviar'); chk('combinación' in fede.inner_text('#pAviso'),'sin combinación: avisa')
    # una combinación elegida pero sin «agregar»: se agrega sola al enviar
    fede.click('.cmb-pl[data-b=sun]'); fede.click('.cmb-pl[data-b=moon]'); fede.click('#pEnviar'); fede.wait_for_selector('.tx')
    chk('Sol + Luna' in fede.inner_text('h2') ,'la combinación elegida sin apretar «agregar» se usa igual')
    # varias combinaciones en un texto, y límite de 12
    fede.goto(URL+'/#proponer'); fede.wait_for_selector('#fProp')
    fede.fill('input[name=titulo]','Muchas'); fede.fill('input[name=autor]','Z'); fede.fill('textarea[name=cuerpo]','uno dos')
    ids=['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto']
    n=0
    for i,a in enumerate(ids):
        for c in ids[i+1:]:
            if n>=12: break
            fede.click(f'.cmb-pl[data-b={a}]'); fede.click(f'.cmb-pl[data-b={c}]'); fede.click('#pAgregar'); n+=1
    chk(fede.locator('#pCombos .chip').count()==12,'se pueden agregar 12 combinaciones')
    fede.click(f'.cmb-pl[data-b=sun]'); fede.click(f'.cmb-pl[data-b=pluto]'); chk(fede.locator('#pAgregar:disabled').count()==1,'con 12 ya no deja agregar más')
    fede.click('#pCombos .x >> nth=0'); chk(fede.locator('#pCombos .chip').count()==11,'se puede quitar una combinación')
    fede.click('#pEnviar'); fede.wait_for_selector('.tx')
    # texto repetido → proponer el existente a estas combinaciones
    fede.goto(URL+'/#proponer/mars-jupiter'); fede.wait_for_selector('#fProp')
    fede.fill('input[name=titulo]','muchas'); fede.fill('input[name=autor]','z'); fede.fill('textarea[name=cuerpo]','uno dos'); fede.click('#pEnviar')
    fede.wait_for_selector('#pYa'); chk('Ya hay un texto' in fede.inner_text('#pAviso'),'texto repetido: avisa')
    fede.click('#pYa'); fede.wait_for_selector('.tx'); chk(True,'…y ofrece proponer el que ya existe para esas combinaciones')
    # rutas raras
    for ruta in ('#c/pluto-saturn','#c/foo','#c/sun-sun','#c/sun-moon-mars','#xyz','#editar'):
        fede.goto(URL+'/'+ruta); fede.wait_for_timeout(300)
        chk(fede.locator('main h2').count()>=1 and not fede.locator('.nota.mal').count(), f'ruta rara {ruta}: no se rompe')
    chk(fede.url.endswith('#grilla') or '#c/' in fede.url,'una ruta inválida vuelve a la grilla')
    # ya adentro, abrir una invitación
    fede.goto(URL+'/#entrar/'+g['codigo']); fede.wait_for_selector('main h2'); chk('Ya estás adentro' in fede.inner_text('main'),'abrir una invitación estando adentro: no pide nombre de nuevo')
    # invitación mala
    ctx=b.new_context(); pg=ctx.new_page(); pg.goto(URL+'/#entrar/zzzzzzzzzzzzzzzzzzzz'); pg.wait_for_selector('#fEntrar'); pg.fill('input[name=n]','Nadie'); pg.click('#fEntrar button'); pg.wait_for_selector('#eEnt:not([hidden])')
    chk('invitación no sirve' in pg.inner_text('#eEnt').lower() or 'link de invitación no sirve' in pg.inner_text('#eEnt').lower(),'invitación inválida: lo dice')
    pg.goto(URL+'/#entrar/'+g['codigo_admin']); pg.wait_for_selector('#fEntrar'); pg.fill('input[name=n]','Otro'); pg.click('#fEntrar button'); pg.wait_for_selector('#eEnt:not([hidden])')
    chk('no sirve' in pg.inner_text('#eEnt'),'el link de admin es de un solo uso')
    # pegar link en la bienvenida
    pg.goto(URL+'/#'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#fCodigo')
    pg.fill('#fCodigo input', URL+'/#entrar/'+g['codigo']); pg.click('#fCodigo button'); pg.wait_for_selector('#fEntrar'); chk(True,'bienvenida: pegar el link de invitación lleva a elegir nombre')
    pg.goto(URL+'/#'); pg.wait_for_selector('#fCodigo'); pg.fill('#fCodigo input','esto no es un link'); pg.click('#fCodigo button'); chk('no parece' in pg.inner_text('#eCodigo'),'bienvenida: algo que no es link se rechaza')
    ef=[e for e in ef if '400' not in e and '404' not in e]; chk(not ef,f'sin errores de consola (salvo los 400 y el 404 que se provoca a propósito) {ef[:2]}')
    b.close()
print(f'\n{oks} bien, {len(fallas)} mal'); sys.exit(1 if fallas else 0)
