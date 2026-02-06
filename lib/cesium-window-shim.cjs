/**
 * Shim for require('cesium'): returns window.Cesium when loaded via script tag.
 * Ensures Cesium is loaded from /cesium/Cesium.js (Build) before the app runs.
 */
"use strict";
module.exports =
  typeof window !== "undefined" && window.Cesium ? window.Cesium : {};
