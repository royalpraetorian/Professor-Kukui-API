/* eslint-disable */
//@todo Enable lint when refactoring is finished

import e from 'express';
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
  let data = GetDataSet(pokemonBuild, format, {});
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
  let res = await GetMoves(pokemonBuild, format.gen);
  pokemonBuild = res.build;
  let filteredMoveList = res.legalMoves;

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
  input = input.toLowerCase();
  if (input == 'vicegrip') {
    input = 'visegrip';
  }
  return input;
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

  //@todo Check Weather ball and

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
      if (monHasAbility(defender, 'Prism Armor')) {
        effectiveness *= 0.75;
      } else if (
        (monHasAbility(defender, 'Filter') ||
          monHasAbility(defender, 'Solid Rock')) &&
        !monHasAbilities(attacker, ['Mold Breaker', 'Teravolt', 'Turboblaze'])
      ) {
        effectiveness *= 0.75;
      }
    }
  }

  //@todo Check weather effects
  switch (weather) {
    case 'Harsh Sunlight':
      switch (move.type) {
        case 'Fire':
          effectiveness *= 1.5;
          break;
        case 'Water':
          effectiveness *= 0.5;
          break;
      }
      break;
    case 'Extremely Harsh Sunlight':
      switch (move.type) {
        case 'Fire':
          effectiveness *= 1.5;
          break;
        case 'Water':
          return 0;
      }
      break;
    case 'Rain':
      switch (move.type) {
        case 'Water':
          effectiveness *= 1.5;
          break;
        case 'Fire':
          effectiveness *= 0.5;
          break;
        case 'Grass':
          if (move.Name == 'Solar Beam' || move.Name == 'Solar Blade') {
            effectiveness *= 0.5;
          }
          break;
      }
      break;
    case 'Heavy Rain':
      break;
    case 'Sandstorm':
      break;
    case 'Hail':
      break;
    case 'Shadowy Aura':
      break;
    case 'Fog':
      break;
    case 'Strong Winds':
      break;
    default:
      break;
  }

  //@todo Check for damage increasing abilities on the attacker.
  switch (attacker.Ability) {
    case 'Iron Fist':
      if (move.flags.punch == 1) {
        effectiveness *= 1.2;
      }
      break;
    default:
      break;
  }

  //Set critical hit flag for use later.
  let criticalHit = false;

  switch (terrain) {
    default:
      break;
  }

  //If the defender has psychic surge we can't reliably hit it with priority moves.
  //This is true even if we have Mold Breaker, so we check before Mold Breaker.
  if (move.flags.priority == 1 && monHasAbility(defender, 'Psychcic Surge')) {
    effectiveness *= 0;
  }

  //@todo Figure out if I want to factor in weight for moves like Low Kick. If so, consider Heavy Metal and Light Metal perhaps?

  //Some checks to run that will return 0 automatically if the attacker does not have Mold Breaker, saving us some calculations.
  if (!monHasAbilities(attacker, ['Mold Breaker', 'Teravolt', 'Turboblaze'])) {
    /*Switches are more effecient than if statements
    //I coded these in the order they show up on the bulbapedia entry for Mold Breaker
    They are ordered to assume the worst case. For example, when checking fire-type moves, we check for Flash Fire first,
    As that has a 0x multiplier. Then we check for Heatproof, as that has a 0.5x multiplier. Then we check for Dry Skin,
    As that will actually increase our damage. We want to be as cautious as possible, just in case a pokemon has all three.
    Factoring multiple abilities into our math will become nonsense very quickly, so since we can only assume one,
    We want to assume the worst. This also saves a tiny amount of processing time.
    */

    if (monHasAbility(defender, 'Fluffy') && move.flags.contact == 1) {
      effectiveness *= 0.5;
    }

    if (
      move.flags.priority == 1 &&
      monHasAbilities(defender, 'Queenly Majesty', 'Dazzling')
    ) {
      effectiveness *= 0;
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
        } else if (
          monHasAbility(defender, 'Dry Skin') &&
          defender.abilities.length == 1
        ) {
          //Only factor positives if they are guranteed.
          effectiveness *= 1.25;
        } else if (
          monHasAbility(defender, 'Fluffy') &&
          defender.abilities.length == 1
        ) {
          //Only factor positives if they are guranteed.
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

export async function findOptimalBuild(build, format, params) {
  /* Params format:
  Params = {
    compareMethod: 'less bad' || 'more good',
    fieldEffects: {
      weather: '',
      terrain: ''
    },
    moves: {
      STAB: 'force' || 'any',
      stats: 'considered' || 'ignored',
      priority: 'force' || 'any',
      accuracyTolerance: #,
      contact: 'any' || 'force' || 'omit',
      recoil: 'any', || 'force' || 'omit',
      selfDebuff: 'any' || 'omit',
      minPP: #,
      ignoreList: ['']
    },
    enemies: {
      nfe: 'exclude' || 'include',
      topX: #
    } 
  }
  */
  //Check if build is parsed, if not: parse build
  try {
    build = parsePokePaste(build);
  } catch (e) {
    //Do nothing
  }
  //Check if build.moves.length >= 4
  //If yes, return current build.
  //If no, continue.
  let dataSet = await GetDataSet(build, format, params);
  build = dataSet.build;
  let allMoves = dataSet.legalMoves;
  let enemies = dataSet.enemies;

  //Trim allMoves by params.moves
  //- Remove all status moves
  //- Remove all moves that do not match provided parameters
  //- Remove moves that are objectively worse than another existing move
  //- Also remove status moves from current build.
  allMoves = trimMoves(allMoves, build, format.gen, params.moves);

  //Create & Test Sets recursively
}

function trimMoves(moveList, build, gen, params) {
  /*Remove all status, charge, and self destruct moves.
   */
  moveList = moveList.filter(
    m =>
      !(m.move.data.category == 'Status') &&
      !m.move.data.flags.charge &&
      !m.move.data.selfdestruct
  );

  moveList.forEach(move => {
    if (move.move.name == 'overheat') {
      console.log();
    }
  });

  //Filter by params.
  if (params.contact == 'omit') {
    moveList = moveList.filter(m => !m.move.data.flags.contact);
  }
  if (params.recoil == 'omit') {
    moveList = moveList.filter(m => !m.move.data.flags.recoil);
  }
}

async function GetDataSet(build, format, params) {
  //Parse format into gen and tier
  format = parseFormat(format);

  //Get pokemon data about the pokemon from pokeAPI
  let pokemonData = await pokeApiService.findPokemonByName(build.Pokemon);

  //Augment build with data
  build.Data = pokemonData;
  build.Types = app.data.pokedex[normalizeString(build.Pokemon)].types;

  //Construct and augment Final Stats (Factor items and abilities, like Flare Boost)
  build = CalculateStats(build, format);

  //Get moves
  let moves = await GetMoves(build, format);
  build = moves.build;
  let legalMoves = moves.legalMoves;

  //Get enemies
  let enemies = await GetEnemies(format, params);
  return { build: build, legalMoves: legalMoves, enemies: enemies };
}

function convertStatShorthand(statString) {
  switch (statString) {
    case 'HP':
      return 'HP';
    case 'Atk':
      return 'attack';
    case 'Def':
      return 'defense';
    case 'SpA':
      return 'special-attack';
    case 'SpD':
      return 'special-defense';
    case 'Spe':
      return 'speed';
  }
}

function CalculateStats(build, format) {
  console.log('test');
  //Declare Stats
  build.Stats = {};

  //Get stats
  let stats = Object.keys(build.EVs);

  stats.forEach(stat => {
    //Get base stats
    let baseStatValue = build.Data.stats.filter(
      buildStat =>
        normalizeString(buildStat.stat.name) ==
        normalizeString(convertStatShorthand(stat))
    )[0].base_stat;
    //Stats are calculated differently in gens 1 and 2
    //@todo Write gen 1 and 2 stat calculations
    if (format.gen < 3) {
      //HP is calculated differently from all other stats
    } else {
      //HP is calculated differently from all other stats
      if (stat == 'HP') {
        build.Stats[stat] =
          ((2 * baseStatValue + build.IVs[stat] + build.EVs[stat] / 4) *
            build.Level) /
            100 +
          build.Level +
          10;
      } else {
        build.Stats[stat] =
          ((2 * baseStatValue + build.IVs[stat] + build.EVs[stat] / 4) *
            build.Level) /
            100 +
          5;
      }
    }
  });

  //Factor in the pokemon's Nature. Natures only began to impact stats in HeartGold + SoulSilver, which was gen 4.
  if (format.gen > 3) {
    switch (build.Nature) {
      case 'Hardy':
        break;
      case 'Lonely':
        build.Stats.Atk = Math.trunc(build.Stats.Atk * 1.1);
        build.Stats.Def = Math.trunc(build.Stats.Def * 0.9);
        break;
      case 'Brave':
        build.Stats.Atk = Math.trunc(build.Stats.Atk * 1.1);
        build.Stats.Spe = Math.trunc(build.Stats.Spe * 0.9);
        break;
      case 'Adamant':
        build.Stats.Atk = Math.trunc(build.Stats.Atk * 1.1);
        build.Stats.SpA = Math.trunc(build.Stats.SpA * 0.9);
        break;
      case 'Naughty':
        build.Stats.Atk = Math.trunc(build.Stats.Atk * 1.1);
        build.Stats.SpD = Math.trunc(build.Stats.SpD * 0.9);
        break;
      case 'Bold':
        build.Stats.Def = Math.trunc(build.Stats.Def * 1.1);
        build.Stats.Atk = Math.trunc(build.Stats.Atk * 0.9);
        break;
      case 'Docile':
        break;
      case 'Relaxed':
        build.Stats.Def = Math.trunc(build.Stats.Def * 1.1);
        build.Stats.Spe = Math.trunc(build.Stats.Spe * 0.9);
        break;
      case 'Impish':
        build.Stats.Def = Math.trunc(build.Stats.Def * 1.1);
        build.Stats.SpA = Math.trunc(build.Stats.SpA * 0.9);
        break;
      case 'Lax':
        build.Stats.Def = Math.trunc(build.Stats.Def * 1.1);
        build.Stats.SpD = Math.trunc(build.Stats.Spd * 0.9);
        break;
      case 'Timid':
        build.Stats.Spe = Math.trunc(build.Stats.Spe * 1.1);
        build.Stats.Atk = Math.trunc(build.Stats.Atk * 0.9);
        break;
      case 'Hasty':
        build.Stats.Spe = Math.trunc(build.Stats.Spe * 1.1);
        build.Stats.Def = Math.trunc(build.Stats.Def * 0.9);
        break;
      case 'Serious':
        break;
      case 'Jolly':
        build.Stats.Spe = Math.trunc(build.Stats.Spe * 1.1);
        build.Stats.SpA = Math.trunc(build.Stats.SpA * 0.9);
        break;
      case 'Naive':
        build.Stats.Spe = Math.trunc(build.Stats.Spe * 1.1);
        build.Stats.SpD = Math.trunc(build.Stats.SpD * 0.9);
        break;
      case 'Modest':
        build.Stats.SpA = Math.trunc(build.Stats.SpA * 1.1);
        build.Stats.Atk = Math.trunc(build.Stats.Atk * 0.9);
        break;
      case 'Mild':
        build.Stats.SpA = Math.trunc(build.Stats.SpA * 1.1);
        build.Stats.Def = Math.trunc(build.Stats.Def * 0.9);
        break;
      case 'Quiet':
        build.Stats.SpA = Math.trunc(build.Stats.SpA * 1.1);
        build.Stats.Spe = Math.trunc(build.Stats.Spe * 0.9);
        break;
      case 'Bashful':
        break;
      case 'Rash':
        build.Stats.SpA = Math.trunc(build.Stats.SpA * 1.1);
        build.Stats.SpD = Math.trunc(build.Stats.SpD * 0.9);
        break;
      case 'Calm':
        build.Stats.SpD = Math.trunc(build.Stats.SpD * 1.1);
        build.Stats.Atk = Math.trunc(build.Stats.Atk * 0.9);
        break;
      case 'Gentle':
        build.Stats.SpD = Math.trunc(build.Stats.SpD * 1.1);
        build.Stats.Def = Math.trunc(build.Stats.Def * 0.9);
        break;
      case 'Sassy':
        build.Stats.SpD = Math.trunc(build.Stats.SpD * 1.1);
        build.Stats.Spe = Math.trunc(build.Stats.Spe * 0.9);
        break;
      case 'Careful':
        build.Stats.SpD = Math.trunc(build.Stats.SpD * 1.1);
        build.Stats.SpA = Math.trunc(build.Stats.SpA * 0.9);
        break;
      case 'Quirky':
        break;
    }
  }

  //Factor in items
  switch (build.Item) {
    //#region Choice Items
    case 'Choice Band':
      build.Stats.Atk *= 1.5;
      break;
    case 'Choice Specs':
      build.Stats.SpA *= 1.5;
      break;
    case 'Choice Scarf':
      build.Stats.Spe *= 1.5;
      break;
    //#endregion
    case 'Assault Vest':
      build.Stats.SpD *= 1.5;
      break;
    case 'Deep Sea Scale':
      if (build.Pokemon == 'Clamperl') {
        build.Stats.SpD *= 2;
      }
      break;
    case 'Deep Sea Tooth':
      if (build.Pokemon == 'Clamperl') {
        build.Stats.SpA *= 2;
      }
      break;
    case 'Eviolite':
      //@todo Eviolite
      break;
    case 'Light Ball':
      if (build.Pokemon == 'Pikachu') {
        //In gen 2 & 3 light ball only doubles SpA, in later gens it doubles both attack stats.
        if (format.gen < 4) {
          build.Stats.SpA *= 2;
        } else {
          build.Stats.SpA *= 2;
          build.Stats.Atk *= 2;
        }
      }
      break;
    case 'Thick Club':
      if (build.Pokemon == 'Cubone' || build.Pokemon == 'Marowak') {
        build.Stats.Atk *= 2;
      }
      break;
  }

  //"In Gold, Silver, and Crystal, if a Pokémon's stat reaches 1024 or higher (such as due to a held Thick Club), it will be reduced to its value modulo 1024." - Bulbapedia
  if (format.gen == 2) {
    stats.forEach(stat => {
      if (build.Stats[stat] >= 1024) {
        build.Stats[stat] = build.Stats[stat] % 1024;
      }
    });
  }

  return build;
}

async function GetMoves(build, format) {
  //Get all legal moves
  let legalMoves = await getFilteredMoveList(
    build.Data,
    build.Level,
    format.gen
  );

  //Clear build.Moves and store its moveNames separately.
  let buildMoves = build.Moves;
  build.Moves = [];

  //Get keys so we can iterate
  let legalMovesKeys = Object.keys(legalMoves);

  //Iterate over all legal moves
  legalMovesKeys.forEach(moveKey => {
    let move = legalMoves[moveKey].move;
    //- Add base-effectiveness trait
    let baseEffectiveness = 1;

    //Get move data
    move.name = normalizeString(move.name); //Format to match keys in app.data.moves
    let moveData = app.data.moves[move.name]; //Get from app.data.moves cache.
    move.data = moveData; //Augment.

    //- Calculate base-effectiveness based on build.Ability and STAB

    //Check for type-changing abilities and abilities that increase damage.
    switch (build.Ability) {
      //Abilities that change type
      case 'Normalize':
        move.data.type = 'Normal';
        break;
      case 'Aerilate':
        if (move.data.type == 'Normal') {
          move.data.type = 'Flying';
          if (Number(format.gen) > 5) {
            baseEffectiveness *= 1.2;
          } else {
            baseEffectiveness *= 1.3;
          }
        }
        break;
      case 'Galvanize':
        if (move.data.type == 'Normal') {
          move.data.type = 'Electric';
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Liquid Voice':
        if (move.data.flags.sound == 1) {
          move.data.type = 'Water';
        }
        break;
      case 'Pixilate':
        if (move.data.type == 'Normal') {
          move.data.type = 'Fairy';
          if (Number(format.gen) > 5) {
            baseEffectiveness *= 1.2;
          } else {
            baseEffectiveness *= 1.3;
          }
        }
        break;
      case 'Refrigerate':
        if (move.data.type == 'Normal') {
          move.data.type = 'Ice';
          if (Number(format.gen) > 5) {
            baseEffectiveness *= 1.2;
          } else {
            baseEffectiveness *= 1.3;
          }
        }
        break;
      //Abilities that increase damage based on other flags
      case "Dragon's Maw":
        if (move.data.type == 'Dragon') {
          baseEffectiveness *= 1.5;
        }
        break;
      case 'Iron Fist':
        if (move.data.flags.punch == 1) {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Mega Launcher':
        if (move.data.flags.aura == 1 || move.data.flags.pulse == 1) {
          baseEffectiveness *= 1.5;
        }
        break;
      case 'Punk Rock':
        if (move.data.flags.sound == 1) {
          baseEffectiveness *= 1.3;
        }
        break;
      case 'Reckless':
        if (move.data.recoil != null || move.data.hasCrashDamage) {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Sheer Force':
        if (move.data.secondary != null) {
          baseEffectiveness *= 1.3;
        }
        break;
      case 'Steelworker':
        if (move.data.type == 'Steel') {
          baseEffectiveness *= 1.5;
        }
        break;
      case 'Strong Jaw':
        if (move.data.flags.bite == 1) {
          baseEffectiveness *= 1.5;
        }
        break;
      case 'Technician':
        if (move.data.basePower <= 60) {
          baseEffectiveness *= 1.5;
        }
        break;
      case 'Tough Claws':
        if (move.data.flags.contact == 1) {
          baseEffectiveness *= 1.3;
        }
        break;
      case 'Transistor':
        if (move.data.type == 'Electric') {
          baseEffectiveness *= 1.5;
        }
        break;
      case 'Super Luck':
        if (move.data.critRatio != null) {
          move.data.critRatio += 1;
        } else {
          move.data.critRatio = 1;
        }
        break;
    }

    //Check items
    switch (build.Item) {
      //#region Type-Enhancing Items
      //Check for type-enhancing items. I'm not factoring in single-use items.
      case 'Adamant Orb':
        if (
          build.Pokemon == 'Dialga' &&
          (move.data.type == 'Dragon' || move.data.type == 'Steel')
        ) {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Black Belt':
        if (move.data.type == 'Fighting') {
          if (format.gen < 4) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Black Glasses':
        if (move.data.type == 'Dark') {
          if (format.gen < 4) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Charcoal':
        if (move.data.type == 'Fire') {
          if (format.gen < 4) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Dragon Fang':
        if (move.data.type == 'Dragon') {
          if (format.gen == 2) {
            //Due to a glitch in gen 1, nothing happens here.
          } else if (format.gen == 3) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Dragon Scale':
        if (move.data.type == 'Dragon') {
          if (format.gen == 2) {
            //Due to a glitch this item functions like Dragon Fang in gen 2
            baseEffectiveness *= 1.1;
          }
        }
        break;
      case 'Griseous Orb':
        if (
          build.Pokemon == 'Giratina' &&
          (move.data.type == 'Dragon' || move.data.type == 'Ghost')
        ) {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Hard Stone':
        if (move.data.type == 'Rock') {
          if (format.gen < 4) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Odd Incense':
        if (move.data.type == 'Psychic') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Rock Incense':
        if (move.data.type == 'Rock') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Rose Incense':
        if (move.data.type == 'Grass') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Sea Incense':
        if (move.data.type == 'Water') {
          if (format.gen == 3) {
            baseEffectiveness *= 1.05;
          } else {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Wave Incense':
        if (move.data.type == 'Water') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Pink Bow':
        if (move.data.type == 'Normal') {
          baseEffectiveness *= 1.1;
        }
        break;
      case 'Poison Barb':
        if (move.data.type == 'Poison') {
          if (format.gen < 4) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Polkadot Bow':
        if (move.data.type == 'Normal') {
          baseEffectiveness *= 1.1;
        }
        break;
      case 'Sharp Beak':
        if (move.data.type == 'Flying') {
          if (format.gen < 4) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Silk Scarf':
        if (move.data.type == 'Normal') {
          if (format.gen < 4) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Silver Powder':
        if (move.data.type == 'Bug') {
          if (format.gen < 4) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Soft Sand':
        if (move.data.type == 'Ground') {
          if (format.gen < 4) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Soul Dew':
        if (
          format.gen >= 7 &&
          (build.Pokemon == 'Latios' || build.Pokemon == 'Latios') &&
          (move.type == 'Psychic' || move.type == 'Dragon')
        ) {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Spell Tag':
        if (move.data.type == 'Ghost') {
          if (format.gen < 4) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      case 'Lustrous Orb':
        if (
          build.Pokemon == 'Palkia' &&
          (move.data.type == 'Water' || move.data.type == 'Dragon')
        ) {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Twisted Spoon':
        if (move.data.type == 'Psychic') {
          if (format.gen < 4) {
            baseEffectiveness *= 1.1;
          } else if (format.gen >= 4) {
            baseEffectiveness *= 1.2;
          }
        }
        break;
      //#endregion
      //#region Arceus' Plates
      case 'Draco Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Dragon';
        }
        if (move.data.type == 'Dragon') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Dread Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Dark';
        }
        if (move.data.type == 'Dark') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Earth Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Ground';
        }
        if (move.data.type == 'Ground') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Fist Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Fighting';
        }
        if (move.data.type == 'Fighting') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Flame Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Fire';
        }
        if (move.data.type == 'Fire') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Icicle Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Ice';
        }
        if (move.data.type == 'Ice') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Insect Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Bug';
        }
        if (move.data.type == 'Bug') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Iron Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Steel';
        }
        if (move.data.type == 'Steel') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Meadow Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Grass';
        }
        if (move.data.type == 'Grass') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Mind Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Psychic';
        }
        if (move.data.type == 'Psychic') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Pixie Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Fairy';
        }
        if (move.data.type == 'Fairy') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Sky Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Flying';
        }
        if (move.data.type == 'Flying') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Splash Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Water';
        }
        if (move.data.type == 'Water') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Spooky Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Ghost';
        }
        if (move.data.type == 'Ghost') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Stone Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Rock';
        }
        if (move.data.type == 'Rock') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Toxic Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Poison';
        }
        if (move.data.type == 'Poison') {
          baseEffectiveness *= 1.2;
        }
        break;
      case 'Zap Plate':
        if (move.name == 'judgement') {
          move.data.type = 'Electric';
        }
        if (move.data.type == 'Electric') {
          baseEffectiveness *= 1.2;
        }
        break;
      //#endregion
      //#region  Genesect Drives
      case 'Shock Drive':
        if (move.data.name == 'technoblast') {
          move.data.type = 'Electric';
        }
        break;
      case 'Burn Drive':
        if (move.data.name == 'technoblast') {
          move.data.type = 'Fire';
        }
        break;
      case 'Chill Drive':
        if (move.data.name == 'technoblast') {
          move.data.type = 'Ice';
        }
        break;
      case 'Douse Drive':
        if (move.data.name == 'technoblast') {
          move.data.type = 'Water';
        }
        break;
      //#endregion
      //#region Silvally Memories
      case 'Bug Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Bug';
        }
        break;
      case 'Dark Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Dark';
        }
        break;
      case 'Dragon Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Dragon';
        }
        break;
      case 'Electric Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Electric';
        }
        break;
      case 'Fairy Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Fairy';
        }
        break;
      case 'Fighting Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Fighting';
        }
        break;
      case 'Fire Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Fire';
        }
        break;
      case 'Flying Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Flying';
        }
        break;
      case 'Ghost Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Ghost';
        }
        break;
      case 'Grass Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Grass';
        }
        break;
      case 'Ground Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Ground';
        }
        break;
      case 'Ice Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Ice';
        }
        break;
      case 'Poison Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Poison';
        }
        break;
      case 'Psychic Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Psychic';
        }
        break;
      case 'Rock Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Rock';
        }
        break;
      case 'Steel Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Steel';
        }
        break;
      case 'Water Memory':
        if (move.data.name == 'multiattack') {
          move.data.type = 'Water';
        }
        break;
      //#endregion
      case 'Life Orb':
        baseEffectiveness *= 1.3;
        break;
      case 'Razor Claw':
        if (move.data.critRatio != null) {
          move.data.critRatio += 1;
        } else {
          move.data.critRatio = 1;
        }
        break;
      case 'Scope Lens':
        if (move.data.critRatio != null) {
          move.data.critRatio += 1;
        } else {
          move.data.critRatio = 1;
        }
        break;
      case 'Wide Lens':
        if (!(move.data.accuracy === true)) {
          move.data.accuracy = Math.floor(move.data.accuracy * 1.1);
        }
        break;
      case 'Zoom Lens':
        //This technically only activates if you move last, but I'm assuming if you're using it you're probably moving last.
        if (!(move.data.accuracy === true)) {
          move.data.accuracy = Math.floor(move.data.accuracy * 1.2);
        }
        break;
    }

    //STAB is Same Type Attack Bonus, power is multiplied by 1.5 if the attacker has the same type. (2x if Adaptability).
    //Pokemon with Protean or Libero always get STAB.

    //Check for STAB
    let STAB = false;
    if (monHasAbilities(build, ['Protean', 'Libero'])) {
      STAB = true;
    } else {
      if (build.Types.length > 1) {
        if (build.Types.includes(move.type)) {
          STAB = true;
        }
      } else {
        if (build.Types[0] == move.data.type) {
          STAB = true;
        }
      }
    }

    //Apply STAB if found.
    if (STAB) {
      if (build.Ability == 'Adaptability') {
        baseEffectiveness *= 2;
      } else {
        baseEffectiveness *= 1.5;
      }
    }

    //Check if crit is gurnateed and set flag
    if (format.gen > 5) {
      if (move.data.critRatio != null && move.data.critRatio >= 3) {
        move.data.willCrit = true;
      }
    }

    //Augment effectiveness
    move.data.baseEffectiveness = baseEffectiveness;

    /*If the move is Beat Up we'll need to set its base power.
    Beat Up is a really weird move. It hits once for each pokemon on your team,
    And the base power of each hit is determined by the base attack stat of that pokemon.
    It is then modified by the main pokemon's attack stat (the one using Beat Up),
    And can be amplified by STAB, items, and stat changes.

    For now we're going to use averages. The average attack stat across all pokemon is 75.
    We'll use your current pokemon's base attack stat for one hit, and then 75 for all the others.
    */
    if (move.name == 'beatup') {
      //Get current pokemon's base attack stat.
      let baseAttack = build.Data.stats[1].base_stat;
      let total = baseAttack / 10 + 5 + (75 / 10 + 5) * 5;
      move.data.multihit = 6;
      move.data.basePower = total / 6;
    }

    //Check if the pokeBuild is using that move and add to buildMoves if it is.
    if (buildMoves.some(buildMove => buildMove == moveData.name)) {
      build.Moves.push(move);
    }
  });
  //- if move exists in build replace build.move[x] with this move object.
  return { build: build, legalMoves: legalMoves };
}

function calculateMoveAverageDamage(build, move) {}

async function GetEnemies(format, params) {
  let enemies = [];
  //Get a list of all enemies that exist in this format
  let metagame = await showdownService.getMetagame(
    'gen' + format.gen + format.tier
  );
  metagame = metagame.pokemon;
  //Trim list by params.enemies
  //Return list
  return enemies;
}
