# User study materials

This folder contains **static study interfaces** (HTML landing pages) and **notebooks / scripts** used to process study exports.

## Layout

- **`user_study_interfaces/`** — Standalone HTML pages and assets for the user study (landing pages, timers, demo image). These are not part of the main React app; serve them with any static file server.
- **`process_user_study_results/`** — Python environment (`requirements.txt`), Jupyter notebooks, and supporting code for analyzing CSV exports from the study. Paths in the notebooks assume the **repository root** as the working directory (or the notebook’s subdirectory, with fallbacks).

## Main visualization app (separate from this folder)

From the repo root, the interactive LLM consistency visualization is a Create React App:

```bash
npm install   # first time
npm start
```

Then open [http://localhost:3000](http://localhost:3000). See the root [README.md](../README.md) for details.

## Serving the study interfaces

From the repo root, for example:

```bash
cd user_study/user_study_interfaces
python3 -m http.server 8080
```

Open the URLs printed in the terminal (e.g. `http://localhost:8080/user_study_landing_page.html` and the study-specific landing pages). Adjust the port if 8080 is in use.

## Processing results

1. Create a virtual environment (recommended) and install dependencies:

   ```bash
   cd user_study/process_user_study_results
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Place exported CSVs where each notebook expects them (see comments at the top of each notebook under `single_distribution/`, `diversity/`, `compare_distributions/`, or `combined_post_survey/`).

3. Launch Jupyter from the **repo root** or the relevant subfolder, then run the notebooks in order as needed.

Notebooks reference paths under `user_study/process_user_study_results/...` when run from the repository root.
