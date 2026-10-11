# TODO

## A better predictor for information time (later)

`scratch/bits.py` predicts the next character by counting what followed the exact previous K
characters. Long contexts are almost never seen before, so they predict nothing (K=100 gives
8 bits everywhere), and similar strings (`cat`, `caat`) share no evidence.

Candidate: a neural predictor trained online on the stream itself, like Fabrice Bellard's
NNCP compressor (an LSTM in 2019; a Transformer, with attention, since "NNCP v2: Lossless Data
Compression with Transformer", 2021). It starts knowing nothing and learns while it compresses,
and it is deterministic because decompression must reproduce its probabilities exactly. It is
a compressor, though: the per-symbol probabilities would have to be pulled out of it, and it
is slow without a GPU.

Alternative: roll our own tiny predictor. Not an LLM in the big sense: a small character-level
Transformer, a few hundred thousand to a few million parameters, trained only on our stream,
small enough for a laptop CPU. Andrej Karpathy's nanoGPT and his video "Let's build GPT: from
scratch, in code, spelled out" (2023) are a known path. Why rather than adapting NNCP:

- it does exactly our job: predict, measure surprise, learn, one symbol at a time
- we choose what it learns from (only our stream) and how much it forgets (the memory dial)
- we can make it deterministic (fixed seed, deterministic operations)
- building it is how we'd understand it

First step: one tiny character-level model run on the same files as `scratch/bits.py`, the two
printed side by side. Go further only if that is interesting.

Conditions for trusting a neural predictor without reading it:

- trained only on our own stream, never pretrained, so no outside expectations come in
- deterministic: same input, same predictions
- checked now and then against the naive counter; where they disagree sharply, the counter
  says why
