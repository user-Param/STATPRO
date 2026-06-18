const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:9000');

ws.on('open', async function open() {
  console.log('Connected to Datafeed Server');
  
  // Identify as adapter
  ws.send(JSON.stringify({ type: 'adapter' }));
  console.log('Identified as adapter');

  // 1. Warm up window (42 ticks)
  console.log('Warming up lookback window...');
  for (let i = 0; i < 42; i++) {
    const adaPrice = 0.50 + Math.random() * 0.01;
    const dotPrice = 7.00 + Math.random() * 0.1;

    ws.send(JSON.stringify({
      topic: 'ticker_ADA',
      symbol: 'ADA',
      price: adaPrice,
      bid: adaPrice - 0.01,
      ask: adaPrice + 0.01,
      timestamp: Date.now()
    }));

    ws.send(JSON.stringify({
      topic: 'ticker_DOT',
      symbol: 'DOT',
      price: dotPrice,
      bid: dotPrice - 0.01,
      ask: dotPrice + 0.01,
      timestamp: Date.now()
    }));
    await new Promise(r => setTimeout(r, 10));
  }

  console.log('Window populated. Waiting 1s...');
  await new Promise(r => setTimeout(r, 1000));

  // 2. Trigger Signal
  console.log('Triggering LONG SPREAD signal (ADA crash)...');
  ws.send(JSON.stringify({
    topic: 'ticker_ADA',
    symbol: 'ADA',
    price: 0.10,
    bid: 0.09,
    ask: 0.11,
    timestamp: Date.now()
  }));

  ws.send(JSON.stringify({
    topic: 'ticker_DOT',
    symbol: 'DOT',
    price: 7.0,
    bid: 6.9,
    ask: 7.1,
    timestamp: Date.now()
  }));

  console.log('Signal ticks sent. Waiting 5s...');
  await new Promise(r => setTimeout(r, 5000));

  // 3. Recovery
  console.log('Triggering Mean Reversion (ADA recovery)...');
  ws.send(JSON.stringify({
    topic: 'ticker_ADA',
    symbol: 'ADA',
    price: 0.50,
    bid: 0.49,
    ask: 0.51,
    timestamp: Date.now()
  }));
  
  await new Promise(r => setTimeout(r, 2000));
  console.log('Test completed.');
  process.exit(0);
});

ws.on('error', function error(err) {
  console.error('WebSocket Error:', err);
});
