const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const DIRNAME_PATTERN = /^[0-9a-f]+$/;

let argSrcDir = process.argv[2];
let argResDir = process.argv[3];
let argSrcShape = process.argv[4];
let argResShape = process.argv[5];

log('srcdir:', argSrcDir);
log('resdir:', argResDir);

if (!argSrcDir || !fs.existsSync(argSrcDir)) {
  log('srcdir doesnt exist');
  process.exit(1);
}

if (argResDir && fs.existsSync(argResDir)) {
  log('resdir already exists');
  process.exit(1);
}

if (!argResDir) {
  log('Getting the shape of', argSrcDir);
  let shapes = getDirShapes(argSrcDir);
  for (let shape of shapes)
    log('Shape:', JSON.stringify(shape));
} else {
  log('Reshaping', argSrcDir, 'into', argResDir);
  if (!argSrcShape || !argResShape) {
    log('must specify src and res shapes');
    process.exit(1);
  }
  reshapeDir(
    argSrcDir,
    argResDir,
    JSON.parse(argSrcShape),
    JSON.parse(argResShape));
  log('Reshaped.');
}

function doSmth() {
  log('/40 -> /3/3/34');

  for (let thash of fs.readdirSync(argSrcDir)) {
    if (!THASH_PATTERN.test(thash))
      continue;
    log(thash);
    let srcDir = path.join(argSrcDir, thash);
    let newDir = makeNewDirPath(argResDir, thash);
    exec('mkdir -p ' + newDir);
    exec('cp -r ' + srcDir + '/* ' + newDir);
    cmpdirs(srcDir, newDir);
  }

  log('/3/3/34/40 -> /3/3/34');

  for (let [th1, dh1] of subdirs(argSrcDir, TH3_PATERN)) {
    for (let [th2, dh2] of subdirs(dh1, TH3_PATERN)) {
      for (let [th3, dh3] of subdirs(dh2, TH34_PATERN)) {
        let thash = th1 + th2 + th3;
        let srcdir = path.join(dh3, thash);
        let resdir = path.join(argResDir, th1, th2, th3);
        if (!fs.existsSync(srcdir))
          throw new Error('Not found: ' + srcdir);
        exec(`mkdir -p ${resdir}`);
        exec(`cp -r ${srcdir}/. ${resdir}/`);
      }
    }
  }
}

function reshapeDir(srcdir, resdir, srcShape, resShape) {
  if (sum(srcShape) != sum(resShape))
    throw new Error('src and res shapes are not consistent');
  let sshape = srcShape.join(',');

  for (let srcSubPath of getSubDirsDeep(srcdir)) {
    let dshape = srcSubPath.split('/')
      .map(s => s.length).join(',');

    if (sshape != dshape) {
      log('skipped:', srcSubPath);
      continue;
    }

    let srcpath = path.join(srcdir, srcSubPath);
    let respath = makeNewDirPath(
      resdir,
      srcSubPath.split('/').join(''),
      resShape);

    exec(`mkdir -p ${respath}`);
    exec(`cp -r ${srcpath}/. ${respath}/`);
    cmpdirs(srcpath, respath);
  }
}

function sum(a) {
  let s = a[0];
  for (let i = 1; i < a.length; i++)
    s += a[i];
  return s;
}

function* getSubDirsDeep(basedir, subpath = []) {
  let sdirs = subdirs(basedir);
  if (!sdirs.length)
    yield subpath.join('/');
  for (let [dirname, dirpath] of sdirs) {
    subpath.push(dirname);
    yield* getSubDirsDeep(dirpath, subpath);
    subpath.pop();
  }
}

function getDirShapes(basedir) {
  let shapes = {};
  for (let subpath of getSubDirsDeep(basedir)) {
    let dirnames = subpath.split('/');
    let shape = dirnames.map(s => s.length).join(',');
    shapes[shape] = true;
  }
  return Object.keys(shapes).sort()
    .map(s => JSON.parse('[' + s + ']'));
}

function exec(cmdline) {
  log(cmdline.replace(
    /[\da-f]{7,}/g,
    s => s.slice(0, 3) + '...' + s.slice(-3)));
  cp.execSync(cmdline);
}

function subdirs(basedir, pattern = DIRNAME_PATTERN) {
  return fs.readdirSync(basedir)
    .filter(name => !pattern || pattern.test(name))
    .map(name => [name, path.join(basedir, name)])
    .filter(([name, path]) => isdir(path));
}

function isdir(path) {
  return fs.lstatSync(path).isDirectory();
}

function cmpdirs(dir1, dir2) {
  let list1 = fs.readdirSync(dir1);
  let list2 = fs.readdirSync(dir1);
  let same = JSON.stringify(list1) == JSON.stringify(list2);
  if (!same) throw new Error(dir1 + ' != ' + dir2);
}

function makeNewDirPath(basedir, thash, shape) {
  let parts = [], ibase = 0;
  for (let n of shape) {
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
