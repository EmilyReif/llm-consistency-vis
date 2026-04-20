# LLM consistency visualzation

When an LLM returns a response, we’re actually sampling from a probability distribution over many possible outputs. But we usually only see one of those samples—the response that gets returned.

If we’re just using the model to get an answer or write some text, that’s fine. But if we want to understand how the model behaves—or build systems that depend on it—we need more than just one response. **We need to understand the whole distribution of possible outputs.**

However, it's hard to grasp the shape of a distribution by reading dozens or hundreds of individual outputs. So how can we explore this space more effectively? Can graph lattice visualizations help show patterns beyond a single generation?

## Development

This vis is built using [react](https://react.dev/) and typescript, rather than just being static js/css/html. To build and run it, follow the steps below:

### Install node/npm
Download node/npm [here](https://nodejs.org/en/download/) if you don't already have it.

Open a terminal, and check that it worked with `npm -v`. It should say a version number (not `command not found`).

### Run the app in development mode
`cd` into the the base llm-consistency-vis directory and run `npm start`. 

Open [http://localhost:3000](http://localhost:3000). When you edit the code, it should update.

### API keys
There are a set of cached examples pre-loaded in the UI, but you will need to BYO API key to generate new outputs on-the-fly. 