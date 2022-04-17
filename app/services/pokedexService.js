import * as pokeApiService from './pokeApiService.js';

export async function getFilteredMoveList(pokemon, level, generation) {
  return (await getMoveList(pokemon)).filter(moveEntry =>
    moveEntry.version_group_details.some(
      vgd =>
        vgd.level_learned_at <= level &&
        getGenerationFromName(vgd.version_group.name) == generation
    )
  );
}

async function getMoveList(pokemon) {
  let movelist = await pokeApiService.findPokemonByName(pokemon);
  return movelist.moves;
}

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
