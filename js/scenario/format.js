// ==========================================
// 시나리오 스크립트 파서 & 검사기 — 게임·관리자 공용
// 문법 설명: docs/11_scenario.md
//
// parseAll([{name, text}]) → { scenes, events, texts, quests, errors, warnings }
// validate(scn, ctx)       → 참조(장면·맵·파티원·적·아이템·스프라이트·상점·음원) 검사
// evalCondition(cond, st)  → 조건식 평가
// ==========================================
(function (global) {
  "use strict";

  const ID_RE = /^[A-Za-z_][\w-]*$/;
  const REQUIRED_SCENES = ["intro", "party_wiped"];
  const OPTIONAL_TEXTS = ["title_desc", "ending_title", "ending_body"];
  const DIRS = ["down", "up", "left", "right"];

  // 관리자 페이지 도움말에도 쓰인다.
  const COMMAND_HELP = [
    ["flag N", "스토리 진행 플래그를 N으로 설정"],
    ["set 변수 N", "변수 값 설정 (상자 열림 등). 조건 var 변수 == N"],
    ["join ID / leave ID", "파티원 합류 / 이탈"],
    ["quest start ID / quest done ID", "퀘스트 시작 / 완료"],
    ["heal", "파티 전원 HP·MP 완전 회복"],
    ["sfx ID / bgm ID", "효과음 / 배경음 (리소스 메뉴의 ID)"],
    ["save", "자동 저장 (로그인 시 클라우드에도)"],
    ["weapon +N / armor +N", "파티 무기·방어구 N단계 무료 강화"],
    ["gold ±N / exp +N", "골드 증감 / 경험치 획득"],
    ["item ID ±N", "아이템 증감"],
    ["move X,Y [방향]", "같은 맵 안에서 이동"],
    ["warp 맵ID X,Y [방향]", "다른 맵으로 이동 — 장면 종료"],
    ["goto 장면id", "다른 장면으로 이동 (-> 장면id 와 같음)"],
    ["shop 상점ID", "상점 열기 — 장면 종료"],
    ["battle 적1,적2,... [boss] [win=장면id]", "전투 (최대 3마리) — 장면 종료"],
    ["ending", "엔딩 화면 — 장면 종료"]
  ];

  function pushMsg(list, file, line, message) { list.push({ file, line, message }); }
  function toInt(s) { return typeof s === "string" && /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : NaN; }
  function unescapeText(s) { return s.replace(/\\n/g, "\n"); }

  // ---------- 조건식 ----------
  // flag == 1 / lv >= 4 / var chest_a == 1 / joined ria / !joined ria / item potion >= 1 / quest main_a done / !quest side_herb active
  function parseCondition(src) {
    const clauses = [];
    for (const part of src.split(/\s+and\s+/)) {
      const p = part.trim();
      let m;
      if ((m = p.match(/^(!|not\s+)?joined\s+([A-Za-z_]\w*)$/))) clauses.push({ k: "joined", neg: !!m[1], id: m[2] });
      else if ((m = p.match(/^(!|not\s+)?quest\s+([A-Za-z_][\w-]*)\s+(active|done|none)$/))) clauses.push({ k: "quest", neg: !!m[1], id: m[2], state: m[3] });
      else if ((m = p.match(/^item\s+([A-Za-z_]\w*)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/))) clauses.push({ k: "item", name: m[1], op: m[2], value: +m[3] });
      else if ((m = p.match(/^var\s+([A-Za-z_][\w-]*)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/))) clauses.push({ k: "var", name: m[1], op: m[2], value: +m[3] });
      else if ((m = p.match(/^(flag|lv|gold|weapon|armor)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/))) clauses.push({ k: "cmp", v: m[1], op: m[2], value: +m[3] });
      else return { error: `알 수 없는 조건 "${p}" (예: flag == 1, lv >= 4, var 상자 == 1, joined ria, quest 퀘스트id done, item potion >= 1)` };
    }
    return { cond: { src, clauses } };
  }

  function compare(a, op, b) {
    switch (op) {
      case "==": return a === b;
      case "!=": return a !== b;
      case ">=": return a >= b;
      case "<=": return a <= b;
      case ">": return a > b;
      case "<": return a < b;
    }
    return false;
  }

  // st: { flag, lv, gold, weapon, armor, joined(id), item(id), quest(id) → "active"|"done"|"none", v(name) }
  function evalCondition(cond, st) {
    if (!cond) return true;
    return cond.clauses.every(c => {
      if (c.k === "joined") return st.joined(c.id) !== c.neg;
      if (c.k === "quest") return (st.quest(c.id) === c.state) !== c.neg;
      if (c.k === "item") return compare(st.item(c.name), c.op, c.value);
      if (c.k === "var") return compare(st.v(c.name), c.op, c.value);
      return compare(st[c.v], c.op, c.value);
    });
  }

  // ---------- 명령 ----------
  function parseCoord(s) {
    const m = (s || "").match(/^(\d+),(\d+)$/);
    return m ? { x: +m[1], y: +m[2] } : null;
  }

  function parseCommand(body, file, line, errors) {
    const parts = body.trim().split(/\s+/).filter(Boolean);
    const name = parts[0] || "";
    const a = parts.slice(1);
    const cmd = { t: "cmd", name, file, line };
    const bad = (msg) => { pushMsg(errors, file, line, `> ${name}: ${msg}`); return null; };

    switch (name) {
      case "flag": {
        const n = toInt(a[0]);
        if (a.length !== 1 || isNaN(n) || n < 0) return bad("0 이상의 숫자 하나가 필요합니다 (예: > flag 1)");
        cmd.value = n; return cmd;
      }
      case "set": {
        const n = toInt(a[1]);
        if (a.length !== 2 || !ID_RE.test(a[0]) || isNaN(n)) return bad("변수 이름과 숫자가 필요합니다 (예: > set chest_forest 1)");
        cmd.key = a[0]; cmd.value = n; return cmd;
      }
      case "join": case "leave":
        if (a.length !== 1) return bad("파티원 id 하나가 필요합니다 (예: > join ria)");
        cmd.id = a[0]; return cmd;
      case "quest":
        if (a.length !== 2 || !["start", "done"].includes(a[0])) return bad("형식: > quest start 퀘스트id / > quest done 퀘스트id");
        cmd.action = a[0]; cmd.id = a[1]; return cmd;
      case "heal":
        if (a.length > 1 || (a.length === 1 && a[0] !== "all")) return bad("인자 없이 쓰거나 all 만 쓸 수 있습니다");
        return cmd;
      case "sfx": case "bgm":
        if (a.length !== 1) return bad(`음원 id 하나가 필요합니다 (예: > ${name} ${name === "sfx" ? "levelup" : "town"})`);
        cmd.id = a[0]; return cmd;
      case "save": case "ending":
        if (a.length) return bad("인자가 필요 없습니다");
        return cmd;
      case "shop":
        if (a.length !== 1) return bad("상점 id 하나가 필요합니다 (예: > shop hazel_shop)");
        cmd.shop = a[0]; return cmd;
      case "battle": {
        if (!a.length) return bad("적 id가 필요합니다 (예: > battle wolf,wolf 또는 > battle orvel boss win=ending)");
        cmd.enemies = a[0].split(",").filter(Boolean); cmd.boss = false; cmd.win = null;
        if (cmd.enemies.length < 1 || cmd.enemies.length > 3) return bad("적은 1~3마리까지 지정할 수 있습니다");
        for (const opt of a.slice(1)) {
          if (opt === "boss") cmd.boss = true;
          else if (opt.startsWith("win=") && opt.length > 4) cmd.win = opt.slice(4);
          else return bad(`알 수 없는 옵션 "${opt}" (boss, win=장면id)`);
        }
        return cmd;
      }
      case "weapon": case "armor": {
        const n = toInt(a[0]);
        if (a.length !== 1 || isNaN(n) || n < 1) return bad("1 이상의 숫자가 필요합니다 (예: > weapon +1)");
        cmd.amount = n; return cmd;
      }
      case "gold": case "exp": {
        const n = toInt(a[0]);
        if (a.length !== 1 || isNaN(n)) return bad("숫자 하나가 필요합니다 (예: > gold +100)");
        if (name === "exp" && n < 0) return bad("경험치는 늘리기만 할 수 있습니다");
        cmd.amount = n; return cmd;
      }
      case "item": {
        const n = toInt(a[1]);
        if (a.length !== 2 || isNaN(n)) return bad("아이템 id와 숫자가 필요합니다 (예: > item potion +2)");
        cmd.item = a[0]; cmd.amount = n; return cmd;
      }
      case "move": {
        const c = parseCoord(a[0]);
        if (!c || a.length > 2 || (a[1] && !DIRS.includes(a[1]))) return bad("좌표 x,y [방향] (예: > move 2,6 down)");
        Object.assign(cmd, c, { dir: a[1] || null }); return cmd;
      }
      case "warp": {
        const c = parseCoord(a[1]);
        if (a.length < 2 || !c || (a[2] && !DIRS.includes(a[2]))) return bad("맵id x,y [방향] (예: > warp hazel 13,19 up)");
        Object.assign(cmd, c, { map: a[0], dir: a[2] || "down" }); return cmd;
      }
      case "goto":
        if (a.length !== 1) return bad("장면 id 하나가 필요합니다");
        return { t: "jump", cond: null, target: a[0], file, line };
      default:
        return bad(name ? "알 수 없는 명령입니다" : "명령 이름이 없습니다");
    }
  }

  // ---------- 블록 헤더 ----------
  function startBlock(header, file, line, out) {
    const m = header.match(/^@(\w+)\s*(.*)$/);
    const kind = m ? m[1] : "";
    const rest = m ? m[2].trim() : "";

    if (kind === "scene") {
      if (!ID_RE.test(rest)) { pushMsg(out.errors, file, line, "@scene 다음에 장면 id가 필요합니다 (영문·숫자·_·-)"); return { kind: "bad" }; }
      if (out.scenes[rest]) pushMsg(out.errors, file, line, `장면 id 중복: ${rest} (먼저 정의: ${out.scenes[rest].file}:${out.scenes[rest].line})`);
      const scene = { id: rest, file, line, steps: [] };
      out.scenes[rest] = scene;
      return { kind: "scene", steps: scene.steps };
    }
    if (kind === "event") {
      const em = rest.match(/^([A-Za-z_][\w-]*)\s+([A-Za-z_][\w-]*):(\d+),(\d+)\s*(.*)$/);
      if (!em) { pushMsg(out.errors, file, line, "형식: @event 이벤트id 맵id:x,y 이름"); return { kind: "bad" }; }
      const dup = out.events.find(e => e.id === em[1]);
      if (dup) pushMsg(out.errors, file, line, `이벤트 id 중복: ${em[1]} (먼저 정의: ${dup.file}:${dup.line})`);
      const ev = { id: em[1], map: em[2], x: +em[3], y: +em[4], name: em[5] || em[1], file, line, steps: [],
                   sprite: null, tile: null, trigger: null, face: "down", when: null };
      out.events.push(ev);
      return { kind: "event", steps: ev.steps, event: ev };
    }
    if (kind === "text") {
      if (!ID_RE.test(rest)) { pushMsg(out.errors, file, line, "@text 다음에 문구 키가 필요합니다"); return { kind: "bad" }; }
      if (rest in out.texts) pushMsg(out.errors, file, line, `@text 중복: ${rest}`);
      return { kind: "text", key: rest, lines: [] };
    }
    if (kind === "quest") {
      const qm = rest.match(/^([A-Za-z_][\w-]*)\s+(main|side)\s+(.+)$/);
      if (!qm) { pushMsg(out.errors, file, line, "형식: @quest 퀘스트id main|side 제목"); return { kind: "bad" }; }
      if (out.quests[qm[1]]) pushMsg(out.errors, file, line, `@quest 중복: ${qm[1]}`);
      const q = { id: qm[1], type: qm[2], title: qm[3].trim(), desc: "", file, line, order: Object.keys(out.quests).length };
      out.quests[q.id] = q;
      return { kind: "quest", quest: q, lines: [] };
    }
    pushMsg(out.errors, file, line, `알 수 없는 블록 "@${kind}" (@scene, @event, @text, @quest)`);
    return { kind: "bad" };
  }

  function finishBlock(block, out) {
    if (!block || (block.kind !== "text" && block.kind !== "quest")) return;
    const lines = block.lines.slice();
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const value = lines.join("\n");
    if (block.kind === "text") out.texts[block.key] = value;
    else block.quest.desc = value;
  }

  // ---------- 이벤트 속성 (* 줄) ----------
  function parseProperty(trimmed, ev, file, ln, out) {
    let m;
    const withCond = (src) => {
      if (!src) return { cond: null };
      return parseCondition(src);
    };
    if ((m = trimmed.match(/^\*\s*sprite\s+(\S+)(?:\s+when\s+(.+))?$/))) {
      const pc = withCond(m[2]);
      if (pc.error) return pushMsg(out.errors, file, ln, pc.error);
      ev.sprite = { key: m[1], cond: pc.cond, file, line: ln };
      return;
    }
    if ((m = trimmed.match(/^\*\s*tile\s+(\S+)(?:\s+when\s+(.+))?$/))) {
      const pc = withCond(m[2]);
      if (pc.error) return pushMsg(out.errors, file, ln, pc.error);
      ev.tile = { key: m[1], cond: pc.cond, file, line: ln };
      return;
    }
    if ((m = trimmed.match(/^\*\s*trigger\s+(talk|touch|enter)$/))) { ev.trigger = m[1]; return; }
    if ((m = trimmed.match(/^\*\s*when\s+(.+)$/))) {
      const pc = withCond(m[1]);
      if (pc.error) return pushMsg(out.errors, file, ln, pc.error);
      ev.when = pc.cond; ev.whenLine = ln;
      return;
    }
    if ((m = trimmed.match(/^\*\s*face\s+(down|up|left|right)$/))) { ev.face = m[1]; return; }
    pushMsg(out.errors, file, ln, "형식: * sprite 키 [when 조건] / * tile 타일id [when 조건] / * trigger talk|touch|enter / * when 조건 / * face 방향");
  }

  // ---------- 파일 파싱 ----------
  function parseFile(name, text, out) {
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    let block = null;

    for (let i = 0; i < lines.length; i++) {
      const ln = i + 1;
      const raw = lines[i];
      const trimmed = raw.trim();

      if (trimmed.startsWith("#")) continue; // 주석
      if (trimmed.startsWith("@")) { finishBlock(block, out); block = startBlock(trimmed, name, ln, out); continue; }
      if (!block) {
        if (trimmed) pushMsg(out.errors, name, ln, "블록(@scene, @event, @text, @quest) 밖에 내용이 있습니다");
        continue;
      }
      if (block.kind === "text" || block.kind === "quest") { block.lines.push(raw.replace(/\s+$/, "")); continue; }
      if (block.kind === "bad" || !trimmed) continue;

      const isSpecial = /^(>|\?|->|\*)/.test(trimmed);
      const last = block.steps[block.steps.length - 1];
      if (/^[ \t]/.test(raw) && !isSpecial) {
        if (last && last.t === "say") { last.text += "\n" + unescapeText(trimmed); continue; }
        pushMsg(out.errors, name, ln, "들여쓴 줄(이어지는 대사)은 대사 줄 바로 다음에만 쓸 수 있습니다");
        continue;
      }

      if (trimmed.startsWith("->")) {
        const target = trimmed.slice(2).trim();
        if (!ID_RE.test(target)) { pushMsg(out.errors, name, ln, "형식: -> 장면id"); continue; }
        block.steps.push({ t: "jump", cond: null, target, file: name, line: ln });
        continue;
      }
      if (trimmed.startsWith(">")) {
        const c = parseCommand(trimmed.slice(1), name, ln, out.errors);
        if (c) block.steps.push(c);
        continue;
      }
      if (trimmed.startsWith("?")) {
        const m = trimmed.match(/^\?\s*(.+?)\s*->\s*(\S+)$/);
        if (!m) { pushMsg(out.errors, name, ln, "형식: ? 조건 -> 장면id"); continue; }
        const pc = parseCondition(m[1]);
        if (pc.error) { pushMsg(out.errors, name, ln, pc.error); continue; }
        block.steps.push({ t: "jump", cond: pc.cond, target: m[2], file: name, line: ln });
        continue;
      }
      if (trimmed.startsWith("*")) {
        if (block.kind !== "event") { pushMsg(out.errors, name, ln, "* 속성은 @event 블록에서만 쓸 수 있습니다"); continue; }
        parseProperty(trimmed, block.event, name, ln, out);
        continue;
      }
      const idx = trimmed.indexOf(": ");
      if (idx > 0) {
        block.steps.push({ t: "say", speaker: trimmed.slice(0, idx).trim(), text: unescapeText(trimmed.slice(idx + 2).trim()), file: name, line: ln });
        continue;
      }
      pushMsg(out.errors, name, ln, '알 수 없는 줄입니다. 대사는 "화자: 내용", 명령은 "> 명령" 형식으로 씁니다');
    }
    finishBlock(block, out);
  }

  function parseAll(files) {
    const out = { scenes: {}, events: [], texts: {}, quests: {}, errors: [], warnings: [] };
    files.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(f => parseFile(f.name, f.text, out));
    // 트리거 기본값: 스프라이트가 있으면 말 걸기, 없으면 밟기
    out.events.forEach(ev => { if (!ev.trigger) ev.trigger = ev.sprite ? "talk" : "touch"; });
    return out;
  }

  // ---------- 참조 검사 ----------
  // ctx: { partyIds, enemyIds, spriteKeys, itemIds, tileIds, shopIds, bgmIds, sfxIds,
  //        maps: { id: { w, h, isBlocked(x,y) } } }
  function validate(scn, ctx) {
    const E = scn.errors, W = scn.warnings;
    const called = new Set();
    const has = (list, id) => list.includes(id);

    const checkCond = (cond, file, line) => {
      if (!cond) return;
      cond.clauses.forEach(c => {
        if (c.k === "joined" && !has(ctx.partyIds, c.id)) pushMsg(E, file, line, `없는 파티원 id: ${c.id} (${ctx.partyIds.join(", ")})`);
        if (c.k === "item" && !has(ctx.itemIds, c.name)) pushMsg(E, file, line, `없는 아이템 id: ${c.name}`);
        if (c.k === "quest" && !scn.quests[c.id]) pushMsg(E, file, line, `없는 퀘스트 id: ${c.id}`);
      });
    };

    const checkSteps = (steps) => steps.forEach(s => {
      if (s.t === "jump") {
        called.add(s.target);
        if (!scn.scenes[s.target]) pushMsg(E, s.file, s.line, `없는 장면으로 이동: ${s.target}`);
        checkCond(s.cond, s.file, s.line);
      }
      if (s.t !== "cmd") return;
      switch (s.name) {
        case "join": case "leave":
          if (!has(ctx.partyIds, s.id)) pushMsg(E, s.file, s.line, `없는 파티원 id: ${s.id} (${ctx.partyIds.join(", ")})`);
          if (s.name === "leave" && s.id === ctx.partyIds[0]) pushMsg(E, s.file, s.line, "주인공은 파티에서 뺄 수 없습니다");
          break;
        case "quest":
          if (!scn.quests[s.id]) pushMsg(E, s.file, s.line, `없는 퀘스트 id: ${s.id} (@quest 로 정의하세요)`);
          break;
        case "battle":
          s.enemies.forEach(e => { if (!has(ctx.enemyIds, e)) pushMsg(E, s.file, s.line, `없는 적 id: ${e}`); });
          if (s.win) { called.add(s.win); if (!scn.scenes[s.win]) pushMsg(E, s.file, s.line, `win= 장면이 없습니다: ${s.win}`); }
          break;
        case "item":
          if (!has(ctx.itemIds, s.item)) pushMsg(E, s.file, s.line, `없는 아이템 id: ${s.item}`);
          break;
        case "shop":
          if (!has(ctx.shopIds, s.shop)) pushMsg(E, s.file, s.line, `없는 상점 id: ${s.shop} (${ctx.shopIds.join(", ")})`);
          break;
        case "sfx":
          if (!has(ctx.sfxIds, s.id)) pushMsg(E, s.file, s.line, `없는 효과음 id: ${s.id}`);
          break;
        case "bgm":
          if (!has(ctx.bgmIds, s.id)) pushMsg(E, s.file, s.line, `없는 배경음 id: ${s.id}`);
          break;
        case "warp": {
          const mp = ctx.maps[s.map];
          if (!mp) pushMsg(E, s.file, s.line, `없는 맵 id: ${s.map}`);
          else if (mp.isBlocked(s.x, s.y)) pushMsg(E, s.file, s.line, `${s.map} 의 ${s.x},${s.y} 는 지나갈 수 없는 칸입니다`);
          break;
        }
      }
    });

    Object.values(scn.scenes).forEach(sc => checkSteps(sc.steps));

    const coords = {};
    scn.events.forEach(ev => {
      checkSteps(ev.steps);
      const mp = ctx.maps[ev.map];
      if (!mp) pushMsg(E, ev.file, ev.line, `없는 맵 id: ${ev.map} (${Object.keys(ctx.maps).join(", ")})`);
      else if (ev.x >= mp.w || ev.y >= mp.h) pushMsg(E, ev.file, ev.line, `맵 밖 좌표: ${ev.x},${ev.y} (${ev.map} 크기 ${mp.w}x${mp.h})`);
      else if (ev.trigger === "touch" && mp.isBlocked(ev.x, ev.y)) pushMsg(W, ev.file, ev.line, `밟기(touch) 이벤트가 지나갈 수 없는 칸에 있습니다. * trigger talk 를 쓰세요: ${ev.map}:${ev.x},${ev.y}`);
      if (ev.trigger === "enter" && (ev.sprite || ev.tile)) pushMsg(W, ev.file, ev.line, `맵 진입(enter) 이벤트의 * sprite / * tile 은 쓰이지 않습니다: ${ev.id}`);
      if (ev.when) checkCond(ev.when, ev.file, ev.whenLine || ev.line);
      const key = `${ev.map}:${ev.x},${ev.y}`;
      if (coords[key]) pushMsg(E, ev.file, ev.line, `같은 좌표(${key})에 이벤트가 이미 있습니다: ${coords[key].id}`);
      else coords[key] = ev;
      if (ev.sprite) {
        if (!has(ctx.spriteKeys, ev.sprite.key)) pushMsg(E, ev.sprite.file, ev.sprite.line, `없는 캐릭터 스프라이트: ${ev.sprite.key}`);
        checkCond(ev.sprite.cond, ev.sprite.file, ev.sprite.line);
      }
      if (ev.tile) {
        if (!has(ctx.tileIds, ev.tile.key)) pushMsg(E, ev.tile.file, ev.tile.line, `없는 타일 id: ${ev.tile.key}`);
        checkCond(ev.tile.cond, ev.tile.file, ev.tile.line);
      }
      if (!ev.steps.length) pushMsg(W, ev.file, ev.line, `이벤트 ${ev.id} 에 실행할 내용이 없습니다`);
    });

    REQUIRED_SCENES.forEach(id => { if (!scn.scenes[id]) pushMsg(E, "(전체)", 0, `필수 장면 "@scene ${id}" 가 없습니다`); });
    OPTIONAL_TEXTS.forEach(k => { if (!(k in scn.texts)) pushMsg(W, "(전체)", 0, `"@text ${k}" 가 없어 기본 문구를 씁니다`); });
    (ctx.warpFailScenes || []).forEach(id => called.add(id));
    (ctx.warpFailScenes || []).forEach(id => { if (!scn.scenes[id]) pushMsg(E, "(맵 데이터)", 0, `맵 출구의 fail 장면이 시나리오에 없습니다: ${id}`); });
    Object.values(scn.scenes).forEach(sc => {
      if (!called.has(sc.id) && !REQUIRED_SCENES.includes(sc.id)) pushMsg(W, sc.file, sc.line, `어디에서도 호출되지 않는 장면: ${sc.id}`);
    });
    return scn;
  }

  global.ScenarioFormat = { parseAll, validate, evalCondition, parseCondition, COMMAND_HELP };
})(window);
