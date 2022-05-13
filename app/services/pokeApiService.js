import Pokedex from 'pokedex-promise-v2';
import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';

const gens = new Generations(Dex);
const pokeApi = new Pokedex();

export async function findPokemonByName(pokeName, gen) {
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
  let learnset = await getPokemonLearnset(pokeName, gen);
  let monData = await pokeApi.getPokemonByName(pokeName);

  //Replace 'moves' in monData with learnset.
  monData.moves = [];
  Object.keys(learnset).forEach(move => {
    monData.moves.push({ move: { name: move } });
  });

  return monData;
}

async function getPokemonLearnset(pokeName, gen) {
  return await gens.get(gen).learnsets.learnable(pokeName);
}
