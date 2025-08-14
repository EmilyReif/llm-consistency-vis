# LLM expectations vs outputs

## Development

This vis is built using [react](https://react.dev/) and typescript, rather than just being static js/css/html. To build and run it, follow the steps below:

### Install node/npm
Download node/npm [here](https://nodejs.org/en/download/) if you don't already have it.

Open a terminal, and check that it worked with `npm -v`. It should say a version number (not `command not found`).

### Run the app in development mode
`cd` into the llm-outputs-vs-expectations github and run `npm start`. 

Open [http://localhost:3000](http://localhost:3000). When you edit the code, it should update.

### Deploy to gitlab pages
When it's time to push your changes and deploy, run:

```
npm run build
git add *
git commit -m "commit message"
git pull
git push
```

Gitlab will automatically deploy whatever is in the `build/` directory to our [gitlab page](https://llm-outputs-vs-expectations-19d30f.pages.cs.washington.edu/). 

To build the app so it gets deployed properly on gitlab pages, run `npm run build`, and then your updates should show up on the [gitlab page](https://llm-outputs-vs-expectations-19d30f.pages.cs.washington.edu/) a few minutes after you `git push`.
