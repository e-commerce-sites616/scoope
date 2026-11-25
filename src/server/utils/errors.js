'use strict';
const httpError = (status, code, details) => Object.assign(new Error(code), { status, code, details });
module.exports = { httpError };
