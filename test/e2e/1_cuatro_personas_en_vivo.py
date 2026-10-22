# Prueba de punta a punta 1: cuatro personas, proponer, ver en vivo, votar, validar.
import json, sys, time, urllib.request
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
g=post('/dev/crear-grupo',{'nombre':'Amigos','umbral':4})
KAFKA=("Ante la ley hay un guardián. Un hombre del campo llega hasta el guardián y le ruega que le permita entrar a la ley.\n\n"
       "Pero el guardián dice que en este momento no le puede franquear el acceso.")
with sync_playwright() as p:
    b=p.chromium.launch()
    def persona(nombre, codigo, ancho=420):
        ctx=b.new_context(viewport={'width':ancho,'height':900}, accept_downloads=True)
        pg=ctx.new_page(); errs=[]
        pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e)))
        pg.goto(URL+'/#entrar/'+codigo); pg.wait_for_selector('#fEntrar')
        pg.fill('input[name=n]',nombre); pg.click('#fEntrar button'); pg.wait_for_selector('table.grilla')
        return pg, errs, ctx
    fede,ef,cf=persona('Federico',g['codigo_admin'])
    ana,ea,ca=persona('Ana',g['codigo'])
    beto,eb,cb=persona('Beto',g['codigo'])
    cami,ec,cc=persona('Cami',g['codigo'])
    # nombre repetido
    dup=b.new_context(); pd=dup.new_page(); pd.goto(URL+'/#entrar/'+g['codigo']); pd.wait_for_selector('#fEntrar')
    pd.fill('input[name=n]','ana'); pd.click('#fEntrar button'); pd.wait_for_selector('#eEnt:not([hidden])')
    chk('Ya hay alguien con ese nombre' in pd.inner_text('#eEnt'),'nombre repetido: avisa')
    dup.close()
    # Ana y Beto miran la combinación Saturno + Plutón (vacía)
    for pg in (ana,beto,cami): pg.goto(URL+'/#c/saturn-pluto'); pg.wait_for_selector('.vacio-msg')
    chk(True,'combinación vacía muestra la invitación a proponer')
    # Federico propone desde la combinación
    fede.goto(URL+'/#c/saturn-pluto'); fede.wait_for_selector('.vacio-msg')
    fede.click('text=Proponer para esta combinación'); fede.wait_for_selector('#fProp')
    chk(fede.locator('#pCombos .chip').count()==1 and 'Saturno + Plutón' in fede.inner_text('#pCombos'),'proponer: la combinación viene elegida')
    fede.fill('input[name=autor]','Franz Kafka'); fede.fill('textarea[name=cuerpo]',KAFKA)
    chk(fede.locator('input[name=fuente], input[name=traductor], input[name=tipo]').count()==0,'proponer: ya no hay fuente, traductor ni tipo')
    fede.click('#pEnviar')
    fede.wait_for_selector('#pAviso:not([hidden])')
    chk('título' in fede.inner_text('#pAviso').lower(),'proponer: sin título no deja')
    fede.fill('input[name=titulo]','Ante la ley'); fede.click('#pEnviar')
    fede.wait_for_selector('.tx')
    chk(fede.locator('.tx.debate').count()==1,'queda en debate')
    chk('1 a favor y 0 en contra' in fede.inner_text('.v-resumen'),'su voto a favor ya cuenta')
    chk('faltan 3 votos a favor' in fede.inner_text('.v-resumen'),'faltan 3 votos')
    # en vivo: Ana lo ve sin recargar
    ana.wait_for_selector('.tx', timeout=8000); chk(True,'EN VIVO: Ana ve el texto nuevo sin recargar')
    # Ana vota a favor, Beto a favor, Cami en contra (sin motivo → no deja)
    ana.click('[data-voto=favor]'); 
    fede.wait_for_function("document.querySelector('.v-resumen').innerText.includes('2 a favor')", timeout=8000); chk(True,'EN VIVO: Federico ve el voto de Ana')
    beto.wait_for_selector('.tx'); beto.click('[data-voto=favor]')
    cami.wait_for_selector('.tx'); cami.click('[data-voto=contra]'); cami.wait_for_selector('.v-motivo:not([hidden])')
    cami.click('.v-motivo button[type=submit]'); chk('motivo' in cami.inner_text('.v-motivo .error').lower(),'en contra sin motivo: no deja')
    cami.fill('.v-motivo input','no me cierra Plutón acá'); cami.click('.v-motivo button[type=submit]')
    fede.wait_for_function("document.querySelector('.v-resumen').innerText.includes('3 a favor y 1 en contra')", timeout=8000)
    chk(fede.locator('.tx.debate').count()==1,'3 a favor y 1 en contra: sigue en debate')
    chk('no me cierra Plutón acá' in fede.inner_text('.v-contra'),'el motivo del voto en contra se ve con nombre')
    # Cami cambia a favor → 4 a favor → validado, en vivo
    cami.wait_for_selector('.tx'); cami.click('[data-voto=favor]')
    fede.wait_for_selector('.tx.validado', timeout=8000); chk(True,'EN VIVO: al cuarto voto queda validado')
    chk('validado' in fede.inner_text('.pill').lower(),'pastilla «Validado»')
    ana.wait_for_selector('.tx.validado', timeout=8000); chk(True,'EN VIVO: Ana ve que se validó')
    # grilla
    fede.goto(URL+'/#grilla'); fede.wait_for_selector('table.grilla')
    c=fede.locator('.cel[data-c="saturn-pluto"]'); chk('val' in c.get_attribute('class') and '1 validado' in c.get_attribute('aria-label'),'la grilla pinta la casilla validada')
    chk('1 de 55' in fede.inner_text('#gResumen'),'resumen de la grilla')
    # planeta solo → parejas
    fede.goto(URL+'/#c/saturn'); fede.wait_for_selector('.parejas')
    chk(fede.locator('.parejas a.chip.con').count()==1 and 'Saturno + Plutón' in fede.inner_text('.parejas a.chip.con'),'planeta solo: muestra sus parejas, con la que tiene texto')
    chk('Sin aportes validados' in fede.inner_text('.sub'),'Saturno solo no tiene nada propio')
    fede.screenshot(path=S+'/e1_saturno_solo.png',full_page=True)
    # no hay texto «al azar»: la combinación muestra todos sus textos, completos
    fede.goto(URL+'/#c/saturn-pluto'); fede.wait_for_selector('.tx')
    chk(fede.locator('#azar').count()==0 and 'azar' not in fede.inner_text('#cBody').lower(),'no hay botón ni texto «al azar»')
    chk(fede.locator('.tx').count()>=1 and fede.locator('.tx-cuerpo.abierto').count()==fede.locator('.tx').count(),'todos los textos se muestran completos')
    fede.screenshot(path=S+'/e1_combo_validado.png',full_page=True)
    # errores de consola
    for n,e in (('fede',ef),('ana',ea),('beto',eb),('cami',ec)): chk(not e, f'{n}: sin errores de consola {e[:2]}')
    # guardar para otras pruebas
    json.dump(g, open(S+'/grupo.json','w'))
    b.close()
print(f'\n{oks} bien, {len(fallas)} mal'); sys.exit(1 if fallas else 0)
