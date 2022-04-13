import { Router } from 'express';
import * as pokedexController from '../controllers/pokedexController.js';

export const pokedex = Router();
pokedex.get('/pokemon', pokedexController.getPokemonByName);

// export default pokedex;
