// ==========================================
// 시나리오 암호화 (AES-256-GCM, WebCrypto) — 게임·관리자 공용
// 암호화 파일 형식: { v, alg, keyId, file, iv, data }
//  - keyId: Firebase scriptKeys/{keyId} 문서에 보관된 키를 가리킨다.
//  - file : 원본 파일 이름. AES-GCM 추가 인증 데이터로 묶어, 다른 파일 이름으로 바꿔치기하면 복호화가 실패한다.
// ==========================================
(function (global) {
  "use strict";
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function toB64(bytes) {
    let s = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(s);
  }
  function fromB64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function toHex(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); }

  function subtle() {
    if (!global.crypto || !global.crypto.subtle) {
      throw new Error("이 환경에서는 암호화 기능(WebCrypto)을 쓸 수 없습니다. https 또는 localhost 에서 실행하세요.");
    }
    return global.crypto.subtle;
  }

  function importKey(keyB64) {
    return subtle().importKey("raw", fromB64(keyB64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  // 새 256비트 키. keyId 는 생성 시각 + 난수 (Firestore 문서 id로 사용)
  function newKey() {
    const raw = global.crypto.getRandomValues(new Uint8Array(32));
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const keyId = `k${stamp}-${toHex(global.crypto.getRandomValues(new Uint8Array(4)))}`;
    return { keyId, key: toB64(raw) };
  }

  async function encryptText(text, keyB64, keyId, fileName) {
    const iv = global.crypto.getRandomValues(new Uint8Array(12));
    const key = await importKey(keyB64);
    const ct = new Uint8Array(await subtle().encrypt(
      { name: "AES-GCM", iv, additionalData: enc.encode(fileName) }, key, enc.encode(text)));
    return { v: 1, alg: "AES-256-GCM", keyId, file: fileName, iv: toB64(iv), data: toB64(ct) };
  }

  async function decryptText(obj, keyB64) {
    if (!obj || obj.v !== 1 || !obj.iv || !obj.data) throw new Error("지원하지 않는 암호화 파일 형식입니다.");
    const key = await importKey(keyB64);
    try {
      const pt = await subtle().decrypt(
        { name: "AES-GCM", iv: fromB64(obj.iv), additionalData: enc.encode(obj.file) }, key, fromB64(obj.data));
      return dec.decode(pt);
    } catch (e) {
      throw new Error(`${obj.file} 복호화 실패 (키가 맞지 않거나 파일이 손상됨)`);
    }
  }

  global.ScenarioCrypto = { newKey, encryptText, decryptText };
})(window);
