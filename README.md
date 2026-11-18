# MiniCraft

A simple Minecraft clone written in HTML5 + vanilla JavaScript + WebGL. No build step, no dependencies.

## Play

Open `index.html` in any modern browser (double-click works, no server needed), or serve the folder:

```
python3 -m http.server 8000
```

then visit http://localhost:8000 and click to capture the mouse.

## Controls

- WASD — move
- Mouse — look
- Space — jump
- Shift — sprint
- Left click — break block
- Right click — place block
- 1-8 — select block (dirt, stone, grass, wood, leaves, sand, brick, planks)
- Esc — release mouse

## Files

- `index.html` — page, HUD, styles
- `game.js` — voxel engine: procedural terrain, meshing, physics, raycasting, rendering
