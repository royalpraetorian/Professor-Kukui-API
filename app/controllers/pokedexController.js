import * as pokedexService from '../services/pokedexService.js';
import * as pokeApiService from '../services/pokeApiService.js';
import * as showdownService from '../services/showdownService.js';

//GET method for finding a pokemon by its name.
export async function getPokemonByName(req, res) {
  try {
    console.log(req.query['name']);
    var results = await pokeApiService.findPokemonByName(req.query['name']);
    res.send(results);
  } catch (e) {
    console.log(e);
  }
}

export async function getMetagame(req, res) {
  let results = await showdownService.getMetagame(req.query['format']);
  //   console.log(results);
  res.send(results);
}

export async function parsePokePaste(req, res) {
  try {
    let parsedData = pokedexService.parsePokePaste(req.body);
    res.send(parsedData);
  } catch (e) {
    console.log(e);
  }
}

export async function getPokemonMoves(req, res) {
  try {
    let results = await pokedexService.getFilteredMoveList(
      req.query['name'],
      req.query['level'],
      req.query['generation']
    );
    res.send(results);
  } catch (e) {
    console.log(e);
  }
}
