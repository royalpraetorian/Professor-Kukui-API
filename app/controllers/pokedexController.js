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

export async function getOffensiveMatchups(req, res) {
  let pokemon = pokedexService.parsePokePaste(req.body);
  console.log(
    'Getting matchup chart for: ' + pokemon.Pokemon + ' in ' + req.query.format
  );
  let results = await pokedexService.getOffenseMatchups(
    pokemon,
    req.query.format
  );
  console.log('Finished');
  res.send(results);
}

export async function findOptimalBuild(req, res) {
  console.log(req);
  let params = {
    compareMethod: 'less bad',
    fieldEffects: {
      weather: 'None',
      terrain: 'None'
    },
    moves: {
      STAB: 'any',
      stats: 'considered',
      priority: 'any',
      accuracyTolerance: 90,
      contact: 'omit',
      recoil: 'omit',
      selfDebuffing: 'omit',
      selfTrapping: 'omit',
      switching: 'omit',
      minPP: 10,
      ignoreList: ['Ice Beam', 'Flamethrower']
    },
    enemies: {
      nfe: 'exclude',
      topX: 0
    }
  };
  let results = await pokedexService.findOptimalBuild(
    req.body,
    req.query.format,
    params
  );
  console.log(results);
  res.send(results);
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
