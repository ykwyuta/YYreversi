/*
 * ひっくりかえるのがみえるリバーシ — CPU の思考を別スレッドで動かす（画面が固まらないように）
 */
/* global importScripts, AI */
importScripts('rules.js', 'ai.js');
self.onmessage = e => {
  const { id, st, level } = e.data;
  st.board = Int8Array.from(st.board);
  self.postMessage({ id, result: AI.think(st, level) });
};
