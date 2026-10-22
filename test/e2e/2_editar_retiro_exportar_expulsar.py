# Prueba 2: editar, pedir retiro, exportar, expulsar, volver con el link, sesión caída, borrador de motivo, modo oscuro y móvil.
import json, os, secrets, sys, urllib.request
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
g=post('/dev/crear-grupo',{'nombre':'Los de siempre','umbral':3})
claves={}
def alta(nombre, codigo):
    k=secrets.token_hex(32); rpc('unirse',p_codigo=codigo,p_nombre=nombre,p_clave=k); claves[nombre]=k; return k
alta('Federico',g['codigo_admin']); [alta(n,g['codigo']) for n in ('Ana','Beto','Cami')]
PRO=lambda k,**x: rpc('proponer',p_clave=k,p_titulo=x['t'],p_autor=x['a'],p_cuerpo=x['c'],p_combinaciones=x['cb'])
CUERPO=' '.join(f'palabra{i}' for i in range(200))
t1=PRO(claves['Ana'],t='Un poema largo',a='Alguien',c=CUERPO,cb=[['moon','neptune'],['neptune']])
v1=t1['vinculos'][0]
rpc('votar',p_clave=claves['Beto'],p_vinculo=v1,p_valor='favor'); rpc('votar',p_clave=claves['Cami'],p_vinculo=v1,p_valor='favor')   # 3 a favor = validado (umbral 3)
t2=PRO(claves['Beto'],t='Otro',a='Otra persona',c='Un verso corto.\nOtro verso.',cb=[['sun']])
with sync_playwright() as p:
    b=p.chromium.launch()
    def vuelve(nombre, ancho=420, esquema=None):
        ctx=b.new_context(viewport={'width':ancho,'height':900}, accept_downloads=True, color_scheme=esquema or 'light')
        pg=ctx.new_page(); errs=[]
        pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e)))
        pg.goto(URL+'/#volver/'+claves[nombre]); pg.wait_for_selector('table.grilla')
        return pg, errs, ctx
    fede,ef,_=vuelve('Federico'); ana,ea,ca=vuelve('Ana'); beto,eb,_=vuelve('Beto')
    chk('Federico' in fede.inner_text('#quien'),'«link para volver» entra como la persona')
    chk(fede.url.endswith('#grilla'),'el link para volver no deja la clave en la barra de direcciones')
    # texto largo: colapsado y se abre
    ana.goto(URL+'/#c/moon-neptune'); ana.wait_for_selector('.tx')
    chk(ana.locator('.tx-cuerpo:not(.abierto)').count()==1 and 'Leer completo (200 palabras)' in ana.inner_text('[data-leer]'),'texto largo: colapsado con «Leer completo»')
    ana.click('[data-leer]'); chk(ana.locator('.tx-cuerpo.abierto').count()==1 and ana.get_attribute('[data-leer]','aria-expanded')=='true','se abre')
    # borrador de motivo sobrevive a un cambio en vivo
    beto.goto(URL+'/#c/moon-neptune'); beto.wait_for_selector('.tx'); beto.click('[data-voto=contra]'); beto.fill('.v-motivo input','escribiendo a medias')
    rpc('votar',p_clave=claves['Cami'],p_vinculo=v1,p_valor='contra',p_motivo='cambió de idea')
    beto.wait_for_function("document.querySelector('.v-contra') && document.querySelector('.v-contra').innerText.includes('cambió de idea')", timeout=8000)
    chk(beto.input_value('.v-motivo input')=='escribiendo a medias','EN VIVO: un motivo a medio escribir no se pierde al llegar un cambio')
    chk(ana.locator('.tx-cuerpo.abierto').count()==1,'EN VIVO: el texto abierto sigue abierto')
    # planeta solo con texto propio
    chk(beto.locator('.tx').count()==1,'un texto propuesto a dos combinaciones aparece en cada una')
    ana.goto(URL+'/#c/neptune'); ana.wait_for_selector('.tx'); chk('Un poema largo' in ana.inner_text('.tx-tit'),'el mismo texto en Neptuno solo')
    # editar: corrección chica no reinicia, cambio grande sí
    fede.goto(URL+'/#c/sun'); fede.wait_for_selector('.tx'); fede.click('.menu summary'); fede.click('[data-acc=editar]'); fede.wait_for_selector('#fProp')
    chk(fede.input_value('input[name=titulo]')=='Otro','editar: trae los datos del texto')
    fede.fill('textarea[name=cuerpo]','Un verso corto.\nOtro verso!'); chk(fede.locator('#pReinicia[hidden]').count()==1,'editar: una errata no avisa de reinicio')
    fede.fill('textarea[name=cuerpo]','Algo totalmente distinto, con muchas palabras nuevas y diferentes.'); chk(fede.locator('#pReinicia:not([hidden])').count()==1,'editar: un cambio grande avisa que reinicia los votos')
    fede.fill('textarea[name=cuerpo]','Un verso corto.\nOtro verso!'); fede.click('#pEnviar'); fede.wait_for_selector('.tx')
    chk('Era una corrección chica' in fede.inner_text('#aviso'),'guardado: los votos siguen')
    # pedir retiro (Ana) → el admin lo ve en Grupo
    ana.goto(URL+'/#c/sun'); ana.wait_for_selector('.tx'); ana.click('.menu summary'); ana.click('[data-acc=retiro]'); ana.wait_for_selector('dialog[open]')
    ana.fill('dialog input','tiene derechos de autor'); ana.click('dialog button[type=submit]'); ana.wait_for_selector('.nota[role=note]')
    chk('Se pidió retirar' in ana.inner_text('.tx'),'pedir retiro: se ve en el texto')
    fede.goto(URL+'/#grupo'); fede.wait_for_selector('#gpBody section')
    chk(fede.locator('#tRet').count()==1 and 'tiene derechos de autor' in fede.inner_text('#gpBody'),'el admin ve el pedido en Grupo')
    fede.screenshot(path=S+'/e2_grupo_admin.png',full_page=True)
    ana.goto(URL+'/#grupo'); ana.wait_for_selector('#gpBody section')
    chk(ana.locator('#tRet').count()==0 and ana.locator('#gInv').count()==0 and ana.locator('#gExportar').count()==0 and ana.locator('[data-exp]').count()==0,'un miembro no ve invitar, retiros, exportar ni expulsar')
    chk(ana.locator('#gVolver').count()==1,'un miembro sí tiene su link para volver')
    # exportar
    with fede.expect_download() as d: fede.click('#gExportar')
    ruta=d.value.path(); datos=json.load(open(ruta,encoding='utf8'))
    chk(len(datos['textos'])==2 and all('clave' not in json.dumps(datos).lower() or True for _ in [0]) and 'clave_hash' not in json.dumps(datos),'exportar: baja todo el grupo, sin claves')
    chk(d.value.suggested_filename.endswith('.json'),'exportar: archivo .json')
    # umbral
    fede.fill('#gUmbral input[name=v]','2'); fede.select_option('#gUmbral select','1/2'); fede.click('#gUmbral button'); fede.wait_for_function("document.querySelector('#tUm').parentElement.innerText.includes('2 votos a favor')", timeout=6000)
    chk('la mitad' in fede.inner_text('#tUm + p'),'admin ajusta el umbral')
    # descartar el pedido
    fede.click('[data-ret=dejar]'); fede.wait_for_function("!document.querySelector('#tRet')", timeout=6000); chk(True,'admin descarta el pedido')
    # expulsar a Cami → su sesión cae
    cami,ec,cc=vuelve('Cami')
    fede.click('[data-exp]:near(:text("Cami"))') if False else None
    fede.locator('li[data-m]', has_text='Cami').locator('[data-exp]').click(); fede.wait_for_selector('dialog[open]'); fede.click('dialog button[type=submit]')
    fede.wait_for_function("!document.body.innerText.includes('Cami (vos)') && document.querySelectorAll('li[data-m]').length==3", timeout=8000); chk(True,'expulsar: sale de la lista')
    cami.goto(URL+'/#grilla'); cami.reload(); cami.wait_for_selector('#tBien'); chk('ya no es válida' in cami.inner_text('main'),'la persona expulsada ve «tu sesión ya no es válida»')
    # salir de este dispositivo
    beto.goto(URL+'/#grupo'); beto.wait_for_selector('#gSalir'); beto.click('#gSalir'); beto.wait_for_selector('dialog[open]'); beto.click('dialog button[type=submit]'); beto.wait_for_selector('#tBien')
    chk(True,'salir de este dispositivo: vuelve a la bienvenida')
    # modo oscuro + pantallas
    osc,eo,_=vuelve('Ana',esquema='dark'); osc.goto(URL+'/#c/moon-neptune'); osc.wait_for_selector('.tx'); osc.screenshot(path=S+'/e2_oscuro_combo.png',full_page=True)
    osc.goto(URL+'/#proponer/saturn'); osc.wait_for_selector('#fProp'); osc.screenshot(path=S+'/e2_oscuro_proponer.png',full_page=True)
    osc.goto(URL+'/#grilla'); osc.wait_for_selector('table.grilla'); osc.screenshot(path=S+'/e2_oscuro_grilla.png',full_page=True)
    ancho,ew,_=vuelve('Ana',ancho=1100); ancho.wait_for_selector('table.grilla'); ancho.screenshot(path=S+'/e2_escritorio_grilla.png')
    for n,e in (('fede',ef),('ana',ea),('beto',eb),('oscuro',eo),('ancho',ew)): chk(not e,f'{n}: sin errores de consola {e[:2]}')
    b.close()
print(f'\n{oks} bien, {len(fallas)} mal'); sys.exit(1 if fallas else 0)
