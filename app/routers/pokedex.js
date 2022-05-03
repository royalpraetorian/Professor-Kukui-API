import { Router } from 'express';
import * as pokedexController from '../controllers/pokedexController.js';

export const pokedex = Router();
pokedex.get('/pokemon', pokedexController.getPokemonByName);
pokedex.get('/pokemon/moves', pokedexController.getPokemonMoves);
pokedex.get('/metagame', pokedexController.getMetagame);
pokedex.get('/parse', pokedexController.parsePokePaste);
pokedex.get(
  '/pokemon/matchups/offensive',
  pokedexController.getOffensiveMatchups
);
pokedex.get('/pokemon/optimize', pokedexController.findOptimalBuild);
