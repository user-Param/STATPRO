#ifndef PYTHON_ALGO_H
#define PYTHON_ALGO_H

#include "../algo.h"
#include <pybind11/embed.h>
#include <pybind11/pybind11.h>
#include <iostream>

namespace py = pybind11;

class PythonAlgo : public Algo {
public:
    PythonAlgo(py::object py_instance) : py_instance_(py_instance) {}

    void onTick(const MarketData& data) override {
        py::gil_scoped_acquire acquire;
        try {
            if (!py_instance_) return;

            py::object result;
            bool called = false;

            if (py::hasattr(py_instance_, "on_tick")) {
                auto func = py_instance_.attr("on_tick");
                try {
                    // Try calling with full data first
                    result = func(data.symbol, data.price, data.bid, data.ask, data.timestamp);
                    called = true;
                } catch (...) {
                    // Fallback to price only
                    try {
                        result = func(data.price);
                        called = true;
                    } catch (...) {
                        // Both failed
                    }
                }
            } else if (py::hasattr(py_instance_, "onTick")) {
                auto func = py_instance_.attr("onTick");
                try {
                    result = func(data.symbol, data.price, data.bid, data.ask, data.timestamp);
                    called = true;
                } catch (...) {
                    try {
                        result = func(data.price);
                        called = true;
                    } catch (...) {}
                }
            }

            if (called && !result.is_none()) {
                try {
                    std::string signal = result.cast<std::string>();
                    if (signal == "BUY") {
                        std::cout << "[PythonAlgo] Generated BUY signal for " << data.symbol << std::endl;
                        buy(data.symbol, data.price, 1);
                    } else if (signal == "SELL") {
                        std::cout << "[PythonAlgo] Generated SELL signal for " << data.symbol << std::endl;
                        sell(data.symbol, data.price, 1);
                    }
                } catch (...) {
                    // Result was not a string signal, might be a direct call strategy
                }
            }
        } catch (py::error_already_set &e) {
            std::cerr << "[PythonAlgo] Execution Error: " << e.what() << std::endl;
        } catch (const std::exception &e) {
            std::cerr << "[PythonAlgo] System Error: " << e.what() << std::endl;
        } catch (...) {
            std::cerr << "[PythonAlgo] Unknown Error" << std::endl;
        }
    }

private:
    py::object py_instance_;
};

#endif
