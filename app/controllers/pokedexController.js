import * as pokedexService from '../services/pokedexService.js';

//GET method for finding a pokemon by its name.
export async function getPokemonByName(req, res) {
  try {
    console.log(req.query['name']);
    var results = await pokedexService.findPokemonByName(req.query['name']);
    res.send(results);
  } catch (e) {
    console.log(e);
  }
}
