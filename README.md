# Lineart Studio

A browser-based photo-to-SVG drawing tool inspired by `lineart.py`. It prepares an image with XDoG, traces it to SVG, lets you draw vectorized brush strokes over the artwork, and records several reveal styles as WebM.

## Run locally

```powershell
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). OpenCV.js and VTracer WebAssembly are served locally by the app; the selected photo is processed in the browser and is not uploaded.

## Use

1. Choose a PNG, JPEG, or WebP image.
2. Tune line scale, threshold, and minimum speck size.
3. Optionally define a subject boundary directly on the source image with the smooth freehand tool or the point-based spline tool. You can also enter points manually as `x,y x,y x,y` in the original image's pixel coordinates. Everything outside the closed boundary is removed.
4. Optionally enable **Boost detected face details** to locally lift contrast and shadow detail in detected faces. Or enable **Select custom detail regions** and drag rectangles over any subjects to enhance them. Drag inside a custom region to move it, or use its handles to resize it. Turn on **Emphasize selected regions** to concentrate denser, brighter line work inside those regions while making the rest of the image fainter. All options are off by default; detected faces and custom regions are processed in the browser before tracing.
5. Generate the SVG, then download it or draw over the vector artwork.
6. Choose a calligraphy, monoline, marker, or pencil brush and draw with a mouse or pen. Each completed stroke is traced to vector paths immediately.
7. Choose an animation style and play or record it as a WebM:
   - Pen sketch (overlap) reveals centerline strokes with overlapping timing.
   - Sequential stroke completes each centerline before starting the next, with a brief pause.
   - Printer scan prints horizontal rows from left to right.
   - Diagonal sweep reveals from the top-left toward the bottom-right.
   - Ink modes (canvas-rendered from the traced paths' real Bézier points):
     国风 Guofeng ink flow (boustrophedon write-in with a flowing wobble and ghost trails),
     水墨 Ink wash bloom (strokes condense out of a dispersed wash),
     书法 Calligraphy write-in (dry-brush strokes, no wobble) and
     墨絵 Sumi-e (key strokes in heavy ink with a halo, detail lightened, soft vignette).
   - Vector reveals: 折纸 Origami fold-out (a red packet unfolding crease by crease in 3D),
     磁吸 Magnetic node snap, 百叶 Venetian louver wipe, 藤蔓 Botanical vine weave and 万花 Kaleidoscope.
     These live in `src/animator/ink-reveals.js`; each has a natural length that is stretched to the chosen duration.
   - Origami designs: the packet plus 天鹅 swan, 鹤 crane, 猫 cat, 蝶 butterfly, 信封 envelope and 星 star, each folded from the
     artwork and unfolded in 3D. Designs are plain fold lists in the `DESIGNS` table of the origami engine in `ink-reveals.js`.
   - Set the animation duration from 2 to 30 seconds and choose how long the completed sketch remains visible in the WebM (0 to 30 seconds).
   - Recording is frame-exact: every frame is fully rendered for its exact time and encoded with WebCodecs
     (`src/animator/webm-writer.js`), so the WebM always has the full length and every frame, however slow rendering is.
     Browsers without WebCodecs fall back to real-time capture.

The output SVG uses the source image's width and height. Enable the background option to add a white rectangle. New strokes are included in both the SVG download and the reveal animation. Face detection uses the locally served MediaPipe face-detection package (Apache-2.0); photos are not sent to a remote service.
