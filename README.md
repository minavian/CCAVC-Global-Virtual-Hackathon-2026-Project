# CCAVC Global Virtual Hackathon 2026 Project

The site starts with a blank HTML page. There is no build step or package install.

## Run locally

Serve the repository root with Python 3:

- Windows: `py -3 -m http.server 8000 --bind 127.0.0.1`
- macOS or Linux: `python3 -m http.server 8000 --bind 127.0.0.1`

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/). Serve `index.html`, `src/`, and `vendor/` together on a static host so the file paths stay valid. Use HTTP when loading the modules or GLB files.

## Reusable resources

| Location | Contents |
| --- | --- |
| `src/assets/models/` | Contactless card, subway card, key fob, phone, and rigged hand GLBs with their embedded resources |
| `src/assets/images/` and `src/assets/textures/` | Card and reader illustrations, SVG icons, and paper grain |
| `src/assets/fonts/` | Inter Tight and Antonio WOFF2 files, font declarations, and licenses |
| `src/reusable/three/` | Model loading and posing, procedural models and textures, card and scan renderers, and depth and trail shader |
| `src/reusable/animations/` | Easing curves and the standalone RFID signal animation |
| `src/reusable/rfid/` | RFID simulation and field line tracing |
| `src/reusable/utilities/` | FFT, SI unit formatting, and canvas path drawing |
| `vendor/three/` | Bundled Three.js, GLTFLoader, geometry and lighting helpers, and the Three.js license |

To use the Three.js modules from a page at the repository root, add these browser import map entries before importing the modules:

```json
{
  "imports": {
    "three": "./vendor/three/build/three.module.min.js",
    "three/addons/": "./vendor/three/examples/jsm/"
  }
}
```

The renderers need WebGL 2. Add `src/assets/fonts/fonts.css` if you want the bundled typefaces in the generated model textures. See [EXPLAINED.md](EXPLAINED.md) for the module map and [the RFID reference](docs/rfid-reference.md) for the sources behind the simulation.

## Run the retained tests

Use Node.js 22 or later:

```sh
node --test tests/rfid.test.js tests/river.test.mjs
```
