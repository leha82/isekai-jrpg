// ==========================================
// 도트 스프라이트 데이터 (폭 16 문자열 배열, 문자 → PALETTE 색)
// 시나리오 스크립트의 "* sprite <키>" 에서 이 키 이름을 쓴다.
// ==========================================
const PALETTE = {
  '.': null, 'K': '#111111', 'W': '#ffffff', 'S': '#ffccaa',
  'H': '#3b2f2f', 'B': '#2563eb', 'R': '#dc2626', 'G': '#16a34a',
  'L': '#86efac', 'Y': '#facc15', 'P': '#9333ea', 'C': '#64748b',
  'T': '#78350f', 'A': '#38bdf8'
};

const SPRITES = {
  hero: [
    "....HHHHHH......","...HHHHHHHH.....","...HSSSSSSH.....","...SKSSSSKS.....",
    "....SSSSSS......","...RBBBBBBBR....","..RRBBBBBBBRR...","..R.BBBBBB.CR...",
    "....BBBBBB.C....","....BBBBBB.C....","....KK..KK......","...KKK..KKK....."
  ],
  elf: [
    "....YYYYYY......","...YYYYYYYY.....","..YYSSSSSSYY....","..Y.SKSSKS.Y....",
    "....SSSSSS......","....GGGGGG......","...GGGGGGGG.....","...G.GGGG.G.....",
    ".....GGGG.......",".....GGGG.......",".....KK.KK......","....KK...KK....."
  ],
  knightAlly: [
    "....CCCCCC......","...CCCCCCCC.....","...CSKSSKSC.....","....SSSSSS......",
    "...BCCCCCCCCB...","..BBCCCCCCCCBB..","..B.CCCCCCCC.W..","....CCCCCCCC.W..",
    "....CC....CC....","...KKK....KKK..."
  ],
  slime: [
    "................","................","......GGGG......","....GGGGGGGG....",
    "...GLLGGGGGGG...","..GLLGGGGGGGGG..",".GGGGKGGGGKGGGG.",".GGGGKGGGGKGGGG.",
    ".GGGGGGGGGGGGGG.","..GGGGGGGGGGGG..","...KKKKKKKKKK...","................"
  ],
  goblin: [
    "....GGGGGG......","..GGGGGGGGGG....","...GRGGRGGG.....","....GGGGGG......",
    "....TTTTTT......","...TTTTTTTT.....","..C.TTTTTT.T....","..C.TTTTTT......",
    "....TT..TT......","...KK....KK....."
  ],
  knight: [
    ".....CCCCC......","....CCCCCCC.....","....CKCCCKC.....","....CCCCCCC.....",
    "...CCCCCCCCC....","..CCCCCCCCCCC...","..Y.CCCCCCC.Y...","....CCCCCCC.....",
    "....CC...CC.....","...KK.....KK...."
  ],
  demonLord: [
    "..Y..PPPP..Y....",".YY.PPPPPP.YY...","..Y.PRPPPR.Y....","....PPPPPP......",
    "..RRRRRRRRRR....",".RRRRPPPPPPPP...",".R.PPPPPPPPPP.R.","R..PPPPPPPPPP..R",
    "...PPPPPPPPPP...", "....PP....PP....","...KKK....KKK..."
  ]
};
