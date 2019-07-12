const fs = require('fs');
const cp = require('child_process');
const path = require('path');

let included = process.argv[2] || '';
let basedir = __dirname;
let excluded = /^index\.js$/;

start();

async function start() {
  log('Filtering tests with:', included);
  log('Looking for tests in:', basedir);

  let jsnames = fs.readdirSync(basedir);

  try {
    for (let jsname of jsnames) {
      log('?', jsname);
      if (excluded.test(jsname))
        continue;
      if (included && jsname.indexOf(included) < 0)
        continue;
      let jspath = path.join(basedir, jsname);
      await exec(jspath);
    }

    log('Looks like all tests passed.');
  } catch (err) {
    log(err);
    process.exit(1);
  }
}

function log(...args) {
  console.log('[::]', ...args);
}

function logcp(data) {
  let text = (data + '').trimRight();
  log(text);
}

function exec(jspath) {
  return new Promise((resolve, reject) => {
    log('node', jspath);
    let p = cp.spawn('node', [jspath]);

    p.stdout.on('data', logcp);
    p.stderr.on('data', logcp);
    p.on('close', code => {
      if (!code) resolve();
      let message = jspath + ': exit code ' + code;
      log(message);
      reject(new Error(message));
    });
  });
}
