# MonoFlow paper replay

This is a static visualization of trace data emitted by the real
`src/monoflow2.ts` execution path. It does not reproduce the learning algorithm.

Generate a trace:

```bash
npx tsx src/monoflow2.ts thecatwasoldandhappy \
  --cycles=6 \
  --trace-json=visualizer/sample-trace.json
```

Install and run the standalone visualizer:

```bash
cd visualizer
npm install
npm run dev
```

Then open the example or use **Open trace JSON** to load another run.

The normal MonoFlow CLI output is unchanged when `--trace-json` is omitted.
