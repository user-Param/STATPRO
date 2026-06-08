# Simple Moving Average Crossover Strategy
import time

class SMACrossover:
    def __init__(self, short_period=5, long_period=20):
        self.short_period = short_period
        self.long_period = long_period
        self.prices = []
        print(f"SMA Crossover Initialized (Short: {short_period}, Long: {long_period})")

    def on_tick(self, price):
        self.prices.append(price)
        if len(self.prices) > self.long_period:
            self.prices.pop(0)
            
        if len(self.prices) < self.long_period:
            return "WAITING"
            
        short_sma = sum(self.prices[-self.short_period:]) / self.short_period
        long_sma = sum(self.prices[-self.long_period:]) / self.long_period
        
        if short_sma > long_sma:
            return "BUY"
        elif short_sma < long_sma:
            return "SELL"
        return "HOLD"