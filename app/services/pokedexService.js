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

// function augmentMoves(filteredMoveList) {}

export async function getOffenseMatchups(pokemonBuild, format) {
  //Get pokemon data about the pokemon from pokeAPI
  let pokemonData = await pokeApiService.findPokemonByName(
    pokemonBuild.Pokemon
  );

  //Augment pokemonBuild with Types
  pokemonBuild.Types =
    app.data.pokedex[normalizeString(pokemonBuild.Pokemon)].types;

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
    filtMove.move.name = normalizeString(filtMove.move.name); //Format to match keys in app.data.moves
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
  // let matchups = {
  //   0: {
  //     count: 0,
  //     pokemon: []
  //   },
  //   0.25: {
  //     count: 0,
  //     pokemon: []
  //   },
  //   0.5: {
  //     count: 0,
  //     pokemon: []
  //   },
  //   1: {
  //     count: 0,
  //     pokemon: []
  //   },
  //   2: {
  //     count: 0,
  //     pokemon: []
  //   },
  //   4: {
  //     count: 0,
  //     pokemon: []
  //   }
  // };

  //Define the set of enemy pokemon to check against.
  let enemySet = {};
  /*Narrow down pokemonInTier to only the mons we actually care about.
  Remove all not-fully-evolved forms. This information is stored in our JSON object under a key called 'evos'
  If a pokemon is fully evolved, the 'evos' key will not be present.
  */
  pokemonInTier.forEach(mon => {
    let monName = normalizeString(mon);
    if (app.data.pokedex[monName].evos == null) {
      enemySet[monName] = app.data.pokedex[monName];
      enemySet[monName].usage = {
        weighted: metagame[mon].usage.weighted
      };
    }
  });

  let matchup = checkOffensiveMatchup(
    pokemonBuild,
    buildMoves,
    enemySet,
    format
  );

  return {
    matchup
  };
}

function checkOffensiveMatchup(pokemonBuild, moves, enemySet, format) {
  //Get list of keys from enemySet
  let enemySetKeys = Object.keys(enemySet);

  //Define return object
  let matchup = {};

  //Check effectiveness of each move against each mon
  enemySetKeys.forEach(mon => {
    console.log('Checking effectiveness against: ' + mon);
    /*For each move the pokemon knows in its current build,
  Check the effectiveness of that move against each pokemon.
  Keep the highest number.
  */
    let monData = enemySet[mon];
    monData.effectiveness = 0;
    if (moves.length > 1) {
      moves.forEach(move => {
        //The effectiveness of the move starts at 1
        let effectiveness = checkMoveEffectiveness(
          move,
          pokemonBuild,
          monData,
          format
        );

        if (effectiveness > monData.effectiveness) {
          //If the effectiveness of this move is > than the stored value of the pokemon, overwrite it.
          monData.effectiveness = effectiveness;
        }
      });
    } else if (moves.length > 0) {
      let effectiveness = checkMoveEffectiveness(
        moves[0],
        pokemonBuild,
        monData,
        format
      );

      if (effectiveness > monData.effectiveness) {
        monData.effectiveness = effectiveness;
      }
    } else {
      return {};
    }

    //Check if key exists in matchups, if it doesn't: add it.
    let keys = Object.keys(matchup);
    if (keys.length == 0 || !keys.includes(monData.effectiveness.toString())) {
      matchup[monData.effectiveness] = {
        count: 0,
        pokemon: []
      };
    }

    //Sort pokemon into groups in matchup spread based on their effectiveness.
    matchup[monData.effectiveness].pokemon.push({
      name: monData.name,
      usage: monData.usage.weighted
    });
    matchup[monData.effectiveness].count++;
  });

  return matchup;
}

function normalizeString(input) {
  //Removes special characters and returns lower-case string.
  let regex = /[^a-zA-Z]/i;
  while (input.match(regex) != null) {
    input = input.replace(regex, '');
  }
  return input.toLowerCase();
}

function checkMoveEffectiveness(
  move,
  attacker,
  defender,
  format,
  weather = 'none',
  terrain = 'none'
) {
  //Effectiveness is calculated beginning at 1
  let effectiveness = 1;

  //We'll be using this a lot so let's shorten it a little.
  let defenderTypes = defender.types;

  /*Check if the user is using flying-press.
  Flying press is the only multi-type attack in the game.
  As such it must be treated specially.
  */

  //@todo Check for Aerilate, etc, which change move type. Possibly do this at a higher level to reduce calculations?

  //Check if the defender is multi-type
  if (defenderTypes.length == 1) {
    if (
      defenderTypes[0] == 'Ghost' &&
      (move.type == 'Normal' || move.type == 'Fighting') &&
      monHasAbility(attacker, 'Scrappy')
    ) {
      effectiveness *= 1;
    } else {
      effectiveness *= checkTypeEffectiveness(
        move.type,
        defenderTypes[0],
        format.gen
      );
    }
  } else {
    //For each type the pokemon has, multiply effectiveness by theresult of checkEffectiveness()
    defenderTypes.forEach(type => {
      if (
        type == 'Ghost' &&
        (move.type == 'Normal' || move.type == 'Fighting') &&
        monHasAbility(attacker, 'Scrappy')
      ) {
        effectiveness *= 1;
      } else {
        effectiveness *= checkTypeEffectiveness(move.type, type, format.gen);
      }
    });

    /*Immediately after effectiveness has been checked, check for certain super-effective clauses.
    Expert belt multiplies super-effective damage by 1.2x, for example, and we can only reliably check if a pokemon is super-effected
    By a move before we have applied any other modifiers.
    */
    if (effectiveness >= 2) {
      if (
        monHasAbility(defender, 'Wonder Guard') &&
        !monHasAbility(attacker, 'Mold Breaker')
      ) {
        return 0;
      }
      if (attacker.Item == 'Expert Belt') {
        effectiveness *= 1.2;
      }
      if (
        (monHasAbility(defender, 'Filter') ||
          monHasAbility(defender, 'Solid Rock')) &&
        !monHasAbility(attacker, 'Mold Breaker')
      ) {
        effectiveness *= 0.75;
      }
    }
  }

  //Set critical hit flag for use later.
  let criticalHit = false;

  //Weather and Terrain switches
  switch (weather) {
    default:
      break;
  }
  switch (terrain) {
    default:
      break;
  }

  //@todo Add prio checks for mons with Dazzling, Queenly Majesty, or Psychic Surge

  //@todo Figure out if I want to factor in weight for moves like Low Kick. If so, consider Heavy Metal and Light Metal perhaps?

  //Some checks to run that will return 0 automatically if the attacker does not have Mold Breaker, saving us some calculations.
  //@todo Possibly consider casting Teravolt and Turboblaze to Mold Breaker for less checks?
  if (!monHasAbilities(attacker, ['Mold Breaker', 'Teravolt', 'Turboblaze'])) {
    /*Switches are more effecient than if statements
    //I coded these in the order they show up on the bulbapedia entry for Mold Breaker
    They are ordered to assume the worst case. For example, when checking fire-type moves, we check for Flash Fire first,
    As that has a 0x multiplier. Then we check for Heatproof, as that has a 0.5x multiplier. Then we check for Dry Skin,
    As that will actually increase our damage. We want to be as cautious as possible, just in case a pokemon has all three.
    Factoring multiple abilities into our math will become nonsense very quickly, so since we can only assume one,
    We want to assume the worst. This also saves a tiny amount of processing time.
    */

    //@todo Fluffy
    if (monHasAbility(defender, 'Fluffy') && move.flags.contact == 1) {
      effectiveness *= 0.5;
    }

    //@todo Consider redoing this as a switch on defender ability, to save processes.
    //@todo only apply positive buffs if it is the only ability the defender has.
    switch (move.type) {
      case 'Water':
        if (monHasAbility(defender, 'Dry Skin')) {
          return 0;
        } else if (monHasAbility(defender, 'Storm Drain')) {
          return 0;
        } else if (monHasAbility(defender, 'Water Absorb')) {
          return 0;
        }
        break;
      case 'Fire':
        if (monHasAbility(defender, 'Flash Fire')) {
          return 0;
        } else if (monHasAbility(defender, 'Heatproof')) {
          effectiveness *= 0.5;
        } else if (monHasAbility(defender, 'Water Bubble')) {
          effectiveness *= 0.5;
        } else if (monHasAbility(defender, 'Thick Fat')) {
          effectiveness *= 0.5;
        } else if (monHasAbility(defender, 'Dry Skin')) {
          effectiveness *= 1.25;
        } else if (monHasAbility(defender, 'Fluffy')) {
          effectiveness *= 2;
        }
        break;
      case 'Ground':
        if (monHasAbility(defender, 'Levitate')) {
          return 0;
        }
        break;
      case 'Electric':
        if (monHasAbility(defender, 'Lightning Rod')) {
          return 0;
        } else if (monHasAbility(defender, 'Motor Drive')) {
          return 0;
        } else if (monHasAbility(defender, 'Volt Absorb')) {
          return 0;
        }
        break;
      case 'Ice':
        if (monHasAbility(defender, 'Thick Fat')) {
          effectiveness *= 0.5;
        }
        break;
      case 'Grass':
        if (monHasAbility(defender, 'Sap Sipper')) {
          return 0;
        }
        break;
      default:
        break;
    }

    if (monHasAbility(defender, 'Bulletproof') && move.flags.bullet == 1) {
      return 0;
    }
    if (monHasAbility(defender, 'Soundproof') && move.flags.sound == 1) {
      return 0;
    }
  }

  //Critical strike check for moves like Surging Strikes
  if (move.willCrit) {
    if (
      !monHasAbilities(defender, ['Shell Armor', 'Battle Armor']) ||
      monHasAbilities(attacker, 'Mold Breaker')
    ) {
      //The move is a critical hit, but the damage calculations are based on generation.
      criticalHit = true;
      if (format.gen == 1) {
        effectiveness *= (2 * attacker.Level + 5) / (attacker.Level + 5);
      } else if (format.gen > 1 && format.gen < 6) {
        effectiveness *= 2;
      } else {
        effectiveness *= 1.5;
      }

      //Additionally, pokemon with the Sniper ability get another 1.5x multiplier
      if (monHasAbility(attacker, 'Sniper')) {
        effectiveness *= 1.5;
      }
    }
  }

  //@todo Check for guranteed criticals from +3 or higher stages of critical increase

  /*Check if the move gets Same Type Attack Bonus (STAB) and, if so, multiply effectiveness by 1.5x
  A move gets STAB if it is the same type as the pokemon using it.
  If the pokemon has Adaptibility as its ability, the move gets 2x instead of 1.5x.
  First check if a pokemon has Protean or Libero, which will give all of its moves STAB.
  */
  if (monHasAbilities(attacker, ['Protean', 'Libero'])) {
    effectiveness *= 1.5;
  } else if (attacker.Types.includes(move.type)) {
    if (attacker.Ability == 'Adaptability') {
      effectiveness *= 2;
    } else {
      effectiveness *= 1.5;
    }
  }

  //If the attacker has Water Bubble, its water type moves deal 2x damage
  if (attacker.Ability == 'Water Bubble' && move.type == 'Water') {
    effectiveness *= 2;
  }

  //Check for Ice Scales
  if (monHasAbility(defender, 'Ice Scales') && move.category == 'Special') {
    effectiveness *= 0.5;
  }

  //Check for stat dropping abilities like Intimidate
  if (
    monHasAbility(defender, 'Intimidate') &&
    !criticalHit &&
    move.category == 'Physical' &&
    !monHasAbilities(attacker, [
      'Hyper Cutter',
      'Clear Body',
      'White Smoke',
      'Full Metal Body',
      'Inner Focus',
      'Oblivious',
      'Scrappy',
      'Own Tempo'
    ])
  ) {
    //Stat stages work differently by generation
    if (format.gen < 3) {
      effectiveness *= 66 / 100;
    } else {
      effectiveness *= 2 / 3;
    }
  }

  return effectiveness;
}

function checkTypeEffectiveness(attackType, defenseType, generation) {
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

//@todo Consider re-writing this to accept multiple abilities, for better optimization. Or write a new method that accepts multiples.
function monHasAbilities(mon, abilities) {
  abilities.forEach(ability => {
    if (monHasAbility(mon, ability)) {
      return true;
    }
  });
  return false;
}

function monHasAbility(mon, ability) {
  //Check format of mon
  if (mon.Ability != undefined) {
    //Pokemon is in pokePaste format
    return normalizeString(mon.Ability) == normalizeString(ability);
  } else {
    //Pokemon is probably in dex format and has .abilities instead
    //Check if .abilities.length > 1
    if (mon.abilities.length > 1) {
      //Check with .some
      return mon.abilities.some(monAbility => {
        normalizeString(monAbility) == normalizeString(ability);
      });
    } else {
      //Check with index 0 ==
      return normalizeString(mon.abilities[0]) == normalizeString(ability);
    }
  }
}
