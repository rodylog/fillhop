// ---------- Assistant vehicule en trois ecrans (premier lancement) ----------
// 1. Vehicule (type, categorie, ENERGIE — thermique : carburants, autonomie d'un plein EN
//    PREMIER, conso connue ou estimee d'apres src/conso.js, reservoir facultatif, reserve ;
//    electrique (phase 2, 30/10/2026) : batterie utile, kWh/100 pre-remplis par categorie,
//    puissance de charge DC et AC, prise, reserve et etat de charge au depart en %) ;
// 2. Position (ma position, sur la carte, une adresse, plus tard) ;
// 3. C'est pret (autonomie utile, conso et son origine, rien n'est envoye).
// Feuille modale ordinaire (.modale : piege de focus, Echap et voile = Passer, cf.
// feuilles.js). creerAssistant(ctx) recoit ce dont il a besoin de app.js et renvoie
// {ouvrir(vehicule)} ; « Passer » a tout ecran = usage minimal, REGL.assistantVu = true.
function creerAssistant(ctx){
  const {$, REGL, CASES, TYPES, CATEGORIES_CONSO, estimerConso, estimerConsoElec, autonomieUtile, autonomieElectrique, ico,
         ouvrirFeuille, fermerFeuille, apresVehicule, localiser, reticule, geocoder, situer,
         rechercheOuverte, MOBILE, reglagesBruts} = ctx;
  const ICONE_TYPE = {voiture: 'voiture', moto: 'moto', utilitaire: 'utilitaire', campingcar: 'campingcar'};
  const LIBELLE_TYPE = {voiture: 'Voiture', moto: 'Scooter / moto', utilitaire: 'Utilitaire', campingcar: 'Camping-car'};
  let etat = {type: 'voiture', cat: 'citadine', estime: null, energie: 'thermique', estimeElec: null};
  let ecran = 1, ouvert = false, origine = null;

  // Type : grands boutons-icones ; categorie : chips selon le type.
  $('asTypes').innerHTML = Object.keys(LIBELLE_TYPE).map(t =>
    `<button type="button" class="as-type" data-type="${t}" aria-pressed="false">${ico(ICONE_TYPE[t])}<span>${LIBELLE_TYPE[t]}</span></button>`).join('');
  $('asTypes').querySelectorAll('[data-type]').forEach(b => b.onclick = () => choisirType(b.dataset.type));
  $('asCarbs').innerHTML = CASES.map(([k, l]) =>
    `<label class="case"><input type="checkbox" value="${k}"> ${l}</label>`).join('');
  function choisirType(t, cat){
    etat.type = TYPES[t] ? t : 'voiture';
    $('asTypes').querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === etat.type)));
    const cats = CATEGORIES_CONSO[etat.type] || [];
    etat.cat = cats.some(c => c[0] === cat) ? cat : (cats[0] ? cats[0][0] : '');
    // Une seule categorie (utilitaire, camping-car) : rien a choisir.
    $('asCats').innerHTML = cats.length > 1 ? cats.map(([k, l]) =>
      `<button type="button" class="as-cat" data-cat="${k}" aria-pressed="${k === etat.cat}">${l}</button>`).join('') : '';
    $('asCats').querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      etat.cat = b.dataset.cat;
      $('asCats').querySelectorAll('[data-cat]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
      if(etat.estime) estimer();
      if(etat.energie === 'elec' && etat.estimeElec) estimerElec();
    });
    if(etat.estime) estimer();
    if(etat.energie === 'elec' && etat.estimeElec) estimerElec();
  }
  // Energie : thermique (comportement historique) ou electrique (bloc batterie / kW / prise).
  // Passer a l'electrique pre-remplit la conso en kWh/100 d'apres la categorie (modifiable).
  function choisirEnergie(e){
    etat.energie = e === 'elec' ? 'elec' : 'thermique';
    $('asEnergies').querySelectorAll('[data-energie]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.energie === etat.energie)));
    $('asElec').hidden = etat.energie !== 'elec';
    $('asThermique').hidden = etat.energie === 'elec';
    $('asErreur').textContent = '';
    if(etat.energie === 'elec' && !$('asConsoKwh').value) estimerElec();
  }
  $('asEnergies').querySelectorAll('[data-energie]').forEach(b => b.onclick = () => choisirEnergie(b.dataset.energie));
  function estimerElec(){
    const r = estimerConsoElec(etat.type, etat.cat);
    if(!r){ etat.estimeElec = null; $('asConsoKwhSource').textContent = ''; return; }
    etat.estimeElec = r;
    $('asConsoKwh').value = r.conso;
    $('asConsoKwhSource').textContent = `≈ ${String(r.conso).replace('.', ',')} kWh/100 — ${r.source}. Modifiable : prenez ce que votre voiture affiche.`;
  }
  $('asConsoKwh').addEventListener('input', () => { if(etat.estimeElec && String($('asConsoKwh').value) !== String(etat.estimeElec.conso)){ etat.estimeElec = null; $('asConsoKwhSource').textContent = 'Conso saisie.'; } });
  const carbsChoisis = () => [...$('asCarbs').querySelectorAll('input:checked')].map(i => i.value);
  // Conso : « je la connais » (saisie libre) ou « estimer » (table embarquee, pre-remplie,
  // modifiable, source affichee). La conso ne deplace pas les arrets : elle chiffre les euros.
  function modeConso(estimer_){
    $('asConsoConnue').setAttribute('aria-pressed', String(!estimer_));
    $('asConsoEstimer').setAttribute('aria-pressed', String(estimer_));
  }
  function estimer(){
    const carb = carbsChoisis()[0];
    const r = carb ? estimerConso(etat.type, etat.cat, carb, $('asHybride').checked) : null;
    if(!r){
      etat.estime = null; modeConso(false);
      $('asConsoSource').textContent = !carb ? 'Cochez d\'abord un carburant pour estimer.'
        : $('asHybride').checked ? 'Hybride : pas d\'estimation fiable (la base mélange rechargeables et non rechargeables) — saisissez la conso que vous connaissez.'
        : 'Pas d\'estimation pour cette combinaison — saisissez la conso que vous connaissez.';
      return;
    }
    etat.estime = r; modeConso(true);
    $('asConso').value = r.conso;
    $('asConsoSource').textContent = `≈ ${String(r.conso).replace('.', ',')} L/100 — ${r.source}${r.large ? '' : '.'} Modifiable.`;
  }
  $('asConsoEstimer').onclick = () => { estimer(); if(etat.estime) $('asConso').focus(); };
  $('asConsoConnue').onclick = () => { etat.estime = null; modeConso(false); $('asConsoSource').textContent = ''; $('asConso').value = ''; $('asConso').focus(); };
  $('asConso').addEventListener('input', () => { if(etat.estime && String($('asConso').value) !== String(etat.estime.conso)){ etat.estime = null; modeConso(false); $('asConsoSource').textContent = 'Conso saisie.'; } });
  $('asCarbs').addEventListener('change', () => { $('asErreur').textContent = ''; if(etat.estime) estimer(); });
  $('asHybride').onchange = () => { if(etat.estime || $('asHybride').checked) estimer(); };

  function montrer(n){
    ecran = n;
    [1, 2, 3].forEach(i => { $('asEcran' + i).hidden = i !== n; });
    $('asCompteur').textContent = `${n} / 3`;
    $('asTitre').textContent = n === 1 ? 'Votre véhicule' : n === 2 ? 'Votre point de repère' : 'C\'est prêt';
    $('asPasser').hidden = n === 3;
    if(n === 3) resumer();
    const m = $('assistant');
    m.scrollTop = 0;
    const premier = $('asEcran' + n).querySelector('input:not([type=checkbox]), button');
    (premier || $('asTitre')).focus({preventScroll: true});
  }
  // Ecran 1 -> fiche vehicule (celle du vehicule actif). strict (bouton Suivant) : au
  // moins un carburant, sinon message. Non strict (Passer, Echap, voile) : ce qui a ete
  // saisi est garde tel quel — refaire la fiche est fastidieux (demande du 24/10/2026) —, les
  // carburants deja connus de la fiche servant si aucun n'est coche.
  function enregistrer(strict = true){
    let carbs = carbsChoisis();
    const v = REGL.vehicules[REGL.vehActif];
    const cat = (CATEGORIES_CONSO[etat.type] || []).find(c => c[0] === etat.cat);
    const libCat = cat && CATEGORIES_CONSO[etat.type].length > 1 ? cat[1] : LIBELLE_TYPE[etat.type];
    if(etat.energie === 'elec'){
      // Electrique : la batterie utile est le seul champ indispensable (strict) ; le reste a des
      // defauts (prise CCS, reserve 15 %, depart 80 %) ou se complete dans le garage.
      if(strict && !(+$('asBatt').value > 0)){ $('asErreur').textContent = 'Indiquez la batterie utile, en kWh.'; $('asBatt').focus(); return false; }
      $('asErreur').textContent = '';
      if(!v.nom || /^Véhicule \d+$/.test(v.nom)) v.nom = nomLibre(`${libCat} électrique`, REGL.vehicules.indexOf(v));
      Object.assign(v, {type: etat.type, cat: etat.cat, energie: 'elec', carbs: v.carbs || [],
                        batterieKwh: $('asBatt').value, consoKwh100: $('asConsoKwh').value,
                        kwMaxDC: $('asKwDc').value, kwMaxAC: $('asKwAc').value, prise: $('asPrise').value,
                        reservePct: $('asReservePct').value, departPct: $('asDepartPct').value,
                        consoElecEstimee: !!(etat.estimeElec && String($('asConsoKwh').value) === String(etat.estimeElec.conso))});
      REGL.assistantVu = true;
      reglagesBruts();
      apresVehicule();
      return true;
    }
    if(!carbs.length){
      if(strict){ $('asErreur').textContent = 'Choisissez au moins un carburant.'; $('asCarbs').querySelector('input').focus(); return false; }
      carbs = (v.carbs || []).slice();
    }
    $('asErreur').textContent = '';
    if(!v.nom || /^Véhicule \d+$/.test(v.nom)) v.nom = nomLibre(libCat, REGL.vehicules.indexOf(v));
    Object.assign(v, {type: etat.type, cat: etat.cat, energie: 'thermique', carbs, conso: $('asConso').value, cuve: $('asCuve').value,
                      autonomie: $('asAutonomie').value, reserve: $('asReserve').value,
                      consoEstimee: !!(etat.estime && String($('asConso').value) === String(etat.estime.conso))});
    v.hybride = $('asHybride').checked || undefined;
    REGL.assistantVu = true;
    reglagesBruts();
    apresVehicule();
    return true;
  }
  $('asSuite1').onclick = () => { if(enregistrer()) montrer(2); };
  $('asRetour2').onclick = () => montrer(1);
  $('asPlusTard').onclick = () => montrer(3);
  // Ecran 2 : position. Ma position -> geolocalisation (refus : on reste, message) ;
  // sur la carte -> reticule (l'assistant se referme, revient a l'ecran 3 une fois le repere pose) ;
  // une adresse -> BAN.
  $('asPosMoi').onclick = () => {
    $('asPosMsg').textContent = 'localisation…';
    localiser(false, ok => {
      $('asPosMsg').textContent = ok ? '' : 'Position refusée ou indisponible — choisissez sur la carte, ou une adresse.';
      if(ok) montrer(3);
    });
  };
  $('asPosCarte').onclick = () => {
    fermerFeuille();
    reticule(true, () => { ouvrir(null, 3); });
  };
  $('asPosAdresse').onsubmit = async e => {
    e.preventDefault();
    const q = $('asPosQ').value.trim();
    if(!q) return;
    $('asPosMsg').textContent = 'recherche…';
    try{ const g = await geocoder(q); situer(g.lat, g.lon, g.label, true); $('asPosMsg').textContent = ''; montrer(3); }
    catch(err){ $('asPosMsg').textContent = err.message; }
  };
  // Ecran 3 : ce que le plan utilisera.
  function resumer(){
    const v = REGL.vehicules[REGL.vehActif];
    const li = [];
    const l = (txt, b) => { const e = document.createElement('li'); if(b){ const s = document.createElement('b'); s.textContent = b; e.append(s, ' '); } e.append(txt); li.push(e); };
    const virg = x => String(x).replace('.', ',');
    if(v.energie === 'elec'){
      const en = autonomieElectrique(v);
      l(`— ${v.nom} (${LIBELLE_TYPE[v.type] || 'véhicule'} électrique), prise ${({ccs: 'CCS', chademo: 'CHAdeMO', t2: 'Type 2'})[v.prise] || 'CCS'}`, 'Véhicule');
      if(en) l(`utiles au départ (batterie ${virg(v.batterieKwh)} kWh à ${Math.round(en.E0 / en.B * 100)} %, réserve ${Math.round(en.R / en.B * 100)} % déduite, ${virg(v.consoKwh100)} kWh/100 km${v.consoElecEstimee ? ' estimés, modifiables dans le garage' : ''})`, `≈ ${Math.round(en.A)} km`);
      else l('batterie utile et consommation en kWh/100 km à renseigner dans le garage pour situer les arrêts de charge.', 'Autonomie inconnue :');
      const dc = +v.kwMaxDC > 0 ? `${virg(v.kwMaxDC)} kW en continu` : 'pas de charge rapide renseignée';
      const ac = +v.kwMaxAC > 0 ? `${virg(v.kwMaxAC)} kW en alternatif` : 'pas de charge lente renseignée';
      l(`${dc}, ${ac} — le plan de charge optimise le temps de charge (aucun prix au kWh dans les données ouvertes).`, 'Charge :');
      $('asResume').replaceChildren(...li);
      return;
    }
    const resv = v.reserve === '' || v.reserve == null ? 30 : Math.max(0, +v.reserve || 0);   // « 0 » vaut 0
    const au = autonomieUtile(+v.conso, +v.cuve, +v.autonomie, resv);
    l(`— ${v.nom} (${LIBELLE_TYPE[v.type] || 'véhicule'}), ${(v.carbs || []).map(k => (CASES.find(c => c[0] === k) || [k, k])[1]).join(' + ')}`, 'Véhicule');
    if(au) l(`utiles (réserve ${resv} km déduite${au.source === 'autonomie' ? '' : `, ${v.cuve} L × ${String(v.conso).replace('.', ',')} L/100`})`, `≈ ${Math.round(au.A)} km`);
    else l('autonomie d\'un plein ou réservoir à renseigner dans le garage pour situer les arrêts.', 'Autonomie inconnue :');
    if(+v.conso > 0) l(`L/100 km${v.consoEstimee ? ` — estimée (${etat.estime ? etat.estime.source : 'table embarquée'}), modifiable dans le garage` : ' — saisie'}`, String(v.conso).replace('.', ','));
    else l('à renseigner (ou à estimer) dans le garage pour chiffrer le voyage en euros.', 'Conso inconnue :');
    $('asResume').replaceChildren(...li);
  }
  const terminer = () => { REGL.assistantVu = true; reglagesBruts(); fermerFeuille(); };
  $('asFin').onclick = terminer;
  $('asOuAllez').onclick = () => { terminer(); rechercheOuverte(true); if(!MOBILE.matches) $('arrivee').focus(); };
  $('asPasser').onclick = terminer;
  // Quitter l'ecran 1 sans « Suivant » (Passer, Echap, voile) ne perd rien : la saisie
  // entamee (carburant, autonomie, conso ou reservoir) est enregistree sans message.
  const saisieEcran1 = () => ecran === 1 && (etat.energie === 'elec'
    ? !!($('asBatt').value || $('asKwDc').value || $('asKwAc').value)
    : !!(carbsChoisis().length || $('asAutonomie').value || $('asConso').value || $('asCuve').value));
  // Echap ou voile : vaut « Passer ».
  document.addEventListener('feuille', e => {
    if(e.detail.id !== 'assistant') return;
    ouvert = e.detail.ouverte;
    if(ouvert) return;
    if(saisieEcran1()) enregistrer(false);
    if(!REGL.assistantVu){ REGL.assistantVu = true; reglagesBruts(); }
  });

  // ouvrir(vehicule, ecran) : pre-rempli d'apres la fiche donnee (garage) ; sinon vide.
  const remplirElec = v => {
    $('asBatt').value = v.batterieKwh || ''; $('asConsoKwh').value = v.consoKwh100 || '';
    $('asKwDc').value = v.kwMaxDC || ''; $('asKwAc').value = v.kwMaxAC || '';
    $('asPrise').value = ['ccs', 'chademo', 't2'].includes(v.prise) ? v.prise : 'ccs';
    $('asReservePct').value = v.reservePct === '' || v.reservePct == null ? 15 : v.reservePct;
    $('asDepartPct').value = v.departPct === '' || v.departPct == null ? 80 : v.departPct;
    etat.estimeElec = null; $('asConsoKwhSource').textContent = '';
    document.querySelectorAll('#asElec .chips-kw').forEach(g => g.dispatchEvent(new Event('maj')));
  };
  function ouvrir(v, n){
    if(v){
      choisirType(v.type, v.cat);
      $('asCarbs').querySelectorAll('input').forEach(i => i.checked = (v.carbs || []).includes(i.value));
      $('asHybride').checked = !!v.hybride;
      $('asAutonomie').value = v.autonomie || ''; $('asConso').value = v.conso || '';
      $('asCuve').value = v.cuve || ''; $('asReserve').value = v.reserve === '' || v.reserve == null ? 30 : v.reserve;
      etat.estime = null; modeConso(false); $('asConsoSource').textContent = '';
      remplirElec(v);
      choisirEnergie(v.energie === 'elec' ? 'elec' : 'thermique');
    }else if(!n){
      choisirType('voiture', 'citadine');
      $('asCarbs').querySelectorAll('input').forEach(i => i.checked = false);
      $('asHybride').checked = false;
      $('asAutonomie').value = ''; $('asConso').value = ''; $('asCuve').value = ''; $('asReserve').value = 30;
      etat.estime = null; modeConso(false); $('asConsoSource').textContent = '';
      remplirElec({});
      choisirEnergie('thermique');
    }
    $('asErreur').textContent = ''; $('asPosMsg').textContent = '';
    ouvrirFeuille('assistant', origine);
    montrer(n || 1);
  }
  return {ouvrir};
}
