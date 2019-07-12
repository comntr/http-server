const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const mkdirp = require('mkdirp');

const THASH_PATTERN = /^[\da-f]{40}$/;
const TDIR_PARTS = [3, 3];
const TH3_PATERN = /^[\da-f]{3}$/;
const TH34_PATERN = /^[\da-f]{34}$/;

let confSrcDir = process.argv[2];
let confResDir = process.argv[3];

log('srcdir:', confSrcDir);
log('resdir:', confResDir);

if (!confSrcDir || !confResDir)
  process.exit(1);

if (!fs.existsSync(confSrcDir)) {
  log('srcdir doesnt exist');
  process.exit(1);
}

if (fs.existsSync(confResDir)) {
  log('resdir already exists');
  process.exit(1);
}

log('/40 -> /3/3/34');

for (let thash of fs.readdirSync(confSrcDir)) {
  if (!THASH_PATTERN.test(thash))
    continue;
  log(thash);
  let srcDir = path.join(confSrcDir, thash);
  let newDir = makeNewDirPath(confResDir, thash);
  mkdirp.sync(newDir);
  exec('cp -r ' + srcDir + '/* ' + newDir);
  cmpDirs(srcDir, newDir);
}

log('/3/3/34/40 -> /3/3/34');

for (let [th1, dh1] of subdirs(confSrcDir, TH3_PATERN)) {
  for (let [th2, dh2] of subdirs(dh1, TH3_PATERN)) {
    for (let [th3, dh3] of subdirs(dh2, TH34_PATERN)) {
      let thash = th1 + th2 + th3;
      let srcdir = path.join(dh3, thash);
      let resdir = path.join(confResDir, th1, th2, th3);
      if (!fs.existsSync(srcdir))
        throw new Error('Not found: ' + srcdir);
      exec(`mkdir -p ${resdir}`);
      exec(`cp -r ${srcdir}/. ${resdir}/`);
    }
  }
}

function exec(cmdline) {
  log(cmdline.replace(
    /[\da-f]{7,}/g,
    s => s.slice(0, 3) + '...' + s.slice(-3)));
  cp.execSync(cmdline);
}

function subdirs(basedir, pattern) {
  return fs.readdirSync(basedir)
    .filter(name => pattern.test(name))
    .map(name => [name, path.join(basedir, name)]);
}

function cmpDirs(dir1, dir2) {
  let list1 = fs.readdirSync(dir1);
  let list2 = fs.readdirSync(dir1);
  let same = JSON.stringify(list1) == JSON.stringify(list2);
  if (!same) throw new Error(dir1 + ' != ' + dir2);
}

function makeNewDirPath(basedir, thash) {
  let parts = [], ibase = 0;
  for (let n of TDIR_PARTS) {
    let part = thash.slice(ibase, ibase + n);
    parts.push(part);
    ibase += n;
  }
  parts.push(thash.slice(ibase));
  return path.join(basedir, ...parts);
}

function log(...args) {
  console.log(...args);
}

