'use strict';

let _seq = 0;

function nextSeq() {
  return ++_seq;
}

function peekSeq() {
  return _seq;
}

module.exports = { nextSeq, peekSeq };
