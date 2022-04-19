import app from '../index.js';
import * as pokeApiService from './pokeApiService.js';
import * as showdownService from './showdownService.js';

export function getFilteredMoveList(pokemonData, level, generation) {
  return pokemonData.moves.filter(moveEntry =>
    moveEntry.version_group_details.some(
      vgd =>
        vgd.level_learned_at <= level &&
        getGenerationFromName(vgd.version_group.name) == generation
    )
  );
}

// async function getMoveList(pokemon) {
//   let movelist = await pokeApiService.findPokemonByName(pokemon);
//   return movelist.moves;
// }

// function getNamesOfGeneration(generation) {
//   switch (generation) {
//     case 1:
//       return ['red-blue', 'yellow'];
//     case 2:
//       return ['gold-silver', 'crystal'];
//     case 3:
//       return ['ruby-sapphire', 'emerald', 'firered-leafgreen'];
//     case 4:
//       return ['diamond-pearl', 'platinum', 'heartgold-soulsilver'];
//     case 5:
//       return ['black-white', 'black-2-white-2'];
//     case 6:
//       return ['x-y', 'omega-ruby-alpha-sapphire'];
//     case 7:
//       return ['sun-moon', 'ultra-sun-ultra-moon'];
//     default:
//       return ['sword-shield', 'brilliant-diamond-shining-pearl'];
//   }
// }

function getGenerationFromName(gameName) {
  if (gameName == 'red-blue' || gameName == 'yellow') {
    return 1;
  } else if (gameName == 'gold-silver' || gameName == 'crystal') {
    return 2;
  } else if (
    gameName == 'ruby-sapphire' ||
    gameName == 'emerald' ||
    gameName == 'firered-leafgreen'
  ) {
    return 3;
  } else if (
    gameName == 'diamond-pearl' ||
    gameName == 'platinum' ||
    gameName == 'heartgold-soulsilver'
  ) {
    return 4;
  } else if (gameName == 'black-white' || gameName == 'black-2-white-2') {
    return 5;
  } else if (gameName == 'x-y' || gameName == 'omega-ruby-alpha-sapphire') {
    return 6;
  } else if (gameName == 'sun-moon' || gameName == 'ultra-sun-ultra-moon') {
    return 7;
  } else {
    return 8;
  }
}

export function parsePokePaste(pokePaste) {
  //We're constructing a pokemon with some defaults here.
  let pokemon = {
    Nickname: '',
    Pokemon: '',
    Gender: 'R',
    Item: '',
    Ability: '',
    Level: 100,
    Shiny: false,
    EVs: {
      HP: 0,
      Atk: 0,
      Def: 0,
      SpA: 0,
      SpD: 0,
      Spe: 0
    },
    IVs: {
      HP: 31,
      Atk: 31,
      Def: 31,
      SpA: 31,
      SpD: 31,
      Spe: 31
    },
    Nature: '',
    Moves: []
  };
  let lines = pokePaste.split('\n');
  /* Pokepaste format is as follows:
  {Pokemon || Name (Pokemon)} (G)? {@ Item}?
  Ability: {Ability Name}
  {Level: num}?
  {Shiny: bool}?
  {Evs: num str / num str / etc}?
  {str nature}?
  {IVs: num str / num str / etc}?
  {- Move} {0,4}

  Here is an example
Pikachu @ Light Ball  
Ability: Static  
EVs: 252 Atk / 4 SpD / 252 Spe  
Jolly Nature  
- Fake Out  
- Extreme Speed  
- Volt Tackle  
- Knock Off

But there are no limitations on nickname. 
You can recursively paste a pokemon's code into its name as many times as you want, as far as I can tell.
This makes the first line incredibly variable.
Every other line is fairly rigid.
So we parse the first line as a special case, then loop for i=1; i<lines.legnth; i++
  */
  let firstLine = lines[0];
  /*Find out if the pokemon is nicknamed by regex matching for \([^()]{2,}\)
  If a pokemon is gendered it will have (M) or (F) 
  If it is left on random gender it will not have a gender tag
  But no pokemon species are single characters.
  Thus, if a pokemon is nicknamed, the *only* thing we can gurantee is that it will have its species in the first line
  As more than 1 non-paren character surrounded by () parens.
  If it is not nicknamed, it will have no instances of \([^()]{2,}\). So we check for a match on that, first and foremost.
  If we find that, we split on the *last* instance of that occurance.
  */
  let speciesMatch = /\([^()]{2,}\)/g;
  let info = ''; //Define a variable to store the non-nickname info present in the first line.
  let matches = [...firstLine.matchAll(speciesMatch)];
  if (matches.length > 0) {
    /*If this matches at least once, the pokemon is nicknamed.
    We need to find the last instance of the match, and split the string just before it.
    */
    let nickname = firstLine.slice(0, matches[matches.length - 1].index);
    pokemon.Nickname = nickname.trim();

    /* The nickname can be set easily enough, but we'll need to do some extra pulling-apart of the second half of the string.
     */
    info = firstLine.slice(matches[matches.length - 1].index);

    //All of this info is fairly tightly controlled, so all we have to do is match on the previous regex string but without the parens and index at 0.
    let speciesExtract = /[^()]{2,}/g;
    pokemon.Pokemon = info.match(speciesExtract)[0];
  } else {
    info = firstLine;
    /*If the pokemon has no nickname, our job is much easier. Its first line will be approximately as follows:
    Species (G)? {@ Item}?
    The species is the only guaranteed factor here, and will always start at the beginning of the line
    So we only need to capture any set of characters that doesn't contain a space and then grab the first one.
    */
    let speciesMatch = /[^ ]*/;
    pokemon.Pokemon = info.match(speciesMatch)[0];
  }

  // #TODO Write a check to see if the pokemon is real

  //The gender which should be (.), but is R if not found.
  let gender = info.match(/(?<=\()[FM](?=\))/g);
  pokemon.Gender = gender ? gender[0].trim() : 'R'; //If gender is not listed it defaults to R (random).

  //Next we need to see if there's an item, and grab it. Items are always @ [a-zA-Z ]*
  //We only want the bit after the "@ " so we'll use a lookahead (?<=@ )
  let item = info.match(/(?<=@ )[A-Za-z ]*/g);
  pokemon.Item = item ? item[0].trim() : '';

  /*
  That's all for the tricky part. The following lines are very strongly defined, 
  and while some of them may or may not be there,
  we can check for their presence very easily.
  We simply iterate through the remaining lines and check if they contain certain keywords,
  then pattern match the bits we need.
  */

  for (let i = 1; i < lines.length; i++) {
    /*
    It doesn't matter in what order we check for these but for readability we'll do it in the order they're printed.
    */
    let line = lines[i];
    if (line.includes('Ability: ')) {
      //Ability: {ability} so we need to find (?<=Ability: ).*
      let ability = line.match(/(?<=Ability: ).*/);
      pokemon.Ability = ability ? ability[0].trim() : '';
    }
    if (line.includes('Level: ')) {
      //Level: {num} so we want to capture [0-9]+
      let level = line.match(/[0-9]+/g)[0];
      pokemon.Level = parseInt(level);
    }
    if (line.includes('Shiny: Yes')) {
      //If it is not shiny, the line won't even be included, so we can simply set it to true here.
      pokemon.Shiny = true;
    }
    if (line.includes('EVs: ')) {
      //EVs: num str / num str / etc so we need to find groups of [0-9]{1,3} [a-zA-Z]{2,3}
      let EVs = [...line.matchAll(/[0-9]{1,3} [a-zA-Z]{2,3}/g)]; //Get all match groups.
      EVs.forEach(ev => {
        //Iterate
        let kvPair = {}; //Declare new {} to dump values into later
        ev[0]
          .split(' ') //Split on space.
          .forEach(
            subString =>
              //For each half
              Number(subString) || subString == '0' //If that half can be parsed to a Number or is 0
                ? (kvPair.value = Number(subString)) //Store it as the value
                : (kvPair.key = subString) //Otherwise it must be the stat name, which is the key
          );
        pokemon.EVs[kvPair.key] = kvPair.value; //Index by stat name and assign value
      });
    }
    if (line.includes('Nature')) {
      // {nature} Nature so we want to look for [a-zA-Z]*(?= Nature)
      pokemon.Nature = line.match(/[a-zA-Z]*(?= Nature)/)[0].trim();
    }
    if (line.includes('IVs: ')) {
      //Same as EVs
      let IVs = [...line.matchAll(/[0-9]{1,3} [a-zA-Z]{2,3}/g)]; //Get all match groups.
      IVs.forEach(iv => {
        //Iterate
        let kvPair = {}; //Declare new {} to dump values into later
        iv[0]
          .split(' ') //Split on space.
          .forEach(
            subString =>
              //For each half
              Number(subString) || subString == '0' //If that half can be parsed to a Number or is 0
                ? (kvPair.value = Number(subString)) //Store it as the value
                : (kvPair.key = subString) //Otherwise it must be the stat name, which is the key
          );
        pokemon.IVs[kvPair.key] = kvPair.value; //Index by stat name and assign value
      });
    }
    if (line[0] == '-') {
      //- {Move} so we want to capture (?<=- ).* and trim it
      pokemon.Moves.push(line.match(/(?<=- ).*/)[0].trim());
    }
  }
  return pokemon;
}

function parseFormat(format) {
  /*Format is always listed as gen[0-9]*[^0-9]*
  Where [0-9]* is the generation number
  And [^0-9]* is the tier.
  For example, Generation 4 (gen) OU (tier) is written as gen4ou.
  */
  let augmnetedFormat = {
    gen: '',
    tier: ''
  };

  let genMatch = /(?<=gen)[0-9]*/; //Any set of numbers preceded by 'gen'
  let tierMatch = /(?<=[0-9])[^0-9]*$/; //Any set of non-numbers preceded by a number, up to the end of the line.

  augmnetedFormat.gen = format.match(genMatch)[0].trim();
  augmnetedFormat.tier = format.match(tierMatch)[0].trim();

  return augmnetedFormat;
}

export async function getOffenseMatchups(pokemonBuild, format) {
  //Get pokemon data about the pokemon from pokeAPI
  let pokemonData = await pokeApiService.findPokemonByName(
    pokemonBuild.Pokemon
  );

  //Discect format into generation and tier.
  format = parseFormat(format); //We're going to mutate this an essentially augment it with .gen and .tier

  //Get a list of the moves that pokemon is allowed to learn.
  //Also generate a set of the moves it already has
  let filteredMoveList = getFilteredMoveList(
    pokemonData,
    pokemonBuild.Level,
    format.gen
  );
  let buildMoves = [];

  //Augment filteredMoveList with move data (type, power, accuracy, etc)

  filteredMoveList.forEach(filtMove => {
    filtMove.move.name = filtMove.move.name.replace('-', ''); //Format to match keys in app.data.moves
    let moveData = app.data.moves[filtMove.move.name]; //Get from app.data.moves cache.
    filtMove.data = moveData; //Augment.
    //Check if the pokeBuild is using that move and add to buildMoves if it is.
    if (pokemonBuild.Moves.some(move => move == moveData.name)) {
      buildMoves.push(moveData);
    }
  });

  //Get a list of the pokemon in that format (tier + generation)

  let metagame = await showdownService.getMetagame(
    'gen' + format.gen + format.tier
  );
  metagame = metagame.pokemon; //TODO: Cache this.
  let pokemonInTier = Object.keys(metagame);

  //Define matchup spread object
  let matchups = {
    0: {
      count: 0,
      pokemon: []
    },
    0.25: {
      count: 0,
      pokemon: []
    },
    0.5: {
      count: 0,
      pokemon: []
    },
    1: {
      count: 0,
      pokemon: []
    },
    2: {
      count: 0,
      pokemon: []
    },
    4: {
      count: 0,
      pokemon: []
    }
  };

  //Augment each mon with its types, and check effectiveness
  pokemonInTier.forEach(mon => {
    console.log('Checking effectiveness against: ' + mon);
    //Clean up mon to make it lowercase and remove strange characters.
    let monName = mon.toLowerCase();
    //replaceAll doesn't seem to work so we use a while loop.
    while (monName.includes('-')) {
      //Replace hyphens
      monName = monName.replace('-', '');
    }
    while (monName.includes(' ')) {
      //Replace spaces
      monName = monName.replace(' ', '');
    }
    while (monName.includes('%')) {
      monName = monName.replace('%', '');
    }
    while (monName.includes('’')) {
      monName = monName.replace('’', '');
    }
    while (monName.includes('.')) {
      monName = monName.replace('.', '');
    }
    let types = app.data.pokedex[monName].types;
    /*For each move the pokemon knows in its current build,
    Check the effectiveness of that move against each pokemon.
    Keep the highest number.
    */
    let monData = metagame[mon];
    monData.effectiveness = 0;
    buildMoves.forEach(move => {
      //The effectiveness of the move starts at 1
      let effectiveness = 1;
      //Check how many types the pokemon has
      if (types.length == 1) {
        effectiveness *= checkEffectiveness(move.type, types[0], format.gen);
      } else {
        //For each type the pokemon has, multiply effectiveness by the result of checkEffectiveness()
        types.forEach(
          type =>
            (effectiveness *= checkEffectiveness(move.type, type, format.gen))
        );
      }
      //If the effectiveness of this move is > than the stored value of the pokemon, overwrite it.
      if (effectiveness > monData.effectiveness) {
        monData.effectiveness = effectiveness;
      }
    });
    //Sort pokemon into groups in matchup spread based on their effectiveness.
    matchups[monData.effectiveness].pokemon.push({
      name: mon,
      usage: monData.usage.weighted
    });
    matchups[monData.effectiveness].count++;
  });

  return {
    matchups
  };
}

function checkEffectiveness(attackType, defenseType, generation) {
  /*Types is indexed first by attacking type, then by defending type, and returns the damage multiplier.
  For example, to find the effectiveness of a normal-type attack on a steel-type pokemon you would return types['Normal']['Steel'], which would be 0.5.
  If a defensive type is not listed, it is neutral (1x).
  If a defensive type is an object {} with keys default and one or more numbers, the keys represent previous generations.
  For example Bug[Poison] has default: 0.5 and 1: 2 because in gen 1 it dealt 2x damage to poison, but this changed from gen 2 onwards.
  */
  let types = {
    Normal: {
      Rock: 0.5,
      Ghost: 0,
      Steel: 0.5
    },
    Fighting: {
      Normal: 2,
      Flying: 0.5,
      Poison: 0.5,
      Rock: 2,
      Bug: 0.5,
      Ghost: 0,
      Steel: 2,
      Psychic: 0.5,
      Ice: 2,
      Dark: 2,
      Fairy: 0.5
    },
    Flying: {
      Fighting: 2,
      Rock: 0.5,
      Bug: 2,
      Steel: 0.5,
      Grass: 2,
      Electric: 0.5
    },
    Poison: {
      Poison: 0.5,
      Ground: 0.5,
      Rock: 0.5,
      Ghost: 0.5,
      Bug: {
        default: 1,
        1: 2
      },
      Grass: 2,
      Fairy: 2
    },
    Ground: {
      Poison: 2,
      Rock: 2,
      Bug: 0.5,
      Steel: 2,
      Fire: 2,
      Grass: 0.5,
      Electric: 2
    },
    Rock: {
      Fighting: 0.5,
      Flying: 2,
      Ground: 0.5,
      Bug: 2,
      Steel: 0.5,
      Fire: 2,
      Ice: 2
    },
    Bug: {
      Fighting: 0.5,
      Flying: 0.5,
      Poison: {
        default: 0.5,
        1: 2
      },
      Ghost: 0.5,
      Steel: 0.5,
      Fire: 0.5,
      Grass: 2,
      Psychic: 2,
      Dark: 2,
      Fairy: 0.5
    },
    Ghost: {
      Normal: 0,
      Ghost: 2,
      Psychic: {
        default: 2,
        1: 0
      },
      Dark: 0.5,
      Steel: {
        default: 1,
        2: 0.5,
        3: 0.5,
        4: 0.5,
        5: 0.5
      }
    },
    Steel: {
      Rock: 2,
      Steel: 0.5,
      Fire: 0.5,
      Water: 0.5,
      Electric: 0.5,
      Ice: 2,
      Fairy: 2
    },
    Fire: {
      Rock: 0.5,
      Bug: 2,
      Steel: 2,
      Fire: 0.5,
      Water: 0.5,
      Grass: 2,
      Ice: 2,
      Dragon: 0.5
    },
    Water: {
      Ground: 2,
      Rock: 2,
      Fire: 2,
      Water: 0.5,
      Grass: 0.5,
      Dragon: 0.5
    },
    Grass: {
      Flying: 0.5,
      Poison: 0.5,
      Ground: 2,
      Rock: 2,
      Bug: 0.5,
      Steel: 0.5,
      Fire: 0.5,
      Water: 2,
      Grass: 0.5,
      Dragon: 0.5
    },
    Electric: {
      Flying: 2,
      Ground: 0,
      Water: 2,
      Grass: 0.5,
      Electric: 0.5,
      Dragon: 0.5
    },
    Psychic: {
      Fighting: 2,
      Poison: 2,
      Steel: 0.5,
      Psychic: 0.5,
      Dark: 0
    },
    Ice: {
      Flying: 2,
      Ground: 2,
      Steel: 0.5,
      Fire: {
        default: 0.5,
        1: 1
      },
      Water: 0.5,
      Grass: 2,
      Ice: 0.5,
      Dragon: 2
    },
    Dragon: {
      Steel: 0.5,
      Dragon: 2,
      Fairy: 0
    },
    Dark: {
      Fighting: 0.5,
      Ghost: 2,
      Psychic: 2,
      Dark: 0.5,
      Fairy: 0.5,
      Steel: {
        default: 1,
        2: 0.5,
        3: 0.5,
        4: 0.5,
        5: 0.5
      }
    },
    Fairy: {
      Fighting: 2,
      Poison: 0.5,
      Steel: 0.5,
      Fire: 0.5,
      Dragon: 2,
      Dark: 2
    }
  };
  //Set default value of 1
  let effectiveness = 1;

  try {
    //Try to get the full string. This will throw an error if the type matchup is neutral.
    //So in the catch statement we'll set it to 1 just to be safe.
    effectiveness = types[attackType][defenseType][generation];
    //This will be undefined if the type matchup doesn't have an edge case for that gen, so try default.
    if (effectiveness == undefined) {
      effectiveness = types[attackType][defenseType].default;
      //This will be undefined if no generation-based edge-cases exist for that matchup.
      if (effectiveness == undefined) {
        effectiveness = types[attackType][defenseType];
      }
    }
  } catch (e) {
    effectiveness = 1;
  }

  return effectiveness;
}
