// 시나리오 검사에 필요한 게임 데이터 목록 (게임·관리자 공용)
function buildScenarioContext() {
  return {
    partyIds: PARTY_DEFAULTS.map(m => m.id),
    enemyIds: Object.keys(ENEMIES),
    spriteKeys: Object.keys(SPRITES),
    itemIds: Object.keys(ITEMS),
    mapW: MAP_W,
    mapH: MAP_H,
    isBlocked: isBlockedTile
  };
}
