# Prueba de punta a punta 6: comentarios en los textos — plegados por defecto, un ícono los despliega, en vivo, borrar.
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
g=post('/dev/crear-grupo',{'nombre':'Comentarios','umbral':4})
CUERPO='Un texto de prueba con unas cuantas palabras para que tenga cuerpo y se pueda leer completo sin problemas.'
T='Texto comentado'
def tx(pg, titulo=T): return pg.locator('.tx', has=pg.locator('.tx-tit', has_text=titulo))
def boton(pg): return tx(pg).locator('[data-coment]')
def comentar(pg, texto, con_atajo=False):
    ta=tx(pg).locator('.com-form textarea'); ta.fill(texto)
    if con_atajo: ta.press('Control+Enter')
    else: tx(pg).locator('.com-form button[type=submit]').click()
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

    # ---- Ana propone el texto para dos combinaciones: Saturno + Plutón y la Luna sola ----
    ana.goto(URL+'/#proponer/saturn-pluto'); ana.wait_for_selector('#fProp')
    ana.fill('input[name=titulo]',T); ana.fill('input[name=autor]','Autor X'); ana.fill('textarea[name=cuerpo]',CUERPO)
    ana.click('#pSel [data-b=moon]'); ana.click('#pAgregar')
    chk(ana.locator('#pCombos .chip').count()==2,'Ana propone el mismo texto para dos combinaciones')
    chk('hasta 12' not in ana.inner_text('#fProp'),'el formulario ya no dice «Podés elegir hasta 12»')
    ana.click('#pEnviar'); ana.wait_for_selector('.tx')

    # ---- plegados por defecto ----
    for pg in (beto,fede,ana): pg.goto(URL+'/#c/saturn-pluto'); pg.wait_for_selector('.tx')
    chk(boton(beto).count()==1,'cada texto tiene el ícono de comentarios')
    chk(boton(beto).get_attribute('aria-expanded')=='false','plegado por defecto (aria-expanded=false)')
    chk(beto.locator('.coment').count()==0,'sin comentarios a la vista')
    chk(boton(beto).locator('svg').count()==1 and boton(beto).locator('.com-n').count()==0,'el ícono es una burbuja y, sin comentarios, no lleva número')
    beto.screenshot(path=S+'/e6_plegado.png',full_page=True)

    # ---- Beto despliega y comenta ----
    boton(beto).click()
    chk(boton(beto).get_attribute('aria-expanded')=='true' and beto.locator('.coment').is_visible(),'tocar el ícono despliega el panel')
    chk('Todavía no hay comentarios' in beto.inner_text('.coment'),'sin comentarios: lo dice')
    tx(beto).locator('.com-form button[type=submit]').click()
    chk('Escribí el comentario' in tx(beto).locator('.com-form .error').inner_text(),'enviar vacío: pide escribir algo')
    comentar(beto,'Me suena más a Saturno solo que a la pareja.')
    beto.wait_for_selector('.com-lista li')
    chk(tx(beto).locator('.com-lista li').count()==1 and 'Me suena más a Saturno solo' in tx(beto).locator('.com-lista').inner_text(),'el comentario aparece en la lista')
    chk(tx(beto).locator('.com-meta b').first.inner_text()=='Beto','con el nombre de quien comentó')
    chk(tx(beto).locator('.com-form textarea').input_value()=='','la casilla queda vacía tras enviar')
    chk(boton(beto).locator('.com-n').inner_text()=='1','el ícono muestra el número: 1')
    chk(tx(beto).locator('[data-borrar-com]').count()==1,'Beto puede borrar su propio comentario')
    chk(boton(beto).get_attribute('aria-expanded')=='true','el panel sigue desplegado tras comentar')

    # ---- en vivo: Ana ve el número, pero el comentario sigue plegado ----
    ana.wait_for_function("document.querySelector('.com-n')&&document.querySelector('.com-n').textContent==='1'",timeout=8000)
    chk(boton(ana).locator('.com-n').inner_text()=='1','EN VIVO: Ana ve que el texto tiene 1 comentario')
    chk(ana.locator('.coment').count()==0 and 'Me suena más a Saturno' not in ana.inner_text('body'),'…pero no ve su contenido hasta desplegar')
    boton(ana).click()
    chk('Me suena más a Saturno solo' in tx(ana).locator('.com-lista').inner_text(),'Ana despliega y lo lee')
    chk(tx(ana).locator('[data-borrar-com]').count()==0,'Ana no puede borrar el de Beto')

    # ---- un borrador a medio escribir sobrevive a lo que hagan los demás ----
    tx(ana).locator('.com-form textarea').fill('Borrador de Ana sin enviar')
    tx(ana).locator('.com-form textarea').focus()
    comentar(beto,'Segundo comentario de Beto',con_atajo=True)
    ana.wait_for_function("document.querySelector('.com-n').textContent==='2'",timeout=8000)
    chk(tx(ana).locator('.com-lista li').count()==2,'EN VIVO: aparece el segundo comentario con el panel abierto')
    chk(tx(ana).locator('.com-form textarea').input_value()=='Borrador de Ana sin enviar','el borrador de Ana se conserva al llegar un comentario nuevo')
    chk(ana.evaluate("document.activeElement&&document.activeElement.matches('.com-form textarea')"),'…y el foco sigue en su casilla')
    chk(boton(beto).locator('.com-n').inner_text()=='2','el atajo Ctrl+Enter también envía')
    comentar(ana,'Respuesta de Ana, con\nun salto de línea')
    ana.wait_for_function("document.querySelectorAll('.tx .com-lista li').length===3",timeout=8000)
    chk('un salto de línea' in tx(ana).locator('.com-lista li').nth(2).inner_text(),'Ana comenta (van en orden: el nuevo al final)')
    chk('<script' not in tx(ana).inner_html().lower(),'sin HTML colado')
    comentar(ana,'<b>negrita</b><img src=x onerror=window.__xss=1>')
    ana.wait_for_function("document.querySelectorAll('.tx .com-lista li').length===4",timeout=8000)
    chk(ana.evaluate("!window.__xss")and tx(ana).locator('.com-lista li').nth(3).locator('.com-cuerpo b, .com-cuerpo img').count()==0 and '<b>negrita</b>' in tx(ana).locator('.com-lista li').nth(3).locator('.com-cuerpo').inner_text(),'un comentario con HTML se muestra como texto, sin ejecutarse')

    # ---- el admin ve «Borrar» en todos y borra uno ----
    fede.wait_for_function("document.querySelector('.com-n')&&document.querySelector('.com-n').textContent==='4'",timeout=8000)
    boton(fede).click()
    chk(tx(fede).locator('[data-borrar-com]').count()==4,'el admin puede borrar cualquier comentario (4 de 4)')
    fede.screenshot(path=S+'/e6_abierto.png',full_page=True)
    tx(fede).locator('[data-borrar-com]').nth(3).click(); fede.wait_for_selector('dialog[open]')
    fede.click('dialog[open] button.boton.sec')                       # cancelar no borra
    chk(tx(fede).locator('.com-lista li').count()==4,'cancelar el diálogo no borra nada')
    tx(fede).locator('[data-borrar-com]').nth(3).click(); fede.wait_for_selector('dialog[open]'); fede.click('dialog[open] button[value=ok]')
    fede.wait_for_function("document.querySelectorAll('.tx .com-lista li').length===3",timeout=8000)
    ana.wait_for_function("document.querySelector('.com-n').textContent==='3'",timeout=8000)
    chk(boton(ana).locator('.com-n').inner_text()=='3','EN VIVO: el borrado le llega a Ana (3)')
    # Beto borra el suyo
    tx(beto).locator('[data-borrar-com]').first.click(); beto.wait_for_selector('dialog[open]'); beto.click('dialog[open] button[value=ok]')
    beto.wait_for_function("document.querySelectorAll('.tx .com-lista li').length===2",timeout=8000)
    chk(True,'Beto borra el suyo (quedan 2)')

    # ---- plegar de nuevo ----
    boton(beto).click()
    chk(beto.locator('.coment').count()==0 and boton(beto).get_attribute('aria-expanded')=='false','tocar de nuevo el ícono lo pliega')

    # ---- el mismo texto en otra combinación trae los mismos comentarios ----
    if True:
        beto.goto(URL+'/#c/moon'); beto.wait_for_selector('.tx')
        chk(boton(beto).locator('.com-n').inner_text()=='2','en la Luna sola el mismo texto muestra los mismos 2 comentarios')

    # ---- Grupo: la actividad dice quién comentó, sin el contenido ----
    ana.goto(URL+'/#grupo'); ana.wait_for_selector('#gpBody .caja')
    t=ana.inner_text('#gpBody')
    chk('comentó «'+T+'»' in t,'Grupo: la actividad dice «comentó …»')
    chk('Me suena más a Saturno' not in t and 'Respuesta de Ana' not in t,'Grupo: no se cuela el contenido de los comentarios')

    # ---- celular ----
    cel=b.new_context(viewport={'width':360,'height':800}); pc=cel.new_page()
    pc.goto(URL+'/#volver/'+ana.evaluate("localStorage.getItem('conjugarnos:clave')")); pc.wait_for_selector('table.grilla')
    pc.goto(URL+'/#c/saturn-pluto'); pc.wait_for_selector('.tx')
    boton(pc).click(); pc.wait_for_selector('.coment')
    chk(pc.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'360 px: sin desborde con los comentarios abiertos')
    chk(boton(pc).bounding_box()['height']>=36 and boton(pc).bounding_box()['width']>=36,'el ícono se puede tocar con el dedo (≥ 36 px)')
    pc.screenshot(path=S+'/e6_360.png',full_page=True)
    for n,e in (('fede',ef),('ana',ea),('beto',eb)): chk(not e, f'{n}: sin errores de consola {e[:2]}')
    b.close()
print(f'\n{oks} bien, {len(fallas)} mal')
raise SystemExit(1 if fallas else 0)
