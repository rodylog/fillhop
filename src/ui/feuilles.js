// ---------- Feuilles : panneau glissant (mobile) et feuilles modales ----------
// Mobile (< 768 px) : le panneau du bas a trois crans (apercu ~96 px, moitie, plein),
// deplace au doigt par sa poignee ou son en-tete, au clavier par la poignee. Bureau :
// le meme panneau est ancre a gauche (CSS), les crans n'ont plus d'effet.
// Les feuilles modales (fiche station, garage, menus, aide) sont des <section
// role="dialog"> deja dans la page : jamais une nouvelle page. Une seule ouverte a
// la fois ; Echap, le voile, la croix ou le bouton « retour » du telephone la ferment ;
// le focus revient au bouton qui l'a ouverte.
const MOBILE = matchMedia('(max-width: 767px)');
// Mouvement reduit demande par l'appareil : aucune transition CSS (voir app.css) ni
// animation de camera (jumpTo au lieu de easeTo/flyTo dans fond.js et app.js).
const CALME = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CRANS = ['apercu', 'moitie', 'plein'];
const panneau = document.getElementById('panneau');
const poignee = document.getElementById('poignee');

function cran(){ return panneau.dataset.cran || 'apercu'; }
function hauteurCran(c){
  const h = innerHeight;
  if(c === 'plein') return h - 76;
  if(c === 'moitie') return Math.round(h / 2);
  return 6 * parseFloat(getComputedStyle(document.documentElement).fontSize);   // 6rem, comme app.css (zoom texte)
}
function poserCran(c){
  panneau.dataset.cran = c;
  panneau.style.height = '';
  poignee.setAttribute('aria-expanded', String(c !== 'apercu'));
  poignee.setAttribute('aria-label', c === 'plein' ? 'Replier le panneau' : 'Déplier le panneau');
  // Panneau en plein (mobile) : il recouvre les boutons de la carte ; on les retire du flux
  // (visibility) plutot que de laisser un focus clavier atterrir derriere le panneau (2.4.11).
  document.documentElement.classList.toggle('panneau-plein', MOBILE.matches && c === 'plein');
  // Replie : le corps ne defile pas (sinon un geste de defilement commence hors ecran).
  document.getElementById('corps').style.overflowY = c === 'apercu' ? 'hidden' : '';
}
// Deplier au moins a moitie (nouvelle liste, nouveau plan) sans jamais refermer.
function deplier(min){
  if(!MOBILE.matches) return;
  if(CRANS.indexOf(cran()) < CRANS.indexOf(min)) poserCran(min);
}
poignee.addEventListener('click', () => {
  if(!MOBILE.matches) return;
  poserCran(CRANS[(CRANS.indexOf(cran()) + 1) % CRANS.length]);
});
poignee.addEventListener('keydown', e => {
  if(!MOBILE.matches) return;
  const i = CRANS.indexOf(cran());
  if(e.key === 'ArrowUp' && i < 2){ poserCran(CRANS[i + 1]); e.preventDefault(); }
  if(e.key === 'ArrowDown' && i > 0){ poserCran(CRANS[i - 1]); e.preventDefault(); }
});
// Glisser au doigt (ou a la souris) depuis la poignee ou l'en-tete.
(function(){
  let depart = null, h0 = 0, t0 = 0, y0 = 0;
  const zones = [poignee, document.getElementById('panneauTete')];
  const debut = e => {
    if(!MOBILE.matches || e.button > 0) return;
    if(e.target.closest('button') && e.target !== poignee) return;   // boutons de l'en-tete
    depart = e.pointerId; h0 = panneau.offsetHeight; y0 = e.clientY; t0 = performance.now();
    panneau.classList.add('glisse');
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const bouge = e => {
    if(depart !== e.pointerId) return;
    const h = Math.max(hauteurCran('apercu'), Math.min(hauteurCran('plein'), h0 + (y0 - e.clientY)));
    panneau.style.height = h + 'px';
  };
  const fin = e => {
    if(depart !== e.pointerId) return;
    depart = null;
    panneau.classList.remove('glisse');
    const h = panneau.offsetHeight, dy = y0 - e.clientY, dt = performance.now() - t0;
    const v = dy / Math.max(1, dt);   // px/ms, positif vers le haut
    let c;
    if(Math.abs(v) > 0.5 && Math.abs(dy) > 20){
      const i = CRANS.indexOf(cran());
      c = CRANS[Math.max(0, Math.min(2, i + (v > 0 ? 1 : -1)))];
    }else{
      c = CRANS.reduce((a, b) => Math.abs(hauteurCran(b) - h) < Math.abs(hauteurCran(a) - h) ? b : a);
    }
    if(Math.abs(dy) < 6 && e.target === poignee) return;   // simple appui : traite par click
    poserCran(c);
  };
  zones.forEach(z => {
    z.addEventListener('pointerdown', debut);
    z.addEventListener('pointermove', bouge);
    z.addEventListener('pointerup', fin);
    z.addEventListener('pointercancel', fin);
  });
})();
MOBILE.addEventListener('change', () => poserCran(cran()));
poserCran('apercu');

// ---------- Feuilles modales ----------
const voile = document.getElementById('voile');
let modaleOuverte = null, modaleOrigine = null;
// Feuille ouverte = le reste de la page est inerte (attribut inert : ni focus, ni clic, ni lecture
// par les lecteurs d'ecran), en plus d'aria-modal. Les feuilles sont des enfants de #app, d'ou
// une liste de ses autres enfants plutot qu'un aria-hidden sur #app. Le cycle Tab ci-dessous
// reste en secours pour les navigateurs sans inert.
const FOND = ['map', 'sansWebgl', 'haut', 'reticule', 'panneau'].map(id => document.getElementById(id))
  .concat([...document.querySelectorAll('.boutons-carte')]).filter(Boolean);
const fondInerte = on => FOND.forEach(el => { el.inert = on; });
// ---------- Bouton « retour » du telephone ----------
// Une feuille ouverte (ou le formulaire du trajet deplie, au telephone) pose UNE entree
// d'historique (pushState sans URL : l'adresse et son hash ne changent pas) ; le geste
// « retour » la consomme et ferme ce qui est ouvert — la feuille d'abord, puis le formulaire —
// au lieu de quitter la page (releve du 11/11/2026). Fermer autrement (croix, Echap, voile,
// choix dans la feuille) rend l'entree par history.back(), apres coup : une feuille qui en
// remplace une autre dans le meme geste garde la meme entree. RETOUR.attendus compte ces
// retours demandes par la page, que popstate ne doit pas prendre pour un geste.
const RETOUR = {entree: false, attendus: 0};
const rechercheDepliee = () => MOBILE.matches && document.getElementById('recherche').classList.contains('ouvert');
const retourUtile = () => !!modaleOuverte || rechercheDepliee();
function retourOuvert(){
  if(!retourUtile() || RETOUR.entree || RETOUR.attendus) return;   // rien a fermer (bureau), deja posee, ou posee au retour attendu (popstate)
  try{ history.pushState({feuille: true}, ''); RETOUR.entree = true; }catch(e){ /* historique indisponible : comme avant */ }
}
function retourFerme(){
  setTimeout(() => {
    if(!RETOUR.entree || retourUtile()) return;
    RETOUR.entree = false; RETOUR.attendus++;
    history.back();
  }, 0);
}
addEventListener('popstate', () => {
  if(RETOUR.attendus){ RETOUR.attendus--; if(retourUtile()) retourOuvert(); return; }
  if(!RETOUR.entree) return;   // entree d'un autre temps (page rechargee feuille ouverte) : rien a fermer
  RETOUR.entree = false;
  if(modaleOuverte) fermerFeuille();
  else document.dispatchEvent(new CustomEvent('echap'));   // formulaire du trajet (app.js)
  if(retourUtile()) retourOuvert();   // il reste le formulaire sous la feuille : un retour de plus le fermera
});
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])';
function ouvrirFeuille(id, origine){
  const m = document.getElementById(id);
  if(!m) return;
  if(modaleOuverte && modaleOuverte !== m){ modaleOuverte.hidden = true; }
  else if(!modaleOuverte) modaleOrigine = origine || document.activeElement;
  modaleOuverte = m;
  m.hidden = false; voile.hidden = false;
  retourOuvert();
  fondInerte(true);
  m.scrollTop = 0;
  // Le focus entre dans la feuille : premier champ ou bouton apres la croix, sinon le titre.
  const cibles = [...m.querySelectorAll(FOCUSABLE)].filter(el => !el.closest('.modale-tete'));
  const premier = cibles.find(el => !el.hidden && el.offsetParent !== null) || m.querySelector('.modale-tete button');
  (premier || m).focus({preventScroll: true});
  document.dispatchEvent(new CustomEvent('feuille', {detail: {id, ouverte: true}}));
}
function fermerFeuille(){
  if(!modaleOuverte) return;
  const id = modaleOuverte.id;
  modaleOuverte.hidden = true; voile.hidden = true; modaleOuverte = null;
  retourFerme();
  fondInerte(false);
  // Retour du focus a l'element d'origine ; s'il a ete redessine entre-temps (liste
  // des stations refaite apres un deplacement de la carte), a son homologue (meme data-id).
  let cible = modaleOrigine;
  if(cible && !cible.isConnected && cible.dataset && cible.dataset.id)
    cible = document.querySelector(`.${cible.classList[0]}[data-id="${CSS.escape(cible.dataset.id)}"]`);
  if(cible && cible.isConnected) cible.focus({preventScroll: true});
  modaleOrigine = null;
  document.dispatchEvent(new CustomEvent('feuille', {detail: {id, ouverte: false}}));
}
voile.addEventListener('click', fermerFeuille);
document.querySelectorAll('.modale .fermer').forEach(b => b.addEventListener('click', fermerFeuille));
// Groupes de boutons (role="group" ou "toolbar" : tri, types de vehicule, categories, puissances,
// detours, fond de carte, apparence) : les fleches passent d'un bouton au suivant, comme dans
// une barre d'outils. Seuls les boutons sont concernes (une fleche dans un select change sa valeur).
document.addEventListener('keydown', e => {
  if(!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const a = document.activeElement;
  if(!a || a.tagName !== 'BUTTON') return;
  const g = a.closest('[role="group"],[role="toolbar"]');
  if(!g) return;
  const bs = [...g.querySelectorAll('button:not([disabled])')].filter(b => b.offsetParent !== null);
  const i = bs.indexOf(a);
  if(i < 0 || bs.length < 2) return;
  const suivant = e.key === 'ArrowRight' || e.key === 'ArrowDown';
  bs[(i + (suivant ? 1 : bs.length - 1)) % bs.length].focus();
  e.preventDefault();
});
// Le focus reste dans la feuille ouverte (Tab cyclique) ; Echap ferme tout ce qui peut l'etre.
document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    if(modaleOuverte){ fermerFeuille(); e.preventDefault(); return; }
    document.dispatchEvent(new CustomEvent('echap'));
    return;
  }
  if(e.key !== 'Tab' || !modaleOuverte) return;
  const els = [...modaleOuverte.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if(!els.length) return;
  const i = els.indexOf(document.activeElement);
  if(e.shiftKey && (i <= 0)){ els[els.length - 1].focus(); e.preventDefault(); }
  else if(!e.shiftKey && (i === els.length - 1 || i < 0)){ els[0].focus(); e.preventDefault(); }
});
