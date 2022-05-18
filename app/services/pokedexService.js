import app from '../index.js';
import * as pokeApiService from './pokeApiService.js';
import * as showdownService from './showdownService.js';
var iterations = 0;
//#region Constants
const types = [
  'Normal',
  'Fire',
  'Water',
  'Grass',
  'Electric',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dark',
  'Dragon',
  'Steel',
  'Fairy'
];
// const categories = ['Physical', 'Special'];
//#endregion

/* Params format:
  Params = {
    compareMethod: 'less bad' || 'more good',
    fieldEffects: {
      weather: '',
      terrain: ''
    },
    statStages: {
      Atk: 0,
      Def: 0,
      SpA: 0,
      SpD: 0,
      Spe: 0
    },
    status: '',
    moves: {
      STAB: 'force' || 'any',
      stats: 'considered' || 'ignored',
      priority: 'force' || 'any',
      accuracyTolerance: #,
      contact: 'any' || 'force' || 'omit',
      recoil: 'any', || 'force' || 'omit',
      selfDebuff: 'any' || 'omit',
      selfTrapping: 'any' || 'omit',
      selfDebuffing: 'any' || 'omit' || 'force',
      switching: 'any' || 'omit',
      minPP: #,
      ignoreList: ['']
    },
    enemies: {
      nfe: 'exclude' || 'include',
      minUsage: #
    } 
  }
  */

//#region Exports
export async function findOptimalBuild(build, format, params) {
  //#region Debug
  iterations = 0;
  //#endregion
  //Check if build is parsed, if not: parse build
  try {
    build = parsePokePaste(build);
  } catch (e) {
    //Do nothing
  }
  //Check if build.moves.length >= 4
  //If yes, return current build.
  //If no, continue.

  //Parse format
  format = parseFormat(format);
  let dataSet = await getDataSet(build, format, params);
  build = dataSet.build;
  let allMoves = dataSet.legalMoves;
  let enemies = dataSet.enemies;

  //Trim allMoves by params.moves
  //- Remove all status moves
  //- Remove all moves that do not match provided parameters
  //- Remove moves that are objectively worse than another existing move
  //- Also remove status moves from current build.
  allMoves = trimMoves(allMoves, build, format.gen, params.moves);

  //Define each enemy build we are measuring effectiveness against
  let enemyBuilds = [];

  //Calculate hits-to-KO of each move against each mon.
  enemyBuilds = calculateMoveListDamageVsEnemyBuilds(
    enemies,
    format,
    params,
    allMoves,
    build
  );

  let bestSet = constructAndTestSets(allMoves, [], enemyBuilds, params, build);
  bestSet = cleanUpMatchupOutput(bestSet);
  //#region Debug
  console.log(
    'Tested ' + iterations + ' sets of ' + allMoves.length + ' moves'
  );
  //Append all tested moves
  bestSet['all_tested_moves'] = [];
  allMoves.forEach(m => bestSet['all_tested_moves'].push(m.move.name));
  // let foulPlayOHKO = bestSet.matchups[1].pokemon.filter(
  //   p => p.move == 'foulplay'
  // );
  //#endregion

  return bestSet;
}
export async function getBuildMatchupSpread(build, format, params) {
  //Parse build
  try {
    build = parsePokePaste(build);
  } catch (e) {
    //Do nothing
  }
  //Parse format
  format = parseFormat(format);
  let dataSet = await getDataSet(build, format, params);
  build = dataSet.build;
  let enemies = dataSet.enemies;

  let enemyBuilds = calculateMoveListDamageVsEnemyBuilds(
    enemies,
    format,
    params,
    removeStatusMoves(build.Moves),
    build
  );
  let matchup = {
    matchup: calculateSetMatchupSpread(build.Moves, enemyBuilds),
    moves: build.Moves
  };
  return cleanUpMatchupOutput(matchup);
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
    let speciesMatch = /^[^@()]*/; //The species, if it is followed by anything, will be followed by either @ or (, so we match up until those points, from the beginning.
    pokemon.Pokemon = info.match(speciesMatch)[0].trim();
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

export async function findFasterPokemon(speed, format) {
  try {
    format = parseFormat(format);
  } catch (e) {
    //Do nothing
  }
  //Get all pokemon in format.
  let metagame = await showdownService.getMetagame(
    'gen' + format.gen + format.tier
  );
  metagame = metagame.pokemon;

  //What would a mon's base speed have to be to outspeed this one without the help of items or buffs?
  let minBaseSpeedUnbuffed = Math.ceil(0.454545 * speed - 49.5);
  //What about with choice scarf?
  let minBaseSpeedScarfed = Math.ceil(0.30303 * speed - 49.5);
  //What about with an ability that doubles speed?
  let minBaseSpeedAbility = Math.ceil(0.227273 * speed - 49.5);

  //Define return object
  let results = {
    Unscarfed: [],
    Scarfed: [],
    WithAbility: []
  };
  let pokemon = Object.keys(metagame);
  pokemon.forEach(m => {
    let pokemon = app.data.pokedex[normalizeString(m)];
    let monSpeed = pokemon.baseStats.spe;
    if (monSpeed > minBaseSpeedAbility) {
      //If the pokemon's speed is lower than minBaseSpeedAbility, it has no chance. So it must be at least higher than that.
      //If the pokemon's speed is greater than minBaseSpeedUnbuffed, it doesn't need any assistance to outspeed the threat.
      if (monSpeed > minBaseSpeedUnbuffed) {
        results.Unscarfed.push(m);
      } else if (monSpeed > minBaseSpeedScarfed) {
        //If the pokemon is fast enough that wearing a scarf can get it there, add it to the Scarfed array.
        results.Scarfed.push(m);
      } else if (
        monSpeed > minBaseSpeedAbility &&
        monHasAbilities(pokemon, [
          'Swift Swim',
          'Slush Rush',
          'Sand Rush',
          'Chlorophyll',
          'Unburden',
          'Surge Surfer'
        ])
      ) {
        //If the pokemon has at least enough speed that doubling it will get it there, and it has one of these abilities, we add it to the final list.
        results.WithAbility.push(m);
      }
    }
  });

  return results;
}
//#endregion

//#region Simple Checks
function monIgnoresAbilities(build) {
  return monHasAbilities(build, ['Mold Breaker', 'Teravolt', 'Turboblaze']);
}
function isGrounded(pokemon) {
  let isFlying = false;
  if (pokemon.Types.length > 1) {
    pokemon.Types.forEach(type => {
      if (type == 'Flying') {
        isFlying = true;
      }
    });
  } else {
    isFlying = pokemon.Types[0] == 'Flying';
  }
  return (
    monHasAbility(pokemon, 'Levitate') ||
    isFlying ||
    pokemon.Item == 'Air Balloon'
  );
}
function isDefensivelyRelevantItem(item) {
  //@todo Add berries
  //@todo Add leftovers
  let defensivelyRelevantItems = [
    'Air Balloon',
    'Assault Vest',
    'Focus Sash',
    'Leftovers',
    'Choice Band',
    'Deep Sea Scale',
    'Eviolite',
    'Light Ball',
    'Soul Dew',
    'Thick Club'
  ];
  return defensivelyRelevantItems.some(n => n == item);
}
function isDefensivelyRelevantAbility(ability) {
  let defensivelyRelevantAbilities = [
    'Aura Break',
    'Bulletproof',
    'Disguise',
    'Dry Skin',
    'Filter',
    'Flash Fire',
    'Fluffy',
    'Heatproof',
    'Ice Face',
    'Levitate',
    'Lighting Rod',
    'Motor Drive',
    'Multiscale',
    'Neuroforce',
    'Prism Armor',
    'Punk Rock',
    'Sap Sipper',
    'Shadow Shield',
    'Solid Rock',
    'Soundproof',
    'Storm Drain',
    'Thick Fat',
    'Volt Absorb',
    'Water Absorb',
    'Water Bubble',
    'Wonder Guard',
    'Drizzle',
    'Drought',
    'Desolate Land',
    'Primordial Sea',
    'Sand Stream',
    'Snow Warning',
    'Delta Stream',
    'Electric Surge',
    'Grassy Surge',
    'Misty Surge',
    'Psychic Surge'
  ];
  return defensivelyRelevantAbilities.some(n => n == ability);
}
function checkMoveTypeEffectivenessVsEnemy(moveType, defenderTypes, gen) {
  let typeEffectiveness = 1;
  if (defenderTypes.length > 1) {
    typeEffectiveness *= checkTypeEffectiveness(
      moveType,
      defenderTypes[0],
      gen
    );
    typeEffectiveness *= checkTypeEffectiveness(
      moveType,
      defenderTypes[1],
      gen
    );
  } else {
    typeEffectiveness *= checkTypeEffectiveness(
      moveType,
      defenderTypes[0],
      gen
    );
  }
  return typeEffectiveness;
}
//@todo Consider re-writing this to accept multiple abilities, for better optimization. Or write a new method that accepts multiples.
function monHasAbilities(mon, abilities) {
  let hasAbility = false;
  abilities.forEach(ability => {
    if (monHasAbility(mon, ability)) {
      hasAbility = true;
    }
  });
  return hasAbility;
}
function monHasAbility(mon, ability) {
  //Check format of mon
  if (mon.Ability != undefined) {
    //Pokemon is in pokePaste format
    return normalizeString(mon.Ability) == normalizeString(ability);
  } else {
    //Pokemon is probably in dex format and has .abilities instead
    //Get keys
    let abilityKeys = Object.keys(mon.abilities);
    //Check if .abilities.length > 1
    if (abilityKeys.length > 1) {
      //Check with .some
      return abilityKeys.some(monAbility => {
        let monAbilityCheck = normalizeString(mon.abilities[monAbility]);
        let checkAbility = normalizeString(ability);
        return monAbilityCheck == checkAbility;
      });
    } else {
      //Check with index 0 ==
      return normalizeString(mon.abilities[0]) == normalizeString(ability);
    }
  }
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
      Fairy: 2,
      Steel: 0
    },
    Ground: {
      Poison: 2,
      Rock: 2,
      Bug: 0.5,
      Steel: 2,
      Fire: 2,
      Grass: 0.5,
      Electric: 2,
      Flying: 0
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
//#endregion

//#region Data
async function getDataSet(build, format, params) {
  //Try to parse format into gen and tier
  try {
    format = parseFormat(format);
  } catch (e) {
    console.log();
  }

  //Get pokemon data about the pokemon from pokeAPI
  let pokemonData = await pokeApiService.findPokemonByName(
    build.Pokemon,
    format.gen
  );

  //Augment build with data
  build.Data = pokemonData;
  build.Types = app.data.pokedex[normalizeString(build.Pokemon)].types;

  //Add expected stat changes and status effects.
  build.Status = params.status;
  build.StatStages = {};
  let statKeys = Object.keys(params.statStages);
  statKeys.forEach(stat => {
    build.StatStages[stat] = params.statStages[stat];
  });

  //Construct and augment Final Stats (Factor items and abilities, like Flare Boost)
  build = calculateStats(build, format);

  //Get moves
  let moves = await getMoves(build, format, params);
  build = moves.build;
  let legalMoves = moves.legalMoves;

  //Get enemies
  let enemies = await getEnemies(format, params);
  return { build: build, legalMoves: legalMoves, enemies: enemies };
}
async function getMoves(build, format, params) {
  //Get all legal moves
  let moves = build.Data.moves;

  //Clear build.Moves and store its moveNames separately.
  let buildMoves = build.Moves;
  build.Moves = [];

  //Run calculateBaseMoveEffectiveness on buildMoves and moves
  moves = calculateMovesBaseEffectiveness(moves, format, params, build);
  build.Moves = moves.filter(move =>
    buildMoves.some(
      buildMove => normalizeString(buildMove) == normalizeString(move.move.name)
    )
  );
  return { build: build, legalMoves: moves };
}
async function getEnemies(format, params) {
  let enemies = [];
  //Get a list of all enemies that exist in this format
  let metagame = await showdownService.getMetagame(
    'gen' + format.gen + format.tier
  );
  metagame = metagame.pokemon;

  //If the user wants the whole list of pokemon, we can just return metagame now.
  if (params.enemies.minUsage <= 0) {
    return metagame;
  }

  //If the user has specified some amount greater than 0, we need to sort and trim the list.
  //Get keys
  let keys = Object.keys(metagame);

  //Iterate through the list, appending each pokemon's name to its data and then adding it to an array.
  keys.forEach(name => {
    metagame[name].name = name;
    enemies.push(metagame[name]);
  });

  //Sort array by usage and add the top x pokemon to filteredEnemies as properties.
  let filteredEnemies = enemies.filter(
    enemy => enemy.usage.raw >= params.enemies.minUsage
  );

  //Return topX pokemon in their by usage.
  return filteredEnemies;
}
function trimMoves(moveList, build, gen, params) {
  //Get opponent-variable moves like Foul Play, Gyro Ball, etc, and add them to their own list to be re-added at the end.
  const opponentVariableMoveNames = [
    // 'Gyro Ball',
    // 'Grass Knot',
    // 'Electro Ball',
    // 'Heavy Slam',
    // 'Magnitude',
    // 'Natural Gift',
    // 'Nature Power',
    // 'Hidden Power',
    // 'Wring Out',
    // 'Punishment',
    // 'Heat Crash',
    // 'Return',
    'Low Kick',
    'Knock Off',
    'Foul Play'
  ];
  let opponentVariableMoves = moveList.filter(m =>
    opponentVariableMoveNames.some(n => m.move.name == normalizeString(n))
  );
  /*Remove all status, charge, recharge, -priority, 0 power, and self destruct moves.
   */
  moveList = moveList.filter(
    m =>
      !(m.move.data.category == 'Status') &&
      !m.move.data.flags.charge &&
      !m.move.data.selfdestruct &&
      !m.move.data.flags.recharge &&
      m.move.data.priority >= 0 &&
      m.move.data.basePower > 0 &&
      opponentVariableMoves.some(n => n != m)
  );
  //#region Debug
  //#endregion
  //Remove moves that fail unless specific conditions are met, except Poltergeist, which can stay.
  moveList = moveList.filter(
    m =>
      !m.move.data.desc.includes('fails') &&
      !m.move.data.desc.includes('Fails') &&
      m.move.name != 'poltergeist'
  );
  //Remove all moves with a lower accuracy than the user's tolerance.
  //Accuracy is sometimes stored as 'true' rather than 100, for moves that cannot have their accuracy reduced.
  moveList = moveList.filter(
    m =>
      m.move.data.accuracy == true ||
      m.move.data.accuracy >= params.accuracyTolerance
  );

  //Remove moves with less PP than the user's specified minimum
  moveList = moveList.filter(m => m.move.data.pp >= params.minPP);

  //Filter by params.
  if (params.contact == 'omit') {
    //Remove contact moves if specified
    moveList = moveList.filter(m => !m.move.data.flags.contact);
  }
  if (params.recoil == 'omit') {
    //Remove recoil moves if specified
    moveList = moveList.filter(m => !m.move.data.recoil);
  }
  if (params.selfDebuffing == 'omit') {
    //Remove moves that debuff offensive stats like Atk, SpA, and Spe
    moveList = moveList.filter(m => {
      if (m.move.data.self && m.move.data.self.boosts) {
        let stats = Object.keys(m.move.data.self.boosts); //Get the names of the stats being changed
        for (let i = 0; i < stats.length; i++) {
          //Check if the stat being changed is a relevant offensive stat, and then check if its value is negative.
          if (
            (stats[i] == 'spe' || stats[i] == 'atk' || stats[i] == 'spa') &&
            m.move.data.self.boosts[stats[i]] < 0
          ) {
            return false;
          }
        }
      }
      return true;
    });
  }
  if (params.switching == 'omit') {
    //Remove moves that switch the user out.
    moveList = moveList.filter(m => !m.move.data.selfSwitch);
  }
  if (params.selfTrapping == 'omit') {
    //Remove moves that trap the user.
    moveList = moveList.filter(m => {
      let volatileStatus = m.move.data.self?.volatileStatus;
      if (volatileStatus == 'uproar' || volatileStatus == 'lockedmove') {
        return false;
      } else return true;
    });
  }
  if (params.ignoreList.length > 0) {
    //Remove moves the user specifies they do not want.
    moveList = moveList.filter(
      m =>
        !params.ignoreList.some(
          i => normalizeString(i) == normalizeString(m.move.name)
        )
    );
  }

  //Now we narrow down to only the best options.
  //We want the best move of each category/type combination.
  //The user can also force certain moves, like multihit or priority moves.
  let bestMoves = [];
  let categories = ['Special', 'Physical'];
  //Get the moves into an array so we can iterate, sort, and filter
  let movesArray = [];
  Object.keys(moveList).forEach(x => movesArray.push(moveList[x]));
  categories.forEach(category => {
    //For each of the two categories,
    types.forEach(type => {
      //#region Debug
      if (category == 'Physical' && type == 'Ice') {
        console.log();
      }
      //#endregion
      //And for each type,
      //Filter to only moves of that type and category.
      let movesOfType = movesArray.filter(
        move =>
          move.move.data.type == type && move.move.data.category == category
      );
      //Make sure the list isn't empty.
      if (movesOfType.length > 1) {
        //Sort by damage
        movesOfType = movesOfType.sort((a, b) => {
          if (a.move.data.averageOutput < b.move.data.averageOutput) {
            return true;
          } else if (a.move.data.averageOutput == b.move.data.averageOutput) {
            //Check accuracy to break ties.
            if (a.move.data.accuracy == b.move.data.accuracy) {
              //This returns true if the moves are tied for accuracy, including in cases where accuracy is True
              //@todo Check Secondary effects, then PP before coin toss.
              //Flip a coin to tie break.
              return +(Math.random() > 0.5) || -1;
            } else if (
              a.move.data.accuracy === true ||
              b.move.data.accuracy === true
            ) {
              return +(b.move.data.accuracy === true) || -1; //If either move has 'true' accuracy, but they didn't tie, then the move with 'true' accuracy is better.
            } else {
              return +(a.move.data.accuracy < b.move.data.accuracy) || -1; //If there is no tie and nither move has 'true' accuracy we simply compare.
            }
          } else {
            return -1;
          }
        });
        //Now that the list is sorted we simply take the top value, then check if the user is trying to force any moves.
        bestMoves.push(movesOfType[0]);
        //Check for forced priority moves and add the best of those.
        if (params.priority == 'force') {
          let prioMoves = movesOfType.filter(m => m.move.data.priority > 0);
          if (prioMoves.length > 0) {
            bestMoves.push(prioMoves[0]);
          }
        }
        //Check for forced contact moves.
        if (params.contact == 'force') {
          let contactMoves = movesOfType.filter(
            m => m.move.data.flags.contact != undefined
          );
          if (contactMoves.length > 0) {
            bestMoves.push(contactMoves[0]);
          }
        }
        //Check forced recoil moves
        if (params.recoil == 'force') {
          let recoilMoves = movesOfType.filter(
            m => m.move.data.recoil != undefined
          );
          if (recoilMoves.length > 0) {
            bestMoves.push(recoilMoves[0]);
          }
        }
      } else if (movesOfType.length == 1) {
        bestMoves.push(movesOfType[0]);
      }
    });
  });

  //Add back in special always-include moves such as damage-variable moves
  opponentVariableMoves.forEach(m => {
    //Avoid duplicates
    if (!bestMoves.some(n => n == m)) {
      bestMoves.push(m);
    }
  });

  return bestMoves;
}
function constructSetWithForcedMoves(allMoves, currentSet, params, build) {
  /*This will only ever be called in currentSet.length < 4. This method will return the new currentSet most of the time.
  If this method runs but cannot add a move to a set (meaning it meets all of the user param's requirements) it will return true or false.
  It will return true in this case if it cannot add a move because all the conditions are already met.
  It will instead return false if it cannot add a move but the conditions are not met.
  */
  //Define return value
  let returnSet = [...currentSet];
  if (params.moves.STAB == 'force') {
    let stabMoves = [];
    //Construct a set with an attack of each of the attacker's types.
    let hasStabMoves = true;
    build.Types.forEach(type => {
      if (!currentSet.some(move => move.move.data.type == type)) {
        hasStabMoves = false;
        allMoves
          .filter(m => m.move.data.type == type)
          .forEach(m => stabMoves.push(m));
      }
    });

    if (hasStabMoves) {
      return true;
    } else if (stabMoves.length > 0) {
      //Add one of the moves, remove it from allMoves, and return the new set.
      returnSet.push(stabMoves[0]);
      return returnSet;
    }
  }

  //If we were unable to add any moves to the provided set, but it meets all the conditions specified in params, we return true.
  return false;
}
function constructAndTestSets(
  allMoves,
  currentSet,
  enemyBuilds,
  params,
  build,
  bestSet = null
) {
  /*This function is recursive.
  -allMoves defines the list of all the moves we want to use to construct sets of 4 unique moves.
    These moves should already contain matchup data.
  -currentSet defines the current set of 4 unique moves. Different orderings of the moves do not constitute uniqueness.
    We must check if currentSet contains 4 moves. If it does not, we will select a move from the list, add it to currentSet, and subsequently remove it from that list.
    Then we will pass in the newly trimmed list and the new currentSet into this method recursively.
  -enemies defines the list of all the enemy builds we will be testing against. This is provided to increase lookup time.
  -params tells us what criteria we're using to compare two builds.
  -bestSet defines the current best set we have found. Each time we construct a unique set of 4 moves and find its matchup spread, we will compare it against
    bestSet, and keep the better of the two as the new bestSet. This will be the return value. bestSet will contain both the set of 4 moves, and the matchupSpread
    object that is the compilation of its matchups.
  */

  //Check to see  if the currentSet that has been provided is complete or not.
  if (currentSet.length == 4) {
    //#region Debug
    console.log('Iterations: ' + iterations++);
    //#endregion
    //If it is, we calculate its matchup spread.
    let matchup = calculateSetMatchupSpread(currentSet, enemyBuilds);

    //Now that we have our matchup spread defined, we need to compare it against the previous best.
    //This comparison will be slightly different based on the user's provided parameters.
    if (!bestSet) {
      bestSet = { moves: [...currentSet], matchup: matchup };
    } else {
      //For now I'm only implimenting one comparison method, as proof of concept.
      bestSet =
        bestSet.matchup.score > matchup.score
          ? bestSet
          : { moves: [...currentSet], matchup: matchup };
    }
  } else {
    currentSet = [...currentSet];
    //If it's not, while allMoves still has moves in it, we add one to the set, remove it from allMoves, and recurse.
    while (allMoves.length > 0) {
      //First check if the user is forcing any moves.
      let forcedMoves = false;
      Object.keys(params.moves).forEach(key => {
        if (params.moves[key] == 'force') {
          forcedMoves = true;
        }
      });
      if (forcedMoves) {
        let newSet = constructSetWithForcedMoves(
          allMoves,
          currentSet,
          params,
          build
        );
        if (newSet === true) {
          /*If the above method returns false rather than a new set of moves, that means all the conditions are met.
          To make things easier, we will set forcedMoves to false here, indicating that we do not need to recurse yet.
          This allows us to move to the normal recursive method of adding moves.
          */
          forcedMoves = false;
        } else if (newSet === false) {
          /* If the above method returns false, instead, rather than a new set of moves, that means the conditions were not met,
          and could not be met. In this case we can no longer build a valid set, so we return best set.
          */
          return bestSet;
        } else {
          //Remove any moves in the current set from allMoves
          allMoves = [...allMoves];
          newSet.forEach(move => {
            if (allMoves.some(m => m == move)) {
              allMoves.splice(allMoves.indexOf(move), 1);
            }
          });
          bestSet = constructAndTestSets(
            allMoves,
            newSet,
            enemyBuilds,
            params,
            build,
            bestSet
          );
        }
      }

      if (!forcedMoves) {
        allMoves = [...allMoves];
        currentSet.push(allMoves[allMoves.length - 1]);
        allMoves.pop();
        //Check to stop hanging on uneven moveList lengths.
        if (allMoves.length == 0 && currentSet.length != 4) {
          return bestSet;
        } else {
          bestSet = constructAndTestSets(
            allMoves,
            currentSet,
            enemyBuilds,
            params,
            build,
            bestSet
          );
          currentSet.pop();
        }
      }
    }
  }

  //At the end we return the best set we were able to find.
  return bestSet;
}
function constructEnemyBuild(
  pokemon,
  ability,
  hpEV,
  defEV,
  spdEV,
  speEV,
  atkEV,
  speBoostNature,
  atkDecreaseNature,
  defBoostNature,
  spdBoostNature,
  item,
  baseStats,
  gen
) {
  let build = {
    Nickname: '',
    Pokemon: pokemon,
    Gender: 'R',
    Item: item,
    Ability: ability,
    Level: 100,
    Shiny: false,
    EVs: {
      HP: hpEV,
      Atk: atkEV,
      Def: defEV,
      SpA: 0,
      SpD: spdEV,
      Spe: speEV
    },
    IVs: {
      HP: 31,
      Atk: 31,
      Def: 31,
      SpA: 31,
      SpD: 31,
      Spe: 31
    },
    Nature: 'Hardy',
    Moves: []
  };

  if (!build.Ability) {
    build.Ability = '';
  }

  build.Types = app.data.pokedex[normalizeString(pokemon)].types;

  build.Data = {};
  build.Data.stats = [];
  let statKeys = Object.keys(build.EVs);
  for (let i = 0; i < 6; i++) {
    build.Data.stats.push({
      base_stat: baseStats[normalizeString(statKeys[i])],
      stat: {
        name: convertStatShorthand(statKeys[i])
      }
    });
  }

  build = calculateStats(build, { gen: gen });

  if (defBoostNature) {
    build.Stats.Def = Math.trunc(build.Stats.Def * 1.1);
  }
  if (spdBoostNature) {
    build.Stats.SpD = Math.trunc(build.Stats.SpD * 1.1);
  }
  if (atkDecreaseNature) {
    build.Stats.Atk = Math.trunc(build.Stats.Atk * 0.9);
  }
  if (speBoostNature) {
    build.Stats.Spe = Math.trunc(build.Stats.Spe * 1.1);
  }
  return build;
}
//#endregion

//#region Calculators
function calculateSetMatchupSpread(currentSet, enemyBuilds) {
  let nonStatusMoves = removeStatusMoves(currentSet);
  //#region Debug
  let setName = '';
  nonStatusMoves.forEach(move => (setName += move.move.name + ' '));
  console.log('Testing set: ' + setName);
  if (
    currentSet.some(
      m =>
        m.move.name == 'earthpower' &&
        currentSet.some(m => m.move.name == 'earthquake')
    )
  ) {
    console.log();
  }
  //#endregion
  //Remove status moves.
  let matchup = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    8: [],
    16: [],
    null: [],
    score: 0
  };
  enemyBuilds.forEach(build => {
    //#region Debug
    if (
      setName == 'megakick dazzlinggleam energyball round ' &&
      build.pokemon == 'Persian-Alola'
    ) {
      console.log();
    }
    //#endregion
    //Find the most effective we can be against that build with this set.
    let bestMatchup = undefined;
    nonStatusMoves.forEach(move => {
      let moveEffectiveness =
        move.matchups[build.pokemon][build.ability][build.item];
      if (!bestMatchup) {
        bestMatchup = {
          move: move.move.name,
          maxHitsToKO: moveEffectiveness.matchup.hitsToKO.max
        };
      } else {
        //If this move can reliably KO that build in less hits than the previous best matchup, we save it instead.
        if (
          bestMatchup.maxHitsToKO == null &&
          moveEffectiveness.matchup.hitsToKO.max != null
        ) {
          bestMatchup = {
            move: move.move.name,
            maxHitsToKO: moveEffectiveness.matchup.hitsToKO.max
          };
        } else if (
          moveEffectiveness.matchup.hitsToKO.max == null &&
          bestMatchup.maxHitsToKO != null
        ) {
          //Leave bestMatchup as is.
        } else {
          bestMatchup =
            bestMatchup.maxHitsToKO < moveEffectiveness.matchup.hitsToKO.max
              ? bestMatchup
              : {
                  move: move.move.name,
                  maxHitsToKO: moveEffectiveness.matchup.hitsToKO.max
                };
        }
      }
    });
    let key = bestMatchup.maxHitsToKO;
    switch (true) {
      case key == null:
        //This means you cannot hit the pokemon at all.
        matchup.null.push({ build: build, move: bestMatchup.move });
        matchup.score -= 5 * build.usage;
        break;
      case key == 1:
        //This means you are guaranteed to OHKO the pokemon.
        matchup[1].push({ build: build, move: bestMatchup.move });
        matchup.score += 4 * build.usage;
        break;
      case key == 2:
        //This means you will deal at least half of the enemy's health in damage, making it unsafe for them to swap into you, especially if you are faster.
        matchup[2].push({ build: build, move: bestMatchup.move });
        matchup.score += 2 * build.usage;
        break;
      case key == 3:
        //This means you will do at least a third of the enemy's health in damage, which is good chip.
        matchup[3].push({ build: build, move: bestMatchup.move });
        matchup.score += 1 * build.usage;
        break;
      case key == 4:
        //25% is negligable chip damage for the most part.
        matchup[4].push({ build: build, move: bestMatchup.move });
        matchup.score -= 1 * build.usage;
        break;
      case key > 4 && key < 7:
        matchup[5].push({ build: build, move: bestMatchup.move });
        matchup.score -= 2 * build.usage;
        break;
      case key > 7 && key < 16:
        matchup[8].push({ build: build, move: bestMatchup.move });
        matchup.score -= 3 * build.usage;
        break;
      case key >= 16:
        //Dealing 1/16th damage or less means you are incapable of KOing the enemy if it has leftovers.
        matchup[16].push({ build: build, move: bestMatchup.move });
        matchup.score -= 4 * build.usage;
        break;
    }
  });
  return matchup;
}
function calculateMovesBaseEffectiveness(moves, format, params, build) {
  //Get keys so we can iterate
  let movesKeys = Object.keys(moves);

  //Iterate over all legal moves
  //@todo Abstract this for use in other funtionalities.
  movesKeys.forEach(moveKey => {
    let move = moves[moveKey].move;
    //- Add base-effectiveness trait
    let baseEffectiveness = 1;

    //#region Debug
    if (move.name == 'tripleaxel') {
      console.log();
    }
    //#endregion

    //Get move data
    move.name = normalizeString(move.name); //Format to match keys in app.data.moves
    //#region Debug
    console.log('Calculating move: ' + move.name);
    if (move.name == 'fireblast') {
      console.log();
    }
    //#endregion
    let moveData = app.data.moves[move.name]; //Get from app.data.moves cache.
    move.data = moveData; //Augment.

    //We don't care about status moves
    if (move.data.category != 'Status') {
      //- Calculate base-effectiveness based on build.Ability and STAB

      //Check weather and terrain. Here we're only modifying accuracy and type so the moves don't get filtered out later.
      //We will modify the base damage of weather ball here, but not before storing the unmodified base as a new property.
      //It is useful to assume our expected weather will be present most of the time, but some pokemon will be able to nullify or change our weather.
      switch (params.fieldEffects.weather) {
        case 'Extreme Sun':
          if (move.data.type == 'Water') {
            move.data.accuracy = false;
          }
        // eslint-disable-next-line no-fallthrough
        case 'Sun':
          if (move.name == 'thunder' || move.name == 'hurricane') {
            move.data.accuracy = 50;
          } else if (move.name == 'weatherball') {
            move.data.unmodifiedBasePower = move.data.basePower;
            move.data.basePower = 100;
            move.data.type = 'Fire';
          }
          break;
        case 'Heavy Rain':
          if (move.data.type == 'Fire') {
            move.data.accuracy = false;
          }
        // eslint-disable-next-line no-fallthrough
        case 'Rain':
          if (move.name == 'thunder' || move.name == 'hurricane') {
            move.data.accuracy = true;
          } else if (move.name == 'weatherball') {
            move.data.unmodifiedBasePower = move.data.basePower;
            move.data.basePower = 100;
            move.data.type = 'Water';
          }
          break;
        case 'Sand':
          if (move.name == 'weatherball') {
            move.data.unmodifiedBasePower = move.data.basePower;
            move.data.basePower = 100;
            move.data.type = 'Rock';
          }
          break;
        case 'Hail':
          if (move.name == 'weatherball') {
            move.data.unmodifiedBasePower = move.data.basePower;
            move.data.basePower = 100;
            move.data.type = 'Ice';
          } else if (move.name == 'blizzard' && format.gen >= 4) {
            move.data.accuracy = true;
          }
          break;
        case 'Fog':
          if (move.data.accuracy !== true) {
            move.data.accuracy = Math.trunc(move.data.accuracy * (3 / 5));
          }
          break;
        case 'Wind':
          //@todo Code wind, maybe? It behaves very strangely, and is incredibly niche.
          break;
        default:
          break;
      }

      //Check terrain. Modify the damage of earthquake, bulldoze, and magnitude, but store their original damage.
      switch (params.fieldEffects.terrain) {
        case 'Electric':
          switch (move.name) {
            case 'terrainpulse':
              move.data.unmodifiedBasePower = move.data.basePower;
              move.data.basePower *= 2;
              move.data.type = 'Electric';
              break;
            case 'naturepower':
              move.unmodifiedData = move.data;
              move.data = app.data.moves['thunderbolt'];
              break;
            case 'risingvoltage':
              move.data.unmodifiedBasePower = move.data.basePower;
              move.data.basePower *= 2;
              break;
          }
          break;
        case 'Grassy':
          switch (move.name) {
            case 'terrainpulse':
              move.data.unmodifiedBasePower = move.data.basePower;
              move.data.basePower *= 2;
              move.data.type = 'Grass';
              break;
            case 'earthquake':
            case 'bulldoze':
            case 'magnitude':
              move.data.unmodifiedBasePower = move.data.basePower;
              move.data.basePower = Math.trunc(move.data.basePower * 0.5);
              break;
            case 'naturepower':
              move.unmodifiedData = move.data;
              move.data = app.data.moves['energyball'];
              break;
            case 'grassyglide':
              move.data.priority += 1;
              break;
          }
          break;
        case 'Misty':
          switch (move.name) {
            case 'terrainpulse':
              move.data.unmodifiedBasePower = move.data.basePower;
              move.data.basePower *= 2;
              move.data.type = 'Fairy';
              break;
            case 'mistyexplosion':
              move.data.unmodifiedBasePower = move.data.basePower;
              move.data.basePower *= 1.5;
              break;
            case 'naturepower':
              move.unmodifiedData = move.data;
              move.data = app.data.moves['moonblast'];
              break;
          }
          break;
        case 'Psychic':
          switch (move.name) {
            case 'terrainpulse':
              move.data.unmodifiedBasePower = move.data.basePower;
              move.data.basePower *= 2;
              move.data.type = 'Psychic';
              break;
            case 'naturepower':
              move.unmodifiedData = move.data;
              move.data = app.data.moves['psychic'];
              break;
            case 'expandingforce':
              move.data.unmodifiedBasePower = move.data.basePower;
              move.data.basePower *= 1.5;
              break;
          }
          if (move.data.priority > 0) {
            move.data.accuracy = false;
          }
          break;
        default:
          break;
      }

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
          if (build.Types.some(type => type == move.data.type)) {
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

      //Calculate damage of multihit moves.
      if (move.data.multihit) {
        if (move.name == 'tripleaxel') {
          move.data.maxDamage = 120;
        } else if (move.name == 'triplekick') {
          move.data.maxDamage = 60;
        } else if (typeof move.data.multihit === 'number') {
          //These are moves which are guranteed to hit the maximum number of times (not factoring accuracy)
          move.data.maxDamage = move.data.basePower * move.data.multihit;
        } else {
          //These are moves that can hit (typically) between 2 and 5 times.
          if (build.Ability == 'Skill Link') {
            //Use maxmimum number of hits.
            move.data.maxDamage = move.data.basePower * move.data.multihit[1];
          } else {
            //Use the minimum number of hits
            move.data.maxDamage = move.data.basePower * move.data.multihit[0];
          }
        }
      }

      /*Calculate the move's average damage output and store it. This will be helpful later in finding the best moves to test.
    We are factoring in our pokemon's stats, abilities, items, STAB, etc, 
    but we are not factoring in anything about our opponents.
    We are also ignoring battle effects like terrain and weather.*/

      move.data.averageOutput = calculateAverageDamageOutput(build, move);
    }
  });

  return moves;
}
function calculateAverageDamageOutput(build, move) {
  //#region Debug
  if (move.name == 'foulplay') {
    console.log();
  }
  //#endregion
  let baseDamage = 0;
  //Check for multihit and set base damage accordingly.
  if (move.data.multihit) {
    baseDamage = move.data.maxDamage;
  } else {
    baseDamage = move.data.basePower;
  }

  //Check which stat the move should use.
  let statModifier = 0;
  if (move.name == 'bodypress') {
    statModifier = build.Stats.Def;
  } else if (move.data.category == 'Physical') {
    statModifier = build.Stats.Atk;
  } else {
    statModifier = build.Stats.SpA;
  }

  let averageDamageOutput = baseDamage + statModifier; //This is not the real formula for damage, just a simplified one to make our values smaller and easier to compare.

  //Check for crits
  if (move.data.willCrit || move.data.critRatio + build.CriticalChance > 4) {
    averageDamageOutput *= 1.5;
    if (build.Ability == 'Sniper') {
      averageDamageOutput *= 1.5;
    }
  }

  //Apply modifier from abilities and items, calculated before.
  averageDamageOutput *= move.data.baseEffectiveness;

  return averageDamageOutput;
}
function calculateStats(build, format) {
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

  //Augment Critical
  build.CriticalChance = 0;

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
    case 'Razor Claw':
    case 'Scope Lens':
      build.CriticalChance++;
      break;
    case 'Stick':
    case 'Leek':
      if (build.Pokemon == "Farfetch'd" || build.Pokemon == "Sirfetch'd") {
        build.CriticalChance += 2;
      }
      break;
    case 'Lucky Punch':
      if (build.Pokemon == 'Chansey') {
        build.CriticalChance += 2;
      }
      break;
  }

  if (build.Ability == 'Super Luck') {
    build.CriticalChance++;
  }

  //"In Gold, Silver, and Crystal, if a Pokémon's stat reaches 1024 or higher (such as due to a held Thick Club), it will be reduced to its value modulo 1024." - Bulbapedia
  if (format.gen == 2) {
    stats.forEach(stat => {
      if (build.Stats[stat] >= 1024) {
        build.Stats[stat] = build.Stats[stat] % 1024;
      }
    });
  }

  //Get pokemon weight
  build.WeightKG = app.data.pokedex[normalizeString(build.Pokemon)].weightkg;

  return build;
}
function calculateMoveDamage(
  move,
  attackerBuild,
  generation,
  enemyBuild,
  weather,
  terrain
) {
  //Define variables
  let effectiveness = move.move.data.baseEffectiveness;
  let minHitsToKO = 0;
  let maxHitsToKO = 0;
  let AtkStage = attackerBuild.StatStages.Atk;
  let SpAStage = attackerBuild.StatStages.SpA;

  //#region Debug
  console.log('Testing ' + move.move.name + ' against ' + enemyBuild.Pokemon);
  if (move.move.name == 'foulplay' && enemyBuild.Pokemon == 'Slowking') {
    console.log();
  }
  if (move.move.name == 'round' && enemyBuild.Pokemon == 'Ferrothorn') {
    console.log();
  }
  if (move.move.name == 'voltswitch' && enemyBuild.Pokemon == 'Persian-Alola') {
    console.log();
  }
  if (
    (move.move.name == 'fireblast' || move.move.name == 'focusblast') &&
    enemyBuild.Pokemon == 'Melmetal'
  ) {
    console.log();
  }
  //#endregion

  //@todo Code logic for power-variable moves like gyro ball and grass knot.
  //@todo Code logic for knock off.
  //@todo Code checks for tinted lens and unaware.

  //Check enemy ability
  switch (enemyBuild.Ability) {
    //#region Weather
    case 'Drought':
      if (
        weather != 'Wind' &&
        weather != 'Harsh Sun' &&
        weather != 'Heavy Rain'
      ) {
        weather = 'Sun';
      }
      break;
    case 'Drizzle':
      if (
        weather != 'Wind' &&
        weather != 'Harsh Sun' &&
        weather != 'Heavy Rain'
      ) {
        weather = 'Rain';
      }
      break;
    case 'Snow Warning':
      if (
        weather != 'Wind' &&
        weather != 'Harsh Sun' &&
        weather != 'Heavy Rain'
      ) {
        weather = 'Hail';
      }
      break;
    case 'Desolate Land':
      weather = 'Harsh Sun';
      break;
    case 'Primordial Sea':
      weather = 'Heavy Rain';
      break;
    case 'Sand Stream':
      if (
        weather != 'Wind' &&
        weather != 'Harsh Sun' &&
        weather != 'Heavy Rain'
      ) {
        weather = 'Sand';
      }
      break;
    case 'Delta Stream':
      weather = 'Wind';
      break;
    case 'Cloud Nine':
      if (
        weather != 'Wind' &&
        weather != 'Harsh Sun' &&
        weather != 'Heavy Rain'
      ) {
        weather = '';
      }
      break;
    //#endregion
    //#region Terrain
    case 'Psychic Surge':
      terrain = 'Psychic';
      break;
    case 'Grassy Surge':
      terrain = 'Grassy';
      break;
    case 'Misty Surge':
      terrain = 'Misty';
      break;
    case 'Electric Surge':
      terrain = 'Electric';
      break;
    //#endregion
    //#region Immunities & Resistances
    //These are abilities which can make a pokemon immune or resistant to a move or a feature of a move, all of which can be ignored by Mold Breaker or its variants.
    case 'Flash Fire':
      if (
        move.move.data.type == 'Fire' &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Battle Armor':
    case 'Shell Armor':
      if (
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        move.move.data.willCrit = false;
      }
      break;
    case 'Bulletproof':
      if (
        move.move.data.flags.bullet == true &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Damp':
      if (
        move.move.data.selfdestruct == 'always' &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Queenly Majesty':
    case 'Dazzling':
      if (
        move.move.data.priority > 0 &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Disguise':
      if (
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        if (move.move.data.multihit != undefined) {
          //If the move is multihit, we subtract one of its hits.
          try {
            move.move.data.multihit[0] -= 1;
            move.move.data.multihit[1] -= 1;
          } catch (e) {
            move.move.data.multihit -= 1;
          }
        } else {
          //If the move is not multi-hit, we add 1 to min and max hits to KO
          minHitsToKO++;
          maxHitsToKO++;
        }
      }
      break;
    case 'Dry Skin':
      if (
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        if (move.move.data.type == 'Fire') {
          effectiveness *= 1.25;
        } else if (move.move.data.type == 'Water') {
          return {
            DamageRange: { min: null, max: null },
            hitsToKO: { min: null, max: null }
          };
        }
      }
      break;
    case 'Flower Gift':
      if (
        weather == 'Sun' &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        enemyBuild.Stats.SpA *= 1.5;
      }
      break;
    case 'Fluffy':
      if (
        (move.move.data.type == 'Fire' || move.move.data.flags.contact) &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        if (move.move.data.type == 'Fire') {
          effectiveness *= 2;
        }
        if (move.move.data.flags.contact) {
          effectiveness *= 0.5;
        }
      }
      break;
    case 'Heatproof':
      if (
        move.move.data.type == 'Fire' &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        enemyBuild.Stats.SpA *= 1.5;
      }
      break;
    case 'Ice Face':
      if (
        move.move.data.category == 'Physical' &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        if (move.move.data.multihit) {
          try {
            move.move.data.multihit[0]--;
            move.move.data.multihit[1]--;
          } catch (e) {
            move.move.data.multihit--;
          }
        } else {
          minHitsToKO++;
          maxHitsToKO++;
        }
      }
      break;
    case 'Levitate':
      if (
        move.move.data.type == 'Ground' &&
        !monIgnoresAbilities(attackerBuild) &&
        move.move.data.ignoreAbility != true
      ) {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Lightning Rod':
    case 'Motor Drive':
    case 'Volt Absorb':
      if (
        move.move.data.type == 'Electric' &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Marvel Scale':
      if (
        move.move.data.category == 'Physical' &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        enemyBuild.Stats.Def *= 1.5;
      }
      break;
    case 'Multiscale':
      if (
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        //@todo How on earth am I going to do multiscale?
        //Consider making this method recursive?
      }
      break;
    case 'Punk Rock':
      if (
        move.move.data.flags.sound &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        effectiveness *= 0.5;
      }
      break;
    case 'Sap Sipper':
      if (
        move.move.data.type == 'Grass' &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Soundproof':
      if (
        move.move.data.flags.sound &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Storm Drain':
    case 'Water Absorb':
      if (
        move.move.data.type == 'Water' &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Thick Fat':
      if (
        (move.move.data.type == 'Fire' || move.move.data.type == 'Ice') &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        effectiveness *= 0.5;
      }
      break;
    case 'Water Bubble':
      if (
        move.move.data.type == 'Fire' &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        effectiveness *= 0.5;
      }
      break;
    //#endregion
    //#region Stat Changes
    case 'Fur Coat':
      if (
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        enemyBuild.Stats.Def *= 1.5;
      }
      break;
    case 'Heavy Metal':
      if (
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        enemyBuild.WeightKG *= 2;
      }
      break;
    case 'Light Metal':
      if (
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        enemyBuild.WeightKG *= 0.5;
      }
      break;
    case 'Ice Scales':
      if (
        move.move.data.category == 'Special' &&
        !monIgnoresAbilities(attackerBuild) &&
        !move.move.data.ignoreAbility
      ) {
        effectiveness *= 0.5;
      }
      break;
    case 'Intimidate':
      switch (attackerBuild.Ability) {
        case 'Hyper Cutter':
        case 'Clear Body':
        case 'White Smoke':
        case 'Full Metal Body':
        case 'Inner Focus':
        case 'Oblivious':
        case 'Scrappy':
        case 'Own Tempo':
          //These abilities nullify intimidate, so we do nothing here.
          break;
        case 'Simple':
          //Simple doubles stat stage changes, positively and negatively.
          AtkStage -= 2;
          break;
        case 'Defiant':
          AtkStage--;
          AtkStage += 2;
          break;
        case 'Competitive':
          AtkStage--;
          SpAStage += 2;
          break;
        default:
          AtkStage--;
      }
      break;
    //#endregion
  }

  //Calculate moves with variable base-power
  switch (move.move.name) {
    case 'lowkick':
      if (enemyBuild.WeightKG <= 9.9) move.move.data.basePower = 20;
      else if (enemyBuild.WeightKG <= 24.9) move.move.data.basePower = 40;
      else if (enemyBuild.WeightKG <= 49.9) move.move.data.basePower = 60;
      else if (enemyBuild.WeightKG <= 99.9) move.move.data.basePower = 80;
      else if (enemyBuild.WeightKG <= 199.9) move.move.data.basePower = 100;
      else move.move.data.basePower = 120;
      break;
    case 'knockoff':
      if (enemyBuild.Item && enemyBuild.Item != '') {
        move.move.data.originalPower = move.move.data.basePower;
        move.move.data.basePower = 97;
      }
      break;
  }

  //Check Weather and Terrain.
  switch (weather) {
    case 'Sun':
      //First change Weather Ball
      if (move.move.name == 'weatherball') {
        move.data.basePower = 100;
        move.data.type = 'Fire';
      }
      if (move.move.data.type == 'Fire') {
        effectiveness *= 1.5;
      } else if (move.move.data.type == 'Water') {
        effectiveness *= 0.5;
      }
      break;
    case 'Harsh Sun':
      //First change Weather Ball
      if (move.move.name == 'weatherball') {
        move.data.basePower = 100;
        move.data.type = 'Fire';
      }
      if (move.move.data.type == 'Fire') {
        effectiveness *= 1.5;
      } else if (move.move.data.type == 'Water') {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Rain':
      //First change Weather Ball
      if (move.move.name == 'weatherball') {
        move.data.basePower = 100;
        move.data.type = 'Water';
      }
      if (move.move.data.type == 'Water') {
        effectiveness *= 1.5;
      } else if (move.move.data.type == 'Fire') {
        effectiveness *= 0.5;
      }
      break;
    case 'Heavy Rain':
      //First change Weather Ball
      if (move.move.name == 'weatherball') {
        move.data.basePower = 100;
        move.data.type = 'Water';
      }
      if (move.move.data.type == 'Water') {
        effectiveness *= 1.5;
      } else if (move.move.data.type == 'Fire') {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Hail':
      //First change Weather Ball
      if (move.move.name == 'weatherball') {
        move.data.basePower = 100;
        move.data.type = 'Ice';
      }
      break;
    case 'Sand':
      //First change Weather Ball
      if (move.move.name == 'weatherball') {
        move.data.basePower = 100;
        move.data.type = 'Rock';
      }
      break;
    case 'Wind':
      //First change Weather Ball
      if (move.move.name == 'weatherball') {
        move.data.basePower = 50;
        move.data.type = 'Normal';
      }
      break;
    default:
      //First change Weather Ball
      if (move.move.name == 'weatherball') {
        move.data.basePower = 50;
        move.data.type = 'Normal';
      }
      break;
  }

  switch (terrain) {
    case 'Grassy':
      //Grassy terrain buffs grass moves against grounded pokemon.
      if (move.move.data.type == 'Electric' && !isGrounded(enemyBuild)) {
        if (generation < 8) {
          effectiveness *= 1.5;
        } else {
          effectiveness *= 1.3;
        }
      } else if (
        (move.move.name == 'Earthquake' ||
          move.move.name == 'Bulldoze' ||
          move.move.name == 'Magnitude') &&
        isGrounded(enemyBuild)
      ) {
        //Grassy terrain reduces the power of these ground-type moves against grounded opponents.
        move.move.data.basePower = Math.trunc(move.move.data.basePower * 0.5);
      }
      break;
    case 'Misty':
      //Misty terrain does not buff moves, but does reduce the power of dragon type moves by 50%.
      if (move.move.data.type == 'Dragon' && !isGrounded(enemyBuild)) {
        effectiveness *= 0.5;
      }
      break;
    case 'Psychic':
      //Psychic terrain buffs psychic moves against grounded pokemon.
      if (move.move.data.type == 'Psychic' && !isGrounded(enemyBuild)) {
        if (generation < 8) {
          effectiveness *= 1.5;
        } else {
          effectiveness *= 1.3;
        }
      }
      //Psychic terrain makes grounded opponents immune to priority moves.
      if (move.move.data.priority > 0 && isGrounded(enemyBuild)) {
        return {
          DamageRange: { min: null, max: null },
          hitsToKO: { min: null, max: null }
        };
      }
      break;
    case 'Electric':
      //Electric terrain buffs electric moves against grounded pokemon.
      if (move.move.data.type == 'Electric' && !isGrounded(enemyBuild)) {
        if (generation < 8) {
          effectiveness *= 1.5;
        } else {
          effectiveness *= 1.3;
        }
      }
      break;
    default:
      break;
  }

  //Calculate effectiveness vs enemy pokemon

  //Type Effectiveness
  let typeEffectiveness = checkMoveTypeEffectivenessVsEnemy(
    move.move.data.type,
    enemyBuild.Types,
    generation
  );
  //If the move is flying press or freeze dry, type effectiveness changes somewhat.
  if (move.move.name == 'flyingpress') {
    //Flying Press is the only dual-type move in the game. It uses both Fighting and Flying as its types.
    //Its first type is Fighting, so we have to additionally check its flying typing.
    typeEffectiveness *= checkMoveTypeEffectivenessVsEnemy(
      'Flying',
      enemyBuild.Types,
      generation
    );
  } else if (move.move.name == 'freezedry') {
    //Freeze Dry is 2x effective against water types.
    if (enemyBuild.Types.length > 1) {
      if (enemyBuild.Types.length.some(type => type == 'Water')) {
        typeEffectiveness *= 2;
      }
    } else {
      if (enemyBuild.Types[0] == 'Water') {
        typeEffectiveness *= 2;
      }
    }
  }

  //Check abilities and items that activate based on move effectiveness.
  if (typeEffectiveness >= 2) {
    if (attackerBuild.Item == 'Expert Belt') {
      //Expert Belt boosts the damage of super-effective moves by 20%.
      effectiveness *= 1.2;
    }
    if (attackerBuild.abilities == 'Neuroforce') {
      typeEffectiveness * 1.25;
    }
    if (monHasAbilities(enemyBuild, ['Filter', 'Solid Rock', 'Prism Armor'])) {
      effectiveness *= 0.75;
    }
  } else if (typeEffectiveness <= 0) {
    return {
      DamageRange: { min: null, max: null },
      hitsToKO: { min: null, max: null }
    };
  } else if (typeEffectiveness <= 2 && enemyBuild.Ability == 'Wonder Guard') {
    return {
      DamageRange: { min: null, max: null },
      hitsToKO: { min: null, max: null }
    };
  }

  //Apply stat stages. Critical hits ignore negative stat stages on the attacker and positive stat stages on the defender.

  //Find attacking stat and defending stat
  let attackStat = 0;
  let defenseStat = 0;
  if (move.move.data.category == 'Physical') {
    switch (move.move.name) {
      case 'bodypress':
        attackStat = attackerBuild.Stats.Def;
        break;
      case 'foulplay':
        attackStat = enemyBuild.Stats.Atk;
        switch (enemyBuild.Item) {
          case 'Choice Band':
            attackStat = ~~(attackStat * (2 / 3));
            break;
          case 'Light Ball':
          case 'Thick Club':
            attackStat = ~~(attackStat * 0.5);
            break;
        }
        if (attackerBuild.Item == 'Choice Band') {
          attackStat = ~~(attackStat * 1.5);
        }
        if (monHasAbilities(attackerBuild, ['Huge Power', 'Pure Power'])) {
          attackStat = ~~(attackStat * 1.5);
        }
        break;
      default:
        attackStat = attackerBuild.Stats.Atk;
        //Apply stat stage
        if (AtkStage > 0 || !move.move.data.willCrit) {
          attackStat = applyStatStages(attackStat, AtkStage);
        }
        break;
    }

    defenseStat = enemyBuild.Stats.Def;
  } else {
    attackStat = attackerBuild.Stats.SpA;
    //Apply stat stage
    if (SpAStage > 0 || !move.move.data.willCrit) {
      attackStat = applyStatStages(attackStat, SpAStage);
    }
    if (move.move.name == 'psyshock') {
      //Psyshock calculates against the opponent's defense rather than special defense
      defenseStat = enemyBuild.Stats.Def;
    } else {
      defenseStat = enemyBuild.Stats.SpD;
    }
  }

  //Truncate stats
  attackStat = Math.trunc(attackStat);
  defenseStat = Math.trunc(defenseStat);

  //Create an array of hits-per-attack for maximum damage rolls (*1)
  let hitsPerAttackMaxDamage = [];
  if (move.move.data.multihit) {
    let hits = 0;
    let powerDoublesEachHit = false;
    if (move.move.data.multiaccuracy) {
      hits = move.move.data.multihit;
      switch (move.move.name) {
        case 'triplekick':
        case 'tripleaxel':
          powerDoublesEachHit = true;
          break;
      }
    } else {
      //Check for Skill Link
      if (attackerBuild.Ability == 'Skill Link') {
        hits = move.move.data.multihit[1];
      } else {
        hits =
          move.move.data.multihit.reduce((a, b) => a + b) /
          move.move.data.multihit.length;
      }
    }
    let baseDamage = move.move.data.basePower;
    for (let n = 0; n < hits; n++) {
      hitsPerAttackMaxDamage.push(
        Math.trunc(
          calculateDamagePerHitOfMoveAgainstEnemy(
            attackerBuild,
            baseDamage,
            attackStat,
            defenseStat,
            effectiveness,
            typeEffectiveness
          )
        )
      );
      if (powerDoublesEachHit) {
        baseDamage += move.move.data.basePower;
      }
    }
  } else {
    hitsPerAttackMaxDamage.push(
      Math.trunc(
        calculateDamagePerHitOfMoveAgainstEnemy(
          attackerBuild,
          move.move.data.basePower,
          attackStat,
          defenseStat,
          effectiveness,
          typeEffectiveness
        )
      )
    );
  }

  //Create identical array for min damage rolls (*0.85)
  let hitsPerAttackMinDamage = [];
  hitsPerAttackMaxDamage.forEach(hit =>
    hitsPerAttackMinDamage.push(Math.trunc(hit * 0.85))
  );

  //Define additional return variables
  // let minFirstHitDamagePercent = 0;
  // let maxFirstHitDamagePercent = 0;
  // let avgFirstHitDamagePercent = 0;
  // let minAvgHitDamagePercent = 0;
  // let maxAvgHitDamagePercent = 0;
  // let avgHitDamagePercent = 0;

  //Calculate min hits to KO
  minHitsToKO = calculateHitsToKO(
    hitsPerAttackMaxDamage,
    enemyBuild,
    attackerBuild,
    move,
    attackStat,
    defenseStat,
    effectiveness,
    typeEffectiveness
  );

  //Check max hits to KO
  maxHitsToKO = calculateHitsToKO(
    hitsPerAttackMinDamage,
    enemyBuild,
    attackerBuild,
    move,
    attackStat,
    defenseStat,
    effectiveness,
    typeEffectiveness
  );

  //Before returning, check for sturdy or focus sash.
  if (
    maxHitsToKO == 1 &&
    !move.move.data.multihit &&
    ((enemyBuild.Ability == 'Sturdy' && !monIgnoresAbilities(attackerBuild)) ||
      enemyBuild.Item == 'Focus Sash')
  ) {
    maxHitsToKO++;
  }
  if (
    minHitsToKO == 1 &&
    !move.move.data.multihit &&
    ((enemyBuild.Ability == 'Sturdy' && !monIgnoresAbilities(attackerBuild)) ||
      enemyBuild.Item == 'Focus Sash')
  ) {
    minHitsToKO++;
  }

  return {
    DamageRange: {
      min: maxHitsToKO.lowestDamageTurn,
      max: minHitsToKO.highestDamageTurn
    },
    hitsToKO: { min: minHitsToKO.attacksToKO, max: maxHitsToKO.attacksToKO }
  };
}
function calculateDamagePerHitOfMoveAgainstEnemy(
  attackerBuild,
  basePower,
  attackStat,
  defenseStat,
  effectiveness,
  typeEffectiveness
) {
  let damage = 2 * attackerBuild.Level;
  damage = Math.trunc(damage / 5);
  damage += 2;
  damage = Math.trunc(damage * basePower);
  damage = Math.trunc(damage * attackStat);
  damage = Math.trunc(damage / defenseStat);
  damage = Math.trunc(damage / 50);
  damage += 2;
  damage = Math.trunc(damage * effectiveness);
  damage = Math.trunc(damage * typeEffectiveness);
  return damage;
}
function calculateHitsToKO(
  hitsPerAttack,
  enemyBuild,
  attackerBuild,
  move,
  attackStat,
  defenseStat,
  effectiveness,
  typeEffectiveness
) {
  let attacksToKO = 0;
  let highestDamageTurn = 0;
  let lowestDamageTurn = null;
  //Define health regen in the case of leftovers
  let healthRegen = Math.trunc(enemyBuild.Stats.HP * (1 / 16));
  if (hitsPerAttack.some(hit => hit > 0)) {
    let defenderHP = enemyBuild.Stats.HP;
    while (defenderHP > 0) {
      let damageDealtThisAttack = 0;
      //Re-calculate knock-off
      if (move.move.name == 'knockoff') {
        hitsPerAttack = [];
        if (enemyBuild.Item && enemyBuild.Item != '') {
          move.move.data.basePower = 97;
        } else {
          move.move.data.basePower = 65;
          //Remove the enemy's item unless it has Sticky Hold or Suction Cups
          if (!monHasAbilities(enemyBuild, ['Sticky Hold', 'Suction Cups'])) {
            enemyBuild.Item = '';
          }
        }
        hitsPerAttack.push(
          Math.trunc(
            calculateDamagePerHitOfMoveAgainstEnemy(
              attackerBuild,
              move.move.data.basePower,
              attackStat,
              defenseStat,
              effectiveness,
              typeEffectiveness
            )
          )
        );
      }
      //Execute the attack
      hitsPerAttack.forEach(hit => {
        let damageDealtThisHit = applyDamage(
          hit,
          attackerBuild,
          enemyBuild,
          defenderHP
        );
        defenderHP -= damageDealtThisHit;
        damageDealtThisAttack += damageDealtThisHit;
      });
      highestDamageTurn =
        highestDamageTurn < damageDealtThisAttack
          ? damageDealtThisAttack
          : highestDamageTurn;
      lowestDamageTurn =
        lowestDamageTurn == null ? damageDealtThisAttack : lowestDamageTurn;
      lowestDamageTurn =
        lowestDamageTurn > damageDealtThisAttack
          ? damageDealtThisAttack
          : lowestDamageTurn;
      attacksToKO++;

      //Check for and apply Leftovers
      if (enemyBuild.Item == 'Leftovers' && defenderHP > 0) {
        if (healthRegen >= damageDealtThisAttack) {
          return {
            attacksToKO: null,
            highestDamageTurn: highestDamageTurn,
            lowestDamageTurn: lowestDamageTurn
          };
        }
        defenderHP += healthRegen;
      }
    }
  } else {
    attacksToKO = null;
  }
  return {
    attacksToKO: attacksToKO,
    highestDamageTurn: highestDamageTurn,
    lowestDamageTurn: lowestDamageTurn
  };
}
function applyDamage(damagePerHit, attackerBuild, enemyBuild, defenderHP) {
  if (
    defenderHP == enemyBuild.Stats.HP &&
    monHasAbilities(enemyBuild, ['Multiscale', 'Shadow Shield']) &&
    !monIgnoresAbilities(attackerBuild)
  ) {
    return damagePerHit * 0.5;
  } else {
    return damagePerHit;
  }
}
function calculateMoveListDamageVsEnemyBuilds(
  enemies,
  format,
  params,
  allMoves,
  build
) {
  let enemyBuilds = [];
  let enemyNames = Object.keys(enemies);
  enemyNames.forEach(e => {
    let enemy = enemies[e];
    //#region Debug
    console.log('Building sets for: ' + e);
    if (e == 'Persian-Alola') {
      console.log();
    }
    //#endregion
    let baseStats = app.data.pokedex[normalizeString(e)].baseStats;
    let likelyAbilities = [];
    /* Get all defensively-relevant abilities and up to one non-defensively-relevant ability,
    With a usage rate - when combined with the mon's raw usage rate - greater than the larger number between
    the user specified min or 0.01. We have to include 0.01 to avoid accidentally getting every ability,
    and later getting every item, which would likely make this program run until the heat death of the universe.
    */
    let abilities = Object.keys(enemy.abilities);
    if (abilities.length > 1) {
      abilities.forEach(ability => {
        if (
          enemy.abilities[ability] * enemy.usage.raw >
            Math.max(params.enemies.minUsage, 0.01) &&
          (isDefensivelyRelevantAbility(ability) ||
            !likelyAbilities.some(a => !isDefensivelyRelevantAbility(a)))
        ) {
          likelyAbilities.push(ability);
        }
      });
    } else {
      likelyAbilities.push(abilities[0]);
    }

    if (likelyAbilities.length == 0) {
      let mostCommonAbility = { name: '', rate: 0 };
      abilities.forEach(ability => {
        if (enemy.abilities[ability] > mostCommonAbility.rate) {
          mostCommonAbility.name = ability;
          mostCommonAbility.rate = enemy.abilities[ability];
        }
      });
      likelyAbilities.push(mostCommonAbility.name);
    }

    //Find highest likely hp/def/spd/spe values and lowest likely atk value
    let maxHP = 0;
    let maxDef = 0;
    let maxSpD = 0;
    let maxSpe = 0;
    let minAtk = 252;
    let defBoostNature = false;
    let spdBoostNature = false;
    let speBoostNature = false;
    let atkDecreaseNature = false;
    //#region Debug
    if (e == 'Slowking') {
      console.log();
    }
    //#endregion
    let statSpreads = Object.keys(enemy.spreads);
    //Find the most common stat spread so we can ensure we test at least one.
    let mostCommonSpread = null;
    statSpreads.forEach(spread => {
      if (
        mostCommonSpread == null ||
        enemy.spreads[spread] > mostCommonSpread.frequency
      ) {
        mostCommonSpread = { spread: spread, frequency: enemy.spreads[spread] };
      }
    });
    statSpreads.forEach(spread => {
      if (
        enemy.spreads[spread] * enemy.usage.raw >
          Math.max(params.enemies.minUsage, 0.01) ||
        spread == mostCommonSpread.spread
      ) {
        let natureMatch = /([a-zA-Z]*)/g;
        let statMatch = /([0-9]{1,3})/g;
        let nature = spread.match(natureMatch)[0];
        let stats = [...spread.matchAll(statMatch)];
        let hp = parseInt(stats[0][0]);
        let atk = parseInt(stats[1][0]);
        let def = parseInt(stats[2][0]);
        let spd = parseInt(stats[4][0]);
        let spe = parseInt(stats[5][5]);
        switch (nature) {
          //Natures that buff SpD
          case 'Calm':
            atkDecreaseNature = true;
          // eslint-disable-next-line no-fallthrough
          case 'Gentle':
          case 'Sassy':
          case 'Careful':
            spdBoostNature = true;
            break;
          //Natures that buff Def
          case 'Bold':
            atkDecreaseNature = true;
          // eslint-disable-next-line no-fallthrough
          case 'Lax':
          case 'Relaxed':
          case 'Impish':
            defBoostNature = true;
            break;
          //Natures that buff Spe
          case 'Timid':
            atkDecreaseNature = true;
          // eslint-disable-next-line no-fallthrough
          case 'Hasty':
          case 'Jolly':
          case 'Naive':
            speBoostNature = true;
            break;
          //Natures that debuff Atk
          case 'Modest':
            atkDecreaseNature = true;
        }
        maxHP = hp > maxHP ? hp : maxHP;
        maxDef = def > maxDef ? def : maxDef;
        maxSpD = spd > maxSpD ? spd : maxSpD;
        maxSpe = spe > maxSpe ? spe : maxSpe;
        minAtk = atk < minAtk ? atk : minAtk;
      }
    });

    let items = Object.keys(enemy.items);
    let likelyItems = [];
    items.forEach(item => {
      if (
        enemy.items[item] * enemy.usage.raw >
          Math.max(params.enemies.minUsage, 0.01) &&
        (isDefensivelyRelevantItem(item) ||
          !likelyItems.some(i => !isDefensivelyRelevantItem(i)))
      ) {
        likelyItems.push(item);
      }
    });

    if (likelyItems.length <= 0) {
      likelyItems.push(items[0]);
    }

    //Construct a set for each ability and item combination.
    let likelySets = [];
    if (likelyItems.length == 0) likelyItems.push('');
    likelyAbilities.forEach(ability => {
      likelyItems.forEach(item => {
        //Find the minimum usage rate of that pokemon/item combination or pokemon/ability combination.
        let pokemonUsage = enemy.usage.raw;
        let abilityUsage = enemy.abilities[ability];
        let itemUsage = enemy.items[item];
        let effectiveUsage = pokemonUsage * Math.min(abilityUsage, itemUsage);
        if (effectiveUsage > params.enemies.minUsage) {
          likelySets.push(
            constructEnemyBuild(
              e,
              ability,
              maxHP,
              maxDef,
              maxSpD,
              maxSpe,
              minAtk,
              speBoostNature,
              atkDecreaseNature,
              defBoostNature,
              spdBoostNature,
              item,
              baseStats,
              format.gen
            )
          );
          enemyBuilds.push({
            pokemon: e,
            ability: ability,
            item: item,
            usage: effectiveUsage
          });
        }
      });
    });

    //Now for each set, test each move.

    likelySets.forEach(set => {
      allMoves.forEach(move => {
        //#region Debug
        console.log('Testing ' + move.move.name + ' against ' + set.Pokemon);
        if (move.move.name == 'payback' && set.Pokemon == 'Persian-Alola') {
          console.log();
        }
        //#endregion
        if (!move.matchups) {
          move.matchups = {};
        }
        let matchupData = calculateMoveDamage(
          move,
          build,
          format.gen,
          set,
          params.fieldEffects.weather,
          params.fieldEffects.terrain
        );
        let frequency = Math.min(
          enemy.abilities[set.Ability],
          set.Item == '' ? 1 : enemy.items[set.Item]
        );
        if (!move.matchups[e]) {
          move.matchups[e] = {};
        }
        if (!move.matchups[e][set.Ability]) {
          move.matchups[e][set.Ability] = {};
        }
        move.matchups[e][set.Ability][set.Item] = {
          frequency: frequency,
          matchup: matchupData
        };
      });
    });
  });
  return enemyBuilds;
}
//#endregion

//#region Parsers
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
//#endregion

//#region Small Tools
function applyStatStages(stat, stage, generation) {
  if (stage > 6) {
    stage = 6;
  } else if (stage < -6) {
    stage = -6;
  }
  if (stage > 0) {
    if (generation > 2) {
      stat = Math.trunc(stat * ((100 + 50 * stage) / 100));
    } else {
      stat = Math.trunc(stat * ((2 + 1 * stage) / 2));
    }
  } else if (stage < 0) {
    if (generation > 2) {
      switch (stage) {
        case -1:
          stat = Math.trunc(stat * (66 / 100));
          break;
        case -2:
          stat = Math.trunc(stat * (50 / 100));
          break;
        case -3:
          stat = Math.trunc(stat * (40 / 100));
          break;
        case -4:
          stat = Math.trunc(stat * (33 / 100));
          break;
        case -5:
          stat = Math.trunc(stat * (28 / 100));
          break;
        case -6:
          stat = Math.trunc(stat * (25 / 100));
          break;
      }
    } else {
      stat = Math.trunc(stat * (2 / (2 + Math.abs(stage))));
    }
  } else {
    return stat;
  }
  return stat;
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
function cleanUpMatchupOutput(matchup) {
  matchup.matchup.total = 0;
  Object.keys(matchup.matchup).forEach(n => {
    if (n != 'score' && n != 'total') {
      matchup.matchup[n] = {
        count: matchup.matchup[n].length,
        pokemon: matchup.matchup[n]
      };
      matchup.matchup[n].pokemon.sort((a, b) => a.build.usage > b.build.usage);
      matchup.matchup.total += matchup.matchup[n].count;
    }
  });
  let moves = [...matchup.moves];
  matchup.moves = [];
  moves.forEach(move => matchup.moves.push(move.move.name));
  matchup = { moves: matchup.moves, matchups: matchup.matchup };
  return matchup;
}
function removeStatusMoves(moves) {
  moves = moves.filter(m => m.move.data.category != 'Status');
  return moves;
}

//#endregion

//#region Currently Unused
// function getGenerationFromName(gameName) {
//   if (gameName == 'red-blue' || gameName == 'yellow') {
//     return 1;
//   } else if (gameName == 'gold-silver' || gameName == 'crystal') {
//     return 2;
//   } else if (
//     gameName == 'ruby-sapphire' ||
//     gameName == 'emerald' ||
//     gameName == 'firered-leafgreen'
//   ) {
//     return 3;
//   } else if (
//     gameName == 'diamond-pearl' ||
//     gameName == 'platinum' ||
//     gameName == 'heartgold-soulsilver'
//   ) {
//     return 4;
//   } else if (gameName == 'black-white' || gameName == 'black-2-white-2') {
//     return 5;
//   } else if (gameName == 'x-y' || gameName == 'omega-ruby-alpha-sapphire') {
//     return 6;
//   } else if (gameName == 'sun-moon' || gameName == 'ultra-sun-ultra-moon') {
//     return 7;
//   } else {
//     return 8;
//   }
// }

// export function getFilteredMoveList(pokemonData, level, generation) {
//   return pokemonData.moves.filter(moveEntry =>
//     moveEntry.version_group_details.some(
//       vgd =>
//         vgd.level_learned_at <= level &&
//         getGenerationFromName(vgd.version_group.name) == generation
//     )
//   );
//

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
//#endregion
