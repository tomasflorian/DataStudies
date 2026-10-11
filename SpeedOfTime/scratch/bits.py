import math, os, sys
from collections import defaultdict
K = 3                                   # predict each char from the previous 3
counts = defaultdict(lambda: defaultdict(int))
history = ""
raw = sys.argv[1]
for name in sorted(os.listdir(raw)):
    for line in open(os.path.join(raw, name)).read().splitlines():
        bits = 0.0
        for ch in line + "\n":
            ctx = history[-K:]
            seen = counts[ctx]
            p = (seen[ch] + 1) / (sum(seen.values()) + 256)
            bits += -math.log2(p)
            seen[ch] += 1
            history += ch
        perchar = bits / (len(line) + 1)
        print(f"{name:9} {perchar:4.1f} {'#' * round(perchar)}  {line[:60]}")
