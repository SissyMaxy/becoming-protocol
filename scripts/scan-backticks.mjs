import fs from 'fs';
const s = fs.readFileSync('api/handler/chat.ts', 'utf8');
const lines = s.split('\n');
const BACKSLASH = String.fromCharCode(92);
const BACKTICK = String.fromCharCode(96);
const issues = [];
for (let i = 3817; i < 4582; i++) {
  const line = lines[i];
  if (!line) continue;
  for (let j = 0; j < line.length; j++) {
    if (line[j] === BACKTICK) {
      const prev = j > 0 ? line[j - 1] : '';
      if (prev !== BACKSLASH) issues.push({ line: i + 1, col: j, pre: line.slice(Math.max(0, j - 4), j), post: line.slice(j + 1, j + 5) });
    }
  }
}
console.log('unescaped backticks in buildConversationalPrompt body:', issues.length);
for (const x of issues) console.log(x);
