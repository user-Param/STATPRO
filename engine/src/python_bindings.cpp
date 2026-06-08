#include <pybind11/pybind11.h>
#include <pybind11/embed.h>
#include <iostream>
#include "../include/algo.h"
#include "../include/marketData.h"

namespace py = pybind11;

class PyAlgo : public Algo {
public:
    void onTick(const MarketData& data) override {
        PYBIND11_OVERRIDE_PURE(void, Algo, onTick, data);
    }
};

PYBIND11_EMBEDDED_MODULE(statpro, m) {
    py::class_<MarketData>(m, "MarketData")
        .def(py::init<>())
        .def_readwrite("symbol", &MarketData::symbol)
        .def_readwrite("price", &MarketData::price)
        .def_readwrite("bid", &MarketData::bid)
        .def_readwrite("ask", &MarketData::ask)
        .def_readwrite("timestamp", &MarketData::timestamp);

    py::class_<Algo, PyAlgo>(m, "Algo")
        .def(py::init<>())
        .def("buy", &Algo::buy, py::arg("symbol"), py::arg("price"), py::arg("quantity"))
        .def("sell", &Algo::sell, py::arg("symbol"), py::arg("price"), py::arg("quantity"))
        .def("log", [](Algo& self, const std::string& msg) {
            std::cout << "[Strategy Log] " << msg << std::endl;
        });
}
