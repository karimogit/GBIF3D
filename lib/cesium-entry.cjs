/**
 * Shim so require('cesium') resolves to the minified build.
 * The npm package cesium/index.cjs uses path.join(__dirname, "Build/...") which
 * breaks when bundled (__dirname becomes wrong at runtime).
 */
"use strict";
module.exports = require("../node_modules/cesium/Build/Cesium/index.cjs");
