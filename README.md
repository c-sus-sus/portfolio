# Orbital Portfolio

A cinematic sci-fi portfolio built with Vite, React 19, Three.js and GSAP.

1. themed loader driven by real asset progress,
2. Earth orbit hero with a textured planet and the hero ship,
3. spaceship launch on `GO`,
4. warp transition,
5. personal universe with five stops: About (the home star), Experience, Projects, Skills & awards, Contact.

## Structure

- `src/content.js` — all portfolio copy (profile, experience, projects, skills, achievements, planets). Edit this to change text.
- `src/scene.js` — the Three.js hero: Earth, ship, thrusters, bloom, warp tunnel.
- `src/flight.js` — the third-person flight route: stations, docking, black hole, camera, input.
- `src/shared.js` — noise GLSL, sprite, model helpers.
- `src/main.jsx` — React shell, phases and HUD.
- `src/styles.css` — styling.

## Assets

All Sketchfab models are CC BY 4.0 and credited in the site's About panel and below:

- "SPACESHIP - CB2" by Lezalit — https://sketchfab.com/3d-models/spaceship-cb2-b9708d29e85746c891b48075a8a1e70a
- "Earth" by AirStudios (textures only) — https://sketchfab.com/3d-models/earth-5f9c35be31a047928eace8b415a8ee3a
- "Planet Beta Hydri : Free Sample" by Duael — https://sketchfab.com/3d-models/planet-beta-hydri-free-sample-8430b71ced264065bcb3d2afb7086470
- "Purple Planet" by Yo.Ri — https://sketchfab.com/3d-models/purple-planet-264eb22207184fc99a5e3b1279a763b8
- "Planet Of Phoenix" by ARCTIC WOLVES — https://sketchfab.com/3d-models/planet-of-phoenix-bbe2737a863445f7bb2a6901d10b090a
- "Planet Serendip : Free Sample" by Duael — https://sketchfab.com/3d-models/planet-serendip-free-sample-b80dd5f7375448ceb60fc63bce90814f

The home star, asteroids, nebulae, warp tunnel and thrusters are procedural (no assets). Web versions are in `public/models/planets/` (2k WebP textures) and `public/textures/` (Earth day 4k, night 4k, clouds 2k).

### Layout

- Ship: `public/models/spaceship_cb2.glb`, packed from the Sketchfab download in `spaceship_-_cb2/` with textures resized to 2048 and converted to WebP.
  Credit (required by the license): This work is based on "SPACESHIP - CB2" (https://sketchfab.com/3d-models/spaceship-cb2-b9708d29e85746c891b48075a8a1e70a) by Lezalit (https://sketchfab.com/Lezalit) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
  Thruster plumes, glow and lights are generated at runtime in `scene.js`.
- Earth textures in `public/textures/` come from the three.js examples repository (MIT licensed):
  `earth_normal_2048.jpg`, `earth_specular_2048.jpg`.
- Resume: `public/Chaitanya_Medidar_Resume.pdf`.
- Ship asset: `public/models/spaceship_cb2.glb` is re-authored from the Sketchfab download by
  `tools/blender/fix_ship.py` (headless Blender): nose on +Z, up on +Y, centred, with three
  `thruster_*` empties on the exhaust bells whose scale is the nozzle radius. The site reads those
  anchors for the plumes. The script writes to `tools/blender/out/` (scratch, git-ignored). After exporting, compress with gltf-transform (`resize` 2048, `webp`,
  `dedup`; do not run `prune`, it drops the empty anchor nodes):

  ```bash
  "D:/Blender Foundation/Blender 4.1/blender.exe" -b --python tools/blender/fix_ship.py
  npx @gltf-transform/cli resize --width 2048 --height 2048 tools/blender/out/spaceship_cb2_fixed.glb tools/blender/out/step_resized.glb
  npx @gltf-transform/cli webp tools/blender/out/step_resized.glb tools/blender/out/step_webp.glb
  npx @gltf-transform/cli dedup tools/blender/out/step_webp.glb public/models/spaceship_cb2.glb
  ```

  The export carries no TANGENT attribute on purpose: exporter tangents for this mesh included
  zero-length vectors, and one NaN from the tangent normal-mapping path gets smeared by the bloom
  pass into a flickering black block. The loaders also strip tangents from any GLB they load.
  `tools/blender/inspect_ship.py` prints per-mesh bounds and renders orthographic check views.
- Warp sequence: the jump after GO is fully procedural (shader tunnel, plasma sheath, warp lines,
  bloom and film pass in `src/scene.js`); no video is used.


## Controls

After the wormhole the visitor chooses **Guided tour** (the autopilot flies station to station;
Prev / Next, with the report opening at each stop) or **Fly solo**. The choice can be switched at
any time, and Quick travel jumps to any station in either mode.

Fly solo on desktop: the cursor or the arrow keys steer, `W` holds thrust, `Shift` boosts, `S`
brakes, `R` / `F` climb or descend without pitching, and `Space` docks at the highlighted station.
Any input releases an orbit. On phones: a left-thumb joystick steers (up and down changes
altitude), holding Thrust flies at a fixed brisk speed, and a Dock button appears when a station is
in range. A radar shows the stations around the ship, and short one-line prompts guide the first
flight. Help in the top bar lists all of this and offers direct jumps to each section; Résumé opens
the pilot dossier, which has the PDF at its foot.

Docking glides the ship onto the orbit ring over 1.5 s while the camera eases into the orbit
framing; the report opens once the ship has settled. Leaving orbit pushes off gently and spools
the engines before handing control back. Near the edge of the flight volume an amber alert shows
while the autopilot turns the ship back.

The jump after GO doubles as the loading state: on the hero the route's shaders are compiled and
its textures uploaded in the background (`flight.prewarm`), and the wormhole simply keeps flowing
until that work and the station models are done. Nothing is drawn over it.

## Commands

```bash
npm install
npm run dev
```

Then open the Vite URL printed in the terminal.
