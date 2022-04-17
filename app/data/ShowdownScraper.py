import requests
from bs4 import BeautifulSoup
import numpy as np
import re
import os
from pathlib import Path

URL = "https://play.pokemonshowdown.com/data/pokemon-showdown/data/mods/"
page = requests.get(URL)

soup = BeautifulSoup(page.content, "html.parser")

results = soup.find_all("a")

for result in results:
    subDirectory = re.search(".*\/", result.text)
    if subDirectory is not None:
        soup = BeautifulSoup(requests.get(URL + subDirectory.group()).content, "html.parser")
        fileNames = soup.find_all("a")
        for fileName in fileNames:
            fileName = re.search(r".*\.ts", fileName.text)
            if fileName is not None:
                fileName = fileName.group()
                if fileName == "formats-data.ts":
                    subURL = URL + subDirectory.string + fileName
                    genName = re.search("[a-zA-Z0-9]*", subDirectory.string).group()
                    Path("./" + genName).mkdir(exist_ok=True)
                    dl = requests.get(subURL).text
                    print("Writing: " + genName + " / " + "formats-data.json")
                    contents = re.sub(r".* = ", '', dl)
                    contents = re.sub(r"([a-z].*(?=:))", "\"" + r"\1" + "\"", contents)
                    contents = re.sub(r",(?=\n\s*\})", '', contents)
                    contents = re.sub(r"//.*", '', contents)
                    contents = re.sub(r";", '', contents)
                    print(contents)
                    with open("./" + genName + "/formats-data.json", "wb") as f:
                        f.write(str.encode(contents))

print("Finished")
        
