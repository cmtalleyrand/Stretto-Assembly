import { shouldYieldToEventLoop } from './strettoGenerator';

if (shouldYieldToEventLoop(0)) {
  throw new Error('Yield must not trigger at iteration 0.');
}

if (shouldYieldToEventLoop(1024, 2048)) {
  throw new Error('Yield must not trigger before reaching the configured interval.');
}

if (!shouldYieldToEventLoop(2048, 2048)) {
  throw new Error('Yield must trigger exactly at the configured interval boundary.');
}

if (!shouldYieldToEventLoop(4096, 2048)) {
  throw new Error('Yield must trigger on integer multiples of the interval.');
}

console.log('strettoEventLoopYieldTest passed');
