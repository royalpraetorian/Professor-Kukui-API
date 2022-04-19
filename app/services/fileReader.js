/* eslint-disable no-useless-escape */
import * as fs from 'fs';
import { default as app } from '../index.js';

export function loadDataFolder() {
  let filePath = './app/data';
  let subFolders = getDirectories(filePath);
  console.log(subFolders);
}

function getDirectories(filePath) {
  return fs.readdir(filePath, function (err, files) {
    if (err) {
      return console.log('Unable to scan directory: ' + err);
    }
    files.forEach(function (file) {
      /* If the file ends in .json we want to load it to memory. 
      If it is a directory (no .ext) we want to recurse.
       */
      if (file.includes('.json')) {
        let finalPath = filePath + '/' + file;
        //Grab the file-name and immediate directory
        let fileNameMatch = /(?<=\/)[^\/]*(?=.json)/;
        let dirMatch = /(?<=\/)[^\/]*(?=\/formats-data\.json)/;

        let directory = finalPath.match(dirMatch);
        let fileName = finalPath.match(fileNameMatch)[0];

        //Check to see if directory matched. If it didn't, it's non-format-specific data and just goes into app.data
        //Otherwise it goes into app.data.(format).format-data

        if (directory) {
          //   try {
          //     let data = {
          //       format: directory[0],
          //       formatData: JSON.parse(fs.readFileSync(finalPath))
          //     };
          //     app.data.formats.push(data);
          //     console.log(finalPath);
          //   } catch (e) {
          //     console.log(e);
          //   }
        } else {
          let data = JSON.parse(fs.readFileSync(finalPath));
          app.data[fileName] = data;
          console.log(finalPath);
        }
      } else if (!file.includes('.')) {
        getDirectories(filePath + '/' + file);
      }
    });
  });
}
