// Quiet Sky: the scene for a backdrop behind the Claude desktop chat.
// Stars on the app's own default dark background, and two of the eight planets as globes built from small characters
// that wander the sky: which two depends on the conversation. Earth carries a moon on an orbit. A few stars dip, and
// a shooting star passes now and then.
// Pure string building: no DOM, nothing read from outside, the same string on every call.

export const WIDTH = 1600
export const HEIGHT = 1000
/** The desktop app's default dark background, read from a screenshot of it. */
export const BACKGROUND = '#191919'
/** No blur, so the artwork stays sharp behind the chat; the tint is the background colour, so it only dims the scene. */
export const GLASS = { blur: 0, tint: BACKGROUND, opacity: 0.45 }

const STAR_TINTS = ['#f2efe8', '#cdd6f4', '#f6dfc0']
const STAR_LEVELS = [0.35, 0.6, 0.9]

type Point = { x: number; y: number }
type Mark = Point & { glyph: string; colour: string; strength: number }
type Cell = Point & { dx: number; dy: number }
type Shades = readonly [lit: string, mid: string, dim: string]
/** What one cell of a globe shows; nothing where the cell stays empty. */
type Paint = { glyph: string; colour: string; strength?: number }
/** A point of a globe as its painter sees it. */
type Spot = {
  /** Where it is on the disc, in radii from the centre. */
  dx: number
  dy: number
  /** Where it is on the globe's surface: `u` runs round it and `v` from pole to pole, so features crowd together toward the rim as on a real globe. */
  u: number
  v: number
  /** How brightly it is lit, 0..1. */
  lit: number
  /** The light before it is cut off at 0: below 0 the spot is on the night side, the lower the deeper. */
  raw: number
  /** A random number of the cell's own. */
  chance: number
}
type Painter = (spot: Spot) => Paint | undefined
/** What makes a body other than a smooth globe. */
type Form = {
  /** How far the rim stands from the centre in a direction (an angle in radians), as a multiple of the radius: 1 all round for a globe. */
  rimAt?: (angle: number) => number
  /** Extra light (or, below 0, shadow) at a point, in radii from the centre: the walls of craters, the faces of rock. */
  reliefAt?: (dx: number, dy: number) => number
}

const ORIGIN: Point = { x: 0, y: 0 }

/** A seeded generator of numbers in 0..1, so every build draws the same sky. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** A filled dot as a path fragment, so hundreds of stars are a handful of elements. */
function dot(x: number, y: number, radius: number): string {
  const r = radius.toFixed(2)
  const across = (radius * 2).toFixed(2)
  return `M${(x - radius).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${across} 0a${r} ${r} 0 1 0 -${across} 0`
}

/**
 * The sky: still stars in three tints and three brightnesses, thinner over the reading column, and three small groups
 * of brighter stars that dip now and then.
 */
function starfield(seed: number, count: number): string {
  const next = random(seed)
  const still = new Map<string, string>()
  const twinkling = ['', '', '']
  let twinklers = 0
  let placed = 0
  while (placed < count) {
    const x = next() * WIDTH
    const y = next() * HEIGHT
    const isOverText = Math.abs(x - WIDTH / 2) < WIDTH * 0.27
    if (isOverText && next() > 0.4) continue
    placed += 1
    const radius = 0.5 + next() ** 3 * 1.5
    const tint = Math.floor(next() * STAR_TINTS.length)
    const level = Math.floor(next() * STAR_LEVELS.length)
    if (radius > 1.15 && twinklers < 36) {
      const group = twinklers % 3
      twinkling[group] = (twinkling[group] ?? '') + dot(x, y, radius)
      twinklers += 1
      continue
    }
    const key = `${tint},${level}`
    still.set(key, (still.get(key) ?? '') + dot(x, y, radius))
  }
  let markup = ''
  for (const [key, path] of still) {
    const [tint, level] = key.split(',').map(Number)
    markup += `<path d="${path}" fill="${STAR_TINTS[tint ?? 0]}" fill-opacity="${STAR_LEVELS[level ?? 0]}"/>`
  }
  twinkling.forEach((path, which) => {
    if (path !== '') markup += `<path class="t${which + 1}" d="${path}" fill="${STAR_TINTS[0]}"/>`
  })
  return markup
}

/** A few brighter stars with a four-point glint, kept to the edges. */
function glints(points: ReadonlyArray<readonly [number, number, number]>): string {
  return points
    .map(([x, y, size]) =>
      `<path d="M${x - size} ${y}H${x + size}M${x} ${y - size}V${y + size}" stroke="${STAR_TINTS[0]}" stroke-opacity=".45" stroke-width=".8"/>` +
      `<path d="${dot(x, y, 1.7)}" fill="${STAR_TINTS[0]}"/>`)
    .join('')
}

/** One shooting star: a short trail that crosses once per cycle and is invisible for the rest of it. */
function shootingStar(name: string, x: number, y: number, angle: number, seconds: number, delay: number): string {
  return `<g transform="translate(${x} ${y}) rotate(${angle})"><line class="${name}" x1="-150" y1="0" x2="0" y2="0" stroke="url(#trail)" stroke-width="1.6" stroke-linecap="round" style="animation:shoot ${seconds}s linear -${delay}s infinite"/></g>`
}

// THE PLANETS' GRID. Small cells, so a globe is many characters across and its surface can carry detail:
// Jupiter is about 40 characters wide and 27 rows high. Rows are packed closer than a line of text, so the
// characters knit into a texture. Every character is one the theme's font (Consolas) has itself.
const CELL_WIDTH = 4
const CELL_HEIGHT = 6
const FONT_SIZE = 7
/** Light from the upper left and a little toward the viewer, as a unit vector. */
const LIGHT = [-0.56, -0.48, 0.675] as const

// Characters from little ink to much, one ramp per kind of surface.
const ROCK_RAMP = '.·:;-=+*o%#@'
const CLOUD_RAMP = '.·-~=≈≡'
const SEA_RAMP = '.·-~≈'
const LAND_RAMP = ':;+*%#'
const ZONE_RAMP = '.·-:=+≡'
// (no shade blocks: they are taller than a row of this grid and would stand out of it as bricks)
const BELT_RAMP = '.:;~≈*%#'

/** Every grid cell whose centre lies within `reach` of a centre, as offsets from that centre. */
function cellsAround(centre: Point, reach: number): Cell[] {
  const cells: Cell[] = []
  const firstColumn = Math.floor((centre.x - reach) / CELL_WIDTH)
  const lastColumn = Math.ceil((centre.x + reach) / CELL_WIDTH)
  const firstRow = Math.floor((centre.y - reach) / CELL_HEIGHT)
  const lastRow = Math.ceil((centre.y + reach) / CELL_HEIGHT)
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const x = (column + 0.5) * CELL_WIDTH
      const y = (row + 0.5) * CELL_HEIGHT
      cells.push({ x, y, dx: x - centre.x, dy: y - centre.y })
    }
  }
  return cells
}

/** The light at a point of a globe before it is cut off at 0: negative on the night side. `dx` and `dy` are in radii. */
function rawLightAt(dx: number, dy: number): number {
  const depth = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy))
  return dx * LIGHT[0] + dy * LIGHT[1] + depth * LIGHT[2]
}

function shadeOf(lit: number, shades: Shades): string {
  return lit > 0.62 ? shades[0] : lit > 0.34 ? shades[1] : shades[2]
}

/** The character of a ramp for a value from 0 to 1. */
function rampAt(value: number, ramp: string): string {
  return ramp[Math.min(ramp.length - 1, Math.max(0, Math.floor(value * ramp.length)))] ?? '.'
}

/** A number in 0..1 that depends only on a place in a grid: the same place always gives the same number. */
function placeChance(column: number, row: number, seed: number): number {
  const mixed = Math.sin(column * 127.1 + row * 311.7 + seed * 74.7) * 43758.5453
  return mixed - Math.floor(mixed)
}

/** Smooth noise in 0..1: random values on a grid, blended between its points. */
function noise(x: number, y: number, seed: number): number {
  const column = Math.floor(x)
  const row = Math.floor(y)
  const fx = x - column
  const fy = y - row
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const top = placeChance(column, row, seed) * (1 - sx) + placeChance(column + 1, row, seed) * sx
  const bottom = placeChance(column, row + 1, seed) * (1 - sx) + placeChance(column + 1, row + 1, seed) * sx
  return top * (1 - sy) + bottom * sy
}

/** Three layers of that noise, each finer and fainter: the look of terrain and cloud. 0..1. */
function rough(x: number, y: number, seed: number): number {
  return (noise(x, y, seed) + 0.5 * noise(x * 2, y * 2, seed + 1) + 0.25 * noise(x * 4, y * 4, seed + 2)) / 1.75
}

/** A second number in 0..1 from a cell's own random number, for a decision that must not follow the first. */
function secondChance(own: number): number {
  return (own * 7.31 + 0.17) % 1
}

/** A cell counts as rim from this share of it under the disc, and as fully on the globe from this share. */
const EDGE_FROM = 0.15
const FULL_FROM = 0.7
const SAMPLES_ACROSS = 4
const SAMPLES_DOWN = 6

type Cover = { share: number; x: number; y: number; isFullWidth: boolean }

/**
 * How much of a cell a disc of this radius covers, from a grid of sample points, and where the covered part sits:
 * `x` and `y` are its middle, from -0.5 to 0.5 of the cell's width and height. `isFullWidth`: it reaches both sides.
 */
function coverOf(cell: Cell, isInside: (x: number, y: number) => boolean): Cover {
  let inside = 0
  let sumX = 0
  let sumY = 0
  let left = 0
  let right = 0
  for (let row = 0; row < SAMPLES_DOWN; row += 1) {
    for (let column = 0; column < SAMPLES_ACROSS; column += 1) {
      const x = (column + 0.5) / SAMPLES_ACROSS - 0.5
      const y = (row + 0.5) / SAMPLES_DOWN - 0.5
      if (!isInside(cell.dx + x * CELL_WIDTH, cell.dy + y * CELL_HEIGHT)) continue
      inside += 1
      sumX += x
      sumY += y
      if (column === 0) left += 1
      if (column === SAMPLES_ACROSS - 1) right += 1
    }
  }
  return inside === 0
    ? { share: 0, x: 0, y: 0, isFullWidth: false }
    : { share: inside / (SAMPLES_ACROSS * SAMPLES_DOWN), x: sumX / inside, y: sumY / inside, isFullWidth: left > 0 && right > 0 }
}

/**
 * The character for a rim cell, by where its ink sits: low marks where the globe fills the cell's lower part,
 * high marks where it fills the upper part, and a bracket where the rim runs upright.
 */
function edgeGlyph(cover: Cover): string {
  const across = cover.x * CELL_WIDTH
  const down = cover.y * CELL_HEIGHT
  if (Math.abs(down) >= Math.abs(across)) {
    if (down > 0) return cover.isFullWidth ? '_' : across < 0 ? ',' : '.'
    return cover.isFullWidth ? '¯' : across < 0 ? '`' : "'"
  }
  return across < 0 ? ')' : '('
}

/**
 * A globe's cells, each decided by its painter.
 * The rim: a cell the disc only partly covers gets a character whose ink sits in the covered part, on the lit side only.
 * The painter only ever describes the surface in daylight; the day-night line and the night side are drawn here,
 * the same way for every globe.
 */
function globe(radius: number, seed: number, painter: Painter, form: Form = {}): Mark[] {
  const chance = random(seed)
  const marks: Mark[] = []
  const rimAt = form.rimAt
  // the rim's distance from the centre toward a point: the radius itself for a globe, more or less for a lumpy body
  const reachToward = (x: number, y: number): number => (rimAt === undefined ? radius : radius * rimAt(Math.atan2(y, x)))
  for (const cell of cellsAround(ORIGIN, (rimAt === undefined ? radius : radius * 1.6) + CELL_HEIGHT)) {
    const cover = coverOf(cell, (x, y) => Math.hypot(x, y) <= reachToward(x, y))
    if (cover.share < EDGE_FROM) continue
    const own = chance()
    // a cell on the rim takes its light and colour from the nearest point just inside the body
    const local = reachToward(cell.dx, cell.dy)
    const distance = Math.hypot(cell.dx, cell.dy) / local
    const pull = distance > 0.96 ? 0.96 / distance : 1
    const dx = (cell.dx / local) * pull
    const dy = (cell.dy / local) * pull
    const raw = rawLightAt(dx, dy) + (form.reliefAt?.(dx, dy) ?? 0)
    const lit = Math.max(0, raw)
    const depth = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy))
    const spot: Spot = { dx, dy, u: Math.atan2(dx, depth), v: Math.asin(Math.max(-1, Math.min(1, dy))), lit, raw, chance: own }

    if (cover.share < FULL_FROM) {
      if (lit < 0.09) continue
      const paint = painter(spot)
      if (paint !== undefined) marks.push({ x: cell.x, y: cell.y, glyph: edgeGlyph(cover), colour: paint.colour, strength: 0.75 })
      continue
    }

    // Day and night are mixed across the line between them: from light 0.2 down to just past 0, more and more
    // cells take the night's grey, each by a number of its own, so there is no edge where the colour stops.
    const isDay = raw >= 0.2 || (raw > -0.03 && secondChance(own) < (raw + 0.03) / 0.23)
    if (isDay) {
      const paint = painter({ ...spot, lit: Math.max(lit, 0.09) })
      if (paint !== undefined) marks.push({ x: cell.x, y: cell.y, glyph: paint.glyph, colour: paint.colour, strength: paint.strength ?? 1 })
      continue
    }
    // THE NIGHT SIDE keeps the surface's own characters, as they are in dim light, in greys that step down into
    // the background, and it thins out as it goes; past a point there is nothing, so the far rim melts away.
    const dark = Math.max(0, Math.min(NIGHT_SHADES.length - 1, Math.floor((0.09 - raw) / 0.14)))
    if (raw < -0.47 || own < dark * 0.18) continue
    const paint = painter({ ...spot, lit: 0.15 })
    if (paint !== undefined) marks.push({ x: cell.x, y: cell.y, glyph: dark < 2 ? paint.glyph : '·', colour: NIGHT_SHADES[dark] ?? NIGHT_SHADES[3], strength: 1 })
  }
  return marks
}

/** Greys for the night side, each a little lighter than the background and the last almost the same as it. */
const NIGHT_SHADES = ['#3b3a37', '#2f2e2c', '#262524', '#1f1f1e'] as const

/** A colour at part strength: mixed toward the background, so a faint character needs no opacity of its own. */
function faded(colour: string, strength: number): string {
  if (strength >= 1) return colour
  const part = (at: number): string => {
    const own = parseInt(colour.slice(at, at + 2), 16)
    const back = parseInt(BACKGROUND.slice(at, at + 2), 16)
    return Math.round(back + (own - back) * strength).toString(16).padStart(2, '0')
  }
  return `#${part(1)}${part(3)}${part(5)}`
}

function escaped(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

/**
 * The marks as text, one element per row of the grid. A row is one string from its first character to its last, with
 * spaces where a cell is empty, stretched to exactly its cells' width (`textLength`), so every character sits on its
 * cell whatever the font's own width is. Neighbours of one colour share a span.
 */
function glyphs(marks: readonly Mark[]): string {
  const rows = new Map<number, Map<number, { glyph: string; colour: string }>>()
  for (const mark of marks) {
    const row = Math.round(mark.y / CELL_HEIGHT - 0.5)
    const column = Math.round(mark.x / CELL_WIDTH - 0.5)
    const cells = rows.get(row) ?? new Map<number, { glyph: string; colour: string }>()
    cells.set(column, { glyph: mark.glyph, colour: faded(mark.colour, mark.strength) })
    rows.set(row, cells)
  }
  let markup = ''
  for (const [row, cells] of [...rows].sort((one, other) => one[0] - other[0])) {
    const columns = [...cells.keys()].sort((one, other) => one - other)
    const first = columns[0] ?? 0
    const last = columns[columns.length - 1] ?? first
    const runs: { colour: string; text: string }[] = []
    for (let column = first; column <= last; column += 1) {
      const cell = cells.get(column)
      const open = runs[runs.length - 1]
      if (open !== undefined && (cell === undefined || cell.colour === open.colour)) open.text += cell?.glyph ?? ' '
      else if (cell !== undefined) runs.push({ colour: cell.colour, text: cell.glyph })
    }
    // the row's commonest colour is the row's own, so only the runs in another colour need a span
    const counts = new Map<string, number>()
    for (const run of runs) counts.set(run.colour, (counts.get(run.colour) ?? 0) + 1)
    const main = [...counts].sort((one, other) => other[1] - one[1])[0]?.[0] ?? BACKGROUND
    const spans = runs.map(run => (run.colour === main ? escaped(run.text) : `<tspan fill="${run.colour}">${escaped(run.text)}</tspan>`)).join('')
    const y = ((row + 0.5) * CELL_HEIGHT + FONT_SIZE * 0.33).toFixed(1)
    const stretch = last > first ? ` textLength="${(last - first + 1) * CELL_WIDTH}"` : ''
    markup += `<text x="${first * CELL_WIDTH}" y="${y}"${stretch} fill="${main}">${spans}</text>`
  }
  return markup
}

/** A disc of the background colour behind a globe, so the stars do not show through its night side. */
function backing(radius: number): string {
  return `<circle r="${(radius - 2).toFixed(1)}" fill="${BACKGROUND}"/>`
}

const MERCURY: Shades = ['#c9c3b7', '#938e84', '#5f5c56']
const MERCURY_DARK: Shades = ['#a39d92', '#787369', '#4d4a45']
const VENUS: Shades = ['#efdfae', '#c9b578', '#8c7d50']
const VENUS_DARK: Shades = ['#d6bd84', '#ad965e', '#786942']
const OCEAN: Shades = ['#6ea4ea', '#4878c0', '#2f4f85']
const SHALLOWS: Shades = ['#86c4ee', '#5c98c8', '#3c668e']
const LAND: Shades = ['#7fc46a', '#5a9a4e', '#3c6a38']
const DESERT: Shades = ['#d8c48c', '#aa9662', '#716444']
const PEAKS: Shades = ['#d9d4c8', '#a39e94', '#6b6862']
const MARS: Shades = ['#e0855a', '#b85a34', '#7c3c24']
const MARS_DARK: Shades = ['#9a5238', '#7a3f2c', '#552c20']
const SATURN: Shades = ['#e6d6a3', '#bba974', '#7e7350']
const SATURN_DARK: Shades = ['#cdb884', '#a38f5e', '#6c6142']
const URANUS: Shades = ['#aee6e4', '#7dbcbe', '#4f8286']
const URANUS_DARK: Shades = ['#8fd0d2', '#66a6aa', '#426d72']
const NEPTUNE: Shades = ['#7d9df5', '#4f6dcc', '#314684']
const NEPTUNE_DARK: Shades = ['#6484e2', '#3f58b2', '#28396f']
const ICE = '#f1f4f6'

/**
 * The value a ramp turns into a character: the light, broken up by the surface's own roughness, so one planet
 * uses the whole of its ramp and not one character per shade. `x` and `y` say how fine the roughness is each way.
 */
function textured(lit: number, x: number, y: number, seed: number): number {
  return lit * (0.35 + 0.95 * rough(x, y, seed))
}

/**
 * Mercury: grey rock in lighter highlands and darker plains, pitted with craters (a ring character, brighter than
 * the ground), and one young crater with bright rays running out of it.
 */
function mercury(radius: number): string {
  return backing(radius) + glyphs(globe(radius, 3, ({ u, v, lit }) => {
    const across = u + 0.35
    const down = v + 0.2
    const reach = Math.hypot(across, down)
    if (reach < 0.07) return { glyph: '@', colour: MERCURY[0] }
    if (reach < 0.45 && Math.abs(Math.sin(Math.atan2(down, across) * 4)) > 0.9) return { glyph: reach < 0.2 ? '*' : '+', colour: MERCURY[0], strength: lit > 0.34 ? 1 : 0.7 }
    const pit = noise(u * 11, v * 11, 37)
    if (pit > 0.8) return { glyph: pit > 0.88 ? 'O' : 'o', colour: shadeOf(Math.min(1, lit + 0.2), MERCURY) }
    const isPlain = rough(u * 2.4 + 2, v * 2.4, 31) < 0.45
    return { glyph: rampAt(textured(lit, u * 7, v * 7, 33), ROCK_RAMP), colour: shadeOf(lit, isPlain ? MERCURY_DARK : MERCURY) }
  }))
}

/** Venus: pale yellow cloud in long swirls that bend toward the poles, lighter and darker by turns, streaked along their length. */
function venus(radius: number): string {
  return backing(radius) + glyphs(globe(radius, 5, ({ u, v, lit }) => {
    const bend = v * 4 + Math.abs(u) * 1.6 + rough(u * 2, v * 3, 41) * 2.5
    const isBright = Math.sin(bend * 2.2) > 0
    return { glyph: rampAt(textured(lit, u * 3 + bend, v * 10, 43), isBright ? ZONE_RAMP : BELT_RAMP), colour: shadeOf(lit, isBright ? VENUS : VENUS_DARK) }
  }))
}

/**
 * Earth: oceans, continents with ragged coasts, white caps, drifts of cloud, and the Moon.
 * The Moon's orbit is two swings a quarter turn apart, across and up-and-down, which together draw a flat ellipse.
 * It is hidden for the part of the far half where it would be behind the globe.
 */
function earth(radius: number): string {
  const globeMarks = globe(radius, 7, ({ dy, u, v, lit }) => {
    if (Math.abs(dy) > 0.84 - 0.06 * noise(u * 6, 0, 43)) return { glyph: lit > 0.5 ? '*' : '+', colour: ICE, strength: lit > 0.34 ? 1 : 0.6 }
    if (rough(u * 3.2 + 9, v * 4, 47) > 0.63) return { glyph: lit > 0.5 ? '°' : '·', colour: ICE, strength: lit > 0.5 ? 0.95 : 0.6 }
    const height = rough(u * 1.9 + 1.7, v * 2.3 + 0.4, 53)
    if (height > 0.66) return { glyph: '^', colour: shadeOf(lit, PEAKS) }
    if (height > 0.5) {
      // dry land near the middle latitudes is desert, the rest is green
      const isDry = Math.abs(v) < 0.75 && rough(u * 2.5 + 5, v * 2.5, 55) > 0.56
      return { glyph: rampAt(textured(lit, u * 8, v * 8, 57), isDry ? ROCK_RAMP : LAND_RAMP), colour: shadeOf(lit, isDry ? DESERT : LAND) }
    }
    // the sea is paler along the coasts, and its swell runs from side to side
    return { glyph: rampAt(textured(lit, u * 5, v * 12, 59), SEA_RAMP), colour: shadeOf(lit, height > 0.44 ? SHALLOWS : OCEAN) }
  })
  // the Moon and its orbit keep their proportion to Earth at any size
  const size = radius / 48
  const moon = globe(12 * size, 9, ({ u, v, lit }) => ({ glyph: rampAt(lit * (0.5 + 0.5 * rough(u * 4, v * 4, 59)), ROCK_RAMP), colour: shadeOf(lit, MERCURY) }))
  const swing = `--across:${Math.round(MOON.across * size)}px;--deep:${Math.round(MOON.deep * size)}px`
  return backing(radius) + glyphs(globeMarks) + `<g class="mx" style="${swing}"><g class="my"><g class="mo">${backing(11 * size)}${glyphs(moon)}</g></g></g>`
}

/**
 * Mars: rust highlands and darker plains in drifting shapes, a long dark canyon near the equator, one great
 * volcano, and scattered craters. No polar caps: in characters this small a white cap read as a hat, not as ice.
 */
function mars(radius: number): string {
  return backing(radius) + glyphs(globe(radius, 11, ({ u, v, lit }) => {
    if (u > -0.55 && u < 0.6 && Math.abs(v - 0.1 - 0.07 * Math.sin(u * 3.5)) < 0.04) return { glyph: lit > 0.5 ? '≈' : '~', colour: MARS_DARK[2] }
    const volcano = Math.hypot(u + 0.8, (v + 0.3) * 1.3)
    if (volcano < 0.13) return { glyph: volcano < 0.05 ? '@' : 'O', colour: MARS[0] }
    if (noise(u * 10, v * 10, 69) > 0.88) return { glyph: 'o', colour: shadeOf(Math.min(1, lit + 0.2), MARS) }
    const isPlain = rough(u * 2.6 + 3, v * 2.8, 67) < 0.43
    return { glyph: rampAt(textured(lit, u * 7, v * 7, 71), ROCK_RAMP), colour: shadeOf(lit, isPlain ? MARS_DARK : MARS) }
  }))
}

/**
 * Jupiter's bands from north to south: pale zones and darker belts. A zone is drawn in line characters, a belt in
 * wave and shade characters, each from little ink to much.
 */
const JUPITER_BANDS = [
  { colour: '#b9a98a', ramp: BELT_RAMP },
  { colour: '#d8cdb2', ramp: ZONE_RAMP },
  { colour: '#b98a5e', ramp: BELT_RAMP },
  { colour: '#e2d8c0', ramp: ZONE_RAMP },
  { colour: '#a8684a', ramp: BELT_RAMP },
  { colour: '#e6dcc6', ramp: ZONE_RAMP },
  { colour: '#b0704c', ramp: BELT_RAMP },
  { colour: '#d8cdb2', ramp: ZONE_RAMP },
  { colour: '#b98a5e', ramp: BELT_RAMP },
  { colour: '#cdb892', ramp: ZONE_RAMP },
  { colour: '#a89878', ramp: BELT_RAMP },
] as const
/** The band a point of Jupiter lies in; the lines between bands are torn by turbulence. */
function jupiterBandAt(dy: number, u: number): (typeof JUPITER_BANDS)[number] {
  const torn = dy + 0.05 * (rough(u * 4, dy * 9, 71) - 0.5)
  return JUPITER_BANDS[Math.min(JUPITER_BANDS.length - 1, Math.max(0, Math.floor(((torn + 1) / 2) * JUPITER_BANDS.length)))] ?? JUPITER_BANDS[0]
}

/**
 * The Great Red Spot, or nothing where a point lies outside it. From the middle out: a dark red core, two rings
 * of arms that wind round it (the characters change along each arm), a rim of brackets and waves, and the pale
 * hollow the storm sits in. Its edge is ragged. It is two fifths of the globe's radius wide each way from its middle.
 */
function jupiterEye(dx: number, dy: number, u: number): { glyph: string; colour: string } | undefined {
  const across = (dx - 0.08) / 0.4
  const down = (dy - 0.3) / 0.24
  const reach = Math.hypot(across, down) + 0.14 * (rough(u * 7, dy * 18, 101) - 0.5)
  if (reach > 1.36) return undefined
  // which arm of the spiral a point is on: it turns with the angle round the middle and with the distance from it
  const arm = Math.sin(Math.atan2(down, across) * 2 + reach * 8)
  // brick reds and dusty pinks, like the spot itself: nothing here is orange
  if (reach < 0.2) return { glyph: '@', colour: '#96382c' }
  if (reach < 0.5) return { glyph: arm > 0 ? '@' : 'O', colour: arm > 0 ? '#a44234' : '#b05446' }
  if (reach < 0.78) return { glyph: arm > 0.35 ? 'O' : arm > -0.35 ? 'o' : '≈', colour: arm > -0.35 ? '#b4685a' : '#c08f84' }
  // one bracket at each end of the rim, waves along the rest of it
  if (reach < 1) return { glyph: reach > 0.9 && Math.abs(down) < 0.5 ? (across < 0 ? '(' : ')') : arm > 0 ? '≈' : '~', colour: '#c4a096' }
  return { glyph: arm > 0 ? '-' : '·', colour: '#efe8d6' }
}

/**
 * Jupiter: eleven bands with torn edges and streaks along them, small pale ovals, and the Great Red Spot in its
 * pale hollow. The night side is not cut off: its characters go on in greys that step down into the
 * background and thin out, mixed with the day's across the line between them.
 */
function jupiter(radius: number): string {
  return backing(radius) + glyphs(globe(radius, 13, ({ dx, dy, u, lit }) => {
    const band = jupiterBandAt(dy, u)
    const strength = lit > 0.62 ? 1 : lit > 0.34 ? 0.72 : 0.45
    const eye = jupiterEye(dx, dy, u)
    if (eye !== undefined) return { ...eye, strength }
    // streaks run along a band: the noise is stretched round the globe and squeezed from pole to pole
    const streak = rough(u * 5, dy * 17, 73)
    if (noise(u * 9, dy * 16, 79) > 0.93) return { glyph: '°', colour: '#efe8d6', strength }
    return { glyph: rampAt(lit * (0.35 + 0.95 * streak), band.ramp), colour: band.colour, strength }
  }))
}

/** Saturn's rings from the inside out, as shares of their full width: the broad bright ring, a dark gap, the outer ring. */
const RING_PARTS = [
  // three strengths only, and neighbours often share one: every change of colour along a row costs a span
  { to: 0.63, glyph: ':', strength: 0.45 },
  { to: 0.68, glyph: '-', strength: 0.45 },
  { to: 0.75, glyph: '=', strength: 1 },
  { to: 0.82, glyph: '≡', strength: 1 },
  { to: 0.855, glyph: ' ', strength: 0 },
  { to: 0.92, glyph: '=', strength: 0.7 },
  { to: 0.935, glyph: '-', strength: 0.7 },
  { to: 0.975, glyph: '=', strength: 0.7 },
  { to: 1, glyph: '-', strength: 0.45 },
] as const

/** Saturn: a pale gold globe with faint bands, and tilted rings with a gap in them: the far half passes behind the globe, the near half in front. */
function saturn(radius: number): string {
  const ring = { across: radius * 2.25, deep: radius * 0.62, inner: 0.58, tilt: (-10 * Math.PI) / 180 }
  // back to front, one mark per cell: the far half of the rings, then the globe over it, then the near half over both
  const layers = new Map<string, Mark>()
  const near: Mark[] = []
  for (const cell of cellsAround(ORIGIN, ring.across)) {
    const along = cell.dx * Math.cos(ring.tilt) + cell.dy * Math.sin(ring.tilt)
    const off = -cell.dx * Math.sin(ring.tilt) + cell.dy * Math.cos(ring.tilt)
    const band = Math.hypot(along / ring.across, off / ring.deep)
    if (band <= ring.inner || band > 1) continue
    const part = RING_PARTS.find(entry => band <= entry.to)
    if (part === undefined || part.glyph === ' ') continue
    const mark: Mark = { x: cell.x, y: cell.y, glyph: part.glyph, colour: '#cdbf95', strength: part.strength * (off >= 0 ? 0.9 : 0.5) }
    if (off >= 0) near.push(mark)
    else layers.set(`${cell.x},${cell.y}`, mark)
  }
  // nine bands with torn edges, lighter and darker gold by turns, streaked along their length
  const globeMarks = globe(radius, 15, ({ dy, u, lit }) => {
    const torn = dy + 0.05 * (rough(u * 4, dy * 9, 83) - 0.5)
    const isBright = Math.floor(((torn + 1) / 2) * 9) % 2 === 0
    if (noise(u * 9, dy * 16, 85) > 0.94) return { glyph: '°', colour: '#f3ead0' }
    return { glyph: rampAt(textured(lit, u * 5, dy * 17, 87), isBright ? ZONE_RAMP : BELT_RAMP), colour: shadeOf(lit, isBright ? SATURN : SATURN_DARK) }
  })
  for (const mark of [...globeMarks, ...near]) layers.set(`${mark.x},${mark.y}`, mark)
  return backing(radius) + glyphs([...layers.values()])
}

/** Uranus: pale cyan in soft bands, streaked along their length, with a paler hood over the north pole and a few bright clouds. */
function uranus(radius: number): string {
  return backing(radius) + glyphs(globe(radius, 17, ({ dy, u, lit }) => {
    if (dy < -0.6 + 0.06 * noise(u * 5, 0, 109)) return { glyph: rampAt(textured(lit, u * 6, dy * 12, 111), ZONE_RAMP), colour: lit > 0.5 ? '#d8f5f2' : '#a9d6d6' }
    if (noise(u * 8, dy * 14, 113) > 0.94) return { glyph: '°', colour: '#eefcfa' }
    const isBright = Math.sin(dy * 10 + rough(u * 2, dy * 5, 107) * 1.5) > 0
    return { glyph: rampAt(textured(lit, u * 5, dy * 17, 115), isBright ? ZONE_RAMP : BELT_RAMP), colour: shadeOf(lit, isBright ? URANUS : URANUS_DARK) }
  }))
}

/**
 * Neptune: deep blue with streaks. The Great Dark Spot is a ragged oval in the same characters as the rest, only
 * darker, and darkest in its middle, with bright cloud along its lower edge. A smaller dark spot lies far south.
 * White streaks of cloud follow one latitude: thickest on it and thinning away from it, so they never form a block.
 */
function neptune(radius: number): string {
  return backing(radius) + glyphs(globe(radius, 19, ({ dx, dy, u, lit }) => {
    const across = (dx + 0.22) / 0.3
    const down = (dy + 0.14) / 0.17
    const reach = Math.hypot(across, down) + 0.16 * (rough(u * 6, dy * 16, 103) - 0.5)
    if (reach < 1) {
      const isCore = reach < 0.55
      return { glyph: rampAt(lit * (isCore ? 0.5 : 0.75), CLOUD_RAMP), colour: shadeOf(lit, NEPTUNE), strength: isCore ? 0.42 : 0.62 }
    }
    if (reach < 1.3 && down > 0.3) return { glyph: lit > 0.5 ? '≈' : '~', colour: ICE, strength: 0.9 }

    const small = Math.hypot((dx - 0.12) / 0.11, (dy - 0.62) / 0.07)
    if (small < 1) return { glyph: rampAt(lit * 0.5, CLOUD_RAMP), colour: shadeOf(lit, NEPTUNE), strength: 0.5 }

    const away = Math.abs(dy - 0.34) / 0.2
    if (away < 1 && rough(u * 1.5 + 4, dy * 24, 89) > 0.6 + 0.3 * away * away) return { glyph: lit > 0.5 ? '~' : '-', colour: ICE, strength: 0.8 }

    // the rest: bands, lighter and darker blue by turns, streaked along their length
    const isBright = Math.sin(dy * 12 + rough(u * 2, dy * 5, 95) * 1.5) > 0
    return { glyph: rampAt(textured(lit, u * 5, dy * 17, 97), isBright ? ZONE_RAMP : BELT_RAMP), colour: shadeOf(lit, isBright ? NEPTUNE : NEPTUNE_DARK) }
  }))
}

/** How far the Moon swings from the centre of an Earth of radius 48, across and up-and-down, and how long one orbit takes. */
const MOON = { across: 104, deep: 24, seconds: 16 }

/**
 * The planets, from the Sun outward, each with its size, its drawing, and its own heading: whether it drifts to the
 * right or to the left, and how much it sinks (or, below 0, rises) for every unit it travels across.
 */
const PLANETS = [
  { name: 'mercury', radius: 30, draw: mercury, isRightward: true, sink: 0.02 },
  { name: 'venus', radius: 44, draw: venus, isRightward: false, sink: -0.015 },
  { name: 'earth', radius: 48, draw: earth, isRightward: true, sink: -0.02 },
  { name: 'mars', radius: 36, draw: mars, isRightward: false, sink: 0.02 },
  { name: 'jupiter', radius: 80, draw: jupiter, isRightward: true, sink: 0.01 },
  { name: 'saturn', radius: 60, draw: saturn, isRightward: false, sink: -0.01 },
  { name: 'uranus', radius: 54, draw: uranus, isRightward: true, sink: -0.02 },
  { name: 'neptune', radius: 52, draw: neptune, isRightward: false, sink: 0.015 },
] as const

export type PlanetName = (typeof PLANETS)[number]['name']
export const PLANET_NAMES: readonly PlanetName[] = PLANETS.map(planet => planet.name)
/** The two planets one conversation shows: the first wanders the upper part of the sky, the second the lower part. */
export type PlanetPair = readonly [PlanetName, PlanetName]

/**
 * The two planets for a conversation, picked by its id: the same id always gives the same two, and ids spread evenly
 * over every ordered pair of different planets, so each conversation gets its own sky without anything being stored.
 */
export function pairFor(conversation: string): PlanetPair {
  // FNV-1a over the id's characters
  let hash = 0x811c9dc5
  for (let at = 0; at < conversation.length; at += 1) {
    hash = Math.imul(hash ^ conversation.charCodeAt(at), 0x01000193) >>> 0
  }
  const count = PLANET_NAMES.length
  const first = hash % count
  // the second is one of the other seven
  const second = (first + 1 + (Math.floor(hash / count) % (count - 1))) % count
  return [PLANET_NAMES[first] ?? 'earth', PLANET_NAMES[second] ?? 'saturn']
}

/**
 * The part of the scene no planet may enter: where the app shows its boxes with a question and buttons, low in the
 * middle of the chat. With no blur, a planet behind such a box shows through its text.
 * Marked by the person on a screenshot of a 1920 by 1020 window. The app stretches the scene over the whole window
 * (there 1.2 times, cut top and bottom), so their box, 451 to 1400 across and 529 to 903 down, is this in the scene.
 */
export const KEEP_CLEAR = { left: 376, top: 516, right: 1167, bottom: 828 }

/**
 * Where a conversation's two planets rest: both above the part to keep clear, the first higher and the second lower,
 * far enough apart that the largest two never touch as they pass. A planet heading right starts toward the left and
 * one heading left starts toward the right, so each has most of the window ahead of it.
 */
const PLACES = [
  { y: 190, rightwardX: 420, leftwardX: 1000 },
  { y: 400, rightwardX: 560, leftwardX: 1140 },
] as const

/**
 * The drift: a planet takes two hours to cross the scene with its margins, about a quarter of a unit a second, too
 * slow to see move. Past one edge it comes back in at the other, on the same line.
 */
const DRIFT = { seconds: 7200, from: -240, to: 1840 }

type PlanetEntry = (typeof PLANETS)[number]

/**
 * Half of one bob, in seconds: a large body bobs more slowly than a small one. Slow on purpose: as a body
 * moves, its small characters shimmer each time they cross a pixel, and the slower it moves the calmer that is.
 */
function bobHalf(body: { radius: number }): number {
  return Number((9 + body.radius * 0.12).toFixed(1))
}

/**
 * One planet's drift as a style rule and its keyframes. The rule's own transform is the planet's resting place: it
 * stands where no animation runs. The animation starts part-way along, so the planet is at that place at the start.
 */
function driftStyle(planet: PlanetEntry, which: number): string {
  const place = PLACES[which] ?? PLACES[0]
  const startX = planet.isRightward ? place.rightwardX : place.leftwardX
  const entryX = planet.isRightward ? DRIFT.from : DRIFT.to
  const exitX = planet.isRightward ? DRIFT.to : DRIFT.from
  const span = DRIFT.to - DRIFT.from
  const travelled = Math.abs(startX - entryX)
  const entryY = place.y - planet.sink * travelled
  const exitY = entryY + planet.sink * span
  const delay = Math.round((DRIFT.seconds * travelled) / span)
  return `.w${which}{transform:translate(${startX}px,${place.y}px);animation:drift${which} ${DRIFT.seconds}s linear -${delay}s infinite}` +
    `@keyframes drift${which}{from{transform:translate(${entryX}px,${entryY.toFixed(1)}px)}to{transform:translate(${exitX}px,${exitY.toFixed(1)}px)}}`
}

/**
 * The line a planet drifts along in one of the two places, and how far its drawing reaches from its centre: down
 * (its radius and its bob) and across (its radius, or its rings, or its moon's orbit). For checking where it can get to.
 */
export function trackOf(name: PlanetName, which: number): { from: Point; to: Point; reachDown: number; reachAcross: number } {
  const planet = PLANETS.find(entry => entry.name === name) ?? PLANETS[0]
  const place = PLACES[which] ?? PLACES[0]
  const startX = planet.isRightward ? place.rightwardX : place.leftwardX
  const entryX = planet.isRightward ? DRIFT.from : DRIFT.to
  const exitX = planet.isRightward ? DRIFT.to : DRIFT.from
  const entryY = place.y - planet.sink * Math.abs(startX - entryX)
  const across = planet.name === 'saturn' ? planet.radius * 2.25 : planet.name === 'earth' ? MOON.across + 12 : planet.radius
  return {
    from: { x: entryX, y: entryY },
    to: { x: exitX, y: entryY + planet.sink * (DRIFT.to - DRIFT.from) },
    reachDown: planet.radius + 9,
    reachAcross: across + 9,
  }
}

/** How a planet idles, in words and numbers, for a label beside it. */
export function idleOf(name: PlanetName): { heading: string; bobSeconds: number } {
  const planet = PLANETS.find(entry => entry.name === name) ?? PLANETS[0]
  return {
    heading: `${planet.isRightward ? 'right' : 'left'} and slightly ${planet.sink > 0 ? 'down' : 'up'}`,
    bobSeconds: Number((bobHalf(planet) * 2).toFixed(1)),
  }
}

const SWING = 'cubic-bezier(.37,0,.63,1)'

const STYLE = `
.p text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:${FONT_SIZE}px;font-weight:700;white-space:pre}
.t1{opacity:.95;animation:dip 9s linear infinite}
.t2{opacity:.95;animation:dip 13s linear -4s infinite}
.t3{opacity:.95;animation:dip 17s linear -9s infinite}
.s1,.s2{opacity:0}
.bob{animation:bob 4s ease-in-out infinite alternate}
.sway{animation:sway 7s ease-in-out infinite alternate}
.mx{animation:moon-across ${MOON.seconds / 2}s ${SWING} infinite alternate}
.my{animation:moon-deep ${MOON.seconds / 2}s ${SWING} -${MOON.seconds / 4}s infinite alternate}
.mo{animation:moon-behind ${MOON.seconds}s linear infinite}
@keyframes dip{0%,86%{opacity:.95}93%{opacity:.2}100%{opacity:.95}}
@keyframes shoot{0%,92%{transform:translateX(0);opacity:0}93%{opacity:1}97%{opacity:1}99%,100%{transform:translateX(560px);opacity:0}}
@keyframes bob{from{transform:translateY(-9px)}to{transform:translateY(9px)}}
@keyframes sway{from{transform:rotate(-1.2deg)}to{transform:rotate(1.2deg)}}
@keyframes moon-across{from{transform:translateX(calc(-1 * var(--across)))}to{transform:translateX(var(--across))}}
@keyframes moon-deep{from{transform:translateY(calc(-1 * var(--deep)))}to{transform:translateY(var(--deep))}}
@keyframes moon-behind{0%,65.5%{opacity:1}66.5%,83.5%{opacity:0}84.5%,100%{opacity:1}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.mx{transform:translate(calc(var(--across) * .8),calc(var(--deep) * .66))}}`

const DEFS = `<linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="-150" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#f2efe8" stop-opacity="0"/><stop offset="1" stop-color="#f2efe8" stop-opacity=".95"/></linearGradient>`

/**
 * A planet idling round its own centre: it bobs up and down and tilts a little from side to side, the two out of
 * step, so it seems to float. `phase` (0 to 1) starts it part-way through, so two planets do not bob together.
 */
function idling(body: { radius: number }, drawing: string, phase: number): string {
  const half = bobHalf(body)
  const tilt = Number((half * 1.7).toFixed(1))
  return `<g class="bob" style="animation-duration:${half}s;animation-delay:-${(half * 2 * phase).toFixed(1)}s">` +
    `<g class="sway" style="animation-duration:${tilt}s;animation-delay:-${(tilt * 2 * phase).toFixed(1)}s">${drawing}</g></g>`
}

/** One of a conversation's two planets: the outer group carries its drift, the inner ones its idling. */
function planetGroup(planet: PlanetEntry, which: number): string {
  return `<g class="p w${which}" xml:space="preserve">${idling(planet, planet.draw(planet.radius), which * 0.4)}</g>`
}

/**
 * Quiet Sky: the stars, a conversation's two asteroids roaming, its two planets idling in front of them, and the
 * shooting stars. `rocks` are the asteroids, by their place in the list.
 */
export function quietSkySvg(pair: PlanetPair = ['earth', 'saturn'], rocks: readonly [number, number] = [0, 1]): string {
  const planets = pair.map(name => PLANETS.find(entry => entry.name === name) ?? PLANETS[0])
  const body =
    starfield(11, 300) +
    glints([[210, 150, 7], [1470, 620, 6], [1290, 760, 8], [150, 690, 6], [1500, 420, 5]]) +
    // the asteroids first, so a planet is drawn over one that passes it
    rocks.map((asteroidAt, which) => rockGroup(asteroidAt, which)).join('') +
    planets.map((planet, which) => planetGroup(planet, which)).join('') +
    shootingStar('s1', 620, 70, 22, 24, 0) +
    shootingStar('s2', 180, 380, 17, 37, 11)
  const drift = [...planets.map((planet, which) => driftStyle(planet, which)), roamStyle(0), roamStyle(1)].join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><style>${STYLE}
${drift}</style><defs>${DEFS}</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>
${body}
</svg>`
}

/**
 * One planet alone, idling in place without its drift (Earth's moon keeps its orbit), for judging it in a preview
 * or on a board. `scale` draws it at a multiple of the size the theme uses, with more characters, not larger ones;
 * `half` is half the width and height of the picture around the planet's centre.
 */
export function planetCloseUpSvg(name: PlanetName, scale = 1, half = { width: 190 * scale, height: 100 * scale }): string {
  const planet = PLANETS.find(entry => entry.name === name)
  if (planet === undefined) return ''
  const box = `${-half.width} ${-half.height} ${half.width * 2} ${half.height * 2}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"><style>${STYLE}</style><rect x="${-half.width}" y="${-half.height}" width="${half.width * 2}" height="${half.height * 2}" fill="${BACKGROUND}"/><g class="p" xml:space="preserve">${idling(planet, planet.draw(planet.radius * scale), 0)}</g></svg>`
}

// THE ASTEROIDS. Rocks on the planets' grid: a lumpy outline, light that falls on a rounded body and is broken into
// faces by the rock's roughness, and craters whose far wall catches the light while the near wall is in shadow.
// A conversation's sky shows two of them, roaming freely behind the planets.

type Asteroid = {
  title: string
  note: string
  radius: number
  seed: number
  /** How much longer the body is one way than the other, and the direction of its long axis, in radians. */
  stretch: number
  turn: number
  /** Two further bulges round the rim, three and five to a turn: each one's size, then where it starts. */
  lumps: readonly [number, number, number, number]
  shades: Shades
  dark: Shades
  /** Craters as [across, down, size], in radii from the centre. */
  craters: ReadonlyArray<readonly [number, number, number]>
  /** Parallel grooves across the body: how deep, or 0 for none. */
  grooves: number
}

const ASTEROIDS: readonly Asteroid[] = [
  { title: 'Asteroid 1', note: 'long, one great crater', radius: 40, seed: 201, stretch: 0.24, turn: 0.35, lumps: [0.07, 1.0, 0.04, 2.0], shades: ['#c8b9a3', '#94866f', '#5f5647'], dark: ['#a3957f', '#776b58', '#4c4439'], craters: [[-0.25, -0.18, 0.32], [0.34, 0.12, 0.15], [0.02, 0.44, 0.12], [-0.55, 0.2, 0.1]], grooves: 0 },
  { title: 'Asteroid 2', note: 'sharp and angular, dark', radius: 38, seed: 223, stretch: 0.3, turn: -0.5, lumps: [0.13, 0.3, 0.05, 1.1], shades: ['#a9a8a4', '#7b7a76', '#4f4e4b'], dark: ['#8a8985', '#64635f', '#41403d'], craters: [[0.2, -0.25, 0.2], [-0.35, 0.1, 0.16], [0.45, 0.25, 0.1]], grooves: 0 },
  { title: 'Asteroid 3', note: 'round rubble, many small pits', radius: 36, seed: 247, stretch: 0.08, turn: 1.1, lumps: [0.07, 0.4, 0.07, 1.2], shades: ['#c79c84', '#96705c', '#61483b'], dark: ['#a37f6b', '#7a5b4a', '#4f3b30'], craters: [[-0.3, -0.35, 0.13], [0.15, -0.1, 0.11], [-0.1, 0.3, 0.14], [0.42, 0.3, 0.1], [-0.5, 0.1, 0.09], [0.35, -0.4, 0.09]], grooves: 0 },
  { title: 'Asteroid 4', note: 'wedge with grooves, pale', radius: 40, seed: 269, stretch: 0.18, turn: 1.25, lumps: [0.16, 2.2, 0.05, 0.7], shades: ['#cfd0cc', '#9a9b97', '#646562'], dark: ['#adaeaa', '#7e7f7b', '#525350'], craters: [[-0.1, -0.4, 0.22], [0.3, 0.3, 0.13]], grooves: 0.14 },
]

function asteroid(entry: Asteroid, radius: number): string {
  const rimAt = (angle: number): number =>
    1 + entry.stretch * Math.cos(2 * (angle - entry.turn)) + entry.lumps[0] * Math.cos(3 * (angle - entry.lumps[1])) +
    entry.lumps[2] * Math.cos(5 * (angle - entry.lumps[3])) + 0.08 * (noise(Math.cos(angle) * 2 + 5, Math.sin(angle) * 2 + 5, entry.seed) - 0.5)
  const reliefAt = (dx: number, dy: number): number => {
    // the faces of the rock
    let relief = 0.55 * (rough(dx * 3.5 + 20, dy * 3.5 + 20, entry.seed + 1) - 0.5)
    if (entry.grooves > 0) relief += entry.grooves * Math.sin((dx * 0.8 + dy * 0.6) * 24)
    for (const [across, down, size] of entry.craters) {
      const x = (dx - across) / size
      const y = (dy - down) / size
      const reach = Math.hypot(x, y)
      if (reach >= 1.15) continue
      // the lip stands up; inside the bowl the wall away from the light is lit and the wall toward it is in shadow
      relief += reach > 0.85 ? 0.16 : -0.1 + 0.55 * (x * -LIGHT[0] + y * -LIGHT[1])
    }
    return relief
  }
  const marks = globe(radius, entry.seed, ({ dx, dy, u, v, lit }) => {
    // boulders: single bright marks
    if (noise(dx * 13 + 7, dy * 13 + 7, entry.seed + 2) > 0.9) return { glyph: lit > 0.5 ? '°' : 'o', colour: shadeOf(Math.min(1, lit + 0.25), entry.shades) }
    const isDark = rough(dx * 2.2 + 4, dy * 2.2 + 4, entry.seed + 3) < 0.44
    return { glyph: rampAt(textured(lit, u * 7 + entry.seed, v * 7, entry.seed + 4), ROCK_RAMP), colour: shadeOf(lit, isDark ? entry.dark : entry.shades) }
  }, { rimAt, reliefAt })
  // behind it, the body's own outline in the background colour, so stars do not show through its night side
  let outline = ''
  for (let step = 0; step < 48; step += 1) {
    const angle = (step / 48) * Math.PI * 2
    const reach = (radius - 2) * rimAt(angle)
    outline += `${step === 0 ? 'M' : 'L'}${(Math.cos(angle) * reach).toFixed(1)} ${(Math.sin(angle) * reach).toFixed(1)}`
  }
  return `<path d="${outline}Z" fill="${BACKGROUND}"/>${glyphs(marks)}`
}

/** How far an asteroid's drawing can reach from its centre: its radius with its longest bulge, and a little over. */
const ROCK_REACH = 62

/**
 * The two closed paths the asteroids roam, as points in the scene. Unlike the planets they go where they like: round
 * the upper sky, across the planets' bands (they pass behind a planet) and down both sides. They never enter the
 * part kept clear for the app's boxes, and they stay above the prompt at the bottom. Each leg eases in and out.
 */
const ROAMS = [
  { seconds: 420, delay: 0, points: [[160, 720], [200, 420], [420, 140], [820, 90], [1220, 170], [1400, 430], [1440, 730], [1300, 440], [900, 250], [300, 330]] },
  { seconds: 560, delay: 150, points: [[1440, 240], [1100, 110], [640, 160], [260, 110], [130, 400], [220, 760], [150, 500], [520, 380], [980, 330], [1320, 300]] },
] as const

/** One roaming path and how far an asteroid on it reaches from its centre, for checking where it can get to. */
export function roamOf(which: number): { points: ReadonlyArray<readonly [number, number]>; reach: number } {
  return { points: (ROAMS[which] ?? ROAMS[0]).points, reach: ROCK_REACH }
}

/** One asteroid's roaming as a style rule and its keyframes; the rule's own transform is where it stands with no motion. */
function roamStyle(which: number): string {
  const roam = ROAMS[which] ?? ROAMS[0]
  const stops = roam.points.map(([x, y], at) => {
    const percent = ((at / roam.points.length) * 100).toFixed(2)
    return `${at === 0 ? '0%,100%' : `${percent}%`}{transform:translate(${x}px,${y}px)}`
  }).join('')
  const [restX, restY] = roam.points[2]
  return `.a${which}{transform:translate(${restX}px,${restY}px);animation:roam${which} ${roam.seconds}s ease-in-out -${roam.delay}s infinite}@keyframes roam${which}{${stops}}`
}

/** How many asteroid drawings there are to pick from. */
export const ASTEROID_COUNT = ASTEROIDS.length

/**
 * The two asteroids for a conversation, picked by its id like its planets: the same id always gives the same two
 * different ones.
 */
export function rocksFor(conversation: string): readonly [number, number] {
  let hash = 0x811c9dc5
  for (let at = 0; at < conversation.length; at += 1) {
    hash = Math.imul(hash ^ conversation.charCodeAt(at), 0x01000193) >>> 0
  }
  // other bits of the id's hash than the planets use, so the two picks do not go together
  const first = (hash >>> 9) % ASTEROID_COUNT
  const second = (first + 1 + ((hash >>> 13) % (ASTEROID_COUNT - 1))) % ASTEROID_COUNT
  return [first, second]
}

/** One of a conversation's two asteroids, roaming its path. */
function rockGroup(asteroidAt: number, which: number): string {
  const entry = ASTEROIDS[asteroidAt]
  return entry === undefined ? '' : `<g class="p a${which}" xml:space="preserve">${asteroid(entry, entry.radius)}</g>`
}

/** A label for each asteroid: its name in bold and a few words on how it differs from the others. */
export const ASTEROID_LABELS: readonly string[] = ASTEROIDS.map(entry => `**${entry.title}**  ${entry.note}`)

/** One asteroid alone, idling in place, for a preview or a board; `scale` and `half` as for a planet. */
export function asteroidCloseUpSvg(which: number, scale = 1, half = { width: 190 * scale, height: 100 * scale }): string {
  const entry = ASTEROIDS[which]
  if (entry === undefined) return ''
  const box = `${-half.width} ${-half.height} ${half.width * 2} ${half.height * 2}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"><style>${STYLE}</style><rect x="${-half.width}" y="${-half.height}" width="${half.width * 2}" height="${half.height * 2}" fill="${BACKGROUND}"/><g class="p" xml:space="preserve">${idling(entry, asteroid(entry, entry.radius * scale), 0)}</g></svg>`
}
