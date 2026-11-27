// 시나리오 검사에 필요한 게임 데이터 목록 (게임·관리자 공용). GameData 가 로드된 뒤 호출한다.
function buildScenarioContext(data = GameData) {
  const tiles = data.tiles.tiles;
  const maps = {};
  Object.values(data.maps).forEach(m => {
    maps[m.id] = {
      w: m.w, h: m.h,
      isBlocked: (x, y) => {
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
        const g = tiles[m.ground[y][x]], o = m.objects[y][x] ? tiles[m.objects[y][x]] : null;
        return !(g && g.walk) || (o && !o.walk);
      }
    };
  });
  const warpFailScenes = [];
  Object.values(data.maps).forEach(m => (m.warps || []).forEach(w => { if (w.fail && !warpFailScenes.includes(w.fail)) warpFailScenes.push(w.fail); }));
  return {
    partyIds: data.characters.party.map(c => c.id),
    enemyIds: Object.keys(data.monsters),
    spriteKeys: Object.keys(data.sprites.characters.list),
    itemIds: Object.keys(data.items.items),
    shopIds: Object.keys(data.items.shops),
    tileIds: tiles.map(t => t.id),
    bgmIds: Object.keys(data.audio.bgm),
    sfxIds: Object.keys(data.audio.sfx),
    maps,
    warpFailScenes
  };
}
