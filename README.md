# Carry the One

A twenty-digit mechanical calculator you can work in your browser, in real-time 3D. Every digit is a turning wheel, and the arithmetic is done by the wheels, not by floating point.

**Try it: [https://mithulpranav24012008.github.io/carry-the-one/](https://mithulpranav24012008.github.io/carry-the-one/)**

Built with Three.js and Vite. No framework.

## What you can do

- **Work it like the real thing.** Set a number with the keys, turn the crank, and watch the accumulator add it. Multiply and divide by shifting the carriage and turning the crank, one column at a time.
- **See it from every side.** Drag to turn the whole machine right round, or jump to Front, Back, Left, Right, Top or Under.
- **Lift the cover.** The machine comes apart into 41 parts, and you can step through them one at a time: ten wheels you set, ten that count, twenty that answer, and one bell.
- **Turn it into a scientific calculator.** The same parts rebuild into an electronic calculator with trig in degrees, radians or grads, logs, roots, powers, factorials, brackets, memory and Ans. Lift its cover and it comes apart down to the logic board, where you can watch a key press run along its row and column, through the chip and out to the display.
- **Hear it.** The sounds are cut from two archive recordings of real mechanical calculators.

## How the arithmetic works

Each digit is added column by column and each carry is passed to the next wheel, so `0.1 + 0.2` comes to exactly `0.3`. A division stops when the counter runs out of columns and does not round, so `1 ÷ 3 × 3` gives `0.999999999`, as it would have on a real desk. A subtraction that goes through zero rings the bell.

## Run it

You need [Node.js](https://nodejs.org) 18 or later.

```bash
npm install
npm run dev       # the site, with live reload
npm test          # the arithmetic engine and the scientific calculator
npm run build     # the production site, written to dist/
npm run preview   # serve dist/ locally
```

`npm run film` re-renders the Remotion film into `public/film.mp4`. The first run downloads a headless browser. The film in this repository shows the machine as it was before the lift-the-cover rework, so re-render it if you want it to match.

## How it's built

The rules and the 3D are kept apart, so the rules can be tested without drawing anything.

| Path | Does |
|---|---|
| `src/machine/model.js` | The calculating engine: wheels, carry, carriage, counter, bell. No Three.js. |
| `src/machine/sci.js` | The scientific calculator's logic. No Three.js. |
| `src/machine/scene.js`, `board.js`, `parts.js` | Builds the 3D machine from the engine's state, and splits it into parts. |
| `src/machine/morph.js` | The change between the two calculators. |
| `src/machine/sound.js`, `sound-map.js` | Plays the sounds, and maps machine events to them. |
| `src/iso/` | The isometric figures in the history section. |
| `film/` | The Remotion film. |
| `test/` | Tests for the engine, a fuzz test against ordinary arithmetic, and the scientific calculator. |

## What hasn't been checked

I tested the controls, the layout at desktop and phone widths, and the no-WebGL fallback in a real browser. I haven't tried it on real phones, listened to the sound on speakers, or watched the motion at full speed.

## Credits

The photographs and the two sound recordings below belong to their authors and keep their own licences. Some of the pictures and one of the recordings are share-alike, so a modified version of them has to be shared under the same terms.

| File | Work | By | Licence |
|---|---|---|---|
| `assets/commons-163614141.jpg` | [Гульдала, арифмометр Однера](https://commons.wikimedia.org/wiki/File:%D0%93%D1%83%D0%BB%D1%8C%D0%B4%D0%B0%D0%BB%D0%B0,_%D0%B0%D1%80%D0%B8%D1%84%D0%BC%D0%BE%D0%BC%D0%B5%D1%82%D1%80_%D0%9E%D0%B4%D0%BD%D0%B5%D1%80%D0%B0.jpg) | Nikolai Bulykin | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `assets/2010-curta-calculator-08.jpg` | [2010 CURTA-Calculator 08](https://commons.wikimedia.org/w/index.php?curid=24857387) | Thomas Schanz | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| `assets/arithmometer-colmar-1852.jpg` | [Arithmometer Colmar 1852](https://commons.wikimedia.org/w/index.php?curid=47070317) | Dr. Bernd Gross | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `assets/leibnitzrechenmaschine.jpg` | [Leibnitzrechenmaschine](https://commons.wikimedia.org/w/index.php?curid=925505) | User:Kolossos | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |

The sounds in `public/sounds/machine.wav` are cut from two recordings, using `sounds/build.py`:

- Brunsviga Nova 13Z, by Antti Makkonen and Antti Hannunen, Sounds of Changes, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Keystrokes in a vintage mechanical calculator, by Subhashish Panigrahi, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Carry is an invented machine, drawn in the line of Leibniz's stepped reckoner, Thomas de Colmar's arithmometer, Odhner's pinwheel calculator and Herzstark's Curta.

## Licence

[MIT](LICENSE) for the code. The pictures and sounds above are not covered by it.
