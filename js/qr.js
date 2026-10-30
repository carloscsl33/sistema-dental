const QR_ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
function qrGfMul(a, b) {
  let result = 0;
  while (b) {
    if (b & 1) result ^= a;
    a = (a << 1) ^ (a & 128 ? 0x11d : 0);
    b >>= 1;
  }
  return result;
}
function qrPow(n) {
  let value = 1;
  for (let i = 0; i < n; i++) value = qrGfMul(value, 2);
  return value;
}
function qrRs(data) {
  let generator = [1];
  for (let i = 0; i < 7; i++) {
    const next = Array(generator.length + 1).fill(0);
    generator.forEach((v, j) => {
      next[j] ^= v;
      next[j + 1] ^= qrGfMul(v, qrPow(i));
    });
    generator = next;
  }
  const rem = Array(7).fill(0);
  data.forEach((value) => {
    const factor = value ^ rem.shift();
    rem.push(0);
    for (let j = 0; j < 7; j++) rem[j] ^= qrGfMul(generator[j + 1], factor);
  });
  return rem;
}
function qrBits(text) {
  const bits = [0, 0, 1, 0];
  const add = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  add(text.length, 9);
  for (let i = 0; i + 1 < text.length; i += 2)
    add(QR_ALPHA.indexOf(text[i]) * 45 + QR_ALPHA.indexOf(text[i + 1]), 11);
  if (text.length % 2) add(QR_ALPHA.indexOf(text.at(-1)), 6);
  for (let i = 0; i < 4 && bits.length < 152; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8)
    bytes.push(bits.slice(i, i + 8).reduce((n, bit) => (n << 1) | bit, 0));
  for (let i = 0; bytes.length < 19; i++) bytes.push(i % 2 ? 0x11 : 0xec);
  return bytes
    .concat(qrRs(bytes))
    .flatMap((value) =>
      Array.from({ length: 8 }, (_, i) => (value >> (7 - i)) & 1),
    );
}
function qrBch(value) {
  let d = value << 10;
  while (d.toString(2).length >= 11) d ^= 0x537 << (d.toString(2).length - 11);
  return ((value << 10) | d) ^ 0x5412;
}
function qrMask(mask, r, c) {
  return [
    (r + c) % 2 === 0,
    r % 2 === 0,
    c % 3 === 0,
    (r + c) % 3 === 0,
    (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    ((r * c) % 2) + ((r * c) % 3) === 0,
    (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (((r * c) % 3) + ((r + c) % 2)) % 2 === 0,
  ][mask];
}
function qrBase() {
  const m = Array.from({ length: 21 }, () => Array(21).fill(null));
  const finder = (r, c) => {
    for (let y = -1; y <= 7; y++)
      for (let x = -1; x <= 7; x++)
        if (r + y >= 0 && r + y < 21 && c + x >= 0 && c + x < 21)
          m[r + y][c + x] =
            y >= 0 &&
            y <= 6 &&
            x >= 0 &&
            x <= 6 &&
            (y === 0 ||
              y === 6 ||
              x === 0 ||
              x === 6 ||
              (y >= 2 && y <= 4 && x >= 2 && x <= 4));
  };
  finder(0, 0);
  finder(0, 14);
  finder(14, 0);
  for (let i = 8; i < 13; i++) {
    m[6][i] = i % 2 === 0;
    m[i][6] = i % 2 === 0;
  }
  m[13][8] = true;
  return m;
}
function qrPlace(matrix, data, mask) {
  let bit = 0,
    upward = true;
  for (let col = 20; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let n = 0; n < 21; n++) {
      const row = upward ? 20 - n : n;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (matrix[row][c] === null)
          matrix[row][c] = (data[bit++] || 0) ^ (qrMask(mask, row, c) ? 1 : 0);
      }
    }
    upward = !upward;
  }
  const fmt = qrBch((1 << 3) | mask);
  for (let i = 0; i < 15; i++) {
    const v = (fmt >> i) & 1;
    if (i < 6) matrix[i][8] = v;
    else if (i < 8) matrix[i + 1][8] = v;
    else matrix[20 - i][8] = v;
    if (i < 8) matrix[8][20 - i] = v;
    else if (i < 9) matrix[8][15 - i] = v;
    else matrix[8][14 - i] = v;
  }
  return matrix;
}
function qrPenalty(m) {
  let p = 0;
  for (let r = 0; r < 21; r++)
    for (let c = 0; c < 21; c++) {
      let same = 0;
      for (let y = -1; y <= 1; y++)
        for (let x = -1; x <= 1; x++)
          if (y || x) if (m[r + y]?.[c + x] === m[r][c]) same++;
      if (same > 5) p += 3 + same - 5;
    }
  for (let r = 0; r < 21; r++)
    for (let c = 0; c < 19; c++)
      if (
        [0, 1, 2, 3, 4, 5, 6].every(
          (i) => m[r][c + i] === [1, 0, 1, 1, 1, 0, 1][i],
        )
      )
        p += 40;
  return p;
}
function renderPatientQrSvg(token, size = 260) {
  if (!/^TD-[A-Z0-9]{8}$/.test(token)) throw new Error("Código QR inválido.");
  const data = qrBits(token);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const matrix = qrPlace(qrBase(), data, mask);
    const score = qrPenalty(matrix);
    if (!best || score < best.score) best = { matrix, score };
  }
  const quiet = 4,
    cells = 29,
    rects = [];
  best.matrix.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on)
        rects.push(
          `<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`,
        );
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cells} ${cells}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="Código QR de paciente"><rect width="${cells}" height="${cells}" fill="#fff"/><g fill="#122039">${rects.join("")}</g></svg>`;
}
