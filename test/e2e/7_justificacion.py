# Prueba de punta a punta 7: justificación opcional al proponer («Lo agrego porque…»), cada combinación con la suya, editable.
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
g=post('/dev/crear-grupo',{'nombre':'Justificación','umbral':4})
CUERPO='Un texto de prueba con unas cuantas palabras para que tenga cuerpo y se pueda leer completo sin problemas.'
T='El marciano'
def tx(pg, titulo=T): return pg.locator('.tx', has=pg.locator('.tx-tit', has_text=titulo))
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
    fede,ef=persona('Federico',g['codigo_admin'])
    ana,ea=persona('Ana',g['codigo'])
    beto,eb=persona('Beto',g['codigo'])

    # ---- el formulario ofrece la justificación, opcional ----
    ana.goto(URL+'/#proponer/neptune-moon'); ana.wait_for_selector('#fProp')
    chk(ana.locator('textarea[name=justificacion]').count()==1,'el formulario tiene el campo de justificación')
    chk('Justificación (opcional)' in ana.inner_text('#fProp'),'dice «Justificación (opcional)»')
    chk(ana.get_attribute('textarea[name=justificacion]','placeholder')=='Lo agrego porque…','con el ejemplo «Lo agrego porque…»')
    chk(ana.get_attribute('textarea[name=justificacion]','maxlength')=='500','tope de 500 caracteres')

    # ---- proponer SIN justificación: no aparece nada ----
    ana.fill('input[name=titulo]','Sin motivo'); ana.fill('input[name=autor]','Autor X'); ana.fill('textarea[name=cuerpo]',CUERPO)
    ana.click('#pEnviar'); ana.wait_for_selector('.tx')
    chk(tx(ana,'Sin motivo').locator('.tx-just').count()==0,'sin justificación, la tarjeta no muestra ningún bloque')

    # ---- proponer CON justificación para dos combinaciones ----
    ana.goto(URL+'/#proponer/neptune-moon'); ana.wait_for_selector('#fProp')
    ana.fill('input[name=titulo]',T); ana.fill('input[name=autor]','Ray Bradbury'); ana.fill('textarea[name=cuerpo]',CUERPO)
    ana.click('#pSel [data-b=neptune]'); ana.click('#pAgregar')
    chk(ana.locator('#pCombos .chip').count()==2,'dos combinaciones elegidas (Luna + Neptuno y Neptuno solo)')
    ana.fill('textarea[name=justificacion]','Lo agrego porque Tom se disuelve en lo que cada uno desea.\nEs puro Neptuno.')
    ana.click('#pEnviar'); ana.wait_for_selector('.tx')
    t1=tx(ana)
    chk('Justificación de Ana' in t1.locator('.tx-just-t').inner_text(),'la tarjeta muestra «Justificación de Ana»')
    chk('se disuelve en lo que cada uno desea' in t1.locator('.tx-just-c').inner_text(),'con lo que escribió')
    chk('\n' in t1.locator('.tx-just-c').inner_text().strip() or 'Es puro Neptuno' in t1.locator('.tx-just-c').inner_text(),'conserva el salto de línea')
    ana.screenshot(path=S+'/e7_tarjeta.png',full_page=True)
    # en la otra combinación, la misma
    ana.goto(URL+'/#c/neptune'); ana.wait_for_selector('.tx')
    chk('Es puro Neptuno' in tx(ana).locator('.tx-just-c').inner_text(),'la misma justificación quedó en Neptuno solo')

    # ---- Beto la ve en vivo ----
    beto.goto(URL+'/#c/neptune-moon'); beto.wait_for_selector('.tx')
    chk('Justificación de Ana' in tx(beto).locator('.tx-just-t').inner_text(),'Beto ve la justificación de Ana')
    chk(tx(beto).locator('[data-acc=justificar]').count()==0,'Beto no puede cambiar la justificación de Ana')

    # ---- Beto lo propone para otra combinación, con su propia justificación ----
    tx(beto).locator('.menu summary').click(); tx(beto).locator('[data-acc=agregar]').click(); beto.wait_for_selector('dialog[open] #dSel')
    chk(beto.locator('dialog[open] textarea[name=j]').count()==1,'«Proponerlo para otra combinación» también pide la justificación (opcional)')
    beto.click('dialog[open] [data-b=sun]'); beto.click('dialog[open] [data-b=moon]')
    beto.fill('dialog[open] textarea[name=j]','Lo agrego porque el final es muy lunar: el fuego, el duelo, la puerta.')
    beto.click('dialog[open] #dOk'); beto.wait_for_selector('dialog[open]',state='detached')
    beto.goto(URL+'/#c/sun-moon'); beto.wait_for_selector('.tx')
    chk('Justificación de Beto' in tx(beto).locator('.tx-just-t').inner_text(),'en Sol + Luna la firma es la de Beto, no la de Ana')
    chk('muy lunar' in tx(beto).locator('.tx-just-c').inner_text(),'cada combinación guarda la suya')
    beto.goto(URL+'/#c/neptune-moon'); beto.wait_for_selector('.tx')
    chk('Justificación de Ana' in tx(beto).locator('.tx-just-t').inner_text(),'…y la de Luna + Neptuno sigue siendo la de Ana')
    # sin justificación al agregar
    tx(beto).locator('.menu summary').click(); tx(beto).locator('[data-acc=agregar]').click(); beto.wait_for_selector('dialog[open] #dSel')
    beto.click('dialog[open] [data-b=venus]'); beto.click('dialog[open] #dOk'); beto.wait_for_selector('dialog[open]',state='detached')
    beto.goto(URL+'/#c/venus'); beto.wait_for_selector('.tx')
    chk(tx(beto).locator('.tx-just').count()==0,'agregar sin justificación: no se muestra nada')
    tx(beto).locator('.menu summary').click()
    chk(tx(beto).locator('[data-acc=justificar]').inner_text()=='Agregar una justificación','quien lo propuso ve «Agregar una justificación» si no puso ninguna')

    # ---- agregar una justificación después ----
    tx(beto).locator('[data-acc=justificar]').click(); beto.wait_for_selector('dialog[open] textarea[name=j]')
    chk(beto.locator('dialog[open] textarea[name=j]').input_value()=='','el cuadro arranca vacío')
    beto.fill('dialog[open] textarea[name=j]','Se me ocurrió después: Venus, por la ternura de la gente al final.')
    beto.click('dialog[open] button[type=submit]'); beto.wait_for_selector('dialog[open]',state='detached')
    beto.wait_for_selector('.tx-just')
    chk('Justificación de Beto' in tx(beto).locator('.tx-just-t').inner_text(),'queda agregada, firmada por Beto')

    # ---- Ana ve el cambio en vivo; Fede (admin) puede cambiarla; HTML no se ejecuta ----
    fede.goto(URL+'/#c/venus'); fede.wait_for_selector('.tx')
    tx(fede).locator('.menu summary').click()
    chk(tx(fede).locator('[data-acc=justificar]').inner_text()=='Cambiar la justificación','el admin puede cambiar la justificación de cualquiera')
    tx(fede).locator('[data-acc=justificar]').click(); fede.wait_for_selector('dialog[open] textarea[name=j]')
    chk('Venus, por la ternura' in fede.locator('dialog[open] textarea[name=j]').input_value(),'el cuadro viene con la justificación actual')
    fede.fill('dialog[open] textarea[name=j]','<img src=x onerror=window.__xss=1><b>admin</b>')
    fede.click('dialog[open] button[type=submit]'); fede.wait_for_selector('dialog[open]',state='detached')
    fede.wait_for_function("document.querySelector('.tx-just-c')&&document.querySelector('.tx-just-c').textContent.includes('<b>admin</b>')",timeout=8000)
    chk(fede.locator('.tx-just-c img, .tx-just-c b').count()==0 and fede.evaluate("!window.__xss"),'la justificación se muestra como texto, sin ejecutar HTML')
    chk('Justificación de Beto' in tx(fede).locator('.tx-just-t').inner_text(),'sigue firmada por quien la propuso, aunque la edite el admin')
    beto.wait_for_function("document.querySelector('.tx-just-c')&&document.querySelector('.tx-just-c').textContent.includes('admin')",timeout=8000)
    chk(True,'EN VIVO: Beto ve el cambio del admin')

    # ---- sacarla: vaciar el cuadro ----
    tx(beto).locator('.menu summary').click(); tx(beto).locator('[data-acc=justificar]').click(); beto.wait_for_selector('dialog[open] textarea[name=j]')
    beto.fill('dialog[open] textarea[name=j]','   ')
    beto.click('dialog[open] button[type=submit]'); beto.wait_for_selector('dialog[open]',state='detached')
    beto.wait_for_function("document.querySelectorAll('.tx-just').length===0",timeout=8000)
    chk(True,'dejar el cuadro vacío saca la justificación')
    tx(beto).locator('.menu summary').click(); tx(beto).locator('[data-acc=justificar]').click(); beto.wait_for_selector('dialog[open] textarea[name=j]')
    beto.click('dialog[open] [data-cerrar]'); beto.wait_for_selector('dialog[open]',state='detached')
    chk(tx(beto).locator('.tx-just').count()==0,'cancelar no cambia nada')

    # ---- borrador: la justificación se recupera junto con el resto ----
    ana.goto(URL+'/#proponer'); ana.wait_for_selector('#fProp')
    ana.fill('input[name=titulo]','Borrador'); ana.fill('textarea[name=justificacion]','A medio escribir')
    ana.wait_for_timeout(700)
    ana.goto(URL+'/#grilla'); ana.wait_for_selector('table.grilla'); ana.goto(URL+'/#proponer'); ana.wait_for_selector('#fProp')
    chk(ana.input_value('textarea[name=justificacion]')=='A medio escribir','el borrador también guarda la justificación')

    # ---- editar el texto no muestra el campo (se cambia desde «Más», por combinación) ----
    ana.goto(URL+'/#c/neptune-moon'); ana.wait_for_selector('.tx')
    tx(ana).locator('.menu summary').click(); tx(ana).locator('[data-acc=editar]').click(); ana.wait_for_selector('#fProp')
    chk(ana.locator('textarea[name=justificacion]').count()==0,'al editar el texto no aparece el campo (es de cada combinación)')

    # ---- celular ----
    cel=b.new_context(viewport={'width':360,'height':800}); pc=cel.new_page()
    pc.goto(URL+'/#volver/'+ana.evaluate("localStorage.getItem('conjugarnos:clave')")); pc.wait_for_selector('table.grilla')
    pc.goto(URL+'/#c/neptune-moon'); pc.wait_for_selector('.tx')
    chk(pc.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'360 px: sin desborde con la justificación')
    pc.screenshot(path=S+'/e7_360.png',full_page=True)
    pc.goto(URL+'/#proponer'); pc.wait_for_selector('#fProp'); pc.screenshot(path=S+'/e7_form_360.png',full_page=True)
    for n,e in (('fede',ef),('ana',ea),('beto',eb)): chk(not e, f'{n}: sin errores de consola {e[:2]}')
    b.close()
print(f'\n{oks} bien, {len(fallas)} mal')
raise SystemExit(1 if fallas else 0)
