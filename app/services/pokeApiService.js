import Pokedex from 'pokedex-promise-v2';
const Dex = new Pokedex();

export async function findPokemonByName(pokeName) {
  //Clean up the string to be in line with PokeAPI's syntax
  let regex = / /g; //Find spaces
  while (pokeName.match(regex) != null) {
    pokeName = pokeName.replace(regex, '-'); //Replace all spaces with hyphens
  }
  regex = /'/g; //Find apostraphes
  while (pokeName.match(regex) != null) {
    pokeName = pokeName.replace(regex, ''); //Remove all apostraphes
  }
  //Convert to lower case and trim
  pokeName = pokeName.toLowerCase().trim();
  return await Dex.getPokemonByName(pokeName);
}
