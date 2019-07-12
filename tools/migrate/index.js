const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const mkdirp = require('mkdirp');

const THASH_PATTERN = /^[\da-f]{40}$/;
const TDIR_PARTS = [3, 3];

let basedir = process.argv[2];

log('basedir:', basedir);

for (let thash of fs.readdirSync(basedir)) {
  if (!THASH_PATTERN.test(thash))
    continue;
  log(thash);
  let srcDir = path.join(basedir, thash);
  let newDir = makeNewDirPath(thash);
  mkdirp.sync(newDir);
  cp.execSync('cp -r ' + srcDir + ' ' + newDir);
  cmpDirs(srcDir, newDir);
  cp.execSync('rm -rf ' + srcDir);
}

function cmpDirs(dir1, dir2) {
  let list1 = fs.readdirSync(dir1);
  let list2 = fs.readdirSync(dir1);
  let same = JSON.stringify(list1) == JSON.stringify(list2);
  if (!same) throw new Error(dir1 + ' != ' + dir2);
}

function makeNewDirPath(thash) {
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

