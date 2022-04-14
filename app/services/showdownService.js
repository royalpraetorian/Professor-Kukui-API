const apiUrl = 'https://pkmn.github.io/smogon/data/';
import axios from 'axios';

export async function getMetagame(format) {
  return (await axios.get(apiUrl + '/stats/' + format + '.json')).data;
}
