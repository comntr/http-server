const fs = require('fs');

let temp = '';

process.stdin.on('data', data => {
  temp += data.toString('utf8');
  parseLines();
});

process.stdin.on('end', () => {
  temp += '\n';
  parseLines();
});

function parseLines() {
  let lines = temp.split('\n');
  if (lines.length < 2) return;
  temp = lines[lines.length - 1];
  for (let filepath of lines)
    if (!filepath.endsWith('/.rules'))
      parseFile(filepath);
}

function parseFile(filepath) {
  try {
    let text = fs.readFileSync(filepath, 'utf8');
    let uname = /^User: (.+)$/gm.exec(text);
    let thash = /^Parent: (.+)$/gm.exec(text);
    let cdate = /^Date: (.+)$/gm.exec(text);
    let ctext = /\n\n([^\x00]+)/gm.exec(text);
    console.log(
      cdate && cdate[1],
      thash && thash[1],
      uname && uname[1],
      ctext && JSON.stringify(ctext[1]),
      filepath);
  } catch (err) {
    console.error(filepath, err.message);
  }
}

