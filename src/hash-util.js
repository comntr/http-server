function hex2bin(hs) {
  let a = new Uint8Array(hs.length / 2);
  for (let i = 0; i < a.length; i++) {
    let si = hs.slice(i * 2, i * 2 + 2);
    a[i] = parseInt(si, 16);
  }
  return a;
}

function hd2s(x) {
  return (0x100 + x).toString(16).slice(1);
}

function bin2hex(a) {
  return [...a].map(hd2s).join('');
}

function xorall(list) {
  if (list.length < 1) return null;
  let a = list[0].map(x => x);
  for (let i = 1; i < list.length; i++)
    for (let j = 0; j < a.length; j++)
      a[j] ^= list[i][j];
  return a;
}

module.exports = {
  xorall,
  bin2hex,
  hex2bin,
};
