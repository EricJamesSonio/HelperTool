'use strict';

const { webFrame } = require('electron');

try {
  if (/(^|\.)google\.com$/i.test(String(location.hostname || ''))) {
    webFrame.executeJavaScript(
      "try{Object.defineProperty(Navigator.prototype,'userAgentData',{get:function(){return undefined;},configurable:true});}catch(e){}"
    );
  }
} catch (_) {}