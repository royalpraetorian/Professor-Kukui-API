import Pokedex from 'pokedex-promise-v2';
const Dex = new Pokedex();

export async function findPokemonByName(pokeName) {
  pokeName = pokeName.toLowerCase();
  return await Dex.getPokemonByName(pokeName);
}
