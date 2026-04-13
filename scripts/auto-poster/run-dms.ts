import { readAllDMs } from './dm-reader';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
readAllDMs(anthropic).then(r => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
