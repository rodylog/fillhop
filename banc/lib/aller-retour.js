// Aller-retour sur une fixture synthetique d'aller simple : l'itineraire du retour (absent de
// la fixture) est celui de l'aller, sommets dans l'ordre inverse — meme route, meme distance.
'use strict';
const S = require('./scene.js');

function retourSynthetique(fixture){
  const aller = fixture.meta.reponses.find(r => r.url && /navigation\/itineraire/.test(r.url));
  return async (url, c, defaut) => {
    if(c.nom !== 'itineraire' || defaut()) return undefined;
    const j = JSON.parse(fixture.repondre('https://' + aller.url).corps);
    j.geometry.coordinates = j.geometry.coordinates.slice().reverse();
    return S.json(j);
  };
}
module.exports = {retourSynthetique};
