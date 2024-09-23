# Generate used locstrings file with...
#egrep -e "(\"|')(\w|\s|\d|\.)*(\"|')" -r -h -I -o ./template.json > temp_locstrings.txt
#egrep -e "(\"|')(\w|\s|\d|\.)*(\"|')" -r -h -I -o ./module/ >> temp_locstrings.txt
#egrep -e "(\"|')(\w|\s|\d|\.)*(\"|')" -r -h -I -o ./templates/ >> temp_locstrings.txt
#sort -u temp_locstrings.txt > locstrings.txt
#rm temp_locstrings.txt
#...massage in vim

import sys
import json

db = None
used = []

with open("locstrings.txt", "r") as locstrings:
    for locstring in locstrings.readlines():
        used.append(locstring.strip())

used = set(used)

with open("lang/en.json", "r") as langdb:
    db = json.load(langdb)

for key in db.keys():
    if not key in used:
        print(key)

