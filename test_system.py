import asyncio
import websockets
import json
import time
import random

async def simulate_statarb():
    uri = "ws://localhost:9000"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to Datafeed Server")
            
            # Identify as adapter to enable broadcasting
            await websocket.send(json.dumps({"type": "adapter"}))
            print("Identified as adapter")
            
            # 1. Warm up the 40-period window
            print("Warming up lookback window (42 ticks to be safe)...")
            for i in range(42):
                ada_price = 0.50 + (random.random() * 0.01)
                dot_price = 7.00 + (random.random() * 0.1)
                
                # Send ADA tick
                await websocket.send(json.dumps({
                    "topic": "ticker_ADA",
                    "symbol": "ADA",
                    "price": ada_price,
                    "bid": ada_price - 0.01,
                    "ask": ada_price + 0.01,
                    "timestamp": int(time.time() * 1000)
                }))
                
                # Send DOT tick
                await websocket.send(json.dumps({
                    "topic": "ticker_DOT",
                    "symbol": "DOT",
                    "price": dot_price,
                    "bid": dot_price - 0.01,
                    "ask": dot_price + 0.01,
                    "timestamp": int(time.time() * 1000)
                }))
                await asyncio.sleep(0.01)
                
            print("Lookback window populated.")
            await asyncio.sleep(1)
            
            # 2. Trigger a Signal (Divergence)
            # Create a "Long Spread" signal: Spread < Lower Band
            # Normal spread is around 0.50 - 7.00 = -6.50
            print("Triggering LONG SPREAD signal (ADA crash)...")
            
            # Drop ADA price significantly
            await websocket.send(json.dumps({
                "topic": "ticker_ADA",
                "symbol": "ADA",
                "price": 0.10, 
                "bid": 0.09,
                "ask": 0.11,
                "timestamp": int(time.time() * 1000)
            }))
            
            # Keep DOT stable
            await websocket.send(json.dumps({
                "topic": "ticker_DOT",
                "symbol": "DOT",
                "price": 7.0,
                "bid": 6.9,
                "ask": 7.1,
                "timestamp": int(time.time() * 1000)
            }))
            
            print("Signal ticks sent. Waiting 5s for processing...")
            await asyncio.sleep(5)
            
            # 3. Mean Reversion (Close Position)
            print("Triggering Mean Reversion (ADA recovery)...")
            await websocket.send(json.dumps({
                "topic": "ticker_ADA",
                "symbol": "ADA",
                "price": 0.50,
                "bid": 0.49,
                "ask": 0.51,
                "timestamp": int(time.time() * 1000)
            }))
            await asyncio.sleep(2)

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(simulate_statarb())
