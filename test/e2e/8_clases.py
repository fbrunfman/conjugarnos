# Prueba de punta a punta 8: además de textos, biografías, películas y canciones (con link opcional).
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
g=post('/dev/crear-grupo',{'nombre':'Clases','umbral':4})
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
    fede,ef=persona('Federico',g['codigo_admin'])
    ana,ea=persona('Ana',g['codigo'])
    beto,eb=persona('Beto',g['codigo'])
    def clase(pg, nombre): pg.locator('.seg-op', has_text=nombre).click()
    def txt(pg, sel): return pg.locator(sel).inner_text()
    def abrir(pg, combo='neptune-moon'): pg.goto(URL+'/#proponer/'+combo); pg.wait_for_selector('#fProp')
    def editar(pg, titulo):
        # el menú «Más» se cierra si justo llega un cambio en vivo y la página se vuelve a dibujar: se reintenta
        for _ in range(4):
            tx(pg,titulo).locator('.menu summary').click()
            try: tx(pg,titulo).locator('[data-acc=editar]').click(timeout=2500); break
            except Exception: pass
        pg.wait_for_selector('#fProp')

    # ---- el formulario: cuatro tipos, y los campos cambian ----
    abrir(ana)
    chk(ana.locator('.seg-op').count()==4 and [e.strip() for e in ana.locator('.seg-op').all_inner_texts()]==['Texto','Biografía','Película','Canción'],'se elige el tipo: Texto, Biografía, Película o Canción')
    chk(ana.is_checked('input[name=clase][value=texto]'),'por defecto es Texto')
    chk((txt(ana,'#lTit'),txt(ana,'#lAut'),txt(ana,'#lCue'))==('Título','Autor o autora','El texto') and ana.locator('#cEnlace').is_hidden(),'Texto: Título, Autor o autora, El texto; sin link')
    clase(ana,'Biografía')
    chk((txt(ana,'#lTit'),txt(ana,'#lAut'),txt(ana,'#lCue'))==('Persona','Escrita por','La biografía') and ana.locator('#cEnlace').is_hidden(),'Biografía: Persona, Escrita por, La biografía; sin link')
    clase(ana,'Película')
    chk((txt(ana,'#lTit'),txt(ana,'#lAut'),txt(ana,'#lCue'))==('Título de la película','Dirección','Sinopsis o nota (opcional)') and ana.locator('#cEnlace').is_visible(),'Película: título, Dirección, Sinopsis (opcional) y link')
    clase(ana,'Canción')
    chk((txt(ana,'#lTit'),txt(ana,'#lAut'),txt(ana,'#lCue'))==('Título de la canción','Artista','Nota o fragmento de la letra (opcional)'),'Canción: título, Artista, nota (opcional)')
    chk('Link de la canción (opcional)' in txt(ana,'#cEnlace') and 'YouTube' in txt(ana,'#cEnlace'),'Canción: «Link de la canción (opcional)» con ejemplos')
    ana.screenshot(path=S+'/e8_form_cancion.png',full_page=True)
    clase(ana,'Texto')
    chk(ana.locator('#cEnlace').is_hidden() and txt(ana,'#lCue')=='El texto','volver a Texto esconde el link')

    # ---- validaciones por tipo ----
    abrir(ana)
    ana.fill('input[name=titulo]','Algo'); ana.fill('input[name=autor]','Alguien'); ana.click('#pEnviar')
    chk('Falta el texto.' in txt(ana,'#pAviso'),'Texto sin cuerpo: «Falta el texto.»')
    clase(ana,'Biografía'); ana.click('#pEnviar')
    chk('Falta la biografía.' in txt(ana,'#pAviso'),'Biografía sin cuerpo: «Falta la biografía.»')
    clase(ana,'Canción'); ana.fill('input[name=titulo]',''); ana.click('#pEnviar')
    chk('Falta el título de la canción.' in txt(ana,'#pAviso'),'Canción sin título: «Falta el título de la canción.»')
    ana.fill('input[name=titulo]','Heroes'); ana.fill('input[name=autor]','')
    ana.click('#pEnviar'); chk('Falta el artista o la banda.' in txt(ana,'#pAviso'),'Canción sin artista: «Falta el artista o la banda.»')
    ana.fill('input[name=autor]','David Bowie')
    for malo in ('javascript:alert(1)','ftp://x.org/a'):
        ana.fill('input[name=enlace]',malo); ana.click('#pEnviar')
        chk('El link no sirve' in txt(ana,'#pAviso'),f'link rechazado: {malo}')

    # ---- una canción sin cuerpo y con link (sin «https://»: se lo pone solo) ----
    ana.fill('input[name=enlace]','www.youtube.com/watch?v=abc123')
    ana.click('#pSel [data-b=neptune]'); ana.click('#pAgregar')       # Luna + Neptuno (ya elegida por la dirección) y Neptuno solo
    ana.fill('textarea[name=justificacion]','Lo agrego porque suena a disolverse.')
    ana.click('#pEnviar'); ana.wait_for_selector('.tx')
    t=tx(ana,'Heroes')
    chk(t.locator('.clase-et').inner_text()=='Canción' and 'de David Bowie' in t.locator('.tx-meta').first.inner_text(),'la tarjeta dice «Canción de David Bowie»')
    chk(t.locator('.tx-cuerpo').count()==0 and 'palabra' not in t.inner_text() and 'Leer completo' not in t.inner_text(),'sin cuerpo: no hay texto, ni «palabras», ni «Leer completo»')
    a=t.locator('.tx-enlace a')
    chk(a.get_attribute('href')=='https://www.youtube.com/watch?v=abc123','el link quedó con https:// (se lo puso la página)')
    chk(a.get_attribute('target')=='_blank' and 'noopener' in a.get_attribute('rel') and 'noreferrer' in a.get_attribute('rel'),'se abre en otra pestaña, sin pasarle nada a esa página')
    chk('Escuchar' in a.inner_text() and 'youtube.com' in t.locator('.tx-enlace').inner_text() and 'www.' not in t.locator('.tx-enlace .menor').inner_text(),'dice «Escuchar» y el sitio (youtube.com)')
    chk('Justificación de Ana' in t.inner_text(),'la justificación también va con una canción')
    ana.screenshot(path=S+'/e8_cancion.png',full_page=True)

    # ---- Beto la ve en vivo y puede votarla ----
    beto.goto(URL+'/#c/neptune-moon'); beto.wait_for_selector('.tx')
    chk(tx(beto,'Heroes').locator('.tx-enlace a').count()==1 and tx(beto,'Heroes').locator('[data-voto=favor]').count()==1,'Beto ve la canción con su link y puede votar')
    tx(beto,'Heroes').locator('[data-voto=favor]').click()
    beto.wait_for_function("document.querySelector('.v-quienes')&&document.querySelector('.v-quienes').textContent.includes('Beto')",timeout=8000)
    chk(True,'Beto vota la canción')

    # ---- una película: con sinopsis y sin link ----
    abrir(ana,'neptune-moon'); clase(ana,'Película')
    ana.fill('input[name=titulo]','Solaris'); ana.fill('input[name=autor]','Andrei Tarkovski'); ana.fill('textarea[name=cuerpo]','Un psicólogo viaja a una estación espacial donde los recuerdos toman forma.')
    ana.click('#pEnviar'); ana.wait_for_selector('.tx')
    t=tx(ana,'Solaris')
    chk(t.locator('.clase-et').inner_text()=='Película' and 'de Andrei Tarkovski' in t.locator('.tx-meta').first.inner_text(),'la tarjeta dice «Película de Andrei Tarkovski»')
    chk(t.locator('.tx-enlace').count()==0 and 'recuerdos toman forma' in t.locator('.tx-cuerpo').inner_text(),'sin link no hay botón; la sinopsis se ve')
    # una película solo con título y dirección
    abrir(ana,'neptune-moon'); clase(ana,'Película')
    ana.fill('input[name=titulo]','Stalker'); ana.fill('input[name=autor]','Andrei Tarkovski'); ana.fill('input[name=enlace]','https://vimeo.com/123')
    ana.click('#pEnviar'); ana.wait_for_selector('.tx')
    chk(tx(ana,'Stalker').locator('.tx-cuerpo').count()==0 and 'Ver' in tx(ana,'Stalker').locator('.tx-enlace a').inner_text(),'película solo con título, dirección y link: botón «Ver»')

    # ---- una biografía ----
    abrir(ana,'neptune-moon'); clase(ana,'Biografía')
    ana.fill('input[name=titulo]','Clarice Lispector'); ana.fill('input[name=autor]','Wikipedia'); ana.fill('textarea[name=cuerpo]','Nació en Ucrania en 1920 y creció en Recife.')
    ana.click('#pEnviar'); ana.wait_for_selector('.tx')
    t=tx(ana,'Clarice Lispector')
    chk(t.locator('.clase-et').inner_text()=='Biografía' and 'por Wikipedia' in t.locator('.tx-meta').first.inner_text(),'la tarjeta dice «Biografía por Wikipedia»')
    # un texto común no lleva etiqueta
    abrir(ana,'neptune-moon'); ana.fill('input[name=titulo]','Un cuento'); ana.fill('input[name=autor]','Ray Bradbury'); ana.fill('textarea[name=cuerpo]','Tom se deshizo ante los ojos de todos.')
    ana.click('#pEnviar'); ana.wait_for_selector('.tx')
    chk(tx(ana,'Un cuento').locator('.clase-et').count()==0 and tx(ana,'Un cuento').locator('.tx-enlace').count()==0,'un texto común no lleva etiqueta ni link (como siempre)')

    # ---- el mismo título y autor en otra clase no choca; en la misma sí ----
    abrir(ana,'neptune-moon'); clase(ana,'Película')
    ana.fill('input[name=titulo]','Heroes'); ana.fill('input[name=autor]','David Bowie'); ana.click('#pEnviar'); ana.wait_for_selector('.tx')
    chk(tx(ana,'Heroes').count()==2,'«Heroes» de David Bowie como película no choca con la canción')
    abrir(ana,'neptune-moon'); clase(ana,'Película')
    ana.fill('input[name=titulo]','Heroes'); ana.fill('input[name=autor]','David Bowie'); ana.click('#pEnviar')
    ana.wait_for_selector('#pYa'); chk('Ya hay algo con ese título' in txt(ana,'#pAviso'),'repetido en la misma clase: avisa')

    # ---- editar: el tipo no se cambia; el link sí ----
    ana.goto(URL+'/#c/neptune-moon'); ana.wait_for_selector('.tx')
    editar(ana,'Stalker')
    chk('película' in txt(ana,'#pClaseFija') and ana.locator('.seg-op').count()==0,'al editar se ve «Es: película» y no se puede cambiar')
    chk(ana.input_value('input[name=enlace]')=='https://vimeo.com/123' and txt(ana,'#lAut')=='Dirección','el formulario trae el link y los nombres de película')
    ana.fill('input[name=enlace]','https://vimeo.com/456'); ana.click('#pEnviar'); ana.wait_for_selector('.tx')
    chk(tx(ana,'Stalker').locator('.tx-enlace a').get_attribute('href')=='https://vimeo.com/456','el link cambió')
    editar(ana,'Stalker')
    ana.fill('input[name=enlace]',''); ana.click('#pEnviar'); ana.wait_for_selector('.tx')
    chk(tx(ana,'Stalker').locator('.tx-enlace').count()==0,'vaciar el link lo saca')
    # un texto común no ofrece link al editar
    editar(ana,'Un cuento')
    chk(ana.locator('#cEnlace').is_hidden() and 'texto' in txt(ana,'#pClaseFija'),'editar un texto: sin link')

    # ---- el admin carga una canción ya validada ----
    abrir(fede,'sun'); clase(fede,'Canción'); fede.fill('input[name=titulo]','Gracias a la vida'); fede.fill('input[name=autor]','Violeta Parra'); fede.check('input[name=validar]')
    fede.click('#pEnviar'); fede.wait_for_selector('.tx')
    chk('validado' in tx(fede,'Gracias a la vida').get_attribute('class') and 'Validado por Federico (admin)' in tx(fede,'Gracias a la vida').inner_text(),'el admin puede cargar una canción ya validada')

    # ---- borrador: se recuerdan el tipo y el link ----
    abrir(beto,'mars'); clase(beto,'Canción'); beto.fill('input[name=titulo]','En borrador'); beto.fill('input[name=enlace]','https://open.spotify.com/track/1')
    beto.wait_for_timeout(700)
    beto.goto(URL+'/#grilla'); beto.wait_for_selector('table.grilla'); abrir(beto,'mars')
    chk(beto.is_checked('input[name=clase][value=cancion]') and beto.input_value('input[name=enlace]')=='https://open.spotify.com/track/1' and txt(beto,'#lAut')=='Artista','el borrador recupera el tipo, el título y el link')

    # ---- proponer rápido no deja un borrador viejo (el guardado pendiente se cancela al enviar) ----
    abrir(beto,'venus'); beto.fill('input[name=titulo]','Rápido'); beto.fill('input[name=autor]','Alguien'); beto.fill('textarea[name=cuerpo]','Texto enviado enseguida.')
    beto.click('#pEnviar'); beto.wait_for_selector('.tx'); beto.wait_for_timeout(900)
    chk(beto.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('conjugarnos:borrador')).length")==0,'enviar enseguida no deja un borrador viejo para la próxima vez')

    # ---- el menú «Más» abierto no se cierra cuando llega un cambio en vivo ----
    ana.goto(URL+'/#c/neptune-moon'); ana.wait_for_selector('.tx'); ana.wait_for_timeout(600)
    tx(ana,'Solaris').locator('.menu summary').click()
    beto.goto(URL+'/#c/neptune-moon'); beto.wait_for_selector('.tx'); tx(beto,'Solaris').locator('[data-voto=favor]').click()
    ana.wait_for_function("[...document.querySelectorAll('.tx')].some(t=>t.textContent.includes('Solaris')&&t.querySelector('.v-quienes')&&t.querySelector('.v-quienes').textContent.includes('Beto'))",timeout=8000)
    chk(tx(ana,'Solaris').locator('.menu').evaluate('m=>m.open'),'«Más» sigue abierto después de un cambio en vivo')

    # ---- Grupo y grilla ----
    ana.goto(URL+'/#grupo'); ana.wait_for_selector('#gpBody .caja')
    tg=txt(ana,'#gpBody')
    chk('propuso la canción «Heroes»' in tg and 'propuso la película «Solaris»' in tg and 'propuso la biografía de «Clarice Lispector»' in tg and 'propuso «Un cuento»' in tg,'Grupo: la actividad dice qué se propuso (canción, película, biografía, texto)')
    ana.goto(URL+'/#grilla'); ana.wait_for_selector('table.grilla')
    chk('aporte' in ana.inner_text('main') and 'texto validado' not in ana.inner_text('main'),'la grilla habla de aportes, no de textos')

    # ---- celular ----
    cel=b.new_context(viewport={'width':360,'height':800}); pc=cel.new_page()
    pc.goto(URL+'/#volver/'+ana.evaluate("localStorage.getItem('conjugarnos:clave')")); pc.wait_for_selector('table.grilla')
    pc.goto(URL+'/#c/neptune-moon'); pc.wait_for_selector('.tx')
    chk(pc.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'360 px: sin desborde en la combinación')
    pc.screenshot(path=S+'/e8_360.png',full_page=True)
    pc.goto(URL+'/#proponer'); pc.wait_for_selector('#fProp'); pc.locator('.seg-op', has_text='Canción').click()
    chk(pc.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'360 px: sin desborde en el formulario')
    pc.screenshot(path=S+'/e8_form_360.png',full_page=True)
    for n,e in (('fede',ef),('ana',ea),('beto',eb)):
        e=[x for x in e if '400' not in x]     # el 400 es el aviso de «repetido», provocado a propósito
        chk(not e, f'{n}: sin errores de consola {e[:2]}')
    b.close()
print(f'\n{oks} bien, {len(fallas)} mal')
raise SystemExit(1 if fallas else 0)
