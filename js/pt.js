// A small path tracer for a Cornell box with one square ceiling light.
// Three estimators of the same image:
//   BRUTE: bounce randomly, count light only when a bounce happens to hit it.
//   NEE:   at every bounce, also aim one shadow ray at a random point on the light.
//   MIS:   do both and blend them with Veach's power heuristic.
// All three are unbiased for the same (depth-limited) image, so they must
// agree on average; they differ only in noise. Runs in the browser and in node.
(function (root) {
  "use strict";

  const BRUTE = 0, NEE = 1, MIS = 2;
  const EPS = 1e-4;
  const INV_PI = 1 / Math.PI;

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Object ids: 0..4 walls, 5 diffuse sphere, 6 glossy sphere, 7 light.
  const LIGHT = 7, GLOSSY = 6;
  const WHITE = [0.725, 0.71, 0.68], RED = [0.63, 0.065, 0.05], GREEN = [0.14, 0.45, 0.091];

  // light: half-width of the square light (box is 2 wide). power: kept fixed
  // as the light shrinks, so the room stays equally bright. gloss: Phong exponent.
  function scene(opts) {
    const s = opts.light, gloss = opts.gloss;
    const area = 4 * s * s;
    const le = (opts.power || 3) / area;
    return {
      s, area, le, ly: 2 - 1e-3, gloss, maxBounces: opts.bounces || 5,
      showLight: opts.showLight !== false, // false: camera rays that hit the light return 0
      // walls: axis, position, normal sign, colour
      walls: [
        [1, 0, 1, WHITE], [1, 2, -1, WHITE], [2, -1, 1, WHITE],
        [0, -1, 1, RED], [0, 1, -1, GREEN],
      ],
      spheres: [
        [-0.42, 0.45, -0.35, 0.45, [0.75, 0.75, 0.75]],
        [0.45, 0.4, 0.35, 0.4, [0.9, 0.9, 0.9]],
      ],
      cam: [0, 1, 3.6], fov: 0.4,
    };
  }

  // Nearest hit along o + t d for t in (EPS, tmax). Returns id or -1; t in hitT.
  let hitT = 0;
  function intersect(sc, ox, oy, oz, dx, dy, dz, tmax) {
    let best = -1, bt = tmax;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    for (let i = 0; i < 5; i++) {
      const w = sc.walls[i], a = w[0];
      if (d[a] === 0) continue;
      const t = (w[1] - o[a]) / d[a];
      if (t <= EPS || t >= bt) continue;
      const b = (a + 1) % 3, c = (a + 2) % 3;
      const pb = o[b] + d[b] * t, pc = o[c] + d[c] * t;
      if (pb < (b === 1 ? 0 : -1) || pb > (b === 1 ? 2 : 1)) continue;
      if (pc < (c === 1 ? 0 : -1) || pc > (c === 1 ? 2 : 1)) continue;
      best = i; bt = t;
    }
    for (let i = 0; i < 2; i++) {
      const sp = sc.spheres[i];
      const lx = ox - sp[0], ly = oy - sp[1], lz = oz - sp[2];
      const b = lx * dx + ly * dy + lz * dz;
      const c = lx * lx + ly * ly + lz * lz - sp[3] * sp[3];
      const disc = b * b - c;
      if (disc < 0) continue;
      const q = Math.sqrt(disc);
      let t = -b - q;
      if (t <= EPS) t = -b + q;
      if (t <= EPS || t >= bt) continue;
      best = 5 + i; bt = t;
    }
    if (dy > 0) { // the light faces down, so only upward rays can hit it
      const t = (sc.ly - oy) / dy;
      if (t > EPS && t < bt) {
        const px = ox + dx * t, pz = oz + dz * t;
        if (Math.abs(px) <= sc.s && Math.abs(pz) <= sc.s) { best = LIGHT; bt = t; }
      }
    }
    hitT = bt;
    return best;
  }

  // Probability density (per solid angle) that the surface's own sampling
  // picks direction (wx,wy,wz). Needed for MIS weights.
  function bsdfPdf(sc, id, nx, ny, nz, rx, ry, rz, wx, wy, wz) {
    if (id !== GLOSSY) {
      const c = nx * wx + ny * wy + nz * wz;
      return c > 0 ? c * INV_PI : 0;
    }
    const ca = rx * wx + ry * wy + rz * wz;
    return ca > 0 ? (sc.gloss + 1) / (2 * Math.PI) * Math.pow(ca, sc.gloss) : 0;
  }

  // Trace one camera ray. Writes RGB radiance into out[0..2].
  function radiance(sc, mode, ox, oy, oz, dx, dy, dz, rand, out) {
    let tr = 1, tg = 1, tb = 1, lr = 0, lg = 0, lb = 0;
    let prevPdf = 0;
    const le = sc.le;
    for (let depth = 1; ; depth++) {
      const id = intersect(sc, ox, oy, oz, dx, dy, dz, Infinity);
      if (id < 0) break;
      const t = hitT;
      if (id === LIGHT) {
        let w = sc.showLight ? 1 : 0;
        if (depth > 1) {
          w = 1;
          if (mode === NEE) w = 0;
          else if (mode === MIS) {
            const lp = (t * t) / (sc.area * dy);
            w = (prevPdf * prevPdf) / (prevPdf * prevPdf + lp * lp);
          }
        }
        lr += tr * le * w; lg += tg * le * w; lb += tb * le * w;
        break;
      }
      if (depth > sc.maxBounces) break;
      const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
      let nx, ny, nz, alb;
      if (id < 5) {
        const w = sc.walls[id];
        nx = ny = nz = 0;
        if (w[0] === 0) nx = w[2]; else if (w[0] === 1) ny = w[2]; else nz = w[2];
        alb = w[3];
      } else {
        const sp = sc.spheres[id - 5];
        nx = (px - sp[0]) / sp[3]; ny = (py - sp[1]) / sp[3]; nz = (pz - sp[2]) / sp[3];
        alb = sp[4];
      }
      // mirror direction of the incoming ray (used by the glossy lobe)
      const dn = dx * nx + dy * ny + dz * nz;
      const rx = dx - 2 * dn * nx, ry = dy - 2 * dn * ny, rz = dz - 2 * dn * nz;
      const qx = px + nx * EPS, qy = py + ny * EPS, qz = pz + nz * EPS;

      // Light sampling: one shadow ray to a uniform point on the light.
      if (mode !== BRUTE) {
        const sx = (2 * rand() - 1) * sc.s, sz = (2 * rand() - 1) * sc.s;
        let wx = sx - qx, wy = sc.ly - qy, wz = sz - qz;
        const d2 = wx * wx + wy * wy + wz * wz, dist = Math.sqrt(d2);
        wx /= dist; wy /= dist; wz /= dist;
        const cosS = nx * wx + ny * wy + nz * wz, cosL = wy;
        if (cosS > 0 && cosL > 0 && intersect(sc, qx, qy, qz, wx, wy, wz, dist - 2 * EPS) < 0) {
          let f;
          if (id === GLOSSY) {
            const ca = rx * wx + ry * wy + rz * wz;
            f = ca > 0 ? (sc.gloss + 2) / (2 * Math.PI) * Math.pow(ca, sc.gloss) : 0;
          } else f = INV_PI;
          if (f > 0) {
            const lp = d2 / (sc.area * cosL);
            let w = 1;
            if (mode === MIS) {
              const bp = bsdfPdf(sc, id, nx, ny, nz, rx, ry, rz, wx, wy, wz);
              w = (lp * lp) / (lp * lp + bp * bp);
            }
            const k = (f * cosS * le * w) / lp;
            lr += tr * alb[0] * k; lg += tg * alb[1] * k; lb += tb * alb[2] * k;
          }
        }
      }

      // Bounce: sample the surface's own distribution.
      let ax, ay, az; // axis to sample around
      if (id === GLOSSY) { ax = rx; ay = ry; az = rz; } else { ax = nx; ay = ny; az = nz; }
      const sg = az >= 0 ? 1 : -1, a = -1 / (sg + az), b = ax * ay * a;
      const t1x = 1 + sg * ax * ax * a, t1y = sg * b, t1z = -sg * ax;
      const t2x = b, t2y = sg + ay * ay * a, t2z = -ay;
      const u1 = rand(), phi = 2 * Math.PI * rand();
      let ct, st;
      if (id === GLOSSY) { ct = Math.pow(u1, 1 / (sc.gloss + 1)); st = Math.sqrt(Math.max(0, 1 - ct * ct)); }
      else { st = Math.sqrt(u1); ct = Math.sqrt(1 - u1); }
      const cp = Math.cos(phi) * st, spn = Math.sin(phi) * st;
      dx = t1x * cp + t2x * spn + ax * ct;
      dy = t1y * cp + t2y * spn + ay * ct;
      dz = t1z * cp + t2z * spn + az * ct;
      const cosN = dx * nx + dy * ny + dz * nz;
      if (cosN <= 0) break; // glossy lobe dipped below the surface: no light that way
      if (id === GLOSSY) {
        const k = ((sc.gloss + 2) / (sc.gloss + 1)) * cosN;
        tr *= alb[0] * k; tg *= alb[1] * k; tb *= alb[2] * k;
        prevPdf = (sc.gloss + 1) / (2 * Math.PI) * Math.pow(ct, sc.gloss);
      } else {
        tr *= alb[0]; tg *= alb[1]; tb *= alb[2];
        prevPdf = cosN * INV_PI;
      }
      ox = qx; oy = qy; oz = qz;
    }
    out[0] = lr; out[1] = lg; out[2] = lb;
  }

  // Accumulator for a W x H image: running RGB sums plus luminance sum and
  // sum of squares per pixel, so per-pixel variance needs no reference image.
  function film(W, H) {
    return { W, H, n: 0, rgb: new Float64Array(W * H * 3), y: new Float64Array(W * H), yy: new Float64Array(W * H) };
  }

  function cameraRay(sc, W, H, x, y, rand, d) {
    const u = ((x + rand()) / W * 2 - 1) * sc.fov;
    const v = (1 - (y + rand()) / H * 2) * sc.fov;
    const inv = 1 / Math.sqrt(u * u + v * v + 1);
    d[0] = u * inv; d[1] = v * inv; d[2] = -inv;
  }

  // Add one sample to every pixel in rows [y0, y1).
  function pass(sc, mode, fm, rand, y0 = 0, y1 = fm.H) {
    const out = [0, 0, 0], d = [0, 0, 0], c = sc.cam;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < fm.W; x++) {
        cameraRay(sc, fm.W, fm.H, x, y, rand, d);
        radiance(sc, mode, c[0], c[1], c[2], d[0], d[1], d[2], rand, out);
        const i = y * fm.W + x;
        fm.rgb[3 * i] += out[0]; fm.rgb[3 * i + 1] += out[1]; fm.rgb[3 * i + 2] += out[2];
        const L = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
        fm.y[i] += L; fm.yy[i] += L * L;
      }
    }
    if (y1 === fm.H) fm.n++;
  }

  // What the centre of each pixel sees first: lets stats be split by object.
  // Pixels that partly see the light itself get LIGHT, so they can be left out
  // (their noise comes from the pixel edge, not from any lighting estimator).
  function idMap(sc, W, H) {
    const m = new Int8Array(W * H), d = [0, 0, 0], c = sc.cam;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let id = -1;
        for (let k = 0; k < 9; k++) {
          const off = [(k % 3) * 0.5, ((k / 3) | 0) * 0.5];
          let j = 0;
          cameraRay(sc, W, H, x, y, () => off[j++], d);
          const h = intersect(sc, c[0], c[1], c[2], d[0], d[1], d[2], Infinity);
          if (k === 4) id = h;
          if (h === LIGHT) { id = LIGHT; break; }
        }
        m[y * W + x] = id;
      }
    return m;
  }

  // Mean single-sample luminance variance over the pixels where pick(id) holds.
  function variance(fm, ids, pick) {
    let sum = 0, cnt = 0, mean = 0;
    const n = fm.n;
    for (let i = 0; i < fm.y.length; i++) {
      if (ids && !pick(ids[i])) continue;
      const m = fm.y[i] / n;
      sum += (fm.yy[i] / n - m * m) * n / (n - 1);
      mean += m;
      cnt++;
    }
    return { v: sum / cnt, mean: mean / cnt, pixels: cnt };
  }

  const api = { BRUTE, NEE, MIS, LIGHT, GLOSSY, rng, scene, intersect, lastT: () => hitT, radiance, film, pass, idMap, variance };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KitPT = api;
})(this);
