# Prueba de punta a punta 5: el admin carga ya validado y valida con su voto; los demás lo ven en vivo.
import json, os, urllib.request
from playwright.sync_api import sync_playwright
URL='http://localhost:8787'
S=os.path.join(os.path.dirname(os.path.abspath(__file__)),'salida'); os.makedirs(S,exist_ok=True)
fallas=[]; oks=0
def chk(c, msg):
    global oks
    if c: oks+=1; print('ok   '+msg)
    else: fallas.append(msg); print('FALLA '+msg)
def post(path, body):
    r=urllib.request.Request(URL+path, data=json.dumps(body).encode(), headers={'content-type':'application/json'})
    return json.load(urllib.request.urlopen(r))
g=post('/dev/crear-grupo',{'nombre':'Admin decide','umbral':4})
CUERPO='Un texto de prueba con unas cuantas palabras para que tenga cuerpo y se pueda leer completo sin problemas.'
def tx(pg, titulo): return pg.locator('.tx', has=pg.locator('.tx-tit', has_text=titulo))
with sync_playwright() as p:
    b=p.chromium.launch()
    def persona(nombre, codigo, ancho=520):
        ctx=b.new_context(viewport={'width':ancho,'height':900})
        pg=ctx.new_page(); errs=[]
        pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e)))
        pg.goto(URL+'/#entrar/'+codigo); pg.wait_for_selector('#fEntrar')
        pg.fill('input[name=n]',nombre); pg.click('#fEntrar button'); pg.wait_for_selector('table.grilla')
        return pg, errs
    def proponer(pg, combo, titulo, validar=False):
        pg.goto(URL+'/#proponer/'+combo); pg.wait_for_selector('#fProp')
        pg.fill('input[name=titulo]',titulo); pg.fill('input[name=autor]','Autor X'); pg.fill('textarea[name=cuerpo]',CUERPO)
        if validar: pg.check('input[name=validar]')
        pg.click('#pEnviar'); pg.wait_for_selector('.tx')
    fede,ef=persona('Federico',g['codigo_admin'])
    ana,ea=persona('Ana',g['codigo'])
    beto,eb=persona('Beto',g['codigo'])

    # ---- cargar ya validado ----
    ana.goto(URL+'/#proponer/venus-mars'); ana.wait_for_selector('#fProp')
    chk(ana.locator('input[name=validar]').count()==0,'un miembro no ve la casilla «Cargarlo ya validado»')
    fede.goto(URL+'/#proponer/venus-mars'); fede.wait_for_selector('#fProp')
    chk(fede.locator('input[name=validar]').count()==1 and not fede.is_checked('input[name=validar]'),'el admin ve la casilla, sin marcar')
    fede.screenshot(path=S+'/e5_admin_proponer.png',full_page=True)
    for pg in (ana,beto): pg.goto(URL+'/#c/venus-mars'); pg.wait_for_selector('.vacio-msg')
    proponer(fede,'venus-mars','Directo del admin',validar=True)
    chk(tx(fede,'Directo del admin').get_attribute('class').split().count('validado')==1,'cargado ya validado: queda validado')
    chk('Validado por Federico (admin)' in tx(fede,'Directo del admin').locator('.v-resumen').inner_text(),'el resumen dice «Validado por Federico (admin)»')
    chk('validado' in fede.inner_text('.sub').lower() and '1 texto validado' in fede.inner_text('.sub'),'cuenta como texto validado de la combinación')
    ana.wait_for_selector('.tx.validado',timeout=8000)
    chk('Validado por Federico (admin)' in tx(ana,'Directo del admin').locator('.v-resumen').inner_text(),'EN VIVO: Ana lo ve validado por el admin')
    chk(ana.locator('[data-validar], [data-devolver]').count()==0,'un miembro no ve los botones del admin')
    chk(fede.locator('[data-devolver]').count()==1,'el admin ve «Devolver a debate» en lo que validó él')
    fede.screenshot(path=S+'/e5_admin_validado.png',full_page=True)

    # ---- proponer normal del admin: en debate, y con «Validar ahora» ----
    proponer(fede,'venus-mars','Normal del admin')
    chk('debate' in tx(fede,'Normal del admin').get_attribute('class'),'sin marcar la casilla, se propone en debate')
    chk(tx(fede,'Normal del admin').locator('[data-validar]').count()==1,'en debate, el admin ve «Validar ahora»')
    chk(tx(fede,'Directo del admin').locator('[data-validar]').count()==0,'en lo ya validado no aparece «Validar ahora»')

    # ---- validar ahora el texto de otra persona ----
    proponer(ana,'venus-mars','De Ana')
    beto.wait_for_selector('.tx-tit:has-text("De Ana")',timeout=8000)
    fede.wait_for_selector('.tx-tit:has-text("De Ana")',timeout=8000)
    chk(tx(beto,'De Ana').locator('[data-validar]').count()==0,'un miembro no ve «Validar ahora» en el texto de otra persona')
    tx(beto,'De Ana').locator('[data-voto=contra]').click()
    tx(beto,'De Ana').locator('.v-motivo input').fill('no me convence'); tx(beto,'De Ana').locator('.v-motivo button[type=submit]').click()
    fede.wait_for_function("document.querySelector('.v-contra')!==null",timeout=8000)
    tx(fede,'De Ana').locator('[data-validar]').click()
    fede.wait_for_selector('dialog[open]'); chk('sin esperar los votos' in fede.inner_text('dialog[open]'),'«Validar ahora» pide confirmación y explica qué pasa')
    fede.click('dialog[open] button[value=ok]')
    ana.wait_for_function("[...document.querySelectorAll('.tx.validado .tx-tit')].some(e=>e.textContent.includes('De Ana'))",timeout=8000)
    chk(True,'EN VIVO: Ana ve que el admin validó su texto')
    t=tx(ana,'De Ana').locator('.v-resumen').inner_text()
    chk('Validado por Federico (admin)' in t and '1 en contra' in t,'el resumen sigue contando el voto en contra: '+t)
    chk('Federico' in tx(ana,'De Ana').locator('.v-quienes').inner_text(),'su voto quedó a favor')
    # más votos en contra no lo mueven
    ana.goto(URL+'/#c/venus-mars'); ana.wait_for_selector('.tx')
    chk(tx(ana,'De Ana').get_attribute('class').split().count('validado')==1,'después de más votos en contra sigue validado')

    # ---- devolver a debate ----
    tx(fede,'De Ana').locator('[data-devolver]').click()
    ana.wait_for_function("[...document.querySelectorAll('.tx.debate .tx-tit')].some(e=>e.textContent.includes('De Ana'))",timeout=8000)
    chk(True,'EN VIVO: al devolverlo a debate, Ana lo ve en debate')
    chk(tx(fede,'De Ana').locator('[data-validar]').count()==1,'en debate otra vez, el admin puede volver a validarlo')

    # ---- editar: quien no es admin pierde la validación del admin (con aviso) ----
    tx(fede,'De Ana').locator('[data-validar]').click(); fede.wait_for_selector('dialog[open]'); fede.click('dialog[open] button[value=ok]')
    ana.wait_for_function("[...document.querySelectorAll('.tx.validado .tx-tit')].some(e=>e.textContent.includes('De Ana'))",timeout=8000)
    tx(ana,'De Ana').locator('.menu summary').click(); tx(ana,'De Ana').locator('[data-acc=editar]').click()
    ana.wait_for_selector('#fProp')
    ana.fill('textarea[name=cuerpo]','Un cuerpo totalmente distinto al de antes, que cambia más que una errata y obliga a reiniciar todo el asunto.')
    ana.wait_for_selector('#pReinicia:not([hidden])')
    chk('validación del admin' in ana.inner_text('#pReinicia'),'editar: avisa que se pierde la validación del admin')
    ana.click('#pEnviar'); ana.wait_for_selector('.tx')
    chk('debate' in tx(ana,'De Ana').get_attribute('class'),'tras el cambio, ya no está validado por el admin')

    # ---- el grupo lo muestra ----
    ana.goto(URL+'/#grupo'); ana.wait_for_selector('#gpBody .caja')
    chk('validó «Directo del admin»' in ana.inner_text('#gpBody') and 'por su cuenta' in ana.inner_text('#gpBody'),'Grupo: la actividad dice que el admin validó por su cuenta')
    chk('validar un texto por su cuenta' in ana.inner_text('#gpBody'),'Grupo: la regla está explicada para todos')

    # ---- en el celular, sin desbordes ----
    cel=b.new_context(viewport={'width':360,'height':800}); pc=cel.new_page()
    pc.goto(URL+'/#volver/'+fede.evaluate("localStorage.getItem('conjugarnos:clave')")); pc.wait_for_selector('table.grilla')
    pc.goto(URL+'/#c/venus-mars'); pc.wait_for_selector('.tx')
    chk(pc.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'360 px: no se desborda con los botones del admin')
    pc.screenshot(path=S+'/e5_admin_360.png',full_page=True)
    for n,e in (('fede',ef),('ana',ea),('beto',eb)): chk(not e, f'{n}: sin errores de consola {e[:2]}')
    b.close()
print(f'\n{oks} bien, {len(fallas)} mal')
raise SystemExit(1 if fallas else 0)
